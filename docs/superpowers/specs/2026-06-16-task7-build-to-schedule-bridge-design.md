# Task 7 — Build→Schedule Bridge (design)

**Date:** 2026-06-16 · **Builder:** Opus · **Wave:** C (solo) · **Depends on:** Task 4 (✅ shipped), Task 3 (✅ shipped) · **Blocks:** Tasks 5 & 6 (Wave D)
**Check:** `build_to_schedule_bridge`

> Brief, not a status board. Open obligations live in the `checks` ledger. This doc records the **two locked design decisions** + the build shape, so the next session doesn't re-litigate them.

## Goal

Turning a built **`"email"` deliverable** into a recurring weekly send copies its **recipe** (template + ZIP scope + audience + cadence) into one `email_schedules` row — **never** the frozen snapshot. The schedule re-fetches fresh data every run through the same recipe (Task 3's `template_id:"report"` grounded lane). "Template stays the same, data updates."

## State verified (2026-06-16, against real `main` — not a worktree)

- **Task 4 done:** `"email"` is in `TemplateId` (`templates.ts:83`) + `DELIVERABLE_TEMPLATES` (`assemble.ts:21`). `assembleDeliverable` persists `scope_kind`/`scope_value` on the `deliverables` row (`assemble.ts:85-86`). `buildEmailDeliverableModel` (`email-deliverable.ts`) reconstructs the grounded model from the frozen row. Migration `docs/sql/20260616_deliverables_scope.sql` adds the columns — **UNAPPLIED in prod** (4th pending migration; do not close the Task-4 check until prod confirms).
- **Task 3 done:** `recurring-report.ts` (`buildReportModel`, `resolveReportZip`, `renderRecurringHtml`) renders `template_id:"report"` with fresh data each run. Its own comment already names this bridge: *"the build→schedule bridge writes `scope_kind:"zip"`."*
- **`email_schedules` schema:** `cadence`(NN), `send_hour_et`(NN), `status`; nullable `template_id`, `scope_kind`, `scope_value`, `topic`, `audience_slug`, `day_of_week`, `day_of_month`. **No snapshot column** (recipe-only is structural). **No unique constraint** on the recipe tuple (idempotence is not free).
- **Task 7 NOT built** (no bridge code anywhere). Tasks 5 & 6 NOT built (correctly blocked on this).

## Locked decisions

### D1 — Form factor: extend the existing route (no parallel insert path)

The bridge is **one pure function + one additive propose branch** on `POST /api/email/schedule-command`:

- **`lib/deliverable/schedule-recipe.ts` (pure, deterministic, no I/O):**
  `deliverableToScheduleRecipe(row, choices) → { ok:true, command: ParsedCommand } | { ok:false, error }`
  - `row`: `{ template, scope_kind, scope_value }` (a `deliverables` row is a structural superset).
  - `choices`: `{ audience_slug?, cadence, day_of_week?, day_of_month?, send_hour_et }` (collected from the user by Task 5's chat).
  - Maps: `action:"create"`, `template_id:"report"` (the grounded recurring lane — **not** `"email"`), `scope_kind:"zip"` + `scope_value:<zip>` resolved via the **shared** `resolveReportZip(row.scope_kind, row.scope_value)`, `audience_slug`/`cadence`/`day`/`hour` from `choices`. **No `topic`. No `items_snapshot`. No `narrative`.**
  - A deliverable whose scope does not resolve to a ZIP (non-ZIP / blank) → `{ ok:false, error }`. A grounded `"report"` is ZIP-grain by construction; we never schedule a non-ZIP email deliverable (no invented precision). Same guard the render lane uses → lanes cannot diverge.
  - The emitted command is passed through the existing `validateToolInput` so the proposal is provably a valid `create`.
- **Route propose branch:** when the POST body carries `{ fromDeliverable: { deliverableId, audience_slug?, cadence, day_of_week?, day_of_month?, send_hour_et } }` (and no `confirm`), the route — with **no LLM call** — loads the deliverable by id scoped to `(user, project)` via the cookie/RLS client, builds the recipe, validates, issues the **same** `issueProposalNonce`, and returns the **identical** proposal shape (`{ action, proposal, summary, confirmationRequired, proposal_nonce }`). The **CONFIRM path + `writeAction` are unchanged** — one nonce gate, one write. (RULE 3 C2 — extend the enforced seam, no new gate.)

### D2 — Idempotence: app-level find-or-update, universal, NULL-equal

Re-issuing the same recipe **updates/reactivates** the existing schedule instead of duplicating it. Applied to the **create write path universally** (both `fromDeliverable` and NL `create`) — one create behavior, no divergence.

- **Signature tuple** (what makes two schedules "the same recipe"), scoped to `(user_id, project_id)` across **any status**:
  `template_id, scope_kind, scope_value, topic, audience_slug, cadence, day_of_week, day_of_month, send_hour_et`.
- **NULL-equal is mandatory.** The lookup matches each nullable column with **`IS NOT DISTINCT FROM`** semantics, **never `=`** — `col = NULL` returns zero rows in Postgres (the NULL-distinct trap), which would silently duplicate exactly the scoped recipes this feature creates. Through PostgREST this is expressed per-column as `.is(col, null)` when the target is null and `.eq(col, value)` when non-null (the two together = `IS NOT DISTINCT FROM`, ANDed across columns). The non-null columns `cadence`/`send_hour_et` use `.eq`.
  - **Rejected:** a DB partial-unique index + `ON CONFLICT` — Postgres treats `NULL` as distinct in unique indexes, so a NULL `audience_slug`/`scope_*` row never conflicts → silent dupes on the scoped recipes. (Operator-locked: do not reopen.)
- **On match (active / paused / stopped):** set `status:'active'`, recompute `next_run_at`, touch `updated_at`; return that `id` with `{ created:false }`. A **stopped** match reactivates in place **exactly like un-pausing** (operator decision 2026-06-16) — data-safe because the row stores only a recipe, never numbers, so the next run re-fetches current data regardless of how long it sat stopped. The full-signature match means only a byte-identical recipe reactivates; a different cadence/audience inserts fresh. **No match:** insert; `{ created:true }`. One row per recipe — never a duplicate alongside a stopped/paused twin.

## Build units

1. **`lib/email/schedule-signature.ts` (pure)** — `recipeSignature(command)` → the canonical tuple; `signatureFilters(sig)` → `Array<{ col; op:"eq"|"is"; value }>` (the `IS NOT DISTINCT FROM` expression for PostgREST); `signaturesEqual(a,b)` for tests. No I/O. Fully unit-tested.
2. **`lib/email/schedule-upsert.ts`** — `createOrTouchSchedule(db, userId, projectId, command) → { id, created }`: applies `signatureFilters` to the active/paused query (NULL-equal); on hit updates+reactivates, else inserts. Takes the db client; unit-tested with a chainable fake builder that records the applied filters (proves `.is(col,null)` is used for nulls, never `.eq(col,null)`).
3. **`lib/deliverable/schedule-recipe.ts` (pure)** — `deliverableToScheduleRecipe(row, choices)` per D1.
4. **`app/api/email/schedule-command/route.ts`** — add the `fromDeliverable` propose branch (D1); replace the bare `create` insert in `writeAction` with `createOrTouchSchedule` (D2).

## Tests / acceptance

- **Recipe extraction** (`schedule-recipe.test.ts`): a ZIP-scoped `"email"` row + choices → `action:"create"`, `template_id:"report"`, `scope_kind:"zip"`, `scope_value:<zip>`, audience/cadence carried; the command carries **no** `items_snapshot`/`narrative`/`topic`. Non-ZIP / blank scope → `{ ok:false }`. Deterministic (same inputs → same command).
- **Signature / NULL-equal** (`schedule-signature.test.ts`): `signatureFilters` emits `is null` for every null column and `eq` for non-null; a recipe differing only in a NULL-vs-value column is **not** equal; two identical recipes (incl. all-null optionals) are equal.
- **Idempotence** (`schedule-upsert.test.ts`): with a fake db, an existing active row matching the signature → `created:false`, same id, update issued (no insert); a paused match → reactivated; no match → `created:true`, insert issued; a row differing only by a NULL optional → treated as **different** (insert), proving the filter used `is null` not `eq`.
- **Fresh-data, no-snapshot** (acceptance, manual/DRY_RUN): the written row has only recipe fields; `DRY_RUN=true bun scripts/email/run-schedules.mts` renders it grounded with a fresh freshness token (Task 3). Structurally there is no snapshot column to populate.
- **No regression:** existing `lib/email/__tests__/schedule-command.test.ts` + `scheduler.test.ts` stay green; full `bun test` green; `tsc` + eslint clean.

## Guardrails

Recipe-only (two-object model); no new scheduling primitive — extends `email_schedules` + `schedule-command` (RULE 3 C2). No-fabrication: numbers never copied; the schedule re-fetches. Go-live cron stays paused (separate). `git add` explicit paths only. SESSION_LOG entry + `check.mjs` reconcile (`build_to_schedule_bridge`) on push.
