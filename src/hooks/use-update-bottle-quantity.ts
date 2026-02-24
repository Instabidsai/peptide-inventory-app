import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export function useUpdateBottleQuantity() {
    const queryClient = useQueryClient();
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async ({
            inventoryId,
            newQuantityMg
        }: {
            inventoryId: string;
            newQuantityMg: number;
        }) => {
            // org guard — RLS on client_inventory scopes via contact_id → contacts.org_id
            if (!profile?.org_id) throw new Error('No organization context');

            const { error } = await supabase
                .from('client_inventory')
                .update({ current_quantity_mg: newQuantityMg })
                .eq('id', inventoryId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['regimen-bottles'] });
            queryClient.invalidateQueries({ queryKey: ['client-inventory-admin'] });
            toast({ title: 'Bottle quantity updated' });
        },
        onError: (error: Error) => {
            toast({
                variant: 'destructive',
                title: 'Failed to update quantity',
                description: error.message
            });
        }
    });
}
