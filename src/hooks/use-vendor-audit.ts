import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export function useGlobalAuditLog(filters?: { orgId?: string; tableName?: string; action?: string }) {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['global-audit-log', filters],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            let query = supabase
                .from('audit_log')
                .select('*, org:organizations(name)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (filters?.orgId) query = query.eq('org_id', filters.orgId);
            if (filters?.tableName) query = query.eq('table_name', filters.tableName);
            if (filters?.action) query = query.eq('action', filters.action);

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}

export function usePlatformStats() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['platform-stats'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            const [orgs, profiles, peptides, bottles, orders, contacts] = await Promise.all([
                supabase.from('organizations').select('id', { count: 'exact', head: true }),
                supabase.from('profiles').select('id', { count: 'exact', head: true }),
                supabase.from('peptides').select('id', { count: 'exact', head: true }),
                supabase.from('bottles').select('id', { count: 'exact', head: true }),
                supabase.from('sales_orders').select('id', { count: 'exact', head: true }),
                supabase.from('contacts').select('id', { count: 'exact', head: true }),
            ]);

            return {
                organizations: orgs.count || 0,
                profiles: profiles.count || 0,
                peptides: peptides.count || 0,
                bottles: bottles.count || 0,
                sales_orders: orders.count || 0,
                contacts: contacts.count || 0,
            };
        },
        staleTime: 60_000,
    });
}

export function useFailedPayments() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['failed-payments'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('billing_events')
                .select('*, org:organizations(name)')
                .eq('event_type', 'invoice.payment_failed')
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}
