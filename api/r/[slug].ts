import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Short Referral URL Resolver
 * GET /r/:slug  →  302 redirect to /join?ref=ID&org=ORG
 * GET /r/:slug?p  →  302 redirect to /join?ref=ID&role=partner&tier=standard&org=ORG
 *
 * Resolves a human-readable slug (e.g. "diego-feroni") to the full referral URL.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const slug = req.query.slug;
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

    // Build redirect URL
    let redirectUrl = `/join?ref=${profile_id}&org=${org_id}`;

    // If ?p is present (any value, even empty), treat as partner signup
    if (req.query.p !== undefined) {
        redirectUrl += '&role=partner&tier=standard';
    }

    return res.redirect(302, redirectUrl);
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
