
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { parseVialSize } from '@/lib/supply-calculations';
import { autoGenerateProtocol } from '@/lib/auto-protocol';
import { DEFAULT_PAGE_SIZE, type PaginationState } from '@/hooks/use-pagination';
import type { BottleStatus } from './use-bottles';
import { logger } from '@/lib/logger';

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
  payment_status: 'paid' | 'unpaid' | 'partial' | 'refunded' | 'commission_offset';
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
        peptide_id?: string;
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
  payment_status?: 'paid' | 'unpaid' | 'partial' | 'refunded' | 'commission_offset';
  amount_paid?: number;
  payment_method?: string;
  payment_date?: string;
}

// Internal query-row shapes for manual Supabase joins
interface LotRow { id: string; lot_number: string; cost_per_unit: number; peptides: { id: string; name: string } | null }
interface BottleDetailRow {
  id: string; uid: string;
  lots: { id: string; lot_number: string; peptide_id: string; peptides: { id: string; name: string } | null } | null;
}
interface LinkedOrderRow {
  id: string; total_amount: number | null; rep_id: string | null;
  notes: string | null; commission_amount: number | null;
}

const movementTypeToBottleStatus: Record<MovementType, BottleStatus> = {
  sale: 'sold',
  giveaway: 'given_away',
  internal_use: 'internal_use',
  loss: 'lost',
  return: 'returned',
};

export function useMovements(contactId?: string, pagination?: PaginationState) {
  const { profile } = useAuth();
  const orgId = profile?.org_id;
  const page = pagination?.page ?? 0;
  const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useQuery({
    queryKey: ['movements', orgId, contactId, page, pageSize],
    queryFn: async () => {
      // 1. Fetch Movements (scoped to tenant)
      let query = supabase
        .from('movements')
        .select('*, contacts(id, name), profiles(id, full_name)')
        .eq('org_id', orgId!)
        .order('movement_date', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

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

      // 3. Fetch Bottles with Lots + Peptides in one query (saves a round trip)
      const bottleIds = [...new Set((items?.map(i => i.bottle_id) || []).filter(Boolean))];
      let bottlesWithLots: Array<{ id: string; uid: string; lots: LotRow | null }> = [];
      if (bottleIds.length > 0) {
        const { data: bData, error: bError } = await supabase
          .from('bottles')
          .select('id, uid, lots(id, lot_number, cost_per_unit, peptides(id, name))')
          .in('id', bottleIds);
        if (bError) throw bError;
        bottlesWithLots = (bData || []) as typeof bottlesWithLots;
      }

      // 4. Stitch together
      const bottleMap = new Map(bottlesWithLots.map(b => [b.id, b]));

      // Group items
      const itemsByMovement: Record<string, NonNullable<Movement['movement_items']>> = {};
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
    enabled: !!orgId,
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
        .maybeSingle();

      if (error) throw error;
      if (!movement) throw new Error('Movement not found');

      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from('movement_items')
        .select('*')
        .eq('movement_id', id);
      if (itemsError) throw itemsError;

      // Fetch Bottles with Lots + Peptides in one query
      const bottleIds = [...new Set((items?.map(i => i.bottle_id) || []).filter(Boolean))];
      let bottlesWithLots: Array<{ id: string; uid: string; lots: LotRow | null }> = [];
      if (bottleIds.length > 0) {
        const { data: bData } = await supabase
          .from('bottles')
          .select('id, uid, lots(id, lot_number, cost_per_unit, peptides(id, name))')
          .in('id', bottleIds);
        bottlesWithLots = (bData || []) as typeof bottlesWithLots;
      }

      const bottleMap = new Map(bottlesWithLots.map(b => [b.id, b]));

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

      // Fetch Bottles with Lots + Peptides in one query
      const bottleIds = items.map(i => i.bottle_id).filter(Boolean);
      let bottlesWithLots: Array<{ id: string; uid: string; lots: LotRow | null }> = [];
      if (bottleIds.length > 0) {
        const { data: bData } = await supabase
          .from('bottles')
          .select('id, uid, lots(id, lot_number, cost_per_unit, peptides(id, name))')
          .in('id', bottleIds);
        bottlesWithLots = (bData || []) as typeof bottlesWithLots;
      }
      const bottleMap = new Map(bottlesWithLots.map(b => [b.id, b]));

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
        .maybeSingle();

      if (!profile?.org_id) throw new Error('No organization found');

      const bottleIds = input.items.map(i => i.bottle_id).filter(Boolean) as string[];

      // PRE-FETCH: Get bottle details while they are still visible (in_stock)
      // This is crucial because once marked 'sold', RLS might hide them from some queries
      let bottleDetails: BottleDetailRow[] = [];
      if (bottleIds.length > 0) {
        const { data, error } = await supabase
          .from('bottles')
          .select('id, uid, lots(id, lot_number, peptide_id, peptides(id, name))')
          .in('id', bottleIds);

        if (error) {
          logger.error('Error fetching bottle details for inventory:', error);
          // We don't throw blocking error here, but inventory creation might fail/skip
        } else {
          bottleDetails = (data || []) as BottleDetailRow[];
        }
      }

      // Track mutations for rollback on failure
      let movementId: string | null = null;

      try {
      // 1. Create the movement
      const { data: movement, error: movementError } = await supabase
        .from('movements')
        .insert({
          type: input.type,
          contact_id: input.contact_id || null,
          movement_date: input.movement_date || format(new Date(), 'yyyy-MM-dd'),
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
      movementId = movement.id;

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
        // Create a map of bottle_id to protocol_item_id from input
        const bottleToProtocolMap = new Map(
          input.items.map(item => [item.bottle_id, item.protocol_item_id])
        );

        // Create inventory entries
        const inventoryEntries = bottleDetails.map((bottle) => {
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
            logger.error('Failed to populate client_inventory:', inventoryError);
            toast({ variant: 'destructive', title: 'Warning', description: 'Movement recorded but client inventory update failed.' });
          } else {
            // Auto-generate protocol if no protocol_item_ids were provided
            const hasAnyProtocolLink = input.items.some(i => i.protocol_item_id);
            if (!hasAnyProtocolLink && input.contact_id) {
              try {
                // Gather unique peptides from bottle details
                const uniquePeptides = [...new Map(
                  bottleDetails
                    .filter(b => b.lots?.peptide_id && b.lots?.peptides?.name)
                    .map(b => [b.lots!.peptide_id, { peptideId: b.lots!.peptide_id, peptideName: b.lots!.peptides!.name }])
                ).values()];

                if (uniquePeptides.length > 0) {
                  const { protocolItemMap } = await autoGenerateProtocol({
                    contactId: input.contact_id,
                    orgId: profile.org_id,
                    items: uniquePeptides,
                  });

                  // Update inventory entries with protocol_item_ids
                  for (const [peptideId, protocolItemId] of protocolItemMap) {
                    await supabase
                      .from('client_inventory')
                      .update({ protocol_item_id: protocolItemId })
                      .eq('movement_id', movement.id)
                      .eq('peptide_id', peptideId)
                      .is('protocol_item_id', null);
                  }
                }
              } catch (autoErr) {
                logger.error('Auto-protocol generation failed (non-blocking):', autoErr);
              }
            }
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
            .maybeSingle();

          if (contact?.assigned_rep_id) {
            const totalSaleAmount = Math.round(input.items.reduce((sum, item) => sum + (item.price_at_sale || 0), 0) * 100) / 100;
            const orgId = profile!.org_id;

            // Create the sales_order — RPC handles commission split
            const { data: salesOrder, error: soErr } = await supabase
              .from('sales_orders')
              .insert({
                org_id: orgId,
                client_id: input.contact_id,
                rep_id: contact.assigned_rep_id,
                status: 'fulfilled',
                payment_status: 'paid',
                amount_paid: totalSaleAmount,
                total_amount: totalSaleAmount,
                notes: `[MV:${movement.id}] Auto-generated from inventory sale (Movement #${movement.id.slice(0, 8)}). Client: ${contact.name || 'Unknown'}.`,
              })
              .select()
              .single();

            if (soErr) {
              logger.error('Failed to create sales_order:', soErr);
              toast({ variant: 'destructive', title: 'Warning', description: 'Movement recorded but sales order creation failed.' });
            } else if (salesOrder) {
              // Delegate commission calculation to the revenue-based RPC
              const { error: rpcErr } = await supabase.rpc('process_sale_commission', {
                p_sale_id: salesOrder.id,
              });
              if (rpcErr) {
                logger.error('process_sale_commission RPC failed:', rpcErr);
              } else {
                // Notify partners via SMS (fire and forget)
                supabase.functions.invoke('notify-commission', { body: { sale_id: salesOrder.id } }).catch(() => {});
              }
            }
          }
        } catch (commErr) {
          logger.error('Auto-commission failed (non-blocking):', commErr);
          toast({ variant: 'destructive', title: 'Warning', description: 'Movement recorded but commission processing failed.' });
        }
      }

      return movement;

      } catch (err) {
        // ROLLBACK: Revert bottle statuses and clean up movement data
        logger.error('Movement creation failed, attempting rollback:', err);

        if (bottleIds.length > 0) {
          await supabase
            .from('bottles')
            .update({ status: 'in_stock' })
            .in('id', bottleIds)
            .then(({ error }) => error && logger.error('Rollback bottles failed:', error));
        }

        if (movementId) {
          await supabase
            .from('client_inventory')
            .delete()
            .eq('movement_id', movementId)
            .then(({ error }) => error && logger.error('Rollback client_inventory failed:', error));

          await supabase
            .from('movement_items')
            .delete()
            .eq('movement_id', movementId)
            .then(({ error }) => error && logger.error('Rollback movement_items failed:', error));

          await supabase
            .from('movements')
            .delete()
            .eq('id', movementId)
            .then(({ error }) => error && logger.error('Rollback movement failed:', error));
        }

        throw err;
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['bottles'] });
      queryClient.invalidateQueries({ queryKey: ['client-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['admin_commissions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['admin_partner_commissions'] });
      queryClient.invalidateQueries({ queryKey: ['protocols'] });
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
        .maybeSingle();

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
      if (invErr) {
        logger.error('Failed to cleanup client_inventory:', invErr);
        toast({ variant: 'destructive', title: 'Warning', description: 'Movement deleted but client inventory cleanup failed.' });
      }

      // 3. Reverse commissions if this was a sale
      if (movement?.type === 'sale' && movement?.contact_id) {
        try {
          // The movement notes contain the order's short ID, e.g. "Sales Order #93ac1fad"
          // Extract it and find the matching sales_order
          const { data: movementFull } = await supabase
            .from('movements')
            .select('notes')
            .eq('id', id)
            .maybeSingle();

          const notesText = movementFull?.notes || '';

          // Preferred: parse structured [SO:uuid] prefix for direct lookup
          const structuredMatch = notesText.match(/\[SO:([0-9a-f-]{36})\]/i);
          // Fallback: legacy pattern "Sales Order #XXXXXXXX" or "Fulfilled Sales Order #XXXXXXXX"
          const orderIdMatch = notesText.match(/(?:Sales Order|Fulfilled Sales Order)\s*#([a-f0-9]{8})/i);
          const orderShortId = orderIdMatch?.[1] || '';
          const movementShortId = id.slice(0, 8);

          let linkedOrders: LinkedOrderRow[] = [];

          // 1. Try structured [SO:uuid] — exact match
          if (structuredMatch?.[1]) {
            const { data } = await supabase
              .from('sales_orders')
              .select('id, total_amount, rep_id, notes, commission_amount')
              .eq('id', structuredMatch[1]);
            linkedOrders = (data || []) as LinkedOrderRow[];
          }

          // 2. Fallback: order short ID prefix match
          if (linkedOrders.length === 0 && orderShortId) {
            const { data } = await supabase
              .from('sales_orders')
              .select('id, total_amount, rep_id, notes, commission_amount')
              .ilike('id', `${orderShortId}%`);
            linkedOrders = (data || []) as LinkedOrderRow[];
          }

          // 3. Fallback: movement short ID in order notes
          if (linkedOrders.length === 0) {
            const { data } = await supabase
              .from('sales_orders')
              .select('id, total_amount, rep_id, notes, commission_amount')
              .ilike('notes', `%${movementShortId}%`);
            linkedOrders = (data || []) as LinkedOrderRow[];
          }

          for (const order of (linkedOrders || [])) {
            // Walk the upline chain from the contact's assigned rep to reverse commissions
            const { data: contact } = await supabase
              .from('contacts')
              .select('assigned_rep_id')
              .eq('id', movement.contact_id)
              .maybeSingle();

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
                  .maybeSingle();

                if (repProfile) {
                  const oldBalance = Number(repProfile.credit_balance) || 0;
                  const newBalance = Math.round((oldBalance - commAmount) * 100) / 100;

                  await supabase
                    .from('profiles')
                    .update({ credit_balance: newBalance })
                    .eq('id', repProfile.id);

                  reversalLog.push(
                    `${repProfile.full_name}: -$${commAmount.toFixed(2)} (balance: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)})`
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
          logger.error('Commission reversal error (non-blocking):', commErr);
          toast({ variant: 'destructive', title: 'Warning', description: 'Movement deleted but commission reversal failed.' });
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
