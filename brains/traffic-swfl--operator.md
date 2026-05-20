# Operator Briefing: traffic-swfl

_Flat technical read of the brain output in DAG order, suitable for engine operators and producers._

## TL;DR

**BULLISH** (magnitude 0.42)

## ⚠️ Caveats (read first)

- FDOT AADT segments in this build are synthetic fixture data — unset REFINERY_SOURCE or set it to `live` to query data_lake.fdot_aadt_fl.
- Length-weighting uses shape_length (auto-generated geometry length in the layer projection). The shape_leng attribute is not consulted — it may be stale after route realignments.
- Cohort-matched YoY identifies segments by (roadway, desc_frm, desc_to). If FDOT changes any of those three fields between years for the same physical segment, that segment drops from the cohort silently — small cohort sizes (< 100) should be read with skepticism.
- Truck factor metric reports a length-weighted MEAN of per-county MEDIANS rather than a true cross-county median (true median would require raw segment access, defeating the source aggregation). Treat the value as a county-mix-aware estimate, not an exact statistic.
- Year scope is 2021-2025. Bump LATEST_FDOT_YEAR in refinery/sources/fdot-source.mts when FDOT publishes the next vintage.
- Post-Ian recovery index DELIBERATELY uses a wider 3-county set (Lee + Collier + Charlotte) than the brain's standard 2-county scope — Charlotte sat in Ian's eye-wall path and must be included for the storm signal to be honest. The other 4 metrics stay 2-county.
- Direction thresholds: bullish ≥ +3% YoY; bearish ≤ -3% YoY; neutral otherwise.

## Conclusion

SWFL (Lee + Collier) length-weighted AADT in 2025 averaged 62803.5 vehicles/day across 4 FDOT segments. Cohort-matched YoY 2024→2025: 4.2% over 4 segments — bullish read on corridor demand. 5-year CAGR 2021→2025: 2.6% per year. Coastal post-Ian recovery (Lee + Collier + Charlotte, 2025/2022): 117.6 — above pre-storm baseline.

## Key Findings

- **SWFL length-weighted average AADT, year 2025 (vehicles/day)** — 62804 → _(source: [FDOT AADT segments via data_lake.fdot_aadt_fl (dlt-ingested from FDOT FTO_PROD/MapServer/7) — counties Lee + Collier (C…](fixture://refinery/__fixtures__/traffic-swfl.sample.json), T2, fetched 2026-05-18T20:50:57Z)_
- **SWFL AADT YoY change 2024→2025, cohort-matched (%)** — 4.2 ↑ _(source: [FDOT AADT segments via data_lake.fdot_aadt_fl (dlt-ingested from FDOT FTO_PROD/MapServer/7) — counties Lee + Collier (C…](fixture://refinery/__fixtures__/traffic-swfl.sample.json), T2, fetched 2026-05-18T20:50:57Z)_
- **SWFL AADT 5-year CAGR (2021 → 2025, %)** — 2.6 ↑ _(source: [FDOT AADT segments via data_lake.fdot_aadt_fl (dlt-ingested from FDOT FTO_PROD/MapServer/7) — counties Lee + Collier (C…](fixture://refinery/__fixtures__/traffic-swfl.sample.json), T2, fetched 2026-05-18T20:50:57Z)_
- **SWFL median truck factor (TFCTR × 100), year 2025** — 7.2 → _(source: [FDOT AADT segments via data_lake.fdot_aadt_fl (dlt-ingested from FDOT FTO_PROD/MapServer/7) — counties Lee + Collier (C…](fixture://refinery/__fixtures__/traffic-swfl.sample.json), T2, fetched 2026-05-18T20:50:57Z)_
- **Coastal SWFL (Lee + Collier + Charlotte) post-Ian recovery index, 2025 ÷ 2022 × 100** — 117.6 ↑ _(source: [FDOT AADT segments via data_lake.fdot_aadt_fl (dlt-ingested from FDOT FTO_PROD/MapServer/7) — counties Lee + Collier (C…](fixture://refinery/__fixtures__/traffic-swfl.sample.json), T2, fetched 2026-05-18T20:50:57Z)_

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **0.80** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T2
- Upstream brains that passed the relevance floor: 0

---

_Brain: `traffic-swfl` v7 · refined 2026-05-18T20:50:57Z · relevance half-life 720h · decay `weeks`_
