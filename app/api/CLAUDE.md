# app/api/ — route conventions (loads when you edit here)

120 `route.ts` files across ~14 product domains. The annotated per-route map (domain, purpose,
public vs gated, external vendor) lives on the ops architecture page —
`https://swfldatagulf-ops.vercel.app/architecture#routes`. It is a curated snapshot: when you add,
delete, or re-scope a route, that snapshot is stale until regenerated from `app/api/**/route.ts`.

## The two Supabase clients — pick deliberately

- **Default:** `createClient` from `@/utils/supabase/server` (81 routes) — cookie-bound, RLS-enforced.
  Gate with `auth.getUser()` and 401 before touching data.
- **Escalation:** `createServiceRoleClient` from `@/utils/supabase/service-role` (55 routes) —
  bypasses RLS. Only for tables whose RLS policies grant to `service_role`; never importable from
  anything that ships to the browser (the key would leak). It throws at call time when env is
  missing — do not wrap it in a silent fallback.
- The guard that matters is **cross-USER**: a client's own data is always usable by that client.

## Claude calls

Go through `refinery/agents/anthropic.mts` (model constants, spend guards, `logApiUsage`) — never a
bare `@anthropic-ai/sdk` import in a route. Two legacy raw importers exist
(`email/schedule-command/route.ts`, `projects/[id]/action/route.ts`); do not add a third — every
call path carries the spend guard.

## Match what the codebase already does

- `export const runtime = "nodejs"` (98 routes; there are no edge routes today).
- LLM / long-running routes declare `maxDuration` (30–300s).
- `export const dynamic = "force-dynamic"` where a read must never cache.
- Errors return `NextResponse.json({ error … }, { status })` (103 routes) — never thrown HTML.

## Hard lines

- `/api/stripe/webhook` is the ONLY writer of billing tier state.
- `/api/b/*`, `/api/mcp`, `/api/assistant` are the live answer surface — RULE 1 "ask first" applies,
  and `lib/assistant/CLAUDE.md` governs anything they emit (speaker hygiene, no internal IDs,
  four-lane sourcing, plain text).
- A route that emits a SWFL number starts at `docs/standards/data-roots.md` (RULE 0.55) — one root
  per concept, never a second table.
