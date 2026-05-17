# Ingest Pipelines Design — FEMA, LeePA, FDOT, Census CBP

**Date:** 2026-05-17  
**Status:** Approved — proceed to implementation  
**Scope:** Add four new dlt pipelines to `ingest/` alongside the existing FAF5 trucking pipeline. Zero changes to `ingest/pipelines/faf5/`.

---

## Context

The existing `ingest/pipelines/faf5/` pipeline ingests FAF5 trucking flows into `data_lake.faf_flows` (Brains Supabase). It uses `dlt[postgres]`, `requests`, `pytest`, and `.dlt/secrets.toml` for credentials. This design adds four new pipeline domains that follow the same pattern.

FAF5 is currently in-flight (second run after `buffer_max_items=5000` fix at `dc4a2f1`). **Do not modify FAF5 files.**

---

## Architecture Decisions

| Decision             | Choice                        | Reason                                                           |
| -------------------- | ----------------------------- | ---------------------------------------------------------------- |
| Geospatial library   | None (no geopandas/shapely)   | GDAL on Windows is painful; GeoJSON stored as TEXT + hashlib key |
| Pipeline naming      | Separate per domain           | Mirrors FAF5; isolates schema and state                          |
| Write disposition    | `merge` for all new pipelines | Idempotent re-runs; FAF5 keeps `replace`                         |
| LeePA ingestion path | GIS REST API only             | Bulk ZIP path deferred (known truncation issues; additive later) |
| Census CBP           | Included (years 2017–2022)    | Reinstated after prior deferral                                  |
| HTTP client          | `requests` (sync)             | Consistent with FAF5; dlt resources are synchronous generators   |

---

## Directory Structure

```
ingest/
  lib/                            ← NEW shared utilities
    __init__.py
    arcgis_paginator.py           ← sync ArcGIS REST paginator
    geo_utils.py                  ← Lee County bbox/FIPS + geometry_hash()
  pipelines/
    faf5/                         ← UNCHANGED
    fema/                         ← NEW
      __init__.py
      pipeline.py
      resources.py                ← fema_flood_zones, fema_lomr, fema_loma, fema_bfe
      constants.py
    leepa/                        ← NEW
      __init__.py
      pipeline.py
      resources.py                ← leepa_parcels, leepa_sales, leepa_assessments
      constants.py
    fdot/                         ← NEW
      __init__.py
      pipeline.py
      resources.py                ← fdot_aadt
      constants.py
    census_cbp/                   ← NEW
      __init__.py
      pipeline.py
      resources.py                ← census_cbp (2017–2022 loop)
      constants.py
  tests/
    pipelines/
      faf5/                       ← UNCHANGED
      fema/                       ← NEW
      leepa/                      ← NEW
      fdot/                       ← NEW
      census_cbp/                 ← NEW
  .env.example                    ← NEW
```

---

## Shared Library

### `lib/arcgis_paginator.py`

```python
def paginate_arcgis(base_url, where="1=1", out_fields="*", bbox=None, page_size=2000):
    """Sync generator. Yields GeoJSON Feature dicts. Retries 3x on 5xx."""
```

- Adds `geometry`, `geometryType=esriGeometryEnvelope`, `inSR=4326`, `outSR=4326`, `f=geojson`
- Increments `resultOffset` until `features` list is empty
- Raises on non-recoverable HTTP errors

### `lib/geo_utils.py`

```python
LEE_COUNTY_BBOX = (-82.4, 26.3, -81.5, 26.8)   # xmin, ymin, xmax, ymax
LEE_COUNTY_FIPS_STATE  = "12"
LEE_COUNTY_FIPS_COUNTY = "071"
LEE_COUNTY_FIPS_FULL   = "12071"

def geometry_hash(geojson_geometry: dict) -> str:
    """md5 of stable JSON serialization — used as natural key component."""
```

---

## Pipeline Contracts

| Pipeline   | `pipeline_name` | `dataset_name` | disposition |
| ---------- | --------------- | -------------- | ----------- |
| fema       | `fema`          | `data_lake`    | `merge`     |
| leepa      | `leepa`         | `data_lake`    | `merge`     |
| fdot       | `fdot`          | `data_lake`    | `merge`     |
| census_cbp | `census_cbp`    | `data_lake`    | `merge`     |

### FEMA natural keys

| Table              | Primary key hint(s)                   |
| ------------------ | ------------------------------------- |
| `fema_flood_zones` | `DFIRM_ID` + `FLD_ZONE` + `geom_hash` |
| `fema_lomr`        | `CASE_NO` (fallback: `geom_hash`)     |
| `fema_loma`        | `CASE_NO` (fallback: `geom_hash`)     |
| `fema_bfe`         | `ELEV_ID` (fallback: `geom_hash`)     |

### LeePA natural keys

| Table               | Primary key hint(s)                  |
| ------------------- | ------------------------------------ |
| `leepa_parcels`     | `STRAP`                              |
| `leepa_sales`       | `STRAP` + `SALE_DATE` + `SALE_PRICE` |
| `leepa_assessments` | `STRAP` + `TAX_YEAR`                 |

### FDOT natural keys

| Table       | Primary key hint(s) |
| ----------- | ------------------- |
| `fdot_aadt` | `COSITE` + `year`   |

### Census CBP natural keys

| Table        | Primary key hint(s)                   |
| ------------ | ------------------------------------- |
| `census_cbp` | `naics_code` + `year` + `fips_county` |

---

## FEMA Endpoints

| Resource              | Layer | URL                                                                            |
| --------------------- | ----- | ------------------------------------------------------------------------------ |
| Flood Hazard Zones    | 28    | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query` |
| LOMRs                 | 1     | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/1/query`  |
| LOMAs                 | 34    | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/34/query` |
| Base Flood Elevations | 16    | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/16/query` |

All queried with `LEE_COUNTY_BBOX`. Record counts per zone type logged to stdout post-ingest.

**OpenFEMA Claims** (`fema_nfip_claims`, `fema_disaster_declarations`):

- REST endpoint: `https://www.fema.gov/api/open/v1/FimaNfipClaims`
- OData pagination: `$top=1000`, `$skip` incremented
- No API key required
- Natural key: `dateOfLoss` + `reportedZipCode` + `latitude` + `longitude`

---

## LeePA Endpoints

- GIS REST: `https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/0/query`
- Paginated via `arcgis_paginator`
- Key fields: `STRAP`, assessed value, just value, sale price/date, land use code, zoning, acreage + geometry

---

## FDOT Endpoints

- Primary: `https://gis.fdot.gov/arcgis/rest/services/FTO/fto_PROD/MapServer/7/query`
- `where=COUNTY='LEE'`
- If historical year columns available (AADT per year per station), ingest all years

---

## Census CBP Endpoint

```
https://api.census.gov/data/{year}/cbp
?get=NAICS2022,NAICS2022_LABEL,ESTAB,EMP,PAYANN
&for=county:071&in=state:12
&key={CENSUS_API_KEY}
```

- Loop years 2017–2022
- Response is array-of-arrays; first row = headers
- All rows get `year` + `fips_state` + `fips_county` fields added before yield

---

## Wiring Changes

### `package.json` — append to `scripts`:

```json
"ingest:faf5":  "cd ingest && python -m pipelines.faf5.pipeline",
"ingest:fema":  "cd ingest && python -m pipelines.fema.pipeline",
"ingest:leepa": "cd ingest && python -m pipelines.leepa.pipeline",
"ingest:fdot":  "cd ingest && python -m pipelines.fdot.pipeline",
"ingest:cbp":   "cd ingest && python -m pipelines.census_cbp.pipeline",
"ingest:all":   "npm run ingest:fema && npm run ingest:leepa && npm run ingest:fdot && npm run ingest:cbp"
```

Note: `ingest:all` excludes FAF5 — separate domain, run independently.

### `.dlt/config.toml` — append (FAF5 section untouched):

```toml
[pipeline.fema]
pipeline_name = "fema"
dataset_name  = "data_lake"

[pipeline.leepa]
pipeline_name = "leepa"
dataset_name  = "data_lake"

[pipeline.fdot]
pipeline_name = "fdot"
dataset_name  = "data_lake"

[pipeline.census_cbp]
pipeline_name = "census_cbp"
dataset_name  = "data_lake"
```

### `ingest/.env.example` — new file:

```
DESTINATION__POSTGRES__CREDENTIALS=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
CENSUS_API_KEY=xxx
```

### `ingest/requirements.txt` — no additions needed (geopandas excluded).

---

## Testing Strategy

Same pattern as FAF5 tests:

- Mock HTTP calls (patch `requests.get` or the paginator)
- Test field coercion, filtering, key generation
- Test `geometry_hash()` is deterministic
- Test Census year loop produces correct `year` field on each row
- No integration tests (live endpoints not hit in CI)

---

## Co-existence Guarantee

- `ingest/pipelines/faf5/` — zero file changes
- `.dlt/config.toml` — append-only (FAF5 section preserved)
- `requirements.txt` — no additions
- `package.json` — append-only to `scripts`
- All new tables land in `data_lake` schema alongside existing FAF5 tables

---

## Post-Ingestion Validation Queries

```sql
-- FEMA gap check (was missing lat 26.2-26.7)
SELECT FLD_ZONE, COUNT(*) FROM fema_flood_zones
WHERE geom_hash IS NOT NULL
GROUP BY FLD_ZONE;

-- FDOT multi-year check
SELECT COSITE, COUNT(DISTINCT year) FROM fdot_aadt GROUP BY COSITE LIMIT 10;

-- Census trend check
SELECT naics_code, COUNT(DISTINCT year) FROM census_cbp
WHERE fips_county = '071' GROUP BY naics_code LIMIT 10;
```
