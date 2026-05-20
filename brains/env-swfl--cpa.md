# CPA / Audit Briefing: env-swfl

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BEARISH** (magnitude 0.80)

## ⚠️ Caveats (read first)

- Area aggregates are in square decimal degrees (WGS84 / EPSG:4326), not projected meters. Ratios across zones within the same county are accurate; absolute areas are NOT physical units and are never propagated.
- Bbox-intersect queries include polygons that touch the county envelope, so edge polygons may belong to neighboring counties. The DFIRM_ID on each polygon is the authoritative county affiliation; v1 surfaces the bbox-aggregate without re-attributing edge polygons.
- Fixture mode: only Lee County is populated. SWFL-wide metrics reflect Lee alone — switch to REFINERY_SOURCE=live for the full 6-county footprint.
- FEMA NFHL is queried live on every refinery run (v1). LOMR-based cache invalidation (Layer 1, EFF_DATE) is documented in docs/env-swfl-spike-findings.md and reserved for v2 once a hot-path issue is observed.
- NFIP claims are policyholder-only. Uninsured properties and parcels outside NFIP participation are NOT in the archive — true SWFL flood loss is materially larger than what these numbers show.
- Storm-year list (Charley 2004, Wilma 2005, Irma 2017, Ian 2022, Helene 2024, Milton 2024) was last reviewed 2026-05-17. Requires update in refinery/sources/fema-nfip-source.mts when a new named storm hits SWFL.
- Per-ZIP AAL denominator uses 2020 ACS population × 0.3 NSI-coverage proxy for insured-property count (v1). Replace with the live OpenFEMA NFIP Policies insured count in v2 before treating per-ZIP magnitudes as policy-grade — current numbers compress toward each other when actual NFIP penetration in a ZIP diverges from the 30% proxy.
- USGS surface stage metric includes both Approved (A) and Provisional (P) qualifiers — magnitudes may revise as USGS approves provisional readings over the 6-12 month review window. For approval-only reads, brain-level consumers should filter on the qualifiers column directly.
- Three additional hydrology metrics (Lee groundwater median, SWFL annual rainfall, Lee groundwater high-water-day count) were stripped from this brain on 2026-05-19 after their backing Postgres table (data_lake.usgs_daily) was lost in the Cold Lane migration. Re-source via SFWMD DBHYDRO before depending on those signals.

## Conclusion

Barrier-island SWFL ZIPs carry order-of-magnitude higher flood loss: 33931 (Lee County) runs $850/yr per insured property (100th percentile across SWFL ZIPs with claims in window). CRE translation: +50-70 bps cap-rate adjustment for barrier-island flood exposure; imputed flood insurance runs 5.3% of NOI at an 8% cap. Geography is the entire signal — flood risk for a Lee County address is a property of the ZIP, not the metro.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | 33931 (Lee County) per-insured-property NFIP AAL — 10-year window ending 2025 | 849.52 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33931 barrier-island classification (1.0 barrier / 0.5 coastal-mainland / 0.0 inland) | 1 | stable | Static SWFL barrier-island classification table (refinery/lib/swfl-geo.mts): ZI… | internal://refinery/lib/swfl-geo.mts |
| T1 | 33931 flood cap-rate adjustment (+50-70 bps) | 60 | stable | swfl-geo capRateBpsFor(1) midpoint; range +50-70 bps. Calibrated against ULI/La… | internal://refinery/lib/swfl-geo.mts |
| T1 | 33931 imputed flood insurance as fraction of NOI (8% cap on median building value) | 0.053094999999999996 (5.31%) | stable | Computed: (AAL × 2) ÷ (median_building_property_value × 0.08). AAL = 849.52 USD… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33931 percentile rank by per-insured-property AAL across SWFL ZIPs with ≥1 claim in window | 100 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33950 (Charlotte County) per-insured-property NFIP AAL — 10-year window ending 2025 | 7.23 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33950 barrier-island classification (1.0 barrier / 0.5 coastal-mainland / 0.0 inland) | 0 | stable | Static SWFL barrier-island classification table (refinery/lib/swfl-geo.mts): ZI… | internal://refinery/lib/swfl-geo.mts |
| T1 | 33950 flood cap-rate adjustment (no flood cap-rate adjustment) | 0 | stable | swfl-geo capRateBpsFor(0) midpoint; range no flood cap-rate adjustment. Calibra… | internal://refinery/lib/swfl-geo.mts |
| T1 | 33950 imputed flood insurance as fraction of NOI (8% cap on median building value) | 0.0006075630252100841 (0.06%) | stable | Computed: (AAL × 2) ÷ (median_building_property_value × 0.08). AAL = 7.23 USD/y… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33950 percentile rank by per-insured-property AAL across SWFL ZIPs with ≥1 claim in window | 58.33 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33957 (Lee County) per-insured-property NFIP AAL — 10-year window ending 2025 | 13.69 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33957 barrier-island classification (1.0 barrier / 0.5 coastal-mainland / 0.0 inland) | 1 | stable | Static SWFL barrier-island classification table (refinery/lib/swfl-geo.mts): ZI… | internal://refinery/lib/swfl-geo.mts |
| T1 | 33957 flood cap-rate adjustment (+50-70 bps) | 60 | stable | swfl-geo capRateBpsFor(1) midpoint; range +50-70 bps. Calibrated against ULI/La… | internal://refinery/lib/swfl-geo.mts |
| T1 | 33957 imputed flood insurance as fraction of NOI (8% cap on median building value) | 0.0004753472222222222 (0.05%) | stable | Computed: (AAL × 2) ÷ (median_building_property_value × 0.08). AAL = 13.69 USD/… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 33957 percentile rank by per-insured-property AAL across SWFL ZIPs with ≥1 claim in window | 91.67 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34102 (Collier County) per-insured-property NFIP AAL — 10-year window ending 2025 | 7.5 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34102 barrier-island classification (1.0 barrier / 0.5 coastal-mainland / 0.0 inland) | 0.5 | stable | Static SWFL barrier-island classification table (refinery/lib/swfl-geo.mts): ZI… | internal://refinery/lib/swfl-geo.mts |
| T1 | 34102 flood cap-rate adjustment (+20-35 bps) | 27.5 | stable | swfl-geo capRateBpsFor(0.5) midpoint; range +20-35 bps. Calibrated against ULI/… | internal://refinery/lib/swfl-geo.mts |
| T1 | 34102 imputed flood insurance as fraction of NOI (8% cap on median building value) | 0.0004166666666666667 (0.04%) | stable | Computed: (AAL × 2) ÷ (median_building_property_value × 0.08). AAL = 7.5 USD/yr… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34102 percentile rank by per-insured-property AAL across SWFL ZIPs with ≥1 claim in window | 66.67 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34103 (Collier County) per-insured-property NFIP AAL — 10-year window ending 2025 | 8.2 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34103 barrier-island classification (1.0 barrier / 0.5 coastal-mainland / 0.0 inland) | 0 | stable | Static SWFL barrier-island classification table (refinery/lib/swfl-geo.mts): ZI… | internal://refinery/lib/swfl-geo.mts |
| T1 | 34103 flood cap-rate adjustment (no flood cap-rate adjustment) | 0 | stable | swfl-geo capRateBpsFor(0) midpoint; range no flood cap-rate adjustment. Calibra… | internal://refinery/lib/swfl-geo.mts |
| T1 | 34103 imputed flood insurance as fraction of NOI (8% cap on median building value) | 0.00040196078431372544 (0.04%) | stable | Computed: (AAL × 2) ÷ (median_building_property_value × 0.08). AAL = 8.2 USD/yr… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34103 percentile rank by per-insured-property AAL across SWFL ZIPs with ≥1 claim in window | 75 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34145 (Collier County) per-insured-property NFIP AAL — 10-year window ending 2025 | 8.31 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34145 barrier-island classification (1.0 barrier / 0.5 coastal-mainland / 0.0 inland) | 1 | stable | Static SWFL barrier-island classification table (refinery/lib/swfl-geo.mts): ZI… | internal://refinery/lib/swfl-geo.mts |
| T1 | 34145 flood cap-rate adjustment (+50-70 bps) | 60 | stable | swfl-geo capRateBpsFor(1) midpoint; range +50-70 bps. Calibrated against ULI/La… | internal://refinery/lib/swfl-geo.mts |
| T1 | 34145 imputed flood insurance as fraction of NOI (8% cap on median building value) | 0.00038119266055045876 (0.04%) | stable | Computed: (AAL × 2) ÷ (median_building_property_value × 0.08). AAL = 8.31 USD/y… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | 34145 percentile rank by per-insured-property AAL across SWFL ZIPs with ≥1 claim in window | 83.33 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | Caloosahatchee surface stage at gage local zero — latest reading (2026-05-15) | 6.78 | stable | USGS Water Services (fixture; refinery/__fixtures__/usgs-water.sample.json), pa… | https://waterservices.usgs.gov/nwis/dv/?stateCd=FL&parameterCd=00065&siteStatus=active&format=json |
| T1 | Lee County area-weighted coastal high-hazard (V/VE) coverage | 0.0515 (5.15%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), groupBy FLD_ZONE with s… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-82.3%2C26.3%2C-81.6%2C26.9&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22Shape__Area%22%2C%22outStatisticFieldName%22%3A%22area_total%22%7D%5D&f=json |
| T1 | Lee County area-weighted SFHA coverage (Fort Myers Beach context) | 0.3795 (37.95%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), groupBy FLD_ZONE with s… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-82.3%2C26.3%2C-81.6%2C26.9&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22Shape__Area%22%2C%22outStatisticFieldName%22%3A%22area_total%22%7D%5D&f=json |
| T1 | SWFL area-weighted coastal high-hazard (V/VE) zone coverage | 0.0515 (5.15%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |
| T1 | SWFL area-weighted Special Flood Hazard Area coverage | 0.3795 (37.95%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |
| T1 | SWFL count of distinct coastal high-hazard (V/VE) polygons | 271 | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |
| T1 | SWFL cumulative NFIP paid claims (B+C+ICO) across named storm years (Charley 2004, Wilma 2005, Irma 2017, Ian 2022, Helene 2024, Milton 2024) | 21381000 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | SWFL latest-year NFIP claims ÷ non-storm baseline (numerator = 2025 SWFL total) | 1.544 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | SWFL named-storm-year count since 2000 | 5 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |
| T1 | SWFL non-storm-year annual NFIP paid claims (median across all non-storm years in the archive) | 59900 | stable | OpenFEMA FimaNfipClaims (fixture; refinery/__fixtures__/fema-nfip-swfl.sample.j… | https://www.fema.gov/api/open/v2/FimaNfipClaims |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `env-swfl` v17 · refined 2026-05-20T07:33:11Z · relevance half-life 720h · decay `weeks`_
