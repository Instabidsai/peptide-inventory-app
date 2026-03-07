import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export type PoolTxStatus = 'pending' | 'released' | 'failed' | 'settled' | 'chargeback';

export interface PoolTransaction {
  id: string;
  org_id: string;
  pool_id: string;
  woo_order_id: string;
  order_hash: string;
  amount: number;
  tx_hash: string | null;
  card_auth_code: string | null;
  card_last_four: string | null;
  status: PoolTxStatus;
  error_message: string | null;
  released_at: string | null;
  settled_at: string | null;
  created_at: string;
}

export function usePoolTransactions(poolId?: string) {
  const { profile } = useAuth();
  const orgId = profile?.org_id;

  return useQuery({
    queryKey: ['pool_transactions', orgId, poolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pool_transactions')
        .select('*')
        .eq('org_id', orgId!)
        .eq('pool_id', poolId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as PoolTransaction[];
    },
    enabled: !!orgId && !!poolId,
  });
}
