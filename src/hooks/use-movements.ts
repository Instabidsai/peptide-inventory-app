import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { BottleStatus } from './use-bottles';

export type MovementType = 'sale' | 'giveaway' | 'internal_use' | 'loss' | 'return';

export interface Movement {
  id: string;
  org_id: string;
  type: MovementType;
  contact_id: string | null;
  movement_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  contacts?: {
    id: string;
    name: string;
  } | null;
  profiles?: {
    id: string;
    full_name: string | null;
  } | null;
}

export interface MovementItem {
  id: string;
  movement_id: string;
  bottle_id: string;
  price_at_sale: number | null;
  created_at: string;
  bottles?: {
    id: string;
    uid: string;
    lots?: {
      id: string;
      lot_number: string;
      cost_per_unit: number;
      peptides?: {
        id: string;
        name: string;
      };
    };
  };
}

export interface CreateMovementInput {
  type: MovementType;
  contact_id?: string;
  movement_date?: string;
  notes?: string;
  items: {
    bottle_id: string;
    price_at_sale?: number;
  }[];
}

const movementTypeToBottleStatus: Record<MovementType, BottleStatus> = {
  sale: 'sold',
  giveaway: 'given_away',
  internal_use: 'internal_use',
  loss: 'lost',
  return: 'returned',
};

export function useMovements() {
  return useQuery({
    queryKey: ['movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movements')
        .select('*, contacts(id, name), profiles(id, full_name)')
        .order('movement_date', { ascending: false });
      
      if (error) throw error;
      return data as Movement[];
    },
  });
}

export function useMovement(id: string) {
  return useQuery({
    queryKey: ['movements', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movements')
        .select('*, contacts(id, name), profiles(id, full_name)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Movement;
    },
    enabled: !!id,
  });
}

export function useMovementItems(movementId: string) {
  return useQuery({
    queryKey: ['movement_items', movementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movement_items')
        .select('*, bottles(id, uid, lots(id, lot_number, cost_per_unit, peptides(id, name)))')
        .eq('movement_id', movementId);
      
      if (error) throw error;
      return data as MovementItem[];
    },
    enabled: !!movementId,
  });
}

export function useCreateMovement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateMovementInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, org_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.org_id) throw new Error('No organization found');

      // 1. Create the movement
      const { data: movement, error: movementError } = await supabase
        .from('movements')
        .insert({
          type: input.type,
          contact_id: input.contact_id || null,
          movement_date: input.movement_date || new Date().toISOString().split('T')[0],
          notes: input.notes || null,
          created_by: profile.id,
          org_id: profile.org_id,
        })
        .select()
        .single();
      
      if (movementError) throw movementError;

      // 2. Create movement items
      const movementItems = input.items.map(item => ({
        movement_id: movement.id,
        bottle_id: item.bottle_id,
        price_at_sale: item.price_at_sale || null,
      }));

      const { error: itemsError } = await supabase
        .from('movement_items')
        .insert(movementItems);
      
      if (itemsError) throw itemsError;

      // 3. Update bottle statuses
      const newStatus = movementTypeToBottleStatus[input.type];
      const bottleIds = input.items.map(i => i.bottle_id);

      const { error: bottleError } = await supabase
        .from('bottles')
        .update({ status: newStatus })
        .in('id', bottleIds);
      
      if (bottleError) throw bottleError;

      return movement;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      toast({ 
        title: 'Movement recorded', 
        description: `${variables.items.length} bottle(s) marked as ${movementTypeToBottleStatus[variables.type].replace('_', ' ')}` 
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to record movement', description: error.message });
    },
  });
}

export function useDeleteMovement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // First get the movement items to restore bottle statuses
      const { data: items } = await supabase
        .from('movement_items')
        .select('bottle_id')
        .eq('movement_id', id);

      if (items && items.length > 0) {
        // Restore bottles to in_stock
        const bottleIds = items.map(i => i.bottle_id);
        await supabase
          .from('bottles')
          .update({ status: 'in_stock' })
          .in('id', bottleIds);
      }

      // Delete the movement (cascade will delete items)
      const { error } = await supabase
        .from('movements')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      toast({ title: 'Movement deleted, bottles restored to stock' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete movement', description: error.message });
    },
  });
}
