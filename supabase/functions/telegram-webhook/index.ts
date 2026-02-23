import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ADMIN_SYSTEM_PROMPT,
  SHARED_RULES,
  loadSmartContext,
  runAILoop,
} from "../_shared/ai-core.ts";

/**
 * Telegram Bot webhook handler.
 * Receives messages from Telegram, runs them through the same AI brain
 * as admin-ai-chat, and replies via Telegram sendMessage API.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN       — from @BotFather
 *   TELEGRAM_ALLOWED_CHAT_IDS — comma-separated chat IDs that can use the bot
 *   TELEGRAM_ADMIN_USER_ID   — Supabase auth user ID to act as (the admin)
 */

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const ALLOWED_CHAT_IDS = new Set(
  (Deno.env.get("TELEGRAM_ALLOWED_CHAT_IDS") || "").split(",").map(s => s.trim()).filter(Boolean)
);
const ADMIN_USER_ID = Deno.env.get("TELEGRAM_ADMIN_USER_ID") || "";

async function sendTelegramMessage(chatId: string | number, text: string) {
  // Telegram has a 4096 char limit per message — split if needed
  const MAX = 4000;
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline near the limit
    let splitAt = remaining.lastIndexOf("\n", MAX);
    if (splitAt < MAX * 0.5) splitAt = MAX;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });
  }
}

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update = await req.json();

    // Only handle text messages
    const message = update.message;
    if (!message?.text) return new Response("OK", { status: 200 });

    const chatId = String(message.chat.id);
    const userText = message.text;

    // /start command — friendly greeting
    if (userText === "/start") {
      await sendTelegramMessage(chatId, "Hey! I'm your Peptide Admin AI. Send me any message and I'll handle it — orders, inventory, contacts, financials, anything.");
      return new Response("OK", { status: 200 });
    }

    // Auth: only allow whitelisted chat IDs
    if (!ALLOWED_CHAT_IDS.has(chatId)) {
      console.log(`Unauthorized chat_id: ${chatId}`);
      await sendTelegramMessage(chatId, `Access denied. Your chat ID is: ${chatId}\n\nAsk your admin to add it to the whitelist.`);
      return new Response("OK", { status: 200 });
    }

    if (!ADMIN_USER_ID) {
      await sendTelegramMessage(chatId, "Bot not configured — TELEGRAM_ADMIN_USER_ID is missing.");
      return new Response("OK", { status: 200 });
    }

    // Create service-role Supabase client (no JWT needed — we're server-side)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up admin profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("user_id", ADMIN_USER_ID)
      .single();

    if (!profile?.org_id) {
      await sendTelegramMessage(chatId, "Error: Admin user profile not found.");
      return new Response("OK", { status: 200 });
    }

    // Save user message to chat history (same table as web chat)
    await supabase.from("admin_chat_messages").insert({
      user_id: ADMIN_USER_ID,
      role: "user",
      content: userText,
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

    // Run AI (always admin role — this is the owner's personal bot)
    const response = await runAILoop({
      supabase,
      orgId: profile.org_id,
      userId: ADMIN_USER_ID,
      userRole: "admin",
      systemPrompt: ADMIN_SYSTEM_PROMPT + SHARED_RULES,
      dynamicContext,
      chatHistory: (history || []).map((m: any) => ({ role: m.role, content: m.content })),
    });

    // Save assistant response
    await supabase.from("admin_chat_messages").insert({
      user_id: ADMIN_USER_ID,
      role: "assistant",
      content: response,
    });

    // Send reply to Telegram
    await sendTelegramMessage(chatId, response);

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return new Response("OK", { status: 200 }); // Always return 200 so Telegram doesn't retry
  }
});
