# Listing signals — what separates a property that means something (assembly plan)

**Date:** 2026-07-20 · **Status:** plan, not yet a registered build
**Origin:** operator ask — "what system finds anomalies in house pricing or changes that show
the seller is probably willing to go lower… back on market, off market, price reduction, sq ft
too low or high, DOM. Everything we can look at."

**This is an assembly plan, not a new architecture.** Two operator-approved specs from 07/19
already cover most of this territory, and a five-check engine is built and sitting dark. The job
is wiring and gap-closing. Nothing here reopens
`2026-07-19-why-isnt-it-selling-design.md` or `2026-07-19-sell-odds-model-design.md`.

---

## 1. Coverage map — the operator's list against what exists

| Signal asked for | Where it lives | State |
|---|---|---|
| Price anomaly (list price + $/sqft vs cohort) | `lib/why-not-selling/checks/price-position.ts` | BUILT, dark |
| Price reduction (count, depth, dates, gaps) | `checks/price-cuts.ts` + `cut-history.ts` | BUILT, dark |
| Price-cut area share | `listing_momentum_stats.price_reduced_share` (**0–100**, not 0–1) | LIVE |
| DOM vs typical | `checks/market-speed.ts` | BUILT, dark |
| Cumulative DOM across relists | `checks/cumulative-time.ts` | BUILT, dark |
| DOM data itself | `data_lake.listing_dom` — **54.2% floored live 07/20** (15,275 real of 33,373) | LIVE, degraded |
| Back on market — area rate | `lib/back-on-market/` + `/r/back-on-market` | LIVE |
| Back on market — per address | `lib/back-on-market/relist-fact.ts` | BUILT, **flicker-contaminated** |
| Off market — area rate | `seller-stress-swfl` (cancellation / relisting / delisting per ZIP) | LIVE |
| Anchor gap (bought for $X in YYYY, value moved Y%) | `checks/anchor-gap.ts` + `parcel-read.ts` + `zhvi-change.ts` | BUILT, dark |
| Sqft too low/high vs cohort | — | **GAP** |
| Off market per address (withdrawn as signal) | — | **GAP** |
| "Seller probably willing to go lower" (synthesis) | sell-odds hazard model | substrate LIVE, model pending labels |

**The headline:** the answer to "everything we can look at" is that we already look at most of it.
Five pure-function checks exist in `lib/why-not-selling/` with tests, and **zero code imports
them** (confirmed: scratchpad item #5, repo-wide). The single highest-leverage move is not
building signals — it is giving the built ones a consumer.

## 2. Substrate that is already live (do not re-plan)

- **`listing_lifecycle`** daily SteadyAPI sweep → `listing_state` (spine) + `listing_transitions`
  (event log). Price cuts are discrete events (`from_state = to_state`, `price_delta < 0`);
  relists are `from_state='holding' → to_state='active'`.
- **`listing_dom`** — per-listing `dom_days` / `cdom_days` / `dom_is_floor`. Wording authority is
  `lib/listings/dom.ts formatDom` — never compose DOM strings locally.
  **CORRECTION 07/20/2026 (live probe, supersedes the sell-odds spec's "9.9% floored" line):**
  33,373 active rows, **18,098 floored (54.2%)**, **15,275 with real DOM (45.8%)**. The 07/18
  backfill landed and was then wiped — the parked check `dom_backfill_repull_17k` (17,127 wiped
  `listed_date`s, ~17.2k vendor re-probe calls, awaiting operator go) accounts for essentially all
  of it. County split is the important part: **Lee 13,893 real of 23,579 (58.9%)**, but
  **Collier 1,214 of 8,667 (14.0%)** and **Hendry 168 of 1,127 (14.9%)**. The wipe hit Collier
  hardest, so any Collier cohort statistic is effectively unusable until the re-pull runs.
  Real-DOM distribution over the 15,275: median 52 days, p25 10, p75 159, p90 322; 6,133 at 90+
  days and 3,257 at 180+. Tail is dirty — 34 rows over 5 years, 2 over 10, max 7,550 days;
  needs a sanity ceiling before any percentile ships.
- **`listing_week`** — weekly person-period panel, **backfilled live 07/19** (30,849 + 31,844
  rows), Monday 08:00 UTC cron. The sell-odds spec's "cannot be backfilled later" urgency is
  already discharged; this is done.
- **`zip_active_dom_median(zip)`** — built and verified but **dormant** behind
  `buyer_leverage_zip_benchmark_maturity_gate` (the non-floored sample was too shallow on 07/18
  to call anything "typical"). Self-resolves per ZIP as the clean window ages.

## 3. The gaps, sized

### Gap A — the dark engine has no route (biggest win, smallest build)
`app/r/why-isnt-it-selling/page.tsx` is fully specced in the 07/19 design (route shape, four
input classes, SQL, honesty block). Five of the seven specced checks are already written. Build
the route + the two SQL functions (`zip_band_dom_median`, `zip_active_stale_share`) and the
operator's whole question has a live surface.

### Gap B — sqft outlier check (net-new, small)
`price-position.ts` computes $/sqft percentile; it does **not** flag sqft itself as anomalous
against the cohort. New `checks/sqft-outlier.ts`, same pure-function shape as its five siblings:
subject sqft vs property-type × ZIP cohort distribution. Flags "materially smaller/larger than
what else is selling here," which reframes a $/sqft reading — a 4,000 sqft home priced at cohort
$/sqft is a different story than a 1,100 sqft one. Suppression floor copied from
`lib/buyer-leverage/zip-benchmark.ts`.

### Gap C — scan-flicker-resistant relist detector (net-new, bounded)
The 07/17 back-on-market research resolved this by live probe: **5,579 `holding→active` events
exist and are fresh, but the raw count is contaminated** — `days_in_prev_state` freezes at 0 on
holding entry, so 100% of them read as "0–2 days off," a measurement artifact. Real departures do
persist underneath (899 @ 0–2d, 722 @ 3–6d, 1,319 @ 7–14d, 520 @ 15–30d by `last_seen`).
The build: stamp true off-market duration onto the relist event (reconstruct
`at − holding-entry last_seen`), surface only relists past a minimum days-off floor. Same build
adds a relist count column to `listing_transitions_recent_zip_stats`, which counts holdings /
sales / new / price-cuts but not relists.

### Gap D — withdrawn / off-market as a per-address signal (net-new, small)
Aged holdings resolve to sold or withdrawn (nothing persists past 30 days). A withdrawn-then-
relisted address is a distinct and stronger motivation signal than a simple price cut. Falls out
of Gap C's detector nearly free — a `checks/off-market-history.ts` reading the same stamped events.

### Gap E — the synthesis number (specced, clock-bound)
"Is this seller willing to go lower" as a single number is the **sell-odds hazard model**, Phases
1–3 of the 07/19 spec. Phase 1 (cohort facts — pure SQL over `listing_week`, no model) is
servable once suppression floors pass, realistically 8–12 weeks of labels. Phase 2 (trained
logistic model) needs mature 90-day cohorts, ~late Sept 2026. **Raw signals ship now; the
synthesized score sharpens over the summer.** That is the honest ceiling, not a hedge.

## 4. Sequence

1. **Wire the dark engine — LEE FIRST** — `/r/why-isnt-it-selling` route + `zip_band_dom_median` +
   `zip_active_stale_share`. Turns five built checks into a live answer. (Existing check:
   `why_isnt_it_selling_live_verify`.)
   **Revised 07/20 after the live DOM probe:** the per-home read is honest in any county
   (`dom_is_floor` is truthful row by row), but ZIP/cohort aggregates are only defensible in Lee
   (58.9% covered). Collier at 14.0% and Hendry at 14.9% get the subject read and the non-DOM
   checks; their DOM aggregates stay suppressed until the re-pull runs. This is a coverage gate,
   not a date gate — it self-resolves per county whenever `dom_backfill_repull_17k` lands.
2. **Relist detector (Gap C)** — unblocks honest per-address back-on-market, plus the relist
   column on the ZIP rollup.
3. **Two new checks (Gaps B + D)** — `sqft-outlier.ts`, `off-market-history.ts`, same shape,
   registered into the route.
4. **Sell-odds Phase 1 cohort facts (Gap E)** — pure SQL over the already-backfilled panel; ships
   when suppression passes. (Existing check: `sell_odds_model_live_verify`.)

Steps 1–3 are independent of the label clock. Step 4 waits on data maturity, not on us.

## 5. Constraints this plan carries

- **Detect the fact, never assert the reason.** A relist is observable; *why* a contract fell
  through is not in the record. The 07/17 research is emphatic — no-invention, defamation
  avoidance, and fair-housing all converge. The honest per-home statement is the fact plus the
  local base rate. `transitions.py` already encodes this (`holding` = reason unknown).
- **Never "stigmatized"** in product-facing copy — legal term of art (Fla. Stat. 689.25), and a
  back-on-market home is not one. Internal research label only.
- **Aggregate DOM is censored (T1), unevenly.** Every cohort stat carries the sample-size
  suppression pattern; below floor it is suppressed, never thinned to a smaller honest-sounding
  cohort. **Sample size is not sufficient here** — suppress on COVERAGE too. Live 07/20: Lee
  58.9% real DOM, Collier 14.0%, Hendry 14.9%. A Collier ZIP can clear a 30-row sample floor
  while representing 14% of its book, which is an artifact, not a market read.
- **Sanity-ceiling the DOM tail before serving any percentile.** 34 real-DOM rows claim over 5
  years on market, 2 over 10, max 7,550 days (20+ years). These are data defects, not
  long-sitters, and they drag p90 and any model feature built on DOM.
- **`price_reduced_share` is 0–100** in our `listing_momentum_stats` and **0–1** in realtor's
  `market_heat_core_swfl`. A future swap is a silent 100×.
- **No new mandatory layer.** These are sibling checks behind one route, sharing existing
  authorities (`formatDom`, `relist-fact.ts`, zip-benchmark suppression). The cross-listing
  ranked view already has a home — the Stale-Listing Radar fast-follow spec — and is not
  re-invented here (CLAUDE.md C2).

## 6. Cross-refs

- `docs/superpowers/specs/2026-07-19-why-isnt-it-selling-design.md` (route, SQL, checks 1–7)
- `docs/superpowers/specs/2026-07-19-sell-odds-model-design.md` (Phases 0–3; Phase 0 done)
- `_RESEARCH/competitor-and-strategy/2026-07-17-back-on-market-surface-research.md` (§6 lake probe)
- `_RESEARCH/competitor-and-strategy/STEADY-PAINS.md` (TIER-2 motivation-signal block)
- Open checks: `why_isnt_it_selling_live_verify`, `sell_odds_model_live_verify`,
  `buyer_leverage_zip_benchmark_maturity_gate`, `steady20_relist_outcome_tracking`
