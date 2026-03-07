# src/ — Frontend Architecture Guide

Vite + React 18 + TypeScript SPA. Routing via `HashRouter` (required for Supabase
OAuth token interception in `main.tsx`). All pages lazy-loaded via `lazyRetry()`.
Error monitoring: Sentry. Web vitals reported to DB via auto-error-reporter.

## Directory Map

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `components/` | UI components, layouts, shared widgets | See `components/CLAUDE.md` |
| `hooks/` | TanStack Query data hooks (server state) | See `hooks/CLAUDE.md` |
| `pages/` | Route-level page components | See `pages/CLAUDE.md` |
| `integrations/sb_client/` | Supabase client singleton + generated types | `client.ts`, `types.ts` |
| `lib/` | App-wide utilities and feature infrastructure | `feature-registry.ts`, `edge-functions.ts`, `logger.ts`, `auto-error-reporter.ts` |
| `types/` | TypeScript type definitions | `regimen.ts`, `openfoodfacts.ts` |
| `contexts/` | React context providers | `AuthContext.tsx`, `ImpersonationContext.tsx` |
| `services/` | Business logic services | (service modules) |
| `utils/` | Pure helper functions | `dose-utils.ts`, `chart-utils.ts`, `export-csv.ts`, `nutrition-utils.ts` |
| `data/` | Static data and constants | (static JSON/TS constants) |

## Critical Imports

```ts
// Supabase — ALWAYS import from here, never anywhere else
import { supabase } from '@/integrations/sb_client/client';

// Auth context
import { useAuth } from '@/contexts/AuthContext';

// Edge function caller
import { callEdgeFunction } from '@/lib/edge-functions';
```

**Never** construct a second Supabase client. The singleton in `sb_client/client.ts`
holds the session and org context. A second client will have no session.

## State Management

| State type | Tool | Rule |
|------------|------|------|
| Server / DB data | TanStack Query (`useQuery`, `useMutation`) | All hooks live in `hooks/` |
| Local UI state | `useState` / `useReducer` | Component-local only |
| Global auth/session | `AuthContext` | Never bypass — use `useAuth()` |
| Feature flags | `feature-registry.ts` | Check before rendering gated UI |

## Styling

- Tailwind CSS utility classes only — no inline `style={{}}` objects.
- Component library: shadcn/ui (components in `components/ui/`).
- Custom colors defined in `lib/colors.ts` and `tailwind.config.ts`.
- Never add a new CSS file; extend Tailwind config or use `@apply` in `index.css`.

## Org Scoping Rule

Every Supabase query MUST include `.eq('org_id', orgId)` where `orgId` comes from
`useAuth()`. Missing org scope = data leak across tenants.
