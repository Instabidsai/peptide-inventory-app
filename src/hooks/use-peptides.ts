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

      // 2. Fetch all in-stock bottles (using lots relation to get peptide_id)
      const { data: bottlesData, error: bottlesError } = await supabase
        .from('bottles')
        .select('lots!inner(peptide_id, cost_per_unit)')
        .eq('status', 'in_stock');

      if (bottlesError) throw bottlesError;

      // 3. Aggregate counts and costs in memory
      const stats: Record<string, { count: number, totalCost: number }> = {};

      bottlesData?.forEach((b: any) => {
        const pId = b.lots?.peptide_id;
        const cost = Number(b.lots?.cost_per_unit || 0);

        if (pId) {
          if (!stats[pId]) stats[pId] = { count: 0, totalCost: 0 };
          stats[pId].count += 1; // Assuming 1 bottle = 1 unit
          stats[pId].totalCost += cost;
        }
      });

      // 4. Merge
      return (peptidesData as Peptide[]).map(peptide => {
        const pStats = stats[peptide.id] || { count: 0, totalCost: 0 };
        return {
          ...peptide,
          stock_count: pStats.count,
          avg_cost: pStats.count > 0 ? pStats.totalCost / pStats.count : 0
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
