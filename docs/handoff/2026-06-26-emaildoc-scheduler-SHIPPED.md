# HANDOFF — EmailDoc → Scheduler (N6) is SHIPPED end-to-end (UI + wire + live proof)

> Supersedes `docs/handoff/2026-06-26-emaildoc-scheduler-handoff.md` (that was the pre-build brief). This documents the SHIPPED state, the live proof, and the two known gaps left to polish.
> RULES still apply: probe code first (RULE 0.5); prove by running, not "it compiles"; never push without operator confirmation; stage explicit paths only (a parallel chart/housing session shares the tree).

## What works now (proven live in the operator's browser + DB)
A user builds an email in the Email Lab → clicks **Schedule** → picks an audience + weekly cadence → confirms → a `email_schedules` row is created **linked to that exact saved design** (`template_id="block-canvas"`, `deliverable_id`). The cron worker (`scripts/email/run-schedules.mts`) re-renders THAT design with fresh lake data + fresh AI commentary + a fresh chart each occurrence and sends it.

Live proof (operator account, SWFL Prices project): schedule **id=6** — active, weekly, Monday 7am ET, audience `me`, `template_id=block-canvas`, `deliverable_id=51405c9f-f7b2-4ddc-a4b8-4fbdac3fe4b5`, `next_run_at=2026-06-29T11:00Z`.

## The pieces (all on `main`, this push)
**The wire (decision logic, unit-tested 583/0):**
- Migration `docs/sql/20260626_email_schedule_deliverable.sql` — `email_schedules.deliverable_id text`. APPLIED to prod. Rides the `RETURNS SETOF email_schedules` claim RPC free.
- `lib/deliverable/schedule-recipe.ts` — `block-canvas` branch: carries `deliverable_id`, `template_id="block-canvas"`, NO ZIP force (report path unchanged).
- `deliverable_id` threaded through `lib/email/schedule-command.ts` (`ParsedCommand`/`rawSchema`), `schedule-signature.ts` (recipe signature — two designs don't collide), `schedule-upsert.ts` (insert), and the `fromDeliverable` route.
- `lib/email/scheduler.ts` core — `buildContent` may return `emailDocHtml`; `processSchedule` sends it verbatim (skips template `renderHtml`), still injects the unsubscribe token.
- `lib/email/emaildoc-occurrence.ts` (injected + unit-tested) — load deliverable → re-run `buildContentDoc` → render `EmailDocEmail` → derive subject; null → digest fallback. `run-schedules.mts` is the thin adapter wiring the real seams.
- `lib/email/emaildoc-subject.ts` — derive a subject from the doc (no subject field on EmailDoc).
- Build prompt persisted to `deliverables.instruction` (materials route + shell→client) so the re-render reproduces the chart (the chart selector keys off the prompt).

**The UI / flow:**
- `components/email-lab/EmailLabShell.tsx` + new `ScheduleSendModal.tsx` — the **Schedule** button (project Labs only) → modal wrapping the existing `SendWeeklyHandle` propose→confirm flow.
- `app/p/[id]/SendWeeklyHandle.tsx` — `returnTo` prop → `?next=` on the "Upload contacts" links.
- `app/project/[id]/email-lab/{page.tsx,ProjectEmailLabClient.tsx}` + `EmailLabShell.tsx` — read `?schedule=1` → auto-reopen the schedule modal on return from the contacts detour (set-during-render, no effect).
- `components/project/MaterialsHub.tsx` — materials render ABOVE the create rail when any exist ("YOUR MATERIALS" on top).
- `components/project/MaterialRow.tsx` — a `block-canvas` material renders as a BRANDED PREVIEW CARD (masthead + hero headline in the doc's own colors) with Open / Send / Schedule, instead of a text row.

## KNOWN GAPS (the next session's work)
1. **`/api/email/send-status` ignores block-canvas schedules.** It returns `schedule: null` for a block-canvas schedule (it queries the report-scope lane), so `SendWeeklyHandle` and the project page won't show a "you already have a weekly send" banner / pause control for an EmailDoc schedule — even though the row is active and WILL fire. Fix: teach `send-status` (and `SendWeeklyHandle`'s `ScheduleSummary`) to surface schedules by `deliverable_id` too. Find: `app/api/email/send-status/route.ts`.
2. **The preview card is lightweight, not a true thumbnail.** `MaterialRow`'s card shows the brand masthead + hero headline only. A pixel-faithful thumbnail = render the EmailDoc HTML (via `EmailDocEmail`) into a scaled iframe/`srcDoc`. Heavier; do deliberately.
3. **Cadence is weekly-only in the UI.** `SendWeeklyHandle` hardcodes `cadence:"weekly"`. Daily/monthly already work in the scheduler + recipe; the picker just doesn't offer them.

## Proof gate for the next change
The full live flow is the gate: build → Schedule → pick audience → confirm → assert the `email_schedules` row carries `template_id=block-canvas` + `deliverable_id` → (optional) run `DRY_RUN=true bun scripts/email/run-schedules.mts` against a seeded row and assert the EmailDoc lane fired (not a digest fallback). Note: seeding/deleting prod rows needs operator consent (the auto-mode guard blocks it).

## Landmines
- The `deliverable_id` MUST stay in the recipe SIGNATURE — else two saved designs on the same cadence collide and the second reactivates the first's row.
- `run-schedules.mts` reads doc/prompt/scope off the DELIVERABLE row; only `deliverable_id` traverses the schedule.
- Mode is "quality" (Sonnet) per occurrence — one Anthropic call + chart + lake fetch per tenant per fire. Fine for v1 volume; tune `SCHEDULE_BUILD_MODE` if cost dictates.
