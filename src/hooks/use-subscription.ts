import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SubscriptionPlan {
    id: string;
    name: string;
    display_name: string;
    price_monthly: number;
    price_yearly: number;
    max_users: number;
    max_peptides: number;
    max_orders_per_month: number;
    features: string[];
    stripe_monthly_price_id: string | null;
    stripe_yearly_price_id: string | null;
    sort_order: number;
    active: boolean;
}

export interface TenantSubscription {
    id: string;
    org_id: string;
    plan_id: string;
    status: string;
    billing_period: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    trial_end: string | null;
    plan?: SubscriptionPlan;
}

/** Fetch all available subscription plans */
export function useSubscriptionPlans() {
    return useQuery({
        queryKey: ['subscription-plans'],
        queryFn: async (): Promise<SubscriptionPlan[]> => {
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('active', true)
                .order('sort_order');

            if (error) throw error;
            return data || [];
        },
        staleTime: 300_000, // plans rarely change
    });
}

/** Fetch subscriptions for all tenants (super_admin only) */
export function useAllSubscriptions() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['all-subscriptions'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async (): Promise<TenantSubscription[]> => {
            const { data, error } = await supabase
                .from('tenant_subscriptions')
                .select('*, plan:subscription_plans(*)');

            if (error) throw error;
            return (data || []) as TenantSubscription[];
        },
        staleTime: 30_000,
    });
}

/** Fetch billing events (super_admin only) */
export function useBillingEvents(orgId?: string) {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['billing-events', orgId],
        enabled: userRole?.role === 'super_admin' || userRole?.role === 'admin',
        queryFn: async () => {
            let query = supabase
                .from('billing_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (orgId) {
                query = query.eq('org_id', orgId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}
