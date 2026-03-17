import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Short Referral URL Resolver
 * Vercel rewrite: /r/:slug → /api/ref?s=:slug
 *
 * GET /r/diego-feroni   → 302 redirect to /join?ref=ID&org=ORG
 * GET /r/diego-feroni?p → 302 redirect to /join?ref=ID&role=partner&tier=standard&org=ORG
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const slug = req.query.s;
    if (!slug || typeof slug !== 'string') {
        return res.status(400).send(notFoundPage());
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .rpc('resolve_referral_slug', { p_slug: slug });

    if (error || !data || data.length === 0) {
        return res.status(404).send(notFoundPage());
    }

    const { profile_id, org_id } = data[0];

    // Partner recruitment links (?p) ALWAYS go to internal app
    if (req.query.p !== undefined) {
        return res.redirect(302, `/join?ref=${profile_id}&org=${org_id}&role=partner&tier=standard`);
    }

    // Check if external referral links are enabled for this org
    const { data: featureFlag } = await supabase
        .from('org_features')
        .select('enabled')
        .eq('org_id', org_id)
        .eq('feature_key', 'external_referral_links')
        .maybeSingle();

    if (featureFlag?.enabled) {
        // Look up external store URL and platform
        const { data: tenantConfig } = await supabase
            .from('tenant_config')
            .select('external_store_url, external_store_platform')
            .eq('org_id', org_id)
            .maybeSingle();

        if (tenantConfig?.external_store_url) {
            // Look up partner's active discount code
            const { data: discountCode } = await supabase
                .from('partner_discount_codes')
                .select('code')
                .eq('org_id', org_id)
                .eq('partner_id', profile_id)
                .eq('active', true)
                .limit(1)
                .maybeSingle();

            if (discountCode?.code) {
                const baseUrl = tenantConfig.external_store_url.replace(/\/+$/, '');
                const platform = tenantConfig.external_store_platform || 'woocommerce';

                let externalUrl: string;
                if (platform === 'shopify') {
                    // Shopify native format: store.com/discount/CODE
                    externalUrl = `${baseUrl}/discount/${encodeURIComponent(discountCode.code)}`;
                } else {
                    // WooCommerce native format: store.com/?coupon=CODE
                    const separator = baseUrl.includes('?') ? '&' : '?';
                    externalUrl = `${baseUrl}${separator}coupon=${encodeURIComponent(discountCode.code)}`;
                }

                return res.redirect(302, externalUrl);
            }
        }
    }

    // Default: internal redirect (current behavior)
    return res.redirect(302, `/join?ref=${profile_id}&org=${org_id}`);
}

function notFoundPage(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Link Not Found</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #334155; }
        .box { text-align: center; padding: 2rem; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { color: #64748b; }
        a { color: #2563eb; text-decoration: none; }
    </style>
</head>
<body>
    <div class="box">
        <h1>Referral link not found</h1>
        <p>This link may have expired or the URL is incorrect.</p>
        <p><a href="/">Go to homepage</a></p>
    </div>
</body>
</html>`;
}
