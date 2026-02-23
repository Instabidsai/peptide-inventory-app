import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface CheckoutItem {
    peptide_id: string;
    name: string;
    quantity: number;
    unit_price: number;
}

interface CheckoutInput {
    items: CheckoutItem[];
    shipping_address?: string;
    notes?: string;
    client_id?: string | null;
    rep_id?: string | null;
    org_id: string;
    total_amount: number;
}

/**
 * @deprecated Use useValidatedCheckout() instead — it calculates prices server-side.
 * This hook sends client-supplied prices which can be manipulated.
 * Kept only for admin/rep flows in NewOrder.tsx where custom pricing is intentional.
 */
export function useCheckout() {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: CheckoutInput) => {
            if (!user?.id) throw new Error('Not authenticated');
            if (input.items.length === 0) throw new Error('Cart is empty');

            // 1. Create the order in Supabase first
            const { data: order, error: orderError } = await supabase
                .from('sales_orders')
                .insert({
                    org_id: input.org_id,
                    client_id: input.client_id || null,
                    rep_id: input.rep_id || null,
                    status: 'submitted',
                    payment_status: 'unpaid',
                    psifi_status: 'none',
                    total_amount: input.total_amount,
                    commission_amount: 0,
                    shipping_address: input.shipping_address || null,
                    notes: input.notes || null,
                })
                .select()
                .single();

            if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

            // 2. Create order items
            const orderItems = input.items.map(item => ({
                sales_order_id: order.id,
                peptide_id: item.peptide_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            }));

            const { error: itemsError } = await supabase
                .from('sales_order_items')
                .insert(orderItems);

            if (itemsError) {
                // Clean up the order if items fail
                await supabase.from('sales_orders').delete().eq('id', order.id);
                throw new Error(`Failed to create order items: ${itemsError.message}`);
            }

            // 3. Get the user's session token for auth
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('Session expired. Please log in again.');
            }

            // 4. Call our serverless function to create the PsiFi checkout session
            const response = await fetch('/api/checkout/create-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ orderId: order.id }),
            });

            if (!response.ok) {
                // Clean up the orphaned order since payment session creation failed
                await supabase.from('sales_orders').delete().eq('id', order.id);
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Checkout failed (${response.status})`);
            }

            const { checkout_url } = await response.json();

            if (!checkout_url) {
                throw new Error('No checkout URL received from payment processor');
            }

            // 5. Validate and redirect to checkout
            try {
                const parsed = new URL(checkout_url);
                if (parsed.protocol !== 'https:') throw new Error('Unsafe checkout URL');
            } catch {
                throw new Error('Invalid checkout URL received');
            }
            window.location.href = checkout_url;

            // Return the order for the mutation's onSuccess (won't fire due to redirect)
            return order;
        },
        onError: (error: Error) => {
            toast({
                variant: 'destructive',
                title: 'Checkout failed',
                description: error.message,
            });
        },
        // Note: onSuccess won't fire because we redirect before it can
    });
}

/**
 * Server-side validated checkout flow:
 * 1. Calls create_validated_order RPC (prices calculated server-side)
 * 2. Calls our Vercel serverless function to create a PsiFi checkout session
 * 3. Redirects the user to PsiFi's hosted payment page
 */
export function useValidatedCheckout() {
    const { user } = useAuth();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (input: {
            items: { peptide_id: string; quantity: number }[];
            shipping_address?: string;
            notes?: string;
            delivery_method?: string;
        }) => {
            if (!user?.id) throw new Error('Not authenticated');
            if (input.items.length === 0) throw new Error('Cart is empty');

            // 1. Create order with server-validated prices
            const { data, error } = await supabase.rpc('create_validated_order', {
                p_items: input.items.map(i => ({ peptide_id: i.peptide_id, quantity: i.quantity })),
                p_shipping_address: input.shipping_address || null,
                p_notes: input.notes || null,
                p_payment_method: 'card',
                p_delivery_method: input.delivery_method || 'ship',
            });

            if (error) throw new Error(`Order RPC failed: ${error.message}`);

            const result = data as { success: boolean; error?: string; order_id?: string; total_amount?: number };
            if (!result.success) {
                throw new Error(result.error || 'Order validation failed');
            }

            const orderId = result.order_id!;

            // 2. Mark order as submitted (RPC creates it as 'draft')
            await supabase
                .from('sales_orders')
                .update({ status: 'submitted', psifi_status: 'none' })
                .eq('id', orderId);

            // 3. Get the user's session token for auth
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('Session expired. Please log in again.');
            }

            // 4. Call our serverless function to create the PsiFi checkout session
            const response = await fetch('/api/checkout/create-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ orderId }),
            });

            if (!response.ok) {
                await supabase.from('sales_orders').delete().eq('id', orderId);
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Checkout failed (${response.status})`);
            }

            const { checkout_url } = await response.json();

            if (!checkout_url) {
                throw new Error('No checkout URL received from payment processor');
            }

            // 5. Validate and redirect to checkout
            try {
                const parsed = new URL(checkout_url);
                if (parsed.protocol !== 'https:') throw new Error('Unsafe checkout URL');
            } catch {
                throw new Error('Invalid checkout URL received');
            }
            window.location.href = checkout_url;

            return { id: orderId, total_amount: result.total_amount! };
        },
        onError: (error: Error) => {
            toast({
                variant: 'destructive',
                title: 'Checkout failed',
                description: error.message,
            });
        },
    });
}

/**
 * Hook to check the payment status of an order (used on success/cancel pages)
 * Stops polling after payment confirmed, order cancelled, or ~2 minutes (40 polls).
 */
export function useOrderPaymentStatus(orderId: string | null) {
    const pollCountRef = useRef(0);
    return useQuery({
        queryKey: ['order_payment_status', orderId],
        queryFn: async () => {
            if (!orderId) return null;
            pollCountRef.current++;
            const { data, error } = await supabase
                .from('sales_orders')
                .select('id, status, payment_status, psifi_status, total_amount, created_at')
                .eq('id', orderId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!orderId,
        refetchInterval: (query) => {
            const d = query?.state?.data;
            if (d?.payment_status === 'paid' || d?.status === 'cancelled') return false;
            if (pollCountRef.current >= 40) return false;
            return 3000;
        },
    });
}
