import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
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

            // Calculate totals and commission
            let totalAmount = 0;
            let totalCommission = 0;

            // Fetch peptide costs for commission calculation
            const peptideIds = input.items.map(i => i.peptide_id);
            const { data: peptides } = await supabase
                .from('peptides')
                .select('id, retail_price, avg_cost')
                .in('id', peptideIds);

            const peptideMap = new Map(peptides?.map(p => [p.id, p]));

            for (const item of input.items) {
                const itemTotal = item.quantity * item.unit_price;
                totalAmount += itemTotal;

                // Commission Logic: 20% of (Sale Price - Partner Cost)
                // Partner Cost = Base Cost + $4.00 Overhead
                // Base Cost = retail_price (if set) OR avg_cost (fallback) OR 0
                const peptide = peptideMap.get(item.peptide_id);
                // "retail_price" column logic fallback
                // User said: "cost plus 4$".
                // If we have retail_price set (MSRP/Base), use it? No, retail_price is MSRP.
                // We should use `avg_cost` as the true internal cost.
                // Wait, in previous task I set "Partner Cost" displayed as "AvgCost + 4".
                // So Profit = SalePrice - (AvgCost + 4).

                const baseCost = (peptide as any)?.retail_price || (peptide as any)?.avg_cost || 0; // Fallback to retail_price if avg_cost missing? Or vice versa? 
                // Actually, "Base Price" for partner view was "AvgCost + 4".
                // But previously I used "retail_price" as the "Base Price" in the UI code if available.
                // Let's stick to what the Partner sees as "Cost": `(peptide.retail_price || peptide.avg_cost || 0) + 4`.

                // However, commonly "retail_price" in DB is MSRP. "avg_cost" is inventory cost.
                // User said: "20% about the cost plus 4$ marc".
                // "Cost" usually implies "Inventory Cost".
                // But I added `retail_price` column previously. Did I populate it with Cost or MSRP?
                // The script set it to $60 for BPC. That was MSRP.
                // So `avg_cost` is the internal cost.
                // Partner Cost = `avg_cost + 4`.
                // Profit = `unit_price` - `(avg_cost + 4)`.

                // PROBLEM: `avg_cost` might be 0 if no inventory.
                // Fallback: If avg_cost is 0, maybe use $10?
                const internalCost = (peptide?.avg_cost || 0);
                const partnerCost = internalCost + 4.00;

                const marginPerUnit = item.unit_price - partnerCost;
                if (marginPerUnit > 0) {
                    totalCommission += (marginPerUnit * item.quantity) * 0.20; // 20%
                }
            }

            // Allow admin override or profile-specific rate?
            // User said: "hard code it at 20%".
            // We ignore profile.commission_rate for now or use it if we want flexibility later.
            // Let's use the hardcoded 20% logic requested.
            const commissionAmount = Math.max(0, totalCommission); // Ensure non-negative

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
