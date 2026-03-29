// woo-webhook v22 — zero-import, pure fetch() against REST API
// Fixes from v21:
//   1. rep_id FK: resolve partner_id (user_id) → profiles.id before setting rep_id
//   2. Commission RPC: use p_sale_id (not p_order_id)
//   3. admin_ai_logs: correct column names (user_id, tool_args as jsonb)

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HDR = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function sbGet(table: string, qs: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, { headers: HDR });
  if (!r.ok) { console.error(`[sb] GET ${table}: ${await r.text()}`); return []; }
  return r.json();
}

async function sbPost(table: string, data: any): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST", headers: HDR, body: JSON.stringify(data),
  });
  if (!r.ok) { console.error(`[sb] POST ${table}: ${await r.text()}`); return null; }
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbPatch(table: string, qs: string, data: any): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, {
    method: "PATCH", headers: HDR, body: JSON.stringify(data),
  });
  if (!r.ok) { console.error(`[sb] PATCH ${table}: ${await r.text()}`); return null; }
  return r.json();
}

async function sbRpc(fn: string, params: any): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) { const e = await r.text(); console.error(`[sb] RPC ${fn}: ${e}`); return { error: e }; }
  // Handle 204 No Content (void RPCs) — r.json() throws on empty body
  const txt = await r.text();
  if (!txt) return { ok: true };
  try { return JSON.parse(txt); } catch { return { ok: true }; }
}

async function validateHmac(req: Request, body: string, secret: string): Promise<boolean> {
  if (!secret) return true;
  const sig = req.headers.get("X-WC-Webhook-Signature");
  if (!sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (computed.length !== sig.length) return false;
  let r = 0;
  for (let i = 0; i < computed.length; i++) r |= computed.charCodeAt(i) ^ sig.charCodeAt(i);
  return r === 0;
}

function payStatus(s: string): string {
  if (s === "completed") return "paid";
  if (s === "processing" || s === "on-hold") return "pending_verification";
  return "unpaid";
}

function fmtAddr(a: any): string {
  if (!a) return "";
  return [a.address_1, a.address_2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(", ");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get("org_id");
    if (!orgId) return new Response("Missing org_id", { status: 400 });

    const body = await req.text();
    const topic = req.headers.get("X-WC-Webhook-Topic") || "";
    const resource = req.headers.get("X-WC-Webhook-Resource") || "";

    // ACK ping
    if (!topic || topic === "action.woocommerce_webhook_ping") {
      console.log(`[woo-webhook] Ping org=${orgId}`);
      return new Response("OK", { status: 200 });
    }

    // Webhook secret
    const secRows = await sbGet("tenant_api_keys", `select=api_key&org_id=eq.${orgId}&service=eq.woo_webhook_secret&limit=1`);
    const secret = secRows?.[0]?.api_key || "";

    if (!(await validateHmac(req, body, secret))) {
      console.error("[woo-webhook] Bad HMAC for org:", orgId);
      return new Response("Forbidden", { status: 403 });
    }

    const woo = JSON.parse(body);
    if (resource !== "order") return new Response("OK", { status: 200 });

    if (["cancelled", "refunded", "failed", "trash"].includes(woo.status)) {
      console.log(`[woo-webhook] Skip ${woo.status} order #${woo.id}`);
      return new Response("OK", { status: 200 });
    }

    // Line items
    const items = (woo.line_items || []).map((li: any) => ({
      name: li.name || li.product_name || "",
      sku: li.sku || "",
      qty: li.quantity || 1,
      price: parseFloat(li.price) || (parseFloat(li.total) / (li.quantity || 1)) || 0,
    }));
    if (items.length === 0) {
      console.log(`[woo-webhook] Order #${woo.id} no items`);
      return new Response("OK", { status: 200 });
    }

    const bill = woo.billing || {};
    const ship = woo.shipping || {};
    const custName = [bill.first_name, bill.last_name].filter(Boolean).join(" ") ||
                     [ship.first_name, ship.last_name].filter(Boolean).join(" ");
    const custEmail = (bill.email || "").toLowerCase();

    // Dedup
    const dup = await sbGet("sales_orders", `select=id&org_id=eq.${orgId}&order_source=eq.woocommerce&woo_order_id=eq.${woo.id}&limit=1`);
    if (dup.length > 0) {
      console.log(`[woo-webhook] WC #${woo.id} already imported`);
      return new Response("OK", { status: 200 });
    }

    // Admin user
    const admins = await sbGet("profiles", `select=user_id&org_id=eq.${orgId}&role=eq.admin&limit=1`);
    const adminUid = admins?.[0]?.user_id || null;

    // Find/create contact
    let contactId: string | null = null;
    if (custEmail) {
      const existing = await sbGet("contacts", `select=id&org_id=eq.${orgId}&email=ilike.${encodeURIComponent(custEmail)}&limit=1`);
      if (existing.length > 0) {
        contactId = existing[0].id;
      } else {
        const nc = await sbPost("contacts", {
          org_id: orgId, name: custName || custEmail.split("@")[0],
          email: custEmail, phone: bill.phone || null, source: "woocommerce",
        });
        contactId = nc?.id || null;
      }
    }

    // Expand bundle items (e.g. "MOTS-C 40mg + SS-31 50mg Bundle" → 2 items)
    const expanded: typeof items = [];
    for (const it of items) {
      if (it.name.includes(" + ")) {
        const clean = it.name.replace(/\s+bundle$/i, "").trim();
        const parts = clean.split(/\s*\+\s*/).map((n: string) => n.trim()).filter((n: string) => n.length > 0);
        if (parts.length > 1) {
          // Look up retail prices for proportional split
          const prices: (number | null)[] = [];
          for (const p of parts) {
            let m = await sbGet("peptides", `select=retail_price&org_id=eq.${orgId}&name=ilike.${encodeURIComponent(p)}&limit=1`);
            if (m.length === 0) {
              const w = p.split(/[\s\-_]+/)[0];
              if (w && w.length >= 3) m = await sbGet("peptides", `select=retail_price&org_id=eq.${orgId}&name=ilike.${encodeURIComponent(`%${w}%`)}&limit=1`);
            }
            prices.push(m.length > 0 && m[0].retail_price ? Number(m[0].retail_price) : null);
          }
          const totalRetail = prices.reduce((s, p) => s + (p || 0), 0);
          const allKnown = prices.every(p => p !== null && p > 0) && totalRetail > 0;
          const bundleTotal = it.price * it.qty;
          for (let i = 0; i < parts.length; i++) {
            let cp = allKnown ? (prices[i]! / totalRetail) * it.price : it.price / parts.length;
            cp = Math.round(cp * 100) / 100;
            expanded.push({ name: parts[i], sku: it.sku ? `${it.sku}-${i+1}` : "", qty: it.qty, price: cp });
          }
          // Fix rounding on last component
          const splitT = expanded.slice(-parts.length).reduce((s, x) => s + x.price * x.qty, 0);
          const diff = Math.round((bundleTotal - splitT) * 100) / 100;
          if (diff !== 0) expanded[expanded.length - 1].price = Math.round((expanded[expanded.length - 1].price + diff / it.qty) * 100) / 100;
          console.log(`[woo-webhook] Bundle "${it.name}" → ${parts.length}: ${parts.join(", ")}`);
          continue;
        }
      }
      expanded.push(it);
    }

    // Match items to peptides
    const matched: any[] = [];
    let skipped = 0;

    for (const it of expanded) {
      let pid: string | null = null;
      let pname = it.name;

      // Exact name
      const nm = await sbGet("peptides", `select=id,name&org_id=eq.${orgId}&name=ilike.${encodeURIComponent(it.name)}&limit=1`);
      if (nm.length > 0) { pid = nm[0].id; pname = nm[0].name; }

      // SKU
      if (!pid && it.sku) {
        const sk = await sbGet("peptides", `select=id,name&org_id=eq.${orgId}&sku=ilike.${encodeURIComponent(it.sku)}&limit=1`);
        if (sk.length > 0) { pid = sk[0].id; pname = sk[0].name; }
      }

      // Fuzzy first word
      if (!pid) {
        const w = it.name.split(/[\s\-_]+/)[0];
        if (w && w.length >= 3) {
          const fz = await sbGet("peptides", `select=id,name&org_id=eq.${orgId}&name=ilike.${encodeURIComponent(`%${w}%`)}&limit=1`);
          if (fz.length > 0) { pid = fz[0].id; pname = fz[0].name; }
        }
      }

      if (pid) matched.push({ peptide_id: pid, peptide_name: pname, quantity: it.qty, unit_price: it.price });
      else { skipped++; console.log(`[woo-webhook] No match: "${it.name}" (SKU: ${it.sku || "-"})`); }
    }

    if (matched.length === 0) {
      console.error(`[woo-webhook] 0 items matched for WC #${woo.id}`);
      return new Response("OK", { status: 200 });
    }

    // Create sales_order
    const order = await sbPost("sales_orders", {
      org_id: orgId,
      client_id: contactId,
      contact_id: contactId,
      status: "submitted",
      total_amount: parseFloat(woo.total) || 0,
      payment_status: payStatus(woo.status || "pending"),
      delivery_method: "shipping",
      shipping_address: fmtAddr(ship.address_1 ? ship : bill),
      notes: `WooCommerce Order #${woo.id}`,
      order_source: "woocommerce",
      payment_method: woo.payment_method_title || woo.payment_method || null,
      woo_order_id: woo.id,
    });

    if (!order?.id) {
      console.error(`[woo-webhook] Failed to create order for WC #${woo.id}`);
      return new Response("OK", { status: 200 });
    }
    console.log(`[woo-webhook] Order ${order.id} created for WC #${woo.id}`);

    // Insert order items
    const oiData = matched.map((m: any) => ({
      sales_order_id: order.id, peptide_id: m.peptide_id,
      quantity: m.quantity, unit_price: m.unit_price,
    }));
    // Use POST with array for bulk insert — don't need return value
    const oiRes = await fetch(`${SB_URL}/rest/v1/sales_order_items`, {
      method: "POST", headers: { ...HDR, Prefer: "return=minimal" }, body: JSON.stringify(oiData),
    });
    if (!oiRes.ok) console.error(`[sb] POST sales_order_items: ${await oiRes.text()}`);

    // ── LAYER 1: Coupon → partner attribution ──────────────────
    let repProfileId: string | null = null;
    const coupons = (woo.coupon_lines || []).map((cl: any) => cl.code).filter(Boolean);

    if (coupons.length > 0) {
      for (const code of coupons) {
        const codes = await sbGet(
          "partner_discount_codes",
          `select=partner_id,id,uses_count&org_id=eq.${orgId}&code=ilike.${encodeURIComponent(code)}&active=eq.true&limit=1`
        );
        if (codes.length > 0) {
          const dc = codes[0];
          console.log(`[woo-webhook] COUPON "${code}" -> partner user_id=${dc.partner_id}`);

          // FIX #1: Resolve partner_id (auth user_id) → profiles.id (FK target)
          const prof = await sbGet("profiles", `select=id&user_id=eq.${dc.partner_id}&org_id=eq.${orgId}&limit=1`);
          if (prof.length > 0) {
            repProfileId = prof[0].id;
            console.log(`[woo-webhook] Resolved profiles.id=${repProfileId} from user_id=${dc.partner_id}`);
            await sbPatch("sales_orders", `id=eq.${order.id}`, { rep_id: repProfileId });
          } else {
            console.error(`[woo-webhook] No profile for user_id=${dc.partner_id} in org ${orgId}`);
          }

          // Assign the contact to this partner so they show in downline
          if (contactId && repProfileId) {
            await sbPatch("contacts", `id=eq.${contactId}&assigned_rep_id=is.null`, {
              assigned_rep_id: repProfileId, updated_at: new Date().toISOString(),
            });
          }

          // Increment uses_count
          await sbPatch("partner_discount_codes", `id=eq.${dc.id}`, { uses_count: (dc.uses_count || 0) + 1 });
          break;
        }
      }
    }

    // ── LAYER 2: Email → partner attribution ──────────────────
    if (!repProfileId && custEmail) {
      const reps = await sbGet(
        "contacts",
        `select=assigned_rep_id&org_id=eq.${orgId}&email=ilike.${encodeURIComponent(custEmail)}&assigned_rep_id=not.is.null&limit=1`
      );
      if (reps.length > 0 && reps[0].assigned_rep_id) {
        repProfileId = reps[0].assigned_rep_id;
        await sbPatch("sales_orders", `id=eq.${order.id}`, { rep_id: repProfileId });
        // Also assign contact to this rep if not already assigned
        if (contactId) {
          await sbPatch("contacts", `id=eq.${contactId}&assigned_rep_id=is.null`, {
            assigned_rep_id: repProfileId, updated_at: new Date().toISOString(),
          });
        }
        console.log(`[woo-webhook] Email attribution: rep_id=${repProfileId}`);
      }
    }

    // ── Auto-trigger commissions ──────────────────────────────
    if (repProfileId) {
      const chk = await sbGet("sales_orders", `select=rep_id,payment_status&id=eq.${order.id}&limit=1`);
      const o = chk?.[0];
      if (o?.rep_id && ["paid", "pending_verification"].includes(o.payment_status)) {
        // FIX #2: Correct RPC param name (p_sale_id, not p_order_id)
        const cr = await sbRpc("process_sale_commission", { p_sale_id: order.id });
        if (cr?.error) console.error(`[woo-webhook] Commission RPC: ${JSON.stringify(cr.error)}`);
        else console.log(`[woo-webhook] Commissions processed for ${order.id}`);
      }
    }

    // ── Log to admin_ai_logs ──────────────────────────────────
    // FIX #3: Correct columns (user_id not org_id, tool_args as jsonb)
    await sbPost("admin_ai_logs", {
      user_id: adminUid,
      tool_name: "woo_order_import",
      tool_args: { woo_order_id: woo.id, status: woo.status, coupons },
      tool_result: JSON.stringify({ order_id: order.id, matched: matched.length, skipped, rep: repProfileId }),
      duration_ms: 0,
    });

    // ── Notification ──────────────────────────────────────────
    await sbPost("notifications", {
      org_id: orgId, user_id: adminUid, type: "order",
      title: `WooCommerce Order #${woo.id} imported`,
      message: `${matched.length} item(s) synced.${repProfileId ? " Partner attributed." : ""}${skipped > 0 ? ` ${skipped} unmatched.` : ""}`,
    });

    console.log(`[woo-webhook] DONE #${woo.id} order=${order.id} rep=${repProfileId || "none"} items=${matched.length}/${items.length}`);
    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("[woo-webhook] Error:", err);
    return new Response("OK", { status: 200 });
  }
});
