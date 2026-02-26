import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Sync WooCommerce products into the peptides table.
 * POST /api/integrations/woo-sync-products
 * Body: { dryRun?: boolean }
 *
 * Auth: JWT (admin only). Reads WooCommerce credentials from tenant_api_keys.
 * Self-contained for Vercel serverless bundler.
 */

// ── WooCommerce name aliases (same as _woo-sync-shared) ─────────────────────
const WOO_NAME_ALIASES: Record<string, string> = {
    'GLP2-T': 'Tirzepatide',
    'GLP3-R': 'Retatrutide',
    'Tesamorelin/Ipamorelin Blend': 'Tesamorelin/Ipamorelin Blnd',
};

function applyAliases(name: string): string {
    for (const [wooName, dbName] of Object.entries(WOO_NAME_ALIASES)) {
        if (name.startsWith(wooName)) return name.replace(wooName, dbName);
    }
    return name;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { dryRun = false } = req.body || {};

        // Auth
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Role check
        const { data: callerRole } = await supabase
            .from('user_roles')
            .select('role, org_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (callerRole?.role !== 'admin' && callerRole?.role !== 'super_admin') {
            return res.status(403).json({ error: 'Only admin can sync products' });
        }

        const orgId = callerRole.org_id;
        if (!orgId) {
            return res.status(400).json({ error: 'No organization linked to this user' });
        }

        // Get WooCommerce credentials
        const { data: keys } = await supabase
            .from('tenant_api_keys')
            .select('service, api_key')
            .eq('org_id', orgId)
            .in('service', ['woo_url', 'woo_user', 'woo_app_pass']);

        const keyMap = new Map((keys || []).map(k => [k.service, k.api_key]));
        const wooUrl = keyMap.get('woo_url');
        const wooUser = keyMap.get('woo_user');
        const wooPass = keyMap.get('woo_app_pass');

        if (!wooUrl || !wooUser || !wooPass) {
            return res.status(400).json({
                error: 'WooCommerce credentials not configured. Add woo_url, woo_user, and woo_app_pass in Settings → Integrations.',
            });
        }

        // Fetch products from WooCommerce (paginated, up to 100)
        const auth = Buffer.from(`${wooUser}:${wooPass}`, 'utf8').toString('base64');
        const endpoint = `${wooUrl.replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=100&status=publish&orderby=title&order=asc`;

        const wooResp = await fetch(endpoint, {
            headers: {
                Authorization: `Basic ${auth}`,
                'User-Agent': 'ThePeptideAI-Sync',
                Accept: 'application/json',
            },
        });

        if (!wooResp.ok) {
            const body = await wooResp.text();
            return res.status(502).json({
                error: `WooCommerce API error (${wooResp.status}): ${body.slice(0, 300)}`,
            });
        }

        const wooProducts: any[] = await wooResp.json();

        // Fetch existing peptides for this org
        const { data: existingPeptides } = await supabase
            .from('peptides')
            .select('id, name, sku')
            .eq('org_id', orgId);

        const existingByName = new Map(
            (existingPeptides || []).map(p => [p.name.toLowerCase(), p])
        );
        const existingBySku = new Map(
            (existingPeptides || []).filter(p => p.sku).map(p => [p.sku!.toLowerCase(), p])
        );

        const results: {
            created: string[];
            updated: string[];
            skipped: string[];
            errors: string[];
        } = { created: [], updated: [], skipped: [], errors: [] };

        for (const wooP of wooProducts) {
            try {
                // Skip non-simple products (grouped, external, variable parent)
                if (wooP.type && wooP.type !== 'simple' && wooP.type !== 'variation') {
                    results.skipped.push(`${wooP.name} (type: ${wooP.type})`);
                    continue;
                }

                const rawName = applyAliases(wooP.name || '').trim();
                if (!rawName) {
                    results.skipped.push(`Product #${wooP.id} (no name)`);
                    continue;
                }

                const sku = (wooP.sku || '').trim() || null;
                const price = parseFloat(wooP.regular_price || wooP.price || '0') || null;
                const salePrice = parseFloat(wooP.sale_price || '0') || null;
                const description = (wooP.short_description || wooP.description || '')
                    .replace(/<[^>]+>/g, '')
                    .trim()
                    .slice(0, 2000);

                // Match: prefer SKU match, then name match
                let existing = sku ? existingBySku.get(sku.toLowerCase()) : null;
                if (!existing) {
                    existing = existingByName.get(rawName.toLowerCase());
                }

                if (existing) {
                    // Update existing peptide with latest WooCommerce data
                    if (dryRun) {
                        results.updated.push(rawName);
                    } else {
                        const updates: Record<string, any> = {};
                        if (price && price > 0) updates.retail_price = price;
                        if (sku) updates.sku = sku;
                        if (description) updates.description = description;
                        updates.active = wooP.status === 'publish';

                        if (Object.keys(updates).length > 0) {
                            const { error: updateErr } = await supabase
                                .from('peptides')
                                .update(updates)
                                .eq('id', existing.id);
                            if (updateErr) throw new Error(updateErr.message);
                        }
                        results.updated.push(rawName);
                    }
                } else {
                    // Create new peptide
                    if (dryRun) {
                        results.created.push(rawName);
                    } else {
                        const { error: insertErr } = await supabase
                            .from('peptides')
                            .insert({
                                org_id: orgId,
                                name: rawName,
                                description: description || null,
                                sku: sku,
                                retail_price: price,
                                base_cost: salePrice && salePrice < (price || Infinity) ? salePrice : null,
                                active: wooP.status === 'publish',
                            });
                        if (insertErr) throw new Error(insertErr.message);
                        results.created.push(rawName);

                        // Update caches for duplicate detection within this batch
                        existingByName.set(rawName.toLowerCase(), { id: 'new', name: rawName, sku });
                        if (sku) existingBySku.set(sku.toLowerCase(), { id: 'new', name: rawName, sku });
                    }
                }
            } catch (err: any) {
                results.errors.push(`${wooP.name}: ${err.message}`);
            }
        }

        return res.status(200).json({
            dry_run: dryRun,
            woo_product_count: wooProducts.length,
            created: results.created.length,
            updated: results.updated.length,
            skipped: results.skipped.length,
            errors: results.errors.length,
            details: results,
        });

    } catch (error: any) {
        console.error('WooCommerce product sync failed:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
