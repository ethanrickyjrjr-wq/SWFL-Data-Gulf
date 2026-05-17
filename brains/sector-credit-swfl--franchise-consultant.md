# Franchise Consultant Briefing: sector-credit-swfl

_Outcomes-first read framed for franchise opportunity assessment, with survival and sector-credit signals foregrounded._

## TL;DR

**BEARISH** (magnitude 0.39)

## ⚠️ Caveats (read first)

- Charge-off rates use the resolved-loan denominator (n_chargeoffs / (n_chargeoffs + n_paid_in_full)); the materialized view's `chargeoff_pct` is intentionally ignored because it understates risk on still-active loans.
- Sectors with fewer than 5 resolved loans are not ranked — small-sample charge-off rates are directional, not actionable.
- Worst-sector charge-off 57.1% (Transportation & Warehousing, NAICS 48) above 30% bearish threshold — sector-level credit risk is elevated.

## Conclusion

For SWFL lenders, the three lowest-risk 2-digit NAICS sectors by SBA resolved-loan charge-off rate are: Arts, Entertainment & Recreation (0%), Finance & Insurance (0%), Real Estate, Rental & Leasing (0%). The three highest-risk sectors are: Transportation & Warehousing (57.1%), Retail Trade (44.4%), Other Services (Personal & Repair) (21.2%) — meaningful sample size in each case. Read these rates against the current SOFR of 3.6% (stable) — funding-cost direction sets the appetite for charge-off risk. Cross-validate any sector-level call against the named brand outcomes in the franchise-outcomes brain before underwriting a specific borrower.

## Key Findings

### Most relevant to your role

- **Arts, Entertainment & Recreation (NAICS 71) — best SWFL SBA survival rate** — 100 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.71%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Transportation & Warehousing (NAICS 48) — worst SWFL SBA charge-off rate** — 57.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.48%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Arts, Entertainment & Recreation (NAICS 71)** — 0 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.71%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Finance & Insurance (NAICS 52)** — 0 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.52%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Real Estate, Rental & Leasing (NAICS 53)** — 0 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.53%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Accommodation & Food Services (NAICS 72)** — 7.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.72%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Wholesale Trade (NAICS 42)** — 9.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.42%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Professional, Scientific & Technical Services (NAICS 54)** — 12 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.54%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Health Care & Social Assistance (NAICS 62)** — 12.5 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.62%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Construction (NAICS 23)** — 13.7 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.23%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Administrative & Support Services (NAICS 56)** — 18.8 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.56%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Retail Trade (NAICS 44)** — 18.8 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.44%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Other Services (Personal & Repair) (NAICS 81)** — 21.2 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.81%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Retail Trade (NAICS 45)** — 44.4 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.45%25), T1, fetched 2026-05-17T03:08:25Z)_
- **Transportation & Warehousing (NAICS 48)** — 57.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2020+); federal…](https://jtkdowmrjaxfvwmemxso.supabase.co/rest/v1/sba_loans_by_naics_county?select=*&project_county=in.(LEE,COLLIER)&approval_fy=gte.2020&naics_code=like.48%25), T1, fetched 2026-05-17T03:08:25Z)_


## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 2

---

_Brain: `sector-credit-swfl` v8 · refined 2026-05-17T03:08:25Z · relevance half-life 720h · decay `weeks`_
