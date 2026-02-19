import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const PSIFI_API_BASE = 'https://api.psifi.app/api/v2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
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

        // Use the service role client to verify the token and fetch data
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

        const isStaff = callerRole?.role === 'admin' || callerRole?.role === 'sales_rep';
        if (!isStaff && !isClient.data) {
            return res.status(403).json({ error: 'Not authorized for this order' });
        }

        // Safety check: don't create duplicate sessions
        if (order.psifi_session_id && order.psifi_status !== 'failed' && order.psifi_status !== 'cancelled') {
            return res.status(400).json({
                error: 'Checkout session already exists for this order',
                checkout_url: null, // They should use the existing one
            });
        }

        // --- Build PsiFi checkout session ---
        const siteBase = process.env.PUBLIC_SITE_URL || 'https://app.thepeptideai.com';

        // Since this is a HashRouter SPA, success/cancel URLs use hash fragments
        const successUrl = `${siteBase}/#/checkout/success?orderId=${orderId}`;
        const cancelUrl = `${siteBase}/#/checkout/cancel?orderId=${orderId}`;

        // Total in cents
        const totalCents = Math.round((order.total_amount || 0) * 100);

        const psifiPayload = {
            mode: 'payment',
            total_amount: totalCents,
            external_id: orderId,
            success_url: successUrl,
            cancel_url: cancelUrl,
            payment_method: 'card',
            metadata: {
                client_name: order.contacts?.name || 'Unknown',
                client_email: order.contacts?.email || '',
                item_count: order.sales_order_items?.length || 0,
                items: (order.sales_order_items || []).map((item: any) => ({
                    name: item.peptides?.name || 'Unknown Peptide',
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                })),
            },
        };

        // --- Call PsiFi API ---
        const psifiResponse = await fetch(`${PSIFI_API_BASE}/checkout-sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': psifiApiKey,
                'Idempotency-Key': orderId, // Prevent duplicate charges
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
            // Don't fail the request — the checkout can still proceed
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
