import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAllSubscriptions, useBillingEvents, calculateMRR } from './use-subscription';
import { useTenants } from './use-tenants';

export function useRevenueMetrics() {
    const { data: events } = useBillingEvents();
    const { data: subscriptions } = useAllSubscriptions();

    const mrr = calculateMRR(subscriptions || []);
    const arr = mrr * 12;
    const activeCount = (subscriptions || []).filter(s => s.status === 'active').length;
    const trialingCount = (subscriptions || []).filter(s => s.status === 'trialing').length;
    const canceledCount = (subscriptions || []).filter(s => s.status === 'canceled').length;
    const pastDueCount = (subscriptions || []).filter(s => s.status === 'past_due').length;

    // Revenue by month from billing events
    const monthlyRevenue = (events || [])
        .filter((e) => e.event_type === 'invoice.payment_succeeded' && e.amount_cents)
        .reduce((acc: Record<string, number>, e) => {
            const month = new Date(e.created_at).toISOString().slice(0, 7);
            acc[month] = (acc[month] || 0) + e.amount_cents;
            return acc;
        }, {});

    const revenueByMonth = Object.entries(monthlyRevenue)
        .map(([month, cents]) => ({ month, revenue: cents / 100 }))
        .sort((a, b) => a.month.localeCompare(b.month));

    return {
        mrr: mrr / 100,
        arr: arr / 100,
        activeCount,
        trialingCount,
        canceledCount,
        pastDueCount,
        revenueByMonth,
    };
}

export function usePlanDistribution() {
    const { data: subscriptions } = useAllSubscriptions();

    const distribution = (subscriptions || []).reduce((acc: Record<string, number>, s) => {
        const planName = s.plan?.display_name || 'Free';
        acc[planName] = (acc[planName] || 0) + 1;
        return acc;
    }, {});

    return Object.entries(distribution).map(([name, count]) => ({ name, count }));
}

export function useChurnRisk() {
    const { session, userRole } = useAuth();

    return useQuery({
        queryKey: ['churn-risk'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            if (!session?.access_token) return [];
            const res = await fetch('/api/health/tenant-status', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) return [];
            const data = await res.json();
            const tenants: TenantHealth[] = data.tenants || [];

            // Sort by risk: inactive first, then warning, then active
            const riskOrder: Record<string, number> = { inactive: 0, warning: 1, active: 2 };
            return tenants.sort((a, b) =>
                (riskOrder[a.health] ?? 3) - (riskOrder[b.health] ?? 3)
            );
        },
        staleTime: 60_000,
    });
}

export interface TenantHealth {
    org_id: string;
    org_name: string;
    health: string;
    plan: string | null;
    active_users: number;
    orders_7d: number;
    orders_30d: number;
}

export function useGrowthMetrics() {
    const { data: tenants } = useTenants();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newThisMonth = (tenants || []).filter(t =>
        new Date(t.created_at) >= thirtyDaysAgo
    ).length;

    const totalTenants = tenants?.length || 0;

    return { newThisMonth, totalTenants };
}
