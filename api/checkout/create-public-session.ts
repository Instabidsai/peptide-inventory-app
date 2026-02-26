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

        // If there's already an active checkout session, don't create a duplicate
        if (order.psifi_session_id && order.psifi_status !== 'failed' && order.psifi_status !== 'cancelled') {
            // Still create a new session — the old one may have expired
        }

        // Build PsiFi checkout session
        const siteBase = process.env.PUBLIC_SITE_URL || '';
        const successUrl = `${siteBase}/#/pay/${orderId}/success`;
        const cancelUrl = `${siteBase}/#/pay/${orderId}`;

        const totalCents = Math.round((order.total_amount || 0) * 100);

        const psifiPayload = {
            mode: 'payment',
            total_amount: totalCents,
            external_id: orderId,
            success_url: successUrl,
            cancel_url: cancelUrl,
            payment_method: 'card',
            metadata: {
                client_name: order.contacts?.name || 'Customer',
                client_email: order.contacts?.email || '',
                item_count: order.sales_order_items?.length || 0,
                source: 'payment_link',
                items: (order.sales_order_items || []).map((item: any) => ({
                    name: item.peptides?.name || 'Unknown',
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                })),
            },
        };

        // Call PsiFi API
        const psifiResponse = await fetch(`${PSIFI_API_BASE}/checkout-sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': psifiApiKey,
                'Idempotency-Key': `paylink-${orderId}-${Date.now()}`,
            },
            body: JSON.stringify(psifiPayload),
        });

        if (!psifiResponse.ok) {
            const errorBody = await psifiResponse.text();
            console.error('PsiFi API error:', psifiResponse.status, errorBody);
            return res.status(502).json({
                error: 'Payment processor error',
                details: psifiResponse.status,
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
