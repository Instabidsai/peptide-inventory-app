# Integrations — ThePeptideAI

## WooCommerce (Primary E-Commerce)

Most peptide businesses use WordPress/WooCommerce. Full bidirectional sync.

### Edge Functions (6)
| Function | Purpose |
|----------|---------|
| `woo-connect` | OAuth flow to connect store |
| `woo-callback` | OAuth callback |
| `woo-manual-connect` | Manual API key connection |
| `woo-webhook` | Receives order/product events |
| `woo-sync-products` | Manual product catalog sync → `peptides` |
| `woo-sync-customers` | Customer import → `contacts` (match by email, case-insensitive) |

### Connection stored in
`tenant_connections` table: `platform = 'woocommerce'`, `access_token`, `shop_url`

## Shopify (via Composio)

Shopify app review takes weeks — Composio provides instant OAuth without app listing.

### Edge Functions (3 + 2 Composio)
| Function | Purpose |
|----------|---------|
| `shopify-webhook` | Receives Shopify order/product events |
| `shopify-sync-products` | Sync catalog → `peptides` |
| `shopify-sync-customers` | Import customers → `contacts` |
| `composio-connect` | Initiates Composio OAuth for Shopify |
| `composio-callback` | Callback + auto-registers `orders/create` and `orders/updated` webhooks |

### Discount Code Sync (Shopify)
Two-step: create `priceRule` first, then create discount code under it. Composite ID: `"shopify:456"`.

## Stripe (Payments & Subscriptions)

### API Routes (Vercel serverless)
| Route | Purpose |
|-------|---------|
| `api/billing/` | Subscription management (create, update, cancel) |
| `api/checkout/` | Payment session creation |
| `api/webhooks/stripe.ts` | Stripe webhook handler |

### Subscription Tiers
Free / Starter / Professional / Enterprise — stored in `subscription_plans`. Plan changes must sync Stripe ↔ DB.

## Shippo (Shipping)

| Route | Purpose |
|-------|---------|
| `api/shipping/` | USPS/FedEx/UPS label generation via Shippo API |

Labels linked to orders. Tracking numbers stored in `orders.tracking_number`.

## PsiFi (Alternative Payments)

| Route | Purpose |
|-------|---------|
| `api/webhooks/psifi.ts` | PsiFi payment webhook |

## Textbelt / SMS

| Function | Purpose |
|----------|---------|
| `sms-webhook` | Inbound SMS handler |
| `textbelt-webhook` | Textbelt delivery callbacks |
| `telegram-webhook` | Telegram bot integration |

## Discount Code Platform Sync

```
Admin creates code for partner
  → partner_discount_codes table
  → sync-discount-codes edge function
  → WooCommerce: creates coupon via REST API
  → Shopify: priceRule → discount code (two-step)
  → platform_coupon_id = "woo:123,shopify:456"
```

Customer uses code on external store → webhook → order created → code matched to partner → commission attributed.

## Customer Sync Pattern

Both `woo-sync-customers` and `shopify-sync-customers`:
- Match by email (case-insensitive)
- Only update existing contacts if new data is richer (has phone/address/name when existing doesn't)
- Never overwrite richer data with blanks

## Composio Response Handling

`extractCustomers()` and `extractProducts()` helpers handle multiple response formats from Composio API: `data.customers`, `response_data.customers`, etc.

## Connection Management

All connections stored in `tenant_connections`:
- `org_id`, `platform`, `access_token`, `refresh_token`, `shop_url`, `connected_at`
- Managed via `Integrations.tsx` page
