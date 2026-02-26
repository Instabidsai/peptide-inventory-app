import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PSIFI_API_BASE = 'https://api.psifi.app/api/v2';

/**
 * Authenticated checkout session creator — requires Supabase JWT.
 * Used by the admin/staff UI to initiate payment for an order.
 *
 * PsiFi API requirements (discovered Feb 2026):
 *   - items[].productId is REQUIRED — must reference a registered product
 *   - items[].name and items[].price are REQUIRED alongside productId
 *   - All prices are in DOLLARS (PsiFi converts to cents internally)
 *   - payment_method field must be omitted (defaults to banxa/card)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId } = req.body;
        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
        }

        // --- Authenticate the user via their Supabase JWT ---
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const psifiApiKey = process.env.PSIFI_API_KEY;

        if (!supabaseUrl || !supabaseServiceKey || !psifiApiKey) {
            console.error('Missing environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify the JWT and get the user
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // --- Fetch the order from Supabase ---
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select(`
                *,
                contacts (id, name, email),
                sales_order_items (
                    *,
                    peptides (id, name)
                )
            `)
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // --- Authorization: verify caller is associated with this order ---
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('org_id', order.org_id)
            .single();

        const isClient = await supabase
            .from('contacts')
            .select('id')
            .eq('linked_user_id', user.id)
            .eq('id', order.client_id)
            .single();

        const isStaff = callerRole?.role === 'admin' || callerRole?.role === 'super_admin' || callerRole?.role === 'sales_rep';
        if (!isStaff && !isClient.data) {
            return res.status(403).json({ error: 'Not authorized for this order' });
        }

        // Don't allow payment on already-paid or cancelled orders
        if (order.payment_status === 'paid') {
            return res.status(400).json({ error: 'This order has already been paid' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: 'This order has been cancelled' });
        }

        const orderTotal = Number(order.total_amount || 0);
        if (orderTotal <= 0) {
            return res.status(400).json({ error: 'Order total must be greater than zero' });
        }

        // 3% card processing surcharge
        const CARD_FEE_RATE = 0.03;
        const cardFee = Math.round(orderTotal * CARD_FEE_RATE * 100) / 100;
        const chargeTotal = Math.round((orderTotal + cardFee) * 100) / 100;

        // Clear any stale session
        if (order.psifi_session_id) {
            await supabase
                .from('sales_orders')
                .update({ psifi_session_id: null, psifi_status: null })
                .eq('id', orderId);
        }

        // --- Create ad-hoc PsiFi product for this order ---
        const shortId = orderId.slice(0, 8);
        const productName = `Order #${shortId}`;

        const productRes = await fetch(`${PSIFI_API_BASE}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': psifiApiKey,
            },
            body: JSON.stringify({
                name: productName,
                price: chargeTotal,
                currency: 'USD',
                type: 'service',
            }),
        });

        if (!productRes.ok) {
            const errBody = await productRes.text();
            console.error('PsiFi product creation failed:', productRes.status, errBody);
            return res.status(502).json({ error: 'Payment processor error', psifi_error: errBody });
        }

        const product = await productRes.json();

        // --- Build PsiFi checkout session ---
        const siteBase = process.env.PUBLIC_SITE_URL || '';
        const successUrl = `${siteBase}/#/checkout/success?orderId=${orderId}`;
        const cancelUrl = `${siteBase}/#/checkout/cancel?orderId=${orderId}`;
        const timestamp = Date.now();

        const psifiPayload = {
            mode: 'payment',
            total_amount: chargeTotal,
            external_id: `${orderId}-cs-${timestamp}`,
            success_url: successUrl,
            cancel_url: cancelUrl,
            items: [{
                productId: product.id,
                name: productName,
                quantity: 1,
                price: chargeTotal,
            }],
            metadata: {
                order_id: orderId,
                order_subtotal: orderTotal,
                card_fee: cardFee,
                card_fee_rate: '3%',
                client_name: order.contacts?.name || 'Unknown',
                client_email: order.contacts?.email || '',
                source: 'checkout',
            },
        };

        // --- Call PsiFi API ---
        const psifiResponse = await fetch(`${PSIFI_API_BASE}/checkout-sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': psifiApiKey,
                'Idempotency-Key': `checkout-${orderId}-${timestamp}`,
            },
            body: JSON.stringify(psifiPayload),
        });

        if (!psifiResponse.ok) {
            const errorBody = await psifiResponse.text();
            console.error('PsiFi API error:', psifiResponse.status, 'body:', errorBody);
            return res.status(502).json({
                error: 'Payment processor error',
                psifi_error: errorBody,
            });
        }

        const psifiData = await psifiResponse.json();

        // --- Store session ID on the order ---
        const { error: updateError } = await supabase
            .from('sales_orders')
            .update({
                psifi_session_id: psifiData.id || psifiData.session_id,
                psifi_status: 'pendingPayment',
            })
            .eq('id', orderId);

        if (updateError) {
            console.error('Failed to update order with session ID:', updateError);
        }

        // --- Return the checkout URL ---
        return res.status(200).json({
            checkout_url: psifiData.url,
            session_id: psifiData.id || psifiData.session_id,
        });

    } catch (error: any) {
        console.error('Checkout session creation failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
