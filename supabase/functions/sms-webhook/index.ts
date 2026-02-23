import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ADMIN_SYSTEM_PROMPT,
  SHARED_RULES,
  loadSmartContext,
  runAILoop,
} from "../_shared/ai-core.ts";

/**
 * Twilio SMS webhook handler.
 * Receives inbound SMS via Twilio webhook (form-encoded POST),
 * runs through the same AI brain as admin-ai-chat & telegram-webhook,
 * and replies via TwiML XML.
 *
 * Required env vars:
 *   TWILIO_AUTH_TOKEN        — for request signature validation
 *   SMS_ALLOWED_NUMBERS      — comma-separated phone numbers (E.164: +15551234567)
 *   SMS_ADMIN_USER_ID        — Supabase auth user ID to act as
 *
 * Optional env vars:
 *   TWILIO_ACCOUNT_SID       — for outbound API calls (future use)
 *   TWILIO_PHONE_NUMBER      — your Twilio number (for reference)
 */

const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const ALLOWED_NUMBERS = new Set(
  (Deno.env.get("SMS_ALLOWED_NUMBERS") || "").split(",").map(s => s.trim()).filter(Boolean)
);
const ADMIN_USER_ID = Deno.env.get("SMS_ADMIN_USER_ID") || "";

// ── Twilio request signature validation ────────────────────────
async function validateTwilioSignature(
  req: Request,
  body: string,
): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) return true; // Skip validation if no token set (dev mode)

  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  // Build the validation URL (Twilio uses the full URL including query params)
  const url = new URL(req.url);
  const fullUrl = url.origin + url.pathname;

  // Parse params and sort alphabetically
  const params = new URLSearchParams(body);
  const sortedParams = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let dataToSign = fullUrl;
  for (const [key, value] of sortedParams) {
    dataToSign += key + value;
  }

  // HMAC-SHA1 with auth token
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TWILIO_AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return computed === signature;
}

// ── TwiML response helper ──────────────────────────────────────
function twimlResponse(message: string): Response {
  // Escape XML special characters
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Twilio concatenates multiple <Message> tags, so we split long responses
  // SMS segments are 160 chars each but Twilio handles segmentation — we just
  // need to stay under the TwiML body limit. Split at ~1500 chars per <Message>.
  const MAX = 1500;
  const chunks: string[] = [];
  let remaining = escaped;
  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", MAX);
    if (splitAt < MAX * 0.3) splitAt = remaining.lastIndexOf(" ", MAX);
    if (splitAt < MAX * 0.3) splitAt = MAX;
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  const messageTags = chunks.map(c => `<Message>${c}</Message>`).join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${messageTags}\n</Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
}

function twimlError(msg: string): Response {
  return twimlResponse(msg);
}

// ── Main handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
  // Twilio sends POST with form-encoded body
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const from = params.get("From") || "";        // E.164: +15551234567
    const smsBody = params.get("Body") || "";      // The message text
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);

    // Ignore empty messages
    if (!smsBody.trim() && numMedia === 0) {
      return twimlResponse("Send me a message and I'll help you manage inventory, orders, and more.");
    }

    // Validate Twilio signature
    const valid = await validateTwilioSignature(req, body);
    if (!valid) {
      console.error("Invalid Twilio signature from:", from);
      return new Response("Forbidden", { status: 403 });
    }

    // Auth: check phone number allowlist
    // If allowlist is empty, allow all (open mode for testing)
    if (ALLOWED_NUMBERS.size > 0 && !ALLOWED_NUMBERS.has(from)) {
      console.log(`SMS from unauthorized number: ${from}`);
      return twimlResponse(`Access denied. Your number ${from} is not authorized.`);
    }

    if (!ADMIN_USER_ID) {
      return twimlError("Bot not configured — SMS_ADMIN_USER_ID is missing.");
    }

    // Handle media attachments — mention them in the message
    let messageText = smsBody.trim();
    if (numMedia > 0) {
      const mediaUrls: string[] = [];
      for (let i = 0; i < numMedia; i++) {
        const url = params.get(`MediaUrl${i}`);
        if (url) mediaUrls.push(url);
      }
      if (mediaUrls.length > 0) {
        messageText += "\n\n[Attached " + mediaUrls.length + " image(s): " + mediaUrls.join(", ") + "]";
      }
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
      return twimlError("Error: Admin user profile not found.");
    }

    // Save user message to chat history (same table — unified history)
    await supabase.from("admin_chat_messages").insert({
      user_id: ADMIN_USER_ID,
      role: "user",
      content: messageText,
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

    // Add SMS-specific instructions to system prompt
    const smsSystemPrompt = ADMIN_SYSTEM_PROMPT + SHARED_RULES +
      "\n\nIMPORTANT: You are replying via SMS. Keep responses SHORT and concise — under 300 characters when possible. " +
      "Use abbreviations naturally (qty, amt, #). Skip greetings. Lead with the answer. " +
      "For long data (lists, tables), show only the top 3-5 results and say 'X more available'.";

    // Run AI loop
    const response = await runAILoop({
      supabase,
      orgId: profile.org_id,
      userId: ADMIN_USER_ID,
      userRole: "admin",
      systemPrompt: smsSystemPrompt,
      dynamicContext,
      chatHistory: (history || []).map((m: any) => ({ role: m.role, content: m.content })),
    });

    // Save assistant response
    await supabase.from("admin_chat_messages").insert({
      user_id: ADMIN_USER_ID,
      role: "assistant",
      content: response,
    });

    // Reply via TwiML
    return twimlResponse(response);
  } catch (err) {
    console.error("SMS webhook error:", err);
    return twimlError("Sorry, something went wrong. Try again in a moment.");
  }
});
