# Vendor Portal — ThePeptideAI

Vendor = super-admin (PureUSPeptide) managing ALL tenant orgs. Only `role = 'vendor'` users can access. **Most dangerous part of the codebase — bugs here affect ALL tenants.**

## Pages

| File | Purpose |
|------|---------|
| `VendorLayout.tsx` | Shared layout — nav, auth guard (checks `role === 'vendor'`) |
| `VendorDashboard.tsx` | Overview: tenant count, revenue, health |
| `VendorTenants.tsx` | List all orgs, search, filter |
| `TenantDetail.tsx` | Full view of one tenant |
| `TenantConfigEditor.tsx` | Edit branding, shipping, support email |
| `TenantPaymentSetup.tsx` | Configure payment methods (Stripe, Zelle, etc.) |
| `TenantFeatureToggles.tsx` | Enable/disable `org_features` per tenant |
| `TenantSubscriptionActions.tsx` | Upgrade/downgrade/cancel subscription plans |
| `TenantUserList.tsx` | View and manage users within a tenant |
| `TenantWholesaleEditor.tsx` | Configure wholesale pricing tiers |
| `TenantNotes.tsx` | Internal notes (not visible to tenant) |
| `VendorOnboarding.tsx` | Provision a new tenant org |
| `VendorBilling.tsx` | Billing overview across all tenants |
| `VendorAnalytics.tsx` | Cross-tenant analytics |
| `VendorHealth.tsx` | System health, edge function status |
| `VendorAudit.tsx` | Audit log across all tenants |
| `VendorIntegrations.tsx` | Platform-level integration management |
| `VendorMessages.tsx` | Messaging with/about tenants |
| `VendorSupport.tsx` | Support ticket management |
| `VendorSupplyOrders.tsx` | Supplier order management |

## Critical Rule: Target Org ID

```typescript
// ALWAYS pass the TARGET org's ID explicitly
await updateTenantConfig(targetOrgId, { brand_name: 'New Name' })

// NEVER use current user's orgId for tenant mutations
await updateTenantConfig(currentUser.orgId, { ... }) // WRONG — updates YOUR org
```

## Provisioning Flow (provision-tenant edge function)

Exact order — FK dependencies require this sequence:
1. Insert into `organizations`
2. Insert into `profiles` (admin user for new org)
3. Insert into `tenant_config` (branding row)
4. Seed `org_features` (19 feature flags, core ones default ON)
5. Seed `pricing_tiers` (Retail/Partner/VIP)
6. Link to `subscription_plans`

**Don't modify this order.**

## Subscription Changes

`TenantSubscriptionActions.tsx` calls Stripe to change plans.
- Always update `subscription_plans` link in DB after Stripe confirms
- Never set plan directly in DB without Stripe — they'll be out of sync

## Feature Toggle Dependencies

Same as admin portal feature flags — disabling `shipping_labels` while `fulfillment` is ON causes UI errors in FulfillmentCenter. Core features (`client_store`, `order_management`, `fulfillment`) should rarely be disabled.

## Auth Guard

Every vendor page wraps in `VendorLayout.tsx` which checks `role === 'vendor'`. New vendor pages must use the same guard pattern.
