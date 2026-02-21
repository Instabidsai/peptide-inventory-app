import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

const BRAND_NAME = Deno.env.get('BRAND_NAME') || 'Peptide Partner';

const SYSTEM_PROMPT = `You are the partner assistant for ${BRAND_NAME}. You help sales partners (reps) with product knowledge, their commissions, their clients, and stock availability.

You can help with:
- PRODUCT KNOWLEDGE: Peptide info, protocols, dosing, storage, handling
- STOCK: Check what's available (quantities only — you don't see pricing or costs)
- MY COMMISSIONS: View the partner's own commission history and stats
- MY CLIENTS: View contacts assigned to this partner
- MY ORDERS: View sales orders this partner has placed
- RESOURCES: Search educational materials (PDFs, videos, guides)
- PROTOCOLS: Look up treatment protocols
- SUGGESTIONS: Submit feature requests or report issues (goes to admin)

RULES:
1. You are a helpful, knowledgeable partner assistant. Be friendly and supportive.
2. NEVER reveal pricing, costs, margins, or financial details. You don't have access to that data.
3. If asked about pricing, say: "Pricing is managed by the admin team. Check your Partner Store for current prices, or reach out to the admin."
4. You can ONLY see this partner's own data — their commissions, their clients, their orders.
5. Keep responses concise — use bullet points for summaries.
6. If the partner wants a feature or has a problem, use suggest_feature or report_issue to log it.
7. Be encouraging about sales opportunities. Help partners understand products so they can serve clients better.
8. When showing commission data, always mention that pending commissions are subject to admin approval.
9. NEVER mention other partners, their data, their performance, or make comparisons.
10. If you don't know something medical/scientific, say so — don't make things up.`;

// ── Tools ─────────────────────────────────────────────────────────

const tools = [
  {
    type: "function" as const,
    function: {
      name: "view_my_commissions",
      description: "View this partner's commission history. Returns their recent commissions with status and amounts.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max records (default 20)" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "view_my_clients",
      description: "View contacts/clients assigned to this partner.",
      parameters: { type: "object", properties: { search: { type: "string", description: "Optional name search" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "view_my_orders",
      description: "View sales orders placed by this partner.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max records (default 10)" } } },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_stock",
      description: "Check stock availability for a peptide. Shows quantity available but NOT pricing.",
      parameters: { type: "object", properties: { peptide_name: { type: "string", description: "Peptide name or partial name" } }, required: ["peptide_name"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_resources",
      description: "Search educational resources (PDFs, videos, guides) by keyword.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search keyword" } }, required: ["query"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_protocol",
      description: "Search treatment protocols by name or keyword.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Protocol name or keyword" } }, required: ["query"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_feature",
      description: "Submit a feature suggestion or idea to the admin team.",
      parameters: { type: "object", properties: { suggestion: { type: "string", description: "The feature suggestion or idea" } }, required: ["suggestion"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "report_issue",
      description: "Report a bug or issue to the admin team.",
      parameters: { type: "object", properties: { description: { type: "string", description: "Description of the issue" } }, required: ["description"] },
    },
  },
];

// ── Tool Executor ─────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, any>,
  supabase: any,
  orgId: string,
  userId: string,
  profileId: string,
): Promise<string> {
  try {
    switch (name) {
      case "view_my_commissions": {
        const limit = args.limit || 20;
        // commissions.partner_id references profiles.id (not auth.users.id)
        const { data, error } = await supabase
          .from("commissions")
          .select("id, amount, status, sale_id, created_at, sales_orders(total_amount)")
          .eq("partner_id", profileId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return "Error: " + error.message;
        if (!data?.length) return "No commissions found yet. Start selling to earn commissions!";
        const lines = data.map((c: any) =>
          "$" + Number(c.amount).toFixed(2) + " | " + c.status +
          " | Order total: $" + Number(c.sales_orders?.total_amount || 0).toFixed(2) +
          " | " + new Date(c.created_at).toLocaleDateString()
        );
        const total = data.reduce((s: number, c: any) => s + Number(c.amount), 0);
        const paid = data.filter((c: any) => c.status === "paid").reduce((s: number, c: any) => s + Number(c.amount), 0);
        const pending = data.filter((c: any) => c.status === "pending").reduce((s: number, c: any) => s + Number(c.amount), 0);
        return "Commissions (last " + data.length + "):\n" + lines.join("\n") +
          "\n\nSummary: Total $" + total.toFixed(2) + " | Paid $" + paid.toFixed(2) + " | Pending $" + pending.toFixed(2);
      }

      case "view_my_clients": {
        // contacts.assigned_rep_id references profiles.id
        let query = supabase
          .from("contacts")
          .select("id, name, email, phone, type, created_at")
          .eq("assigned_rep_id", profileId)
          .order("name");
        if (args.search) {
          query = query.ilike("name", "%" + args.search + "%");
        }
        const { data, error } = await query.limit(30);
        if (error) return "Error: " + error.message;
        if (!data?.length) return args.search ? "No clients matching '" + args.search + "'." : "No clients assigned to you yet.";
        const lines = data.map((c: any) =>
          c.name + " (" + c.type + ") | " + (c.email || "—") + " | " + (c.phone || "—")
        );
        return "Your clients (" + data.length + "):\n" + lines.join("\n");
      }

      case "view_my_orders": {
        const limit = args.limit || 10;
        // sales_orders.rep_id references profiles.id; client FK is client_id not contact_id
        // Only select safe fields — NOT cogs_amount, profit_amount, merchant_fee, commission_amount
        const { data, error } = await supabase
          .from("sales_orders")
          .select("id, status, payment_status, total_amount, created_at, sales_order_items(quantity, peptides(name))")
          .eq("rep_id", profileId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return "Error: " + error.message;
        if (!data?.length) return "No orders found. Visit the Partner Store to place orders.";
        const lines = data.map((o: any) => {
          const items = o.sales_order_items?.map((i: any) => i.quantity + "x " + (i.peptides?.name || "?")).join(", ") || "no items";
          return "#" + o.id.slice(0, 8) +
            " | " + o.status + "/" + o.payment_status +
            " | $" + Number(o.total_amount).toFixed(2) +
            " | " + items +
            " | " + new Date(o.created_at).toLocaleDateString();
        });
        return "Your orders (last " + data.length + "):\n" + lines.join("\n");
      }

      case "check_stock": {
        const name_query = args.peptide_name;
        // Fuzzy search: try ilike first
        let { data } = await supabase
          .from("peptides")
          .select("id, name, active")
          .eq("org_id", orgId)
          .ilike("name", "%" + name_query + "%")
          .limit(5);
        if (!data?.length) {
          // Try without hyphens
          const stripped = name_query.replace(/[-\s]/g, "");
          const res = await supabase
            .from("peptides")
            .select("id, name, active")
            .eq("org_id", orgId)
            .ilike("name", "%" + stripped + "%")
            .limit(5);
          data = res.data;
        }
        if (!data?.length) return "No peptides matching '" + name_query + "'. Try a different name.";

        // Get stock counts for found peptides via bottles → lots → peptides
        const ids = data.map((p: any) => p.id);
        const { data: bottles } = await supabase
          .from("bottles")
          .select("lot_id, lots!inner(peptide_id)")
          .eq("status", "in_stock");

        const stockMap: Record<string, number> = {};
        bottles?.forEach((b: any) => {
          const pid = b.lots?.peptide_id;
          if (pid && ids.includes(pid)) stockMap[pid] = (stockMap[pid] || 0) + 1;
        });

        const lines = data.map((p: any) =>
          p.name + " | " + (stockMap[p.id] || 0) + " in stock" + (p.active === false ? " | INACTIVE" : "")
        );
        return "Stock levels:\n" + lines.join("\n");
      }

      case "search_resources": {
        // resources table has no org_id — search all resources
        const { data, error } = await supabase
          .from("resources")
          .select("id, title, description, type, url")
          .or("title.ilike.%" + args.query + "%,description.ilike.%" + args.query + "%")
          .limit(10);
        if (error) return "Error: " + error.message;
        if (!data?.length) return "No resources matching '" + args.query + "'.";
        const lines = data.map((r: any) =>
          "[" + r.type + "] " + r.title + (r.description ? " — " + r.description : "") + (r.url ? "\nLink: " + r.url : "")
        );
        return "Resources found (" + data.length + "):\n" + lines.join("\n\n");
      }

      case "lookup_protocol": {
        // protocol_items columns: dosage_amount, dosage_unit, frequency, duration_weeks
        // Exclude price_tier and cost_multiplier (financial data)
        const { data, error } = await supabase
          .from("protocols")
          .select("id, name, description, protocol_items(peptides(name), dosage_amount, dosage_unit, frequency, duration_weeks)")
          .eq("org_id", orgId)
          .ilike("name", "%" + args.query + "%")
          .limit(5);
        if (error) return "Error: " + error.message;
        if (!data?.length) return "No protocols matching '" + args.query + "'.";
        const lines = data.map((p: any) => {
          const items = p.protocol_items?.map((i: any) =>
            "  - " + (i.peptides?.name || "?") + " | " + (i.dosage_amount || "—") + " " + (i.dosage_unit || "") + " | " + (i.frequency || "—") + " | " + (i.duration_weeks ? i.duration_weeks + " weeks" : "—")
          ).join("\n") || "  (no items)";
          return p.name + (p.description ? " — " + p.description : "") + "\n" + items;
        });
        return "Protocols found:\n" + lines.join("\n\n");
      }

      case "suggest_feature": {
        const { error } = await supabase
          .from("partner_suggestions")
          .insert({
            org_id: orgId,
            partner_id: userId,
            suggestion_text: args.suggestion,
            category: "feature",
          });
        if (error) return "Error saving suggestion: " + error.message;
        return "Feature suggestion submitted! The admin team will review it. Thanks for the feedback!";
      }

      case "report_issue": {
        const { error } = await supabase
          .from("partner_suggestions")
          .insert({
            org_id: orgId,
            partner_id: userId,
            suggestion_text: args.description,
            category: "bug",
          });
        if (error) return "Error saving report: " + error.message;
        return "Issue reported! The admin team will look into it. Thanks for letting us know!";
      }

      default:
        return "Unknown tool: " + name;
    }
  } catch (err) {
    return "Tool error: " + (err as Error).message;
  }
}

// ── Main Handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await supabase.from("profiles").select("id, org_id, role").eq("user_id", user.id).single();
    if (!profile?.org_id) return json({ error: "No organization" }, 400);
    const profileId = profile.id; // profiles.id — used by commissions, contacts, sales_orders FKs

    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    const role = userRole?.role || profile.role;

    // Partners (sales_rep) + admins (for testing)
    if (!["sales_rep", "admin", "staff"].includes(role)) return json({ error: "Partner role required" }, 403);

    const { message } = await req.json();
    if (!message) return json({ error: "message required" }, 400);

    // Save user message
    await supabase.from("partner_chat_messages").insert({ org_id: profile.org_id, user_id: user.id, role: "user", content: message });

    // === SMART CONTEXT: Load partner-specific data ===
    const [
      { data: history },
      { data: allPeptides },
      { data: stockBottles },
      { data: myClients },
      { data: commissionStats },
    ] = await Promise.all([
      supabase.from("partner_chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: true }).limit(30),
      supabase.from("peptides").select("id, name, active").eq("org_id", profile.org_id).eq("active", true).order("name"),
      supabase.from("bottles").select("lot_id, lots!inner(peptide_id)").eq("status", "in_stock"),
      supabase.from("contacts").select("id, name").eq("assigned_rep_id", profileId).limit(5),
      supabase.from("commissions").select("amount, status").eq("partner_id", profileId),
    ]);

    // Stock counts (no pricing!) — bottles → lots → peptides
    const stockMap: Record<string, number> = {};
    stockBottles?.forEach((b: any) => {
      const pid = b.lots?.peptide_id;
      if (pid) stockMap[pid] = (stockMap[pid] || 0) + 1;
    });

    const catalogLines = (allPeptides || []).map((p: any) =>
      p.name + " | " + (stockMap[p.id] || 0) + " in stock"
    );

    const totalEarned = commissionStats?.reduce((s: number, c: any) => s + Number(c.amount), 0) || 0;
    const pendingComm = commissionStats?.filter((c: any) => c.status === "pending").reduce((s: number, c: any) => s + Number(c.amount), 0) || 0;

    const dynamicContext = "\n\n=== YOUR DATA (refreshed every message) ===\nDate: " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString() +
      "\n\nAVAILABLE PRODUCTS (" + catalogLines.length + "):\n" + catalogLines.join("\n") +
      "\n\nYOUR STATS: " + (myClients?.length || 0) + " clients | Total earned: $" + totalEarned.toFixed(2) + " | Pending: $" + pendingComm.toFixed(2);

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT + dynamicContext },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // === GPT-4o with tool calling loop ===
    let response: string | undefined;
    let loopCount = 0;
    while (loopCount < 6) {
      loopCount++;
      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.4 }),
      });
      const data = await completion.json();
      if (data.error) {
        console.error("OpenAI error:", data.error);
        response = "Sorry, there was an API error. Please try again.";
        break;
      }
      const choice = data.choices?.[0];
      if (!choice) { response = "Sorry, I couldn't process that request."; break; }

      if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls) {
        messages.push(choice.message);
        for (const tc of choice.message.tool_calls) {
          const tcArgs = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, tcArgs, supabase, profile.org_id, user.id, profileId);
          messages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        continue;
      }
      response = choice.message?.content || "No response.";
      break;
    }
    if (!response) response = "Processing took too long. Please try again.";

    // Save assistant response
    await supabase.from("partner_chat_messages").insert({ org_id: profile.org_id, user_id: user.id, role: "assistant", content: response });
    return json({ reply: response });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
