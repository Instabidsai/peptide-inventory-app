/**
 * fulfill-order — Edge function that fulfills a sales order.
 * Uses service role key to bypass RLS (movements/movement_items/client_inventory
 * INSERT policies restrict to admin/staff, but sales_reps and admins without
 * user_roles rows also need to fulfill orders).
 *
 * Auth: JWT validated via _shared/auth.ts — requires admin, staff, or sales_rep role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { format } from "https://esm.sh/date-fns@3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Auth — accept admin, staff, sales_rep, or vendor
    let auth;
    try {
      auth = await authenticateRequest(req, {
        requireRole: ["admin", "staff", "sales_rep", "vendor"],
      });
    } catch (err) {
      // If user_roles lookup failed but profile has the right role, allow it
      // (auth.ts checks user_roles which may be empty for some users)
      if (err instanceof AuthError && err.status === 403) {
        // Retry without role restriction — we'll check profile.role below
        auth = await authenticateRequest(req, { requireRole: [] });

        // Check profile.role manually
        const { data: profile } = await auth.supabase
          .from("profiles")
          .select("role")
          .eq("user_id", auth.user.id)
          .single();

        const profileRole = profile?.role || "";
        if (!["admin", "staff", "sales_rep", "vendor"].includes(profileRole)) {
          return json({ error: "Forbidden: insufficient role" }, 403);
        }
      } else {
        throw err;
      }
    }

    const { orderId } = await req.json();
    if (!orderId) return json({ error: "orderId is required" }, 400);

    // Service role client — bypasses RLS
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(sbUrl, sbKey);

    // 1. Get order with items
    const { data: order, error: orderError } = await svc
      .from("sales_orders")
      .select(`*, sales_order_items (*, peptides (id, name))`)
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.status === "fulfilled")
      return json({ error: "Order already fulfilled" }, 409);

    // Verify org matches the authenticated user's org
    if (auth.orgId && order.org_id !== auth.orgId) {
      return json({ error: "Order belongs to a different org" }, 403);
    }

    // Get profile ID for created_by
    const { data: profile } = await svc
      .from("profiles")
      .select("id")
      .eq("user_id", auth.user.id)
      .single();
    const profileId = profile?.id || auth.user.id;

    let movementId: string | null = null;
    const soldBottleIds: string[] = [];

    try {
      // 2. Create movement
      const { data: movement, error: movError } = await svc
        .from("movements")
        .insert({
          org_id: order.org_id,
          type: "sale",
          contact_id: order.client_id,
          movement_date: format(new Date(), "yyyy-MM-dd"),
          notes: `[SO:${orderId}] Fulfilled Sales Order #${orderId.slice(0, 8)}`,
          created_by: order.rep_id || profileId,
          payment_status: order.payment_status || "unpaid",
          amount_paid: order.amount_paid || 0,
          payment_date: order.payment_date,
        })
        .select()
        .maybeSingle();

      if (movError) throw movError;
      if (!movement) throw new Error("Failed to create movement");
      movementId = movement.id;

      // 3. Allocate inventory (FIFO)
      const allocatedBottles: Array<{
        peptideId: string;
        peptideName: string;
        bottleId: string;
        lotNumber: string | null;
      }> = [];

      for (const item of order.sales_order_items || []) {
        const { data: bottles, error: bError } = await svc
          .from("bottles")
          .select("*, lots!inner(peptide_id, lot_number)")
          .eq("status", "in_stock")
          .eq("lots.peptide_id", item.peptide_id)
          .eq("org_id", order.org_id)
          .order("created_at", { ascending: true })
          .limit(item.quantity);

        if (bError) throw bError;
        if (!bottles || bottles.length < item.quantity) {
          throw new Error(
            `Insufficient stock for ${item.peptides?.name}. Need ${item.quantity}, found ${bottles?.length || 0}.`
          );
        }

        const bottleIds = bottles.map((b: { id: string }) => b.id);

        for (const b of bottles) {
          allocatedBottles.push({
            peptideId: item.peptide_id,
            peptideName: item.peptides?.name || "",
            bottleId: b.id,
            lotNumber: (b as any).lots?.lot_number || null,
          });
        }

        // Create movement items
        const moveItems = bottles.map((b: { id: string }) => ({
          movement_id: movement.id,
          bottle_id: b.id,
          price_at_sale: Math.round(item.unit_price * 100) / 100,
        }));

        const { error: miError } = await svc
          .from("movement_items")
          .insert(moveItems);
        if (miError) throw miError;

        // Update bottles to sold
        const { error: buError } = await svc
          .from("bottles")
          .update({ status: "sold" })
          .in("id", bottleIds);
        if (buError) throw buError;

        soldBottleIds.push(...bottleIds);
      }

      // 4. Update order status
      const { error: updateError } = await svc
        .from("sales_orders")
        .update({ status: "fulfilled" })
        .eq("id", orderId);
      if (updateError) throw updateError;

      // 5. Auto-generate protocol + client_inventory (non-blocking)
      if (order.client_id && allocatedBottles.length > 0) {
        try {
          // Dedupe peptides
          const uniquePeptides = [
            ...new Map(
              allocatedBottles.map((b) => [
                b.peptideId,
                { peptideId: b.peptideId, peptideName: b.peptideName },
              ])
            ).values(),
          ];

          // Check/create protocol
          const { data: existingProtocol } = await svc
            .from("protocols")
            .select("id")
            .eq("contact_id", order.client_id)
            .eq("org_id", order.org_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let protocolId = existingProtocol?.id;

          if (!protocolId) {
            const { data: newProto } = await svc
              .from("protocols")
              .insert({
                contact_id: order.client_id,
                org_id: order.org_id,
                name: "Auto-generated Protocol",
                status: "active",
              })
              .select("id")
              .single();
            protocolId = newProto?.id;
          }

          // Create protocol items + client_inventory
          const protocolItemMap = new Map<string, string>();

          if (protocolId) {
            for (const pep of uniquePeptides) {
              // Check existing protocol item
              const { data: existingItem } = await svc
                .from("protocol_items")
                .select("id")
                .eq("protocol_id", protocolId)
                .eq("peptide_id", pep.peptideId)
                .maybeSingle();

              if (existingItem) {
                protocolItemMap.set(pep.peptideId, existingItem.id);
              } else {
                const { data: newItem } = await svc
                  .from("protocol_items")
                  .insert({
                    protocol_id: protocolId,
                    peptide_id: pep.peptideId,
                    name: pep.peptideName,
                  })
                  .select("id")
                  .single();
                if (newItem) protocolItemMap.set(pep.peptideId, newItem.id);
              }
            }
          }

          // Parse vial size from name
          const parseVialSize = (name: string): number => {
            const match = name.match(/(\d+)\s*mg/i);
            return match ? parseInt(match[1]) : 5;
          };

          const inventoryEntries = allocatedBottles.map((b) => {
            const vialSizeMg = parseVialSize(b.peptideName);
            return {
              contact_id: order.client_id,
              movement_id: movement.id,
              peptide_id: b.peptideId,
              batch_number: b.lotNumber,
              vial_size_mg: vialSizeMg,
              water_added_ml: null,
              current_quantity_mg: vialSizeMg,
              initial_quantity_mg: vialSizeMg,
              concentration_mg_ml: null,
              status: "active",
              protocol_item_id: protocolItemMap.get(b.peptideId) || null,
            };
          });

          await svc.from("client_inventory").insert(inventoryEntries);
        } catch (autoErr) {
          console.error("Auto-protocol failed (non-blocking):", autoErr);
        }
      }

      // 6. Process commissions
      if ((order.commission_amount ?? 0) > 0) {
        const { error: rpcError } = await svc.rpc("process_sale_commission", {
          p_sale_id: orderId,
        });
        if (rpcError) {
          console.error("Commission processing failed:", rpcError);
        } else {
          svc.functions
            .invoke("notify-commission", { body: { sale_id: orderId } })
            .catch(() => {});
        }
      }

      // 7. Recalculate COGS + profit
      try {
        const { data: items } = await svc
          .from("sales_order_items")
          .select("quantity, unit_price, peptide_id")
          .eq("sales_order_id", orderId);

        if (items && items.length > 0) {
          let totalCogs = 0;
          for (const it of items) {
            const { data: avgCost } = await svc
              .from("lots")
              .select("cost_per_unit")
              .eq("peptide_id", it.peptide_id)
              .eq("org_id", order.org_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            totalCogs += (avgCost?.cost_per_unit || 0) * it.quantity;
          }

          const revenue = items.reduce(
            (sum: number, it: any) => sum + it.unit_price * it.quantity,
            0
          );

          await svc
            .from("sales_orders")
            .update({
              cogs: Math.round(totalCogs * 100) / 100,
              profit: Math.round((revenue - totalCogs) * 100) / 100,
            })
            .eq("id", orderId);
        }
      } catch {
        // Non-blocking
      }

      return json({ success: true, movementId: movement.id });
    } catch (err) {
      // ROLLBACK
      console.error("Fulfillment failed, rolling back:", err);

      if (soldBottleIds.length > 0) {
        await svc
          .from("bottles")
          .update({ status: "in_stock" })
          .in("id", soldBottleIds);
      }

      if (movementId) {
        await svc
          .from("movement_items")
          .delete()
          .eq("movement_id", movementId);
        await svc
          .from("client_inventory")
          .delete()
          .eq("movement_id", movementId);
        await svc.from("movements").delete().eq("id", movementId);
      }

      await svc
        .from("sales_orders")
        .update({ status: order.status })
        .eq("id", orderId);

      throw err;
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return json({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
