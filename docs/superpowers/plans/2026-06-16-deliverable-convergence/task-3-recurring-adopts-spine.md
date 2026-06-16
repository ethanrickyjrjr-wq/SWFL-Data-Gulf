# Task 3 — Recurring lane adopts the spine (and the slot-break guard)

**Builder:** Opus · **Wave:** B (parallel with Task 4) · **Depends on:** Task 2

## Goal

A recurring schedule with `template_id:"report"` renders the **grounded** report with **fresh data each run** — and Phase 1's removal of the `[ BODY TEXT ]` slot does **not** silently break it.

## Why this is Opus

Subtle correctness: the recurring lane already maps `report → email/email-report` (`template-registry.ts`) and `schedule-command.ts` lets a tenant pick `template_id:"report"`. The scheduler renders via `renderEmailTemplate(slug, {body})` (`run-schedules.mts:266-269`) — the slot Phase 1 deletes. Left unguarded, a "report" schedule renders an empty masthead+footer.

## Build

> **Plan correction (2026-06-16, found by code audit — RULE 0/C1):** the original step 1 said "assemble a `GroundedReportModel` via `assembleScopedContent`." That does **not** typecheck — `assembleScopedContent` returns `ScopedContent` (`cards: WelcomeMetric[]`), NOT a `GroundedReportModel` (`metrics: ReportMetric[]` + `lines: ReportLine[]`, no dossier prose). The real fresh-data grounded assembler is **`assembleActivationReport(scope) → assembledReportToModel()`** (`lib/email/activation/snapshot.ts`): it pulls housing/flood/dossier from the brains live each call (= "fresh data each run") and yields the exact shape `assembledReportToModel` consumes. Built against that instead.

1. **`buildContent` for the "report" template** (`scripts/email/run-schedules.mts`): when `resolveTemplateSlug(row.template_id) === "report"`, build a `GroundedReportModel` via `buildReportModel(row, …)` (`lib/email/recurring-report.ts`) → `assembleActivationReport({ zip: scope_value }) → assembledReportToModel(report)` → fresh data this run. **ZIP-scoped only** (the report grain); the assembler is ZIP-keyed. Non-"report" templates keep the current `{subject, body, chart}` path unchanged.
2. **`renderHtml`**: route "report" through `renderGroundedReport(model, {skin:"email", brand:null})` (Task 2; recurring rows carry no white-label brand → house brand). Plain templates (hero/table/compare/ranked/hbar) keep `renderEmailTemplate(slug, {body, chart})` — `[ BODY TEXT ]` path **unchanged** (backward-compat). The model travels `buildContent → renderHtml` via an additive optional `model?` on the existing `ProcessDeps` seam (RULE 3 C2 — extend, no new gate).
3. **Guard:** if a "report" schedule can't assemble a model (not a ZIP scope, out-of-footprint ZIP, or in-scope but zero metrics+lines), fall back to the global digest (never invent below grain) — `buildReportModel` returns `null`, mirroring `assembleScopedContent`'s null-fallback.

## Tests / acceptance

- `DRY_RUN=true bun scripts/email/run-schedules.mts` on a seeded `template_id:"report"` schedule logs a grounded would-send carrying a **fresh** freshness token (not Phase-1's static sample).
- A seeded `template_id:"hero"` schedule's would-send is **byte-identical** to before (no regression).
- Scheduler unit tests (`lib/email/__tests__/scheduler.test.ts`) stay green; add a case asserting "report" routes to the grounded renderer.

## Guardrails

No double-send / re-arm semantics change — only `buildContent`/`renderHtml`. Idempotency + usage gates untouched. Open check `email_recurring_report_template`. Do **not** flip the paused cron (`email-scheduler.yml`) — go-live is separate.
