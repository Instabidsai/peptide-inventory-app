import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_PAGE_SIZE, type PaginationState } from '@/hooks/use-pagination';
import { logger } from '@/lib/logger';

export interface Peptide {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  stock_count?: number;
  avg_cost?: number;
  retail_price: number | null;
  base_cost?: number | null;
  default_dose_amount?: number | null;
  default_dose_unit?: string | null;
  default_frequency?: string | null;
  default_timing?: string | null;
  default_concentration_mg_ml?: number | null;
  reconstitution_notes?: string | null;
  visible_to_user_ids?: string[] | null;
  catalog_source?: 'website' | 'supplier' | 'manual' | null;
}

export interface CreatePeptideInput {
  name: string;
  description?: string;
  sku?: string;
  retail_price?: number;
}

export interface UpdatePeptideInput extends Partial<CreatePeptideInput> {
  active?: boolean;
}

export function usePeptides(pagination?: PaginationState) {
  const { user, profile } = useAuth();
  const page = pagination?.page ?? 0;
  const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;

  return useQuery({
    queryKey: ['peptides', profile?.org_id, page, pageSize],
    queryFn: async () => {
      // 1. Fetch peptides (paginated)
      const { data: peptidesData, error: peptidesError } = await supabase
        .from('peptides')
        .select('*')
        .eq('org_id', profile!.org_id!)
        .order('name')
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (peptidesError) throw peptidesError;

      // 2. Fetch all lots to calculate true historical average cost
      const { data: lotsData, error: lotsError } = await supabase
        .from('lots')
        .select('peptide_id, cost_per_unit')
        .eq('org_id', profile!.org_id!);

      if (lotsError) throw lotsError;

      // 3. Fetch in-stock bottle counts via RPC (Bypass 1000-row limit)
      const { data: stockCounts, error: stockError } = await supabase
        .rpc('get_peptide_stock_counts', { p_org_id: profile!.org_id! });

      if (stockError) {
        logger.error('Failed to fetch stock counts:', stockError);
        // Don't throw, just show 0 stock to avoid crashing app if RPC is missing
      }

      // 4. Aggregate data
      const peptideStats: Record<string, { totalStock: number, totalLotCost: number, lotCount: number }> = {};

      // Initialize stats for each peptide
      peptidesData?.forEach(p => {
        peptideStats[p.id] = { totalStock: 0, totalLotCost: 0, lotCount: 0 };
      });

      // Calculate historical average cost from lots
      lotsData?.forEach(lot => {
        if (lot.peptide_id && peptideStats[lot.peptide_id]) {
          peptideStats[lot.peptide_id].totalLotCost += Number(lot.cost_per_unit || 0);
          peptideStats[lot.peptide_id].lotCount += 1;
        }
      });

      // Apply stock counts from RPC
      stockCounts?.forEach((item: { peptide_id: string; stock_count: number }) => {
        if (peptideStats[item.peptide_id]) {
          peptideStats[item.peptide_id].totalStock = Number(item.stock_count);
        }
      });

      // 5. Merge + filter by visibility
      const profileId = profile!.id;
      return (peptidesData as Peptide[])
        .filter(p => {
          // If visible_to_user_ids is null/empty, visible to everyone
          if (!p.visible_to_user_ids || p.visible_to_user_ids.length === 0) return true;
          // Otherwise, only visible if current user's profile ID is in the list
          return p.visible_to_user_ids.includes(profileId);
        })
        .map(peptide => {
          const stats = peptideStats[peptide.id];
          return {
            ...peptide,
            stock_count: stats.totalStock,
            avg_cost: stats.lotCount > 0 ? stats.totalLotCost / stats.lotCount : 0
          };
        });
    },
    enabled: !!user && !!profile?.org_id,
  });
}

export function usePeptide(id: string) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['peptides', id, profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('peptides')
        .select('*')
        .eq('id', id)
        .eq('org_id', profile!.org_id!)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Peptide not found');
      return data as Peptide;
    },
    enabled: !!id && !!user && !!profile?.org_id,
  });
}

export function useCreatePeptide() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreatePeptideInput) => {
      // Get org_id from profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.org_id) throw new Error('No organization found');

      const { data, error } = await supabase
        .from('peptides')
        .insert({ ...input, org_id: profile.org_id })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peptides'] });
      toast({ title: 'Peptide created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to create peptide', description: error.message });
    },
  });
}

export function useUpdatePeptide() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdatePeptideInput & { id: string }) => {
      const { data, error } = await supabase
        .from('peptides')
        .update(input)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peptides'] });
      toast({ title: 'Peptide updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update peptide', description: error.message });
    },
  });
}

export function useDeletePeptide() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('peptides')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peptides'] });
      toast({ title: 'Peptide deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete peptide', description: error.message });
    },
  });
}
