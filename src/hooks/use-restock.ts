
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { toast } from "@/hooks/use-toast";

export function useRestockInventory() {
    const queryClient = useQueryClient();

    const returnToStock = useMutation({
        mutationFn: async (item: {
            id: string;
            movement_id?: string;
            batch_number?: string;
            peptide_id?: string;
        }) => {
            // 1. Find a bottle to restock
            let bottleId = null;

            if (item.movement_id) {
                // Determine bottle from original movement
                // We join with bottles to find one that is NOT already 'in_stock'
                const { data: mItems } = await supabase
                    .from('movement_items')
                    .select('bottle_id, bottles(status)')
                    .eq('movement_id', item.movement_id);

                // Find a bottle from this movement that is currently sold/internal_use (not in_stock)
                const target = mItems?.find((mi) => (mi.bottles as { status: string } | null)?.status !== 'in_stock');
                if (target) bottleId = target.bottle_id;
            }

            if (!bottleId && item.batch_number) {
                // ... same fallback ...
                const { data: lots } = await supabase
                    .from('lots')
                    .select('id')
                    .eq('lot_number', item.batch_number)
                    .eq('peptide_id', item.peptide_id)
                    .limit(1);

                if (lots?.[0]) {
                    const { data: b } = await supabase.from('bottles')
                        .select('id')
                        .eq('lot_id', lots[0].id)
                        .eq('status', 'sold')
                        .limit(1);
                    if (b?.[0]) bottleId = b[0].id;
                }
            }

            if (bottleId) {
                // 2. Mark bottle as in_stock
                const { error: bError } = await supabase
                    .from('bottles')
                    .update({ status: 'in_stock' })
                    .eq('id', bottleId);
                if (bError) throw bError;

                // 3. Delete from client inventory
                let dQuery = supabase.from('client_inventory').delete();
                if (item.id && item.id !== 'virtual-id') {
                    dQuery = dQuery.eq('id', item.id);
                } else if (item.movement_id) {
                    dQuery = dQuery.eq('movement_id', item.movement_id);
                } else {
                    throw new Error("Cannot identify inventory item to delete");
                }

                const { error: dError } = await dQuery;
                if (dError) throw dError;

                // 4. Conditionally mark the movement as 'returned'
                if (item.movement_id) {
                    // Only mark as fully returned if NO items remain in the fridge for this movement
                    const { data: remainingItems } = await supabase
                        .from('client_inventory')
                        .select('id')
                        .eq('movement_id', item.movement_id);

                    if (!remainingItems || remainingItems.length === 0) {
                        const { error: movementError } = await supabase
                            .from('movements')
                            .update({ status: 'returned' })
                            .eq('id', item.movement_id);

                        if (movementError) {
                            console.error('Failed to update movement status:', movementError);
                        }
                    }
                }

                return "Restocked successfully";
            } else {
                // No matching bottle found — remove from fridge anyway
                let dQuery = supabase.from('client_inventory').delete();
                if (item.id && item.id !== 'virtual-id') {
                    dQuery = dQuery.eq('id', item.id);
                } else if (item.movement_id) {
                    dQuery = dQuery.eq('movement_id', item.movement_id);
                } else {
                    throw new Error("Cannot identify inventory item to delete");
                }
                const { error: dError } = await dQuery;
                if (dError) throw dError;
                return "Removed from fridge (no matching bottle found to restock)";
            }
        },
        onSuccess: (msg) => {
            queryClient.invalidateQueries({ queryKey: ['client-inventory-admin'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            toast({ title: msg });
        },
        onError: (err) => {
            toast({ variant: "destructive", title: "Error", description: err.message });
        }
    });

    return returnToStock;
}
