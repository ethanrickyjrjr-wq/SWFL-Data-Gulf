# Operator Briefing: master

_Flat technical read of the brain output in DAG order, suitable for engine operators and producers._

## TL;DR

**BEARISH** (magnitude 0.85) — overrides fired: `flood-veto`

## ⚠️ Caveats (read first)

- Override "flood-veto" forced bearish (priority 90)

## Conclusion

Read is bearish (high magnitude). Driven by: franchise-outcomes, cre-swfl, macro-swfl, sector-credit-swfl, tourism-tdt, env-swfl. Overrides: flood-veto. Note conflicts: cre-swfl (bullish) vs macro-swfl (bearish). Combined confidence 0.97, trust tier T2, based on 6 upstream brains.

## Key Findings

- **SBA franchise overall survival rate (173 resolved loans, 137 brands)** — 91.9 → _(source: [SBA 7(a)/504 franchise loan outcomes via Brains Supabase RPC get_franchise_outcomes_aggregated (Lee + Collier counties,…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/rpc/get_franchise_outcomes_aggregated), T1, fetched 2026-05-17T03:46:47Z)_
- **Median SWFL CRE cap rate (21 of 25 corridors)** — 6.25 ↓ _(source: [Brains Supabase corridor_profiles (verified, non-deleted) — median across 21 corridors reporting cap_rate_pct: Immokale…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/corridor_profiles?select=*&verification_status=eq.verified&deleted_at=is.null&cap_rate_pct=not.is.null), T2, fetched 2026-05-17T02:49:24Z)_
- **SOFR (Secured Overnight Financing Rate)** — 3.56 → _(source: [FRED Secured Overnight Financing Rate (series_id SOFR) — latest observation 3.56 percent_annualized for period 2026-05-…](https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&units=lin&file_type=json&sort_order=desc&limit=24), T1, fetched 2026-05-17T03:01:49Z)_
- **Arts, Entertainment & Recreation (NAICS 71) — best SWFL SBA survival rate** — 100 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.71%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Latest monthly TDT collections (Lee County, 2026-04, shoulder season)** — 9028029.34 ↑ _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 103 monthly row…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd), T1, fetched 2026-05-17T03:10:35Z)_
- **SWFL area-weighted Special Flood Hazard Area coverage** — 0.4324 (43.24%) → _(source: [FEMA NFHL Flood Hazard Zones (Layer 28 / S_FLD_HAZ_AR), area-weighted aggregate across 6 SWFL counties: Charlotte (1201…](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28), T1, fetched 2026-05-17T02:29:58Z)_
- **Year-over-year delta vs same month prior year** — 18.2 ↑ _(source: [Florida DOR Tourist Development Tax collections via Brains Supabase fl_dor_tdt_collections (Lee County, 103 monthly row…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/fl_dor_tdt_collections?select=id,county,period,collections_usd), T1, fetched 2026-05-17T03:10:35Z)_
- **Transportation & Warehousing (NAICS 48) — worst SWFL SBA charge-off rate** — 57.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.48%25), T1, fetched 2026-05-17T03:08:25Z)_

## Drivers

- `franchise-outcomes` — input
- `cre-swfl` — input
- `macro-swfl` — input
- `sector-credit-swfl` — input
- `tourism-tdt` — input
- `env-swfl` — **veto**

## Contradictions surfaced

- cre-swfl (bullish) vs macro-swfl (bearish)
- cre-swfl (bullish) vs sector-credit-swfl (bearish)
- cre-swfl (bullish) vs env-swfl (bearish)
- macro-swfl (bearish) vs tourism-tdt (bullish)
- sector-credit-swfl (bearish) vs tourism-tdt (bullish)
- tourism-tdt (bullish) vs env-swfl (bearish)

## Confidence

- **0.97** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T2
- Upstream brains that passed the relevance floor: 6

---

_Brain: `master` v30 · refined 2026-05-17T04:29:47Z · relevance half-life 720h · decay `weeks`_
