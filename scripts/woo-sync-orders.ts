/**
 * woo-sync-orders.ts — Poll WooCommerce orders and sync to Supabase
 *
 * Fetches recent orders from the WooCommerce REST API at shop.pureuspeptide.com,
 * creates matching records in the sales_orders table, and calculates COGS/profit.
 *
 * Usage: npx tsx scripts/woo-sync-orders.ts
 * Env: WOO_URL, WOO_USER, WOO_APP_PASS, SUPABASE vars in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WOO_URL = process.env.WOO_URL || 'https://shop.pureuspeptide.com';
const WOO_USER = process.env.WOO_USER!;
const WOO_APP_PASS = process.env.WOO_APP_PASS!;
const ORG_ID = process.env.DEFAULT_ORG_ID || '33a18316-b0a4-4d85-a770-d1ceb762bd4f';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[woo-sync] Missing SUPABASE env vars');
    process.exit(1);
}
if (!WOO_USER || !WOO_APP_PASS) {
    console.error('[woo-sync] Missing WOO_USER or WOO_APP_PASS');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── WooCommerce API ─────────────────────────────────────────────────────────

async function wooFetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const auth = Buffer.from(`${WOO_USER}:${WOO_APP_PASS}`).toString('base64');
    const url = new URL(`${WOO_URL}/wp-json/wc/v3${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Basic ${auth}` },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`WooCommerce API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

// ── Status Mapping ──────────────────────────────────────────────────────────

function mapWooStatus(wooStatus: string): { status: string; paymentStatus: string } {
    switch (wooStatus) {
        case 'processing': return { status: 'submitted', paymentStatus: 'paid' };
        case 'completed':  return { status: 'fulfilled', paymentStatus: 'paid' };
        case 'on-hold':    return { status: 'submitted', paymentStatus: 'unpaid' };
        case 'pending':    return { status: 'draft', paymentStatus: 'unpaid' };
        case 'cancelled':  return { status: 'cancelled', paymentStatus: 'unpaid' };
        case 'refunded':   return { status: 'cancelled', paymentStatus: 'unpaid' };
        case 'failed':     return { status: 'cancelled', paymentStatus: 'unpaid' };
        default:           return { status: 'submitted', paymentStatus: 'unpaid' };
    }
}

// ── Contact Matching ────────────────────────────────────────────────────────

async function findOrCreateContact(woo: any): Promise<string> {
    const billing = woo.billing || {};
    const shipping = woo.shipping || {};
    const name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'WooCommerce Customer';
    const email = billing.email || null;

    // Match by email first
    if (email) {
        const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', email)
            .eq('org_id', ORG_ID)
            .limit(1)
            .maybeSingle();
        if (existing) return existing.id;
    }

    // Build address from shipping fields
    const address = shipping.address_1
        ? `${shipping.address_1}, ${shipping.city}, ${shipping.state} ${shipping.postcode}`
        : null;

    const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
            org_id: ORG_ID,
            name,
            email,
            phone: billing.phone || null,
            type: 'customer',
            address,
            notes: `Auto-created from WooCommerce order #${woo.number}`,
        })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create contact: ${error.message}`);
    return newContact.id;
}

// ── Peptide Matching ────────────────────────────────────────────────────────

// WooCommerce uses different names for some compounds
const WOO_NAME_ALIASES: Record<string, string> = {
    'GLP2-T': 'Tirzepatide',
    'GLP3-R': 'Retatrutide',
    'Tesamorelin/Ipamorelin Blend': 'Tesamorelin/Ipamorelin Blnd',
};

// Bundle products → component peptide names
const BUNDLE_COMPONENTS: Record<string, string[]> = {
    'BPC-157 + TB-500 Bundle': ['BPC-157 10mg', 'TB500 10mg'],
    'MOTS-C 40mg + SS-31 50mg Bundle': ['MOTS-C 40mg', 'SS-31 50mg'],
    'Tesamorelin 10mg + Ipamorelin 10mg Bundle': ['Tesamorelin 10mg', 'Ipamorelin 10mg'],
};

// Cache peptides for the run
let peptideCache: { id: string; name: string }[] | null = null;

async function getPeptides() {
    if (peptideCache) return peptideCache;
    const { data } = await supabase
        .from('peptides')
        .select('id, name')
        .eq('org_id', ORG_ID);
    peptideCache = data || [];
    return peptideCache;
}

function applyAliases(productName: string): string {
    // Replace known aliases: "GLP2-T 10mg" → "Retatrutide 10mg"
    for (const [wooName, dbName] of Object.entries(WOO_NAME_ALIASES)) {
        if (productName.startsWith(wooName)) {
            return productName.replace(wooName, dbName);
        }
    }
    return productName;
}

async function matchPeptide(productName: string): Promise<string | null> {
    const peptides = await getPeptides();
    const aliased = applyAliases(productName);

    // 1. Exact match on full name (most WC names match exactly)
    const exactFull = peptides.find(p =>
        p.name.toLowerCase() === aliased.toLowerCase()
    );
    if (exactFull) return exactFull.id;

    // 2. Strip dosage suffix: "BPC-157 10mg" → "BPC-157"
    const baseName = aliased
        .replace(/\s+\d+(?:[.,]\d+)?(?:mg|mcg|iu|ml|vial|kit)(?:\/\d+(?:mg|mcg))?s?$/i, '')
        .trim()
        .toLowerCase();

    // Base name match
    const exact = peptides.find(p =>
        p.name.toLowerCase().replace(/\s+\d+(?:[.,]\d+)?(?:mg|mcg|iu|ml|vial|kit)(?:\/\d+(?:mg|mcg))?s?$/i, '').trim().toLowerCase() === baseName
    );
    if (exact) return exact.id;

    // 3. Partial/contains match as fallback
    const partial = peptides.find(p =>
        p.name.toLowerCase().includes(baseName) || baseName.includes(p.name.toLowerCase())
    );
    return partial?.id || null;
}

// Expand bundle products into component items
async function expandBundleItems(
    wooItem: any
): Promise<{ peptide_id: string; quantity: number; unit_price: number }[] | null> {
    const bundleComponents = BUNDLE_COMPONENTS[wooItem.name];
    if (!bundleComponents) return null;

    const items: { peptide_id: string; quantity: number; unit_price: number }[] = [];
    const pricePerComponent = parseFloat(wooItem.total || '0') / bundleComponents.length;

    for (const compName of bundleComponents) {
        const peptideId = await matchPeptide(compName);
        if (peptideId) {
            items.push({
                peptide_id: peptideId,
                quantity: wooItem.quantity,
                unit_price: pricePerComponent / wooItem.quantity,
            });
        }
    }
    return items.length > 0 ? items : null;
}

// ── COGS Calculation ────────────────────────────────────────────────────────

// Cache lot costs
let lotCostCache: Map<string, number> | null = null;

async function getAvgCosts(): Promise<Map<string, number>> {
    if (lotCostCache) return lotCostCache;

    const { data: lots } = await supabase
        .from('lots')
        .select('peptide_id, cost_per_unit');

    const grouped: Record<string, number[]> = {};
    lots?.forEach(l => {
        if (!grouped[l.peptide_id]) grouped[l.peptide_id] = [];
        grouped[l.peptide_id].push(Number(l.cost_per_unit || 0));
    });

    lotCostCache = new Map();
    Object.entries(grouped).forEach(([pid, costs]) => {
        lotCostCache!.set(pid, costs.reduce((a, b) => a + b, 0) / costs.length);
    });
    return lotCostCache;
}

async function calculateCogs(items: { peptide_id: string; quantity: number }[]): Promise<number> {
    const avgCosts = await getAvgCosts();
    let total = 0;
    for (const item of items) {
        const cost = avgCosts.get(item.peptide_id) || 0;
        total += cost * item.quantity;
    }
    return total;
}

// ── Main Sync ───────────────────────────────────────────────────────────────

async function main() {
    console.log(`[woo-sync] Starting at ${new Date().toISOString()}`);

    // Find most recent woo_date_modified to paginate from
    const { data: lastSynced } = await supabase
        .from('sales_orders')
        .select('woo_date_modified')
        .eq('order_source', 'woocommerce')
        .order('woo_date_modified', { ascending: false })
        .limit(1)
        .maybeSingle();

    // Default: last 30 days if first run
    const since = lastSynced?.woo_date_modified
        || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[woo-sync] Fetching orders modified after ${since}`);

    let wooOrders: any[];
    try {
        wooOrders = await wooFetch('/orders', {
            modified_after: since,
            per_page: '50',
            orderby: 'modified',
            order: 'asc',
        });
    } catch (err: any) {
        console.error(`[woo-sync] Failed to fetch WooCommerce orders: ${err.message}`);
        process.exit(1);
    }

    if (!wooOrders.length) {
        console.log('[woo-sync] No new/updated orders found.');
        return;
    }

    console.log(`[woo-sync] Found ${wooOrders.length} order(s) to process.\n`);

    let synced = 0, updated = 0, skipped = 0, errors = 0;
    const summaries: string[] = [];

    for (const woo of wooOrders) {
        try {
            // Check if already synced
            const { data: existing } = await supabase
                .from('sales_orders')
                .select('id, woo_status')
                .eq('woo_order_id', woo.id)
                .maybeSingle();

            const { status, paymentStatus } = mapWooStatus(woo.status);

            if (existing) {
                // Update if WooCommerce status changed
                if (existing.woo_status !== woo.status) {
                    const newTotal = parseFloat(woo.total);
                    // Recalculate merchant fee if payment status changed
                    const newMerchantFee = paymentStatus === 'paid' ? newTotal * 0.05 : 0;

                    // Fetch current COGS/shipping/commission to recalculate profit
                    const { data: currentOrder } = await supabase
                        .from('sales_orders')
                        .select('cogs_amount, shipping_cost, commission_amount')
                        .eq('id', existing.id)
                        .single();

                    const newProfit = newTotal
                        - Number(currentOrder?.cogs_amount || 0)
                        - Number(currentOrder?.shipping_cost || 0)
                        - Number(currentOrder?.commission_amount || 0)
                        - newMerchantFee;

                    await supabase
                        .from('sales_orders')
                        .update({
                            status,
                            payment_status: paymentStatus,
                            woo_status: woo.status,
                            woo_date_modified: woo.date_modified,
                            total_amount: newTotal,
                            merchant_fee: newMerchantFee,
                            profit_amount: newProfit,
                        } as any)
                        .eq('id', existing.id);
                    console.log(`🔄 Order #${woo.number} updated: ${existing.woo_status} → ${woo.status}`);
                    updated++;
                } else {
                    skipped++;
                }
                continue;
            }

            // ── New Order ──

            const contactId = await findOrCreateContact(woo);

            // Build shipping address
            const s = woo.shipping || {};
            const shippingAddress = s.address_1
                ? `${s.address_1}, ${s.city}, ${s.state} ${s.postcode}`
                : null;

            // Match line items to peptides
            const lineItems: { peptide_id: string; quantity: number; unit_price: number }[] = [];
            const unmatchedItems: string[] = [];

            for (const item of (woo.line_items || [])) {
                // Check if this is a bundle product first
                const bundleItems = await expandBundleItems(item);
                if (bundleItems) {
                    lineItems.push(...bundleItems);
                    continue;
                }

                const peptideId = await matchPeptide(item.name);
                if (peptideId) {
                    lineItems.push({
                        peptide_id: peptideId,
                        quantity: item.quantity,
                        unit_price: parseFloat(item.price || item.total / item.quantity),
                    });
                } else {
                    unmatchedItems.push(`${item.quantity}x ${item.name} ($${item.total})`);
                }
            }

            // Calculate financials
            const cogsAmount = await calculateCogs(lineItems);
            const totalAmount = parseFloat(woo.total);
            const shippingFromWoo = parseFloat(woo.shipping_total || '0');
            const merchantFee = paymentStatus === 'paid' ? totalAmount * 0.05 : 0;
            const profitAmount = totalAmount - cogsAmount - shippingFromWoo - merchantFee;

            // Build notes
            const notes = [
                woo.customer_note || '',
                unmatchedItems.length > 0 ? `Unmatched items: ${unmatchedItems.join('; ')}` : '',
            ].filter(Boolean).join('\n') || null;

            // Insert order
            const { data: order, error: orderError } = await supabase
                .from('sales_orders')
                .insert({
                    org_id: ORG_ID,
                    client_id: contactId,
                    rep_id: null,
                    status,
                    payment_status: paymentStatus,
                    total_amount: totalAmount,
                    amount_paid: paymentStatus === 'paid' ? totalAmount : 0,
                    commission_amount: 0,
                    shipping_address: shippingAddress,
                    shipping_cost: shippingFromWoo,
                    notes,
                    order_source: 'woocommerce',
                    woo_order_id: woo.id,
                    woo_status: woo.status,
                    woo_date_created: woo.date_created,
                    woo_date_modified: woo.date_modified,
                    cogs_amount: cogsAmount,
                    merchant_fee: merchantFee,
                    profit_amount: profitAmount,
                    payment_method: woo.payment_method_title || woo.payment_method || null,
                    payment_date: paymentStatus === 'paid' ? woo.date_paid : null,
                })
                .select('id')
                .single();

            if (orderError) throw new Error(`Insert failed: ${orderError.message}`);

            // Insert line items
            if (lineItems.length > 0) {
                const { error: itemsError } = await supabase
                    .from('sales_order_items')
                    .insert(lineItems.map(item => ({
                        sales_order_id: order.id,
                        peptide_id: item.peptide_id,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                    })));
                if (itemsError) console.error(`  Warning: line items insert error: ${itemsError.message}`);
            }

            const customerName = `${woo.billing?.first_name || ''} ${woo.billing?.last_name || ''}`.trim();
            console.log(`✅ Order #${woo.number} (${customerName}) — $${totalAmount.toFixed(2)} [${status}]`);
            if (unmatchedItems.length > 0) {
                console.log(`   ⚠️  Unmatched: ${unmatchedItems.join(', ')}`);
            }
            console.log(`   COGS: $${cogsAmount.toFixed(2)} | Profit: $${profitAmount.toFixed(2)}`);

            summaries.push(`#${woo.number} ${customerName} — $${totalAmount.toFixed(2)}`);
            synced++;
        } catch (err: any) {
            console.error(`❌ Order #${woo.number || woo.id}: ${err.message}`);
            errors++;
        }
    }

    // Summary
    console.log(`\n=== WOO SYNC SUMMARY ===`);
    console.log(`New: ${synced} | Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors}`);
    console.log(`========================\n`);
}

main().catch(err => {
    console.error('[woo-sync] Fatal:', err);
    process.exit(1);
});
