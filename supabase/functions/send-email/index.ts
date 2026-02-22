import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * send-email — Supabase Edge Function
 * Called by: run-automations (action_type: "email"), or any internal service.
 * POST body: { to, subject, html, org_id }
 * Uses Resend API for delivery. Falls back to logging if no API key configured.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_URL = "https://api.resend.com/emails";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || "");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { to, subject, html, org_id, from_name, from_email } = body;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject, and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Optionally fetch tenant branding for from address
    let senderName = from_name || "Peptide Portal";
    let senderEmail = from_email || "noreply@thepeptideai.com";

    if (org_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: config } = await supabase
        .from("tenant_config")
        .select("brand_name, support_email")
        .eq("org_id", org_id)
        .single();

      if (config?.brand_name) senderName = config.brand_name;
      if (config?.support_email) senderEmail = config.support_email;
    }

    if (!RESEND_API_KEY) {
      console.log(`[send-email] No RESEND_API_KEY — would send "${subject}" to ${to}`);
      return new Response(
        JSON.stringify({ sent: false, queued: true, note: "No RESEND_API_KEY configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[send-email] Resend error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Email delivery failed", detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await response.json();
    return new Response(
      JSON.stringify({ sent: true, id: result.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[send-email] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
