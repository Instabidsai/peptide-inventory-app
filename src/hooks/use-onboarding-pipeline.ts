import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OnboardingStatus {
    org_id: string;
    org_name: string;
    brand_name: string;
    created_at: string;
    milestones: {
        signed_up: boolean;
        configured_branding: boolean;
        added_peptide: boolean;
        added_contact: boolean;
        first_order: boolean;
        payment_connected: boolean;
        automation_enabled: boolean;
    };
    stage: 'signed_up' | 'configured' | 'catalog_ready' | 'customers_added' | 'active';
    completedCount: number;
    daysSinceSignup: number;
}

export function useOnboardingPipeline() {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['onboarding-pipeline'],
        enabled: userRole?.role === 'super_admin',
        queryFn: async (): Promise<OnboardingStatus[]> => {
            // Fetch all orgs
            const { data: orgs } = await supabase
                .from('organizations')
                .select('id, name, created_at')
                .order('created_at', { ascending: false });

            if (!orgs?.length) return [];

            // Fetch configs
            const { data: configs } = await supabase
                .from('tenant_config')
                .select('org_id, brand_name, logo_url, primary_color');
            const configMap = new Map((configs || []).map(c => [c.org_id, c]));

            // Fetch payment provider keys (PsiFi or Stripe)
            const { data: paymentKeys } = await supabase
                .from('tenant_api_keys')
                .select('org_id, service')
                .in('service', ['psifi_api_key', 'stripe_secret_key']);
            const paymentOrgIds = new Set((paymentKeys || []).map(k => k.org_id));

            // Fetch counts for all orgs in a single RPC call (no N+1)
            const { data: counts } = await supabase.rpc('get_org_counts');
            const countMap = new Map(
                (counts || []).map((c: { org_id: string }) => [c.org_id, c])
            );

            const statuses = orgs.map((org) => {
                const config = configMap.get(org.id);
                const c = countMap.get(org.id);

                const hasBranding = config && (config.logo_url || config.primary_color !== '#7c3aed');
                const hasPeptide = Number(c?.peptide_count) > 0;
                const hasContact = Number(c?.contact_count) > 0;
                const hasOrder = Number(c?.order_count) > 0;
                const hasPayment = paymentOrgIds.has(org.id);
                const hasAutomation = Number(c?.automation_count) > 0;

                const milestones = {
                    signed_up: true,
                    configured_branding: !!hasBranding,
                    added_peptide: hasPeptide,
                    added_contact: hasContact,
                    first_order: hasOrder,
                    payment_connected: hasPayment,
                    automation_enabled: hasAutomation,
                };

                const completedCount = Object.values(milestones).filter(Boolean).length;

                let stage: OnboardingStatus['stage'] = 'signed_up';
                if (hasOrder) stage = 'active';
                else if (hasContact) stage = 'customers_added';
                else if (hasPeptide) stage = 'catalog_ready';
                else if (hasBranding) stage = 'configured';

                const daysSinceSignup = Math.floor(
                    (Date.now() - new Date(org.created_at).getTime()) / (1000 * 60 * 60 * 24)
                );

                return {
                    org_id: org.id,
                    org_name: org.name,
                    brand_name: config?.brand_name || org.name,
                    created_at: org.created_at,
                    milestones,
                    stage,
                    completedCount,
                    daysSinceSignup,
                };
            });

            return statuses;
        },
        staleTime: 60_000,
    });
}
