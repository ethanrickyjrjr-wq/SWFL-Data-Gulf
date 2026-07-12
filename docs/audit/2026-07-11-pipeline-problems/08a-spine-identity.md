# 08a — The Spine: per-pipeline identity records + Phase-2 drift fixtures

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

The six structured registry fields the spec's §3 Spine needs, resolved per pipeline against the actual pipeline code and workflow YAML — plus every identity drift found (both sides named). **The drift table at the bottom is the Phase-2 expected-RED fixture set** (spec §6): each is a real, currently-true disagreement that `check-registry-identity.mts --static` must catch.

---

## Coverage

74 registry entries resolved.

Lane split: tier-2-nondlt=28 · tier-1=20 · tier-2-dlt=23 · parked=3

Entries carrying at least one drift: **63 of 74**.

---

## The Spine backfill table (`workflow:` · `consuming_pack:` · `source_tag:` · lane · nightly)

| pipeline | lane | workflow | consuming_pack | source_tag | source_tag evidence | timeout | nightly |
|---|---|---|---|---|---|---|---|
| `live_search_daily_median_price` | tier-2-nondlt | `live-search-daily.yml` | freshness-pulse | live_search | ingest/pipelines/live_search/engine.py:67 | 25 | **yes** (min_rows=3) |
| `live_search_daily_mortgage` | tier-2-nondlt | `live-search-daily.yml` | freshness-pulse | live_search | ingest/pipelines/live_search/engine.py:67 | 25 | **yes** (min_rows=1) |
| `zori_swfl_duckdb` | tier-1 | `zori-tier1-monthly.yml` | rentals-swfl | N/A | N/A | 20 | — |
| `zhvi_swfl_duckdb` | tier-1 | `zhvi-tier1-monthly.yml` | home-values-swfl | N/A | N/A | 20 | — |
| `tier_divergence_swfl_duckdb` | tier-1 | `tier-divergence-tier1-monthly.yml` | tier-divergence-swfl | N/A | N/A | 25 | — |
| `redfin_swfl` | tier-1 | `redfin-monthly.yml` | housing-swfl | N/A | N/A | 30 | — |
| `redfin_price_drops` | tier-1 | `redfin-price-drops-monthly.yml` | seller-stress-swfl | N/A | N/A | 30 | — |
| `redfin_contract_cancellations` | tier-1 | `redfin-contract-cancellations-monthly.yml` | seller-stress-swfl | N/A | N/A | 30 | — |
| `redfin_delistings_relistings` | tier-1 | `redfin-delistings-relistings-monthly.yml` | seller-stress-swfl | N/A | N/A | 30 | — |
| `hurdat2_fl` | tier-1 | `hurdat2-annual.yml` | hurricane-tracks-fl | N/A | N/A | 15 | — |
| `storm_history_swfl` | tier-1 | `storm-history-monthly.yml` | storm-history-swfl | N/A | N/A | 20 | — |
| `usgs` | tier-1 | `usgs-monthly.yml` | env-swfl | N/A | N/A | 20 | — |
| `faf5` | tier-1 | `faf5-annual.yml` | logistics-swfl | N/A | N/A | 30 | — |
| `fred_g17` | tier-1 | `ingest-fred-g17.yml` | none | N/A | N/A | 15 | — |
| `fred_laus_alfred` | tier-1 | `fred-laus-alfred-monthly.yml` | none | N/A | N/A | 15 | — |
| `fred_listing_swfl` | tier-1 | `ingest-fred-listing-swfl.yml` | none | N/A | N/A | 15 | — |
| `market_heat_swfl` | tier-1 | `ingest-market-heat-swfl.yml` | market-heat-swfl | N/A | N/A | 15 | — |
| `bls_ppi` | tier-1 | `ingest-bls-ppi.yml` | none | N/A | N/A | 15 | — |
| `bls_oews_swfl_tier1` | tier-1 | `bls-oews-annual.yml` | labor-demand-swfl | N/A | N/A | 20 | — |
| `census_vip` | tier-1 | `ingest-census-vip.yml` | none | N/A | N/A | 15 | — |
| `city_pulse` | tier-1 | `city-pulse-daily.yml` | city-pulse-swfl | N/A | N/A | 45 | **yes** (min_rows=50) |
| `city_pulse_corridors` | tier-1 | `corridor-pulse-weekly.yml` | corridor-pulse-swfl, cre-swfl | N/A | N/A | 90 | — |
| `bls_laus` | tier-2-dlt | `bls-laus-monthly.yml` | macro-swfl | N/A | N/A | 20 | — |
| `bls_qcew` | tier-2-dlt | `bls-qcew-quarterly.yml` | macro-swfl | N/A | N/A | 20 | — |
| `bls_oews_swfl` | tier-2-dlt | `bls-oews-annual.yml` | labor-demand-swfl | N/A | N/A | 20 | — |
| `census_cbp` | tier-2-dlt | `census-cbp-annual.yml` | macro-florida | N/A | N/A | 30 | — |
| `census_acs` | tier-2-dlt | `census-acs-annual.yml` | none | N/A | N/A | 30 | — |
| `usgs_tier2` | tier-2-dlt | `NONE` | env-swfl | N/A | N/A | N/A (no workflow) | — |
| `fema` | tier-2-dlt | `fema-nfip-quarterly.yml` | env-swfl, hurricane-tracks-fl | N/A | N/A | 30 | — |
| `leepa` | tier-2-dlt | `leepa-parcels-annual.yml` | properties-lee-value | N/A | N/A | 30 | — |
| `redfin_collier` | tier-2-dlt | `redfin-collier-monthly.yml` | properties-collier-value | N/A | N/A | 30 | — |
| `redfin_lee` | tier-2-dlt | `redfin-lee-monthly.yml` | properties-lee-value | N/A | N/A | 30 | — |
| `redfin_city_swfl` | tier-2-dlt | `redfin-city-swfl-monthly.yml` | none | N/A | N/A | 45 | — |
| `collier_parcels` | tier-2-dlt | `collier-parcels-annual.yml` | properties-collier-value | N/A | N/A | 45 | — |
| `fhfa` | tier-2-dlt | `fhfa-hpi-quarterly.yml` | properties-collier-value, properties-lee-value | N/A | N/A | 20 | — |
| `fdot` | tier-2-dlt | `fdot-aadt-annual.yml` | traffic-swfl, logistics-swfl-nowcast | N/A | N/A | 40 | — |
| `lee_permits` | tier-2-dlt | `lee-permits-weekly.yml` | permits-swfl | N/A | N/A | 30 | — |
| `collier_permits` | tier-2-dlt | `collier-permits-monthly.yml` | permits-swfl | N/A | N/A | 30 | — |
| `fl_dor_tdt` | tier-2-nondlt | `fl-dor-tdt-monthly.yml` | tourism-tdt | N/A | N/A | 20 | — |
| `fl_dor_sales_tax` | tier-2-nondlt | `fl-dor-sales-tax-monthly.yml` | sector-credit-swfl | N/A | N/A | 20 | — |
| `fdle_crime_swfl` | tier-2-nondlt | `fdle-crime-quarterly.yml` | safety-swfl | N/A | N/A | 15 | — |
| `zori_swfl_tier2` | tier-2-dlt | `zori-tier2-monthly.yml` | rentals-swfl | N/A | N/A | 15 | — |
| `zhvi_swfl_tier2` | tier-2-dlt | `zhvi-tier2-monthly.yml` | home-values-swfl | N/A | N/A | 15 | — |
| `tier_divergence_swfl_tier2` | tier-2-dlt | `tier-divergence-tier2-monthly.yml` | tier-divergence-swfl | N/A | N/A | 15 | — |
| `fgcu_reri_indicators` | tier-2-nondlt | `fgcu-reri-monthly.yml` | fgcu-reri | N/A | N/A | 10 | — |
| `swfl_inc` | tier-2-nondlt | `swfl-inc-weekly.yml` | econ-dev-swfl | N/A | N/A | 15 | — |
| `dbpr_press_releases` | tier-2-nondlt | `dbpr-press-releases-weekly.yml` | news-swfl | N/A | N/A | 20 | — |
| `rsw_airport_monthly` | tier-2-nondlt | `rsw-airport-monthly.yml` | rsw-airport | N/A | N/A | 10 | — |
| `dbpr_sirs_submissions` | tier-2-nondlt | `dbpr-sirs-monthly.yml` | condo-sirs-swfl | N/A | N/A | 30 | — |
| `fl_dbpr_licenses` | tier-2-dlt | `ingest-fl-dbpr-licenses.yml` | licenses-swfl | N/A | N/A | 15 | — |
| `fl_dbpr_applicants` | tier-2-dlt | `ingest-fl-dbpr-licenses.yml` | licenses-swfl | N/A | N/A | 15 | — |
| `dbpr_public_notices` | tier-2-nondlt | `dbpr-public-notices-weekly.yml` | news-swfl | N/A | N/A | 20 | — |
| `dbpr_re_licensees` | tier-2-nondlt | `ingest-dbpr-re-licensees.yml` | none | dbpr_re_rgn7 | ingest/pipelines/dbpr_re_licensees/pipeline.py:123 | 15 | — |
| `noaa_ghcn_rainfall` | tier-2-dlt | `noaa-ghcn-rainfall-monthly.yml` | env-swfl | N/A | N/A | 20 | — |
| `city_pulse_corridors_tier2` | tier-2-nondlt | `corridor-pulse-weekly.yml` | corridor-pulse-swfl,cre-swfl | N/A | N/A | 90 | — |
| `marketbeat_swfl` | tier-2-nondlt | `marketbeat-pdf-ingest.yml` | cre-swfl | cw_marketbeat | ingest/pipelines/marketbeat_pdf/extractor.py:184 (source_name literal); also source_from_filename maps 'marketbeat*' -> 'cw_marketbeat' at extractor.py:52-53 | 20 | — |
| `colliers_industrial` | tier-2-nondlt | `marketbeat-pdf-ingest.yml` | cre-swfl | colliers_industrial | ingest/pipelines/marketbeat_pdf/extractor.py:282 (source_name literal); also source_from_filename maps 'colliers*' -> 'colliers_industrial' at extractor.py:54-55 | 20 | — |
| `mhs_databook` | tier-2-nondlt | `NONE` | cre-swfl | mhs_databook | N/A — registry source_name literal (cadence_registry.yaml:1244); NO committed pipeline writes it (see drift) | N/A (no workflow) | — |
| `swfl_search_demand` | tier-2-nondlt | `swfl-search-demand-monthly.yml` | none | N/A | N/A | 15 | — |
| `mhs_permits_swfl` | tier-2-nondlt | `ingest-mhs-permits-swfl.yml` | permits-commercial-swfl | mhs_databook | ingest/pipelines/mhs_permits_swfl/extract.py:36 (SOURCE_NAME = "mhs_databook") | 30 | — |
| `crexi_listings` | tier-2-nondlt | `ingest-crexi-listings.yml` | cre-swfl | N/A | N/A | 30 | — |
| `brevitas_listings` | tier-2-nondlt | `ingest-brevitas-listings.yml` | cre-swfl | N/A | N/A | 20 | — |
| `lee_associates_swfl` | tier-2-nondlt | `ingest-lee-associates-swfl.yml` | cre-swfl | N/A | N/A | 15 | — |
| `estero_edc` | tier-2-nondlt | `ingest-local-cre-context.yml` | cre-swfl | N/A | N/A | 15 | — |
| `fmb_recovery` | tier-2-nondlt | `ingest-local-cre-context.yml` | cre-swfl | N/A | N/A | 15 | — |
| `news_swfl` | tier-2-dlt | `news-swfl-ingest.yml` | none | news_crawl (registry value only; no code literal) | N/A | 30 | — |
| `active_listings` | tier-2-nondlt | `active-listings-daily.yml` | none | N/A | N/A | 30 | **yes** (min_rows=2000) |
| `listing_lifecycle` | tier-2-nondlt | `listing-lifecycle-daily.yml` | active-listings-swfl | N/A | N/A | 60 | **yes** (min_rows=9000) |
| `market_aggregates_histogram` | tier-2-nondlt | `ingest-market-aggregates-histogram.yml` | price-distribution-swfl | realtor.com | ingest/pipelines/market_aggregates/constants.py:24 | 10 | — |
| `market_aggregates_details` | tier-2-nondlt | `ingest-market-aggregates-details.yml` | market-temperature-swfl | realtor.com | ingest/pipelines/market_aggregates/constants.py:24 | 15 | — |
| `rentals_swfl` | tier-2-nondlt | `ingest-rentals.yml` | active-rentals-swfl | realtor.com | ingest/pipelines/rentals/constants.py:22 | 15 | — |
| `sba_foia_franchise_outcomes` | parked | `franchise-outcomes-quarterly.yml` | franchise-outcomes | N/A | N/A | 45 | — |
| `airdna_str_swfl` | parked | `NONE` | investor-zip-swfl | N/A | N/A | N/A | — |
| `land_manufactured_swfl` | parked | `NONE` | active-listings-swfl | N/A | N/A | N/A | — |

---

## Phase-2 drift fixtures — every identity disagreement found

Each line is a real drift. These are the seeded expected-RED cases for `check-registry-identity.mts --static` (spec §6/§9).

### `live_search_daily_median_price`

- source_tag: code literal = 'live_search' (engine.py:67; also pipeline.py:29 ON CONFLICT key) vs registry has NO structured source_tag field — only a freeform prose note at cadence_registry.yaml:52-54 about the exact source_tag-vs-source_name mismatch that cost 2 weeks of false-RED. This IS the Spine §3 gap.
- registry has no structured 'workflow:' field (Spine gap); actual workflow = live-search-daily.yml (runs `python -m ingest.pipelines.live_search.pipeline` at :58).
- workflow wires SPIDER_API_KEY + ANTHROPIC_API_KEY (live-search-daily.yml:47-48) but engine.py never reads them — Firecrawl/Spider/Claude cascade legs are stubbed no-ops (engine.py:191,196-199). Wired-but-dead, not a secret-not-wired kill.

Lane = tier-2 non-dlt: raw psycopg INSERT...ON CONFLICT upsert into data_lake.daily_truth (pipeline.py:22-75), single-writer, freshness via retrieved_at column (registry :51). Consumer freshness-pulse reads daily_truth via refinery/sources/daily-truth-source.mts (SOURCE_ID/TABLE 'daily_truth', :37). This metric uses the Gemini-grounded leg only (GEMINI_API_KEY, engine.py:146), fetch_mode=search, 3 areas (cape_coral/fort_myers/naples). DB creds via _uri() (migrate_nfip_flood_zone_current, reads DESTINATION__POSTGRES__CREDENTIALS) + migrate_daily_truth step. Registry expected_rows_min=1; suggest min_rows=3 (1 row/area, catches 'only 2 of 3 areas landed'). SUPABASE_URL/SUPABASE_SERVICE_KEY wired but unread. Audit 03 §1c: FRESH 1d. One of the 4 nightly load-bearing sources (spec §3: 'live-search').

### `live_search_daily_mortgage`

- source_tag: code literal = 'live_search' (engine.py:67) vs registry has NO structured source_tag field — only the freeform note at cadence_registry.yaml:88 referencing the source_tag/source_name fix. Spine §3 gap.
- registry has no structured 'workflow:' field (Spine gap); actual workflow = live-search-daily.yml (shared with median_price — one `pipeline.py` run resolves ALL live_search_config entries).
- fetch_mode=api (FRED MORTGAGE30US) so this metric does NOT use the search cascade — GEMINI_API_KEY/SPIDER_API_KEY/ANTHROPIC_API_KEY are irrelevant to it though wired at the workflow level.

Lane = tier-2 non-dlt, same daily_truth writer/consumer as median_price. fetch_mode=api → engine.resolve_metric_api reads FRED_API_KEY (engine.py:308) for series MORTGAGE30US; area=['swfl'] (1 row). Shares the live-search-daily.yml workflow and the ingest.pipelines.live_search.pipeline process with median_price, so the engine module reads both GEMINI+FRED regardless; this metric's own path only needs FRED + DB creds. DB creds via _uri()/migrate_daily_truth (DESTINATION__POSTGRES__CREDENTIALS). Registry expected_rows_min=1 → min_rows=1. Audit 03 §1c: FRESH 1d.

### `zori_swfl_duckdb`

- INDIRECT CONSUMER EDGE: pack rentals-swfl reads the Tier-2 table data_lake.zori_swfl (refinery/sources/zori-source.mts:57 `.from('zori_swfl')`), NOT this tier-1 parquet directly. The parquet is promoted to that table by a SEPARATE tier-2 pipeline (registry entry zori_swfl_tier2, code ingest/pipelines/zori_swfl/, outside this chunk).
- TWO CODE COPIES same base name: tier-1 fetch = ingest/duckdb_pipelines/zori_swfl (THIS entry, run by zori-tier1-monthly.yml:46/48); tier-2 promotion = ingest/pipelines/zori_swfl (reads DESTINATION__POSTGRES__CREDENTIALS). Easy to grep the wrong one.
- registry has no structured 'workflow:' field (Spine gap); entry carries only a 'Verified:' comment (cadence_registry.yaml:121). Actual workflow = zori-tier1-monthly.yml.

Producer path VERIFIED: constants.py:33 PARQUET_PATH='market/zori_swfl.parquet' + BUCKET='lake-tier1' == registry inventory_id 'lake-tier1/market/zori_swfl.parquet' ✓. constants.py:37 PACK_ID='rentals-swfl' confirms consumer. _tier1_inventory pointer upsert via ingest/lib/tier1_inventory.py::_get_connection (env-first DESTINATION__POSTGRES__CREDENTIALS, .dlt/secrets.toml fallback). SUPABASE_URL/SUPABASE_SERVICE_KEY wired but unread (wired-unused, not a kill). Audit 03 §1c: tier-1 FRESH 21d.

### `zhvi_swfl_duckdb`

- INDIRECT CONSUMER EDGE: pack home-values-swfl reads Tier-2 data_lake.zhvi_swfl (refinery/sources/zhvi-source.mts:57 `.from('zhvi_swfl')`), NOT this parquet directly. Promoted by a separate tier-2 pipeline (registry zhvi_swfl_tier2, code ingest/pipelines/zhvi_swfl).
- DOWNSTREAM SILENT-STALE RISK: the tier-2 promotion that populates the table the pack actually reads (workflow zhvi-tier2-monthly.yml) has been BROKEN 18 days silently per audit 01 (RED NOW #3), while THIS tier-1 entry looks FRESH (audit 03 §1c: 13d). Tier-1 fetch healthy, consumer table stalling — a lane split the registry does not connect.
- registry entry names the workflow only in a freeform comment (cadence_registry.yaml:140 'Cron: zhvi-tier1-monthly.yml; Pack: refinery/packs/home-values-swfl.mts'), no structured 'workflow:' field (Spine gap).

Producer path VERIFIED: constants.py:35 PARQUET_PATH='market/zhvi_swfl.parquet' == registry inventory_id 'lake-tier1/market/zhvi_swfl.parquet' ✓. constants.py:39 PACK_ID='home-values-swfl' matches the registry comment. _tier1_inventory upsert via tier1_inventory.py (DESTINATION__POSTGRES__CREDENTIALS). SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unused. Sibling tier-2 promo directory ingest/pipelines/zhvi_swfl.

### `tier_divergence_swfl_duckdb`

- DRY-RUN DRIFT: the workflow's --dry-run branch runs `ingest.duckdb_pipelines.tier_divergence_swfl.probe_grain` (tier-divergence-tier1-monthly.yml:47) while the live branch runs `.pipeline` (line 49). The dry-run validates a DIFFERENT module than the live run executes — the pipeline-freshness '--dry-run in the same PR' guarantee does not exercise the real code path here (unique to this entry; every other pipeline in this chunk runs `.pipeline --dry-run`).
- ORPHAN CONSUMER: pack tier-divergence-swfl is registered (constants.py:56 PACK_ID='tier-divergence-swfl'; refinery/packs/tier-divergence-swfl.mts exists) but the brain has NEVER built — brains/tier-divergence-swfl.md is absent, GET /api/b/tier-divergence-swfl returns 404, and it is NOT in master's DAG (audit 04). This fresh tier-1 pipeline feeds a brain that never ships.
- INDIRECT CONSUMER EDGE: pack reads Tier-2 view data_lake.tier_divergence_zip_latest over table tier_divergence_swfl (fed by separate tier_divergence_swfl_tier2 promotion), not this parquet directly.
- registry names workflow only in a freeform comment (cadence_registry.yaml:158), no structured 'workflow:' field (Spine gap).

Producer path VERIFIED: constants.py:52 PARQUET_PATH='market/tier_divergence_swfl.parquet' == registry inventory_id 'lake-tier1/market/tier_divergence_swfl.parquet' ✓. _tier1_inventory upsert via tier1_inventory.py (DESTINATION__POSTGRES__CREDENTIALS). Audit 03 §1c: tier-1 FRESH 20d; tier-2 (tier_divergence_swfl_tier2) 19d — data is live but the brain is orphaned. Ties to open checks tier_divergence_dag_orphan (spec §7 3f / check linkage). SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unused.

### `redfin_swfl`

- WORKFLOW-FILENAME CONVENTION MISMATCH: the file is redfin-monthly.yml (workflow name 'Redfin SWFL Tier 1 monthly') while every sibling redfin tier-1 pipeline in this chunk uses redfin-<x>-monthly.yml. Functionally correct (runs `ingest.duckdb_pipelines.redfin_swfl.pipeline`, redfin-monthly.yml:47/49) — a Spine-map ambiguity, not a runtime break. NOTE: redfin-lee-monthly.yml / redfin-collier-monthly.yml are the SEPARATE tier-2 dlt pipelines (redfin_lee/redfin_collier), not this one.
- registry has no structured 'workflow:' field (Spine gap); entry carries only a 'First run: 2026-05-27' comment. Actual workflow = redfin-monthly.yml.

Producer path VERIFIED: constants.py:21 PARQUET_PATH='market/redfin_swfl.parquet' == registry inventory_id ✓. constants.py:25 PACK_ID='housing-swfl'. DIRECT consumer edge: housing-swfl reads the S3 parquet directly (refinery/sources/housing-source.mts:67 s3://lake-tier1/market/redfin_swfl.parquet), no tier-2 hop. _tier1_inventory upsert via tier1_inventory.py (DESTINATION__POSTGRES__CREDENTIALS). Historical ACTION_VERSION incident (checkout@v6, 05-26 per audit 01 failure-class table) since fixed — @v6 is valid today (spec §4), so NOT flagged. SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unread. Audit 03 §1c: FRESH 26d.

### `redfin_price_drops`

- registry has no structured 'workflow:' field (Spine gap); entry carries the cron in a freeform comment ('Cron: 0 17 15 * *', cadence_registry.yaml:195) which MATCHES workflow redfin-price-drops-monthly.yml:8 but names no file.
- consumer SOURCE_ID drift is cosmetic-only: pipeline/table name 'redfin_price_drops' vs the pack's source id 'redfin_price_drops_swfl' (refinery/sources/stress-price-drops-source.mts:22) — the _swfl suffix is on the refinery source id, not the parquet; parquet path itself matches.

Producer path VERIFIED: constants.py:22 PARQUET_PATH='market/redfin_price_drops.parquet' == registry inventory_id ✓. constants.py:25 PACK_ID='seller-stress-swfl'. DIRECT consumer edge: seller-stress-swfl reads the parquet directly (refinery/sources/stress-price-drops-source.mts:30 s3://lake-tier1/market/redfin_price_drops.parquet). Cron comment matches workflow (0 17 15 * *). _tier1_inventory upsert via tier1_inventory.py. SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unread. Audit 03 §1c: FRESH 26d.

### `redfin_contract_cancellations`

- registry has no structured 'workflow:' field (Spine gap); cron in freeform comment ('0 18 15 * *', cadence_registry.yaml:210) MATCHES workflow redfin-contract-cancellations-monthly.yml:8 but names no file.
- cosmetic SOURCE_ID suffix: table 'redfin_contract_cancellations' vs pack source id 'redfin_contract_cancellations_swfl' (stress-cancellations-source.mts:21); parquet path matches.

Producer path VERIFIED: constants.py:22 PARQUET_PATH='market/redfin_contract_cancellations.parquet' == registry inventory_id ✓. constants.py:25 PACK_ID='seller-stress-swfl'. DIRECT consumer edge: seller-stress-swfl reads parquet directly (stress-cancellations-source.mts:29). Cron matches (0 18 15 * *, staggered 1h after price-drops). _tier1_inventory upsert via tier1_inventory.py. SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unread. Audit 03 §1c: FRESH 26d.

### `redfin_delistings_relistings`

- registry has no structured 'workflow:' field (Spine gap); cron in freeform comment ('0 19 15 * *', cadence_registry.yaml:225) MATCHES workflow redfin-delistings-relistings-monthly.yml:8 but names no file.
- cosmetic SOURCE_ID suffix: table 'redfin_delistings_relistings' vs pack source id 'redfin_delistings_relistings_swfl' (stress-delistings-source.mts:22); parquet path matches.

Producer path VERIFIED: constants.py:22 PARQUET_PATH='market/redfin_delistings_relistings.parquet' == registry inventory_id ✓. constants.py:25 PACK_ID='seller-stress-swfl'. DIRECT consumer edge: seller-stress-swfl reads parquet directly (stress-delistings-source.mts:30). All three redfin-stress pipelines feed the SAME pack seller-stress-swfl. Cron matches (0 19 15 * *, staggered 1h after cancellations). SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unread. Audit 03 §1c: FRESH 26d.

### `hurdat2_fl`

- registry has no structured 'workflow:' field (Spine gap); entry carries only a 'Verified' comment (cadence_registry.yaml:239). Actual workflow = hurdat2-annual.yml (runs `ingest.duckdb_pipelines.hurdat2_fl.pipeline`, :47/49).

Producer path VERIFIED: constants.py:26 PARQUET_PATH='environmental/hurdat2_fl.parquet' + BUCKET='lake-tier1' == registry inventory_id 'lake-tier1/environmental/hurdat2_fl.parquet' ✓ (also self-documented at pipeline.py:19). constants.py:30 PACK_ID='hurricane-tracks-fl'. DIRECT consumer edge, cross-tier: hurricane-tracks-fl reads the S3 parquet directly AND joins data_lake.fema_nfip_claims (refinery/packs/hurricane-tracks-fl.mts:35,75,470; SOURCE_ID 'hurdat2_fl_x_fema_nfip'). _tier1_inventory upsert via tier1_inventory.py (DESTINATION__POSTGRES__CREDENTIALS). SUPABASE_URL/SUPABASE_SERVICE_KEY wired-unread. Annual cadence (0 13 1 6 *); audit 03 §1c: FRESH 40d (cadence 365d).

### `usgs`

- consumer-vs-monitored-artifact: registry `usgs` (line 267) monitors tier-1 parquet lake-tier1/environmental/usgs_water_swfl.parquet, written ONLY by usgs-monthly.yml -> ingest/duckdb_pipelines/usgs/pipeline.py (S3 parquet + _tier1_inventory, no Postgres write); but the consuming brain env-swfl reads Postgres data_lake.usgs_daily + data_lake.usgs_sites (refinery/sources/usgs-water-source.mts:32-33,206,224). The monitored parquet has NO brain reader; the brain reads tables the active pipeline never writes.
- legacy-table-still-live: data_lake.usgs_sites is flagged in cadence_registry.yaml (~lines 1699-1704) as 'LEGACY DLT TABLE, SCHEDULED FOR DROP', yet usgs-water-source.mts (SITES_TABLE='usgs_sites', line 33) still live-queries it. Not dropped; no monitor floor. (Matches audit 04 UNMONITORED finding #2.)

Runs ingest.duckdb_pipelines.usgs.pipeline; cadence_days=30. Also writes usgs_water_swfl_sites.parquet (sites, excluded from probe per registry line 274). Workflow over-provisions SUPABASE_URL/SUPABASE_SERVICE_KEY (unused; duckdb httpfs S3 creds read directly pipeline.py:84/87/88). No source_tag (tier-1).

### `faf5`

- dead dlt pipeline: ingest/scripts/faf5_to_parquet.py:125 creates dlt.pipeline(pipeline_name='faf5_tier1', destination='postgres', dataset_name='data_lake') but NEVER calls .run() — no Postgres table written. data_lake.faf_flows is a tombstoned cache; the consumer faf5-source.mts reads S3 parquet only (matches audit 04 correction). Vestigial dlt import.
- pinned-vintage vs date-stamped write: consumer refinery/sources/faf5-source.mts:23 hardcodes FAF5_VINTAGE='2026-05-19' for zone/sctg lookup parquets, while faf5_to_parquet.py:133 writes date-stamped faf5/{TODAY}/*.parquet — the two paths only reconcile by manual FAF5_VINTAGE bump (documented in script header lines 8-9).

Registry entry name 'faf5' (line 287), lane tier-1 prefix, cadence_days=365. Runs ingest.scripts.faf5_to_parquet (NOT ingest/pipelines/faf5 — that dir holds only constants imported by the script). _tier1_inventory rows stamped pack_id='logistics-swfl' (script lines 140/157). Consumer: refinery/packs/logistics-swfl.mts:337 (sources:[faf5Source]); logistics-swfl-nowcast.mts also reads faf5 source-meta indirectly. Workflow over-provisions S3x3 secrets (script uses upload_parquet REST -> SUPABASE_URL/SUPABASE_SERVICE_KEY, not httpfs).

### `fred_g17`

- orphan source (no consumer): registry `fred_g17` (line 305) monitors lake-tier1/macro/fred_g17/ and the pipeline runs monthly (cadence_days=30), but NO production pack consumes it — ingest/pipelines/fred_g17/pipeline.py:44 passes pack_id=None, and grep of all refinery/*.mts finds zero source/pack reads. refinery/packs/macro-us.mts:222 mentions 'fred_g17' only inside a TTL comment, not a data read.

FRED_API_KEY read at resources.py:15 (os.environ['FRED_API_KEY'], required). Writes macro/fred_g17/{YYYY-MM}.parquet via upload_parquet (SUPABASE_URL/SUPABASE_SERVICE_KEY) + _tier1_inventory (DESTINATION__POSTGRES__CREDENTIALS). All read secrets wired. Registry marks 'First run: 2026-05-27 (workflow_dispatch) ✓' (filled).

### `fred_laus_alfred`

- orphan source (no brain consumer): lake-tier1/macro/fred_laus_alfred/ is read ONLY by offline dev tools refinery/tools/flywheel-backtest.mts:258 and refinery/tools/ian-retrodiction-demo.mts:53 (pinned 2026-06 snapshot), NEVER by a production pack/source. pipeline.py:51 pack_id=None.
- stale registry marker: cadence_registry.yaml:328 still reads 'First run: <fill on first successful workflow_dispatch>' — unfilled hand-diary marker though workflow is scheduled monthly (cron 0 14 27 * *).

FRED_API_KEY read at resources.py:18 (required). Pulls ALFRED vintages FLLEEC7URN (Lee)/FLCOLL0URN (Collier). Writes macro/fred_laus_alfred/{YYYY}-{MM}.parquet. All read secrets wired.

### `fred_listing_swfl`

- wrong SOURCE_URL (citation drift): ingest/pipelines/fred_listing_swfl/constants.py:21 SOURCE_URL='https://fred.stlouisfed.org/categories/32287' (live-resolves to a Singapore/International-Data category) vs the correct Realtor.com release 'https://fred.stlouisfed.org/release?rid=462' (registry source_ceiling source_url line 355). Wrong provenance persisted on every _tier1_inventory row (registry BUG note lines 345-347; check fred_listing_swfl_wrong_source_url).
- orphan source (no consumer): no production pack reads lake-tier1/market/fred_listing_swfl/ (pipeline.py:53 pack_id=None; zero refinery references).
- stale registry marker: cadence_registry.yaml:344 'First run: <fill on first successful workflow_dispatch>' unfilled.

8 Realtor.com FRED series x 2 MSAs (Lee 15980, Collier 34940). FRED_API_KEY read at resources.py:16 (required). Writes market/fred_listing_swfl/{YYYY-MM}.parquet. All read secrets wired.

### `market_heat_swfl`

- stale registry marker: cadence_registry.yaml:369 'First run: <fill on first successful workflow_dispatch>' unfilled though workflow is scheduled monthly (cron 0 13 8 * *).

Public realtor.com S3 CSVs, no API key. Writes market_heat_core_swfl.parquet + market_heat_hotness_swfl.parquet (REPLACE), _tier1_inventory pack_id='market-heat-swfl' (pipeline.py:72/82). Gate-4 MIN_ROWS floor before destructive write (pipeline.py:61-62). Consumer confirmed: refinery/sources/market-heat-core-source.mts + market-heat-hotness-source.mts -> refinery/packs/market-heat-swfl.mts (registry comment line 367 + pipeline docstring line 11). All read secrets wired.

### `bls_ppi`

- mislabeled series (content drift): ingest/pipelines/bls_ppi/constants.py labels PPI series PCU236221236221 / PCU236211236211 as 'single-family / multi-family home construction', but BLS Industry Factsheets state 236221='New Warehouse Building Construction' and 236211='New Industrial Building Construction' — both NONRESIDENTIAL (registry lines 387-393; check bls_ppi_mislabeled_series). Series load fine; the LABEL is wrong.
- orphan source (no consumer): no production pack reads lake-tier1/macro/bls_ppi/ (pipeline.py:44 pack_id=None; zero refinery references).

BLS_API_KEY read OPTIONALLY at resources.py:14 (os.environ.get; registrationkey added only if present) — a suspended/absent key silently degrades to keyless BLS calls, not a hard fail. Writes macro/bls_ppi/{YYYY-MM}.parquet. Registry 'First run: 2026-05-27 ✓' (filled). All read secrets wired.

### `bls_oews_swfl_tier1`

- tier-1 archive has no direct reader: registry `bls_oews_swfl_tier1` (line 404) monitors lake-tier1/labor/bls_oews_swfl/{year}.ndjson (inventory row stamped pack_id='labor-demand-swfl', pipeline.py:71), but the consumer labor-demand-swfl actually reads the SIBLING Tier-2 Postgres table data_lake.bls_oews_swfl (refinery/sources/bls-oews-source.mts:25-26 SCHEMA='data_lake' TABLE='bls_oews_swfl'), populated by the same pipeline run (pipeline.py:77-82). The tier-1 NDJSON is a cold archive with no live consumer.
- two registry entries, one pipeline: same pipeline also lands the tier-2 dlt table via a separate registry entry `bls_oews_swfl` (line 531, dlt_schema_name: bls_oews_swfl) — the one env consumers read; this tier-1 entry is the archive.

Annual (cadence_days=365). Runs ingest.pipelines.bls_oews_swfl.pipeline. Writes BOTH Tier-1 NDJSON (upload_ndjson -> SUPABASE_URL/SUPABASE_SERVICE_KEY) AND Tier-2 dlt merge into data_lake.bls_oews_swfl (dlt.pipeline pipeline_name='bls_oews_swfl' -> DESTINATION__POSTGRES__CREDENTIALS, pipeline.py:77-82). No API key. Registry has expected_rows_min:198 on this tier-1 entry (existing tier-1 floor, distinct from the new nightly min_rows field). 'First run: 2026-05-31 backfill' filled. All read secrets wired.

### `census_vip`

- orphan source (no consumer): registry `census_vip` (line 427) monitors lake-tier1/macro/census_vip/ and runs monthly (cadence_days=30), but no production pack consumes it — pipeline.py:44 pack_id=None; zero refinery/*.mts references.

CENSUS_API_KEY read at resources.py:13 (os.environ['CENSUS_API_KEY'], required). Census Value of Construction Put in Place, national grain. Writes macro/census_vip/{YYYY-MM}.parquet. Registry 'First run: 2026-05-27 ✓' (filled). All read secrets wired.

### `city_pulse`

- CADENCE: registry says weekly cost-mode (cadence_days: 7 at line 497; note line 456 'cron Wednesday 09:00 UTC') BUT workflow city-pulse-daily.yml cron is '0 9 * * *' = DAILY (line 10). Live: 207 rows, latest captured_at 2026-07-11 (today); 01-workflows confirms 23-run daily success streak. Registry note is stale — runs daily, not weekly.
- STALE PLACEHOLDER: registry line 455 'First run: <fill on first successful GHA run>' vs 01-workflows: STALE (23 successes, last 2026-07-10).
- LANE-HYBRID: registry lane tier-1 (inventory_id lake-tier1/city_pulse/) but pipeline ALSO writes tier-2 non-dlt data_lake.city_pulse via raw psycopg (distill.py write_rows). Spec §3 enumerated only city_pulse_corridors as tier-2-nondlt and omitted city_pulse — same hybrid shape, worth one line for the author.

LLM pipeline (Sonnet distill, ANTHROPIC_API_KEY read at distill.py:195 anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])). RunBudget $1/run guard (CITY_PULSE_MAX_USD). Freshness tracked via Tier-1 inventory (inventory_id); brain city-pulse-swfl reads the tier-2 table data_lake.city_pulse. min_rows=50 is a TABLE-TOTAL non-expired floor, NOT per-run-new: quiet cities emit 0 new rows by design (pipeline.py prunes expired rows), so the row-gate must count total live rows or 50 will false-abort a quiet night (calibrate vs observed daily minimum; steady-state ~207). No source_tag literal in code (grep clean). Secrets clean: all 4 read secrets wired.

### `city_pulse_corridors`

- WORKFLOW DARK: registry entry is active in pipelines: (probed, cadence_days 7, note 'Cron 0 10 * * 0') BUT corridor-pulse-weekly.yml has its schedule: block COMMENTED OUT (lines 8-12) and the workflow is state: disabled_manually (01-workflows). No live cron; workflow_dispatch only. Live: data frozen at 2026-07-05 (198 rows, latest captured_at 2026-07-05 09:08).
- STALE PLACEHOLDER: registry line 475 'First run: <fill on first successful GHA run>' vs 01-workflows: STALE (3 successes, last 2026-06-14, workflow now disabled).
- LANE spec-vs-registry: spec §3 lists city_pulse_corridors under tier-2-nondlt (raw psycopg upsert into data_lake.city_pulse_corridors) BUT registry lane: tier-1 (inventory_id lake-tier1/city_pulse_corridors/). Both true (hybrid) — freshness tracked tier-1, consumption tier-2-nondlt.
- CORRIDOR COUNT: pipeline.py:14 docstring + budget comment say '25 verified CRE corridors' vs registry note lines 481/476 say '27 verified corridors' (registry self-flags the '25' code comment as stale). Both sides: code=25, registry=27.

LLM pipeline (Sonnet distill, ANTHROPIC_API_KEY). RunBudget $1/run (CORRIDOR_PULSE_MAX_USD). Timeout was raised 45->90m on 07/05/2026 after 3 consecutive 45-min timeout-kills (06/21,06/28,07/05) that spent web_search API money then discarded rows — but the workflow was then disabled entirely for spend control, so the 90m fix has had zero live runs (01-workflows). cre-swfl reads data_lake.city_pulse_corridors directly AND via brain-input from corridor-pulse-swfl (04-brains map). No source_tag literal (grep clean). Secrets clean.

### `bls_laus`

- MINOR wired-unused: workflow wires SUPABASE_URL + SUPABASE_SERVICE_KEY (lines 43-44) but pipeline is dlt->Postgres only (no storage_uploader import; grep clean) — those two are unread. Not a kill (harmless surplus, opposite of the FRED class).

dlt_schema_name 'bls_laus' matches pipeline_name='bls_laus' (pipeline.py:34); statically verifiable, DB-confirmed FRESH (03-lake §1c, 16d). BLS_API_KEY read at constants.py:8 os.environ.get, used OPTIONALLY at resources.py:74 ('if BLS_API_KEY: payload[registrationkey]=...') — works unauthenticated (rate-limited). count basis expected_rows_min 295. No source_tag literal. Secrets clean (all read secrets wired).

### `bls_qcew`

- WIRED-UNUSED SECRET: workflow bls-qcew-quarterly.yml wires BLS_API_KEY (line 38) but the pipeline code NEVER reads BLS_API_KEY (grep over ingest/pipelines for BLS_API_KEY hits only bls_laus + bls_ppi; bls_qcew has no os.environ read at all). QCEW open-data API needs no registration key. Both sides: workflow env has BLS_API_KEY; code has zero read. Harmless (not a kill-class miss).
- MINOR wired-unused: SUPABASE_URL + SUPABASE_SERVICE_KEY also wired (lines 39-40) but pipeline is dlt->Postgres only (no storage upload).

dlt_schema_name 'bls_qcew' matches pipeline_name='bls_qcew' (pipeline.py:65); statically verifiable, DB-confirmed FRESH (03-lake §1c, 46d). expected_rows_min 28. No source_tag literal. secrets_missing_from_env=[] (the only secret code needs, DESTINATION__POSTGRES__CREDENTIALS, is wired).

### `bls_oews_swfl`

- NONE (positive finding): unlike its BLS siblings, bls-oews-annual.yml correctly does NOT wire BLS_API_KEY — OEWS is a flat-file ZIP download (resources.download_oews_zip), not the BLS timeseries API, and the code reads no BLS_API_KEY. Correct omission, not a drift.

dlt_schema_name 'bls_oews_swfl' matches pipeline_name='bls_oews_swfl' (pipeline.py:78); statically verifiable, DB-confirmed FRESH (03-lake §1c, 41d). Writes BOTH tier-1 (NDJSON archive to lake-tier1/labor/bls_oews_swfl via storage_uploader.upload_ndjson -> SUPABASE_URL/SERVICE_KEY, tracked by sibling registry entry bls_oews_swfl_tier1) AND tier-2 (dlt data_lake.bls_oews_swfl). Annual cron (15 May), next real fire 2027. expected_rows_min 198. No source_tag literal. Secrets clean.

### `census_cbp`

- COUNT_TABLE mismatch (documented, not a bug): dlt_schema_name 'census_cbp' != count_table 'data_lake.census_cbp_fl' (registry line 560 explicitly flags 'dlt schema_name != table name'). Consumer reads via view census_cbp_fl_agg_by_naics.
- MINOR wired-unused: SUPABASE_URL + SUPABASE_SERVICE_KEY wired (lines 39-40), pipeline is dlt->Postgres only.

Consumer found by grep (04-brains map missed it): refinery/sources/macro-florida-cbp-source.mts SOURCE_ID='census_cbp_fl', reads AGG_VIEW census_cbp_fl_agg_by_naics; pack macro-florida (macro-florida.test.mts references census_cbp_fl). dlt_schema_name 'census_cbp' matches pipeline_name='census_cbp' (pipeline.py:11). CENSUS_API_KEY read at resources.py:26 (dlt.secrets) / :28 (os.environ.get default ''). DB-confirmed FRESH (03-lake §1c, 26d), 255,563 rows. No source_tag literal. Secrets clean.

### `census_acs`

- CONSUMING_PACK gap: NO refinery pack reads census_acs (grep census_acs/census_acs_zcta over refinery/ returns zero). Consumed by lib/zip-summary (ZIP report 'Quick data summary'), registry line 580 comment + MEMORY. Both sides: registry documents 'Consuming surface: lib/zip-summary' but the pack-level cross-check (§6) will read consuming_pack as none/GAP — Spine field should record it as a non-pack lib consumer so the zero-coverage check doesn't false-flag.
- COUNT_TABLE mismatch (documented): dlt_schema_name 'census_acs' != count_table 'data_lake.census_acs_zcta' (registry line 579 flags 'dlt schema_name != table name').
- MINOR wired-unused: SUPABASE_URL + SUPABASE_SERVICE_KEY wired, pipeline is dlt->Postgres only.

dlt_schema_name 'census_acs' matches pipeline_name='census_acs' (pipeline.py:11). CENSUS_API_KEY REQUIRED (constants.py:7: 'unauthenticated calls...'), read resources.py:72/74. DB-confirmed FRESH (03-lake §1c, 17d), 100 ZCTAs. cron Nov/Dec/Jan (next Nov 15). No source_tag literal. Secrets clean.

### `usgs_tier2`

- ORPHANED — NO FEEDER WORKFLOW: registry usgs_tier2 (tier-2-dlt, dlt_schema_name 'usgs', count_table data_lake.usgs_daily) has NO workflow writing data_lake.usgs_daily. The only usgs workflow, usgs-monthly.yml, runs 'ingest.duckdb_pipelines.usgs.pipeline' which writes Parquet to Tier-1 ONLY (feeds the SEPARATE tier-1 'usgs' registry entry) and its own comment (line 6) says it 'supersedes the deprecated ingest/pipelines/usgs (deleted in PR 3)'. Grep of all .github/workflows for usgs/usgs_daily/pipelines.usgs confirms no other feeder. Both sides: registry claims a live tier-2 dlt schema 'usgs'; the dlt pipeline that produced it was DELETED.
- SCHEMA_STATIC unverifiable: dlt_schema_name 'usgs' has no backing pipeline code — the DuckDB pipeline uses duckdb directly (no dlt.pipeline, no INSERT into data_lake.usgs_daily). The literal is orphaned.
- GREEN != DATA (root cause 1): usgs-monthly.yml runs green monthly (tier-1 usgs fresh, last 2026-07-10) while data_lake.usgs_daily — the table env-swfl reads for its Caloosahatchee surface-stage metric — silently freezes. Live confirmed: usgs_daily = 605 rows, MAX(obs_date)=2026-05-18 (no update since May; 03-lake §1b 53/60 days, 7 days from flipping STALE).

env-swfl reads data_lake.usgs_daily verbatim (refinery/packs/env-swfl.mts; 04-brains). The tier-1 sibling registry entry 'usgs' (fed by usgs-monthly.yml, DuckDB->Parquet) IS fresh; only this Postgres promotion is dead. usgs-monthly.yml (the sibling) uses actions/checkout@v6 + setup-python@v6, timeout-minutes 20, reads SUPABASE_S3_ENDPOINT + SUPABASE_S3_ACCESS_KEY_ID + SUPABASE_S3_SECRET_ACCESS_KEY (all wired) + DESTINATION__POSTGRES__CREDENTIALS — but none of that refreshes usgs_daily. Also flagged in 04-brains UNMONITORED UPSTREAMS #2 (data_lake.usgs_sites, same deprecated dlt pipeline, still read live by env-swfl via usgs-water-source.mts). Doctor prescription class: NEVER_LANDED / orphaned schema. usgs-monthly.yml IS on both auto-capture watch lists but guards the tier-1 lane, not this frozen table.

### `fema`

- PIPELINE_NAME split (LESS severe than registry comment implies): registry comment line 623 says 'pipeline_name="tier1_inventory" in pipeline.py — actual schema_name is fema_nfip_tier2'. True for the Tier-1 inventory writer (pipeline.py:10 pipeline_name='tier1_inventory'), BUT the actual Tier-2 promotion uses pipeline_name='fema_nfip_tier2' (resources.py:167-168) — so dlt_schema_name 'fema_nfip_tier2' IS statically verifiable (appears as a literal at resources.py:168). Both sides named; registry value matches the tier-2 promotion literal.
- COUNT_TABLE mismatch (documented): dlt_schema_name 'fema_nfip_tier2' != count_table 'data_lake.fema_nfip_claims' (registry line 621).

dlt_schema_name statically VERIFIABLE (resources.py:168 pipeline_name='fema_nfip_tier2'). Secrets: DESTINATION__POSTGRES__CREDENTIALS (dlt tier-2 + resources.py:101 psycopg _current_tier2_count), SUPABASE_URL + SUPABASE_SERVICE_KEY (upload_csv_gz Tier-1 archive) — all wired. Has robust in-pipeline guards (assert_min_rows 403542, assert_vs_canonical 0.95, reported_zipcode + flood_zone non-null 50% floors pre-replace, resources.py:133-157). DB-confirmed FRESH (03-lake §1c, 28d), 448,381 rows. No source_tag literal. Secrets clean.

### `leepa`

- SCHEMA_STATIC UNVERIFIABLE (spec §6 leepa case): registry dlt_schema_name 'leepa_parcels_tier2' (line 639) appears NOWHERE in leepa code (grep 'leepa_parcels_tier2' over ingest/pipelines = zero hits). Tier-2 promotion uses a RUNTIME-RANDOM pipeline_name=f'leepa_t2_{_secrets.token_hex(4)}' (resources.py:118), one per 5k-row chunk. Both sides: registry='leepa_parcels_tier2'; code=random 'leepa_t2_<hex>'. This produced the 330x leepa_t2_<8hex> schemas in _dlt_loads (03-lake §2). Mark schema_static: unverifiable.
- PIPELINE_NAME split (documented line 646): main pipeline.py:10 uses pipeline_name='tier1_inventory' for the Tier-1 inventory writer.
- WORKFLOW 4/4 CANCELLED: leepa-parcels-annual.yml has a 100% cancellation rate — 4 of 4 runs ever are 'cancelled', 0 successes (01-workflows SILENT-DEATH; timeout-minutes 30, no concurrency block). The live 548,798 rows landed via an out-of-band manual local backfill, NOT this workflow. Registry 'confirmed 548,798 rows' is real but the GHA workflow supposed to produce it has NEVER completed.
- COUNT_TABLE mismatch (documented): dlt_schema_name 'leepa_parcels_tier2' != count_table 'data_lake.leepa_parcels' (registry line 641).

IMPORTANT — metadata-drift, NOT data-loss: the random leepa_t2_<hex> schema fragments _dlt_loads tracking, but table_name='leepa_parcels' + merge on primary_key 'folioid' (resources.py:95-97) is FIXED, so rows land in the count_table correctly. Freshness-via-count_table (data_lake.leepa_parcels MAX(inserted_at)=2026-05-18, 54d, DB-confirmed FRESH) works; dlt_schema_name-via-_dlt_loads is the part that breaks. Secrets: SUPABASE_URL + SUPABASE_SERVICE_KEY (resources.py:12 upload_csv_gz/upload_geojson_gz Tier-1 archive), DESTINATION__POSTGRES__CREDENTIALS (dlt) — all wired. No source_tag literal. Annual cron (15th monthly retry). Doctor should key leepa freshness on the count_table, never the phantom dlt_schema_name.

### `redfin_collier`

- env-vs-code over-provision (non-blocking): workflow env: provides SUPABASE_URL + SUPABASE_SERVICE_KEY (redfin-collier-monthly.yml:36-37) but the pipeline + its libs read only DESTINATION__POSTGRES__CREDENTIALS (dlt consumes it) — SUPABASE_* is never read; inverse of the kill class, harmless
- stale registry annotation: dlt_schema_name comment still reads 'VERIFY after first run' (cadence_registry.yaml:663) though redfin_collier is confirmed landed/FRESH 23d (03-lake-live-state §1c)

dlt pipeline_name literal at resources.py:171 = 'redfin_collier', matches registry dlt_schema_name (cadence_registry.yaml:663). count_table data_lake.redfin_collier_market. Consumer traced: refinery/sources/collier-market-source.mts -> refinery/packs/properties-collier-value.mts. Free public Redfin county TSV (no API key). No source_tag/SOURCE_TAG literal anywhere in the pipeline (grep clean).

### `redfin_lee`

- env-vs-code over-provision (non-blocking): workflow env: provides SUPABASE_URL + SUPABASE_SERVICE_KEY (redfin-lee-monthly.yml:36-37) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS (dlt) — SUPABASE_* unread

dlt pipeline_name literal at resources.py:177 = 'redfin_lee', matches registry dlt_schema_name 'confirmed 2026-06-13' (cadence_registry.yaml:677). count_table data_lake.redfin_lee_market. Consumer: refinery/sources/lee-market-source.mts -> refinery/packs/properties-lee-value.mts; also mirrored in refinery/packs/catalog.mts (catalog registry, not a second consumer). No source_tag literal. Free public Redfin county TSV.

### `redfin_city_swfl`

- NEVER_LANDED: registry claims expected_rows_min 1700 / '1917 confirmed 07/11/2026 via live dry-run' (cadence_registry.yaml:692) but DB side has NO table — data_lake.redfin_city_swfl does not exist in information_schema.tables (03-lake-live-state §1a + §3, TABLE MISSING). A dlt dry-run writes nothing; the pipeline has never landed a row in prod. Registry side: exists/confirmed; DB side: relation does not exist.
- consumer drift: registry comment (cadence_registry.yaml:694) names an intended consumer — 'the monthly source-faithful SOLD anchor beneath the daily ASKING line on the desk hero (daily-price-dual-signal)' — but NO code in the repo reads data_lake.redfin_city_swfl (grep of refinery/, app/, lib/, components/, scripts/, docs/sql = zero hits). Registry side: consumer named; code side: consumer unbuilt.
- env-vs-code over-provision (non-blocking): SUPABASE_URL + SUPABASE_SERVICE_KEY in env: (redfin-city-swfl-monthly.yml:37-38) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS

dlt pipeline_name literal at resources.py:174 = 'redfin_city_swfl' matches registry dlt_schema_name STATICALLY, so a --static identity check passes — but the source is a phantom: never landed (root-cause-1 'green != data' exemplar per 00-DIAGNOSIS) and has no live consumer. count_table data_lake.redfin_city_swfl (also missing). ~1 GB gz city tracker, 45-min timeout to stream it. No source_tag literal.

### `collier_parcels`

- env-vs-code over-provision (non-blocking): SUPABASE_URL + SUPABASE_SERVICE_KEY in env: (collier-parcels-annual.yml:36-37) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS (dlt)
- stale registry annotation: dlt_schema_name comment still reads 'VERIFY after first run' (cadence_registry.yaml:708) though collier_parcels is confirmed FRESH 35d (03-lake-live-state §1c)

dlt pipeline_name literal at resources.py:97 = 'collier_parcels' matches registry (cadence_registry.yaml:708). Uses a chunked psycopg-style merge inside the dlt pipeline (resources.py:85 comment: 'replace blows the Supabase [limit]') with a fixed pipeline_name specifically to keep _dlt_loads.schema_name stable for the probe (resources.py:89-91). 73 dead collier_parcels_t2_<8hex> schemas from a 2026-06-06 retry loop exist in _dlt_loads (03 §2) but the stable 'collier_parcels' schema is the live one. count_table data_lake.collier_parcels. No source_tag literal.

### `fhfa`

- env-vs-code over-provision (non-blocking): SUPABASE_URL + SUPABASE_SERVICE_KEY in env: (fhfa-hpi-quarterly.yml:37-38) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS (dlt)
- registry entry has NO count_table field (cadence_registry.yaml:724-741): dlt_schema_name fhfa_hpi only; physical table is data_lake.fhfa_hpi — the at-rest volume/row-floor probe cannot key off a count_table (minor; in-pipeline assert_min_rows still guards the load)

dlt pipeline_name literal at resources.py:87 = 'fhfa_hpi' matches registry dlt_schema_name; registry comment (cadence_registry.yaml:731) explicitly asserts 'pipeline_name="fhfa_hpi" in pipeline.py matches _dlt_loads schema_name'. Full-snapshot 'replace' source (MSA-quarterly). Consumed by BOTH properties-collier-value.mts and properties-lee-value.mts via refinery/sources/fhfa-hpi-source.mts. No source_tag literal.

### `fdot`

- dual dlt pipeline_name (documented but confusing): the entry point pipeline.py:10 names its dlt pipeline 'tier1_inventory' (it writes the data_lake._tier1_inventory pointer row via upsert_inventory_row at resources.py:130), while the LOAD-BEARING tier-2 AADT data lands via a SEPARATE pipeline created at resources.py:95 with pipeline_name='fdot_aadt_tier2'. Registry dlt_schema_name=fdot_aadt_tier2 (cadence_registry.yaml:747) correctly tracks the tier-2 one; registry comment (line 751) documents this. But 'tier1_inventory' is the same shared legacy schema flagged dead in 03 §2 (56 loads, last 2026-05-19) — a reader grepping pipeline.py:10 would mis-identify the schema.
- env-vs-code over-provision (non-blocking): SUPABASE_URL + SUPABASE_SERVICE_KEY in env: (fdot-aadt-annual.yml:41-42) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS

Registry carries BOTH dlt_schema_name fdot_aadt_tier2 AND count_table data_lake.fdot_aadt_fl (schema != table name, noted at cadence_registry.yaml:749). timeout bumped 20->40 after a real incident: 2026-06-15 scheduled run used ~19.5/20min and was hard-killed mid-Tier-2 replace, leaving data_lake.fdot_aadt_fl EMPTY for 18 days undetected (workflow comment lines 23-26). Consumers: traffic-swfl.mts + logistics-swfl-nowcast.mts read data_lake.fdot_aadt_fl (via fdot-source.mts / fdot-freight-source.mts). No source_tag literal.

### `lee_permits`

- env-vs-code over-provision (non-blocking): SUPABASE_URL + SUPABASE_SERVICE_KEY in env: (lee-permits-weekly.yml:51-52) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS (explicit os.environ.get at pipeline.py:47, and dlt)
- historical false-green (now fixed, kept as evidence): schedule-trigger dry_run inversion made the 06-22 and 06-29 scheduled runs go green while writing 0 rows; fixed 2026-07-03 (workflow comment lines 8-13). Not a current drift but a proven 'green != data' instance for this pipeline (00-DIAGNOSIS root cause 1 / 02 Lee-permits).

dlt pipeline_name literal at pipeline.py:207 = 'lee_permits' matches registry (cadence_registry.yaml:767). Reads DESTINATION__POSTGRES__CREDENTIALS explicitly at pipeline.py:47. count_table data_lake.lee_building_permits (schema != table). Python pinned 3.12 (crawl4ai 0.8.9 env); extra steps crawl4ai-setup + crawl4ai-doctor (advisory, continue-on-error). Accela Angular-SPA stealth scrape (no vendor API key). Consumer permits-swfl.mts via permits-source.mts (+ cre-swfl reads permits-swfl as brain-input). No source_tag literal.

### `collier_permits`

- SCHEDULE DISABLED vs REGISTRY-ACTIVE: the workflow's schedule/cron is COMMENTED OUT (collier-permits-monthly.yml:4-9, HELD since 2026-06-16 pending a GHA dry-run probe + collier_first_lake_ingestion gate) so the pipeline fires ONLY on manual workflow_dispatch — but the registry entry is a live pipeline with cadence_days: 30 and is NOT in not_yet_running: (cadence_registry.yaml:782-784). Result: the source silently ages out — 03 §1b shows collier_permits at 45/60 days and permits-swfl self-reports the Collier/Naples feed 68 days stale (04 HELD-OR-FAILED #2), shipping into master.md. Registry side: active 30d cadence; workflow side: never scheduled.
- env-vs-code over-provision (non-blocking): SUPABASE_URL + SUPABASE_SERVICE_KEY in env: (collier-permits-monthly.yml:48-49) but pipeline reads only DESTINATION__POSTGRES__CREDENTIALS

dlt pipeline_name literal at pipeline.py:129 = 'collier_permits' matches registry (cadence_registry.yaml:786). count_table data_lake.collier_building_permits (schema != table). Python pinned 3.12; crawl4ai-setup + crawl4ai-doctor steps; fetcher rewritten 2026-06-16 to crawl4ai UndetectedAdapter (registry comment line 789). workflow_dispatch also exposes a 'month' input. Consumer permits-swfl.mts via collier-permits-source.mts. No source_tag literal.

### `fl_dor_tdt`

- workflow named ONLY in a freeform registry comment: cadence_registry.yaml:810 '# Cron: 20th of month 10:00 UTC via fl-dor-tdt-monthly.yml' — no structured workflow: field, exactly the freeform-comment class the Spine (spec §3) wants to replace. Both sides agree (comment says fl-dor-tdt-monthly.yml, which exists and runs the pipeline) but the linkage is unmachine-checkable today.

NON-DLT: raw psycopg3 (import psycopg at pipeline.py:42) INSERT ... ON CONFLICT into public.fl_dor_tdt_collections; freshness tracked via freshness_table public.fl_dor_tdt_collections (cadence_registry.yaml:806), no dlt_schema_name (correct for lane). Reads DESTINATION__POSTGRES__CREDENTIALS explicitly at pipeline.py:305. Workflow env: provides ONLY DESTINATION__POSTGRES__CREDENTIALS (no SUPABASE_* — consistent with code, no over-provision here). Consumer tourism-tdt.mts via tourism-tdt-source.mts. Public FL DOR Form 3 XLSX (no key). No source_tag literal.

### `fl_dor_sales_tax`

- workflow named ONLY in a freeform registry comment: cadence_registry.yaml:831 '# Cron: 15th of month 11:00 UTC via fl-dor-sales-tax-monthly.yml' — no structured workflow: field (Spine §3 freeform-comment class). Comment and reality agree; linkage unmachine-checkable today.

NON-DLT: raw psycopg3 (import psycopg at pipeline.py:43) INSERT INTO public.fl_dor_sales_tax; freshness_table public.fl_dor_sales_tax, no dlt_schema_name (registry comment line 829: 'Non-dlt pipeline — freshness checked via MAX(inserted_at)'). Reads DESTINATION__POSTGRES__CREDENTIALS explicitly at pipeline.py:385. Workflow env: provides ONLY DESTINATION__POSTGRES__CREDENTIALS (no SUPABASE_* — consistent, no over-provision). Consumer sector-credit-swfl.mts via fl-dor-sales-tax-source.mts. Public FL DOR Form 10 XLSX (no key). No source_tag literal.

### `zhvi_swfl_tier2`

- registry expected_rows_min: 1 with comment 'nascent — floor at 1 until first live run confirms' (line 890) vs LIVE reality: zhvi_swfl_tier2 has landed and is 13d FRESH (audit 03 §1c/§2) — the 'nascent/first run' comment is stale
- zhvi-tier2-monthly.yml silent-break: last scheduled fire 2026-06-23 FAILED (~18d, audit 01 §3) and it is in NEITHER auto-capture watch list, yet the table shows ~13d freshness (~06-28) — freshness arrived via a path other than the scheduled workflow (green!=data pattern)

dlt tier-2 Postgres promotion. dlt_schema_name literal CONFIRMED: pipeline_name="zhvi_swfl" at pipeline.py:68 (static) + landed in _dlt_loads (audit 03). Registry dlt_schema_name: zhvi_swfl (line 889) matches. Registry names workflow explicitly (line 892: zhvi-tier2-monthly.yml, day 23) — cron '0 13 23 * *' matches. Consumer: refinery/sources/zhvi-source.mts -> refinery/packs/home-values-swfl.mts (registry line 894 also states this). S3 trio via resources.py:45/51/52, DESTINATION via pipeline.py:31 — all wired; SUPABASE_URL/SERVICE_KEY extra/unread. No source_tag literal. No secret-not-wired.

### `tier_divergence_swfl_tier2`

- ORPHANED CONSUMER: pipeline lands data (tier_divergence_swfl_tier2 = 19d FRESH, audit 03 §1c) and consuming_pack refinery/packs/tier-divergence-swfl.mts EXISTS + tests pass, but the brain is NOT wired into master's input_brains, has never rendered brains/tier-divergence-swfl.md, and 404s in prod (audit 04 §2). The registry's declared consumer is a dark end — data flows in, nothing consumes it downstream
- registry comment 'Set expected_rows_min after first run' (line 915) is stale — pipeline has already run (19d FRESH); table holds ~30k+ zip x month rows per the same entry's own note

dlt tier-2 Postgres promotion. dlt_schema_name literal CONFIRMED: pipeline_name="tier_divergence_swfl" at pipeline.py:69 (static) + landed in _dlt_loads (audit 03). Registry dlt_schema_name: tier_divergence_swfl (line 910) matches. Registry names workflow explicitly (line 913: tier-divergence-tier2-monthly.yml, day 22) — cron '0 12 22 * *' matches. Consumer: refinery/sources/tier-divergence-zip-latest-source.mts -> refinery/packs/tier-divergence-swfl.mts (reads data_lake.tier_divergence_zip_latest view). S3 trio via resources.py:49/55/56, DESTINATION via pipeline.py:32 — all wired; SUPABASE_URL/SERVICE_KEY extra. No source_tag literal. No secret-not-wired. This is the 'tier_divergence_dag_orphan' check referenced in spec §checks.

### `fgcu_reri_indicators`

- fgcu-reri-monthly.yml is disabled_manually at the GitHub API level (audit 01, batch-disabled 2026-06-15) WHILE its cron '0 14 5 * *' is live + uncommented in source — registry '# Cron: 5th of month' (line 939) implies scheduled but GitHub will not fire it until re-enabled
- LOW_VOLUME vs floor: registry expected_rows_min: 16 (line 932) but live count = 10 rows (audit 03 §1a) — table is FRESH-on-recency but under its own row floor

Non-dlt (freshness_table: public.fgcu_reri_indicators, MAX(inserted_at)). Scrapes FGCU RERI homepage via crawl4ai (ingest.lib.crawl_client) — comment already corrected 07/08 (line 935). Consumer: refinery/sources/fgcu-reri-source.mts -> refinery/packs/fgcu-reri.mts. Only secret read is DESTINATION (pipeline.py:357), wired. crawl4ai is machine-local, no secret. No source_tag literal. Registry 'First run: 2026-05-29' is filled (not a sentinel).

### `rsw_airport_monthly`

- registry line 1011 says 'Scrapes via Firecrawl' but the CODE uses crawl4ai: pipeline.py:174 `from ingest.lib.crawl_client import fetch_page_markdown` + requests.get (196) + pdfplumber (217), and the WORKFLOW installs crawl4ai (crawl4ai-setup / crawl4ai-doctor). Sibling entries got 'comment corrected 07/08/2026, not Firecrawl'; rsw's stale Firecrawl comment was never corrected
- rsw-airport-monthly.yml is disabled_manually at the GitHub API level (audit 01, batch-disabled 2026-06-15) WHILE cron '0 15 8 * *' is live + uncommented in source — registry '# Cron: 8th of month' (line 1014) implies scheduled but GitHub will not fire it

Non-dlt (freshness_table: public.rsw_airport_monthly, MAX(inserted_at)). Scrapes LCPA reports page for 5 PDFs, parses with pdfplumber. Consumer: refinery/sources/rsw-airport-source.mts -> refinery/packs/rsw-airport.mts. Only secret read is DESTINATION (pipeline.py:389), wired. No source_tag literal. Registry 'First run: 2026-05-31' filled. Live: 27d FRESH (within 60d threshold).

### `dbpr_sirs_submissions`

- dbpr-sirs-monthly.yml is disabled_manually at the GitHub API level (audit 01, disabled 2026-06-22) WHILE cron '0 7 1 * *' is live + uncommented in source — disabled rather than fixed (5 cron-failure issues #98-#102, 4 still open; checkout@v6 + Playwright-timeout history); registry '# Cron: first Monday' (line 1040) says first Monday but the actual YAML cron '0 7 1 * *' fires the 1st of month, not first-Monday — a second, internal registry-vs-workflow drift
- pipeline dir name (dbpr_sirs) differs from registry entry name (dbpr_sirs_submissions) — cosmetic, workflow correctly invokes ingest.pipelines.dbpr_sirs.pipeline

Non-dlt (freshness_table: data_lake.dbpr_sirs_submissions — data_lake NOT public; freshness_column: scraped_at). Runs on SELF-HOSTED runner [self-hosted, swfl-local] (residential IP to reach DBPR WAF), uses pinned VENV_PY (C:\Users\ethan\sirs-runner-venv), pwsh shell, actions/checkout@v4 only (NO setup-python — venv is pre-provisioned). Scrapes 2 Qlik Sense apps via qix.py. Consumer: refinery/sources/dbpr-sirs-source.mts -> refinery/packs/condo-sirs-swfl.mts. Secrets: DESTINATION (pipeline.py:110) + CRAWL4AI_PROXY (qix.py:40, optional, defaults to '' and intentionally unset on self-hosted) — both wired; SUPABASE_URL/SERVICE_KEY also in env: (extra/unread). No source_tag literal. Registry 'First cron run: 2026-06-02' filled. Live: 19d FRESH.

### `dbpr_public_notices`

- registry note says 'pdf_summary moved to Haiku (cost mode)' (cadence_registry.yaml:1117) vs code default model = 'claude-sonnet-4-6' (dbpr_public_notices/summarize.py:8) — registry comment stale; operator amended Haiku->sonnet per ingest/CLAUDE.md, code is authoritative

Non-dlt: raw psycopg upsert into public.dbpr_public_notices (pipeline.py:52-56, freshness via last_seen_at). Reads DESTINATION__POSTGRES__CREDENTIALS (pipeline.py:53); ANTHROPIC_API_KEY read implicitly by anthropic.Anthropic() in summarize.py:13 (grep for os.getenv would miss this — caught by reading the file). Workflow also wires SUPABASE_URL/SUPABASE_SERVICE_KEY (dbpr-public-notices-weekly.yml:44-47), used by ingest.lib.api_usage.log_api_usage ledger — provided, not missing. No source_tag literal. Consumer confirmed news-swfl.mts:16 imports dbpr-public-notices-source.mts. Live FRESH 5d (03-lake §1c).

### `dbpr_re_licensees`

- registry expected_rows_min=15000 with comment '~50% of the 30,100 kept rows observed live 07/10/2026' (cadence_registry.yaml:1134) vs live DB COUNT(*)=0 rows on 07/11 (03-lake §1a, EMPTY) — never-landed/wiped class, unresolvable from DB (non-dlt, no _dlt_loads trail)
- code writes source_tag='dbpr_re_rgn7' (pipeline.py:123) but registry entry has NO source_tag field — Spine backfill needs to add it

Non-dlt: psycopg merge into public.dbpr_re_licensees (pipeline.py:50, ON CONFLICT ... last_seen_at bumped). Registry 'First run: <fill in after Task 7's live run>' is the ONE genuinely-accurate placeholder (workflow created 07/11, 0 GHA runs — 01-workflows table). consuming_pack=none: feeds outreach public.new_re_agents view, NOT a brain (cadence_registry.yaml:1140; no refinery pack imports it). Reads DESTINATION__POSTGRES__CREDENTIALS (pipeline.py:50), wired (ingest-dbpr-re-licensees.yml:38). email column always NULL by design.

### `noaa_ghcn_rainfall`

- registry 'First run: pending first GHA dispatch' (cadence_registry.yaml:1164) vs actual GHA history = 2 successes, last 2026-07-05 (01-workflows unconfirmed-first-runs table) — stale placeholder
- registry expected_rows_min=8 vs live 6 rows (03-lake §1a LOW_VOLUME) — FRESH on recency but below floor

dlt pipeline_name='noaa_ghcn_rainfall', dataset_name='data_lake' (pipeline.py:13-17) MATCHES registry dlt_schema_name. Source = AWS Open Data s3://noaa-ghcn-pds (no auth). DESTINATION__POSTGRES__CREDENTIALS read by dlt framework (no explicit os.getenv). Workflow ALSO wires SUPABASE_URL/SUPABASE_SERVICE_KEY (noaa-ghcn-rainfall-monthly.yml:39-40) but pipeline never reads them — extra, harmless. Consumer confirmed env-swfl.mts:33 imports noaa-ghcn-rainfall-source.mts.

### `city_pulse_corridors_tier2`

- producer workflow corridor-pulse-weekly.yml is DISABLED (state disabled_manually 2026-07-05) AND its schedule cron is commented out in source (corridor-pulse-weekly.yml:8-12) — this tier-2 recency watchdog on data_lake.city_pulse_corridors has NO active producer; will trip once the 21d tolerance elapses

Recency-watchdog entry (NOT a separate scrape): freshness_table=data_lake.city_pulse_corridors, freshness_column=captured_at. Data produced by the city_pulse_corridors pipeline (distill.py psycopg writes; ANTHROPIC_API_KEY read at distill.py:201). Non-dlt. Workflow PAUSED per operator no-paid-web_search decree (crawl4ai retrofit in flight). All secrets wired when it runs (corridor-pulse-weekly.yml:54-57). Primary consumer corridor-pulse-swfl (corridor-pulse-swfl.mts:27 imports corridor-pulse-source.mts); cre-swfl also reads data_lake.city_pulse_corridors + takes corridor-pulse-swfl as brain-input (04-brains-consumers map). Live FRESH 6d (03-lake §1c).

### `marketbeat_swfl`

- workflow marketbeat-pdf-ingest.yml is DISABLED at API level (state disabled_manually 2026-06-15) BUT its schedule cron '0 10 15 1,4,7,10 *' is still UNCOMMENTED in source (marketbeat-pdf-ingest.yml:6-7) — 'gh workflow enable' resumes firing with no code guard (01-workflows disabled table)

registry source_name='cw_marketbeat' MATCHES extractor.py:184/52-53. Non-dlt: psycopg upsert into data_lake.marketbeat_swfl (loader.py, ON CONFLICT(source_name,sector,submarket,quarter)). loader reads MARKETBEAT_DB_URL or DATABASE_URL (loader.py:49); workflow wires MARKETBEAT_DB_URL=DESTINATION creds (marketbeat-pdf-ingest.yml:30) — DATABASE_URL fallback unset but MARKETBEAT_DB_URL covers it, no kill. ANTHROPIC_API_KEY (workflow:29) used only by vision fallback in extractor (anthropic import) for image-scanned pages. setup-python@v5 here vs @v6 elsewhere — both valid, not a drift. SHARED freshness_table blind spot (see colliers/mhs). Consumer cre-swfl.mts:29 imports marketbeat-swfl-source.mts. Live FRESH 32d (03-lake §1c).

### `colliers_industrial`

- workflow marketbeat-pdf-ingest.yml is DISABLED at API level (state disabled_manually 2026-06-15) BUT schedule cron still UNCOMMENTED in source (marketbeat-pdf-ingest.yml:6-7) — 'gh workflow enable' resumes firing with no code guard
- 3 registry entries (marketbeat_swfl, colliers_industrial, mhs_databook) share freshness_table=data_lake.marketbeat_swfl — the probe reads MAX(_ingested_at) of the whole table, so a stale colliers source_name is masked by any other source_name refreshing (sub-source 'green != data' blind spot)

SAME pipeline (marketbeat_pdf) and SAME workflow as marketbeat_swfl. registry source_name='colliers_industrial' MATCHES extractor.py:282/54-55. Non-dlt psycopg. Consumer cre-swfl (via marketbeat-swfl-source.mts, same data_lake.marketbeat_swfl table). Q4 2024 form-gated (email delivery); GHA opens a GH issue when auto-download blocked (marketbeat-pdf-ingest.yml:88-125). Live FRESH ~32d (shares marketbeat_swfl table count).

### `mhs_databook`

- registry source_name='mhs_databook' (into data_lake.marketbeat_swfl) has NO pipeline code literal and NO workflow to run it — VERIFIED: marketbeat_pdf can't load it (source_from_filename raises for non-marketbeat/colliers at extractor.py:56, _PDF_RE at pipeline.py:34 excludes MHS), and a full .github/workflows grep for mhs/databook/marketbeat surfaces only marketbeat-pdf-ingest.yml (cw+colliers) and ingest-mhs-permits-swfl.yml (different table). Pure manual ODD PDF drop — Spine Phase-2 static check ('source_tag appears as literal in pipeline Python') CANNOT resolve this entry
- shares freshness_table=data_lake.marketbeat_swfl with marketbeat_swfl + colliers_industrial — sub-source staleness masked by MAX(_ingested_at) of the whole table

Distinct from mhs_permits_swfl (which HAS code + a workflow and writes a DIFFERENT table). This mhs_databook entry is the CRE Data Book (retail/industrial/office rents -> data_lake.marketbeat_swfl, 48 rows first loaded 2026-06-09). Cadence 365d annual; probe alerts ~Mar 2027. Registry cites recipe docs (2026-06-05-mhs-odd-graduation-handoff.md), NOT a pipeline.py. Consumer cre-swfl (marketbeat-swfl-source.mts, shared table). Live FRESH 36d (03-lake §1c). COLLISION RULE: mhs_databook wins over cw_marketbeat on identical (sector,submarket,period). NOTE the source_name string 'mhs_databook' is ALSO used by the mhs_permits_swfl pipeline for a different table.

### `mhs_permits_swfl`

- source_name literal 'mhs_databook' (extract.py:36) is REUSED across two different pipelines/tables: here it writes data_lake.mhs_permits_swfl, while the mhs_databook registry entry writes data_lake.marketbeat_swfl — same source_name string, two tables (not a functional bug since tables differ, but the identity string is non-unique)

registry source_name='mhs_databook' MATCHES extract.py:36. Non-dlt: psycopg upsert into data_lake.mhs_permits_swfl (pipeline.py:71). _get_db_url() reads MHS_DB_URL then DATABASE_URL (pipeline.py:35); workflow wires ONLY DATABASE_URL=DESTINATION creds (ingest-mhs-permits-swfl.yml:31). MHS_DB_URL is read-first-but-not-wired — NOT a kill: DATABASE_URL fallback covers it (workflow comment at :28-30 documents this exact resolution). Annual cron '0 10 20 3 *'; workflow created after Mar-2026 passed so next fire Mar 2027, 0 GHA runs so far (01-workflows §NEVER-RAN A). Install is minimal (pip install pdfplumber requests psycopg[binary], NOT requirements.txt). Consumer permits-commercial-swfl.mts:10 imports mhs-permits-source.mts. Live FRESH 32d (03-lake §1c). Do NOT blend with permits-swfl (residential Accela).

### `crexi_listings`

- registry note (cadence_registry.yaml:1348) says 'Weekly Firecrawl agent scrape' but the pipeline is crawl4ai (extract.py:1 docstring 'crawl4ai extraction'; workflow runs crawl4ai-setup) — Firecrawl vs crawl4ai
- workflow wires ANTHROPIC_API_KEY (ingest-crexi-listings.yml:24) + CRAWL4AI_PROXY (:26) but crexi pipeline code reads NEITHER via os.getenv (extract.py has no proxy/anthropic read) — wired-but-unread

psycopg upsert (distill.py ON CONFLICT (source_name, source_url)), no dlt. source_name identity MATCH: registry source_name=crexi (line 1346) == code _SOURCE_NAME='crexi' (distill.py:19). No source_tag/SOURCE_TAG literal exists (uses source_name). CREXI_DB_URL read at distill.py:25 is absent from env: block but its 'or DATABASE_URL' fallback IS wired (DATABASE_URL=DESTINATION__POSTGRES__CREDENTIALS, :25) so non-fatal — not a kill. Consumer: writes data_lake.active_listings_cre -> refinery/sources/active-listings-source.mts (SOURCE_ID=active_listings_cre) -> cre-swfl.mts:517. Shares active_listings_cre with brevitas (source_name discriminates).

### `brevitas_listings`

- workflow installs Playwright (ingest-brevitas-listings.yml:39) + wires CRAWL4AI_PROXY (:25) but extract.py fetches the brevitas JSON API via plain requests (extract.py:55-118, brevitas.com/api/search), no browser — vestigial browser install + unread proxy
- workflow has NEVER succeeded: 2/2 runs failed (audit 01-workflows-issues.md RED-NOW #3)

psycopg upsert (distill.py ON CONFLICT (source_name, source_url)), no dlt. source_name identity MATCH: registry source_name=brevitas (line 1369) == code _SOURCE_NAME='brevitas' (distill.py:24). No source_tag literal. BREVITAS_DB_URL read at distill.py:31 absent from env but 'DATABASE_URL or BREVITAS_DB_URL' fallback DATABASE_URL IS wired (:24) -> non-fatal. Consumer: writes data_lake.active_listings_cre (same table as crexi) -> cre-swfl.mts:517.

### `lee_associates_swfl`

- workflow zero runs ever — quarterly cron (0 10 20 2,5,8,11 *), first fire ~Aug 20 2026 (audit 01 NEVER-RAN bucket A). Not broken, just not yet due.

psycopg INSERT (pipeline.py), no dlt. source_name identity MATCH: registry source_name=lee_associates (line 1389) == code SOURCE_NAME='lee_associates' (extract.py:33). No source_tag literal. Env helper _get_db_url() checks (LEE_DB_URL, DATABASE_URL) then .dlt/secrets.toml (pipeline.py:28); LEE_DB_URL absent from env but DATABASE_URL wired (:36) -> non-fatal. Consumer: writes data_lake.marketbeat_swfl (source_name='lee_associates', UNION with MHS publisher) -> refinery/sources/marketbeat-swfl-source.mts -> cre-swfl.mts:514 (marketbeat_swfl also read by corridor-pulse fact-pack tools).

### `estero_edc`

- workflow ingest-local-cre-context.yml is SHARED by two registry entries (estero_edc + fmb_recovery) — one .yml runs both pipelines as separate steps (source input estero_edc|fmb_recovery|both); the registry Spine 'workflow:' field will be non-unique across these two entries.

psycopg upsert (pipeline.py, seed-based always upserts 6 SEED_ROWS), no dlt. source_name identity MATCH: registry source_name=estero_edc (line 1413) == code SOURCE_NAME='estero_edc' (pipeline.py:27). No source_tag literal. Env helper (ESTERO_DB_URL, DATABASE_URL) at pipeline.py:33; DATABASE_URL wired (ingest-local-cre-context.yml:29). Consumer: writes data_lake.local_cre_context (source_name='estero_edc') -> refinery/sources/local-cre-context-source.mts -> cre-swfl.mts:518. Shares local_cre_context table + workflow with fmb_recovery.

### `fmb_recovery`

- entry/dir name 'fmb_recovery' differs from its source_name 'fmb_planning' — NOT a defect (registry source_name field IS 'fmb_planning', line 1434, and code SOURCE_NAME='fmb_planning' pipeline.py:28 MATCH) but the identity string is 'fmb_planning', not the entry name; a naive name==source_name check would false-flag.
- workflow ingest-local-cre-context.yml SHARED with estero_edc (non-unique Spine workflow: field across the two entries).

psycopg upsert (pipeline.py, seed-based always upserts 8 SEED_ROWS), no dlt. source_name identity MATCH: registry source_name=fmb_planning (line 1434) == code SOURCE_NAME='fmb_planning' (pipeline.py:28). No source_tag literal. Env helper (FMB_DB_URL, DATABASE_URL) at pipeline.py:36; DATABASE_URL wired. Consumer: writes data_lake.local_cre_context (source_name='fmb_planning') -> cre-swfl.mts:518. Shares table + workflow with estero_edc.

### `news_swfl`

- dlt_schema_name: registry says 'data_lake' (cadence_registry.yaml:1455) but that is the dlt dataset_name (Postgres schema, pipeline.py:35), NOT the dlt schema — the actual dlt internal schema_name is 'news_swfl' (pipeline_name at pipeline.py:33; _dlt_loads carries 24 loads under schema 'news_swfl' per audit 03 §2). No dlt schema literally named 'data_lake' exists. This is the false-RED class the §6 live check targets.
- source_tag: registry says 'news_crawl' (cadence_registry.yaml:1456) but NO source_tag/SOURCE_TAG literal exists anywhere in ingest/pipelines/news_swfl/*.py — the pipeline stamps per-outlet source_name (e.g. 'naples_daily_news', normalizer.py:46) and 'news_crawl' is only the app cron route name (/api/cron/news-crawl), not a pipeline identity string.
- secret-not-wired (STATIC, not asserted as outage): novelty.py:33 reads os.getenv('DATABASE_URL'); news-swfl-ingest.yml env: block (lines 45-49) wires ONLY DESTINATION__POSTGRES__CREDENTIALS (:46), never aliasing DATABASE_URL — the ONLY one of these 9 workflows that omits the DATABASE_URL alias (the other 8 all set DATABASE_URL=secrets.DESTINATION__POSTGRES__CREDENTIALS). novelty's only fallback is .dlt/secrets.toml (novelty.py:39), which no step writes on the runner. dlt WRITE path is unaffected (reads DESTINATION__POSTGRES__CREDENTIALS natively); only the novelty psycopg dedup path wants DATABASE_URL. News lands rows daily (audit 03 §2), so this is a static config gap, not a confirmed break.
- action version: news-swfl-ingest.yml uses actions/setup-python@v6 + python 3.13 (lines 30-32) while all 8 sibling ingest workflows in this chunk use actions/setup-python@v5 + python 3.12 — both sides flagged, not adjudicated per spec §4.
- **SECRET_NOT_WIRED:** read in code but absent from workflow `env:` → `DATABASE_URL`

lane=tier-2-dlt: dlt.pipeline at pipeline.py:32 (pipeline_name='news_swfl', dataset_name='data_lake'), write_disposition='merge' (pipeline.py:10). Freshness is tracked via freshness_table=data_lake.news_articles_swfl / scraped_at (registry line 1452-1453), which check_freshness reads BEFORE dlt_schema_name (audit 03 §2). CONSUMER=none for refinery: grep 'news_articles_swfl' refinery/ => 0 hits; the pipeline output is consumed ONLY by the app (app/api/cron/news-crawl/route.ts, app/insiders/_lib/desk-stats.ts) into project_events/desk. Note the pipeline<->brain decoupling: a 'news-swfl' BRAIN exists but reads public.dbpr_press_releases + public.dbpr_public_notices (04-brains-consumers.md map), NOT this pipeline's news_articles_swfl. Workflow name: field is 'SWFL business news ingest daily' (does not match filename).

### `active_listings`

- CONSUMER ORPHAN: registry note (cadence_registry.yaml:1478) claims 'Consumer brain: refinery/packs/active-listings-swfl.mts' but active-listings-swfl actually reads data_lake.listing_active_stats — a view over data_lake.listing_state (written by listing_lifecycle), NOT active_listings_residential (written by THIS pipeline). Proof: active-listings-residential-source.mts:27 VIEW='listing_active_stats'; audit 03 §4c 'active_listings_residential ... zero live consumers'. So this pipeline is marked nightly/load-bearing yet its output table has no live pack consumer — the §8 assert_landed row-gate would gate rebuild on a table nobody reads.

psycopg upsert (distill.py ON CONFLICT (source_name, mls_id)), no dlt. source_name identity MATCH: registry source_name=active_listings_seed (line 1473) == code _SOURCE_NAME='active_listings_seed' (distill.py:20). No source_tag literal. min_rows=2000 from registry expected_rows_min (line 1474; note = raise to ~0.9*full-county). Secrets all wired: DATABASE_URL (:41), LISTINGS_SOURCE_BASE_URL (:42), CRAWL4AI_PROXY (:44, dormant). Also reads config env LISTINGS_MIN_ROWS/LISTINGS_MIN_PER_COUNTY (pipeline.py:24/30, not secrets) + HEALTHCHECKS_PING_KEY used in a heartbeat step (:86). Staggered 4-county daily cron (09/12/15/18 UTC). Caveat: fgcu-reri.mts:194 find('active_listings_residential') is an INDICATOR NAME in fgcu_reri_indicators, NOT a read of this table.

### `listing_lifecycle`

- TWO source_name literals coexist (by design, not a defect): code has API_SOURCE_NAME='api_feed' (constants_api.py:18, the LIVE path) AND distill.SOURCE_NAME='lifecycle_seed' (distill.py:71, legacy scrape-path default). Registry source_name=api_feed (line 1494) correctly points at the live path; the frozen lifecycle_seed rows are deliberately excluded (registry note lines 1494-1499). A checker must know to compare against api_feed, not lifecycle_seed.

psycopg merge (distill.py upsert_state ON CONFLICT (source_name, address_key, sale_or_rent)), no dlt — named by spec §5 as one of the 3 non-dlt psycopg writers. source_name identity MATCH (live path): registry api_feed == code API_SOURCE_NAME='api_feed' (constants_api.py:18). No source_tag literal. min_rows=9000 from registry expected_rows_min (line 1500, PLACEHOLDER; live api_feed count already ~31,709). Secrets all wired: DATABASE_URL (:52), PHOTOS_API=SteadyAPI key (:54, read extract_api.py:182/219/282/424), LISTING_LIFECYCLE_BASE_URL (:56, legacy scrape only), CRAWL4AI_PROXY (:58). Consumer: writes data_lake.listing_state (+ listing_transitions) -> view data_lake.listing_active_stats -> active-listings-residential-source.mts -> active-listings-swfl.mts. THIS is the live data path for the active-listings-swfl brain (the active_listings pipeline's table is the orphan). Staggered Lee/Collier/Hendry daily (09/12/15 UTC).

### `market_aggregates_histogram`

- source_tag SPINE-FIELD GAP: code has SOURCE_TAG='realtor.com' (constants.py:24, used in resources.py:52/94 + written to the row) but the registry entry (cadence_registry.yaml:1526) declares NO source_tag field at all — the §3 Spine field is absent, so it cannot be cross-checked until added.

psycopg time-series upsert (db.py:15-36, run_histogram at pipeline.py:37), no dlt — spec §5 confirms market_aggregates/pipeline.py is a hand-rolled psycopg merge. SOURCE_TAG='realtor.com' is the provenance string (SteadyAPI is the access layer, never surfaced — constants.py:13). Secrets wired: DATABASE_URL (:27), PHOTOS_API=SteadyAPI key (:28, read steady_client.py:29). Shares pipeline dir with market_aggregates_details (dispatched via --resource histogram vs details). Consumer: writes data_lake.listing_price_histogram_swfl -> view listing_price_histogram_swfl_latest -> price-distribution-source.mts:24 -> price-distribution-swfl.mts. Weekly (Mon 11:00 UTC).

### `market_aggregates_details`

- source_tag SPINE-FIELD GAP: code has SOURCE_TAG='realtor.com' (constants.py:24) but the registry entry (cadence_registry.yaml:1544) declares NO source_tag field — §3 Spine field absent.
- consumer-map drift (both sides named): 04-brains-consumers.md maps active-rentals-swfl -> data_lake.market_details_swfl, but active-rentals-source.mts:27 reads ONLY 'rental_listing_stats' (market_details_swfl is a docstring cross-ref, not a live read). The sole LIVE consumer of market_details_swfl is market-temperature-swfl (market-temperature-source.mts:25 reads market_details_swfl_latest).

psycopg time-series upsert (db.py:15-36, run_details at pipeline.py:53), no dlt — spec §5 names market_aggregates/pipeline.py:run_details as a non-dlt psycopg merge. SOURCE_TAG='realtor.com' (constants.py:24), shared with histogram. Secrets wired: DATABASE_URL (:28), PHOTOS_API (:29, steady_client.py:29). Shares pipeline dir with histogram (--resource details). Consumer: writes data_lake.market_details_swfl -> view market_details_swfl_latest -> market-temperature-source.mts:25 -> market-temperature-swfl.mts. Monthly (4th 13:00 UTC).

### `land_manufactured_swfl`

- manufactured-home current property_type classification: registry HEADER COMMENT (ingest/cadence_registry.yaml ~line 1664, dated 07/01) says 'a manufactured home is currently mis-typed single_family' — BUT current code says 'other': ingest/pipelines/listing_lifecycle/extract_api.py:122 falls back ptype='other' (type_hint only matches single_family/condos/townhomes/multi_family; manufactured never hits the land beds-null+lot_sqft branch reliably) AND ingest/pipelines/listing_lifecycle/constants_api.py:73 states verbatim 'manufactured has no reliable signal yet and falls to "other"'. The SAME registry entry's 07/07 source_scope summary (~line 1694) also says manufactured 'falls to other'. Registry header comment (07/01) is STALE; code side + newer source_scope = 'other'.

PARKED ODD backfill in not_yet_running: (parked:true, operator 06/30/2026). NO dedicated pipeline code exists — confirmed by registry (lines 1660-1665) and by code: parse_steadyapi (extract_api.py) has no manufactured emit path; STEADYAPI_TYPE_FILTERS=['single_family','condos','townhomes','multi_family'] (constants_api.py:74) — manufactured is NOT vendor-filterable at all (constants_api.py:72-73). NO workflow. Would write (once built) to data_lake.listing_state — the SAME table as listing_lifecycle, property_type column distinguishes rows (no new table, no distill change); source_name=api_feed (registry line 1689). source_tag=N/A (no code); registry DECREES the eventual source_tag/citation MUST read 'realtor.com', never 'SteadyAPI' (operator decree, registry line ~1677). Consumer active-listings-swfl reads data_lake.listing_state via listing_active_stats view (04-brains-consumers.md:164) — shared consumer, no dedicated land/manufactured pack. Graduation is REAL code (per-type /search sweep, ~6 extra city sweeps at monthly cadence), not zero-code. cadence_days:30 — not a nightly source.

---

## Phase-2 static-check PROTOTYPE run (adversarial re-verification of the table above)

Two agents acted as a working prototype of `check-registry-identity.mts --static`, re-opening the files to try to REFUTE each claimed identity string.

Verification complete across all 6 dimensions — 37 records, 34 distinct workflows, every claim either confirmed or refuted against files/DB. Here is the deliverable.

## Phase-2 static-check prototype — seeded drift fixtures (half 1)

**Prototype run:** `check-registry-identity.mts --static` semantics (spec §6) executed by hand against 37 assembled records / 34 distinct workflows (`live-search-daily.yml` and `bls-oews-annual.yml` each back 2 records; `usgs_tier2` has none — that *is* its drift). Every claim below was re-derived from files or a SELECT; nothing is carried over from the input table on trust. As-of 2026-07-11.

**Coverage of the 6 checks:** ① source_tag ✅ closed · ② workflow exists ✅ 34/34 · ③ secrets ⊆ env ✅ 37/37 · ④ dlt_schema literal ✅ 13/13 tier-2-dlt · ⑤ uses versions ✅ 34/34 · ⑥ timeout-minutes ✅ 34/34.

---

### A. CONFIRMED drifts → expected-RED fixtures (both sides named)

| # | Pipeline | Registry side | Code / DB side | Evidence | Caught by | Prescription |
|---|---|---|---|---|---|---|
| **F1** | `usgs_tier2` | `lane: tier-2-dlt`, `dlt_schema_name: usgs`, `count_table: data_lake.usgs_daily` | **Producing module does not exist.** `ingest/pipelines/usgs` = MISSING (stat'd). Sole usgs workflow `usgs-monthly.yml` runs `duckdb_pipelines.usgs.pipeline` (Parquet→Tier-1 only, no dlt, no Postgres write); its own header says it *supersedes the deleted* `ingest/pipelines/usgs`. Grep of all workflows: no other feeder. DB: `usgs_daily` = 605 rows, `MAX(obs_date)` = **2026-05-18** (54d stale) | **`--static`** (schema literal absent **and** no producing module) + `--live` | **NEVER_LANDED** |
| **F2** | `redfin_city_swfl` | `expected_rows_min: 1700`, "1917 confirmed 07/11/2026 via live dry-run" (`cadence_registry.yaml:692`) | **Static PASSES** — `resources.py:174 pipeline_name="redfin_city_swfl"` == registry `dlt_schema_name`; timeout 45; secrets clean; versions clean. **DB: relation does not exist** — `information_schema.tables` count = **0** for `data_lake.redfin_city_swfl` (verified query). A dlt *dry-run* writes nothing | **`--live` ONLY** (static is GREEN) | **NEVER_LANDED** |
| **F3** | `usgs` / `env-swfl` | `data_lake.usgs_sites` flagged *"LEGACY DLT TABLE, SCHEDULED FOR DROP"* (`~:1699-1704`) | Table still exists (verified: `information_schema` = 1) and is still **live-queried** by the `env-swfl` pack via `usgs-water-source.mts` (`SITES_TABLE='usgs_sites'`). Never dropped, no monitor floor | `--live` (pack reads legacy/excluded table) | **NEVER_LANDED** (frozen upstream) |
| **F4** | **source_tag dimension itself** | **Field absent.** Exactly **one** `source_tag:` in the entire 1756-line registry (`:1460`, `news_crawl` — not in half 1). Zero for all 37 half-1 entries | Code side has the literal: `live_search/engine.py:67` `source_tag: str = "live_search"` (+ `:278`, `:339`) | `--static` — **but the check has no left-hand side to compare against** | **SCHEMA_NAME_DRIFT** class (Spine §3 blocker) |

**F1 vs. leepa — the discriminator the prototype exists to surface.** Both have "`dlt_schema_name` absent from code," but one is RED and one is legal:

| | `usgs_tier2` (F1) | `leepa` (the §6 named exception) |
|---|---|---|
| Registry claims | `dlt_schema_name: usgs` | `dlt_schema_name: leepa_parcels_tier2` (`:639`) |
| Literal in code | absent | absent — grep over `ingest/` hits **only** the registry (`:639`, `:646`), zero `.py` |
| **Producing module** | **DELETED** (`ingest/pipelines/usgs` MISSING) | **EXISTS** — `resources.py:118` `pipeline_name=f"leepa_t2_{token_hex(4)}"` |
| Verdict | **RED** | `schema_static: unverifiable` → defer to `--live` (`count_table`) |

**Rule the implementation must encode:** `literal absent + no producing module → RED`; `literal absent + module exists with dynamic naming → unverifiable/skip`. A naive check that marks both "unverifiable" **false-passes `usgs_tier2`** — the exact silent-freeze this build exists to kill. (leepa's own metadata drift is real but *not* data-loss: `table_name='leepa_parcels'` + merge on `folioid` is fixed, so rows land; only `_dlt_loads` tracking fragments into the 330× `leepa_t2_<hex>` schemas. Key leepa freshness on `count_table`, never the phantom schema name.)

**F2 is the argument for having a `--live` mode at all** — it is the one record in half 1 where `--static` is fully GREEN on all six checks and the source is still a phantom.

---

### B. Real drifts, both sides named, but OUTSIDE the 6 static-identity fields

Keep these out of the Phase-2 static fixtures; they belong to Phase-3 manifest / doctor / content contracts. All file-verified unless marked.

- **`city_pulse` cadence** — workflow `city-pulse-daily.yml:10` cron `"0 9 * * *"` = **DAILY**; registry note `:456` says *"cron Wednesday 09:00 UTC"* + `error_after_days: 21` = *"3× weekly cadence"* (`:452`). Registry is stale (workflow re-enabled daily 07/07). → Phase-3 manifest.
- **`city_pulse_corridors` WORKFLOW DARK** — `corridor-pulse-weekly.yml:8-12`: the entire `schedule:`/`cron` block is **commented out** ("PAUSED 07/05/2026 — NO paid model web_search on a schedule"), dispatch-only; registry keeps the entry active with `cadence_days: 7`. → Phase-3 `should_be_dark`.
- **Orphan sources** (`consuming_pack: none`): `fred_g17`, `fred_laus_alfred`, `fred_listing_swfl`, `bls_ppi`, `census_vip` — plus `tier_divergence` (pack + tier-1 data live, **brain never built**, not in master's DAG; open check `tier_divergence_dag_orphan`). **These are NOT `ZERO_COVERAGE`** — that enum is *DB-has / registry-lacks*; this is the **inverse** (*registry-has / consumer-lacks*). The 5-member enum has no home for it. **Recommend a distinct `DEAD_SOURCE` class**, else the check either false-flags a stated fact or silently blesses a pipeline burning cadence for nobody.
- **`census_acs` — cross-check FALSE-POSITIVE risk (design bug, fix before Phase 2 ships):** `consuming_pack` reads as `none`/GAP, but a **real consumer exists** — `lib/zip-summary` (registry `:580`). A pack-only cross-check will RED a healthy source. The Spine's `consuming_pack` field **must admit non-pack lib consumers**.
- **Provenance/content class (no enum member, not identity):** `fred_listing_swfl` wrong `SOURCE_URL` (`constants.py:21` → FRED category 32287, a Singapore/International category, vs. the correct Realtor.com release `rid=462`) — wrong provenance persisted on every `_tier1_inventory` row; `bls_ppi` mislabeled series (`236221`/`236211` labeled residential; BLS says *New Warehouse* / *New Industrial* — nonresidential).

---

### C. Verified CLEAN (coverage — what I actually checked, not what's merely consistent)

**File-verified, all 37 records:**

- **③ Secrets ⊆ workflow `env:` — 37/37 CLEAN. ZERO `SECRET_NOT_WIRED` in half 1.** Grep-verified per workflow, not asserted. Every secret each record's code reads is present in the named workflow's `env:` block (e.g. live-search: `GEMINI:46`, `FRED:49`, `DESTINATION:41,52`; the S3×3 + DESTINATION set at `:38-44` in all 10 duckdb tier-1 workflows; `CENSUS:38`/`DEST:41` in census-cbp; `DEST:53` in lee-permits). **The FRED/S3/Firecrawl kill class the spec worries about does not occur in this half.**
- **⑥ `timeout-minutes` — 34/34 present** (15–90 min; no missing-timeout fixture available here).
- **⑤ `uses:` — 34/34 uniform**, exactly `actions/checkout@v6` + `actions/setup-python@v6`, no other actions. Per spec §4 I assert **nothing** about @v6 validity — that resolution is the Vendor agent's. **No `ACTION_VERSION` fixture available from half 1.**
- **② Workflow file exists — 34/34.** Every claimed filename is present in `.github/workflows/`.
- **④ `dlt_schema_name` literal — 13/13 tier-2-dlt resolve:** `bls_laus` (pipeline.py:34) · `bls_qcew` (:65) · `bls_oews_swfl` (:78) · `census_cbp` (:11) · `census_acs` (:11) · `fema` → `fema_nfip_tier2` (resources.py:168) · `redfin_collier` (:171) · `redfin_lee` (:177) · `redfin_city_swfl` (:174) · `collier_parcels` (:99) · `fhfa` → `fhfa_hpi` (:87) · `fdot` → `fdot_aadt_tier2` (:95) · `lee_permits` (pipeline.py:207).
- **① `source_tag` — grep-closed.** Half 1's only code-side literal is `live_search` (engine.py:67, exactly as claimed). All other half-1 records' `N/A` is **true** (the only other `SOURCE_TAG` literals in the repo — `market_aggregates`, `rentals`, `dbpr_re_licensees` — are in the other half).
- **`pipeline_dir` — 22/22 stat'd OK**, sole MISSING is `ingest/pipelines/usgs` (= fixture F1).

**Two `count_table != dlt_schema_name` mismatches are NOT drifts** (`census_cbp`→`census_cbp_fl`, `census_acs`→`census_acs_zcta`, `fema`→`fema_nfip_claims`, `fdot`→`fdot_aadt_fl`, `leepa`→`leepa_parcels`): §6 requires the schema literal to *exist in the Python*, not to equal the table name. Documented in-registry. Static = GREEN, correctly.

**Inverse finding the check as specced CANNOT see (recommend a WARN-level reverse pass):** `secrets_read ⊆ env` is **one-directional**, so pervasive *surplus* wiring is invisible to it. ~20 workflows wire `SUPABASE_URL`+`SUPABASE_SERVICE_KEY` into pipelines that are dlt→Postgres-only or duckdb→S3-only; `live-search-daily.yml:47-48` wires `SPIDER_API_KEY`+`ANTHROPIC_API_KEY` for cascade legs that are **stubbed no-ops**; `bls-qcew-quarterly.yml:38` wires `BLS_API_KEY` the code never reads. All harmless (opposite of the kill class) — **but a wired-dead key is indistinguishable from a wired-live key at a glance, and that is exactly how `GAP_SENTINEL` (dead key = green run) hides.** Suggest `env ⊇ code-reads → WARN`, never RED.
**Positive control (verified):** `bls-oews-annual.yml` correctly **omits** `BLS_API_KEY` (grep-confirmed absent from its env) — OEWS is a flat-file ZIP, not the timeseries API. The "correct omission" claim is TRUE, and it proves the surplus pattern isn't universal boilerplate.

---

### D. Could NOT verify (and why)

1. **All run-history claims** — leepa's 4/4-cancelled 0-successes, corridor-pulse's 3 timeout-kills, city_pulse's 23-run streak, lee_permits' historical false-green. These need `gh run list`; the guardrail bars pipeline-triggering commands and I did not re-query run history. **They are inherited from `01-workflows-issues.md`, not re-verified by me** — and they're run-status, outside the 6 static fields regardless. The Phase-3b `classifyTermination` work owns them.
2. **`tier_divergence` dry-run module split** (`--dry-run` → `.probe_grain` vs. live → `.pipeline`, claimed at `tier-divergence-tier1-monthly.yml:47/49`) — record-claimed with line cites; I did not open the run-steps block. Cheap to confirm; flagged for the author. If true it's a real hole in the "`--dry-run` ships in the same PR" guarantee (the dry run validates a module prod never executes), and it is **unique to this entry**.
3. **All consumer-side `refinery/sources/*.mts` line cites** — outside the static check's file set (registry + pipeline `.py` + workflow `.yml`). Consumer edges are `--live` mode's job. I verified none of them independently; F3's `usgs_sites` read is the one I'd re-confirm first.

**Input-quality note (why I re-derived rather than trusted):** the assembled table's line-cites are *close but not reliable* — `collier_parcels` cites `resources.py:97` for the `pipeline_name` literal; it is actually at **`:99`**. Literal present and matching, so no pipeline drift — but it means fixtures must be built by opening the file, never by transcribing the record. One bad line-cite baked into an expected-RED fixture would make the Phase-2 suite itself the next thing that drifts.

