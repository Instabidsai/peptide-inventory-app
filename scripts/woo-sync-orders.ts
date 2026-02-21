/**
 * woo-sync-orders.ts — Poll WooCommerce orders and sync to Supabase
 *
 * Fetches recent orders from the WooCommerce REST API at shop.pureuspeptide.com,
 * creates matching records in the sales_orders table, and calculates COGS/profit.
 *
 * Usage: npx tsx scripts/woo-sync-orders.ts
 * Env: WOO_URL, WOO_USER, WOO_APP_PASS, SUPABASE vars in .env
 *
 * NOTE: For real-time sync, use the webhook at api/webhooks/woocommerce.ts instead.
 * This script is for manual batch sync / backfill.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { syncSingleWooOrder } from '../api/webhooks/_woo-sync-shared';

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

    for (const woo of wooOrders) {
        try {
            const result = await syncSingleWooOrder(supabase, woo, ORG_ID);

            const customerName = `${woo.billing?.first_name || ''} ${woo.billing?.last_name || ''}`.trim();

            switch (result.action) {
                case 'created':
                    console.log(`✅ Order #${woo.number} (${customerName}) — $${parseFloat(woo.total).toFixed(2)} [created]`);
                    synced++;
                    break;
                case 'updated':
                    console.log(`🔄 Order #${woo.number} updated`);
                    updated++;
                    break;
                case 'skipped':
                    skipped++;
                    break;
            }
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
