import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Health Check Endpoint
 * GET /api/health
 * Returns system health status for monitoring and vendor dashboard.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const checks: Record<string, { status: 'ok' | 'error'; latency_ms?: number; error?: string }> = {};
    const start = Date.now();

    // 1. Database connectivity
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            checks.database = { status: 'error', error: 'Missing configuration' };
        } else {
            const dbStart = Date.now();
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { error } = await supabase.from('organizations').select('id').limit(1);
            checks.database = error
                ? { status: 'error', error: error.message, latency_ms: Date.now() - dbStart }
                : { status: 'ok', latency_ms: Date.now() - dbStart };
        }
    } catch (err: any) {
        checks.database = { status: 'error', error: err.message };
    }

    // 2. Auth service
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
            const authStart = Date.now();
            const supabase = createClient(supabaseUrl, supabaseKey);
            const { error } = await supabase.auth.admin.listUsers({ perPage: 1 });
            checks.auth = error
                ? { status: 'error', error: error.message, latency_ms: Date.now() - authStart }
                : { status: 'ok', latency_ms: Date.now() - authStart };
        }
    } catch (err: any) {
        checks.auth = { status: 'error', error: err.message };
    }

    // 3. Payment provider
    try {
        const hasPsifi = !!process.env.PSIFI_API_KEY;
        const hasStripe = !!process.env.STRIPE_SECRET_KEY;
        checks.payments = (hasPsifi || hasStripe)
            ? { status: 'ok' }
            : { status: 'error', error: 'No payment provider configured' };
    } catch (err: any) {
        checks.payments = { status: 'error', error: err.message };
    }

    // 4. Environment config (don't leak var names in response)
    const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_SITE_URL'];
    const missingCount = requiredVars.filter(v => !process.env[v]).length;
    checks.config = missingCount
        ? { status: 'error', error: `${missingCount} required variable(s) missing` }
        : { status: 'ok' };

    // Overall status
    const allOk = Object.values(checks).every(c => c.status === 'ok');
    const totalLatency = Date.now() - start;

    return res.status(allOk ? 200 : 503).json({
        status: allOk ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        total_latency_ms: totalLatency,
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
        checks,
    });
}
