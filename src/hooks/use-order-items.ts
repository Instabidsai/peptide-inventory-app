import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useUpdateSalesOrder } from '@/hooks/use-sales-orders';

export interface BatchOrderItemUpdate {
    orderId: string;
    newTotal: number;
    notes: string | null;
    shippingAddress: string | null;
    deliveryMethod: 'ship' | 'local_pickup';
    updates: { id: string; quantity: number; unit_price: number }[];
    inserts: { sales_order_id: string; peptide_id: string; quantity: number; unit_price: number }[];
    deletes: string[];
}

export function useBatchUpdateOrderItems() {
    const { toast } = useToast();
    const updateOrder = useUpdateSalesOrder();

    return useMutation({
        mutationFn: async (input: BatchOrderItemUpdate) => {
            const updatePromises = input.updates.map(item =>
                supabase
                    .from('sales_order_items')
                    .update({ quantity: item.quantity, unit_price: item.unit_price })
                    .eq('id', item.id)
            );

            const insertPromises = input.inserts.length > 0
                ? [supabase.from('sales_order_items').insert(input.inserts)]
                : [];

            const deletePromises = input.deletes.length > 0
                ? [supabase.from('sales_order_items').delete().in('id', input.deletes)]
                : [];

            const results = await Promise.all([...updatePromises, ...insertPromises, ...deletePromises]);
            const failed = results.find(r => r.error);
            if (failed?.error) throw failed.error;

            await updateOrder.mutateAsync({
                id: input.orderId,
                total_amount: input.newTotal,
                notes: input.notes,
                shipping_address: input.shippingAddress,
                delivery_method: input.deliveryMethod,
            });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to save order items', description: error.message || 'Unknown error' });
        }
    });
}

export function useDeleteOrderItem() {
    const { toast } = useToast();
    const updateOrder = useUpdateSalesOrder();

    return useMutation({
        mutationFn: async ({ itemId, orderId, newTotal }: { itemId: string, orderId: string, newTotal: number }) => {
            const { error } = await supabase.from('sales_order_items').delete().eq('id', itemId);
            if (error) throw error;

            await updateOrder.mutateAsync({ id: orderId, total_amount: newTotal });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to remove item', description: error.message });
        }
    });
}

export function useUpdateSingleOrderItem() {
    const { toast } = useToast();
    const updateOrder = useUpdateSalesOrder();

    return useMutation({
        mutationFn: async ({ itemId, orderId, quantity, unitPrice, newTotal }: { itemId: string, orderId: string, quantity: number, unitPrice: number, newTotal: number }) => {
            const { error } = await supabase.from('sales_order_items')
                .update({ quantity, unit_price: unitPrice })
                .eq('id', itemId);
            if (error) throw error;

            await updateOrder.mutateAsync({ id: orderId, total_amount: newTotal });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to update item', description: error.message });
        }
    });
}
