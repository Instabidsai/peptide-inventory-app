
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FinancialMetrics {
    inventoryValue: number;
    salesRevenue: number;
    cogs: number;
    overhead: number;
    netProfit: number;
}

export function useFinancialMetrics() {
    return useQuery({
        queryKey: ['financial-metrics'],
        queryFn: async (): Promise<FinancialMetrics> => {
            try {
                // --- 1. Inventory Asset Value ---
                // Fetch in_stock bottles
                const { data: bottles, error: bottlesError } = await supabase
                    .from('bottles')
                    .select('id, lot_id')
                    .eq('status', 'in_stock');

                if (bottlesError) throw bottlesError;

                // Fetch lots for these bottles
                const lotIds = [...new Set(bottles?.map(b => b.lot_id).filter(Boolean) || [])];
                let lotMap = new Map<string, number>();

                if (lotIds.length > 0) {
                    const { data: lots, error: lotsError } = await supabase
                        .from('lots')
                        .select('id, cost_per_unit')
                        .in('id', lotIds);

                    if (lotsError) throw lotsError;
                    lots?.forEach(l => lotMap.set(l.id, l.cost_per_unit));
                }

                const inventoryValue = bottles?.reduce((sum, bottle) => {
                    return sum + (lotMap.get(bottle.lot_id) || 0);
                }, 0) || 0;


                // --- 2. Sales & COGS ---
                // Fetch Sales Movements
                const { data: sales, error: salesError } = await supabase
                    .from('movements')
                    .select('id, amount_paid')
                    .eq('type', 'sale');

                if (salesError) throw salesError;

                const salesRevenue = sales?.reduce((sum, s) => sum + (s.amount_paid || 0), 0) || 0;

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

                        cogs = saleItems?.reduce((sum, item) => {
                            const lotId = bottleLotMap.get(item.bottle_id);
                            if (!lotId) return sum;
                            return sum + (soldLotMap.get(lotId) || 0);
                        }, 0) || 0;
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

                        internalOverhead = overItems?.reduce((sum, item) => {
                            const lotId = bottleLotMap.get(item.bottle_id);
                            return sum + (overLotMap.get(lotId!) || 0);
                        }, 0) || 0;
                    }
                }

                // --- 4. Cash Expenses (from expenses table) ---
                const { data: expenses, error: expenseError } = await supabase
                    .from('expenses')
                    .select('amount');

                if (expenseError) throw expenseError;

                const cashExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

                // Total Overhead = Internal Usage Cost + Cash Expenses
                const totalOverhead = internalOverhead + cashExpenses;

                return {
                    inventoryValue,
                    salesRevenue,
                    cogs,
                    overhead: totalOverhead,
                    netProfit: salesRevenue - cogs - totalOverhead
                };
            } catch (err) {
                console.error("Error calculating financials:", err);
                return {
                    inventoryValue: 0,
                    salesRevenue: 0,
                    cogs: 0,
                    overhead: 0,
                    netProfit: 0
                };
            }
        }
    });
}
