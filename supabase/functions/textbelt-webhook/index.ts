import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ADMIN_SYSTEM_PROMPT,
  SHARED_RULES,
  loadSmartContext,
  runAILoop,
} from "../_shared/ai-core.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * Textbelt reply webhook handler.
 * When the AI sends an SMS via Textbelt (send_sms tool), and the recipient
 * replies, Textbelt POSTs { fromNumber, text, textId } to this endpoint.
 *
 * The reply is processed through the same AI brain, and the AI's response
 * is sent back to the customer via Textbelt.
 *
 * Required env vars:
 *   TEXTBELT_API_KEY          — for sending reply SMS + signature validation
 *   SMS_ADMIN_USER_ID         — Supabase auth user ID to act as (shared with sms-webhook)
 */

const TEXTBELT_KEY = Deno.env.get("TEXTBELT_API_KEY") || "";
const ADMIN_USER_ID = Deno.env.get("SMS_ADMIN_USER_ID") || "";

// ── Signature validation ─────────────────────────────────────
async function validateTextbeltSignature(
  req: Request,
  body: string,
): Promise<boolean> {
  if (!TEXTBELT_KEY) return true; // Skip in dev mode

  const signature = req.headers.get("x-textbelt-signature");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TEXTBELT_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature;
}

// ── Main handler ─────────────────────────────────────────────
Deno.serve(withErrorReporting("textbelt-webhook", async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const body = await req.text();

    // Validate signature
    const valid = await validateTextbeltSignature(req, body);
    if (!valid) {
      console.error("Invalid Textbelt signature");
      return new Response("Forbidden", { status: 403 });
    }

    // Parse the webhook payload: { fromNumber, text, textId }
    const payload = JSON.parse(body);
    const fromNumber = payload.fromNumber || "";
    const inboundText = payload.text || "";
    const textId = payload.textId || "";

    if (!inboundText.trim()) {
      return new Response("OK", { status: 200 });
    }

    if (!ADMIN_USER_ID) {
      console.error("SMS_ADMIN_USER_ID not configured");
      return new Response("OK", { status: 200 });
    }

    // Create service-role Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up admin profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("user_id", ADMIN_USER_ID)
      .single();

    if (!profile?.org_id) {
      console.error("Admin profile not found for SMS_ADMIN_USER_ID");
      return new Response("OK", { status: 200 });
    }

    // Try to identify the contact by phone number
    let contactName = fromNumber;
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, name, phone")
      .eq("org_id", profile.org_id)
      .or(`phone.eq.${fromNumber},phone.eq.${fromNumber.replace("+1", "")}`)
      .limit(1)
      .single();

    if (contact?.name) {
      contactName = contact.name;
    }

    // Save the inbound SMS as a user message with context
    const messageContent = `[SMS from ${contactName} (${fromNumber})]: ${inboundText}`;
    await supabase.from("admin_chat_messages").insert({
      user_id: ADMIN_USER_ID,
      role: "user",
      content: messageContent,
    });

    // Load chat history + smart context in parallel
    const [{ data: history }, dynamicContext] = await Promise.all([
      supabase
        .from("admin_chat_messages")
        .select("role, content")
        .eq("user_id", ADMIN_USER_ID)
        .order("created_at", { ascending: true })
        .limit(30),
      loadSmartContext(supabase, profile.org_id),
    ]);

    // SMS-reply-specific system prompt additions
    const smsSystemPrompt = ADMIN_SYSTEM_PROMPT + SHARED_RULES +
      "\n\nIMPORTANT: You received an inbound SMS reply from a customer/contact. " +
      "Analyze the message, take any needed actions (check orders, update records, etc.), " +
      "and compose a reply. The reply will be sent back to them via SMS, so keep it CONCISE " +
      "(under 300 characters when possible). Use the send_sms tool to reply to them. " +
      "Their phone number is " + fromNumber + " and their name is " + contactName + ".";

    // Run AI loop — the AI will use send_sms tool to reply
    const response = await runAILoop({
      supabase,
      orgId: profile.org_id,
      userId: ADMIN_USER_ID,
      userRole: "admin",
      systemPrompt: smsSystemPrompt,
      dynamicContext,
      chatHistory: (history || []).map((m: any) => ({ role: m.role, content: m.content })),
    });

    // Save assistant response to chat history
    await supabase.from("admin_chat_messages").insert({
      user_id: ADMIN_USER_ID,
      role: "assistant",
      content: response,
    });

    // Log the inbound SMS
    await supabase.from("admin_ai_logs").insert({
      user_id: ADMIN_USER_ID,
      tool_name: "textbelt_inbound",
      tool_args: { fromNumber, textId, contact: contactName },
      tool_result: "Processed reply, AI responded",
      duration_ms: 0,
    }).catch(() => {}); // Non-critical

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Textbelt webhook error:", err);
    return new Response("OK", { status: 200 }); // Always 200 so Textbelt doesn't retry
  }
}));
