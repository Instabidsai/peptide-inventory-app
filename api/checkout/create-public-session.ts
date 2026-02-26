import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PSIFI_API_BASE = 'https://api.psifi.app/api/v2';

/**
 * Public checkout session creator — no JWT required.
 * Auth is implicit: order UUIDs are 128-bit unguessable tokens.
 * This is the same pattern Stripe/Square/PayPal use for invoice links.
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

        // Validate UUID format to prevent abuse
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID format' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const psifiApiKey = process.env.PSIFI_API_KEY;

        if (!supabaseUrl || !supabaseServiceKey || !psifiApiKey) {
            console.error('Missing environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch the order
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

        // Don't allow payment on already-paid or cancelled orders
        if (order.payment_status === 'paid') {
            return res.status(400).json({ error: 'This order has already been paid' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ error: 'This order has been cancelled' });
        }

        const totalDollars = Number(order.total_amount || 0);
        if (totalDollars <= 0) {
            return res.status(400).json({ error: 'Order total must be greater than zero' });
        }

        // Clear any stale session
        if (order.psifi_session_id) {
            await supabase
                .from('sales_orders')
                .update({ psifi_session_id: null, psifi_status: null })
                .eq('id', orderId);
        }

        // PsiFi requires registered products. Create an ad-hoc product for this order.
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
                price: totalDollars,
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

        // Build checkout session
        const siteBase = process.env.PUBLIC_SITE_URL || '';
        const successUrl = `${siteBase}/#/pay/${orderId}/success`;
        const cancelUrl = `${siteBase}/#/pay/${orderId}`;
        const timestamp = Date.now();

        const psifiPayload = {
            mode: 'payment',
            total_amount: totalDollars,
            external_id: `${orderId}-pl-${timestamp}`,
            success_url: successUrl,
            cancel_url: cancelUrl,
            items: [{
                productId: product.id,
                name: productName,
                quantity: 1,
                price: totalDollars,
            }],
            metadata: {
                order_id: orderId,
                client_name: order.contacts?.name || 'Customer',
                client_email: order.contacts?.email || '',
                source: 'payment_link',
            },
        };

        const psifiResponse = await fetch(`${PSIFI_API_BASE}/checkout-sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': psifiApiKey,
                'Idempotency-Key': `paylink-${orderId}-${timestamp}`,
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

        // Store session ID on the order
        await supabase
            .from('sales_orders')
            .update({
                psifi_session_id: psifiData.id || psifiData.session_id,
                psifi_status: 'pendingPayment',
            })
            .eq('id', orderId);

        return res.status(200).json({
            checkout_url: psifiData.url,
            session_id: psifiData.id || psifiData.session_id,
        });

    } catch (error: any) {
        console.error('Public checkout session creation failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
