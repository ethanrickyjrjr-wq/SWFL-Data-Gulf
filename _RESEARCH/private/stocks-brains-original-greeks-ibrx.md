# Stocks With Brains — The Improved Plan (delta, theta, edge, and IBRX)

> **What this is:** a hard-nosed rework of the "use the brain platform to trade stocks/options" plan, plus a current, fact-checked read on IBRX. Written 2026-06-08.
> **Status of the numbers:** every options/Greeks claim here was re-checked against live vendor/reference sources; every IBRX figure was double-pulled and adversarially verified (see sources at the end). My *opinions* are marked as opinions.
> **Two hard rules carried over from the platform:** (1) any retrodicted/backtested accuracy number **never becomes a public claim** — that's why the Glass grade views are `service_role` only. (2) This is personal research, **not investment advice**; the leap from "grade calls" to "size real money" to "tell other people what to buy" crosses into licensed-advice territory and is the single most dangerous transition in the whole idea.

---

## 0. The one-paragraph verdict (no sugar)

The architecture genuinely fits — but the prior plan oversells the edge and under-builds the honesty layer, and that's exactly backwards. **You already own the hard, boring 80%: a point-in-time-correct backtest engine, a deterministic write-once grader, a persistence-null skill scorer, a calibration view, and an auto "shopping list" of data gaps.** What you *don't* own is any market data, any options/Greeks math, a grading clock fine enough for options, or — the thing that actually kills retail quant — a multiple-testing/overfitting correction. And the one signal you *can* backtest today (Lee/Collier LAUS) shows **negative skill** (lift −6.5pp; the system loses to naive carry-forward on its own data). So: you inherit the **factory**, not the **ore**. The correct next move is not to build a Polygon pipeline and a Kelly sizer — it's to spend one week falsifying the premise that SWFL data predicts any tradable instrument, *before* pouring concrete. Edge first, infrastructure second.

---

## 1. What you actually have today (grounded in the repo, not the pitch)

The prior plan waves at "The Glass grading engine (already being built)." Here's what's literally there:

**Reusable and genuinely good:**
- `refinery/lib/backtest/grid.mts` — **pure, series-agnostic, point-in-time-correct** as-of grid. It takes `Vintage[]` (`observation_date`, `value`, `realtime_start`) and gates `realtime_start <= asOf` — i.e. a call can only ever see data that was *published* by the decision date. This is the single most valuable thing in the repo for trading, and it's signal-agnostic: point a stock-signal's PIT series at it and you get hit/miss/lift with the same anti-lookahead guarantee.
- `refinery/lib/backtest/skill-baseline.mts` — `computeSkillScore`: the **persistence-null** baseline (predict_t = observed_{t−1}). `lift = system_accuracy − persistence_accuracy` over a shared denominator. This is the right way to measure "are we better than doing nothing."
- `refinery/grade/grade-predictions.mts` — the **deterministic, zero-LLM live grader**; atomic write-once via the `grade_prediction` RPC.
- `refinery/lib/predictions-log.mts` — `prediction_kind='slug'` already lets **any** brain log per-slug directional sub-calls, cadence-guarded so a persistent z-score can't be re-logged nightly and fake skill via autocorrelation. A stocks brain plugs straight in.
- `refinery/vocab/loader.mts` `resolveGradeConfig` + `brain-vocabulary.json` — per-slug `window_days` / `epsilon` / `grade_basis` / `direction_polarity`. A new equity/sector slug becomes gradeable end-to-end just by adding a vocab concept + grade block.
- `refinery/packs/master.mts` `composeConditionalThesis` — the **IF / THEN-direction / falsifier** conditional-claim format, anchored on a gradeable slug, with deterministic (never LLM-set) confidence. That's your call-authoring spine.
- The Glass scoreboard substrate: `glass_skill_over_time`, `glass_calibration`, `backtest_skill_by_slug`, and `data_targets` (the auto shopping list, with a generator + nightly GHA). All `service_role` only.
- `ingest/cadence_registry.yaml` + the dlt pipeline pattern (38 working examples) → add a price/options feed and get staleness/volume monitoring + shopping-list nagging for free.

**The blunt gaps (what "stocks with brains" actually requires you to build):**
1. **Zero market data.** No price, OHLCV, quote, or volume pipeline anywhere. No equity/options feed in the cadence registry. This is the foundational hole.
2. **Zero options/Greeks code.** No Black-Scholes, no binomial, no IV. The grader is **direction-binary** (hit/miss/neutral) with no concept of strike, expiry, premium, or P&L.
3. **The grading clock is too coarse and calendar-based.** `CATEGORY_WINDOW_DAYS` runs 90–395 days; `addDaysUTC` counts calendar days. There's no trading-day calendar and nothing intraday. Unusable for swing/options horizons or anything expiry-anchored.
4. **The only backtestable series is tiny and local, and it loses.** `flywheel-backtest.mts` grades exactly 2 series (Lee/Collier LAUS) because they're the only PIT-honest vintaged data in the lake. Measured lift = **−6.5pp** (system 42.0% vs persistence 48.6%, N=138). Everything else (ZORI, QCEW, TDT, LeePA) is *excluded* for look-ahead reasons. **A stocks system cannot inherit a proven edge — only the scoring machinery.**
5. **`outcomes` is empty (0 rows).** No live call has ever resolved. The only track record is retrodicted, which by guardrail can never be quoted publicly. The customer-facing moat is unbuilt.
6. **No security entity model.** 40 predictions, all `master`, all SWFL. No ticker dimension, no concept/value_type/polarity for a stock or option anywhere.
7. **Confidence is a deadband proxy, not a probability.** `signalConfidence` returns 0.5–0.95 from how far a signal clears its deadband. Calibration is currently against a proxy. There is no position-sizing / risk model of any kind.

---

## 2. The single most important move — do this BEFORE building anything

**Run a one-week, zero-infrastructure falsification test of the core premise.** This is the sharpest improvement to the whole plan and it costs nothing.

Take the historical FRED/Census Lee-Collier (and statewide-FL) **permit + migration** series — point-in-time / as-of values only — and regress them against **forward 1-month returns** of:
- `XHB` (the national homebuilder ETF the prior plan wants to trade), and
- a **Florida-concentrated instrument** where Lee/Collier is a *majority* of the exposure (a single-market FL REIT, a Florida regional bank, or a FL property-&-casualty insurer where NFIP losses are mechanically in the loss ratio).

Pre-register the hypothesis, the outcome metric, and a **kill criterion** before you look at results. If SWFL local data has near-zero incremental explanatory power over the national 10Y + national starts (near-certain for XHB; the honest open question for the FL-concentrated name), **the equity-prediction thesis is dead** and you've saved months building a Polygon pipeline, a Greeks calculator, and a Kelly sizer on top of a signal that doesn't exist.

This forces the four disciplines the prior plan lacks — pre-registration, point-in-time data, a defined outcome, and a kill switch — onto the cheapest possible experiment. **Confirm there's ore before building the factory.**

---

## 3. Refined architecture mapping

The leaf → master → Glass mapping is right. Refinements:

| Layer | Prior framing | Refined, repo-accurate framing |
|---|---|---|
| **Leaf brains** | sector/macro/regime/flow detectors | Same, but each leaf must declare a measured **`signal_half_life`** and carry **`event_date` + `knowable_date`** on every input (for PIT backtesting). Greeks/IV are computed here in code, never by the LLM. |
| **Master** | one conditional, falsifiable directional call | Same format (`composeConditionalThesis`), but master also owns the **portfolio**: a correlation/exposure matrix and factor-beta caps, because every SWFL bet loads the same Florida-growth/rates factor. Master sizes the book, not each call. |
| **The Glass** | scores calls over time = the moat | **Reframe as a walk-forward harness, not a passive scoreboard.** Replay leaf brains over historical as-of snapshots, have master emit its call at each historical date, grade against realized forward outcome — **same grading code path as live, only the clock is simulated.** That's what makes the live score trustworthy and gives you evidence on day one instead of in 4–33 years (see §7). |

**Outcome function — define it before logging a single call.** For a direction call on a slug it's already defined (sign/delta basis, deadband, polarity). For an *options* position, "outcome" is not binary direction — it's P&L conditional on entry/exit/sizing/theta. You must pick: hold-to-expiry? mark at falsifier trigger? fixed horizon? **That choice silently sets your measured win rate.** Decide it once, encode it, never quietly change it.

---

## 4. The data layer — and the honest truth about the "alt-data edge"

### 4a. Market data (the new ingest)
- A price/options feed is a new `ingest/pipelines/*/pipeline.py` + GHA cron + cadence entry — same shape as `bls_laus`. The **brain-first ingest gate** applies: the feed can't land in `data_lake.*` without a consuming stocks `PackDefinition` in the same PR. So this is a paired ingest+pack build, not a drop-in dataset.
- **Vendor-first, verify in-session:** the prior plan's "Polygon.io ~$30/mo daily options" is a *hypothesis*. Before committing: confirm the exact tier's options coverage, **history depth**, whether it ships IV/Greeks fields or only quotes, and crucially whether it **retains expired contracts** (you need that for survivorship-free options backtests). A daily/EOD tier gives snapshots — you can't compute live intraday Greeks from it, and **IV percentile needs ~1–2 years of that ticker's IV history you won't have on day one.** Note that gap; don't design around a field you don't yet hold.

### 4b. The alt-data edge is weaker than the pitch — by a lot
The prior plan's "SWFL ground-level data is what hedge funds pay millions for" is the weakest claim in it. Three compounding problems:

1. **It's not proprietary.** Census Building Permits Survey publishes county/metro permits publicly (revised on the 17th workday monthly) and **FRED already carries it**. "Hedge funds pay millions" describes *true* alt-data (private card spend, satellite, app telemetry), not a government release anyone can pull free.
2. **Signal-to-target mismatch.** DHI/LEN/NVR build across 30+ states; XHB is a national ETF. Lee+Collier is a fraction of a percent of their revenue — it explains a trivial share of the ticker's variance, which is dominated by the 10Y, mortgage spreads, and national starts. You'd be trading a **national instrument on a hyper-local input.**
3. **Already discounted.** Permits are themselves a forward indicator the whole market watches; by the time county data is published, the national prints and rate moves that drive the stock are already in.

**The honest map** (existing datasets → equities, with real correlation strength):

| SWFL dataset (live) | Plausible target | Honest verdict |
|---|---|---|
| Lee/Collier permits | homebuilders / XHB | **Weak.** Public, hyper-local, lagging-to-coincident vs a national name. Confirming texture at best. |
| ALFRED LAUS (PIT) + QCEW | FL banks, broad risk-on/off | **Moderate as macro context, weak as timing.** This is the only PIT-backtestable series and its measured lift is *negative*. |
| NFIP flood AAL per-ZIP | FL P&C insurers / coastal REITs | **Weak-to-moderate, cross-sectional not time-series.** A structural risk *level*, not a catalyst. Good for relative coastal-exposure screening, useless for timing. |
| TDT + RSW enplanements + RERI | lodging/airlines | **Weak.** Coincident-to-lagging local demand; national names move on RevPAR/fuel/capacity. |
| ZORI / Redfin / FHFA / LeePA | SFR REITs, builders, title | **Weak for equities.** Mostly revised or non-PIT; no repeat-sales possible. |
| FDOT / FAF5 | trucking, industrial REITs | **Very weak.** Annual cadence; SWFL is a negligible share of any carrier. |

**Fix:** kill the homebuilder-equity pilot. If you test SWFL → markets at all, pick a target where Lee/Collier is a *majority* of the exposure (FL-concentrated bank/REIT/insurer), treat it as a **research question** not a trade, and **drop the phrase "alternative data"** — call it "public local economic data," because the edge claim collapses the moment you check who else has it.

---

## 5. Options Greeks, done right (the corrections that matter)

Deterministic-math-in-code is the right split. But the prior plan has real errors:

| Greek | What it is | How it's computed (code only) | Decision role (corrected) |
|---|---|---|---|
| **Delta Δ** | ∂V/∂S; per-share sensitivity, 0→±1 | BS: call Δ = e^(−qT)·N(d1), put = e^(−qT)·(N(d1)−1); American → binomial/tree | A **continuously re-measured** hedge ratio / share-equivalent exposure — **not** "the exposure you want." It moves with spot (gamma), time (charm), vol (vanna). |
| **Gamma Γ** | ∂Δ/∂S; delta instability/convexity | BS: e^(−qT)·n(d1)/(S·σ·√T) | "How fast my hedge goes stale." Long gamma = re-hedge in your favor but bleed theta; **short gamma = small premium book that blows up on a gap.** Hard size limits. |
| **Theta Θ** | ∂V/∂t; time decay | BS theta is **PER YEAR** — divide by **365 (calendar) or 252 (trading), and state which**; American → grid | The carry/financing leg. **Not a flat $/day budget** — it's convex, accelerating into expiry, and itself depends on σ and S. For a holding-period estimate, **reprice at the target date** (re-run BS at new T), don't multiply one theta by days held. |
| **Vega ν** | ∂V/∂σ | BS: S·e^(−qT)·n(d1)·√T; **÷100** for per-1-vol-point | The bridge from IV percentile to structure. Long vega = buy cheap IV; short vega = sell rich IV. **Biggest hidden correlated risk** at the book level. |
| **Rho ρ** | ∂V/∂r | BS: call K·T·e^(−rT)·N(d2) | Mostly a caveat — but matters for LEAPS and in a moving-rate regime (which is exactly where your FRED-fed thesis lives). |

**Five corrections to bank:**
1. **Theta is annual.** A "$/day" number only exists after an explicit day-count division; two implementations that don't agree on 365 vs 252 disagree by ~30%. And it's not linear over the holding period.
2. **IV is an INPUT, not an output.** You don't compute σ from S,K,T,r — σ is *implied by the market price* (price → IV via root-finding). The calculator's job is to translate a live quote into Greeks, not to generate IV. Listing "σ(IV)" as a model input inverts the actual dependency.
3. **Dividend yield `q` is missing** from the prior input list. For dividend-paying equities and especially ETFs/indices (XHB, SPY), omitting q biases delta, theta, and the price. Add `q` and an American/European flag.
4. **Greeks don't size positions — they translate a budget.** The arrow "Greeks → position sizing" is drawn backwards. Correct loop: **edge/probability + capital-at-risk → target risk budget (fractional Kelly / vol target) → Greeks convert that budget into contract count AND act as a portfolio risk-limit gate.** The edge sizes the bet; Greeks size the hedge and cap the book.
5. **Drop mibian** — it's abandoned (last meaningful release ~2011). Use **`py_vollib`** (actively maintained, v1.0.7 April 2026, Py 3.9–3.12; BS/BSM/Black-76, analytic + numeric Greeks, robust IV via its `py_lets_be_rational` core — European closed-form only). Reserve **QuantLib** for American options / discrete dividends / exotics. If you must stay in TS, hand-roll the ~30-line BS formulas against a vetted normal CDF and **unit-test against py_vollib values** (a low-accuracy erf approximation quietly corrupts vega/gamma).

**Net portfolio Greeks are first-class.** Greeks *add* across positions, so the real exposures are **net** delta/gamma/theta/vega. A book that is theta-positive in every line is one concentrated **short-vega / short-gamma** bet, and a market-wide vol spike hits every short-premium position at once. The calc layer must emit aggregate net Greeks and gate the book against max-net-Greek limits.

---

## 6. IV percentile as the vol-regime gate (fix the rank/percentile conflation)

The prior plan uses "IV rank/percentile" interchangeably. They're different statistics and they can disagree sharply:
- **IV Rank** = (IV − 52wk-low) / (52wk-high − 52wk-low) × 100. Anchored to **two points** (the year's single high/low), so **one spike pins the high for ~12 months** and compresses every later reading — fragile.
- **IV Percentile** = (% of trading days over the lookback where IV < today) × 100. Uses the **full distribution**, outlier-resistant. **More robust — make it primary.** Define the lookback (252 trading days).

Carry both and **flag divergence** (high percentile + low rank = a stale spike masking genuinely elevated IV). Thresholds (heuristics, not laws): **≥ ~50 (aggressively ≥70) → sell premium** (short vega/theta-positive: defined-risk credit spreads, condors); **≤ ~30 (aggressively ≤20) → buy premium** (long vega/gamma, debit structures). Both are relative-to-own-history and silent on direction and on skew/term-structure — they tell you whether to be a net buyer or seller of vol, never *what* to trade.

---

## 7. Edge measurement, done right — this is the part that makes or breaks it

The prior plan's "after ~50 theses you know your win rate → Kelly" is the most dangerous idea in it, because it's **a selection-bias machine dressed as evidence.**

1. **Multiple-testing / overfitting correction is mandatory — the #1 missing piece.** Run enough conditional calls and some look skillful by pure luck (a true 50% coin flip throws 11-of-15 "edge" ~4% of the time; across many tickers × regimes × sources you *will* find a spurious winner). **Log every trial and parameter variant**, and promote a thesis only on a **Deflated Sharpe Ratio** (Bailey/López de Prado) / **minimum-track-record-length** that corrects for trial count. **Raw win rate never promotes a thesis or authorizes Kelly.** Add a lint mirroring the existing facts-only/no-smoothing gates: *"no Kelly sizing on an undeflated edge."*
2. **50 is not enough — by an order of magnitude.** Robust validation wants 150–400+; slicing 50 by sector × regime × source leaves 5–10 per cell (noise). At monthly cadence, 50 theses = 4+ years wall-clock and 400 = ~33 years. **You will never reach significance by trading alone.** So: grade **continuous calibration** (predicted vs realized magnitude) every period — it yields far more statistical bits than a binary win/loss — and state plainly that at this cadence the Glass produces a *calibration log*, not a validated win rate, for years.
3. **Point-in-time everything.** FRED is revised — today's value for a past date wasn't knowable then. Use **ALFRED first-print vintages** (the `laus_alfred` pattern already exists). Stamp every source with `knowable_date` and filter the sim clock to `knowable_date <= sim_date`. Lag SWFL signals to real publish date via the ODD `source_tag`/ingest-date provenance.
4. **Survivorship-free universe.** Backtest delisted equities/ETFs and **expired option chains as they actually existed** — survivorship overstates returns 1–4%/yr and hides exactly the tail a directional/premium strategy is exposed to. Verify the vendor retains dead tickers/contracts before trusting a single number.
5. **Transaction-cost + liquidity model as a code primitive.** For options the killer is the **bid-ask spread**, not commission. Model fills at **56–75% of historical bid-ask width past mid + fees, round-trip, on NBBO quotes** (not last-trade/mid). Surface `spread_pct_of_premium` as a visible key_metric and add a **liquidity gate** (min open interest, max spread %) that vetoes a thesis whose tradable contracts are too thin. A 58%/b=1.4 *gross* edge can be a *net loser* on the illiquid far-dated OTM contracts a niche thesis points to.
6. **One grading code path** for backtest, paper, and live — only the clock differs. If they differ, the live score can't validate the backtest and divergence is undebuggable.
7. **Mandatory paper-trade gate.** `backtested → paper → live`, gated by `check.mjs` obligations. Promotion requires paper hit-rate within a tolerance band of the backtested rate; a large gap **halts promotion and triggers a leakage audit.** This catches stale feeds, unfillable orders, and calls that fire too late after the cadence — things a backtest can't.
8. **Pre-registration + a symmetric kill criterion.** State each thesis's hypothesis, falsifier, and expiry *before* running it. And pre-commit the failure test: *"if the pilot's calibration is within CI of a random baseline, the thesis is dead, stop."* Without it you'll rationalize noise indefinitely.
9. **State why the edge should persist.** Every thesis class needs a one-line answer to *"who's on the other side and why isn't this already priced?"* "SWFL data predicts a national homebuilder" has no persistence mechanism — if it existed it'd be arbitraged. No mechanism → presume overfit.

---

## 8. Position sizing, done right (Kelly is a loaded gun)

The arithmetic in the prior plan is **correct** — verified: p=0.58, b=1.4 → f* = (0.58·1.4 − 0.42)/1.4 = **0.28**; half = 0.14. The *model* is the danger:

- **Binary Kelly assumes two outcomes with known, fixed payoff and known probability.** An option violates both: outcomes are **continuous** (a long option loses up to 100%; short premium has bounded gain vs a fat left tail), and p and b are **estimated with large error**. Kelly is brutally asymmetric to error — **overbetting drives growth negative; underbetting by 2× still keeps ~75% of optimal growth.** A 10% edge overestimate ≈ 50% overbet. With 100% loss possible per trade, full Kelly on a mis-estimated edge is geometric ruin.
- **Use distributional (continuous) Kelly:** choose f maximizing E[ln(1 + f·R)] over the trade's *empirical* return distribution, with a hard per-position cap. No closed-form `(bp−q)/b` for a continuum.
- **Always fractional — quarter to half**, never full. Half-Kelly ≈ ¾ the growth for ~½ the volatility; options' fat tails make quarter-Kelly the prudent default until per-slice rates are estimated on large samples.
- **Size off the lower CI bound of p**, not the point estimate; have the sizing brain consume `(p_low, p_high)`, shrink toward zero while samples are small, and use a **fixed tiny fractional bet (0.5–1% risk/thesis)** for the first few years of discovery.
- **Correlation-aware portfolio sizing.** Every SWFL bet loads the same Florida-growth/rates factor; independent per-thesis Kelly silently stacks one oversized position. Master sizes the **portfolio** via a covariance/exposure matrix, applies Kelly to each thesis's **residual** (de-correlated) edge, and caps net factor beta.
- **Defined-risk by default.** Spreads/condors/long options cap max loss to a known, backtestable number — which is what makes Kelly *well-posed* (it needs bounded downside). Naked/undefined-risk requires an explicit override + a stricter deflated-skill threshold, enforced by a validator like the existing spec gates.

---

## 9. The cadence trap (theta vs signal half-life)

A core quant law: **forecast horizon must roughly match the persistence (half-life) of your inputs.** SWFL permits/migration are slow monthly signals — they support multi-week-to-multi-month directional calls, never short-dated options where theta dominates. The prior plan's daily/weekly cadence + monthly-half-life inputs + short-dated options is a structural theta loss that pays the decay before the slow signal can work. **Separate the two clocks:** keep the *thesis/research* engine on daily/weekly (correct for slow alt-data), but any options *expression* needs at least daily mark-to-market and rules-based theta/IV/stop exits. Have each leaf declare a **measured** `signal_half_life`; master refuses an option DTE shorter than the dominant input's half-life; a validator flags any DTE-vs-half-life mismatch.

---

## 10. What to ADD to make it even better (prioritized)

| # | Addition | Why it matters | Brain-terms | Effort |
|---|---|---|---|---|
| 1 | **Multiple-testing correction** (deflated Sharpe + trial log + min-track-record) | Without it the whole "measure edge" premise is selection bias | A lint + a per-thesis deflated metric gate; raw win rate never promotes | M |
| 2 | **Walk-forward harness** (Glass as engine, not scoreboard) | Evidence on day one instead of in 4–33 years; structurally bans lookahead | Replay leaves over as-of snapshots; same grading path, simulated clock | L (critical path) |
| 3 | **Point-in-time / as-of layer** (`event_date` + `knowable_date`; ALFRED vintages) | Lookahead alone turns losers into "winners" | Two timestamps per input; clock filter | M-L |
| 4 | **Transaction-cost + liquidity engine** | Costs/spreads silently erase the edge on the contracts you'd actually trade | Deterministic cost primitive sibling to the Greeks calc; `spread_pct_of_premium` metric + liquidity gate | M |
| 5 | **Paper-trade gate** (`backtested→paper→live`) | Only forward test of honest data/fills/latency; overfitting alarm | Promotion state machine on the checks ledger | S-M |
| 6 | **Earnings/event-calendar brain with realized-vs-implied conditioning** | "Sell straddles pre-earnings" is *negative expectancy* unless realized/implied < ~0.80 | Leaf computes per-ticker realized/implied ratio; hard filter on theta-positive theses near earnings | M |
| 7 | **Correlation-aware portfolio sizing** | SWFL bets stack one factor; independent Kelly over-bets it | Master holds exposure matrix + factor-beta cap | M |
| 8 | **Data-gap / ablation finder** | Turns the flywheel from "add data we think helps" into "add data the scoreboard says helps"; counters alt-data alpha decay (~18-mo half-life now) | Hold-one-leaf-out re-run; rank by marginal deflated skill; "decaying signal" watchlist | M |
| 9 | **Defined-risk default + override validator** | Bounded loss makes Kelly well-posed; caps the account-ending tail | Structure templates + spec-validator rule | S-M |
| 10 | **Cadence-honest horizon matching** | Stops theta eating slow signals | `signal_half_life` field + master DTE guard | S |

Cross-cutting additions the prior plan skipped entirely: **define the options outcome function** (§3); a **why-this-persists** line per thesis (§7.9); and an explicit **regulatory/personal-trading boundary** (research vs your own capital vs advising others — the last is licensed activity).

---

## 11. Concrete build sequence (edge-first, not infrastructure-first)

1. **Week 1 — Falsify the premise (§2).** No new code. PIT regression of SWFL data vs forward returns of XHB *and* a FL-concentrated name. Pre-registered hypothesis + kill criterion. **If it fails, stop here** — you saved months.
2. **If it survives — build the honest backtest spine first, not the trade engine.** Walk-forward harness (#2) + PIT layer (#3) + multiple-testing gate (#1), reusing `grid.mts`/`skill-baseline.mts`. Backtest the *direction call* on the surviving signal before any options exist.
3. **Add the Greeks/cost calc layer** (py_vollib + the cost engine, #4) only once a direction edge clears deflated significance. Verify the Polygon tier live first (vendor-first).
4. **Paper-trade gate (#5)** for ≥ several months. Compare paper vs backtest; a gap halts everything.
5. **Only then** wire fractional, correlation-aware, defined-risk sizing (§8) — on real-but-tiny capital, off the lower CI bound.

Note the inversion vs the prior plan: it builds the Polygon pipeline + Greeks calc + Kelly sizer first and validates last. **Validate first.**

---

## 12. Standing don't-do list

- Don't call public Census/permit data "alternative data," and don't pitch a SWFL→national-homebuilder edge as real.
- Don't size with Kelly off a point estimate from <150 samples, ever.
- Don't sell undefined-risk premium on illiquid/niche names; don't sell straddles into a biotech binary.
- Don't quote a backtested/retrodicted accuracy number publicly — it stays `service_role`.
- Don't let master's call auto-fire as an order; keep thesis → structure → size → execute as gated stages.
- Don't pair short-dated options with monthly-half-life signals.
- Don't slide from "grade calls" to "recommend trades to others" without confronting the investment-advice/licensing line.

---

## 13. IBRX — my honest view

**Disclaimer:** this is my opinion as analysis, grounded in verified June 2026 facts (sources below) — **not** a recommendation, and explicitly **outside** what the SWFL brain platform is competent to call (no SWFL linkage, single-name binary biotech, fast-moving — this is "be Claude," not "fetch the lake").

**The facts (verified, as of 2026-06-08):** ImmunityBio (NASDAQ: IBRX) traded ~**$6.92** at the June 5 close (down from the ~$7.15–7.26 June 3–4 window), market cap **~$7.25B**, on **~1.05B shares**. 52-week range **$1.95–$12.43**, ADV ~14M — violently volatile. One approved product: **ANKTIVA (N-803)**, FDA-approved April 2024 for BCG-unresponsive NMIBC with CIS. **Patrick Soon-Shiong controls ~66%** (and is also the company's primary lender). Q1 2026 revenue **$44.2M (+168% YoY)**, FY2025 **$113M (+700%)** — but **adjusted net loss ~$86M/quarter** (~$80–90M burn), and the cash build to **$380.9M** was **financing-driven** (+$224M financing inflow), not operations. Short interest **~41.5% of float (~133M shares, ~10.6 days to cover)**. Analysts: consensus Strong Buy, targets ~**$13–14.70** (~2×).

**My read — what this stock actually is:**

This is a **founder-controlled, single-asset, catalyst-and-squeeze biotech**, not a value compounder. Three things define it:

1. **The commercial ramp is genuinely impressive** — +700% then +168% is one of the faster oncology launches relative to size, and the international footprint (~34 countries) and label-expansion optionality (papillary, BCG-naive CIS) are real TAM levers. That's the bull case and it's not nothing.
2. **The balance sheet is propped up by the founder and structural dilution.** Cash grew because of financing, not operations; the share count is past a billion and keeps growing via Nant note-to-equity conversions and the Oberland RIPA. Soon-Shiong owning ~66% *and* being the lender is both the safety net (he keeps backstopping it) and the governance overhang (minority holders have little say; related-party risk is everywhere). **You are partly betting on one man's willingness to keep funding it.**
3. **The next leg is binary.** The **papillary sBLA PDUFA on Jan 6, 2027** is the whole ballgame — and it already took a **2025 CRL/setback**, so approval is not a gimme. Pair a binary regulatory event with **~41.5% short interest** and a **tiny true float** (66% locked up by insiders) and you get a name that moves violently in *both* directions on headlines and can squeeze hard.

**Net:** at ~67× trailing sales on a single narrow indication, the valuation already prices in meaningful label expansion. I'd call it a **high-variance, event-driven speculation, not an investment** — the kind of position where, *if* you take it, **structure and sizing matter far more than the directional view.** I'm not bullish or bearish on the equity outright; I'm bearish on owning it *naively*.

**How the options framework above would treat IBRX — this is the perfect worked example:**
- **It's a binary-event name → never sell naked premium into it.** IV will be richly bid into the Jan 2027 PDUFA; the temptation is to sell that premium, but the left tail is a CRL gap-down. **Defined-risk only** (§8) — and binary Kelly is exactly the wrong sizing model here (§8): outcomes are bimodal, not fixed-odds.
- **Check IV percentile, not rank** (§6): after a 52-week range of $1.95→$12.43, IV *rank* is almost certainly pinned/compressed by old spikes while IV is still absolutely high — the precise divergence case where rank lies and you must use percentile.
- **The event-calendar brain (#6)** would flag the PDUFA as a hard date and gate any theta-positive structure; you'd only consider premium-selling if the historical realized/implied move ratio supported it (for a binary biotech, it usually doesn't).
- **Cadence honesty (§9):** this is *not* a slow-signal name — it's headline-driven, so it needs daily-at-minimum marks and rules-based exits, the opposite of the SWFL macro brains.
- If you wanted a defensible directional expression, a **defined-risk debit structure dated past Jan 6, 2027** (own the binary with capped loss) is far more sane than anything with unbounded downside — but size it as the lottery ticket it is (fixed tiny %, §8), not off a Kelly fraction you can't honestly estimate.

**One-line:** IBRX is a textbook example of a stock where the *brain platform adds nothing* (no SWFL edge, wrong cadence) but the *options-discipline layer adds everything* (binary event, distorted IV, fat tails, squeeze mechanics).

---

## 14. Bottom line

The prior plan's instincts are right and its architecture fits. But it **overstates a weak, public alt-data edge** and **understates the honesty machinery** — and you already own most of that machinery. Reorder the work: **falsify the premise first** (one week, no code), **build the walk-forward + multiple-testing + PIT + cost spine before the trade engine**, fix the Greeks math (theta is annual, IV is an input, q is missing, percentile not rank, py_vollib not mibian), size with **fractional, correlation-aware, distributional** Kelly off the *lower* CI bound on **defined-risk** structures, and never let a graded call become an order — or a public number — without passing its gate. Do that and "stocks with brains" is a disciplined research program. Skip it and it's a well-architected way to overfit and overbet.

---

## Appendix — IBRX sources (verified June 2026)

- stockanalysis.com/stocks/ibrx — price/market-cap/52wk/ADV (June 5, 2026)
- ImmunityBio Q1 2026 press release (BusinessWire / BioSpace / StockTitan) — revenue, cash, losses, R&D/SG&A
- SEC 13D/A Amendment No. 12 (Feb 25, 2026) — Soon-Shiong ~66.3% stake
- SEC Form 4 (Mar 31, 2026) — Nant $25M note → 4,606,596 shares @ $5.427
- ImmunityBio IR / Urology Times — papillary sBLA acceptance, PDUFA Jan 6, 2027
- Investing.com / StockTitan — May 18, 2026 FDA workshop
- company PR / Cancer Therapy Advisor — NCCN Cat 2A (papillary, Mar 2026)
- ImmunityBio PR — Oberland RIPA $75M / $375M committed
- FDA OPDP communication (Mar 13, 2026) — promotional materials
- MarketBeat / public.com / Benzinga — analyst targets, short interest (~41.5% of float, May 15, 2026 settlement)
