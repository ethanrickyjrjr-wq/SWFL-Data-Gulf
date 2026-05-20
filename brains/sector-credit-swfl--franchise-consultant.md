# Franchise Consultant Briefing: sector-credit-swfl

_Outcomes-first read framed for franchise opportunity assessment, with survival and sector-credit signals foregrounded._

## TL;DR

**BEARISH** (magnitude 0.05)

## ⚠️ Caveats (read first)

- Charge-off rates use the resolved-loan denominator (n_chargeoffs / (n_chargeoffs + n_paid_in_full)); the materialized view's `chargeoff_pct` is intentionally ignored because it understates risk on still-active loans.
- Sectors with fewer than 5 resolved loans are not ranked — small-sample charge-off rates are directional, not actionable.
- Worst-sector charge-off 33.3% (Arts, Entertainment & Recreation, NAICS 71) above 30% bearish threshold — sector-level credit risk is elevated.

## Conclusion

For SWFL lenders, the three lowest-risk 2-digit NAICS sectors by SBA resolved-loan charge-off rate are: Professional, Scientific & Technical Services (0%), Health Care & Social Assistance (0%), Construction (4.7%). The three highest-risk sectors are: Arts, Entertainment & Recreation (33.3%), Retail Trade (26.1%), Accommodation & Food Services (25.4%) — meaningful sample size in each case. Read these rates against the current SOFR of 4.3% (falling) — funding-cost direction sets the appetite for charge-off risk. Cross-validate any sector-level call against the named brand outcomes in the franchise-outcomes brain before underwriting a specific borrower.

## Key Findings

### Most relevant to your role

- **Professional, Scientific & Technical Services (NAICS 54) — best SWFL SBA survival rate** — 100 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=54), T1, fetched 2026-05-18T20:50:57Z)_
- **Arts, Entertainment & Recreation (NAICS 71) — worst SWFL SBA charge-off rate** — 33.3 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=71), T1, fetched 2026-05-18T20:50:57Z)_
- **Professional, Scientific & Technical Services (NAICS 54)** — 0 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=54), T1, fetched 2026-05-18T20:50:57Z)_
- **Health Care & Social Assistance (NAICS 62)** — 0 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=62), T1, fetched 2026-05-18T20:50:57Z)_
- **Construction (NAICS 23)** — 4.7 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=23), T1, fetched 2026-05-18T20:50:57Z)_
- **Retail Trade (NAICS 44)** — 18.8 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=44), T1, fetched 2026-05-18T20:50:57Z)_
- **Other Services (Personal & Repair) (NAICS 81)** — 21.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=81), T1, fetched 2026-05-18T20:50:57Z)_
- **Accommodation & Food Services (NAICS 72)** — 25.4 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=72), T1, fetched 2026-05-18T20:50:57Z)_
- **Retail Trade (NAICS 45)** — 26.1 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=45), T1, fetched 2026-05-18T20:50:57Z)_
- **Arts, Entertainment & Recreation (NAICS 71)** — 33.3 → _(source: [SBA 7(a)/504 loan outcomes via Brains Supabase sba_loans_by_naics_county MV (Lee + Collier counties, FY 2024+); federal…](fixture://refinery/__fixtures__/sector-credit-swfl.sample.json#naics_2digit=71), T1, fetched 2026-05-18T20:50:57Z)_


## Drivers

_No upstream drivers (primary brain)._

## Confidence

- **1.00** (deterministic: trust tier × freshness × upstream propagation)
- Worst trust tier in chain: T1
- Upstream brains that passed the relevance floor: 3

---

_Brain: `sector-credit-swfl` v17 · refined 2026-05-18T20:50:57Z · relevance half-life 720h · decay `weeks`_
