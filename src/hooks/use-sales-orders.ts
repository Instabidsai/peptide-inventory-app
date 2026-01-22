import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type SalesOrderStatus = 'draft' | 'submitted' | 'fulfilled' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'refunded';

export interface SalesOrderItem {
    id: string;
    sales_order_id: string;
    peptide_id: string;
    quantity: number;
    unit_price: number;
    created_at: string;
    peptides?: {
        id: string;
        name: string;
    };
}

export interface SalesOrder {
    id: string;
    org_id: string;
    client_id: string;
    rep_id: string | null;
    status: SalesOrderStatus;
    total_amount: number;
    commission_amount: number;
    payment_status: PaymentStatus;
    amount_paid: number;
    payment_method: string | null;
    payment_date: string | null;
    shipping_address: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    contacts?: {
        id: string;
        name: string;
        email: string | null;
    };
    profiles?: {
        id: string;
        full_name: string | null;
    };
    sales_order_items?: SalesOrderItem[];
}

export interface CreateSalesOrderInput {
    client_id: string;
    items: {
        peptide_id: string;
        quantity: number;
        unit_price: number;
    }[];
    shipping_address?: string;
    notes?: string;
    status?: SalesOrderStatus;
}

export function useSalesOrders(status?: SalesOrderStatus) {
    return useQuery({
        queryKey: ['sales_orders', status],
        queryFn: async () => {
            let query = supabase
                .from('sales_orders')
                .select(`
          *,
          contacts (id, name, email),
          profiles (id, full_name),
          sales_order_items (
            *,
            peptides (id, name)
          )
        `)
                .order('created_at', { ascending: false });

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as SalesOrder[];
        },
    });
}

export function useMySalesOrders() {
    return useQuery({
        queryKey: ['my_sales_orders'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (!profile) throw new Error('Profile not found');

            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
          *,
          contacts (id, name, email),
          sales_order_items (
            *,
            peptides (id, name)
          )
        `)
                .eq('rep_id', profile.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as SalesOrder[];
        },
    });
}

export function useCreateSalesOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (input: CreateSalesOrderInput) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: profile } = await supabase
                .from('profiles')
                .select('id, org_id, commission_rate')
                .eq('user_id', user.id)
                .single();

            if (!profile?.org_id) throw new Error('No organization found');

            // Calculate totals
            const totalAmount = input.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
            const commissionAmount = totalAmount * (Number(profile.commission_rate) || 0);

            // 1. Create Order
            const { data: order, error: orderError } = await supabase
                .from('sales_orders')
                .insert({
                    org_id: profile.org_id,
                    client_id: input.client_id,
                    rep_id: profile.id,
                    status: input.status || 'draft',
                    total_amount: totalAmount,
                    commission_amount: commissionAmount,
                    shipping_address: input.shipping_address,
                    notes: input.notes,
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 2. Create Items
            const itemsToInsert = input.items.map(item => ({
                sales_order_id: order.id,
                peptide_id: item.peptide_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            }));

            const { error: itemsError } = await supabase
                .from('sales_order_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            return order;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            toast({ title: 'Order created successfully' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to create order', description: error.message });
        },
    });
}

export function useUpdateSalesOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<SalesOrder> & { id: string }) => {
            const { error } = await supabase
                .from('sales_orders')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            toast({ title: 'Order updated' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to update order', description: error.message });
        },
    });
}

export function useFulfillOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (orderId: string) => {
            // 1. Get order details with items
            const { data: order, error: orderError } = await supabase
                .from('sales_orders')
                .select(`
          *,
          sales_order_items (
            *,
            peptides (id, name)
          )
        `)
                .eq('id', orderId)
                .single();

            if (orderError) throw orderError;
            if (order.status === 'fulfilled') throw new Error('Order already fulfilled');

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // 2. Prepare Movement Data
            // We create ONE movement for the whole order
            const { data: movement, error: movError } = await supabase
                .from('movements')
                .insert({
                    org_id: order.org_id,
                    type: 'sale',
                    contact_id: order.client_id,
                    movement_date: new Date().toISOString().split('T')[0],
                    notes: `Fulfilled Sales Order #${order.id.slice(0, 8)}`,
                    created_by: order.rep_id || user.id, // Attribute to rep if exists
                    payment_status: order.payment_status || 'unpaid',
                    amount_paid: order.amount_paid || 0,
                    payment_date: order.payment_date,
                })
                .select()
                .single();

            if (movError) throw movError;

            // 3. Allocate Inventory (FIFO)
            for (const item of order.sales_order_items) {
                // Find in-stock bottles for this peptide, ordered by creation (FIFO)
                const { data: bottles, error: bError } = await supabase
                    .from('bottles')
                    .select('*, lots!inner(peptide_id)')
                    .eq('status', 'in_stock')
                    .eq('lots.peptide_id', item.peptide_id)
                    .order('created_at', { ascending: true })
                    .limit(item.quantity);

                if (bError) throw bError;

                if (!bottles || bottles.length < item.quantity) {
                    throw new Error(`Insufficient stock for ${item.peptides?.name}. Needed ${item.quantity}, found ${bottles?.length || 0}.`);
                }

                const bottleIds = bottles.map(b => b.id);

                // A. Create Movement Items
                const moveItems = bottles.map(b => ({
                    movement_id: movement.id,
                    bottle_id: b.id,
                    price_at_sale: item.unit_price, // Assign unit price from order
                }));

                const { error: miError } = await supabase.from('movement_items').insert(moveItems);
                if (miError) throw miError;

                // B. Update Bottle Status to 'sold'
                const { error: buError } = await supabase
                    .from('bottles')
                    .update({ status: 'sold' })
                    .in('id', bottleIds);

                if (buError) throw buError;
            }

            // 4. Update Order Status
            const { error: updateError } = await supabase
                .from('sales_orders')
                .update({ status: 'fulfilled' })
                .eq('id', orderId);

            if (updateError) throw updateError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            toast({ title: 'Order fulfilled', description: 'Inventory has been deducted and movement recorded.' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Fulfillment failed', description: error.message });
        }
    });
}
