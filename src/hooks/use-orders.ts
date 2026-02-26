import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

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
    order_group_id?: string | null;
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
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['orders', status, profile?.org_id],
        queryFn: async () => {
            let query = supabase
                .from('orders')
                .select('*, peptides(id, name)')
                .eq('org_id', profile!.org_id!)
                .order('created_at', { ascending: false });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as Order[];
        },
        enabled: !!user && !!profile?.org_id,
    });
}

// Fetch only pending orders
export function usePendingOrders() {
    return useOrders('pending');
}

// Get pending orders count
export function usePendingOrdersCount() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['orders', 'pending', 'count', profile?.org_id],
        queryFn: async () => {
            const { count, error } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .eq('org_id', profile!.org_id!);

            if (error) throw error;
            return count || 0;
        },
        enabled: !!user && !!profile?.org_id,
    });
}

// Get total pending order value
export function usePendingOrderValue() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['orders', 'pending', 'value', profile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('quantity_ordered, estimated_cost_per_unit')
                .eq('status', 'pending')
                .eq('org_id', profile!.org_id!);

            if (error) throw error;

            const totalValue = data?.reduce((sum, order) => {
                return sum + (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
            }, 0) || 0;

            return totalValue;
        },
        enabled: !!user && !!profile?.org_id,
    });
}

// Get detailed pending financials (Total, Paid, Owed)
export function usePendingOrderFinancials() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['orders', 'pending', 'financials', profile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('quantity_ordered, estimated_cost_per_unit, amount_paid')
                .eq('status', 'pending')
                .eq('org_id', profile!.org_id!);

            if (error) throw error;

            let totalValue = 0;
            let totalPaid = 0;

            data?.forEach(order => {
                totalValue += (order.quantity_ordered * (order.estimated_cost_per_unit || 0));
                totalPaid += (order.amount_paid || 0);
            });

            return {
                totalValue,
                totalPaid,
                outstandingLiability: totalValue - totalPaid
            };
        },
        enabled: !!user && !!profile?.org_id,
    });
}

// Get pending orders by peptide (for peptides page)
export function usePendingOrdersByPeptide() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['orders', 'pending', 'by-peptide', profile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('peptide_id, quantity_ordered, expected_arrival_date, estimated_cost_per_unit')
                .eq('status', 'pending')
                .eq('org_id', profile!.org_id!);

            if (error) throw error;

            // Group by peptide_id
            const byPeptide: Record<string, {
                totalOrdered: number;
                nextDelivery: string | null;
                avgPendingCost: number;
            }> = {};

            data?.forEach(order => {
                const pId = order.peptide_id;
                if (!byPeptide[pId]) {
                    byPeptide[pId] = {
                        totalOrdered: 0,
                        nextDelivery: null,
                        avgPendingCost: 0
                    };
                }

                const currentCount = byPeptide[pId].totalOrdered;
                const newCount = currentCount + order.quantity_ordered;
                const currentAvg = byPeptide[pId].avgPendingCost;
                const orderCost = order.estimated_cost_per_unit || 0;

                // Update running average cost
                if (newCount > 0) {
                    byPeptide[pId].avgPendingCost = ((currentAvg * currentCount) + (orderCost * order.quantity_ordered)) / newCount;
                }

                byPeptide[pId].totalOrdered = newCount;

                // Track earliest delivery date
                if (order.expected_arrival_date) {
                    const currentDelivery = byPeptide[pId].nextDelivery;
                    if (!currentDelivery || order.expected_arrival_date < currentDelivery) {
                        byPeptide[pId].nextDelivery = order.expected_arrival_date;
                    }
                }
            });

            return byPeptide;
        },
        enabled: !!user && !!profile?.org_id,
    });
}

// Create a new order
export function useCreateOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async (input: CreateOrderInput) => {
            if (!profile?.org_id) throw new Error('No organization found');

            const { data, error } = await supabase
                .from('orders')
                .insert({
                    ...input,
                    org_id: profile.org_id,
                    order_date: input.order_date || format(new Date(), 'yyyy-MM-dd'),
                })
                .select('*, peptides(id, name)')
                .maybeSingle();

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
                .maybeSingle();

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
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async (input: MarkReceivedInput) => {
            if (!profile?.org_id) throw new Error('No organization found');

            // Get the order to find the peptide_id
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .select('peptide_id')
                .eq('id', input.order_id)
                .maybeSingle();

            if (orderError) throw orderError;
            if (!order) throw new Error('Order not found');

            // Create the lot
            const { data: lot, error: lotError } = await supabase
                .from('lots')
                .insert({
                    org_id: profile.org_id,
                    peptide_id: order.peptide_id,
                    lot_number: input.lot_number,
                    quantity_received: input.actual_quantity,
                    cost_per_unit: input.actual_cost_per_unit,
                    received_date: format(new Date(), 'yyyy-MM-dd'),
                    expiry_date: input.expiry_date || null,
                })
                .select()
                .maybeSingle();

            if (lotError) throw lotError;

            // Auto-generate bottle records for the new lot
            if (lot && lot.quantity_received > 0) {
                const bottles = Array.from({ length: lot.quantity_received }, (_, i) => ({
                    lot_id: lot.id,
                    org_id: lot.org_id,
                    status: 'in_stock' as const,
                    uid: `${lot.id.slice(0, 8)}-${String(i + 1).padStart(3, '0')}`,
                }));
                const { error: bottleError } = await supabase.from('bottles').insert(bottles);
                if (bottleError) throw new Error(`Lot created but failed to generate bottles: ${bottleError.message}`);
            }

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
            queryClient.invalidateQueries({ queryKey: ['bottles', 'stats'] });
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
            const { data: currentOrder, error: fetchError } = await supabase.from('orders').select('amount_paid').eq('id', orderId).maybeSingle();
            if (fetchError || !currentOrder) throw new Error('Order not found');
            const newTotal = (currentOrder.amount_paid || 0) + amount;

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
