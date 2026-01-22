import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type BottleStatus = 'in_stock' | 'sold' | 'given_away' | 'internal_use' | 'lost' | 'returned' | 'expired';

export interface Bottle {
  id: string;
  org_id: string;
  lot_id: string;
  uid: string;
  status: BottleStatus;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lots?: {
    id: string;
    lot_number: string;
    peptide_id: string;
    cost_per_unit: number;
    peptides?: {
      id: string;
      name: string;
    };
  };
}

export interface UpdateBottleInput {
  status?: BottleStatus;
  location?: string;
  notes?: string;
}

export function useBottles(filters?: { status?: BottleStatus; peptide_id?: string }) {
  return useQuery({
    queryKey: ['bottles', filters],
    queryFn: async () => {
      let query = supabase
        .from('bottles')
        .select('*, lots(id, lot_number, peptide_id, cost_per_unit, peptides(id, name))')
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by peptide_id if provided (through lots join)
      let result = data as Bottle[];
      if (filters?.peptide_id) {
        result = result.filter(b => b.lots?.peptide_id === filters.peptide_id);
      }

      return result;
    },
  });
}

export function useBottle(id: string) {
  return useQuery({
    queryKey: ['bottles', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bottles')
        .select('*, lots(id, lot_number, peptide_id, cost_per_unit, peptides(id, name))')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Bottle;
    },
    enabled: !!id,
  });
}

export function useBottleByUid(uid: string) {
  return useQuery({
    queryKey: ['bottles', 'uid', uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bottles')
        .select('*, lots(id, lot_number, peptide_id, cost_per_unit, peptides(id, name))')
        .eq('uid', uid)
        .maybeSingle();

      if (error) throw error;
      return data as Bottle | null;
    },
    enabled: !!uid && uid.length >= 3,
  });
}

export function useUpdateBottle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateBottleInput & { id: string }) => {
      const { data, error } = await supabase
        .from('bottles')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      toast({ title: 'Bottle updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update bottle', description: error.message });
    },
  });
}

export function useUpdateBottles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ids, ...input }: UpdateBottleInput & { ids: string[] }) => {
      const { data, error } = await supabase
        .from('bottles')
        .update(input)
        .in('id', ids)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      toast({ title: `${data.length} bottles updated successfully` });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update bottles', description: error.message });
    },
  });
}

export function useBottleStats() {
  return useQuery({
    queryKey: ['bottles', 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bottles')
        .select('status, lots(peptides(name))');

      if (error) throw error;

      const stats = {
        total: data.length,
        in_stock: data.filter(b => b.status === 'in_stock').length,
        sold: data.filter(b => b.status === 'sold').length,
        given_away: data.filter(b => b.status === 'given_away').length,
        internal_use: data.filter(b => b.status === 'internal_use').length,
        lost: data.filter(b => b.status === 'lost').length,
        returned: data.filter(b => b.status === 'returned').length,
        expired: data.filter(b => b.status === 'expired').length,
      };

      return stats;
    },
  });
}

export function useDeleteBottle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bottles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      toast({ title: 'Bottle deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete bottle', description: error.message });
    },
  });
}
