import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { parseAddress, getFromAddress, shippoPost } from './_shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId } = req.body;
        if (!orderId) {
            return res.status(400).json({ error: 'orderId is required' });
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

        if (callerRole?.role !== 'admin' && callerRole?.role !== 'sales_rep') {
            return res.status(403).json({ error: 'Only admin/sales_rep can access shipping' });
        }

        // Fetch the order
        const { data: order, error: orderError } = await supabase
            .from('sales_orders')
            .select(`
                *,
                contacts (id, name, email, phone, address),
                sales_order_items (quantity, peptides (name))
            `)
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'fulfilled') {
            return res.status(400).json({ error: 'Order must be fulfilled before shipping' });
        }

        // Parse shipping address
        const rawAddress = order.shipping_address || (order.contacts as any)?.address;
        if (!rawAddress) {
            return res.status(400).json({ error: 'No shipping address on order or contact' });
        }

        const toAddr = parseAddress(rawAddress);
        if (!toAddr) {
            return res.status(400).json({
                error: `Could not parse address: "${rawAddress}". Format: Street, City, ST ZIP`
            });
        }

        const fromAddress = getFromAddress();

        // Estimate weight
        const totalItems = (order.sales_order_items || [])
            .reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
        const weight = String(Math.max(8, totalItems * 2));

        // Create Shippo shipment (returns rates synchronously)
        const shipment = await shippoPost('/shipments', shippoApiKey, {
            address_from: fromAddress,
            address_to: {
                name: (order.contacts as any)?.name || 'Customer',
                ...toAddr,
                phone: (order.contacts as any)?.phone || '',
                email: (order.contacts as any)?.email || '',
            },
            parcels: [{
                length: '8', width: '6', height: '4',
                distance_unit: 'in',
                weight,
                mass_unit: 'oz',
            }],
            async: false,
        });

        const rates = shipment.rates || [];
        if (rates.length === 0) {
            return res.status(502).json({ error: 'No shipping rates available for this address' });
        }

        // Map and sort rates cheapest-first
        const cleanRates = rates
            .filter((r: any) => r.amount)
            .map((r: any) => ({
                object_id: r.object_id,
                provider: r.provider,
                servicelevel_name: r.servicelevel?.name || r.servicelevel?.token || 'Standard',
                servicelevel_token: r.servicelevel?.token || '',
                amount: r.amount,
                currency: r.currency || 'USD',
                estimated_days: r.estimated_days || null,
                duration_terms: r.duration_terms || '',
            }))
            .sort((a: any, b: any) => parseFloat(a.amount) - parseFloat(b.amount));

        return res.status(200).json({
            shipment_id: shipment.object_id,
            rates: cleanRates,
            has_existing_label: !!order.tracking_number,
        });

    } catch (error: any) {
        console.error('Get rates failed:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
