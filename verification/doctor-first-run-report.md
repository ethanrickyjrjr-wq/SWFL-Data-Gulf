## doctor — pipeline health · 2026-07-12T02:38:14Z

**16 red · 26 yellow · 30 green** of 72 datasets. Workflow joined: 71/72 · content contracts: 7/72 · gh: ok · manifest: ok

| Dataset | Kind | Fresh | Volume | Content | Run | Health |
| --- | --- | --- | --- | --- | --- | --- |
| `bls_oews_swfl` | table | FRESH | OK | NO_CONTRACT | NEVER_RAN | 🔴 red |
| `bls_oews_swfl_tier1` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | NEVER_RAN | 🔴 red |
| `brevitas_listings` | table | OVERDUE | OK | NO_CONTRACT | RED | 🔴 red |
| `census_acs` | table | FRESH | OK | NO_CONTRACT | NEVER_RAN | 🔴 red |
| `colliers_industrial` | table | FRESH | OK | NO_CONTRACT | DISABLED | 🔴 red |
| `dbpr_re_licensees` | table | MISSING | LOW_VOLUME | NO_CONTRACT | NEVER_RAN | 🔴 red |
| `dbpr_sirs_submissions` | table | FRESH | OK | NO_CONTRACT | DISABLED | 🔴 red |
| `fema` | table | FRESH | OK | NO_CONTRACT | TIMEOUT | 🔴 red |
| `fgcu_reri_indicators` | table | FRESH | LOW_VOLUME | NO_CONTRACT | DISABLED | 🔴 red |
| `lee_associates_swfl` | table | WAITING | OK | NO_CONTRACT | NEVER_RAN | 🔴 red |
| `listing_lifecycle` | table | FRESH | OK | FAIL | GREEN | 🔴 red |
| `marketbeat_swfl` | table | FRESH | OK | NO_CONTRACT | DISABLED | 🔴 red |
| `mhs_permits_swfl` | table | FRESH | OK | NO_CONTRACT | NEVER_RAN | 🔴 red |
| `noaa_ghcn_rainfall` | table | FRESH | LOW_VOLUME | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🔴 red |
| `redfin_city_swfl` | missing | MISSING | UNRESOLVED | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🔴 red |
| `rsw_airport_monthly` | table | FRESH | OK | NO_CONTRACT | DISABLED | 🔴 red |
| `city_pulse_corridors` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | DISABLED | 🟡 yellow |
| `city_pulse_corridors_tier2` | table | FRESH | NO_FLOOR | NO_CONTRACT | DISABLED | 🟡 yellow |
| `collier_permits` | table | FRESH | OK | NO_CONTRACT | DISABLED | 🟡 yellow |
| `crexi_listings` | table | WINDOW_OPEN | OK | NO_CONTRACT | GREEN | 🟡 yellow |
| `data_lake.listing_active_stats` | view | NO_REGISTRY_ENTRY | NO_REGISTRY_ENTRY | PASS | NO_WORKFLOW | 🟡 yellow |
| `fdot` | table | FRESH | OK | NO_CONTRACT | CANCELLED | 🟡 yellow |
| `leepa` | table | FRESH | OK | PASS | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `market_aggregates_details` | table | FRESH | NO_FLOOR | FAIL | GREEN | 🟡 yellow |
| `market_aggregates_histogram` | table | FRESH | NO_FLOOR | NO_CONTRACT | GREEN | 🟡 yellow |
| `mhs_databook` | table | FRESH | OK | NO_CONTRACT | NO_WORKFLOW | 🟡 yellow |
| `redfin_collier` | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `redfin_contract_cancellations` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `redfin_delistings_relistings` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `redfin_lee` | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `redfin_price_drops` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `redfin_swfl` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `rentals_swfl` | table | FRESH | NO_FLOOR | NO_CONTRACT | GREEN | 🟡 yellow |
| `swfl_inc` | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `swfl_search_demand` | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `tier_divergence_swfl_duckdb` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `tier_divergence_swfl_tier2` | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `usgs_tier2` | table | FRESH | OK | NO_CONTRACT | NO_WORKFLOW | 🟡 yellow |
| `zhvi_swfl_duckdb` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `zhvi_swfl_tier2` | table | FRESH | OK | PASS | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `zori_swfl_duckdb` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `zori_swfl_tier2` | table | FRESH | OK | PASS | NO_RUNS_IN_WINDOW | 🟡 yellow |
| `active_listings` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `bls_laus` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `bls_ppi` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `bls_qcew` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `census_cbp` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `census_vip` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `city_pulse` | table | FRESH | GATED_BY_ASSERT_LANDED | NO_CONTRACT | GREEN | 🟢 green |
| `collier_parcels` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `dbpr_press_releases` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `dbpr_public_notices` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `estero_edc` | table | WAITING | OK | NO_CONTRACT | GREEN | 🟢 green |
| `faf5` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `fdle_crime_swfl` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fhfa` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fl_dbpr_applicants` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fl_dbpr_licenses` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fl_dor_sales_tax` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fl_dor_tdt` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fmb_recovery` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `fred_g17` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `fred_laus_alfred` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `fred_listing_swfl` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `hurdat2_fl` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `lee_permits` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `live_search_daily_median_price` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `live_search_daily_mortgage` | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green |
| `market_heat_swfl` | tier-1 | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `news_swfl` | table | FRESH | OK | PASS | GREEN | 🟢 green |
| `storm_history_swfl` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |
| `usgs` | tier-1-duckdb | FRESH | NOT_APPLICABLE | NO_CONTRACT | GREEN | 🟢 green |

### Prescriptions

🔴 **`bls_oews_swfl_tier1` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `bls-oews-annual.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow bls-oews-annual.yml has never run (confirmed by a targeted `gh run list --workflow` backfill, not merely absent from the bulk window).
🔴 **`bls_oews_swfl` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `bls-oews-annual.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow bls-oews-annual.yml has never run (confirmed by a targeted `gh run list --workflow` backfill, not merely absent from the bulk window).
🔴 **`census_acs` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `census-acs-annual.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow census-acs-annual.yml has never run (confirmed by a targeted `gh run list --workflow` backfill, not merely absent from the bulk window).
🔴 **`fema` — TIMEOUT_KILL** (should_retry=false)
   - fix: Run hit its ceiling and was killed — raise `timeout-minutes` in `.github/workflows/fema-nfip-quarterly.yml`, or shrink the batch. DO NOT RE-RUN: should_retry=false. A retry re-burns the identical spend and hits the identical ceiling.
   - evidence: cancelled at >=95% of timeout-minutes; https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/28744412719
🔴 **`redfin_city_swfl` — NEVER_LANDED** (should_retry=false)
   - fix: `ingest/cadence_registry.yaml` claims table `data_lake.redfin_city_swfl` but the DB has no successful load for it. Either dispatch `.github/workflows/redfin-city-swfl-monthly.yml` once and confirm it lands, or delete the registry entry. A registry entry pointing at a ghost table reads FRESH forever.
   - evidence: freshness=MISSING volume=UNRESOLVED pg_class kind=missing
🔴 **`fgcu_reri_indicators` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `fgcu-reri-monthly.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow fgcu-reri-monthly.yml carries a cron in source but its state at the GitHub API is disabled_manually — a schedule nobody is running. No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
🔴 **`rsw_airport_monthly` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `rsw-airport-monthly.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow rsw-airport-monthly.yml carries a cron in source but its state at the GitHub API is disabled_manually — a schedule nobody is running. No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
🔴 **`dbpr_sirs_submissions` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `dbpr-sirs-monthly.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow dbpr-sirs-monthly.yml carries a cron in source but its state at the GitHub API is disabled_manually — a schedule nobody is running. No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
🔴 **`dbpr_re_licensees` — NEVER_LANDED** (should_retry=false)
   - fix: `ingest/cadence_registry.yaml` claims table `public.dbpr_re_licensees` but the DB has no successful load for it. Either dispatch `.github/workflows/ingest-dbpr-re-licensees.yml` once and confirm it lands, or delete the registry entry. A registry entry pointing at a ghost table reads FRESH forever.
   - evidence: freshness=MISSING volume=LOW_VOLUME pg_class kind=table
🔴 **`noaa_ghcn_rainfall` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `noaa-ghcn-rainfall-monthly.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: line is red but no signal is red: freshness=FRESH volume=LOW_VOLUME content=NO_CONTRACT run=NO_RUNS_IN_WINDOW
🔴 **`marketbeat_swfl` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `marketbeat-pdf-ingest.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow marketbeat-pdf-ingest.yml carries a cron in source but its state at the GitHub API is disabled_manually — a schedule nobody is running. No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
🔴 **`colliers_industrial` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `marketbeat-pdf-ingest.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow marketbeat-pdf-ingest.yml carries a cron in source but its state at the GitHub API is disabled_manually — a schedule nobody is running. No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
🔴 **`mhs_permits_swfl` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `ingest-mhs-permits-swfl.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow ingest-mhs-permits-swfl.yml has never run (confirmed by a targeted `gh run list --workflow` backfill, not merely absent from the bulk window).
🔴 **`brevitas_listings` — TRANSIENT** (should_retry=true)
   - fix: Transient failure in `.github/workflows/ingest-brevitas-listings.yml` — retry up to 2x. If it fails a third time it is NOT transient: escalate and classify it for real.
   - evidence: 2 consecutive failure(s); https://github.com/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/runs/28743175614
🔴 **`lee_associates_swfl` — UNKNOWN** (should_retry=false)
   - fix: Unknown class for `ingest-lee-associates-swfl.yml` — evidence is attached below; NO diagnosis was invented. Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the literal in the Phase-3b incident handler — the enum is shared).
   - evidence: workflow ingest-lee-associates-swfl.yml has never run (confirmed by a targeted `gh run list --workflow` backfill, not merely absent from the bulk window).
🔴 **`listing_lifecycle` — content contract failed**: `data_lake.listing_state.list_price` listing_state_home_price_floor (error) — 21 failing rows. Fix the data or the contract in `ingest/quality/quality_registry.yaml`.
