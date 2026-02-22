import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TenantSummary {
    org_id: string;
    org_name: string;
    brand_name: string;
    admin_brand_name: string;
    support_email: string;
    app_url: string;
    logo_url: string;
    primary_color: string;
    created_at: string;
    // Aggregated counts
    user_count: number;
    peptide_count: number;
    order_count: number;
}

export function useTenants() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['vendor-tenants'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async (): Promise<TenantSummary[]> => {
            // Fetch all orgs (super_admin RLS policy allows this)
            const { data: orgs, error: orgsError } = await supabase
                .from('organizations')
                .select('id, name, created_at')
                .order('created_at', { ascending: false });

            if (orgsError) throw orgsError;
            if (!orgs?.length) return [];

            // Fetch tenant configs
            const { data: configs } = await supabase
                .from('tenant_config')
                .select('org_id, brand_name, admin_brand_name, support_email, app_url, logo_url, primary_color');

            const configMap = new Map(
                (configs || []).map(c => [c.org_id, c])
            );

            // Fetch counts for all orgs in a single RPC call (no N+1)
            const { data: counts } = await supabase.rpc('get_org_counts');
            const countMap = new Map(
                (counts || []).map((c: any) => [c.org_id, c])
            );

            return orgs.map((org) => {
                const config = configMap.get(org.id);
                const c = countMap.get(org.id);

                return {
                    org_id: org.id,
                    org_name: org.name,
                    brand_name: config?.brand_name || org.name,
                    admin_brand_name: config?.admin_brand_name || org.name,
                    support_email: config?.support_email || '',
                    app_url: config?.app_url || '',
                    logo_url: config?.logo_url || '',
                    primary_color: config?.primary_color || '#7c3aed',
                    created_at: org.created_at,
                    user_count: Number(c?.user_count) || 0,
                    peptide_count: Number(c?.peptide_count) || 0,
                    order_count: Number(c?.order_count) || 0,
                };
            });
        },
        staleTime: 60_000,
    });
}

export function useProvisionTenant() {
    const queryClient = useQueryClient();
    const { session } = useAuth();

    return useMutation({
        mutationFn: async (payload: {
            org_name: string;
            admin_email: string;
            admin_name: string;
            admin_password?: string;
            brand_name?: string;
            support_email?: string;
            primary_color?: string;
            seed_sample_peptides?: boolean;
        }) => {
            const { data, error } = await supabase.functions.invoke('provision-tenant', {
                body: payload,
                headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                },
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Provisioning failed');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vendor-tenants'] });
        },
    });
}
