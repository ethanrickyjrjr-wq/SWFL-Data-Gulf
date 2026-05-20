# Operator Briefing: macro-us

_Flat technical read of the brain output in DAG order, suitable for engine operators and producers._

## TL;DR

**BULLISH** (magnitude 1.00)

## ⚠️ Caveats (read first)

- Macro indicators in this build are synthetic fixture data (FRED-shaped) — unset REFINERY_SOURCE or set it to `live` for the live FRED API.

## Conclusion

As of the latest reported periods, the national macro backdrop reads: SOFR at 4.3% and falling, headline CPI at 2.6% YoY and falling. This brain is the root of the macro chain (macro-us → macro-florida → macro-swfl). State and regional brains read the funding-cost and inflation backdrop through here.

## Key Findings

- **SOFR (Secured Overnight Financing Rate)** — 4.31 ↓ _(source: [FRED Secured Overnight Financing Rate (series_id SOFR) — latest observation 4.31 percent_annualized for period 2026-05-…](https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&units=lin&file_type=json&sort_order=desc&limit=24), T1, fetched 2026-05-20T07:33:17Z)_
- **US CPI YoY** — 2.6 ↓ _(source: [FRED US CPI (All Items) Year-over-Year (series_id CPIAUCSL_YOY) — latest observation 2.6 percent for period 2026-04, fa…](https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&units=pc1&file_type=json&sort_order=desc&limit=24), T1, fetched 2026-05-20T07:33:17Z)_

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `macro-us` v8 · refined 2026-05-20T07:33:19Z · relevance half-life 720h · decay `weeks`_
