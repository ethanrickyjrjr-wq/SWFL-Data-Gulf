# tier-divergence-swfl — design spec (the K-Shaped Market indicator)

**Status:** approved for implementation 2026-06-14. **Domain:** real-estate. **Brain id:** `tier-divergence-swfl`.
**Companion plan:** `~/.claude/plans/ancient-stargazing-shell.md`. **Pairs with** (does NOT touch) `seller-stress-swfl`.

---

## 1. Why

`seller-stress-swfl` measures **churn/capitulation** (who's giving up, how fast). Nothing measures
**which price tier is cracking.** SWFL is structurally K-shaped: ~50% cash buyers (≈70% condo)
insulate the **luxury top tier** while rate-shock + insurance-shock crush the financed **starter
bottom tier**. So top and bottom of the same ZIP move apart. **No vendor publishes a tier-divergence
signal at ZIP grain.** This brain reports, per SWFL ZIP, the luxury-vs-starter spread and whether it
is *widening* (entry market fracturing → bearish) or *compressing* (normalizing → bullish).

## 2. Decisions (locked)

- **v1 scope:** clean price-tier signal only (Zillow ZHVI top vs bottom tier). ZORI/NFIP enrichment = v2.
- **Grain:** per-ZIP (probe: 107/109 SWFL ZIPs carry both tiers). 2 top-only ZIPs (`33972`, `33974`)
  excluded with a caveat; no county rollup needed.
- **Catalog:** start in `KNOWN_INCOMPLETE`; graduate to `BRAIN_CATALOG` only after the first clean
  live cycle (probe clean + view-parity oracle passes live).
- **Consumption:** standalone leaf — NO DAG edge to `master`/`real-estate.mts` in v1.

## 3. Vendor facts (verified in-session 2026-06-14, CLAUDE.md Rule 1)

- Bottom (starter, 5–35th pct): `…/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_month.csv` — 200, ~130 MB, latest `2026-04-30`.
- Top (luxury, 65–95th pct): `…/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.67_1.0_month.csv` — 200, ~139 MB, latest `2026-04-30`.
- **No `_sm_sa` (smoothed/seasonally-adjusted) variant exists for the tiers** — RAW is the only form
  (the middle-tier `zhvi_swfl` brain uses `_sm_sa`). **Caveat carried** in pipeline + source + pack:
  the math leans on **YoY** (cancels seasonality by construction); raw level/MoM are seasonally noisy.
- Columns identical to `zhvi_swfl`: `RegionID, SizeRank, RegionName(=ZIP), RegionType, StateName,
  State, City, Metro, CountyName` + monthly date cols (1996-02 → 2026-04).
- **Tier cut geography RESOLVED 2026-06-14 (Zillow ZHVI User Guide):** the bottom (5–35th) / top
  (65–95th) percentile cutpoints are computed **per metro/region and then applied to each ZIP** — NOT
  per-ZIP quantiles, NOT national. A ZIP's `top_tier_value` = ZHVI of that ZIP's homes in the metro's
  upper band (Cape Coral-Fort Myers / Naples), **not "the ZIP's own top third."** Claim text stays
  observable: top-tier $ value vs bottom-tier $ value and their ratio. Filename encoding confirmed by
  live dollars (luxury > starter for 33901/33914/34102/34108). See `SOURCED.md#tier-divergence-swfl-tier-geography`.

## 4. Data contract

### 4.1 Tier-1 Parquet — `s3://lake-tier1/market/tier_divergence_swfl.parquet`
Wide-on-tier, long-on-month. Built by DuckDB: stream both raw CSVs → filter `State='FL' AND
RegionType='zip' AND Metro LIKE SWFL metros` → UNPIVOT each to long → **FULL OUTER JOIN on
(zip_code, period_end)**, COALESCE metadata. Keep rows where ≥1 tier non-null. Guard: `row_count > 0`.

| col | type | note |
|---|---|---|
| `zip_code` | VARCHAR | RegionName |
| `period_end` | DATE | |
| `top_tier_value` | DOUBLE (nullable) | luxury 0.67–1.0 |
| `bottom_tier_value` | DOUBLE (nullable) | starter 0.0–0.33 |
| `metro`, `county_name`, `city` | VARCHAR | COALESCEd across the two sources |
| `ingested_at` | VARCHAR (ISO) | |

### 4.2 Tier-2 table — `data_lake.tier_divergence_swfl`
dlt `write_disposition="merge"`, PK `(zip_code, period_end)`. Same columns. Reads Tier-1 Parquet via
`_ensure_tier1_fresh()` guard (mirror `zhvi_swfl`). `_ingest_metadata.source = "zillow_zhvi_tiers"`.

### 4.3 Views — `docs/sql/20260614_tier_divergence_views.sql` (apply directly; GRANT both; NOTIFY pgrst)

**B. `data_lake.tier_divergence_zip_latest`** (brain-input, one row per both-tier ZIP ≈107). Anchor =
per-ZIP latest period where **both** tiers non-null. All YoY use the ZHVI **±7-day MAX-within-window**
rule (`ORDER BY period_end DESC LIMIT 1` inside a `BETWEEN anchor-12mo ±7d`), NULL when no partner.

| col | formula |
|---|---|
| `latest_period` | DISTINCT ON (zip_code) … WHERE both non-null ORDER BY period_end DESC |
| `top_tier_value_latest`, `bottom_tier_value_latest` | values at `latest_period` |
| `top_tier_value_3m_avg`, `bottom_tier_value_3m_avg` | AVG of each tier over `(latest−3mo−7d, latest]` (anchor + up to 2 prior), in the `smoothed` CTE |
| `tier_spread_ratio` | **`top_3m_avg / NULLIF(bottom_3m_avg,0)`** — the LEVEL, a 3-month trailing average (RAW index is noisy; this is the ONLY metric using the trailing mean). Review fix #2, 2026-06-14 |
| `tier_spread_yoy_pct` | `(spread_latest / spread_yearago − 1)*100` on **RAW** spreads (latest vs both-present series within ±7d of latest−12mo). YoY stays RAW — it already cancels seasonality |
| `bottom_tier_yoy_pct` | `(bottom_latest / bottom_yearago − 1)*100`, lookback in the **bottom-non-null** series, anchored to `latest_period` |
| `top_tier_yoy_pct` | same, top-non-null series |

**A. `data_lake.tier_divergence_pivoted`** (display, one row per month): `month`,
`percentile_cont(0.5) WITHIN GROUP (ORDER BY top/NULLIF(bottom,0))` as `median_spread_ratio`,
`count(*)` both-tier as `both_tier_zip_count`. Both-present filter.

### 4.4 Source — `refinery/sources/tier-divergence-zip-latest-source.mts`
Mirror `zhvi-zip-latest-source.mts` exactly. `SOURCE_ID="tier_divergence_zip_latest"`, `trust_tier:3`,
TTL 35d. **GATE B** via `assertViewRowFloor`, `MIN_VIEW_ROWS = 85`. **Citation (MUST-FIX #3):** keep
the `env.source` fixture/live branch; `LIVE_CITATION` references `data_lake.tier_divergence_zip_latest`
and "top-tier (0.67-1.0) vs bottom-tier (0.0-0.33), RAW (not seasonally adjusted)". Row interface
`TierDivergenceZipLatestRow`: zip_code, metro, county_name, city, latest_period,
top_tier_value_latest, bottom_tier_value_latest, tier_spread_ratio, tier_spread_yoy_pct,
bottom_tier_yoy_pct, top_tier_yoy_pct.

## 5. The brain — `refinery/packs/tier-divergence-swfl.mts`

Deterministic (`skipSynthesisAgent:true`, `skipTriageAgent:true`, `fitScore:()=>10`, TTL 35d,
`sources:[tierDivergenceZipLatestSource]`, `input_brains:[]`). Regional rollup over view rows
(median, K-shape count) — per-ZIP math is in the view.

### 5.1 POLARITY AUDIT (MUST-FIX #1 — audit each leg; do NOT inherit ZHVI "rising value = bullish")

| Leg (regional median) | Movement | Contribution to brain `direction` |
|---|---|---|
| `tier_spread_yoy_pct` | rising / widening | **BEARISH** driver |
| `bottom_tier_yoy_pct` | falling | **BEARISH** driver |
| `top_tier_yoy_pct` | rising | **informational only — casts NO bullish vote** |
| K-shape flag `top_yoy ≥ 0 AND bottom_yoy < 0` | per ZIP | **BEARISH headline**; count is a modifier/caveat |

`direction` = **bearish** if `median_spread_yoy > DEADBAND` OR `median_bottom_yoy < -DEADBAND`;
**bullish** if `median_spread_yoy < -DEADBAND` AND `median_bottom_yoy > DEADBAND` (compressing AND
starter rising = healing); else **neutral**. `top_yoy` never enters this. magnitude =
`min(|median_spread_yoy|/10, 1)`.

### 5.2 THRESHOLDS (MUST-FIX #2 — emit actual value + cite)

`DEADBAND = 1.0` (percentage points of YoY). **Provisional v1**, documented in `SOURCED.md`:
recalibrate to ≈1 SD of `tier_spread_yoy_pct` across both-tier SWFL ZIPs over a baseline that
**EXCLUDES the 2020–2021 COVID appreciation spike** (folding it in inflates the SD and over-widens the
band) — e.g. 2018–2019 pre-shock + 2023-onward post-normalization, or a robust dispersion (MAD) — at
the **graduation gate** (first live cycle). K-shape breakpoints at **0** are natural (no citation).

### 5.3 key_metrics (5 vocab slugs + per-ZIP patterns)

| slug | value | direction_concept |
|---|---|---|
| `tier_spread_ratio_swfl` | regional median spread (×) | qual_metric_trajectory |
| `tier_spread_yoy_pct_swfl` | regional median spread YoY % (**polarity driver**) | qual_metric_trajectory |
| `tier_bottom_yoy_pct_swfl` | regional median bottom-tier YoY % | qual_metric_trajectory |
| `tier_top_yoy_pct_swfl` | regional median top-tier YoY % (**informational — non-bullish polarity**) | set so rising ≠ bullish |
| `tier_kshape_zip_count_swfl` | count of ZIPs in K-shape (of N both-tier) | qual_metric_trajectory |

Per-ZIP pattern slugs (via `refinery/vocab/patterns.mts` `raw_slug_patterns`) for the widest-fracture
ZIPs: `tier_spread_ratio_zip_<zip>`, `tier_spread_yoy_pct_zip_<zip>`.

### 5.4 detail table `tier_divergence_by_zip` (grain `zip`)
cols: metro, county_name, city, latest_period, top_tier_value, bottom_tier_value, spread_ratio,
spread_yoy_pct, bottom_yoy_pct, top_yoy_pct, kshape (bool). One row per both-tier ZIP.

### 5.5 caveats (always)
- "RAW (not seasonally adjusted) Zillow tier index; YoY is the seasonality-robust read."
- "2 SWFL ZIPs (33972, 33974) lack a starter tier and are excluded from the divergence."
- SWFL context: ~50% cash buyers insulate the top tier — a holding luxury tier is NOT a bullish signal.

## 6. Test parity — `refinery/packs/_tier-divergence-oracle.mts`
Self-contained TS reimplementation of view B from raw long rows (mirror `_home-values-oracle.mts`:
own `median`, own `lookbackObservation` ±7d). Parity test
`refinery/packs/tier-divergence-zip-latest-view-equivalence.test.mts` diffs SQL view == oracle. Pack
unit test `refinery/packs/tier-divergence-swfl.test.mts` asserts polarity table + K-shape + DEADBAND
on a fixture. (vitest view-parity may be CI-only — skipped locally per Gate-5 note.)

## 7. Registration (same commit as pack)
- `refinery/vocab/brain-vocabulary.json` — 5 concepts (prefLabel + scope_note) + 5 `slug_index`
  entries + the two `tier_*_zip_*` `raw_slug_patterns`. `tier_top_yoy_pct_swfl` direction_concept
  must not vote bullish on a rise.
- `refinery/packs/index.mts` — import + `PER_PACK_REGISTRY` entry (`// scaffold:` markers).
- `refinery/packs/catalog.test.mts` — add `"tier-divergence-swfl"` to `KNOWN_INCOMPLETE` (no
  `BRAIN_CATALOG` entry yet).
- `ingest/cadence_registry.yaml` — `tier_divergence_swfl_duckdb` (tier-1-duckdb) +
  `tier_divergence_swfl_tier2` (tier-2, `liveness_view: data_lake.tier_divergence_zip_latest`,
  `expected_rows_min: 1`).

## 8. Crons (+ `--dry-run`)
- `.github/workflows/tier-divergence-tier1-monthly.yml` (day 21, 12:00 UTC) → duckdb pipeline.
- `.github/workflows/tier-divergence-tier2-monthly.yml` (day 22, 12:00 UTC) → dlt pipeline.

## 9. Verification
1. `python -m ingest.duckdb_pipelines.tier_divergence_swfl.pipeline --dry-run` (rows>0, both tiers).
2. Tier-1 → Tier-2 live; apply view SQL; PostgREST read of `tier_divergence_zip_latest` (≈107 rows).
3. `bun test refinery/packs/tier-divergence-swfl.test.mts` + parity test.
4. `bun refinery/tools/check-vocab-coverage.mts --all` → 0 orphans.
5. `bun test refinery/packs/catalog.test.mts` → Gate 5 clean.
6. `npm run refinery -- tier-divergence-swfl --target-only` → clean `--- OUTPUT ---`.
7. Smoke ZIP 33914 (Cape Coral) via `swfl_fetch` — spread + K-shape headline reads cleanly.
