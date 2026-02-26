import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SHIPPO_API = 'https://api.goshippo.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, rateId } = req.body;
        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
        }
        if (!rateId) {
            return res.status(400).json({ error: 'rateId is required' });
        }

        // Authenticate via Supabase JWT
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const shippoApiKey = process.env.SHIPPO_API_KEY;

        if (!supabaseUrl || !supabaseServiceKey || !shippoApiKey) {
            console.error('Missing environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Authorization: shipping is admin/sales_rep only
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();

        if (callerRole?.role !== 'admin' && callerRole?.role !== 'super_admin' && callerRole?.role !== 'sales_rep') {
            return res.status(403).json({ error: 'Only admin/sales_rep can purchase labels' });
        }

        // Validate order exists and is ready for labeling
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select('id, status, tracking_number')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'fulfilled') {
            return res.status(400).json({ error: 'Order must be fulfilled before shipping' });
        }

        if (order.tracking_number) {
            return res.status(400).json({ error: 'Order already has a shipping label' });
        }

        // Fetch the rate details from Shippo so we can get carrier/cost info
        const rateDetails = await shippoGet(`/rates/${rateId}`, shippoApiKey);
        const carrier = rateDetails.provider || 'Unknown';
        const shippingCost = parseFloat(rateDetails.amount || '0');

        // Purchase label via Shippo
        const transaction = await shippoPost('/transactions', shippoApiKey, {
            rate: rateId,
            label_file_type: 'PNG',
            async: false,
        });

        if (transaction.status !== 'SUCCESS') {
            const msg = JSON.stringify(transaction.messages);
            await markShippingError(supabase, orderId, `Label failed: ${msg}`);
            return res.status(502).json({ error: `Label purchase failed: ${msg}` });
        }

        // Update order in Supabase
        const { error: updateError } = await supabase
            .from('sales_orders')
            .update({
                tracking_number: transaction.tracking_number,
                carrier,
                shipping_status: 'label_created',
                ship_date: new Date().toISOString(),
                shipping_cost: shippingCost,
                label_url: transaction.label_url,
                shipping_error: null,
            })
            .eq('id', orderId);

        if (updateError) {
            console.error('DB update failed:', updateError);
            // Label was purchased — return data anyway so it's not lost
        }

        return res.status(200).json({
            tracking_number: transaction.tracking_number,
            carrier,
            label_url: transaction.label_url,
            shipping_cost: shippingCost,
        });

    } catch (error: any) {
        console.error('Buy label failed:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function shippoPost(endpoint: string, apiKey: string, body: object) {
    const resp = await fetch(`${SHIPPO_API}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `ShippoToken ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Shippo ${endpoint} failed (${resp.status}): ${text}`);
    }
    return resp.json();
}

async function shippoGet(endpoint: string, apiKey: string) {
    const resp = await fetch(`${SHIPPO_API}${endpoint}`, {
        headers: {
            'Authorization': `ShippoToken ${apiKey}`,
        },
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Shippo GET ${endpoint} failed (${resp.status}): ${text}`);
    }
    return resp.json();
}

async function markShippingError(supabase: any, orderId: string, message: string) {
    await supabase
        .from('sales_orders')
        .update({
            shipping_status: 'error',
            shipping_error: message.slice(0, 500),
        })
        .eq('id', orderId);
}
