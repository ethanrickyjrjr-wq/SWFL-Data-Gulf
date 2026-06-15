# Semantic Ledger

_The data on the data — auto-generated read-only view of the SKOS vocabulary, DAG, and constitution overrides that drive the SWFL Intelligence Lake._

**Generated:** 2026-06-15T22:13:43.286Z (commit `ca5acc0`)
**Vocab schema:** 1.0.0 · created 2026-05-16 · next review 2026-08-15
**Audit doc:** `docs/vocab-audit.md`

## TL;DR

- **277** SKOS concepts across **13** categories (275 active, 2 stub).
- **303** raw slugs registered in `slug_index`.
- **34** distinct source brains referenced (live + planned).
- **35** packs in the runtime registry.

## Regenerate

```
bun refinery/tools/semantic-ledger.mts
```

## Categories

| Category | Concepts | Active | Stub |
| --- | ---: | ---: | ---: |
| `cre` | 3 | 3 | 0 |
| `credit-risk` | 17 | 16 | 1 |
| `demand-signal` | 15 | 15 | 0 |
| `economic-activity` | 11 | 11 | 0 |
| `environmental` | 34 | 33 | 1 |
| `hospitality` | 9 | 9 | 0 |
| `labor` | 7 | 7 | 0 |
| `logistics` | 19 | 19 | 0 |
| `macro` | 35 | 35 | 0 |
| `market-signal` | 5 | 5 | 0 |
| `qualitative` | 5 | 5 | 0 |
| `real-estate` | 103 | 103 | 0 |
| `regulatory` | 14 | 14 | 0 |

## Concepts by Category

### `cre` (3)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `commercial_permits_count` | SWFL Commercial Permits Issued | `commercial_permits_count` | count | permits | _unbounded_ | `permits-commercial-swfl` | `real-estate` | ✅ active |
| `commercial_permits_sf` | SWFL Commercial Permit Building Area | `commercial_permits_sf` | count | sqft | _unbounded_ | `permits-commercial-swfl` | `real-estate` | ✅ active |
| `commercial_permits_value_usd` | SWFL Commercial Permit Value | `commercial_permits_value_usd` | currency | USD | _unbounded_ | `permits-commercial-swfl` | `real-estate` | ✅ active |

<details><summary>Scope notes</summary>

- **`commercial_permits_count`** — Count of issued commercial building permits across SWFL for the reporting calendar year, from the Maxwell, Hendry & Simmons annual Data Book (data_lake.mhs_permits_swfl, source_name='mhs_databook'). SWFL-wide total across all mapped submarkets. Distinct from residential Accela permits (permits-swfl) — never blend the two. Single-year snapshot; not a trend until a second annual book lands.
- **`commercial_permits_sf`** — Sum of building square footage across SWFL issued commercial building permits for the reporting calendar year, from the MHS Data Book (data_lake.mhs_permits_swfl). SWFL-wide total across all mapped submarkets; rows with a missing building_sf contribute 0. Distinct from residential Accela permits.
- **`commercial_permits_value_usd`** — Sum of declared permit value (USD) across SWFL issued commercial building permits for the reporting calendar year, from the MHS Data Book (data_lake.mhs_permits_swfl). Declared value is the applicant-stated construction value, not appraised or assessed value. SWFL-wide total across all mapped submarkets; distinct from residential Accela permits.

</details>

### `credit-risk` (17)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sba_best_sector_survival` | Best-Sector SBA Survival Rate | `best_naics_survival` | percentage | % | 0 – 100 | `sector-credit-swfl`, `master` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_23` | Construction (NAICS 23) â€” SBA Charge-off Rate | `sector_23_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_42` | Wholesale Trade (NAICS 42) â€” SBA Charge-off Rate | `sector_42_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_44` | Retail Trade â€” Motor Vehicle & General Merchandise (NAICS 44) â€” SBA Charge-off Rate | `sector_44_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_45` | Retail Trade â€” Clothing, Sporting Goods & Non-store (NAICS 45) â€” SBA Charge-off Rate | `sector_45_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_48` | Transportation & Warehousing (NAICS 48) â€” SBA Charge-off Rate | `sector_48_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_52` | Finance & Insurance (NAICS 52) â€” SBA Charge-off Rate | `sector_52_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_53` | Real Estate, Rental & Leasing (NAICS 53) â€” SBA Charge-off Rate | `sector_53_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance`, `real-estate` | ✅ active |
| `sba_chargeoff_rate_sector_54` | Professional, Scientific & Technical Services (NAICS 54) â€” SBA Charge-off Rate | `sector_54_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_56` | Administrative & Support Services (NAICS 56) â€” SBA Charge-off Rate | `sector_56_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_62` | Health Care & Social Assistance (NAICS 62) â€” SBA Charge-off Rate | `sector_62_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_chargeoff_rate_sector_71` | Arts, Entertainment & Recreation (NAICS 71) â€” SBA Charge-off Rate | `sector_71_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance`, `hospitality` | ✅ active |
| `sba_chargeoff_rate_sector_72` | Accommodation & Food Services (NAICS 72) â€” SBA Charge-off Rate | `sector_72_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance`, `hospitality` | ✅ active |
| `sba_chargeoff_rate_sector_81` | Other Services â€” Personal & Repair (NAICS 81) â€” SBA Charge-off Rate | `sector_81_chargeoff_rate` | percentage | % | 0 – 100 | `sector-credit-swfl` | `finance` | ✅ active |
| `sba_naics_distress_baseline` | NAICS Sector Distress Baseline | `naics_distress_baseline` | percentage | % | 0 – 100 | _none_ | `finance` | ⚠️ stub |
| `sba_overall_survival_rate` | SBA Franchise Survival Rate (Corpus) | `overall_survival_rate` | percentage | % | 0 – 100 | `franchise-outcomes`, `master` | `finance` | ✅ active |
| `sba_worst_sector_chargeoff` | Worst-Sector SBA Charge-off Rate | `worst_naics_chargeoff` | percentage | % | 0 – 100 | `sector-credit-swfl`, `master` | `finance` | ✅ active |

<details><summary>Scope notes</summary>

- **`sba_best_sector_survival`** — Corpus-level derived aggregate. Identifies the top-ranked 2-digit NAICS sector by survival rate for the reporting period.
- **`sba_chargeoff_rate_sector_44`** — DISTINCT from sba_chargeoff_rate_sector_45. NAICS 44 covers motor vehicle dealers, electronics, building materials, and food/beverage stores. Both 44 and 45 are officially titled 'Retail Trade' by the SBA â€” use naics_code to disambiguate, never the label alone.
- **`sba_chargeoff_rate_sector_45`** — DISTINCT from sba_chargeoff_rate_sector_44. NAICS 45 covers clothing stores, sporting goods, hobby shops, general merchandise, and non-store retailers. Both 44 and 45 are officially titled 'Retail Trade' by the SBA â€” use naics_code to disambiguate, never the label alone.
- **`sba_naics_distress_baseline`** — Pre-registered for the naics-distress-veto override rule in refinery/constitution/real-estate.mts. Fires false until sector-credit-swfl exposes a baseline metric. Pair with sba_chargeoff_rate_sector_{naics} for the comparison.
- **`sba_overall_survival_rate`** — Resolved-loan denominator only: n_paid_in_full / (n_paid_in_full + n_chargeoffs). Never computed over total loans.
- **`sba_worst_sector_chargeoff`** — Corpus-level derived aggregate. Above 30% triggers bearish threshold per sector-credit-swfl caveat logic.

</details>

### `demand-signal` (15)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aircraft_operations` | Monthly Aircraft Operations | `aircraft_operations` | count | operations | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `deplanements` | Monthly Deplanements | `deplanements` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `enplanements` | Monthly Enplanements | `enplanements` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_aircraft_operations` | RSW Monthly Aircraft Operations | `rsw_aircraft_operations` | count | operations | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_deplanements` | RSW Monthly Deplanements (Arrivals) | `rsw_deplanements` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_freight_lbs` | RSW Monthly Air Freight | `rsw_freight_lbs` | count | lbs | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_monthly_enplanements` | RSW Monthly Enplanements (Departures) | `rsw_monthly_enplanements` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_pax_per_operation` | RSW Passengers per Aircraft Operation | `rsw_pax_per_operation` | ratio | passengers/operation | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_seasonality_ratio` | RSW Seasonality Ratio | `rsw_seasonality_ratio` | ratio | ratio | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_total_passengers` | RSW Monthly Total Passengers | `rsw_total_passengers` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_trailing_12mo_total_passengers` | RSW Trailing 12-Mo Total Passengers | `rsw_trailing_12mo_total_passengers` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_trailing_12mo_total_passengers_yoy` | RSW Total Passengers — Trailing-12-Mo YoY | `rsw_trailing_12mo_total_passengers_yoy` | percent_change | % | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `rsw_yoy_pct_change` | RSW Enplanements YoY | `rsw_yoy_pct_change` | percent_change | % | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `total_freight_lbs` | Monthly Air Freight (lbs) | `total_freight_lbs` | count | lbs | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |
| `total_passengers` | Monthly Total Passengers | `total_passengers` | count | passengers | _unbounded_ | `rsw-airport` | `hospitality` | ✅ active |

<details><summary>Scope notes</summary>

- **`aircraft_operations`** — Monthly aircraft operations (takeoffs + landings) at an airport. Metric type tag used by rsw_airport_monthly rows.
- **`deplanements`** — Monthly passengers deplaning (arriving) at an airport. Metric type tag used by rsw_airport_monthly rows.
- **`enplanements`** — Monthly passengers boarding at an airport (enplanements). Metric type tag used by rsw_airport_monthly rows.
- **`rsw_aircraft_operations`** — Monthly aircraft operations (takeoffs + landings, all traffic) at RSW — a capacity / frequency signal. Source: LCPA reports-and-statistics PDF, monthly.
- **`rsw_deplanements`** — Monthly deplaned (arriving) passengers at RSW — inbound throughput, the demand-relevant half. Counts arrivals, not visitors (includes returning residents). Decomposition context for total passengers. Source: LCPA reports-and-statistics PDF, monthly.
- **`rsw_freight_lbs`** — Monthly air freight in pounds at RSW — a goods-economy / air-cargo signal. Source: LCPA reports-and-statistics PDF, monthly.
- **`rsw_monthly_enplanements`** — Monthly enplaned (departing) passengers at RSW. Decomposition context for total passengers, not a standalone direction input. Source: LCPA reports-and-statistics PDF, monthly.
- **`rsw_pax_per_operation`** — Total passengers ÷ aircraft operations for the latest month — a utilization PROXY, not airline load factor (true load factor needs seat counts / available seat-miles, which LCPA does not publish).
- **`rsw_seasonality_ratio`** — Peak month ÷ median month of trailing-12 total passengers (ACI-style seasonality ratio) — a CHARACTERIZING statistic quantifying RSW's snowbird concentration, not a direction signal. No downstream brain consumes it.
- **`rsw_total_passengers`** — Monthly total passengers (enplaned + deplaned) at RSW — the canonical airport throughput KPI and the brain's headline demand metric. Source: LCPA reports-and-statistics PDF, monthly.
- **`rsw_trailing_12mo_total_passengers`** — Sum of RSW total passengers across the most recent 12 months — the deseasonalized scale of airport demand. Null when fewer than 12 monthly rows are available.
- **`rsw_trailing_12mo_total_passengers_yoy`** — The rsw-airport DIRECTION DRIVER: YoY change of the trailing-12-month total-passengers sum (rolling last-12 vs the prior-12). Deseasonalizes RSW's extreme snowbird seasonality. total_passengers is the sole direction input; enplanements and deplanements are its decomposition.
- **`rsw_yoy_pct_change`** — Year-over-year change in RSW monthly enplanements. Retained for continuity; the brain's direction now derives from trailing-12-month total-passengers YoY (rsw_trailing_12mo_total_passengers_yoy).
- **`total_freight_lbs`** — Monthly air freight in pounds at an airport. Metric type tag used by rsw_airport_monthly rows.
- **`total_passengers`** — Monthly total passengers (enplaned + deplaned) at an airport. Metric type tag used by rsw_airport_monthly rows.

</details>

### `economic-activity` (11)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `city_pulse_signal` | City Pulse Signal | _none_ | categorical | — | _unbounded_ | `city-pulse-swfl` | `economic-activity`, `real-estate` | ✅ active |
| `econ_dev_announcements_90d` | SWFL Economic Development Announcements (Last 90 Days) | `econ_dev_announcements_90d` | count | announcements | 0 – null | `econ-dev-swfl`, `master` | `finance` | ✅ active |
| `econ_dev_announcements_prior_90d` | SWFL Economic Development Announcements (Prior 90-Day Window) | `econ_dev_announcements_prior_90d` | count | announcements | 0 – null | `econ-dev-swfl`, `master` | `finance` | ✅ active |
| `econ_dev_investment_usd_90d` | SWFL Disclosed Economic-Development Investment (Last 90 Days) | `econ_dev_investment_usd_90d` | currency | USD | 0 – null | `econ-dev-swfl`, `master` | `finance` | ✅ active |
| `econ_dev_jobs_90d` | SWFL Disclosed Economic-Development Jobs (Last 90 Days) | `econ_dev_jobs_90d` | count | jobs | 0 – null | `econ-dev-swfl`, `master` | `finance` | ✅ active |
| `fgcu_reri_airport_activity_pct_change` | FGCU RERI Airport Activity YoY | `fgcu_reri_airport_activity_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro` | ✅ active |
| `fgcu_reri_taxable_sales_pct_change` | FGCU RERI Taxable Sales YoY | `fgcu_reri_taxable_sales_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro` | ✅ active |
| `fgcu_reri_tourist_tax_pct_change` | FGCU RERI Tourist Tax Revenues YoY | `fgcu_reri_tourist_tax_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `hospitality` | ✅ active |
| `fl_dor_taxable_sales_latest_usd` | SWFL Monthly Taxable Sales (Latest) | `swfl_taxable_sales_latest_usd` | currency_usd | USD | _unbounded_ | `sector-credit-swfl` | `finance` | ✅ active |
| `fl_dor_taxable_sales_trailing_12mo_usd` | SWFL Taxable Sales Trailing 12 Months | `swfl_taxable_sales_trailing_12mo_usd` | currency_usd | USD | _unbounded_ | `sector-credit-swfl` | `finance` | ✅ active |
| `fl_dor_taxable_sales_yoy_pct` | SWFL Taxable Sales YoY Change | `swfl_taxable_sales_yoy_pct` | percentage | % | -100 – null | `sector-credit-swfl` | `finance` | ✅ active |

<details><summary>Scope notes</summary>

- **`city_pulse_signal`** — A dated, citation-backed current-events signal for a SWFL city (business openings/closings, property transactions, construction activity, disasters, structural market shifts), emitted by the city-pulse-swfl reporter brain. Each slug encodes a topic category (breaking, transactions, development, business, structural) and a positional index within the build (e.g. signal_transactions_1, signal_development_2). The index is build-relative and carries no cross-build identity. Raw slugs are empty because all emissions are pattern-matched via raw_slug_patterns; a malformed or unrecognised topic still…
- **`econ_dev_announcements_90d`** — Count of qualifying economic-development announcements (relocation, expansion, grant, infrastructure) in the trailing 90 days from SWFL Inc. (swflinc.com/blog/), the Lee County EDO. Momentum numerator paired with econ_dev_announcements_prior_90d.
- **`econ_dev_announcements_prior_90d`** — Count of qualifying SWFL Inc. economic-development announcements in the 90-180-day prior window. Momentum baseline for econ_dev_announcements_90d (direction = rising/falling versus this window).
- **`econ_dev_investment_usd_90d`** — Sum of disclosed capital investment across SWFL Inc. announcements in the trailing 90 days. Conditionally emitted only when at least one announcement discloses an investment figure; values reflect announcement-time intent, not audited outcomes.
- **`econ_dev_jobs_90d`** — Sum of disclosed jobs announced across SWFL Inc. announcements in the trailing 90 days. Conditionally emitted only when at least one announcement discloses a jobs figure; values reflect announcement-time intent, not audited hiring.
- **`fgcu_reri_airport_activity_pct_change`** — Year-over-year percentage change in Southwest Florida airport passenger/cargo activity per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_taxable_sales_pct_change`** — Year-over-year percentage change in SWFL taxable sales per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_tourist_tax_pct_change`** — Year-over-year percentage change in SWFL tourist development tax revenues per FGCU RERI monthly report. ~2-month data lag.
- **`fl_dor_taxable_sales_latest_usd`** — Lee + Collier combined taxable sales for the latest reported month from FL DOR Form 10. Demand-side complement to SBA charge-off rate data.
- **`fl_dor_taxable_sales_trailing_12mo_usd`** — Rolling 12-month sum of SWFL combined taxable sales (Lee + Collier). Smooths seasonality; null when fewer than 12 months of data are available.
- **`fl_dor_taxable_sales_yoy_pct`** — Year-over-year change in SWFL combined taxable sales (same calendar month, prior year). Positive = demand expansion.

</details>

### `environmental` (34)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `env_collier_sfha_coverage_pct` | Collier County Area-Weighted SFHA Coverage | `collier_county_sfha_pct_area_weighted` | ratio | ratio (0â€“1) | 0 – 1 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_collier_ve_zone_coverage_pct` | Collier County Area-Weighted Coastal V/VE Coverage | `collier_county_ve_zone_pct_area_weighted` | ratio | ratio (0â€“1) | 0 – 1 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_flood_losses_swfl_baseline_annual_usd` | SWFL Non-Storm-Year Annual NFIP Paid Claims (Median) | `flood_losses_baseline`, `swfl_nonstorm_claims_baseline` | currency | USD | 0 – 100000000 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_flood_losses_swfl_post_ian_ratio` | SWFL Post-Ian Flood Recovery Ratio (Latest Year Ã· Baseline) | `swfl_post_ian_claims_ratio`, `post_ian_claims_ratio`, `swfl_flood_recovery_ratio` | ratio | ratio (1.0 = matches non-storm baseline) | 0 – 100 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_flood_losses_swfl_storm_year_count_since_2000` | SWFL Named-Storm-Year Count Since 2000 | `storm_year_count_swfl`, `swfl_storm_frequency` | count | count | 0 – 20 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_flood_losses_swfl_storm_year_total_usd` | SWFL Storm-Year NFIP Paid Claims (Cumulative) | `flood_losses_storm_total`, `swfl_storm_year_claims_usd` | currency | USD | 0 – 50000000000 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_flood_risk_pct` | Flood Risk Percentage | `flood_risk_pct` | percentage | % | 0 – 100 | _none_ | `environmental`, `real-estate` | ⚠️ stub |
| `env_hurricane_cat3plus_passes_within_50mi_30yr_swfl` | SWFL Cat-3+ Hurricane Passes Within 50mi (30-Year Window) | `hurricane_cat3plus_passes_within_50mi_30yr` | count | storms | 0 – 100 | `hurricane-tracks-fl` | `environmental`, `real-estate` | ✅ active |
| `env_hurricane_closest_pass_5yr_min_mi_swfl` | SWFL Closest Hurricane Pass (Trailing 5-Year Window, miles) | `hurricane_closest_pass_5yr_min_mi` | distance_mi | statute miles | 0 – 1000 | `hurricane-tracks-fl` | `environmental`, `real-estate` | ✅ active |
| `env_hurricane_landfalls_swfl_30yr` | SWFL Hurricane Landfalls (Trailing 30-Year Window) | `hurricane_landfalls_30yr` | count | storms | 0 – 100 | `hurricane-tracks-fl` | `environmental`, `real-estate` | ✅ active |
| `env_hurricane_most_recent_landfall_swfl` | SWFL Most Recent Hurricane Landfall (Storm + Date) | `hurricane_most_recent_landfall_date` | string | — | _unbounded_ | `hurricane-tracks-fl` | `environmental`, `real-estate` | ✅ active |
| `env_hurricane_nfip_paid_per_landfall_storm_avg_usd_swfl` | SWFL Average NFIP Paid per Landfall Storm (USD) | `hurricane_nfip_paid_per_landfall_storm_avg_usd` | currency_usd | USD | 0 – 10000000000 | `hurricane-tracks-fl` | `environmental`, `real-estate`, `finance` | ✅ active |
| `env_hurricane_worst_storm_county_year_nfip_paid_usd_swfl` | SWFL Worst Storm-County-Year NFIP Paid (USD) | `hurricane_worst_storm_county_year_nfip_paid_usd` | currency_usd | USD | 0 – 100000000000 | `hurricane-tracks-fl` | `environmental`, `real-estate`, `finance` | ✅ active |
| `env_lee_sfha_coverage_pct` | Lee County Area-Weighted SFHA Coverage | `lee_county_sfha_pct_area_weighted` | ratio | ratio (0â€“1) | 0 – 1 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_lee_ve_zone_coverage_pct` | Lee County Area-Weighted Coastal V/VE Coverage | `lee_county_ve_zone_pct_area_weighted` | ratio | ratio (0â€“1) | 0 – 1 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_rainfall_swfl_annual_in` | SWFL Annual Rainfall (Latest Complete Year) | `swfl_rainfall_annual_in`, `rainfall_swfl_latest_year_in` | depth_in | in | 0 – 120 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_counties_covered_swfl` | SWFL Counties Present in Storm History Corpus | `storm_counties_covered` | string | — | _unbounded_ | `storm-history-swfl` | `environmental` | ✅ active |
| `env_storm_ingest_vintage_swfl` | SWFL Storm-History Ingest Vintage Range | `storm_ingest_vintage` | string | — | _unbounded_ | `storm-history-swfl` | `environmental` | ✅ active |
| `env_storm_last_billion_dollar_event_date_swfl` | Most Recent SWFL Billion-Dollar Storm Event Date | `storm_last_billion_dollar_event_date` | date | ISO 8601 date (YYYY-MM-DD) | _unbounded_ | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_last_billion_dollar_event_name_swfl` | Most Recent SWFL Billion-Dollar Storm Event Name | `storm_last_billion_dollar_event_name` | string | — | _unbounded_ | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_last_billion_dollar_event_type_swfl` | Most Recent SWFL Billion-Dollar Storm Event Type | `storm_last_billion_dollar_event_type` | string | — | `Hurricane` / `Hurricane (Typhoon)` / `Tornado` / `Flash Flood` / `Storm Surge/Tide` / `Tropical Storm` / `Thunderstorm Wind` | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_major_storm_count_30yr_swfl` | SWFL Major Storm Count (Full Vintage) | `storm_major_storm_count_30yr` | count | events | 0 – 10000 | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_property_damage_events_10yr_swfl` | SWFL Property-Damage Events (10-Year Window) | `storm_property_damage_events_10yr` | count | events | 0 – 10000 | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_total_storm_count_30yr_swfl` | SWFL Total Storm Event Count (Full Vintage) | `storm_total_storm_count_30yr` | count | events | 0 – 100000 | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_storm_tropical_cyclones_10yr_swfl` | SWFL Tropical Cyclones Affecting the Footprint (10-Year Window) | `storm_tropical_cyclones_10yr` | count | storms | 0 – 100 | `storm-history-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_sw_stage_caloosahatchee_ft` | Caloosahatchee River Stage (S-79 / Olga) | `swfl_sw_stage_caloosahatchee_ft`, `caloosahatchee_stage_latest_ft` | elevation_ft | ft (gage local zero) | -5 – 30 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_swfl_sfha_coverage_pct` | SWFL Area-Weighted SFHA Coverage | `swfl_sfha_pct_area_weighted` | ratio | ratio (0â€“1) | 0 – 1 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_swfl_ve_zone_coverage_pct` | SWFL Area-Weighted Coastal V/VE Coverage | `swfl_ve_zone_pct_area_weighted` | ratio | ratio (0â€“1) | 0 – 1 | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_swfl_ve_zone_polygon_count` | SWFL Coastal V/VE Polygon Count | `swfl_ve_zone_polygon_count` | integer | polygons | _unbounded_ | `env-swfl` | `environmental`, `real-estate` | ✅ active |
| `env_zip_barrier_island_score` | Per-ZIP SWFL Barrier-Island Classification Score | `env_zip_barrier_island_score` | score | score (0.0 inland / 0.5 coastal-mainland / 1.0 barrier) | 0 – 1 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_zip_flood_aal_pct_swfl_rank` | Per-ZIP NFIP AAL Percentile Rank Across SWFL ZIPs | `env_zip_flood_aal_pct_swfl_rank` | percentile | percentile (0-100) | 0 – 100 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_zip_flood_aal_usd_per_insured_property` | Per-ZIP NFIP Average Annual Loss per Insured Property (USD/yr) | `env_zip_flood_aal_usd_per_insured_property` | currency | USD/year | 0 – 50000 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_zip_flood_cap_rate_adj_bps` | Per-ZIP SWFL Flood Cap-Rate Adjustment (bps) | `env_zip_flood_cap_rate_adj_bps` | bps | bps | 0 – 100 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |
| `env_zip_insurance_pct_typical_noi` | Per-ZIP SWFL Imputed Flood Insurance as Share of NOI | `env_zip_insurance_pct_typical_noi` | ratio | ratio | 0 – 1 | `env-swfl`, `master` | `environmental`, `real-estate` | ✅ active |

<details><summary>Scope notes</summary>

- **`env_collier_sfha_coverage_pct`** — Collier County (FIPS 12021) area-weighted SFHA coverage â€” the Naples / Marco Island / Everglades-fringe footprint. Pair with env_collier_ve_zone_coverage_pct for coastal-vs-inland structural read.
- **`env_collier_ve_zone_coverage_pct`** — Collier County (FIPS 12021) area-weighted V/VE coastal high-hazard coverage. Companion to env_lee_ve_zone_coverage_pct under identical FEMA NFHL area-weighted methodology; Naples and Marco Island concentrate this county's V/VE polygons.
- **`env_flood_losses_swfl_baseline_annual_usd`** — Median annual total of (amount_paid_on_building_claim + amount_paid_on_contents_claim + amount_paid_on_ico_claim) from data_lake.fema_nfip_claims across the 6 SWFL counties (FIPS 12071, 12021, 12015, 12043, 12051, 12115), restricted to non-storm years only (the full 1978-onward archive MINUS the SWFL_STORM_YEARS list in refinery/sources/fema-nfip-source.mts). The 'boring-times floor' for SWFL flood losses â€” the denominator for env_flood_losses_swfl_post_ian_ratio.
- **`env_flood_losses_swfl_post_ian_ratio`** — Most recent complete year's sum of (amount_paid_on_building_claim + amount_paid_on_contents_claim + amount_paid_on_ico_claim) from data_lake.fema_nfip_claims across the 6 SWFL counties (FIPS 12071, 12021, 12015, 12043, 12051, 12115) Ã· env_flood_losses_swfl_baseline_annual_usd. >2 = elevated activity (still in storm recovery); ~1 = back to baseline. Tracks the Ian/Helene/Milton recovery curve.
- **`env_flood_losses_swfl_storm_year_count_since_2000`** — Count of named SWFL-impacting hurricane years since 2000 with paid-claim totals > 10Ã— baseline. Operationally = the SWFL_STORM_YEARS hardcoded list in refinery/sources/fema-nfip-source.mts filtered to year >= 2000, deduplicated by year â€” currently Charley 2004, Wilma 2005, Irma 2017, Ian 2022, and 2024 (Helene + Milton, same year) (n=5 distinct years). Reads as 'how often does SWFL get hammered by flood claims'; the 6 SWFL counties (FIPS 12071, 12021, 12015, 12043, 12051, 12115) are the union scope.
- **`env_flood_losses_swfl_storm_year_total_usd`** — Sum of (amount_paid_on_building_claim + amount_paid_on_contents_claim + amount_paid_on_ico_claim) from data_lake.fema_nfip_claims across all 6 SWFL counties (FIPS 12071 Lee, 12021 Collier, 12015 Charlotte, 12043 Glades, 12051 Hendry, 12115 Sarasota) in the named SWFL-impacting storm years (Charley 2004, Wilma 2005, Irma 2017, Ian 2022, Helene 2024, Milton 2024). Storm list hardcoded in refinery/sources/fema-nfip-source.mts with a LAST_REVIEWED date; update when a new named storm hits SWFL.
- **`env_flood_risk_pct`** — Generic flood-risk percentage at unspecified spatial granularity. Currently a stub â€” no source brain emits it, and the SWFL flood-coverage signal is carried instead by the scope-specific concepts env_swfl_sfha_coverage_pct, env_lee_sfha_coverage_pct, env_collier_sfha_coverage_pct (and their V/VE-zone siblings).
- **`env_hurricane_cat3plus_passes_within_50mi_30yr_swfl`** — Distinct named storms in NOAA HURDAT2 whose lifetime max windspeed reached Saffir-Simpson Cat 3+ (>= 111 kt) AND that passed within 50 statute miles of any SWFL county centroid during the trailing 30-year window. Distance computed haversine from HURDAT2 obs lat/lon to hardcoded county centroids; threshold of 50mi captures eye-wall + significant tropical-storm-force wind impact band.
- **`env_hurricane_closest_pass_5yr_min_mi_swfl`** — Minimum haversine distance (statute miles) from any HURDAT2 observation point to any SWFL county centroid, across all named storms in the trailing 5-year window. Lower = closer = bigger near-term impact. A 'direct hit' is ~0-10mi; eye-wall passes are 10-30mi; significant outer-band impact is 30-100mi.
- **`env_hurricane_landfalls_swfl_30yr`** — Distinct named storms in NOAA HURDAT2 that made landfall inside any SWFL county polygon (LEE+COLLIER+CHARLOTTE+HENDRY+GLADES+SARASOTA, FIPS 12015/12021/12043/12051/12071/12115) during the trailing 30-year window. Landfall is determined by HURDAT2's record_id='L' marker, not by passing near a county; counts each storm at most once per county-year.
- **`env_hurricane_most_recent_landfall_swfl`** — Storm name + ISO landfall date (e.g. 'IAN 2022-09-28') of the most recent HURDAT2-recorded landfall (record_id='L') inside the SWFL county footprint. Surfaces recency of the last named-storm impact for recovery-stage framing. Encoded as a single string for the categorical metric slot; the underlying date is parseable from the trailing 'YYYY-MM-DD'.
- **`env_hurricane_nfip_paid_per_landfall_storm_avg_usd_swfl`** — Mean of (SUM(amount_paid_on_building_claim + amount_paid_on_contents_claim + amount_paid_on_ico_claim)) across all SWFL counties Ã— storm_year combinations where a HURDAT2 landfall occurred in the storm_year. Joins HURDAT2 landfall records to OpenFEMA NFIP claims via county_fips + year_of_loss. Cross-tier metric: HURDAT2 lives in Tier 1 Storage Parquet, NFIP in Tier 2 Postgres; the brain pre-joins both in DuckDB SQL.
- **`env_hurricane_worst_storm_county_year_nfip_paid_usd_swfl`** — Maximum NFIP paid (building+contents+ICO) across all (county, storm_year) combinations where a HURDAT2 landfall occurred in the SWFL footprint. Highlights the single worst county-year hit on record in the joined corpus; pairs with env_hurricane_nfip_paid_per_landfall_storm_avg_usd_swfl for distribution context (mean vs max). Hurricane Ian Ã— Lee 2022 typically wins this in modern vintages.
- **`env_lee_sfha_coverage_pct`** — Lee County (FIPS 12071) area-weighted SFHA coverage â€” the Fort Myers / Fort Myers Beach / Sanibel / Captiva footprint. The Â§6.4 FMB lease question keys on this and env_lee_ve_zone_coverage_pct.
- **`env_lee_ve_zone_coverage_pct`** — Lee County (FIPS 12071) area-weighted share of mapped footprint classified as FEMA coastal high-hazard (V, VE, V1â€“V30, V99). Pair with env_lee_sfha_coverage_pct for full structural-flood context. Lee County's coastal high-hazard exposure concentrates in the barrier-island ZIPs (33931 Fort Myers Beach, 33957 Sanibel, 33924 Captiva); county-aggregate values average across that concentration.
- **`env_rainfall_swfl_annual_in`** — Average annual precipitation total across NOAA GHCN-Daily stations in Lee + Collier counties (via AWS Open Data s3://noaa-ghcn-pds). Anchor stations: USW00012835 Fort Myers Page Field (Lee, 1892-present), USW00012894 RSW (Lee), USW00012897 Naples Muni (Collier), USC00086078 Naples COOP (Collier). Per-station annual totals computed for the most recent year with >=300 day-coverage (daily PRCP, VALUE/254 tenths-mm to inches, QC rows dropped); SWFL value = AVERAGE of station totals across Lee+Collier stations (averaging gives regional intensity, summing across stations is physically meaningless).…
- **`env_storm_counties_covered_swfl`** — Plus-joined alphabetical list of counties present in the storm-history corpus, e.g. 'CHARLOTTE+COLLIER+LEE'. Provides scope provenance â€” if a county is missing, downstream consumers know NOT to trust the SWFL-wide rollup for that county.
- **`env_storm_ingest_vintage_swfl`** — Hyphen-joined year range covered by this build's NOAA Storm Events corpus (e.g. '1996-2025'). Bump YEAR_RANGE_END in ingest/duckdb_pipelines/storm_history_swfl/constants.py when NCEI publishes the next yearly file, then re-run the ingest.
- **`env_storm_last_billion_dollar_event_date_swfl`** — ISO 8601 date of the most recent NOAA Storm Event across the SWFL footprint (LEE+COLLIER+CHARLOTTE) with damage_property >= $1B. Null when no billion-dollar event exists in the corpus window (e.g. fixture mode). Surfaces the recency of catastrophic-loss events for storm-recovery framing.
- **`env_storm_last_billion_dollar_event_name_swfl`** — Proper name (e.g. 'Ian') of the most recent NOAA Storm Event across the SWFL footprint (LEE+COLLIER+CHARLOTTE) with damage_property >= $1B, extracted from the NOAA episode/event narrative text. Pairs with env_storm_last_billion_dollar_event_date_swfl and env_storm_last_billion_dollar_event_type_swfl so the brain can render 'Hurricane Ian on 2022-09-28' rather than a bare event type. Null when no billion-dollar event exists in the corpus window or no proper name is extractable from the narrative.
- **`env_storm_last_billion_dollar_event_type_swfl`** — NOAA EVENT_TYPE string of the most recent billion-dollar storm in the SWFL corpus. Pairs with env_storm_last_billion_dollar_event_date_swfl (and env_storm_last_billion_dollar_event_name_swfl for the proper name). The live answer is now Hurricane (Typhoon) for Hurricane Ian on 2022-09-28 (~$12.2B across LEE+CHARLOTTE+COLLIER). Other examples observed in the 1996-2025 vintage: Hurricane Charley 2004, Tornado, Flash Flood, Storm Surge/Tide.
- **`env_storm_major_storm_count_30yr_swfl`** — Count of NOAA Storm Events across LEE+COLLIER+CHARLOTTE over the FULL modern-schema vintage (1996-2025) where damage_property >= $1M AND event_type in {Hurricane, Tornado, Flash Flood, Storm Surge/Tide}. Backward-looking risk-history aggregate â€” pair with env-swfl (modeled exposure) for forward-looking decisions.
- **`env_storm_property_damage_events_10yr_swfl`** — Count of NOAA Storm Events across LEE+COLLIER+CHARLOTTE in the trailing 10-year window with a parseable, non-zero damage_property value. Source: s3://lake-tier1/environmental/storm_events_swfl.parquet via DuckDB httpfs; ingested by ingest/duckdb_pipelines/storm_history_swfl/pipeline.py. Excludes rows with unparseable damage strings (counted separately, not summed).
- **`env_storm_total_storm_count_30yr_swfl`** — Count of ALL NOAA Storm Events across LEE+COLLIER+CHARLOTTE over the FULL modern-schema vintage (1996-2025). Denominator-style total â€” provides context for the major-storm and 10-year-window ratios but is not itself a risk-magnitude indicator.
- **`env_storm_tropical_cyclones_10yr_swfl`** — Count of DISTINCT named tropical cyclones (NOAA EVENT_TYPE in {Hurricane (Typhoon), Tropical Storm, Tropical Depression}) that affected the SWFL footprint (LEE+COLLIER+CHARLOTTE) in the trailing 10-year window. Distinct = deduplicated on UPPER(storm name)|year, the name extracted from NOAA episode/event narratives (e.g. 'Ian'); rows with no extractable name fall back to a per-episode key so they are never double-counted. Drives storm-history-swfl's bearish/neutral direction read: >= 3 distinct cyclones flips the brain bearish, which for SWFL is effectively always met (Irma 2017, Ian 2022, Hel…
- **`env_sw_stage_caloosahatchee_ft`** — Most recent daily-mean gage height across USGS active dv sites in the Caloosahatchee HUC (03090205%) reporting parameter 00065. Reference is gage local zero, NOT a vertical datum â€” useful for trend and threshold comparisons within the basin but NOT cross-site additive without datum conversion. Caloosahatchee at S-79 (site 02292900) is the canonical reference; multiple gages averaged via median when more than one reports on the same date.
- **`env_swfl_sfha_coverage_pct`** — Area-weighted share of mapped SWFL footprint (6 counties) classified as a FEMA Special Flood Hazard Area per 44 CFR Â§59.1. Computed in env-swfl via sum(Shape__Area) over SFHA-classified zones Ã· sum(Shape__Area) over all returned zones. Areas are square decimal degrees (WGS84); only the RATIO is meaningful â€” absolute areas never propagate.
- **`env_swfl_ve_zone_coverage_pct`** — Area-weighted share of mapped SWFL footprint (6 counties) classified as FEMA coastal high-hazard (V, VE, V1â€“V30, V99). Coastal-high-hazard zones are the V-prefixed subset of SFHA, distinguished from A-prefixed riverine/sheet-flow SFHA by wave-action exposure. Pair with env_swfl_sfha_coverage_pct for full structural-flood context.
- **`env_swfl_ve_zone_polygon_count`** — Count of distinct FEMA V/VE-classified polygons across the SWFL 6-county footprint. A polygon count, not an area; structural read on coastal-high-hazard fragmentation. Pair with env_swfl_ve_zone_coverage_pct for relative scale.
- **`env_zip_barrier_island_score`** — Three-state SWFL geographic classification from the static table in refinery/lib/swfl-geo.mts: 1.0 = barrier island (Fort Myers Beach 33931, Sanibel 33957, Captiva 33924, Marco Island 34145, Boca Grande 33921); 0.5 = coastal-mainland (Bonita Beach 34134, Naples coastal 34102, Cape Coral SW 33914, Fort Myers downtown 33901); 0.0 = inland (Cape Coral E 33990, North Naples 34109, East Naples 34112, plus all SWFL ZIPs not in the table â€” conservative default). The flood-barrier-mode-1 constitution rule in real-estate.mts fires only when this score is 1.0 AND aal_usd_per_insured_property â‰¥ FLOO…
- **`env_zip_flood_aal_pct_swfl_rank`** — Linear-method percentile rank of a ZIP's per-insured-property AAL across all SWFL ZIPs with â‰¥1 claim in the AAL_WINDOW_YEARS=10 window. 100 = highest-AAL ZIP, 0 = lowest. Computed across the FULL SWFL ZIP distribution (not just the top-6) so the value is comparable across runs even though only top-6 fragments are emitted. Emitted with slug template swfl_zip_{ZIP}_flood_aal_pct_swfl_rank; ZIP-templated slugs bypass SKOS at runtime per refinery/constitution/real-estate.mts.
- **`env_zip_flood_aal_usd_per_insured_property`** — Per-SWFL-ZIP average annual flood loss: sum(amount_paid_on_building_claim + amount_paid_on_contents_claim + amount_paid_on_ico_claim over last AAL_WINDOW_YEARS=10 years where reported_zipcode=Z) Ã· 10 Ã· insured_denominator(Z), where v1 insured_denominator(Z) = ZIP_POPULATION_2020[Z] Ã— INSURED_PENETRATION_FACTOR (0.30 NSI proxy). Emitted by env-swfl as one metric per top-6 highest-AAL ZIP with the slug template swfl_zip_{ZIP}_flood_aal_usd_per_insured_property; the ZIP-templated slugs bypass SKOS resolveConceptSlugs at constitution-trigger time and are matched via regex (see refinery/constit…
- **`env_zip_flood_cap_rate_adj_bps`** — Per-SWFL-ZIP cap-rate adjustment in basis points, derived from the barrier-island score via swfl-geo capRateBpsFor(): 1.0 â†’ barrier-island midpoint, 0.5 â†’ coastal-mainland midpoint, 0.0 â†’ inland (zero or minimal). Calibrated against ULI/LaSalle 2024 guidance of +25-50 bps for elevated physical risk, stratified by exposure intensity. Emitted by env-swfl as one metric per top-6 highest-AAL ZIP with the slug template swfl_zip_{ZIP}_flood_cap_rate_adj_bps. Source: internal://refinery/lib/swfl-geo.mts.
- **`env_zip_insurance_pct_typical_noi`** — Per-SWFL-ZIP imputed flood insurance load as a fraction of typical NOI: (AAL Ã— 2) Ã· (median_building_property_value Ã— 0.08), where AAL is the per-insured-property NFIP loss (env_zip_flood_aal_usd_per_insured_property), median_building_property_value is the FEMA-reported median, and the 8% cap-rate assumption converts building value to a typical NOI proxy. Emitted by env-swfl as one metric per top-6 highest-AAL ZIP with the slug template swfl_zip_{ZIP}_insurance_pct_typical_noi.

</details>

### `hospitality` (9)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hosp_tdt_collier_latest_monthly_collections` | TDT Latest Monthly Collections â€” Collier County | `collier_latest_monthly_collections_usd` | currency | USD | _unbounded_ | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_collier_trailing_12mo_collections` | TDT Trailing 12-Month Collections â€” Collier County | `collier_trailing_12mo_collections_usd` | currency | USD | _unbounded_ | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_latest_monthly_collections` | Latest Monthly TDT Collections (Lee County) | `latest_monthly_collections_usd` | currency | USD | _unbounded_ | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_lee_latest_monthly_collections` | TDT Latest Monthly Collections â€” Lee County | `lee_latest_monthly_collections_usd` | currency | USD | _unbounded_ | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_lee_trailing_12mo_collections` | TDT Trailing 12-Month Collections â€” Lee County | `lee_trailing_12mo_collections_usd` | currency | USD | _unbounded_ | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_post_ian_recovery_ratio` | Post-Hurricane-Ian Recovery Ratio | `post_ian_recovery_ratio` | ratio | ratio (1.0 = full recovery) | 0 – 5 | `tourism-tdt`, `master` | `hospitality`, `environmental` | ✅ active |
| `hosp_tdt_seasonal_position` | TDT Seasonal Position vs Historical Mean | `seasonal_position_vs_history` | ratio | ratio (1.0 = matches historical mean) | 0 – 3 | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_trailing_12mo_collections` | Trailing 12-Month TDT Collections (Lee County) | `trailing_12mo_collections_usd` | currency | USD | _unbounded_ | `tourism-tdt`, `master` | `hospitality` | ✅ active |
| `hosp_tdt_yoy_delta` | TDT Year-over-Year Delta | `yoy_delta_pct` | percentage | % | -100 – 200 | `tourism-tdt`, `master` | `hospitality` | ✅ active |

<details><summary>Scope notes</summary>

- **`hosp_tdt_collier_latest_monthly_collections`** — Most recent reported month of Collier County Tourist Development Tax collections. County-level sibling of hosp_tdt_latest_monthly_collections.
- **`hosp_tdt_collier_trailing_12mo_collections`** — Rolling 12-month sum of Collier County TDT collections. County-level sibling of hosp_tdt_trailing_12mo_collections.
- **`hosp_tdt_latest_monthly_collections`** — Most recent reported month of Lee County Tourist Development Tax collections from the Florida DOR. Period grain is one calendar month; single-month reads should NEVER be extrapolated to an annual run rate â€” pair with hosp_tdt_trailing_12mo_collections.
- **`hosp_tdt_lee_latest_monthly_collections`** — Most recent reported month of Lee County Tourist Development Tax collections. County-level sibling of hosp_tdt_latest_monthly_collections.
- **`hosp_tdt_lee_trailing_12mo_collections`** — Rolling 12-month sum of Lee County TDT collections. County-level sibling of hosp_tdt_trailing_12mo_collections.
- **`hosp_tdt_post_ian_recovery_ratio`** — trailing_12mo_collections / best pre-Ian 12-month total. 1.0 = full recovery; <0.7 is the bearish-bound threshold in tourism-tdt's voteTdtDirection. Ian landfall 2022-09-28; FY2023 onward is the post-Ian window.
- **`hosp_tdt_seasonal_position`** — Latest month's TDT collections Ã· mean collections for that same calendar month across all observed years. >1.0 = above-trend for the season; <1.0 = below-trend. Operators read this to separate true-bearish from in-trough-but-on-pace.
- **`hosp_tdt_trailing_12mo_collections`** — Sum of the most recent 12 months of Lee County TDT collections, ending at the latest reported period. The operator's annual-run-rate read; smooths over peak/shoulder/trough seasonality.
- **`hosp_tdt_yoy_delta`** — Same-month year-over-year change in Lee County TDT collections (latest month vs same calendar month prior fiscal year). Positive = YoY growth. Single observation, not a trend â€” pair with hosp_tdt_trailing_12mo_collections for run-rate context.

</details>

### `labor` (7)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fgcu_reri_unemployment_rate_pct_change` | FGCU RERI Unemployment Rate YoY Î” | `fgcu_reri_unemployment_rate_pct_change` | percentage_point_change | pp | _unbounded_ | `fgcu-reri` | `macro` | ✅ active |
| `licenses_active_collier` | FL DBPR Active Contractor Licenses — Collier County | `licenses_active_collier` | count | licenses | 0 – 50000 | `licenses-swfl` | `real-estate`, `macro` | ✅ active |
| `licenses_active_lee` | FL DBPR Active Contractor Licenses — Lee County | `licenses_active_lee` | count | licenses | 0 – 50000 | `licenses-swfl` | `real-estate`, `macro` | ✅ active |
| `licenses_applicants_swfl` | FL DBPR Contractor License Applicants — SWFL | `licenses_applicants_swfl` | count | applicants | 0 – 10000 | `licenses-swfl` | `real-estate`, `macro` | ✅ active |
| `licenses_cbc_share_swfl` | FL DBPR CBC Share of Active Licenses — SWFL | `licenses_cbc_share_swfl` | percentage | ratio | 0 – 1 | `licenses-swfl` | `real-estate`, `macro` | ✅ active |
| `licenses_lapse_rate_swfl` | FL DBPR Contractor License Lapse Rate — SWFL | `licenses_lapse_rate_swfl` | percentage | ratio | 0 – 1 | `licenses-swfl` | `real-estate`, `macro` | ✅ active |
| `licenses_new_12m_swfl` | FL DBPR New Contractor Licenses — SWFL (Trailing 12 Months) | `licenses_new_12m_swfl` | count | licenses | 0 – 5000 | `licenses-swfl` | `real-estate`, `macro` | ✅ active |

<details><summary>Scope notes</summary>

- **`fgcu_reri_unemployment_rate_pct_change`** — Year-over-year change in SWFL unemployment rate in percentage points per FGCU RERI monthly report. INVERSE polarity: positive delta = bearish. ~2-month data lag.
- **`licenses_active_collier`** — Count of FL DBPR Construction Board (06) + Electrical Board (08) licenses with primary_status=C + secondary_status=A in Collier County (county_code=21). Monthly bulk extract snapshot; does not represent project-level activity.
- **`licenses_active_lee`** — Count of FL DBPR Construction Board (06) + Electrical Board (08) licenses with primary_status=C + secondary_status=A in Lee County (county_code=46). Monthly bulk extract snapshot; does not represent project-level activity.
- **`licenses_applicants_swfl`** — Count of FL DBPR applicant rows for Lee+Collier counties from the CONSTRUCTIONAPPLICANT_1.csv bulk extract. Represents people in the licensing pipeline — a leading indicator of future active-license growth. Table is full-replace monthly (no primary key).
- **`licenses_cbc_share_swfl`** — FL DBPR Construction Board (board_code=06, occupation_code=CBC) active licenses as share of all active licenses (boards 06+08) in Lee+Collier. Tracks balance between general contractors and specialists. Directionality is context-dependent: no universal bullish/bearish polarity assigned.
- **`licenses_lapse_rate_swfl`** — Lapsed (primary_status != C) / all rows for FL DBPR boards 06+08 in Lee+Collier. Bearish threshold >0.10 (>10%); bullish threshold <0.05 (<5%). No historical baseline on first run — direction defaults to neutral until second snapshot enables trend comparison. DBPR annual report baseline ~8-9% statewide. [CITATION_NEEDED — verify figure against live DBPR annual report]
- **`licenses_new_12m_swfl`** — Count of active FL DBPR (boards 06+08) licenses in Lee+Collier with original_licensure_date within the trailing 12 months. Leading indicator of new entrants to the contractor workforce. Near-zero signals stale data, not market stagnation — verify pipeline freshness first.

</details>

### `logistics` (19)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `logistics_inbound_freight_tons_swfl` | SWFL Inbound Domestic Freight (Thousand Tons, Latest FAF5 Year) | `inbound_freight_tons_swfl` | count | thousand tons | 0 – 1000000 | `logistics-swfl`, `master` | `logistics` | ✅ active |
| `logistics_inbound_freight_value_swfl_musd` | SWFL Inbound Domestic Freight Value (Millions USD, Latest FAF5 Year) | `inbound_freight_value_swfl_musd` | count | millions USD | 0 – 1000000 | `logistics-swfl`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_avg_payload_tons_per_truck` | Average Payload Per Truck (FHWA Constant) | `avg_payload_tons_per_truck` | ratio | tons/truck | 0 – 100 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_baseline_validity_flag` | SWFL Freight Baseline Validity Flag | `baseline_validity_flag` | enum | — | `valid` / `stale-structural` | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_consecutive_breach_days` | SWFL Freight Consecutive Breach Days | `consecutive_breach_days` | count | days | 0 – 3650 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_current_activity_tons_year` | SWFL Freight Current Activity (Tons/Year, FDOT Segment-Counts) | `current_activity_tons_year`, `current_flow_tons_year` | count | tons/year | 0 – 10000000000 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_deviation_pct` | SWFL Freight Deviation (Percent vs Baseline) | `deviation_pct` | percentage | % | -100 – 1000 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_deviation_z` | SWFL Freight Deviation Z-Score | `deviation_z` | ratio | z-score | -10 – 10 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_faf5_inbound_flow_tons_year` | SWFL FAF5 Inbound Freight Flow (Tons/Year, CONTEXT) | `faf5_inbound_flow_tons_year`, `baseline_flow_tons_year` | count | tons/year | 0 – 10000000000 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_freight_segment_count` | SWFL Freight Segment Count (FDOT, Latest Year) | `freight_segment_count` | count | segments | 0 – 100000 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_history_days_observed` | SWFL Freight Rolling-History Days Observed | `history_days_observed` | count | days | 0 – 365 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_rolling_mean_activity_tons_year` | SWFL Freight Rolling-Mean Baseline (Tons/Year, FDOT History) | `rolling_mean_activity_tons_year` | count | tons/year | 0 – 10000000000 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_rolling_stddev_activity_tons_year` | SWFL Freight Rolling-Stddev Baseline (Tons/Year, FDOT History) | `rolling_stddev_activity_tons_year` | count | tons/year | 0 – 10000000000 | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `logistics_nowcast_shock_state` | SWFL Freight Shock State | `shock_state` | enum | — | `normal` / `anomaly` / `structural_break` / `insufficient_history` | `logistics-swfl-nowcast`, `master` | `logistics` | ✅ active |
| `traffic_aadt_swfl_5yr_cagr_pct` | SWFL AADT 5-Year CAGR (2021â€“2025) | `aadt_5yr_cagr`, `traffic_cagr_swfl` | percent_change | percent CAGR | -20 – 20 | `traffic-swfl`, `master` | `logistics` | ✅ active |
| `traffic_aadt_swfl_avg` | SWFL Length-Weighted Average AADT (Latest FDOT Year) | `aadt_swfl_avg`, `traffic_aadt_avg_swfl` | count | vehicles per day | 0 – 500000 | `traffic-swfl`, `master` | `logistics` | ✅ active |
| `traffic_aadt_swfl_yoy_pct` | SWFL AADT Year-over-Year Change (Latest vs Prior FDOT Year) | `aadt_yoy_pct`, `traffic_yoy_swfl` | percent_change | percent | -50 – 50 | `traffic-swfl`, `master` | `logistics` | ✅ active |
| `traffic_post_ian_recovery_index` | SWFL Coastal Counties Post-Ian Recovery Index (2025 Ã· 2022) | `post_ian_recovery`, `ian_recovery_index` | index | index (2022 = 100) | 0 – 200 | `traffic-swfl`, `master` | `logistics` | ✅ active |
| `traffic_truck_share_swfl_median_pct` | SWFL Median Truck Share (FDOT TFCTR, Latest Year) | `truck_share_median`, `freight_density_swfl` | percentage | percent | 0 – 100 | `traffic-swfl`, `master` | `logistics` | ✅ active |

<details><summary>Scope notes</summary>

- **`logistics_inbound_freight_tons_swfl`** — FAF5 sum of inbound domestic flows where dms_dest=129 (Remainder of Florida, the SWFL zone) and trade_type=1, reported in thousand-tons for the latest historical FAF5 year. Imports and exports are NOT included in this aggregate â€” see logistics_inbound_freight_value_swfl_musd for the dollar denominator.
- **`logistics_inbound_freight_value_swfl_musd`** — FAF5 sum of inbound domestic flow value, in millions of USD, for the same scope as logistics_inbound_freight_tons_swfl. Imports and exports excluded.
- **`logistics_nowcast_avg_payload_tons_per_truck`** — Locked constant 16.0 per FHWA Highway Statistics 2023 Table VM-1 (combination-truck average net loaded payload). Single national-average â€” SWFL commodity mix may skew heavier; SCTG-weighted upgrade reserved for v2.
- **`logistics_nowcast_baseline_validity_flag`** — Sticky flag. Flips to stale-structural after 90 consecutive days of |z|>3 against the ROLLING FDOT history baseline (Path B) â€” signals the rolling-mean baseline has drifted enough that operator review of the rolling window itself is warranted. Cold-start runs never flip the flag.
- **`logistics_nowcast_consecutive_breach_days`** — Stateful counter sourced from data_lake.fdot_freight_nowcast_shock_log (append-only Tier 2 table). Counts consecutive days |z|>3 with the same sign; resets to 0 when |z|â‰¤3, sign flips, or the current run is cold-start (z suppressed).
- **`logistics_nowcast_current_activity_tons_year`** — Path B (post-commit 297ad23): Î£ over freight-coded Lee+Collier segments of AADT Ã— tfctr (FDOT per-segment truck-share) Ã— AVG_PAYLOAD_TONS_PER_TRUCK (16.0, FHWA Highway Statistics 2023 Table VM-1) Ã— 365. Deliberately omits segment length â€” v1 multiplied by miles which mismatched FAF5's tons baseline by units AND by population (pass-through vs delivered). This metric is ACTIVITY (segment counts, over-counts pass-through) â€” do not compare directly to FAF5 flow. raw_slug 'current_flow_tons_year' retained for legacy back-compat.
- **`logistics_nowcast_deviation_pct`** — Path B: (current_activity_tons_year âˆ’ rolling_mean_activity_tons_year) / rolling_mean Ã— 100. Companion to logistics_nowcast_deviation_z; both move in lockstep but percent is operator-readable. Suppressed on cold-start runs.
- **`logistics_nowcast_deviation_z`** — Path B: (current_activity_tons_year âˆ’ rolling_mean_activity_tons_year) / rolling_stddev_activity_tons_year, computed over the last ROLLING_WINDOW_DAYS (90) of shock-log history. Suppressed (omitted from key_metrics) on cold-start runs (history_days_observed < COLD_START_THRESHOLD_DAYS). |z|>3 triggers shock_state escalation.
- **`logistics_nowcast_faf5_inbound_flow_tons_year`** — FAF5 audited annual inbound freight FLOW to SWFL. Derived as logistics-swfl.inbound_freight_tons_swfl Ã— 1000 (kilotons â†’ tons). Under Path B (post-commit 297ad23) this is preserved as CONTEXT only â€” it does NOT anchor the deviation math (which is computed against FDOT's own rolling-history baseline). raw_slug 'baseline_flow_tons_year' retained for legacy back-compat.
- **`logistics_nowcast_freight_segment_count`** — Number of freight-coded FDOT segments (roadway LIKE 'I-%' OR 'US-%') in Lee+Collier counties contributing to the current-flow aggregate. Sanity check â€” a sudden drop signals data-pull failure, not a real freight shock.
- **`logistics_nowcast_history_days_observed`** — Path B cold-start gate. Count of prior shock-log rows with non-null current_activity_tons_year inside the rolling window. Must be â‰¥ COLD_START_THRESHOLD_DAYS (90) before deviation_z is computed and emitted; otherwise shock_state = 'insufficient_history' and deviation_z/pct are suppressed from key_metrics.
- **`logistics_nowcast_rolling_mean_activity_tons_year`** — Path B: rolling mean of the last ROLLING_WINDOW_DAYS (90) shock-log rows with non-null current_activity_tons_year. This IS the math anchor for the deviation z-score â€” replaces the v1 FAF5-derived baseline. Drifts slowly as new daily activity rolls in.
- **`logistics_nowcast_rolling_stddev_activity_tons_year`** — Path B: population stddev of the same 90-day rolling window used for rolling_mean_activity_tons_year. Denominator of the deviation z-score. Replaces the v1 fixed-CoV (baseline_mu Ã— 0.10) computation.
- **`logistics_nowcast_shock_state`** — Deterministic state machine over consecutive-day |z|>3 counter: â‰¥3d â†’ anomaly; â‰¥30d â†’ structural_break (candidate); â‰¥90d also flips baseline_validity_flag. Path B added 'insufficient_history' for the cold-start gate (history_days_observed < COLD_START_THRESHOLD_DAYS). Computed in code, never LLM.
- **`traffic_aadt_swfl_5yr_cagr_pct`** — Compound annual growth rate of length-weighted SWFL AADT (Lee + Collier) from 2021 base to 2025 latest. Comparable-segment cohort. Smooths YoY volatility (especially the 2022 Ian disruption); reads the medium-term demand trajectory.
- **`traffic_aadt_swfl_avg`** — Sum(AADT Ã— Shape_Length) Ã· Sum(Shape_Length) across all FDOT segments in Lee + Collier counties for the latest published year. Shape_Length is the auto-generated geometry length in the layer projection (SHAPE_LENG attribute is unused â€” may be stale after route realignments). 2-county scope matches env-swfl and the master.mts SWFL Intelligence Lake scope; the wider 6-county FDOT extract would let thousands of rural Glades/Hendry/Monroe segments dominate the corridor signal. Length-weighting prevents short freeway off-ramps from dominating an arithmetic mean over thousands of segments.
- **`traffic_aadt_swfl_yoy_pct`** — Percent change in length-weighted AADT (Lee + Collier) between the latest and prior FDOT years, computed over the comparable-segment cohort (segments with non-null AADT in BOTH years matched on roadway + desc_frm + desc_to). Positive = vehicular demand rising; negative = falling. Sensitive to FDOT survey re-routing â€” see post-Ian caveat in brain OUTPUT.
- **`traffic_post_ian_recovery_index`** — Ratio of 2025 length-weighted AADT to 2022 (pre-storm) baseline across the three coastal SWFL counties most impacted by Hurricane Ian: Lee, Collier, Charlotte. >100 = volumes exceed pre-storm; <100 = below pre-storm. DELIBERATELY broader county set than the other traffic-swfl concepts (which are Lee + Collier) â€” the Ian index is about storm geography, not brain scope; Charlotte was in the eye-wall path and must be included for the storm signal to be honest. Glades, Hendry, Monroe excluded â€” Ian's path didn't materially hit them.
- **`traffic_truck_share_swfl_median_pct`** — Median value of TFCTR (truck factor) across Lee + Collier FDOT segments for the latest year. Identifies freight-dense corridors. Complements logistics_inbound_freight_tons_swfl (FAF5 zone-to-zone aggregate) â€” TFCTR says WHERE trucks physically move; FAF5 says WHAT TOTAL VOLUME they carry.

</details>

### `macro` (35)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `laus_collier_unemployment_rate` | Collier County Unemployment Rate | `laus_collier_unemployment_rate`, `collier_unemployment_rate` | ratio | % | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `laus_collier_unemployment_rate_initial_vintage` | Collier County Unemployment Rate — Initial BLS Vintage | `laus_collier_unemployment_rate_initial_vintage`, `collier_unemployment_rate_initial_vintage` | ratio | % | _unbounded_ | `macro-swfl` | `macro` | ✅ active |
| `laus_collier_unemployment_rate_revision_delta` | Collier County LAUS Unemployment Rate BLS Revision Delta | `laus_collier_unemployment_rate_revision_delta`, `collier_unemployment_rate_revision_delta` | ratio | pp | _unbounded_ | `macro-swfl` | `macro` | ✅ active |
| `laus_collier_unemployment_vintage_count` | Collier County LAUS Unemployment — BLS Vintage Count | `laus_collier_unemployment_vintage_count`, `collier_unemployment_vintage_count` | count | vintages | _unbounded_ | `macro-swfl` | `macro` | ✅ active |
| `laus_fl_unemployment_rate` | Florida LAUS Unemployment Rate | `laus_fl_unemployment_rate`, `fl_laus_unemployment_rate` | ratio | % | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `laus_lee_unemployment_rate` | Lee County Unemployment Rate | `laus_lee_unemployment_rate`, `lee_unemployment_rate` | ratio | % | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `laus_lee_unemployment_rate_initial_vintage` | Lee County Unemployment Rate — Initial BLS Vintage | `laus_lee_unemployment_rate_initial_vintage`, `lee_unemployment_rate_initial_vintage` | ratio | % | _unbounded_ | `macro-swfl` | `macro` | ✅ active |
| `laus_lee_unemployment_rate_revision_delta` | Lee County LAUS Unemployment Rate BLS Revision Delta | `laus_lee_unemployment_rate_revision_delta`, `lee_unemployment_rate_revision_delta` | ratio | pp | _unbounded_ | `macro-swfl` | `macro` | ✅ active |
| `laus_lee_unemployment_rate_yoy_delta` | Lee County Unemployment Rate YoY Delta | `laus_lee_unemployment_rate_yoy_delta`, `lee_unemployment_rate_yoy_delta` | ratio | pp | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `laus_lee_unemployment_vintage_count` | Lee County LAUS Unemployment — BLS Vintage Count | `laus_lee_unemployment_vintage_count`, `lee_unemployment_vintage_count` | count | vintages | _unbounded_ | `macro-swfl` | `macro` | ✅ active |
| `macro_cpi_yoy` | US CPI Year-over-Year | `cpi_yoy` | percentage | % | -5 – 25 | `macro-us` | `macro` | ✅ active |
| `macro_fl_estab_count_construction` | Florida Construction Establishments (NAICS 23, Census CBP) | `fl_estab_count_construction` | count | establishments | 0 – 1000000 | `macro-florida`, `master` | `macro` | ✅ active |
| `macro_fl_estab_count_food_service` | Florida Food Service & Accommodation Establishments (NAICS 72, Census CBP) | `fl_estab_count_food_service` | count | establishments | 0 – 1000000 | `macro-florida`, `master` | `macro` | ✅ active |
| `macro_fl_estab_count_healthcare` | Florida Healthcare Establishments (NAICS 62, Census CBP) | `fl_estab_count_healthcare` | count | establishments | 0 – 1000000 | `macro-florida`, `master` | `macro` | ✅ active |
| `macro_fl_estab_count_professional` | Florida Professional Services Establishments (NAICS 54, Census CBP) | `fl_estab_count_professional` | count | establishments | 0 – 1000000 | `macro-florida`, `master` | `macro` | ✅ active |
| `macro_fl_estab_count_retail` | Florida Retail Establishments (NAICS 44-45, Census CBP) | `fl_estab_count_retail` | count | establishments | 0 – 1000000 | `macro-florida`, `master` | `macro` | ✅ active |
| `macro_fl_labor_participation` | Florida Labor Force Participation Rate | `fl_labor_participation` | percentage | % | 40 – 80 | `macro-florida` | `macro`, `demographics` | ✅ active |
| `macro_fl_unemployment` | Florida Unemployment Rate | `fl_unemployment` | percentage | % | 0 – 25 | `macro-florida`, `master` | `macro`, `demographics` | ✅ active |
| `macro_sofr_rate` | SOFR (Secured Overnight Financing Rate) | `sofr_rate` | percentage | % | 0 – 20 | `macro-us`, `master` | `macro`, `finance` | ✅ active |
| `oews_collier_construction_loc_quotient` | Collier County Construction Location Quotient (OEWS) | `collier_construction_loc_quotient` | ratio | x | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_collier_construction_median_hourly_wage` | Collier County Construction Median Hourly Wage (OEWS) | `collier_construction_median_hourly_wage` | currency | $/hr | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_collier_healthcare_employment` | Collier County Healthcare Workforce (OEWS) | `collier_healthcare_employment` | count | workers | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_collier_top_occupation_employment` | Collier County Largest Occupation Group Employment (OEWS) | `collier_top_occupation_employment` | count | workers | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_collier_total_employment_yoy_pct` | Collier County Total Employment YoY Change (OEWS) | `collier_total_employment_yoy_pct` | percent_change | % | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_lee_construction_loc_quotient` | Lee County Construction Location Quotient (OEWS) | `lee_construction_loc_quotient` | ratio | x | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_lee_construction_median_hourly_wage` | Lee County Construction Median Hourly Wage (OEWS) | `lee_construction_median_hourly_wage` | currency | $/hr | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_lee_healthcare_employment` | Lee County Healthcare Workforce (OEWS) | `lee_healthcare_employment` | count | workers | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_lee_top_occupation_employment` | Lee County Largest Occupation Group Employment (OEWS) | `lee_top_occupation_employment` | count | workers | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `oews_lee_total_employment_yoy_pct` | Lee County Total Employment YoY Change (OEWS) | `lee_total_employment_yoy_pct` | percent_change | % | _unbounded_ | `labor-demand-swfl`, `master` | `macro` | ✅ active |
| `qcew_collier_private_avg_wkly_wage` | Collier County Private-Sector Average Weekly Wage | `qcew_collier_private_avg_wkly_wage`, `collier_private_avg_wkly_wage` | currency | USD/week | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `qcew_collier_private_avg_wkly_wage_yoy_pct` | Collier County Private-Sector Average Weekly Wage YoY % | `qcew_collier_private_avg_wkly_wage_yoy_pct`, `collier_private_wage_yoy_pct` | ratio | % | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `qcew_collier_private_employment` | Collier County Private-Sector Employment | `qcew_collier_private_employment`, `collier_private_month3_emplvl` | count | jobs | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `qcew_lee_private_avg_wkly_wage` | Lee County Private-Sector Average Weekly Wage | `qcew_lee_private_avg_wkly_wage`, `lee_private_avg_wkly_wage` | currency | USD/week | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `qcew_lee_private_avg_wkly_wage_yoy_pct` | Lee County Private-Sector Average Weekly Wage YoY % | `qcew_lee_private_avg_wkly_wage_yoy_pct`, `lee_private_wage_yoy_pct` | ratio | % | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |
| `qcew_lee_private_employment` | Lee County Private-Sector Employment | `qcew_lee_private_employment`, `lee_private_month3_emplvl` | count | jobs | _unbounded_ | `macro-swfl`, `master` | `macro` | ✅ active |

<details><summary>Scope notes</summary>

- **`laus_collier_unemployment_rate`** — BLS LAUS monthly unemployment rate for Collier County, FL (not seasonally adjusted). Secondary SWFL county reference.
- **`laus_collier_unemployment_rate_initial_vintage`** — First-issued BLS LAUS vintage of Collier County unemployment rate for a given observation_date. Parallel to laus_lee_unemployment_rate_initial_vintage. Source: ALFRED FRED API series FLCOLL0URN, Tier-1 Parquet lake-tier1/macro/fred_laus_alfred.
- **`laus_collier_unemployment_rate_revision_delta`** — Difference between latest and initial BLS vintage for Collier County unemployment rate (pp). Parallel to laus_lee_unemployment_rate_revision_delta. Source: ALFRED Tier-1 Parquet FLCOLL0URN.
- **`laus_collier_unemployment_vintage_count`** — Number of distinct BLS-issued vintages for a given Collier County observation_date. Parallel to laus_lee_unemployment_vintage_count. Source: ALFRED Tier-1 Parquet FLCOLL0URN.
- **`laus_fl_unemployment_rate`** — BLS LAUS monthly unemployment rate for Florida state (not seasonally adjusted). Distinct from FRED FLUR (same economic concept, different estimation methodology). Used as the denominator for SWFL county gap math.
- **`laus_lee_unemployment_rate`** — BLS LAUS monthly unemployment rate for Lee County, FL (not seasonally adjusted). Primary SWFL county labor market reference. Denominator for gap math against FL state LAUS baseline.
- **`laus_lee_unemployment_rate_initial_vintage`** — First-issued BLS LAUS vintage of Lee County unemployment rate for a given observation_date (realtime_start == observation date). This is the number publicly available at decision time, before subsequent BLS revisions. Source: ALFRED FRED API series FLLEEC7URN, Tier-1 Parquet lake-tier1/macro/fred_laus_alfred. Required for Track-B backward-engine retrodiction and flywheel backtesting.
- **`laus_lee_unemployment_rate_revision_delta`** — Difference between the latest BLS vintage and the initial-vintage reading for Lee County unemployment (latest - initial, pp). Non-zero = BLS revised after first release. Positive = revised upward (worse). Used in flywheel scoring to flag whether a past decision was based on data that subsequently shifted direction. Source: ALFRED Tier-1 Parquet FLLEEC7URN.
- **`laus_lee_unemployment_rate_yoy_delta`** — Year-over-year change in Lee County BLS LAUS unemployment rate, in percentage points. Positive = worsening labor market relative to prior year.
- **`laus_lee_unemployment_vintage_count`** — Number of distinct BLS-issued vintages (realtime windows) for a given Lee County observation_date. One vintage = one BLS issuance, possibly revised from prior. Higher count = number has been scrutinized and revised more times. Data-maturity signal for flywheel decision scoring. Source: ALFRED Tier-1 Parquet FLLEEC7URN.
- **`macro_cpi_yoy`** — Fed's 2% target is the reference anchor. Shelter remains the sticky component through 2026.
- **`macro_fl_estab_count_construction`** — Statewide Census County Business Patterns establishment count for NAICS 23 (Construction). Level metric â€” direction comes from sibling brains (notably sector-credit-swfl charge-off rate for construction).
- **`macro_fl_estab_count_food_service`** — Statewide Census County Business Patterns establishment count for NAICS 72 (Accommodation and Food Services). Level metric â€” direction comes from sibling brains.
- **`macro_fl_estab_count_healthcare`** — Statewide Census County Business Patterns establishment count for NAICS 62 (Health Care and Social Assistance). Level metric â€” direction comes from sibling brains.
- **`macro_fl_estab_count_professional`** — Statewide Census County Business Patterns establishment count for NAICS 54 (Professional, Scientific, and Technical Services). Level metric â€” direction comes from sibling brains.
- **`macro_fl_estab_count_retail`** — Statewide Census County Business Patterns establishment count for NAICS 44-45 (Retail Trade). Level metric â€” direction read via macro-us SOFR via the rising-rates-dominance override, not via the establishment count itself.
- **`macro_fl_labor_participation`** — Climbs against retirement-state demographic gravity. A positive signal on Florida's working-age engagement.
- **`macro_fl_unemployment`** — Primary labor-tightness read for SWFL operators. Tourism and construction absorb new entrants when this stays low.
- **`macro_sofr_rate`** — Floor for floating-rate CRE debt. Rising SOFR triggers rising-rates-dominance override in refinery/constitution/finance.mts (retargeted from macro-swfl to macro-us in the 2026-05-17 macro restructure) when magnitude > 0.6.
- **`oews_collier_construction_loc_quotient`** — BLS OEWS location quotient for Construction & Extraction (SOC 47) in the Naples-Marco Island MSA vs the national average. Secondary SWFL county construction concentration reference.
- **`oews_collier_construction_median_hourly_wage`** — BLS OEWS median hourly wage for Construction & Extraction (SOC 47) in the Naples-Marco Island MSA. Annual May survey. BLS suppression (*) treated as null.
- **`oews_collier_healthcare_employment`** — BLS OEWS combined employment for Healthcare Practitioners & Technical (SOC 29) and Healthcare Support (SOC 31) in the Naples-Marco Island MSA. BLS suppression (*) treated as null — never zeroed.
- **`oews_collier_top_occupation_employment`** — BLS OEWS May survey — total employment in the largest SOC major occupation group for the Naples-Marco Island MSA (Collier County). Annual; released ~April of the following year.
- **`oews_collier_total_employment_yoy_pct`** — Year-over-year percentage change in total BLS OEWS employment across all SOC major groups for the Naples-Marco Island MSA. Null on first load — requires two annual survey years in data_lake.bls_oews_swfl.
- **`oews_lee_construction_loc_quotient`** — BLS OEWS location quotient for Construction & Extraction (SOC 47) in the Cape Coral-Fort Myers MSA vs the national average. Values >1 indicate over-representation. SWFL structural construction concentration benchmark.
- **`oews_lee_construction_median_hourly_wage`** — BLS OEWS median hourly wage for Construction & Extraction (SOC 47) in the Cape Coral-Fort Myers MSA. Annual May survey. BLS suppression (*) treated as null.
- **`oews_lee_healthcare_employment`** — BLS OEWS combined employment for Healthcare Practitioners & Technical (SOC 29) and Healthcare Support (SOC 31) in the Cape Coral-Fort Myers MSA. BLS suppression (*) treated as null — never zeroed.
- **`oews_lee_top_occupation_employment`** — BLS OEWS May survey — total employment in the largest SOC major occupation group for the Cape Coral-Fort Myers MSA (Lee County). Annual; released ~April of the following year.
- **`oews_lee_total_employment_yoy_pct`** — Year-over-year percentage change in total BLS OEWS employment across all SOC major groups for the Cape Coral-Fort Myers MSA. Null on first load — requires two annual survey years in data_lake.bls_oews_swfl.
- **`qcew_collier_private_avg_wkly_wage`** — BLS QCEW private-sector (own_code=5) average weekly wage for Collier County (FIPS 12021). Latest available quarter from data_lake.bls_qcew.
- **`qcew_collier_private_avg_wkly_wage_yoy_pct`** — Year-over-year percentage change in BLS QCEW private-sector average weekly wage for Collier County. Positive = wage growth; negative = wage decline.
- **`qcew_collier_private_employment`** — BLS QCEW private-sector (own_code=5) month-3 employment level for Collier County. Latest available quarter from data_lake.bls_qcew.
- **`qcew_lee_private_avg_wkly_wage`** — BLS QCEW private-sector (own_code=5) average weekly wage for Lee County (FIPS 12071). Latest available quarter from data_lake.bls_qcew.
- **`qcew_lee_private_avg_wkly_wage_yoy_pct`** — Year-over-year percentage change in BLS QCEW private-sector average weekly wage for Lee County. Positive = wage growth; negative = wage decline.
- **`qcew_lee_private_employment`** — BLS QCEW private-sector (own_code=5) month-3 employment level for Lee County. Latest available quarter from data_lake.bls_qcew.

</details>

### `market-signal` (5)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `seller_stress_avg_drop_depth_swfl` | SWFL Median Avg Price Drop Depth | `seller_stress_avg_drop_depth_swfl` | intensive | % | _unbounded_ | `seller-stress-swfl` | `real-estate`, `housing` | ✅ active |
| `seller_stress_cancellation_rate_swfl` | SWFL Median Cancellation Rate | `seller_stress_cancellation_rate_swfl` | intensive | % | _unbounded_ | `seller-stress-swfl` | `real-estate`, `housing` | ✅ active |
| `seller_stress_delistings_rate_swfl` | SWFL Median Delistings Rate | `seller_stress_delistings_rate_swfl` | intensive | % | _unbounded_ | `seller-stress-swfl` | `real-estate`, `housing` | ✅ active |
| `seller_stress_price_drops_rate_swfl` | SWFL Median Price Drop Rate | `seller_stress_price_drops_rate_swfl` | intensive | % | _unbounded_ | `seller-stress-swfl` | `real-estate`, `housing` | ✅ active |
| `seller_stress_score_swfl` | SWFL Seller Stress Score | `seller_stress_score_swfl` | intensive | score (0-100) | _unbounded_ | `seller-stress-swfl` | `real-estate`, `housing` | ✅ active |

<details><summary>Scope notes</summary>

- **`seller_stress_avg_drop_depth_swfl`** — SWFL median average size of price reductions among listings that received a cut in the rolling 3-month period. Lagging indicator per Dallas Fed nowcast (2023): depth amplifies breadth signal but lags it. Higher = more bearish.
- **`seller_stress_cancellation_rate_swfl`** — SWFL median contract cancellation rate (cancellations as % of pending sales) in the rolling 3-month period. Lagging indicator (~30-60 days). Not included in any public composite seller stress score at ZIP grain. Higher = more bearish.
- **`seller_stress_delistings_rate_swfl`** — SWFL median share of active listings that were delisted (taken off market without selling) in the rolling 3-month period. Leading indicator — delistings lead price unlock per Redfin Nov 2025 research. Higher = more bearish.
- **`seller_stress_price_drops_rate_swfl`** — SWFL median share of active listings that received at least one price reduction in the rolling 3-month period. Coincident seller-side signal per Zillow Market Heat Index methodology (2024). Higher = more bearish.
- **`seller_stress_score_swfl`** — Composite seller stress score (0-100) per SWFL region, computed as a z-score-weighted combination of delistings rate, price drop breadth, cancellation rate, avg drop depth, and relisting rate vs the 2019-2021 baseline. Higher = more stress = more bearish.

</details>

### `qualitative` (5)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `qual_confidence` | Deterministic Confidence Score | `confidence` | index | 0â€“1 scale | 0 – 1 | `all` | `all` | ✅ active |
| `qual_magnitude` | Synthesis Magnitude | `magnitude` | index | 0â€“1 scale | 0 – 1 | `all` | `all` | ✅ active |
| `qual_metric_trajectory` | Metric Trajectory | `direction` | enum | — | `rising` / `falling` / `stable` | `all` | `all` | ✅ active |
| `qual_sentiment_direction` | Market Sentiment Direction | `direction` | enum | — | `bullish` / `bearish` / `neutral` / `mixed` | `all` | `all` | ✅ active |
| `qual_trust_tier` | Source Trust Tier | `trust_tier` | integer | — | `1` / `2` / `3` / `4` | `all` | `all` | ✅ active |

<details><summary>Scope notes</summary>

- **`qual_confidence`** — avg(trust_tier_score) Ã— freshness_ratio. Deterministic â€” never produced by an LLM. Formula: refinery/lib/confidence.mts.
- **`qual_magnitude`** — Strength of the brain's direction read. 0 = no signal, 1 = maximum conviction. Computed deterministically from the upstream vote distribution.
- **`qual_metric_trajectory`** — Single-series time-series direction at the metric level. NEVER conflated with qual_sentiment_direction. Answers: which way is this number moving?
- **`qual_sentiment_direction`** — Brain-level qualitative read. Output of synthesis stage. NEVER conflated with qual_metric_trajectory. Answers: where should an operator lean?
- **`qual_trust_tier`** — 1=primary (federal/SEC/NOAA), 2=verified editorial/brain output, 3=secondary aggregator, 4=inferred. Worst (highest number) wins across upstreams. Defined in refinery/types/pack.mts.

</details>

### `real-estate` (103)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cre_absorption_sqft` | Net Absorption (per corridor) | `absorption_sqft` | integer | sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `cre_absorption_sqft_median` | Median Net Absorption (corpus) | `absorption_sqft_median` | integer | sqft | _unbounded_ | `cre-swfl`, `master` | `real-estate` | ✅ active |
| `cre_absorption_sqft_median_county` | Median Net Absorption — per county (Lee / Collier) | _none_ | integer | sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `cre_asking_rent_psf` | Asking Rent PSF NNN (per corridor) | `asking_rent_psf` | currency | USD/sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `cre_asking_rent_psf_median` | Median Asking Rent PSF NNN (corpus) | `asking_rent_psf_median` | currency | USD/sqft | _unbounded_ | `cre-swfl`, `master` | `real-estate` | ✅ active |
| `cre_asking_rent_psf_median_county` | Median Asking Rent PSF NNN — per county (Lee / Collier) | _none_ | currency | USD/sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `cre_cap_rate` | Cap Rate (per corridor) | `cap_rate` | percentage | % | 0 – 20 | `cre-swfl` | `real-estate` | ✅ active |
| `cre_cap_rate_median` | Median Cap Rate (corpus) | `cap_rate_median` | percentage | % | 0 – 20 | `cre-swfl`, `master` | `real-estate` | ✅ active |
| `cre_cap_rate_median_county` | Median Cap Rate — per county (Lee / Collier) | _none_ | percentage | % | 0 – 20 | `cre-swfl` | `real-estate` | ✅ active |
| `cre_corridor_evolution` | Corridor Evolution Stage | `evolution` | enum | — | `growing` / `stable` / `repositioning` / `declining` | `cre-swfl` | `real-estate` | ✅ active |
| `cre_corridor_factor` | Corridor Factor Index | `corridor_factor` | score | index 0-100 | 0 – 100 | `cre-swfl` | `real-estate` | ✅ active |
| `cre_corridor_pulse_signals` | Live Corridor-Pulse Signals | `corridor_pulse_signals_live` | count | signals | 0 – 1000 | `cre-swfl` | `real-estate` | ✅ active |
| `cre_seasonal_index` | Seasonal Index | `seasonal_index` | index | 0â€“1 scale | 0 – 1 | `cre-swfl` | `real-estate` | ✅ active |
| `cre_vacancy_rate` | Vacancy Rate (per corridor) | `vacancy_rate` | percentage | % | 0 – 100 | `cre-swfl` | `real-estate` | ✅ active |
| `cre_vacancy_rate_median` | Median Vacancy Rate (corpus) | `vacancy_rate_median` | percentage | % | 0 – 100 | `cre-swfl`, `master` | `real-estate` | ✅ active |
| `cre_vacancy_rate_median_county` | Median Vacancy Rate — per county (Lee / Collier) | _none_ | percentage | % | 0 – 100 | `cre-swfl` | `real-estate` | ✅ active |
| `fgcu_reri_active_listings_pct_change` | FGCU RERI Active Listings YoY | `fgcu_reri_active_listings_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `real-estate` | ✅ active |
| `fgcu_reri_home_prices_charlotte_pct_change` | FGCU RERI SF Home Prices Charlotte YoY | `fgcu_reri_home_prices_charlotte_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `real-estate` | ✅ active |
| `fgcu_reri_home_prices_collier_pct_change` | FGCU RERI SF Home Prices Collier YoY | `fgcu_reri_home_prices_collier_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `real-estate` | ✅ active |
| `fgcu_reri_home_prices_lee_pct_change` | FGCU RERI SF Home Prices Lee YoY | `fgcu_reri_home_prices_lee_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `real-estate` | ✅ active |
| `fgcu_reri_home_sales_sf_pct_change` | FGCU RERI SF Home Sales YoY | `fgcu_reri_home_sales_sf_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `real-estate` | ✅ active |
| `fgcu_reri_permits_sf_pct_change` | FGCU RERI SF Permits YoY | `fgcu_reri_permits_sf_pct_change` | percent_change | % | _unbounded_ | `fgcu-reri` | `macro`, `real-estate` | ✅ active |
| `fhfa_cape_coral_msa_yoy_pct` | Cape Coral-Fort Myers MSA HPI Year-over-Year Change (FHFA) | `fhfa_cape_coral_msa_yoy_pct` | percent_change | percent | -30 – 30 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `fhfa_fl_state_yoy_pct` | Florida Statewide HPI Year-over-Year Change (FHFA) | `fhfa_fl_state_yoy_pct` | percent_change | percent | -30 – 30 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `fhfa_naples_msa_yoy_pct` | Naples-Marco Island MSA HPI Year-over-Year Change (FHFA) | `fhfa_naples_msa_yoy_pct` | percent_change | percent | -30 – 30 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `home_value_yoy_pct` | ZHVI Home Value YoY % - ZIP Level | `home_value_yoy_pct` | percent_change | % | -50 – 50 | `home-values-swfl`, `investor-zip-swfl`, `master` | `real-estate` | ✅ active |
| `home_value_yoy_pct_regional_median` | ZHVI Home Value YoY % - SWFL Regional Median | `home_value_yoy_pct_regional_median` | percent_change | % | -50 – 50 | `home-values-swfl`, `master` | `real-estate` | ✅ active |
| `home_value_yoy_pct_top_appreciating_zips` | Top-Appreciating SWFL ZIPs by ZHVI Home Value YoY % | `home_value_yoy_pct_top_appreciating_zips` | string | — | _unbounded_ | `home-values-swfl` | `real-estate` | ✅ active |
| `home_value_zhvi` | Zillow Home Value Index (ZHVI) - ZIP-Level Home Value | `home_value_zhvi` | index | USD | 50000 – 20000000 | `home-values-swfl`, `investor-zip-swfl`, `master` | `real-estate` | ✅ active |
| `home_value_zhvi_regional_median` | ZHVI Home Value - SWFL Regional Median | `home_value_zhvi_regional_median` | index | USD | 50000 – 20000000 | `home-values-swfl`, `master` | `real-estate` | ✅ active |
| `home_values_zips_covered` | Count of SWFL ZIPs with ZHVI Coverage | `home_values_zips_covered` | count | count | 0 – 1000 | `home-values-swfl` | `real-estate` | ✅ active |
| `housing_avg_sale_to_list_swfl` | SWFL Regional Median Sale-to-List Ratio | `housing_avg_sale_to_list_swfl`, `swfl_sale_to_list` | ratio | % | _unbounded_ | `housing-swfl`, `master` | `real-estate` | ✅ active |
| `housing_median_dom_swfl` | SWFL Regional Median Days on Market | `housing_median_dom_swfl`, `swfl_median_dom` | days | days | _unbounded_ | `housing-swfl`, `master` | `real-estate` | ✅ active |
| `housing_median_sale_price_swfl` | SWFL Regional Median Sale Price | `housing_median_sale_price_swfl`, `swfl_median_sale_price` | currency | USD | _unbounded_ | `housing-swfl`, `master` | `real-estate` | ✅ active |
| `housing_months_of_supply_swfl` | SWFL Regional Months of Supply | `housing_months_of_supply_swfl` | months | months | _unbounded_ | `housing-swfl`, `master` | `real-estate` | ✅ active |
| `housing_off_market_in_two_weeks_pct_swfl` | SWFL % of Homes Off-Market Within 2 Weeks | `housing_off_market_in_two_weeks_pct_swfl`, `swfl_off_market_two_weeks` | ratio | % | _unbounded_ | `housing-swfl`, `master` | `real-estate` | ✅ active |
| `housing_sold_above_list_pct_swfl` | SWFL % of Homes Sold Above List Price | `housing_sold_above_list_pct_swfl`, `swfl_sold_above_list` | ratio | % | _unbounded_ | `housing-swfl`, `master` | `real-estate` | ✅ active |
| `investor_flood_adj_cap_rate_pct` | Flood-Adjusted Cap Rate % - ZIP Level | `investor_flood_adj_cap_rate_pct` | ratio | % | -10 – 30 | `investor-zip-swfl` | `real-estate`, `environmental` | ✅ active |
| `investor_flood_adj_cap_rate_pct_regional_median` | Flood-Adjusted Cap Rate % - SWFL Regional Median | `investor_flood_adj_cap_rate_pct_regional_median` | ratio | % | -10 – 30 | `investor-zip-swfl` | `real-estate`, `environmental` | ✅ active |
| `investor_gross_rent_yield_pct` | Gross Rent Yield % - ZIP Level (ZORI rent / ZHVI value) | `investor_gross_rent_yield_pct` | ratio | % | 0 – 30 | `investor-zip-swfl` | `real-estate` | ✅ active |
| `investor_gross_rent_yield_pct_regional_median` | Gross Rent Yield % - SWFL Regional Median | `investor_gross_rent_yield_pct_regional_median` | ratio | % | 0 – 30 | `investor-zip-swfl` | `real-estate` | ✅ active |
| `investor_zip_cards_covered` | Count of SWFL Investor ZIP Cards | `investor_zip_cards_covered` | count | count | 0 – 1000 | `investor-zip-swfl` | `real-estate` | ✅ active |
| `investor_zip_cards_with_flood_overlay` | Count of Investor Cards with Flood Overlay | `investor_zip_cards_with_flood_overlay` | count | count | 0 – 1000 | `investor-zip-swfl` | `real-estate`, `environmental` | ✅ active |
| `marketbeat_absorption_sqft` | Net Absorption (MarketBeat/MHS, per place) | _none_ | integer | sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_absorption_sqft_industrial` | Net Absorption — Industrial (MarketBeat/MHS, per place) | _none_ | integer | sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_absorption_sqft_office` | Net Absorption — Office (MarketBeat/MHS, per place) | _none_ | integer | sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_asking_rent_nnn` | Asking Rent NNN (MarketBeat/MHS, per place) | _none_ | currency | USD/sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_asking_rent_nnn_industrial` | Asking Rent NNN — Industrial (MarketBeat/MHS, per place) | _none_ | currency | USD/sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_asking_rent_nnn_office` | Asking Rent NNN — Office (MarketBeat/MHS, per place) | _none_ | currency | USD/sqft | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_vacancy_rate` | Vacancy Rate (MarketBeat/MHS, per place) | `vacancy_rate_marketbeat_swfl` | percentage | % | 0 – 100 | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_vacancy_rate_industrial` | Vacancy Rate — Industrial (MarketBeat/MHS, per place) | _none_ | percentage | % | 0 – 100 | `cre-swfl` | `real-estate` | ✅ active |
| `marketbeat_vacancy_rate_office` | Vacancy Rate — Office (MarketBeat/MHS, per place) | _none_ | percentage | % | 0 – 100 | `cre-swfl` | `real-estate` | ✅ active |
| `median_dom_yoy_days` | Median Days on Market YoY Change | `median_dom_yoy_days` | days | days | _unbounded_ | `housing-swfl` | `real_estate` | ✅ active |
| `median_sale_price_yoy_pct` | Median Sale Price YoY Change | `median_sale_price_yoy_pct` | percent_change | % | _unbounded_ | `housing-swfl` | `real_estate` | ✅ active |
| `permits_collier_corridor_z` | Collier permits per-corridor z-score (parameterized) | _none_ | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_collier_county_weighted_avg_corridor_z` | Collier County weighted average corridor z-score (permits) | `permits_collier_county_weighted_avg_corridor_z` | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_collier_saturation_index` | Collier permits saturation index | `permits_collier_saturation_index` | percentage | share | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_collier_zip_z` | Collier permits per-ZIP z-score (parameterized) | _none_ | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_lee_capital_flow_z` | Lee permits capital-flow z (cre-swfl thin-pipe read) | `permits_lee_capital_flow_z` | z_score | z-score | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `permits_lee_corridor_z` | Lee permits per-corridor z-score (parameterized) | _none_ | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_lee_county_weighted_avg_corridor_z` | Lee County weighted average corridor z-score (permits) | `permits_lee_county_weighted_avg_corridor_z` | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_lee_saturation_index` | Lee permits saturation index | `permits_lee_saturation_index` | percentage | share | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_lee_saturation_signal` | Lee permits saturation signal (cre-swfl thin-pipe read) | `permits_lee_saturation_signal` | percentage | share | _unbounded_ | `cre-swfl` | `real-estate` | ✅ active |
| `permits_lee_top_heating_cooling` | Lee permits top heating/cooling corridors (rank-ordered categorical) | `permits_lee_top_heating_commercial_alteration`, `permits_lee_top_heating_commercial_new`, `permits_lee_top_cooling_commercial_alteration`, `permits_lee_top_cooling_commercial_new` | categorical | corridor_id_list | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_lee_zip_z` | Lee permits per-ZIP z-score (parameterized) | _none_ | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_swfl_county_weighted_avg_corridor_z` | SWFL weighted average corridor z-score (Lee + Collier permits rollup) | `permits_swfl_county_weighted_avg_corridor_z` | ratio | z-score | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_swfl_saturation_index` | SWFL permits saturation index (Lee + Collier rollup) | `permits_swfl_saturation_index` | percentage | share | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `permits_swfl_top_heating_cooling` | SWFL permits top heating/cooling corridors (Lee + Collier rank-ordered categorical) | `permits_swfl_top_heating_commercial_alteration`, `permits_swfl_top_heating_commercial_new`, `permits_swfl_top_cooling_commercial_alteration`, `permits_swfl_top_cooling_commercial_new` | categorical | corridor_id_list | _unbounded_ | `permits-swfl` | `real-estate` | ✅ active |
| `properties_collier_homes_sold_per_year` | Collier County Residential Homes Sold (Current Year, Redfin) | `collier_homes_sold_per_year` | count | home sales | 0 – 100000 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `properties_collier_homes_sold_zscore` | Collier County Homes-Sold Z-Score (Current Year vs Trailing 3yr Baseline) | `collier_homes_sold_zscore` | zscore | standard deviations | -10 – 10 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `properties_collier_median_sale_price_yoy` | Collier County Median Sale Price Year-over-Year (Redfin) | `collier_median_sale_price_yoy` | percent_change | percent | -30 – 30 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `properties_collier_months_of_supply` | Collier County Months of Supply (Redfin) | `collier_months_of_supply` | rate | months | 0 – 36 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `properties_collier_soh_gap_median_pct` | Collier County Save-Our-Homes Gap Median (% Homestead Just Value Suppressed) | `collier_soh_gap_median_pct` | percentage | % | 0 – 80 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `properties_collier_total_parcels` | Collier County Total Parcels (FDOR Cadastral Snapshot) | `collier_total_parcels` | count | parcels | 0 – 1000000 | `properties-collier-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_homes_sold_per_year` | Lee County Residential Homes Sold (Current Year, Redfin) | `lee_homes_sold_per_year` | count | home sales | 0 – 100000 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_homes_sold_zscore` | Lee County Homes-Sold Z-Score (Current Year vs Trailing 3yr Baseline, Redfin) | `lee_homes_sold_zscore` | zscore | z-score | -5 – 5 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_median_sale_price_yoy` | Lee County Median Sale Price Year-over-Year (Redfin) | `lee_median_sale_price_yoy` | percent_change | percent | -50 – 100 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_months_of_supply` | Lee County Months of Supply (Redfin) | `lee_months_of_supply` | rate | months | 0 – 36 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_sales_velocity_per_1k` | Lee County Qualified Sales Velocity (Per 1,000 Parcels, Current Year) | `sales_velocity_per_1k` | rate | qualified sales per 1,000 parcels | 0 – 200 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_sales_velocity_zscore` | Lee County Sales-Velocity Z-Score (Current Year vs Trailing 3yr Baseline) | `sales_velocity_zscore` | zscore | standard deviations | -10 – 10 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_soh_gap_median_pct` | Lee County Save-Our-Homes Gap Median (% Just Value Suppressed) | `soh_gap_median_pct` | percentage | % | 0 – 80 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `properties_lee_total_parcels` | Lee County Total Parcels (Snapshot Row Count) | `total_parcels` | count | parcels | 0 – 1000000 | `properties-lee-value`, `master` | `real-estate` | ✅ active |
| `rental_rent_index_zori` | Zillow Observed Rent Index (ZORI) â€” ZIP-Level Monthly Rent | `rental_rent_index_zori` | index | USD/month | 500 – 15000 | `rentals-swfl`, `master` | `real-estate` | ✅ active |
| `rental_rent_index_zori_regional_median` | ZORI Rent Index â€” SWFL Regional Median | `rental_rent_index_zori_regional_median` | index | USD/month | 500 – 10000 | `rentals-swfl`, `master` | `real-estate` | ✅ active |
| `rental_rent_mom_pct` | ZORI Rent MoM % â€” ZIP Level | `rental_rent_mom_pct` | percent_change | % | -20 – 20 | `rentals-swfl` | `real-estate` | ✅ active |
| `rental_rent_yoy_pct` | ZORI Rent YoY % â€” ZIP Level | `rental_rent_yoy_pct` | percent_change | % | -50 – 50 | `rentals-swfl`, `master` | `real-estate` | ✅ active |
| `rental_rent_yoy_pct_regional_median` | ZORI Rent YoY % â€” SWFL Regional Median | `rental_rent_yoy_pct_regional_median` | percent_change | % | -50 – 50 | `rentals-swfl`, `master` | `real-estate` | ✅ active |
| `rental_rent_yoy_pct_top_heating_zips` | Top-Heating SWFL ZIPs by ZORI Rent YoY % | `rental_rent_yoy_pct_top_heating_zips` | string | — | _unbounded_ | `rentals-swfl` | `real-estate` | ✅ active |
| `rentals_swfl_zips_covered` | Count of SWFL ZIPs with ZORI Coverage | `rentals_swfl_zips_covered` | count | count | 0 – 1000 | `rentals-swfl` | `real-estate` | ✅ active |
| `safety_property_crime_per_1k_collier` | Collier County Property Crime Rate | `safety_property_crime_per_1k_collier` | rate | per 1,000 population | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_property_crime_per_1k_lee` | Lee County Property Crime Rate | `safety_property_crime_per_1k_lee` | rate | per 1,000 population | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_property_crime_per_1k_swfl` | SWFL Property Crime Rate | `safety_property_crime_per_1k_swfl` | rate | per 1,000 population | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_property_crime_yoy_pct_collier` | Collier County Property Crime Rate YoY | `safety_property_crime_yoy_pct_collier` | percent_change | % | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_property_crime_yoy_pct_lee` | Lee County Property Crime Rate YoY | `safety_property_crime_yoy_pct_lee` | percent_change | % | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_property_crime_yoy_pct_swfl` | SWFL Property Crime Rate YoY | `safety_property_crime_yoy_pct_swfl` | percent_change | % | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_total_property_crimes_collier` | Collier County Total Property Crime Incidents | `safety_total_property_crimes_collier` | count | incidents | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `safety_total_property_crimes_lee` | Lee County Total Property Crime Incidents | `safety_total_property_crimes_lee` | count | incidents | _unbounded_ | `safety-swfl`, `master` | `real-estate` | ✅ active |
| `tier_bottom_yoy_pct_swfl` | Starter-Tier (Bottom) ZHVI YoY % - SWFL Regional Median | `tier_bottom_yoy_pct_swfl` | percent_change | % | -50 – 50 | `tier-divergence-swfl` | `real-estate` | ✅ active |
| `tier_kshape_intensity_swfl` | K-Shape Intensity Score — SWFL (0–100) | `tier_kshape_intensity_swfl` | intensive | percent | 0 – 100 | `tier-divergence-swfl` | `real-estate` | ✅ active |
| `tier_kshape_zip_count_swfl` | Count of SWFL ZIPs in K-Shape (Luxury Holding, Starter Falling) | `tier_kshape_zip_count_swfl` | count | count | 0 – 130 | `tier-divergence-swfl` | `real-estate` | ✅ active |
| `tier_spread_ratio_swfl` | Tier Spread (Luxury / Starter) - SWFL Regional Median | `tier_spread_ratio_swfl` | ratio | x | 1 – 30 | `tier-divergence-swfl` | `real-estate` | ✅ active |
| `tier_spread_yoy_pct_swfl` | Tier Spread YoY % - SWFL Regional Median | `tier_spread_yoy_pct_swfl` | percent_change | % | -50 – 50 | `tier-divergence-swfl` | `real-estate` | ✅ active |
| `tier_top_yoy_pct_swfl` | Luxury-Tier (Top) ZHVI YoY % - SWFL Regional Median | `tier_top_yoy_pct_swfl` | percent_change | % | -50 – 50 | `tier-divergence-swfl` | `real-estate` | ✅ active |

<details><summary>Scope notes</summary>

- **`cre_absorption_sqft`** — Net absorption in square feet over the metrics_period. Negative values are valid (give-back). Bullish polarity: rising = stronger leasing velocity.
- **`cre_absorption_sqft_median_county`** — Median net absorption in sqft computed independently per county. Slug form: absorption_sqft_median_{lee|collier}.
- **`cre_asking_rent_psf`** — Average asking rent, NNN, per square foot. Bullish polarity: rising = pricing power â€” BUT rising rent + rising vacancy = distress (asking-price stickiness, not real pricing power). Polarity is enforced per metric in the cre-swfl voteCorridor.
- **`cre_asking_rent_psf_median_county`** — Median asking rent (NNN, PSF) computed independently per county. Slug form: asking_rent_psf_median_{lee|collier}.
- **`cre_cap_rate`** — Point-in-time corridor-level cap rate. Trajectory (falling/stable/rising) signals landlord vs tenant market direction.
- **`cre_cap_rate_median`** — Median across all corridors with reported metrics in the current period. A falling median is the primary bullish signal in the cre-swfl pack.
- **`cre_cap_rate_median_county`** — Median cap rate computed independently for Lee County corridors and Collier County corridors. County is a code-derived partition (cre-source.mts CITY_TO_COUNTY) — not a DB column. Slug form: cap_rate_median_{lee|collier}. Denominator is that county's corridor count, not the SWFL total.
- **`cre_corridor_evolution`** — Qualitative lifecycle stage of a corridor. Ordered by operator-friendliness descending; see cre_corridor_evolution_stages in ordered_collections.
- **`cre_corridor_factor`** — Composite 0–100 index ranking SWFL CRE corridors on four metrics (cap rate, vacancy, absorption, asking rent) via within-cohort percentile-rank with equal weights. 67–100 = strong, 34–66 = neutral, 0–33 = soft. Corridor-health/landlord lens by default; buyer/yield lens available via config. Higher is bullish. Weights and band thresholds are empirical placeholders pending §8.2 backtest (2022–2024 corridor outcomes).
- **`cre_corridor_pulse_signals`** — Count of live corridor-pulse current-events signals (TTL-bounded news/lease/closure items) informing the cre-swfl read this period. Emitted only when count > 0; master gates its 'ask about a specific area' grain-boundary route on this contribution count, not on cre merely being wired. No inherent direction polarity — a signal can be bullish (new lease/opening) or bearish (closure/termination), so the concept is intentionally ungradeable.
- **`cre_seasonal_index`** — 0 = no seasonality, 1 = extreme seasonality. Corridor-level only; not aggregated to corpus median.
- **`cre_vacancy_rate_median_county`** — Median vacancy rate computed independently per county. Slug form: vacancy_rate_median_{lee|collier}. Collier is small-N (Naples-area corridors only) — the denominator label discloses corridor count so it cannot masquerade as a deep-sample read.
- **`fgcu_reri_active_listings_pct_change`** — Year-over-year percentage change in SWFL residential active listings per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_home_prices_charlotte_pct_change`** — Year-over-year percentage change in Charlotte County single-family median home prices per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_home_prices_collier_pct_change`** — Year-over-year percentage change in Collier County single-family median home prices per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_home_prices_lee_pct_change`** — Year-over-year percentage change in Lee County single-family median home prices per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_home_sales_sf_pct_change`** — Year-over-year percentage change in SWFL single-family home sales per FGCU RERI monthly report. ~2-month data lag.
- **`fgcu_reri_permits_sf_pct_change`** — Year-over-year percentage change in SWFL single-family building permits per FGCU RERI monthly report. ~2-month data lag.
- **`fhfa_cape_coral_msa_yoy_pct`** — Year-over-year percent change in FHFA House Price Index (traditional, purchase-only, quarterly, NSA) for the Cape Coral-Fort Myers FL MSA â€” the Lee County price-level proxy. Computed from data_lake.fhfa_hpi: (latest_quarter_index - same_quarter_prior_year_index) / same_quarter_prior_year_index Ã— 100. Negative = falling prices; positive = rising. Exogenous signal in properties-lee-value; contrasted against LeePA sales-velocity z-score.
- **`fhfa_fl_state_yoy_pct`** — Year-over-year percent change in FHFA House Price Index (traditional, purchase-only, quarterly, NSA) for the state of Florida (place_id='FL'). Computed from data_lake.fhfa_hpi. State baseline for comparison against Cape Coral MSA divergence. Negative = statewide prices falling; positive = rising.
- **`fhfa_naples_msa_yoy_pct`** — Year-over-year percent change in FHFA House Price Index (traditional, purchase-only, quarterly, NSA) for the Naples-Marco Island FL MSA — the Collier County price-level proxy. Computed from data_lake.fhfa_hpi: (latest_quarter_index - same_quarter_prior_year_index) / same_quarter_prior_year_index × 100. Negative = falling prices; positive = rising. Exogenous signal in properties-collier-value; contrasted against Redfin homes-sold velocity z-score.
- **`home_value_yoy_pct`** — Year-over-year percent change in home_value_zhvi for a given ZIP, computed deterministically in TypeScript by home-values-swfl as (value_t / value_t_minus_12 - 1) * 100. The slug template home_value_yoy_pct_zip_{ZIP} is matched via refinery/vocab/patterns.mts.
- **`home_value_yoy_pct_regional_median`** — Median YoY % across SWFL ZIPs - the headline signal that drives home-values-swfl direction polarity per the locked band table (bearish < 0; neutral [0,3); bullish [3,10]; bullish with caveat (10,15]; neutral with caveat > 15).
- **`home_value_yoy_pct_top_appreciating_zips`** — Comma-joined list of the top-N (default 3) SWFL ZIPs by home_value_yoy_pct at the latest period_end. Categorical metric - value is a label string, not a number.
- **`home_value_zhvi`** — Zillow Home Value Index - seasonally-adjusted middle-tier (0.33-0.67) all-homes (SFR + Condo) value for a given ZIP and month. Emitted by home-values-swfl as one metric per top-N ZIP using the slug template home_value_zhvi_zip_{ZIP}; templated slugs resolve through refinery/vocab/patterns.mts.
- **`home_value_zhvi_regional_median`** — Median of home_value_zhvi across all SWFL ZIPs for the latest period_end. Deterministic; computed in TS by home-values-swfl.
- **`home_values_zips_covered`** — Count of distinct SWFL ZIPs present in the home-values-swfl corpus for the current build. Sentinel for corpus thinness - a low count fires a 'regional median is thin' caveat.
- **`housing_avg_sale_to_list_swfl`** — Redfin ZIP-level median sale price Ã· list price across SWFL MSAs, expressed as percent. >100% = homes selling above ask on average.
- **`housing_median_dom_swfl`** — Redfin ZIP-level median days from list to contract across SWFL MSAs. Falling DOM = heating market; rising DOM = cooling market.
- **`housing_median_sale_price_swfl`** — Redfin ZIP-level median residential sale price across SWFL MSAs (All Residential). Rolling 90-day window per Redfin convention.
- **`housing_months_of_supply_swfl`** — Active inventory divided by the trailing monthly sales pace across SWFL MSAs. Under ~3 months favors sellers; over ~6 favors buyers. Derived — Redfin does not publish months of supply at ZIP grain.
- **`housing_off_market_in_two_weeks_pct_swfl`** — Redfin ZIP-level median fraction of homes that went off-market within 14 days of listing across SWFL MSAs. High values = hot market with fast absorption.
- **`housing_sold_above_list_pct_swfl`** — Redfin ZIP-level median fraction of homes that sold above their list price across SWFL MSAs, expressed as percent.
- **`investor_flood_adj_cap_rate_pct`** — Gross rent yield minus the env-swfl flood cap-rate adjustment, computed by investor-zip-swfl as investor_gross_rent_yield_pct - (swfl_zip_{ZIP}_flood_cap_rate_adj_bps / 100). Populated only for ZIPs env-swfl surfaces (its top-AAL ZIPs); null elsewhere. Templated slug investor_flood_adj_cap_rate_pct_zip_{ZIP} resolves via refinery/vocab/patterns.mts.
- **`investor_flood_adj_cap_rate_pct_regional_median`** — Median of investor_flood_adj_cap_rate_pct across the env-surfaced (flood-overlay) SWFL investor cards. Deterministic; computed in TS by investor-zip-swfl.
- **`investor_gross_rent_yield_pct`** — Gross annual rent yield for a ZIP, computed deterministically by investor-zip-swfl as (ZORI rent_index x 12 / ZHVI home_value) x 100. Null when value or rent is absent (no divide-by-zero). Templated slug investor_gross_rent_yield_pct_zip_{ZIP} resolves via refinery/vocab/patterns.mts.
- **`investor_gross_rent_yield_pct_regional_median`** — Median of investor_gross_rent_yield_pct across all in-scope SWFL investor cards for the latest period. Deterministic; computed in TS by investor-zip-swfl.
- **`investor_zip_cards_covered`** — Count of in-scope SWFL ZIPs with an investor card (value + rent present) in the current build.
- **`investor_zip_cards_with_flood_overlay`** — Count of investor cards that also carry the flood-adjusted cap rate - i.e. ZIPs env-swfl surfaces. Sentinel exposing the moat-metric coverage gap (flood overlay reaches only env's top-AAL ZIPs, not all value+rent ZIPs).
- **`marketbeat_absorption_sqft`** — Per-place net absorption from the MarketBeat/MHS submarket feed. Negative values are valid (give-back). Slug tail is the canonical place (places-swfl.mts).
- **`marketbeat_absorption_sqft_industrial`** — Per-place INDUSTRIAL net absorption from the MarketBeat/MHS feed. Negative values are valid (give-back). Distinct sector — surfaced separately (2026-06-08), never blended. Slug tail is the canonical place plus an `_industrial` suffix.
- **`marketbeat_absorption_sqft_office`** — Per-place OFFICE net absorption from the MarketBeat/MHS feed. Negative values are valid (give-back). Distinct sector — surfaced separately (2026-06-08), never blended. Slug tail is the canonical place plus an `_office` suffix.
- **`marketbeat_asking_rent_nnn`** — Per-place NNN asking rent from the MarketBeat/MHS submarket feed. Slug tail is the canonical place (places-swfl.mts).
- **`marketbeat_asking_rent_nnn_industrial`** — Per-place INDUSTRIAL NNN asking rent from the MarketBeat/MHS feed. Distinct sector — surfaced separately (2026-06-08), never blended across sectors. Slug tail is the canonical place plus an `_industrial` suffix.
- **`marketbeat_asking_rent_nnn_office`** — Per-place OFFICE NNN asking rent from the MarketBeat/MHS feed. Distinct sector — surfaced separately (2026-06-08), never blended across sectors. Slug tail is the canonical place plus an `_office` suffix.
- **`marketbeat_vacancy_rate`** — Per-place RETAIL CRE vacancy from the MarketBeat/MHS submarket feed (retail is the bare, default sector — industrial/office carry an explicit `_industrial`/`_office` suffix and resolve to their own concepts, which are listed BEFORE this one so the sector-specific globs win first-match). Slug tail is the canonical place (places-swfl.mts) — a rollup place (…_naples) or a sub-area (…_east_naples). The `**` pattern covers both single- and multi-word place tails.
- **`marketbeat_vacancy_rate_industrial`** — Per-place INDUSTRIAL CRE vacancy from the MarketBeat/MHS feed. A distinct sector from retail — surfaced separately (per-sector reversal 2026-06-08), NEVER blended with retail or office. Slug tail is the canonical place (places-swfl.mts; may carry an `_area` parent-rollup segment) plus an `_industrial` sector suffix. Listed before the bare `marketbeat_vacancy_rate` retail pattern so the sector-specific glob resolves first.
- **`marketbeat_vacancy_rate_office`** — Per-place OFFICE CRE vacancy from the MarketBeat/MHS feed. A distinct sector from retail/industrial — surfaced separately (per-sector reversal 2026-06-08), NEVER blended. Slug tail is the canonical place (places-swfl.mts; may carry an `_area` parent-rollup segment) plus an `_office` sector suffix.
- **`permits_collier_corridor_z`** — Per-(Naples corridor x bucket) rate-normalized z-score. Child slugs match permits_collier_corridor_{corridor_id}_{bucket}_z.
- **`permits_collier_county_weighted_avg_corridor_z`** — Corridor-weighted mean z-score of rate-normalized permit issuance across Collier-county (Naples) corridors only. Current 90d vs trailing 13 x 28d windows. Carries a load-bearing short-baseline caveat through ~Q4 2026.
- **`permits_collier_saturation_index`** — Share (0.0-1.0) of Collier (Naples) corridors with z >= +2 in commercial_new or commercial_alteration buckets.
- **`permits_collier_zip_z`** — Per-(ZIP x bucket) rate-normalized z-score for Collier County permits. Child slugs match permits_collier_zip_{zip5}_{bucket}_z. Added by J2 (site zip_code column + backfill on collier_building_permits).
- **`permits_lee_capital_flow_z`** — cre-swfl-emitted county-wide permit-flow direction signal, sourced from permits-swfl's permits_lee_county_weighted_avg_corridor_z scalar via thin-pipe DAG edge.
- **`permits_lee_corridor_z`** — Per-(corridor x bucket) rate-normalized z-score. Child slugs match permits_lee_corridor_{corridor_id}_{bucket}_z.
- **`permits_lee_county_weighted_avg_corridor_z`** — Corridor-weighted mean z-score of rate-normalized permit issuance across non-noise buckets. Current 90d vs trailing 13 x 28d windows.
- **`permits_lee_saturation_index`** — Share (0.0-1.0) of corridors with z >= +2 in commercial_new or commercial_alteration buckets. Used by cre-swfl to threshold the contrarian late-mover read.
- **`permits_lee_saturation_signal`** — cre-swfl-emitted contrarian saturation read derived from permits-swfl's saturation_index when it crosses the 0.4 threshold. Surfaces the late-mover-into-a-crowd framing as a metric on cre-swfl's OUTPUT.
- **`permits_lee_top_heating_cooling`** — Comma-joined rank-ordered list of corridor IDs by current 90d z within a headline bucket. Emitted as categorical key_metrics.
- **`permits_lee_zip_z`** — Per-(ZIP x bucket) rate-normalized z-score. Child slugs match permits_lee_zip_{zip5}_{bucket}_z.
- **`permits_swfl_county_weighted_avg_corridor_z`** — Corridor-weighted mean z-score of rate-normalized permit issuance across all SWFL corridors (Lee + Collier), non-noise buckets. Current 90d vs trailing 13 x 28d windows.
- **`permits_swfl_saturation_index`** — Share (0.0-1.0) of SWFL corridors (Lee + Collier) with z >= +2 in commercial_new or commercial_alteration buckets.
- **`permits_swfl_top_heating_cooling`** — Comma-joined rank-ordered list of corridor IDs (Lee + Collier) by current 90d z within a headline bucket. Emitted alongside the Lee-scoped permits_lee_top_*_z metrics during the additive-emission window (cre-swfl still reads the Lee version).
- **`properties_collier_homes_sold_per_year`** — Count of Redfin-recorded 'All Residential' closed sales in Collier County for the most recent COMPLETE calendar year (year-1 relative to today), summed from monthly HOMES_SOLD. Recent years are revised upward as late-recorded sales land; treat the latest year as a soft floor.
- **`properties_collier_homes_sold_zscore`** — Direction signal for properties-collier-value. Bullish if z >= +1.0, bearish if z <= -1.0. Derived from Redfin Data Center 'All Residential' monthly HOMES_SOLD summed to calendar years, current complete year (year-1) vs trailing 3yr mean. Market-grain (Redfin closed sales), NOT parcel-grain — not directly comparable to the Lee qualified-sale velocity; compare direction, not raw counts.
- **`properties_collier_median_sale_price_yoy`** — Year-over-year percent change in Redfin median sale price ('All Residential') for Collier County at the latest published period. Positive = rising prices; negative = falling. Level/price metric, complementary to the homes-sold velocity direction signal.
- **`properties_collier_months_of_supply`** — Redfin months-of-supply for Collier County ('All Residential') at the latest published period: inventory divided by the monthly sales pace. Lower = tighter, seller-favorable (lower_is_bullish); higher = more buyer leverage. Does NOT drive the leaf brain's direction (that is the homes-sold z-score; the pack emits MOS with direction 'stable'), but is independently gradeable with the same polarity as properties_lee_months_of_supply — identical Redfin All-Residential metric/units, so the polarity is verified on Collier's own semantics, not mirrored. Grade block added 2026-06-13 for Lee/Collier pa…
- **`properties_collier_soh_gap_median_pct`** — Median (jv_hmstd - av_hmstd)/jv_hmstd * 100 across homesteaded Collier parcels (jv_hmstd>0) from the FDOR Statewide Cadastral (CO_NO=21). The homestead-portion Save-Our-Homes cap differential. High = long-tenured ownership; low = recent turnover. Textbook SOH measure; Lee's properties_lee_soh_gap_median_pct uses whole-parcel just-vs-taxable, so the two are directionally comparable, not numerically identical.
- **`properties_collier_total_parcels`** — Row count of data_lake.collier_parcels (FDOR Statewide Cadastral, Collier CO_NO=21). The parcel-grain base enabling the Save-Our-Homes gap + future per-ZIP drill — the parity with the Lee parcel brain that Redfin's county aggregates can't provide.
- **`properties_lee_homes_sold_per_year`** — Count of Redfin-recorded 'All Residential' closed sales in Lee County for the most recent complete calendar year (year-1 relative to today), summed from monthly HOMES_SOLD. Recent years are revised upward as late-recorded sales land; treat the latest year as a soft floor. Level metric — no grade block.
- **`properties_lee_homes_sold_zscore`** — Direction signal for properties-lee-value (market-grain). Bullish if z >= +1.0, bearish if z <= -1.0. Derived from Redfin Data Center 'All Residential' monthly HOMES_SOLD summed to calendar years, current complete year (year-1) vs trailing 3yr mean. Market-grain Redfin closed sales — NOT parcel-grain LeePA qualified-sale velocity (sales_velocity_zscore); compare direction, not raw counts.
- **`properties_lee_median_sale_price_yoy`** — Year-over-year percent change in Redfin median sale price ('All Residential') for Lee County at the latest published period. Source is Redfin market tracker — NOT LeePA (LeePA last_sale_amount is 100% null). Positive = rising prices; negative = falling. Level/price metric, complementary to the homes-sold velocity direction signal.
- **`properties_lee_months_of_supply`** — Redfin months-of-supply for Lee County ('All Residential') at the latest published period: inventory divided by the monthly sales pace. Lower = tighter, seller-favorable (lower_is_bullish); higher = more buyer leverage. Level metric.
- **`properties_lee_sales_velocity_per_1k`** — Count of LeePA-recorded qualified sales for the most recent COMPLETE calendar year (year-1 relative to today), divided by total parcels Ã— 1000. Qualified sales exclude inheritance, divorce, and non-arms-length transfers.
- **`properties_lee_sales_velocity_zscore`** — Direction signal for properties-lee-value. Bullish if z â‰¥ +1.0, bearish if z â‰¤ âˆ’1.0. Baseline derived from each parcel's LATEST qualified sale, so re-sales overwrite earlier-year buckets â€” current-year z is biased UPWARD; treat marginal bullish reads as suggestive, not confirmatory.
- **`properties_lee_soh_gap_median_pct`** — Median (just_value âˆ’ taxable_value) / just_value Ã— 100 across parcels where cap_difference > 0 (actively benefiting from the Save-Our-Homes cap). Reads as a level metric describing how much of the tax base is locked behind the homestead cap. High = long-tenured ownership; low = recent turnover or non-homestead.
- **`properties_lee_total_parcels`** — Row count of data_lake.leepa_parcels (Lee County Property Appraiser parcel snapshot, layers 9+10+12 joined on FOLIOID). Single source of truth for the velocity denominator.
- **`rental_rent_index_zori`** — Zillow Observed Rent Index â€” seasonally-adjusted monthly composite methodology approximating typical monthly rent (SFR + Condo + Multifamily) for a given ZIP and month. Emitted by rentals-swfl as one metric per top-N ZIP using the slug template rental_rent_index_zori_zip_{ZIP}; the templated slugs resolve through refinery/vocab/patterns.mts.
- **`rental_rent_index_zori_regional_median`** — Median of rental_rent_index_zori across all SWFL ZIPs for the latest period_end. Deterministic; computed in TS by rentals-swfl.
- **`rental_rent_mom_pct`** — Month-over-month percent change in rental_rent_index_zori for a given ZIP. Templated slug rental_rent_mom_pct_zip_{ZIP} matched via refinery/vocab/patterns.mts.
- **`rental_rent_yoy_pct`** — Year-over-year percent change in the rental_rent_index_zori for a given ZIP, computed deterministically in TypeScript by rentals-swfl as (rent_index_t / rent_index_t_minus_12 - 1) * 100. The slug template rental_rent_yoy_pct_zip_{ZIP} is matched via refinery/vocab/patterns.mts.
- **`rental_rent_yoy_pct_regional_median`** — Median YoY % across SWFL ZIPs â€” the headline signal that drives rentals-swfl direction polarity per the locked band table (bearish < 0; neutral [0,2); bullish [2,6]; bullish with caveat (6,10]; neutral with caveat > 10).
- **`rental_rent_yoy_pct_top_heating_zips`** — Comma-joined list of the top-N (default 3) SWFL ZIPs by rental_rent_yoy_pct at the latest period_end. Categorical metric â€” value is a label string, not a number.
- **`rentals_swfl_zips_covered`** — Count of distinct SWFL ZIPs present in the rentals-swfl corpus for the current build. Sentinel for corpus thinness â€” a low count fires a 'regional median is thin' caveat.
- **`safety_property_crime_per_1k_collier`** — Collier County property crime offenses per 1,000 residents, FBI Crime Data Explorer NIBRS (Sheriff + Marco Island footprint; Naples PD does not report). Annual.
- **`safety_property_crime_per_1k_lee`** — Lee County property crime offenses per 1,000 residents, FBI Crime Data Explorer NIBRS, coverage-matched to reporting agencies. Annual; a falling rate is bullish for the investment environment.
- **`safety_property_crime_per_1k_swfl`** — Population-weighted Lee + Collier property crime offenses per 1,000 residents, FBI Crime Data Explorer NIBRS. Annual; a falling rate is bullish.
- **`safety_property_crime_yoy_pct_collier`** — Year-over-year percent change in the Collier County property crime rate. Suppressed to neutral when the NIBRS reporting footprint shifts >10%.
- **`safety_property_crime_yoy_pct_lee`** — Year-over-year percent change in the Lee County property crime rate. Suppressed to neutral when the NIBRS reporting footprint shifts >10%.
- **`safety_property_crime_yoy_pct_swfl`** — Year-over-year percent change in the SWFL population-weighted property crime rate. Negative is bullish (falling crime).
- **`safety_total_property_crimes_collier`** — Total property crime incidents reported in Collier County, FBI Crime Data Explorer NIBRS, latest year. Raw count behind the per-1k rate.
- **`safety_total_property_crimes_lee`** — Total property crime incidents reported in Lee County, FBI Crime Data Explorer NIBRS, latest year. Raw count behind the per-1k rate.
- **`tier_bottom_yoy_pct_swfl`** — Year-over-year % change in the bottom-tier (starter, 0.0-0.33 percentile) Zillow ZHVI, regional median across both-tier SWFL ZIPs. A FALLING starter tier is BEARISH (higher_is_bullish). Bearish co-driver with the spread. Computed deterministically by tier-divergence-swfl.
- **`tier_kshape_intensity_swfl`** — Normalized K-shape intensity: (SWFL both-tier ZIPs with luxury YoY >= 0 AND starter YoY < 0) / total both-tier ZIPs × 100. 0 = no market fracturing; 100 = every ZIP in full K-shape. lower_is_bullish. Direction emits 'stable' as explicit fallback — source view lacks prior-period K-shape count; extend tier_divergence_zip_latest for MoM direction once K-shape activates. Computed by tier-divergence-swfl.
- **`tier_kshape_zip_count_swfl`** — Count of SWFL ZIPs in a K-shape - luxury tier YoY >= 0 while starter tier YoY < 0 (luxury holding, starter falling) - of the ~107 both-tier ZIPs. MORE K-shape ZIPs = MORE fracturing = bearish (lower_is_bullish). Breakpoints at 0 are natural. Computed by tier-divergence-swfl.
- **`tier_spread_ratio_swfl`** — Regional median of (top-tier / bottom-tier) Zillow ZHVI per SWFL ZIP - the luxury-to-starter price multiple (e.g. 2.5x). Level metric, no standalone bullish/bearish polarity. Per-ZIP slugs tier_spread_ratio_zip_{ZIP} resolve via refinery/vocab/patterns.mts. Computed deterministically by tier-divergence-swfl from data_lake.tier_divergence_zip_latest.
- **`tier_spread_yoy_pct_swfl`** — Year-over-year % change in the luxury/starter spread ratio, regional median across both-tier SWFL ZIPs. WIDENING (positive) is BEARISH for the entry market (lower_is_bullish). The headline polarity driver for tier-divergence-swfl. Per-ZIP slugs tier_spread_yoy_pct_zip_{ZIP} resolve via patterns.mts. RAW (not seasonally adjusted) index; YoY cancels seasonality.
- **`tier_top_yoy_pct_swfl`** — Year-over-year % change in the top-tier (luxury, 0.67-1.0 percentile) Zillow ZHVI, regional median across both-tier SWFL ZIPs. INFORMATIONAL ONLY - intentionally carries NO grade/direction_polarity: ~50% cash buyers insulate the luxury tier, so a rising top tier is part of the K-shape divergence, NOT a standalone bullish signal (polarity audit, design spec section 5.1). Computed by tier-divergence-swfl.

</details>

### `regulatory` (14)

| Concept ID | prefLabel | Raw slugs | Type | Unit | Range / Allowed | Source brains | Domains | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dbpr_notices_abt_90d` | ABT/Hospitality Enforcement Notices (Last 90 Days) | `dbpr_notices_abt_90d` | count | notices | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_notices_collier_90d` | Collier County Enforcement Notices (Last 90 Days) | `dbpr_notices_collier_90d` | count | notices | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_notices_construction_90d` | Confirmed Construction Enforcement Notices (Last 90 Days) | `dbpr_notices_construction_90d` | count | notices | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_notices_lee_90d` | Lee County Enforcement Notices (Last 90 Days) | `dbpr_notices_lee_90d` | count | notices | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_releases_abt_90d` | ABT/Hospitality Enforcement Activity, Press Releases (Last 90 Days) | `dbpr_releases_abt_90d` | count | releases | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_releases_construction_90d` | Announced Construction Enforcement Activity (Last 90 Days) | `dbpr_releases_construction_90d` | count | releases | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_swfl_releases_90d` | SWFL-Relevant DBPR Press Releases (Last 90 Days) | `dbpr_swfl_releases_90d` | count | releases | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_swfl_releases_prior_90d` | SWFL-Relevant DBPR Press Releases (Prior 90-Day Window) | `dbpr_swfl_releases_prior_90d` | count | releases | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `dbpr_total_releases_90d` | Total DBPR Press Releases (Last 90 Days, Statewide) | `dbpr_total_releases_90d` | count | releases | _unbounded_ | `news-swfl` | `macro` | ✅ active |
| `sirs_collier_count` | SIRS-Confirmed Associations — Collier County | `sirs_collier_count` | count | associations | _unbounded_ | `condo-sirs-swfl` | `real-estate` | ✅ active |
| `sirs_confirmed_swfl` | SIRS-Confirmed Associations — SWFL | `sirs_confirmed_swfl` | count | associations | _unbounded_ | `condo-sirs-swfl` | `real-estate` | ✅ active |
| `sirs_july2025_plus_count` | SIRS Filings — HB 913 Era (July 2025+) | `sirs_july2025_plus_count` | count | associations | _unbounded_ | `condo-sirs-swfl` | `real-estate` | ✅ active |
| `sirs_lee_count` | SIRS-Confirmed Associations — Lee County | `sirs_lee_count` | count | associations | _unbounded_ | `condo-sirs-swfl` | `real-estate` | ✅ active |
| `sirs_result_truncated` | Qlik Data Coverage — SIRS Registry | `sirs_result_truncated` | enum | — | `complete` / `floor estimate (Qlik limit fired)` | `condo-sirs-swfl` | `real-estate` | ✅ active |

<details><summary>Scope notes</summary>

- **`dbpr_notices_abt_90d`** — Hard-parsed DBPR public notices with ABT or hospitality industry in SWFL. Rising = bearish (compliance stress signal).
- **`dbpr_notices_collier_90d`** — Active DBPR public notices for Collier County in last 90 days. Hard-parsed county field. Data-only; no direction contribution.
- **`dbpr_notices_construction_90d`** — Hard-parsed DBPR public notices with violation_type=unlicensed_activity and construction industry in SWFL. Rising = bullish (recovery signal — enforcement follows demand).
- **`dbpr_notices_lee_90d`** — Active DBPR public notices for Lee County in last 90 days. Hard-parsed county field. Data-only; no direction contribution.
- **`dbpr_releases_abt_90d`** — SWFL-relevant DBPR press releases with ABT/hospitality in affected_industries or topics, Sonnet-inferred. Softer signal than dbpr_notices_abt_90d.
- **`dbpr_releases_construction_90d`** — SWFL-relevant DBPR press releases with construction in affected_industries or topics, Sonnet-inferred. Softer signal than dbpr_notices_construction_90d.
- **`dbpr_swfl_releases_90d`** — Count of DBPR press releases in the last 90 days where is_swfl_relevant=true (geographic mention Sonnet-inferred). Direction vote anchor for news-swfl.
- **`dbpr_swfl_releases_prior_90d`** — Count of SWFL-relevant DBPR press releases in the 90-180 day window. Paired with dbpr_swfl_releases_90d to compute momentum direction.
- **`dbpr_total_releases_90d`** — Total DBPR press releases in last 90 days regardless of SWFL relevance. Statewide context for the SWFL-relevant subset.
- **`sirs_collier_count`** — Collier County subset of SIRS-confirmed association count. county_normalized=COLLIER rows in data_lake.dbpr_sirs_submissions.
- **`sirs_confirmed_swfl`** — Count of SWFL (Lee + Collier) condo/co-op associations confirmed to have submitted their Structural Integrity Reserve Study to DBPR. Positive signal only — floor estimate when Qlik hypercube limit fires (expected on every run).
- **`sirs_july2025_plus_count`** — SIRS filings from the July 2025+ Qlik app (d217126f), representing post-HB 913 compliance push. database_period=july_2025_plus, Lee + Collier combined.
- **`sirs_lee_count`** — Lee County subset of SIRS-confirmed association count. county_normalized=LEE rows in data_lake.dbpr_sirs_submissions.
- **`sirs_result_truncated`** — Whether the Qlik hypercube limit fired during SIRS scrape. 'floor estimate (Qlik limit fired)' means the SIRS count understates the true filing universe. Expected on every run — statewide set exceeds Qlik render threshold.

</details>

## Ordered Collections

### `cre_corridor_evolution_stages`

- **prefLabel:** Corridor Evolution Stage â€” Ordered by Operator Friendliness
- **type:** `skos:OrderedCollection`
- **ordering criterion:** operator-friendliness descending
- **ordered members:** `growing` → `stable` → `repositioning` → `declining`

| Member | Note |
| --- | --- |
| `growing` | Falling cap rate and/or vacancy, active development flags. Best landlord position. |
| `stable` | Cap rate and vacancy flat. Healthy equilibrium; limited upside. |
| `repositioning` | Tenant mix or use changing. Cap rate / vacancy may diverge. Watch flags closely. |
| `declining` | Rising cap rate and/or vacancy, outmigration signals. Tenant-market territory. |

### `cre_active_listings_estero_asking_rent_psf`

- **prefLabel:** Estero Active Listing Median Asking Rent PSF (Crexi)
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `cre_active_listings_estero_available_sqft`

- **prefLabel:** Estero Total Available Sqft on Crexi
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `cre_active_listings_fort_myers_beach_asking_rent_psf`

- **prefLabel:** Fort Myers Beach Active Listing Median Asking Rent PSF (Crexi)
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `cre_active_listings_fort_myers_beach_available_sqft`

- **prefLabel:** Fort Myers Beach Total Available Sqft on Crexi
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `sba_franchise_survival_table`

- **prefLabel:** SBA Franchise Survival Detail Table
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `cre_corridor_seasonality_table`

- **prefLabel:** CRE Corridor Seasonality Detail Table
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `freshness_median_sale_price_cape_coral_usd`

- **prefLabel:** Cape Coral — Today's Sourced Median Sale Price
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `freshness_median_sale_price_fort_myers_usd`

- **prefLabel:** Fort Myers — Today's Sourced Median Sale Price
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `freshness_median_sale_price_naples_usd`

- **prefLabel:** Naples — Today's Sourced Median Sale Price
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `freshness_mortgage_30yr_fixed_pct`

- **prefLabel:** 30-Year Fixed Mortgage Rate — Today's Sourced Value
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

### `freshness_zip_pulse_median_price_approx`

- **prefLabel:** Per-ZIP Pulse Median Price (approx, [INFERENCE])
- **type:** `—`
- **ordering criterion:** —
- **ordered members:** 

## Brain DAG (typed edges)

Every edge is `{ id, edge_type }`. `edge_type` ∈ `input | constraint | veto | modifier` — see `refinery/types/pack.mts` → `BrainEdgeType`. A disputant reading `OUTPUT.drivers` on any brain can see edge semantics inline; this table is the authoring view of the same DAG.

| Brain | Domain | Upstream edges | Edge weight legend |
| --- | --- | --- | --- |
| `city-pulse-swfl` | `macro` | _leaf_ | — |
| `condo-sirs-swfl` | `regulatory` | _leaf_ | — |
| `corridor-pulse-swfl` | `real-estate` | _leaf_ | — |
| `cre-swfl` | `real-estate` | `permits-swfl` (**input**), `corridor-pulse-swfl` (**input**) | all input |
| `econ-dev-swfl` | `macro` | _leaf_ | — |
| `env-swfl` | `environmental` | _leaf_ | — |
| `fgcu-reri` | `macro` | _leaf_ | — |
| `franchise-outcomes` | `real-estate` | _leaf_ | — |
| `freshness-pulse` | `real-estate` | _leaf_ | — |
| `home-values-swfl` | `real-estate` | _leaf_ | — |
| `housing-swfl` | `real-estate` | _leaf_ | — |
| `hurricane-tracks-fl` | `environmental` | _leaf_ | — |
| `investor-zip-swfl` | `real-estate` | `home-values-swfl` (**input**), `rentals-swfl` (**input**), `env-swfl` (**input**) | all input |
| `labor-demand-swfl` | `macro` | _leaf_ | — |
| `licenses-swfl` | `real-estate` | _leaf_ | — |
| `logistics-swfl` | `logistics` | _leaf_ | — |
| `logistics-swfl-nowcast` | `logistics` | `logistics-swfl` (**input**) | all input |
| `macro-florida` | `macro` | `macro-us` (**input**) | all input |
| `macro-swfl` | `macro` | `macro-florida` (**input**) | all input |
| `macro-us` | `macro` | _leaf_ | — |
| `master` | `real-estate` | `franchise-outcomes` (**input**), `cre-swfl` (**input**), `macro-us` (**input**), `macro-florida` (**input**), `macro-swfl` (**input**), `sector-credit-swfl` (**input**), `tourism-tdt` (**input**), `env-swfl` (**modifier**), `logistics-swfl` (**input**), `logistics-swfl-nowcast` (**input**), `traffic-swfl` (**input**), `properties-lee-value` (**input**), `properties-collier-value` (**input**), `permits-swfl` (**input**), `rentals-swfl` (**input**), `housing-swfl` (**input**), `safety-swfl` (**input**), `labor-demand-swfl` (**input**), `econ-dev-swfl` (**input**), `city-pulse-swfl` (**input**), `rsw-airport` (**input**), `news-swfl` (**modifier**), `freshness-pulse` (**modifier**) | 3× modifier |
| `news-swfl` | `macro` | _leaf_ | — |
| `permits-commercial-swfl` | `real-estate` | _leaf_ | — |
| `permits-swfl` | `real-estate` | `storm-history-swfl` (**modifier**) | 1× modifier |
| `properties-collier-value` | `real-estate` | _leaf_ | — |
| `properties-lee-value` | `real-estate` | _leaf_ | — |
| `rentals-swfl` | `real-estate` | _leaf_ | — |
| `rsw-airport` | `hospitality` | _leaf_ | — |
| `safety-swfl` | `real-estate` | _leaf_ | — |
| `sector-credit-swfl` | `finance` | `franchise-outcomes` (**input**), `macro-us` (**input**), `macro-florida` (**input**) | all input |
| `seller-stress-swfl` | `real-estate` | _leaf_ | — |
| `storm-history-swfl` | `environmental` | _leaf_ | — |
| `tier-divergence-swfl` | `real-estate` | _leaf_ | — |
| `tourism-tdt` | `hospitality` | _leaf_ | — |
| `traffic-swfl` | `logistics` | _leaf_ | — |

## What each brain emits (SKOS concepts)

### `city-pulse-swfl` (1 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `city_pulse_signal` | City Pulse Signal | _none_ | active |

### `condo-sirs-swfl` (5 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `sirs_collier_count` | SIRS-Confirmed Associations — Collier County | `sirs_collier_count` | active |
| `sirs_confirmed_swfl` | SIRS-Confirmed Associations — SWFL | `sirs_confirmed_swfl` | active |
| `sirs_july2025_plus_count` | SIRS Filings — HB 913 Era (July 2025+) | `sirs_july2025_plus_count` | active |
| `sirs_lee_count` | SIRS-Confirmed Associations — Lee County | `sirs_lee_count` | active |
| `sirs_result_truncated` | Qlik Data Coverage — SIRS Registry | `sirs_result_truncated` | active |

### `cre-swfl` (27 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `cre_absorption_sqft` | Net Absorption (per corridor) | `absorption_sqft` | active |
| `cre_absorption_sqft_median` | Median Net Absorption (corpus) | `absorption_sqft_median` | active |
| `cre_absorption_sqft_median_county` | Median Net Absorption — per county (Lee / Collier) | _none_ | active |
| `cre_asking_rent_psf` | Asking Rent PSF NNN (per corridor) | `asking_rent_psf` | active |
| `cre_asking_rent_psf_median` | Median Asking Rent PSF NNN (corpus) | `asking_rent_psf_median` | active |
| `cre_asking_rent_psf_median_county` | Median Asking Rent PSF NNN — per county (Lee / Collier) | _none_ | active |
| `cre_cap_rate` | Cap Rate (per corridor) | `cap_rate` | active |
| `cre_cap_rate_median` | Median Cap Rate (corpus) | `cap_rate_median` | active |
| `cre_cap_rate_median_county` | Median Cap Rate — per county (Lee / Collier) | _none_ | active |
| `cre_corridor_evolution` | Corridor Evolution Stage | `evolution` | active |
| `cre_corridor_factor` | Corridor Factor Index | `corridor_factor` | active |
| `cre_corridor_pulse_signals` | Live Corridor-Pulse Signals | `corridor_pulse_signals_live` | active |
| `cre_seasonal_index` | Seasonal Index | `seasonal_index` | active |
| `cre_vacancy_rate` | Vacancy Rate (per corridor) | `vacancy_rate` | active |
| `cre_vacancy_rate_median` | Median Vacancy Rate (corpus) | `vacancy_rate_median` | active |
| `cre_vacancy_rate_median_county` | Median Vacancy Rate — per county (Lee / Collier) | _none_ | active |
| `marketbeat_absorption_sqft` | Net Absorption (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_absorption_sqft_industrial` | Net Absorption — Industrial (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_absorption_sqft_office` | Net Absorption — Office (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_asking_rent_nnn` | Asking Rent NNN (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_asking_rent_nnn_industrial` | Asking Rent NNN — Industrial (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_asking_rent_nnn_office` | Asking Rent NNN — Office (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_vacancy_rate` | Vacancy Rate (MarketBeat/MHS, per place) | `vacancy_rate_marketbeat_swfl` | active |
| `marketbeat_vacancy_rate_industrial` | Vacancy Rate — Industrial (MarketBeat/MHS, per place) | _none_ | active |
| `marketbeat_vacancy_rate_office` | Vacancy Rate — Office (MarketBeat/MHS, per place) | _none_ | active |
| `permits_lee_capital_flow_z` | Lee permits capital-flow z (cre-swfl thin-pipe read) | `permits_lee_capital_flow_z` | active |
| `permits_lee_saturation_signal` | Lee permits saturation signal (cre-swfl thin-pipe read) | `permits_lee_saturation_signal` | active |

### `econ-dev-swfl` (4 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `econ_dev_announcements_90d` | SWFL Economic Development Announcements (Last 90 Days) | `econ_dev_announcements_90d` | active |
| `econ_dev_announcements_prior_90d` | SWFL Economic Development Announcements (Prior 90-Day Window) | `econ_dev_announcements_prior_90d` | active |
| `econ_dev_investment_usd_90d` | SWFL Disclosed Economic-Development Investment (Last 90 Days) | `econ_dev_investment_usd_90d` | active |
| `econ_dev_jobs_90d` | SWFL Disclosed Economic-Development Jobs (Last 90 Days) | `econ_dev_jobs_90d` | active |

### `env-swfl` (18 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `env_collier_sfha_coverage_pct` | Collier County Area-Weighted SFHA Coverage | `collier_county_sfha_pct_area_weighted` | active |
| `env_collier_ve_zone_coverage_pct` | Collier County Area-Weighted Coastal V/VE Coverage | `collier_county_ve_zone_pct_area_weighted` | active |
| `env_flood_losses_swfl_baseline_annual_usd` | SWFL Non-Storm-Year Annual NFIP Paid Claims (Median) | `flood_losses_baseline`, `swfl_nonstorm_claims_baseline` | active |
| `env_flood_losses_swfl_post_ian_ratio` | SWFL Post-Ian Flood Recovery Ratio (Latest Year Ã· Baseline) | `swfl_post_ian_claims_ratio`, `post_ian_claims_ratio`, `swfl_flood_recovery_ratio` | active |
| `env_flood_losses_swfl_storm_year_count_since_2000` | SWFL Named-Storm-Year Count Since 2000 | `storm_year_count_swfl`, `swfl_storm_frequency` | active |
| `env_flood_losses_swfl_storm_year_total_usd` | SWFL Storm-Year NFIP Paid Claims (Cumulative) | `flood_losses_storm_total`, `swfl_storm_year_claims_usd` | active |
| `env_lee_sfha_coverage_pct` | Lee County Area-Weighted SFHA Coverage | `lee_county_sfha_pct_area_weighted` | active |
| `env_lee_ve_zone_coverage_pct` | Lee County Area-Weighted Coastal V/VE Coverage | `lee_county_ve_zone_pct_area_weighted` | active |
| `env_rainfall_swfl_annual_in` | SWFL Annual Rainfall (Latest Complete Year) | `swfl_rainfall_annual_in`, `rainfall_swfl_latest_year_in` | active |
| `env_sw_stage_caloosahatchee_ft` | Caloosahatchee River Stage (S-79 / Olga) | `swfl_sw_stage_caloosahatchee_ft`, `caloosahatchee_stage_latest_ft` | active |
| `env_swfl_sfha_coverage_pct` | SWFL Area-Weighted SFHA Coverage | `swfl_sfha_pct_area_weighted` | active |
| `env_swfl_ve_zone_coverage_pct` | SWFL Area-Weighted Coastal V/VE Coverage | `swfl_ve_zone_pct_area_weighted` | active |
| `env_swfl_ve_zone_polygon_count` | SWFL Coastal V/VE Polygon Count | `swfl_ve_zone_polygon_count` | active |
| `env_zip_barrier_island_score` | Per-ZIP SWFL Barrier-Island Classification Score | `env_zip_barrier_island_score` | active |
| `env_zip_flood_aal_pct_swfl_rank` | Per-ZIP NFIP AAL Percentile Rank Across SWFL ZIPs | `env_zip_flood_aal_pct_swfl_rank` | active |
| `env_zip_flood_aal_usd_per_insured_property` | Per-ZIP NFIP Average Annual Loss per Insured Property (USD/yr) | `env_zip_flood_aal_usd_per_insured_property` | active |
| `env_zip_flood_cap_rate_adj_bps` | Per-ZIP SWFL Flood Cap-Rate Adjustment (bps) | `env_zip_flood_cap_rate_adj_bps` | active |
| `env_zip_insurance_pct_typical_noi` | Per-ZIP SWFL Imputed Flood Insurance as Share of NOI | `env_zip_insurance_pct_typical_noi` | active |

### `fgcu-reri` (10 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `fgcu_reri_active_listings_pct_change` | FGCU RERI Active Listings YoY | `fgcu_reri_active_listings_pct_change` | active |
| `fgcu_reri_airport_activity_pct_change` | FGCU RERI Airport Activity YoY | `fgcu_reri_airport_activity_pct_change` | active |
| `fgcu_reri_home_prices_charlotte_pct_change` | FGCU RERI SF Home Prices Charlotte YoY | `fgcu_reri_home_prices_charlotte_pct_change` | active |
| `fgcu_reri_home_prices_collier_pct_change` | FGCU RERI SF Home Prices Collier YoY | `fgcu_reri_home_prices_collier_pct_change` | active |
| `fgcu_reri_home_prices_lee_pct_change` | FGCU RERI SF Home Prices Lee YoY | `fgcu_reri_home_prices_lee_pct_change` | active |
| `fgcu_reri_home_sales_sf_pct_change` | FGCU RERI SF Home Sales YoY | `fgcu_reri_home_sales_sf_pct_change` | active |
| `fgcu_reri_permits_sf_pct_change` | FGCU RERI SF Permits YoY | `fgcu_reri_permits_sf_pct_change` | active |
| `fgcu_reri_taxable_sales_pct_change` | FGCU RERI Taxable Sales YoY | `fgcu_reri_taxable_sales_pct_change` | active |
| `fgcu_reri_tourist_tax_pct_change` | FGCU RERI Tourist Tax Revenues YoY | `fgcu_reri_tourist_tax_pct_change` | active |
| `fgcu_reri_unemployment_rate_pct_change` | FGCU RERI Unemployment Rate YoY Î” | `fgcu_reri_unemployment_rate_pct_change` | active |

### `franchise-outcomes` (1 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `sba_overall_survival_rate` | SBA Franchise Survival Rate (Corpus) | `overall_survival_rate` | active |

### `home-values-swfl` (6 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `home_value_yoy_pct` | ZHVI Home Value YoY % - ZIP Level | `home_value_yoy_pct` | active |
| `home_value_yoy_pct_regional_median` | ZHVI Home Value YoY % - SWFL Regional Median | `home_value_yoy_pct_regional_median` | active |
| `home_value_yoy_pct_top_appreciating_zips` | Top-Appreciating SWFL ZIPs by ZHVI Home Value YoY % | `home_value_yoy_pct_top_appreciating_zips` | active |
| `home_value_zhvi` | Zillow Home Value Index (ZHVI) - ZIP-Level Home Value | `home_value_zhvi` | active |
| `home_value_zhvi_regional_median` | ZHVI Home Value - SWFL Regional Median | `home_value_zhvi_regional_median` | active |
| `home_values_zips_covered` | Count of SWFL ZIPs with ZHVI Coverage | `home_values_zips_covered` | active |

### `housing-swfl` (8 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `housing_avg_sale_to_list_swfl` | SWFL Regional Median Sale-to-List Ratio | `housing_avg_sale_to_list_swfl`, `swfl_sale_to_list` | active |
| `housing_median_dom_swfl` | SWFL Regional Median Days on Market | `housing_median_dom_swfl`, `swfl_median_dom` | active |
| `housing_median_sale_price_swfl` | SWFL Regional Median Sale Price | `housing_median_sale_price_swfl`, `swfl_median_sale_price` | active |
| `housing_months_of_supply_swfl` | SWFL Regional Months of Supply | `housing_months_of_supply_swfl` | active |
| `housing_off_market_in_two_weeks_pct_swfl` | SWFL % of Homes Off-Market Within 2 Weeks | `housing_off_market_in_two_weeks_pct_swfl`, `swfl_off_market_two_weeks` | active |
| `housing_sold_above_list_pct_swfl` | SWFL % of Homes Sold Above List Price | `housing_sold_above_list_pct_swfl`, `swfl_sold_above_list` | active |
| `median_dom_yoy_days` | Median Days on Market YoY Change | `median_dom_yoy_days` | active |
| `median_sale_price_yoy_pct` | Median Sale Price YoY Change | `median_sale_price_yoy_pct` | active |

### `hurricane-tracks-fl` (6 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `env_hurricane_cat3plus_passes_within_50mi_30yr_swfl` | SWFL Cat-3+ Hurricane Passes Within 50mi (30-Year Window) | `hurricane_cat3plus_passes_within_50mi_30yr` | active |
| `env_hurricane_closest_pass_5yr_min_mi_swfl` | SWFL Closest Hurricane Pass (Trailing 5-Year Window, miles) | `hurricane_closest_pass_5yr_min_mi` | active |
| `env_hurricane_landfalls_swfl_30yr` | SWFL Hurricane Landfalls (Trailing 30-Year Window) | `hurricane_landfalls_30yr` | active |
| `env_hurricane_most_recent_landfall_swfl` | SWFL Most Recent Hurricane Landfall (Storm + Date) | `hurricane_most_recent_landfall_date` | active |
| `env_hurricane_nfip_paid_per_landfall_storm_avg_usd_swfl` | SWFL Average NFIP Paid per Landfall Storm (USD) | `hurricane_nfip_paid_per_landfall_storm_avg_usd` | active |
| `env_hurricane_worst_storm_county_year_nfip_paid_usd_swfl` | SWFL Worst Storm-County-Year NFIP Paid (USD) | `hurricane_worst_storm_county_year_nfip_paid_usd` | active |

### `investor-zip-swfl` (8 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `home_value_yoy_pct` | ZHVI Home Value YoY % - ZIP Level | `home_value_yoy_pct` | active |
| `home_value_zhvi` | Zillow Home Value Index (ZHVI) - ZIP-Level Home Value | `home_value_zhvi` | active |
| `investor_flood_adj_cap_rate_pct` | Flood-Adjusted Cap Rate % - ZIP Level | `investor_flood_adj_cap_rate_pct` | active |
| `investor_flood_adj_cap_rate_pct_regional_median` | Flood-Adjusted Cap Rate % - SWFL Regional Median | `investor_flood_adj_cap_rate_pct_regional_median` | active |
| `investor_gross_rent_yield_pct` | Gross Rent Yield % - ZIP Level (ZORI rent / ZHVI value) | `investor_gross_rent_yield_pct` | active |
| `investor_gross_rent_yield_pct_regional_median` | Gross Rent Yield % - SWFL Regional Median | `investor_gross_rent_yield_pct_regional_median` | active |
| `investor_zip_cards_covered` | Count of SWFL Investor ZIP Cards | `investor_zip_cards_covered` | active |
| `investor_zip_cards_with_flood_overlay` | Count of Investor Cards with Flood Overlay | `investor_zip_cards_with_flood_overlay` | active |

### `labor-demand-swfl` (10 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `oews_collier_construction_loc_quotient` | Collier County Construction Location Quotient (OEWS) | `collier_construction_loc_quotient` | active |
| `oews_collier_construction_median_hourly_wage` | Collier County Construction Median Hourly Wage (OEWS) | `collier_construction_median_hourly_wage` | active |
| `oews_collier_healthcare_employment` | Collier County Healthcare Workforce (OEWS) | `collier_healthcare_employment` | active |
| `oews_collier_top_occupation_employment` | Collier County Largest Occupation Group Employment (OEWS) | `collier_top_occupation_employment` | active |
| `oews_collier_total_employment_yoy_pct` | Collier County Total Employment YoY Change (OEWS) | `collier_total_employment_yoy_pct` | active |
| `oews_lee_construction_loc_quotient` | Lee County Construction Location Quotient (OEWS) | `lee_construction_loc_quotient` | active |
| `oews_lee_construction_median_hourly_wage` | Lee County Construction Median Hourly Wage (OEWS) | `lee_construction_median_hourly_wage` | active |
| `oews_lee_healthcare_employment` | Lee County Healthcare Workforce (OEWS) | `lee_healthcare_employment` | active |
| `oews_lee_top_occupation_employment` | Lee County Largest Occupation Group Employment (OEWS) | `lee_top_occupation_employment` | active |
| `oews_lee_total_employment_yoy_pct` | Lee County Total Employment YoY Change (OEWS) | `lee_total_employment_yoy_pct` | active |

### `licenses-swfl` (6 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `licenses_active_collier` | FL DBPR Active Contractor Licenses — Collier County | `licenses_active_collier` | active |
| `licenses_active_lee` | FL DBPR Active Contractor Licenses — Lee County | `licenses_active_lee` | active |
| `licenses_applicants_swfl` | FL DBPR Contractor License Applicants — SWFL | `licenses_applicants_swfl` | active |
| `licenses_cbc_share_swfl` | FL DBPR CBC Share of Active Licenses — SWFL | `licenses_cbc_share_swfl` | active |
| `licenses_lapse_rate_swfl` | FL DBPR Contractor License Lapse Rate — SWFL | `licenses_lapse_rate_swfl` | active |
| `licenses_new_12m_swfl` | FL DBPR New Contractor Licenses — SWFL (Trailing 12 Months) | `licenses_new_12m_swfl` | active |

### `logistics-swfl` (2 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `logistics_inbound_freight_tons_swfl` | SWFL Inbound Domestic Freight (Thousand Tons, Latest FAF5 Year) | `inbound_freight_tons_swfl` | active |
| `logistics_inbound_freight_value_swfl_musd` | SWFL Inbound Domestic Freight Value (Millions USD, Latest FAF5 Year) | `inbound_freight_value_swfl_musd` | active |

### `logistics-swfl-nowcast` (12 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `logistics_nowcast_avg_payload_tons_per_truck` | Average Payload Per Truck (FHWA Constant) | `avg_payload_tons_per_truck` | active |
| `logistics_nowcast_baseline_validity_flag` | SWFL Freight Baseline Validity Flag | `baseline_validity_flag` | active |
| `logistics_nowcast_consecutive_breach_days` | SWFL Freight Consecutive Breach Days | `consecutive_breach_days` | active |
| `logistics_nowcast_current_activity_tons_year` | SWFL Freight Current Activity (Tons/Year, FDOT Segment-Counts) | `current_activity_tons_year`, `current_flow_tons_year` | active |
| `logistics_nowcast_deviation_pct` | SWFL Freight Deviation (Percent vs Baseline) | `deviation_pct` | active |
| `logistics_nowcast_deviation_z` | SWFL Freight Deviation Z-Score | `deviation_z` | active |
| `logistics_nowcast_faf5_inbound_flow_tons_year` | SWFL FAF5 Inbound Freight Flow (Tons/Year, CONTEXT) | `faf5_inbound_flow_tons_year`, `baseline_flow_tons_year` | active |
| `logistics_nowcast_freight_segment_count` | SWFL Freight Segment Count (FDOT, Latest Year) | `freight_segment_count` | active |
| `logistics_nowcast_history_days_observed` | SWFL Freight Rolling-History Days Observed | `history_days_observed` | active |
| `logistics_nowcast_rolling_mean_activity_tons_year` | SWFL Freight Rolling-Mean Baseline (Tons/Year, FDOT History) | `rolling_mean_activity_tons_year` | active |
| `logistics_nowcast_rolling_stddev_activity_tons_year` | SWFL Freight Rolling-Stddev Baseline (Tons/Year, FDOT History) | `rolling_stddev_activity_tons_year` | active |
| `logistics_nowcast_shock_state` | SWFL Freight Shock State | `shock_state` | active |

### `macro-florida` (7 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `macro_fl_estab_count_construction` | Florida Construction Establishments (NAICS 23, Census CBP) | `fl_estab_count_construction` | active |
| `macro_fl_estab_count_food_service` | Florida Food Service & Accommodation Establishments (NAICS 72, Census CBP) | `fl_estab_count_food_service` | active |
| `macro_fl_estab_count_healthcare` | Florida Healthcare Establishments (NAICS 62, Census CBP) | `fl_estab_count_healthcare` | active |
| `macro_fl_estab_count_professional` | Florida Professional Services Establishments (NAICS 54, Census CBP) | `fl_estab_count_professional` | active |
| `macro_fl_estab_count_retail` | Florida Retail Establishments (NAICS 44-45, Census CBP) | `fl_estab_count_retail` | active |
| `macro_fl_labor_participation` | Florida Labor Force Participation Rate | `fl_labor_participation` | active |
| `macro_fl_unemployment` | Florida Unemployment Rate | `fl_unemployment` | active |

### `macro-swfl` (16 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `laus_collier_unemployment_rate` | Collier County Unemployment Rate | `laus_collier_unemployment_rate`, `collier_unemployment_rate` | active |
| `laus_collier_unemployment_rate_initial_vintage` | Collier County Unemployment Rate — Initial BLS Vintage | `laus_collier_unemployment_rate_initial_vintage`, `collier_unemployment_rate_initial_vintage` | active |
| `laus_collier_unemployment_rate_revision_delta` | Collier County LAUS Unemployment Rate BLS Revision Delta | `laus_collier_unemployment_rate_revision_delta`, `collier_unemployment_rate_revision_delta` | active |
| `laus_collier_unemployment_vintage_count` | Collier County LAUS Unemployment — BLS Vintage Count | `laus_collier_unemployment_vintage_count`, `collier_unemployment_vintage_count` | active |
| `laus_fl_unemployment_rate` | Florida LAUS Unemployment Rate | `laus_fl_unemployment_rate`, `fl_laus_unemployment_rate` | active |
| `laus_lee_unemployment_rate` | Lee County Unemployment Rate | `laus_lee_unemployment_rate`, `lee_unemployment_rate` | active |
| `laus_lee_unemployment_rate_initial_vintage` | Lee County Unemployment Rate — Initial BLS Vintage | `laus_lee_unemployment_rate_initial_vintage`, `lee_unemployment_rate_initial_vintage` | active |
| `laus_lee_unemployment_rate_revision_delta` | Lee County LAUS Unemployment Rate BLS Revision Delta | `laus_lee_unemployment_rate_revision_delta`, `lee_unemployment_rate_revision_delta` | active |
| `laus_lee_unemployment_rate_yoy_delta` | Lee County Unemployment Rate YoY Delta | `laus_lee_unemployment_rate_yoy_delta`, `lee_unemployment_rate_yoy_delta` | active |
| `laus_lee_unemployment_vintage_count` | Lee County LAUS Unemployment — BLS Vintage Count | `laus_lee_unemployment_vintage_count`, `lee_unemployment_vintage_count` | active |
| `qcew_collier_private_avg_wkly_wage` | Collier County Private-Sector Average Weekly Wage | `qcew_collier_private_avg_wkly_wage`, `collier_private_avg_wkly_wage` | active |
| `qcew_collier_private_avg_wkly_wage_yoy_pct` | Collier County Private-Sector Average Weekly Wage YoY % | `qcew_collier_private_avg_wkly_wage_yoy_pct`, `collier_private_wage_yoy_pct` | active |
| `qcew_collier_private_employment` | Collier County Private-Sector Employment | `qcew_collier_private_employment`, `collier_private_month3_emplvl` | active |
| `qcew_lee_private_avg_wkly_wage` | Lee County Private-Sector Average Weekly Wage | `qcew_lee_private_avg_wkly_wage`, `lee_private_avg_wkly_wage` | active |
| `qcew_lee_private_avg_wkly_wage_yoy_pct` | Lee County Private-Sector Average Weekly Wage YoY % | `qcew_lee_private_avg_wkly_wage_yoy_pct`, `lee_private_wage_yoy_pct` | active |
| `qcew_lee_private_employment` | Lee County Private-Sector Employment | `qcew_lee_private_employment`, `lee_private_month3_emplvl` | active |

### `macro-us` (2 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `macro_cpi_yoy` | US CPI Year-over-Year | `cpi_yoy` | active |
| `macro_sofr_rate` | SOFR (Secured Overnight Financing Rate) | `sofr_rate` | active |

### `master` (114 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `cre_absorption_sqft_median` | Median Net Absorption (corpus) | `absorption_sqft_median` | active |
| `cre_asking_rent_psf_median` | Median Asking Rent PSF NNN (corpus) | `asking_rent_psf_median` | active |
| `cre_cap_rate_median` | Median Cap Rate (corpus) | `cap_rate_median` | active |
| `cre_vacancy_rate_median` | Median Vacancy Rate (corpus) | `vacancy_rate_median` | active |
| `econ_dev_announcements_90d` | SWFL Economic Development Announcements (Last 90 Days) | `econ_dev_announcements_90d` | active |
| `econ_dev_announcements_prior_90d` | SWFL Economic Development Announcements (Prior 90-Day Window) | `econ_dev_announcements_prior_90d` | active |
| `econ_dev_investment_usd_90d` | SWFL Disclosed Economic-Development Investment (Last 90 Days) | `econ_dev_investment_usd_90d` | active |
| `econ_dev_jobs_90d` | SWFL Disclosed Economic-Development Jobs (Last 90 Days) | `econ_dev_jobs_90d` | active |
| `env_flood_losses_swfl_baseline_annual_usd` | SWFL Non-Storm-Year Annual NFIP Paid Claims (Median) | `flood_losses_baseline`, `swfl_nonstorm_claims_baseline` | active |
| `env_flood_losses_swfl_post_ian_ratio` | SWFL Post-Ian Flood Recovery Ratio (Latest Year Ã· Baseline) | `swfl_post_ian_claims_ratio`, `post_ian_claims_ratio`, `swfl_flood_recovery_ratio` | active |
| `env_flood_losses_swfl_storm_year_count_since_2000` | SWFL Named-Storm-Year Count Since 2000 | `storm_year_count_swfl`, `swfl_storm_frequency` | active |
| `env_flood_losses_swfl_storm_year_total_usd` | SWFL Storm-Year NFIP Paid Claims (Cumulative) | `flood_losses_storm_total`, `swfl_storm_year_claims_usd` | active |
| `env_zip_barrier_island_score` | Per-ZIP SWFL Barrier-Island Classification Score | `env_zip_barrier_island_score` | active |
| `env_zip_flood_aal_pct_swfl_rank` | Per-ZIP NFIP AAL Percentile Rank Across SWFL ZIPs | `env_zip_flood_aal_pct_swfl_rank` | active |
| `env_zip_flood_aal_usd_per_insured_property` | Per-ZIP NFIP Average Annual Loss per Insured Property (USD/yr) | `env_zip_flood_aal_usd_per_insured_property` | active |
| `env_zip_flood_cap_rate_adj_bps` | Per-ZIP SWFL Flood Cap-Rate Adjustment (bps) | `env_zip_flood_cap_rate_adj_bps` | active |
| `env_zip_insurance_pct_typical_noi` | Per-ZIP SWFL Imputed Flood Insurance as Share of NOI | `env_zip_insurance_pct_typical_noi` | active |
| `fhfa_cape_coral_msa_yoy_pct` | Cape Coral-Fort Myers MSA HPI Year-over-Year Change (FHFA) | `fhfa_cape_coral_msa_yoy_pct` | active |
| `fhfa_fl_state_yoy_pct` | Florida Statewide HPI Year-over-Year Change (FHFA) | `fhfa_fl_state_yoy_pct` | active |
| `fhfa_naples_msa_yoy_pct` | Naples-Marco Island MSA HPI Year-over-Year Change (FHFA) | `fhfa_naples_msa_yoy_pct` | active |
| `home_value_yoy_pct` | ZHVI Home Value YoY % - ZIP Level | `home_value_yoy_pct` | active |
| `home_value_yoy_pct_regional_median` | ZHVI Home Value YoY % - SWFL Regional Median | `home_value_yoy_pct_regional_median` | active |
| `home_value_zhvi` | Zillow Home Value Index (ZHVI) - ZIP-Level Home Value | `home_value_zhvi` | active |
| `home_value_zhvi_regional_median` | ZHVI Home Value - SWFL Regional Median | `home_value_zhvi_regional_median` | active |
| `hosp_tdt_collier_latest_monthly_collections` | TDT Latest Monthly Collections â€” Collier County | `collier_latest_monthly_collections_usd` | active |
| `hosp_tdt_collier_trailing_12mo_collections` | TDT Trailing 12-Month Collections â€” Collier County | `collier_trailing_12mo_collections_usd` | active |
| `hosp_tdt_latest_monthly_collections` | Latest Monthly TDT Collections (Lee County) | `latest_monthly_collections_usd` | active |
| `hosp_tdt_lee_latest_monthly_collections` | TDT Latest Monthly Collections â€” Lee County | `lee_latest_monthly_collections_usd` | active |
| `hosp_tdt_lee_trailing_12mo_collections` | TDT Trailing 12-Month Collections â€” Lee County | `lee_trailing_12mo_collections_usd` | active |
| `hosp_tdt_post_ian_recovery_ratio` | Post-Hurricane-Ian Recovery Ratio | `post_ian_recovery_ratio` | active |
| `hosp_tdt_seasonal_position` | TDT Seasonal Position vs Historical Mean | `seasonal_position_vs_history` | active |
| `hosp_tdt_trailing_12mo_collections` | Trailing 12-Month TDT Collections (Lee County) | `trailing_12mo_collections_usd` | active |
| `hosp_tdt_yoy_delta` | TDT Year-over-Year Delta | `yoy_delta_pct` | active |
| `housing_avg_sale_to_list_swfl` | SWFL Regional Median Sale-to-List Ratio | `housing_avg_sale_to_list_swfl`, `swfl_sale_to_list` | active |
| `housing_median_dom_swfl` | SWFL Regional Median Days on Market | `housing_median_dom_swfl`, `swfl_median_dom` | active |
| `housing_median_sale_price_swfl` | SWFL Regional Median Sale Price | `housing_median_sale_price_swfl`, `swfl_median_sale_price` | active |
| `housing_months_of_supply_swfl` | SWFL Regional Months of Supply | `housing_months_of_supply_swfl` | active |
| `housing_off_market_in_two_weeks_pct_swfl` | SWFL % of Homes Off-Market Within 2 Weeks | `housing_off_market_in_two_weeks_pct_swfl`, `swfl_off_market_two_weeks` | active |
| `housing_sold_above_list_pct_swfl` | SWFL % of Homes Sold Above List Price | `housing_sold_above_list_pct_swfl`, `swfl_sold_above_list` | active |
| `laus_collier_unemployment_rate` | Collier County Unemployment Rate | `laus_collier_unemployment_rate`, `collier_unemployment_rate` | active |
| `laus_fl_unemployment_rate` | Florida LAUS Unemployment Rate | `laus_fl_unemployment_rate`, `fl_laus_unemployment_rate` | active |
| `laus_lee_unemployment_rate` | Lee County Unemployment Rate | `laus_lee_unemployment_rate`, `lee_unemployment_rate` | active |
| `laus_lee_unemployment_rate_yoy_delta` | Lee County Unemployment Rate YoY Delta | `laus_lee_unemployment_rate_yoy_delta`, `lee_unemployment_rate_yoy_delta` | active |
| `logistics_inbound_freight_tons_swfl` | SWFL Inbound Domestic Freight (Thousand Tons, Latest FAF5 Year) | `inbound_freight_tons_swfl` | active |
| `logistics_inbound_freight_value_swfl_musd` | SWFL Inbound Domestic Freight Value (Millions USD, Latest FAF5 Year) | `inbound_freight_value_swfl_musd` | active |
| `logistics_nowcast_avg_payload_tons_per_truck` | Average Payload Per Truck (FHWA Constant) | `avg_payload_tons_per_truck` | active |
| `logistics_nowcast_baseline_validity_flag` | SWFL Freight Baseline Validity Flag | `baseline_validity_flag` | active |
| `logistics_nowcast_consecutive_breach_days` | SWFL Freight Consecutive Breach Days | `consecutive_breach_days` | active |
| `logistics_nowcast_current_activity_tons_year` | SWFL Freight Current Activity (Tons/Year, FDOT Segment-Counts) | `current_activity_tons_year`, `current_flow_tons_year` | active |
| `logistics_nowcast_deviation_pct` | SWFL Freight Deviation (Percent vs Baseline) | `deviation_pct` | active |
| `logistics_nowcast_deviation_z` | SWFL Freight Deviation Z-Score | `deviation_z` | active |
| `logistics_nowcast_faf5_inbound_flow_tons_year` | SWFL FAF5 Inbound Freight Flow (Tons/Year, CONTEXT) | `faf5_inbound_flow_tons_year`, `baseline_flow_tons_year` | active |
| `logistics_nowcast_freight_segment_count` | SWFL Freight Segment Count (FDOT, Latest Year) | `freight_segment_count` | active |
| `logistics_nowcast_history_days_observed` | SWFL Freight Rolling-History Days Observed | `history_days_observed` | active |
| `logistics_nowcast_rolling_mean_activity_tons_year` | SWFL Freight Rolling-Mean Baseline (Tons/Year, FDOT History) | `rolling_mean_activity_tons_year` | active |
| `logistics_nowcast_rolling_stddev_activity_tons_year` | SWFL Freight Rolling-Stddev Baseline (Tons/Year, FDOT History) | `rolling_stddev_activity_tons_year` | active |
| `logistics_nowcast_shock_state` | SWFL Freight Shock State | `shock_state` | active |
| `macro_fl_estab_count_construction` | Florida Construction Establishments (NAICS 23, Census CBP) | `fl_estab_count_construction` | active |
| `macro_fl_estab_count_food_service` | Florida Food Service & Accommodation Establishments (NAICS 72, Census CBP) | `fl_estab_count_food_service` | active |
| `macro_fl_estab_count_healthcare` | Florida Healthcare Establishments (NAICS 62, Census CBP) | `fl_estab_count_healthcare` | active |
| `macro_fl_estab_count_professional` | Florida Professional Services Establishments (NAICS 54, Census CBP) | `fl_estab_count_professional` | active |
| `macro_fl_estab_count_retail` | Florida Retail Establishments (NAICS 44-45, Census CBP) | `fl_estab_count_retail` | active |
| `macro_fl_unemployment` | Florida Unemployment Rate | `fl_unemployment` | active |
| `macro_sofr_rate` | SOFR (Secured Overnight Financing Rate) | `sofr_rate` | active |
| `oews_collier_construction_loc_quotient` | Collier County Construction Location Quotient (OEWS) | `collier_construction_loc_quotient` | active |
| `oews_collier_construction_median_hourly_wage` | Collier County Construction Median Hourly Wage (OEWS) | `collier_construction_median_hourly_wage` | active |
| `oews_collier_healthcare_employment` | Collier County Healthcare Workforce (OEWS) | `collier_healthcare_employment` | active |
| `oews_collier_top_occupation_employment` | Collier County Largest Occupation Group Employment (OEWS) | `collier_top_occupation_employment` | active |
| `oews_collier_total_employment_yoy_pct` | Collier County Total Employment YoY Change (OEWS) | `collier_total_employment_yoy_pct` | active |
| `oews_lee_construction_loc_quotient` | Lee County Construction Location Quotient (OEWS) | `lee_construction_loc_quotient` | active |
| `oews_lee_construction_median_hourly_wage` | Lee County Construction Median Hourly Wage (OEWS) | `lee_construction_median_hourly_wage` | active |
| `oews_lee_healthcare_employment` | Lee County Healthcare Workforce (OEWS) | `lee_healthcare_employment` | active |
| `oews_lee_top_occupation_employment` | Lee County Largest Occupation Group Employment (OEWS) | `lee_top_occupation_employment` | active |
| `oews_lee_total_employment_yoy_pct` | Lee County Total Employment YoY Change (OEWS) | `lee_total_employment_yoy_pct` | active |
| `properties_collier_homes_sold_per_year` | Collier County Residential Homes Sold (Current Year, Redfin) | `collier_homes_sold_per_year` | active |
| `properties_collier_homes_sold_zscore` | Collier County Homes-Sold Z-Score (Current Year vs Trailing 3yr Baseline) | `collier_homes_sold_zscore` | active |
| `properties_collier_median_sale_price_yoy` | Collier County Median Sale Price Year-over-Year (Redfin) | `collier_median_sale_price_yoy` | active |
| `properties_collier_months_of_supply` | Collier County Months of Supply (Redfin) | `collier_months_of_supply` | active |
| `properties_collier_soh_gap_median_pct` | Collier County Save-Our-Homes Gap Median (% Homestead Just Value Suppressed) | `collier_soh_gap_median_pct` | active |
| `properties_collier_total_parcels` | Collier County Total Parcels (FDOR Cadastral Snapshot) | `collier_total_parcels` | active |
| `properties_lee_homes_sold_per_year` | Lee County Residential Homes Sold (Current Year, Redfin) | `lee_homes_sold_per_year` | active |
| `properties_lee_homes_sold_zscore` | Lee County Homes-Sold Z-Score (Current Year vs Trailing 3yr Baseline, Redfin) | `lee_homes_sold_zscore` | active |
| `properties_lee_median_sale_price_yoy` | Lee County Median Sale Price Year-over-Year (Redfin) | `lee_median_sale_price_yoy` | active |
| `properties_lee_months_of_supply` | Lee County Months of Supply (Redfin) | `lee_months_of_supply` | active |
| `properties_lee_sales_velocity_per_1k` | Lee County Qualified Sales Velocity (Per 1,000 Parcels, Current Year) | `sales_velocity_per_1k` | active |
| `properties_lee_sales_velocity_zscore` | Lee County Sales-Velocity Z-Score (Current Year vs Trailing 3yr Baseline) | `sales_velocity_zscore` | active |
| `properties_lee_soh_gap_median_pct` | Lee County Save-Our-Homes Gap Median (% Just Value Suppressed) | `soh_gap_median_pct` | active |
| `properties_lee_total_parcels` | Lee County Total Parcels (Snapshot Row Count) | `total_parcels` | active |
| `qcew_collier_private_avg_wkly_wage` | Collier County Private-Sector Average Weekly Wage | `qcew_collier_private_avg_wkly_wage`, `collier_private_avg_wkly_wage` | active |
| `qcew_collier_private_avg_wkly_wage_yoy_pct` | Collier County Private-Sector Average Weekly Wage YoY % | `qcew_collier_private_avg_wkly_wage_yoy_pct`, `collier_private_wage_yoy_pct` | active |
| `qcew_collier_private_employment` | Collier County Private-Sector Employment | `qcew_collier_private_employment`, `collier_private_month3_emplvl` | active |
| `qcew_lee_private_avg_wkly_wage` | Lee County Private-Sector Average Weekly Wage | `qcew_lee_private_avg_wkly_wage`, `lee_private_avg_wkly_wage` | active |
| `qcew_lee_private_avg_wkly_wage_yoy_pct` | Lee County Private-Sector Average Weekly Wage YoY % | `qcew_lee_private_avg_wkly_wage_yoy_pct`, `lee_private_wage_yoy_pct` | active |
| `qcew_lee_private_employment` | Lee County Private-Sector Employment | `qcew_lee_private_employment`, `lee_private_month3_emplvl` | active |
| `rental_rent_index_zori` | Zillow Observed Rent Index (ZORI) â€” ZIP-Level Monthly Rent | `rental_rent_index_zori` | active |
| `rental_rent_index_zori_regional_median` | ZORI Rent Index â€” SWFL Regional Median | `rental_rent_index_zori_regional_median` | active |
| `rental_rent_yoy_pct` | ZORI Rent YoY % â€” ZIP Level | `rental_rent_yoy_pct` | active |
| `rental_rent_yoy_pct_regional_median` | ZORI Rent YoY % â€” SWFL Regional Median | `rental_rent_yoy_pct_regional_median` | active |
| `safety_property_crime_per_1k_collier` | Collier County Property Crime Rate | `safety_property_crime_per_1k_collier` | active |
| `safety_property_crime_per_1k_lee` | Lee County Property Crime Rate | `safety_property_crime_per_1k_lee` | active |
| `safety_property_crime_per_1k_swfl` | SWFL Property Crime Rate | `safety_property_crime_per_1k_swfl` | active |
| `safety_property_crime_yoy_pct_collier` | Collier County Property Crime Rate YoY | `safety_property_crime_yoy_pct_collier` | active |
| `safety_property_crime_yoy_pct_lee` | Lee County Property Crime Rate YoY | `safety_property_crime_yoy_pct_lee` | active |
| `safety_property_crime_yoy_pct_swfl` | SWFL Property Crime Rate YoY | `safety_property_crime_yoy_pct_swfl` | active |
| `safety_total_property_crimes_collier` | Collier County Total Property Crime Incidents | `safety_total_property_crimes_collier` | active |
| `safety_total_property_crimes_lee` | Lee County Total Property Crime Incidents | `safety_total_property_crimes_lee` | active |
| `sba_best_sector_survival` | Best-Sector SBA Survival Rate | `best_naics_survival` | active |
| `sba_overall_survival_rate` | SBA Franchise Survival Rate (Corpus) | `overall_survival_rate` | active |
| `sba_worst_sector_chargeoff` | Worst-Sector SBA Charge-off Rate | `worst_naics_chargeoff` | active |
| `traffic_aadt_swfl_5yr_cagr_pct` | SWFL AADT 5-Year CAGR (2021â€“2025) | `aadt_5yr_cagr`, `traffic_cagr_swfl` | active |
| `traffic_aadt_swfl_avg` | SWFL Length-Weighted Average AADT (Latest FDOT Year) | `aadt_swfl_avg`, `traffic_aadt_avg_swfl` | active |
| `traffic_aadt_swfl_yoy_pct` | SWFL AADT Year-over-Year Change (Latest vs Prior FDOT Year) | `aadt_yoy_pct`, `traffic_yoy_swfl` | active |
| `traffic_post_ian_recovery_index` | SWFL Coastal Counties Post-Ian Recovery Index (2025 Ã· 2022) | `post_ian_recovery`, `ian_recovery_index` | active |
| `traffic_truck_share_swfl_median_pct` | SWFL Median Truck Share (FDOT TFCTR, Latest Year) | `truck_share_median`, `freight_density_swfl` | active |

### `news-swfl` (9 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `dbpr_notices_abt_90d` | ABT/Hospitality Enforcement Notices (Last 90 Days) | `dbpr_notices_abt_90d` | active |
| `dbpr_notices_collier_90d` | Collier County Enforcement Notices (Last 90 Days) | `dbpr_notices_collier_90d` | active |
| `dbpr_notices_construction_90d` | Confirmed Construction Enforcement Notices (Last 90 Days) | `dbpr_notices_construction_90d` | active |
| `dbpr_notices_lee_90d` | Lee County Enforcement Notices (Last 90 Days) | `dbpr_notices_lee_90d` | active |
| `dbpr_releases_abt_90d` | ABT/Hospitality Enforcement Activity, Press Releases (Last 90 Days) | `dbpr_releases_abt_90d` | active |
| `dbpr_releases_construction_90d` | Announced Construction Enforcement Activity (Last 90 Days) | `dbpr_releases_construction_90d` | active |
| `dbpr_swfl_releases_90d` | SWFL-Relevant DBPR Press Releases (Last 90 Days) | `dbpr_swfl_releases_90d` | active |
| `dbpr_swfl_releases_prior_90d` | SWFL-Relevant DBPR Press Releases (Prior 90-Day Window) | `dbpr_swfl_releases_prior_90d` | active |
| `dbpr_total_releases_90d` | Total DBPR Press Releases (Last 90 Days, Statewide) | `dbpr_total_releases_90d` | active |

### `permits-commercial-swfl` (3 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `commercial_permits_count` | SWFL Commercial Permits Issued | `commercial_permits_count` | active |
| `commercial_permits_sf` | SWFL Commercial Permit Building Area | `commercial_permits_sf` | active |
| `commercial_permits_value_usd` | SWFL Commercial Permit Value | `commercial_permits_value_usd` | active |

### `permits-swfl` (12 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `permits_collier_corridor_z` | Collier permits per-corridor z-score (parameterized) | _none_ | active |
| `permits_collier_county_weighted_avg_corridor_z` | Collier County weighted average corridor z-score (permits) | `permits_collier_county_weighted_avg_corridor_z` | active |
| `permits_collier_saturation_index` | Collier permits saturation index | `permits_collier_saturation_index` | active |
| `permits_collier_zip_z` | Collier permits per-ZIP z-score (parameterized) | _none_ | active |
| `permits_lee_corridor_z` | Lee permits per-corridor z-score (parameterized) | _none_ | active |
| `permits_lee_county_weighted_avg_corridor_z` | Lee County weighted average corridor z-score (permits) | `permits_lee_county_weighted_avg_corridor_z` | active |
| `permits_lee_saturation_index` | Lee permits saturation index | `permits_lee_saturation_index` | active |
| `permits_lee_top_heating_cooling` | Lee permits top heating/cooling corridors (rank-ordered categorical) | `permits_lee_top_heating_commercial_alteration`, `permits_lee_top_heating_commercial_new`, `permits_lee_top_cooling_commercial_alteration`, `permits_lee_top_cooling_commercial_new` | active |
| `permits_lee_zip_z` | Lee permits per-ZIP z-score (parameterized) | _none_ | active |
| `permits_swfl_county_weighted_avg_corridor_z` | SWFL weighted average corridor z-score (Lee + Collier permits rollup) | `permits_swfl_county_weighted_avg_corridor_z` | active |
| `permits_swfl_saturation_index` | SWFL permits saturation index (Lee + Collier rollup) | `permits_swfl_saturation_index` | active |
| `permits_swfl_top_heating_cooling` | SWFL permits top heating/cooling corridors (Lee + Collier rank-ordered categorical) | `permits_swfl_top_heating_commercial_alteration`, `permits_swfl_top_heating_commercial_new`, `permits_swfl_top_cooling_commercial_alteration`, `permits_swfl_top_cooling_commercial_new` | active |

### `properties-collier-value` (7 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `fhfa_naples_msa_yoy_pct` | Naples-Marco Island MSA HPI Year-over-Year Change (FHFA) | `fhfa_naples_msa_yoy_pct` | active |
| `properties_collier_homes_sold_per_year` | Collier County Residential Homes Sold (Current Year, Redfin) | `collier_homes_sold_per_year` | active |
| `properties_collier_homes_sold_zscore` | Collier County Homes-Sold Z-Score (Current Year vs Trailing 3yr Baseline) | `collier_homes_sold_zscore` | active |
| `properties_collier_median_sale_price_yoy` | Collier County Median Sale Price Year-over-Year (Redfin) | `collier_median_sale_price_yoy` | active |
| `properties_collier_months_of_supply` | Collier County Months of Supply (Redfin) | `collier_months_of_supply` | active |
| `properties_collier_soh_gap_median_pct` | Collier County Save-Our-Homes Gap Median (% Homestead Just Value Suppressed) | `collier_soh_gap_median_pct` | active |
| `properties_collier_total_parcels` | Collier County Total Parcels (FDOR Cadastral Snapshot) | `collier_total_parcels` | active |

### `properties-lee-value` (10 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `fhfa_cape_coral_msa_yoy_pct` | Cape Coral-Fort Myers MSA HPI Year-over-Year Change (FHFA) | `fhfa_cape_coral_msa_yoy_pct` | active |
| `fhfa_fl_state_yoy_pct` | Florida Statewide HPI Year-over-Year Change (FHFA) | `fhfa_fl_state_yoy_pct` | active |
| `properties_lee_homes_sold_per_year` | Lee County Residential Homes Sold (Current Year, Redfin) | `lee_homes_sold_per_year` | active |
| `properties_lee_homes_sold_zscore` | Lee County Homes-Sold Z-Score (Current Year vs Trailing 3yr Baseline, Redfin) | `lee_homes_sold_zscore` | active |
| `properties_lee_median_sale_price_yoy` | Lee County Median Sale Price Year-over-Year (Redfin) | `lee_median_sale_price_yoy` | active |
| `properties_lee_months_of_supply` | Lee County Months of Supply (Redfin) | `lee_months_of_supply` | active |
| `properties_lee_sales_velocity_per_1k` | Lee County Qualified Sales Velocity (Per 1,000 Parcels, Current Year) | `sales_velocity_per_1k` | active |
| `properties_lee_sales_velocity_zscore` | Lee County Sales-Velocity Z-Score (Current Year vs Trailing 3yr Baseline) | `sales_velocity_zscore` | active |
| `properties_lee_soh_gap_median_pct` | Lee County Save-Our-Homes Gap Median (% Just Value Suppressed) | `soh_gap_median_pct` | active |
| `properties_lee_total_parcels` | Lee County Total Parcels (Snapshot Row Count) | `total_parcels` | active |

### `rentals-swfl` (7 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `rental_rent_index_zori` | Zillow Observed Rent Index (ZORI) â€” ZIP-Level Monthly Rent | `rental_rent_index_zori` | active |
| `rental_rent_index_zori_regional_median` | ZORI Rent Index â€” SWFL Regional Median | `rental_rent_index_zori_regional_median` | active |
| `rental_rent_mom_pct` | ZORI Rent MoM % â€” ZIP Level | `rental_rent_mom_pct` | active |
| `rental_rent_yoy_pct` | ZORI Rent YoY % â€” ZIP Level | `rental_rent_yoy_pct` | active |
| `rental_rent_yoy_pct_regional_median` | ZORI Rent YoY % â€” SWFL Regional Median | `rental_rent_yoy_pct_regional_median` | active |
| `rental_rent_yoy_pct_top_heating_zips` | Top-Heating SWFL ZIPs by ZORI Rent YoY % | `rental_rent_yoy_pct_top_heating_zips` | active |
| `rentals_swfl_zips_covered` | Count of SWFL ZIPs with ZORI Coverage | `rentals_swfl_zips_covered` | active |

### `rsw-airport` (15 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `aircraft_operations` | Monthly Aircraft Operations | `aircraft_operations` | active |
| `deplanements` | Monthly Deplanements | `deplanements` | active |
| `enplanements` | Monthly Enplanements | `enplanements` | active |
| `rsw_aircraft_operations` | RSW Monthly Aircraft Operations | `rsw_aircraft_operations` | active |
| `rsw_deplanements` | RSW Monthly Deplanements (Arrivals) | `rsw_deplanements` | active |
| `rsw_freight_lbs` | RSW Monthly Air Freight | `rsw_freight_lbs` | active |
| `rsw_monthly_enplanements` | RSW Monthly Enplanements (Departures) | `rsw_monthly_enplanements` | active |
| `rsw_pax_per_operation` | RSW Passengers per Aircraft Operation | `rsw_pax_per_operation` | active |
| `rsw_seasonality_ratio` | RSW Seasonality Ratio | `rsw_seasonality_ratio` | active |
| `rsw_total_passengers` | RSW Monthly Total Passengers | `rsw_total_passengers` | active |
| `rsw_trailing_12mo_total_passengers` | RSW Trailing 12-Mo Total Passengers | `rsw_trailing_12mo_total_passengers` | active |
| `rsw_trailing_12mo_total_passengers_yoy` | RSW Total Passengers — Trailing-12-Mo YoY | `rsw_trailing_12mo_total_passengers_yoy` | active |
| `rsw_yoy_pct_change` | RSW Enplanements YoY | `rsw_yoy_pct_change` | active |
| `total_freight_lbs` | Monthly Air Freight (lbs) | `total_freight_lbs` | active |
| `total_passengers` | Monthly Total Passengers | `total_passengers` | active |

### `safety-swfl` (8 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `safety_property_crime_per_1k_collier` | Collier County Property Crime Rate | `safety_property_crime_per_1k_collier` | active |
| `safety_property_crime_per_1k_lee` | Lee County Property Crime Rate | `safety_property_crime_per_1k_lee` | active |
| `safety_property_crime_per_1k_swfl` | SWFL Property Crime Rate | `safety_property_crime_per_1k_swfl` | active |
| `safety_property_crime_yoy_pct_collier` | Collier County Property Crime Rate YoY | `safety_property_crime_yoy_pct_collier` | active |
| `safety_property_crime_yoy_pct_lee` | Lee County Property Crime Rate YoY | `safety_property_crime_yoy_pct_lee` | active |
| `safety_property_crime_yoy_pct_swfl` | SWFL Property Crime Rate YoY | `safety_property_crime_yoy_pct_swfl` | active |
| `safety_total_property_crimes_collier` | Collier County Total Property Crime Incidents | `safety_total_property_crimes_collier` | active |
| `safety_total_property_crimes_lee` | Lee County Total Property Crime Incidents | `safety_total_property_crimes_lee` | active |

### `sector-credit-swfl` (18 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `fl_dor_taxable_sales_latest_usd` | SWFL Monthly Taxable Sales (Latest) | `swfl_taxable_sales_latest_usd` | active |
| `fl_dor_taxable_sales_trailing_12mo_usd` | SWFL Taxable Sales Trailing 12 Months | `swfl_taxable_sales_trailing_12mo_usd` | active |
| `fl_dor_taxable_sales_yoy_pct` | SWFL Taxable Sales YoY Change | `swfl_taxable_sales_yoy_pct` | active |
| `sba_best_sector_survival` | Best-Sector SBA Survival Rate | `best_naics_survival` | active |
| `sba_chargeoff_rate_sector_23` | Construction (NAICS 23) â€” SBA Charge-off Rate | `sector_23_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_42` | Wholesale Trade (NAICS 42) â€” SBA Charge-off Rate | `sector_42_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_44` | Retail Trade â€” Motor Vehicle & General Merchandise (NAICS 44) â€” SBA Charge-off Rate | `sector_44_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_45` | Retail Trade â€” Clothing, Sporting Goods & Non-store (NAICS 45) â€” SBA Charge-off Rate | `sector_45_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_48` | Transportation & Warehousing (NAICS 48) â€” SBA Charge-off Rate | `sector_48_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_52` | Finance & Insurance (NAICS 52) â€” SBA Charge-off Rate | `sector_52_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_53` | Real Estate, Rental & Leasing (NAICS 53) â€” SBA Charge-off Rate | `sector_53_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_54` | Professional, Scientific & Technical Services (NAICS 54) â€” SBA Charge-off Rate | `sector_54_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_56` | Administrative & Support Services (NAICS 56) â€” SBA Charge-off Rate | `sector_56_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_62` | Health Care & Social Assistance (NAICS 62) â€” SBA Charge-off Rate | `sector_62_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_71` | Arts, Entertainment & Recreation (NAICS 71) â€” SBA Charge-off Rate | `sector_71_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_72` | Accommodation & Food Services (NAICS 72) â€” SBA Charge-off Rate | `sector_72_chargeoff_rate` | active |
| `sba_chargeoff_rate_sector_81` | Other Services â€” Personal & Repair (NAICS 81) â€” SBA Charge-off Rate | `sector_81_chargeoff_rate` | active |
| `sba_worst_sector_chargeoff` | Worst-Sector SBA Charge-off Rate | `worst_naics_chargeoff` | active |

### `seller-stress-swfl` (5 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `seller_stress_avg_drop_depth_swfl` | SWFL Median Avg Price Drop Depth | `seller_stress_avg_drop_depth_swfl` | active |
| `seller_stress_cancellation_rate_swfl` | SWFL Median Cancellation Rate | `seller_stress_cancellation_rate_swfl` | active |
| `seller_stress_delistings_rate_swfl` | SWFL Median Delistings Rate | `seller_stress_delistings_rate_swfl` | active |
| `seller_stress_price_drops_rate_swfl` | SWFL Median Price Drop Rate | `seller_stress_price_drops_rate_swfl` | active |
| `seller_stress_score_swfl` | SWFL Seller Stress Score | `seller_stress_score_swfl` | active |

### `storm-history-swfl` (9 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `env_storm_counties_covered_swfl` | SWFL Counties Present in Storm History Corpus | `storm_counties_covered` | active |
| `env_storm_ingest_vintage_swfl` | SWFL Storm-History Ingest Vintage Range | `storm_ingest_vintage` | active |
| `env_storm_last_billion_dollar_event_date_swfl` | Most Recent SWFL Billion-Dollar Storm Event Date | `storm_last_billion_dollar_event_date` | active |
| `env_storm_last_billion_dollar_event_name_swfl` | Most Recent SWFL Billion-Dollar Storm Event Name | `storm_last_billion_dollar_event_name` | active |
| `env_storm_last_billion_dollar_event_type_swfl` | Most Recent SWFL Billion-Dollar Storm Event Type | `storm_last_billion_dollar_event_type` | active |
| `env_storm_major_storm_count_30yr_swfl` | SWFL Major Storm Count (Full Vintage) | `storm_major_storm_count_30yr` | active |
| `env_storm_property_damage_events_10yr_swfl` | SWFL Property-Damage Events (10-Year Window) | `storm_property_damage_events_10yr` | active |
| `env_storm_total_storm_count_30yr_swfl` | SWFL Total Storm Event Count (Full Vintage) | `storm_total_storm_count_30yr` | active |
| `env_storm_tropical_cyclones_10yr_swfl` | SWFL Tropical Cyclones Affecting the Footprint (10-Year Window) | `storm_tropical_cyclones_10yr` | active |

### `tier-divergence-swfl` (6 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `tier_bottom_yoy_pct_swfl` | Starter-Tier (Bottom) ZHVI YoY % - SWFL Regional Median | `tier_bottom_yoy_pct_swfl` | active |
| `tier_kshape_intensity_swfl` | K-Shape Intensity Score — SWFL (0–100) | `tier_kshape_intensity_swfl` | active |
| `tier_kshape_zip_count_swfl` | Count of SWFL ZIPs in K-Shape (Luxury Holding, Starter Falling) | `tier_kshape_zip_count_swfl` | active |
| `tier_spread_ratio_swfl` | Tier Spread (Luxury / Starter) - SWFL Regional Median | `tier_spread_ratio_swfl` | active |
| `tier_spread_yoy_pct_swfl` | Tier Spread YoY % - SWFL Regional Median | `tier_spread_yoy_pct_swfl` | active |
| `tier_top_yoy_pct_swfl` | Luxury-Tier (Top) ZHVI YoY % - SWFL Regional Median | `tier_top_yoy_pct_swfl` | active |

### `tourism-tdt` (9 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `hosp_tdt_collier_latest_monthly_collections` | TDT Latest Monthly Collections â€” Collier County | `collier_latest_monthly_collections_usd` | active |
| `hosp_tdt_collier_trailing_12mo_collections` | TDT Trailing 12-Month Collections â€” Collier County | `collier_trailing_12mo_collections_usd` | active |
| `hosp_tdt_latest_monthly_collections` | Latest Monthly TDT Collections (Lee County) | `latest_monthly_collections_usd` | active |
| `hosp_tdt_lee_latest_monthly_collections` | TDT Latest Monthly Collections â€” Lee County | `lee_latest_monthly_collections_usd` | active |
| `hosp_tdt_lee_trailing_12mo_collections` | TDT Trailing 12-Month Collections â€” Lee County | `lee_trailing_12mo_collections_usd` | active |
| `hosp_tdt_post_ian_recovery_ratio` | Post-Hurricane-Ian Recovery Ratio | `post_ian_recovery_ratio` | active |
| `hosp_tdt_seasonal_position` | TDT Seasonal Position vs Historical Mean | `seasonal_position_vs_history` | active |
| `hosp_tdt_trailing_12mo_collections` | Trailing 12-Month TDT Collections (Lee County) | `trailing_12mo_collections_usd` | active |
| `hosp_tdt_yoy_delta` | TDT Year-over-Year Delta | `yoy_delta_pct` | active |

### `traffic-swfl` (5 concepts)

| Concept | prefLabel | Raw slugs | Status |
| --- | --- | --- | --- |
| `traffic_aadt_swfl_5yr_cagr_pct` | SWFL AADT 5-Year CAGR (2021â€“2025) | `aadt_5yr_cagr`, `traffic_cagr_swfl` | active |
| `traffic_aadt_swfl_avg` | SWFL Length-Weighted Average AADT (Latest FDOT Year) | `aadt_swfl_avg`, `traffic_aadt_avg_swfl` | active |
| `traffic_aadt_swfl_yoy_pct` | SWFL AADT Year-over-Year Change (Latest vs Prior FDOT Year) | `aadt_yoy_pct`, `traffic_yoy_swfl` | active |
| `traffic_post_ian_recovery_index` | SWFL Coastal Counties Post-Ian Recovery Index (2025 Ã· 2022) | `post_ian_recovery`, `ian_recovery_index` | active |
| `traffic_truck_share_swfl_median_pct` | SWFL Median Truck Share (FDOT TFCTR, Latest Year) | `truck_share_median`, `freight_density_swfl` | active |

_Concepts with `source_brains: ["all"]` (qualitative brain-output fields like `qual_confidence`, `qual_trust_tier`, `qual_sentiment_direction`) are emitted by every brain and intentionally omitted from this table._

## Constitution overrides (cascade)

Higher priority wins. Effect `force_signal_direction` tracks the originating signal's direction; `force_bearish` / `force_bullish` pin the read; `add_caveat` only appends a caveat. SKOS-aware rules (e.g. `hospitality-yoy-collapse`) declare trigger concepts by SKOS ID, resolve them to a raw-slug set at module-init via `resolveConceptSlugs` from `refinery/vocab/loader.mts`, and match `m.metric` against that set inside the predicate.

| Priority | Override ID | Effect | Domains |
| ---: | --- | --- | --- |
| 100 | `exogenous-critical-confirmed` | `force_signal_direction` | `real-estate` |
| 90 | `flood-barrier-mode-1` | `add_caveat` | `real-estate` |
| 80 | `naics-distress-veto` | `force_bearish` | `real-estate` |
| 70 | `storm-history-modifier` | `add_caveat` | `real-estate` |
| 70 | `rising-rates-dominance` | `force_bearish` | `finance` |
| 65 | `hospitality-recovery-collapse` | `force_bearish` | `hospitality` |
| 60 | `hospitality-yoy-collapse` | `force_bearish` | `hospitality` |

_Source: `refinery/constitution/{real-estate,finance,hospitality}.mts` — see those files for the predicate code and threshold values._

## Trust tiers (confidence weights)

Every `SourceConnector` declares one `trust_tier`. Stage 4's deterministic confidence formula averages the tier scores below across a pack's sources and multiplies by the TTL-freshness ratio (and upstream confidences). No LLM in the math path.

| Tier | Authority | Score |
| ---: | --- | ---: |
| 1 | Primary — federal, SEC, NOAA, FEMA | 1.0 |
| 2 | Verified editorial / shipped brain output | 0.8 |
| 3 | Secondary aggregator / industry report | 0.6 |
| 4 | Inferred / weakly attested | 0.4 |

_Formula: `refinery/lib/confidence.mts` — `confidence = avg(trust_tier_score) × freshness_ratio × avg(upstream_confidences)`._

## Data-quality checks

### Concepts with no source brain (2)

These concepts are registered in the vocab but no brain currently emits them. Usually intentional (stubs pre-registered for upcoming brains).

| Concept | Status | Scope hint |
| --- | --- | --- |
| `env_flood_risk_pct` | stub | Generic flood-risk percentage at unspecified spatial granularity. Currently a stub â€” no source brain emits it, and the SWFL flood-coverage signal is carried instead by the scope-specific concepts e… |
| `sba_naics_distress_baseline` | stub | Pre-registered for the naics-distress-veto override rule in refinery/constitution/real-estate.mts. Fires false until sector-credit-swfl exposes a baseline metric. Pair with sba_chargeoff_rate_sector_… |

### Unresolved `slug_index` entries (8)

These slugs map to concept IDs that don't exist in `concepts{}` — likely a typo or a deletion that missed a back-pointer.

- `freshness_median_sale_price_cape_coral_usd`
- `freshness_median_sale_price_fort_myers_usd`
- `freshness_median_sale_price_naples_usd`
- `freshness_mortgage_30yr_fixed_pct`
- `cre_active_listings_estero_asking_rent_psf`
- `cre_active_listings_estero_available_sqft`
- `cre_active_listings_fort_myers_beach_asking_rent_psf`
- `cre_active_listings_fort_myers_beach_available_sqft`

### Concepts referencing a brain not in PACKS (0)

_None — every `source_brains` entry resolves to a registered pack._

---

**Notes**

- This file is generated; do not edit by hand. Edit `refinery/vocab/brain-vocabulary.json` or the per-pack `input_brains` arrays, then rerun the generator.
- SKOS pattern: each concept's stable ID (e.g. `env_lee_ve_zone_coverage_pct`) is the lookup key; `raw_slugs` are the legacy strings the engine still writes into brain `.md` files. `slug_index` inverts to make raw → concept resolution sync.
- DAG edge semantics live in `refinery/types/pack.mts` (`BrainEdgeType`). Edge weights in this ledger summarize the strongest edge type the brain carries on any of its inbound connections.
- Override priority ordering is enforced by `refinery/constitution/index.mts` after merging per-domain rule sets.
