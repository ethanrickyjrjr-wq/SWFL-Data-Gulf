# Precompute + validate + cache deliverable narratives before builder

**Date:** 2026-08-06

> ## ⛔ SUPERSEDED SAME DAY — THIS SPEC'S PREMISE IS WRONG. DO NOT BUILD FROM IT.
>
> **Read `docs/superpowers/plans/2026-08-06-precomputed-commentary-plan.md` instead.**
>
> Two errors, both found by probing live instead of re-reading this file:
>
> 1. **The target path is DEAD.** `deliverable_build` last fired **07/17/2026** — zero calls in the
>    30 days to 08/06. `/refresh` has been used **once, ever** (1 of 92 `deliverables` rows). The
>    "re-fires on every `/refresh`" problem below is real in code and worth ~nothing in practice.
>    The live narrative traffic is **`email_build`, 636 calls / $5.89 per 30 days** — a different
>    call site (the recipe path) that this spec conflated with `buildDeliverableNarrative`.
> 2. **The mechanism it proposes designing ALREADY EXISTS.** `scripts/bake-narratives.mts` +
>    `lib/narratives/*` is a live precompute → validate → cache pipeline (1,446 calls/30d) with an
>    `inputsHash` delta gate, a fail-closed no-invention validator, the `public.narratives` table,
>    Batches-API pricing, spend caps, and three surface adapters. `lib/email/zip-seed.ts:76` already
>    reads a baked row into an email. The work is a 4th adapter, not a new system.
>
> Kept, not deleted, as the record of the miss — SCRATCHPAD 0z (07/21/2026, *"there is no
> traffic..is there?"*) is the same failure, and this is its second occurrence.

**Status:** SUPERSEDED. Original status line: *RESEARCH DONE, NOT YET BRAINSTORMED/PLANNED.*

## Origin

Operator, mid-market-pulse-walk (08/06/2026): *"Has to be a fucking way we can get commentary
that is checked before it hits builder and builder can just add a CTA and a little extra
commentary."* Traced live (not from memory) to a real, already-documented gap — see Problem.

## Problem

`lib/deliverable/build.ts:478-561` `buildDeliverableNarrative()` fires a synchronous, uncached
Sonnet call (`callType: "deliverable_build"`) on every `/api/deliverables/[id]/refresh`, even when
the source brain hasn't moved since the last render. Same shape in each of the 8
`lib/deliverable/recipes/*.ts` files. Tracked generically since 07/30/2026 as row 12 of the open
check `precompute_candidates_triage` (16 rows total, repo-inventory-audit.md
`#precompute-candidates`) — this spec scopes ONE row of that list into an actual build instead of
a pending triage decision.

## Goal

Move narrative generation from "inline, per-request, unchecked-until-it-ships" to "generate once
per real change, validate before it's readable by any builder path, cache it, serve the cached
row." Builder becomes a reader of an already-checked row plus a thin CTA/extra-commentary layer —
matching the operator's own phrasing — not a live LLM caller on the request path.

## What already exists to build on (don't reinvent — RULE 0.5)

- **Validation-and-retry shape already exists, just inline:** `gateNarrative()` +
  one-regeneration-then-hard-strip (`build.ts:516-530`). The precompute version needs the SAME
  gate, run once at generation time instead of per request.
- **Cache pattern already exists and is live:** `lib/figures/sourced.ts` `getSourcedFigures()` —
  `public.sourced_figures`, `expires_at`-keyed, empty-tolerant (no creds/rows/error → `[]`, never
  throws, never invents). This is the shape to copy for a `narrative_cache`-style table, not a new
  pattern.
- **The one recipe already immune to the "AI invents numbers" bug:** `market-pulse.ts` —
  `pulseUserMessage` takes `SettledClaim[]` (never raw rows), model sentence audited against zero
  digits, fail-closed. Generalizing THIS shape across the other 7 recipes is a prerequisite, not a
  side effect, of caching their output — caching a bad validator just serves stale bad output
  faster.

## Mechanism options (researched via crawl4ai — full detail in
`_RESEARCH/deliverable-and-design/2026-08-06-precompute-narrative-cache-research.md`)

1. **Vercel Cron + API route** (recommended starting point) — zero new dependency, matches the
   114-workflow GHA-cron convention already proven in this repo, `vercel.json` `crons:` already
   exists. Retry logic is the same hand-rolled regenerate-once-then-strip we already have, just
   moved from per-request to per-cache-refresh.
2. **Vercel Workflows** (`'use workflow'`/`'use step'`, durable retry/replay, Vercel Queues under
   the hood) — new managed-product dependency, step-level observability for free, better fit ONLY
   if the pipeline grows multi-step (e.g. folding in the band-guard's live web-confirm loop,
   `build.ts:538-558`, as its own durable step). Not justified at current volume (9 recipe files,
   day-cadence refresh) per RULE 11 — do not adopt without an explicit operator sign-off on the
   new dependency.

## Steps to succeed (for the brainstorm + Opus plan to work from)

1. **Pick the cache key.** Not just `expires_at` (sourced_figures' shape) — a narrative row also
   goes stale when its SOURCE BRAIN rebuilds. Needs a second staleness signal keyed to the source
   brain's `refined_at`, or the cache silently serves a narrative describing pre-rebuild numbers.
   This is the one place `sourced_figures` genuinely doesn't have a precedent to copy — design it
   fresh, small.
2. **Generalize the market-pulse validator, not just its cache.** Caching `authorListingNarrative`
   or the other 7 recipes' output without first giving them market-pulse's `SettledClaim`-only +
   zero-digit-audit discipline just serves a bad narrative faster and more confidently. Order
   matters: validator-hardening before caching, per recipe.
3. **Decide the trigger.** Cron-on-a-schedule (misses same-day data changes, simplest) vs.
   triggered-on-brain-rebuild (freshest, needs a hook into the existing GHA rebuild dispatch path,
   `scripts/dispatch-rebuild.mjs` / `refinery/lib/resilient-build.mts`). Don't default to the more
   complex option without naming why the simple one fails first.
4. **Keep the live path as fallback, not dead code.** A cache miss (new recipe, new subject, TTL
   lapsed and cron hasn't run yet) must still generate live and gate — same as today — never a
   blank builder slot. This is RULE 0.7 (four-lane sourcing: a gap fills from the next lane, a
   build is never refused for missing a precomputed row).
5. **Cost the mechanism before picking one.** Fetch `/docs/workflows/pricing` (not yet pulled this
   pass — see research file's "not verified" section) before committing to lane 2; RULE 0.9 §4
   forbids leading with cost as the ARGUMENT against a direction, but the spec still needs the
   number to make an informed pick between lane 1 and lane 2.
6. **Scope to the market-pulse-walk's actual ask first.** The operator's trigger was ONE recipe
   (market-pulse) during a live walk, not a request to rebuild all 8 recipes' pipelines this
   session (see `_ASSISTANT/SCRATCHPAD.md` 08/06/2026 entry — decision was "widen inline now,
   precompute is a separate bigger project"). This spec is that separate project; do not let it
   block or reopen the in-flight market-pulse walk (`2026-08-06-market-pulse-walk-design.md`).

## Failure modes (RULE 3.5 — fill out fully in the brainstorm pass before implementation)

- **Stale-serve:** cache row outlives its source brain's rebuild → guard = staleness key from step 1.
- **Silent-empty:** cache miss with no live fallback → guard = step 4, empty-tolerant contract like
  `sourced_figures`.
- **Validator-gap-hidden-by-cache:** a bad narrative gets cached and re-served to every builder call
  instead of failing once per request → guard = step 2 (harden validators before caching), plus a
  cache row must carry its own gate-pass evidence (was it hard-stripped on write? that fact needs
  to travel with the row, not just the final text).
- **New-dependency creep:** adopting Workflows without a volume justification → guard = step 5 +
  explicit operator sign-off, per RULE 0.9 §3.

## What we're building

Not yet decided — this file is the research + steps-to-succeed handoff. Next: run
`superpowers:brainstorming` on this problem, then write the plan (Opus) from the resulting design.
