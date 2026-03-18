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
            // Resolve profile_id (profiles.id) to user_id (profiles.user_id)
            // because partner_discount_codes.partner_id FK references profiles.user_id
            const { data: profileRecord } = await supabase
                .from('profiles')
                .select('user_id')
                .eq('id', profile_id)
                .maybeSingle();

            const partnerId = profileRecord?.user_id || profile_id;

            // Look up partner's active discount code
            const { data: discountCode } = await supabase
                .from('partner_discount_codes')
                .select('code')
                .eq('org_id', org_id)
                .eq('partner_id', partnerId)
                .eq('active', true)
                .limit(1)
                .maybeSingle();

            if (discountCode?.code) {
                const baseUrl = tenantConfig.external_store_url.replace(/\/+$/, '');
                const platform = tenantConfig.external_store_platform || 'woocommerce';

                if (platform === 'shopify') {
                    // Shopify natively auto-applies coupons via /discount/CODE
                    return res.redirect(302, `${baseUrl}/discount/${encodeURIComponent(discountCode.code)}`);
                }

                // WooCommerce: check if store has its own coupon capture (headless sites)
                const { data: autoCapture } = await supabase
                    .from('org_features')
                    .select('enabled')
                    .eq('org_id', org_id)
                    .eq('feature_key', 'coupon_auto_capture')
                    .maybeSingle();

                const storeUrl = `${baseUrl}/?coupon=${encodeURIComponent(discountCode.code)}`;

                if (autoCapture?.enabled) {
                    // Headless store with CouponCapture component — direct redirect
                    return res.redirect(302, storeUrl);
                }

                // Standard WooCommerce — show landing page that copies coupon + redirects
                return res.status(200).send(couponLandingPage(discountCode.code, storeUrl));
            }
        }
    }

    // Default: internal redirect (current behavior)
    return res.redirect(302, `/join?ref=${profile_id}&org=${org_id}`);
}

function couponLandingPage(code: string, storeUrl: string): string {
    const escaped = code.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    const escapedUrl = storeUrl.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    return `<!DOCTYPE html>
<html>
<head>
    <title>Your Discount is Ready!</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; }
        .card { text-align: center; padding: 2.5rem 2rem; max-width: 420px; width: 90%; background: rgba(255,255,255,0.05); border-radius: 16px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
        .icon { font-size: 3rem; margin-bottom: 1rem; }
        h1 { font-size: 1.4rem; margin-bottom: 0.5rem; font-weight: 600; }
        .subtitle { color: #94a3b8; margin-bottom: 1.5rem; font-size: 0.95rem; }
        .code-box { display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: rgba(34,197,94,0.1); border: 2px dashed #22c55e; border-radius: 10px; padding: 0.8rem 1.2rem; margin-bottom: 1.5rem; cursor: pointer; transition: background 0.2s; }
        .code-box:hover { background: rgba(34,197,94,0.2); }
        .code-text { font-size: 1.5rem; font-weight: 700; letter-spacing: 2px; color: #22c55e; font-family: monospace; }
        .copy-icon { font-size: 1.2rem; opacity: 0.7; }
        .copied { color: #22c55e; font-size: 0.85rem; min-height: 1.2rem; margin-bottom: 1rem; }
        .btn { display: inline-block; background: #22c55e; color: #0f172a; font-weight: 600; font-size: 1rem; padding: 0.8rem 2rem; border-radius: 8px; text-decoration: none; transition: background 0.2s; }
        .btn:hover { background: #16a34a; }
        .timer { color: #64748b; font-size: 0.8rem; margin-top: 1rem; }
        .step { display: flex; align-items: flex-start; gap: 0.6rem; text-align: left; margin-bottom: 0.5rem; color: #cbd5e1; font-size: 0.9rem; }
        .step-num { background: #22c55e; color: #0f172a; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; flex-shrink: 0; }
        .steps { margin-bottom: 1.5rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🎉</div>
        <h1>Your Discount is Ready!</h1>
        <p class="subtitle">Use this code at checkout for your exclusive discount</p>
        <div class="code-box" onclick="copyCode()" id="codeBox">
            <span class="code-text">${escaped}</span>
            <span class="copy-icon" id="copyIcon">📋</span>
        </div>
        <p class="copied" id="copiedMsg">&nbsp;</p>
        <div class="steps">
            <div class="step"><span class="step-num">1</span> Code copied to your clipboard</div>
            <div class="step"><span class="step-num">2</span> Shop and add items to cart</div>
            <div class="step"><span class="step-num">3</span> Paste code at checkout</div>
        </div>
        <a href="${escapedUrl}" class="btn" id="shopBtn">Shop Now →</a>
        <p class="timer" id="timer">Redirecting to store in <strong>5</strong> seconds...</p>
    </div>
    <script>
        var code = ${JSON.stringify(code)};
        var url = ${JSON.stringify(storeUrl)};
        function copyCode() {
            navigator.clipboard.writeText(code).then(function() {
                document.getElementById('copiedMsg').textContent = 'Copied to clipboard!';
                document.getElementById('copyIcon').textContent = '✅';
            }).catch(function() {
                document.getElementById('copiedMsg').textContent = 'Copy: ' + code;
            });
        }
        // Auto-copy on load
        copyCode();
        // Countdown redirect
        var sec = 5;
        var iv = setInterval(function() {
            sec--;
            if (sec <= 0) { clearInterval(iv); window.location.href = url; }
            else { document.querySelector('#timer strong').textContent = sec; }
        }, 1000);
    </script>
</body>
</html>`;
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
