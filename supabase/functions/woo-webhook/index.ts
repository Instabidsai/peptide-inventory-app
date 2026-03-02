import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  importExternalOrder,
  formatWooAddress,
  mapWooPaymentStatus,
} from "../_shared/platform-order-sync.ts";

/**
 * WooCommerce order webhook handler.
 * Receives WooCommerce webhook POSTs for order events (order.created, order.updated)
 * and creates/updates sales_orders in the system.
 *
 * Webhook URL format:
 *   https://<supabase-url>/functions/v1/woo-webhook?org_id=<org_id>
 *
 * Signature validation uses the webhook secret stored in tenant_api_keys
 * (service = 'woo_webhook_secret'). WooCommerce sends HMAC-SHA256 in
 * X-WC-Webhook-Signature header, base64-encoded.
 */

// ── WooCommerce HMAC-SHA256 signature validation ─────────────
async function validateWooSignature(
  req: Request,
  body: string,
  secret: string,
): Promise<boolean> {
  if (!secret) return true; // Skip if no secret configured yet

  const signature = req.headers.get("X-WC-Webhook-Signature");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computedBytes = new Uint8Array(sig);
  const computed = btoa(String.fromCharCode(...computedBytes));

  // Constant-time comparison to prevent timing attacks
  if (computed.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
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
      console.error("[woo-webhook] Missing org_id in URL");
      return new Response("Missing org_id", { status: 400 });
    }

    const body = await req.text();

    // Handle WooCommerce's verification ping (sends empty or test payload)
    const topic = req.headers.get("X-WC-Webhook-Topic") || "";
    const resource = req.headers.get("X-WC-Webhook-Resource") || "";

    // WooCommerce sends a ping with webhook_id on creation — just ACK it
    if (!topic || topic === "action.woocommerce_webhook_ping") {
      console.log(`[woo-webhook] Received ping for org ${orgId}, ACK`);
      return new Response("OK", { status: 200 });
    }

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
      .eq("service", "woo_webhook_secret")
      .maybeSingle();

    // Validate HMAC signature
    const valid = await validateWooSignature(req, body, secretRecord?.api_key || "");
    if (!valid) {
      console.error("[woo-webhook] Invalid signature for org:", orgId);
      return new Response("Forbidden", { status: 403 });
    }

    // Parse the WooCommerce order payload
    const wooOrder = JSON.parse(body);

    // Only process order events
    if (resource !== "order") {
      console.log(`[woo-webhook] Ignoring non-order resource: ${resource}`);
      return new Response("OK", { status: 200 });
    }

    // Skip cancelled, refunded, or failed orders
    const skipStatuses = ["cancelled", "refunded", "failed", "trash"];
    if (skipStatuses.includes(wooOrder.status)) {
      console.log(`[woo-webhook] Skipping ${wooOrder.status} order: ${wooOrder.id}`);
      return new Response("OK", { status: 200 });
    }

    // Extract line items
    const items = (wooOrder.line_items || []).map((li: any) => ({
      name: li.name || li.product_name || "",
      sku: li.sku || "",
      quantity: li.quantity || 1,
      unit_price: parseFloat(li.price) || (parseFloat(li.total) / (li.quantity || 1)) || 0,
    }));

    if (items.length === 0) {
      console.log(`[woo-webhook] Order ${wooOrder.id} has no line items, skipping`);
      return new Response("OK", { status: 200 });
    }

    // Build customer info from billing or shipping
    const billing = wooOrder.billing || {};
    const shipping = wooOrder.shipping || {};
    const customerName = [billing.first_name, billing.last_name].filter(Boolean).join(" ") ||
                         [shipping.first_name, shipping.last_name].filter(Boolean).join(" ");

    // Look up admin user for this org
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    const result = await importExternalOrder(supabase, orgId, {
      platform: "woocommerce",
      external_id: String(wooOrder.id),
      customer_email: billing.email || "",
      customer_name: customerName,
      customer_phone: billing.phone || "",
      shipping_address: formatWooAddress(shipping.address_1 ? shipping : billing),
      total_amount: parseFloat(wooOrder.total) || 0,
      payment_status: mapWooPaymentStatus(wooOrder.status || "pending"),
      items,
    }, adminProfile?.user_id);

    if (result.success && !result.error) {
      console.log(`[woo-webhook] Imported WC order #${wooOrder.id} → ${result.orderId} (${result.matchedItems} items)`);

      // Log for visibility
      await supabase.from("admin_ai_logs").insert({
        user_id: adminProfile?.user_id || null,
        tool_name: "woo_order_import",
        tool_args: { woo_order_id: wooOrder.id, status: wooOrder.status },
        tool_result: `Imported → ${result.orderId}, ${result.matchedItems} items matched, ${result.skippedItems} skipped`,
        duration_ms: 0,
      }).catch(() => {});

      // Create notification
      await supabase.from("notifications").insert({
        org_id: orgId,
        user_id: adminProfile?.user_id || null,
        type: "order",
        title: `WooCommerce Order #${wooOrder.id} imported`,
        message: `${result.matchedItems} item(s) synced to fulfillment queue.${result.skippedItems > 0 ? ` ${result.skippedItems} item(s) could not be matched.` : ""}`,
      }).catch(() => {});

    } else if (result.error === "Order already imported") {
      console.log(`[woo-webhook] WC order #${wooOrder.id} already exists, skipping`);
    } else {
      console.error(`[woo-webhook] Failed to import WC order #${wooOrder.id}: ${result.error}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[woo-webhook] Error:", err);
    return new Response("OK", { status: 200 }); // Always 200 so WooCommerce doesn't retry excessively
  }
});
