import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface Lot {
  id: string;
  org_id: string;
  peptide_id: string;
  lot_number: string;
  quantity_received: number;
  cost_per_unit: number;
  received_date: string;
  expiry_date: string | null;
  notes: string | null;
  payment_status: 'paid' | 'unpaid' | 'partial';
  payment_date: string | null;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  peptides?: {
    id: string;
    name: string;
  };
}

export interface CreateLotInput {
  peptide_id: string;
  lot_number: string;
  quantity_received: number;
  cost_per_unit: number;
  received_date?: string;
  expiry_date?: string;
  notes?: string;
  payment_status?: 'paid' | 'unpaid' | 'partial';
  payment_date?: string;
  payment_method?: string;
}

export function useLots() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['lots', profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lots')
        .select('*, peptides(id, name)')
        .eq('org_id', profile!.org_id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Lot[];
    },
    enabled: !!user && !!profile?.org_id,
  });
}

export function useLot(id: string) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['lots', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lots')
        .select('*, peptides(id, name)')
        .eq('id', id)
        .eq('org_id', profile!.org_id!)
        .single();

      if (error) throw error;
      return data as Lot;
    },
    enabled: !!id && !!user && !!profile?.org_id,
  });
}

export function useCreateLot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateLotInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.org_id) throw new Error('No organization found');

      const { data, error } = await supabase
        .from('lots')
        .insert({ ...input, org_id: profile.org_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      toast({
        title: 'Lot received successfully',
        description: `${data.quantity_received} bottles created automatically`
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to create lot', description: error.message });
    },
  });
}

export function useUpdateLot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateLotInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('lots')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      toast({ title: 'Lot updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update lot', description: error.message });
    },
  });
}

export function useDeleteLot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // First delete all bottles associated with this lot
      const { error: bottlesError } = await supabase
        .from('bottles')
        .delete()
        .eq('lot_id', id);

      if (bottlesError) throw bottlesError;

      // Then delete the lot
      const { error } = await supabase
        .from('lots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      queryClient.invalidateQueries({ queryKey: ['bottle-stats'] });
      toast({ title: 'Lot deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete lot', description: error.message });
    },
  });
}
