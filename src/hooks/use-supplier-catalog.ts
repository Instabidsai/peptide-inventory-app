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
 * Only returns data if the tenant has a supplier_org_id set in tenant_config.
 */
export function useSupplierCatalog(enabled = true) {
  const { profile } = useAuth();
  const orgId = profile?.org_id;

  return useQuery({
    queryKey: ['supplier-catalog', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_supplier_catalog');
      if (error) throw error;
      return (data || []) as SupplierPeptide[];
    },
    enabled: !!orgId && enabled,
    staleTime: 2 * 60 * 1000, // 2 min — supplier catalog doesn't change often
  });
}
