
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
}

export function useFinancialMetrics() {
    const { profile } = useAuth();
    const orgId = profile?.org_id;
    return useQuery({
        queryKey: ['financial-metrics', orgId],
        queryFn: async (): Promise<FinancialMetrics> => {
            try {
                // === Phase 1: Fire all independent queries in parallel (tenant-scoped) ===
                const [
                    valuationResult,
                    salesResult,
                    overheadResult,
                    expensesResult,
                    commissionsResult,
                    orderAggResult,
                    commOffsetResult,
                ] = await Promise.all([
                    supabase.rpc('get_inventory_valuation'),
                    supabase.from('movements').select('id, amount_paid').eq('org_id', orgId!).eq('type', 'sale'),
                    supabase.from('movements').select('id').eq('org_id', orgId!).in('type', ['internal_use', 'giveaway', 'loss']),
                    supabase.from('expenses').select('amount, category').eq('org_id', orgId!),
                    supabase.from('commissions').select('amount, status, sales_orders!inner(org_id)').eq('sales_orders.org_id', orgId!),
                    supabase.from('sales_orders').select('merchant_fee, profit_amount, cogs_amount').eq('org_id', orgId!).neq('status', 'cancelled'),
                    supabase.from('sales_orders').select('total_amount, cogs_amount').eq('org_id', orgId!).eq('payment_status', 'commission_offset').neq('status', 'cancelled'),
                ]);

                if (valuationResult.error) console.error("Valuation RPC failed:", valuationResult.error);
                if (salesResult.error) throw salesResult.error;
                if (overheadResult.error) throw overheadResult.error;
                if (expensesResult.error) throw expensesResult.error;
                if (commissionsResult.error) console.error('Commission query failed:', commissionsResult.error);

                // --- Inventory Value ---
                const inventoryValue = valuationResult.data?.[0]?.total_value || 0;

                // --- Sales Revenue ---
                const sales = salesResult.data || [];
                const salesRevenue = Math.round(sales.reduce((sum, s) => sum + (s.amount_paid || 0), 0) * 100) / 100;

                // === Phase 2: Two independent chains in parallel (COGS + Overhead) ===
                // Helper to calculate cost from movement IDs → items → bottles → lots
                async function calcMovementCost(movementIds: string[]): Promise<number> {
                    if (movementIds.length === 0) return 0;

                    const { data: items, error: itemsError } = await supabase
                        .from('movement_items')
                        .select('bottle_id')
                        .in('movement_id', movementIds);

                    if (itemsError) throw itemsError;

                    const bottleIds = items?.map(i => i.bottle_id) || [];
                    if (bottleIds.length === 0) return 0;

                    // Fetch bottles and their lots in parallel
                    const { data: bottles, error: bottlesError } = await supabase
                        .from('bottles')
                        .select('id, lot_id')
                        .in('id', bottleIds);
                    if (bottlesError) throw bottlesError;

                    const lotIds = [...new Set(bottles?.map(b => b.lot_id).filter(Boolean) || [])];
                    if (lotIds.length === 0) return 0;

                    const { data: lots, error: lotsError } = await supabase
                        .from('lots')
                        .select('id, cost_per_unit')
                        .in('id', lotIds);
                    if (lotsError) throw lotsError;

                    const lotCostMap = new Map(lots?.map(l => [l.id, l.cost_per_unit]) || []);
                    const bottleLotMap = new Map(bottles?.map(b => [b.id, b.lot_id]) || []);

                    return Math.round((items?.reduce((sum, item) => {
                        const lotId = bottleLotMap.get(item.bottle_id);
                        if (!lotId) return sum;
                        return sum + (lotCostMap.get(lotId) || 0);
                    }, 0) || 0) * 100) / 100;
                }

                const saleIds = sales.map(s => s.id);
                const overheadIds = (overheadResult.data || []).map(m => m.id);

                // Run both cost chains in parallel
                const [cogs, internalOverhead] = await Promise.all([
                    calcMovementCost(saleIds),
                    calcMovementCost(overheadIds),
                ]);

                // --- Cash Expenses ---
                let inventoryExpenses = 0;
                let operatingExpenses = 0;

                expensesResult.data?.forEach(e => {
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

                commissionsResult.data?.forEach(c => {
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

                const merchantFees = Math.round((orderAgg?.reduce((s, o) => s + Number(o.merchant_fee || 0), 0) || 0) * 100) / 100;
                const orderBasedProfit = Math.round((orderAgg?.reduce((s, o) => s + Number(o.profit_amount || 0), 0) || 0) * 100) / 100;
                const orderBasedCogs = Math.round((orderAgg?.reduce((s, o) => s + Number(o.cogs_amount || 0), 0) || 0) * 100) / 100;

                // --- Commission-in-Product ---
                const commOffsetOrders = commOffsetResult.data || [];
                const commissionsInProduct = Math.round(
                    commOffsetOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0) * 100
                ) / 100;
                const commissionProductCost = Math.round(
                    commOffsetOrders.reduce((s, o) => s + Number(o.cogs_amount || 0), 0) * 100
                ) / 100;
                const commissionProductMarkup = Math.round(
                    (commissionsInProduct - commissionProductCost) * 100
                ) / 100;

                return {
                    inventoryValue,
                    salesRevenue,
                    cogs,
                    overhead: Math.round((internalOverhead + operatingExpenses + unrealizedCommissionCost) * 100) / 100, // Operational Overhead (now includes commission liability)
                    inventoryPurchases: inventoryExpenses,
                    netProfit: Math.round((salesRevenue - cogs - (internalOverhead + operatingExpenses + inventoryExpenses + unrealizedCommissionCost)) * 100) / 100, // True Net (Cash Flow)
                    operatingProfit: Math.round((salesRevenue - cogs - (internalOverhead + operatingExpenses + unrealizedCommissionCost)) * 100) / 100, // Operational Profit (includes commission liability)
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
                };
            } catch (err) {
                console.error("Error calculating financials:", err);
                return {
                    inventoryValue: 0,
                    salesRevenue: 0,
                    cogs: 0,
                    overhead: 0,
                    inventoryPurchases: 0,
                    netProfit: 0,
                    operatingProfit: 0,
                    commissionsPaid: 0,
                    commissionsOwed: 0,
                    commissionsApplied: 0,
                    commissionsTotal: 0,
                    commissionsInProduct: 0,
                    commissionProductCost: 0,
                    commissionProductMarkup: 0,
                    merchantFees: 0,
                    orderBasedProfit: 0,
                    orderBasedCogs: 0,
                };
            }
        }
    });
}
