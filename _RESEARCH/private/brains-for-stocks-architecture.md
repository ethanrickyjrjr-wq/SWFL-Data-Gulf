# Brains for Stocks — The Architecture

> Clean-sheet design. **Assume the stock-data pipeline exists** (prices/OHLCV, the listed-options surface, fundamentals/XBRL, filings + transcripts, news/sentiment, positioning, macro, real-time event feeds). The question this answers: *given that pipeline, what new sections of the Brain factory do we build to generate high-level, predictive/speculative stock analysis from data + history + real-time events + algos — feeding the flywheel we already have.* Written 2026-06-08, grounded in current quant + LLM-analyst practice (sources at end).

---

## The core idea — Brains is structurally the right shape for this

The discipline Brains already enforces is *the same pattern* the production desks (JPMorgan, Morgan Stanley, Danske) ship for AI equity research:

- **Deterministic numbers in code, LLM writes only the narrative.** LLMs alone hit ~80% on financial QA; hybrid (code does the math, LLM frames it) reaches 99%+. That's literally Brain Factory rule 2.
- **Every output is a conditional, falsifiable, horizon-tagged call that gets graded.** That's already your master + flywheel.
- **Thin pipe** — downstream reads only the upstream's OUTPUT block, never its chain. That's already rule 1, and it's exactly what keeps a multi-agent equity stack from compounding noise.

So you are **not bending Brains to fit stocks. The shape already matches.** The work is *adding sections*, not a rewrite. Keep the spine — **Tier-1 leaf reporters → Tier-2 master synthesizer → Tier-3 flywheel grader** — and bolt on ten new sections.

```
                          ┌─────────────────────────────────────────────────────────┐
   REAL-TIME CLOCK ──────▶│  ⑤ EVENT LAYER  (Kafka bus · Flink CEP · Redis hot path) │
   (wake on catalyst)     │     earnings/8-K/halts/analyst-rev/unusual-options/news  │
                          └───────────────┬─────────────────────────────────────────┘
                                          │ "re-analyze(ticker, event, severity)"
   CADENCE CLOCK ─────────────────────────┼───────────────────────────────────────────
   (daily/weekly rebuild)                 ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │ TIER-1 LEAF REPORTERS  (numbers only, cited, as-of dated)                       │
   │  ① SIGNAL FOUNDRY: technical · fundamental · options/vol · sentiment/positioning│
   │  ⑥ NLP EXTRACTION: agentic RAG over filings/transcripts → structured facts      │
   │  ③ ALGO REGISTRY: GBDT / sequence / regime models, each a graded signal         │
   │            ↑ feeds on ② RISK-MODEL ENGINE (factor exposures, covariance)        │
   │            ↑ feeds on ⑦ EVENT-STUDY QUANTIFIER (catalyst → expected CAR)         │
   └───────────────────────────────────┬────────────────────────────────────────────┘
                                        │ thin pipe (OUTPUT blocks only)
   ┌────────────────────────────────────▼───────────────────────────────────────────┐
   │ TIER-2 MASTER SYNTHESIZER (the only speculator)                                  │
   │  ④ COMBINE + CONSTRUCT (code): IC-weight/meta-label blend → BL/HRP weights       │
   │  ⑧ BULL/BEAR DEBATE → ONE conditional, falsifiable, horizon-tagged thesis        │
   │     → ⑧ RED-TEAM CRITIC stress-tests before anything is graded                   │
   └───────────────────────────────────┬────────────────────────────────────────────┘
                                        ▼
   ┌────────────────────────────────────────────────────────────────────────────────┐
   │ TIER-3 FLYWHEEL  ⑨ VALIDATION GATE (CPCV · DSR · PBO) → ⑩ REWEIGHT + CALIBRATE   │
   │   grade every call OOS → reweight algos/signals by realized skill → retire decay  │
   └────────────────────────────────────────────────────────────────────────────────┘
```

---

## The new sections (this is the answer to "what other sections would we need")

### ① The Signal Foundry — a new family of leaf reporters
A whole class of leaf brains, each a **pure deterministic signal computer** emitting cross-sectional z-scores / percentile ranks per ticker, cited and as-of dated, zero opinion (the Tier-1 contract):

- **Technical / momentum leaf** — 12-1 momentum (Jegadeesh-Titman, skip-month), time-series momentum (Moskowitz-Ooi-Pedersen), 52-week-high proximity (George-Hwang), MA crossovers, MACD/RSI/Bollinger position, realized-vol-scaled returns, 1-month reversal.
- **Fundamental value/quality/growth leaf** — value (E/P, B/P, FCF/P, EV/EBITDA, shareholder yield), quality (Novy-Marx gross profitability, ROIC, Sloan accruals, Piotroski F-score, earnings stability), growth (sales/EPS CAGR, SUE), investment (asset growth). Winsorize → industry-neutralize → standardize.
- **Options-implied / vol-surface leaf** — IV level + term-structure slope, 25-delta risk reversal / skew, **variance risk premium** (implied − subsequently-realized variance), IV-rank, option-implied skew & correlation, earnings-IV-crush flags.
- **Sentiment / positioning leaf** — short interest %float, days-to-cover, short-interest surprise, put/call, 13F crowding & ownership change, ETF/fund flows, CFTC Commitment-of-Traders, insider transactions, NLP news/transcript/social sentiment — each with its **stated reporting lag** (13F ~45d, SI bimonthly).

> Reference alphas to seed it: WorldQuant's **Alpha101**, the Fama-French/Carhart factor zoo. Each becomes one leaf; adding a signal = adding a leaf.

### ② The Risk-Model Engine — a new shared section (not a leaf)
A cross-sectional **factor/risk model** (Fama-French 5 + Carhart momentum, or a Barra-style USE4/CNE5 with style + industry + country factors). Emits per-name **factor exposures**, the **factor covariance matrix**, and **specific (idiosyncratic) variance**. It's dual-purpose: a *signal source* (the residual/specific alpha is the part that isn't just a factor tilt) and the *risk plumbing* portfolio construction needs. This kills "factor leakage" — knowing whether a pick is real stock-selection or just a closet momentum bet.

### ③ The Algo Registry + Forecast Layer — this is the "adding algos" part
The new primitive: **an algo is a leaf reporter that emits a graded numeric signal, governed by a registry so grades bind to an immutable version.**

- **Labeling engine** — triple-barrier labeling (profit-take / stop / time, whichever hits first) + **meta-labeling** (a second model decides *whether to act*, i.e. sizing/precision), CUSUM event sampling, label-concurrency weighting. *(López de Prado / AFML.)*
- **Feature layer** — **fractional differentiation** (smallest `d` passing ADF) to make series stationary *without* destroying memory; technical/microstructure/cross-asset features.
- **Predictors (pluggable):** tabular — **XGBoost / LightGBM / CatBoost** (the workhorses on daily data); sequence — **TFT / N-BEATS / LSTM / TCN** (only where path structure genuinely beats trees — benchmark, don't assume); regime — **HMM / Hamilton Markov-switching / Bayesian Online Changepoint Detection**.
- **The registry contract:** each algo is a pinned artifact — code version + dataset hash + feature spec + hyperparams + training window + **frozen out-of-sample scorecard** (OOS hit-rate, Deflated Sharpe, PBO, decay half-life). It emits a probability **plus its own scorecard**. New versions are graded independently before promotion (MLflow / W&B-Registry pattern, SR 11-7-style governance).

That's what makes algos genuinely pluggable: drop in a new versioned algo, it must clear the same gate (⑨), and the flywheel (⑩) earns it weight **only** by realized OOS performance.

### ④ Combination + Portfolio Construction — new master-side math
Master currently *votes direction*. For stocks it runs deterministic blending then sizing, in code:
- **Blend:** IC-weighted averaging, factor-orthogonalization (neutralize correlated signals so weights don't collapse onto one bet), ML **stacking** for nonlinear blends, **meta-labeling** to filter. → one expected-return / rank / probability vector per horizon.
- **Construct:** **Black-Litterman** (blend market-equilibrium prior with the signal "views"), **Hierarchical Risk Parity** (cluster → quasi-diagonalize → recursive bisection; robust to the ill-conditioned covariance that makes naive Markowitz flip signs), risk parity, with **Ledoit-Wolf shrinkage** on the covariance and turnover/sector/beta constraints.

### ⑤ The Real-Time Event Layer — the second clock (the biggest structural add)
Brains is batch/cadence today. This bolts a **wake-on-catalyst** seam beside the cadence rebuild — it doesn't replace it:
- **Ingestion gateway** — normalizes feeds into canonical, provenance-tagged events: market data (WebSocket/FIX), **SEC EDGAR** full-text + RSS + the structured **XBRL** feed (8-K/10-K/10-Q/Form 4), news/sentiment vendors (RavenPack/Benzinga), analyst-revision feeds, **LULD halt** messages, unusual-options-activity.
- **Event bus** — **Kafka** (or Redpanda/Pulsar): partitioned topics keyed by ticker so events stay ordered per name; **durable + replayable** (replay = your backtest of the trigger rules).
- **Hot path** — **Redis Pub/Sub** + in-memory last-state for sub-ms trigger evaluation (transient, in front of the durable log).
- **CEP / stream processor** — **Flink / Kafka Streams** computes windowed features and evaluates trigger rules in flight (earnings surprise vs consensus / **SUE**, guidance delta, volume & price z-scores, options-volume vs 20-day baseline, halt). Trips → emits `re-analyze(ticker, event_type, severity)`.
- **Tick store** — **TimescaleDB / ClickHouse / kdb+** for tick + bar history (feeds features, event-study math, replay).
- **Orchestrator** — merges the two clocks: on a trigger, the **DAG resolves which leaves the event touches**, re-runs *only* those, forces master re-synthesis; **debounce/dedupe + a severity score gate** so event storms don't thrash the factory.

### ⑥ Financial NLP / Extraction — turning unstructured disclosure into signal
A new leaf type for the qualitative pipe: **agentic RAG** over filings/transcripts/news (hierarchical knowledge graph over doc structure + tables + time, not flat chunks; hybrid dense + BM25). Deterministic-then-narrative: **XBRL** parse for line items, **FinBERT** + **Loughran-McDonald** tone + forward-looking-statement classification, NER, then an LLM for **grounded, citation-carrying** summarization → structured JSON (surprise drivers, guidance change, **risk-factor diffs** between filings, sentiment). Hard rule, which is already yours: **no source span → no claim.**

### ⑦ Event-Study / Impact Quantifier — history informing real-time
Turns a catalyst into an **expected-impact number** so a trigger carries magnitude + confidence, not just "something happened": market-model (or Fama-French/CAPM) expected returns over an estimation window → **Abnormal Return (AR)** and **Cumulative Abnormal Return (CAR)** over the event window, **SUE-decile PEAD priors** (post-earnings-announcement drift), significance tests. This is where *history* ("how has this kind of surprise paid in the past") conditions the *real-time event*.

### ⑧ Synthesis Tier upgrade — debate → thesis → critic
Master stays the single speculator, but gains the multi-agent research pattern (TradingAgents / FinRobot Concept-CoT→Thesis-CoT):
- **Bull/bear debate** — two LLM researchers argue long vs short from the *same* leaf OUTPUT blocks for N rounds; a judge records the prevailing view. The contradiction-surfacing engine — forces the strongest opposing case onto the table before committing.
- **Master thesis** — reads leaf outputs + the deterministic blend + debate record, conditioned on the **regime label** from ③, emits **one** horizon-tagged, conditional **IF/THEN + falsifier** call with confidence (e.g. *"IF momentum-z stays >1 AND VRP stays positive over 1–3mo, THEN overweight; falsified if 12-1 momentum flips negative or skew steepens past X"*) plus the plain-English high-level analysis.
- **Red-team critic** — a risk/critic agent (TradingAgents' risk team + LLM-as-judge/self-critique) stress-tests for hallucinated numbers, missing falsifier, overconfidence, and exposure (vol/drawdown/liquidity) **before** the call is graded.

### ⑨ The Validation Gate — the bouncer in front of the flywheel
The single most important new section. **No algo or signal grades live until it clears it:** purged + embargoed **Combinatorial Purged Cross-Validation (CPCV)**, **Deflated Sharpe Ratio** (corrects the Sharpe threshold for number of trials — the False Strategy Theorem), **Probability of Backtest Overfitting (PBO)** via CSCV, **Minimum Track Record Length**. Feature pruning via **MDA / clustered importance** (not MDI, which is biased on correlated features). This is the line between a real edge and a data-mined ghost.

### ⑩ The Flywheel Reweighter + Calibration — the moat, closed
Your front-end flywheel already grades calls. Extend it into the learning loop:
- **Reweight** — track realized **OOS skill per algo per regime**, detect alpha decay (decay half-life) and distribution drift (**PSI**, calibration drift), reweight the live ensemble toward what actually works, **demote/retire decayed algos**. Capital/attention follows graded out-of-sample performance, never in-sample fit.
- **Calibrate** — confidence is **empirically tuned** (linear-probe / IRT-style judge calibration), not asserted — directly fixing LLMs' weak uncertainty awareness. Perfect calibration = stated confidence equals realized hit rate.
- **Reflect** — each thesis stored as a graded falsifiable call (trigger, horizon, falsifier, outcome) feeds reflection memory into future runs. **The scored, time-stamped call history is the moat.**

---

## One worked trace — how data + history + real-time + algos converge on a call

1. **NVDA reports earnings 4:05pm.** Event gateway publishes `earnings.transcript` + `8-K` to Kafka; Flink computes SUE vs IBES consensus, trips `re-analyze(NVDA, earnings, severity=high)`.
2. **Orchestrator** asks the DAG which leaves NVDA's earnings touch → wakes the **fundamental**, **options/vol**, **NLP-extraction**, and **sentiment** leaves (not the whole universe).
3. **Leaves recompute (numbers only):** fundamental leaf posts the SUE z-score + guidance delta from XBRL; NLP leaf posts the risk-factor diff + grounded guidance-change summary *with citations*; options leaf posts the IV-crush and post-print skew; ⑦ **event-study** posts the expected CAR prior from this SUE decile's historical PEAD.
4. **Algos (③)** re-score: the GBDT posts an updated up-probability with its frozen DSR/PBO scorecard; the regime model posts "risk-on, low-vol" state.
5. **Master (⑧):** bull/bear debate runs over those OUTPUT blocks; master issues *"IF guidance-raise holds AND post-print skew stays < X over 4 weeks, THEN overweight NVDA (horizon 1mo, conf 0.62); falsified if 30-day realized vol > implied or the GBDT prob drops below 0.55."* Red-team critic checks every number traces to a leaf span, confirms the falsifier exists. Published.
6. **Flywheel (⑩):** call logged with trigger + horizon + falsifier; 1 month later the realized CAR is joined, the call is graded, and the contributing algos' weights move by how right they were.

That's the whole point: **history** (PEAD priors, factor model), **real-time events** (the earnings trigger), and **algos** (GBDT + regime + meta-label) all flow through the *same* deterministic-math → LLM-narrative → graded-call spine you already run.

---

## What's genuinely new vs what you reuse

| Reuse (already the right shape) | Build new |
|---|---|
| Tier-1/2/3 reporter→synthesizer→grader spine | ① Signal Foundry (leaf family) |
| Thin-pipe OUTPUT contract | ② Risk-Model Engine (shared) |
| Conditional/falsifiable/horizon-tagged call format | ③ Algo Registry + forecast layer |
| Deterministic-math / LLM-narrative split | ④ Combine + portfolio construction |
| The flywheel grader + scored call history (moat) | ⑤ Real-time event layer (2nd clock) |
| "No source → no claim" provenance rule | ⑥ Financial NLP extraction |
| Confidence = min over upstreams; stale-upstream caveat | ⑦ Event-study impact quantifier |
| DAG resolver + cycle detection | ⑧ Debate + red-team critic |
| Validators-gate-writes pattern | ⑨ Validation gate (CPCV/DSR/PBO) |
| | ⑩ Reweighter + calibration loop |

---

## Build order (so it compounds instead of sprawling)

1. **Foundry + Risk-Model + the grader's Validation Gate first.** A few leaf signals → factor model → CPCV/DSR/PBO. You can grade signal quality before any algo or LLM exists. (Cadence clock only.)
2. **Algo Registry.** Add GBDT + one regime model as versioned, gated artifacts. Now "algos" are pluggable and self-grading.
3. **Combine + construct + master thesis + critic.** Turn graded signals into one falsifiable call with a red-team pass. This is the first end-to-end *analysis* product.
4. **Flywheel reweighter + calibration.** Close the loop — weights follow realized OOS skill.
5. **Real-time event layer + NLP + event-study last.** The second clock is the heaviest section; bolt it on once the cadence factory produces graded calls, and it reuses the exact same leaves and grader.

---

## The load-bearing traps (the ones that actually kill it)

- **Leakage beats everything else.** Plain K-fold leaks on overlapping labels; macro/consensus data is revised. Strict point-in-time + purge/embargo or every backtest lies. (Profit Mirage: LLM agents look brilliant until you remove the lookahead.)
- **Selection bias from many trials.** A factor zoo + many algos = guaranteed spurious winners. **DSR/PBO with trial-count logging is non-negotiable** before anything grades live.
- **Alpha decay + crowding.** Edges erode as capital piles in (half-lives have compressed hard). Monitor decay half-life and retire — don't assume persistence.
- **LLM numeric hallucination + bad calibration.** Route all arithmetic and table parsing to code; require source spans; tune confidence empirically. Never let the model emit a number it didn't get from a tool/span.
- **Sequence-model hype.** TFT/LSTM often don't beat a tuned GBDT on daily tabular data and cost far more — benchmark fairly, don't assume.
- **Event-study confounding + trigger thrash.** Overlapping catalysts contaminate CAR; noisy thresholds cause re-analysis storms. Clean event windows; debounce + severity-gate the triggers.

---

## Bottom line

You don't need a new product to do stocks — you need **ten new sections on the factory you already built.** The reporter→synthesizer→flywheel spine, the deterministic-math/narrative split, the falsifiable graded-call format, and the thin pipe are *exactly* the architecture the best AI-equity systems converge on. Add the **Signal Foundry** and **Algo Registry** (data + algos), the **Risk Model** and **Event-Study quantifier** (history), the **Real-Time Event Layer + NLP** (live catalysts), the **debate + critic** synthesis upgrade, and the **Validation Gate + Reweighter/Calibration** (the flywheel earning its name). The output is the thing you actually want: a grounded, conditional, falsifiable, horizon-tagged thesis per name — and a track record that proves whether the speculation has edge.

---

### Sources (real, fetched June 2026)
- Systematic signal stack / factors / portfolio construction: arxiv 2507.07107, 2512.11913; MSCI *Foundations of Factor Investing*; Hierarchical Risk Parity (Wikipedia / López de Prado); SSRN 2708678 (HRP); quantpedia (variance risk premium); MSCI/Barra primers.
- Event-driven + NLP: Kafka/Redis/TimescaleDB real-time design (Medium/IntuitionLabs); SEC EDGAR + XBRL; event-study methodology (eventstudytools); PEAD (Wikipedia, CMU PEAD.txt); FinGPT (AI4Finance); RavenPack; Context Analytics.
- ML + validation: Purged CV & Deflated Sharpe (Wikipedia); Bailey/López de Prado *Backtest Overfitting* (davidhbailey.com); Hudson&Thames (meta-labeling/triple-barrier); W&B *Modern Quant Lifecycle*; QuantInsti walk-forward; mlfinlab.
- LLM analyst agents: **TradingAgents** (arxiv 2412.20138); **FinRobot** (arxiv 2411.08804 / neurohive); Captide agentic-RAG on EDGAR; LLM-as-judge surveys; *Profit Mirage* (arxiv 2510.07920); Claude for Financial Services (Anthropic, 2025).
