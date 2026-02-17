
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';

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
    // Per-order aggregates
    merchantFees: number;       // Total merchant fees across all orders
    orderBasedProfit: number;   // SUM of per-order profit_amount
    orderBasedCogs: number;     // SUM of per-order cogs_amount
}

export function useFinancialMetrics() {
    return useQuery({
        queryKey: ['financial-metrics'],
        queryFn: async (): Promise<FinancialMetrics> => {
            try {
                // --- 1. Inventory Asset Value ---
                // Use RPC to avoid 1000-row limit
                const { data: valuation, error: valError } = await supabase
                    .rpc('get_inventory_valuation');

                if (valError) {
                    console.error("Valuation RPC failed:", valError);
                    // Fallback? No, fallback is the broken query. Just log.
                }

                const inventoryValue = valuation?.[0]?.total_value || 0;
                // const totalItems = valuation?.[0]?.item_count || 0; 


                // --- 2. Sales & COGS ---
                // Fetch Sales Movements
                const { data: sales, error: salesError } = await supabase
                    .from('movements')
                    .select('id, amount_paid')
                    .eq('type', 'sale');

                if (salesError) throw salesError;

                const salesRevenue = Math.round((sales?.reduce((sum, s) => sum + (s.amount_paid || 0), 0) || 0) * 100) / 100;

                // Calculate COGS (Cost of sold items)
                const saleIds = sales?.map(s => s.id) || [];
                let cogs = 0;

                if (saleIds.length > 0) {
                    // Fetch items for these sales
                    const { data: saleItems, error: itemsError } = await supabase
                        .from('movement_items')
                        .select('bottle_id')
                        .in('movement_id', saleIds);

                    if (itemsError) throw itemsError;

                    // Get bottles for these items to find their lots
                    const soldBottleIds = saleItems?.map(i => i.bottle_id) || [];
                    if (soldBottleIds.length > 0) {
                        const { data: soldBottles } = await supabase
                            .from('bottles')
                            .select('id, lot_id')
                            .in('id', soldBottleIds);

                        const soldLotIds = [...new Set(soldBottles?.map(b => b.lot_id).filter(Boolean) || [])];

                        // Fetch lots if not already in map (reuse map?)
                        // For safety, let's fetch any missing lots or just fetch needed ones
                        const { data: soldLots } = await supabase
                            .from('lots')
                            .select('id, cost_per_unit')
                            .in('id', soldLotIds);

                        const soldLotMap = new Map(soldLots?.map(l => [l.id, l.cost_per_unit]) || []);

                        // Sum it up
                        // We need to map item -> bottle -> lot -> cost
                        const bottleLotMap = new Map(soldBottles?.map(b => [b.id, b.lot_id]) || []);

                        cogs = Math.round((saleItems?.reduce((sum, item) => {
                            const lotId = bottleLotMap.get(item.bottle_id);
                            if (!lotId) return sum;
                            return sum + (soldLotMap.get(lotId) || 0);
                        }, 0) || 0) * 100) / 100;
                    }
                }


                // --- 3. Overhead/Expenses (Internal Movements) ---
                const { data: overheadMoves, error: overheadError } = await supabase
                    .from('movements')
                    .select('id')
                    .in('type', ['internal_use', 'giveaway', 'loss']);

                if (overheadError) throw overheadError;

                let internalOverhead = 0;
                const overheadIds = overheadMoves?.map(m => m.id) || [];

                if (overheadIds.length > 0) {
                    const { data: overItems } = await supabase
                        .from('movement_items')
                        .select('bottle_id')
                        .in('movement_id', overheadIds);

                    const overBottleIds = overItems?.map(i => i.bottle_id) || [];

                    if (overBottleIds.length > 0) {
                        const { data: overBottles } = await supabase
                            .from('bottles')
                            .select('id, lot_id')
                            .in('id', overBottleIds);

                        const overLotIds = [...new Set(overBottles?.map(b => b.lot_id).filter(Boolean) || [])];

                        const { data: overLots } = await supabase
                            .from('lots')
                            .select('id, cost_per_unit')
                            .in('id', overLotIds);

                        const overLotMap = new Map(overLots?.map(l => [l.id, l.cost_per_unit]) || []);
                        const bottleLotMap = new Map(overBottles?.map(b => [b.id, b.lot_id]) || []);

                        internalOverhead = Math.round((overItems?.reduce((sum, item) => {
                            const lotId = bottleLotMap.get(item.bottle_id);
                            return sum + (overLotMap.get(lotId!) || 0);
                        }, 0) || 0) * 100) / 100;
                    }
                }

                // --- 4. Cash Expenses (from expenses table) ---
                const { data: expenses, error: expenseError } = await supabase
                    .from('expenses')
                    .select('amount, category');

                if (expenseError) throw expenseError;

                let inventoryExpenses = 0;
                let operatingExpenses = 0;

                expenses?.forEach(e => {
                    const amt = Number(e.amount);
                    if (e.category === 'inventory') {
                        inventoryExpenses += amt;
                    } else {
                        operatingExpenses += amt;
                    }
                });

                // --- 5. Commission Costs ---
                const { data: commissionRows, error: commError } = await supabase
                    .from('commissions')
                    .select('amount, status');

                if (commError) console.error('Commission query failed:', commError);

                let commissionsPaid = 0;    // status = 'paid' (cash — already in expenses as category 'commission')
                let commissionsOwed = 0;    // status = 'pending' (liability)
                let commissionsApplied = 0; // status = 'available' (applied to partner balance)

                commissionRows?.forEach(c => {
                    const amt = Number(c.amount) || 0;
                    switch (c.status) {
                        case 'paid': commissionsPaid += amt; break;
                        case 'pending': commissionsOwed += amt; break;
                        case 'available': commissionsApplied += amt; break;
                    }
                });

                const commissionsTotal = Math.round((commissionsPaid + commissionsOwed + commissionsApplied) * 100) / 100;

                // Pending + Applied commissions are real costs not yet in expenses table.
                // Paid commissions are already recorded as expenses (category: 'commission'),
                // so they're already inside operatingExpenses. Don't double-count them.
                const unrealizedCommissionCost = Math.round((commissionsOwed + commissionsApplied) * 100) / 100;

                // Total Cash Outflow = Ops + Inventory
                // Total Overhead (for Cash Flow) = Internal + Ops + Inventory + Unrealized Commissions
                // Operational Overhead = Internal + Ops + Unrealized Commissions

                // --- 6. Per-Order Aggregates (merchant fees, order-level profit) ---
                const { data: orderAgg } = await supabase
                    .from('sales_orders')
                    .select('merchant_fee, profit_amount, cogs_amount')
                    .neq('status', 'cancelled');

                const merchantFees = Math.round((orderAgg?.reduce((s, o: any) => s + Number(o.merchant_fee || 0), 0) || 0) * 100) / 100;
                const orderBasedProfit = Math.round((orderAgg?.reduce((s, o: any) => s + Number(o.profit_amount || 0), 0) || 0) * 100) / 100;
                const orderBasedCogs = Math.round((orderAgg?.reduce((s, o: any) => s + Number(o.cogs_amount || 0), 0) || 0) * 100) / 100;

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
                    merchantFees: 0,
                    orderBasedProfit: 0,
                    orderBasedCogs: 0,
                };
            }
        }
    });
}
