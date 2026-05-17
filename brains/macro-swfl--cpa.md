# CPA / Audit Briefing: macro-swfl

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BEARISH** (magnitude 0.67)

## ⚠️ Caveats (read first)

- FRED can revise recent observations within ~30 days of first publication — treat the most recent reading as directional, not final.

## Conclusion

As of the latest reported periods, the SWFL macro backdrop reads: SOFR at 3.6% and stable, Florida unemployment at 4.7% (rising), headline CPI at 3.8% YoY and rising. The funding-cost and labor-supply picture is the operator's primary lens; cross-vertical synthesis (franchise + CRE + sector-credit) lives downstream in master.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | Florida labor force participation | 57.7 | stable | FRED Florida Labor Force Participation Rate (series_id FLLFPR) — latest observa… | https://api.stlouisfed.org/fred/series/observations?series_id=LBSSA12&units=lin&file_type=json&sort_order=desc&limit=24 |
| T1 | Florida unemployment rate | 4.7 | rising | FRED Florida Unemployment Rate (series_id FLUR) — latest observation 4.7 percen… | https://api.stlouisfed.org/fred/series/observations?series_id=FLUR&units=lin&file_type=json&sort_order=desc&limit=24 |
| T1 | SOFR (Secured Overnight Financing Rate) | 3.56 | stable | FRED Secured Overnight Financing Rate (series_id SOFR) — latest observation 3.5… | https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&units=lin&file_type=json&sort_order=desc&limit=24 |
| T1 | US CPI YoY | 3.77925 | rising | FRED US CPI (All Items) Year-over-Year (series_id CPIAUCSL_YOY) — latest observ… | https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&units=pc1&file_type=json&sort_order=desc&limit=24 |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `macro-swfl` v12 · refined 2026-05-17T03:01:53Z · relevance half-life 720h · decay `weeks`_
