import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WholesaleTier {
    id: string;
    name: string;
    min_monthly_units: number;
    discount_pct: number;
    sort_order: number;
    active: boolean;
}

// ── Pure pricing functions ──

export function calculateWholesalePrice(retailPrice: number, discountPct: number): number {
    return +(retailPrice * (1 - discountPct)).toFixed(2);
}

export function calculateMargin(retailPrice: number, wholesalePrice: number): number {
    return +(retailPrice - wholesalePrice).toFixed(2);
}

export function calculateMarginPct(retailPrice: number, wholesalePrice: number): number {
    if (retailPrice <= 0) return 0;
    return +((retailPrice - wholesalePrice) / retailPrice * 100).toFixed(1);
}

// ── Hooks ──

/** Fetch all active wholesale tiers (global, cached 5 min) */
export function useWholesaleTiers() {
    return useQuery({
        queryKey: ['wholesale_pricing_tiers'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('wholesale_pricing_tiers')
                .select('*')
                .eq('active', true)
                .order('sort_order');
            if (error) throw error;
            return (data || []) as WholesaleTier[];
        },
        staleTime: 5 * 60 * 1000,
    });
}

/** Fetch this org's assigned wholesale tier from tenant_config */
export function useOrgWholesaleTier() {
    const { profile } = useAuth();
    const orgId = profile?.org_id;

    return useQuery({
        queryKey: ['org_wholesale_tier', orgId],
        queryFn: async () => {
            if (!orgId) return null;
            const { data, error } = await supabase
                .from('tenant_config')
                .select('wholesale_tier_id, supplier_org_id')
                .eq('org_id', orgId)
                .single();
            if (error) throw error;
            if (!data?.wholesale_tier_id) return null;

            const { data: tier, error: tierError } = await supabase
                .from('wholesale_pricing_tiers')
                .select('*')
                .eq('id', data.wholesale_tier_id)
                .single();
            if (tierError) throw tierError;
            return {
                tier: tier as WholesaleTier,
                supplier_org_id: data.supplier_org_id as string | null,
            };
        },
        enabled: !!orgId,
        staleTime: 5 * 60 * 1000,
    });
}

/** Check if a subdomain is available */
export function useSubdomainCheck(subdomain: string) {
    const trimmed = subdomain.toLowerCase().trim();
    return useQuery({
        queryKey: ['subdomain_check', trimmed],
        queryFn: async () => {
            if (!trimmed || trimmed.length < 3) return { available: false, reason: 'Too short (min 3 chars)' };
            if (!/^[a-z0-9-]+$/.test(trimmed)) return { available: false, reason: 'Only letters, numbers, and hyphens' };
            if (['www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp'].includes(trimmed)) {
                return { available: false, reason: 'Reserved name' };
            }
            const { data, error } = await supabase.rpc('check_subdomain_availability', { p_subdomain: trimmed });
            if (error) throw error;
            return { available: !!data, reason: data ? '' : 'Already taken' };
        },
        enabled: trimmed.length >= 3,
        staleTime: 10 * 1000,
    });
}
