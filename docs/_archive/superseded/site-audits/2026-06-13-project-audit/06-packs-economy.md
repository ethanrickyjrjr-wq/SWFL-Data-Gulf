# Packs — economy / labor / macro / credit / permits / licenses / news / safety / logistics

**Health: mostly-ok.** The 16 packs in this lane are overwhelmingly deterministic (every number is computed in code; `skipSynthesisAgent`/`skipTriageAgent` are set throughout, so no LLM touches the math), empty-tolerant (each has a `rows.length === 0` / `!summary` guard returning a clean neutral read), and use proper prior-period comparison where momentum is claimed. The architecture is solid. The real risks are: (1) a genuine **orphan-slug hole** in `sector-credit-swfl` where ~10 NAICS prefixes the pack can emit are unregistered — exactly the conditional-metric-orphan pattern that has frozen master before; (2) two packs (`licenses-swfl`, `safety-swfl`) drive bullish/bearish votes off thresholds that are explicitly `[CITATION_NEEDED]` or engineering estimates; (3) `fgcu-reri` reads "mixed" by construction; (4) several doc/caveat/constant drifts that lie to the next reader. No invariant violations of the "LLM-does-math" or thin-pipe rules were found.

---

## [HIGH] sector-credit-swfl can emit ~10 unregistered `sector_NN_chargeoff_rate` slugs → master normalize orphan

**Location:** `refinery/packs/sector-credit-swfl.mts:135-159` (`NAICS_2DIGIT_LABEL`) + `:532-550` (per-sector metric emission) vs `refinery/vocab/brain-vocabulary.json` (only 13 `sector_NN_chargeoff_rate` literals registered; no `raw_slug_patterns` for them).

**Detail:** The pack's `NAICS_2DIGIT_LABEL` map enumerates 23 two-digit NAICS prefixes (11, 21, 22, 23, 31, 32, 33, 42, 44, 45, 48, 49, 51, 52, 53, 54, 55, 56, 61, 62, 71, 72, 81). For every sector with ≥5 resolved loans (`RANKING_MIN_RESOLVED`) it emits `sector_<naics>_chargeoff_rate`. But the vocab registers only 13 of these as literal `raw_slugs` + `slug_index` entries: **23, 42, 44, 45, 48, 52, 53, 54, 56, 62, 71, 72, 81**. Missing: **11 (Agriculture), 21 (Mining), 22 (Utilities), 31/32/33 (Manufacturing), 49 (Transportation), 51 (Information), 55 (Management of Companies), 61 (Educational Services)**. Unlike `permits-swfl` (whose per-corridor/per-zip slugs ARE covered by `raw_slug_patterns` globs), there is **no `sector_*_chargeoff_rate` pattern**. The moment a live SBA build crosses 5 resolved loans in, say, Manufacturing (NAICS 31-33 is plausible in Lee/Collier) or Transportation (48-49), the pack emits an unregistered slug that orphans master's Stage-2.5 normalize — the exact failure mode that held the 2026-06-03 and 2026-06-07 rebuilds per the cron-failure ledger. The bare master-only vocab check will NOT catch it until the data lands (these are conditional slugs).

**Fix:** Add a single `raw_slug_patterns: ["sector_*_chargeoff_rate"]` entry to a parameterized concept (mirroring the permits-corridor pattern), OR register the remaining 10 explicit `sector_NN_chargeoff_rate` literals + `slug_index` identities for every code in `NAICS_2DIGIT_LABEL`. The pattern is the cleaner fix and matches how permits already solved this. Verify with `bun refinery/tools/check-vocab-coverage.mts --all`.

**Model:** opus — invariant-touching (vocab/orphan contract), recurring break, needs judgment on pattern-vs-literal.

---

## [MEDIUM] licenses-swfl bullish/bearish thresholds are explicitly `[CITATION_NEEDED]`

**Location:** `refinery/packs/licenses-swfl.mts:16-26` (`LAPSE_RATE_BEARISH_THRESHOLD = 0.1`, `LAPSE_RATE_BULLISH_THRESHOLD = 0.05`).

**Detail:** Both thresholds that flip this brain's direction carry an inline `// [CITATION_NEEDED — verify this specific figure against the live report]`. The 10% bearish / 5% bullish lapse-rate cutoffs are the *entire* direction mechanism (`classifyBrainDirection`) and also set the per-metric direction on `licenses_lapse_rate_swfl` and the magnitude. The comment says "DBPR Construction Industry Annual Report cites ~8-9% statewide baseline" but flags that the specific figure is unverified. Per the project's Vendor-First rule (#1) and Data Provenance rule (#3), a direction-driving threshold cited to a report that hasn't been verified in-session is shipping an invented contract. If the real baseline is, say, 12%, then a healthy-cadence market reads "bearish" by construction.

**Fix:** WebFetch the live DBPR Construction Industry Annual Report (myfloridalicense.com/reports-and-publications/), confirm the statewide lapse/renewal baseline, and either anchor the thresholds to the cited figure with a real URL or convert to a relative read (this-period lapse vs trailing baseline). Resolve the `[CITATION_NEEDED]` markers in the same commit.

**Model:** sonnet — well-specified once the figure is verified; the verification is a single doc fetch.
**Web question:** What lapse/non-renewal rate does the current FL DBPR Construction Industry Annual Report cite as the statewide baseline for contractor licenses?

---

## [MEDIUM] fgcu-reri reads "mixed" by construction; per-county home-price rows triple-count in the direction tally

**Location:** `refinery/packs/fgcu-reri.mts:201-216` (direction tally loops `for (const row of latest)` over every row in the latest month).

**Detail:** The brain-level direction counts EVERY row in the latest report month — `swfl`-aggregate indicators AND the per-county `home_prices_single_family` rows (Lee + Collier + Charlotte = 3 separate rows). Two problems: (1) **Mixed-by-construction** — direction is `mixed` whenever `bullish > 0 && bearish > 0`. With ~8 indicators plus 3 county home-price rows (~11 signals), and `unemployment_rate` polarity-inverted, the probability that all ~11 move the same polarity-adjusted way in any given month is near zero. So this brain almost always emits `mixed`, which carries no decision signal to master. (2) **Triple-counting** — home prices contribute 3 votes (one per county) while every other indicator contributes 1, silently overweighting housing in the tally. The conclusion line `"${bullish} of ${bullish + bearish} polarity-adjusted indicators positive"` inherits the same skew.

**Fix:** Either (a) restrict the tally to `swfl`-county aggregate rows only (count each indicator once), or (b) use a net-signal threshold (e.g. bullish unless `bearish/(bullish+bearish)` exceeds a cutoff) so a lone inverse mover doesn't force `mixed`. Collapse the 3 county home-price rows to one vote (mean or swfl aggregate) before tallying.

**Model:** opus — direction-logic design choice with downstream master impact; needs judgment on the right aggregation.

---

## [MEDIUM] safety-swfl direction threshold + magnitude divisor are unvalidated engineering estimates

**Location:** `refinery/packs/safety-swfl.mts:77-100` (`DIRECTION_THRESHOLD_PCT = 3`, `MAGNITUDE_YOY_DIVISOR = 15`, `COVERAGE_SHIFT_SUPPRESS_PCT = 10`).

**Detail:** All three tuning constants that govern this brain's bullish/bearish call and magnitude are flagged "Engineering estimate — see SOURCED.md". A ±3% YoY rate move flips bullish/bearish; below it neutral. UCR county property-crime rates routinely swing several percent year to year from reporting noise alone (the file itself documents a Cape Coral PD roster shift causing ~25% denominator moves), so 3% may be inside the noise floor — producing a confident direction off statistical jitter. The coverage-shift guard (>10% covered-pop move → suppress to neutral) is a good defensive mechanism, but it doesn't cover the 3-10% band where roster churn still moves the rate without tripping the guard. This is less severe than licenses-swfl because the guard exists, but the core threshold is still unanchored.

**Fix:** Pull the historical Lee/Collier UCR property-crime rate series and compute the actual YoY revision/noise band; set `DIRECTION_THRESHOLD_PCT` above it (analogous to how macro-swfl cites the ±0.2pp BLS LAUS revision floor). Document the derivation in SOURCED.md, not as "engineering estimate."

**Model:** opus — needs empirical calibration against the real series + judgment on the noise floor.
**Web question:** What is the typical year-over-year revision/volatility band for FBI CDE NIBRS county-level property-crime rates (Florida agencies)?

---

## [LOW] logistics-swfl-nowcast: docstrings and constant names say 90 days; the actual values are 6 and 24

**Location:** `refinery/packs/logistics-swfl-nowcast.mts:88-109` — `COLD_START_THRESHOLD_DAYS = 6` (docstring above it: "Chosen at 90 days"; "Below 90 days the rolling stddev…"; "Picking the same threshold…"); `ROLLING_WINDOW_DAYS = 24` (docstring: "Set equal to the cold-start threshold by design… every subsequent day's math uses the same 90-day window").

**Detail:** The values were lowered (presumably so the shock detector could leave cold-start with realistic daily-cron history) but the surrounding docstrings, the `STALE_STRUCTURAL_CONSECUTIVE_DAYS = 90` "same operational horizon" rationale, and the metric labels (`label: "...must be ≥ ${COLD_START_THRESHOLD_DAYS}..."` renders "6", fine; but `label: "Rolling-mean baseline (last ${historyDays} of up to ${ROLLING_WINDOW_DAYS} prior runs)"` renders "24" while prose says 90) all still claim 90. Worse, the two constants are no longer equal (6 ≠ 24), directly contradicting "Set equal to the cold-start threshold by design." The math is internally consistent — it uses the real constants — but every reader (and the next session) is told the wrong horizon, and the "horizons aligned, no one has to remember two numbers" claim is now false. The 30d/90d state-machine escalation thresholds (`STRUCTURAL_BREAK`/`STALE_STRUCTURAL`) can never fire from a 24-row window, which the caveat at `:654` half-acknowledges but the cold-start docstring contradicts.

**Fix:** Rewrite the two docstrings to the actual 6 / 24 values, drop the "set equal by design" claim (or re-align the constants if equality was the intent), and reconcile the cold-start horizon with the 30/90-day escalation thresholds (note explicitly that escalation is unreachable from current Tier-2 cadence).

**Model:** sonnet — mechanical doc/comment correction against known values.

---

## [LOW] rsw-airport `grain_boundary` claims PGD is not an LCPA airport while the pack emits PGD metrics

**Location:** `refinery/packs/rsw-airport.mts:277-279` (`grain_boundary.not_available[0]`: "PGD (Punta Gorda) enplanements — LCPA does not operate that airport; Charlotte County Airport data not yet sourced") vs `:123-134` + `:189-221` (the pack filters `airport_code === "PGD"`, computes `latestPgd`, and emits `pgd_monthly_enplanements` + `pgd_yoy_pct_change`) and the docstring `:18-20` ("SWFL's two LCPA airports: RSW … and PGD (Punta Gorda)").

**Detail:** The `not_available` caveat flatly contradicts the rest of the file: the docstring says PGD is one of LCPA's two airports, and the producer emits two PGD metrics with citations to the LCPA source. A downstream Claude that reads the `grain_boundary` block will tell a user "we don't have Punta Gorda data" while two PGD metrics sit in the same payload — a self-contradicting answer. Either PGD is sourced (then the caveat is wrong) or it isn't (then the PGD metrics are fabricated/empty).

**Fix:** Determine ground truth (does the LCPA statistics page actually report PGD?). If yes, delete the `not_available[0]` line. If PGD rows are never populated, remove the PGD emission code instead. Do not ship both.

**Model:** sonnet — once ground truth is known, the edit is mechanical; the verification is a quick source check.
**Web question:** Does the Lee County Port Authority statistics page (flylcpa.com/about/statistics) publish Punta Gorda (PGD) enplanements, or only RSW?

---

## [LOW] rsw-airport / fgcu-reri percent metrics use `display_format: "raw"` with `units: "%"`

**Location:** `refinery/packs/rsw-airport.mts:155-169` & `:206-220` (`rsw_yoy_pct_change`, `pgd_yoy_pct_change`: `units: "%"`, `display_format: "raw"`); `refinery/packs/fgcu-reri.mts:120-144` (`addMetric` sets `display_format: "raw"` for all YoY % / pp metrics).

**Detail:** The locked `BrainOutputMetricDisplayFormat` enum is `"currency" | "percent" | "count" | "ratio" | "raw"`. A year-over-year percentage tagged `display_format: "raw"` will render as a bare number (e.g. "-3.2") rather than "-3.2%", losing the unit on the consumer surface. The macro-us / macro-florida / safety-swfl packs correctly tag percent metrics `display_format: "percent"`. This is a cosmetic-but-real inconsistency that can drop the "%" from a headline aviation/economic number on the speaker layer.

**Fix:** Change these percent/pp metrics to `display_format: "percent"`. (Leave `units` as-is or normalize "%" → "percent" to match peers.)

**Model:** sonnet — trivial mechanical edit, well-specified.

---

## [LOW] safety-swfl SWFL-YoY fallback is an unweighted mean of two counties' rates; rate fallback is Lee-only

**Location:** `refinery/packs/safety-swfl.mts:206-248` (`swflRate` falls back to `leeRate` alone when population is missing; `swflYoy` falls back to `(leeYoy + collierYoy)/2`).

**Detail:** When `leePop`/`collierPop` are present the SWFL rate and YoY are correctly population-weighted. But when population is null, `swflRate` silently becomes **Lee-only** (Collier dropped entirely) and `swflYoy` becomes a **simple unweighted average** of the two county YoY percentages. Lee's population is ~3× Collier's, so an unweighted YoY mean overweights Collier, and a Lee-only headline rate labeled "SWFL (Lee + Collier) population-weighted" (the metric label at `:322` says "population-weighted") is then mislabeled. The direction/magnitude derive from this fallback `swflYoy`, so the headline call can shift on the averaging method. The coverage caveat is emitted but doesn't disclose that the headline silently degraded to Lee-only / unweighted.

**Fix:** When population is unavailable, either (a) suppress the combined SWFL rate/YoY and surface per-county only, or (b) keep the fallback but change the label/caveat to state it is unweighted / Lee-only, never "population-weighted." Population should virtually always be present (it's the per-1k denominator), so option (a) is cleanest.

**Model:** sonnet — bounded change with a clear correctness target.

---

## [NIT] econ-dev / news momentum direction is correct, but headline count excludes most feed items with no rolling validation

**Location:** `refinery/packs/econ-dev-swfl.mts:62-71` (`QUALIFYING_CATEGORIES`) + `:276-293` (direction); `refinery/packs/news-swfl.mts:443-451` (direction).

**Detail:** Both packs correctly use prior-period (90d vs 90-180d) comparison for direction and correctly fall to neutral when `prior.length === 0` — the MEMORY-flagged "direction must be prior-period comparison" rule is satisfied, and news-swfl correctly does NOT apply a broken `is_construction` guard to its main vote. The minor concern: econ-dev's headline momentum is built on only `QUALIFYING_CATEGORIES` (relocation/expansion/grant/infrastructure), a hardcoded calibration knob — a single mis-classified announcement category at the pipeline can swing a low-count window (`magnitude` scales with `ratio = |delta|/prior.length`, so with prior=2 one extra project is +50%). This is inherent to a thin-count momentum signal, adequately caveated; flagging only so the next session knows the category filter is load-bearing on the direction.

**Fix:** No code change required. Optionally widen the momentum to a count-floor (e.g. require prior ≥ 3 qualifying before voting non-neutral) to avoid jumpy direction on tiny windows.

**Model:** sonnet — optional hardening, low ambiguity.

---

## Notes on what is SOLID (verified, no action)

- **Deterministic math / no-LLM:** every pack sets `skipSynthesisAgent` (and usually `skipTriageAgent`); all counts, medians, z-scores, ratios, votes are computed in `outputProducer`/`corpusSummary`. No LLM-does-math violation found.
- **Empty-tolerance:** all 16 packs return a clean neutral read with a diagnostic caveat on zero rows. `logistics-swfl` correctly throws (fails loud) on a *live* empty build (`:231`) while degrading gracefully in fixture mode — good ODD discipline.
- **Charge-off rate read-as-written:** `sector-credit-swfl` uses the resolved-loan denominator (`n_chargeoffs / (n_chargeoffs + n_paid_in_full)`) and explicitly ignores the MV's `chargeoff_pct`, matching the franchise-outcomes convention (`:228`, `:586`). Correct.
- **tourism-tdt** YoY county_count guard (`:157-164`) correctly suppresses apples-to-oranges YoY when only one county reported, and the $0-prior-year guard avoids +∞% reads. Solid.
- **safety-swfl** coverage-shift guard correctly suppresses direction to neutral on a >10% covered-population move (NIBRS roster change) — good defensive design.
- **permits-swfl** per-corridor and per-zip dynamic slugs (all 5 buckets × Lee/Collier × corridor/zip) ARE fully covered by `raw_slug_patterns` globs. Lee null-lat/lon fallback to county-level z is handled (`:327-339`).
- **sector-credit direction asymmetry** (bearish needs worst>30%; bullish needs worst≤15% AND best≥95%) is intentional credit-risk conservatism, not a bug — noted but not flagged.
