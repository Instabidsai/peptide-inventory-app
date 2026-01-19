import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FinancialStatsProps {
    peptideId: string;
}

export function FinancialStatsCard({ peptideId }: FinancialStatsProps) {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['financial-stats', peptideId],
        queryFn: async () => {
            // 1. Get all lots for this peptide to calculate Total Spend and Total Units
            const { data: lots } = await supabase
                .from('lots')
                .select('quantity_received, cost_per_unit')
                .eq('peptide_id', peptideId);

            // 2. Get counts of internal use / giveaway items (Free Use)
            // We need to join movements -> movement_items -> bottles -> lots
            // But simpler: Find bottles of this peptide where movement type is internal/giveaway
            // Or: Find movement_items where bottle.lot.peptide_id = X and movement.type IN ('internal_use', 'giveaway')

            const { data: freeItems } = await supabase
                .from('movement_items')
                .select(`
          movement_id,
          movements!inner (type),
          bottles!inner (
            lot_id,
            lots!inner (peptide_id)
          )
        `)
                .eq('bottles.lots.peptide_id', peptideId)
                .in('movements.type', ['internal_use', 'giveaway']);

            // 3. Get current stock for Inventory Value
            const { data: inStockBottles } = await supabase
                .from('bottles')
                .select(`
          status,
          lots!inner (peptide_id, cost_per_unit)
        `)
                .eq('lots.peptide_id', peptideId)
                .eq('status', 'in_stock');

            const totalReceived = lots?.reduce((sum, lot) => sum + lot.quantity_received, 0) || 0;
            const totalSpend = lots?.reduce((sum, lot) => sum + (lot.quantity_received * lot.cost_per_unit), 0) || 0;
            const freeCount = freeItems?.length || 0;
            const sellableUnits = totalReceived - freeCount;

            const avgBuyCost = totalReceived > 0 ? totalSpend / totalReceived : 0;
            const effectiveCost = sellableUnits > 0 ? totalSpend / sellableUnits : 0;

            const inventoryValue = inStockBottles?.reduce((sum, b) => sum + (b.lots?.cost_per_unit || 0), 0) || 0;

            return {
                avgBuyCost,
                effectiveCost,
                inventoryValue,
                sellableUnits,
                freeCount
            };
        }
    });

    if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading stats...</div>;

    return (
        <div className="grid gap-4 md:grid-cols-3 pt-4">
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Value</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${stats?.inventoryValue.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Current Stock Value</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Avg Buy Cost</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${stats?.avgBuyCost.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Per Unit (Acquisition)</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Effective Cost</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-primary">${stats?.effectiveCost.toFixed(2)}</div>
                    <p className="text-xs text-muted-foreground">Adj. for {stats?.freeCount} Free/Personal</p>
                </CardContent>
            </Card>
        </div>
    );
}
