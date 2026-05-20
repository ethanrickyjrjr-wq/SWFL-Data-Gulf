# Franchise Consultant Briefing: macro-florida

_Outcomes-first read framed for franchise opportunity assessment, with survival and sector-credit signals foregrounded._

## TL;DR

**NEUTRAL** (magnitude 1.00)

## ⚠️ Caveats (read first)

- Florida macro indicators in this build are synthetic fixture data (FRED-shaped) — unset REFINERY_SOURCE or set it to `live` for the live FRED API.

## Conclusion

As of the latest reported periods, the Florida state-level labor market reads: Florida unemployment at 3.4% (stable), labor force participation at 60.9%. Read against the national backdrop (macro-us, confidence 1.00): SOFR at 4.3% (falling). Regional brains (macro-swfl, future macro-tampa/macro-jax) use this brain as the state baseline for gap math.

## Key Findings


- **Florida unemployment rate** — 3.4 → _(source: [FRED Florida Unemployment Rate (series_id FLUR) — latest observation 3.4 percent for period 2026-04, stable vs prior 6…](https://api.stlouisfed.org/fred/series/observations?series_id=FLUR&units=lin&file_type=json&sort_order=desc&limit=24), T1, fetched 2026-05-20T07:33:19Z)_
- **Florida labor force participation** — 60.9 ↑ _(source: [FRED Florida Labor Force Participation Rate (series_id FLLFPR) — latest observation 60.9 percent for period 2026-04, ri…](https://api.stlouisfed.org/fred/series/observations?series_id=LBSSA12&units=lin&file_type=json&sort_order=desc&limit=24), T1, fetched 2026-05-20T07:33:19Z)_
- **Florida retail establishments** — 52000 → _(source: [Florida retail establishments: 52,000 FL establishments in 2022 (Census CBP, NAICS 44-45, all FL counties aggregated).](https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12), T1, fetched 2026-05-20T07:33:19Z)_
- **Florida food service & accommodation establishments** — 40000 → _(source: [Florida food service & accommodation establishments: 40,000 FL establishments in 2022 (Census CBP, NAICS 72, all FL cou…](https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12), T1, fetched 2026-05-20T07:33:19Z)_
- **Florida construction establishments** — 38000 → _(source: [Florida construction establishments: 38,000 FL establishments in 2022 (Census CBP, NAICS 23, all FL counties aggregated…](https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12), T1, fetched 2026-05-20T07:33:19Z)_
- **Florida healthcare establishments** — 35000 → _(source: [Florida healthcare establishments: 35,000 FL establishments in 2022 (Census CBP, NAICS 62, all FL counties aggregated).](https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12), T1, fetched 2026-05-20T07:33:19Z)_
- **Florida professional services establishments** — 48000 → _(source: [Florida professional services establishments: 48,000 FL establishments in 2022 (Census CBP, NAICS 54, all FL counties a…](https://api.census.gov/data/2022/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12), T1, fetched 2026-05-20T07:33:19Z)_

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 1

---

_Brain: `macro-florida` v11 · refined 2026-05-20T07:33:34Z · relevance half-life 720h · decay `weeks`_
