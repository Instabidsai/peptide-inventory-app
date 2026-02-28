/**
 * Shared AI core: system prompts, tools, executeTool, context loading, GPT-4o loop.
 * Used by admin-ai-chat (web) and telegram-webhook (Telegram bot).
 */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Peptide Admin";

// ── Staff tool allowlist ─────────────────────────────────────
export const STAFF_ALLOWED_TOOLS = new Set([
  "search_contacts", "create_contact", "update_contact", "get_contact_history",
  "search_peptides", "list_all_peptides", "get_pricing",
  "get_bottle_stats", "list_lots", "add_inventory",
  "create_order", "add_items_to_order", "list_recent_orders", "update_sales_order", "fulfill_order",
  "list_purchase_orders", "create_purchase_order", "receive_purchase_order", "record_purchase_payment",
  "list_movements",
  "list_commissions", "get_commission_stats",
  "list_protocols", "create_protocol",
  "list_requests", "respond_to_request",
  "get_dashboard_stats", "low_stock_report", "top_sellers", "revenue_by_period",
  "submit_suggestion", "report_issue",
]);

// ── System prompts ───────────────────────────────────────────
export const ADMIN_SYSTEM_PROMPT = `You are the admin assistant for ${BRAND_NAME} peptide inventory system. You have FULL access to every admin feature in the app.

You can help with:
- CONTACTS: Search, create, update contacts/clients
- SALES ORDERS: Create, update status, record payments, add items to existing orders
- PURCHASE ORDERS: Create supplier orders, mark received (auto-creates inventory), record payments
- ADD INVENTORY: Directly add stock (lot + bottles) without a PO — use when admin says "add inventory" or "we received X bottles"
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
- ANALYTICS: Top sellers by revenue/quantity, revenue by period (day/week/month), low stock alerts
- CUSTOMER HISTORY: Full contact profile with all orders, total spent, balance owed
- GIVEAWAYS/LOSSES: Record giveaways, internal use, or losses with automatic FIFO bottle allocation
- VOID ORDERS: Cancel orders and auto-restore inventory + void commissions
- SUGGESTIONS: Submit feature suggestions or bug reports for the admin to review
- SMS: Send text messages to contacts/customers. Look up their phone number from contacts, then use send_sms.`;

export const STAFF_SYSTEM_PROMPT = `You are the operations assistant for ${BRAND_NAME} peptide inventory system. You are a staff member with access to day-to-day operations.

You can help with:
- CONTACTS: Search, create, update contacts/clients, view customer history
- SALES ORDERS: Create, update status, record payments, add items, fulfill orders
- PURCHASE ORDERS: Create supplier orders, mark received (auto-creates inventory), record payments
- ADD INVENTORY: Directly add stock (lot + bottles) without a PO — use when told "add inventory" or "we received X bottles"
- INVENTORY: View peptides, pricing, lots, bottle stats, stock levels (read-only — cannot create/modify peptides)
- PRICING: Show cost/2x/3x/MSRP tiers for any peptide
- MOVEMENTS: View inventory movements (read-only)
- COMMISSIONS: View commissions and stats (read-only — cannot pay/void commissions)
- PROTOCOLS: List and create treatment protocols
- REQUESTS: View and respond to client requests
- DASHBOARD: Quick stats (orders, revenue, stock, contacts)
- ANALYTICS: Top sellers, revenue by period, low stock alerts
- SUGGESTIONS: Submit feature suggestions or bug reports for admin review

RESTRICTIONS (you do NOT have access to):
- Creating or modifying peptide products (admin only)
- Recording giveaways, losses, or internal-use movements (admin only)
- Voiding/cancelling orders (admin only)
- Modifying partner settings, commission rates, or tiers (admin only)
- Paying or voiding commissions (admin only)
- Creating or viewing expenses (admin only)
- Viewing full financial P&L summaries (admin only)
- Listing partner details with commission rates (admin only)

If a user asks for something you can't do, explain that it requires admin access.`;

export const SHARED_RULES = `

RULES:
1. ALWAYS confirm before creating or modifying data. Show a clear summary and ask "Should I proceed?" or similar.
2. When the user confirms (yes, do it, go ahead, confirm, proceed, yep, etc.), THEN execute the tools.
3. If pricing tier isn't specified, ASK: cost, 2x, 3x, or MSRP?
4. Default delivery method is 'ship' unless they say pickup/local.
5. Keep responses concise - use bullet points for summaries.
6. If a contact already exists (found via search), use them instead of creating a duplicate.
7. SMART MATCHING: Your context includes the FULL peptide catalog (with pricing & stock), recent contacts, and recent orders — loaded fresh every message. When the user mentions a peptide or person, match it using your reasoning against the loaded data. Use IDs from the catalog directly. Examples: "TB-500"=TB500, "BPC"=BPC-157, "tirz"=Tirzepatide, "disp"=DSIP. NEVER say "not found" without checking the catalog and suggesting the closest match.
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
18. ONE-STEP ORDERS: You have peptide IDs, all pricing tiers, contact IDs, and addresses pre-loaded. Create orders directly without searching first — you already have the data. Don't waste tool calls on search_peptides or search_contacts when you can see the answer in your context.
19. NEVER give up after one failed search. If a tool returns "not found", check the pre-loaded catalog and suggest the closest match. Always offer alternatives.
20. ADDING INVENTORY: When the user says "add inventory", "add stock", "we received bottles", or "add X of peptide Y" — use the add_inventory tool directly. Do NOT create a purchase order first. The add_inventory tool creates the lot + bottles in one step. Only use create_purchase_order when they explicitly want to track a future order from a supplier.

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

// ── Fuzzy peptide search ─────────────────────────────────────
export async function findPeptides(supabase: any, orgId: string, query: string, limit = 10) {
  let { data } = await supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).ilike("name", "%" + query + "%").limit(limit);
  if (data?.length) return data;
  const stripped = query.replace(/[-\s]/g, "");
  if (stripped !== query) {
    ({ data } = await supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).ilike("name", "%" + stripped + "%").limit(limit));
    if (data?.length) return data;
  }
  const aliases: Record<string, string> = {
    "tb": "TB500", "tb500": "TB500", "tb-500": "TB500",
    "bpc": "BPC-157", "bpc157": "BPC-157",
    "tirz": "Tirzepatide", "tirzepatide": "Tirzepatide",
    "sema": "Semax", "semax": "Semax",
    "reta": "Retatrutide", "ret": "Retatrutide",
    "dsip": "DSIP", "disp": "DSIP",
    "ghk": "GHK-CU", "ghkcu": "GHK-CU",
    "kpv": "KPV", "ll37": "LL-37", "ll-37": "LL-37",
    "ipa": "Ipamorelin", "cjc": "CJC",
    "mt2": "Melanotan", "melanotan": "Melanotan",
    "pt141": "PT-141", "pt-141": "PT-141",
    "mots": "MOTS-C", "motsc": "MOTS-C",
    "nad": "NAD+", "nad+": "NAD+",
    "oxy": "Oxytocin", "oxytocin": "Oxytocin",
    "kiss": "Kisspeptin", "selank": "Selank",
    "foxo": "FOXO4", "foxo4": "FOXO4",
    "aod": "AOD-9604", "aod9604": "AOD-9604",
    "bac": "Bacteriostatic", "bacwater": "Bacteriostatic",
    "vip": "VIP", "ara": "ARA-290",
    "glut": "Glutathione", "glutathione": "Glutathione",
    "epi": "Epithalon", "epithalon": "Epithalon",
    "tesa": "Tesamorelin", "tesamorelin": "Tesamorelin",
    "serm": "Sermorelin", "sermorelin": "Sermorelin",
    "cag": "Cagriniltide", "amino": "5-Amino",
    "ss31": "SS-31", "ss-31": "SS-31",
    "thy": "Thy Alpha", "thymosin": "Thy Alpha",
    "blend": "Blend",
  };
  const lower = query.toLowerCase().replace(/[-\s]/g, "");
  const mapped = aliases[lower];
  if (mapped) {
    ({ data } = await supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).ilike("name", "%" + mapped + "%").limit(limit));
    if (data?.length) return data;
  }
  return [];
}

// ── Tool definitions ─────────────────────────────────────────
export const tools = [
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
  { type: "function" as const, function: { name: "add_inventory", description: "Directly add inventory (create a lot + auto-generate bottles). Use this when the admin says 'add inventory', 'receive stock', or 'we got X bottles of Y'. Skips the PO workflow — creates a lot and bottles immediately.", parameters: { type: "object", properties: { peptide_id: { type: "string" }, quantity: { type: "number", description: "Number of bottles/vials received" }, cost_per_unit: { type: "number", description: "Cost per bottle/vial" }, lot_number: { type: "string", description: "Lot/batch number from supplier" }, supplier: { type: "string" }, expiry_date: { type: "string", description: "YYYY-MM-DD" }, payment_status: { type: "string", enum: ["unpaid", "partial", "paid"], description: "Default: unpaid" }, notes: { type: "string" } }, required: ["peptide_id", "quantity", "cost_per_unit", "lot_number"] } } },
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
  { type: "function" as const, function: { name: "update_partner", description: "Update a partner/rep's settings: commission_rate, price_multiplier, pricing_mode, cost_plus_markup, partner_tier.", parameters: { type: "object", properties: { partner_id: { type: "string" }, commission_rate: { type: "number" }, price_multiplier: { type: "number" }, pricing_mode: { type: "string", enum: ["percentage", "cost_plus", "cost_multiplier"] }, cost_plus_markup: { type: "number" }, partner_tier: { type: "string", enum: ["standard", "associate", "referral", "senior", "director", "executive"] }, parent_rep_id: { type: "string" } }, required: ["partner_id"] } } },
  { type: "function" as const, function: { name: "get_partner_detail", description: "Get detailed stats for a specific partner/rep including sales, commissions, tier.", parameters: { type: "object", properties: { partner_id: { type: "string" } }, required: ["partner_id"] } } },
  { type: "function" as const, function: { name: "list_expenses", description: "List expenses with category, amount, date. Can filter by category (inventory, operating, etc.).", parameters: { type: "object", properties: { category: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function" as const, function: { name: "create_expense", description: "Record an expense for tracking cash flow.", parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, category: { type: "string" }, amount: { type: "number" }, description: { type: "string" }, recipient: { type: "string" }, payment_method: { type: "string" }, status: { type: "string", enum: ["paid", "pending"] } }, required: ["date", "category", "amount"] } } },
  { type: "function" as const, function: { name: "get_financial_summary", description: "Get comprehensive P&L: revenue, COGS, gross profit, commissions, expenses, net profit.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "list_protocols", description: "List treatment protocols with items. Can filter by contact_id.", parameters: { type: "object", properties: { contact_id: { type: "string" } } } } },
  { type: "function" as const, function: { name: "create_protocol", description: "Create a treatment protocol with peptide items and dosing.", parameters: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, contact_id: { type: "string" }, items: { type: "array", items: { type: "object", properties: { peptide_id: { type: "string" }, dose_amount: { type: "number" }, dose_unit: { type: "string" }, frequency: { type: "string" }, timing: { type: "string" } } } } }, required: ["name"] } } },
  { type: "function" as const, function: { name: "list_requests", description: "List client requests (e.g. 'is X in stock?', 'can you make Y?'). Can filter by status.", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "answered", "archived"] }, limit: { type: "number" } } } } },
  { type: "function" as const, function: { name: "respond_to_request", description: "Respond to a client request and update its status.", parameters: { type: "object", properties: { request_id: { type: "string" }, status: { type: "string", enum: ["pending", "answered", "archived"] }, admin_notes: { type: "string" } }, required: ["request_id", "status"] } } },
  { type: "function" as const, function: { name: "get_dashboard_stats", description: "Get quick dashboard: orders today/week, revenue, stock, contacts, pending requests/POs.", parameters: { type: "object", properties: {} } } },
  { type: "function" as const, function: { name: "get_contact_history", description: "Get a contact's full history: all orders, total spent, total paid, balance owed, last order date.", parameters: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] } } },
  { type: "function" as const, function: { name: "low_stock_report", description: "Show peptides with stock at or below a threshold. Essential for reorder planning.", parameters: { type: "object", properties: { threshold: { type: "number", description: "Stock level threshold (default 5)" } } } } },
  { type: "function" as const, function: { name: "top_sellers", description: "Show best-selling peptides ranked by revenue or quantity. Can filter by date range.", parameters: { type: "object", properties: { by: { type: "string", enum: ["revenue", "quantity"], description: "Sort metric (default revenue)" }, days: { type: "number", description: "Look back N days (default all time)" }, limit: { type: "number", description: "Top N results (default 10)" } } } } },
  { type: "function" as const, function: { name: "revenue_by_period", description: "Show revenue broken down by day, week, or month for trend analysis.", parameters: { type: "object", properties: { period: { type: "string", enum: ["day", "week", "month"], description: "Grouping period (default month)" }, periods: { type: "number", description: "Number of periods to show (default 6)" } } } } },
  { type: "function" as const, function: { name: "record_inventory_movement", description: "Record a giveaway, internal use, or loss. Auto-allocates bottles FIFO and updates inventory.", parameters: { type: "object", properties: { type: { type: "string", enum: ["giveaway", "internal_use", "loss"], description: "Type of movement" }, peptide_id: { type: "string" }, quantity: { type: "number" }, contact_id: { type: "string", description: "Optional: recipient (for giveaways)" }, reason: { type: "string", description: "Reason/notes" } }, required: ["type", "peptide_id", "quantity"] } } },
  { type: "function" as const, function: { name: "void_order", description: "Cancel/void an order. If fulfilled, restores bottles to in_stock. Also voids any commissions.", parameters: { type: "object", properties: { order_id: { type: "string" }, reason: { type: "string" } }, required: ["order_id"] } } },
  { type: "function" as const, function: { name: "submit_suggestion", description: "Submit a feature suggestion or improvement idea for admin review. Shows up in the admin Automations queue.", parameters: { type: "object", properties: { suggestion: { type: "string", description: "The feature idea or improvement suggestion" } }, required: ["suggestion"] } } },
  { type: "function" as const, function: { name: "report_issue", description: "Report a bug or issue for admin review. Shows up in the admin Automations queue.", parameters: { type: "object", properties: { description: { type: "string", description: "Description of the bug or issue" } }, required: ["description"] } } },
  { type: "function" as const, function: { name: "send_sms", description: "Send an SMS text message to a contact's phone number. Look up the contact first to get their phone number. Keep messages concise (under 300 chars). The message is sent via Textbelt and the contact can reply back.", parameters: { type: "object", properties: { phone: { type: "string", description: "Phone number in E.164 format (+15551234567) or 10-digit US format" }, message: { type: "string", description: "The text message to send (keep under 300 chars)" }, contact_name: { type: "string", description: "Name of recipient (for logging)" } }, required: ["phone", "message"] } } },
  { type: "function" as const, function: { name: "bulk_update_pricing", description: "Update pricing for multiple products at once. Use this when a user uploads a pricing document (CSV, Excel, etc). Fuzzy-matches products by name or SKU.", parameters: { type: "object", properties: { updates: { type: "array", items: { type: "object", properties: { name: { type: "string", description: "Product name to match" }, retail_price: { type: "number" }, wholesale_price: { type: "number" }, sku: { type: "string" } } }, description: "Array of product updates with name and optional price/sku fields" } }, required: ["updates"] } } },
];

// ── UUID resolvers ───────────────────────────────────────────
export async function resolveOrderId(supabase: any, partialId: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partialId)) return partialId;
  const clean = partialId.replace(/^#/, "");
  const { data } = await supabase.from("sales_orders").select("id").ilike("id", clean + "%").limit(2);
  if (data?.length === 1) return data[0].id;
  return null;
}

export async function resolvePurchaseOrderId(supabase: any, partialId: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(partialId)) return partialId;
  const clean = partialId.replace(/^#/, "");
  const { data } = await supabase.from("orders").select("id").ilike("id", clean + "%").limit(2);
  if (data?.length === 1) return data[0].id;
  return null;
}

// ── Tool call logging ────────────────────────────────────────
export async function logToolCall(supabase: any, userId: string, toolName: string, args: any, result: string, error: string | null, durationMs: number) {
  try {
    await supabase.from("admin_ai_logs").insert({ user_id: userId, tool_name: toolName, tool_args: args, tool_result: result, error, duration_ms: durationMs });
  } catch (e) {
    console.error("Failed to log tool call:", e);
  }
}

// ── executeTool ──────────────────────────────────────────────
export async function executeTool(name: string, args: any, supabase: any, orgId: string, userId: string, userRole: string): Promise<string> {
  if (userRole === "staff" && !STAFF_ALLOWED_TOOLS.has(name)) {
    return "Access denied: '" + name + "' requires admin privileges. Ask your admin to perform this action.";
  }
  try {
    switch (name) {
      case "search_contacts": {
        const q = args.query;
        const { data } = await supabase.from("contacts").select("id, name, email, phone, address, type").eq("org_id", orgId).or("name.ilike.%" + q + "%,email.ilike.%" + q + "%,phone.ilike.%" + q + "%").limit(10);
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
        const { error } = await supabase.from("contacts").update(u).eq("id", args.contact_id).eq("org_id", orgId);
        if (error) return "Error: " + error.message;
        return "Contact updated: " + Object.keys(u).join(", ");
      }
      case "search_peptides": {
        const data = await findPeptides(supabase, orgId, args.query);
        if (!data?.length) return "No peptides found matching '" + args.query + "'. Try a different spelling or use list_all_peptides to see everything.";
        const withStock = await Promise.all(data.map(async (p: any) => {
          const { count } = await supabase.from("bottles").select("id, lots!inner(peptide_id)", { count: "exact", head: true }).eq("lots.peptide_id", p.id).eq("status", "in_stock");
          return (p.name || "Unnamed") + " | Stock: " + (count || 0) + " bottles | MSRP: $" + Number(p.retail_price).toFixed(2) + " | ID: " + p.id;
        }));
        return withStock.join("\n");
      }
      case "list_all_peptides": {
        // Two queries instead of N+1 — fetch peptides and stock counts in parallel
        const [{ data }, { data: inStockBottles }] = await Promise.all([
          supabase.from("peptides").select("id, name, retail_price").eq("org_id", orgId).order("name"),
          supabase.from("bottles").select("lots!inner(peptide_id, org_id)").eq("status", "in_stock").eq("lots.org_id", orgId),
        ]);
        if (!data?.length) return "No peptides found.";
        const stockCounts: Record<string, number> = {};
        (inStockBottles || []).forEach((b: any) => {
          const pid = b.lots?.peptide_id;
          if (pid) stockCounts[pid] = (stockCounts[pid] || 0) + 1;
        });
        const withStock = data.map((p: any) =>
          (p.name || "Unnamed") + " | Stock: " + (stockCounts[p.id] || 0) + " | MSRP: $" + Number(p.retail_price).toFixed(2) + " | ID: " + p.id
        );
        return withStock.join("\n");
      }
      case "get_pricing": {
        const matches = await findPeptides(supabase, orgId, args.peptide_name, 1);
        const data = matches?.[0];
        if (!data) return "Peptide '" + args.peptide_name + "' not found. Try a different spelling or use list_all_peptides.";
        const { data: lots } = await supabase.from("lots").select("cost_per_unit, quantity_received").eq("peptide_id", data.id);
        let avgCost = 0;
        if (lots?.length) {
          let totalCost = 0, totalQty = 0;
          lots.forEach((l: any) => { const c = Number(l.cost_per_unit || 0); const q = Number(l.quantity_received || 0); totalCost += c * q; totalQty += q; });
          avgCost = totalQty > 0 ? totalCost / totalQty : 0;
        }
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
        const { error } = await supabase.from("peptides").update(u).eq("id", args.peptide_id).eq("org_id", orgId);
        if (error) return "Error: " + error.message;
        return "Peptide updated: " + Object.keys(u).join(", ");
      }
      case "get_bottle_stats": {
        // Single query — fetch all bottles for this org, group by status in JS
        const { data: allBottles } = await supabase
          .from("bottles")
          .select("status, lots!inner(org_id)")
          .eq("lots.org_id", orgId);
        const statuses = ["in_stock", "sold", "given_away", "internal_use", "lost", "returned", "expired"];
        const stats: Record<string, number> = {};
        for (const s of statuses) stats[s] = 0;
        (allBottles || []).forEach((b: any) => {
          if (stats[b.status] !== undefined) stats[b.status]++;
        });
        const total = Object.values(stats).reduce((s, c) => s + c, 0);
        return "Bottle Status Breakdown (Total: " + total + "):\n" + Object.entries(stats).map(([k, v]) => "  " + k.replace(/_/g, " ") + ": " + v).join("\n");
      }
      case "list_lots": {
        const limit = args.limit || 20;
        const { data } = await supabase.from("lots").select("id, peptide_id, quantity_received, cost_per_unit, payment_status, expiry_date, peptides!inner(name, org_id)").eq("peptides.org_id", orgId).order("created_at", { ascending: false }).limit(limit);
        if (!data?.length) return "No lots found.";
        return data.map((l: any) => "#" + l.id.slice(0, 8) + " | " + (l.peptides?.name || "?") + " | " + l.quantity_received + " units @ $" + Number(l.cost_per_unit).toFixed(2) + " | Payment: " + l.payment_status + " | Expiry: " + (l.expiry_date || "N/A")).join("\n");
      }
      case "add_inventory": {
        // Insert lot — database trigger `create_bottles_for_lot` auto-creates bottles
        const { data: lot, error: lotErr } = await supabase.from("lots").insert({
          org_id: orgId, peptide_id: args.peptide_id, quantity_received: args.quantity,
          cost_per_unit: args.cost_per_unit, lot_number: args.lot_number,
          expiry_date: args.expiry_date || null, payment_status: args.payment_status || "unpaid",
        }).select().single();
        if (lotErr) return "Error creating lot: " + lotErr.message;
        // Optionally create a matching PO record for tracking
        if (args.supplier) {
          await supabase.from("orders").insert({
            org_id: orgId, peptide_id: args.peptide_id, status: "received",
            quantity_ordered: args.quantity, estimated_cost_per_unit: args.cost_per_unit,
            supplier: args.supplier, notes: args.notes || null,
          }).catch(() => {});
        }
        const pepName = await supabase.from("peptides").select("name").eq("id", args.peptide_id).single();
        return "Inventory added: " + args.quantity + " bottles of " + (pepName?.data?.name || args.peptide_id) + " @ $" + args.cost_per_unit.toFixed(2) + "/unit. Lot: " + args.lot_number + ". Payment: " + (args.payment_status || "unpaid") + ".";
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
        const { data: order, error } = await supabase.from("orders").insert({ org_id: orgId, peptide_id: args.peptide_id, status: "pending", quantity_ordered: args.quantity_ordered, estimated_cost_per_unit: args.estimated_cost_per_unit, supplier: args.supplier || null, expected_arrival_date: args.expected_arrival_date || null, tracking_number: args.tracking_number || null, notes: args.notes || null }).select().single();
        if (error) return "Error: " + error.message;
        return "PO created (#" + order.id.slice(0, 8) + "): " + args.quantity_ordered + " units ordered. ID: " + order.id;
      }
      case "receive_purchase_order": {
        const resolvedId = await resolvePurchaseOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Purchase order not found for ID '" + args.order_id + "'. Use the full UUID.";
        const { data: order } = await supabase.from("orders").select("*").eq("id", resolvedId).single();
        if (!order) return "PO not found.";
        // Insert lot — database trigger `create_bottles_for_lot` auto-creates bottles
        const { data: lot, error: lotErr } = await supabase.from("lots").insert({ org_id: orgId, peptide_id: order.peptide_id, quantity_received: args.actual_quantity, cost_per_unit: args.actual_cost_per_unit, lot_number: args.lot_number, expiry_date: args.expiry_date || null, payment_status: "unpaid" }).select().single();
        if (lotErr) return "Error creating lot: " + lotErr.message;
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
        if (repId) {
          await supabase.rpc("process_sale_commission", { p_sale_id: order.id }).catch(() => {});
          notifyPartnerCommissions(supabase, order.id, orgId).catch(() => {});
        }
        const itemSummary = args.items.map((i: any) => i.quantity + "x @ $" + i.unit_price.toFixed(2)).join(", ");
        return "Order #" + order.id.slice(0, 8) + " created (SUBMITTED — ready for Pick & Pack)" + (shippingAddr ? "\nShip to: " + shippingAddr : "\nWARNING: No shipping address!") + "\nItems: " + itemSummary + "\nTotal: $" + totalAmount.toFixed(2) + "\nDelivery: " + (args.delivery_method || "ship") + "\nFull ID: " + order.id;
      }
      case "add_items_to_order": {
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
        const resolvedId = await resolveOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Could not find order with ID '" + args.order_id + "'. Use list_recent_orders for the full UUID.";
        const u: any = {};
        for (const key of ["status", "payment_status", "amount_paid", "payment_method", "payment_date", "shipping_address", "shipping_status", "tracking_number", "carrier", "notes", "merchant_fee"]) { if (args[key] !== undefined) u[key] = args[key]; }
        const { error } = await supabase.from("sales_orders").update(u).eq("id", resolvedId);
        if (error) return "Error: " + error.message;
        return "Sales order #" + resolvedId.slice(0, 8) + " updated: " + Object.keys(u).join(", ");
      }
      case "fulfill_order": {
        const resolvedId = await resolveOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Could not find order with ID '" + args.order_id + "'. Use list_recent_orders for the full UUID.";
        // Atomic fulfillment via Postgres RPC — prevents race conditions
        const { data: result, error: rpcErr } = await supabase.rpc("fulfill_order_atomic", {
          p_order_id: resolvedId,
          p_org_id: orgId,
        });
        if (rpcErr) return "Error: " + rpcErr.message;
        if (!result?.success) return "Error: " + (result?.error || "Unknown fulfillment error");
        // Fire-and-forget commission processing
        await supabase.rpc("process_sale_commission", { p_sale_id: resolvedId }).catch(() => {});
        notifyPartnerCommissions(supabase, resolvedId, orgId).catch(() => {});
        return "Order #" + resolvedId.slice(0, 8) + " FULFILLED. " + result.bottles_allocated + " bottles deducted from inventory.";
      }
      case "list_movements": {
        const limit = args.limit || 15;
        let query = supabase.from("movements").select("id, type, movement_date, notes, payment_status, amount_paid, contacts(name)").eq("org_id", orgId).order("movement_date", { ascending: false }).limit(limit);
        if (args.type) query = query.eq("type", args.type);
        const { data } = await query;
        if (!data?.length) return "No movements found.";
        return data.map((m: any) => "#" + m.id.slice(0, 8) + " | " + m.type + " | " + (m.contacts?.name || "N/A") + " | " + m.payment_status + " | $" + Number(m.amount_paid || 0).toFixed(2) + " | " + m.movement_date + " | " + (m.notes?.slice(0, 60) || "")).join("\n");
      }
      case "list_commissions": {
        const limit = args.limit || 20;
        let query = supabase.from("commissions").select("id, amount, commission_rate, type, status, created_at, partner_id, sale_id, profiles(full_name), sales_orders!inner(org_id, total_amount, contacts(name))").eq("sales_orders.org_id", orgId).order("created_at", { ascending: false }).limit(limit);
        if (args.status) query = query.eq("status", args.status);
        if (args.partner_id) query = query.eq("partner_id", args.partner_id);
        const { data } = await query;
        if (!data?.length) return "No commissions found.";
        return data.map((c: any) => "#" + c.id.slice(0, 8) + " | " + ((c as any).profiles?.full_name || "Unknown") + " | $" + Number(c.amount).toFixed(2) + " (" + (Number(c.commission_rate) * 100).toFixed(0) + "%) | " + c.type + " | " + c.status + " | Sale $" + Number(c.sales_orders?.total_amount || 0).toFixed(2) + " for " + ((c.sales_orders as any)?.contacts?.name || "?") + " | " + new Date(c.created_at).toLocaleDateString()).join("\n");
      }
      case "get_commission_stats": {
        const { data } = await supabase.from("commissions").select("amount, status, sales_orders!inner(org_id)").eq("sales_orders.org_id", orgId);
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
        const { error } = await supabase.from("expenses").insert({ org_id: orgId, date: args.date, category: args.category, amount: args.amount, description: args.description || null, recipient: args.recipient || null, payment_method: args.payment_method || null, status: args.status || "paid" });
        if (error) return "Error: " + error.message;
        return "Expense recorded: $" + args.amount.toFixed(2) + " (" + args.category + ") on " + args.date;
      }
      case "get_financial_summary": {
        const { data: valuation } = await supabase.rpc("get_inventory_valuation");
        const inventoryValue = valuation?.[0]?.total_value || 0;
        const { data: salesOrders } = await supabase.from("sales_orders").select("total_amount, cogs_amount, profit_amount, merchant_fee, commission_amount").eq("org_id", orgId).neq("status", "cancelled");
        const revenue = salesOrders?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
        const orderCogs = salesOrders?.reduce((s: number, o: any) => s + Number(o.cogs_amount || 0), 0) || 0;
        const orderProfit = salesOrders?.reduce((s: number, o: any) => s + Number(o.profit_amount || 0), 0) || 0;
        const merchantFees = salesOrders?.reduce((s: number, o: any) => s + Number(o.merchant_fee || 0), 0) || 0;
        const totalCommission = salesOrders?.reduce((s: number, o: any) => s + Number(o.commission_amount || 0), 0) || 0;
        const { data: expenses } = await supabase.from("expenses").select("amount, category");
        let inventoryExp = 0;
        let operatingExp = 0;
        expenses?.forEach((e: any) => { if (e.category === "inventory") inventoryExp += Number(e.amount); else operatingExp += Number(e.amount); });
        const { data: orgPeps } = await supabase.from("peptides").select("id").eq("org_id", orgId);
        const pepIds = orgPeps?.map((p: any) => p.id) || [];
        const { count: stockCount } = pepIds.length > 0
          ? await supabase.from("bottles").select("id, lots!inner(peptide_id)", { count: "exact", head: true }).eq("status", "in_stock").in("lots.peptide_id", pepIds)
          : { count: 0 };
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
        let query = supabase.from("requests").select("id, status, created_at, admin_notes, contacts!inner(name, org_id), peptides(name)").eq("contacts.org_id", orgId).order("created_at", { ascending: false }).limit(limit);
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
        const { data: dashPeptides } = await supabase.from("peptides").select("id").eq("org_id", orgId);
        const dashPepIds = dashPeptides?.map((p: any) => p.id) || [];
        const { count: totalStock } = dashPepIds.length > 0
          ? await supabase.from("bottles").select("id, lots!inner(peptide_id)", { count: "exact", head: true }).eq("status", "in_stock").in("lots.peptide_id", dashPepIds)
          : { count: 0 };
        const { count: totalContacts } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        const pendingRequests = 0; // requests table not yet created
        const { count: pendingPOs } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending");
        return "Dashboard:\n  Orders today: " + (todayOrders || 0) + "\n  Orders this week: " + (weekOrders || 0) + "\n  Revenue this week: $" + revenue.toFixed(2) + "\n  Bottles in stock: " + (totalStock || 0) + "\n  Total contacts: " + (totalContacts || 0) + "\n  Pending client requests: " + (pendingRequests || 0) + "\n  Pending purchase orders: " + (pendingPOs || 0);
      }
      case "get_contact_history": {
        const { data: contact } = await supabase.from("contacts").select("id, name, email, phone, address, type, notes, created_at").eq("id", args.contact_id).eq("org_id", orgId).single();
        if (!contact) return "Contact not found.";
        const { data: orders } = await supabase.from("sales_orders").select("id, status, payment_status, total_amount, amount_paid, created_at, sales_order_items(quantity, peptides(name))").eq("client_id", args.contact_id).order("created_at", { ascending: false });
        const totalSpent = orders?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
        const totalPaid = orders?.reduce((s: number, o: any) => s + Number(o.amount_paid || 0), 0) || 0;
        const orderSummary = orders?.map((o: any) => {
          const items = o.sales_order_items?.map((i: any) => i.quantity + "x " + (i.peptides?.name || "?")).join(", ") || "no items";
          return "#" + o.id.slice(0, 8) + " | " + o.status + "/" + o.payment_status + " | $" + Number(o.total_amount).toFixed(2) + " | " + items + " | " + new Date(o.created_at).toLocaleDateString();
        }).join("\n") || "No orders.";
        return "Customer: " + contact.name + "\n  Email: " + (contact.email || "—") + " | Phone: " + (contact.phone || "—") + "\n  Address: " + (contact.address || "—") + "\n  Type: " + contact.type + " | Since: " + new Date(contact.created_at).toLocaleDateString() + "\n  Notes: " + (contact.notes || "none") + "\n\n  Total Orders: " + (orders?.length || 0) + " | Total Spent: $" + totalSpent.toFixed(2) + " | Paid: $" + totalPaid.toFixed(2) + " | Balance Owed: $" + (totalSpent - totalPaid).toFixed(2) + "\n\nOrder History:\n" + orderSummary;
      }
      case "low_stock_report": {
        const threshold = args.threshold || 5;
        // Two queries instead of N+1 — fetch peptides and all in-stock bottles in parallel
        const [{ data: peptides }, { data: inStockBottles }] = await Promise.all([
          supabase.from("peptides").select("id, name").eq("org_id", orgId).eq("active", true).order("name"),
          supabase.from("bottles").select("lots!inner(peptide_id, org_id)").eq("status", "in_stock").eq("lots.org_id", orgId),
        ]);
        if (!peptides?.length) return "No active peptides.";
        const stockCounts: Record<string, number> = {};
        (inStockBottles || []).forEach((b: any) => {
          const pid = b.lots?.peptide_id;
          if (pid) stockCounts[pid] = (stockCounts[pid] || 0) + 1;
        });
        const lowStock: string[] = [];
        for (const p of peptides) {
          const stock = stockCounts[p.id] || 0;
          if (stock <= threshold) lowStock.push(p.name + " | Stock: " + stock + (stock === 0 ? " *** OUT OF STOCK ***" : " (low)") + " | ID: " + p.id);
        }
        if (!lowStock.length) return "All peptides have stock above " + threshold + ". No reorders needed.";
        return "Low Stock Report (threshold: " + threshold + "):\n" + lowStock.join("\n");
      }
      case "top_sellers": {
        const by = args.by || "revenue";
        const limit = args.limit || 10;
        let query = supabase.from("sales_order_items").select("quantity, unit_price, peptide_id, peptides(name), sales_orders!inner(status, created_at, org_id)").eq("sales_orders.org_id", orgId).neq("sales_orders.status", "cancelled");
        if (args.days) {
          const since = new Date(Date.now() - args.days * 86400000).toISOString();
          query = query.gte("sales_orders.created_at", since);
        }
        const { data } = await query;
        if (!data?.length) return "No sales data found.";
        const agg: Record<string, { name: string; revenue: number; quantity: number }> = {};
        data.forEach((i: any) => {
          const pid = i.peptide_id;
          if (!agg[pid]) agg[pid] = { name: i.peptides?.name || "?", revenue: 0, quantity: 0 };
          agg[pid].revenue += i.quantity * Number(i.unit_price);
          agg[pid].quantity += i.quantity;
        });
        const sorted = Object.values(agg).sort((a, b) => by === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity).slice(0, limit);
        return "Top Sellers" + (args.days ? " (last " + args.days + " days)" : " (all time)") + " by " + by + ":\n" + sorted.map((s, i) => (i + 1) + ". " + s.name + " | Revenue: $" + s.revenue.toFixed(2) + " | Qty Sold: " + s.quantity).join("\n");
      }
      case "revenue_by_period": {
        const period = args.period || "month";
        const periods = args.periods || 6;
        const { data: orders } = await supabase.from("sales_orders").select("total_amount, created_at").eq("org_id", orgId).neq("status", "cancelled").order("created_at", { ascending: false });
        if (!orders?.length) return "No orders found.";
        const buckets: Record<string, number> = {};
        orders.forEach((o: any) => {
          const d = new Date(o.created_at);
          let key: string;
          if (period === "day") key = d.toISOString().split("T")[0];
          else if (period === "week") { const ws = new Date(d); ws.setDate(d.getDate() - d.getDay()); key = "Week of " + ws.toISOString().split("T")[0]; }
          else key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
          buckets[key] = (buckets[key] || 0) + Number(o.total_amount);
        });
        const sorted = Object.entries(buckets).sort((a, b) => b[0].localeCompare(a[0])).slice(0, periods);
        const total = sorted.reduce((s, [, v]) => s + v, 0);
        return "Revenue by " + period + " (last " + periods + "):\n" + sorted.map(([k, v]) => "  " + k + ": $" + v.toFixed(2)).join("\n") + "\n  ---\n  Total: $" + total.toFixed(2);
      }
      case "record_inventory_movement": {
        const statusMap: Record<string, string> = { giveaway: "given_away", internal_use: "internal_use", loss: "lost" };
        const bottleStatus = statusMap[args.type];
        if (!bottleStatus) return "Invalid movement type. Use: giveaway, internal_use, or loss.";
        const { data: verifyPep } = await supabase.from("peptides").select("id").eq("id", args.peptide_id).eq("org_id", orgId).single();
        if (!verifyPep) return "Peptide not found or does not belong to your organization.";
        const { data: bottles } = await supabase.from("bottles").select("id, lots!inner(peptide_id)").eq("status", "in_stock").eq("lots.peptide_id", args.peptide_id).order("created_at", { ascending: true }).limit(args.quantity);
        if (!bottles || bottles.length < args.quantity) return "Insufficient stock. Need " + args.quantity + ", have " + (bottles?.length || 0) + " in stock.";
        const { data: movement, error: mErr } = await supabase.from("movements").insert({ org_id: orgId, type: args.type, contact_id: args.contact_id || null, movement_date: new Date().toISOString().split("T")[0], notes: args.reason || args.type, payment_status: "n/a", amount_paid: 0 }).select().single();
        if (mErr) return "Error creating movement: " + mErr.message;
        const ids = bottles.map((b: any) => b.id);
        await supabase.from("movement_items").insert(ids.map((bid: string) => ({ movement_id: movement.id, bottle_id: bid, price_at_sale: 0 })));
        await supabase.from("bottles").update({ status: bottleStatus }).in("id", ids);
        const { data: pep } = await supabase.from("peptides").select("name").eq("id", args.peptide_id).single();
        return args.type.replace("_", " ") + " recorded: " + args.quantity + "x " + (pep?.name || "?") + ". " + args.quantity + " bottles marked as " + bottleStatus + "." + (args.reason ? " Reason: " + args.reason : "");
      }
      case "void_order": {
        const resolvedId = await resolveOrderId(supabase, args.order_id);
        if (!resolvedId) return "Error: Could not find order with ID '" + args.order_id + "'.";
        const { data: order } = await supabase.from("sales_orders").select("id, status, total_amount, notes").eq("id", resolvedId).eq("org_id", orgId).single();
        if (!order) return "Order not found.";
        if (order.status === "cancelled") return "Order is already cancelled.";
        let restored = 0;
        if (order.status === "fulfilled") {
          const { data: movements } = await supabase.from("movements").select("id").ilike("notes", "%[SO:" + order.id + "]%");
          if (movements?.length) {
            for (const m of movements) {
              const { data: items } = await supabase.from("movement_items").select("bottle_id").eq("movement_id", m.id);
              if (items?.length) {
                const bottleIds = items.map((i: any) => i.bottle_id);
                await supabase.from("bottles").update({ status: "in_stock" }).in("id", bottleIds);
                restored += bottleIds.length;
              }
              await supabase.from("movement_items").delete().eq("movement_id", m.id);
            }
            for (const m of movements) { await supabase.from("movements").delete().eq("id", m.id); }
          }
        }
        const { data: comms } = await supabase.from("commissions").select("id").eq("sale_id", order.id);
        if (comms?.length) await supabase.from("commissions").update({ status: "void" }).eq("sale_id", order.id);
        const voidNote = (order.notes ? order.notes + "\n" : "") + "VOIDED" + (args.reason ? ": " + args.reason : "");
        await supabase.from("sales_orders").update({ status: "cancelled", notes: voidNote }).eq("id", order.id);
        return "Order #" + order.id.slice(0, 8) + " CANCELLED ($" + Number(order.total_amount).toFixed(2) + ")." + (restored ? " " + restored + " bottles restored to inventory." : "") + (comms?.length ? " " + comms.length + " commission(s) voided." : "") + (args.reason ? " Reason: " + args.reason : "");
      }
      case "submit_suggestion": {
        const { error } = await supabase.from("partner_suggestions").insert({ org_id: orgId, partner_id: userId, suggestion_text: args.suggestion, category: "feature" });
        if (error) return "Error saving suggestion: " + error.message;
        return "Feature suggestion submitted! It will appear in the admin Automations queue for review.";
      }
      case "report_issue": {
        const { error } = await supabase.from("partner_suggestions").insert({ org_id: orgId, partner_id: userId, suggestion_text: args.description, category: "bug" });
        if (error) return "Error saving report: " + error.message;
        return "Issue reported! It will appear in the admin Automations queue for review.";
      }
      case "send_sms": {
        const textbeltKey = Deno.env.get("TEXTBELT_API_KEY");
        if (!textbeltKey) return "Error: SMS not configured. Set TEXTBELT_API_KEY in Supabase secrets.";
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const webhookUrl = supabaseUrl + "/functions/v1/textbelt-webhook";
        const resp = await fetch("https://textbelt.com/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: args.phone,
            message: args.message,
            key: textbeltKey,
            replyWebhookUrl: webhookUrl,
          }),
        });
        const result = await resp.json();
        if (result.success) {
          // Log the outbound SMS
          await supabase.from("admin_ai_logs").insert({
            user_id: userId,
            tool_name: "send_sms",
            tool_args: { phone: args.phone, contact_name: args.contact_name || "unknown" },
            tool_result: "Sent. textId=" + result.textId + ", quota=" + result.quotaRemaining,
            duration_ms: 0,
          });
          return "SMS sent to " + args.phone + (args.contact_name ? " (" + args.contact_name + ")" : "") + ". Message: \"" + args.message + "\". Quota remaining: " + result.quotaRemaining + ". If they reply, it will come back to the AI.";
        }
        return "SMS failed: " + (result.error || "Unknown error") + ". Quota: " + result.quotaRemaining;
      }
      case "bulk_update_pricing": {
        const updates: Array<{ name: string; retail_price?: number; wholesale_price?: number; sku?: string }> = args.updates;
        if (!updates?.length) return "No updates provided.";
        const results: string[] = [];
        let updated = 0, notFound = 0;
        for (const item of updates) {
          // Fuzzy match by name or SKU (case-insensitive)
          let match: any = null;
          if (item.sku) {
            const { data } = await supabase.from("peptides").select("id, name, sku, retail_price").eq("org_id", orgId).ilike("sku", item.sku).limit(1);
            if (data?.length) match = data[0];
          }
          if (!match && item.name) {
            const { data } = await supabase.from("peptides").select("id, name, sku, retail_price").eq("org_id", orgId).ilike("name", "%" + item.name + "%").limit(1);
            if (data?.length) match = data[0];
          }
          if (!match) {
            results.push("NOT FOUND: " + (item.name || item.sku));
            notFound++;
            continue;
          }
          const updateFields: any = {};
          if (item.retail_price !== undefined) updateFields.retail_price = item.retail_price;
          if (item.wholesale_price !== undefined) updateFields.wholesale_price = item.wholesale_price;
          if (item.sku !== undefined && item.sku !== match.sku) updateFields.sku = item.sku;
          if (Object.keys(updateFields).length === 0) {
            results.push("SKIPPED (no changes): " + match.name);
            continue;
          }
          const { error } = await supabase.from("peptides").update(updateFields).eq("id", match.id).eq("org_id", orgId);
          if (error) {
            results.push("ERROR updating " + match.name + ": " + error.message);
          } else {
            const changes = Object.entries(updateFields).map(([k, v]) => k + "=" + v).join(", ");
            results.push("UPDATED: " + match.name + " → " + changes);
            updated++;
          }
        }
        return "Bulk pricing update complete.\nUpdated: " + updated + " | Not found: " + notFound + " | Total: " + updates.length + "\n\n" + results.join("\n");
      }
      default:
        return "Unknown tool: " + name;
    }
  } catch (err: any) {
    return "Tool error (" + name + "): " + err.message;
  }
}

// ── Partner commission SMS notifications ─────────────────────
async function notifyPartnerCommissions(supabase: any, saleId: string, orgId: string): Promise<void> {
  try {
    const textbeltKey = Deno.env.get("TEXTBELT_API_KEY");
    if (!textbeltKey) return; // SMS not configured — skip silently

    // Get commissions just created for this sale
    const { data: commissions } = await supabase
      .from("commissions")
      .select("partner_id, amount, type, commission_rate")
      .eq("sale_id", saleId);

    if (!commissions?.length) return;

    // Get the order details for context
    const { data: order } = await supabase
      .from("sales_orders")
      .select("total_amount, contacts(name)")
      .eq("id", saleId)
      .single();

    const customerName = order?.contacts?.name || "a customer";
    const orderTotal = Number(order?.total_amount || 0).toFixed(2);

    // Group commissions by partner (a partner can have both 'available' + 'pending' entries)
    const partnerTotals: Record<string, number> = {};
    for (const c of commissions) {
      partnerTotals[c.partner_id] = (partnerTotals[c.partner_id] || 0) + Number(c.amount);
    }

    // Send SMS to each partner
    for (const [partnerId, totalCommission] of Object.entries(partnerTotals)) {
      if (totalCommission <= 0) continue;

      // Get partner profile name
      const { data: partnerProfile } = await supabase
        .from("profiles")
        .select("full_name, user_id")
        .eq("id", partnerId)
        .single();

      if (!partnerProfile) continue;

      // Find partner's phone number via their linked contact record
      const { data: partnerContact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("org_id", orgId)
        .eq("linked_user_id", partnerProfile.user_id)
        .single();

      const phone = partnerContact?.phone;
      if (!phone) continue; // No phone number — can't notify

      // Get YTD commission total for this partner
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data: ytdData } = await supabase
        .from("commissions")
        .select("amount")
        .eq("partner_id", partnerId)
        .gte("created_at", yearStart);

      const ytdTotal = (ytdData || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      const firstName = (partnerProfile.full_name || "").split(" ")[0] || "Partner";
      const msg = `${firstName}, new sale! ${customerName} - $${orderTotal}. Your commission: $${totalCommission.toFixed(2)}. YTD total: $${ytdTotal.toFixed(2)}`;

      // Send via Textbelt (fire and forget — don't block order flow)
      fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message: msg, key: textbeltKey }),
      }).catch(() => {}); // Silent fail — notifications shouldn't break orders
    }
  } catch {
    // Never let notification errors break the order flow
  }
}

// ── Smart context loader ─────────────────────────────────────
export async function loadSmartContext(supabase: any, orgId: string): Promise<string> {
  const [
    { data: allPeptides },
    { data: allLots },
    { data: stockBottles },
    { data: recentContacts },
    { data: recentOrders },
    { data: onboardingMessages },
  ] = await Promise.all([
    supabase.from("peptides").select("id, name, retail_price, active").eq("org_id", orgId).order("name"),
    supabase.from("lots").select("peptide_id, cost_per_unit, quantity_received").eq("org_id", orgId),
    supabase.from("bottles").select("lot_id, lots!inner(peptide_id, org_id)").eq("status", "in_stock").eq("lots.org_id", orgId),
    supabase.from("contacts").select("id, name, email, phone, address, type").eq("org_id", orgId).order("created_at", { ascending: false }).limit(30),
    supabase.from("sales_orders").select("id, status, payment_status, total_amount, created_at, contacts(name), sales_order_items(quantity, peptides(name))").eq("org_id", orgId).order("created_at", { ascending: false }).limit(10),
    supabase.from("onboarding_messages").select("role, content, created_at").eq("org_id", orgId).order("created_at", { ascending: true }).limit(20),
  ]);

  const stockMap: Record<string, number> = {};
  stockBottles?.forEach((b: any) => { const pid = b.lots?.peptide_id; if (pid) stockMap[pid] = (stockMap[pid] || 0) + 1; });

  const costMap: Record<string, { totalCost: number; totalQty: number }> = {};
  allLots?.forEach((l: any) => {
    const cost = Number(l.cost_per_unit || 0);
    const qty = Number(l.quantity_received || 0);
    if (!costMap[l.peptide_id]) costMap[l.peptide_id] = { totalCost: 0, totalQty: 0 };
    costMap[l.peptide_id].totalCost += cost * qty;
    costMap[l.peptide_id].totalQty += qty;
  });

  const catalogLines = (allPeptides || []).map((p: any) => {
    const stock = stockMap[p.id] || 0;
    const avg = costMap[p.id] && costMap[p.id].totalQty > 0 ? costMap[p.id].totalCost / costMap[p.id].totalQty : 0;
    return p.name + " | Stock: " + stock + " | Cost: $" + avg.toFixed(2) + " | 2x: $" + (avg * 2).toFixed(2) + " | 3x: $" + (avg * 3).toFixed(2) + " | MSRP: $" + Number(p.retail_price).toFixed(2) + (p.active === false ? " | INACTIVE" : "") + " | ID: " + p.id;
  });

  const contactLines = (recentContacts || []).map((c: any) =>
    c.name + " (" + c.type + ") | " + (c.email || "—") + " | " + (c.phone || "—") + " | " + (c.address || "no address") + " | ID: " + c.id
  );

  const orderLines = (recentOrders || []).map((o: any) => {
    const items = o.sales_order_items?.map((i: any) => i.quantity + "x " + (i.peptides?.name || "?")).join(", ") || "no items";
    return "#" + o.id.slice(0, 8) + " | " + (o.contacts?.name || "?") + " | " + o.status + "/" + o.payment_status + " | $" + Number(o.total_amount).toFixed(2) + " | " + items + " | " + new Date(o.created_at).toLocaleDateString() + " | ID: " + o.id;
  });

  // Build onboarding history summary so admin AI has full continuity
  let onboardingSection = "";
  if (onboardingMessages && onboardingMessages.length > 0) {
    const onboardingLines = onboardingMessages.map((m: any) =>
      (m.role === "user" ? "MERCHANT" : "SETUP AI") + ": " + (m.content.length > 300 ? m.content.slice(0, 300) + "..." : m.content)
    );
    onboardingSection = "\n\nONBOARDING HISTORY (Setup Assistant conversation — this is what the merchant told us during initial setup):\n" + onboardingLines.join("\n");
  }

  return "\n\n=== LIVE DATA (refreshed every message) ===\nDate: " + new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString() + "\n\nPEPTIDE CATALOG (" + catalogLines.length + " products — use these IDs directly, no search needed):\n" + catalogLines.join("\n") + "\n\nCONTACTS (" + contactLines.length + " most recent):\n" + contactLines.join("\n") + "\n\nRECENT ORDERS:\n" + orderLines.join("\n") + onboardingSection;
}

// ── GPT-4o tool-calling loop ─────────────────────────────────
import { loadComposioTools, executeComposioTool, isComposioTool, getComposioSystemPromptSection } from "./composio-tools.ts";

export async function runAILoop(opts: {
  supabase: any;
  orgId: string;
  userId: string;
  userRole: string;
  systemPrompt: string;
  dynamicContext: string;
  chatHistory: Array<{ role: string; content: string }>;
  maxLoops?: number;
}): Promise<string> {
  const { supabase, orgId, userId, userRole, systemPrompt, dynamicContext, chatHistory, maxLoops = 8 } = opts;
  const baseTools = (userRole === "admin" || userRole === "super_admin") ? tools : tools.filter(t => STAFF_ALLOWED_TOOLS.has(t.function.name));

  // Dynamically load Composio tools based on connected services (admin/super_admin only)
  let composioConnectionMap = new Map<string, string>();
  let composioPromptSection = "";
  let activeTools = [...baseTools];

  if (userRole === "admin" || userRole === "super_admin") {
    try {
      const composio = await loadComposioTools(supabase, orgId);
      if (composio.tools.length > 0) {
        activeTools = [...baseTools, ...composio.tools];
        composioConnectionMap = composio.connectionMap;
        composioPromptSection = getComposioSystemPromptSection(composio.serviceList);
      }
    } catch (err) {
      console.error("[runAILoop] Composio tools load error:", (err as Error).message);
    }
  }

  const messages: any[] = [
    { role: "system", content: systemPrompt + dynamicContext + composioPromptSection },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  let response: string | undefined;
  let loopCount = 0;

  while (loopCount < maxLoops) {
    loopCount++;
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages, tools: activeTools, tool_choice: "auto", temperature: 0.3 }),
    });
    const data = await completion.json();
    if (data.error) {
      await logToolCall(supabase, userId, "_openai_api", { loop: loopCount }, "", "OpenAI API error: " + JSON.stringify(data.error), 0);
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

        // Route to Composio executor or local executor
        let result: string;
        if (isComposioTool(tc.function.name)) {
          const connectionId = composioConnectionMap.get(tc.function.name);
          if (!connectionId) {
            result = `Error: No active connection found for ${tc.function.name}. Please connect the service in Settings > Integrations first.`;
          } else {
            result = await executeComposioTool(tc.function.name, tcArgs, connectionId);
          }
        } else {
          result = await executeTool(tc.function.name, tcArgs, supabase, orgId, userId, userRole);
        }

        const durationMs = Date.now() - startMs;
        const hasError = result.startsWith("Error:") || result.startsWith("Tool error") || result.includes("failed");
        await logToolCall(supabase, userId, tc.function.name, tcArgs, result, hasError ? result : null, durationMs);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }
    response = choice.message?.content || "No response.";
    break;
  }

  return response || "Processing took too long. Please try again.";
}
