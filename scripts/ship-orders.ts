/**
 * ship-orders.ts — Automated shipping label creation via Shippo
 *
 * Finds fulfilled orders without tracking numbers, creates Shippo labels,
 * and updates the order with tracking info.
 *
 * Usage: npx tsx scripts/ship-orders.ts
 * Env: SHIPPO_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SHIP_FROM_* vars in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY!;
const SHIPPO_API = 'https://api.goshippo.com';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[ship-orders] Missing SUPABASE env vars');
    process.exit(1);
}
if (!SHIPPO_API_KEY || SHIPPO_API_KEY === 'shippo_test_REPLACE_ME') {
    console.error('[ship-orders] Missing or placeholder SHIPPO_API_KEY — sign up at goshippo.com');
    process.exit(1);
}

const FROM_ADDRESS = {
    name: process.env.SHIP_FROM_NAME || '',
    street1: process.env.SHIP_FROM_STREET || '',
    city: process.env.SHIP_FROM_CITY || '',
    state: process.env.SHIP_FROM_STATE || '',
    zip: process.env.SHIP_FROM_ZIP || '',
    country: process.env.SHIP_FROM_COUNTRY || 'US',
    phone: process.env.SHIP_FROM_PHONE || '',
    email: process.env.SHIP_FROM_EMAIL || '',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Address Parser ──────────────────────────────────────────────────────────

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

function parseAddress(raw: string): {
    street1: string; city: string; state: string; zip: string; country: string;
} | null {
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

// ── Shippo API Helpers ──────────────────────────────────────────────────────

async function shippoPost(endpoint: string, body: object) {
    const res = await fetch(`${SHIPPO_API}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shippo ${endpoint} failed (${res.status}): ${text}`);
    }
    return res.json();
}

// ── Process One Order ───────────────────────────────────────────────────────

async function processOrder(order: any): Promise<{ tracking: string; carrier: string; label: string; cost: number }> {
    const rawAddress = order.shipping_address || order.contacts?.address;
    if (!rawAddress) throw new Error('No shipping address on order or contact record');

    const toAddr = parseAddress(rawAddress);
    if (!toAddr) throw new Error(`Could not parse address: "${rawAddress}". Format needed: Street, City, ST ZIP`);

    // Estimate weight: ~2oz per vial, minimum 8oz
    const totalItems = (order.sales_order_items || [])
        .reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
    const weight = String(Math.max(8, totalItems * 2));

    // 1. Create shipment (returns rates)
    const shipment = await shippoPost('/shipments', {
        address_from: FROM_ADDRESS,
        address_to: {
            name: order.contacts?.name || 'Customer',
            ...toAddr,
            phone: order.contacts?.phone || '',
            email: order.contacts?.email || '',
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
    if (rates.length === 0) throw new Error('Shippo returned no rates for this shipment');

    // 2. Pick rate: prefer USPS Priority, else cheapest
    const preferred = rates.find((r: any) =>
        r.provider === 'USPS' && r.servicelevel?.token?.includes('priority')
    );
    const selectedRate = preferred || rates.sort((a: any, b: any) =>
        parseFloat(a.amount) - parseFloat(b.amount)
    )[0];

    // 3. Purchase label
    const transaction = await shippoPost('/transactions', {
        rate: selectedRate.object_id,
        label_file_type: 'PDF',
        async: false,
    });

    if (transaction.status !== 'SUCCESS') {
        throw new Error(`Label purchase failed: ${JSON.stringify(transaction.messages)}`);
    }

    // 4. Update Supabase
    const { error: updateErr } = await supabase
        .from('sales_orders')
        .update({
            tracking_number: transaction.tracking_number,
            carrier: selectedRate.provider,
            shipping_status: 'label_created',
            ship_date: new Date().toISOString(),
            shipping_cost: parseFloat(selectedRate.amount),
            label_url: transaction.label_url,
            shippo_shipment_id: shipment.object_id,
            shippo_transaction_id: transaction.object_id,
            shipping_error: null,
        } as any)
        .eq('id', order.id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    // Recalculate profit now that shipping cost is known
    const shippingCost = parseFloat(selectedRate.amount);
    const merchantFee = Number(order.merchant_fee || 0);
    const profit = (order.total_amount || 0) - (order.cogs_amount || 0) - shippingCost - (order.commission_amount || 0) - merchantFee;
    await supabase
        .from('sales_orders')
        .update({ profit_amount: profit } as any)
        .eq('id', order.id);

    return {
        tracking: transaction.tracking_number,
        carrier: selectedRate.provider,
        label: transaction.label_url,
        cost: shippingCost,
    };
}

// ── Update Tracking Statuses ────────────────────────────────────────────────

async function updateTrackingStatuses() {
    const { data: orders, error } = await supabase
        .from('sales_orders')
        .select('id, tracking_number, carrier')
        .in('shipping_status', ['label_created', 'in_transit'] as any)
        .not('tracking_number', 'is', null)
        .limit(20);

    if (error || !orders || orders.length === 0) return;

    for (const order of orders) {
        try {
            const res = await fetch(
                `${SHIPPO_API}/tracks/${(order as any).carrier}/${(order as any).tracking_number}`,
                { headers: { 'Authorization': `ShippoToken ${SHIPPO_API_KEY}` } }
            );
            if (!res.ok) continue;

            const track = await res.json();
            const status = track.tracking_status?.status;

            let newStatus: string | null = null;
            if (status === 'DELIVERED') newStatus = 'delivered';
            else if (status === 'TRANSIT') newStatus = 'in_transit';
            else if (status === 'RETURNED') newStatus = 'returned';

            if (newStatus && newStatus !== (order as any).shipping_status) {
                await supabase
                    .from('sales_orders')
                    .update({
                        shipping_status: newStatus,
                        ...(newStatus === 'delivered' ? { delivered_date: new Date().toISOString() } : {}),
                    } as any)
                    .eq('id', order.id);
                console.log(`[tracking] Order ${order.id.slice(0, 8)}: ${newStatus}`);
            }
        } catch {
            // Tracking check is best-effort, don't fail the run
        }
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`[ship-orders] Starting at ${new Date().toISOString()}`);

    // Find orders ready to ship
    const { data: orders, error } = await supabase
        .from('sales_orders')
        .select(`
            id, shipping_address, total_amount, commission_amount, cogs_amount, merchant_fee, notes,
            contacts (id, name, email, phone, address),
            sales_order_items (quantity, peptides (name))
        `)
        .eq('status', 'fulfilled')
        .is('tracking_number', null)
        .or('shipping_status.is.null,shipping_status.eq.pending,shipping_status.eq.error')
        .limit(10);

    if (error) {
        console.error('[ship-orders] Query error:', error.message);
        process.exit(1);
    }

    if (!orders || orders.length === 0) {
        console.log('[ship-orders] No orders to ship.');
    } else {
        console.log(`[ship-orders] Found ${orders.length} order(s) to ship.\n`);

        let shipped = 0;
        let failed = 0;

        for (const order of orders) {
            const label = `Order ${order.id.slice(0, 8)}`;
            const clientName = (order as any).contacts?.name || 'Unknown';
            const items = ((order as any).sales_order_items || [])
                .map((i: any) => `${i.quantity}x ${i.peptides?.name || '?'}`)
                .join(', ');

            try {
                const result = await processOrder(order);
                shipped++;
                console.log(`✅ ${label} (${clientName}: ${items})`);
                console.log(`   Tracking: ${result.tracking}`);
                console.log(`   Label: ${result.label}`);
                console.log(`   Cost: $${result.cost.toFixed(2)} via ${result.carrier}\n`);
            } catch (err: any) {
                failed++;
                console.error(`❌ ${label} (${clientName}): ${err.message}\n`);
                await supabase
                    .from('sales_orders')
                    .update({
                        shipping_status: 'error',
                        shipping_error: err.message.slice(0, 500),
                    } as any)
                    .eq('id', order.id);
            }
        }

        console.log(`=== SHIPPING SUMMARY ===`);
        console.log(`Processed: ${orders.length} | Shipped: ${shipped} | Failed: ${failed}`);
        console.log(`========================\n`);
    }

    // Also check tracking updates for previously shipped orders
    await updateTrackingStatuses();
}

main().catch(err => {
    console.error('[ship-orders] Fatal error:', err);
    process.exit(1);
});
