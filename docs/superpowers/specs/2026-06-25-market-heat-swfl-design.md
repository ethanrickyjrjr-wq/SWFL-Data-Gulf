# market-heat-swfl — design spec

**Date:** 2026-06-25
**Status:** Design — approved forks, pre-implementation
**Author:** Claude (brainstorming session, RULE 3.5)
**Build-queue line:** `_AUDIT_AND_ROADMAP/build-queue.md` — "realtor.com market-aggregate brain (ZIP-grain inventory/DOM/price-cuts)"

---

## 1. What it is

A **deterministic, ZIP-grain** Tier-1 reporter brain that reads realtor.com's free public-S3
market aggregates for the ~6-county SWFL ZIP footprint and emits **one polarity-safe directional
call** (market **tightening = bullish**) plus a per-ZIP `detail_table`. No LLM in the math path.

It is the **ZIP-grain sibling** of `seller-stress-swfl` (same machinery: Tier-1 parquet → DuckDB
source connector → pack with `corpusSummary`/`outputProducer`, `skipSynthesisAgent: true`,
`skipTriageAgent: true`). It is **independent of** the orphan `fred_listing_swfl` (which is the
**MSA-grain FRED** version of the same realtor.com series — different grain, different source URL,
left untouched).

**What it owns (no overlap):** active inventory, DOM, new listings, pending/demand-balance, and the
**directional tightening vote**, all at **ZIP** grain. Redfin price-cuts already feed
`seller-stress-swfl`; realtor's `price_reduced_share` is used here only as a coincident *context*
signal, not as the vote driver, so the two brains do not double-count.

**Out of scope (stated, not silently dropped):** this is **list-side only** — there are **no
closed/sold prices** in this source. Transaction prices are the ATTOM lane.

---

## 2. Provenance & license (verified live 2026-06-25, in-session)

Per Global Rule 1 / RULE 0.4 (Vendor-First), the surface was **re-verified live this session** — not
trusted from the prior session's gitignored crawl4ai dump. Both files fetched, headers + first data
row confirmed verbatim.

| File | URL | Grain | Notes |
|---|---|---|---|
| Core Metrics (History) | `https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Zip_History.csv` | ZIP × month | full time series; carries `_mm`/`_yy` deltas inline |
| Hotness (History) | `https://econdata.s3-us-west-2.amazonaws.com/Reports/Hotness/RDC_Inventory_Hotness_Metrics_Zip_History.csv` | ZIP × month | back to 201912; `hotness_score`/`supply_score`/`demand_score`/`hotness_rank` |

- **License:** attribution-only. Every emitted metric/citation carries **"Data provided by
  Realtor.com"** + the source-research homepage (`https://www.realtor.com/research/data/`).
- **Cadence:** monthly restatement (~first week of month). They **restate full history each month**
  → ingest is **REPLACE, never append** (overwrite the fixed-path parquet).
- **Verified columns (Core, verbatim):** `month_date_yyyymm, postal_code, zip_name,
  median_listing_price(+_mm,+_yy), active_listing_count(+_mm,+_yy), median_days_on_market(+_mm,+_yy),
  new_listing_count(+_mm,+_yy), price_increased_count/share, price_reduced_count/share,
  pending_listing_count(+_mm,+_yy), median_listing_price_per_square_foot, median_square_feet,
  average_listing_price, total_listing_count, pending_ratio(+_mm,+_yy), quality_flag`.
- **`_yy` semantics (verified empirically):** the `_yy`/`_mm` columns are **fractional** year/month
  changes (e.g. `active_listing_count=222`, `active_listing_count_yy=0.4323` = +43.2% YoY;
  `pending_ratio=0.1935`, `pending_ratio_yy=-0.0865` = −8.65% YoY). The vote scales against these
  fractions directly.

---

## 3. Polarity grounding (verbatim, carried from the resolved crawl4ai pass)

- **FRED** (Fed, republishing realtor.com's method): "The Hotness score is an equally-weighted
  composite of a market's supply score (based on days on market) and demand score (based on
  realtor.com listing views)."
- **realtor.com methodology:** "A higher score indicates a stronger (hot) housing market… markets
  that heavily favor sellers… good for sellers." **Plus the caveat:** "Realtor.com scores markets
  relative to each other… a score of 100 is simply the hottest among markets right now, but it may
  not necessarily be in a boom mode."
- **Rocket Mortgage** (housing indicators guide): "More months [of supply] indicate a buyer's market,
  while fewer months favor sellers." Thresholds: months-of-supply <3 = seller's market, DOM <14 =
  strong seller's; "in a seller's market, limited supply can drive prices upward." Also: a shrinking
  active-to-pending ratio "signals strong demand before prices reflect it."

**Conclusion:** low/falling inventory + short/falling DOM + high/rising pending ratio → seller's
market → upward price pressure → **BULLISH**. Loosening → bearish.

**The polarity trap (locked safely):** Market **Hotness is a cross-sectional rank, not an absolute
cycle gauge** — a SWFL ZIP can rank "hot" nationally while cooling locally. Therefore the directional
vote is driven **only** by absolute time-series with real up/down meaning (the `_yy` deltas), and
**Hotness is used as a relative descriptor only**, never as the vote driver.

---

## 4. Architecture (forks resolved)

```
realtor.com public S3 (2 History CSVs)
        │  ingest/pipelines/market_heat_swfl/  (python, --dry-run, REPLACE, non-null guard)
        ▼
lake-tier1/market/market_heat_core_swfl.parquet      (fixed path, overwritten monthly)
lake-tier1/market/market_heat_hotness_swfl.parquet
        │  refinery/sources/market-heat-{core,hotness}-source.mts  (makeDuckDBSource, fixtures)
        ▼
refinery/packs/market-heat-swfl.mts
   corpusSummary: join on (zip, month) → per-ZIP tilt → region median
   outputProducer: BrainOutput { direction, magnitude, 5 key_metrics, per-ZIP detail_table, caveats }
        │
        ▼  consumers read the BRAIN (no Tier-2 table)
/api/b/market-heat-swfl · dossier/report path · reconciliation engine · /r/zip-report
```

**FORK 1 — storage = Tier-1 parquet (decided, not Tier-2 table).** market-heat is a *brain*;
consumers read per-ZIP facts out of its `detail_table`, which keeps the no-invention gate on the
output. The aggregate-at-source decree targets hauling millions of raw rows; realtor hands us ~50
pre-aggregated ZIP rows/month, so it doesn't bind. Tier-2 would add a new writable lake surface
(grants + REPLACE guard + ZIP G1/G3 gates) for zero downstream gain today. **Promotion is additive**:
if a non-brain consumer later needs raw SQL, the pipeline writes a Tier-2 table too — one function,
no redesign.

**FORK 2 — vote = sign+magnitude off `_yy` deltas (decided, not z-score-vs-baseline).** Uses
realtor's own published YoY directly; no baseline window → immune to the Jan–Mar baseline-starvation
bug class the seller-stress code carries comments about; most honest to the "absolute time-series"
framing.

---

## 5. The polarity-safe vote (core IP)

### 5.1 Per-ZIP signals (latest month per ZIP)

Three **primary** signals, each normalized to `[-1, +1]` where **+1 = maximally bullish**:

| Signal | Column | Polarity | Normalized |
|---|---|---|---|
| Inventory Y/Y | `active_listing_count_yy` | falling inventory = tightening = bullish | `s_inv = clamp(−active_listing_count_yy / CAP, −1, +1)` |
| DOM Y/Y | `median_days_on_market_yy` | selling faster = tightening = bullish | `s_dom = clamp(−median_days_on_market_yy / CAP, −1, +1)` |
| Pending ratio Y/Y | `pending_ratio_yy` | **rising** pending÷active = demand tightening = bullish | `s_pend = clamp(+pending_ratio_yy / CAP, −1, +1)` |

> **⚠ Inversion trap, pinned:** realtor's `pending_ratio = pending ÷ active`, so **rising**
> `pending_ratio` is bullish → `s_pend` uses **+**`pending_ratio_yy`. (The Rocket phrasing
> "*active-to-pending* ratio shrinking = strong demand" is the reciprocal — same direction. The
> implementation must use the **+** sign on realtor's column. A unit test asserts this exact sign.)

`CAP` = proposed default **0.30** (a 30% YoY move = full-strength signal). Calibration-pending,
documented like `seller-stress-swfl`'s `CANCELLATION_WEIGHT` (judgment floor, not a derived value).

**Coincident context (not vote drivers):** `price_reduced_share` (current level + trend — fewer cuts
= supporting bullish) and `new_listing_count_yy` (ambiguous: supply vs churn) ride in the
`detail_table` and caveats, but carry **zero weight** in the tilt.

**Per-ZIP suppression:** require **≥2 of the 3** primary signals present (non-null) at the latest
month, else the ZIP is suppressed (mirrors `seller-stress-swfl`'s `MIN_SIGNALS_AT_LATEST` gate, scaled
to a 3-signal vote). `quality_flag != 0` rows are also suppressed (realtor's own low-confidence flag).

**Per-ZIP tilt** = mean of the present normalized signals ∈ `[-1, +1]`.

### 5.2 Region roll-up (the headline)

- **Region tilt** = **median** of per-ZIP tilts (median, not mean — robust to a single outlier ZIP,
  same choice as seller-stress).
- **Direction** (proposed thresholds, calibration-pending):
  - `region_tilt ≥ +0.25` → **bullish**
  - `region_tilt ≤ −0.25` → **bearish**
  - `|region_tilt| < 0.25` **and** the three regional median signals **disagree in sign** → **mixed**
  - `|region_tilt| < 0.25` **and** signals broadly agree/flat → **neutral**
- **Magnitude** = `min(|region_tilt|, 1)`.

### 5.3 Forward thesis + falsifier (per the research)

- **Thesis anchor = pending ratio** (the leading edge: "signals strong demand before prices reflect
  it").
- **Falsifier (computable because we hold History):** *"The bullish read is falsified if
  `pending_ratio` falls for **2+ consecutive months** while `active_listing_count` rises."* Emitted as
  an `[INFERENCE]`-tagged forward line with this exact base + falsifier (rules-of-engagement rule 2).

### 5.4 Hotness — relative descriptor ONLY

`hotness_score`, `supply_score`, `demand_score`, `hotness_rank`, `median_dom_vs_us` are surfaced in
the `detail_table` and prose **only** as cross-sectional context ("which SWFL ZIPs are hottest vs.
each other / vs. the US"). They carry **zero weight** in direction/magnitude. A test asserts that
permuting hotness values does not move `direction`/`magnitude`.

---

## 6. BrainOutput shape

**direction** ∈ {bullish, bearish, mixed, neutral} · **magnitude** ∈ [0, 1] (see §5.2).

**5 key_metrics** (region medians, mirroring the seller-stress 5-metric shape):

1. `market_heat_tilt_swfl` — composite tilt rescaled to 0–100 for display via `(region_tilt + 1) × 50`
   (50 = balanced, >50 = tightening/bullish), `raw`. Direction/magnitude read the raw `region_tilt`,
   **not** this rescaled display value (decoupled, like seller-stress's raw-composite vs 0–100 score).
2. `active_listing_count_yy_swfl` — median YoY inventory change, `percent` — **the lead signal**
3. `median_days_on_market_yy_swfl` — median YoY DOM change, `percent`
4. `pending_ratio_swfl` — median current pending ratio (+ direction from its YoY), `raw`
5. `price_reduced_share_swfl` — median current price-cut share, `percent` — coincident context

**detail_table** `market_heat_by_zip` (grain: zip), one row per SWFL ZIP, columns:
`tilt, active_listing_count, active_yy, median_dom, dom_yy, pending_ratio, pending_ratio_yy,
new_listing_count, price_reduced_share, hotness_score(relative), hotness_rank(relative), month`.
Suppressed ZIPs appear with null vote cells + a `suppressed` reason, never invented.

**caveats** (always present):

- "**List-side only** — these are active-listing metrics; there are no closed/sold prices in this
  source. Sold-price reads come from the ATTOM lane."
- "**Hotness is a cross-sectional national rank, not an absolute cycle gauge** — a SWFL ZIP can rank
  hot nationally while cooling locally. The directional call is driven by inventory/DOM/pending Y/Y,
  not by Hotness."
- "~50% of SWFL transactions are all-cash (Lee County, ATTOM 2024) — national rate-sensitive
  thresholds are muted; read the YoY tightening, not absolute DOM cutoffs."
- "Hurricane Ian (Sept 2022) is a labeled event — inventory/DOM dislocations Oct 2022–Mar 2023 are
  forced, not organic demand."
- "Data provided by Realtor.com." (attribution-only license)
- `N` ZIPs suppressed (insufficient signals or `quality_flag`) when `N > 0`.

---

## 7. Guards, freshness & cron (the "don't let it break" layer)

1. **Pipeline-freshness (same-PR):** `.github/workflows/ingest-market-heat-swfl.yml` monthly cron +
   `--dry-run` path shipped in the same PR (`docs/standards/pipeline-freshness.md`).
2. **Gate-4 (destructive write):** the REPLACE of each parquet is guarded by a **non-null row-count
   floor** (`ingest.lib.guards`) — an empty/short fetch aborts the overwrite, prior file stays
   intact. (No `ALLOW_REPLACE_WITHOUT_GUARD`.)
3. **Probe-first:** `--dry-run` fetches + filters + prints first/last row and SWFL row count without
   uploading (sub-minute), per the ingest PROBE-FIRST gate.
4. **Empty-tolerance:** the source connectors carry `fixturePath`; `outputProducer` returns
   `direction: "neutral"` with an explanatory caveat on zero scored ZIPs — **never throws** (seller-
   stress precedent).
5. **ZIP gates:** `postal_code` is the **listing's** ZIP (site-based, **G1 satisfied** — not a
   mailing ZIP). Scope filter = membership in `fixtures/swfl-zip-county.json` `entries[].zip`
   (Census is the sole scope authority). No Tier-2 `zip_code` column written → **G3 N/A**.
6. **Cadence registry:** entry under `pipelines:` (NOT `not_yet_running:` — the S3 source ingests
   immediately; this is not an Operation Dumbo Drop case), `lane: tier-1`, `cadence_days: 30`,
   `tolerance_multiplier: 2.0`, `inventory_id: lake-tier1/market/market_heat_*_swfl.parquet`.
7. **Brain-first + vocab gates (same-PR, hook-enforced):** the consuming pack ships with the ingest;
   the brain is registered in `brain-vocabulary.json` + `refinery/packs/index.mts` + catalog +
   master (`input_brains`/`sources` mirrored — `project_master-sources-inputbrains-gap`) in the same
   commit, so the orphan linter doesn't abort the GHA rebuild. `bun refinery/tools/check-vocab-
   coverage.mts --all` + `catalog.test.mts` green pre-push.
8. **Freshness token** quoted on first response (data-protocol v3 rule 2); as-of date rendered
   MM/DD/YYYY (never the raw token).

---

## 8. File manifest (what the implementation creates)

**Ingest (python):**
- `ingest/pipelines/market_heat_swfl/__init__.py`
- `ingest/pipelines/market_heat_swfl/constants.py` — URLs, bucket, parquet paths, `OBSERVATION_START`
- `ingest/pipelines/market_heat_swfl/resources.py` — fetch + SWFL-ZIP filter (reads the fixture)
- `ingest/pipelines/market_heat_swfl/pipeline.py` — `--dry-run`, guarded REPLACE, inventory upsert
- `ingest/tests/pipelines/market_heat_swfl/` — fetch/filter/guard unit tests (incl. a fixed CSV sample)

**Refinery (TS):**
- `refinery/sources/market-heat-core-source.mts` + `…-hotness-source.mts`
- `refinery/__fixtures__/market-heat-swfl-*.sample.json`
- `refinery/packs/market-heat-swfl.mts` + `refinery/packs/market-heat-swfl.test.mts`

**Wiring:**
- `refinery/packs/index.mts` (register), catalog mirror, master `input_brains`/`sources`,
  `brain-vocabulary.json` slugs (all metric/detail slugs the pack can emit)
- `ingest/cadence_registry.yaml` entry
- `.github/workflows/ingest-market-heat-swfl.yml`
- empty-tolerant `brains/market-heat-swfl.md` placeholder

---

## 9. Test plan (TDD)

- **Vote polarity** (the load-bearing tests): falling inventory → bullish; rising DOM → bearish;
  **rising `pending_ratio` → bullish** (the inversion guard); all-three-tightening → strong bullish.
- **Hotness inertness:** permuting hotness columns does not change `direction`/`magnitude`.
- **Suppression:** a ZIP with <2 present signals or `quality_flag != 0` is suppressed, not invented.
- **Empty tolerance:** zero rows → `neutral` + caveat, no throw.
- **Falsifier presence:** the forward line carries the exact `[INFERENCE]` base + 2-month falsifier.
- **Region median** robustness: a single outlier ZIP does not flip the headline.
- **Pipeline (python):** SWFL filter keeps only `entries[].zip`; guard aborts REPLACE on short fetch;
  `--dry-run` uploads nothing.

---

## 10. Deferred / explicitly out of scope

- **Sold/closed prices** — not in this source (ATTOM lane). Stated as a caveat, not a gap to fill.
- **Tier-2 promotion** — only if a non-brain consumer needs raw SQL; additive, not now.
- **`fred_listing_swfl` retirement** — the MSA-grain orphan is independent; whether to retire or
  re-consume it is a separate cleanup, not part of this build.
- **`/r/zip-report` market-heat panel** — this brain unblocks the build-queue's "crawl4ai current-
  data pass" item, but the report-side UI is its own follow-on (reads this brain's `detail_table`).

---

## 11. Sources

- realtor.com Economic Research Data Library — `https://www.realtor.com/research/data/`
  (Core Metrics + Hotness ZIP files; attribution-only)
- FRED — Market Hotness Score — `https://fred.stlouisfed.org/series/HOSCMSA31080`
- realtor.com Hottest Markets methodology — `https://www.realtor.com/research/reports/hottest-markets/`
- Rocket Mortgage — Guide to Housing Market Indicators —
  `https://www.rocketmortgage.com/learn/guide-to-housing-market-indicators`
- Sibling precedent: `refinery/packs/seller-stress-swfl.mts`
- SWFL scope authority: `fixtures/swfl-zip-county.json`
