/**
 * Shared authentication helper for Supabase Edge Functions.
 * Extracts the gold-standard 3-layer auth pattern:
 *   1. Auth header exists
 *   2. JWT is valid (supabase.auth.getUser)
 *   3. Role check via user_roles table
 *
 * Also supports CRON_SECRET auth for cron-triggered functions.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Types ────────────────────────────────────────────────────────

export interface AuthResult {
    user: { id: string; email: string };
    role: string;
    orgId: string;
    supabase: SupabaseClient;
}

export interface AuthOptions {
    /** Roles that are allowed. Empty = any authenticated user. */
    requireRole?: string[];
    /** Whether org_id is required (default: true). */
    requireOrg?: boolean;
}

export class AuthError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
    }
}

// ── Main auth function ───────────────────────────────────────────

/**
 * Authenticate a request using JWT + role check.
 * Throws AuthError on failure — catch it and return the appropriate HTTP response.
 *
 * @example
 * ```ts
 * try {
 *     const { user, role, orgId, supabase } = await authenticateRequest(req);
 *     // ... your logic
 * } catch (err) {
 *     if (err instanceof AuthError) {
 *         return jsonResponse({ error: err.message }, err.status, corsHeaders);
 *     }
 *     throw err;
 * }
 * ```
 */
export async function authenticateRequest(
    req: Request,
    options: AuthOptions = {},
): Promise<AuthResult> {
    const { requireRole = [], requireOrg = true } = options;

    const sbUrl = Deno.env.get('SUPABASE_URL');
    const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sbUrl || !sbServiceKey) {
        throw new AuthError('Server misconfigured', 500);
    }

    // Layer 1: Auth header exists
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        throw new AuthError('Unauthorized: missing auth header', 401);
    }

    const supabase = createClient(sbUrl, sbServiceKey);

    // Layer 2: JWT is valid
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        throw new AuthError('Unauthorized: invalid token', 401);
    }

    // Layer 3: Role + org check via user_roles
    const { data: userRole } = await supabase
        .from('user_roles')
        .select('role, org_id')
        .eq('user_id', user.id)
        .single();

    const role = userRole?.role || '';
    const orgId = userRole?.org_id || '';

    if (requireOrg && !orgId) {
        throw new AuthError('Forbidden: no organization linked', 403);
    }

    if (requireRole.length > 0 && !requireRole.includes(role)) {
        throw new AuthError(
            `Forbidden: requires role ${requireRole.join(' or ')}, got ${role || 'none'}`,
            403,
        );
    }

    return {
        user: { id: user.id, email: user.email || '' },
        role,
        orgId,
        supabase,
    };
}

// ── Cron auth ────────────────────────────────────────────────────

/**
 * Authenticate a cron-triggered request using CRON_SECRET.
 * Returns a service-role Supabase client on success.
 *
 * @example
 * ```ts
 * try {
 *     const supabase = authenticateCron(req);
 *     // ... your logic
 * } catch (err) {
 *     if (err instanceof AuthError) {
 *         return jsonResponse({ error: err.message }, err.status, corsHeaders);
 *     }
 *     throw err;
 * }
 * ```
 */
export function authenticateCron(req: Request): SupabaseClient {
    const sbUrl = Deno.env.get('SUPABASE_URL');
    const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sbUrl || !sbServiceKey) {
        throw new AuthError('Server misconfigured', 500);
    }

    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret) {
        throw new AuthError('CRON_SECRET not configured', 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        throw new AuthError('Unauthorized: invalid cron secret', 401);
    }

    return createClient(sbUrl, sbServiceKey);
}

/**
 * Create a service-role Supabase client (no auth check).
 * Use only when auth is handled separately (e.g., after authenticateRequest).
 */
export function createServiceClient(): SupabaseClient {
    const sbUrl = Deno.env.get('SUPABASE_URL');
    const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sbUrl || !sbServiceKey) {
        throw new AuthError('Server misconfigured', 500);
    }
    return createClient(sbUrl, sbServiceKey);
}
