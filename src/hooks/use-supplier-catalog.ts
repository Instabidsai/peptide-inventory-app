import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SupplierPeptide {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  base_cost: number;
  retail_price: number | null;
  active: boolean;
}

/**
 * Fetches the supplier's live peptide catalog via the get_supplier_catalog RPC.
 * Passes the effective org_id so impersonation works correctly
 * (auth.uid() in the RPC is always the real user, not the impersonated one).
 */
export function useSupplierCatalog(enabled = true) {
  const { profile } = useAuth();
  const orgId = profile?.org_id;

  return useQuery({
    queryKey: ['supplier-catalog', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_supplier_catalog', { p_org_id: orgId });
      if (error) throw error;
      return (data || []) as SupplierPeptide[];
    },
    enabled: !!orgId && enabled,
    staleTime: 2 * 60 * 1000,
  });
}
