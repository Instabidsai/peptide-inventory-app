import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Per-Tenant Health Status
 * GET /api/health/tenant-status
 * Returns health metrics per tenant for the vendor dashboard.
 * Requires super_admin authentication.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Verify super_admin
        const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'super_admin')
            .single();

        if (!role) {
            return res.status(403).json({ error: 'Super admin access required' });
        }

        // Fetch all orgs
        const { data: orgs } = await supabase
            .from('organizations')
            .select('id, name');

        if (!orgs?.length) {
            return res.status(200).json({ tenants: [] });
        }

        // Fetch health metrics per tenant
        const tenantStatuses = await Promise.all(
            orgs.map(async (org) => {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

                const [orders30d, ordersWeek, activeUsers, subscription] = await Promise.all([
                    supabase.from('sales_orders').select('id', { count: 'exact', head: true })
                        .eq('org_id', org.id).gte('created_at', thirtyDaysAgo),
                    supabase.from('sales_orders').select('id', { count: 'exact', head: true })
                        .eq('org_id', org.id).gte('created_at', sevenDaysAgo),
                    supabase.from('profiles').select('id', { count: 'exact', head: true })
                        .eq('org_id', org.id),
                    supabase.from('tenant_subscriptions').select('status, plan:subscription_plans(name, display_name)')
                        .eq('org_id', org.id).single(),
                ]);

                // Determine health: active = orders in last 7 days, warning = no orders in 7 days but in 30, inactive = no orders in 30 days
                let health: 'active' | 'warning' | 'inactive' = 'inactive';
                if ((ordersWeek.count || 0) > 0) health = 'active';
                else if ((orders30d.count || 0) > 0) health = 'warning';

                return {
                    org_id: org.id,
                    org_name: org.name,
                    health,
                    orders_30d: orders30d.count || 0,
                    orders_7d: ordersWeek.count || 0,
                    active_users: activeUsers.count || 0,
                    subscription_status: subscription.data?.status || 'none',
                    plan_name: (subscription.data?.plan as any)?.display_name || 'Free',
                };
            })
        );

        return res.status(200).json({ tenants: tenantStatuses });

    } catch (error: any) {
        console.error('Tenant health check failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
