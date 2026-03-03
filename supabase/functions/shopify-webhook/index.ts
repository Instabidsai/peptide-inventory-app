import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  importExternalOrder,
  formatShopifyAddress,
  mapShopifyPaymentStatus,
} from "../_shared/platform-order-sync.ts";

/**
 * Shopify order webhook handler.
 * Receives Shopify webhook POSTs for order events (orders/create, orders/updated)
 * and creates/updates sales_orders in the system.
 *
 * Webhook URL format:
 *   https://<supabase-url>/functions/v1/shopify-webhook?org_id=<org_id>
 *
 * The org_id is embedded in the webhook URL when the webhook is registered.
 * HMAC validation uses the Shopify webhook secret stored in tenant_api_keys.
 */

// ── HMAC Signature validation ────────────────────────────────
async function validateShopifyHmac(
  req: Request,
  body: string,
  secret: string,
): Promise<boolean> {
  if (!secret) return true; // Skip in dev mode

  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
  if (!hmacHeader) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = new Uint8Array(sig);
  const expected = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));

  // Constant-time comparison to prevent timing attacks
  if (computed.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed[i] ^ expected[i];
  }
  return mismatch === 0;
}

// ── Main handler ─────────────────────────────────────────────
Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("org_id");

    if (!orgId) {
      console.error("[shopify-webhook] Missing org_id in URL");
      return new Response("Missing org_id", { status: 400 });
    }

    const body = await req.text();

    // Create service-role Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the webhook secret for this org
    const { data: secretRecord } = await supabase
      .from("tenant_api_keys")
      .select("api_key")
      .eq("org_id", orgId)
      .eq("service", "shopify_webhook_secret")
      .maybeSingle();

    // Validate HMAC signature
    const valid = await validateShopifyHmac(req, body, secretRecord?.api_key || "");
    if (!valid) {
      console.error("[shopify-webhook] Invalid HMAC signature for org:", orgId);
      return new Response("Forbidden", { status: 403 });
    }

    // Parse the Shopify order payload
    const shopifyOrder = JSON.parse(body);

    // Ignore test/verification pings from Shopify
    const topic = req.headers.get("X-Shopify-Topic") || "";
    if (!topic.startsWith("orders/")) {
      console.log(`[shopify-webhook] Ignoring non-order topic: ${topic}`);
      return new Response("OK", { status: 200 });
    }

    // Skip cancelled or voided orders
    if (shopifyOrder.cancelled_at || shopifyOrder.financial_status === "voided") {
      console.log(`[shopify-webhook] Skipping cancelled/voided order: ${shopifyOrder.id}`);
      return new Response("OK", { status: 200 });
    }

    // Extract line items
    const items = (shopifyOrder.line_items || []).map((li: any) => ({
      name: li.title || li.name || "",
      sku: li.sku || "",
      quantity: li.quantity || 1,
      unit_price: parseFloat(li.price) || 0,
    }));

    if (items.length === 0) {
      console.log(`[shopify-webhook] Order ${shopifyOrder.id} has no line items, skipping`);
      return new Response("OK", { status: 200 });
    }

    // Build external order object
    const customer = shopifyOrder.customer || {};
    const shippingAddr = shopifyOrder.shipping_address || shopifyOrder.billing_address;

    // Look up admin user for this org (for source_user_id)
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    // Extract discount codes from the order
    const discountCodes = (shopifyOrder.discount_codes || [])
      .map((dc: any) => dc.code)
      .filter(Boolean);

    const result = await importExternalOrder(supabase, orgId, {
      platform: "shopify",
      external_id: String(shopifyOrder.id),
      customer_email: shopifyOrder.email || customer.email || "",
      customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || shopifyOrder.email || "",
      customer_phone: customer.phone || shippingAddr?.phone || "",
      shipping_address: formatShopifyAddress(shippingAddr),
      total_amount: parseFloat(shopifyOrder.total_price) || 0,
      payment_status: mapShopifyPaymentStatus(shopifyOrder.financial_status || "pending"),
      items,
      discount_codes: discountCodes,
    }, adminProfile?.user_id);

    if (result.success && !result.error) {
      console.log(`[shopify-webhook] Imported order #${shopifyOrder.id} → ${result.orderId} (${result.matchedItems} items)`);

      // Log to admin_ai_logs for visibility
      await supabase.from("admin_ai_logs").insert({
        user_id: adminProfile?.user_id || null,
        tool_name: "shopify_order_import",
        tool_args: { shopify_order_id: shopifyOrder.id, order_name: shopifyOrder.name },
        tool_result: `Imported → ${result.orderId}, ${result.matchedItems} items matched, ${result.skippedItems} skipped`,
        duration_ms: 0,
      }).catch(() => {});

      // Create notification for admin
      await supabase.from("notifications").insert({
        org_id: orgId,
        user_id: adminProfile?.user_id || null,
        type: "order",
        title: `Shopify Order ${shopifyOrder.name || "#" + shopifyOrder.id} imported`,
        message: `${result.matchedItems} item(s) synced to fulfillment queue.${result.skippedItems > 0 ? ` ${result.skippedItems} item(s) could not be matched.` : ""}`,
      }).catch(() => {});


    } else if (result.error === "Order already imported") {
      console.log(`[shopify-webhook] Order #${shopifyOrder.id} already exists, skipping`);
    } else {
      console.error(`[shopify-webhook] Failed to import order #${shopifyOrder.id}: ${result.error}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[shopify-webhook] Error:", err);
    return new Response("OK", { status: 200 }); // Always 200 so Shopify doesn't retry excessively
  }
});
