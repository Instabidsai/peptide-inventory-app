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

## Test User
`ai_tester@instabids.ai` / `TestAI2026!` (email confirmed, admin role)
