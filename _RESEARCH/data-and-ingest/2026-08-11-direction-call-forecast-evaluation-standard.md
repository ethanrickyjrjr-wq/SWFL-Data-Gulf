# What a direction call SHOULD be — the outside standard, crawled 08/11/2026

Operator ask, verbatim: *"crawl4ai what this should be"* — following the finding that our
predicted direction equals the persistence carry-forward on 144 of 144 backtest rows.

RULE 0.4 order honored: our own research first (§0), then crawl4ai the live source (§1–§3).
All quotes below are crawl4ai-fetched IN SESSION on 08/11/2026 and reproduced verbatim.

---

## 0. OURS FIRST — this was decided correctly two months ago and never enforced

- `docs/superpowers/plans/_FINISHED/2026-06-03-row-tier/HANDOFF.md` item 2 — *"report lift over a
  persistence null, never raw accuracy (a directional rule on a trending series scores ~100% by
  autocorrelation)."* **This matches the textbook standard exactly** (§1). The decision was right.
- `refinery/lib/backtest/skill-baseline.mts` — the instrument that measures it. Built, tested,
  run once on 06/08/2026, returned zero, and nothing happened for two months.
- `docs/superpowers/specs/2026-07-13-trend-fit-engine-design.md` + `lib/charts/fit-line.ts` —
  `fitLine()`, shipped and tested, returns `{slope, intercept, r2, n, established}` where
  `established` = the 95% CI on the slope excludes zero. Header rule: *"If `established` is false,
  THE SIGN OF THE SLOPE MAY NOT BE READ."* Live on the desk hero via `lib/desk/loaders.ts:24`.
- `_RESEARCH/data-and-ingest/2026-07-22-naive-bayes-knn-algorithm-fit.md` §0 — the 07/13 pass
  already concluded logistic regression's blocker is *"a labeled training set and a backtest, not
  a chart."* Same blocker as this. Do not re-derive a third time.

**Nothing in our corpus covers how to TEST a directional call for significance.** That is the
genuinely open part, and it is what §3 answers.

---

## 1. The benchmark is the naive method — and it is a HARD bar on economic series

Source: Hyndman, R.J., & Athanasopoulos, G. *Forecasting: Principles and Practice* (3rd ed.),
https://otexts.com/fpp3/simple-methods.html — crawled 08/11/2026. Verbatim:

> "For naïve forecasts, we simply set all forecasts to be the value of the last observation. That
> is, ŷ(T+h|T) = y(T). **This method works remarkably well for many economic and financial time
> series.**"

That IS our persistence null, named and defined by the standard reference. Two consequences:

1. Our 06/03 decision to score lift over persistence is the textbook-correct choice, not a local
   preference. Keep it.
2. **Tying the naive method on an unemployment-rate series is the EXPECTED outcome, not a scandal.**
   The textbook says so outright. What is wrong with our situation is narrower and worse: our call
   cannot differ from naive even in principle, because it is computed as `sign(current − prior)`.

The related "drift method" (https://otexts.com/fpp3/simple-methods.html) is the naive method plus
an average historical slope — *"equivalent to drawing a line between the first and last
observations, and extrapolating it into the future."* Note this is NOT what `fitLine()` does:
drift uses only the first and last points; least-squares uses all of them and carries a standard
error. `fitLine()` is the stronger instrument.

## 2. Raw accuracy is the wrong headline — scale against the benchmark

Source: https://otexts.com/fpp3/accuracy.html — crawled 08/11/2026.

The worked Google-stock example reports Drift / Mean / Naive on RMSE, MAE, MAPE and MASE, and
concludes verbatim: *"Here, the best method is the naïve method (regardless of which accuracy
measure is used)."* On the seasonal beer series, seasonal-naive wins with **MASE 0.94** — the only
one of four methods under 1.0.

MASE is the mean absolute error scaled by the naive method's error, so **MASE < 1 means "beat the
benchmark" and MASE ≥ 1 means "did not."** Citation carried in that page's bibliography: Hyndman,
R.J., & Koehler, A.B. (2006). *Another look at measures of forecast accuracy.* International
Journal of Forecasting, 22(4), 679–688. doi:10.1016/j.ijforecast.2006.03.001

Our 42.1% raw accuracy figure is exactly the headline this standard says not to lead with.

## 3. THE GAP OUR CORPUS DID NOT COVER — direction has its own significance test

Source: `DACTest` in R's **rugarch** package (Alexios Ghalanos), version 1.5-1 —
https://search.r-project.org/CRAN/refmans/rugarch/html/DACTest.html — crawled 08/11/2026. Verbatim:

> "Implements the Directional Accuracy Test of Pesaran and Timmerman and Excess Profitability Test
> of Anatolyev and Gerko."
>
> "**The Null is effectively that of independence, and distributed as N(0,1).**"

It returns `Stat`, `p-value`, `H0`, `Decision` at a chosen `conf.level`, and `DirAcc` — the
directional accuracy itself. So the standard reports the hit rate **and** the probability it is
distinguishable from chance, together, never the hit rate alone.

Primary references, as cited on that page:
- Pesaran, M.H. and Timmermann, A. (1992), *A simple nonparametric test of predictive performance*,
  Journal of Business and Economic Statistics, **10(4)**, 461–465.
- Anatolyev, S. and Gerko, A. (2005), *A trading approach to testing for predictability*, Journal
  of Business and Economic Statistics, **23(4)**, 455–461.

**Why this matters for us specifically:** the Pesaran–Timmermann null is that the forecast and the
outcome are *independent*. A forecast that IS the lagged series is not independent of the outcome
in the way the test assumes — it is mechanically tied to it. Running PT on our current calls would
not be a meaningful test, it would be measuring the autocorrelation of the series. **The test only
becomes informative once the direction comes from something other than the last delta.** That is
the precise, external justification for the `fitLine()` promotion.

---

## 4. What a direction call SHOULD be, stated as a contract

1. **Produced** from a fitted slope over a stated window with a significance gate — `fitLine()`'s
   `established` (95% CI on the slope excludes zero) — and it must be allowed to return **NO
   DIRECTION**. A forecast that is always willing to name a direction is not a forecast.
2. **Benchmarked** against the naive/persistence method, which stays the comparison (§1, and our
   own 06/03 decision). Report lift, never raw accuracy as the headline (§2).
3. **Tested** with Pesaran–Timmermann against the independence null, reporting DirAcc *and* the
   p-value at a stated confidence level (§3). Anatolyev–Gerko is the second opinion if we ever
   attach an economic value to the call.
4. **Reported with N, always** — our own Glass honesty guardrail, unchanged.

## 5. What we do today, measured against that contract

- Produced from `sign(current − prior)` — `refinery/vocab/loader.mts:150-175` defaults
  `grade_basis: "delta"` for eleven value types (percentage, ratio, rate, bps, percentile, count,
  integer, currency, index, days, depth_in). **Fails item 1**, and cannot return "no direction."
- Benchmarked correctly in design, and the measurement exists — **but the answer was zero and sat
  for two months.** Item 2 half-met.
- No significance test on direction exists anywhere in the repo. **Item 3 not built.**
- N is reported. Item 4 met.

Live state, queried 08/11/2026: `predictions` = 40 gradeable, 108 ungradeable, 0 graded, 0 pending;
`outcomes` = 0 rows; `backtest_grades` = 144 rows; `metric_observations` = 13,876 rows. So the
42.1% and the 144-of-144 both come from the backtest corpus — **nothing has ever been graded live.**
Earliest live windows close 08/30 and 08/31/2026 on `laus_lee_unemployment_rate`.

## 6. Consequence to state before anyone builds this

Gating on `established` means a slope whose CI includes zero returns no direction. The gradeable
count FALLS. Per §1, on economic series the honest answer will often be "no direction" — the
textbook says the naive method works remarkably well precisely because these series are hard. That
is the correct outcome, and it will look like a regression on any dashboard counting calls.
