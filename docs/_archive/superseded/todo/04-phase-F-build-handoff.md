# Phase F — Build Handoff (READY TO BUILD, after a short verify pass)

> Author: opus session 2026-06-19. **Design + plan are committed and the product decisions are
> LOCKED.** This is NOT yet built. Read this top-to-bottom; do the **Verify-First checklist (§4)**
> before writing code — the plan rests on ~9 assumptions the author did not personally confirm.

---

## 0. Honest status (read this first)

- **Decisions: final.** Do not reopen them (§1). The operator burned a lot of time getting here.
- **Spec + plan: written and committed** (`docs/superpowers/specs/2026-06-19-phase-f-confirmed-value-lifecycle-design.md`,
  `docs/superpowers/plans/2026-06-19-phase-f-confirmed-value-lifecycle.md`). 9 TDD tasks, 3 waves.
- **Confirmation is uneven** (§3). The **engine** (`brain-snapshot.ts`, `change-evaluator.ts`) was
  read directly — high confidence. The **UI/integration/DB** came from subagent probes — cited but
  second-hand. **Do §4 before coding.** This is a 10–15 min pass, not a re-scope.
- **Nothing pushed.** All commits are docs-only on `main`. The operator's working-tree edits
  (`ingest/lib/geo_utils.py`, `ingest/pipelines/lee_permits/**`, `*zip-*`) are untouched — keep it
  that way (explicit-path staging only).

---

## 1. The decisions (LOCKED — do not re-litigate)

1. **Keep-mine protects the number** ("A"): a confirmed item is skipped by the "Refresh items →"
   overwrite, not just hidden. Sticky keyed to the exact `(item.id, item.value)`.
2. **The number is editable** (U11): inline click-to-edit on a metric; editing clears the confirm
   and re-evaluates against the new value. This is F4's real re-eval trigger.
3. **A per-item confidence chip** (not the top nudge) shows when our data disagrees — states both
   numbers, never asserts the user is wrong, never overwrites.
4. **Email = always our fresh data, by construction.** The scheduled send renders from the brain and
   **never reads `projects.items` or `ui_state`** — so a kept number can't leak into any email
   (week 1 included). **Zero email work.**
5. **Scope:** we provide market **data**; we never *change* a user's number (even inside a contract;
   emailing contract data is fine, mutating it is not). The AI advises when asked, never rewrites.
6. **Storage:** sticky flag in `ui_state.confirmed_values` (read-modify-write, single writer);
   evidence row in `data_readiness_alerts` (`surface='in_project'`, `user_action='confirmed'`).

**Deferred to a LATER session (NOT in this build):** v1.5 vision structured-import (file numbers →
structured metrics), file→email, F6 crawl4ai confirm. See spec §9.

---

## 2. What was verified by DIRECT read (high confidence — trust these)

| Fact | File:line (read directly) |
| --- | --- |
| Gate 1 A1 (no slug → silent), A2 (strict per-item scope) live | `lib/signals/brain-snapshot.ts:66,79-92` |
| `evaluateChange` signature + both return shapes; A3 kind guard; magnitude gate | `lib/signals/change-evaluator.ts:79-145` |
| `computeSignificantChanges(items, registry, zip?, limit=5)` current signature | `lib/signals/brain-snapshot.ts:44-49` |
| `email_schedules` has **no `deliverable_id`** / no rendered-HTML column | `docs/sql/20260612_email_product.sql:21-36` |
| `schedule_send` vs `build_deliverable` are **separate, unlinked** actions | `app/api/projects/[id]/action/route.ts:170,200` |

The engine half of the plan (Tasks 4 + 6 core logic) is built on these — safe.

---

## 3. What came from SUBAGENT probes (cited, but spot-check before relying)

These are file:line-cited by Explore agents and are very likely correct, but were **not** opened by
the plan author. Treat as "probably right, glance to confirm":

- `SignificantChange` / `RegistryEntry` shapes → `lib/signals/types.ts:6-49`.
- `ProjectItem` schema (metric: `value`,`metric_slug`,`scope_kind`,`scope_value`,`report_id`,`id`,
  `added_at`; file: `extracted_text`,`extraction_status`) → `lib/project/items.ts:16-89`.
- Card rendering: `ItemDetail` metric branch `:45-71` (value `<p>` at `:49`), file branch `:133-176`
  ("Provided by agent" at `:174`); `ItemCard` props `:16-97`; `ItemsBoard` prop-passing `:52-64`.
- `ProjectWorkspace` Props (`significantChanges` at `:55`); nudge block `:469-503`.
- `page.tsx` calls `computeSignificantChanges(..., inferScopeFromItems(items).zip)` at `:189-196`.
- `applyRefresh(items, brainValues)` overwrites `item.value` at `lib/project/refresh-on-access.ts:41-72`;
  still uses `metric_slug ?? item.label` (the fallback Gate 1 killed elsewhere — park as a `checks` item).
- `ui_state` PATCH is whole-object replace, no server merge → `app/api/projects/[id]/route.ts:71`.
  `ProjectUiState` (additive keys) → `app/project/[id]/workspace/types.ts:75-86`.
- `data_readiness_alerts` exists (`docs/sql/20260619_data_readiness_alerts.sql`); the 4 Phase-F
  columns (`user_action`,`surface`,`gate_reason`,`crawl_confirmed_value`) do **not** exist yet.
  Only insert path today is `lib/email/data-readiness.ts:299` (`logVerificationResult`).
- Email send path reads neither `items` nor `ui_state` → `scripts/email/run-schedules.mts:302-348`,
  `lib/welcome/answer.ts:174`, `lib/email/scheduler.ts`. (This is the basis for decision #4.)

---

## 4. VERIFY-FIRST checklist — do this BEFORE writing any code (~15 min)

Each item is an assumption the plan makes but the author did NOT confirm. Confirm it, then build.

1. **[BIGGEST RISK] The signals test harness.** Plan Tasks 4 & 6 write tests assuming helpers like
   `makeMetricItem` / `makeRegistry` and a stub for `lookupLakeFact`. **Open the existing 41-test
   file** (`lib/signals/brain-snapshot.test.ts` — confirm the name/path) and see how it actually
   builds items + stubs `lookupLakeFact` (it imports from `@/lib/reconcile/lane1`). Mirror THAT
   style; do not invent a new mock. If the file mocks via `bun:test` `mock.module`, reuse it.
   → `grep -rn "lookupLakeFact\|mock" lib/signals/*.test.ts`

2. **`ProjectWorkspace` ui_state writer.** Tasks 8 & 9 say "reuse the existing `patch(...)` helper
   the dismiss flow uses." **Confirm the real helper name + signature** (it PATCHes
   `ui_state.last_freshness_token_seen` on Dismiss, and `mcp_dismissed_count`).
   → `grep -n "ui_state\|patch(\|fetch(\`/api/projects" app/project/[id]/ProjectWorkspace.tsx`

3. **Service-role client import** for the new `confirm-value` route (Task 8).
   → `grep -rn "createServiceRoleClient\|service-role" lib/ app/api/projects | head`

4. **`refreshKey` format** for the Task 6 fixture (`report_id|slug|scope`?).
   → open `lib/project/refresh-on-access.ts`, find `refreshKey(`.

5. **Sibling-route auth pattern** for `confirm-value` (do they call `authed()` + owner check?).
   → open `app/api/projects/[id]/refresh/route.ts` and `.../route.ts` and copy the auth preamble.

6. **`data_readiness_alerts` base table is APPLIED IN PROD.** The Task-2 migration `ALTER`s it; if
   the base table was never run in prod, the ALTER fails. Confirm the table exists before running U4.
   → query prod: `select to_regclass('public.data_readiness_alerts');` (should be non-null).

7. **`.dlt/secrets.toml` postgres-cred path** (the Task-2 psycopg snippet guesses
   `["destination"]["postgres"]["credentials"]`). **Open the file** (gitignored) and use the real
   keys. URI shape: `postgresql://postgres:{password}@{host}:5432/postgres`.

8. **Repo build/test scripts.** Plan uses `bun test lib/signals`, `bunx tsc --noEmit`, `bunx next build`.
   Confirm the canonical commands. → open `package.json` `scripts`.

9. **`ProjectUiState` additive contract.** Task 1 adds `confirmed_values?` to it — confirm the
   interface is the additive `[key: string]: unknown` bag the probe reported, and that adding a key
   is the established pattern (it is, per `mcp_dismissed_count` / `last_freshness_token_seen`).

If all 9 confirm cleanly → the plan is build-ready as written. If any diverges → adjust that task's
code/test to match reality (the *design* doesn't change; only the local wiring detail does).

---

## 5. How to build (once §4 is clear)

Plan: `docs/superpowers/plans/2026-06-19-phase-f-confirmed-value-lifecycle.md`. Use
`superpowers:subagent-driven-development` or `superpowers:executing-plans`.

- **Wave 1 (parallel, zero file overlap):** Task 1 (sticky lib) ‖ Task 2 (migration) ‖ Task 3 (chip+note).
- **Wave 2 (serial, signals owner):** Task 4 (item_id + suppression) → Task 5 (page wiring) → Task 6 (Refresh-skip).
- **Wave 3 (serial, ONE workspace owner — the conflict hotspot):** Task 7 (log helper) → Task 8
  (chip mount + Keep-mine) → Task 9 (inline editable value). Only these tasks touch
  `ProjectWorkspace.tsx` / `workspace/*`.
- **Gate before any push:** `bun test lib/signals lib/project` green, `tsc` 0 new errors,
  `next build` ✓, plus the manual checks in the plan's "Final verification."

---

## 6. Constraints carried (non-negotiable)

- Never override / change a user's number. Flag/advise only.
- Gate 1 unchanged. Uncertain → silent.
- No autonomous push / PR / branch. Commit on `main`, explicit paths. **Operator pushes.**
- Don't co-mingle with the operator's `geo_utils`/`lee_permits`/`zip-*` working-tree edits.
- `SESSION_LOG.md` entry before any push (RULE 0). Touching `change-evaluator.ts`/`brain-snapshot.ts`
  → `bun test lib/signals` green (pre-push gate).

---

## 7. Source trail (the full reasoning, if needed)

- `TODO/01-significance-gate-findings-and-decisions.md` — why + locked D1–D10.
- `TODO/02-significance-gate-build-scope-and-plan.md` — the phase plan A–F.
- `TODO/03-phase-F-handoff.md` — the Phase F brief this implements.
- Spec: `docs/superpowers/specs/2026-06-19-phase-f-confirmed-value-lifecycle-design.md`.
- Plan: `docs/superpowers/plans/2026-06-19-phase-f-confirmed-value-lifecycle.md`.
