# CPA / Audit Briefing: macro-us

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BULLISH** (magnitude 1.00)

## ⚠️ Caveats (read first)

- Macro indicators in this build are synthetic fixture data (FRED-shaped) — unset REFINERY_SOURCE or set it to `live` for the live FRED API.

## Conclusion

As of the latest reported periods, the national macro backdrop reads: SOFR at 4.3% and falling, headline CPI at 2.6% YoY and falling. This brain is the root of the macro chain (macro-us → macro-florida → macro-swfl). State and regional brains read the funding-cost and inflation backdrop through here.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | SOFR (Secured Overnight Financing Rate) | 4.31 | falling | FRED Secured Overnight Financing Rate (series_id SOFR) — latest observation 4.3… | https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&units=lin&file_type=json&sort_order=desc&limit=24 |
| T1 | US CPI YoY | 2.6 | falling | FRED US CPI (All Items) Year-over-Year (series_id CPIAUCSL_YOY) — latest observ… | https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&units=pc1&file_type=json&sort_order=desc&limit=24 |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `macro-us` v8 · refined 2026-05-20T07:33:19Z · relevance half-life 720h · decay `weeks`_
