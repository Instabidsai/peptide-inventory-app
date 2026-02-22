import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * WooCommerce Webhook Handler — SELF-CONTAINED
 * Receives order create/update notifications and syncs to Supabase.
 * Endpoint: POST /api/webhooks/woocommerce
 *
 * All sync logic is inlined here because Vercel's serverless bundler
 * fails on local file imports for this project. The batch script
 * (scripts/woo-sync-orders.ts) imports from _woo-sync-shared.ts separately.
 *
 * Configure in WooCommerce: Settings -> Advanced -> Webhooks
 * Topic: "Order updated" (fires on both create and update)
 */

// Disable Vercel body parser so we get the raw string for signature verification
export const config = { api: { bodyParser: false } };

// ── Constants ────────────────────────────────────────────────────────────────

const WOO_NAME_ALIASES: Record<string, string> = {
    'GLP2-T': 'Tirzepatide',
    'GLP3-R': 'Retatrutide',
    'Tesamorelin/Ipamorelin Blend': 'Tesamorelin/Ipamorelin Blnd',
};

const BUNDLE_COMPONENTS: Record<string, string[]> = {
    'BPC-157 + TB-500 Bundle': ['BPC-157 10mg', 'TB500 10mg'],
    'MOTS-C 40mg + SS-31 50mg Bundle': ['MOTS-C 40mg', 'SS-31 50mg'],
    'Tesamorelin 10mg + Ipamorelin 10mg Bundle': ['Tesamorelin 10mg', 'Ipamorelin 10mg'],
};

// ── Signature Verification ───────────────────────────────────────────────────

function verifyWooSignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');

    const expectedBuf = Buffer.from(expected, 'base64');
    const sigBuf = Buffer.from(signature, 'base64');

    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

// ── Status Mapping ───────────────────────────────────────────────────────────

function mapWooStatus(wooStatus: string): { status: string; paymentStatus: string } {
    switch (wooStatus) {
        case 'processing': return { status: 'submitted', paymentStatus: 'paid' };
        case 'completed':  return { status: 'submitted', paymentStatus: 'paid' };
        case 'on-hold':    return { status: 'submitted', paymentStatus: 'unpaid' };
        case 'pending':    return { status: 'draft', paymentStatus: 'unpaid' };
        case 'cancelled':  return { status: 'cancelled', paymentStatus: 'unpaid' };
        case 'refunded':   return { status: 'cancelled', paymentStatus: 'unpaid' };
        case 'failed':     return { status: 'cancelled', paymentStatus: 'unpaid' };
        default:           return { status: 'submitted', paymentStatus: 'unpaid' };
    }
}

// ── Contact Matching ─────────────────────────────────────────────────────────

async function findOrCreateContact(
    supabase: SupabaseClient,
    woo: any,
    orgId: string
): Promise<string> {
    const billing = woo.billing || {};
    const shipping = woo.shipping || {};
    const name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'WooCommerce Customer';
    const email = billing.email || null;
    const wooCustomerId = woo.customer_id && woo.customer_id !== 0 ? woo.customer_id : null;
    const company = billing.company || null;
    const phone = billing.phone || null;
    const address = shipping.address_1
        ? `${shipping.address_1}, ${shipping.city}, ${shipping.state} ${shipping.postcode}`
        : null;

    // 1. Match by WooCommerce customer ID first (most reliable)
    let existing: { id: string } | null = null;
    if (wooCustomerId) {
        const { data } = await supabase
            .from('contacts')
            .select('id')
            .eq('woo_customer_id', wooCustomerId)
            .eq('org_id', orgId)
            .maybeSingle();
        existing = data;
    }

    // 2. Fall back to email match
    if (!existing && email) {
        const { data } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', email)
            .eq('org_id', orgId)
            .maybeSingle();
        existing = data;
    }

    // 3. If found, update with latest data from WooCommerce
    if (existing) {
        const updates: Record<string, any> = {
            source: 'woocommerce',
            assigned_rep_id: null,
        };
        if (wooCustomerId) updates.woo_customer_id = wooCustomerId;
        if (address) updates.address = address;
        if (phone) updates.phone = phone;
        if (company) updates.company = company;
        if (name && name !== 'WooCommerce Customer') updates.name = name;

        await supabase
            .from('contacts')
            .update(updates)
            .eq('id', existing.id);

        return existing.id;
    }

    // 4. Create new contact — tagged as website, no rep
    const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
            org_id: orgId,
            name,
            email,
            phone,
            type: 'customer',
            company,
            address,
            source: 'woocommerce',
            woo_customer_id: wooCustomerId,
            assigned_rep_id: null,
            notes: `Auto-created from WooCommerce order #${woo.number}`,
        })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create contact: ${error.message}`);
    return newContact.id;
}

// ── Peptide Matching ─────────────────────────────────────────────────────────

function applyAliases(productName: string): string {
    for (const [wooName, dbName] of Object.entries(WOO_NAME_ALIASES)) {
        if (productName.startsWith(wooName)) {
            return productName.replace(wooName, dbName);
        }
    }
    return productName;
}

async function matchPeptide(
    supabase: SupabaseClient,
    productName: string,
    orgId: string,
    peptideCache?: { id: string; name: string }[]
): Promise<string | null> {
    let peptides = peptideCache;
    if (!peptides) {
        const { data } = await supabase
            .from('peptides')
            .select('id, name')
            .eq('org_id', orgId);
        peptides = data || [];
    }

    const aliased = applyAliases(productName);

    const exactFull = peptides.find(p =>
        p.name.toLowerCase() === aliased.toLowerCase()
    );
    if (exactFull) return exactFull.id;

    const baseName = aliased
        .replace(/\s+\d+(?:[.,]\d+)?(?:mg|mcg|iu|ml|vial|kit)(?:\/\d+(?:mg|mcg))?s?$/i, '')
        .trim()
        .toLowerCase();

    const exact = peptides.find(p =>
        p.name.toLowerCase()
            .replace(/\s+\d+(?:[.,]\d+)?(?:mg|mcg|iu|ml|vial|kit)(?:\/\d+(?:mg|mcg))?s?$/i, '')
            .trim().toLowerCase() === baseName
    );
    if (exact) return exact.id;

    const partial = peptides.find(p =>
        p.name.toLowerCase().includes(baseName) || baseName.includes(p.name.toLowerCase())
    );
    return partial?.id || null;
}

// ── Bundle Expansion ─────────────────────────────────────────────────────────

async function expandBundleItems(
    supabase: SupabaseClient,
    wooItem: any,
    orgId: string,
    peptideCache?: { id: string; name: string }[]
): Promise<{ peptide_id: string; quantity: number; unit_price: number }[] | null> {
    const bundleComponents = BUNDLE_COMPONENTS[wooItem.name];
    if (!bundleComponents) return null;

    const items: { peptide_id: string; quantity: number; unit_price: number }[] = [];
    const pricePerComponent = parseFloat(wooItem.total || '0') / bundleComponents.length;

    for (const compName of bundleComponents) {
        const peptideId = await matchPeptide(supabase, compName, orgId, peptideCache);
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

// ── COGS Calculation ─────────────────────────────────────────────────────────

async function calculateCogs(
    supabase: SupabaseClient,
    items: { peptide_id: string; quantity: number }[]
): Promise<number> {
    const { data: lots } = await supabase
        .from('lots')
        .select('peptide_id, cost_per_unit');

    const grouped: Record<string, number[]> = {};
    lots?.forEach(l => {
        if (!grouped[l.peptide_id]) grouped[l.peptide_id] = [];
        grouped[l.peptide_id].push(Number(l.cost_per_unit || 0));
    });

    const avgCosts = new Map<string, number>();
    Object.entries(grouped).forEach(([pid, costs]) => {
        avgCosts.set(pid, costs.reduce((a, b) => a + b, 0) / costs.length);
    });

    let total = 0;
    for (const item of items) {
        const cost = avgCosts.get(item.peptide_id) || 0;
        total += cost * item.quantity;
    }
    return total;
}

// ── Sync Single Order ────────────────────────────────────────────────────────

interface SyncResult {
    action: 'created' | 'updated' | 'skipped';
    orderId?: string;
    orderNumber?: string | number;
}

async function syncSingleWooOrder(
    supabase: SupabaseClient,
    woo: any,
    orgId: string
): Promise<SyncResult> {
    const { data: existing } = await supabase
        .from('sales_orders')
        .select('id, woo_status')
        .eq('woo_order_id', woo.id)
        .maybeSingle();

    const { status, paymentStatus } = mapWooStatus(woo.status);

    if (existing) {
        if (existing.woo_status !== woo.status) {
            const newTotal = parseFloat(woo.total);
            const newMerchantFee = paymentStatus === 'paid' ? newTotal * 0.05 : 0;

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

            return { action: 'updated', orderId: existing.id, orderNumber: woo.number };
        }
        return { action: 'skipped', orderId: existing.id, orderNumber: woo.number };
    }

    // ── New Order ──

    const contactId = await findOrCreateContact(supabase, woo, orgId);

    const s = woo.shipping || {};
    const shippingAddress = s.address_1
        ? `${s.address_1}, ${s.city}, ${s.state} ${s.postcode}`
        : null;

    const { data: peptideData } = await supabase
        .from('peptides')
        .select('id, name')
        .eq('org_id', orgId);
    const peptideCache = peptideData || [];

    const lineItems: { peptide_id: string; quantity: number; unit_price: number }[] = [];
    const unmatchedItems: string[] = [];

    for (const item of (woo.line_items || [])) {
        const bundleItems = await expandBundleItems(supabase, item, orgId, peptideCache);
        if (bundleItems) {
            lineItems.push(...bundleItems);
            continue;
        }

        const peptideId = await matchPeptide(supabase, item.name, orgId, peptideCache);
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

    const cogsAmount = await calculateCogs(supabase, lineItems);
    const totalAmount = parseFloat(woo.total);
    const shippingFromWoo = parseFloat(woo.shipping_total || '0');
    const merchantFee = paymentStatus === 'paid' ? totalAmount * 0.05 : 0;
    const profitAmount = totalAmount - cogsAmount - shippingFromWoo - merchantFee;

    const notes = [
        woo.customer_note || '',
        unmatchedItems.length > 0 ? `Unmatched items: ${unmatchedItems.join('; ')}` : '',
    ].filter(Boolean).join('\n') || null;

    const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .insert({
            org_id: orgId,
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

    if (lineItems.length > 0) {
        const { error: itemsError } = await supabase
            .from('sales_order_items')
            .insert(lineItems.map(item => ({
                sales_order_id: order.id,
                peptide_id: item.peptide_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
            })));
        if (itemsError) {
            console.error(`Warning: line items insert error: ${itemsError.message}`);
        }
    }

    return { action: 'created', orderId: order.id, orderNumber: woo.number };
}

// ── Webhook Handler ──────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const webhookSecret = process.env.WOO_WEBHOOK_SECRET;
        const orgId = process.env.DEFAULT_ORG_ID;

        if (!supabaseUrl || !supabaseServiceKey || !orgId) {
            console.error('[WooCommerce Webhook] Missing Supabase env vars');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Read raw body from stream (body parser disabled for signature verification)
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks).toString('utf8');

        // Verify signature if secret is configured
        if (webhookSecret) {
            const signature = req.headers['x-wc-webhook-signature'] as string;
            if (!signature || !verifyWooSignature(rawBody, signature, webhookSecret)) {
                console.error('[WooCommerce Webhook] Signature verification failed');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        // WooCommerce sends a ping on webhook creation — just acknowledge it
        const topic = req.headers['x-wc-webhook-topic'] as string;
        const resource = req.headers['x-wc-webhook-resource'] as string;

        if (!rawBody || rawBody === '{}') {
            console.log('[WooCommerce Webhook] Ping received, acknowledging');
            return res.status(200).json({ received: true, action: 'ping' });
        }

        let wooOrder: any;
        try {
            wooOrder = JSON.parse(rawBody);
        } catch {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }

        if (resource !== 'order' && !wooOrder.id) {
            console.log(`[WooCommerce Webhook] Non-order event: ${topic}, skipping`);
            return res.status(200).json({ received: true, action: 'skipped' });
        }

        console.log(`[WooCommerce Webhook] ${topic || 'order'} #${wooOrder.number || wooOrder.id}, status: ${wooOrder.status}`);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const result = await syncSingleWooOrder(supabase, wooOrder, orgId);

        console.log(`[WooCommerce Webhook] Order #${result.orderNumber}: ${result.action}`);

        return res.status(200).json({ received: true, ...result });

    } catch (error: any) {
        console.error('[WooCommerce Webhook] Error:', error.message || error);
        // Return 200 to prevent WooCommerce from endlessly retrying code bugs
        return res.status(200).json({ error: 'Internal processing error', received: true });
    }
}
