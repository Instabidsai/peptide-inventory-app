import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the admin assistant for NextGen Research Labs peptide inventory system. You have FULL access to every admin feature in the app.

You can help with:
- CONTACTS: Search, create, update contacts/clients
- SALES ORDERS: Create, update status, record payments, add items to existing orders
- PURCHASE ORDERS: Create supplier orders, mark received (auto-creates inventory), record payments
- INVENTORY: Create/update peptides, view lots, check bottle stats, view stock levels
- PRICING: Show cost/2x/3x/MSRP tiers for any peptide
- MOVEMENTS: View inventory movements (sales, giveaways, internal use, losses, returns)
- COMMISSIONS: View all commissions, update status (pay/void)
- PARTNERS/REPS: List partners, update settings (commission rate, pricing, tier)
- EXPENSES: Create/list expenses for tracking cash flow
- FINANCIALS: Full P&L summary (revenue, COGS, overhead, profit, commissions)
- PROTOCOLS: List/create treatment protocols with peptide items
- REQUESTS: View and respond to client requests
- DASHBOARD: Quick stats (orders, revenue, stock, contacts)

RULES:
1. ALWAYS confirm before creating or modifying data. Show a clear summary and ask "Should I proceed?" or similar.
2. When the user confirms (yes, do it, go ahead, confirm, proceed, yep, etc.), THEN execute the tools.
3. If pricing tier isn't specified, ASK: cost, 2x, 3x, or MSRP?
4. Default delivery method is 'ship' unless they say pickup/local.
5. Keep responses concise - use bullet points for summaries.
6. If a contact already exists (found via search), use them instead of creating a duplicate.
7. For peptide names, be flexible with matching (BPC = BPC-157, TB = TB-500, Tirz = Tirzepatide, Sema = Semaglutide, etc.)
8. IMPORTANT: Orders are created as 'submitted' status. They do NOT auto-fulfill. Chad picks, packs, and fulfills orders manually from the Fulfillment Center.
9. For purchase orders, when marking as received you create a lot + auto-generate bottles.
10. When showing financial data, format currency nicely and use clear labels.
11. IMPORTANT: When creating orders, ALWAYS look up the contact's address and use it as shipping_address if no other address is specified.
12. NEVER create duplicate orders. If you already created an order for a person in this conversation, do NOT create another unless explicitly asked.
13. When asked to do multiple things (e.g. order for person A AND order for person B), handle them ONE AT A TIME with separate tool calls.
14. If someone says to ship items together or combine orders, use add_items_to_order to add items to an existing order instead of creating a new one.
15. When the user says "10% off" or a discount, calculate the discounted price BEFORE creating the order. Apply the discount to each item's unit_price.
16. IMPORTANT: When referencing order IDs, ALWAYS use the full UUID (the long ID), not the shortened #xxxxxxxx display version. Tools require the full UUID to work.
17. When an error occurs, ALWAYS tell the user what the error was. Never say "contact technical support" — you ARE the technical support. Show the actual error message.

PRICING TIERS:
- Cost = avg_cost (base wholesale cost from lots)
- 2x = avg_cost x 2
- 3x = avg_cost x 3
- MSRP = retail_price (full retail)

COMMISSION: Revenue-based. Direct rep gets their commission_rate x sale total. Override commissions go up the chain (second_tier, third_tier).

ORDER STATUSES: draft > submitted > fulfilled > cancelled
PAYMENT: unpaid > partial > paid > refunded
SHIPPING: pending > label_created > printed > in_transit > delivered
BOTTLE: in_stock, sold, given_away, internal_use, lost, returned, expired
MOVEMENT TYPES: sale, giveaway, internal_use, loss, return`;

const tools = [
  { type: "function" as const, function: { name: "search_contacts", description: "Search for contacts/clients by name, email, or phone.", parameters: { type: "object", properties: { query: { type: "string", description: "Name, email, or phone to search" } }, required: ["query"] } } },
  { type: "function" as const, function: { name: "create_contact", description: "Create a new customer/client contact.", parameters: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, type: { type: "string", enum: ["customer", "partner", "internal"] }, notes: { type: "string" } }, required: ["name"] } } },
  { type: "function" as const, function: { name: "update_contact", description: "Update an existing contact's details.", parameters: { type: "object", properties: { contact_id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, notes: { type: "string" } }, required: ["contact_id"] } } },
  { type: "function" as const, function: { name: "search_peptides", description: "Search peptides by name. Returns stock count, avg cost, retail price.", parameters: { type: "object", properties: { query: { type: "string", description: "Peptide name or partial name" } }, required: ["query"] } } },
  { type: "function" as const, function: { name: "list_all_peptides", description: "List ALL peptides with stock counts and pricing. Use when user asks 'what do we have' or 'show all inventory'.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_pricing", description: "Get all pricing tiers for a peptide: cost, 2x, 3x, MSRP.", parameters: { type: "object", properties: { peptide_name: { type: "string" } }, required: ["peptide_name"] } } },
  { type: "function" as const, function: { name: "create_peptide", description: "Create a new peptide product.", parameters: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, sku: { type: "string" }, retail_price: { type: "number" } }, required: ["name"] } } },
  { type: "function" as const, function: { name: "update_peptide", description: "Update a peptide's details (name, description, sku, retail_price, active status).", parameters: { type: "object", properties: { peptide_id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, sku: { type: "string" }, retail_price: { type: "number" }, active: { type: "boolean" } }, required: ["peptide_id"] } } },
  { type: "function" as const, function: { name: "get_bottle_stats", description: "Get bottle count breakdown by status (in_stock, sold, given_away, internal_use, lost, returned, expired).", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "list_lots", description: "List inventory lots with peptide name, quantity, cost, payment status, expiry.", parameters: { type: "object", properties: { limit: { type: "number", description: "Max lots to return (default 20)" } } } } },
  { type: "function" as const, function: { name: "list_purchase_orders", description: "List supplier purchase orders. Can filter by status: pending, received, cancelled.", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "received", "cancelled"] }, limit: { type: "number" } } } } },
  { type: "function" as const, function: { name: "create_purchase_order", description: "Create a new supplier purchase order for a peptide.", parameters: { type: "object", properties: { peptide_id: { type: "string" }, quantity_ordered: { type: "number" }, estimated_cost_per_unit: { type: "number" }, supplier: { type: "string" }, expected_arrival_date: { type: "string", description: "YYYY-MM-DD" }, tracking_number: { type: "string" }, notes: { type: "string" } }, required: ["peptide_id", "quantity_ordered"] } } },
  { type: "function" as const, function: { name: "receive_purchase_order", description: "Mark a purchase order as received. Creates a lot + auto-generates bottles in inventory.", parameters: { type: "object", properties: { order_id: { type: "string" }, actual_quantity: { type: "number" }, actual_cost_per_unit: { type: "number" }, lot_number: { type: "string" }, expiry_date: { type: "string", description: "YYYY-MM-DD" } }, required: ["order_id", "actual_quantity", "actual_cost_per_unit", "lot_number"] } } },
  { type: "function" as const, function: { name: "record_purchase_payment", description: "Record a payment against a supplier purchase order. Creates an expense record.", parameters: { type: "object", properties: { order_id: { type: "string" }, amount: { type: "number" }, method: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, is_full_payment: { type: "boolean" }, note: { type: "string" } }, required: ["order_id", "amount", "method", "date", "is_full_payment"] } } },
  { type: "function" as const, function: { name: "create_order", description: "Create a sales order with line items. Order is created as 'submitted' for manual fulfillment by the warehouse team. Always look up the contact's address for shipping.", parameters: { type: "object", properties: { contact_id: { type: "string" }, items: { type: "array", items: { type: "object", properties: { peptide_id: { type: "string" }, quantity: { type: "number" }, unit_price: { type: "number" } }, required: ["peptide_id", "quantity", "unit_price"] } }, shipping_address: { type: "string" }, delivery_method: { type: "string", enum: ["ship", "local_pickup"] }, notes: { type: "string" } }, required: ["contact_id", "items"] } } },
  { type: "function" as const, function: { name: "add_items_to_order", description: "Add one or more line items to an existing sales order. Use this when combining shipments or adding items. Updates the order total automatically. IMPORTANT: Use the full UUID for order_id, not the shortened display ID.", parameters: { type: "object", properties: { order_id: { type: "string", description: "The full UUID of the sales order (e.g. 96e03596-70ab-41a7-965a-358257ca30c0)" }, items: { type: "array", items: { type: "object", properties: { peptide_id: { type: "string" }, quantity: { type: "number" }, unit_price: { type: "number" } }, required: ["peptide_id", "quantity", "unit_price"] } }, note: { type: "string", description: "Optional note to append (e.g. 'Added for Sonia - ship together')" } }, required: ["order_id", "items"] } } },
  { type: "function" as const, function: { name: "list_recent_orders", description: "List recent sales orders with status, customer, total, items. Returns full UUIDs for each order.", parameters: { type: "object", properties: { limit: { type: "number" }, status: { type: "string", enum: ["draft", "submitted", "fulfilled", "cancelled"] } } } } },
  { type: "function" as const, function: { name: "update_sales_order", description: "Update a sales order's status, payment info, shipping details, or notes.", parameters: { type: "object", properties: { order_id: { type: "string", description: "Full UUID of the sales order" }, status: { type: "string", enum: ["draft", "submitted", "fulfilled", "cancelled"] }, payment_status: { type: "string", enum: ["unpaid", "partial", "paid", "refunded"] }, amount_paid: { type: "number" }, payment_method: { type: "string" }, payment_date: { type: "string" }, shipping_address: { type: "string" }, shipping_status: { type: "string", enum: ["pending", "label_created", "printed", "in_transit", "delivered"] }, tracking_number: { type: "string" }, carrier: { type: "string" }, notes: { type: "string" }, merchant_fee: { type: "number" } }, required: ["order_id"] } } },
  { type: "function" as const, function: { name: "fulfill_order", description: "Manually fulfill a submitted sales order. Allocates inventory FIFO, creates movement, marks order fulfilled.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
  { type: "function" as const, function: { name: "list_movements", description: "List inventory movements (sales, giveaways, internal use, losses, returns).", parameters: { type: "object", properties: { limit: { type: "number" }, type: { type: "string", enum: ["sale", "giveaway", "internal_use", "loss", "return"] } } } } },
  { type: "function" as const, function: { name: "list_commissions", description: "List all commission records with partner name, amount, type, status, and linked sale.", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "available", "paid", "void"] }, partner_id: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function" as const, function: { name: "get_commission_stats", description: "Get commission totals broken down by status (pending, available, paid).", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "update_commission", description: "Update a commission's status (mark as paid, void, etc.).", parameters: { type: "object", properties: { commission_id: { type: "string" }, status: { type: "string", enum: ["pending", "available", "paid", "void"] } }, required: ["commission_id", "status"] } } },
  { type: "function" as const, function: { name: "list_partners", description: "List all sales rep partners with commission rate, tier, pricing mode.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "update_partner", description: "Update a partner/rep's settings: commission_rate, price_multiplier, pricing_mode, cost_plus_markup, partner_tier.", parameters: { type: "object", properties: { partner_id: { type: "string" }, commission_rate: { type: "number" }, price_multiplier: { type: "number" }, pricing_mode: { type: "string", enum: ["percentage", "cost_plus"] }, cost_plus_markup: { type: "number" }, partner_tier: { type: "string" }, parent_rep_id: { type: "string" } }, required: ["partner_id"] } } },
  { type: "function" as const, function: { name: "get_partner_detail", description: "Get detailed stats for a specific partner/rep including sales, commissions, tier.", parameters: { type: "object", properties: { partner_id: { type: "string" } }, required: ["partner_id"] } } },
  { type: "function" as const, function: { name: "list_expenses", description: "List expenses with category, amount, date. Can filter by category (inventory, operating, etc.).", parameters: { type: "object", properties: { category: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function" as const, function: { name: "create_expense", description: "Record an expense for tracking cash flow.", parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, category: { type: "string" }, amount: { type: "number" }, description: { type: "string" }, recipient: { type: "string" }, payment_method: { type: "string" }, status: { type: "string", enum: ["paid", "pending"] } }, required: ["date", "category", "amount"] } } },
  { type: "function" as const, function: { name: "get_financial_summary", description: "Get comprehensive P&L: revenue, COGS, gross profit, commissions, expenses, net profit.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "list_protocols", description: "List treatment protocols with items. Can filter by contact_id.", parameters: { type: "object", properties: { contact_id: { type: "string" } } } } },
  { type: "function" as const, function: { name: "create_protocol", description: "Create a treatment protocol with peptide items and dosing.", parameters: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, contact_id: { type: "string" }, items: { type: "array", items: { type: "object", properties: { peptide_id: { type: "string" }, dose_amount: { type: "number" }, dose_unit: { type: "string" }, frequency: { type: "string" }, timing: { type: "string" } } } } }, required: ["name"] } } },
  { type: "function" as const, function: { name: "list_requests", description: "List client requests (e.g. 'is X in stock?', 'can you make Y?'). Can filter by status.", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "answered", "archived"] }, limit: { type: "number" } } } } },
  { type: "function" as const, function: { name: "respond_to_request", description: "Respond to a client request and update its status.", parameters: { type: "object", properties: { request_id: { type: "string" }, status: { type: "string", enum: ["pending", "answered", "archived"] }, admin_notes: { type: "string" } }, required: ["request_id", "status"] } } },
  { type: "function" as const, function: { name: "get_dashboard_stats", description: "Get quick dashboard: orders today/week, revenue, stock, contacts, pending requests/POs.", parameters: { type: "object", properties: {} } } },
];

// Resolve partial/truncated UUIDs to full UUIDs by prefix match
async function resolveOrderId(supabase: any, partialId: string): Promise<string | null> {
  // If it's already a valid full UUID, return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partialId)) {
    return partialId;
  }
  // Strip leading # if present
  const clean = partialId.replace(/^#/, "");
  // Try to find the order by UUID prefix
  const { data } = await supabase
    .from("sales_orders")
    .select("id")
    .ilike("id", clean + "%")
    .limit(2);
  if (data?.length === 1) return data[0].id;
  if (data?.length > 1) return null; // ambiguous
  return null;
}

// Same resolver for purchase orders
async function resolvePurchaseOrderId(supabase: any, partialId: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partialId)) {
    return partialId;
  }
  const clean = partialId.replace(/^#/, "");
  const { data } = await supabase.from("orders").select("id").ilike("id", clean + "%").limit(2);
  if (data?.length === 1) return data[0].id;
  return null;
}

async function logToolCall(supabase: any, userId: string, toolName: string, args: any, result: string, error: string | null, durationMs: number) {
  try {
    await supabase.from("admin_ai_logs").insert({
      user_id: userId,
      tool_name: toolName,
      tool_args: args,
      tool_result: result,
      error,
      duration_ms: durationMs,
    });
  } catch (e) {
    console.error("Failed to log tool call:", e);
  }
}

async function executeTool(name: string, args: any, supabase: any, orgId: string): Promise<string> {
  try {
    switch (name) {
      case "search_contacts": {
        const { data } = await supabase.from("contacts").select("id, name, email, phone, address, type").eq("org_id", orgId).ilike("name", "%" + args.query + "%").limit(10);
        if (!data?.length) return "No contacts found matching '" + args.query + "'.";
        return data.map((c: any) => (c.name || "Unnamed") + " (" + c.type + ") | Email: " + (c.email || "—") + " | Phone: " + (c.phone || "—") + " | Address: " + (c.address || "—") + " | ID: " + c.id).join("\n");
      }
      case "create_contact": {
        const { data: contact, error } = await supabase.from("contacts").insert({ org_id: orgId, name: args.name, email: args.email || null, phone: args.phone || null, address: args.address || null, type: args.type || "customer", notes: args.notes || null }).select().single();
        if (error) return "Error creating contact: " + error.message;
        return "Contact created: " + contact.name + " (ID: " + contact.id + ")";
      }
      case "update_contact": {
        const u: any = {};
        for (const key of ["name", "email", "phone", "address", "notes"]) { if (args[key] !== undefined) u[key] = args[key]; }
        const { error } = await supabase.from("contacts").update(u).eq("id", args.contact_id);
        if (error) return "Error: " + error.message;
        return "Contact updated: " + Object.keys(u).join(", ");
      }
      case "search_peptides": {
        const { data } = await supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).ilike("name", "%" + args.query + "%").limit(10);
        if (!data?.length) return "No peptides found matching '" + args.query + "'.";
        const withStock = await Promise.all(data.map(async (p: any) => {
          const { count } = await supabase.from("bottles").select("id", { count: "exact", head: true }).eq("peptide_id", p.id).eq("status", "in_stock");
          return (p.name || "Unnamed") + " | Stock: " + (count || 0) + " bottles | MSRP: $" + Number(p.retail_price).toFixed(2) + " | ID: " + p.id;
        }));
        return withStock.join("\n");
      }
      case "list_all_peptides": {
        const { data } = await supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).order("name");
        if (!data?.length) return "No peptides found.";
        const withStock = await Promise.all(data.map(async (p: any) => {
          const { count } = await supabase.from("bottles").select("id", { count: "exact", head: true }).eq("peptide_id", p.id).eq("status", "in_stock");
          return (p.name || "Unnamed") + " | Stock: " + (count || 0) + " | MSRP: $" + Number(p.retail_price).toFixed(2) + " | ID: " + p.id;
        }));
        return withStock.join("\n");
      }
      case "get_pricing": {
        const { data } = await supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).ilike("name", "%" + args.peptide_name + "%").limit(1).single();
        if (!data) return "Peptide '" + args.peptide_name + "' not found.";
        const { data: lots } = await supabase.from("lots").select("cost_per_unit").eq("peptide_id", data.id);
        const avgCost = lots?.length ? lots.reduce((s: number, l: any) => s + Number(l.cost_per_unit), 0) / lots.length : 0;
        return "Pricing for " + data.name + ":\n  Cost: $" + avgCost.toFixed(2) + "\n  2x: $" + (avgCost * 2).toFixed(2) + "\n  3x: $" + (avgCost * 3).toFixed(2) + "\n  MSRP: $" + Number(data.retail_price).toFixed(2);
      }
      case "create_peptide": {
        const { data: peptide, error } = await supabase.from("peptides").insert({ org_id: orgId, name: args.name, description: args.description || null, sku: args.sku || null, retail_price: args.retail_price || 0, active: true }).select().single();
        if (error) return "Error creating peptide: " + error.message;
        return "Peptide created: " + peptide.name + " (ID: " + peptide.id + ")";
      }
      case "update_peptide": {
        const u: any = {};
        for (const key of ["name", "description", "sku", "retail_price", "active"]) { if (args[key] !== undefined) u[key] = args[key]; }
        const { error } = await supabase.from("peptides").update(u).eq("id", args.peptide_id);
        if (error) return "Error: " + error.message;
        return "Peptide updated: " + Object.keys(u).join(", ");
      }
      case "get_bottle_stats": {
        const statuses = ["in_stock", "sold", "given_away", "internal_use", "lost", "returned", "expired"];
        const stats: any = {};
        for (const status of statuses) {
          const { count } = await supabase.from("bottles").select("id", { count: "exact", head: true }).eq("status", status);
          stats[status] = count || 0;
        }
        const total = Object.values(stats).reduce((s: number, c: any) => s + c, 0);
        return "Bottle Status Breakdown (Total: " + total + "):\n" + Object.entries(stats).map(([k, v]: [string, any]) => "  " + k.replace(/_/g, " ") + ": " + v).join("\n");
      }
      case "list_lots": {
        const limit = args.limit || 20;
        const { data } = await supabase.from("lots").select("id, peptide_id, quantity, cost_per_unit, payment_status, expiry_date, peptides(name)").order("created_at", { ascending: false }).limit(limit);
        if (!data?.length) return "No lots found.";
        return data.map((l: any) => "#" + l.id.slice(0, 8) + " | " + (l.peptides?.name || "?") + " | " + l.quantity + " units @ $" + Number(l.cost_per_unit).toFixed(2) + " | Payment: " + l.payment_status + " | Expiry: " + (l.expiry_date || "N/A")).join("\n");
      }
      case "list_purchase_orders": {
        const limit = args.limit || 20;
        let query = supabase.from("orders").select("id, status, supplier, quantity_ordered, estimated_cost_per_unit, expected_arrival_date, created_at, peptides(name)").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        const { data } = await query;
        if (!data?.length) return "No purchase orders found.";
        return data.map((o: any) => "#" + o.id.slice(0, 8) + " | " + (o.peptides?.name || "?") + " | " + o.quantity_ordered + " units @ ~$" + Number(o.estimated_cost_per_unit).toFixed(2) + " | Supplier: " + (o.supplier || "—") + " | Status: " + o.status + " | ETA: " + (o.expected_arrival_date || "?") + " | ID: " + o.id).join("\n");
      }
      case "create_purchase_order": {
        const { data: order, error } = await supabase.from("orders").insert({ org_id: orgId, peptide_id: args.peptide_id, type: "purchase", status: "pending", quantity_ordered: args.quantity_ordered, estimated_cost_per_unit: args.estimated_cost_per_unit, supplier: args.supplier || null, expected_arrival_date: args.expected_arrival_date || null, tracking_number: args.tracking_number || null, notes: args.notes || null }).select().single();
        if (error) return "Error: " + error.message;
        return "PO created (#" + order.id.slice(0, 8) + "): " + args.quantity_ordered + " units ordered. ID: " + order.id;
      }
      case "receive_purchase_order": {
        const resolvedId = await resolvePurchaseOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Purchase order not found for ID '" + args.order_id + "'. Use the full UUID.";
        const { data: order } = await supabase.from("orders").select("*").eq("id", resolvedId).single();
        if (!order) return "PO not found.";
        const { data: lot, error: lotErr } = await supabase.from("lots").insert({ org_id: orgId, peptide_id: order.peptide_id, quantity: args.actual_quantity, cost_per_unit: args.actual_cost_per_unit, lot_number: args.lot_number, expiry_date: args.expiry_date || null, payment_status: "unpaid" }).select().single();
        if (lotErr) return "Error creating lot: " + lotErr.message;
        const bottleInserts = Array(args.actual_quantity).fill(null).map(() => ({ lot_id: lot.id, peptide_id: order.peptide_id, status: "in_stock", created_at: new Date().toISOString() }));
        await supabase.from("bottles").insert(bottleInserts);
        await supabase.from("orders").update({ status: "received" }).eq("id", resolvedId);
        return "PO received! Created lot '" + args.lot_number + "' with " + args.actual_quantity + " bottles.";
      }
      case "record_purchase_payment": {
        if (args.amount <= 0 || !args.date || !args.method) return "Error: amount, date, and method required.";
        const resolvedId = await resolvePurchaseOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Purchase order not found for ID '" + args.order_id + "'.";
        const { data: curr } = await supabase.from("orders").select("amount_paid").eq("id", resolvedId).single();
        const newTotal = (curr?.amount_paid || 0) + args.amount;
        await supabase.from("orders").update({ amount_paid: newTotal, payment_status: args.is_full_payment ? "paid" : "partial" }).eq("id", resolvedId);
        return "Payment of $" + args.amount.toFixed(2) + " recorded. Total paid: $" + newTotal.toFixed(2) + ". Status: " + (args.is_full_payment ? "paid" : "partial") + ".";
      }
      case "create_order": {
        let shippingAddr = args.shipping_address || null;
        if (!shippingAddr && args.contact_id) {
          const { data: contactData } = await supabase.from("contacts").select("address").eq("id", args.contact_id).single();
          if (contactData?.address) shippingAddr = contactData.address;
        }
        const totalAmount = args.items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);
        let repId = null;
        let commissionRate = 0;
        const { data: contact } = await supabase.from("contacts").select("assigned_rep_id").eq("id", args.contact_id).single();
        if (contact?.assigned_rep_id) {
          repId = contact.assigned_rep_id;
          const { data: repProfile } = await supabase.from("profiles").select("commission_rate").eq("id", contact.assigned_rep_id).single();
          commissionRate = Number(repProfile?.commission_rate) || 0;
        }
        const { data: order, error } = await supabase.from("sales_orders").insert({ org_id: orgId, client_id: args.contact_id, rep_id: repId, status: "submitted", total_amount: Math.round(totalAmount * 100) / 100, commission_amount: Math.round(totalAmount * commissionRate * 100) / 100, shipping_address: shippingAddr, delivery_method: args.delivery_method || "ship", notes: args.notes || null, payment_status: "unpaid", amount_paid: 0 }).select().single();
        if (error) return "Error creating order: " + error.message;
        const lineItems = args.items.map((i: any) => ({ sales_order_id: order.id, peptide_id: i.peptide_id, quantity: i.quantity, unit_price: i.unit_price }));
        const { error: itemErr } = await supabase.from("sales_order_items").insert(lineItems);
        if (itemErr) return "Order created (#" + order.id.slice(0, 8) + ") but items failed: " + itemErr.message;
        if (repId) { await supabase.rpc("process_sale_commission", { p_sale_id: order.id }).catch(() => {}); }
        const itemSummary = args.items.map((i: any) => i.quantity + "x @ $" + i.unit_price.toFixed(2)).join(", ");
        return "Order #" + order.id.slice(0, 8) + " created (SUBMITTED — ready for Pick & Pack)" + (shippingAddr ? "\nShip to: " + shippingAddr : "\nWARNING: No shipping address!") + "\nItems: " + itemSummary + "\nTotal: $" + totalAmount.toFixed(2) + "\nDelivery: " + (args.delivery_method || "ship") + "\nFull ID: " + order.id;
      }
      case "add_items_to_order": {
        // Resolve partial UUID (e.g. "96e03596" -> full UUID)
        const resolvedId = await resolveOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Could not find order with ID '" + args.order_id + "'. The ID may be truncated or invalid. Use list_recent_orders to get the full UUID.";
        const { data: order, error: oErr } = await supabase.from("sales_orders").select("id, status, total_amount, notes").eq("id", resolvedId).single();
        if (oErr) return "Error: Order not found - " + oErr.message;
        if (order.status === "cancelled") return "Cannot add items to a cancelled order.";
        if (order.status === "fulfilled") return "Cannot add items to a fulfilled order. It has already been picked and packed.";
        const lineItems = args.items.map((i: any) => ({ sales_order_id: order.id, peptide_id: i.peptide_id, quantity: i.quantity, unit_price: i.unit_price }));
        const { error: itemErr } = await supabase.from("sales_order_items").insert(lineItems);
        if (itemErr) return "Error adding items: " + itemErr.message;
        const addedAmount = args.items.reduce((s: number, i: any) => s + i.quantity * i.unit_price, 0);
        const newTotal = Number(order.total_amount) + addedAmount;
        const noteAppend = args.note ? ((order.notes ? "\n" : "") + args.note) : "";
        const updates: any = { total_amount: Math.round(newTotal * 100) / 100 };
        if (noteAppend) updates.notes = (order.notes || "") + noteAppend;
        await supabase.from("sales_orders").update(updates).eq("id", order.id);
        const itemSummary = args.items.map((i: any) => i.quantity + "x @ $" + i.unit_price.toFixed(2)).join(", ");
        return "Added to order #" + order.id.slice(0, 8) + ": " + itemSummary + "\nNew total: $" + newTotal.toFixed(2);
      }
      case "list_recent_orders": {
        const limit = args.limit || 10;
        let query = supabase.from("sales_orders").select("id, status, payment_status, total_amount, delivery_method, created_at, amount_paid, shipping_status, contacts(name), sales_order_items(quantity, peptides(name))").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        const { data: orders } = await query;
        if (!orders?.length) return "No orders found.";
        return orders.map((o: any) => {
          const items = o.sales_order_items?.map((i: any) => i.quantity + "x " + (i.peptides?.name || "?")).join(", ") || "no items";
          return "#" + o.id.slice(0, 8) + " | " + (o.contacts?.name || "Unknown") + " | " + o.status + "/" + o.payment_status + " | $" + Number(o.total_amount).toFixed(2) + " | " + items + " | " + (o.delivery_method || "ship") + " | " + (o.shipping_status || "n/a") + " | " + new Date(o.created_at).toLocaleDateString() + "\n  Full ID: " + o.id;
        }).join("\n");
      }
      case "update_sales_order": {
        // Resolve partial UUID
        const resolvedId = await resolveOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Could not find order with ID '" + args.order_id + "'. Use list_recent_orders for the full UUID.";
        const u: any = {};
        for (const key of ["status", "payment_status", "amount_paid", "payment_method", "payment_date", "shipping_address", "shipping_status", "tracking_number", "carrier", "notes", "merchant_fee"]) { if (args[key] !== undefined) u[key] = args[key]; }
        const { error } = await supabase.from("sales_orders").update(u).eq("id", resolvedId);
        if (error) return "Error: " + error.message;
        return "Sales order #" + resolvedId.slice(0, 8) + " updated: " + Object.keys(u).join(", ");
      }
      case "fulfill_order": {
        // Resolve partial UUID
        const resolvedId = await resolveOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Could not find order with ID '" + args.order_id + "'. Use list_recent_orders for the full UUID.";
        const { data: order, error: oErr } = await supabase.from("sales_orders").select("*, sales_order_items(*, peptides(id, name))").eq("id", resolvedId).single();
        if (oErr) return "Error: " + oErr.message;
        if (order.status === "fulfilled") return "Order already fulfilled.";
        if (order.status === "cancelled") return "Cannot fulfill cancelled order.";
        const { data: movement, error: mErr } = await supabase.from("movements").insert({ org_id: orgId, type: "sale", contact_id: order.client_id, movement_date: new Date().toISOString().split("T")[0], notes: "[SO:" + order.id + "] Fulfilled Sales Order #" + order.id.slice(0, 8), payment_status: order.payment_status || "unpaid", amount_paid: order.amount_paid || 0 }).select().single();
        if (mErr) return "Error creating movement: " + mErr.message;
        for (const item of order.sales_order_items) {
          const { data: bottles } = await supabase.from("bottles").select("id, lots!inner(peptide_id)").eq("status", "in_stock").eq("lots.peptide_id", item.peptide_id).order("created_at", { ascending: true }).limit(item.quantity);
          if (!bottles || bottles.length < item.quantity) return "Insufficient stock for " + (item.peptides?.name || "?") + ". Need " + item.quantity + ", have " + (bottles?.length || 0) + ". Fulfillment aborted.";
          const ids = bottles.map((b: any) => b.id);
          await supabase.from("movement_items").insert(ids.map((bid: string) => ({ movement_id: movement.id, bottle_id: bid, price_at_sale: item.unit_price })));
          await supabase.from("bottles").update({ status: "sold" }).in("id", ids);
        }
        await supabase.from("sales_orders").update({ status: "fulfilled" }).eq("id", order.id);
        await supabase.rpc("process_sale_commission", { p_sale_id: order.id }).catch(() => {});
        const totalBottles = order.sales_order_items.reduce((s: number, i: any) => s + i.quantity, 0);
        return "Order #" + order.id.slice(0, 8) + " FULFILLED. " + totalBottles + " bottles deducted from inventory.";
      }
      case "list_movements": {
        const limit = args.limit || 15;
        let query = supabase.from("movements").select("id, type, movement_date, notes, payment_status, amount_paid, contacts(name)").order("movement_date", { ascending: false }).limit(limit);
        if (args.type) query = query.eq("type", args.type);
        const { data } = await query;
        if (!data?.length) return "No movements found.";
        return data.map((m: any) => "#" + m.id.slice(0, 8) + " | " + m.type + " | " + (m.contacts?.name || "N/A") + " | " + m.payment_status + " | $" + Number(m.amount_paid || 0).toFixed(2) + " | " + m.movement_date + " | " + (m.notes?.slice(0, 60) || "")).join("\n");
      }
      case "list_commissions": {
        const limit = args.limit || 20;
        let query = supabase.from("commissions").select("id, amount, commission_rate, type, status, created_at, partner_id, sale_id, profiles(full_name), sales_orders(total_amount, contacts(name))").order("created_at", { ascending: false }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        if (args.partner_id) query = query.eq("partner_id", args.partner_id);
        const { data } = await query;
        if (!data?.length) return "No commissions found.";
        return data.map((c: any) => "#" + c.id.slice(0, 8) + " | " + ((c as any).profiles?.full_name || "Unknown") + " | $" + Number(c.amount).toFixed(2) + " (" + (Number(c.commission_rate) * 100).toFixed(0) + "%) | " + c.type + " | " + c.status + " | Sale $" + Number(c.sales_orders?.total_amount || 0).toFixed(2) + " for " + ((c.sales_orders as any)?.contacts?.name || "?") + " | " + new Date(c.created_at).toLocaleDateString()).join("\n");
      }
      case "get_commission_stats": {
        const { data } = await supabase.from("commissions").select("amount, status");
        const s = { pending: 0, available: 0, paid: 0, voidCount: 0, total: 0 };
        data?.forEach((c: any) => { const amt = Number(c.amount) || 0; s.total += amt; if (c.status === "pending") s.pending += amt; else if (c.status === "available") s.available += amt; else if (c.status === "paid") s.paid += amt; else if (c.status === "void") s.voidCount++; });
        return "Commission Stats:\n  Pending: $" + s.pending.toFixed(2) + "\n  Available (applied to balance): $" + s.available.toFixed(2) + "\n  Paid (cash): $" + s.paid.toFixed(2) + "\n  Total: $" + s.total.toFixed(2) + "\n  Void records: " + s.voidCount;
      }
      case "update_commission": {
        const { error } = await supabase.from("commissions").update({ status: args.status }).eq("id", args.commission_id);
        if (error) return "Error: " + error.message;
        return "Commission #" + args.commission_id.slice(0, 8) + " status updated to '" + args.status + "'.";
      }
      case "list_partners": {
        const { data } = await supabase.from("profiles").select("id, full_name, email, commission_rate, price_multiplier, pricing_mode, cost_plus_markup, partner_tier, parent_rep_id, credit_balance").eq("role", "sales_rep").eq("org_id", orgId).order("full_name");
        if (!data?.length) return "No partners found.";
        return data.map((p: any) => (p.full_name || "Unnamed") + " | " + (p.email || "") + " | Rate:" + (Number(p.commission_rate || 0) * 100).toFixed(0) + "% | Tier:" + (p.partner_tier || "standard") + " | Mode:" + (p.pricing_mode || "percentage") + " | Balance:$" + Number(p.credit_balance || 0).toFixed(2) + " | ID:" + p.id).join("\n");
      }
      case "update_partner": {
        const u: any = {};
        for (const key of ["commission_rate", "price_multiplier", "pricing_mode", "cost_plus_markup", "partner_tier", "parent_rep_id"]) { if (args[key] !== undefined) u[key] = args[key]; }
        const { error } = await supabase.from("profiles").update(u).eq("id", args.partner_id);
        if (error) return "Error: " + error.message;
        return "Partner " + args.partner_id.slice(0, 8) + " updated: " + Object.keys(u).join(", ");
      }
      case "get_partner_detail": {
        const { data: profile } = await supabase.from("profiles").select("id, full_name, email, commission_rate, price_multiplier, pricing_mode, cost_plus_markup, partner_tier, credit_balance, parent_rep_id").eq("id", args.partner_id).single();
        if (!profile) return "Partner not found.";
        const { data: comms } = await supabase.from("commissions").select("amount, status").eq("partner_id", args.partner_id);
        const cs = { pending: 0, available: 0, paid: 0 };
        comms?.forEach((c: any) => { const amt = Number(c.amount) || 0; if (c.status === "pending") cs.pending += amt; else if (c.status === "available") cs.available += amt; else if (c.status === "paid") cs.paid += amt; });
        const { count: orderCount } = await supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("rep_id", args.partner_id);
        const { count: customerCount } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("assigned_rep_id", args.partner_id);
        const { data: sales } = await supabase.from("sales_orders").select("total_amount").eq("rep_id", args.partner_id).neq("status", "cancelled");
        const totalSales = sales?.reduce((s: number, o: any) => s + Number(o.total_amount), 0) || 0;
        return "Partner: " + profile.full_name + "\n  Email: " + profile.email + "\n  Tier: " + (profile.partner_tier || "standard") + "\n  Commission Rate: " + (Number(profile.commission_rate || 0) * 100).toFixed(0) + "%\n  Pricing: " + (profile.pricing_mode || "percentage") + " (multiplier: " + (profile.price_multiplier || 1) + ")\n  Balance: $" + Number(profile.credit_balance || 0).toFixed(2) + "\n  Orders: " + (orderCount || 0) + "\n  Customers: " + (customerCount || 0) + "\n  Total Sales: $" + totalSales.toFixed(2) + "\n  Commissions - Pending: $" + cs.pending.toFixed(2) + " | Available: $" + cs.available.toFixed(2) + " | Paid: $" + cs.paid.toFixed(2);
      }
      case "list_expenses": {
        const limit = args.limit || 20;
        let query = supabase.from("expenses").select("*").order("date", { ascending: false }).limit(limit);
        if (args.category) query = query.eq("category", args.category);
        const { data } = await query;
        if (!data?.length) return "No expenses found.";
        return data.map((e: any) => e.date + " | " + e.category + " | $" + Number(e.amount).toFixed(2) + " | " + (e.description || "no desc") + " | " + (e.recipient || "") + " | " + (e.payment_method || "") + " | " + e.status).join("\n");
      }
      case "create_expense": {
        const { error } = await supabase.from("expenses").insert({ date: args.date, category: args.category, amount: args.amount, description: args.description || null, recipient: args.recipient || null, payment_method: args.payment_method || null, status: args.status || "paid" });
        if (error) return "Error: " + error.message;
        return "Expense recorded: $" + args.amount.toFixed(2) + " (" + args.category + ") on " + args.date;
      }
      case "get_financial_summary": {
        const { data: valuation } = await supabase.rpc("get_inventory_valuation");
        const inventoryValue = valuation?.[0]?.total_value || 0;
        const { data: salesOrders } = await supabase.from("sales_orders").select("total_amount, cogs_amount, profit_amount, merchant_fee, commission_amount").neq("status", "cancelled");
        const revenue = salesOrders?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
        const orderCogs = salesOrders?.reduce((s: number, o: any) => s + Number(o.cogs_amount || 0), 0) || 0;
        const orderProfit = salesOrders?.reduce((s: number, o: any) => s + Number(o.profit_amount || 0), 0) || 0;
        const merchantFees = salesOrders?.reduce((s: number, o: any) => s + Number(o.merchant_fee || 0), 0) || 0;
        const totalCommission = salesOrders?.reduce((s: number, o: any) => s + Number(o.commission_amount || 0), 0) || 0;
        const { data: expenses } = await supabase.from("expenses").select("amount, category");
        let inventoryExp = 0;
        let operatingExp = 0;
        expenses?.forEach((e: any) => { if (e.category === "inventory") inventoryExp += Number(e.amount); else operatingExp += Number(e.amount); });
        const { count: stockCount } = await supabase.from("bottles").select("id", { count: "exact", head: true }).eq("status", "in_stock");
        return "=== FINANCIAL SUMMARY ===\nInventory Value: $" + inventoryValue.toFixed(2) + " (" + (stockCount || 0) + " bottles in stock)\n\nSales Revenue: $" + revenue.toFixed(2) + "\nCOGS: $" + orderCogs.toFixed(2) + "\nGross Profit: $" + (revenue - orderCogs).toFixed(2) + "\n\nCommissions: $" + totalCommission.toFixed(2) + "\nMerchant Fees: $" + merchantFees.toFixed(2) + "\nOrder-based Net Profit: $" + orderProfit.toFixed(2) + "\n\nExpenses - Inventory: $" + inventoryExp.toFixed(2) + " | Operating: $" + operatingExp.toFixed(2) + " | Total: $" + (inventoryExp + operatingExp).toFixed(2) + "\n\nCash Flow Profit: $" + (revenue - orderCogs - operatingExp - inventoryExp).toFixed(2);
      }
      case "list_protocols": {
        let query = supabase.from("protocols").select("id, name, description, contact_id, created_at, contacts(name), protocol_items(peptides(name), dose_amount, dose_unit, frequency)").order("created_at", { ascending: false }).limit(20);
        if (args.contact_id) query = query.eq("contact_id", args.contact_id);
        const { data } = await query;
        if (!data?.length) return "No protocols found.";
        return data.map((p: any) => { const items = p.protocol_items?.map((i: any) => (i.peptides?.name || "?") + " " + (i.dose_amount || "") + (i.dose_unit || "") + " " + (i.frequency || "")).join(", ") || "no items"; return p.name + " | For: " + (p.contacts?.name || "Template") + " | Items: " + items + " | " + new Date(p.created_at).toLocaleDateString() + " | ID:" + p.id; }).join("\n");
      }
      case "create_protocol": {
        const { data: protocol, error } = await supabase.from("protocols").insert({ name: args.name, description: args.description || null, contact_id: args.contact_id || null, org_id: orgId }).select().single();
        if (error) return "Error: " + error.message;
        if (args.items?.length) {
          const items = args.items.map((i: any) => ({ protocol_id: protocol.id, peptide_id: i.peptide_id, dose_amount: i.dose_amount || null, dose_unit: i.dose_unit || null, frequency: i.frequency || null, timing: i.timing || null }));
          const { error: iErr } = await supabase.from("protocol_items").insert(items);
          if (iErr) return "Protocol created but items failed: " + iErr.message;
        }
        return "Protocol \"" + protocol.name + "\" created (ID: " + protocol.id + ") with " + (args.items?.length || 0) + " items.";
      }
      case "list_requests": {
        const limit = args.limit || 20;
        let query = supabase.from("requests").select("id, status, created_at, admin_notes, contacts(name), peptides(name)").order("created_at", { ascending: false }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        const { data } = await query;
        if (!data?.length) return "No requests found.";
        return data.map((r: any) => "#" + r.id.slice(0, 8) + " | " + (r.contacts?.name || "?") + " | " + (r.peptides?.name || "?") + " | " + r.status + " | " + new Date(r.created_at).toLocaleDateString() + " | Notes: " + (r.admin_notes || "none")).join("\n");
      }
      case "respond_to_request": {
        const { error } = await supabase.from("requests").update({ status: args.status, admin_notes: args.admin_notes || null }).eq("id", args.request_id);
        if (error) return "Error: " + error.message;
        return "Request #" + args.request_id.slice(0, 8) + " updated to '" + args.status + "'.";
      }
      case "get_dashboard_stats": {
        const today = new Date().toISOString().split("T")[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
        const { count: todayOrders } = await supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", today);
        const { count: weekOrders } = await supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", weekAgo);
        const { data: weekRevenue } = await supabase.from("sales_orders").select("total_amount").eq("org_id", orgId).gte("created_at", weekAgo).neq("status", "cancelled");
        const revenue = weekRevenue?.reduce((s: number, o: any) => s + Number(o.total_amount), 0) || 0;
        const { count: totalStock } = await supabase.from("bottles").select("id", { count: "exact", head: true }).eq("status", "in_stock");
        const { count: totalContacts } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        const { count: pendingRequests } = await supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "pending");
        const { count: pendingPOs } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending");
        return "Dashboard:\n  Orders today: " + (todayOrders || 0) + "\n  Orders this week: " + (weekOrders || 0) + "\n  Revenue this week: $" + revenue.toFixed(2) + "\n  Bottles in stock: " + (totalStock || 0) + "\n  Total contacts: " + (totalContacts || 0) + "\n  Pending client requests: " + (pendingRequests || 0) + "\n  Pending purchase orders: " + (pendingPOs || 0);
      }
      default:
        return "Unknown tool: " + name;
    }
  } catch (err: any) {
    return "Tool error (" + name + "): " + err.message;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Invalid token" }, 401);
    const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
    if (!profile?.org_id) return json({ error: "No organization" }, 400);
    const { data: userRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    const role = userRole?.role || profile.role;
    if (!["admin", "staff"].includes(role)) return json({ error: "Admin or staff role required" }, 403);
    const { message } = await req.json();
    if (!message) return json({ error: "message required" }, 400);
    await supabase.from("admin_chat_messages").insert({ user_id: user.id, role: "user", content: message });
    const { data: history } = await supabase.from("admin_chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: true }).limit(30);
    const messages = [{ role: "system" as const, content: SYSTEM_PROMPT }, ...(history || []).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }))];
    let response;
    let loopCount = 0;
    while (loopCount < 8) {
      loopCount++;
      const completion = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + OPENAI_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.3 }) });
      const data = await completion.json();
      if (data.error) {
        await logToolCall(supabase, user.id, "_openai_api", { loop: loopCount }, "", "OpenAI API error: " + JSON.stringify(data.error), 0);
        response = "Sorry, there was an API error. Please try again.";
        break;
      }
      const choice = data.choices?.[0];
      if (!choice) { response = "Sorry, I couldn't process that request."; break; }
      if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls) {
        messages.push(choice.message);
        for (const tc of choice.message.tool_calls) {
          const tcArgs = JSON.parse(tc.function.arguments);
          const startMs = Date.now();
          const result = await executeTool(tc.function.name, tcArgs, supabase, profile.org_id);
          const durationMs = Date.now() - startMs;
          const hasError = result.startsWith("Error:") || result.startsWith("Tool error") || result.includes("failed");
          await logToolCall(supabase, user.id, tc.function.name, tcArgs, result, hasError ? result : null, durationMs);
          messages.push({ role: "tool" as any, tool_call_id: tc.id, content: result } as any);
        }
        continue;
      }
      response = choice.message?.content || "No response.";
      break;
    }
    if (!response) response = "Processing took too long. Please try again.";
    await supabase.from("admin_chat_messages").insert({ user_id: user.id, role: "assistant", content: response });
    return json({ reply: response });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
