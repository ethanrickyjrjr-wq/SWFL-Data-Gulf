# Session 0 — Metering Foundations  ·  **SONNET**  ·  ~0.5 day

> Read `../shared/conventions.md` and `../AUDIT.md` first. This is the metering prerequisite for everything: the meter is fiction today because the client id is never minted (`[AUDIT-FIX]` confirmed — every `usage_events.client_id` = `"anon"`). Make it real, add an `action` dimension, and slip in the spec amendments since this session ships first.

**Goal:** Mint a signed `sdg_cid` cookie so per-client metering works; add an `action` column + `/api/meter` so every new action (ask/chart_save/project_create/item_add/build/export_print/deliver_email/upload) is counted day one with **enforcement OFF**.

**Architecture:** Middleware mints `sdg_cid = <randomId>.<hmac16>` when absent (httpOnly, 1y, lax). `meter.ts` verifies the HMAC and falls back to `"anon"` on a forged/missing cookie. `recordUse` gains an `action` param; a tiny `POST /api/meter` lets the client log non-route actions.

**Tasks (read each file in order):**
- [ ] `task-01-spec-amendments-and-checks.md` — amend the boards spec A1–A8, flip build-queue, open the 5 checks (preflight; this session ships first)
- [ ] `task-02-cookie-mint-middleware.md` — HMAC mint in `middleware.ts` + new env `SDG_COOKIE_SECRET`
- [ ] `task-03-usage-events-action-column.md` — idempotent SQL: `action text NOT NULL DEFAULT 'ask'` + index
- [ ] `task-04-meter-action-and-api.md` — `recordUse(..., {action})` + `actionCount()` + `POST /api/meter`
- [ ] `task-05-live-verify.md` — deploy, verify cookie minted/reused/forged→anon, open `cookie_mint_live_verify`

**Files touched:** `middleware.ts` · `lib/highlighter/meter.ts` · new `app/api/meter/route.ts` · new `docs/sql/20260611_usage_events_action.sql` · `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md` · `_AUDIT_AND_ROADMAP/build-queue.md`

**Risk:** cookie bugs → **fail-safe to today's `"anon"`** behavior (never throw, never block a request). Enforcement stays OFF — this only *counts*.

**Diff-review gate:** none (metering + SQL + spec doc). Commit and push per the standard checklist, pausing for the operator's push confirmation.
