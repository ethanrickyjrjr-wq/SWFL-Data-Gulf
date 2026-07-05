# HANDOFF — Build 3: listing lifecycle sequences (milestone-fired campaign arc)

## Mission

One listing campaign = an ARC that fires distinct pieces on listing milestones — coming soon → new
listing → comps → under contract → just sold — instead of one recurring cadence. Today the scheduler
sends ONE piece on ONE cadence; the five listing pieces exist only as showcase slide recipes the user
must build by hand, one at a time.

## Read first (in order)

1. `docs/superpowers/specs/2026-07-05-agent-first-homepage-design.md` — the approved ladder; build 3
   is one paragraph there. You expand it into its own spec via brainstorming (RULE 3.5 applies — this
   is a new behavior, brainstorm + research pass required, then `node scripts/new-build.mjs
   lifecycle-sequences "<label>"`).
2. `lib/email/CLAUDE.md` — area conventions (loads on edit, read anyway).
3. SESSION_LOG entries dated 07/05/2026 titled "BUILT: agent-first homepage build 1" and "BUILT:
   address spine build 2" — what already exists and was live-verified.

## The building blocks you inherit (all live)

- The five piece recipes: `lib/showcase/registry.ts` — `listing-to-close` slides (titles: "Coming
  Soon", "New Listing", "Market Comps", "Under Contract", "Sold"), each with a one-blank recipe.
- Single-cadence scheduler (production-grade — claim/reaper/idempotency): `lib/email/scheduler.ts`,
  `scripts/email/run-schedules.mts`, `lib/email/schedule-upsert.ts` (idempotent create),
  `lib/email/schedule-signature.ts` (10-column identity), `lib/deliverable/schedule-recipe.ts`
  (deliverable → ParsedCommand bridge). Treat the single-cadence engine as the PRIMITIVE — the spec
  ladder says sequences sit ON TOP of it, it does not get rewritten.
- Address spine: `BuildScope.address` (`lib/email/build-doc.ts`) pulls nearby sold comps into every
  build via `lib/email/address-context.ts`; scheduled occurrences re-read the project's
  `subject_address` each send (`lib/email/emaildoc-occurrence.ts` + the runner's project join).
- Listing status signal candidates for milestone detection: the listing lifecycle ingest
  (`ingest/pipelines/listing_lifecycle/` — transitions incl. pending/sold per day) and
  `lib/listings/steadyapi.ts` (per-point lookups; ≤3-call budget discipline applies). Which one
  drives milestones is a DESIGN QUESTION for the brainstorm — do not assume.

## Design questions the brainstorm must settle (with the operator)

- Milestone source: user clicks "mark under contract" (manual, zero-cost, honest) vs. auto-detect
  from our lifecycle data (magical, but stale/mismatch risk on a specific address). Recommend
  presenting manual-first with auto-detect as a later upgrade.
- Sequence state: new table vs. rows on the existing schedules table with a `sequence_step`?
  Extend existing seams first (RULE C2) — check `email_schedules` columns before proposing a table.
- Where the user sees/controls the arc: the project Email tab is the only real candidate
  (`app/project/[id]/email-lab/`); the grid shell is the one lab surface (locked — never fork it).

## Landmines

- `lib/email/scheduler.ts` / `run-schedules.mts` are frequently claimed by parallel sessions — check
  `git status` and the repolith hook warnings before editing; coordinate rather than clobber.
- Flaky-test rule: a red CI unrelated to your diff → suspect flake, loop locally first.
- Every new schedule surface must keep: idempotent create, at-most-once send claim, loud-fail exit.
- No new mandatory pre-materialization gates (RULE C2).

## Definition of done

- Spec + plan committed; build registered (its own `_live_verify` check).
- A listing project can arm the arc once; each milestone (however the spec settles detection) causes
  exactly one correctly-built send; comps/status figures fresh at each send (inherit from the spine).
- All existing scheduler tests green untouched; new pieces unit-tested via the DI seams.
- `bunx next build` green; SESSION_LOG entry; STOP before push for operator approval.
