import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { sanitizeString } from "../_shared/validate.ts";
import {
  ADMIN_SYSTEM_PROMPT,
  STAFF_SYSTEM_PROMPT,
  SHARED_RULES,
  loadSmartContext,
  runAILoop,
} from "../_shared/ai-core.ts";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
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
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("user_id", user.id).single();
    if (!profile?.org_id) return json({ error: "No organization" }, 400);

    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    const role = userRole?.role || profile.role;
    if (!["admin", "staff"].includes(role)) return json({ error: "Admin or staff role required" }, 403);

    // Rate limit
    const rl = checkRateLimit(user.id, { maxRequests: 20, windowMs: 60_000 });
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs, corsHeaders);

    // Parse & validate user message
    const body = await req.json();
    const message = sanitizeString(body.message, 5000);
    if (!message) return json({ error: "message required (max 5000 chars)" }, 400);
    await supabase.from("admin_chat_messages").insert({ user_id: user.id, role: "user", content: message });

    // Load chat history + smart context in parallel
    const [{ data: history }, dynamicContext] = await Promise.all([
      supabase.from("admin_chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: true }).limit(30),
      loadSmartContext(supabase, profile.org_id),
    ]);

    // Run AI loop
    const systemPrompt = role === "admin" ? ADMIN_SYSTEM_PROMPT + SHARED_RULES : STAFF_SYSTEM_PROMPT + SHARED_RULES;
    const response = await runAILoop({
      supabase,
      orgId: profile.org_id,
      userId: user.id,
      userRole: role,
      systemPrompt,
      dynamicContext,
      chatHistory: (history || []).map((m: any) => ({ role: m.role, content: m.content })),
    });

    // Save & return
    await supabase.from("admin_chat_messages").insert({ user_id: user.id, role: "assistant", content: response });
    return json({ reply: response });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
