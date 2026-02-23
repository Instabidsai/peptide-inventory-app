import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Notify partners via SMS when they earn a commission.
 * Called after process_sale_commission creates commission records.
 *
 * POST body: { sale_id: uuid }
 *
 * Required env vars:
 *   TEXTBELT_API_KEY — for sending SMS
 */

function getCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const textbeltKey = Deno.env.get("TEXTBELT_API_KEY");
    if (!textbeltKey) return json({ ok: true, skipped: "TEXTBELT_API_KEY not set" });

    const { sale_id } = await req.json();
    if (!sale_id) return json({ error: "sale_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get commissions for this sale
    const { data: commissions } = await supabase
      .from("commissions")
      .select("partner_id, amount, type")
      .eq("sale_id", sale_id);

    if (!commissions?.length) return json({ ok: true, notified: 0 });

    // Get order context
    const { data: order } = await supabase
      .from("sales_orders")
      .select("total_amount, org_id, contacts(name)")
      .eq("id", sale_id)
      .single();

    if (!order) return json({ ok: true, notified: 0 });

    const customerName = order.contacts?.name || "a customer";
    const orderTotal = Number(order.total_amount || 0).toFixed(2);

    // Group by partner
    const partnerTotals: Record<string, number> = {};
    for (const c of commissions) {
      partnerTotals[c.partner_id] = (partnerTotals[c.partner_id] || 0) + Number(c.amount);
    }

    let notified = 0;
    for (const [partnerId, totalCommission] of Object.entries(partnerTotals)) {
      if (totalCommission <= 0) continue;

      // Get partner profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, user_id")
        .eq("id", partnerId)
        .single();

      if (!profile) continue;

      // Find phone via linked contact
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("org_id", order.org_id)
        .eq("linked_user_id", profile.user_id)
        .single();

      const phone = contact?.phone;
      if (!phone) continue;

      const firstName = (profile.full_name || "").split(" ")[0] || "Partner";
      const msg = `${firstName}, new sale! ${customerName} - $${orderTotal}. Your commission: $${totalCommission.toFixed(2)}`;

      const resp = await fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: msg, key: textbeltKey }),
      });
      const result = await resp.json();
      if (result.success) notified++;
    }

    return json({ ok: true, notified });
  } catch (err) {
    console.error("notify-commission error:", err);
    return json({ ok: true, notified: 0 }); // Don't fail hard — notifications are non-critical
  }
});
