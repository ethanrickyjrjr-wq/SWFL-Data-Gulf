# Plan: Redfin Cancellations + Delistings Pipelines & Brain

## Context

Two Redfin sub-datasets confirmed real via Spider scrape of the JS bundle at
`https://www.redfin.com/news/data-center/downloads/`. Separate from the existing
`redfin_swfl` Tier-1 parquet (48-column main market tracker). Both have genuine
ZIP+county grain.

- **Home Purchase Cancellations** — count of pending contracts that fell through +
  rate as % of pending sales. Buyer-stress signal. Updated monthly ~15th.
- **Home Delistings & Relistings** — count of listings pulled without a sale +
  share of active listings; relisted count + share. Seller-confidence signal.
  Updated monthly ~15th. Data starts 2016.

**Starter home cron question (CLOSED):** `starter_homes/` only has
`country.csv`, `state.csv`, `all_metros.csv` — NO ZIP or county file. The user's
downloaded CSV is Florida-state-level only. Cannot be auto-cronned at our grain.

**Future finds (note, not now):**
- `price_drops/monthly/all_counties.csv` + `all_zips.csv` exist → third buildable
  Redfin ZIP+county dataset; wire when we get to price-drop signal.
- Zillow ZHVI tier URLs confirmed live (starter/luxury proxies at ZIP grain);
  add to Zillow ZHVI pipeline when built.

---

## Confirmed S3 URLs (probed + verified)

Base: `https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center`

Format: **plain quoted CSV** (NOT gzip TSV — no `zlib`, no `split("\t")`).
Size: country-level is ~20KB; county + ZIP files will be larger but download in
seconds (plain GET, no streaming decompression needed).

```
contract_cancellations/monthly/all_counties.csv   ← Lee + Collier rows
contract_cancellations/monthly/all_zips.csv       ← ~125 SWFL ZIP rows

delistings_relistings/monthly/all_counties.csv
delistings_relistings/monthly/all_zips.csv
```

### Actual column headers (probed from `country.csv` — same schema at all grains)

**Cancellations:**
```
LAST UPDATED, FREQUENCY, PERIOD BEGIN, PERIOD END, REGION TYPE, REGION NAME,
HOME PURCHASE CANCELLATIONS, HOME PURCHASE CANCELLATIONS MOM (%),
HOME PURCHASE CANCELLATIONS YOY (%),
PERCENT OF PENDING SALES (%), PERCENT OF PENDING SALES MOM (PPTS),
PERCENT OF PENDING SALES YOY (PPTS)
```

**Delistings:**
```
LAST UPDATED, FREQUENCY, PERIOD BEGIN, PERIOD END, REGION TYPE, REGION NAME,
TOTAL DELISTINGS, TOTAL DELISTINGS MOM (%), TOTAL DELISTINGS YOY (%),
TOTAL RELISTINGS, TOTAL RELISTINGS MOM (%), TOTAL RELISTINGS YOY (%),
SHARE OF LISTINGS DELISTED (%), SHARE OF LISTINGS DELISTED MOM (PPTS),
SHARE OF LISTINGS DELISTED YOY (PPTS),
SHARE OF LISTINGS RELISTED (%), SHARE OF LISTINGS RELISTED MOM (PPTS),
SHARE OF LISTINGS RELISTED YOY (PPTS)
```

Note: `REGION NAME` is the geography string (e.g. "Lee County, FL", "33901").
`REGION TYPE` discriminates the grain (e.g. "County", "Zip Code").
`PERCENT OF PENDING SALES (%)` is already a percentage (e.g. 13.64) — NOT a
decimal fraction. Store as-is; brain reads it directly.
No MEDIAN DAYS columns exist in the actual delistings data.

---

## Architecture

- **Tier-2 Postgres via dlt** (same pattern as `redfin_lee_market`)
- **Two separate tables**: `data_lake.redfin_cancellations_swfl` and
  `data_lake.redfin_delistings_swfl`
- **One consuming brain** `market-sentiment-swfl` — thematic unity: buyer stress
  (cancellations) + seller confidence (delistings) = market sentiment pair. Satisfies
  the brain-first gate for both tables in the same PR.
- **Key_metrics grain: Lee + Collier county rows** (larger sample; ZIP counts are
  2-3 deals/month — too volatile for a stable rate). ZIP rows go in `detail_tables`.
- **Two CSV downloads per pipeline** (separate county + ZIP files); filter each
  by region name; union into one table.

---

## Pipeline 1 — `redfin_cancellations_swfl`

### Files
```
ingest/pipelines/redfin_cancellations_swfl/
  __init__.py
  constants.py   ← S3 URLs + SWFL filter sets
  resources.py   ← CSV reader + per-file filter + dlt resource
  pipeline.py    ← --dry-run CLI entry point
```

### Pattern
Reference: `ingest/pipelines/redfin_lee/resources.py`. Key differences:

**Format is plain CSV, not gzip TSV.** Use `csv.reader` (or `io.StringIO` +
`csv.DictReader`) on the response text, NOT `zlib.decompressobj` + `split("\t")`.

**Two downloads per run:**
```python
COUNTY_URL = BASE + "contract_cancellations/monthly/all_counties.csv"
ZIP_URL    = BASE + "contract_cancellations/monthly/all_zips.csv"
```

**Per-file filter (simpler than one-big-stream multi-set gate):**
- County file: keep rows where `REGION NAME` in `{"Lee County, FL", "Collier County, FL"}`
  Fast line-level gate: `if "Lee County" not in line and "Collier" not in line: continue`
- ZIP file: keep rows where `REGION NAME` in SWFL_ZIP_SET (loaded from
  `fixtures/swfl-zip-county.json` at module import)

**`zip_code` derived column:** populated from `REGION NAME` when the row came from
the ZIP file (REGION TYPE = "Zip Code"), else `None`. This satisfies ZIP-gate G3.

### Target schema — `data_lake.redfin_cancellations_swfl`
```
region_name           text   NOT NULL  PK  ← REGION NAME verbatim
period_end            date   NOT NULL  PK
region_type           text   NOT NULL  PK  ← REGION TYPE verbatim
period_begin          date   nullable
frequency             text   nullable      ← "Monthly"
zip_code              text   nullable      ← ZIP-gate G3 column
cancellations         bigint nullable      ← HOME PURCHASE CANCELLATIONS
cancellations_mom_pct double nullable
cancellations_yoy_pct double nullable
cancellation_rate_pct double nullable      ← PERCENT OF PENDING SALES (%) — already a %
cancellation_rate_mom_ppts double nullable
cancellation_rate_yoy_ppts double nullable
last_updated          text   nullable
```
Composite PK `(region_name, period_end, region_type)` — idempotent merge.

---

## Pipeline 2 — `redfin_delistings_swfl`

### Files
Same structure as Pipeline 1, `redfin_delistings_swfl/`.

URLs:
```python
COUNTY_URL = BASE + "delistings_relistings/monthly/all_counties.csv"
ZIP_URL    = BASE + "delistings_relistings/monthly/all_zips.csv"
```

Same per-file filter logic. Same `zip_code` derived column.

### Target schema — `data_lake.redfin_delistings_swfl`
```
region_name              text   NOT NULL  PK
period_end               date   NOT NULL  PK
region_type              text   NOT NULL  PK
period_begin             date   nullable
frequency                text   nullable
zip_code                 text   nullable      ← ZIP-gate G3 column
delistings               bigint nullable      ← TOTAL DELISTINGS
delistings_mom_pct       double nullable
delistings_yoy_pct       double nullable
relistings               bigint nullable      ← TOTAL RELISTINGS
relistings_mom_pct       double nullable
relistings_yoy_pct       double nullable
delisting_share_pct      double nullable      ← SHARE OF LISTINGS DELISTED (%)
delisting_share_mom_ppts double nullable
delisting_share_yoy_ppts double nullable
relisting_share_pct      double nullable      ← SHARE OF LISTINGS RELISTED (%)
relisting_share_mom_ppts double nullable
relisting_share_yoy_ppts double nullable
last_updated             text   nullable
```
Data starts 2016 (per methodology). Same PK + merge strategy.

---

## Brain — `market-sentiment-swfl`

File: `refinery/packs/market-sentiment-swfl.mts`

### Key metrics (slugs — register all in `brain-vocabulary.json` same commit)
```
swfl_cancellation_rate_pct   ← Lee+Collier simple average, latest monthly % of pending
swfl_delisting_share_pct     ← Lee+Collier simple average % of active listings
swfl_relisting_share_pct     ← Lee+Collier simple average % of active listings relisted
```

`swfl_cancellation_rate_vs_nat_pp` (national comparison) is **DEFERRED** — the pipeline
only downloads `all_counties.csv` filtered to Lee+Collier; `country.csv` is not fetched.
Wire in a follow-on PR once a national-baseline pattern exists. Open check:
`redfin_national_cancellation_baseline`.

**Lee+Collier combination method: simple average.**
The schema stores one rate row per county per period. Without the pending-sales denominator
in the table (only the rate + MOM/YOY ppts are stored), a weighted denominator-average is
impossible. Use `(lee_rate + collier_rate) / 2`. Easy to audit, document it in the pack.

### Direction logic
```
# Operator-calibrated constant — adjust after first 6 months of data
NEUTRAL_THRESHOLD_PP = 0.5  # pp YoY swing treated as noise

bearish: cancellation_rate_yoy_ppts > +NEUTRAL_THRESHOLD_PP
         AND delisting_share_yoy_ppts > +NEUTRAL_THRESHOLD_PP
bullish: cancellation_rate_yoy_ppts < -NEUTRAL_THRESHOLD_PP
         AND delisting_share_yoy_ppts < -NEUTRAL_THRESHOLD_PP
mixed:   signals diverge
neutral: both within ±NEUTRAL_THRESHOLD_PP
```

### detail_tables
One row per SWFL ZIP with `cancellation_rate_pct` and `delisting_share_pct` —
enables ZIP-level drill in `swfl_fetch`.

### `skipSynthesisAgent: true` — fully deterministic math, no LLM needed

---

## GHA Workflows

```
.github/workflows/redfin-cancellations-monthly.yml
  cron: "0 12 17 * *"   ← 17th, 12:00 UTC (Redfin releases ~15th; 2-day buffer)
  --dry-run dispatch input

.github/workflows/redfin-delistings-monthly.yml
  cron: "0 13 17 * *"   ← same day +1hr stagger
  --dry-run dispatch input
```

Copy `redfin-lee-monthly.yml`; swap pipeline module path and cron.

---

## Cadence Registry additions (`ingest/cadence_registry.yaml`)

```yaml
  - name: redfin_cancellations_swfl
    lane: tier-2
    cadence_days: 31
    dlt_schema_name: redfin_cancellations_swfl
    expected_rows_min: 0   # placeholder — re-baseline to 90% of first live run
    count_table: data_lake.redfin_cancellations_swfl

  - name: redfin_delistings_swfl
    lane: tier-2
    cadence_days: 31
    dlt_schema_name: redfin_delistings_swfl
    expected_rows_min: 0   # placeholder — re-baseline after first live run
    count_table: data_lake.redfin_delistings_swfl
```

---

## Grant SQL (new — BLOCKER if skipped)

After dlt creates each table, PostgREST won't see it without a grant.

```sql
-- docs/sql/redfin_cancellations_grant.sql
GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.redfin_cancellations_swfl TO service_role;
NOTIFY pgrst, 'reload schema';

-- docs/sql/redfin_delistings_grant.sql
GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.redfin_delistings_swfl TO service_role;
NOTIFY pgrst, 'reload schema';
```

Run both immediately after the first live ingest (after dlt creates the tables).
Pattern: `python -c "import psycopg; ..."` with creds from `.dlt/secrets.toml`.

---

## Vocab registration (`refinery/vocab/brain-vocabulary.json`)

All 3 slugs + their SKOS concept entries in the same commit as the pack.
Gate 2: `bun refinery/tools/check-vocab-coverage.mts --all` → 0 orphans before push.

---

## Files changed (full list)

| File | Action |
|---|---|
| `ingest/pipelines/redfin_cancellations_swfl/` (4 files) | New |
| `ingest/pipelines/redfin_delistings_swfl/` (4 files) | New |
| `.github/workflows/redfin-cancellations-monthly.yml` | New |
| `.github/workflows/redfin-delistings-monthly.yml` | New |
| `ingest/cadence_registry.yaml` | +2 entries |
| `docs/sql/redfin_cancellations_grant.sql` | New |
| `docs/sql/redfin_delistings_grant.sql` | New |
| `refinery/packs/market-sentiment-swfl.mts` | New |
| `refinery/packs/market-sentiment-swfl.test.mts` | New — fixture-driven unit tests (direction enum + key_metrics values) |
| `refinery/packs/catalog.mts` | +1 entry after `permits-commercial-swfl` (id/domain/scope/ttl_seconds) |
| `refinery/packs/index.mts` | +1 entry (scaffold:imports + scaffold:entries hand-edit) |
| `refinery/vocab/brain-vocabulary.json` | +3 slugs + concepts |

---

## Verification checklist (before push)

1. `--dry-run` on both pipelines → prints SWFL rows, column names match schema above
2. First live ingest → tables exist in `data_lake.*`
3. Run grant SQL files for both tables
4. Re-baseline `expected_rows_min` to 90% of row count in `cadence_registry.yaml`
5. `bun refinery/tools/check-vocab-coverage.mts --all` → 0 orphans
6. Local pack build: `npm run refinery -- --target-only market-sentiment-swfl`
   → emits `direction` + all 3 `key_metrics` entries
7. `tsc --noEmit` → exit 0
8. Open check `market_sentiment_swfl_live` for first cron verification
9. Open check `redfin_national_cancellation_baseline` (deferred slug)

---

## Parallel breakdown (implementation order)

### Wave 1 — all independent, Sonnet, run simultaneously

| Agent | Task | Files |
|---|---|---|
| **Sonnet A** | Pipeline 1: `redfin_cancellations_swfl/` (4 files) | `__init__.py`, `constants.py`, `resources.py`, `pipeline.py` |
| **Sonnet B** | Pipeline 2: `redfin_delistings_swfl/` (4 files) | Same structure, delistings schema |
| **Sonnet C** | Scaffolding | Both GHA workflows + both grant SQL files + cadence registry entries |

### Wave 2 — after Wave 1 complete, Opus, single agent

**Opus A** writes in one commit:
- `refinery/packs/market-sentiment-swfl.mts` — simple average of Lee+Collier,
  direction logic, 3 key_metrics, detail_tables
- `refinery/packs/market-sentiment-swfl.test.mts` — fixture-driven unit tests
  (two county rows with known YoY ppts → assert direction enum + all 3 metric values)
- `refinery/packs/catalog.mts` — +1 entry after `permits-commercial-swfl`:
  `{ id: "market-sentiment-swfl", domain: "real-estate", scope: "swfl", ttl_seconds: 86400 * 35 }`
- `refinery/packs/index.mts` — scaffold:imports + scaffold:entries hand-edit
- `refinery/vocab/brain-vocabulary.json` — +3 slugs + SKOS concepts

### Wave 3 — sequential verification
`--dry-run` both pipelines → live ingest → grant SQL → re-baseline cadence →
vocab check → pack build → tsc → push with SESSION_LOG + open both checks.
