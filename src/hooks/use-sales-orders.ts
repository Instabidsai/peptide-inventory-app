import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { recalculateOrderProfit } from '@/lib/order-profit';

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
    // Shipping fields
    tracking_number?: string | null;
    carrier?: string | null;
    shipping_status?: string | null;
    ship_date?: string | null;
    shipping_cost?: number | null;
    label_url?: string | null;
    shipping_error?: string | null;
    // WooCommerce + profit fields
    order_source?: string;
    woo_order_id?: number | null;
    cogs_amount?: number | null;
    profit_amount?: number | null;
    merchant_fee?: number | null;
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
                .select('id, org_id, commission_rate, price_multiplier')
                .eq('user_id', user.id)
                .single();

            if (!profile?.org_id) throw new Error('No organization found');

            // Determine the actual rep for this order:
            // If the client has an assigned_rep_id, attribute the order to that rep
            let repId = profile.id;
            let repCommissionRate = 0;
            let priceMultiplier = 1.0;

            if (input.client_id) {
                const { data: contact } = await supabase
                    .from('contacts')
                    .select('assigned_rep_id')
                    .eq('id', input.client_id)
                    .single();

                if (contact?.assigned_rep_id) {
                    repId = contact.assigned_rep_id;
                    // Fetch the actual rep's commission settings
                    const { data: repProfile } = await supabase
                        .from('profiles')
                        .select('commission_rate, price_multiplier')
                        .eq('id', contact.assigned_rep_id)
                        .single();

                    if (repProfile) {
                        const rate = repProfile.commission_rate;
                        repCommissionRate = (rate != null) ? Number(rate) : 0.10;
                        const mult = repProfile.price_multiplier;
                        priceMultiplier = (mult != null && Number(mult) > 0) ? Number(mult) : 1.0;
                    }
                } else {
                    // No assigned rep — use logged-in user's settings
                    const rate = (profile as any).commission_rate;
                    repCommissionRate = (rate != null) ? Number(rate) : 0.10;
                    const mult = (profile as any).price_multiplier;
                    priceMultiplier = (mult != null && Number(mult) > 0) ? Number(mult) : 1.0;
                }
            } else {
                // No client selected — use logged-in user's settings
                const rate = (profile as any).commission_rate;
                repCommissionRate = (rate != null) ? Number(rate) : 0.10;
                const mult = (profile as any).price_multiplier;
                priceMultiplier = (mult != null && Number(mult) > 0) ? Number(mult) : 1.0;
            }

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

                // Commission = (SalePrice - PartnerCost) × commission_rate
                const peptide = peptideMap.get(item.peptide_id);
                const retailPrice = (peptide as any)?.retail_price || (peptide as any)?.avg_cost || 0;
                const partnerCost = retailPrice * priceMultiplier;

                const marginPerUnit = item.unit_price - partnerCost;
                if (marginPerUnit > 0) {
                    totalCommission += (marginPerUnit * item.quantity) * repCommissionRate;
                }
            }

            const commissionAmount = Math.max(0, totalCommission); // Ensure non-negative

            // 1. Create Order (attributed to the actual rep, not the admin)
            const { data: order, error: orderError } = await supabase
                .from('sales_orders')
                .insert({
                    org_id: profile.org_id,
                    client_id: input.client_id,
                    rep_id: repId,
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

            // Process commission records (direct + override for upline)
            const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: order.id });
            if (rpcError) console.error("Commission processing failed:", rpcError);

            // Auto-fulfill: deduct inventory + create movement (like contacts flow)
            let fulfilled = false;
            try {
                // Create movement record
                const { data: movement, error: movError } = await supabase
                    .from('movements')
                    .insert({
                        org_id: profile.org_id,
                        type: 'sale',
                        contact_id: input.client_id,
                        movement_date: new Date().toISOString().split('T')[0],
                        notes: `Sales Order #${order.id.slice(0, 8)}`,
                        created_by: repId || user.id,
                        payment_status: 'unpaid',
                        amount_paid: 0,
                    })
                    .select()
                    .single();

                if (movError) throw movError;

                // FIFO bottle allocation for each item
                for (const item of input.items) {
                    const { data: bottles, error: bError } = await supabase
                        .from('bottles')
                        .select('*, lots!inner(peptide_id)')
                        .eq('status', 'in_stock')
                        .eq('lots.peptide_id', item.peptide_id)
                        .order('created_at', { ascending: true })
                        .limit(item.quantity);

                    if (bError) throw bError;
                    if (!bottles || bottles.length < item.quantity) {
                        throw new Error(`Insufficient stock for peptide. Need ${item.quantity}, have ${bottles?.length || 0}`);
                    }

                    const bottleIds = bottles.map(b => b.id);

                    // Create movement items
                    const moveItems = bottleIds.map(bid => ({
                        movement_id: movement.id,
                        bottle_id: bid,
                        price_at_sale: item.unit_price,
                    }));
                    const { error: miError } = await supabase.from('movement_items').insert(moveItems);
                    if (miError) throw miError;

                    // Mark bottles as sold
                    const { error: buError } = await supabase
                        .from('bottles')
                        .update({ status: 'sold' })
                        .in('id', bottleIds);
                    if (buError) throw buError;
                }

                // Mark order as fulfilled
                await supabase
                    .from('sales_orders')
                    .update({ status: 'fulfilled' })
                    .eq('id', order.id);

                fulfilled = true;
            } catch (fulfillErr) {
                // If fulfillment fails (e.g. insufficient stock), order stays as submitted
                console.warn("Auto-fulfill skipped:", fulfillErr);
            }

            // Calculate COGS + profit (merchant fee = 0 since unpaid)
            await recalculateOrderProfit(order.id);

            return order;
        },
        onSuccess: (_, input) => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            toast({ title: 'Order created and inventory deducted' });
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

            // Check if we should trigger commission processing
            if (updates.status === 'fulfilled' || updates.payment_status === 'paid') {
                // We call the RPC. Ideally it handles idempotency.
                const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: id });
                if (rpcError) {
                    console.error("Commission processing failed:", rpcError);
                }
            }

            // Recalculate profit (handles merchant fee on payment, commission changes, etc.)
            if (updates.payment_status || updates.commission_amount !== undefined || updates.shipping_cost !== undefined) {
                await recalculateOrderProfit(id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
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

            // 5. Process commission records (idempotent — skips if already created)
            const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: orderId });
            if (rpcError) console.error("Commission processing on fulfill failed:", rpcError);

            // 6. Recalculate COGS + profit with current data
            await recalculateOrderProfit(orderId);
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

export function useDeleteSalesOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('sales_orders')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            toast({ title: 'Order deleted' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to delete order', description: error.message });
        },
    });
}

export function usePayWithCredit() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ orderId }: { orderId: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // We need the partner's profile ID, not just auth ID, if distinct.
            // But RPC takes User ID and checks profiles.id. Usually they match or linked.
            // Let's assume user.id maps to profile.user_id, but profile PK is uuid.
            // Wait, profiles table: id is PK. user_id is FK.
            // My RPC uses `where id = p_user_id`. Wait, is p_user_id the Profile ID or Auth ID?
            // `create_don_partner.ts`: `id: '2cd0fd2f-6ba2-48a6-8913-554c4cf9dd63', user_id: '...'`
            // The RPC says: `select ... from profiles where id = p_user_id`.
            // So it expects PROFILE ID.

            // I must fetch the profile ID first.
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (!profile) throw new Error('Profile not found');

            const { error } = await supabase.rpc('pay_order_with_credit', {
                p_order_id: orderId,
                p_user_id: profile.id
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] }); // Update balance
            toast({ title: 'Payment Successful', description: 'Order paid with store credit.' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Payment Failed', description: error.message });
        },
    });
}

export function useCreateShippingLabel() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (orderId: string) => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const res = await fetch('/api/shipping/create-label', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ orderId }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Shipping failed (${res.status})`);
            }

            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            toast({
                title: 'Shipping Label Created',
                description: `Tracking: ${data.tracking_number} via ${data.carrier}`,
            });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Shipping Failed', description: error.message });
        },
    });
}
