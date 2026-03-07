# Components Directory Map

shadcn/ui primitives live in `ui/` — all business logic components are co-located by domain.
Import paths use the `@/components/` alias configured in `tsconfig.json`.

## Subdirectory Index

| Subdirectory | Files | Purpose | Key Components |
|---|---|---|---|
| `admin/` | 2 | Platform admin views | `PlatformContactCard`, `SetupChecklist` |
| `ai/` | 4 | AI chat interfaces | `AIChatInterface`, `AdminAIChat`, `PartnerAIChat`, `PeptideAIKnowledgePanel` |
| `barcode/` | 1 | Barcode scanning | barcode scanner component |
| `client/` | 2 | Client portal | `ClientInventoryList`, `ClientPortalCard` |
| `contacts/` | 13 | Contact detail views | `ContactDetailsHeader`, `ContactDialogs`, `DigitalFridgeSection`, `RegimensSection` |
| `crm/` | 4 | CRM UI blocks | `AiDemoChat`, `LiveBuildPreview`, `PricingCard` |
| `custom/` | 6 | One-off branded components | miscellaneous custom UI |
| `dashboards/` | 5 | Dashboard widgets | `FavoritesSheet`, `WaterTracker`, `WeeklyCompliance`, `WeeklyTrends` |
| `forms/` | 2 | Reusable form components | form primitives |
| `fulfillment/` | 9 | Order fulfillment workflow | `PickPackTab`, `LabelShipTab`, `FulfillConfirmDialog`, `SmsNotificationCard` |
| `gamified/` | 4 | Gamification / engagement | gamified progress components |
| `landing/` | 25 | Marketing landing page | `Hero`, `Nav`, `Footer`, `Pricing`, `Testimonials`, `Faq` |
| `layout/` | 4 | App shell | `AppLayout`, `ClientLayout`, `Sidebar`, `TopBar` |
| `merchant/` | 1 | Merchant-facing UI | merchant component |
| `messaging/` | 1 | In-app messaging | messaging component |
| `partner/` | 15 | Partner / affiliate portal | `NetworkTree`, `CommissionsSheet`, `EarningsSheet`, `ReferralLinkCard` |
| `payment-pool/` | 7 | NMI payment pool module | `PoolDashboard`, `PoolSetupWizard`, `PoolSettings`, `PoolBalanceCard` |
| `peptides/` | 2 | Peptide product views | peptide detail components |
| `protocol-builder/` | 3 | Protocol creation UI | protocol builder steps |
| `regimen/` | 11 | Client regimen / digital fridge | `DailyProtocol`, `DigitalFridge`, `HealthMetrics`, `SupplyOverview` |
| `resources/` | 1 | Resource library | resource component |
| `store/` | 13 | Storefront / checkout | `ProductGrid`, `CartSummary`, `FloatingCartPill`, `ProtocolBundles` |
| `supplements/` | 1 | Supplement views | supplement component |
| `ui/` | 43 | shadcn/ui primitives + extensions | see note below |
| `wholesale/` | 1 | Wholesale ordering | wholesale component |
| `__tests__/` | 2 | Component tests | — |

## Top-Level Components

These live directly in `src/components/` (not in a subdirectory):

| File | Purpose |
|---|---|
| `ErrorBoundary.tsx` | React error boundary — wraps page-level routes |
| `SectionErrorBoundary.tsx` | Lightweight boundary for individual sections |
| `ProtectedRoute.tsx` | Auth guard — redirects unauthenticated users |
| `RoleBasedRedirect.tsx` | Redirects by user role after login |
| `CommandPalette.tsx` | Global keyboard command palette (Cmd+K) |
| `BugReportButton.tsx` | Floating bug report trigger |

## Conventions

- **shadcn/ui**: Use primitives from `ui/` as building blocks. Compose them; do not rebuild what shadcn provides.
- **Styling**: Tailwind utility classes only. No inline `style={{}}` props.
- **Imports**: Always use the `@/components/` alias. Example: `import { Button } from "@/components/ui/button"`.
- **Domain grouping**: New components belong in the closest domain subdirectory. Create a new subdirectory only if no existing one fits.
- **Types**: Co-locate a `types.ts` in the subdirectory when multiple files share local types (see `store/`, `partner/`, `fulfillment/`).

## `ui/` Subdirectory — shadcn Primitives

`ui/` contains auto-generated shadcn/ui components. **Do not hand-edit these files.**
To add a new primitive: `npx shadcn@latest add <component>`
Custom extensions (e.g., `glass-card.tsx`, `empty-state.tsx`, `status-badge.tsx`) live here too but are project-authored.
