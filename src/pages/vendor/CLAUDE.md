# Vendor Portal — ThePeptideAI
_Agents: update this file when you discover gotchas or change vendor behavior._

## What the Vendor Portal Is
The vendor portal is **super-admin** — it's how PureUSPeptide (us) manages ALL merchant tenants on the platform. Only users with `role = 'vendor'` can access it.

A "vendor" can:
- Provision new tenant orgs
- View/edit any tenant's config, users, billing, features
- See analytics across all tenants
- Access audit logs for any org
- Manage wholesale supply orders

**This is the most dangerous part of the codebase.** A bug here can affect ALL tenants simultaneously.

---

## Pages Reference

| File | Purpose |
|------|---------|
| `VendorLayout.tsx` | Shared layout wrapper — nav, auth guard |
| `VendorDashboard.tsx` | Overview: tenant count, revenue, health |
| `VendorTenants.tsx` | List all orgs, search, filter |
| `TenantDetail.tsx` | Full view of one tenant |
| `TenantConfigEditor.tsx` | Edit branding, shipping, support email |
| `TenantPaymentSetup.tsx` | Configure payment methods (Stripe, Zelle, etc.) |
| `TenantFeatureToggles.tsx` | Enable/disable `org_features` per tenant |
| `TenantSubscriptionActions.tsx` | Upgrade/downgrade/cancel subscription plans |
| `TenantUserList.tsx` | View and manage users within a tenant |
| `TenantWholesaleEditor.tsx` | Configure wholesale pricing tiers |
| `TenantNotes.tsx` | Internal notes about a tenant (not visible to them) |
| `VendorOnboarding.tsx` | Provision a new tenant org |
| `VendorBilling.tsx` | Billing overview across all tenants |
| `VendorAnalytics.tsx` | Cross-tenant analytics |
| `VendorHealth.tsx` | System health, edge function status |
| `VendorAudit.tsx` | Audit log across all tenants |
| `VendorIntegrations.tsx` | Platform-level integration management |
| `VendorMessages.tsx` | Messaging with/about tenants |
| `VendorSupport.tsx` | Support ticket management |
| `VendorSupplyOrders.tsx` | Supplier order management |
| `vendor-shared.tsx` | Shared types, hooks, utilities for vendor pages |

---

## Critical Rules for This Area

### Never Accidentally Mutate Another Org's Data
When writing any vendor-side code that touches tenant data:
```typescript
// ✅ Always pass the TARGET org's ID explicitly
await updateTenantConfig(targetOrgId, { brand_name: 'New Name' })

// ❌ Never use the current user's orgId for tenant mutations
await updateTenantConfig(currentUser.orgId, { ... }) // This would update YOUR org, not theirs
```

### Provisioning Flow (provision-tenant edge function)
When creating a new tenant, the edge function seeds in this exact order:
1. Insert into `organizations`
2. Insert into `profiles` (admin user)
3. Insert into `tenant_config` (branding row)
4. Seed `org_features` (19 feature flags, all default off except core ones)
5. Seed `pricing_tiers` (Retail/Partner/VIP)
6. Link to `subscription_plans`

**Don't modify this order** — there are FK dependencies.

### Subscription Changes
`TenantSubscriptionActions.tsx` calls Stripe to change plans. Always:
- Update `subscription_plans` link in DB after Stripe confirms
- Never set plan directly in DB without Stripe knowing — they'll be out of sync

### Feature Toggles
`TenantFeatureToggles.tsx` writes to `org_features` table. Rules:
- `client_store`, `order_management`, `fulfillment` are core — think twice before disabling
- Some features have dependent features — disabling `shipping_labels` while `fulfillment` is on causes UI errors in FulfillmentCenter

---

## Auth Guard
The vendor layout (`VendorLayout.tsx`) must check `role === 'vendor'` — not just that the user is logged in. If you're adding a new vendor page, always wrap it in the same auth guard pattern used by existing vendor pages.

---

## Agent Notes
_Add gotchas here as you work in this area._
<!-- agents: append findings below with date -->
