# Hurricane Ian Retrodiction Demo — Pre-Registration & Receipts

**Date:** 2026-06-05 · **Status:** complete (committed, not pushed — RULE 1 diff-review) · **Tracker:** check `ian_retrodiction_demo` · **Script:** `refinery/tools/ian-retrodiction-demo.mts`

---

## The honest framing comes first

**Hurricane Ian was exogenous, and the pre-Ian call was BEARISH on a pre-existing trend — NOT a hurricane forecast.** A lagging county labor indicator (LAUS unemployment, first-released vintage) cannot foresee a landfall. The bearish read reflects a **summer rise in unemployment that was already present before Ian** (Lee initial vintage rose 2.4% → 2.7% across May→August 2022). Any "the system saw Ian coming" framing would be dishonest. It didn't, and the demo is built to make that impossible to claim.

What this demo **does** prove: the already-shipped deterministic decision function runs **end-to-end on live point-in-time data** — a pre-registered, falsifiable call resolved against a realized outcome, with no number tuned to the event. What it does **not** prove: skill. **N≈1.** It is illustrative, and it **does not lift the Track-B HOLD** (`row_tier_build_remaining`).

---

## Why this is "pre-registered"

The methodology was **fixed in advance**, in shipped code, before this event was scored:

- The **forward grader** (`refinery/grade/grade-predictions.mts` `computeDirection`) and the **backward decision adapter** (`refinery/lib/backtest/decision-fn.mts` `computeBacktestCall`) were already written and unit-tested (29/29 passing).
- The **grade-config** for the metric is resolved from the vocabulary + loader fallbacks, **not hand-set for Ian**: `laus_lee_unemployment_rate_initial_vintage` declares only `direction_polarity: "lower_is_bullish"`; `value_type: "ratio"` supplies `{grade_basis: "delta", epsilon_mode: "absolute", epsilon: 0.05}` and `category: "macro"` supplies `window_days: 90`.
- The **outcome rule** is the existing `properties-lee-value` pack's z-score with its shipped ±1.0 thresholds and trailing-3-year population-std baseline.

Nothing about thresholds, epsilon, polarity, or window was chosen after seeing the outcome. Every number below is **read live and computed** by the script (it hardcodes none of them); the only fixed inputs are the event constants (landfall date, the two anchor years).

### Data sources (live)

- **As-of input (prediction side):** ALFRED LAUS initial vintages, series `FLLEEC7URN` (Lee County unemployment rate), read from the **pinned** Tier-1 snapshot `s3://lake-tier1/macro/fred_laus_alfred/2026-06.parquet`. "Initial vintage" = the value at the earliest `realtime_start` per observation month — i.e. what was publicly available at decision time, before BLS revisions. Source tag: `lake_tier1`.
- **Outcome (realized side):** LeePA sale-**velocity**, `data_lake.leepa_parcels_sales_yearly` (`sale_year`, `sales_count`). **Price-free — sale counts only; no per-parcel sale-price column is read.**
- **TDT (tourism collections):** **NOT live** (no `data_lake` table; fixture-only). Excluded here → **Phase 2 validation, pending the TDT self-ingest migration.**

---

## Receipts (verbatim `bun refinery/tools/ian-retrodiction-demo.mts` output)

Deterministic — re-running yields byte-identical output.

```
================================================================
  HURRICANE IAN RETRODICTION DEMO — receipts
  Standalone · pre-registered · ILLUSTRATIVE (N≈1, not skill proof)
================================================================

SLUG: laus_lee_unemployment_rate_initial_vintage
RESOLVED GRADE-CONFIG: gradeable=true basis=delta polarity=lower_is_bullish epsilon=0.05 epsilon_mode=absolute window_days=90

AS-OF (decision date = Ian landfall 2022-09-28):
  freshest initial vintage published ≤ landfall → obs 2022-08-01 = 2.7% (first published 2022-09-28)
PRIORS (selected in-script; the window rule lives here, not in computeBacktestCall):
  90-day  (obs ≤ as-of−90d)  → obs 2022-05-01 = 2.4%   [the registered prediction]
  MoM     (as-of−1 month)    → obs 2022-07-01 = 2.8%   [robustness]
  YoY     (as-of−12 months)  → obs 2021-08-01 = 4.6%   [robustness, seasonality-neutral]

PRE-IAN CALL (computeBacktestCall, delta basis, lower_is_bullish):
  90-day  2.7 vs 2.4  (diff 0.3)  →  BEARISH   [registered prediction]
  MoM     2.7 vs 2.8  (diff -0.1)  →  BULLISH   [robustness]
  YoY     2.7 vs 4.6  (diff -1.9)  →  BULLISH   [robustness]
  → Convention-sensitivity (90-day vs MoM vs YoY flips the sign) is the non-seasonally-adjusted caveat made visible.
  → The BEARISH 90-day read reflects a PRE-EXISTING summer rise in unemployment, NOT an Ian forecast.

REALIZED OUTCOME — LeePA sale-velocity (price-free; ±1.0 z-thresholds, NOT the 0.05 LAUS epsilon):
  immediate (post-Ian): year 2023 count=35329 vs baseline 2020,2021,2022 (mean 36972.3, popStd 6379.9) → z=-0.2576 → NEUTRAL   | raw YoY -7.2%
  recovery: year 2024 count=37219 vs baseline 2021,2022,2023 (mean 39193.7, popStd 3696.7) → z=-0.5342 → NEUTRAL   | raw YoY +5.3%

computeSkillScore (WIRING SMOKE-TEST ONLY):
  {"system_accuracy":0,"lake_tier1_accuracy":0,"persistence_accuracy":0,"lift":0,"n_calls":0,"n_families":1,"n_correct":0,"n_persistence_correct":0,"n_calls_by_tag":{}}
  DEGENERACY NOTE: both calls share one slug AND one as_of_date, so the persistence-null logic
  excludes the first call and drops neutral-observed targets — n_calls collapses to 0. The aggregate
  metrics (system_accuracy, persistence_accuracy, lift) are NOT meaningful at N=1 same-slug/same-date.
  The per-window table below is the real deliverable.

PER-WINDOW RESULT (prediction = BEARISH):
  window                  | observed  | z       | verdict
  ------------------------|-----------|---------|----------------------
  immediate (post-Ian)    | neutral   | -0.2576 | NO-DIRECTIONAL-OUTCOME
  recovery                | neutral   | -0.5342 | NO-DIRECTIONAL-OUTCOME

NET: pre-Ian call BEARISH (pre-existing labor trend, not Ian-prediction); both velocity windows
NEUTRAL at ±1.0 → no scored hit/miss. Mechanism runs end-to-end on live point-in-time data. N≈1 —
illustrative, not proof; does NOT lift the Track-B HOLD. TDT outcome = Phase 2 (pending self-ingest).
================================================================
```

---

## Result, plainly

- **Prediction (pre-Ian, registered 90-day convention):** **BEARISH** — 2.7% vs the 90-day-prior 2.4%, a +0.3pp rise that clears the 0.05pp deadband; `lower_is_bullish` flips "rate rose" into a bearish economic read. Again: this tracks a pre-existing summer labor deterioration, not the storm.
- **Outcome:** both LeePA velocity windows are **NEUTRAL at ±1.0** — immediate z = −0.26, recovery z = −0.53. **No scored hit/miss.** Raw YoY velocity is mildly directional (2022→2023 −7.2%, 2023→2024 +5.3%) but does not clear the pack's ±1.0σ bar, so it registers no directional verdict.
- **Net:** the mechanism ran end-to-end; a single event yielded no directional verdict at the configured threshold. That neutral/neutral outcome **is** the deliverable — it is exactly why N=1 is illustrative-not-proof. **We don't cherry-pick windows or thresholds.**

---

## Caveats (order matters)

1. **Ian was exogenous — and the call was BEARISH on a pre-existing trend, not a hurricane forecast.** A lagging labor indicator can't foresee a landfall; the bearish read reflects a summer rise in unemployment already present before Ian. No "the system saw it coming."
2. **N≈1 — illustrative, not skill proof.** Does not lift the Track-B HOLD.
3. **County LAUS is not seasonally adjusted.** A 90-day delta across summer mixes seasonal tourism-labor swings with trend — hence the convention-sensitivity (MoM → bullish, 90-day → bearish, YoY → bullish, all printed).
4. **LeePA snapshot-drift.** `sales_count` by `sale_year` is a current snapshot ("parcels whose last sale was year Y"); resold parcels migrate out of earlier years, so recent years are undercounted and the 2021 boom dominates trailing baselines — which is why both windows read neutral. A true point-in-time velocity needs vintaged parcel snapshots we do not have; building one is out of scope (tripwire). The script reports the real z-scores under this known bias.

---

## Scope tripwire (standing)

This is a **hardcoded one-off**. It is **NOT** a reusable harness, a generalized event-manifest, or a generalized vintage-resolver. Extending it toward any of those re-enters held Track-B scope (`row_tier_build_remaining`) — **STOP** if the work drifts there.
