# 00 — Family map (19 Opus agents, 09/26/2026)

One Opus per family. A family = pipelines that share a vendor, an API, a workflow file, or a failure shape, so one agent can hold the whole chain. Registry names are from `ingest/cadence_registry.yaml` (76 `pipelines:` + 4 `not_yet_running:` + 32 `jobs:`); every one of the 112 is assigned exactly once below. Family 19 is cross-cutting and runs AFTER 01-18 so it can read their box-placement and compute-lane sections.

## 01 listings-lifecycle - SteadyAPI-era listing spine (PARKED legs) + market aggregates + rentals
- listing_lifecycle
- listing_week
- market_aggregates_histogram
- market_aggregates_details
- rentals_swfl
- land_manufactured_swfl (not_yet_running)
- file: `01-listings-lifecycle.md`

## 02 demand-signals - search/interest/STR demand + the two live-search daily probes
- live_search_daily_median_asking
- live_search_daily_mortgage
- realtor_geo_trends
- swfl_search_demand
- airdna_str_swfl (not_yet_running)
- file: `02-demand-signals.md`

## 03 zillow - ZHVI / ZORI / tier divergence, tier-1 DuckDB + tier-2 pairs
- zhvi_swfl_duckdb
- zhvi_swfl_tier2
- zori_swfl_duckdb
- zori_swfl_tier2
- tier_divergence_swfl_duckdb
- tier_divergence_swfl_tier2
- file: `03-zillow.md`

## 04 redfin - Redfin data-center monthly files: county, city, seller-stress trio
- redfin_swfl
- redfin_price_drops
- redfin_contract_cancellations
- redfin_delistings_relistings
- redfin_collier
- redfin_lee
- redfin_city_swfl
- file: `04-redfin.md`

## 05 weather-env - hurricanes, storms, water, rainfall, flood insurance
- hurdat2_fl
- storm_history_swfl
- usgs
- noaa_ghcn_rainfall
- fema
- file: `05-weather-env.md`

## 06 bls - BLS PPI / LAUS / QCEW / OEWS (tier-1 + tier-2)
- bls_ppi
- bls_laus
- bls_qcew
- bls_oews_swfl
- bls_oews_swfl_tier1
- file: `06-bls.md`

## 07 federal-econ - Census CBP/ACS, FDIC deposits, FHFA HPI, FAF5 freight, FDOT AADT
- census_cbp
- census_acs
- fdic_bankfind
- fhfa
- faf5
- fdot
- file: `07-federal-econ.md`

## 08 parcels-valuation - Lee + Collier parcel layers, LeePA valuation + comparable sales
- leepa
- leepa_comp_sales
- lee_parcels
- collier_parcels
- file: `08-parcels-valuation.md`

## 09 communities - planned developments, PD crosswalk, neighborhood stats + amenities
- lee_planned_developments
- parcel_community_pd
- neighborhood_stats
- neighborhood_amenities
- file: `09-communities.md`

## 10 permits-records - building permits (Lee Accela, Collier Akamai, MHS) + official records (Collier daily, Lee deeds)
- lee_permits
- collier_permits
- mhs_permits_swfl
- collier_official_records
- lee_deed_official_records (not_yet_running)
- file: `10-permits-records.md`

## 11 state-institutional - FL DOR tax series, FDLE crime, FGCU RERI, RSW airport, SBA franchise
- fl_dor_tdt
- fl_dor_sales_tax
- fdle_crime_swfl
- fgcu_reri_indicators
- rsw_airport_monthly
- sba_foia_franchise_outcomes (not_yet_running)
- file: `11-state-institutional.md`

## 12 dbpr - DBPR press releases, public notices, SIRS (Fedora-pinned), licenses, applicants, RE licensees (dark root)
- dbpr_press_releases
- dbpr_public_notices
- dbpr_sirs_submissions
- fl_dbpr_licenses
- fl_dbpr_applicants
- dbpr_re_licensees
- file: `12-dbpr.md`

## 13 pulse-news - city pulse (credit-wall parked), corridors, news, SWFL Inc
- city_pulse
- city_pulse_corridors
- city_pulse_corridors_tier2
- news_swfl
- swfl_inc
- file: `13-pulse-news.md`

## 14 cre-reports - CRE PDF/report ingests and local CRE context
- marketbeat_swfl
- colliers_industrial
- mhs_databook
- cre_figures
- lee_associates_swfl
- estero_edc
- fmb_recovery
- file: `14-cre-reports.md`

## 15 cre-listings - CRE listing scrapes (Crexi Fedora-pinned, Brevitas) + market heat
- crexi_listings
- brevitas_listings
- market_heat_swfl
- file: `15-cre-listings.md`

## 16 ops-chain - the nightly chain and every job that gates, rebuilds, probes or grades
- nightly-chain
- nightly-chain-dispatch (vercel.json)
- daily-rebuild
- narrative-bake
- freshness-probe-daily
- tripwire-hourly
- supabase-metrics-scrape
- gate-a-parity
- data-targets-daily
- reverify-signals-daily
- view-vintages-monthly
- project-feed-change-detection-daily
- home-values-investor-monthly
- file: `16-ops-chain.md`

## 17 product-schedulers - email / social / outreach / nudges / MLS sync / deliverable builds and sweeps
- email-scheduler
- social-scheduler
- outreach-drip
- outreach-demo
- lifecycle-nudges-daily
- data-readiness-cron
- mls-sync (vercel.json)
- build-example-deliverables
- deliverables-retention-sweep-daily
- social-engagement-poll
- social-pulse-scan
- weekly-read
- file: `17-product-schedulers.md`

## 18 repo-hygiene - doc ratchet, chief-of-staff nightly, watch scan/digest, airtable, graphify, notion
- doc-ratchet-daily
- chief-of-staff-nightly
- watch-scan-daily
- watch-digest-daily
- airtable-checks-sync
- graphify-republish
- notion-sync-weekly
- file: `18-repo-hygiene.md`

## 19 fleet-and-boxes - CROSS-CUTTING: the runner fleet, Spectre/Fedora + Hermes + Codex + Max lanes, the cron-failure issue filer, the doctor, and the coverage_exempt list
- fedora-swfl-local runner
- Hermes / scout-a2a on Spectre
- Codex CLI lane
- Max-plan unattended lane (claude -p OAuth, cloud routines)
- classify/heal/log-cron-failure + the cron-failure label
- the doctor
- coverage_exempt (13 tables)
- the 3 claude-code-action workflows
- file: `19-fleet-and-boxes.md`

Assigned rows: 120 (76 pipelines + 4 not_yet_running + 32 jobs = 112; family 19's 8 rows are seams, not registry entries).
