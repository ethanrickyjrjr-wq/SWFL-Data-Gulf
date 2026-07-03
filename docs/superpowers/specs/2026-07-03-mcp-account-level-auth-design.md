# MCP project auth — account-level token + guarded project resolution

**Date:** 2026-07-03 · **Slug:** `mcp-account-level-auth` · **Area:** `app/api/mcp`, `app/api/projects`, `app/api/account` (new), `lib/identity`
**Status:** Design approved (Ricky, 07/03/2026). No code yet — this is the spec a fresh Claude turns into an implementation plan.

## Problem

Today each project mints its own `mcp_key` (`app/api/projects/[id]/mcp-key/route.ts`), and the user's MCP client
sends it as `X-Project-Key`. `resolveProjectByKey` (`app/api/mcp/project-tools.ts`) resolves that key to exactly
one project — by design, no tool argument can ever name a different project (LB-R6b). That means connecting a
second project means minting a second key and re-editing `.mcp.json` — confirmed live in this session: Ricky set a
bearer token as a Vercel env var expecting it to wire this up, and it didn't, because the deployed app's env vars
have nothing to do with a per-project capability key that lives in `projects.mcp_key` and is pasted into the local
MCP client config by hand. For an account expected to hold more than one project, that reconnect tax is real
friction with no corresponding benefit — Ricky is the only holder of his own key, so the isolation the per-project
design buys (a leak only exposes one project) isn't worth an entire re-auth step every time a project is added.

## Goal

Connect once. One account-level credential in `.mcp.json`, every project automatically reachable by name — never by
guessing. The model resolves which project a request targets from what's already in the conversation (a name, a
partial name, or nothing), and the moment that resolution is even slightly ambiguous, the system MUST stop and ask
rather than write to the wrong project. That refusal is enforced in code, not just prompted for.

## Vendor-surface research (crawl4ai, modelcontextprotocol.io/specification/2025-06-18/basic/authorization, 07/03/2026 — RULE 0.4 evidence)

MCP's own authorization spec binds an OAuth 2.1 access token to the **canonical URI of the MCP server as a whole**
(RFC 8707 resource indicators) — there is no protocol-level concept of a token scoped to a sub-resource like one
project. Per-entity scoping is explicitly left to the application layer: the server validates the token identifies
a principal, then tool arguments + server-side ownership checks decide what that principal can touch. This matches
how the GitHub and Notion MCP connections already active in this session behave (one connection; tools take a
repo/page identifier; the server checks you own it) — it's the standard pattern, and our per-project-key design is
stricter than the norm. Full OAuth 2.1 (dynamic client registration, authorization code + PKCE, token refresh) is
more machinery than this needs: our existing header-based key already works end-to-end (proven — the SDK's
`mcp-handler` transport forwards `X-Project-Key` into `extra.requestInfo.headers` today), so the account-level
version keeps the same static-header mechanism, just widens what the header authorizes.

## Architecture

Replace the per-project `mcp_key` column with one row per user in a new `public.user_mcp_tokens` table. The token
travels as `X-Account-Key` (renamed from `X-Project-Key` to stop implying single-project scope). `.mcp.json` is
configured exactly once, ever, per machine. Project selection happens per tool call via an optional `project`
argument and a deterministic, code-enforced resolution order — never a model guess.

## Components

**`public.user_mcp_tokens`** (new table, mirrors the existing `projects` RLS-owner pattern):
```sql
CREATE TABLE public.user_mcp_tokens (
  user_id    uuid PRIMARY KEY,
  token      text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: owner-scoped FOR ALL using auth.uid() = user_id, same as projects_owner_all.
-- anon: no access. authenticated: owner row only (via RLS). service_role: full (MCP lookup lane).
```

**`app/api/account/mcp-token/route.ts`** (new, replaces `app/api/projects/[id]/mcp-key/route.ts`):
POST mints/regenerates (upsert on `user_id`, regenerate overwrites `token` = old value instantly stops matching =
revoke), DELETE clears it. Ownership proven the same way as today: the cookie-session client's `auth.uid()`, RLS
does the rest — no manual ownership check needed beyond what RLS already enforces.

**`app/settings/mcp/page.tsx`** (new, alongside the existing `app/settings/mls/page.tsx` pattern): one panel, ever.
Same copy-paste snippet UX as today's `ConnectMcpBlock.tsx` (client-specific JSON for Claude Desktop / Cursor /
Cline / Windsurf / other), just pointed at the account-level mint route and using the `X-Account-Key` header name.
The per-project `ConnectMcpBlock.tsx` on `app/project/[id]/workspace/` is deleted — there is nothing left to connect
per-project.

**`app/api/mcp/project-tools.ts`** — the core change:
- `resolveProjectByKey` → `resolveUserByToken(db, token): Promise<{ user_id: string } | null>` — looks up
  `user_mcp_tokens` by `token`, returns the owning `user_id` or null (absent/revoked).
- `authorize()` reads `X-Account-Key`, resolves to a `user_id`. `NO_KEY` / `INVALID_KEY` error text updated to
  reference the account-level settings page instead of a per-project panel.
- New shared resolver `resolveProject(db, user_id, projectArg?: string)`:
  1. Load every `{ id, title }` row where `projects.user_id = user_id`.
  2. If `projectArg` is absent, or matches nothing, or matches more than one project at every tier below → return
     `{ needsDisambiguation: true, candidates }` (candidates = the full owned list on empty/no-arg, or just the
     matched set on a genuine multi-match).
  3. Else try, in order, stopping at the first tier that yields **exactly one** match: (a) exact `id` equality,
     (b) exact `title` equality case-insensitive, (c) `title` case-insensitive **prefix** match, (d) `title`
     case-insensitive **substring** match. First tier with exactly one hit wins; a tier with 2+ hits is itself
     treated as ambiguous — it does NOT fall through to a laxer tier, since a looser match compounds the ambiguity
     rather than resolving it.
  4. Else → `{ project }` (the single resolved row).
- `swfl_project_list`, `swfl_project_add`, `swfl_project_build` each gain an optional `project: z.string().optional()`
  input. Each calls `resolveProject` first. On `needsDisambiguation`, return a plain numbered list — `"1. 123 St\n2.
  Rainbow\n3. Q3 Naples deck\n\nWhich one?"` — and **do not touch the database** (no read of items, no write, no
  build). This is the hard guardrail: ambiguity structurally prevents the write from happening at all, it isn't a
  suggestion the model can override. On a single resolved project, proceed exactly as today, scoped to
  `project.id`.
- The numbered list is deliberately name-only in the text a model would relay verbatim to the user (no raw ids
  surfaced) — but the tool's structured response can still carry `id` alongside each numbered `title` so the model
  has what it needs to resolve a bare-number reply ("2") into an exact-id call next turn, without ever having to
  paste an id into its reply to the user.
- `swfl_project_handoff` is untouched — it's the keyless carry-back path and never reads any header.

**Conversation-level "dedication" (not a server feature):** once a project resolves inside a conversation, the tool
descriptions instruct the model to keep passing that same resolved reference for later calls in the same
conversation without re-asking, until the user names a different project. There is no session id in the transport
to key server-side state on, so this is enforced entirely by what's sitting in the conversation transcript — a
fresh conversation has nothing to reuse and starts from "no project resolved" every time. Surviving context
compaction is best-effort: it depends on Claude Code's own summarization treating "which project this conversation
targets" as worth keeping. If that ever proves unreliable, the fallback is one cheap re-resolution call, not a
broken state.

**`lib/identity/mcp-connected.ts`** — `isMcpConnected` swaps its first check from "owns a project with non-null
`mcp_key`" to `EXISTS (SELECT 1 FROM user_mcp_tokens WHERE user_id = authUid)`. The second check (a real
`usage_events` row with `client_id = "mcp:<uid>"`) is untouched — the rung-2 send discount still requires an actual
build/add, not just a connected token.

## Migration

This feature is ~3 weeks old (Session 9, 2026-06-10) and low-traffic. Before dropping `projects.mcp_key`: query the
live row count of non-null `mcp_key` values. If any exist, mint each of those users an account-level token in the
same migration (so an already-connected user doesn't silently lose access — they still have to paste the new
snippet into `.mcp.json`, since the header name changes, but their account isn't left in a broken state). Clean
cutover otherwise — no dual-read compatibility shim carried forward.

## Error handling

- Missing `X-Account-Key` header → same shape as today's `NO_KEY`, reworded to point at `/settings/mcp`.
- Header present, token matches no row (revoked/typo) → same shape as today's `INVALID_KEY`.
- Token valid, `project` ambiguous/absent/no-match → numbered candidate list, **zero DB mutation**, as above.
- Token valid, `project` resolves to exactly one project not owned by this user → impossible by construction: the
  candidate set is built from `projects.user_id = <resolved user_id>` before any matching runs, so cross-user
  resolution can't happen at any tier, including an exact-id guess of another user's project id.

## Testing

Extend `app/api/mcp/project-tools.test.ts`:
- `resolveUserByToken` — valid token → user_id; revoked/regenerated-away token → null; absent header → null.
- `resolveProject` tiers — exact id; exact title (case-insensitive); prefix; substring; a tier with 2+ hits does
  not fall through to a looser tier.
- No `project` arg → full owned-project candidate list, no mutation.
- `project` arg matching zero projects → full owned-project candidate list (not an error, not a guess).
- `project` arg matching 2+ at the same tier → just those candidates, no mutation.
- Cross-user isolation — user B's exact project id, passed as `project` under user A's token, resolves to nothing
  (never to B's project).
- New `app/api/account/mcp-token/route.test.ts` mirroring the existing per-project mint/regenerate/revoke tests,
  moved to the account-level route.
- `lib/identity/mcp-connected.test.ts` updated for the `user_mcp_tokens` table.

## Out of scope

Full OAuth 2.1 (dynamic client registration, browser consent flow) — revisit only if this MCP server needs to serve
third parties beyond a user's own Claude client. A pinned "active project" tool/session concept — not needed;
conversation-transcript reuse achieves the same UX without new server state.
