import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PSIFI_API_BASE = 'https://api.psifi.app/api/v2';

/**
 * Public checkout session creator — no JWT required.
 * Auth is implicit: order UUIDs are 128-bit unguessable tokens.
 * This is the same pattern Stripe/Square/PayPal use for invoice links.
 *
 * PsiFi API (from GET /api/v2/payment-methods):
 *   - payment_method: 'banxa' = fiat card on-ramp (credit/debit/apple/google pay)
 *   - pricing_strategy: 'TOTAL_ONLY' = locked amount (no wallet funding)
 *   - Products need pricing_context: 'contextual' for TOTAL_ONLY
 *   - Valid schema enum: banxa, onramper, helio, simplex
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

        const orderTotal = Number(order.total_amount || 0);
        if (orderTotal <= 0) {
            return res.status(400).json({ error: 'Order total must be greater than zero' });
        }

        // 3% card processing surcharge — calculated server-side so it can't be bypassed
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
                currency: 'USD',
                type: 'service',
                pricing_context: 'contextual',
            }),
        });

        if (!productRes.ok) {
            const errBody = await productRes.text();
            console.error('PsiFi product creation failed:', productRes.status, errBody);
            return res.status(502).json({ error: 'Payment processor error', psifi_error: errBody });
        }

        const product = await productRes.json();

        // Build checkout session — banxa = fiat card on-ramp, TOTAL_ONLY = locked amount
        const contactEmail = (order.contacts as any)?.email || '';
        const siteBase = process.env.PUBLIC_SITE_URL || '';
        const successUrl = `${siteBase}/#/pay/${orderId}/success`;
        const timestamp = Date.now();

        const psifiPayload = {
            mode: 'payment',
            payment_method: 'banxa',
            pricing_strategy: 'TOTAL_ONLY',
            total_amount: chargeTotal,
            external_id: `${orderId}-pl-${timestamp}`,
            redirect_url: successUrl,
            customer_email: contactEmail || undefined,
            customer_name: (order.contacts as any)?.name || undefined,
            products: [{
                productId: product.id,
                quantity: 1,
            }],
            metadata: {
                order_id: orderId,
                order_subtotal: orderTotal,
                card_fee: cardFee,
                card_fee_rate: '3%',
                client_name: (order.contacts as any)?.name || 'Customer',
                client_email: contactEmail || '',
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
