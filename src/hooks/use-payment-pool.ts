import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type PoolStatus = 'setup' | 'deployed' | 'funded' | 'active' | 'paused';
export type PoolChain = 'base' | 'base_sepolia' | 'polygon';
export type CardProcessor = 'nmi' | 'authorize_net';

export interface PaymentPool {
  id: string;
  org_id: string;
  chain: PoolChain;
  contract_address: string | null;
  merchant_wallet: string;
  operator_address: string | null;
  operator_private_key_encrypted: string | null;
  usdc_balance: number;
  max_per_tx: number;
  daily_limit: number;
  status: PoolStatus;
  card_processor: CardProcessor | null;
  processor_api_key_encrypted: string | null;
  processor_public_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePoolInput {
  org_id: string;
  chain?: PoolChain;
  merchant_wallet?: string;
  status?: PoolStatus;
  card_processor?: CardProcessor;
  processor_public_key?: string;
  processor_api_key_encrypted?: string;
}

export interface UpdatePoolInput {
  id: string;
  [key: string]: unknown;
}

export function usePaymentPool() {
  const { profile } = useAuth();
  const orgId = profile?.org_id;

  return useQuery({
    queryKey: ['payment_pool', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_pools')
        .select('*')
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data as PaymentPool | null;
    },
    enabled: !!orgId,
  });
}

export function useCreatePool() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreatePoolInput) => {
      const { data, error } = await supabase
        .from('payment_pools')
        .insert({
          ...input,
          max_per_tx: 5000,
          daily_limit: 25000,
          status: 'setup',
        })
        .select()
        .single();
      if (error) throw error;
      return data as PaymentPool;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment_pool', data.org_id] });
      toast({ title: 'Payment pool created' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to create pool', description: (err as Error).message });
    },
  });
}

export function useUpdatePool() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdatePoolInput) => {
      const { data, error } = await supabase
        .from('payment_pools')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PaymentPool;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment_pool', data.org_id] });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to update pool', description: (err as Error).message });
    },
  });
}
