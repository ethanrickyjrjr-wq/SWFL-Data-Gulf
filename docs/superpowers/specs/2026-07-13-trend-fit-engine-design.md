# Trend fit engine — linear fit lines + code-computed trend reads, everywhere

**Date:** 2026-07-13
**Check:** `trend_fit_engine_live_verify`
**Operator:** Ricky Cooper

---

## Problem

We draw lines we call "trends" and none of them are fits.

- `lib/charts/airport-series.ts:25` (`movingAverage`) draws a 12-month trailing mean and calls
  it `trend`. A moving average is a **smoother**: it follows every wiggle, it has no slope, no
  goodness-of-fit, and it cannot be extended forward. It cannot answer "which way is this
  heading, and how confident are we."
- `lib/charts/tier-projection-series.ts:12` (`trailingSlope`) IS a real least-squares OLS
  slope — the only regression math in the repo. It is trapped in one consumer
  (`TierProjectionChart`), returns slope only (no intercept, no R²), and anchors its
  projection at the **last observed value** rather than the fitted line's endpoint.
- No scatter fit line anywhere. `CorridorMarketScatter` (ECharts) is welded to one dataset
  (vacancy × triple-net rent × permit z-score). bklit's Scatter is explicitly NOT vendored
  (`components/charts/vendor/bklit/NOTICE.md:49` — the scope-cut list; Gauge and Heatmap were
  on that same list and have since been vendored, so the path is proven).
- Logistic regression, SVM, KNN: none, anywhere. (Grep trap: `brains/logistics-swfl.md` is
  freight/supply-chain logistics, not logistic regression.)

Meanwhile we hold decades of monthly series and never fit a line to any of them.

Worse, the models that *write about* our charts have never seen them. In the Insiders pipeline
the model receives news, numeric anchors, and a menu of series **names**, writes a
natural-language chart *request*, and code plots that request afterward. At the moment it
composes prose, the chart does not exist. It is describing a photo it has not been shown.

## Goal

One surface-neutral fit engine, computed in code, whose numbers reach every renderer and every
narrator:

1. **The math** — one pure OLS function. Points in, `{slope, intercept, r2, n}` out.
2. **The window menu** — for any held series, fits across a fixed set of time windows.
3. **The verdict** — code (never the model) compares those windows and reaches a settled
   conclusion ("plateau against a strong long-run climb").
4. **The line** — drawn from `{slope, intercept}` by BOTH renderers (ECharts on web, the
   hand-authored SVG builders for email/PDF/social), so it looks the same everywhere.
5. **The read** — the narrator writes prose from the settled verdict, never from the table.

Consumers pull it: the Email Lab grid, `/desk`, chat, the deliverable recipes, and Fable 5 for
the Insiders Edition. Nobody re-implements it.

---

## Research findings

### crawl4ai (RULE 0.4, gathered 07/13/2026)

**echarts-stat / ecStat** (https://github.com/ecomfe/echarts-stat) — the official Apache
ECharts statistics extension. Ships `regression` (`'linear'`, `'exponential'`,
`'logarithmic'`, `'polynomial'`), `clustering` (kMeans), `histogram`, `statistics`. Used either
as a registered ECharts transform (`echarts.registerTransform(ecStat.transform.regression)`) or
standalone (`ecStat.regression(type, data, opt)` → `{points, parameter, expression}`). It has
**no logistic regression, no SVM, no KNN**.

**REJECTED as the engine, and this is the load-bearing finding.** ecStat is an *ECharts
transform*. Only our **web** charts run ECharts (`echarts ^6.1.0`, used by
`CorridorMarketScatter` and the desk). The email/PDF/social path (`lib/charts/spec-to-image.ts`)
is hand-authored SVG + vendored bklit — **zero ECharts**. Adopting ecStat would give us
regression on the website and nothing in the deliverables, which is the monetized surface.
Wrong layer. The fit math must live in surface-neutral TypeScript that both renderers read.
(ecStat stays available later as a *web-only* convenience for polynomial/exponential shapes; it
is not the v1 engine.)

### Code probe (RULE 0.5, 07/13/2026)

- OLS already exists (`trailingSlope`) — promote it, don't write it.
- `pearson()` already exists (`lib/desk/correlation.ts`), with real guards
  (`CORRELATION_MIN_ZIPS = 10`, zero-variance → null). **For a simple linear fit, R² = r².** The
  goodness-of-fit number is therefore already in the codebase; it just needs squaring.
- `/desk` already ships `DeskCorrelationHeatmap` (a Pearson r matrix). `CorrelationData`
  (`lib/desk/types.ts`) carries only `labels` + `matrix` — the raw paired per-ZIP observations
  exist inside the loader but are **dropped** after `correlationMatrix()` computes r. A scatter
  drill-down needs the loader to pass the pairs through.
- The `market-pulse` recipe already loads a grid skeleton named **`trend-snapshot`** ("chart
  leads, no hero — one trend chart up top, supporting stats below, a short read, and your
  sign-off"). That is exactly this block's shape; the skeleton exists and is waiting for a real
  trend chart (its current chart is a ranked bar of ZIP month-over-month moves).

### Lake inventory (07/13/2026) — what is actually fittable

Verified via `mcp__lake__query_lake`, not assumed:

- **`data_lake.redfin_city_swfl`** — 389,986 rows, 01/31/2012 → 05/31/2026, **896 regions**, 5
  property types. Metrics: `median_sale_price`, `median_sale_price_yoy`, `median_dom`,
  `inventory`, `months_of_supply`, `homes_sold`.
- `data_lake.zhvi_zip_yoy_monthly` — 32,720 rows, 01/31/2001 → 05/31/2026 (per-ZIP, 25 years).
- `data_lake.tier_divergence_pivoted` — 364 months, 02/1996 → 05/2026.
- `data_lake.zhvi_pivoted` — 317 months; `zori_pivoted` — 137 months.
- `data_lake.redfin_collier_market` — 782 rows (region = "Collier County, FL");
  `redfin_lee_market` — 660 (region = "Lee County, FL"). **County grain, one region each.**
- `data_lake.fema_nfip_county_year` — 237 rows, 1978 → 2026.
- `data_lake.leepa_parcels_sales_yearly` — 73 years.
- Too thin to fit: `fdot_aadt_county_year` (15 rows), `noaa_ghcn_rainfall` (6 rows).

**⚠️ DATA-INTEGRITY FINDING, INDEPENDENT OF THIS BUILD: `redfin_city_swfl` is not SWFL.** It
holds 896 regions statewide — Miami, Lakeland, Margate, Alachua, Land O'Lakes. Any code trusting
that table name for scope is wrong. Opened as its own check; not fixed here.

**Overlap analysis (operator asked explicitly):**

- Redfin county tables vs the Redfin city table = **same metrics, same source, different grain**
  (county vs city). A hierarchy, not new information. Chart ONE grain per chart; never present
  both as separate insights.
- Zillow per-ZIP home **value** vs Redfin median **sale price** = **genuinely different**. Zillow
  estimates what every home is worth; Redfin reports what actually sold. Divergence between them
  is itself signal.
- Lee parcel sales by year = a **third independent lane** (county property-appraiser records, 73
  years, different provenance).
- **None of the four currently carries a fit line.** No rebuild.

### The proof — real fits, computed on our lake 07/13/2026

Cape Coral, `property_type = 'Single Family Residential'`, `median_sale_price`, via `regr_slope`
/ `regr_r2`. Window, n, slope in $/month, R²:

- full history (06/2015–05/2026) · 132 · +1,931 · 0.787
- last 10 years · 120 · +1,974 · 0.746
- last 5 years · 60 · **−472** · 0.105
- last 24 months · 24 · **−619** · 0.151
- last 12 months · 12 · +1,395 · 0.205
- **ex-boom (drops 2021–2022)** · 108 · **+1,802** · **0.882**

Three conclusions, each load-bearing for the design:

1. **The 2021–22 boom is empirically a shock, not part of the trend.** Removing it does not
   merely change the answer — it produces the *tightest fit of any window* (R² 0.882). The
   operator's black-swan intuition is confirmed by the data, not assumed.
2. **No single window tells the truth.** Eleven years says +$1,931/mo. Twenty-four months says
   −$619/mo. Both are correct. The insight lives in the **comparison** — which is why the window
   menu beats a model-callable fit tool (a model exploring one window at a time would find the
   optimistic story or the pessimistic one and stop).
3. **The R² gate produces the honesty for free.** Recent windows are all weak (0.105, 0.151,
   0.205). That is not noise to hide — it *is* the finding: Cape Coral is **plateauing**, and a
   wide scatter around a flat line is exactly what a plateau looks like.

Cross-city, same metric, full-history window, single-family: Lehigh Acres +$1,979/mo (R² 0.887)
· Cape Coral +$1,931 (0.787) · North Fort Myers +$1,728 (0.776) · Bonita Springs +$3,674 (0.775)
· Fort Myers +$2,005 (0.745) · Marco Island +$10,267 (0.720) · Estero +$2,836 (0.685) · **Naples
+$16,201 (0.409)** · **Sanibel +$3,446 (0.334)**.

Sanibel's 0.334 means **we do not need a hand-curated "exclude Hurricane Ian" window**. The weak
fit IS the signal: the gate refuses the confident line and the read says "Sanibel does not follow
a trend line; Ian reset that market in 2022." The mechanism produces the insight instead of us
curating it.

---

## Operator decisions (07/13/2026 brainstorm)

1. **Both descriptive and predictive.** Solid line across the observed range; dashed forward
   segment when projected.
2. **One engine, many consumers** — NOT a new chart type. A chart *type* reaches exactly one
   chart; the requirement is "everywhere."
3. **Trendline over time first**, scatter+fit second (phase 2, the `/desk` correlation
   drill-down).
4. **Precomputed window menu**, not a model-callable fit tool. Cheap, cacheable, testable,
   spend-guarded, and structurally incapable of inventing a slope.
5. **Best series first: the Redfin city panel.** Eleven years monthly across our 15 real towns,
   five metrics on one table, split by property type. The grain agents work in — nobody sells "Lee
   County," they sell Cape Coral. Already loaded by `lib/desk/loaders.ts`.
6. **INFERENCE is the deliverable, not a liability.** Operator: *"We can't predict the future,
   but we can read the tea leaves based on real data, real news and real history."* Rules of
   engagement rule 2 already permits exactly this — tag + base value + one falsifier.
7. **Fable 5 pulls what it needs for the Insiders Edition.** Build the capability; wire nothing
   Insiders-specific.

---

## THE CLAIM-GATE CORRECTION (the most important section)

The first draft of this design handed the model the six-window table so it could "reason across
the windows." **That is exactly the failure `lib/deliverable/claims.ts` was written to stop, on
07/13/2026, the same day.**

Four of seven deliverables shipped a falsehood that day, and **not one contained an invented
number**. Every figure was correctly sourced. What was invented was **the claim drawn between
correctly-sourced numbers**. One of the four:

`sphere-weekly` wrote **"the gap is widening"** — given ONE national level and no trend at all.

A trend claim invented from insufficient data is precisely the hazard of this build. Handed a
table of six windows, a model will assert "the trend is cooling," "outpacing," "steeper than,"
"reversing" — comparisons that sail straight through a digit lint because there is nothing
numeric in them to catch. A banned-word list does not work; it was tried and lost (ban "street"
and the model writes "on Shore Dr").

**Therefore: code computes the comparison too.**

1. CODE fits every window. (deterministic)
2. CODE compares the windows and reaches a VERDICT. (deterministic)
3. The narrator receives the verdict as a SETTLED ENGLISH SENTENCE.
4. The narrator receives NO window table, NO row list, NO set — nothing it could compare.

The verdict is a deterministic classification over `(longRun, recent)` fits:

- long-run strong, recent weak and near-flat → **plateau against a strong long-run climb**
- long-run strong, recent strong, same sign → **the long-run trend is intact**
- long-run strong, recent strong, opposite sign → **the trend has reversed**
- every window weak → **this series does not follow a line** (name a disruption ONLY if a sourced
  event exists; otherwise say only that it does not fit)

Exact thresholds are pinned in the implementation plan and unit-tested against the Cape Coral /
Sanibel / Lehigh Acres fixtures above. The cross-window insight is real — it is simply **code's
job, not the model's**. Deterministic math, narrative prose.

### The trajectory word is CODE OUTPUT, not a model choice

There is no safe partial here, and it is worth stating flatly because the first draft of this
spec got it wrong.

It is NOT enough to hand the narrator three settled figures (+1,931 · +1,802 · −619) and let it
supply the connective tissue. Handed those, a model writes *"the run is cooling"* — and
`sphere-weekly`'s "the gap is widening" was exactly that: a **synthesis across correctly-handed
facts**, not an invented number. The single-fact `claims.ts` pattern ("the ask is $209") does not
cover a trend read, because a trend read's entire value IS the comparison.

Therefore `trendVerdict` emits **the conclusion word itself** — `plateau` / `intact` / `reversed`
/ `does-not-fit` — as code output. The narrator may render that verdict in good prose. It may not
choose it, soften it, strengthen it, or reach a different one.

**The test asserts the narrator introduces no comparative or trajectory term that is absent from
the verdict** — not merely that it was handed no table. (Structural assertion over the narrator's
input + a term check on its output; not a banned-word list, which was tried and lost.)

**This gates the READ, not the math.** Phase 1 (`fit-line.ts` + `series-fit.ts` + `trendVerdict`)
has no model in it and is unblocked.

### Three more, from the playbook rewrite (`ea2e45d3`, 07/13/2026)

The playbook was rewritten mid-brainstorm from what actually shipped. Three of its findings land
directly on this build:

**a. The falsifier threshold is CODE-COMPUTED. Never a slot.** The playbook: *"A spec that asks
for a number no lane holds is an instruction to lie, and the model will obey it. That is not a
model failure — **it is a spec failure.**"* An earlier draft of this design wrote the falsifier as
*"if the next two prints come in above X"* and left X blank. **That is the spec failure, in this
spec.** `trendVerdict` computes the falsifier threshold from the fit (the value the next print
must clear for the long-run line to reassert) and hands it over settled. The narrator is never
asked for a number, so it can never supply one.

**b. The read may NEVER reference layout.** The claim lint has already been beaten this way
(playbook Part 2, Round 2): the narrator has **zero layout knowledge** — it never sees the
document — and the layout *moves* underneath it (an empty row is omitted, a gated chart is
dropped). *"The chart below"* becomes a visible lie the moment the R² gate drops the line. This
block is literally chart-plus-prose-beneath, so it is the highest-risk surface for exactly that
failure. The read is written to stand alone; no "above", no "below", no "as shown".

**c. The read slot ships EMPTY in the skeleton.** `fillNarrative` **skips a text block that
already has content** (playbook Part 9). A `trend-snapshot` skeleton that prefills the commentary
slot would ship the placeholder instead of the authored read. Empty slot, label carries the
instruction — the standing slot rule (`lib/email/CLAUDE.md`).

And the runtime behavior is the playbook's, not a new one: `auditClaims` is a **fail-closed
backstop** — on any hit the paragraph is **dropped to an open slot**, never shipped best-effort.
For this block that means: the chart and its fit line still ship; the read drops. Never block the
send.

---

## What we're building

### 1. `lib/charts/fit-line.ts` — the math (pure, no I/O)

```ts
export interface Fit {
  slope: number;          // per x-step (per month for a monthly series)
  intercept: number;
  r2: number;             // 0..1
  n: number;
  from: string;           // MM/DD/YYYY of first fitted point
  to: string;             // MM/DD/YYYY of last fitted point
  at(x: number): number;  // the fitted line at any x — NOT last-observed-anchored
}
export function fitLine(points: { x: number; y: number }[]): Fit | null;
```

Absorbs `trailingSlope` (`tier-projection-series.ts`) and **fixes its quirk**: that function
anchors extrapolation at the *last observed value*, not the fitted line's endpoint. A reusable
regression util must use the proper intercept-based line. `TierProjectionChart` migrates onto
`fitLine` in the same commit (the behavior change is deliberate and asserted in its test).

Returns `null` when `n < MIN_FIT_POINTS` (12) or x/y variance is zero. **Never throws.**

### 2. `lib/charts/series-fit.ts` — the window menu + the verdict

```ts
export const FIT_WINDOWS = ['full', '10y', '5y', '24m', '12m', 'ex-boom'] as const;
export function fitWindows(series: SeriesPoint[]): WindowFit[];  // drops windows with n < 12
export function trendVerdict(fits: WindowFit[]): Verdict;        // the SETTLED SENTENCE
```

- **Any window with fewer than 12 points is dropped from the menu**, not drawn. A straight line
  through 6 points looks authoritative and means nothing — this is what would make the
  county-traffic (15 rows) and rainfall (6 rows) series lie to us.
- **`ex-boom` must always disclose what it dropped.** Its label carries "excluding the 2021–22
  run-up" onto every surface. An undisclosed exclusion is a lie by omission. Enforced by test.
- `trendVerdict` returns the settled sentence + the base value + the falsifier. This is the ONLY
  thing a narrator ever sees.

### 3. Drawing the line — both renderers, one set of numbers

- **Web (ECharts + recharts frames):** a two-point series from `fit.at(x0)` → `fit.at(x1)`.
- **Email / PDF / social:** the same two points in the hand-authored SVG builders
  (`lib/charts/svg/*`), reached through the existing `chartSpecToEmailSvg` dispatch
  (`lib/charts/spec-to-image.ts`).
- Solid across the observed range; **dashed** for any forward segment — the existing projection
  convention (`components/charts/vendor/bklit/projection-line.tsx`).
- **R² below the bar → the line is not drawn confidently** (faint, or omitted), and the read says
  why. The gate is visual as well as verbal.

`ChartSpec` gains `trend?: TrendOpts` (optional, additive). Any time-series frame honors it. It is
**not** a 12th `ChartType` — it composes with the types we already have, so the Email Lab picker
offers "Line + trend" as a *preset* (identical picker UX, still a flat list) while `/desk`, chat,
the recipes, and Fable 5 set it directly without a new type being invented for each of them.

### 4. The trend block — chart + read, shipped as one unit

The block is the chart (with its fit) plus the narrator's paragraph beneath it. They ship together
so they cannot drift apart. The `trend-snapshot` grid skeleton (`SEED_DOCS`) already IS this shape
and is reused, not re-invented.

**Coherence rule** (required — `lib/email/CLAUDE.md`: every element type ships with one): the
read's stated direction must match the sign of the fit it cites, and a read may not assert a trend
for a window whose fit was dropped or gated. Author-time red test over the seed templates; runtime
soft (drop the read, keep the chart — never block a send).

### 5. Where it lands (phased)

1. `fit-line.ts` + `series-fit.ts` + tests. Migrate `TierProjectionChart`.
2. Renderers draw the line (web + SVG). `ChartSpec.trend`.
3. Redfin city panel wired as the first real series → Email Lab "Line + trend" preset + the
   `trend-snapshot` recipe path.
4. `/desk` — a trend block on a real series.
5. Chat can answer with it; recipes can request it; Fable 5 pulls it.

**Phase 2 (separate spec): the scatter fit.** `/desk` correlation-heatmap cell (r = 0.72) → click →
scatter of the underlying ZIPs + fit line. Blocked on `CorrelationData` retaining the raw paired
observations (see Research findings). bklit Scatter gets vendored then, following the proven
Gauge/Heatmap path.

---

## Follow-ups: logistic regression, SVM, KNN

Not chart types — **classifiers**. Each needs labeled outcomes to train on and a way to validate.
We have neither today, and shipping a classifier as chart decoration with no validation path is
exactly the half-shipped expansion `NOTICE.md` was written to stop. But two have real latent hooks
and are NOT dismissed:

- **Logistic regression** — "will this listing cut price / sell within 30 days" is a genuine binary
  question for this domain, and `listing_lifecycle` already tracks the outcomes that would label
  it. This is the strongest follow-up. Its blocker is a labeled training set and a backtest, not a
  chart.
- **KNN** — the comp engine is already KNN-shaped (nearest properties in feature space), but the
  neighbor search happens **at the vendor**; `comp-helper.ts` slices the top 6 of what is handed
  back. Owning the distance function is a real option — but it is a comps build, not a charts
  build.
- **SVM** — no use case surfaced. Not pursued.

Opened as checks, not built here (RULE 2.4 — no silent deferrals).

---

## Testing

### ⚠️ FIXTURE-PARITY TRAP — read before writing `fitLine`

The fits pinned in this spec were computed in SQL with x as an **absolute month index**:
`DATE_DIFF('month', DATE '2015-06-01', period_end)`. The TypeScript `fitLine` **must use the same
encoding** or it will not reproduce these numbers.

**The `ex-boom` window is the landmine: it has a GAP** (2021–22 is dropped). If an implementer
"tidies" the code by re-indexing each window to a contiguous `0..n`, the ex-boom slope silently
diverges from the pinned +$1,802 / R² 0.882 — and the fixture that proves the whole design stops
reproducing. **The gap must stay in x.** Do not clean this up.

### Cases

- `fitLine` unit: known-slope fixtures; `n < 12` → null; zero variance → null; never throws. Assert
  the intercept-based line (the anti-regression test for `trailingSlope`'s last-observed anchor).
- `fitWindows`: thin windows dropped, not drawn. `ex-boom` label always discloses its exclusion.
- `trendVerdict`: pinned against the **real** fixtures in this spec — Cape Coral → plateau; Sanibel
  (R² 0.334) → does-not-follow-a-line; Lehigh Acres (R² 0.887) → trend intact.
- **Claim-gate test (the important one):** the narrator's input contains NO window table and NO row
  set. Assert structurally, not by string-matching the prose.
- Coherence: a read whose stated direction contradicts its cited fit is a red test.
- Renderer parity: the web frame and the email SVG draw the same `{slope, intercept}`.
- `bunx next build` before any push (never `npx tsc`).

## Verification (closes `trend_fit_engine_live_verify`)

On prod, served bytes — not a diff check: a built email carrying a trend block whose fit line is
visibly drawn, whose caption states the source + as-of in MM/DD/YYYY, whose read is tagged
`[INFERENCE]` with the base value and one falsifier, and whose stated direction matches the plotted
line. Plus one gated case: a weak-R² series (Sanibel) renders WITHOUT a confident line and says so.
