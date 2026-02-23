
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FinancialMetrics {
    inventoryValue: number;
    salesRevenue: number;
    cogs: number;
    overhead: number;
    inventoryPurchases: number;
    netProfit: number;
    operatingProfit: number;
    // Commission metrics
    commissionsPaid: number;    // Cash payouts (already in expenses)
    commissionsOwed: number;    // Pending — not yet paid
    commissionsApplied: number; // Applied to partner balance
    commissionsTotal: number;   // Sum of all commissions ever
    // Commission-in-product metrics
    commissionsInProduct: number;    // Total billed amount of partner product orders
    commissionProductCost: number;   // Actual COGS of partner product orders
    commissionProductMarkup: number; // commissionsInProduct - commissionProductCost (the "savings")
    // Per-order aggregates
    merchantFees: number;       // Total merchant fees across all orders
    orderBasedProfit: number;   // SUM of per-order profit_amount
    orderBasedCogs: number;     // SUM of per-order cogs_amount
    // Diagnostic: track which queries succeeded
    _errors: string[];
}

/** Safely unwrap a PromiseSettledResult, returning the value or a fallback */
function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
    return result.status === 'fulfilled' ? result.value : fallback;
}

export function useFinancialMetrics() {
    const { profile } = useAuth();
    const orgId = profile?.org_id;
    return useQuery({
        queryKey: ['financial-metrics', orgId],
        queryFn: async (): Promise<FinancialMetrics> => {
            const errors: string[] = [];

            // === Phase 1: Fire all independent queries in parallel (fault-isolated) ===
            const results = await Promise.allSettled([
                supabase.rpc('get_inventory_valuation'),
                supabase.from('movements').select('id, amount_paid').eq('org_id', orgId!).eq('type', 'sale'),
                supabase.from('movements').select('id').eq('org_id', orgId!).in('type', ['internal_use', 'giveaway', 'loss']),
                supabase.from('expenses').select('amount, category').eq('org_id', orgId!),
                supabase.from('commissions').select('amount, status, sales_order_id').eq('org_id', orgId!),
                supabase.from('sales_orders').select('merchant_fee, profit_amount, cogs_amount').eq('org_id', orgId!).neq('status', 'cancelled'),
                supabase.from('sales_orders').select('total_amount, cogs_amount').eq('org_id', orgId!).eq('payment_status', 'commission_offset').neq('status', 'cancelled'),
            ]);

            // Safely extract each result
            const valuationResult = settled(results[0], { data: null, error: { message: 'valuation query rejected' } });
            const salesResult = settled(results[1], { data: [], error: null });
            const overheadResult = settled(results[2], { data: [], error: null });
            const expensesResult = settled(results[3], { data: [], error: null });
            const commissionsResult = settled(results[4], { data: [], error: null });
            const orderAggResult = settled(results[5], { data: [], error: null });
            const commOffsetResult = settled(results[6], { data: [], error: null });

            // Log but don't throw on individual failures
            if (valuationResult.error) {
                console.warn("Valuation RPC failed:", valuationResult.error);
                errors.push('inventory_valuation');
            }
            if (salesResult.error) {
                console.warn("Sales query failed:", salesResult.error);
                errors.push('sales');
            }
            if (overheadResult.error) {
                console.warn("Overhead query failed:", overheadResult.error);
                errors.push('overhead');
            }
            if (expensesResult.error) {
                console.warn("Expenses query failed:", expensesResult.error);
                errors.push('expenses');
            }
            if (commissionsResult.error) {
                console.warn('Commission query failed:', commissionsResult.error);
                errors.push('commissions');
            }
            if (orderAggResult.error) {
                console.warn("Order aggregates failed:", orderAggResult.error);
                errors.push('order_aggregates');
            }
            if (commOffsetResult.error) {
                console.warn("Commission offset query failed:", commOffsetResult.error);
                errors.push('commission_offset');
            }

            // --- Inventory Value ---
            const inventoryValue = valuationResult.data?.[0]?.total_value || 0;

            // --- Sales Revenue ---
            const sales = salesResult.data || [];
            const salesRevenue = Math.round(sales.reduce((sum: number, s: any) => sum + (s.amount_paid || 0), 0) * 100) / 100;

            // === Phase 2: Two independent chains in parallel (COGS + Overhead) ===
            // Helper to calculate cost from movement IDs → items → bottles → lots
            async function calcMovementCost(movementIds: string[]): Promise<number> {
                if (movementIds.length === 0) return 0;

                const { data: items, error: itemsError } = await supabase
                    .from('movement_items')
                    .select('bottle_id')
                    .in('movement_id', movementIds);

                if (itemsError) {
                    console.warn("Movement items query failed:", itemsError);
                    return 0;
                }

                const bottleIds = items?.map((i: any) => i.bottle_id) || [];
                if (bottleIds.length === 0) return 0;

                // Fetch bottles and their lots in parallel
                const { data: bottles, error: bottlesError } = await supabase
                    .from('bottles')
                    .select('id, lot_id')
                    .in('id', bottleIds);
                if (bottlesError) {
                    console.warn("Bottles query failed:", bottlesError);
                    return 0;
                }

                const lotIds = [...new Set(bottles?.map((b: any) => b.lot_id).filter(Boolean) || [])];
                if (lotIds.length === 0) return 0;

                const { data: lots, error: lotsError } = await supabase
                    .from('lots')
                    .select('id, cost_per_unit')
                    .in('id', lotIds);
                if (lotsError) {
                    console.warn("Lots query failed:", lotsError);
                    return 0;
                }

                const lotCostMap = new Map(lots?.map((l: any) => [l.id, l.cost_per_unit]) || []);
                const bottleLotMap = new Map(bottles?.map((b: any) => [b.id, b.lot_id]) || []);

                return Math.round((items?.reduce((sum: number, item: any) => {
                    const lotId = bottleLotMap.get(item.bottle_id);
                    if (!lotId) return sum;
                    return sum + (lotCostMap.get(lotId) || 0);
                }, 0) || 0) * 100) / 100;
            }

            const saleIds = sales.map((s: any) => s.id);
            const overheadIds = (overheadResult.data || []).map((m: any) => m.id);

            // Run both cost chains in parallel (fault-isolated)
            const [cogsResult, internalOverheadResult] = await Promise.allSettled([
                calcMovementCost(saleIds),
                calcMovementCost(overheadIds),
            ]);

            const cogs = settled(cogsResult, 0);
            const internalOverhead = settled(internalOverheadResult, 0);

            if (cogsResult.status === 'rejected') errors.push('cogs');
            if (internalOverheadResult.status === 'rejected') errors.push('internal_overhead');

            // --- Cash Expenses ---
            let inventoryExpenses = 0;
            let operatingExpenses = 0;

            expensesResult.data?.forEach((e: any) => {
                const amt = Number(e.amount);
                if (e.category === 'inventory') {
                    inventoryExpenses += amt;
                } else {
                    operatingExpenses += amt;
                }
            });

            // --- Commissions ---
            let commissionsPaid = 0;
            let commissionsOwed = 0;
            let commissionsApplied = 0;

            commissionsResult.data?.forEach((c: any) => {
                const amt = Number(c.amount) || 0;
                switch (c.status) {
                    case 'paid': commissionsPaid += amt; break;
                    case 'pending': commissionsOwed += amt; break;
                    case 'available': commissionsApplied += amt; break;
                }
            });

            const commissionsTotal = Math.round((commissionsPaid + commissionsOwed + commissionsApplied) * 100) / 100;
            const unrealizedCommissionCost = Math.round((commissionsOwed + commissionsApplied) * 100) / 100;

            // --- Per-Order Aggregates ---
            const orderAgg = orderAggResult.data;

            const merchantFees = Math.round((orderAgg?.reduce((s: number, o: any) => s + Number(o.merchant_fee || 0), 0) || 0) * 100) / 100;
            const orderBasedProfit = Math.round((orderAgg?.reduce((s: number, o: any) => s + Number(o.profit_amount || 0), 0) || 0) * 100) / 100;
            const orderBasedCogs = Math.round((orderAgg?.reduce((s: number, o: any) => s + Number(o.cogs_amount || 0), 0) || 0) * 100) / 100;

            // --- Commission-in-Product ---
            const commOffsetOrders = commOffsetResult.data || [];
            const commissionsInProduct = Math.round(
                commOffsetOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) * 100
            ) / 100;
            const commissionProductCost = Math.round(
                commOffsetOrders.reduce((s: number, o: any) => s + Number(o.cogs_amount || 0), 0) * 100
            ) / 100;
            const commissionProductMarkup = Math.round(
                (commissionsInProduct - commissionProductCost) * 100
            ) / 100;

            return {
                inventoryValue,
                salesRevenue,
                cogs,
                overhead: Math.round((internalOverhead + operatingExpenses + unrealizedCommissionCost) * 100) / 100,
                inventoryPurchases: inventoryExpenses,
                netProfit: Math.round((salesRevenue - cogs - (internalOverhead + operatingExpenses + inventoryExpenses + unrealizedCommissionCost)) * 100) / 100,
                operatingProfit: Math.round((salesRevenue - cogs - (internalOverhead + operatingExpenses + unrealizedCommissionCost)) * 100) / 100,
                commissionsPaid: Math.round(commissionsPaid * 100) / 100,
                commissionsOwed: Math.round(commissionsOwed * 100) / 100,
                commissionsApplied: Math.round(commissionsApplied * 100) / 100,
                commissionsTotal,
                commissionsInProduct,
                commissionProductCost,
                commissionProductMarkup,
                merchantFees,
                orderBasedProfit,
                orderBasedCogs,
                _errors: errors,
            };
        },
        enabled: !!orgId,
    });
}
