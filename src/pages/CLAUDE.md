# Pages & Routes Map — PeptideAI

All routes use HashRouter (`#/path`). Pages load lazily via `lazyRetry()` except Auth, Dashboard, Join, NotFound (eager). Nested vendor routes use `VendorLayout` as parent outlet.

---

## Auth (public — no ProtectedRoute)

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/auth` | `Auth.tsx` | None | `useAuth` | Login / signup form |
| `/join` | `Join.tsx` | None | — | Invite-link account creation |
| `/onboarding` | `Onboarding.tsx` | None | — | New merchant onboarding wizard |
| `/update-password` | `auth/UpdatePassword.tsx` | None | `useAuth` | Password reset after email link |
| `/crm` | `CrmLanding.tsx` | None | — | Public marketing landing page |
| `/get-started` | `GetStarted.tsx` | None | — | Public sign-up funnel |
| `/privacy` | `legal/PrivacyPolicy.tsx` | None | — | Legal: privacy policy |
| `/terms` | `legal/TermsOfService.tsx` | None | — | Legal: terms of service |
| `/status` | `StatusPage.tsx` | None | — | Public system status page |
| `/pay/:orderId` | `pay/PayOrder.tsx` | None | — | Public payment link for order |
| `/pay/:orderId/success` | `pay/PaySuccess.tsx` | None | — | Post-payment confirmation |

---

## Admin Overview (role: admin / staff / sales_rep / fulfillment / super_admin / viewer)

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/` | `Dashboard.tsx` | Any staff role | `useOrg`, `useQuery` | Main admin dashboard (eager-loaded) |
| `/ai` | `AIAssistant.tsx` | Any staff role | `useAI` | In-app AI assistant chat |
| `/setup-assistant` | `SetupAssistant.tsx` | admin | — | Post-onboarding AI setup wizard |
| `/feedback` | `admin/FeedbackHub.tsx` | Any staff role | — | Feedback & feature request hub |
| `/admin-resources` | `AdminResources.tsx` | Any staff role | — | Internal resource library |

---

## Inventory

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/peptides` | `Peptides.tsx` | Any staff role | `usePeptides` | Peptide product catalog |
| `/lots` | `Lots.tsx` | Any staff role | `useLots` | Batch/lot tracking |
| `/bottles` | `Bottles.tsx` | Any staff role | `useBottles` | Individual bottle records |
| `/movements` | `Movements.tsx` | Any staff role | `useMovements` | Inventory movement log |
| `/movements/new` | `MovementWizard.tsx` | Any staff role | `useMovements` | Wizard to record a new movement |

---

## Sales

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/orders` | `Orders.tsx` | Any staff role | `useOrders` | Legacy order list view |
| `/sales` | `sales/OrderList.tsx` | Any staff role | `useOrders` | Primary sales order list |
| `/sales/new` | `sales/NewOrder.tsx` | Any staff role | `useOrders` | Create new order form |
| `/sales/:id` | `sales/OrderDetailsV2.tsx` | Any staff role | `useOrder` | Order detail & edit view |

---

## People

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/contacts` | `Contacts.tsx` | Any staff role | `useContacts` | Contact/client list |
| `/contacts/:id` | `ContactDetails.tsx` | Any staff role | `useContact` | Individual contact detail |
| `/protocols` | `Protocols.tsx` | Any staff role | `useProtocols` | Protocol library |
| `/protocol-builder` | `ProtocolBuilder.tsx` | Any staff role | `useProtocols` | Visual protocol builder |

---

## Fulfillment

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/fulfillment` | `FulfillmentCenter.tsx` | Any staff role | `useFulfillment` | Pack/ship queue |

---

## Admin Settings

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/settings` | `Settings.tsx` | Any staff role | `useOrg` | Org & user settings |
| `/integrations` | `Integrations.tsx` | Any staff role | — | WooCommerce/Shopify/Stripe config |
| `/customizations` | `Customizations.tsx` | Any staff role | — | Custom fields & entity builder |
| `/custom/:entitySlug` | `components/custom/CustomEntityPage` | Any staff role | — | Dynamic custom entity page |
| `/reports/:reportId` | `components/custom/CustomReportView` | Any staff role | — | Dynamic custom report view |
| `/admin/reps` | `admin/Reps.tsx` | admin | — | Sales rep management |
| `/admin/partners/:id` | `admin/PartnerDetail.tsx` | admin | — | Individual partner detail |
| `/admin/commissions` | `admin/Commissions.tsx` | admin | — | Commission dashboard |
| `/admin/finance` | `admin/Finance.tsx` | admin | — | Revenue & finance reports |
| `/admin/automations` | `admin/Automations.tsx` | admin | — | Workflow automation rules |
| `/admin/supplements` | `admin/AdminSupplements.tsx` | admin | — | Supplement catalog management |
| `/admin/features` | `admin/FeatureManagement.tsx` | admin | — | Feature flag toggles per org |
| `/admin/billing` | `admin/BillingHistory.tsx` | admin | — | Subscription billing history |
| `/admin/payment-pool` | `admin/PaymentPool.tsx` | admin | `usePaymentPool` | USDC pool setup & dashboard |
| `/platform-support` | `admin/PlatformSupport.tsx` | admin | — | Support ticket interface |

---

## Partner Portal (role: sales_rep)

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/partner` | `partner/PartnerDashboard.tsx` | sales_rep | `usePartner` | Partner earnings & downline |
| `/partner/store` | `partner/PartnerStore.tsx` | sales_rep | — | Partner-facing product store |
| `/partner/orders` | `partner/PartnerOrders.tsx` | sales_rep | `useOrders` | Partner's own order history |

---

## Client Portal (role: client / customer — uses ClientLayout)

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/dashboard` | `client/ClientDashboard.tsx` | client | `useClientData` | Client home dashboard |
| `/my-regimen` | `client/ClientRegimen.tsx` | client | `useRegimen` | Assigned peptide protocol |
| `/messages` | `client/ClientMessages.tsx` | client | `useMessages` | Messaging with practitioner |
| `/notifications` | `client/ClientNotifications.tsx` | client | — | Client notification feed |
| `/resources` | `client/ClientResources.tsx` | client | — | Educational resources |
| `/account` | `client/ClientSettings.tsx` | client | `useProfile` | Client account settings |
| `/macro-tracker` | `client/MacroTracker.tsx` | client | — | Nutrition macro logging |
| `/body-composition` | `client/BodyComposition.tsx` | client | — | Body metrics & progress |
| `/community` | `client/CommunityForum.tsx` | client | — | Community forum |
| `/store` | `client/ClientStore.tsx` | client | — | Client-facing product store |
| `/my-orders` | `client/ClientOrders.tsx` | client | `useOrders` | Client order history |
| `/checkout/success` | `checkout/CheckoutSuccess.tsx` | client | — | Post-purchase confirmation |
| `/checkout/cancel` | `checkout/CheckoutCancel.tsx` | client | — | Cancelled checkout screen |
| `/menu` | `client/ClientMenu.tsx` | client | — | Mobile menu / nav hub |
| `/health` | `client/HealthTracking.tsx` | client | — | Health metrics dashboard |

---

## Vendor Portal (role: super_admin — nested under /vendor with VendorLayout outlet)

| Route Path | Page File | Role Required | Key Hooks | Description |
|---|---|---|---|---|
| `/vendor` | `vendor/VendorDashboard.tsx` | super_admin | `useVendor` | Super-admin home (index route) |
| `/vendor/tenants` | `vendor/VendorTenants.tsx` | super_admin | — | All tenant orgs list |
| `/vendor/tenant/:orgId` | `vendor/TenantDetail.tsx` | super_admin | — | Per-tenant detail & config |
| `/vendor/supply-orders` | `vendor/VendorSupplyOrders.tsx` | super_admin | — | Cross-tenant supply orders |
| `/vendor/analytics` | `vendor/VendorAnalytics.tsx` | super_admin | — | Platform-wide analytics |
| `/vendor/billing` | `vendor/VendorBilling.tsx` | super_admin | — | Subscription billing mgmt |
| `/vendor/system-health` | `vendor/VendorHealth.tsx` (SystemHealth) | super_admin | — | System health monitor |
| `/vendor/support` | `vendor/VendorSupport.tsx` | super_admin | — | Cross-tenant support tickets |
| `/vendor/onboarding` | `vendor/VendorOnboarding.tsx` | super_admin | — | New tenant provisioning |
| `/vendor/messages` | `vendor/VendorMessages.tsx` | super_admin | — | Platform-wide messaging |
| `/vendor/audit` | `vendor/VendorAudit.tsx` | super_admin | — | Audit log viewer |
| `/vendor/settings` | `vendor/VendorSettings.tsx` | super_admin | — | Vendor-level platform settings |
| `/vendor/integrations` | `vendor/VendorIntegrations.tsx` | super_admin | — | Platform integration config |

---

## Conventions

**ProtectedRoute**: Wraps both the admin (`AppLayout`) and client (`ClientLayout`) layout groups. Any unauthenticated access redirects to `/auth`.

**Role-based routing**: `RoleBasedRedirect` sits inside `ProtectedRoute`. It inspects `user.role` and either renders children or redirects — client/customer roles are sent to `/dashboard`, staff roles to `/`. Individual sensitive admin routes wrap their page in a second `RoleBasedRedirect allowedRoles={['admin']}`.

**Layouts**: Admin/staff share `AppLayout`. Clients share `ClientLayout`. Vendor routes nest inside `VendorLayout` as a React Router outlet (child routes render into the outlet slot). Public pages have no layout wrapper.

**Lazy loading**: All pages except `Auth`, `Dashboard`, `Join`, `NotFound` use `lazyRetry()` which catches stale-chunk errors and reloads the page once within a 30-second cooldown window.

**Top-level files** (no subdirectory): `AIAssistant`, `AdminResources`, `Auth`, `Bottles`, `ContactDetails`, `Contacts`, `Customizations`, `Dashboard`, `FulfillmentCenter`, `Integrations`, `Join`, `Lots`, `MovementWizard`, `Movements`, `NotFound`, `Onboarding`, `Orders`, `Peptides`, `ProtocolBuilder`, `Protocols`, `Settings`, `SetupAssistant`, `StatusPage`, `CrmLanding`, `GetStarted`.

**Subdirectory pages**: `admin/`, `auth/`, `checkout/`, `client/`, `legal/`, `partner/`, `pay/`, `sales/`, `vendor/`.

**Redirects**: `/merchant-onboarding` → `/onboarding`, `/requests` → `/feedback`, `/admin/health` → `/vendor/system-health`.
