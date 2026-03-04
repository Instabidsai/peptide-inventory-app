# ThePeptideAI — Scope (What This Project Does NOT Do)

## Out of Scope — Never Build These

1. **Direct payment processing** — We integrate with Stripe/PsiFi, never handle card numbers directly
2. **HIPAA compliance** — This is a business tool, not a medical records system. No PHI storage.
3. **Prescription management** — Peptides are research/wellness products. No Rx workflows.
4. **Custom mobile app** — Web-only SPA. Mobile access via responsive browser.
5. **Multi-currency** — USD only. International merchants not supported yet.
6. **Real-time inventory sync** — WooCommerce/Shopify sync is manual trigger or webhook-based, not live.
7. **Custom email templates per tenant** — All transactional emails use standard Resend templates.
8. **White-label domain routing** — All tenants share app.thepeptideai.com. No custom domains.
9. **Offline mode** — Requires internet. No service worker / PWA.
10. **Data export** — No CSV/PDF export features (yet). Data accessed via UI only.

## Boundaries — Where Other Systems Take Over

| Boundary | This App Does | External System Does |
|----------|--------------|---------------------|
| Payment processing | Creates Stripe sessions, tracks status | Stripe handles PCI, card processing |
| E-commerce storefront | Syncs products/customers | WooCommerce/Shopify hosts the store |
| Shipping labels | Calls Shippo API, stores tracking | Shippo handles carrier rates/labels |
| Email delivery | Calls Resend API | Resend handles SMTP/deliverability |
| SMS | Calls Textbelt API | Textbelt handles carrier delivery |
| AI inference | Sends prompts to OpenAI/Anthropic | Models run on their infrastructure |
| Merchant onboarding AI | Routes to agent-api | Python FastAPI on separate Docker |

## Anti-Patterns to Avoid

- **Never skip org_id scoping** — Even "admin-only" queries need org_id. Vendor queries are the exception (they see all orgs).
- **Never INSERT into tenant_config** — Always UPDATE. One row per org, created at provisioning.
- **Never modify sentinel-worker without reading all 2,440 lines** — Phases are interdependent.
- **Never add automation action types in UI without updating run-automations edge function** — They must stay in sync.
- **Never use verify_jwt = true** — Auth is in code, not gateway.
- **Never delete an org without cascading** — profiles, tenant_config, org_features, orders, contacts all have FKs.
