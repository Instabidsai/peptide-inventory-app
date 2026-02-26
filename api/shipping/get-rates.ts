import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Get shipping rates for an order via Shippo.
 * Self-contained (no local imports) to work on Vercel's serverless bundler.
 */

const SHIPPO_API = 'https://api.goshippo.com';

// ── Inlined shared utilities ─────────────────────────────────────────────────

const STATE_NAMES: Record<string, string> = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
    'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
    'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
    'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
    'district of columbia':'DC',
};

const VALID_ABBRS = new Set(Object.values(STATE_NAMES));

function parseAddress(raw: string) {
    if (!raw || raw.trim().length < 10) return null;
    const cleaned = raw.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();

    const zipMatch = cleaned.match(/(\d{5}(?:-\d{4})?)\s*$/);
    if (!zipMatch) return null;
    const zip = zipMatch[1];
    let rest = cleaned.slice(0, zipMatch.index).replace(/,?\s*$/, '').trim();
    rest = rest.replace(/,?\s*(?:US|USA|United States)\s*$/i, '').trim();

    let state = '';
    for (const [name, abbr] of Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)) {
        const re = new RegExp('[,\\s]' + name.replace(/ /g, '\\s+') + '\\s*$', 'i');
        const m = rest.match(re);
        if (m) { state = abbr; rest = rest.slice(0, m.index).replace(/,?\s*$/, '').trim(); break; }
    }
    if (!state) {
        const abbrMatch = rest.match(/(?:,\s*|\s+)([A-Z]{2})\s*$/i);
        if (abbrMatch && VALID_ABBRS.has(abbrMatch[1].toUpperCase())) {
            state = abbrMatch[1].toUpperCase();
            rest = rest.slice(0, abbrMatch.index).replace(/,?\s*$/, '').trim();
        }
    }
    if (!state) {
        const z = parseInt(zip.slice(0, 3));
        if (z >= 330 && z <= 349) state = 'FL';
        else if (z >= 100 && z <= 149) state = 'NY';
        else if (z >= 900 && z <= 961) state = 'CA';
        else if (z >= 750 && z <= 799) state = 'TX';
    }
    if (!state) return null;

    const lastComma = rest.lastIndexOf(',');
    let street1: string, city: string;
    if (lastComma > 0) {
        street1 = rest.slice(0, lastComma).trim();
        city = rest.slice(lastComma + 1).trim();
    } else {
        const SUFFIXES = /^(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ct|court|ln|lane|way|pl|place|cir|circle|ter|terrace|trl|trail|pkwy|parkway|hwy|highway|nw|ne|sw|se|n|s|e|w)$/i;
        const tokens = rest.split(' ');
        let splitIdx = tokens.length;
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (/\d/.test(tokens[i])) { splitIdx = i + 1; break; }
        }
        while (splitIdx < tokens.length && SUFFIXES.test(tokens[splitIdx])) splitIdx++;
        if (splitIdx >= tokens.length) splitIdx = Math.max(1, Math.ceil(tokens.length / 2));
        street1 = tokens.slice(0, splitIdx).join(' ');
        city = tokens.slice(splitIdx).join(' ');
    }

    if (!street1 || !city) return null;
    return { street1, city, state, zip, country: 'US' };
}

interface TenantShipConfig {
    ship_from_name?: string;
    ship_from_street?: string;
    ship_from_city?: string;
    ship_from_state?: string;
    ship_from_zip?: string;
    ship_from_country?: string;
    ship_from_phone?: string;
    ship_from_email?: string;
}

function getFromAddress(tenantConfig?: TenantShipConfig) {
    return {
        name: tenantConfig?.ship_from_name || process.env.SHIP_FROM_NAME || '',
        street1: tenantConfig?.ship_from_street || process.env.SHIP_FROM_STREET || '',
        city: tenantConfig?.ship_from_city || process.env.SHIP_FROM_CITY || '',
        state: tenantConfig?.ship_from_state || process.env.SHIP_FROM_STATE || '',
        zip: tenantConfig?.ship_from_zip || process.env.SHIP_FROM_ZIP || '',
        country: tenantConfig?.ship_from_country || process.env.SHIP_FROM_COUNTRY || 'US',
        phone: tenantConfig?.ship_from_phone || process.env.SHIP_FROM_PHONE || '',
        email: tenantConfig?.ship_from_email || process.env.SHIP_FROM_EMAIL || '',
    };
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

// ── Handler ──────────────────────────────────────────────────────────────────

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

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing SUPABASE environment variables');
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

        // Fetch tenant config for ship-from address
        const { data: tenantConfig } = await supabase
            .from('tenant_config')
            .select('ship_from_name, ship_from_street, ship_from_city, ship_from_state, ship_from_zip, ship_from_country, ship_from_phone, ship_from_email')
            .eq('org_id', order.org_id)
            .maybeSingle();

        // Fetch tenant-specific Shippo API key (falls back to env var)
        const { data: shippoKeyRow } = await supabase
            .from('tenant_api_keys')
            .select('api_key')
            .eq('org_id', order.org_id)
            .eq('service', 'shippo_api_key')
            .maybeSingle();
        const shippoApiKey = shippoKeyRow?.api_key || process.env.SHIPPO_API_KEY;

        if (!shippoApiKey) {
            return res.status(500).json({ error: 'No Shippo API key configured' });
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

        const fromAddress = getFromAddress(tenantConfig || undefined);

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
