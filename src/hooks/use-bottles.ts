import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_PAGE_SIZE, type PaginationState } from '@/hooks/use-pagination';

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
      retail_price?: number;
    };
  };
}

export interface UpdateBottleInput {
  status?: BottleStatus;
  location?: string;
  notes?: string;
}

export function useBottles(filters?: { status?: BottleStatus; peptide_id?: string }, pagination?: PaginationState) {
  const { user, profile } = useAuth();
  const page = pagination?.page ?? 0;
  const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;

  return useQuery({
    queryKey: ['bottles', filters?.status, filters?.peptide_id, profile?.org_id, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('bottles')
        .select('*, lots(id, lot_number, peptide_id, cost_per_unit, peptides(id, name, retail_price))')
        .eq('org_id', profile!.org_id!)
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

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
    enabled: !!user && !!profile?.org_id,
  });
}

export function useBottle(id: string) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['bottles', id, profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bottles')
        .select('*, lots(id, lot_number, peptide_id, cost_per_unit, peptides(id, name, retail_price))')
        .eq('id', id)
        .eq('org_id', profile!.org_id!)
        .single();

      if (error) throw error;
      return data as Bottle;
    },
    enabled: !!id && !!user && !!profile?.org_id,
  });
}

export function useBottleByUid(uid: string) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['bottles', 'uid', uid, profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bottles')
        .select('*, lots(id, lot_number, peptide_id, cost_per_unit, peptides(id, name, retail_price))')
        .eq('uid', uid)
        .eq('org_id', profile!.org_id!)
        .maybeSingle();

      if (error) throw error;
      return data as Bottle | null;
    },
    enabled: !!uid && uid.length >= 3 && !!user && !!profile?.org_id,
  });
}

export function useUpdateBottle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateBottleInput & { id: string }) => {
      if (!profile?.org_id) throw new Error('No organization found');
      const { data, error } = await supabase
        .from('bottles')
        .update(input)
        .eq('id', id)
        .eq('org_id', profile.org_id)
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
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ ids, ...input }: UpdateBottleInput & { ids: string[] }) => {
      if (!profile?.org_id) throw new Error('No organization found');
      const { data, error } = await supabase
        .from('bottles')
        .update(input)
        .in('id', ids)
        .eq('org_id', profile.org_id)
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
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['bottles', 'stats', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_bottle_stats');

      if (error) throw error;

      // Convert RPC result (rows of { status, count }) to object
      const stats = {
        total: 0,
        in_stock: 0,
        sold: 0,
        given_away: 0,
        internal_use: 0,
        lost: 0,
        returned: 0,
        expired: 0,
      };

      data?.forEach((row: { status: string; count: number }) => {
        const count = Number(row.count);
        stats.total += count;
        if (row.status in stats) {
          (stats as Record<string, number>)[row.status] = count;
        }
      });

      return stats;
    },
    enabled: !!user && !!profile?.org_id,
  });
}

export function useDeleteBottle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.org_id) throw new Error('No organization found');
      const { error } = await supabase
        .from('bottles')
        .delete()
        .eq('id', id)
        .eq('org_id', profile.org_id);

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
