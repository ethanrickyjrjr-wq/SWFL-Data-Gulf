# CPA / Audit Briefing: tourism-tdt

_Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL._

## TL;DR

**BULLISH** (magnitude 0.55)

## ⚠️ Caveats (read first)

- Florida DOR distribution rosters may revise recent months for ~60 days after first publication — treat the latest month as directional, not final.

## Conclusion

Lee County TDT collections for 2026-04 (shoulder season): $9.03M. Year-over-year +18.2% against the prior fiscal year. Trailing 12 months stand at 79% of the strongest pre-Hurricane-Ian annual run. Hospitality / accommodation operators should weight forward decisions against this seasonal pulse; the cross-vertical read lives downstream in master.

## Audit Trail (all metrics, by trust tier)

| Tier | Metric | Value | Direction | Citation | URL |
| --- | --- | --- | --- | --- | --- |
| T1 | Latest monthly TDT collections (Lee County, 2026-04, shoulder season) | 9028029.34 | rising | Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd |
| T1 | Post-Hurricane-Ian recovery ratio (trailing 12mo ÷ best pre-Ian 12mo) | 0.79 (79.00%) | falling | Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd |
| T1 | Seasonal position vs same-month historical mean | 1.23 | rising | Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd |
| T1 | Trailing 12-month TDT collections total | 53331298.019999996 | stable | Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd |
| T1 | Year-over-year delta vs same month prior year | 18.2 | rising | Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_… | https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd |

## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 0

---

_Brain: `tourism-tdt` v5 · refined 2026-05-17T03:10:35Z · relevance half-life 720h · decay `weeks`_
