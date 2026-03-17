/**
 * Shared logic for creating sales orders from external platforms (Shopify, WooCommerce).
 * Used by shopify-webhook, woo-webhook, and AI sync tools.
 *
 * After order creation, automatically:
 * - Creates customer auth account + portal invite link
 * - Generates protocol + client_inventory entries (fridge items)
 */

import { autoCreateCustomer, serverAutoGenerateProtocol } from "./auto-customer.ts";

export interface ExternalOrderItem {
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
}

export interface ExternalOrder {
  platform: "shopify" | "woocommerce";
  external_id: string;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: string;
  total_amount: number;
  payment_status: "paid" | "unpaid" | "partial" | "pending_verification";
  payment_method?: string;
  items: ExternalOrderItem[];
  discount_codes?: string[];
}

export interface ImportResult {
  success: boolean;
  orderId?: string;
  error?: string;
  matchedItems: number;
  skippedItems: number;
}

/**
 * Import an order from an external platform into the sales_orders system.
 * Handles contact matching/creation, product matching, duplicate detection.
 */
export async function importExternalOrder(
  supabase: any,
  orgId: string,
  order: ExternalOrder,
  adminUserId?: string,
): Promise<ImportResult> {
  const platformLabel = order.platform === "shopify" ? "Shopify" : "WooCommerce";

  // ── 1. Duplicate detection ──────────────────────────────────
  // Check if we already imported this order
  if (order.platform === "woocommerce") {
    const { data: existing } = await supabase
      .from("sales_orders")
      .select("id")
      .eq("org_id", orgId)
      .eq("order_source", "woocommerce")
      .eq("woo_order_id", parseInt(order.external_id) || 0)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { success: true, orderId: existing.id, matchedItems: 0, skippedItems: 0, error: "Order already imported" };
    }
  } else {
    // Shopify: use dedicated shopify_order_id column for reliable dedup
    const { data: existing } = await supabase
      .from("sales_orders")
      .select("id")
      .eq("org_id", orgId)
      .eq("order_source", "shopify")
      .eq("shopify_order_id", order.external_id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { success: true, orderId: existing.id, matchedItems: 0, skippedItems: 0, error: "Order already imported" };
    }
  }

  // ── 2. Find or create contact ───────────────────────────────
  let contactId: string | null = null;

  if (order.customer_email) {
    // Try email match first
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .ilike("email", order.customer_email)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Create new contact
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          org_id: orgId,
          name: order.customer_name || order.customer_email.split("@")[0],
          email: order.customer_email.toLowerCase(),
          phone: order.customer_phone || null,
          source: order.platform,
        })
        .select("id")
        .single();

      contactId = newContact?.id || null;
    }
  } else if (order.customer_name) {
    // Try name match if no email
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .ilike("name", order.customer_name)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    }
  }

  // ── 3. Match line items to peptides ─────────────────────────
  const matchedItems: { peptide_id: string; peptide_name: string; quantity: number; unit_price: number }[] = [];
  let skippedItems = 0;

  for (const item of order.items) {
    let peptideId: string | null = null;
    let peptideName: string = item.name;

    // Try exact name match (case-insensitive)
    const { data: nameMatch } = await supabase
      .from("peptides")
      .select("id, name")
      .eq("org_id", orgId)
      .ilike("name", item.name)
      .limit(1)
      .maybeSingle();

    if (nameMatch) {
      peptideId = nameMatch.id;
      peptideName = nameMatch.name;
    }

    // Try SKU match if name didn't work
    if (!peptideId && item.sku) {
      const { data: skuMatch } = await supabase
        .from("peptides")
        .select("id, name")
        .eq("org_id", orgId)
        .ilike("sku", item.sku)
        .limit(1)
        .maybeSingle();

      if (skuMatch) {
        peptideId = skuMatch.id;
        peptideName = skuMatch.name;
      }
    }

    // Fuzzy: try first word of product name
    if (!peptideId) {
      const firstWord = item.name.split(/[\s\-_]+/)[0];
      if (firstWord && firstWord.length >= 3) {
        const { data: fuzzyMatch } = await supabase
          .from("peptides")
          .select("id, name")
          .eq("org_id", orgId)
          .ilike("name", `%${firstWord}%`)
          .limit(1)
          .maybeSingle();

        if (fuzzyMatch) {
          peptideId = fuzzyMatch.id;
          peptideName = fuzzyMatch.name;
        }
      }
    }

    if (peptideId) {
      matchedItems.push({
        peptide_id: peptideId,
        peptide_name: peptideName,
        quantity: item.quantity,
        unit_price: item.unit_price,
      });
    } else {
      skippedItems++;
      console.log(`[platform-order-sync] Could not match product: "${item.name}" (SKU: ${item.sku || "none"}) for org ${orgId}`);
    }
  }

  if (matchedItems.length === 0) {
    return {
      success: false,
      matchedItems: 0,
      skippedItems,
      error: `No line items could be matched to products. Items: ${order.items.map(i => i.name).join(", ")}`,
    };
  }

  // ── 4. Create sales_order ───────────────────────────────────
  const orderData: Record<string, any> = {
    org_id: orgId,
    client_id: contactId,
    status: "submitted",
    total_amount: order.total_amount,
    payment_status: order.payment_status,
    delivery_method: "shipping",
    shipping_address: order.shipping_address || null,
    notes: `${platformLabel} Order #${order.external_id}`,
    order_source: order.platform,
    payment_method: order.payment_method || null,
  };

  if (order.platform === "woocommerce") {
    orderData.woo_order_id = parseInt(order.external_id) || null;
  } else if (order.platform === "shopify") {
    orderData.shopify_order_id = order.external_id;
  }

  const { data: newOrder, error: orderError } = await supabase
    .from("sales_orders")
    .insert(orderData)
    .select("id")
    .single();

  if (orderError) {
    return {
      success: false,
      matchedItems: matchedItems.length,
      skippedItems,
      error: `Failed to create order: ${orderError.message}`,
    };
  }

  // ── 5. Create order items ───────────────────────────────────
  const orderItems = matchedItems.map(item => ({
    sales_order_id: newOrder.id,
    peptide_id: item.peptide_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const { error: itemsError } = await supabase
    .from("sales_order_items")
    .insert(orderItems);

  if (itemsError) {
    console.error(`[platform-order-sync] Failed to create order items: ${itemsError.message}`);
    // Order was created, items failed — still return the order ID
  }

  // ── 6. Coupon code → partner attribution ──────────────────
  if (order.discount_codes && order.discount_codes.length > 0) {
    for (const code of order.discount_codes) {
      const { data: discountCode } = await supabase
        .from("partner_discount_codes")
        .select("partner_id, id")
        .eq("org_id", orgId)
        .ilike("code", code)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (discountCode) {
        // Attribute order to partner
        await supabase
          .from("sales_orders")
          .update({ rep_id: discountCode.partner_id })
          .eq("id", newOrder.id);

        // Increment uses count
        await supabase.rpc("increment_discount_code_uses", { code_id: discountCode.id }).catch(() => {
          // Fallback if RPC doesn't exist yet
          supabase
            .from("partner_discount_codes")
            .update({ uses_count: (discountCode as any).uses_count + 1 })
            .eq("id", discountCode.id)
            .catch(() => {});
        });

        console.log(`[platform-order-sync] Attributed order ${newOrder.id} to partner ${discountCode.partner_id} via code "${code}"`);
        break; // Only attribute to first matching code
      }
    }
  }

  // ── 6b. Email → partner attribution (Layer 2) ───────────────
  // If no coupon matched, try to attribute via customer email.
  // If the customer already has a contact with assigned_rep_id, use that rep.
  if (order.customer_email) {
    const { data: currentOrder } = await supabase
      .from("sales_orders")
      .select("rep_id")
      .eq("id", newOrder.id)
      .maybeSingle();

    if (!currentOrder?.rep_id) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("assigned_rep_id")
        .eq("org_id", orgId)
        .ilike("email", order.customer_email)
        .not("assigned_rep_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (existingContact?.assigned_rep_id) {
        await supabase
          .from("sales_orders")
          .update({ rep_id: existingContact.assigned_rep_id })
          .eq("id", newOrder.id);

        console.log(`[platform-order-sync] Attributed order ${newOrder.id} to rep ${existingContact.assigned_rep_id} via email match "${order.customer_email}"`);
      }
    }
  }

  console.log(`[platform-order-sync] Imported ${platformLabel} order #${order.external_id} → ${newOrder.id} (${matchedItems.length} items, ${skippedItems} skipped)`);

  // ── 7. Auto-create customer account ─────────────────────────
  // Non-blocking: creates auth user + profile + invite link
  if (contactId && order.customer_email) {
    try {
      const result = await autoCreateCustomer(
        supabase, orgId, contactId, order.customer_email, order.customer_name,
      );
      if (!result.alreadyLinked) {
        console.log(`[platform-order-sync] Auto-created customer for ${order.customer_email} → invite: ${result.inviteLink}`);
      }
    } catch (e) {
      console.warn("[platform-order-sync] Auto-customer creation failed (non-blocking):", (e as Error).message);
    }
  }

  // ── 8. Auto-generate protocol + fridge entries ──────────────
  // Non-blocking: creates protocol items + client_inventory (virtual vials)
  if (contactId && matchedItems.length > 0) {
    try {
      const protocolItems = matchedItems.map((item) => ({
        peptide_id: item.peptide_id,
        peptide_name: item.peptide_name,
      }));

      const { protocolItemMap } = await serverAutoGenerateProtocol(
        supabase, contactId, orgId, protocolItems,
      );

      // Create client_inventory entries (virtual vials — no physical bottle allocation)
      const inventoryEntries = matchedItems.map((item) => ({
        contact_id: contactId,
        peptide_id: item.peptide_id,
        vial_size_mg: 5,
        current_quantity_mg: 5,
        initial_quantity_mg: 5,
        status: "active",
        protocol_item_id: protocolItemMap?.get(item.peptide_id) || null,
      }));

      const { error: invError } = await supabase
        .from("client_inventory")
        .insert(inventoryEntries);

      if (invError) {
        console.warn("[platform-order-sync] client_inventory insert warning:", invError.message);
      } else {
        console.log(`[platform-order-sync] Auto-created ${inventoryEntries.length} fridge entries for contact ${contactId}`);
      }
    } catch (e) {
      console.warn("[platform-order-sync] Auto-protocol/inventory failed (non-blocking):", (e as Error).message);
    }
  }

  return {
    success: true,
    orderId: newOrder.id,
    matchedItems: matchedItems.length,
    skippedItems,
  };
}

/**
 * Format a shipping address from Shopify address object.
 */
export function formatShopifyAddress(addr: any): string {
  if (!addr) return "";
  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province_code || addr.province,
    addr.zip,
    addr.country_code || addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * Format a shipping address from WooCommerce address object.
 */
export function formatWooAddress(addr: any): string {
  if (!addr) return "";
  const parts = [
    addr.address_1,
    addr.address_2,
    addr.city,
    addr.state,
    addr.postcode,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * Map Shopify financial_status to our payment_status.
 */
export function mapShopifyPaymentStatus(status: string): "paid" | "unpaid" | "partial" {
  switch (status) {
    case "paid":
    case "refunded":
    case "partially_refunded":
      return "paid";
    case "partially_paid":
      return "partial";
    default:
      return "unpaid";
  }
}

/**
 * Map WooCommerce status to our payment_status.
 */
export function mapWooPaymentStatus(status: string): "paid" | "unpaid" | "partial" | "pending_verification" {
  switch (status) {
    case "completed":
      return "paid";
    case "processing":
    case "on-hold":
      return "pending_verification";
    default:
      return "unpaid";
  }
}
