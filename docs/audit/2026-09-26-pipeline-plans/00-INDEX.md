# 00 — Index of the 19 pipeline-family plans (09/26/2026)

Written by the Opus watcher at the end of the 09/26/2026 wave. One Opus planned each family, and a second Opus re-ran the commands and fixed the file in place (section 13 of every plan). Every number below is quoted from the plan section named beside it; the command that produced it is shown in that section. Nothing here is re-derived.

Where the counts come from:
- Verdicts: hand-counted from section 6 of each plan. Families 01-18 cover 112 registry rows, which reconciles to `00-FAMILIES.md:3` (76 `pipelines:` + 4 `not_yet_running:` + 32 `jobs:`). Family 19's 8 rows are fleet components, not registry rows, and are counted separately.
- DO and ASK-FIRST: counted per item from section 7 of the VERIFIED files (they supersede the planners' first counts, because the second Opus added items). They count plan items, not distinct changes; several items across families are the same change (STATUS.md marks the twins).
- Grades and corrections: each plan's section 13 and the verifier results in the wave's journal (`wf_58e90cd5-d11/journal.jsonl`). All 19 graded PASS-WITH-CORRECTIONS; none needed a rewrite.

The work order lives in `STATUS.md`. The deduplicated list of the operator's decisions is numbered there too.

## Families

### 01 listings-lifecycle — `01-listings-lifecycle.md`
- Verdicts: listing_lifecycle PARK · listing_week PARK · market_aggregates_histogram PARK · market_aggregates_details PARK · rentals_swfl PARK · land_manufactured_swfl RETIRE.
- Top problems:
  - The active-rentals-swfl brain serves nothing: it expired 07/19/2026 and every rebuild fails because its view times out (§4 P12).
  - The parked listing legs red the nightly chain's row gate every night (§4 P7).
  - Three crons report green while landing zero rows against the vendor retired 09/15 (§4 P1).
- DO 13 · ASK-FIRST 3 · verifier PASS-WITH-CORRECTIONS, 72 claims checked, 10 corrections.
- Questions: keep or pull the five frozen listing packs in master; repoint or keep the homepage "Median Sold Price"; delete the 108,648 listing_week replay rows (§12).

### 02 demand-signals — `02-demand-signals.md`
- Verdicts: live_search_daily_median_asking REPAIR · live_search_daily_mortgage GOOD ENOUGH · realtor_geo_trends RETIRE · swfl_search_demand PARK · airdna_str_swfl PARK.
- Top problems:
  - /desk "Live asking median" has shown the frozen 08/14 inventory median dated as today since 08/16 (124 rows, §4 P1).
  - swfl_search_demand returned 402 on DataForSEO's own account balance on 09/02 (§4 P4).
  - realtor_geo_trends goes green while writing nothing, against a vendor that is out (§4 P3).
- DO 10 · ASK-FIRST 3 · PASS-WITH-CORRECTIONS, 73 claims, 8 corrections.
- Questions: restore DataForSEO or park swfl_search_demand (money, answer before 10/02/2026); NULL the 124 frozen rows and delete 63 dead ones; add FRED MORTGAGE15US as a fifth metric (§12).

### 03 zillow — `03-zillow.md`
- Verdicts: all six IMPROVE (zhvi_swfl_duckdb, zhvi_swfl_tier2, zori_swfl_duckdb, zori_swfl_tier2, tier_divergence_swfl_duckdb, tier_divergence_swfl_tier2).
- Top problems:
  - The nightly rebuild stamps a fresh token on last month's Zillow data (09/23 case, §4 P1).
  - A single missed Zillow month passes the loader green (§4 P2).
  - /insiders labels a ZHVI city average as a "median home value" (§4 P5).
- DO 11 · ASK-FIRST 3 · PASS-WITH-CORRECTIONS, 293 claims, 13 corrections.
- Questions: serve Hendry or keep it a documented gap; stop landing the 56 out-of-scope Charlotte/Manatee/Sarasota ZIPs (§12).

### 04 redfin — `04-redfin.md`
- Verdicts: redfin_swfl IMPROVE · redfin_price_drops IMPROVE · redfin_contract_cancellations IMPROVE · redfin_delistings_relistings IMPROVE · redfin_collier GOOD ENOUGH · redfin_lee GOOD ENOUGH · redfin_city_swfl REPAIR.
- Top problems:
  - The city sold series is labelled "monthly" at 5 served sites but is a 3-month rolling median (§4 P2).
  - The seller-stress trio is blind to a frozen source (§4 P1).
  - redfin_swfl's volume floor covers 29% of a healthy pull, 6,000 of 20,592 (§4 P8).
- DO 9 · ASK-FIRST 4 · PASS-WITH-CORRECTIONS, 78 claims, 13 corrections.
- Questions: delete the frozen per-type rows or pull the property-type file; Hendry county rows; collapse seven workflows into four; keep or retire the city pull at the realtor cutover; stop the per-incident issue (answered as a DO by 19 item 4) (§12).

### 05 weather-env — `05-weather-env.md`
- Verdicts: fema REPAIR · hurdat2_fl REPAIR · usgs REPAIR · storm_history_swfl IMPROVE · noaa_ghcn_rainfall IMPROVE.
- Top problems:
  - FEMA's endpoint is removed 10/15/2026, and the pipeline exits 0 when its fetch fails (§4 P1, P2).
  - HURDAT2 is a full season behind: the filename regex cannot read NHC's 8-digit suffix (§4 P5).
  - USGS WaterServices is decommissioned in Q1 2027 (§4 P12).
- DO 15 · ASK-FIRST 5 · PASS-WITH-CORRECTIONS, 191 claims, 16 corrections.
- Questions: which address owns the free USGS Water Data API key; shrink the statewide USGS copy (4,744,886 rows) to the served scope or keep it (§12).

### 06 bls — `06-bls.md`
- Verdicts: bls_ppi IMPROVE · bls_laus IMPROVE · bls_qcew REPAIR · bls_oews_swfl IMPROVE · bls_oews_swfl_tier1 RETIRE (ASK-FIRST).
- Top problems:
  - QCEW's served "YoY" compares Q1 with Q3: Lee wage 4.86 vs 1.49, employment direction inverted (§4 P1).
  - The QCEW cron misses each release by about two months and three quarters are missing (§4 P2).
  - LAUS lands county data 23-28 days after BLS publishes (§4 P3).
- DO 15 · ASK-FIRST 2 · PASS-WITH-CORRECTIONS, 74 claims, 15 corrections.
- Questions: which employment number is the headline (QCEW or OEWS) and whether to add CES/SAE payrolls and QCEW sector lines; delete the OEWS tier-1 prefix and registry entry (§12).

### 07 federal-econ — `07-federal-econ.md`
- Verdicts: census_cbp IMPROVE · census_acs IMPROVE · fdic_bankfind GOOD ENOUGH · fhfa IMPROVE · faf5 REPAIR · fdot GOOD ENOUGH.
- Top problems:
  - macro-florida has not rebuilt since 07/19/2026: its triage model call fails every night and has no permitted lane (§4 P1; the same shape hits macro-us).
  - Vintages are pinned by hand at 10 code sites: CBP is one vintage behind, ACS two (§4 P2, P4).
  - Collier's FHFA metric has never been served live; a fixture invents the vendor rows (§4 P5).
- DO 12 · ASK-FIRST 2 · PASS-WITH-CORRECTIONS, 268 claims, 11 corrections.
- Questions: Collier FHFA as the labelled all-transactions index or no number; drop the corpse view `fdot_aadt_swfl_yearly`; county-grain CBP in macro-swfl; serve Hendry deposits (§12).

### 08 parcels-valuation — `08-parcels-valuation.md`
- Verdicts: leepa REPAIR · leepa_comp_sales IMPROVE · lee_parcels IMPROVE · collier_parcels REPAIR.
- Top problems:
  - collier_parcels drops the last 827 features of every run on a soft 400 (§4 P-1).
  - leepa has never completed on any scheduler (0 green of 5); the lake is three months of sales behind (§4 P-5).
  - The served sold medians carry a false "as of" and window (§4 P-3).
- DO 9 · ASK-FIRST 2 · PASS-WITH-CORRECTIONS, 229 claims, 14 corrections.
- Questions: take FDOR's 2026 preliminary roll now or wait for final; state the sold medians' own data month as their as-of (§12).

### 09 communities — `09-communities.md`
- Verdicts: lee_planned_developments IMPROVE · parcel_community_pd IMPROVE · neighborhood_stats REPAIR · neighborhood_amenities RETIRE (ingest and workflow).
- Top problems:
  - The communities-swfl brain serves a 1,000-row sample as all of SWFL: "53,860 homes in 1,000 neighborhoods" against a table of 20,400 rows and 604,362 homes (§1, §4 P1, §6).
  - INITIALAPPROVAL lands 100% NULL; the fix must land before the 10/02/2026 13:30 UTC fire (§4 P4).
  - Neighborhood pages 404 for most subdivisions (§4 P2).
- DO 16 · ASK-FIRST 4 · PASS-WITH-CORRECTIONS, 74 claims, 12 corrections.
- Questions: keep serving the frozen 08/04/2026 neighborhood scores and amenities, or drop that lane and its three tables (§12).

### 10 permits-records — `10-permits-records.md`
- Verdicts: lee_permits REPAIR · collier_permits IMPROVE · mhs_permits_swfl REPAIR · collier_official_records IMPROVE · lee_deed_official_records PARK.
- Top problems:
  - The commercial-permits brain double-counts 2025: 412 served, 343 real (§4 P1).
  - The permits-swfl z-scores mostly measure missing data (11 of 13 Collier baseline windows empty, §4 P2).
  - The Lee Accela search returns a fixed ~100-row page set whatever the window (§4 P4).
- DO 11 · ASK-FIRST 5 (item 2 is split; its served half is ASK-FIRST) · PASS-WITH-CORRECTIONS, 93 verification commands, 16 corrections.
- Questions: a weekly interactive session for the Lee deed export; MHS row replace; permits z math plus the Collier ZIP rows; rebuild path for the record-level brains; the Collier Applied composite key (§12).

### 11 state-institutional — `11-state-institutional.md`
- Verdicts: fl_dor_tdt REPAIR · fl_dor_sales_tax REPAIR · fdle_crime_swfl IMPROVE · fgcu_reri_indicators REPAIR · rsw_airport_monthly IMPROVE · sba_foia_franchise_outcomes RETIRE (ASK-FIRST).
- Top problems:
  - Green-but-frozen: the freshness seam cannot see a source stall in any of the 5 tables (§4 P1).
  - RSW has served April 2026 since at least 06/14 while May-July were published (§4 P2).
  - TDT source stall with a mislabelled served number (§4 P3).
- DO 12 · ASK-FIRST 6 · PASS-WITH-CORRECTIONS, 199 claims, 16 corrections.
- Questions: retire SBA franchise-outcomes or locate the moved files; keep fgcu-reri with its own rebuild or retire it; Lee TDT from the Lee Clerk PDF (§12).

### 12 dbpr — `12-dbpr.md`
- Verdicts: dbpr_press_releases IMPROVE · dbpr_public_notices REPAIR · dbpr_sirs_submissions IMPROVE · fl_dbpr_licenses REPAIR · fl_dbpr_applicants IMPROVE · dbpr_re_licensees IMPROVE.
- Top problems:
  - The notices parser has found 0 SWFL notices every week since 08/10 while the live page holds Lee notices (§4 P1).
  - 960 stale "Current/Active" rows sit in the served license counts, and the lapse rate cannot see the 1,173 licenses that expired 08/31 (§4 P2).
  - SIRS has not written since 08/06/2026 (§4 P6).
- DO 12 · ASK-FIRST 3 · PASS-WITH-CORRECTIONS, 361 claims, 12 corrections.
- Questions: dbpr_re_licensees keep dark / aggregate-only brain / park; address columns and the CAM board; redefine the lapse rate (§12).

### 13 pulse-news — `13-pulse-news.md`
- Verdicts: city_pulse REPAIR · city_pulse_corridors REPAIR · city_pulse_corridors_tier2 IMPROVE · news_swfl REPAIR · swfl_inc IMPROVE. Also pulse-pool-evict.yml (not a registry row): RETIRE its delete path.
- Top problems:
  - Collier County government news has been dark 96 days; the 07/26 fix went into a path the cron does not use (§4 P1).
  - city_pulse's distill leg has failed 18 nights running: its model call has no permitted lane (§4 P2).
  - The row gate and the doctor both read city_pulse green while the leg is dead (§4 P3).
- DO 15 (item 3 is split) · ASK-FIRST 1 · PASS-WITH-CORRECTIONS, 363 claims, 11 corrections.
- Questions: adopt WINK News county RSS under its terms; revive or delete `/api/cron/news-crawl` (§12).

### 14 cre-reports — `14-cre-reports.md`
- Verdicts: marketbeat_swfl REPAIR · colliers_industrial PARK · mhs_databook GOOD ENOUGH · cre_figures IMPROVE · lee_associates_swfl IMPROVE · estero_edc RETIRE (the job) · fmb_recovery REPAIR.
- Top problems:
  - The MarketBeat cron has never landed a row (§4 problem 1).
  - The FMB page is fetched monthly and thrown away; one expired row is still served (§4 problem 8).
  - cre_figures has no reader and is stale (§4 problem 12).
- DO 22 · ASK-FIRST 6 · PASS-WITH-CORRECTIONS, 91 claims, 8 corrections.
- Questions: wire cre_figures into cre-swfl or retire it; what may count as "verified" for a broker row (§12).

### 15 cre-listings — `15-cre-listings.md`
- Verdicts: crexi_listings REPAIR · brevitas_listings PARK · market_heat_swfl IMPROVE.
- Top problems:
  - A crashed Crexi city is reconciled as an empty market; the next cre-swfl rebuild would serve Fort Myers Beach 2 instead of 8 (§4 P1).
  - Brevitas's lease feed is structurally empty and its one row is a for-sale listing (§4 P5).
  - market_heat's Hotness file was a month stale in 2 of 3 cycles (§4 P8).
- DO 13 (item 6 is split) · ASK-FIRST 1 · PASS-WITH-CORRECTIONS, 40 claim groups, 10 corrections.
- Questions: CRE asking rents beyond Estero and Fort Myers Beach; a CRE for-sale feed with a consumer; delete or close the one Brevitas row and 33 frozen Crexi rows (§12).

### 16 ops-chain — `16-ops-chain.md`
- Verdicts: nightly-chain REPAIR · nightly-chain-dispatch GOOD ENOUGH · daily-rebuild REPAIR · narrative-bake PARK (then Lane M) · freshness-probe-daily REPAIR · tripwire-hourly REPAIR · supabase-metrics-scrape GOOD ENOUGH · gate-a-parity REPAIR · data-targets-daily GOOD ENOUGH · reverify-signals-daily REPAIR · view-vintages-monthly GOOD ENOUGH · project-feed-change-detection-daily GOOD ENOUGH · home-values-investor-monthly GOOD ENOUGH.
- Top problems:
  - Master is held every night: three critical upstreams make model calls with no permitted lane; master `refined_at` is 43 days old (§4 P1, §6).
  - The row gate is red on a parked pipeline and the chain runs twice a night (§4 P2, P3; red 84 of 84 runs since 08/15).
  - freshness-probe-daily is permanently red (85 of 100) and its heartbeat reports success on red (§4 P5, P6).
- DO 14 · ASK-FIRST 1 · PASS-WITH-CORRECTIONS, 203 claims, 14 corrections.
- Questions: cre-swfl corridor prose — A, a weekly Max-plan run on the box, or B, numbers-only. Master stays held until this is answered (§12 Q1).

### 17 product-schedulers — `17-product-schedulers.md`
- Verdicts: email-scheduler IMPROVE · social-scheduler PARK · outreach-drip PARK · outreach-demo PARK · lifecycle-nudges-daily IMPROVE · data-readiness-cron REPAIR · mls-sync PARK · build-example-deliverables PARK · deliverables-retention-sweep-daily GOOD ENOUGH · social-engagement-poll PARK · social-pulse-scan PARK (recommended, ASK-FIRST) · weekly-read PARK.
- Top problems:
  - social-pulse-scan has scanned nothing since 08/09/2026 and the public `/pulse` page shows "Posts scanned 0" (§4 P1).
  - data-readiness has an invented-number tier and runs paid web_search on a schedule (§4 P4, P5).
  - The Healthchecks heartbeat reports success on red runs (§4 P9).
- DO 14 · ASK-FIRST 5 · PASS-WITH-CORRECTIONS, 45 claims (on top of the first Opus's 61), 16 corrections.
- Questions: Social Pulse source or retire; scheduled Email Lab prose; example deliverables; mls-sync cron; what readiness is for; park the scan now (§12).

### 18 repo-hygiene — `18-repo-hygiene.md`
- Verdicts: doc-ratchet-daily REPAIR · chief-of-staff-nightly RETIRE · watch-scan-daily PARK · watch-digest-daily PARK · airtable-checks-sync REPAIR · graphify-republish GOOD ENOUGH · notion-sync-weekly RETIRE (ASK-FIRST).
- Top problems:
  - The doc ratchet cannot fail again while orphans stay below 220; its ledger is 51 days old (§4 P1).
  - The Airtable mirror silently omits 4 of 21 open checks (§4 P7).
  - The Notion hub publishes 05/27 content stamped with this week's date (§4 P8).
- DO 11 (item 14 is a standing no-op) · ASK-FIRST 3 · PASS-WITH-CORRECTIONS, 91 claims, 12 corrections.
- Questions: does he use the Airtable mirror; does he read the Notion hub; when does `REBUILD_PAT` expire (§12).

### 19 fleet-and-boxes — `19-fleet-and-boxes.md` (cross-cutting)
- Verdicts: fedora-swfl-local runner IMPROVE · Hermes / scout-a2a on the Spectre PARK · Codex CLI lane IMPROVE · Max-plan unattended lane REPAIR · classify/heal/log-cron-failure + label REPAIR · the doctor REPAIR · coverage_exempt IMPROVE · the three claude-code-action workflows REPAIR.
- Top problems:
  - The incident logger has failed on every green run since 09/24 (#44 hit the 2,500-comment cap), so issue auto-close is dead (§4 P1).
  - Tripwire has been RED on every scan since 08/07 on a "keep dark" list that went stale 09/20 (§4 P8).
  - The doctor gate is red every day, so its red means nothing (§4 P11).
- DO 23 · ASK-FIRST 3 · PASS-WITH-CORRECTIONS, 124 claims, 22 corrections.
- Questions: the 11-file Healthchecks `/fail` pass; drop `data_lake.dbhydro_stations`; a wired uplink for the box; stop the LAN http.server on the box (§12).

## Fleet-wide roll-up

### Verdicts (112 registry rows, families 01-18)
- GOOD ENOUGH 14: 02 (1), 04 (2), 07 (2), 14 (1), 16 (6), 17 (1), 18 (1).
- IMPROVE 37: 03 (6), 04 (4), 05 (2), 06 (3), 07 (3), 08 (2), 09 (2), 10 (2), 11 (2), 12 (4), 13 (2), 14 (2), 15 (1), 17 (2).
- REPAIR 32: 02 (1), 04 (1), 05 (3), 06 (1), 07 (1), 08 (2), 09 (1), 10 (2), 11 (3), 12 (2), 13 (3), 14 (2), 15 (1), 16 (6), 17 (1), 18 (2).
- PARK 21: 01 (5), 02 (2), 10 (1), 14 (1), 15 (1), 16 (1), 17 (8), 18 (2).
- RETIRE 8: 01 (1), 02 (1), 06 (1, ASK-FIRST), 09 (1), 11 (1, ASK-FIRST), 14 (1), 18 (2, one ASK-FIRST).
- Check: 14 + 37 + 32 + 21 + 8 = 112.
- Fleet components (family 19, not registry rows): IMPROVE 3, PARK 1, REPAIR 4.

### Plan items
- DO: 257 plan items (13 + 10 + 11 + 9 + 15 + 15 + 12 + 9 + 16 + 11 + 12 + 12 + 15 + 22 + 13 + 14 + 14 + 11 + 23). Split items (10 item 2, 13 item 3, 15 item 6) count as DO; their data-write halves sit in the ASK-FIRST list.
- ASK-FIRST: 62 plan items (3 + 3 + 3 + 4 + 5 + 2 + 2 + 2 + 4 + 5 + 6 + 3 + 1 + 6 + 1 + 1 + 5 + 3 + 3). Deduplicated into 64 operator decisions (`19-fleet-and-boxes.md` §7d, one line each; STATUS.md numbers them). The two counts differ because §7d also carries each family's §12 questions and splits some items into separate decisions.
- The second Opus added items in several families (for example 01 items 15-16, 14 items 27-28, 19 item 26); the counts above include them.

### Dark roots (data lands, nothing reads it) and their fate
- listing_week (01): its only reader is the offline `ingest/analysis/challenger.py`. PARK with its upstream (01 item 4), an observed-week guard (01 item 5), label fixes queued behind un-park (01 item 7). Deleting the 108,648 replay rows is ASK-FIRST.
- dbpr_re_licensees (12): keep the ingest and batch its upsert (12 item 8, it runs at 81% of its timeout). Keep dark, an aggregate-only brain, or park the cron is the operator's call (12 §12 Q1).
- cre_figures (14): automate the rebuild (14 item 15). Wire into cre-swfl or retire is ASK-FIRST (14 item 14).
- swfl_search_demand (02): PARK on the DataForSEO 402; restoring the vendor account is his money call (02 §12 Q1). Its NULL-month fallback is fixed either way (02 item 8).
- realtor_geo_trends (02): RETIRE before 10/04/2026 14:00 UTC (02 item 6).
- fdic_locations and fdic_institutions (07 P13): stay tracked by the open check `fdic_directories_no_consumer`; no plan item wires them. Hendry deposits are computed and not served (07 §12 Q4).
- Found this wave: `data_lake.cre_listing_observations` (15 §1 and §5, no reader, no plan item yet); `data_lake.dbhydro_stations` (19 item 12, drop is ASK-FIRST); the OEWS tier-1 archive (06, RETIRE ASK-FIRST); county-grain CBP rows (07 §12 Q3); the frozen SteadyAPI neighborhood tables (09 §12 Q1).

### Box move list (from `19-fleet-and-boxes.md` §7b)
- Already on the box and correct (6 workflows): dbpr_sirs_submissions (hard pin), crexi_listings (hard pin), collier_official_records (gated ternary), leepa_comp_sales (ternary, proven run 35518297483), leepa (ternary, never yet run there), runner-smoke.
- Moves, in order:
  1. leepa (08 item 4): GHA runs hit their job timeout; after 08 item 3's lean run and a dry-run dispatch.
  2. rsw_airport_monthly (11 item 4): gated ternary; raw-PDF archive on the SSD; after 19 items 19 and 20.
  3. marketbeat_swfl (14 §9): gated ternary; C&W PDFs vanish, so archive them.
  4. city_pulse (13 item 6): Lane M shape; needs 19 items 14 and 15 plus 13 item 5.
  5. city_pulse_corridors with corridors_tier2 (13 item 7): same shape and gate.
  6. narrative-bake (16 item 6): Lane M shape.
  7. Zillow vintage archive (03 item 8): a box job per 19 item 18.
  8. market_heat raw vintage archive (15 item 11): a box job per 19 item 18.
  9. lee_permits (10 §9): gated ternary, after 10 item 6's sweep lands.
- Conditional moves: cre-swfl weekly synthesis (only if 16 Q1 = A); colliers_industrial (only if 14 item 21's Fedora browser probe clears); lee_deed fetch (only if 10 item 13's probe passes); Lee Clerk TDT leg (11 item 9, hard pin); brevitas (only on unpark); dbpr press-release fallback (only if 12 item 3's gate fails); build-example-deliverables (only under 17 Q3); factuality-gate grader (19 item 22). listing_lifecycle is NOT moved, by the operator's 09/15 word.
- On the box and should not be: `python3 -m http.server 8765` serving `~/bb-demo` (19 item 25, ASK-FIRST). The other timers on the box belong to other projects and stay.
- What the box lacks: an off-box liveness signal (19 item 8), the Max token (19 item 14), a backup mirror and restore drill (19 item 20), a reboot test (operator step in 19 item 20), the archive budget (19 item 19), a second uplink (19 §12 Q3).

### LLM legs and their lanes (from `19-fleet-and-boxes.md` §7c)
Every leg lands on one of the brief's permitted lanes: D deterministic, M Max plan, C Codex, L local draft-only.
- Redesigned to need no model (Lane D): heal-cron-failure L2 diagnosis (deleted, 19 item 7); macro-us and macro-florida Stage-2 triage (`skipTriageAgent`, 16 item 1); dbpr public-notices summary (deleted, 12 item 2); dbpr press-release enrichment (keyword and county match, 12 item 3, Lane M fallback only if its gate fails); marketbeat vision fallback (deleted, 14 item 7); data-readiness ladder (null lookup, 17 item 6); outreach-drip brand enrichment (a rule at go-live); social-pulse narrative (parked with the scan).
- Retired: chief-of-staff-nightly reconcile (18 item 11); claude-deploy-triage (19 item 23).
- Lane M on the box: city_pulse distill (13 items 5-6); corridor pulse distill (13 item 7); narrative-bake (16 item 6); factuality-gate grader (19 item 22); claude-code-automation `@claude` via the OAuth token, owner-only (19 item 23).
- Operator's call: cre-swfl Stage-2 triage and Stage-3 synthesis (16 Q1: A weekly Lane M, or B no model; 06 item 16 keeps the PPI fragments out either way).
- Lane M interactive: corridor-character synthesizer (operator-run tool); build-example-deliverables narrative (only under 17 Q3); the one-time rental-source search (01 item 16).
- Outside this plan's internal premise (customer-facing, no lane assigned): email-scheduler block refill (17 Q2); request-time email authoring (`lib/deliverable/recipes/shared.ts:804`, `lib/email/insiders/author.ts:134`).
- Lane L, draft-only: swfl-morning-market-watch on Windows Hermes (kept, 19 item 21).
- Lane C, local only: second review of data_lake-shape diffs and classifier rules (19 item 17, 16 item 14).

### The watcher
The operator asked for Opus to take over watching when the main session runs out of usage. That is 19 item 16, in three layers: layer 1 is deterministic and fires whatever the usage state (the checks ledger, tripwire, the daily doctor); layer 2 repurposes the `weekly-platform-health` cloud routine into a daily Opus routine that reads only layer 1's outputs and sends one notification when the set of open reds changes; layer 3 is the interactive session reading the same outputs at pickup. It is a DO item in STATUS phase 5 and is NOT live yet. The only existing health routine pushed a false all-clear on 09/21 (19 §4 P17).
