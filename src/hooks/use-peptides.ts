import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

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

export function usePeptides() {
  return useQuery({
    queryKey: ['peptides'],
    queryFn: async () => {
      // 1. Fetch all peptides independent of bottles
      const { data: peptidesData, error: peptidesError } = await supabase
        .from('peptides')
        .select('*')
        .order('name');

      if (peptidesError) throw peptidesError;

      // 2. Fetch all lots to calculate true historical average cost
      const { data: lotsData, error: lotsError } = await supabase
        .from('lots')
        .select('peptide_id, cost_per_unit');

      if (lotsError) throw lotsError;

      // 3. Fetch in-stock bottle counts
      const { data: bottlesData, error: bottlesError } = await supabase
        .from('bottles')
        .select('lot_id, lots(peptide_id)')
        .eq('status', 'in_stock');

      if (bottlesError) throw bottlesError;

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

      // Count in-stock bottles
      bottlesData?.forEach((b: any) => {
        const pId = b.lots?.peptide_id;
        if (pId && peptideStats[pId]) {
          peptideStats[pId].totalStock += 1;
        }
      });

      // 5. Merge
      return (peptidesData as Peptide[]).map(peptide => {
        const stats = peptideStats[peptide.id];
        return {
          ...peptide,
          stock_count: stats.totalStock,
          avg_cost: stats.lotCount > 0 ? stats.totalLotCost / stats.lotCount : 0
        };
      });
    },
  });
}

export function usePeptide(id: string) {
  return useQuery({
    queryKey: ['peptides', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('peptides')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Peptide;
    },
    enabled: !!id,
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
        .single();

      if (!profile?.org_id) throw new Error('No organization found');

      const { data, error } = await supabase
        .from('peptides')
        .insert({ ...input, org_id: profile.org_id })
        .select()
        .single();

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
        .single();

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
