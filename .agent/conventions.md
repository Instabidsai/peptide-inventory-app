# ThePeptideAI — Conventions (Non-Linter Patterns)

## Supabase Import Path
```typescript
// ALWAYS use this — the singleton client with correct project URL
import { supabase } from '@/integrations/sb_client/client'

// NEVER use these (wrong path, different client, or hardcoded)
import { supabase } from '@/lib/supabase'
import { supabase } from 'supabase/client'
```

## Every Query Must Be Org-Scoped
Multi-tenancy is enforced by BOTH RLS and application-level filtering. Never query without `org_id`:
```typescript
const { data } = await supabase.from('peptides').select('*').eq('org_id', orgId)
```

## Edge Function set_config Pattern
Each `execute_sql` call is a separate DB session. Prepend `set_config` in the SAME call for writes:
```sql
SELECT set_config('app.agent_org_id', '<ORG_ID>', true);
INSERT INTO peptides (org_id, name) VALUES ('<ORG_ID>', 'BPC-157');
```
Using `false` (permanent) or separate calls loses the config in the next session.

## tenant_config — Always UPDATE, Never INSERT
Every org has exactly one row created at provisioning. INSERTs violate the unique constraint.

## Edge Function Auth
Every edge function MUST have `config.toml` with `verify_jwt = false`. Auth handled in code via `_shared/auth.ts`. Gateway JWT causes race conditions on token refresh.

## Edge Function Template
```typescript
import { corsHeaders } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { user, orgId } = await authenticate(req)
    // ... logic scoped to orgId
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

## Commission Rate Format
`profiles.commission_rate` is 0-100 (percentage), NOT a decimal. `15` means 15%.

## Feature Flags
Check `useOrgFeatures()` hook before rendering feature-gated UI. If a feature is disabled, hide the component — don't show a broken state.

## Vendor vs Admin
- **Admin** = merchant's own staff managing THEIR business (scoped to their org)
- **Vendor** = super-admin (PureUSPeptide) managing ALL tenant orgs
- When writing vendor code, ALWAYS use `targetOrgId` for tenant mutations, NEVER `currentUser.orgId`

## Crypto Wallet Payments
- Wallets stored as JSONB array `crypto_wallets` on `tenant_config`: `[{id, type, chain, address, label, enabled}]`
- Payment method stored in `sales_orders.payment_method` as `crypto_USDC_SOL` format (prefix + type + chain)
- Fee exemption: `FEE_EXEMPT_METHODS` in `order-profit.ts` + `pm.startsWith('crypto_')` check
- Crypto button only shows at checkout when org has `enabledWallets.length > 0`
- `CryptoWallet` type exported from `use-tenant-config.ts`

## Adding New Features
1. New DB table → migration in `supabase/migrations/` (always `CREATE TABLE IF NOT EXISTS`)
2. Server logic → edge function in `supabase/functions/` (with config.toml)
3. Frontend → `src/components/` or `src/pages/`
4. All queries scoped by `org_id`
5. Feature-flag via `org_features` if toggleable per tenant

## Git Push to Production
```bash
git push origin main:master && git push origin main:main
```
Vercel production branch = `main`. Must push to both remotes.

## View As User (Impersonation) Pattern — JWT-Level Session Swap

**Architecture**: True JWT impersonation via `admin-impersonate` edge function. The Supabase session is fully replaced — no React-context-only tricks.

### How It Works
1. Admin calls `admin-impersonate` edge function with `targetUserId`
2. Edge function mints a real JWT for the target user (service role, admin-only endpoint)
3. `ImpersonationContext.tsx` calls `supabase.auth.setSession({ access_token, refresh_token })` — the entire session is swapped
4. Admin session is backed up to `localStorage` key `admin_session_backup` before swap
5. All edge functions, RLS, and hooks now see the target user's JWT automatically
6. On exit: admin session restored from localStorage, hard reload (`window.location.href = '/admin'`) to flush all in-memory state

### Key Implementation Details
- **localStorage vs sessionStorage**: Admin backup uses `localStorage` so it survives tab refresh while impersonating. Regular impersonation state also stored there.
- **Hard reload on exit**: `window.location.href` (not `navigate()`) forces a full React re-mount, avoiding `RoleBasedRedirect` race conditions from stale context state
- **Orphan detection**: On mount, `ImpersonationContext` checks for a `admin_session_backup` in localStorage with no active impersonation — auto-restores the admin session if found (handles crash/forced-exit recovery)
- **SignOut guard**: `AuthContext.signOut` intercepts calls while impersonating and restores admin session instead of signing out. No double-signout risk.
- **Hooks**: `use-client-profile.ts` and `use-partner.ts` use `user?.id` directly (no `effectiveUserId` — the JWT IS the target user)
- **CORS**: `_shared/cors.ts` includes `localhost:4550` for dev testing
- Feature-flagged via `view_as_user` in org_features (admin/super_admin only)
- Contacts need `linked_user_id` to be impersonatable — button disabled otherwise
- Self-healing RPCs (e.g., `ensure_customer_contact`) must NOT fire when impersonating — check `isViewingAsUser` from `useImpersonation()`

## Test User
`ai_tester@instabids.ai` / `TestAI2026!` (email confirmed, admin role)
