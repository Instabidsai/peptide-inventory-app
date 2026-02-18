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
 * Hook that handles the full checkout flow:
 * 1. Creates a sales_order in Supabase with status 'submitted'
 * 2. Calls our Vercel serverless function to create a PsiFi checkout session
 * 3. Redirects the user to PsiFi's hosted payment page
 *
 * TODO: Auto-generate Bottle records when a Lot is created/received.
 * When lot quantity_received is set, create one Bottle record per unit with
 * status 'in_stock'. This logic lives in use-orders.ts or the fulfillment
 * flow (not in this checkout hook). See use-orders.ts for implementation.
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
 * Hook to check the payment status of an order (used on success/cancel pages)
 */
export function useOrderPaymentStatus(orderId: string | null) {
    return useQuery({
        queryKey: ['order_payment_status', orderId],
        queryFn: async () => {
            if (!orderId) return null;
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
            // Stop polling once payment is confirmed
            const d = query?.state?.data;
            if (d?.payment_status === 'paid' || d?.status === 'cancelled') return false;
            return 3000;
        },
    });
}
