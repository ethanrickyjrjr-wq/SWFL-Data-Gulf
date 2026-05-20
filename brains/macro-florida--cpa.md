# CPA / Audit Briefing: macro-florida

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**NEUTRAL** (magnitude 1.00)

## ⚠️ Caveats (read first)

- Florida macro indicators in this build are synthetic fixture data (FRED-shaped) — unset REFINERY_SOURCE or set it to `live` for the live FRED API.

## Conclusion

As of the latest reported periods, the Florida state-level labor market reads: Florida unemployment at 3.4% (stable), labor force participation at 60.9%. Read against the national backdrop (macro-us, confidence 1.00): SOFR at 4.3% (falling). Regional brains (macro-swfl, future macro-tampa/macro-jax) use this brain as the state baseline for gap math.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | Florida construction establishments | 38000 | stable | Florida construction establishments: 38,000 FL establishments in 2022 (Census C… | https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12 |
| T1 | Florida food service & accommodation establishments | 40000 | stable | Florida food service & accommodation establishments: 40,000 FL establishments i… | https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12 |
| T1 | Florida healthcare establishments | 35000 | stable | Florida healthcare establishments: 35,000 FL establishments in 2022 (Census CBP… | https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12 |
| T1 | Florida labor force participation | 60.9 | rising | FRED Florida Labor Force Participation Rate (series_id FLLFPR) — latest observa… | https://api.stlouisfed.org/fred/series/observations?series_id=LBSSA12&units=lin&file_type=json&sort_order=desc&limit=24 |
| T1 | Florida professional services establishments | 48000 | stable | Florida professional services establishments: 48,000 FL establishments in 2022… | https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12 |
| T1 | Florida retail establishments | 52000 | stable | Florida retail establishments: 52,000 FL establishments in 2022 (Census CBP, NA… | https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12 |
| T1 | Florida unemployment rate | 3.4 | stable | FRED Florida Unemployment Rate (series_id FLUR) — latest observation 3.4 percen… | https://api.stlouisfed.org/fred/series/observations?series_id=FLUR&units=lin&file_type=json&sort_order=desc&limit=24 |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 1

---

_Brain: `macro-florida` v11 · refined 2026-05-20T07:33:34Z · relevance half-life 720h · decay `weeks`_
