import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface TierConfig {
    id: string;
    org_id: string;
    tier_key: string;
    label: string;
    emoji: string;
    commission_rate: number;
    price_multiplier: number;
    pricing_mode: string;
    cost_plus_markup: number;
    can_recruit: boolean;
    sort_order: number;
    active: boolean;
    created_at: string;
    updated_at: string;
}

/** Fetch all tier configs for a given org. Falls back to hardcoded defaults if table is empty. */
export function useTierConfig(orgId?: string | null) {
    const { profile } = useAuth();
    const resolvedOrgId = orgId || profile?.org_id;

    return useQuery({
        queryKey: ['tier_config', resolvedOrgId],
        queryFn: async () => {
            if (!resolvedOrgId) return [] as TierConfig[];
            const { data, error } = await supabase
                .from('partner_tier_config')
                .select('*')
                .eq('org_id', resolvedOrgId)
                .order('sort_order', { ascending: true });
            if (error) {
                console.error('useTierConfig error:', error);
                return FALLBACK_TIERS;
            }
            return (data?.length ? data : FALLBACK_TIERS) as TierConfig[];
        },
        enabled: !!resolvedOrgId,
        staleTime: 5 * 60 * 1000, // cache 5 min — tier config rarely changes
    });
}

/** Build a lookup map from tier_key → TierConfig. Useful for replacing hardcoded TIER_INFO. */
export function useTierMap(orgId?: string | null) {
    const { data: tiers, ...rest } = useTierConfig(orgId);
    const map = new Map<string, TierConfig>();
    tiers?.forEach((t) => map.set(t.tier_key, t));
    return { tierMap: map, tiers, ...rest };
}

/** Mutation to upsert a tier config row. */
export function useUpsertTierConfig() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (tier: Partial<TierConfig> & { org_id: string; tier_key: string }) => {
            const { error } = await supabase
                .from('partner_tier_config')
                .upsert(tier, { onConflict: 'org_id,tier_key' });
            if (error) throw error;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['tier_config', variables.org_id] });
            toast({ title: 'Tier updated' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Failed to save tier', description: err.message });
        },
    });
}

/** Mutation to delete a tier config row. */
export function useDeleteTierConfig() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, org_id }: { id: string; org_id: string }) => {
            const { error } = await supabase
                .from('partner_tier_config')
                .delete()
                .eq('id', id);
            if (error) throw error;
            return org_id;
        },
        onSuccess: (org_id) => {
            queryClient.invalidateQueries({ queryKey: ['tier_config', org_id] });
            toast({ title: 'Tier removed' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Failed to delete tier', description: err.message });
        },
    });
}

/** Helper: Build the TIER_INFO-style object that types.ts used to export. */
export function tierToInfo(tier: TierConfig) {
    const discountLabel = tier.pricing_mode === 'cost_plus'
        ? `Cost + $${tier.cost_plus_markup}`
        : tier.pricing_mode === 'cost_multiplier'
            ? `${tier.price_multiplier}x cost`
            : `${Math.round((1 - tier.price_multiplier) * 100)}% off retail`;

    return {
        label: tier.label,
        emoji: tier.emoji,
        discount: discountLabel,
        commission_rate: tier.commission_rate,
        price_multiplier: tier.price_multiplier,
        can_recruit: tier.can_recruit,
    };
}

/** Hardcoded fallback if the database table doesn't exist or is empty. */
const FALLBACK_TIERS: TierConfig[] = [
    { id: '', org_id: '', tier_key: 'senior', label: 'Senior Partner', emoji: '🥇', commission_rate: 0.10, price_multiplier: 2.0, pricing_mode: 'cost_multiplier', cost_plus_markup: 2.0, can_recruit: true, sort_order: 1, active: true, created_at: '', updated_at: '' },
    { id: '', org_id: '', tier_key: 'standard', label: 'Standard Partner', emoji: '🥈', commission_rate: 0.10, price_multiplier: 2.0, pricing_mode: 'cost_multiplier', cost_plus_markup: 2.0, can_recruit: false, sort_order: 2, active: true, created_at: '', updated_at: '' },
    { id: '', org_id: '', tier_key: 'referral', label: 'Referral Partner', emoji: '🔗', commission_rate: 0.075, price_multiplier: 0.8, pricing_mode: 'percentage', cost_plus_markup: 2.0, can_recruit: false, sort_order: 3, active: true, created_at: '', updated_at: '' },
];
