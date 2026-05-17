# CPA / Audit Briefing: env-swfl

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BEARISH** (magnitude 0.80)

## ⚠️ Caveats (read first)

- Area aggregates are in square decimal degrees (WGS84 / EPSG:4326), not projected meters. Ratios across zones within the same county are accurate; absolute areas are NOT physical units and are never propagated.
- Bbox-intersect queries include polygons that touch the county envelope, so edge polygons may belong to neighboring counties. The DFIRM_ID on each polygon is the authoritative county affiliation; v1 surfaces the bbox-aggregate without re-attributing edge polygons.
- FEMA NFHL is queried live on every refinery run (v1). LOMR-based cache invalidation (Layer 1, EFF_DATE) is documented in docs/env-swfl-spike-findings.md and reserved for v2 once a hot-path issue is observed.

## Conclusion

Southwest Florida flood-hazard exposure across 6 counties: 43.24% of mapped area sits in a FEMA Special Flood Hazard Area, with 3.11% in coastal V/VE high-hazard zones. Lee County specifically — the Fort Myers / Fort Myers Beach footprint — carries 38.51% SFHA and 5.75% coastal high-hazard exposure (272 VE polygons). Collier County — Naples / Marco Island — carries 60.66% SFHA and 3.45% coastal high-hazard exposure (207 VE polygons). Downstream consumers should treat barrier-island and coastal-V/VE coordinates as flood-veto territory until paired with a property-level lookup.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | Collier County area-weighted coastal high-hazard (V/VE) coverage | 0.0345 (3.45%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), groupBy FLD_ZONE with s… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-81.91%2C25.79%2C-80.85%2C26.5&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22Shape__Area%22%2C%22outStatisticFieldName%22%3A%22area_total%22%7D%5D&f=json |
| T1 | Collier County area-weighted SFHA coverage (Naples / Marco Island context) | 0.6066 (60.66%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), groupBy FLD_ZONE with s… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-81.91%2C25.79%2C-80.85%2C26.5&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22Shape__Area%22%2C%22outStatisticFieldName%22%3A%22area_total%22%7D%5D&f=json |
| T1 | Lee County area-weighted coastal high-hazard (V/VE) coverage | 0.0575 (5.75%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), groupBy FLD_ZONE with s… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-82.32%2C26.32%2C-81.57%2C26.91&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22Shape__Area%22%2C%22outStatisticFieldName%22%3A%22area_total%22%7D%5D&f=json |
| T1 | Lee County area-weighted SFHA coverage (Fort Myers Beach context) | 0.3851 (38.51%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), groupBy FLD_ZONE with s… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry=-82.32%2C26.32%2C-81.57%2C26.91&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&groupByFieldsForStatistics=FLD_ZONE&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22polygon_count%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22Shape__Area%22%2C%22outStatisticFieldName%22%3A%22area_total%22%7D%5D&f=json |
| T1 | SWFL area-weighted coastal high-hazard (V/VE) zone coverage | 0.0311 (3.11%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |
| T1 | SWFL area-weighted Special Flood Hazard Area coverage | 0.4324 (43.24%) | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |
| T1 | SWFL count of distinct coastal high-hazard (V/VE) polygons | 764 | stable | FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate… | https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28 |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `env-swfl` v2 · refined 2026-05-17T02:30:05Z · relevance half-life 720h · decay `weeks`_
