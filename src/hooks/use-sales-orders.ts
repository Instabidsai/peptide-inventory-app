import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { recalculateOrderProfit } from '@/lib/order-profit';
import { autoGenerateProtocol } from '@/lib/auto-protocol';
import { parseVialSize } from '@/lib/supply-calculations';
import { DEFAULT_PAGE_SIZE, type PaginationState } from '@/hooks/use-pagination';
import { logger } from '@/lib/logger';
import { invokeEdgeFunction } from '@/lib/edge-functions';

export type SalesOrderStatus = 'draft' | 'submitted' | 'fulfilled' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'partial' | 'pending_verification' | 'refunded' | 'commission_offset';

export interface OrderPayment {
    id: string;
    org_id: string;
    sales_order_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference_id: string | null;
    notes: string | null;
    recorded_by: string | null;
    created_at: string;
    profiles?: { full_name: string | null } | null;
}

export interface ShippingRate {
    object_id: string;
    provider: string;
    servicelevel_name: string;
    servicelevel_token: string;
    amount: string;
    currency: string;
    estimated_days: number | null;
    duration_terms: string;
}

export interface GetRatesResponse {
    shipment_id: string;
    rates: ShippingRate[];
    has_existing_label: boolean;
}

export interface BuyLabelResponse {
    tracking_number: string;
    carrier: string;
    label_url: string;
    shipping_cost: number;
}

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
    // Delivery method
    delivery_method?: string;
    // WooCommerce + profit fields
    order_source?: string;
    woo_order_id?: number | null;
    cogs_amount?: number | null;
    profit_amount?: number | null;
    merchant_fee?: number | null;
    // Supplier / dropship fields
    is_supplier_order?: boolean;
    source_org_id?: string | null;
    fulfillment_type?: string;
    contacts?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
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
    payment_method?: string;
    delivery_method?: string;
    commission_amount?: number;
    payment_status?: PaymentStatus;
    auto_fulfill?: boolean; // default false — set true only for admin inline fulfillment
    manual_commissions?: {
        profile_id: string;
        amount: number;
        commission_rate: number;
        type: 'direct' | 'second_tier_override' | 'third_tier_override';
    }[];
}

export function useSalesOrders(status?: SalesOrderStatus, pagination?: PaginationState) {
    const { profile } = useAuth();
    const page = pagination?.page ?? 0;
    const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;
    const isSalesRep = profile?.role === 'sales_rep';
    return useQuery({
        queryKey: ['sales_orders', status, profile?.org_id, page, pageSize, isSalesRep ? profile?.id : null],
        queryFn: async () => {
            let query = supabase
                .from('sales_orders')
                .select(`
          *,
          contacts!client_id (id, name, email, phone),
          profiles (id, full_name),
          sales_order_items (
            *,
            peptides (id, name)
          )
        `)
                .eq('org_id', profile!.org_id!)
                .order('created_at', { ascending: false })
                .range(page * pageSize, page * pageSize + pageSize - 1);

            if (status) {
                query = query.eq('status', status);
            }

            // sales_rep users should only see their own orders (defense-in-depth)
            if (isSalesRep && profile?.id) {
                query = query.eq('rep_id', profile.id);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as SalesOrder[];
        },
        enabled: !!profile?.org_id,
        staleTime: 30_000,
    });
}

// Fetch a SINGLE sales order by ID — used on the detail page
export function useSalesOrder(orderId?: string) {
    const { profile } = useAuth();
    return useQuery({
        queryKey: ['sales_order', orderId, profile?.org_id],
        queryFn: async () => {
            let query = supabase
                .from('sales_orders')
                .select(`
          *,
          contacts!client_id (id, name, email, phone),
          profiles (id, full_name),
          sales_order_items (
            *,
            peptides (id, name)
          )
        `)
                .eq('id', orderId!);

            // org_id defense-in-depth (RLS also enforces this)
            if (profile?.org_id) {
                query = query.eq('org_id', profile.org_id);
            }

            const { data, error } = await query.maybeSingle();

            if (error) throw error;
            return data as SalesOrder | null;
        },
        enabled: !!orderId && !!profile?.org_id,
        staleTime: 30_000,
        retry: 1,
    });
}

export function useMySalesOrders() {
    const { profile, user } = useAuth();
    return useQuery({
        queryKey: ['my_sales_orders', profile?.org_id, user?.id],
        queryFn: async () => {
            if (!profile?.id || !user?.id) throw new Error('Profile not found');

            // Get downline partner IDs so we include their orders too
            const { data: downline } = await supabase.rpc('get_partner_downline', { root_id: user.id });
            const downlineIds = (downline || []).map((d: { id: string }) => d.id);
            const networkRepIds = [profile.id, ...downlineIds];

            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
          *,
          contacts!client_id (id, name, email, phone),
          profiles!rep_id (id, full_name),
          sales_order_items (
            *,
            peptides (id, name)
          )
        `)
                .eq('org_id', profile!.org_id!)
                .in('rep_id', networkRepIds)
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;
            return data as SalesOrder[];
        },
        enabled: !!profile?.org_id && !!user?.id,
        staleTime: 30_000,
    });
}

export function useCreateSalesOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile: authProfile } = useAuth();

    return useMutation({
        mutationFn: async (input: CreateSalesOrderInput) => {
            if (!authProfile?.org_id) throw new Error('No organization found');

            // Fetch the real actor's business settings (commission, pricing) — NOT impersonated
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data: rawProfile } = await supabase
                .from('profiles')
                .select('id, commission_rate, price_multiplier, pricing_mode, cost_plus_markup')
                .eq('user_id', user.id)
                .maybeSingle();

            if (!rawProfile) throw new Error('Profile not found');
            const profile = { ...rawProfile, org_id: authProfile.org_id } as { id: string; org_id: string; commission_rate: number | null; price_multiplier: number | null; pricing_mode: string | null; cost_plus_markup: number | null };

            // Determine the actual rep for this order:
            // If the client has an assigned_rep_id, attribute the order to that rep
            let repId = profile.id;
            let repCommissionRate = 0;
            let priceMultiplier = 1.0;

            let repPricingMode = 'percentage';
            let repCostPlusMarkup = 0;

            if (input.client_id) {
                const { data: contact } = await supabase
                    .from('contacts')
                    .select('assigned_rep_id')
                    .eq('id', input.client_id)
                    .maybeSingle();

                if (contact?.assigned_rep_id) {
                    repId = contact.assigned_rep_id;
                    // Fetch the actual rep's commission settings
                    const { data: repProfile } = await supabase
                        .from('profiles')
                        .select('commission_rate, price_multiplier, pricing_mode, cost_plus_markup')
                        .eq('id', contact.assigned_rep_id)
                        .maybeSingle();

                    if (repProfile) {
                        const rate = repProfile.commission_rate;
                        repCommissionRate = (rate != null) ? Number(rate) : 0.10;
                        const mult = repProfile.price_multiplier;
                        priceMultiplier = (mult != null && Number(mult) > 0) ? Number(mult) : 1.0;
                        repPricingMode = repProfile.pricing_mode || 'percentage';
                        repCostPlusMarkup = Number(repProfile.cost_plus_markup) || 0;
                    }
                } else {
                    // No assigned rep — use logged-in user's settings
                    const rate = profile.commission_rate;
                    repCommissionRate = (rate != null) ? Number(rate) : 0.10;
                    const mult = profile.price_multiplier;
                    priceMultiplier = (mult != null && Number(mult) > 0) ? Number(mult) : 1.0;
                    repPricingMode = profile.pricing_mode || 'percentage';
                    repCostPlusMarkup = Number(profile.cost_plus_markup) || 0;
                }
            } else {
                // No client selected — use logged-in user's settings
                const rate = profile.commission_rate;
                repCommissionRate = (rate != null) ? Number(rate) : 0.10;
                const mult = profile.price_multiplier;
                priceMultiplier = (mult != null && Number(mult) > 0) ? Number(mult) : 1.0;
                repPricingMode = profile.pricing_mode || 'percentage';
                repCostPlusMarkup = Number(profile.cost_plus_markup) || 0;
            }

            // Calculate totals — commission is revenue-based (rate × sale amount)
            // The actual commission records (with paid/unpaid split) are created
            // by the process_sale_commission RPC after insert.
            // This is just a preview for the order's commission_amount field.
            let totalAmount = 0;

            for (const item of input.items) {
                totalAmount += Math.round(item.quantity * item.unit_price * 100) / 100;
            }

            // Use frontend-calculated commission when explicitly provided (per-tier pricing),
            // otherwise fall back to flat rate calculation from rep profile
            const commissionAmount = (input.commission_amount != null)
                ? Math.max(0, Math.round(input.commission_amount * 100) / 100)
                : Math.max(0, Math.round(totalAmount * repCommissionRate * 100) / 100);

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
                    payment_method: input.payment_method || null,
                    payment_status: input.payment_status || 'unpaid',
                    delivery_method: input.delivery_method || 'ship',
                })
                .select()
                .maybeSingle();

            if (orderError) throw orderError;
            if (!order) throw new Error('Failed to create order');

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

            // Process commission records — skip entirely for partner/commission_offset orders.
            // ALWAYS use the RPC (SECURITY DEFINER) — client-side inserts are silently
            // dropped by RLS, which causes the upline chain to never get created.
            const isPartnerOffset = input.payment_status === 'commission_offset';
            if (!isPartnerOffset && repId) {
                const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: order.id });
                if (rpcError) {
                    logger.error("Commission processing failed:", rpcError);
                    toast({ title: "Warning", description: "Order created but commission processing failed. Admin will need to reconcile.", variant: "destructive" });
                } else {
                    supabase.functions.invoke('notify-commission', { body: { sale_id: order.id } }).catch(() => {});
                }
                // Sync order's commission_amount from whatever records the RPC actually created
                const { data: commRecords } = await supabase
                    .from('commissions')
                    .select('amount, status')
                    .eq('sale_id', order.id);
                if (commRecords && commRecords.length > 0) {
                    const actualTotal = commRecords
                        .filter(r => r.status !== 'void')
                        .reduce((s, r) => s + (r.amount || 0), 0);
                    if (Math.abs(actualTotal - commissionAmount) > 0.01) {
                        await supabase
                            .from('sales_orders')
                            .update({ commission_amount: Math.round(actualTotal * 100) / 100 })
                            .eq('id', order.id);
                    }
                }
            }

            // Auto-fulfill: deduct inventory + create movement (only when explicitly requested)
            let fulfilled = false;
            if (input.auto_fulfill) try {
                // Fetch peptide names upfront for protocol generation
                const peptideIds = [...new Set(input.items.map(i => i.peptide_id))];
                const { data: peptideLookup } = await supabase
                    .from('peptides')
                    .select('id, name')
                    .in('id', peptideIds);
                const peptideNameMap = new Map((peptideLookup || []).map(p => [p.id, p.name]));

                // Create movement record (created_by FK targets profiles.id, not auth user id)
                const { data: movement, error: movError } = await supabase
                    .from('movements')
                    .insert({
                        org_id: profile.org_id,
                        type: 'sale',
                        contact_id: input.client_id,
                        movement_date: format(new Date(), 'yyyy-MM-dd'),
                        notes: `[SO:${order.id}] Sales Order #${order.id.slice(0, 8)}`,
                        created_by: repId || profile.id,
                        payment_status: input.payment_status || 'unpaid',
                        payment_method: input.payment_method || null,
                        amount_paid: 0,
                    })
                    .select()
                    .maybeSingle();

                if (movError) throw movError;
                if (!movement) throw new Error('Failed to create fulfillment movement');

                // FIFO bottle allocation for each item
                const allocatedBottles: Array<{ peptideId: string; peptideName: string; lotNumber: string | null }> = [];
                for (const item of input.items) {
                    const { data: bottles, error: bError } = await supabase
                        .from('bottles')
                        .select('*, lots!inner(peptide_id, lot_number)')
                        .eq('status', 'in_stock')
                        .eq('lots.peptide_id', item.peptide_id)
                        .order('created_at', { ascending: true })
                        .limit(item.quantity);

                    if (bError) throw bError;
                    if (!bottles || bottles.length < item.quantity) {
                        throw new Error(`Insufficient stock for peptide. Need ${item.quantity}, have ${bottles?.length || 0}`);
                    }

                    const bottleIds = bottles.map(b => b.id);

                    // Track allocations for client_inventory
                    for (const b of bottles) {
                        allocatedBottles.push({
                            peptideId: item.peptide_id,
                            peptideName: peptideNameMap.get(item.peptide_id) || '',
                            lotNumber: b.lots?.lot_number || null,
                        });
                    }

                    // Create movement items
                    const moveItems = bottleIds.map(bid => ({
                        movement_id: movement.id,
                        bottle_id: bid,
                        price_at_sale: Math.round(item.unit_price * 100) / 100,
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

                // Auto-generate protocol + client_inventory (same as useFulfillOrder)
                if (input.client_id && allocatedBottles.length > 0) {
                    try {
                        const uniquePeptides = [...new Map(
                            allocatedBottles.map(b => [b.peptideId, { peptideId: b.peptideId, peptideName: b.peptideName }])
                        ).values()];

                        const { protocolItemMap } = await autoGenerateProtocol({
                            contactId: input.client_id,
                            orgId: profile.org_id,
                            items: uniquePeptides,
                        });

                        const inventoryEntries = allocatedBottles.map(b => {
                            const vialSizeMg = parseVialSize(b.peptideName) || 5;
                            return {
                                contact_id: input.client_id,
                                movement_id: movement.id,
                                peptide_id: b.peptideId,
                                batch_number: b.lotNumber,
                                vial_size_mg: vialSizeMg,
                                water_added_ml: null,
                                current_quantity_mg: vialSizeMg,
                                initial_quantity_mg: vialSizeMg,
                                concentration_mg_ml: null,
                                status: 'active',
                                protocol_item_id: protocolItemMap.get(b.peptideId) || null,
                            };
                        });

                        const { error: invError } = await supabase
                            .from('client_inventory')
                            .insert(inventoryEntries);

                        if (invError) {
                            logger.error('Failed to populate client_inventory:', invError);
                        }
                    } catch (autoErr) {
                        logger.error('Auto-protocol generation failed (non-blocking):', autoErr);
                    }
                }

                fulfilled = true;
            } catch (fulfillErr) {
                // If fulfillment fails (e.g. insufficient stock), order stays as submitted
                logger.warn('Auto-fulfillment failed:', fulfillErr);
                toast({
                    title: "Order created — fulfillment pending",
                    description: (fulfillErr as any)?.message || "Insufficient stock. Order saved as 'submitted' for manual fulfillment.",
                    variant: "destructive",
                });
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
            queryClient.invalidateQueries({ queryKey: ['bottles', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['commission_stats'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            queryClient.invalidateQueries({ queryKey: ['peptides'] });
            queryClient.invalidateQueries({ queryKey: ['fulfillment_stock'] });
            queryClient.invalidateQueries({ queryKey: ['partner_stock_counts'] });
            queryClient.invalidateQueries({ queryKey: ['restock'] });
            toast({ title: input.auto_fulfill ? 'Order created and inventory deducted' : 'Order created' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to create order', description: error.message });
        },
    });
}

/**
 * Server-side validated order creation.
 * Sends ONLY peptide_id + quantity to the DB — prices are calculated
 * server-side by the create_validated_order SECURITY DEFINER RPC.
 * Use this for ALL client/partner-facing order creation.
 */
export interface ValidatedOrderInput {
    items: { peptide_id: string; quantity: number }[];
    shipping_address?: string;
    notes?: string;
    payment_method?: string;
    delivery_method?: string;
    contact_id?: string;
}

export function useCreateValidatedOrder() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (input: ValidatedOrderInput) => {
            const { data, error } = await supabase.rpc('create_validated_order', {
                p_items: input.items.map(i => ({ peptide_id: i.peptide_id, quantity: i.quantity })),
                p_shipping_address: input.shipping_address || null,
                p_notes: input.notes || null,
                p_delivery_method: input.delivery_method || 'ship',
                ...(input.contact_id ? { p_contact_id: input.contact_id } : {}),
            });

            if (error) throw new Error(`Order RPC failed: ${error.message}`);

            const result = data as { success: boolean; error?: string; order_id?: string; total?: number; total_amount?: number };
            if (!result.success) {
                throw new Error(result.error || 'Order validation failed');
            }

            return { id: result.order_id!, total_amount: result.total ?? result.total_amount ?? 0 };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['commission_stats'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            toast({ title: 'Order created' });
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
            // Use SECURITY DEFINER RPC to bypass RLS — permission checked inside the function.
            // This eliminates PostgREST schema-cache timing issues with RLS policy changes.
            const { data: result, error } = await supabase.rpc('update_sales_order', {
                p_order_id: id,
                p_updates: updates,
            });

            if (error) throw error;
            if (!result?.updated) throw new Error('Order not found or you lack permission to update it');

            // Check if we should trigger commission processing
            // Skip for zero-commission orders (e.g. 2x / internal partner pricing)
            if (updates.status === 'fulfilled' || updates.payment_status === 'paid') {
                const { data: orderCheck } = await supabase
                    .from('sales_orders')
                    .select('commission_amount')
                    .eq('id', id)
                    .maybeSingle();

                if (orderCheck && (orderCheck.commission_amount ?? 0) > 0) {
                    const { error: rpcError } = await supabase.rpc('process_sale_commission', { p_sale_id: id });
                    if (rpcError) {
                        logger.error("Commission processing failed:", rpcError);
                        toast({ title: "Warning", description: "Order updated but commission processing failed. Admin will need to reconcile.", variant: "destructive" });
                    } else {
                        // Notify partners via SMS about their commission
                        supabase.functions.invoke('notify-commission', { body: { sale_id: id } }).catch(() => {});
                    }
                }
            }

            // Recalculate profit on EVERY update (handles merchant fee, commission changes,
            // status transitions, shipping cost, and any field that affects the profit formula)
            await recalculateOrderProfit(id);
        },
        onSuccess: async (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['sales_order'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['commission_stats'] });
            toast({ title: 'Order updated' });

            // If marked as delivered, notify customer
            if (variables.shipping_status === 'delivered') {
                try {
                    const { data: orderData } = await supabase
                        .from('sales_orders')
                        .select('client_id, contacts!client_id(linked_user_id)')
                        .eq('id', variables.id)
                        .maybeSingle();

                    type OrderWithContact = { client_id: string; contacts: { linked_user_id: string | null } };
                    const clientUserId = (orderData as unknown as OrderWithContact | null)?.contacts?.linked_user_id;
                    if (clientUserId) {
                        await supabase.from('notifications').insert({
                            user_id: clientUserId,
                            title: 'Your order has been delivered!',
                            message: 'Your peptide order has been delivered. Check your mailbox!',
                            type: 'success',
                            is_read: false,
                        });
                    }
                } catch (notifErr) {
                    logger.error('Failed to create delivery notification:', notifErr);
                }
            }
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
            // Call edge function which uses service role key (bypasses RLS)
            // Uses invokeEdgeFunction for automatic token refresh on expiry
            const { data, error } = await invokeEdgeFunction('fulfill-order', { orderId });
            if (error) throw new Error(error.message || 'Fulfillment failed');
            if (data && typeof data === 'object' && 'error' in data) throw new Error((data as any).error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            queryClient.invalidateQueries({ queryKey: ['bottles', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            queryClient.invalidateQueries({ queryKey: ['client-inventory'] });
            queryClient.invalidateQueries({ queryKey: ['peptides'] });
            queryClient.invalidateQueries({ queryKey: ['fulfillment_stock'] });
            queryClient.invalidateQueries({ queryKey: ['partner_stock_counts'] });
            queryClient.invalidateQueries({ queryKey: ['restock'] });
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
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async (id: string) => {
            if (!profile?.org_id) throw new Error('No organization found');

            // ── 1. Find the fulfillment movement linked to this order ──
            const { data: movements } = await supabase
                .from('movements')
                .select('id')
                .like('notes', `%[SO:${id}]%`);

            const movementIds = (movements || []).map(m => m.id);

            // ── 2. If there was a fulfillment, reverse inventory changes ──
            if (movementIds.length > 0) {
                // 2a. Find bottles that were sold via movement_items
                const { data: moveItems } = await supabase
                    .from('movement_items')
                    .select('bottle_id')
                    .in('movement_id', movementIds);

                const bottleIds = (moveItems || []).map(mi => mi.bottle_id).filter(Boolean);

                // 2b. Revert bottle status back to in_stock
                if (bottleIds.length > 0) {
                    const { error: bottleErr } = await supabase
                        .from('bottles')
                        .update({ status: 'in_stock' })
                        .in('id', bottleIds);
                    if (bottleErr) logger.error('Revert bottles failed:', bottleErr);
                }

                // 2c. Delete client_inventory entries linked to these movements
                for (const mid of movementIds) {
                    await supabase
                        .from('client_inventory')
                        .delete()
                        .eq('movement_id', mid);
                }

                // 2d. Delete movement_items
                for (const mid of movementIds) {
                    await supabase
                        .from('movement_items')
                        .delete()
                        .eq('movement_id', mid);
                }

                // 2e. Delete the movements themselves
                await supabase
                    .from('movements')
                    .delete()
                    .in('id', movementIds);
            }

            // ── 3. Delete commissions tied to this sale ──
            await supabase
                .from('commissions')
                .delete()
                .eq('sale_id', id);

            // ── 4. Delete sales_order_items ──
            await supabase
                .from('sales_order_items')
                .delete()
                .eq('sales_order_id', id);

            // ── 5. Finally delete the sales order itself ──
            const { error } = await supabase
                .from('sales_orders')
                .delete()
                .eq('id', id)
                .eq('org_id', profile.org_id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            queryClient.invalidateQueries({ queryKey: ['bottles', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            queryClient.invalidateQueries({ queryKey: ['client-inventory'] });
            queryClient.invalidateQueries({ queryKey: ['contact_order_stats'] });
            queryClient.invalidateQueries({ queryKey: ['peptides'] });
            queryClient.invalidateQueries({ queryKey: ['fulfillment_stock'] });
            queryClient.invalidateQueries({ queryKey: ['partner_stock_counts'] });
            queryClient.invalidateQueries({ queryKey: ['restock'] });
            toast({ title: 'Order deleted', description: 'All related records have been removed.' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to delete order', description: error.message });
        },
    });
}

export function useBulkDeleteSalesOrders() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async (ids: string[]) => {
            if (!profile?.org_id) throw new Error('No organization found');
            let deleted = 0;
            const errors: string[] = [];

            for (const id of ids) {
                try {
                    // 1. Find fulfillment movements
                    const { data: movements } = await supabase
                        .from('movements')
                        .select('id')
                        .like('notes', `%[SO:${id}]%`);
                    const movementIds = (movements || []).map(m => m.id);

                    // 2. Reverse inventory
                    if (movementIds.length > 0) {
                        const { data: moveItems } = await supabase
                            .from('movement_items')
                            .select('bottle_id')
                            .in('movement_id', movementIds);
                        const bottleIds = (moveItems || []).map(mi => mi.bottle_id).filter(Boolean);
                        if (bottleIds.length > 0) {
                            await supabase.from('bottles').update({ status: 'in_stock' }).in('id', bottleIds);
                        }
                        for (const mid of movementIds) {
                            await supabase.from('client_inventory').delete().eq('movement_id', mid);
                            await supabase.from('movement_items').delete().eq('movement_id', mid);
                        }
                        await supabase.from('movements').delete().in('id', movementIds);
                    }

                    // 3. Delete commissions, order items, then order
                    await supabase.from('commissions').delete().eq('sale_id', id);
                    await supabase.from('sales_order_items').delete().eq('sales_order_id', id);
                    const { error } = await supabase
                        .from('sales_orders')
                        .delete()
                        .eq('id', id)
                        .eq('org_id', profile.org_id);
                    if (error) throw error;
                    deleted++;
                } catch (err) {
                    errors.push(id.slice(0, 8));
                }
            }

            return { deleted, errors };
        },
        onSuccess: ({ deleted, errors }) => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['bottles'] });
            queryClient.invalidateQueries({ queryKey: ['bottles', 'stats'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            queryClient.invalidateQueries({ queryKey: ['protocols'] });
            queryClient.invalidateQueries({ queryKey: ['client-inventory'] });
            queryClient.invalidateQueries({ queryKey: ['contact_order_stats'] });
            queryClient.invalidateQueries({ queryKey: ['peptides'] });
            queryClient.invalidateQueries({ queryKey: ['fulfillment_stock'] });
            queryClient.invalidateQueries({ queryKey: ['partner_stock_counts'] });
            queryClient.invalidateQueries({ queryKey: ['restock'] });
            if (errors.length > 0) {
                toast({ variant: 'destructive', title: `Deleted ${deleted}, failed ${errors.length}`, description: `Failed IDs: ${errors.join(', ')}` });
            } else {
                toast({ title: `${deleted} order${deleted !== 1 ? 's' : ''} deleted`, description: 'All related records have been removed.' });
            }
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Bulk delete failed', description: error.message });
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
                .maybeSingle();

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
            if (!session?.access_token) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/shipping/create-label', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ orderId }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Shipping label creation failed (${response.status})`);
            }

            return response.json();
        },
        onSuccess: async (data, orderId) => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            toast({
                title: 'Shipping Label Created',
                description: `Tracking: ${data.tracking_number} via ${data.carrier}`,
            });

            // Create in-app notification for customer
            try {
                // Look up the order to get client_id, then contact to get linked_user_id
                const { data: orderData } = await supabase
                    .from('sales_orders')
                    .select('client_id, contacts!client_id(linked_user_id, name)')
                    .eq('id', orderId)
                    .maybeSingle();

                type OrderWithContactName = { client_id: string; contacts: { linked_user_id: string | null; name: string } };
                const clientUserId = (orderData as unknown as OrderWithContactName | null)?.contacts?.linked_user_id;
                if (clientUserId) {
                    await supabase.from('notifications').insert({
                        user_id: clientUserId,
                        title: 'Your order has shipped!',
                        message: `Your order is on the way! Tracking: ${data.tracking_number} via ${data.carrier}.`,
                        type: 'success',
                        is_read: false,
                    });
                }
            } catch (notifErr) {
                logger.error('Failed to create shipping notification:', notifErr);
                // Non-blocking — don't fail the label creation
            }
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Shipping Failed', description: error.message });
        },
    });
}

export function useGetShippingRates() {
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (orderId: string): Promise<GetRatesResponse> => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/shipping/get-rates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ orderId }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to get rates (${response.status})`);
            }

            return response.json();
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to get rates', description: error.message });
        },
    });
}

// ── Order Payments (partial payment tracking) ────────────────────────

export function useOrderPayments(orderId?: string) {
    return useQuery({
        queryKey: ['order-payments', orderId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('order_payments')
                .select('*, profiles:recorded_by(full_name)')
                .eq('sales_order_id', orderId!)
                .order('payment_date', { ascending: false });
            if (error) throw error;
            return data as OrderPayment[];
        },
        enabled: !!orderId,
        staleTime: 15_000,
    });
}

export function useRecordPayment() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async ({
            orderId,
            amount,
            paymentMethod,
            notes,
        }: {
            orderId: string;
            amount: number;
            paymentMethod: string;
            notes?: string;
        }) => {
            if (!profile?.org_id) throw new Error('No organization found');
            if (amount <= 0) throw new Error('Amount must be greater than 0');

            const { data, error } = await supabase
                .from('order_payments')
                .insert({
                    org_id: profile.org_id,
                    sales_order_id: orderId,
                    amount,
                    payment_method: paymentMethod,
                    payment_date: new Date().toISOString(),
                    recorded_by: profile.id,
                    notes: notes || null,
                })
                .select()
                .single();

            if (error) throw error;

            // Recalculate profit (merchant fee changes with payment method)
            await recalculateOrderProfit(orderId);

            return data;
        },
        onSuccess: (_, { orderId }) => {
            queryClient.invalidateQueries({ queryKey: ['order-payments', orderId] });
            queryClient.invalidateQueries({ queryKey: ['sales_order', orderId] });
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['commission_stats'] });
            queryClient.invalidateQueries({ queryKey: ['order_commissions', orderId] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            toast({ title: 'Payment recorded', description: 'Order and commissions updated.' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Payment failed', description: error.message });
        },
    });
}

export function useBuyShippingLabel() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ orderId, rateId }: { orderId: string; rateId: string }): Promise<BuyLabelResponse> => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('Session expired. Please log in again.');
            }

            const response = await fetch('/api/shipping/buy-label', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ orderId, rateId }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to buy label (${response.status})`);
            }

            return response.json();
        },
        onSuccess: async (data, { orderId }) => {
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            queryClient.invalidateQueries({ queryKey: ['my_sales_orders'] });
            toast({
                title: 'Shipping Label Purchased',
                description: `Tracking: ${data.tracking_number} via ${data.carrier} — $${data.shipping_cost.toFixed(2)}`,
            });

            // Create in-app notification for customer
            try {
                const { data: orderData } = await supabase
                    .from('sales_orders')
                    .select('client_id, contacts!client_id(linked_user_id, name)')
                    .eq('id', orderId)
                    .maybeSingle();

                type OrderWithContactName2 = { client_id: string; contacts: { linked_user_id: string | null; name: string } };
                const clientUserId = (orderData as unknown as OrderWithContactName2 | null)?.contacts?.linked_user_id;
                if (clientUserId) {
                    await supabase.from('notifications').insert({
                        user_id: clientUserId,
                        title: 'Your order has shipped!',
                        message: `Your order is on the way! Tracking: ${data.tracking_number} via ${data.carrier}.`,
                        type: 'success',
                        is_read: false,
                    });
                }
            } catch (notifErr) {
                logger.error('Failed to create shipping notification:', notifErr);
            }
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Label Purchase Failed', description: error.message });
        },
    });
}
