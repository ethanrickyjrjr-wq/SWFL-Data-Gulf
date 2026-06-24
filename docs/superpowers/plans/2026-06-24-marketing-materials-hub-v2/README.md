# Project Marketing Hub v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (recommended for this build — it's a sequential dependency chain with shared files) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT fan out parallel agents across these tasks — see _Execution_ below.

**Goal:** Turn the per-project workspace into a template-first marketing materials library where block-canvas emails are stored as `deliverables` rows, the AI fills templates with real lake data, and filed project photos can be dropped into emails.

**Architecture:** Block-canvas emails become `deliverables` rows (`template='block-canvas'`, populated `doc JSONB`), inheriting the existing version lineage (`supersedes_id` + `splitDeliverableVersions`), soft-delete, and library surfacing. A template-first hub replaces the Built lane. A "photos bridge" promotes filed photos from the private bucket to a public one on use.

**Tech Stack:** Next.js App Router, Supabase Postgres + Storage, Zod (`EmailDocSchema`), Claude Haiku via `/api/email-lab/ai`, Tailwind CSS, `@supabase/storage-js@2.106.1`.

**Design authority:** `docs/superpowers/specs/2026-06-24-marketing-materials-hub-v2-design.md` — read it first. It carries the verified codebase facts, the visual design decisions (Tasks 8 build to it), and the rationale.

---

## Global Constraints (every task inherits these — copied verbatim from the spec)

- `template='block-canvas'` ⇒ `doc` non-null; all other templates ⇒ `doc` null.
- `data_as_of` set on every create/refresh; drives "needs update" at age > 30 days.
- **Two write paths:** manual Save = **PATCH in place** (no version); Update Data (↻) = **forks a new version** (`supersedes_id`) with fresh `data_as_of`.
- **All `deliverables` writes go through `createServiceRoleClient` AFTER a cookie-client ownership check** — `deliverables` has no owner INSERT/UPDATE policy (`docs/sql/20260613_deliverables.sql:37,40-41`). Mirror `app/api/projects/[id]/build/route.ts:18-20,65`.
- IDs via `crypto.randomUUID()` — **never `nanoid`** (not a dependency; `lib/email/doc/schema.ts:36`).
- Supabase imports: `createClient(await cookies())` from `@/utils/supabase/server` (RLS) and `createServiceRoleClient` from `@/utils/supabase/service-role` (writes). **Not** `createCookieClient`/`@/lib/supabase/server` (don't exist).
- Seeds import: `@/lib/email/doc/default-docs` (`SEED_DOCS`, `seedById`, `defaultDoc`). **Not** `@/lib/email/seeds` (doesn't exist).
- AI route: pass `scope` as `{ kind, value }` (object, not string); persist/send only when the response `applied === true`.
- `exec_summary` is NOT a column — it lives in `narrative` JSONB; derive in code (`page.tsx:158`).
- `EmailLabShell` is shared by the standalone `app/email-lab/EmailLabClient.tsx` AND the project `ProjectEmailLabClient.tsx` — every addition must be optional/conditional; the standalone lab must compile and behave unchanged.
- `bunx next build` must stay clean after every task; `bun test` green.
- Commit explicit paths only; never `git add -A`; never `--no-verify`. Final push via `node scripts/safe-push.mjs` with a SESSION_LOG entry in the same push.

---

## Tasks, models, and order

| # | File | Task | Model |
|---|------|------|-------|
| 1 | [task-01-foundation.md](task-01-foundation.md) | Migrations + types + `TemplateId`/`buildRenderModel` + `page.tsx` select & map | **Opus** |
| 2 | [task-02-materials-api.md](task-02-materials-api.md) | Materials API (POST + PATCH) | **Opus** |
| 3 | [task-03-refresh-api.md](task-03-refresh-api.md) | Update Data / refresh API | **Opus** |
| 4 | [task-04-ai-material-api.md](task-04-ai-material-api.md) | AI new-material (steerable intent) API | **Sonnet** |
| 5 | [task-05-email-lab-save-load.md](task-05-email-lab-save-load.md) | Email-lab save/load | **Opus** |
| 6 | [task-06-material-status.md](task-06-material-status.md) | Status/badge pure logic + tests | **Sonnet** |
| 7 | [task-07-photos-bridge.md](task-07-photos-bridge.md) | Photos bridge (route + lab panel) | **Sonnet** |
| 8 | [task-08-hub-ui.md](task-08-hub-ui.md) | Hub UI (build to spec's Visual design) | **Sonnet** |
| 9 | [task-09-wire-workspace.md](task-09-wire-workspace.md) | Wire ProjectWorkspace + DeliverableLanes refactor | **Opus** |

## Execution (sequential — NOT a parallel fan-out)

Dependency chain: `1 → (2, 3, 6) → 4 (after 3) → 5 (after 2) → 7 (after 1+5) → 8 (after 2/3/6) → 9 (last)`.

Run `bun test` + `bunx next build` after each task. **File-overlap groups — never edit in parallel:** `app/project/[id]/page.tsx` (T1 + T9), `components/email-lab/EmailLabShell.tsx` (T5 + T7), `app/project/[id]/ProjectWorkspace.tsx` (T9). Optional safe-parallel after T1: Tasks 2/3/6 touch disjoint new files (use separate worktrees). Otherwise one at a time.
