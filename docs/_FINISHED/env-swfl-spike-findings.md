# env-swfl Spike Findings — FEMA NFHL ArcGIS Endpoint

<!-- Tier 1, Lane: Env-Brain, Item #1.0 -->
<!-- Status: VERIFIED 2026-05-16 -->
<!-- Next: Item #1.1 — scaffold refinery/packs/env-swfl.mts -->

## Purpose

Verify before scaffolding that the FEMA NFHL ArcGIS REST endpoint actually returns the fields the `env-swfl` brain needs, identify the production query shape, and decide the cache invalidation strategy. This note is the contract the pack code is written against.

---

## Endpoint Verification

| Item               | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| Service root       | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer` |
| Auth               | None — public, no token required                                      |
| Spatial reference  | WKID 4269 (NAD83) — accepts WGS84 (4326) via `inSR=4326` param        |
| Max records / call | 2000                                                                  |
| Supports           | Map, Query, Data; pagination + statistics both `true`                 |
| Capabilities flag  | `supportsPagination: true`, `supportsStatistics: true`                |

## Layer Mapping

`S_FLD_HAZ_AR` is FEMA's internal database schema name and does **not** match any user-facing layer name in the REST service. Resolved by inspection:

| Layer ID | User-Facing Name        | Geometry | Use                                                 |
| -------- | ----------------------- | -------- | --------------------------------------------------- |
| **28**   | **Flood Hazard Zones**  | Polygon  | **Primary — carries FLD_ZONE, SFHA_TF, STATIC_BFE** |
| 27       | Flood Hazard Boundaries | Polyline | Skip (boundary lines only, no zone attributes)      |
| 1        | LOMRs                   | Polygon  | Cache-invalidation source (EFF_DATE, DFIRM_ID)      |
| 3        | FIRM Panels             | Polygon  | Optional — panel-level metadata                     |
| 16       | Base Flood Elevations   | Point    | Optional — point-level BFEs where needed            |

## Layer 28 Fields (Verified Present)

All fields the env-swfl OUTPUT will surface confirmed on Layer 28:

| Field        | Type              | Meaning                                                                                             |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------- |
| `FLD_ZONE`   | String            | Zone designation: `AE`, `VE`, `X`, `A`, `AH`, `AO`, `D`, `OPEN WATER`                               |
| `ZONE_SUBTY` | String            | Sub-type, e.g. `"0.2 PCT ANNUAL CHANCE FLOOD HAZARD"`, `"AREA OF MINIMAL FLOOD HAZARD"`, often null |
| `SFHA_TF`    | String (`T`/`F`)  | Special Flood Hazard Area flag — directly drives flood-veto                                         |
| `STATIC_BFE` | Double            | Base Flood Elevation; **null sentinel is `-9999.0`** (handle in connector)                          |
| `DFIRM_ID`   | String (length 6) | Digital FIRM panel ID — FIPS-prefixed, e.g. `12021C` = Florida (12) Lee County (021) panel C        |
| `SOURCE_CIT` | String            | Receipt path — e.g. `12021C_STUDY6` ties the polygon back to a specific FEMA study                  |

## Production Query Shape (Verified Working)

Single bbox-scoped statistics query returns the SFHA distribution in one call — no pagination needed for the aggregate metrics. This is the query the env-swfl source connector will issue.

**Lee County (FIPS 12021) bbox = `-82.3, 26.3, -81.6, 26.9`:**

```
GET /MapServer/28/query?
  where=1=1
  &geometry=-82.3,26.3,-81.6,26.9
  &geometryType=esriGeometryEnvelope
  &inSR=4326
  &spatialRel=esriSpatialRelIntersects
  &groupByFieldsForStatistics=FLD_ZONE
  &outStatistics=[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"polygon_count"}]
  &f=json
```

**Response (verified 2026-05-16):**

| FLD_ZONE   | polygon_count | SFHA? | Interpretation                                      |
| ---------- | ------------- | ----- | --------------------------------------------------- |
| X          | 13,280        | No    | Minimal flood hazard (outside SFHA)                 |
| AE         | 2,410         | Yes   | 1% annual chance flood, BFE determined              |
| AH         | 612           | Yes   | Shallow ponding flood                               |
| A          | 396           | Yes   | 1% annual chance flood, no BFE                      |
| **VE**     | **271**       | Yes   | **Coastal high-hazard — contains Fort Myers Beach** |
| AO         | 11            | Yes   | Shallow sheet flow                                  |
| D          | 8             | —     | Possible flood, undetermined                        |
| OPEN WATER | 2             | —     | Water body                                          |

- **Total polygons in bbox**: 16,990
- **SFHA polygons (A + AE + AH + AO + VE)**: 3,700 = **21.78% SFHA coverage by polygon count**
- **VE zones present**: 271 → flood-veto for any FMB-coordinate scenario is sourceable

**Caveat**: Polygon count ≠ area coverage. Production `sfha_pct` must aggregate by `Shape__Area` (replace `count` with `sum` in `outStatistics`, `onStatisticField` = `Shape__Area`). The polygon-count cut is directionally correct for the spike but not what ships.

## Cache TTL Strategy

FEMA flood maps revise on a years-not-days cadence, but individual panels can receive LOMRs (Letter of Map Revisions) at any time. Cache decision:

1. **Initial pull**: For each SWFL county bbox, run the statistics query (county FIPS list: Lee 12021, Collier 12021, Charlotte 12015, Glades 12043, Hendry 12051, Sarasota 12115). Store `{county_fips → {zone_distribution, dfirm_ids[], pulled_at}}`.
2. **Refinery run (subsequent)**: Query Layer 1 (LOMRs) with `where=DFIRM_ID IN ({cached panels}) AND EFF_DATE > {last_pulled_at}`. If response has features → cache invalid for those panels, re-pull. If empty → cache holds.
3. **Freshness token**: tied to the LOMR-check timestamp, not the original pull. This is what makes the brain "fresh today" even when the underlying flood map is years old — the LOMR check is the active verification.

LOMRs layer fields confirmed: `EFF_DATE` (date), `DFIRM_ID` (string), `LOMR_ID`, `STATUS`, `SOURCE_CIT`.

**Trust tier**: T1 (FEMA federal authoritative). No external rating service needed.

## Proposed env-swfl OUTPUT Schema

Minimum-viable OUTPUT for the first render — derives directly from the verified queries above:

```json
{
  "brain_id": "env-swfl",
  "domain": "environmental",
  "direction": "<computed from sfha_pct thresholds>",
  "key_metrics": [
    {
      "concept": "env_sfha_coverage_pct",
      "value": 0.2178,
      "scope": "county_fips=12021",
      "source": {
        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?...",
        "fetched_at": "<ISO>",
        "tier": 1,
        "citation": "FEMA NFHL Flood Hazard Zones, S_FLD_HAZ_AR, DFIRM_ID 12021C"
      }
    },
    {
      "concept": "env_ve_zone_present",
      "value": true,
      "scope": "county_fips=12021",
      "source": { "...": "..." }
    },
    {
      "concept": "env_flood_zone_distribution",
      "value": {
        "X": 13280,
        "AE": 2410,
        "AH": 612,
        "A": 396,
        "VE": 271,
        "AO": 11,
        "D": 8
      },
      "scope": "county_fips=12021",
      "source": { "...": "..." }
    },
    {
      "concept": "env_last_lomr_check_date",
      "value": "<ISO>",
      "scope": "county_fips=12021",
      "source": {
        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/1/query?...",
        "fetched_at": "<ISO>",
        "tier": 1
      }
    }
  ],
  "caveats": [],
  "trust_tier": 1,
  "input_brains": []
}
```

**Edge typing on downstream consumers** (per Session 8 P5):

- `cre-swfl` declares `env-swfl` with `edge_type: "veto"` for VE-zone scenarios.
- `master` declares `env-swfl` with `edge_type: "veto"` for any barrier-island coordinate.

## SKOS Vocabulary Additions Required

To be added to `refinery/vocab/brain-vocabulary.json` **before first render** (or Stage 2.5 will orphan-abort):

| Concept ID                    | prefLabel                              | Category           | Domain        |
| ----------------------------- | -------------------------------------- | ------------------ | ------------- |
| `env_sfha_coverage_pct`       | Special Flood Hazard Area Coverage (%) | environmental-risk | environmental |
| `env_ve_zone_present`         | Coastal High-Hazard (VE) Zone Present  | environmental-risk | environmental |
| `env_flood_zone_distribution` | FEMA NFHL Flood Zone Distribution      | environmental-risk | environmental |
| `env_last_lomr_check_date`    | Last LOMR Verification Date            | freshness          | environmental |

## Open Items (Deferred to Pack Build)

1. **Area-weighted SFHA**: Switch `count` → `sum(Shape__Area)` once basic pack is rendering. Polygon-count is the spike's shortcut.
2. **County FIPS bbox table**: Hardcode the 6 SWFL county bboxes in the connector, or pull from a TIGER/Line endpoint. Bboxes are stable (county boundaries don't move) — hardcoding is fine.
3. **Coordinate-level lookup**: For property-specific queries (e.g. "this FMB address"), we'd need point-in-polygon against returned geometries — that's a different query shape (no `groupByFieldsForStatistics`, `returnGeometry=true`, point geometry input). Out of scope for env-swfl v1; reserved for a later coordinate-level helper.
4. **NOAA HURDAT2 / storm-surge inundation**: Separate source connector, separate spike. Not needed for first render — VE-zone presence + SFHA % is enough to fire flood-veto for the §6.4 acceptance test.

## Verification Receipts

The two queries that proved this out, copy-pasteable:

```
# Sample query (5 records, attributes only):
https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-82.3%2C26.3%2C-81.6%2C26.9&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE%2CZONE_SUBTY%2CSFHA_TF%2CSTATIC_BFE%2CDFIRM_ID%2CSOURCE_CIT&returnGeometry=false&resultRecordCount=5&f=json

# Production stats query (zone distribution, single call):
https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-82.3%2C26.3%2C-81.6%2C26.9&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%5D&f=json

# LOMR cache-invalidation query (template — substitute DFIRM_IDs + last-pulled date):
https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/1/query?where=DFIRM_ID%20IN%20(%2712021C%27)%20AND%20EFF_DATE%20%3E%20DATE%20%272026-05-16%27&outFields=DFIRM_ID%2CEFF_DATE%2CLOMR_ID%2CSTATUS&returnGeometry=false&f=json
```

All three verified working against the live endpoint on 2026-05-16.
