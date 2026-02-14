
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
  discount_percent: number;
  discount_amount: number;
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
  bottle_id: string | null;
  description: string | null;
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
    bottle_id?: string;
    description?: string;
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
      const bottleIds = [...new Set((items?.map(i => i.bottle_id) || []).filter(Boolean))];
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
      const bottleIds = [...new Set((items?.map(i => i.bottle_id) || []).filter(Boolean))];
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
      const bottleIds = items.map(i => i.bottle_id).filter(Boolean);
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
        bottle_id: item.bottle_id || null,
        description: item.description || null,
        price_at_sale: item.price_at_sale != null ? Math.round(item.price_at_sale * 100) / 100 : null,
      }));

      const { error: itemsError } = await supabase
        .from('movement_items')
        .insert(movementItems);

      if (itemsError) throw itemsError;

      // 3. For 'sale', 'giveaway', or 'internal_use' movements, populate client_inventory with the bottles
      // Use the pre-fetched bottleDetails
      if ((input.type === 'sale' || input.type === 'giveaway' || input.type === 'internal_use') && input.contact_id && bottleDetails.length > 0) {
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

      if (bottleError) throw bottleError;

      // 5. AUTO-COMMISSION: For 'sale' movements, create a sales_order then delegate to RPC
      if (input.type === 'sale' && input.contact_id) {
        try {
          const { data: contact } = await supabase
            .from('contacts')
            .select('assigned_rep_id, name')
            .eq('id', input.contact_id)
            .single();

          if ((contact as any)?.assigned_rep_id) {
            const totalSaleAmount = Math.round(input.items.reduce((sum, item) => sum + (item.price_at_sale || 0), 0) * 100) / 100;
            const orgId = profile!.org_id;

            // Create the sales_order — RPC handles commission split
            const { data: salesOrder, error: soErr } = await supabase
              .from('sales_orders')
              .insert({
                org_id: orgId,
                client_id: input.contact_id,
                rep_id: (contact as any).assigned_rep_id,
                status: 'fulfilled',
                payment_status: 'paid',
                amount_paid: totalSaleAmount,
                total_amount: totalSaleAmount,
                notes: `[MV:${movement.id}] Auto-generated from inventory sale (Movement #${movement.id.slice(0, 8)}). Client: ${(contact as any).name || 'Unknown'}.`,
              } as any)
              .select()
              .single();

            if (soErr) {
              console.error('Failed to create sales_order:', soErr);
            } else if (salesOrder) {
              // Delegate commission calculation to the revenue-based RPC
              const { error: rpcErr } = await supabase.rpc('process_sale_commission', {
                p_sale_id: salesOrder.id,
              });
              if (rpcErr) console.error('process_sale_commission RPC failed:', rpcErr);
            }
          }
        } catch (commErr) {
          // Don't block the movement if commission fails
          console.error('Auto-commission failed (non-blocking):', commErr);
        }
      }

      return movement;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      queryClient.invalidateQueries({ queryKey: ['client-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['admin_commissions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin_partner_commissions'] });
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
      // FULL UNDO: Reverse everything — bottles, inventory, commissions, credit_balance, sales_order

      // 0. Fetch the movement itself to know type and contact
      const { data: movement } = await supabase
        .from('movements')
        .select('type, contact_id')
        .eq('id', id)
        .single();

      // 1. Get movement items to restore bottle statuses
      const { data: items } = await supabase
        .from('movement_items')
        .select('bottle_id, price_at_sale')
        .eq('movement_id', id);

      if (items && items.length > 0) {
        const bottleIds = items.map(i => i.bottle_id);
        // Restore bottles to in_stock
        await supabase
          .from('bottles')
          .update({ status: 'in_stock' })
          .in('id', bottleIds);
      }

      // 2. Delete client_inventory entries linked to this movement
      const { error: invErr } = await supabase
        .from('client_inventory')
        .delete()
        .eq('movement_id', id);
      if (invErr) console.error('Failed to cleanup client_inventory:', invErr);

      // 3. Reverse commissions if this was a sale
      if (movement?.type === 'sale' && movement?.contact_id) {
        try {
          // The movement notes contain the order's short ID, e.g. "Sales Order #93ac1fad"
          // Extract it and find the matching sales_order
          const { data: movementFull } = await supabase
            .from('movements')
            .select('notes')
            .eq('id', id)
            .single();

          const notesText = movementFull?.notes || '';

          // Preferred: parse structured [SO:uuid] prefix for direct lookup
          const structuredMatch = notesText.match(/\[SO:([0-9a-f-]{36})\]/i);
          // Fallback: legacy pattern "Sales Order #XXXXXXXX" or "Fulfilled Sales Order #XXXXXXXX"
          const orderIdMatch = notesText.match(/(?:Sales Order|Fulfilled Sales Order)\s*#([a-f0-9]{8})/i);
          const orderShortId = orderIdMatch?.[1] || '';
          const movementShortId = id.slice(0, 8);

          let linkedOrders: any[] = [];

          // 1. Try structured [SO:uuid] — exact match
          if (structuredMatch?.[1]) {
            const { data } = await supabase
              .from('sales_orders')
              .select('id, total_amount, rep_id, notes, commission_amount')
              .eq('id', structuredMatch[1]);
            linkedOrders = data || [];
          }

          // 2. Fallback: order short ID prefix match
          if (linkedOrders.length === 0 && orderShortId) {
            const { data } = await supabase
              .from('sales_orders')
              .select('id, total_amount, rep_id, notes, commission_amount')
              .ilike('id', `${orderShortId}%`);
            linkedOrders = data || [];
          }

          // 3. Fallback: movement short ID in order notes
          if (linkedOrders.length === 0) {
            const { data } = await supabase
              .from('sales_orders')
              .select('id, total_amount, rep_id, notes, commission_amount')
              .ilike('notes', `%${movementShortId}%`);
            linkedOrders = data || [];
          }

          for (const order of (linkedOrders || [])) {
            // Walk the upline chain from the contact's assigned rep to reverse commissions
            const { data: contact } = await supabase
              .from('contacts')
              .select('assigned_rep_id')
              .eq('id', movement.contact_id)
              .single();

            // Fetch actual commission records to reverse exact amounts
            const { data: commRecords } = await supabase
              .from('commissions')
              .select('id, partner_id, amount')
              .eq('sale_id', order.id);

            if (commRecords && commRecords.length > 0) {
              const reversalLog: string[] = [];

              for (const comm of commRecords) {
                const commAmount = Number(comm.amount) || 0;
                if (commAmount <= 0) continue;

                const { data: repProfile } = await supabase
                  .from('profiles')
                  .select('id, full_name, credit_balance')
                  .eq('id', comm.partner_id)
                  .single();

                if (repProfile) {
                  const oldBalance = Number((repProfile as any)?.credit_balance) || 0;
                  const newBalance = Math.round((oldBalance - commAmount) * 100) / 100;

                  await supabase
                    .from('profiles')
                    .update({ credit_balance: newBalance })
                    .eq('id', repProfile.id);

                  reversalLog.push(
                    `${(repProfile as any).full_name}: -$${commAmount.toFixed(2)} (balance: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)})`
                  );
                }
              }

              // Commission reversal complete
            }

            // Delete commissions records linked to this sales_order
            await supabase
              .from('commissions')
              .delete()
              .eq('sale_id', order.id);

            // Delete the sales_order
            await supabase
              .from('sales_orders')
              .delete()
              .eq('id', order.id);
          }
        } catch (commErr) {
          console.error('Commission reversal error (non-blocking):', commErr);
        }
      }

      // 4. Finally delete the movement (cascade deletes movement_items)
      const { error } = await supabase
        .from('movements')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      queryClient.invalidateQueries({ queryKey: ['client-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['admin_commissions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin_partner_commissions'] });
      toast({ title: 'Sale fully reversed — bottles, inventory, commissions all undone' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to undo sale', description: error.message });
    },
  });
}
