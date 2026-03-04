# Client Portal — ThePeptideAI

All under `src/pages/client/`. Accessible to `role = 'client'` or `role = 'customer'`. Uses `allowedRoles={['client', 'customer']}` in route guards.

## Pages

| File | Purpose | Key Tables |
|------|---------|------------|
| `ClientDashboard.tsx` | Overview — active protocols, notifications | `protocols`, `notifications` |
| `ClientRegimen.tsx` | Active treatment protocols with adherence | `protocols`, `protocol_items`, `protocol_logs` |
| `ClientStore.tsx` | Buy peptides (gated by `client_store` feature) | `peptides`, `pricing_tiers` |
| `ClientOrders.tsx` | Order history | `orders`, `order_items` |
| `ClientMessages.tsx` | Messaging with admin/staff | `partner_chat_messages` |
| `ClientResources.tsx` | Educational content | `resources` |
| `ClientSettings.tsx` | Profile settings | `profiles` |
| `HealthTracking.tsx` | Daily health logging | `client_daily_logs` |
| `BodyComposition.tsx` | Weight, body fat, muscle mass tracking | `body_composition_logs` |
| `MacroTracker.tsx` | Nutrition/meal tracking | `meal_logs`, `favorite_foods` |
| `CommunityForum.tsx` | Discussion forum | `discussion_topics`, `discussion_messages` |
| `ClientNotifications.tsx` | In-app notifications | `notifications` |
| `WaterTracker.tsx` | Hydration tracking | `water_logs` |

## Related Edge Functions

| Function | Purpose |
|----------|---------|
| `chat-with-ai` | Client-facing AI (RAG over peptide knowledge base) |
| `analyze-food` | Food image → nutrition data extraction |
| `process-health-document` | PDF/doc → health data extraction |

## Checkout Flow

```
ClientStore → /checkout/payment → /checkout/confirmation
```
- Payment via Stripe session OR manual (Zelle/Venmo/CashApp)
- Manual payments matched by `check-payment-emails` edge function
- Order creates contact record if not exists

## Health Tracking Subsystem

Client tracks: daily logs, body composition, macros, water, supplement adherence, protocol compliance.

All health data is org-scoped — a client's health data belongs to the merchant's org, not a global pool.

## Protocol Adherence

Protocols assigned by admin via `ProtocolBuilder.tsx`. Client sees in `ClientRegimen.tsx`. Logging adherence writes to `protocol_logs`. Gamified compliance tracking in `components/gamified/`.
