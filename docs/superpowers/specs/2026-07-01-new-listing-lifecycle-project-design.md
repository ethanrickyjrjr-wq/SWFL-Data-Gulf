# New Listing Lifecycle Project — design + build decomposition

**Date:** 07/01/2026. **Status:** design for operator review (no code written yet).
**Research:** `_ASSISTANT/research/2026-07-01-listing-lifecycle-marketing-research.md` (crawl4ai, RULE 0.4).
**Code map:** verified read-only sweep (file:line evidence folded in below).

## Goal (operator vision, 07/01/2026)

Two entry points on the projects surface:
- **New Project** → blank canvas (today's behavior).
- **New Listing** → a project pre-anchored to a **saved subject address** and pre-laid with the listing
  **stage gameplan** (Just Listed → Comps → Open House → Price Update → Pending → Just Sold, Coming-Soon
  optional). The user builds the **main listing email** first; the AI is then primed — with the address and
  data already in hand — to build each *next* stage deliverable **on demand** when the user clicks ("build
  comps email", "build sold email"). We do NOT batch-generate the sequence (a house can sell in a day); we
  set up the gameplan and generate each stage when its real event fires. Social suggestions attach at each
  stage. Every number stays four-lane / no-invention, cited "SWFL Data Gulf" (07/01 naming decree).

This makes the AI *more* focused (one stage, one address, real data) and each subsequent email/PDF faster and
better — the per-section retone editor (already built) handles wording.

## What already exists (do not rebuild — code map verdicts)

- **Project → deliverable → schedule chain: BUILT & wired.** `deliverables.project_id`, `email_schedules`
  (multi-per-project, `schedule-signature.ts`), and the `deliverableToScheduleRecipe` bridge
  (`schedule-command/route.ts:142,182`). A project can already hold many scheduled deliverables.
- **Template → project → deliverable flywheel: BUILT at API layer** (`instantiateTemplate`,
  `/api/templates/[id]/run` — the "Listing PDF maker"), but no listing template + no UI surface.
- **Listing flyer (grounded): BUILT** (`buildListingFlyer`, `build-doc.ts:355-396`, pasted-URL + intent).
- **Comps: BUILT** twice — flyer chart (`build-doc.ts:361-382`) and the chat comp helper
  (`lib/assistant/comp-helper.ts`, wired in `conversation-path.ts`).
- **Per-block / per-section AI edit + grid AI sections: BUILT** (`runBlockAi`, `/api/email-lab/ai`).
- **Social generation: BUILT** (`/api/email-lab/social/generate`, `social-calendar`).
- **Listing-lifecycle event data exists** in the lake (`data_lake.listing_transitions` / `listing_state`,
  incl. `sold_price`/`sold_date`) — but has **ZERO** `lib/`/`app/` consumers today.

## What's missing (the real gaps)

- **No listing-kind project + saved address.** `projects` has no address/subject column; `project_type` means
  CRE asset-class (`infer-project-type.ts`), not listing-vs-general. Create flow inserts only `{title,items}`.
- **No stage/sequence concept for a project.** Schedules are independent recurring cadences; no ordering /
  stage cursor. (The only "step" machinery is the unrelated recipient-keyed cold-outreach drip.)
- **No grounded sold-email builder.** "just-sold" exists only as static placeholder presets
  (`default-docs.ts:179,744`); real sold data (`fetchSoldEvent`, `lib/listings/steadyapi.ts`) is unwired to
  any builder.
- **No social-per-listing-stage hook** (`social/lifecycle.ts` is a *send* state machine, not a listing one).
- **No lake→product read path** for auto-triggering stages from real status changes.

## Build decomposition (ships value incrementally; each its own spec+plan)

### Build 1 — Listing project + saved address  *(the anchor; do first)*
Add a **listing kind** + a **saved subject address** to a project, and a **New Listing** entry that sets
them. Address is optional-but-saved; when absent we do NOT assume one unless the project title parses to an
address. This closes the original F2: the comp/listing paths read the project address, and when an address is
inferred (not typed) the AI **confirms** — "Is this listing/comp for {address}? Reply yes or send a different
one" — via the existing `compHelper` needs-message seam (`comp-helper.ts:170-176`), no state machine.
- **Seams:** a new column/field for `kind` + `address` on `projects` (not the CRE `project_type`); create
  path `app/api/projects/route.ts`; `NewProjectButton.tsx` + a new New-Listing entry; thread project
  address into `compForConversation` deps (`conversation-path.ts:115`).
- **Decision taken (operator):** saved address field, project-title as the only fallback.

### Build 2 — Grounded "Just Sold" email builder
Clone `buildListingFlyer` → `buildSoldEmail(soldEvent, doc)` using the already-fetchable `fetchSoldEvent`
(`lib/listings/steadyapi.ts`), and add a "just sold" branch so a sold prompt/click builds a **sold** email
(sale price + date + a comps/market recap), not a generic flyer. Closes the biggest content gap.
- **Seams:** `lib/email/` new builder beside `listing-flyer.ts`; `build-doc.ts` intent branch; the sold data
  already exists. Framing rule: positive by default; grounded numbers only; guard omits, never errors.

### Build 3 — The stage gameplan (sequence + on-demand generation)
Give a listing project an ordered **stage cursor** and a preset stage list; render "build the {next stage}
email" actions that generate that stage's grounded deliverable **on demand** (never batch). Reuse the
template-run flywheel (`instantiateTemplate`) + the `deliverableToScheduleRecipe` bridge for optional
scheduling of a stage.
- **Seams:** a stage field on the project or a `project_stages` concept; the classic-rail static stage
  presets (`EmailLabShell.tsx:71-78`) become grounded generators; nearest reusable ordering pattern is the
  outreach `step`/`next_send_at` machinery (adapt, don't reuse directly).

### Build 4 — Social suggestion per stage
At each stage, offer a matching social post via the built social generator
(`/api/email-lab/social/generate`), tied to the same address/data.
- **Seams:** a stage→social trigger; social generation already exists.

### Build 5 — Lake→product read path (auto-stage) *(later)*
Give `lib/` a read path into `listing_transitions`/`listing_state` so a real status change (price cut,
pending, sold) can **auto-suggest** the next stage. Closes the "AI knows what's happening" loop.
- **Seams:** a new lake reader (aggregate-at-source) feeding the project's stage suggestions; today zero
  consumers.

## Constraints (all builds)

- Four-lane / no-invention; every stage email's numbers are real, cited "SWFL Data Gulf", as-of MM/DD/YYYY.
- On-demand generation only — never batch the sequence.
- Offline verification (`bunx next build` + `bun test`); no live paid call to verify; commit + STOP for push.
- Parallel sessions are active in email/social — isolate in a worktree, stage explicit paths.
- Extend existing seams (deliverables, schedules, template-run, runBlockAi) — no new mandatory gate (RULE 3 C2).

## Recommended order & next step

Build 1 → 2 → 3 → 4 → 5. **Build 1 is the anchor** and also finishes the original F2 (saved address + confirm
turn). Next step: register + spec Build 1 (`node scripts/new-build.mjs listing-project-address "New Listing
project + saved address"`), then writing-plans.
