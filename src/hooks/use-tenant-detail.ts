import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TenantDetail {
    org_id: string;
    org_name: string;
    created_at: string;
    config: {
        brand_name: string;
        admin_brand_name: string;
        support_email: string;
        app_url: string;
        logo_url: string;
        primary_color: string;
        secondary_color: string;
        font_family: string;
        ship_from_name: string;
        ship_from_city: string;
        ship_from_state: string;
        zelle_email: string;
        venmo_handle: string;
        cashapp_handle: string;
        ai_system_prompt_override: string;
        session_timeout_minutes: number;
        wholesale_tier_id: string | null;
        supplier_org_id: string | null;
    } | null;
    subscription: {
        plan_name: string;
        status: string;
        billing_period: string;
        stripe_customer_id: string | null;
        current_period_end: string | null;
        trial_end: string | null;
    } | null;
    counts: {
        users: number;
        peptides: number;
        bottles: number;
        contacts: number;
        orders: number;
        commissions: number;
    };
    automations: Array<{
        module_type: string;
        enabled: boolean;
        run_count: number;
        last_run_at: string | null;
    }>;
    ai_message_counts: {
        admin_chats: number;
        partner_chats: number;
    };
}

export function useTenantDetail(orgId: string | undefined) {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['tenant-detail', orgId],
        enabled: !!orgId && userRole?.role === 'super_admin',
        queryFn: async (): Promise<TenantDetail> => {
            if (!orgId) throw new Error('No org ID');

            // Fetch org
            const { data: org } = await supabase
                .from('organizations')
                .select('id, name, created_at')
                .eq('id', orgId)
                .maybeSingle();
            if (!org) throw new Error('Organization not found');

            // Fetch all data in parallel
            const [
                configRes,
                subRes,
                usersRes,
                peptidesRes,
                bottlesRes,
                contactsRes,
                ordersRes,
                commissionsRes,
                automationsRes,
                adminChatsRes,
                partnerChatsRes,
            ] = await Promise.all([
                supabase.from('tenant_config').select('*').eq('org_id', orgId).maybeSingle(),
                supabase.from('tenant_subscriptions').select('*, plan:subscription_plans(name, display_name)').eq('org_id', orgId).maybeSingle(),
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
                supabase.from('peptides').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
                supabase.from('bottles').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
                supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
                supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
                supabase.from('commissions').select('id', { count: 'exact', head: true }),
                supabase.from('automation_modules').select('module_type, enabled, run_count, last_run_at').eq('org_id', orgId),
                supabase.from('admin_chat_messages').select('id', { count: 'exact', head: true }),
                supabase.from('partner_chat_messages').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
            ]);

            const config = configRes.data;
            const sub = subRes.data;

            return {
                org_id: org.id,
                org_name: org.name,
                created_at: org.created_at,
                config: config ? {
                    brand_name: config.brand_name || org.name,
                    admin_brand_name: config.admin_brand_name || '',
                    support_email: config.support_email || '',
                    app_url: config.app_url || '',
                    logo_url: config.logo_url || '',
                    primary_color: config.primary_color || '#7c3aed',
                    secondary_color: config.secondary_color || '',
                    font_family: config.font_family || '',
                    ship_from_name: config.ship_from_name || '',
                    ship_from_city: config.ship_from_city || '',
                    ship_from_state: config.ship_from_state || '',
                    zelle_email: config.zelle_email || '',
                    venmo_handle: config.venmo_handle || '',
                    cashapp_handle: config.cashapp_handle || '',
                    ai_system_prompt_override: config.ai_system_prompt_override || '',
                    session_timeout_minutes: config.session_timeout_minutes || 60,
                    wholesale_tier_id: config.wholesale_tier_id || null,
                    supplier_org_id: config.supplier_org_id || null,
                } : null,
                subscription: sub ? {
                    plan_name: (sub.plan as { display_name?: string; name?: string } | null)?.display_name
                        || (sub.plan as { display_name?: string; name?: string } | null)?.name
                        || 'Unknown',
                    status: sub.status,
                    billing_period: sub.billing_period,
                    stripe_customer_id: sub.stripe_customer_id,
                    current_period_end: sub.current_period_end,
                    trial_end: sub.trial_end,
                } : null,
                counts: {
                    users: usersRes.count || 0,
                    peptides: peptidesRes.count || 0,
                    bottles: bottlesRes.count || 0,
                    contacts: contactsRes.count || 0,
                    orders: ordersRes.count || 0,
                    commissions: commissionsRes.count || 0,
                },
                automations: automationsRes.data || [],
                ai_message_counts: {
                    admin_chats: adminChatsRes.count || 0,
                    partner_chats: partnerChatsRes.count || 0,
                },
            };
        },
        staleTime: 30_000,
    });
}

export function useTenantAuditLog(orgId: string | undefined) {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['tenant-audit-log', orgId],
        enabled: !!orgId && userRole?.role === 'super_admin',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('audit_log')
                .select('*')
                .eq('org_id', orgId!)
                .order('created_at', { ascending: false })
                .limit(30);

            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}
