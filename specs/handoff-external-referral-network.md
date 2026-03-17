# Handoff Prompt — External Referral Network: WooCommerce Webhook + Final Wiring

> Copy everything below this line into a new Claude Code session.

---

## Context: What This Feature Does

The **External Referral Network** feature lets partner referral links redirect customers to the org's REAL WooCommerce/Shopify store (e.g., pureuspeptides.com) instead of PeptideAI's internal store. When a customer clicks a partner's referral link like `thepeptideai.com/r/test-partner`, they get redirected to `pureuspeptides.com/?coupon=TESTPARTNER20` — the coupon auto-applies (or the customer enters it), and when they check out, WooCommerce sends a webhook to PeptideAI which imports the order, matches the coupon to the partner, and auto-creates commissions.

## What's Already Built & Deployed (DO NOT REBUILD)

All of this is live in production. Do not recreate any of it:

1. **DB Migration** — `tenant_config` has `external_store_url` and `external_store_platform` columns
2. **Feature Flag** — `external_referral_links` registered in `src/lib/feature-registry.ts`, shows in `/admin/features`
3. **API Redirect** — `api/ref.ts` handles the redirect logic:
   - `/r/slug` → checks feature flag → checks external URL → checks partner discount code → 302 redirects to external store with coupon
   - `/r/slug?p` → ALWAYS internal redirect (partner recruitment)
   - Falls back to internal `/join` if anything is missing
   - **Bug fix deployed**: Resolves `profiles.id` → `profiles.user_id` before looking up `partner_discount_codes` (the FK is on `user_id`, not `id`)
4. **Partner Discount Code Hook** — `src/hooks/use-partner-discount-code.ts`
5. **ReferralLinkCard UI** — Updated to show external links when feature is ON
6. **Reps.tsx (Partners Page)** — Feature flag toggle + external link display added to Invite Links tab
7. **Woo-Webhook Commission Trigger** — `supabase/functions/woo-webhook/index.ts` calls `process_sale_commission()` after successful import
8. **Email Attribution (Layer 2)** — `supabase/functions/_shared/platform-order-sync.ts` does email→contact→rep matching as fallback
9. **Integrations Page** — External Store URL + Platform fields added to WooCommerce connected section
10. **Provision Tenant** — Seeds `external_referral_links: false` for new orgs
11. **Test Data Created**:
    - Discount code `TESTPARTNER20` for partner `test-partner` (user_id: `825eb4ec-0742-4220-b30a-235bb82d7f12`)
    - Discount code `AITEST20` for partner `ai-test-admin`
    - External store URL set to `https://pureuspeptides.com` in tenant_config
    - Feature flag `external_referral_links` is currently **ON** for org `33a18316-b0a4-4d85-a770-d1ceb762bd4f`

## What's BROKEN — This Is What You Need To Fix

### Problem: WooCommerce webhook never fires → orders don't come into PeptideAI

**Root cause**: The WooCommerce OAuth connection in PeptideAI was set up pointing to `https://shop.pureuspeptide.com`, but the actual customer-facing store is `https://pureuspeptides.com`. These are different WordPress installations (or at least different domains). The webhook was either never created on the WooCommerce side, or it's on the wrong domain. **Zero WooCommerce orders have EVER been imported for this org** — all existing orders have `order_source: 'app'`.

**Current DB state** (in `tenant_api_keys` for org `33a18316-b0a4-4d85-a770-d1ceb762bd4f`):
```
woo_consumer_key: ck_f99e331...  (points to shop.pureuspeptide.com)
woo_consumer_secret: cs_ab37a09...  (points to shop.pureuspeptide.com)
woo_url: https://shop.pureuspeptide.com  (WRONG — should be pureuspeptides.com)
woo_webhook_secret: 01d537a5...8e3b
```

**Current DB state** (in `tenant_config`):
```
external_store_url: https://pureuspeptides.com  (correct for referral redirects)
external_store_platform: woocommerce
```

### What Needs To Happen (in order)

#### Step 1: Fix the WooCommerce Connection URL
Update `tenant_api_keys` to point to the correct store:
```sql
UPDATE tenant_api_keys
SET api_key = 'https://pureuspeptides.com', api_key_masked = 'https://pureuspeptides.com'
WHERE org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f' AND service = 'woo_url';
```
**BUT FIRST** — you may need to re-do the WooCommerce OAuth flow against `pureuspeptides.com` to get valid consumer key/secret for THAT domain. The existing keys are for `shop.pureuspeptide.com` and won't work on a different WordPress installation. Check if PeptideAI has a WooCommerce connection flow in the Integrations page (`/integrations`) — if so, use that. If not, you'll need to generate new API keys manually in `pureuspeptides.com/wp-admin → WooCommerce → Settings → Advanced → REST API`.

#### Step 2: Set Up the Webhook on pureuspeptides.com
You have WooCommerce MCP tools. Use them to:

1. First, connect to the WooCommerce REST API for `pureuspeptides.com` using the correct consumer key/secret
2. Create a webhook via the WooCommerce API:
   ```
   POST /wp-json/wc/v3/webhooks
   {
     "name": "PeptideAI Order Sync",
     "topic": "order.updated",
     "delivery_url": "https://mckkegmkpqdicudnfhor.supabase.co/functions/v1/woo-webhook?org_id=33a18316-b0a4-4d85-a770-d1ceb762bd4f",
     "secret": "<use existing woo_webhook_secret from tenant_api_keys>",
     "status": "active"
   }
   ```
3. Verify the webhook was created and is active
4. Check if there's also a webhook needed for `order.created` (the current handler processes both)

#### Step 3: Verify the Webhook Secret
The webhook secret stored in `tenant_api_keys` needs to match what's configured in WooCommerce. When you create the webhook via API, the secret you pass becomes the signing secret. Make sure it matches `tenant_api_keys.api_key` where `service = 'woo_webhook_secret'`.

To read the current secret:
```sql
SELECT api_key FROM tenant_api_keys
WHERE org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f' AND service = 'woo_webhook_secret';
```

#### Step 4: Test the Full Pipeline
1. **Trigger a test webhook**: Either place a test order on pureuspeptides.com, or use the WooCommerce API to update an existing order's status to trigger the webhook
2. **Check Supabase edge function logs**: Use `mcp__supabase__get_logs` with `service: 'edge-function'` to see if `woo-webhook` received a POST
3. **Check the database**:
   ```sql
   -- Did the order come through?
   SELECT * FROM sales_orders WHERE org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f' AND order_source = 'woocommerce' ORDER BY created_at DESC LIMIT 5;

   -- Was a contact created?
   SELECT * FROM contacts WHERE org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f' ORDER BY created_at DESC LIMIT 5;

   -- Were commissions created (if coupon matched a partner)?
   SELECT * FROM commissions WHERE org_id = '33a18316-b0a4-4d85-a770-d1ceb762bd4f' ORDER BY created_at DESC LIMIT 5;
   ```

#### Step 5: Test the Full Referral Flow End-to-End
1. Visit `https://thepeptideai.com/r/test-partner` — should redirect to `pureuspeptides.com/?coupon=TESTPARTNER20`
2. Place a test order on pureuspeptides.com using that coupon code
3. Verify:
   - Order appears in PeptideAI's sales_orders with `order_source = 'woocommerce'`
   - Customer contact was created or matched
   - `rep_id` on the order matches test-partner's user_id (`825eb4ec-0742-4220-b30a-235bb82d7f12`)
   - Commission records were created in `commissions` table
   - The partner dashboard shows the order and commission

#### Step 6: WooCommerce Coupon Auto-Apply (Nice-to-Have)
WooCommerce doesn't auto-apply coupons from URL `?coupon=CODE` by default. Check if there's a WooCommerce plugin or if you can add a small PHP snippet to the store's `functions.php`:
```php
// Auto-apply coupon from URL parameter
add_action('wp_loaded', function() {
    if (isset($_GET['coupon']) && !empty($_GET['coupon'])) {
        if (!WC()->cart->has_discount($_GET['coupon'])) {
            WC()->cart->apply_coupon(sanitize_text_field($_GET['coupon']));
        }
    }
});
```
This is optional but makes the UX much better — customers won't have to manually enter the coupon code at checkout.

## Key Technical Details

### Supabase Project
- **Project ID**: `mckkegmkpqdicudnfhor`
- **Org ID** (PureUSPeptide): `33a18316-b0a4-4d85-a770-d1ceb762bd4f`

### Webhook Endpoint
```
https://mckkegmkpqdicudnfhor.supabase.co/functions/v1/woo-webhook?org_id=33a18316-b0a4-4d85-a770-d1ceb762bd4f
```

### How the Webhook Pipeline Works
```
WooCommerce Order Created/Updated
        ↓
WooCommerce fires webhook POST to woo-webhook edge function
        ↓
woo-webhook validates HMAC-SHA256 signature using stored secret
        ↓
Skips: cancelled, refunded, failed, trash statuses
Skips: ping/verification requests
Skips: non-order resources
Skips: orders with no line items
        ↓
Calls importExternalOrder() from _shared/platform-order-sync.ts
        ↓
importExternalOrder():
  1. Dedup check (woo_order_id already exists?)
  2. Find/create contact by email
  3. ATTRIBUTION WATERFALL:
     Layer 1: Match coupon_lines → partner_discount_codes → partner_id → rep_id
     Layer 2: Match customer_email → contacts.email → contacts.assigned_rep_id
  4. Create sales_order with rep_id, order_source='woocommerce'
  5. Auto-create customer account (autoCreateCustomer)
        ↓
If rep_id exists + payment_status is paid/pending_verification:
  → Call process_sale_commission(p_sale_id)
  → Commission records created for rep + upline chain
        ↓
Log to admin_ai_logs + create notification
```

### Other Orgs With Working WooCommerce (for reference)
- **Vireon Peptides** (`6e9e836b-94c0-4d03-8ef6-d25f609cf845`) — `vireonpeptides.com` — has woo orders coming through successfully (orders 6309-6316)
- **Pure Chain Aminos** (`43f77344-4004-45fb-8732-03f3e886d8ae`) — has woo orders 929, 932

### Files That Were Modified (for context if you need to debug)
| File | What Changed |
|------|-------------|
| `api/ref.ts` | External redirect logic + profiles.id→user_id fix |
| `src/lib/feature-registry.ts` | Added `external_referral_links` flag |
| `src/hooks/use-tenant-config.ts` | Added external_store_url, external_store_platform |
| `src/hooks/use-partner-discount-code.ts` | New hook |
| `src/components/partner/ReferralLinkCard.tsx` | External link display |
| `src/pages/admin/Reps.tsx` | Feature flag toggle + external links in Invite Links tab |
| `src/pages/Integrations.tsx` | External Store URL config in WooCommerce section |
| `supabase/functions/woo-webhook/index.ts` | Commission auto-trigger after import |
| `supabase/functions/_shared/platform-order-sync.ts` | Email attribution Layer 2 |
| `supabase/functions/provision-tenant/index.ts` | Seed flag for new orgs |
| `supabase/migrations/20260316_external_referral_network.sql` | DB migration |

### Plan File
The full implementation plan is at: `C:\Users\Owner\.claude\plans\buzzing-puzzling-stonebraker.md`

## Status — ALL TASKS COMPLETE (2026-03-17)

| # | Task | Status |
|---|------|--------|
| 1 | Fix woo_url in tenant_api_keys to pureuspeptides.com | DONE |
| 2 | Re-do WooCommerce OAuth with correct domain (if needed) | DONE (manual keys) |
| 3 | Create webhook on pureuspeptides.com via WooCommerce API/MCP | DONE |
| 4 | Verify webhook secret matches | DONE |
| 5 | Test webhook fires and order imports | DONE — v22 zero-import deployed, WC #304 test order imported |
| 6 | Test full referral flow (link → redirect → order → commission) | DONE — coupon TESTPARTNER20 → partner attributed → $12 commission created |
| 7 | Optional: Add coupon auto-apply PHP snippet | DEFERRED (external store config, not blocking) |
| 8 | Verify order #297 (the test order Justin placed) comes through after webhook is set up | DONE (dedup works) |
| 9 | Run `npm run preflight` to verify no build issues | DONE |
| 10 | Update .agent/ docs with final state | DONE |

## E2E Test Results (2026-03-17)

**Test order**: WC #304, Tirzepatide 10mg x2, $120, coupon TESTPARTNER20
- Order created: `6e795d71-50ad-4f30-81c3-f6ce10bba7d3`
- Partner attributed: `27764e46-6991-4692-880d-0d7937b600f5` (profiles.id, resolved from user_id)
- Commission: `d7ee217a-73b8-4b31-9993-ef884958f73a` — $12.00 (10%), status: pending
- Discount code uses_count incremented correctly

## Critical Bug Fixed: rep_id FK Resolution

`partner_discount_codes.partner_id` stores `profiles.user_id` (auth UUID), but `sales_orders.rep_id` FK references `profiles.id` (profile UUID). These are DIFFERENT values. Fixed in:
- `supabase/functions/_shared/platform-order-sync.ts` — added profiles lookup before setting rep_id
- `supabase/functions/woo-webhook/index.v22-zero-import.ts` — zero-import version with same fix

## Deployment Notes

woo-webhook is deployed as v22 via Composio's `SUPABASE_UPDATE_A_FUNCTION` (zero-import pattern — pure fetch() against REST API, no esm.sh/jsr: imports). This bypasses the `--no-remote` ESZIP restriction. The original `index.ts` with imports is kept as source of truth and also has the FK fix applied for when proper CLI deploy is restored.
