/**
 * woo-sync-orders.ts — Poll WooCommerce orders and sync to Supabase
 *
 * Multi-tenant: looks up WooCommerce credentials from tenant_api_keys.
 *
 * Usage:
 *   npx tsx scripts/woo-sync-orders.ts --org <ORG_UUID>
 *   npx tsx scripts/woo-sync-orders.ts --all              # sync all tenants with WooCommerce configured
 *   npx tsx scripts/woo-sync-orders.ts                    # falls back to DEFAULT_ORG_ID env var
 *
 * Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env
 * Per-tenant: woo_url, woo_user, woo_app_pass in tenant_api_keys table
 *
 * NOTE: For real-time sync, use the webhook at api/webhooks/woocommerce.ts instead.
 * This script is for manual batch sync / backfill.
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { syncSingleWooOrder } from '../api/webhooks/_woo-sync-shared';

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[woo-sync] Missing SUPABASE env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CLI Args ────────────────────────────────────────────────────────────────

function parseArgs(): { orgId?: string; all: boolean } {
    const args = process.argv.slice(2);
    if (args.includes('--all')) return { all: true };
    const orgIdx = args.indexOf('--org');
    if (orgIdx !== -1 && args[orgIdx + 1]) return { orgId: args[orgIdx + 1], all: false };
    // Backwards compat: fall back to env var
    if (process.env.DEFAULT_ORG_ID) return { orgId: process.env.DEFAULT_ORG_ID, all: false };
    console.error('[woo-sync] Usage: --org <ORG_UUID> | --all');
    process.exit(1);
}

// ── Tenant WooCommerce Credentials ──────────────────────────────────────────

interface WooCredentials {
    orgId: string;
    orgName: string;
    wooUrl: string;
    wooUser: string;
    wooAppPass: string;
}

async function getWooCredentials(sb: SupabaseClient, orgId: string): Promise<WooCredentials | null> {
    const { data: org } = await sb
        .from('organizations')
        .select('id, name')
        .eq('id', orgId)
        .maybeSingle();

    if (!org) {
        console.error(`[woo-sync] Org ${orgId} not found`);
        return null;
    }

    const { data: keys } = await sb
        .from('tenant_api_keys')
        .select('service, api_key')
        .eq('org_id', orgId)
        .in('service', ['woo_url', 'woo_user', 'woo_app_pass']);

    const keyMap = new Map((keys || []).map(k => [k.service, k.api_key]));

    // Try tenant_api_keys first, fall back to env vars for backwards compat
    const wooUrl = keyMap.get('woo_url') || process.env.WOO_URL;
    const wooUser = keyMap.get('woo_user') || process.env.WOO_USER;
    const wooAppPass = keyMap.get('woo_app_pass') || process.env.WOO_APP_PASS;

    if (!wooUrl || !wooUser || !wooAppPass) {
        console.warn(`[woo-sync] Org "${org.name}" missing WooCommerce credentials — skipping`);
        return null;
    }

    return { orgId: org.id, orgName: org.name, wooUrl, wooUser, wooAppPass };
}

async function getAllWooTenants(sb: SupabaseClient): Promise<WooCredentials[]> {
    // Find all orgs that have woo_url configured
    const { data: wooKeys } = await sb
        .from('tenant_api_keys')
        .select('org_id')
        .eq('service', 'woo_url');

    if (!wooKeys?.length) {
        console.log('[woo-sync] No tenants with WooCommerce configured.');
        return [];
    }

    const results: WooCredentials[] = [];
    for (const key of wooKeys) {
        const creds = await getWooCredentials(sb, key.org_id);
        if (creds) results.push(creds);
    }
    return results;
}

// ── WooCommerce API ─────────────────────────────────────────────────────────

async function wooFetch(
    creds: WooCredentials,
    endpoint: string,
    params: Record<string, string> = {}
): Promise<any> {
    const auth = Buffer.from(`${creds.wooUser}:${creds.wooAppPass}`).toString('base64');
    const url = new URL(`${creds.wooUrl}/wp-json/wc/v3${endpoint}`);
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

// ── Sync One Tenant ─────────────────────────────────────────────────────────

async function syncTenant(creds: WooCredentials): Promise<{ synced: number; updated: number; skipped: number; errors: number }> {
    console.log(`\n── Syncing: ${creds.orgName} (${creds.orgId}) ──`);

    // Find most recent woo_date_modified for this org
    const { data: lastSynced } = await supabase
        .from('sales_orders')
        .select('woo_date_modified')
        .eq('org_id', creds.orgId)
        .eq('order_source', 'woocommerce')
        .order('woo_date_modified', { ascending: false })
        .limit(1)
        .maybeSingle();

    const since = lastSynced?.woo_date_modified
        || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[woo-sync] Fetching orders modified after ${since}`);

    let wooOrders: any[];
    try {
        wooOrders = await wooFetch(creds, '/orders', {
            modified_after: since,
            per_page: '50',
            orderby: 'modified',
            order: 'asc',
        });
    } catch (err: any) {
        console.error(`[woo-sync] Failed to fetch orders: ${err.message}`);
        return { synced: 0, updated: 0, skipped: 0, errors: 1 };
    }

    if (!wooOrders.length) {
        console.log('[woo-sync] No new/updated orders.');
        return { synced: 0, updated: 0, skipped: 0, errors: 0 };
    }

    console.log(`[woo-sync] Found ${wooOrders.length} order(s) to process.`);

    let synced = 0, updated = 0, skipped = 0, errors = 0;

    for (const woo of wooOrders) {
        try {
            const result = await syncSingleWooOrder(supabase, woo, creds.orgId);
            const customerName = `${woo.billing?.first_name || ''} ${woo.billing?.last_name || ''}`.trim();

            switch (result.action) {
                case 'created':
                    console.log(`  ✅ Order #${woo.number} (${customerName}) — $${parseFloat(woo.total).toFixed(2)} [created]`);
                    synced++;
                    break;
                case 'updated':
                    console.log(`  🔄 Order #${woo.number} updated`);
                    updated++;
                    break;
                case 'skipped':
                    skipped++;
                    break;
            }
        } catch (err: any) {
            console.error(`  ❌ Order #${woo.number || woo.id}: ${err.message}`);
            errors++;
        }
    }

    return { synced, updated, skipped, errors };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`[woo-sync] Starting at ${new Date().toISOString()}`);
    const { orgId, all } = parseArgs();

    let tenants: WooCredentials[];

    if (all) {
        tenants = await getAllWooTenants(supabase);
    } else {
        const creds = await getWooCredentials(supabase, orgId!);
        tenants = creds ? [creds] : [];
    }

    if (!tenants.length) {
        console.log('[woo-sync] No tenants to sync.');
        return;
    }

    let totalSynced = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

    for (const tenant of tenants) {
        const result = await syncTenant(tenant);
        totalSynced += result.synced;
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
    }

    console.log(`\n=== WOO SYNC SUMMARY ===`);
    console.log(`Tenants: ${tenants.length} | New: ${totalSynced} | Updated: ${totalUpdated} | Skipped: ${totalSkipped} | Errors: ${totalErrors}`);
    console.log(`========================\n`);
}

main().catch(err => {
    console.error('[woo-sync] Fatal:', err);
    process.exit(1);
});
