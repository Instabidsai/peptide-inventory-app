import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';

/**
 * Fetches the current partner's active discount code for their org.
 * Used by ReferralLinkCard to display the external store link with coupon.
 */
export function usePartnerDiscountCode(partnerId?: string, orgId?: string) {
    return useQuery({
        queryKey: ['partner-discount-code', partnerId, orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('partner_discount_codes')
                .select('code, discount_percent')
                .eq('org_id', orgId!)
                .eq('partner_id', partnerId!)
                .eq('active', true)
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data as { code: string; discount_percent: number } | null;
        },
        enabled: !!partnerId && !!orgId,
        staleTime: 120_000,
    });
}
