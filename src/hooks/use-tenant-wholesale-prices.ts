import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';

export interface TenantWholesalePrice {
    id: string;
    org_id: string;
    peptide_id: string;
    wholesale_price: number;
}

/**
 * Fetch flat wholesale prices for a specific tenant org.
 * Used by the vendor admin to see/edit prices and by the tenant's order dialog.
 */
export function useTenantWholesalePrices(orgId: string | undefined | null) {
    return useQuery({
        queryKey: ['tenant-wholesale-prices', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tenant_wholesale_prices')
                .select('id, org_id, peptide_id, wholesale_price')
                .eq('org_id', orgId!);
            if (error) throw error;
            return (data || []) as TenantWholesalePrice[];
        },
        enabled: !!orgId,
        staleTime: 30_000,
    });
}

/**
 * Build a peptide_id → wholesale_price lookup map from the flat prices array.
 */
export function buildPriceMap(prices: TenantWholesalePrice[] | undefined): Map<string, number> {
    const map = new Map<string, number>();
    if (!prices) return map;
    for (const p of prices) {
        map.set(p.peptide_id, p.wholesale_price);
    }
    return map;
}

/**
 * Upsert flat wholesale prices for a tenant org.
 * Accepts an array of { peptide_id, wholesale_price } entries.
 * Entries with wholesale_price = 0 or null are deleted (revert to tier pricing).
 */
export function useUpsertTenantWholesalePrices(orgId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (entries: { peptide_id: string; wholesale_price: number | null }[]) => {
            const toUpsert = entries.filter(e => e.wholesale_price != null && e.wholesale_price > 0);
            const toDelete = entries.filter(e => e.wholesale_price == null || e.wholesale_price <= 0);

            // Delete cleared prices
            if (toDelete.length > 0) {
                const { error } = await supabase
                    .from('tenant_wholesale_prices')
                    .delete()
                    .eq('org_id', orgId)
                    .in('peptide_id', toDelete.map(e => e.peptide_id));
                if (error) throw error;
            }

            // Upsert prices
            if (toUpsert.length > 0) {
                const { error } = await supabase
                    .from('tenant_wholesale_prices')
                    .upsert(
                        toUpsert.map(e => ({
                            org_id: orgId,
                            peptide_id: e.peptide_id,
                            wholesale_price: e.wholesale_price,
                        })),
                        { onConflict: 'org_id,peptide_id' }
                    );
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenant-wholesale-prices', orgId] });
        },
    });
}
