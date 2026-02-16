import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SHIPPO_API = 'https://api.goshippo.com';

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

        // Ship-from address from env
        const fromAddress = {
            name: process.env.SHIP_FROM_NAME || 'NextGen Research Labs',
            street1: process.env.SHIP_FROM_STREET || '2432 SW 12th St',
            city: process.env.SHIP_FROM_CITY || 'Deerfield Beach',
            state: process.env.SHIP_FROM_STATE || 'FL',
            zip: process.env.SHIP_FROM_ZIP || '33442',
            country: process.env.SHIP_FROM_COUNTRY || 'US',
            phone: process.env.SHIP_FROM_PHONE || '',
            email: process.env.SHIP_FROM_EMAIL || '',
        };

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseAddress(raw: string) {
    if (!raw || raw.trim().length < 10) return null;
    const cleaned = raw.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();
    const match = cleaned.match(
        /^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)(?:,?\s*(?:US|USA|United States))?$/i
    );
    if (match) {
        return {
            street1: match[1].trim(),
            city: match[2].trim(),
            state: match[3].toUpperCase(),
            zip: match[4],
            country: 'US',
        };
    }
    return null;
}

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
