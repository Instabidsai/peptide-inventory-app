import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PSIFI_API_BASE = 'https://api.psifi.app/api/v2';

/**
 * Public checkout session creator — no JWT required.
 * Auth is implicit: order UUIDs are 128-bit unguessable tokens.
 * This is the same pattern Stripe/Square/PayPal use for invoice links.
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

        // Clear any stale session so PsiFi doesn't reject duplicate external_id
        if (order.psifi_session_id) {
            await supabase
                .from('sales_orders')
                .update({ psifi_session_id: null, psifi_status: null })
                .eq('id', orderId);
        }

        // Build PsiFi checkout session
        const siteBase = process.env.PUBLIC_SITE_URL || '';
        const successUrl = `${siteBase}/#/pay/${orderId}/success`;
        const cancelUrl = `${siteBase}/#/pay/${orderId}`;

        const totalCents = Math.round((order.total_amount || 0) * 100);

        if (totalCents <= 0) {
            return res.status(400).json({ error: 'Order total must be greater than zero' });
        }

        // Use unique external_id per attempt to avoid PsiFi duplicate rejection
        const timestamp = Date.now();
        const externalId = `${orderId}-pl-${timestamp}`;

        const lineItems = (order.sales_order_items || []).map((item: any) => ({
            name: item.peptides?.name || 'Item',
            quantity: item.quantity || 1,
            price: Math.round((item.unit_price || 0) * 100),
        }));

        const psifiPayload = {
            mode: 'payment',
            total_amount: totalCents,
            external_id: externalId,
            success_url: successUrl,
            cancel_url: cancelUrl,
            payment_method: 'card',
            items: lineItems,
            metadata: {
                order_id: orderId,
                client_name: order.contacts?.name || 'Customer',
                client_email: order.contacts?.email || '',
                source: 'payment_link',
            },
        };

        // Call PsiFi API
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
            console.error('PsiFi API error:', psifiResponse.status, 'body:', errorBody, 'payload:', JSON.stringify(psifiPayload));
            return res.status(502).json({
                error: 'Payment processor error',
                details: psifiResponse.status,
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
