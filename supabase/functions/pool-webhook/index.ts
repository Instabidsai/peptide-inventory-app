import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

Deno.serve(withErrorReporting("pool-webhook", async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { pool_id, order_hash, status, tx_hash, error_message, api_key } = await req.json();
    if (!pool_id || !order_hash || !status || !api_key) {
      return jsonResponse({ error: "Missing required fields" }, 400, corsHeaders);
    }

    // Validate API key against pool
    const { data: pool, error: poolErr } = await supabase
      .from("payment_pools")
      .select("id, org_id, processor_api_key_encrypted")
      .eq("id", pool_id)
      .single();

    if (poolErr || !pool) {
      return jsonResponse({ error: "Unauthorized" }, 403, corsHeaders);
    }
    if (pool.processor_api_key_encrypted !== api_key) {
      return jsonResponse({ error: "Unauthorized" }, 403, corsHeaders);
    }

    // Build update payload based on status
    const update: Record<string, unknown> = { status };
    const now = new Date().toISOString();

    switch (status) {
      case "released":
        update.released_at = now;
        if (tx_hash) update.tx_hash = tx_hash;
        break;
      case "settled":
        update.settled_at = now;
        break;
      case "failed":
        if (error_message) update.error_message = error_message;
        break;
      case "chargeback":
        update.error_message = error_message || "Chargeback received";
        break;
      default:
        return jsonResponse({ error: `Invalid status: ${status}` }, 400, corsHeaders);
    }

    const { error: updateErr } = await supabase
      .from("pool_transactions")
      .update(update)
      .eq("order_hash", order_hash)
      .eq("org_id", pool.org_id);

    if (updateErr) {
      console.error("[pool-webhook] Update failed:", updateErr);
      return jsonResponse({ error: "Failed to update transaction" }, 500, corsHeaders);
    }

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[pool-webhook]", err);
    return jsonResponse({ error: (err as Error).message }, 500, corsHeaders);
  }
}));
