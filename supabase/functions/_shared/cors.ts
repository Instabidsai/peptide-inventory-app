/**
 * Standardized CORS helper for all Supabase Edge Functions.
 * Uses ALLOWED_ORIGINS env var (comma-separated whitelist) PLUS
 * hardcoded app domains so CORS never breaks even if env var is missing.
 */

// Hardcoded app domains — these ALWAYS work regardless of env var
const APP_ORIGINS = [
    'https://thepeptideai.com',
    'https://app.thepeptideai.com',
    'https://www.thepeptideai.com',
    'http://localhost:5173',       // local dev
    'http://localhost:8080',       // local dev alt
];

const envOrigins: string[] = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

const ALLOWED_ORIGINS: string[] = [...new Set([...APP_ORIGINS, ...envOrigins])];

/**
 * Build CORS headers from the request's Origin header.
 * Only reflects origins that appear in the ALLOWED_ORIGINS whitelist.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
        ? origin
        : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

/**
 * Handle CORS preflight. Returns a Response if this is an OPTIONS request, or null.
 * Usage: const preflight = handleCors(req); if (preflight) return preflight;
 */
export function handleCors(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req) });
    }
    return null;
}

/**
 * JSON response helper with CORS headers.
 */
export function jsonResponse(
    body: object,
    status: number,
    corsHeaders: Record<string, string>,
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
