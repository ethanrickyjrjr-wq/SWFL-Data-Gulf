# USGS Water Services — dlt Pipeline Technical Spec

**Note on Brains Supabase context:** All source fields and staging tables target the Brains Supabase instance (`data_lake.*` schema). Tier 2 per [Data Tier Policy](../CLAUDE.md#data-tier-policy-locked-2026-05-17) — `env-swfl` brain consumes this data in the same sprint.

**Architectural Rule — Ingest Broad, Filter Local:**
The `dlt` pipeline MUST ingest broadly for Florida (`stateCd=FL`, State FIPS 12). SWFL-specific filtering (`county_cd IN ('12071','12021')`, HUCs `'03090205'` / `'03090204'`) happens downstream in the brain layer, never in the ingest.

**Source replaces:** The dead SFWMD DBHYDRO pipeline (legacy API decommissioned, OAuth wall on new REST). USGS Water Services is auth-free, statewide, and stable. See [`API_BLUEPRINTS_DBHYDRO.md`](./API_BLUEPRINTS_DBHYDRO.md) for the abandoned source and [§9 Carry-Over](#9-carry-over-from-dbhydro) for what to reuse.

---

## 1. Access Method & Auth

- **Base URL (current legacy, recommended for Q3 2026 build):**
  `https://waterservices.usgs.gov/nwis/`
- **Auth:** None. Anonymous HTTPS GET.
- **Rate posture:** No published hard cap. USGS asks consumers to stay polite — keep steady-state under ~10 req/sec, no parallel >5. The pipeline is small (one daily-value pull per parameterCd + occasional site catalog refresh), so this is not a concern.
- **Trailing slash gotcha:** Use `/nwis/dv/?...` (slash before `?`). Omitting it triggers a 301 redirect chain that doubles request count against the rate budget.
- **Lifecycle warning:** USGS has announced the legacy `waterservices.usgs.gov` will sunset in **early 2027** in favor of the OGC API at `api.waterdata.usgs.gov/ogcapi/v0/` (currently alpha). Build URL construction behind ONE module (`ingest/pipelines/usgs/urls.py`) so the cutover is a single-file change. Do not scatter URL strings across resources.

## 2. Parameter Codes (the datum lives in the code)

| parameterCd | Meaning                                 | Unit | Notes                                                              |
| ----------- | --------------------------------------- | ---- | ------------------------------------------------------------------ |
| `72019`     | Depth to water level below land surface | ft   | Primary GW signal. **Datum-agnostic** — use this for trend math.   |
| `62610`     | Groundwater level, **above NAVD88**     | ft   | Use when comparing wells against each other or against elevations. |
| `62611`     | Groundwater level, above NGVD29         | ft   | Legacy datum. Keep for FL well coverage; flag in `datum` column.   |
| `00065`     | Gage height                             | ft   | Surface water. Referenced to **gage local zero**, NOT a datum.     |
| `00045`     | Precipitation                           | in   | Daily rainfall.                                                    |
| `00062`     | Elevation, reservoir water surface      | ft   | Surface water reservoirs.                                          |
| `00042`     | Altitude above MSL                      | ft   | Site metadata only — pulled from site catalog, not dv.             |

**Critical:** The vertical datum is encoded IN the parameterCd, not as a side metadata field. `62610` ≠ `62611` even though both are "groundwater elevation." Storing them without preserving the parameter code corrupts elevation signals by 1+ ft in South Florida.

## 3. Site Discovery (No Auth)

Three site-catalog pulls cover the brain's needs. All return JSON with `siteStatus=active` + `hasDataTypeCd=dv`:

```
GET https://waterservices.usgs.gov/nwis/site/?stateCd=FL&siteStatus=active&hasDataTypeCd=dv&siteType=GW&format=rdb
GET https://waterservices.usgs.gov/nwis/site/?stateCd=FL&siteStatus=active&hasDataTypeCd=dv&siteType=ST,LK,SP&format=rdb
GET https://waterservices.usgs.gov/nwis/site/?stateCd=FL&siteStatus=active&hasDataTypeCd=dv&siteType=AT&format=rdb
```

- `siteType=GW` → groundwater wells
- `siteType=ST,LK,SP` → streams, lakes, springs (surface water)
- `siteType=AT` → atmospheric (rain gauges)
- Format `rdb` is USGS's tab-delimited dialect — simpler to parse than the JSON site response, and the docs are canonical.

**Caveat:** `hasDataTypeCd=dv` only tells you the site has SOME daily-value data — it does NOT tell you which parameters. Use the post-ingest rollup in §7 to populate `parameter_cds` accurately, not the catalog.

## 4. Querying Daily Values

One URL per `parameterCd`, statewide, full backfill, mean stat:

```
GET https://waterservices.usgs.gov/nwis/dv/?stateCd=FL&parameterCd=72019&statCd=00003&siteStatus=active&startDT=2000-01-01&format=json
GET https://waterservices.usgs.gov/nwis/dv/?stateCd=FL&parameterCd=62610&statCd=00003&siteStatus=active&startDT=2000-01-01&format=json
GET https://waterservices.usgs.gov/nwis/dv/?stateCd=FL&parameterCd=00065&statCd=00003&siteStatus=active&startDT=2000-01-01&format=json
GET https://waterservices.usgs.gov/nwis/dv/?stateCd=FL&parameterCd=00045&statCd=00006&siteStatus=active&startDT=2000-01-01&format=json
```

- `statCd=00003` (mean) for stage/elevation/depth. `statCd=00006` (sum) for precipitation.
- `00001` max, `00002` min, `00008` median also available. Mean is sufficient for normals; max/min can be derived from mean + lookback if needed.

**Backfill: `startDT=2000-01-01`.** 26 years supports 20–25y rolling normals. NOAA's published baseline is 1991–2020. Pre-2000 backfill available later per-site if a brain demands it.

**Refresh cadence:**

- **Nightly** — `modifiedSince=P7D` — catches 95% of provisional→approved transitions.
- **Monthly (1st of month)** — `modifiedSince=P90D` — catches USGS's long-tail approvals that publish outside the 7-day window. Approval lag is typically 6–12 months.

## 5. Data Handling Rules

- **Sentinel:** `noDataValue` in the JSON response (typically `-999999.0`) MUST be converted to `NULL` before storage.
- **Qualifiers:** Keep ALL qualifier codes — `A` (Approved), `P` (Provisional), `e` (estimated), `M` (missing), `<` / `>` (detection limits). Brains filter `'A' = ANY(qualifiers)` when approved-only matters.
- **Datum column is mandatory.** Every value row carries `datum` (text: `'NAVD88'`, `'NGVD29'`, `'LOCAL'`, `'NONE'`). Derived from the parameterCd, not from site metadata.

## 6. JSON Response Shape (representative)

```json
{
  "value": {
    "timeSeries": [
      {
        "sourceInfo": {
          "siteName": "...",
          "siteCode": [{"value": "02292900", "agencyCode": "USGS"}],
          "geoLocation": {"geogLocation": {"latitude": ..., "longitude": ..., "srs": "EPSG:4326"}}
        },
        "variable": {
          "variableCode": [{"value": "00065"}],
          "unit": {"unitCode": "ft"},
          "noDataValue": -999999.0
        },
        "values": [
          {
            "value": [
              {"value": "1.23", "qualifiers": ["A"], "dateTime": "2026-05-17T00:00:00.000"},
              ...
            ]
          }
        ]
      },
      ...
    ]
  }
}
```

## 7. Tier 2 Schema (`data_lake.usgs_daily` + `data_lake.usgs_sites`)

```sql
CREATE TABLE IF NOT EXISTS data_lake.usgs_daily (
  site_no              text         NOT NULL,
  parameter_cd         text         NOT NULL,
  stat_cd              text         NOT NULL,
  obs_date             date         NOT NULL,
  value                double precision,
  unit                 text         NOT NULL,
  datum                text         NOT NULL,
  qualifiers           text[],
  source_url           text         NOT NULL,
  ingested_at          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (site_no, parameter_cd, stat_cd, obs_date)
);

CREATE INDEX IF NOT EXISTS usgs_daily_param_date ON data_lake.usgs_daily (parameter_cd, obs_date DESC);
CREATE INDEX IF NOT EXISTS usgs_daily_site       ON data_lake.usgs_daily (site_no);

CREATE TABLE IF NOT EXISTS data_lake.usgs_sites (
  site_no              text         PRIMARY KEY,
  agency_cd            text         NOT NULL,
  station_nm           text,
  site_tp_cd           text,
  state_cd             text,
  county_cd            text,
  huc_cd               text,
  latitude             double precision,
  longitude            double precision,
  coord_datum_cd       text,
  alt_va               double precision,
  alt_datum_cd         text,
  parameter_cds        text[],
  site_status          text,
  source_url           text         NOT NULL,
  refreshed_at         timestamptz  NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.usgs_daily, data_lake.usgs_sites TO service_role;
```

**Write disposition:** `merge` on both tables. Daily values merge on the composite PK; sites merge on `site_no`.

**`parameter_cds` population (post-ingest rollup, not catalog-derived):**
Run this as the final step of the dlt pipeline after all `(parameterCd, statCd)` pulls have merged. Zero extra HTTP calls; naturally accurate to what we actually hold:

```sql
UPDATE data_lake.usgs_sites s
SET parameter_cds = sub.cds, refreshed_at = now()
FROM (
  SELECT site_no, array_agg(DISTINCT parameter_cd ORDER BY parameter_cd) AS cds
  FROM data_lake.usgs_daily
  GROUP BY site_no
) sub
WHERE s.site_no = sub.site_no;
```

## 8. Downstream SWFL Filters (Brain Layer, Not Ingest)

- **Counties:** `county_cd IN ('12071', '12021')` — Lee, Collier
- **HUCs:** `huc_cd LIKE '03090205%'` (Caloosahatchee) or `huc_cd LIKE '03090204%'` (Big Cypress)
- **Bounding box (fallback for missing huc/county tags):** roughly `lat BETWEEN 26.0 AND 27.0 AND lon BETWEEN -82.5 AND -81.0`

## 9. Carry-Over from DBHYDRO

Things to reuse from `API_BLUEPRINTS_DBHYDRO.md` (now-dead source) so the brain layer doesn't drift:

| DBHYDRO concept                                     | USGS equivalent                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-99999.0` sentinel → NULL                          | `-999999.0` (six 9s) sentinel → NULL                                                                                                                       |
| `datum` column convention                           | Identical. `NAVD88` / `NGVD29` / `LOCAL` / `NONE`.                                                                                                         |
| Quality codes A/P/R/E                               | A / P / e qualifiers (USGS uses lowercase `e` for estimated)                                                                                               |
| County filter `LEE`/`COLL`                          | `county_cd IN ('12071','12021')` (FIPS, not name strings)                                                                                                  |
| Basin filter `C43`/`C111`                           | HUC8 `03090205` / `03090204`                                                                                                                               |
| Structure flow `S77`/`S79`/`S80`                    | **No equivalent.** USGS discharge `00060` at nearby gaged sites is partial proxy. See §10.                                                                 |
| Semantic Ledger: `env_gw_level_lee_median_ft`       | Same key. Source flips from `dbhydro_daily` to `usgs_daily WHERE parameter_cd='72019'`.                                                                    |
| Semantic Ledger: `env_sw_stage_caloosahatchee_ft`   | Same key. Source: `usgs_daily WHERE parameter_cd='00065' AND huc_cd LIKE '03090205%'`.                                                                     |
| Semantic Ledger: `env_rainfall_swfl_annual_in`      | Same key. Source: `usgs_daily WHERE parameter_cd='00045' AND county_cd IN ('12071','12021')`. Aggregate `SUM(value) GROUP BY EXTRACT(YEAR FROM obs_date)`. |
| Semantic Ledger: `env_gw_highwater_exceedance_days` | Same key. `COUNT(*) WHERE parameter_cd='62610' AND value > 2.0` (NAVD88 high-water threshold preserved from DBHYDRO doc).                                  |

## 10. Known Gap (Carried, Not Solved)

**No USGS equivalent to SFWMD's engineered structure release rates (S77/S79/S80).** USGS `00060` discharge at gaged sites near those structures is a partial proxy but not the same signal. If `env-swfl`'s flood-veto logic depends on engineered releases (DBHYDRO had S79 stage at 10.0 ft NAVD88 hardcoded as a flood threshold), this must be surfaced in the brain's `caveats` field, not silently substituted. **The pipeline's job is faithful ingest; the brain's job is to admit what the data doesn't say.**

**Defer-list:**

- `00060` (discharge) — out of scope per YAGNI. Trivial to add later as a fifth dv-URL row.
- SFWMD telemetry re-ingest via OAuth REST — defer until USGS coverage is verified inadequate.

## 11. Implementation Pointers (for the Opus build)

- **Package location:** `ingest/pipelines/usgs/` (mirrors `ingest/pipelines/faf5/`).
- **TS connector:** `refinery/sources/usgs-source.mts` (Supabase-backed, `getSupabase()` pattern).
- **Consuming brain:** `refinery/packs/env-swfl.mts` — USGS becomes the 3rd source after FEMA NFIP. Bumps the brain's input count and feeds the existing `env_gw_*`, `env_sw_*`, `env_rainfall_*` ledger keys.
- **Atomic PR:** ingest + grant SQL + TS connector + brain wiring in ONE commit per Data Tier Policy Rule 2 (brain-first ingest gate).
