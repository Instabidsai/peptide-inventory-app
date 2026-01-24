
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
                const { data: mItems } = await supabase
                    .from('movement_items')
                    .select('bottle_id')
                    .eq('movement_id', item.movement_id)
                    .limit(1);
                if (mItems?.[0]) bottleId = mItems[0].bottle_id;
            }

            if (!bottleId && item.batch_number) {
                // Fallback: Find any SOLD bottle with this batch number
                // First get lot_id
                const { data: lots } = await supabase
                    .from('lots')
                    .select('id')
                    .eq('lot_number', item.batch_number)
                    .eq('peptide_id', item.peptide_id) // Ensure correct peptide
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

                // 4. Mark the movement as 'returned' (preserves transaction history)
                if (item.movement_id) {
                    const { error: movementError } = await supabase
                        .from('movements')
                        .update({ status: 'returned' })
                        .eq('id', item.movement_id);

                    if (movementError) {
                        console.error('Failed to update movement status:', movementError);
                        // Don't throw - this is not critical to the return operation
                    }
                }

                return "Restocked successfully and movement marked as returned";
            } else {
                if (confirm("Could not find the original bottle in the system history (it might be old data). Just delete it from the fridge?")) {
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
                    return "Removed (No bottle found to restock)";
                }
                throw new Error("Action cancelled");
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
