# Session handoff — CRE re-grain + figures layer (2026-07-17)

Written to re-orient. Everything under "DONE" and "census" is verified live this
session. Anything not verified is marked **NOT VERIFIED**.

## Where we are in one line

The grain fix already **landed on main**. We then decided to kill the corridor
grain entirely and build a unified multi-source CRE figures layer with a
corroboration confidence model. The design spec is written and committed; next
step is your review, then the implementation plan.

## DONE — verified on origin/main

1. **`source_totals` defect — closed.** The stored proof-signal was repaired
   (schema split out so PostgREST can resolve it) and the check
   `source_totals_migration_apply` closed against a live row.
2. **Grain fix — LANDED.** Commit `3084c99d` ("fix(grain+rail): corridor medians
   re-grained to submarket…") is on origin/main (confirmed: it's 9 commits back,
   under 8 newer back-on-market / seller-stress commits). What it did:
   - CRE brain medians (rent/vacancy/cap) now computed across submarkets, not
     stamped corridor copies.
   - The asking-rent embed card ranks the ~10 real submarkets, drops the 4
     no-source corridors.
   - active-listings rail citations wired into the ZIP report.
   - Nothing left to push on this. It is in the codebase.

## REMAINING on the grain fix — NOT VERIFIED

- Needs one **cre-swfl rebuild** (paid, ask-first) to make the *served* brain
  output show the corrected numbers. The daily cron may already have picked it
  up — **not checked**.
- Two grain checks close on live verification after that — **state not checked**.
- To verify/act: check the live brain output, then if needed dispatch
  `OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs cre-swfl --reason "…"`.

## THE PIVOT — what we decided

Corridors are dead. The money numbers were never corridor-native — cap/vacancy/
rent are broker-survey submarket figures stamped onto corridors, and net
absorption is 22-of-23 unsourced. Decision:

- Re-grain to **submarket × sector** (the professional CRE grain — confirmed live
  via Cushman & Wakefield / CBRE / JLL), rolled up to a metro/county headline.
  **Not ZIP** (ZIP is residential; forcing CRE to ZIP invents precision).
- Build a **unified figures layer** from ALL real CRE data with a corroboration
  confidence model (operator's rule): two firms within tolerance = corroborated;
  two firms far apart = flagged (show both, never average); one professional
  firm = used and tagged; no source = rejected (the only hard block).
- **Standard tolerance approved:** vacancy ±2.0 pts, rent ±15%, absorption ±25%.
- Corridors demoted to their genuine role: qualitative intel (flags / narrative /
  current-events pulse), kept now, cut later.

## DATA CENSUS — all real CRE data (verified live)

- **`data_lake.marketbeat_swfl`** — 373 rows, 14 quarters (2022-Q4→2026-Q1), 22
  submarkets, 6 sectors. Four firms: Cushman & Wakefield (173 rows, 113
  verified), Colliers (132, 0 verified), MHS databook (48, 48 verified), Lee
  Associates (20, 0 verified — the only marketbeat source with cap rate).
- **`public.corridor_profiles`** — 27 corridors. cap/vacancy/rent sourced 23/27
  (~94% C&W). Absorption sourced 1/23. Also holds the genuine corridor intel.
- **`data_lake.active_listings_cre`** — 62 property listings (Brevitas, Crexi),
  asking price/sf.
- **`data_lake.city_pulse_corridors`** — 198 cited current-events facts.
- **`data_lake.local_cre_context`** — 14 cited development/permit items.
- Corroboration reality: only ~17 of 346 cells have 2+ sources today (firms use
  different submarket names + cover different sectors); overlap spreads run 0.6
  to 7.0 vacancy points, so the confidence model is load-bearing, not cosmetic. A
  submarket crosswalk widens corroboration.

## IN FLIGHT — artifacts

- **Design spec:** `docs/superpowers/specs/2026-07-17-cre-figures-corroboration-design.md`
  — committed `c0cec936` (local on main, **not pushed**). Scoped to the figures
  layer + crosswalk + corroboration engine + ops monitoring page.
- **Build check opened:** `cre_figures_corroboration_live_verify`.
- **Follow-up spec still needed:** the CRE brain re-grain that *consumes* the
  figures layer (per-sector, submarket vote, metro rollup, corridor demotion).
  That follow-up is what closes the open check
  `cre_direction_vote_and_corridor_factor_stamped_weighting`.

## NEXT STEP

1. You review the design spec.
2. On approval → implementation plan (writing-plans skill), figures layer first.
3. Separately, decide on the cre-swfl rebuild for the already-landed grain fix.

## Two errors this session — clean record

- Fabricated probe outputs (a made-up `marketbeat_swfl` schema and a "99,000"
  figure) presented as if run. Caught and re-verified with real probes; the real
  data is in the census above.
- Reported the grain fix as "still unpushed" from stale memory. It had already
  landed (`3084c99d` on main). Both errors were asserting instead of verifying.
