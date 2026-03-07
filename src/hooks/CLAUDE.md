# Hooks Directory — TanStack Query Data Layer

All hooks here use `@tanstack/react-query` (`useQuery` / `useMutation`) over Supabase. Every query is org-scoped via `profile.org_id` from `useAuth()`. Import path: `@/hooks/<hook-file>`.

---

## Inventory

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-peptides.ts` | `usePeptides`, `usePeptide`, `useActivePeptides`, `useCreatePeptide`, `useUpdatePeptide`, `useDeletePeptide` | `peptides`, `lots`, RPC `get_peptide_stock_counts` | `['peptides', org_id, page, pageSize]` | Yes | Catalog with stock counts + avg cost aggregation |
| `use-lots.ts` | `useLots`, `useLot`, `useCreateLot`, `useUpdateLot`, `useDeleteLot` | `lots` | `['lots', org_id]` | Yes | Received inventory batches with cost tracking |
| `use-bottles.ts` | `useBottles`, `useBottleStats`, `useUpdateBottleStatus` | `bottles` | `['bottles', org_id]` | Yes | Individual vial/bottle records (status: in_stock/sold/used) |
| `use-update-bottle-quantity.ts` | `useUpdateBottleQuantity` | `bottles`, `lots` | — | Yes (mutation only) | Adjusts bottle quantity on a lot |
| `use-vial-actions.ts` | `useVialActions` | `bottles`, `movements` | — | Yes (mutation only) | Marks vials as used/returned/destroyed |
| `use-movements.ts` | `useMovements`, `useCreateMovement` | `movements`, `movement_items` | `['movements', org_id]` | Yes | Inventory movements (fulfillment, adjustments) |
| `use-restock.ts` | `useRestockSuggestions` | `peptides`, `bottles`, `lots` | `['restock', org_id]` | No | Calculates which peptides need reordering |
| `use-supplements.ts` | `useSupplements`, `useCreateSupplement`, `useUpdateSupplement`, `useDeleteSupplement` | `supplements` | `['supplements', org_id]` | Yes | Non-peptide supplement catalog |
| `use-inventory-owner.ts` | `useInventoryOwner` | `profiles`, `org_features` | `['inventory-owner', org_id]` | No | Resolves who owns/manages inventory |

## Sales / Orders

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-orders.ts` | `useOrders`, `usePendingOrders`, `usePendingOrdersCount`, `usePendingOrderValue`, `usePendingOrderFinancials`, `usePendingOrdersByPeptide`, `useCreateOrder`, `useUpdateOrder`, `useMarkOrderReceived`, `useCancelOrder`, `useDeleteOrder`, `useRecordOrderPayment` | `orders`, `lots`, `bottles`, `expenses` | `['orders', status?, org_id, isSuperAdmin]` | Yes | Purchase orders from suppliers; mark-received creates lot + bottles |
| `use-sales-orders.ts` | `useSalesOrders`, `useSalesOrder`, `useCreateSalesOrder`, `useUpdateSalesOrder`, `useFulfillSalesOrder`, `useRecordSalesPayment`, `useGetShippingRates`, `useBuyShippingLabel` | `sales_orders`, `order_items`, `order_payments`, `movements` | `['sales_orders', org_id, page, pageSize]` | Yes | Customer-facing orders; includes Shippo shipping label flow |
| `use-order-items.ts` | `useOrderItems`, `useAddOrderItem`, `useUpdateOrderItem`, `useDeleteOrderItem` | `order_items` | `['order-items', orderId]` | Yes | Line items on a sales order |
| `use-payment-queue.ts` | `usePaymentQueue`, `useProcessPayment`, `useRetryPayment` | `payment_queue` | `['payment-queue', org_id]` | Yes | NMI payment queue management |

## People / Contacts

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-contacts.ts` | `useContacts`, `useContact`, `useCreateContact`, `useUpdateContact`, `useDeleteContact` | `contacts`, `sales_orders` | `['contacts', type?, org_id, page, pageSize]` | Yes | CRM contacts; sales_rep role sees only downline via RPC `get_partner_downline` |
| `use-contact-notes.ts` | `useContactNotes`, `useCreateContactNote`, `useDeleteContactNote` | `contact_notes` | `['contact-notes', contactId]` | Yes | Free-text notes attached to a contact |
| `use-profiles.ts` | `useProfiles`, `useProfile`, `useUpdateProfile` | `profiles` | `['profiles', org_id]` | Yes | Auth user profile records |
| `use-household.ts` | `useHousehold`, `useHouseholdMembers`, `useAddHouseholdMember` | `households`, `household_members` | `['household', contactId]` | Yes | Family/household groupings for contacts |
| `use-invite.ts` | `useCreateInvite`, `useAcceptInvite` | `invites` | — | Yes (mutations only) | Generates and accepts contact invite links |

## Finance

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-financials.ts` | `useFinancialMetrics` | `sales_orders`, `expenses`, `commissions`, `lots`, `bottles`, `movements` | `['financial-metrics', org_id, dateRange]` | No | Aggregated P&L metrics (revenue, COGS, commissions, profit) |
| `use-expenses.ts` | `useExpenses`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense` | `expenses` | `['expenses', org_id]` | Yes | Overhead and COGS expense tracking |
| `use-payment-pool.ts` | `usePaymentPool`, `usePoolSetup` | `payment_pools` | `['payment-pool', org_id]` | Yes | USDC merchant pool setup + status |
| `use-pool-balance.ts` | `usePoolBalance` | edge fn `pool-sync-balance` | `['pool-balance', org_id]` | No | Real-time USDC pool balance |
| `use-pool-transactions.ts` | `usePoolTransactions` | `pool_transactions` | `['pool-transactions', org_id]` | No | Pool deposit/release history |
| `use-deploy-pool.ts` | `useDeployPool` | edge fn `pool-sign-release` | — | Yes (mutation only) | Signs + submits on-chain pool release |
| `use-subscription.ts` | `useSubscription`, `useUpgradeSubscription` | `subscriptions`, Stripe edge fn | `['subscription', org_id]` | Yes | Stripe subscription tier management |
| `use-wholesale-pricing.ts` | `useWholesalePricing`, `useUpdateWholesalePrice` | `wholesale_prices` | `['wholesale-pricing', org_id]` | Yes | Tiered wholesale price overrides |

## Partner / Commissions

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-partner.ts` | `usePartnerDownline`, `usePartnerContact`, `useAllOrgReps`, `useFullNetwork`, `useCommissions`, `useMarkCommissionPaid`, `useCreatePartnerOrder` | `profiles`, `contacts`, `commissions`, `sales_orders`, RPC `get_partner_downline` | `['partner_downline', rootId]`, `['commissions', partnerId]` | Yes | Multi-level partner tree + commission management |
| `use-commissions.ts` | `useOrderCommissions` | `commissions` | `['order_commissions', orderId]` | No | Commission records for a specific sales order |
| `use-automations.ts` | `useAutomations`, `useCreateAutomation`, `useUpdateAutomation`, `useDeleteAutomation` | `automations` | `['automations', org_id]` | Yes | Trigger-based automation rules (e.g., auto-assign reps) |

## Client Portal

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-protocols.ts` | `useProtocols`, `useProtocol`, `useCreateProtocol`, `useUpdateProtocol`, `useDeleteProtocol` | `protocols`, `protocol_items` | `['protocols', org_id]` | Yes | Treatment protocols assigned to clients |
| `use-protocol-builder.ts` | `useProtocolBuilder` | `protocols`, `protocol_items`, `peptides` | `['protocol-builder', protocolId]` | Yes | Stateful builder for constructing protocols |
| `use-org-protocol-templates.ts` | `useOrgProtocolTemplates`, `useCreateTemplate` | `protocol_templates` | `['protocol-templates', org_id]` | Yes | Reusable org-level protocol templates |
| `use-client-profile.ts` | `useClientProfile`, `useUpdateClientProfile` | `client_profiles` | `['client-profile', contactId]` | Yes | Health/wellness profile for a client contact |
| `use-onboarding-pipeline.ts` | `useOnboardingPipeline`, `useAdvanceOnboarding` | `onboarding_pipeline` | `['onboarding-pipeline', org_id]` | Yes | Tracks client onboarding step progress |

## Vendor (Super-Admin / Multi-Tenant)

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-tenants.ts` | `useTenants`, `useProvisionTenant`, `useDeactivateTenant` | `organizations`, `profiles`, `peptides`, `orders` via edge fn | `['vendor-tenants']` | Yes | Super-admin view of all tenant orgs (role guard: `super_admin` only) |
| `use-tenant-detail.ts` | `useTenantDetail` | `organizations`, `profiles`, `subscriptions` | `['tenant-detail', orgId]` | No | Single tenant deep-dive |
| `use-tenant-config.ts` | `useTenantConfig`, `useUpdateTenantConfig` | `tenant_config` | `['tenant-config', org_id]` | Yes | Branding/config per tenant — always UPDATE, never INSERT |
| `use-tenant-theme.ts` | `useTenantTheme` | `tenant_config` | `['tenant-theme', org_id]` | No | Reads brand colors/logo for theming |
| `use-tenant-connections.ts` | `useTenantConnections` | `tenant_connections` | `['tenant-connections', org_id]` | Yes | WooCommerce/Shopify integration credentials |
| `use-tenant-invoices.ts` | `useTenantInvoices`, `useCreateTenantInvoice` | `tenant_invoices` | `['tenant-invoices', org_id]` | Yes | Platform billing invoices to tenant merchants |
| `use-tenant-wholesale-prices.ts` | `useTenantWholesalePrices`, `useSetTenantWholesalePrice` | `tenant_wholesale_prices` | `['tenant-wholesale-prices', org_id]` | Yes | Vendor-set wholesale prices for a specific tenant |
| `use-subdomain-tenant.tsx` | `useSubdomainTenant` | `tenant_config` | `['subdomain-tenant', hostname]` | No | Resolves org from current subdomain (runs unauthenticated) |
| `use-vendor-analytics.ts` | `useVendorAnalytics` | `sales_orders`, `organizations` | `['vendor-analytics']` | No | Cross-tenant revenue analytics for vendor |
| `use-vendor-audit.ts` | `useVendorAudit` | `audit_logs` | `['vendor-audit']` | No | Audit trail viewer (super_admin only) |
| `use-vendor-messages.ts` | `useVendorMessages`, `useSendVendorMessage` | `vendor_messages` | `['vendor-messages', org_id]` | Yes | Vendor-to-tenant messaging |
| `use-vendor-support.ts` | `useVendorSupport`, `useCreateSupportTicket` | `support_tickets` | `['vendor-support', org_id]` | Yes | Tenant support ticket system |

## Config / Tenancy

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-org-features.ts` | `useOrgFeatures` (returns `features`, `isEnabled`, `toggleFeature`, `isLoaded`) | `org_features` | `['org-features', org_id]` | Yes (optimistic upsert) | Feature flag resolution merged with `FEATURE_REGISTRY` defaults |
| `use-tier-config.ts` | `useTierConfig` | `tier_config` | `['tier-config', org_id]` | No | Partner tier commission rate configuration |
| `use-custom-fields.ts` | `useCustomFields`, `useCreateCustomField`, `useUpdateCustomField`, `useDeleteCustomField` | `custom_fields` | `['custom-fields', org_id, entity]` | Yes | Org-defined extra fields on entities |
| `use-custom-entities.ts` | `useCustomEntities`, `useUpsertCustomEntity` | `custom_entity_values` | `['custom-entities', entityType, entityId]` | Yes | Values for custom fields on a record |
| `use-custom-dashboard.ts` | `useCustomDashboard`, `useUpdateDashboard` | `dashboard_config` | `['dashboard-config', org_id]` | Yes | Saved dashboard widget layout per org |
| `use-supplier-catalog.ts` | `useSupplierCatalog`, `useImportFromCatalog` | `supplier_catalog` | `['supplier-catalog']` | Yes | Public supplier product catalog for import |

## AI

| Hook File | Exports | Table(s) Queried | Query Key Pattern | Has Mutations? | Description |
|-----------|---------|-----------------|-------------------|----------------|-------------|
| `use-ai.ts` | `useAIChat`, `useSendMessage`, `useClearChat` | `ai_conversations`, edge fn `ai-chat` | `['ai-chat', org_id, conversationId]` | Yes | Main admin AI chat (streaming via edge function) |
| `use-admin-ai.ts` | `useAdminAI` | edge fn `admin-ai` | — | Yes (mutation only) | AI assistant for admin-level operations |
| `use-partner-ai.ts` | `usePartnerAI` | edge fn `partner-ai` | — | Yes (mutation only) | AI chat variant for partner/sales_rep role |
| `use-ai-knowledge.ts` | `useAIKnowledge`, `useAddKnowledgeEntry`, `useDeleteKnowledgeEntry` | `ai_knowledge` | `['ai-knowledge', org_id]` | Yes | Org-specific knowledge base injected into AI context |
| `use-protocol-knowledge.ts` | `useProtocolKnowledge` | `protocol_knowledge` | `['protocol-knowledge', org_id]` | No | Protocol-specific AI knowledge entries |
| `use-onboarding-chat.ts` | `useOnboardingChat`, `useSendOnboardingMessage` | edge fn `onboarding-chat` | — | Yes (mutation only) | Guided onboarding AI chat flow |

## UI Utilities

| Hook File | Exports | Notes |
|-----------|---------|-------|
| `use-toast.ts` | `useToast`, `toast` | Radix/shadcn toast state management — no Supabase calls |
| `use-pagination.ts` | `usePagination`, `DEFAULT_PAGE_SIZE`, `PaginationState` | Page/pageSize state helper used across list hooks |
| `use-sortable-table.ts` | `useSortableTable` | Column sort state (key + direction) |
| `use-mobile.tsx` | `useIsMobile` | Window width breakpoint detector (< 768px) |
| `use-page-title.ts` | `usePageTitle` | Sets `document.title` reactively |

---

## Conventions

**Query key format**: `[entity, ...scope, ...filters]` — always include `org_id` (or `isSuperAdmin`) as the second element so cache is partitioned by org. Single-record fetches use `[entity, id, org_id]`.

**Org scoping**: Every Supabase query MUST call `.eq('org_id', profile.org_id)`. The only exceptions are `use-subdomain-tenant.tsx` (unauthenticated hostname lookup) and `use-tenants.ts` / vendor hooks (super_admin cross-org queries).

**`enabled` guard**: All queries that need auth use `enabled: !!user && !!profile?.org_id`. Single-record hooks additionally check `!!id`.

**Mutation invalidation**: After any mutation, call `queryClient.invalidateQueries({ queryKey: ['entity'] })` with the root key to bust all variants. Cross-domain mutations (e.g., `useMarkOrderReceived`) invalidate multiple keys (`orders`, `lots`, `bottles`).

**Optimistic updates**: Only `use-org-features.ts` uses `queryClient.setQueryData` for optimistic UI; all others rely on invalidation.

**Import paths**: `@/hooks/use-<name>` — never use relative paths.

**staleTime defaults**: 30s for lists, 2min for expensive aggregations (peptides with stock), 60s for feature flags and reference data.
