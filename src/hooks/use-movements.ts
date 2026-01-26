
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
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
  status?: 'active' | 'returned' | 'cancelled' | 'partial_return';
  contacts?: {
    id: string;
    name: string;
  } | null;
  profiles?: {
    id: string;
    full_name: string | null;
  } | null;
  payment_status: 'paid' | 'unpaid' | 'partial' | 'refunded';
  amount_paid: number;
  payment_method: string | null;
  payment_date: string | null;
  movement_items?: {
    id?: string;
    price_at_sale?: number | null;
    bottle_id?: string;
    bottles?: {
      id: string;
      uid: string;
      lots?: {
        id: string;
        lot_number?: string;
        cost_per_unit: number;
        peptides?: {
          id: string;
          name: string;
        };
      } | null;
    } | null;
  }[];
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
    protocol_item_id?: string; // NEW: Link bottle to specific protocol item
  }[];
  payment_status?: 'paid' | 'unpaid' | 'partial' | 'refunded';
  amount_paid?: number;
  payment_method?: string;
  payment_date?: string;
}

const movementTypeToBottleStatus: Record<MovementType, BottleStatus> = {
  sale: 'sold',
  giveaway: 'given_away',
  internal_use: 'internal_use',
  loss: 'lost',
  return: 'returned',
};

export function useMovements(contactId?: string) {
  return useQuery({
    queryKey: ['movements', contactId],
    queryFn: async () => {
      // 1. Fetch Movements
      let query = supabase
        .from('movements')
        .select('*, contacts(id, name), profiles(id, full_name)')
        .order('movement_date', { ascending: false });

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data: movements, error } = await query;

      if (error) throw error;
      if (!movements || movements.length === 0) return [];

      const movementIds = movements.map(m => m.id);

      // 2. Fetch Items
      const { data: items, error: itemsError } = await supabase
        .from('movement_items')
        .select('*')
        .in('movement_id', movementIds);

      if (itemsError) throw itemsError;

      // 3. Fetch Bottles
      const bottleIds = [...new Set(items?.map(i => i.bottle_id) || [])];
      let bottles: any[] = [];
      if (bottleIds.length > 0) {
        const { data: bData, error: bError } = await supabase
          .from('bottles')
          .select('id, uid, lot_id')
          .in('id', bottleIds);
        if (bError) throw bError;
        bottles = bData || [];
      }

      // 4. Fetch Lots (for cost)
      const lotIds = [...new Set(bottles.map(b => b.lot_id).filter(Boolean))];
      let lots: any[] = [];
      if (lotIds.length > 0) {
        // We also need peptide name for display if possible, but mainly cost
        const { data: lData, error: lError } = await supabase
          .from('lots')
          .select('id, lot_number, cost_per_unit, peptides(id, name)')
          .in('id', lotIds);
        if (lError) throw lError;
        lots = lData || [];
      }

      // 5. Stitch together
      const lotMap = new Map(lots.map(l => [l.id, l]));
      const bottleMap = new Map(bottles.map(b => [b.id, { ...b, lots: lotMap.get(b.lot_id) }]));

      // Group items
      const itemsByMovement: Record<string, any[]> = {};
      items?.forEach(item => {
        const bottle = bottleMap.get(item.bottle_id);
        const enrichedItem = { ...item, bottles: bottle };
        if (!itemsByMovement[item.movement_id]) {
          itemsByMovement[item.movement_id] = [];
        }
        itemsByMovement[item.movement_id].push(enrichedItem);
      });

      // Attach to movements
      const result = movements.map(m => ({
        ...m,
        movement_items: itemsByMovement[m.id] || []
      }));

      return result as Movement[];
    },
  });
}

export function useMovement(id: string) {
  return useQuery({
    queryKey: ['movements', id],
    queryFn: async () => {
      // Manual fetch for single movement too to ensure consistency
      const { data: movement, error } = await supabase
        .from('movements')
        .select('*, contacts(id, name), profiles(id, full_name)')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from('movement_items')
        .select('*')
        .eq('movement_id', id);
      if (itemsError) throw itemsError;

      // Fetch Bottles/Lots same way
      const bottleIds = [...new Set(items?.map(i => i.bottle_id) || [])];
      let bottles: any[] = [];
      if (bottleIds.length > 0) {
        const { data: bData } = await supabase.from('bottles').select('id, uid, lot_id').in('id', bottleIds);
        bottles = bData || [];
      }

      const lotIds = [...new Set(bottles.map(b => b.lot_id).filter(Boolean))];
      let lots: any[] = [];
      if (lotIds.length > 0) {
        const { data: lData } = await supabase.from('lots').select('id, lot_number, cost_per_unit, peptides(id, name)').in('id', lotIds);
        lots = lData || [];
      }

      const lotMap = new Map(lots.map(l => [l.id, l]));
      const bottleMap = new Map(bottles.map(b => [b.id, { ...b, lots: lotMap.get(b.lot_id) }]));

      const enrichedItems = items?.map(item => ({
        ...item,
        bottles: bottleMap.get(item.bottle_id)
      }));

      return { ...movement, movement_items: enrichedItems } as Movement;
    },
    enabled: !!id,
  });
}

export function useMovementItems(movementId: string) {
  // This hook is used in the Dialog detail view. Needs to be robust too.
  return useQuery({
    queryKey: ['movement_items', movementId],
    queryFn: async () => {
      const { data: items, error: itemsError } = await supabase
        .from('movement_items')
        .select('*')
        .eq('movement_id', movementId);

      if (itemsError) throw itemsError;

      // Manual join again...
      const bottleIds = items.map(i => i.bottle_id);
      let bottles: any[] = [];
      if (bottleIds.length > 0) {
        const { data: bData } = await supabase.from('bottles').select('id, uid, lot_id').in('id', bottleIds);
        bottles = bData || [];
      }

      const lotIds = [...new Set(bottles.map(b => b.lot_id).filter(Boolean))];
      let lots: any[] = [];
      if (lotIds.length > 0) {
        const { data: lData } = await supabase.from('lots').select('id, lot_number, cost_per_unit, peptides(id, name)').in('id', lotIds);
        lots = lData || [];
      }
      const lotMap = new Map(lots.map(l => [l.id, l]));
      const bottleMap = new Map(bottles.map(b => [b.id, { ...b, lots: lotMap.get(b.lot_id) }]));

      return items.map(item => ({
        ...item,
        bottles: bottleMap.get(item.bottle_id)
      })) as MovementItem[];
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

      const bottleIds = input.items.map(i => i.bottle_id);

      // PRE-FETCH: Get bottle details while they are still visible (in_stock)
      // This is crucial because once marked 'sold', RLS might hide them from some queries
      let bottleDetails: any[] = [];
      if (bottleIds.length > 0) {
        const { data, error } = await supabase
          .from('bottles')
          .select('id, uid, lots(id, lot_number, peptide_id, peptides(id, name))')
          .in('id', bottleIds);

        if (error) {
          console.error('Error fetching bottle details for inventory:', error);
          // We don't throw blocking error here, but inventory creation might fail/skip
        } else {
          bottleDetails = data || [];
        }
      }

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
          payment_status: input.payment_status || 'unpaid',
          amount_paid: input.amount_paid || 0,
          payment_method: input.payment_method || null,
          payment_date: input.payment_date || null
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

      // 3. For 'sale' or 'giveaway' movements, populate client_inventory with the bottles
      // Use the pre-fetched bottleDetails
      if ((input.type === 'sale' || input.type === 'giveaway') && input.contact_id && bottleDetails.length > 0) {
        // Helper to extract vial size from peptide name
        const parseVialSize = (name: string): number => {
          const match = name.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu)/i);
          if (!match) return 5; // Default fallback
          const val = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          if (unit === 'mcg') return val / 1000;
          return val; // mg or iu
        };

        // Create a map of bottle_id to protocol_item_id from input
        const bottleToProtocolMap = new Map(
          input.items.map(item => [item.bottle_id, item.protocol_item_id])
        );

        // Create inventory entries
        const inventoryEntries = bottleDetails.map((bottle: any) => {
          const peptideName = bottle.lots?.peptides?.name;
          const vialSizeMg = peptideName ? parseVialSize(peptideName) : 5;
          const waterAddedMl = 2; // Default reconstitution volume

          // Skip if missing peptide link (shouldn't happen if db consistent)
          if (!bottle.lots?.peptide_id) return null;

          return {
            contact_id: input.contact_id,
            movement_id: movement.id, // Link to order
            peptide_id: bottle.lots.peptide_id,
            batch_number: bottle.lots.lot_number || null,
            vial_size_mg: vialSizeMg,
            water_added_ml: null,
            current_quantity_mg: vialSizeMg, // Starts full
            initial_quantity_mg: vialSizeMg, // NEW: Track initial amount
            concentration_mg_ml: null,
            status: 'active',
            protocol_item_id: bottleToProtocolMap.get(bottle.id) || null // NEW: Link to protocol item
          };
        }).filter(Boolean); // Remove nulls

        if (inventoryEntries.length > 0) {
          const { error: inventoryError } = await supabase
            .from('client_inventory')
            .insert(inventoryEntries);

          if (inventoryError) {
            console.error('Failed to populate client_inventory:', inventoryError);
            // Don't throw - allow movement to succeed even if inventory population fails
          }
        }
      }

      // 4. Update bottle statuses (LAST STEP)
      const newStatus = movementTypeToBottleStatus[input.type];
      const { error: bottleError } = await supabase
        .from('bottles')
        .update({ status: newStatus })
        .in('id', bottleIds);

      if (bottleError) throw bottleError; // Technically if this fails, we have inconsistency (movement but bottle in stock)
      // But it's better than blocking the previous steps? 
      // Ideally we'd use a transaction if Supabase JS supported it easily, or an RPC.
      // For now, this order is safer for RLS visibility.

      return movement;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      queryClient.invalidateQueries({ queryKey: ['client-inventory'] }); // Invalidate client inventory cache
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
