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
    if (!raw || raw.trim().length < 5) return null;

    // Split into lines, trim each, drop empties
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);

    // Pull out unit/apartment/suite/loft lines → becomes street2
    let street2 = '';
    const UNIT_RE = /^(apt|apartment|unit|suite|ste|loft|#)\s*/i;
    const addressLines: string[] = [];
    for (const line of lines) {
        const stripped = line.replace(/^,/, '').trim();
        if (UNIT_RE.test(stripped)) {
            street2 = stripped;
        } else if (/^(US|USA|United States)\s*$/i.test(stripped)) {
            // drop country line
        } else {
            addressLines.push(stripped);
        }
    }

    // Rejoin remaining lines with comma separator
    const cleaned = addressLines.join(', ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 5) return null;

    // 1. Extract ZIP code — find FIRST 5-digit ZIP anywhere in string
    const zipMatch = cleaned.match(/\b(\d{5}(?:-\d{4})?)\b/);
    if (!zipMatch) return null;
    const zip = zipMatch[1];

    // Everything before the ZIP is the address body, everything after is ignored (or unit info)
    let rest = cleaned.slice(0, zipMatch.index).replace(/,?\s*$/, '').trim();
    // Also check for trailing text after ZIP that might be unit info
    const afterZip = cleaned.slice((zipMatch.index || 0) + zipMatch[0].length).trim();
    if (afterZip && !street2) {
        // Could be unit info like "Apt B" or leftover text
        street2 = afterZip.replace(/^,?\s*/, '');
    }

    // Strip country if still present
    rest = rest.replace(/,?\s*(?:US|USA|United States)\s*$/i, '').trim();

    // 2. Extract state — try full name first, then 2-letter abbreviation
    let state = '';

    for (const [name, abbr] of Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)) {
        const re = new RegExp('[,\\s]' + name.replace(/ /g, '\\s+') + '\\s*$', 'i');
        const m = rest.match(re);
        if (m) {
            state = abbr;
            rest = rest.slice(0, m.index).replace(/,?\s*$/, '').trim();
            break;
        }
    }

    if (!state) {
        const abbrMatch = rest.match(/(?:,\s*|\s+)([A-Z]{2})\s*$/i);
        if (abbrMatch && VALID_ABBRS.has(abbrMatch[1].toUpperCase())) {
            state = abbrMatch[1].toUpperCase();
            rest = rest.slice(0, abbrMatch.index).replace(/,?\s*$/, '').trim();
        }
    }

    // Infer from ZIP prefix if needed
    if (!state) {
        const z = parseInt(zip.slice(0, 3));
        if (z >= 330 && z <= 349) state = 'FL';
        else if (z >= 100 && z <= 149) state = 'NY';
        else if (z >= 900 && z <= 961) state = 'CA';
        else if (z >= 750 && z <= 799) state = 'TX';
        else if (z >= 600 && z <= 629) state = 'IL';
        else if (z >= 150 && z <= 196) state = 'PA';
        else if (z >= 200 && z <= 205) state = 'DC';
        else if (z >= 206 && z <= 219) state = 'MD';
        else if (z >= 220 && z <= 246) state = 'VA';
        else if (z >= 300 && z <= 319) state = 'GA';
        else if (z >= 270 && z <= 289) state = 'NC';
        else if (z >= 430 && z <= 459) state = 'OH';
        else if (z >= 480 && z <= 499) state = 'MI';
    }
    if (!state) return null;

    // 3. Split street + city on last comma
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

    const result: any = { street1, city, state, zip, country: 'US' };
    if (street2) result.street2 = street2;
    return result;
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
