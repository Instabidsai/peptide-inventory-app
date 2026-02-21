/**
 * _woo-sync-shared.ts — Shared WooCommerce → Supabase sync logic
 *
 * Used by both:
 *  - api/webhooks/woocommerce.ts  (real-time webhook)
 *  - scripts/woo-sync-orders.ts   (manual batch sync)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Constants ────────────────────────────────────────────────────────────────

// WooCommerce uses different names for some compounds
export const WOO_NAME_ALIASES: Record<string, string> = {
    'GLP2-T': 'Tirzepatide',
    'GLP3-R': 'Retatrutide',
    'Tesamorelin/Ipamorelin Blend': 'Tesamorelin/Ipamorelin Blnd',
};

// Bundle products → component peptide names
export const BUNDLE_COMPONENTS: Record<string, string[]> = {
    'BPC-157 + TB-500 Bundle': ['BPC-157 10mg', 'TB500 10mg'],
    'MOTS-C 40mg + SS-31 50mg Bundle': ['MOTS-C 40mg', 'SS-31 50mg'],
    'Tesamorelin 10mg + Ipamorelin 10mg Bundle': ['Tesamorelin 10mg', 'Ipamorelin 10mg'],
};

// ── Status Mapping ───────────────────────────────────────────────────────────

export function mapWooStatus(wooStatus: string): { status: string; paymentStatus: string } {
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

export async function findOrCreateContact(
    supabase: SupabaseClient,
    woo: any,
    orgId: string
): Promise<string> {
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
            .eq('org_id', orgId)
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
            org_id: orgId,
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

// ── Peptide Matching ─────────────────────────────────────────────────────────

export function applyAliases(productName: string): string {
    for (const [wooName, dbName] of Object.entries(WOO_NAME_ALIASES)) {
        if (productName.startsWith(wooName)) {
            return productName.replace(wooName, dbName);
        }
    }
    return productName;
}

export async function matchPeptide(
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

    // 1. Exact match on full name
    const exactFull = peptides.find(p =>
        p.name.toLowerCase() === aliased.toLowerCase()
    );
    if (exactFull) return exactFull.id;

    // 2. Strip dosage suffix: "BPC-157 10mg" → "BPC-157"
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

    // 3. Partial/contains match as fallback
    const partial = peptides.find(p =>
        p.name.toLowerCase().includes(baseName) || baseName.includes(p.name.toLowerCase())
    );
    return partial?.id || null;
}

// ── Bundle Expansion ─────────────────────────────────────────────────────────

export async function expandBundleItems(
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

export async function calculateCogs(
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

// ── Main Sync Function ───────────────────────────────────────────────────────

export interface SyncResult {
    action: 'created' | 'updated' | 'skipped';
    orderId?: string;
    orderNumber?: string | number;
    error?: string;
}

/**
 * Sync a single WooCommerce order into Supabase.
 * Handles both new orders and status updates to existing ones.
 */
export async function syncSingleWooOrder(
    supabase: SupabaseClient,
    woo: any,
    orgId: string
): Promise<SyncResult> {
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

    // Build shipping address
    const s = woo.shipping || {};
    const shippingAddress = s.address_1
        ? `${s.address_1}, ${s.city}, ${s.state} ${s.postcode}`
        : null;

    // Load peptide cache for this order
    const { data: peptideData } = await supabase
        .from('peptides')
        .select('id, name')
        .eq('org_id', orgId);
    const peptideCache = peptideData || [];

    // Match line items to peptides
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

    // Calculate financials
    const cogsAmount = await calculateCogs(supabase, lineItems);
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
        if (itemsError) {
            console.error(`Warning: line items insert error: ${itemsError.message}`);
        }
    }

    return { action: 'created', orderId: order.id, orderNumber: woo.number };
}
