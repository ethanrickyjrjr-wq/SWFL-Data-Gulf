# Handoff — Listing campaign: 12 recipes built, 6 then overwritten same day

**Date:** 2026-07-13
**Written by:** the session that investigated, NOT the sessions that did the building.
**Nothing in this doc was fixed by this session. This is a state-of-the-world record, verified against git, not memory.**

## The one-paragraph version

Today, in two separate passes by two separate sessions, hours apart: Pass 1 (roughly 13:00–17:00) built 12 real, working, wired-in email recipe builders — a 13-way parallel dispatch, adversarially verified. Pass 2 (17:13–18:43) took 6 of those 12 and ripped out each one's own custom-built layout, replacing it with a single shared flat layout — because that session never looked at what Pass 1 (or the 07/06 showcase designs) had already built. Nothing got un-wired. Nothing stopped working. What changed is that 6 of the 12 now produce a plainer, boxier email than they did two hours earlier, and 4 of those 6 also picked up a data-fill bug that prints one row of numbers twice in the STATIC PREVIEW PICTURE (not confirmed, see below, whether the live build itself does this too).

## Pass 1 — 12 recipe builders, ~13:00–17:00

Commits `8b369f62` (13:29) through `ea2e45d3` (16:49, "12 recipes built, adversarially verified"). Real files, real tests, real wiring:

`lib/deliverable/recipes/{agent-brand-intro,agent-launch,coming-soon,just-sold,market-comps,market-pulse,new-listing,open-house,price-reduced,review-reply,sphere-weekly,under-contract}.ts` — one file per recipe, each with its own `.test.ts`, ~12,600 lines added total. Plus `lib/deliverable/claims.ts` (the invented-number gate — real, valuable, catches fabricated figures) and `lib/deliverable/recipes/index.ts` (`builderFor(key)` — the dispatch table).

**Confirmed wired end to end, live, right now:** `/showcase` → click "Make this" on a campaign slide → `recipeDestination()` builds `/email-lab/grid?rkey=<key>&...` → the Email Lab build calls `app/api/email-lab/ai/route.ts` → `authorDoc()` in `lib/email/build-doc.ts` → `recipeByKey(key)` → `builderFor(key)` → the real builder file. This chain was verified by reading the actual import graph, not assumed.

## Pass 2 — "ONE chrome for all seven listing emails", 17:13–18:43

Commits `eece0302` (17:13) and `bf77c817` (18:43), by a session that wrote its own postmortem (`_AUDIT_AND_ROADMAP/2026-07-13-POSTMORTEM-built-under-the-design-system.md` — read it, it's honest and precise about its own failure). That session's stated problem: the operator asked for the 7 listing emails to share one consistent look, and instead of checking what already existed, it treated its own newly-written `lib/deliverable/recipes.ts` as the whole system, never found the REAL research-backed design system (`lib/email/author-recipes.ts` + the fence functions in `lib/email/author-doc.ts`), and built a second, parallel, worse layout system (`lib/email/lifecycle-chrome.ts`) from scratch.

**What it actually changed, confirmed by diff:** 6 of the 12 Pass-1 recipe files — `coming-soon.ts`, `just-sold.ts`, `market-comps.ts`, `open-house.ts`, `price-reduced.ts`, `under-contract.ts` — had their own individual grid-building code removed and replaced with a call into `buildLifecycleEmail()` (the new shared chrome: header → ribbon → photo → centered hero → one stat strip → the recipe's own middle → narrative → agent card → CTA → footer, every block full width). The DATA RESOLUTION in each file (the real address lookup, the real comps pull, the real price-history correction) was NOT removed — only the layout-building step was replaced.

`new-listing.ts` (the recipe file) was NOT touched in this pass. `lib/email/doc/default-docs.ts` (the separate SEED_DOCS skeleton definitions, used for the showcase preview gallery and as the Email Lab's starting canvas) WAS touched — the new-listing/open-house/price-reduced/just-sold entries there were widened to match the new chrome shape.

## Current state, per recipe (12 total)

**Untouched by Pass 2 — still exactly what Pass 1 built:** agent-brand-intro, agent-launch, market-pulse, review-reply, sphere-weekly, new-listing (recipe-builder level; its SEED_DOCS skeleton did change, see above).

**Layout replaced by Pass 2 (data resolution intact, output shape now flat/shared instead of bespoke):** coming-soon, just-sold, market-comps, open-house, price-reduced, under-contract.

## The duplicate-row bug — confirmed WHERE, not fully confirmed how far it reaches

**Confirmed:** the STATIC PREVIEW PICTURES (`public/showcase/seed-previews/{new-listing,open-house,price-reduced,just-sold}.webp`, rendered via `lib/email/doc/preview-fill.ts`'s `previewFill()`) show the same 3-4 numbers printed twice in one row. Root cause, read directly in `preview-fill.ts:882-890`: `default-docs.ts` widened these templates' empty stat-cell count from 3 to 5-6 today, but `preview-fill.ts`'s `SEED_ASSIGNMENTS` fill data for each of these four still only has 3 real values — its cell-filler cycles that 3-item array across 5-6 empty cells and repeats. This file (`preview-fill.ts`) was NOT touched by either pass today; it just went stale the moment the block shape changed.

**NOT verified:** whether an actual live build (typing a real address into the Email Lab and building open-house/price-reduced/etc.) produces the same duplicate. The live path builds `chrome.specs` from each recipe's own function (e.g. `openHouseSpecs(facts)`, read directly — it returns exactly 5 correct, non-duplicated items), which is a different code path than `previewFill()`. It looks like it should NOT duplicate, but this was never actually tested against a live build this session. Don't assume either way — check `lifecycle_chrome_dup_stats_row` (existing check, has the exact file/line references) before trusting a guess here.

## The showcase designs — real, mostly disconnected from Pass 1/2's output

`public/showcase/listing-to-close/` (built 07/06/2026, a full week before today) is a hand-designed, research-backed version of coming-soon/new-listing/market-comps/under-contract/just-sold — real screenshots + real static HTML at `public/showcase/listing-to-close/live/*.html`. Its registry entries (`lib/showcase/registry.ts`) already point at the exact same recipe keys Pass 1/2 built (`RECIPES["coming-soon"]` etc.) — the names were never the problem, the two things were just never compared to each other before either pass started today.

Three other showcase campaigns exist and are live on `/showcase` today (verified via a direct fetch of the production page): `launch-blitz` (agent-brand-intro, social-pack), `agent-launch` (agent-launch, sphere-weekly, review-reply), `market-pulse` (market-pulse, social-cut). None of the 6 recipes Pass 2 touched appear in these three.

## Open checks already tracking pieces of this (don't duplicate, extend these)

- `builders_bypass_the_fence_system` — the layout-bypass problem itself.
- `email_design_system_one_exit_seam` — the prescribed fix (`finalizeDoc()` as the only legal way to produce a positioned doc).
- `one_catalog_seeds_get_recipe_keys` — the SEED_DOCS/RECIPE_KEYS name-collision cleanup.
- `lifecycle_chrome_dup_stats_row` — the preview-capture duplicate-row bug, with exact file/line already written down.
- `showcase_designs_buildable_as_options` — operator priority: keep every existing designed look as a selectable option, don't collapse to one.
- `campaign_chrome_one_look` — the original ask that started Pass 2, plus its own "other 6 in flight" note.
- `deliverable_coherence_gate_live_verify` — CLOSED this session, unrelated to the above (the 07/11 luxury-report chart fix; confirmed live, its stale showcase screenshot was recaptured tonight).

## What this session did (separate from all of the above, already committed locally)

Recaptured all 27 seed-preview screenshots (`c6957ff5`, NOT pushed by this session — it ended up on `origin/main` via a concurrent session's `safe-push` bundling it in; confirmed deployed to production, commit `9b6dff19`, 2026-07-14T01:08:44Z). That fixed the luxury-market-report chart (real, 07/11 fix, was just stale) and, as an unavoidable side effect of recapturing everything at once, made the Pass-2 duplicate-row bug visible on 4 tiles that were previously showing stale (pre-bug) pictures.

## What was NOT done

No code was changed to fix the chrome/fence bypass, the duplicate-row bug, or the disconnect between the showcase designs and the 6 overwritten recipes. Every fix described above (`email_design_system_one_exit_seam` etc.) is diagnosed, not applied. Nothing further should be built from this doc without the operator's explicit go — that's the standing instruction for tonight, not a default policy change.
