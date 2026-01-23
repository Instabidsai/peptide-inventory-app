import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type OrderStatus = 'pending' | 'received' | 'cancelled';

export interface Order {
    id: string;
    org_id: string;
    peptide_id: string;
    quantity_ordered: number;
    estimated_cost_per_unit: number | null;
    order_date: string;
    expected_arrival_date: string | null;
    supplier: string | null;
    tracking_number: string | null;
    notes: string | null;
    status: OrderStatus;
    payment_status?: 'unpaid' | 'partial' | 'paid';
    amount_paid?: number;
    created_at: string;
    updated_at: string;
    peptides?: {
        id: string;
        name: string;
    };
}

export interface CreateOrderInput {
    peptide_id: string;
    quantity_ordered: number;
    estimated_cost_per_unit?: number;
    order_date?: string;
    expected_arrival_date?: string;
    supplier?: string;
    tracking_number?: string;
    notes?: string;
}

export interface MarkReceivedInput {
    order_id: string;
    actual_quantity: number;
    actual_cost_per_unit: number;
    lot_number: string;
    expiry_date?: string;
}

// Fetch all orders
export function useOrders(status?: OrderStatus) {
    return useQuery({
        queryKey: ['orders', status],
        queryFn: async () => {
            let query = supabase
                .from('orders')
                .select('*, peptides(id, name)')
                .order('created_at', { ascending: false });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as Order[];
        },
    });
}

// Fetch only pending orders
export function usePendingOrders() {
    return useOrders('pending');
}

// Get pending orders count
export function usePendingOrdersCount() {
    return useQuery({
        queryKey: ['orders', 'pending', 'count'],
        queryFn: async () => {
            const { count, error } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (error) throw error;
            return count || 0;
        },
    });
}

// Get total pending order value
export function usePendingOrderValue() {
    return useQuery({
        queryKey: ['orders', 'pending', 'value'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('quantity_ordered, estimated_cost_per_unit')
                .eq('status', 'pending');

            if (error) throw error;

            const totalValue = data?.reduce((sum, order) => {
                return sum + (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
            }, 0) || 0;

            return totalValue;
        },
    });
}

// Get pending orders by peptide (for peptides page)
export function usePendingOrdersByPeptide() {
    return useQuery({
        queryKey: ['orders', 'pending', 'by-peptide'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('peptide_id, quantity_ordered, expected_arrival_date')
                .eq('status', 'pending');

            if (error) throw error;

            // Group by peptide_id
            const byPeptide: Record<string, { totalOrdered: number; nextDelivery: string | null }> = {};

            data?.forEach(order => {
                if (!byPeptide[order.peptide_id]) {
                    byPeptide[order.peptide_id] = { totalOrdered: 0, nextDelivery: null };
                }
                byPeptide[order.peptide_id].totalOrdered += order.quantity_ordered;

                // Track earliest delivery date
                if (order.expected_arrival_date) {
                    const current = byPeptide[order.peptide_id].nextDelivery;
                    if (!current || order.expected_arrival_date < current) {
                        byPeptide[order.peptide_id].nextDelivery = order.expected_arrival_date;
                    }
                }
            });

            return byPeptide;
        },
    });
}

// Create a new order
export function useCreateOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (input: CreateOrderInput) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('user_id', user.id)
                .single();

            if (!profile?.org_id) throw new Error('No organization found');

            const { data, error } = await supabase
                .from('orders')
                .insert({
                    ...input,
                    org_id: profile.org_id,
                    order_date: input.order_date || new Date().toISOString().split('T')[0],
                })
                .select('*, peptides(id, name)')
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            toast({ title: 'Order created successfully' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to create order', description: error.message });
        },
    });
}

// Update an order
export function useUpdateOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...input }: Partial<CreateOrderInput> & { id: string }) => {
            const { data, error } = await supabase
                .from('orders')
                .update({ ...input, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            toast({ title: 'Order updated successfully' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to update order', description: error.message });
        },
    });
}

// Mark order as received (creates a lot)
export function useMarkOrderReceived() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (input: MarkReceivedInput) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('user_id', user.id)
                .single();

            if (!profile?.org_id) throw new Error('No organization found');

            // Get the order to find the peptide_id
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .select('peptide_id')
                .eq('id', input.order_id)
                .single();

            if (orderError) throw orderError;

            // Create the lot
            const { data: lot, error: lotError } = await supabase
                .from('lots')
                .insert({
                    org_id: profile.org_id,
                    peptide_id: order.peptide_id,
                    lot_number: input.lot_number,
                    quantity_received: input.actual_quantity,
                    cost_per_unit: input.actual_cost_per_unit,
                    received_date: new Date().toISOString().split('T')[0],
                    expiry_date: input.expiry_date || null,
                })
                .select()
                .single();

            if (lotError) throw lotError;

            // Update order status to received
            const { error: updateError } = await supabase
                .from('orders')
                .update({ status: 'received', updated_at: new Date().toISOString() })
                .eq('id', input.order_id);

            if (updateError) throw updateError;

            return { lot, orderId: input.order_id };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['lots'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            queryClient.invalidateQueries({ queryKey: ['bottle-stats'] });
            toast({
                title: 'Order received!',
                description: `Created lot with ${data.lot.quantity_received} bottles`
            });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to receive order', description: error.message });
        },
    });
}

// Cancel an order
export function useCancelOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            toast({ title: 'Order cancelled' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to cancel order', description: error.message });
        },
    });
}

// Delete an order
export function useDeleteOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            toast({ title: 'Order deleted' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to delete order', description: error.message });
        },
    });
}

// Record payment for an order
export function useRecordOrderPayment() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ orderId, amount, method, date, note, isFullPayment }: { orderId: string, amount: number, method: string, date: string, note?: string, isFullPayment: boolean }) => {
            // 1. Create Expense Record
            const { error: expenseError } = await supabase
                .from('expenses')
                .insert({
                    date: date,
                    category: 'inventory',
                    amount: amount,
                    description: note || `Payment for Order #${orderId.slice(0, 8)}`,
                    recipient: 'Supplier',
                    payment_method: method,
                    status: 'paid',
                    related_order_id: orderId
                });

            if (expenseError) throw expenseError;

            // 2. Update Order Status
            const { data: currentOrder } = await supabase.from('orders').select('amount_paid').eq('id', orderId).single();
            const newTotal = (currentOrder?.amount_paid || 0) + amount;

            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    amount_paid: newTotal,
                    payment_status: isFullPayment ? 'paid' : 'partial'
                })
                .eq('id', orderId);

            if (updateError) throw updateError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            toast({ title: 'Payment recorded successfully' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to record payment', description: error.message });
        },
    });
}
