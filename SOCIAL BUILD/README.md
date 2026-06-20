# SOCIAL BUILD — assignment files (OUR SIDE)

One file = one ultracode Claude's complete job. Hand each file to a separate session.
Design source of truth: `docs/superpowers/specs/2026-06-20-social-auto-posting-design.md`.
Live-verify research: run `ingest/pipelines/social_best_practices/crawl_social_practices.py` (where the web is open) → `social-practices.json` feeds cadence/format defaults + verifies every platform API claim.

## The model (confirmed this session)
- **NO paid middleman at the start.** Direct platform APIs only — **X, Facebook + Instagram (Meta Graph), LinkedIn, Google Business Profile.** No Ayrshare/Buffer/Hootsuite we pay for.
- **Clients connect their own accounts** (OAuth) → we store + refresh their tokens → our cron posts on their behalf. Multi-tenant from day 1, `user_id`-namespaced. We dogfood on our own accounts as tenant #1 while app-reviews clear.
- **Go-live switch:** the whole pipeline runs in cost-free DRY mode (`SOCIAL_PUBLISH_ENABLED=false`, default). One flip (`node scripts/social.mjs go-live`) when payments are in. No code change at go-live.
- **App-review is the long pole** — a non-code track that must start **day 1** in parallel (X, Meta ×2 for Pages+IG with Business Verification, LinkedIn Community Management, Google Business Profile). Weeks each. Owner: operator.

## OUR SIDE vs USER SIDE
This folder is **OUR SIDE** — the backend/platform spine (data model, image rasterizer, platform adapters + token refresh, cron worker, deliverable template, engagement tracking).
The **USER SIDE** (connect-your-socials OAuth UX, the "just ask AI" command, the `swfl_social_*` MCP tool, the workspace Social lane) is a separate planning brief: **`USER-SIDE-HANDOFF.md`** — hand that to another Claude to plan out (its own brainstorm → spec → plan).
They meet at the seam: **`social_accounts` token store** (schema in 01, read/refresh lib in 03) + the **compose cores** (01) + the **`social_schedules` recipe + claim** (01).

## Who builds what
**Opus** = visual/quality + no-invention + shared-file judgment. **Sonnet** = clone-and-rename of the proven email/outreach engine + vendor-doc-following.

| File | Build | Model |
|---|---|---|
| `01-spine-cores-and-go-live-switch.md` | Tables, claim RPC, pure DI cores, `lib/social/types.ts`, go-live switch | **Sonnet** |
| `02-social-image-rasterizer.md` | Reuse `chart-renderer` SVG + brand → PNG card per platform size | **Opus** |
| `03-platform-adapters-and-token-refresh.md` | X / Meta(FB+IG) / LinkedIn / GBP publish adapters + encrypted token store/refresh | **Sonnet** |
| `04-cron-worker-and-gha.md` | `run-schedules.mts` worker + `social-scheduler.yml` | **Sonnet** |
| `05-social-template-and-grain.md` | `"social"` deliverable template + place/county/ZIP grain | **Opus** |
| `06-engagement-tracking.md` | Engagement poll → `social_events` → metrics view | **Sonnet** |

## What can run together — concurrency matrix
The only real conflicts are same-file edits or a hard dependency. Run in stages:

### STAGE 1 — start now (2 Claudes)
- **01** (Sonnet) + **02** (Opus). No overlap.
- **01 must merge `lib/social/types.ts` + the migration FIRST** (small) — it's the shared interface + schema everyone codes against.

### STAGE 2 — after 01's types + migration land (2 Claudes)
- **03** (Sonnet) + **05** (Opus).
- 03 owns `lib/social/oauth-tokens.ts` (the USER SIDE seam). 05 **edits shared deliverable files** (`lib/deliverable/templates.ts`, `assemble.ts`) — see ⚠ below.

### STAGE 3 — after 01 + 02 + 03 merge (2 Claudes)
- **04** (Sonnet) + **06** (Sonnet). Both integrate the earlier builds via interfaces; neither edits the other's files.

### CANNOT-RUN-AT-SAME-TIME
| Pair | Why | Fix |
|---|---|---|
| 03/04/05/06 ✕ 01 (schema) | all import `lib/social/types.ts` + read `social_*` tables | 01 merges types + migration first |
| 04 ✕ 01, 02, 03 | 04's worker calls their code; needs them present (doesn't edit them) | run 04 in Stage 3 |
| 06 ✕ 01, 03 | poll needs the tables + platform read APIs | run 06 in Stage 3 |
| 05 ✕ any EMAIL deliverable work | 05 edits `lib/deliverable/templates.ts` + `assemble.ts` (shared with email) | don't run 05 while another session edits those two files |
| **USER SIDE** ✕ 01, 03 | connect-OAuth writes via 03's `oauth-tokens.ts`; command writes `social_schedules` (01) | plan anytime; build after 01 + 03 merge |

Peak useful concurrency: **2 Claudes** per stage. **02 (renderer) conflicts with nothing.**

## Every file's done-bar (house rules)
- Build in DRY mode; never wire a live post that fires without `SOCIAL_PUBLISH_ENABLED=true`.
- Gates before push: `real-tsc` 0, eslint clean, `next build` ✓, relevant `bun test` green. Migrations idempotent + verified by row count. **New deps (sharp/@vercel/og/resvg-js) → `bun install` + commit `bun.lock` same push (lockfile gate).**
- `SESSION_LOG.md` entry on push; stage only your own files (explicit paths, never `git add -A`); no autonomous push.
- **Vendor-First:** re-verify the platform API claim (scopes/token TTL/app-review/rate limit/media-upload) against live docs — or the crawl output — before coding each adapter.
