/**
 * Shared logic for creating sales orders from external platforms (Shopify, WooCommerce).
 * Used by shopify-webhook, woo-webhook, and AI sync tools.
 */

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
  payment_status: "paid" | "unpaid" | "partial";
  items: ExternalOrderItem[];
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
    // For Shopify, check by notes pattern since there's no shopify_order_id column
    const { data: existing } = await supabase
      .from("sales_orders")
      .select("id")
      .eq("org_id", orgId)
      .eq("order_source", "shopify")
      .ilike("notes", `%Shopify Order #${order.external_id}%`)
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
  const matchedItems: { peptide_id: string; quantity: number; unit_price: number }[] = [];
  let skippedItems = 0;

  for (const item of order.items) {
    let peptideId: string | null = null;

    // Try exact name match (case-insensitive)
    const { data: nameMatch } = await supabase
      .from("peptides")
      .select("id")
      .eq("org_id", orgId)
      .ilike("name", item.name)
      .limit(1)
      .maybeSingle();

    if (nameMatch) {
      peptideId = nameMatch.id;
    }

    // Try SKU match if name didn't work
    if (!peptideId && item.sku) {
      const { data: skuMatch } = await supabase
        .from("peptides")
        .select("id")
        .eq("org_id", orgId)
        .ilike("sku", item.sku)
        .limit(1)
        .maybeSingle();

      if (skuMatch) {
        peptideId = skuMatch.id;
      }
    }

    // Fuzzy: try first word of product name
    if (!peptideId) {
      const firstWord = item.name.split(/[\s\-_]+/)[0];
      if (firstWord && firstWord.length >= 3) {
        const { data: fuzzyMatch } = await supabase
          .from("peptides")
          .select("id")
          .eq("org_id", orgId)
          .ilike("name", `%${firstWord}%`)
          .limit(1)
          .maybeSingle();

        if (fuzzyMatch) {
          peptideId = fuzzyMatch.id;
        }
      }
    }

    if (peptideId) {
      matchedItems.push({
        peptide_id: peptideId,
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
    source_user_id: adminUserId || null,
  };

  if (order.platform === "woocommerce") {
    orderData.woo_order_id = parseInt(order.external_id) || null;
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

  console.log(`[platform-order-sync] Imported ${platformLabel} order #${order.external_id} → ${newOrder.id} (${matchedItems.length} items, ${skippedItems} skipped)`);

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
export function mapWooPaymentStatus(status: string): "paid" | "unpaid" | "partial" {
  switch (status) {
    case "completed":
    case "processing":
      return "paid";
    case "on-hold":
      return "partial";
    default:
      return "unpaid";
  }
}
