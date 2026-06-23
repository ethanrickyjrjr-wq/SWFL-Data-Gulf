# Handoff: Aggregate at Source — Eliminate Raw Row Fetching

**Operator decree (repeated):** Push COUNT/SUM/AVG/median to the database. Never haul raw rows
into TypeScript to aggregate. `selectAllPaged` is legacy and a liability.

**Date:** 2026-06-23  
**Status:** Ready to execute — no open blockers.

---

## The Rule

Every source that fetches N rows and then does `rows.reduce(...)` / `rows.groupBy(...)` / `rows.map(...).filter(...)` to produce aggregates should instead:

1. Issue a SQL query that returns the aggregated result directly
2. Drop the TypeScript aggregation code
3. Remove or reduce the `selectAllPaged` call

PostgREST supports `GROUP BY` via Supabase's `.rpc()` (call a SQL function) or via a view.
DuckDB (`makeDuckDBSource`) is also available for complex cross-table analytics.

The valid reason to keep `selectAllPaged` is when the source genuinely needs per-record data
(e.g. geometry per corridor segment, permit catalog rows, time-series for per-ZIP delta calc).
See the NOT candidates below.

---

## Candidates — High Priority (do these)

### 1. `refinery/sources/macro-florida-cbp-source.mts`
**Table:** `data_lake.census_cbp_fl`  
**Current:** Fetches ~43,600 rows (all FL counties, latest year, minRows=30,000), then `aggregateByNaics()` does `GROUP BY naics_code, SUM(establishment_count, employment, annual_payroll)` in TypeScript.  
**Target SQL:**
```sql
SELECT naics_code, naics_label,
       SUM(establishment_count) AS establishment_count,
       SUM(employment)          AS employment,
       SUM(annual_payroll)      AS annual_payroll
FROM data_lake.census_cbp_fl
WHERE year = (SELECT MAX(year) FROM data_lake.census_cbp_fl)
GROUP BY naics_code, naics_label
ORDER BY naics_code;
```
**How:** Create a Supabase view `data_lake.census_cbp_fl_agg_by_naics` with the above query,
then fetch it with a single `.select('*')` (no pagination needed — result is small, ~20 rows).  
**Drop:** `aggregateByNaics()` function + `selectAllPaged` call + `minRows: 30_000`.  
**Risk:** Low. Pure additive — new view doesn't touch the raw table.  
**Test:** `bun test refinery/packs/macro-florida.test.mts` (or equivalent); verify row counts match old aggregated totals.

---

### 2. `refinery/sources/fdot-source.mts`
**Table:** `data_lake.fdot_aadt_fl`  
**Current:** Fetches ~4,600 rows (Lee+Collier+Charlotte, 2021–2025), then:
- `aggregateCountyYear()` — length-weighted mean AADT + median truck factor per county-year
- `aggregateCohortYoY()` — self-join by (roadway, desc_frm, desc_to) to compute cohort-matched YoY change  

**Target SQL (county-year aggregate):**
```sql
SELECT county_fips, year_,
       SUM(aadt * length_mi) / NULLIF(SUM(length_mi), 0) AS aadt_wtd,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tfctr)  AS tfctr_median
FROM data_lake.fdot_aadt_fl
WHERE county_fips IN ('12071','12021','12015')   -- Lee, Collier, Charlotte
GROUP BY county_fips, year_
ORDER BY county_fips, year_;
```
**How:** View `data_lake.fdot_aadt_county_year`. The cohort YoY join is a self-join — harder
to do in a simple view; use a second view or keep that one TS step.  
**Drop:** `aggregateCountyYear()` + most of the `selectAllPaged` payload.  
**Risk:** Medium. `tfctr` divide-by-100 fix must be applied IN the view (or confirmed already applied at ingest).  
**Test:** Verify county-year AADT values match old output within 0.1%.

---

### 3. `refinery/sources/usgs-water-source.mts`
**Tables:** `data_lake.usgs_sites` + `data_lake.usgs_daily`  
**Current:** Fetches all FL sites (~900 rows), then all daily readings for SWFL site_nos, then
`swStageCaloosahatcheeLatest()` finds max obs_date and takes the median across Caloosahatchee gages.  
**Target SQL:**
```sql
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) AS stage_median_ft,
       MAX(obs_date) AS as_of
FROM data_lake.usgs_daily
WHERE parameter_cd = '00065'
  AND site_no IN (
    SELECT site_no FROM data_lake.usgs_sites
    WHERE station_nm ILIKE '%caloosahatchee%'
      AND state_cd = '12'
  )
  AND obs_date = (
    SELECT MAX(obs_date) FROM data_lake.usgs_daily
    WHERE parameter_cd = '00065'
      AND site_no IN (
        SELECT site_no FROM data_lake.usgs_sites
        WHERE station_nm ILIKE '%caloosahatchee%' AND state_cd = '12'
      )
  );
```
**How:** View `data_lake.usgs_caloosahatchee_stage_latest`. Single row back.  
**Drop:** `selectAllPaged` on usgs_sites + usgs_daily + `swStageCaloosahatcheeLatest()`.  
**Risk:** Medium. Station name filter must match what's actually in the table — verify `station_nm` values first.  
**Test:** Confirm the median value matches what the old code returned on the same data.

---

### 4. `refinery/sources/fema-nfip-source.mts` (partial)
**Table:** `data_lake.fema_nfip_claims`  
**Current:** Fetches ~86,600 rows (minRows=50,000). Aggregation:
- `aggregateCountyYears()` → GROUP BY county + year, SUM claims + paidLoss
- `aggregateSwflRollup()` → median of non-storm-year annual totals
- `aggregateZipRollupTop6()` → percentile rank across ZIPs, top 6
- `aggregateStormTotals()` → per-named-storm splits (Helene/Milton date boundary logic)

**Target:** Move county-year GROUP BY to SQL; keep percentile rank and storm-split in TS.
```sql
SELECT county_fips, EXTRACT(YEAR FROM date_of_loss)::int AS year_,
       COUNT(*)                        AS claim_count,
       SUM(amount_paid_on_total_claim) AS paid_loss_usd
FROM data_lake.fema_nfip_claims
WHERE county_fips IN ('12071','12021','12015','12043','12051','12115')
GROUP BY county_fips, year_
ORDER BY county_fips, year_;
```
**How:** View `data_lake.fema_nfip_county_year`. ~200 rows back instead of 86,600.  
**Drop:** `aggregateCountyYears()` + the monster `selectAllPaged`. Keep storm-split + zip-percentile in TS but feed them from the smaller pre-aggregated view.  
**Risk:** Higher — the storm-date boundary logic for 2024 Helene/Milton reads individual `date_of_loss` values. Keep those rows flowing for the storm-specific path only (filtered fetch, not a full table scan).  
**Test:** County-year totals must match within rounding; storm totals must match exactly.

---

## NOT Candidates (leave alone)

| Source | Why |
|--------|-----|
| `zhvi-source.mts` | Per-ZIP-month time series needed for YoY/MoM delta in downstream pack |
| `zori-source.mts` | Same — granular ZIP-month pairs needed |
| `permits-source.mts` | Pass-through permit catalog; rows are the output |
| `collier-permits-source.mts` | Same; dropped-row counting is stateful |
| `fl-dor-sales-tax-source.mts` | Granular (county, kind_code, period) rows are consumed by pack |
| `fdot-freight-source.mts` | Per-segment 1:1 transform; no aggregation to push |

---

## How to execute (order matters)

1. **For each candidate:** read the source file in full before touching anything.
2. **Write the view migration** — `supabase/migrations/YYYYMMDD_<name>_agg_view.sql`. Make it `CREATE OR REPLACE VIEW`. Idempotent.
3. **Run the migration** directly (creds in `.dlt/secrets.toml`, psycopg3).
4. **Verify the view** returns the expected row count and spot-check key values against the old raw-row path.
5. **Rewrite the source** to fetch from the view with a simple `.select('*')` + no pagination.
6. **Delete the old aggregation function(s)** — if nothing else imports them.
7. **Run `bun test`** — verify 3655/0 (or current baseline) still holds.
8. **One PR per source** — don't batch all 4 into one diff; easier to revert if one breaks.

## Constraints

- PostgREST can query views in `data_lake` schema IF `GRANT SELECT ON <view> TO service_role` is in the migration + `NOTIFY pgrst, 'reload schema'` runs after. Include both in each migration.
- `PERCENTILE_CONT` requires PostgreSQL 9.4+ — Supabase has this.
- The `tfctr` divide-by-100 fix for FDOT: confirm it's applied at ingest (check `data_lake.fdot_aadt_fl` column values). If not, apply the ÷100 in the view rather than the TS source.
- Never drop `selectAllPaged` from `refinery/lib/paginate.mts` — other callers still need it.
- Gate 2 (vocab/alias) + Gate 5 (pack catalog) still apply on any pack touching this. Run `bun test` before push.
