# Known Problems Ledger — Ingest / Pipeline / Data Lake / Brain Domain

Audit date: 2026-07-11. Read-only inventory of already-written-down, unfixed problems. Facts and
file:line evidence only — no recommendations, no new fixes proposed.

Sources: `node scripts/check.mjs list` (314 open checks total, captured verbatim to
`tool-results/b7b05lz0j.txt`), `_AUDIT_AND_ROADMAP/build-queue.md` (101 lines, full read),
`docs/cron-rebuild-failures.md` (full read), `SESSION_LOG.md` lines 1–200 (2026-07-11 entries),
direct code reads (`ingest/pipelines/listing_lifecycle/*`, `ingest/pipelines/rentals/*`,
`ingest/pipelines/active_listings/*`, `docs/sql/*`), one live `mcp__lake__query_lake` read against
`data_lake.listing_state`, and two `gh run list`/`gh run view` checks against GitHub Actions.

**Note on "age":** `scripts/check.mjs` (lines 94–99) computes `[Nd untouched]` as
`now - (updated_at ?? created_at)`. For checks that were never modified after opening (the large
majority), this equals true age since creation. Where a check has an explicit `due` date, both are
shown.

---

## 1. OVERDUE DATA CHECKS

### 1a. Explicit due date, already passed (as of 2026-07-11)

Only 4 of the 314 open checks in the whole ledger carry an explicit due date that has passed. Two are
out of the data/pipeline/brain domain (contact-import dedupe, CSV-injection policy) and are omitted
per the task's domain filter. The two in-domain ones:

| key | label | due | days overdue | tag |
|---|---|---|---|---|
| `fl_dbpr_applicants_rebaseline` | Re-baseline cadence `expected_rows_min` after first monthly cron lands — set from live count (today 8,727; placeholder floor 7,800) once month-to-month fluctuation is observed | Jul 9 | 2 | `fl_dbpr_applicants` |
| `smoke_prod_runner_live_verify` | Prod smoke runner live-verify: post-deploy run stamps all 9 HTTP-assertable checks; workflow goes green on main push | Jul 5 | 6 | `brain-platform` (infra, borderline in-scope — included because it gates freshness-signal visibility) |

### 1b. No explicit due date — age-sorted (data/pipeline/brain domain only)

The remaining 300+ open checks carry no due date, only an age. Below is every check in scope
(ingest/pipelines/data_lake/brains/property-type/rentals/freshness/citations-of-data), age-sorted
descending. `[brain-platform]` is the generic tag; specific tags are quoted where present.

| days | key | label | tag |
|---|---|---|---|
| 37 | `master_freshness_drift_gap` | master.md frontmatter drift while no source is newer than the oldest brain: `rebuild_due` gate returns run=false, so the drift-fail-loud capture step never runs that cycle (self-heals on the next source-triggered run) | `resilience` |
| 37 | `row_tier_t1_transitive_invalidation` | DEFERRED TRIPWIRE — transitive cache invalidation (`dag.mts` `walkConsumers` exists, auto-invalidation caller unwired). Reopen only if nightly full-DAG rebuild is abandoned for incremental | `row-tier` |
| 37 | `row_tier_t2_tenancy_seam` | DEFERRED TRIPWIRE — tenancy seam at the payload-assembly edge, not Postgres RLS. MCP `auth.ts` is a live no-op stub; `/r/source` and `/embed` read Postgres directly | `row-tier` |
| 35 | `master_expires_vs_cadence_policy` | master re-quotes slow-cadence upstreams as perpetually-expired (7-day citation window on annual/quarterly sources) | `resilience` |
| 35 | `odd_scaffold_ready` | Operation Dumbo Drop — every un-auto-ingestable source must ship the ODD-ready scaffold in the brain's same PR (empty-tolerant consumer, parked cadence entry, Tier-1 cold target, source_tag provenance, idempotent merge) | `ingest` |
| 35 | `mhs_period_end_item_c` | MHS `prior_12mo_ending=2026-03-31` is INFERRED (item C); re-verify period-end + cadence on mhsappraisal.com and mirror into off-main `load_mhs.py` (due Aug 31, not yet due) | `cre-swfl` |
| 35 | `row_tier_build_remaining` | Row tier: R1 row-candidate confirmation, deferred behind named consumer. Track-B backward-engine HOLD lifted 2026-06-07 | `row-tier` |
| 33 | `gradeable_polarity_frame_audit` | Frame-dependent polarity: name+surface the frame, grade the frame-free trajectory & gloss bull/bear per-frame for bivalent slugs | `glass` |
| 32 | `corridor_gap_east-naples` | Structural gap: East Naples has city_pulse news but 0 verified corridors | `cre-swfl` |
| 32 | `corridor_gap_golden-gate` | Structural gap: Golden Gate has city_pulse news but 0 verified corridors | `cre-swfl` |
| 32 | `corridor_gap_marco-island` | Structural gap: Marco Island has city_pulse news but 0 verified corridors | `cre-swfl` |
| 32 | `corridor_gap_north-fort-myers` | Structural gap: North Fort Myers has city_pulse news but 0 verified corridors | `cre-swfl` |
| 32 | `corridor_gap_north-naples` | Structural gap: North Naples has city_pulse news but 0 verified corridors | `cre-swfl` |
| 32 | `cre_broker_estero_fmb` | cre_broker: gap → partial for Estero + FMB | `cre` |
| 31 | `parcels_lee_zip_source_layer` | Lee parcels ZIP source-layer: join situs-address/parcel-centroid → zip_code, scope-gate, wire pipeline + surface in properties-lee-value (G2/G3) | `parcels` |
| 29 | `view_vintages_greenlight` | §08 view_vintages capture — separate operator greenlight | `lake` |
| 29 | `pivoted_views_build` | Pivoted Views: spine S01-07 shipped + cut over (views live, /charts ZHVI, Gate A 3/3, S05 cutover live + Gate B floor) | `lake` |
| 27 | `dbpr_license_chunk_undercount` | DBPR license "chunk undercount" resolved — never add CONSTRUCTIONLICENSE_2/_3 (frozen 2019, expired 2020, regression). Only open Q: do `cilb_certified`/`registered` carry Lee/Collier licenses absent from `_1`? | `licenses-swfl` |
| 27 | `view_vintages_backtestable_flip` | EXCLUDED→BACKTESTABLE flip for ZHVI/ZORI after ~9mo `view_vintages` history (08c) (due Mar 14, not yet due) | `pivoted-views` |
| 26 | `tier_divergence_graduation` | tier-divergence-swfl graduation gate (after first clean live cycle) — one combined pass | `tier-divergence-swfl` |
| 26 | `franchise_foia_first_run` | First automated quarterly SBA FOIA pipeline run lands real franchise data in Tier-1 Parquet | `franchise-outcomes` |
| 24 | `email_sources_after_citationlist` | Verify the email/PDF deliverable still renders correctly after the centralized `CitationList` refactor, and decide whether emails should gain a cleaned sources list | `citations` |
| 20 | `supercrawl4ai_built` | supercrawl4ai Phase 1 layer built + benchmark-proven (34 tests); migrate first pipeline onto it to close | `crawl4ai` |
| 20 | `crawl4ai_doctor_preflight` | crawl4ai-doctor preflight shipped advisory across 7 crons; flip to hard-fail after one green `workflow_dispatch` confirms runner exit codes | `crawl4ai` |
| 10 | `sold_resolution_latlon_crosswalk_live_verify` | Sold-resolution: lat/long parcel crosswalk (Lee) live-verify | `brain-platform` |
| 10 | `sold_resolution_crosswalk_recheck` | Re-run sold-resolution lat/long crosswalk spike after Jul 2 scheduled listing-lifecycle runs — active rows now have live lat/lon (99%), but the 2,709 current departures are all seed-origin with zero lat/lon; check for a lat/lon-bearing departure before building | `brain-platform` |
| 10 | `listing_lifecycle_coord_to_zip_backstop` | `listing_lifecycle/extract_api.py` derives `zip_code` from the permalink slug only, no `coord_to_zip` lat/lon fallback like `lee_permits/pipeline.py` uses when site zip is missing/out-of-scope — not broken today (zip ~100% populated live) but inconsistent with the G1-compliant pattern | `brain-platform` |
| 9 | `market_trend_sweep_followup` | Whole-sweep follow-up: replicate the region-monthly-trend pattern to price-distribution/market-temperature/listing-momentum + daily active-listings/listing-lifecycle inventory+DOM trend once crons accumulate depth | `market-heat-region-trend` |
| 8 | `sold_price_pending_backfill_live_verify` | Sold price pending — display split + leftover-budget backfill live-verify | `brain-platform` |
| 8 | `zip_hero_pool_all_brains` | Widen ZIP hero candidate pool to all brains via ZIP machine | `zip-signal-hero` |
| 8 | `city_permits_ingest_odd` | City permit portals ingest (Cape Coral/Naples/Fort Myers) — ODD scaffold, replaces lane-3 Find-it for permits | `zip-signal-hero` |
| 5 | `social_pulse_cadence_flip` | Flip social-pulse-scan cron to Mon/Thu after 3-week bootstrap (due 07/26/2026) | `social-pulse-swfl` |
| 5 | `haiku_vs_sonnet_final_run` | ONE final comparison run on 07/08/2026 (3 days of fresh Sonnet-era TTL drift), append to `verification/haiku-vs-sonnet-distill.md`, then close | `ingest` |
| 5 | `capture_method_quality_compare` | After retrofit's first live run: compare crawl4ai+Sonnet gathering vs old web_search rows | `ingest` |
| 5 | `cron_incident_corridor_pulse_weekly` | cron failure: corridor-pulse-weekly | `brain-platform` |
| 4 | `cron_incident_lee_permits_weekly` | cron failure: lee-permits-weekly | `brain-platform` |
| 3 | `marco_condo_address_match_failure` | Marco Island condo units: 0/360 matched on address-key during the 06/30 seed-to-api_feed catchup bridge | `listing-lifecycle` |
| 3 | `land_manufactured_swfl_graduation` | `land_manufactured_swfl` ODD scaffold parked since 07/01/2026, zero pipeline code | `ingest` |
| 3 | `condo_multiunit_grain_systemic` | Condo/multi-unit grain is broken as a CLASS across the platform — 3 independent discoveries, 3 separate defers, never connected | `brain-platform` |
| 3 | `collier_condo_unit_grain_gap` | FDOR centroid + cadastral layers give Collier condos at parcel/building grain only — no per-unit folio or unit number anywhere | `communities-swfl` |
| 3 | `steadyapi_429_no_retry` | `fetch_steadyapi_city` (extract_api.py) has no retry/backoff on non-200 — a single 429 fails that county's whole scan; hit Lee 07/07 11:52 UTC + Collier 07/07 14:36 UTC, both scheduled runs, **zero rows ingested each time** | `listing-lifecycle` |
| 3 | `flood_proof_0703_overclaim_pull` | `answer-proofs.jsonl` 07-03 (33931) entry certifies an answer with a 6-county overclaim + untraceable $30,075 county AAL | `scope-integrity` |
| 3 | `mhs_databook_missing_multifamily` | `mhs_databook` only pulls Retail/Industrial/Office; MHS's own 2026 Data Book confirms it also covers Multi-Family across Lee/Collier/Charlotte in the same PDF — scoped as "Recipe 3" in the original design, never built | `ingest` |
| 3 | `steadyapi_migrate_city_seed_to_county_level` | `listing_lifecycle` uses `SWFL_CITY_SEED` (city-by-city `/search`) while rentals/market_aggregates already use county-level location strings; county-level catches ~4% of Lee listings the curated city list drops | `listing-lifecycle` |
| 3 | `dbpr_licenses_dropped_street_address` | `fl_dbpr_licenses`/`fl_dbpr_applicants` source CSVs carry full street address in already-downloaded columns but `_DBPR_COLUMNS` drops them — zero ZIP-grain license data today despite the platform's ZIP-grain priority | `ingest` |
| 3 | `scope_env_swfl_6county` | env-swfl brain carries a 6-county footprint (Lee+Collier+Charlotte+Glades+Hendry+Sarasota) — contradicts locked Lee+Collier core scope | `scope-integrity` |
| 3 | `scope_hurricane_tracks_fl_6county` | hurricane-tracks-fl 6-county HURDAT2×NFIP join emits Charlotte/Glades/Sarasota + "6-county" framing (9 landfalls, $93.6M avg, $3.39B worst are 6-county aggregates) | `scope-integrity` |
| 3 | `scope_more_brains_charlotte_leak` | econ-dev-swfl ("Lee + Collier + Charlotte") and licenses-swfl/DBPR ("Lee, Collier, Charlotte, Sarasota, Hendry") also leak scope, found in `catalog.mts` L245/L280 | `scope-integrity` |
| 3 | `scope_storm_history_swfl_charlotte` | storm-history-swfl includes Charlotte (95 property-damage events/13 cyclones are 3-county aggregates) | `scope-integrity` |
| 3 | `flood_county_aal_30075_untraceable` | Live flood answer emitted "$30,075/yr per-insured-property AAL across Lee County" — traces to NO brain metric; env-swfl computes AAL per-ZIP only | `scope-integrity` |
| 3 | `bls_ppi_mislabeled_series` | `bls_ppi` PCU236221/PCU236211 labeled residential (single/multi-family) but BLS classifies both as industrial/warehouse construction | `ingest` |
| 3 | `lee_permits_issued_date_cursor_window_mismatch` | Lee permits nets ~1 row/run after WAF fix: run 28908149044 fetched 87/87 CapDetail (100%) but only 1 row written — 86 enriched permits have real `issued_date`s before the incremental cursor start (06-16), filtered out; 94 stale fallback-dated 06-16 rows can't be corrected via the normal flow | `lee-permits` |
| 3 | `market_aggregates_details_dropped_fields` | `market_aggregates_details` `parse_market_details()` silently drops `market_comparison` block + `market_temperature` extras already present in the paid SteadyAPI response body | `ingest` |
| 3 | `listing_lifecycle_sold_sampling_bias` | sold-capture (closings) budget-sampled at `SOLD_CHECK_CAP=8`/run/county, prioritized list-price-desc — cheaper closings systematically wait longer or never get probed; `listed_date` is a confirmed-available vendor field never persisted | `ingest` |
| 3 | `lee_associates_cap_rate_discarded` | `lee_associates_swfl` `extract.py` parses Cap Rate from PDF text but `data_lake.marketbeat_swfl` has no `cap_rate` column and the INSERT never references it — silently discarded | `ingest` |
| 3 | `steadyapi_lot_sqft_acres_capture` | SteadyAPI `normalizeResult` drops `description.lot_sqft` to null | `swfl-data-gulf` |
| 3 | `stranded_bp_pipeline_census_worktree` | Dangling worktree `bp-pipeline-census`: 3 unlanded commits creating `data_lake.source_totals` + SteadyAPI `meta.total` capture — ask-first territory (ingest write to `data_lake.*`), not landed | `worktrees` |
| 1 | `reach_topic_rules_backfill` | Backfill reach topic rules for high-value unreachable brains: safety/unemployment/yield/condo-SIRS/price-drops/hurricane-history/mortgage/traffic/communities/airport/econ-dev/licenses/rental-inventory/freight | `brain-platform` |
| 1 | `reach_topic_map_coverage_gate` | Coverage gate: every BRAIN_CATALOG id must be routed in TOPIC_TO_SLUG or listed in INTENTIONALLY_UNROUTED with a reason | `brain-platform` |
| 1 | `brain_geo_prepush_gate` | Pre-push gate: touching `refinery/packs/catalog.mts` must run zip-dossier BRAIN_GEO validation — the catalog-without-geo class has 500'd prod 3× (active-listings, market-heat, communities) | `brain-platform` |
| 1 | `home_values_investor_zip_not_in_catalog` | `home-values-swfl` + `investor-zip-swfl` build as brains but are absent from BRAIN_CATALOG: reach fail-closes on them, `routeRankedDelta` fetches them ungated (possibly dead in prod) | `brain-platform` |
| 1 | `active_listings_zip_county_contamination` | active-listings-swfl / listing-momentum-swfl carry out-of-region ZIPs and a dual-county ZIP | `brain-platform` |
| 1 | `master_conclusion_jargon_leak` | `composeConclusion` (`refinery/lib/synth.mts`) bakes magnitude/confidence/trust-tier jargon into the conclusion field; tier-2 `sanitizeProse` doesn't strip it — leaks into digest + likely other tier-2 surfaces | `email-digest` |
| 1 | `breaking_no_recency_filter` | city-pulse-swfl BREAKING items have no event-recency filter (own doc says breaking TTL=1d, unenforced) — surfaced month-old news as breaking in 07/09 send | `email-digest` |
| 1 | `digest_no_quality_gate` | digest cron (`build-digest.mts`) has zero content-quality gate, only a numeric delta detector; `voice-guard.ts` only covers the AI-authored grid-email path | `email-digest` |
| 1 | `lee_associates_missing_naples` | `lee_associates_swfl` only pulls Fort Myers; Lee & Associates publishes a parallel Naples/Collier report set at the same URL pattern (confirmed live HTTP 200 on all 4 sector PDFs) | `ingest` |
| 0 | `test_extract_api_stale_type_lookup` | 3 tests in `test_extract_api.py` assert against pre-type_lookup contract — already red on main, independent of any other work (see §3 below for full trace) | `ingest` |
| 0 | `daily_truth_median_sale_unvalued` | `daily_truth` `median_sale_price` rows exist but ALL values are NULL (19 days × 3 cities, verified 07/11) — desk hero + desk-price-trend panel fall back to ZHVI monthly (due Jul 24, not yet due) | `daily-truth` |
| 0 | `retire_gemini_price_websearch` | Retire dead Gemini `median_sale_price` web-search (cascade all-NULL); ripples into freshness-pulse pack + brain-vocabulary (Gate 5) | `daily-price-dual-signal` |
| 0 | `naples_asking_vs_sold_geography` | Naples geography mismatch: live-listing "Naples" is broad (asking ~$279k) vs Redfin "Naples, FL" incorporated city (sold ~$1.235M) | `daily-price-dual-signal` |
| 0 | `price_source_wire_off_stale_seed_table` | Wire daily county/city asking price off `listing_active_stats`/`listing_state`, never the stale `active_listings_residential` seed table (blends land into "residential"; $309k vs $610k, see §3 below) | `daily-price-dual-signal` |
| 0 | `crexi_lease_only_hardcoded` | `crexi_listings` only queries lease endpoints; for-sale Crexi listings (Cloudflare-gated) not ingested at all | `ingest` |
| 0 | `fred_listing_swfl_wrong_source_url` | `fred_listing_swfl` `SOURCE_URL` constant resolves to a Singapore/International-Data category page, not the Realtor.com housing release (rid=462) — wrong citation persisted to `tier1_inventory.source_url` every run | `ingest` |
| 0 | `brevitas_lease_only_hardcoded` | `brevitas_listings` hardcodes `transaction_type=for_lease`; for-sale endpoint never queried | `ingest` |
| 0 | `realtor_data_library_aggregate_adopt` | Adopt Realtor.com Data Library free ZIP-grain CSVs as an independent cross-check/fallback for SteadyAPI aggregates | `ingest` |
| 0 | `zillow_zip_raw_price_followup` | Confirm whether Zillow publishes raw (non-index) median list/sale price series below Metro grain — only ZHVI (smoothed index) confirmed at ZIP grain | `ingest` |
| 0 | `steadyapi_subscription_suspended` | **SteadyAPI live API returns 403 "subscription suspended" on every call (verified live 07/07/2026 ~15:15 UTC, all counties) — blocks listing-lifecycle, rentals, and market-aggregates ingest entirely until resolved** | `ingest` |
| 0 | `collier_permits_missing_applied_series` | `collier_permits` only pulls the Issued-series XLSX; Applied-series XLSX (leading indicator) published on the same page, deliberately excluded pending a composite PK | `ingest` |
| 0 | `vendor_extraction_ceiling_audit_followup` | Action items from the 07/08 vendor extraction-ceiling audit (`_ASSISTANT/2026-07-08-vendor-extraction-ceiling-audit.md`) | `ingest` |
| 0 | `news_county_sources_rotted` | news_swfl county sources rotted — leegov 404+auth-wall, colliercountyfl moved to collier.gov SPA; baseline rows there are nav-chrome false positives | `news_swfl` |
| 0 | `news_wink_rss_adopt` | Adopt WINK News county-scoped RSS 2.0 feeds as primary replacement for the broken leegov/collier.gov scrape | `news_swfl` |
| 0 | `hendry_first_sweep_land` | First scheduled Hendry sweep (15:00 UTC) lands ~1.06k `seed=True` api_feed rows clean; then decide whether to retire 298 superseded `lifecycle_seed` Hendry rows | `brain-platform` |
| 0 | `typed_client_data_lake_typing` | Type the `data_lake` schema and retire untyped hatches across 13 allowlisted files, incl. `lib/reso` bare-injected `SupabaseClient` | `brain-platform` |

That is 83 in-domain checks with no explicit due date, none formally "overdue" but many aging past a
month untouched. `steadyapi_subscription_suspended` shows `[0d untouched]` (opened/touched today) but
describes a live blocker first observed 4 days ago (07/07) — age-in-the-ledger and age-of-the-underlying-
problem are two different numbers; see §4 for the severity read.

---

## 2. OPEN INCIDENTS (`docs/cron-rebuild-failures.md`)

The incident table has one sentinel-marked block (`INCIDENT_TABLE_START`/`END`), newest first. Of all
rows, exactly **3 remain `Status: OPEN`** (none `BLOCKED`); everything else is `RESOLVED`,
`RESOLVED (auto)`, or `FLAKE`. All 3 predate the doc's own 2026-06-28 note that new incidents now land
as GitHub Issues + `checks` (`cron_incident_*`) instead of rows here — none of the 3 has a matching
`cron_incident_*` check (the two live ones today, `cron_incident_corridor_pulse_weekly` and
`cron_incident_lee_permits_weekly`, are unrelated workflows). They sit in a tracking mechanism the repo's
own documentation says is no longer the active one.

| Date | Workflow | Symptom | Status | Age (to 07-11) |
|---|---|---|---|---|
| 2026-06-22 | `daily-rebuild` | `Orphan Concept error: 1 slug claim(s) in pack "master" are not registered in refinery/vocab/brain-vocabulary.json: - fra` (row itself is truncated mid-word in the markdown source) | **OPEN** | 19 days |
| 2026-06-14 | `collier-permits-monthly` | Python traceback, `_auto-captured; pending triage_` — root cause never written | **OPEN** | 27 days |
| 2026-06-05 | `collier-permits-monthly` | Python traceback, `_auto-captured; pending triage_` — root cause never written | **OPEN** | 36 days |

**Live-verified against GitHub Actions (this session, `gh run list`):**
- `daily-rebuild` has run successfully every scheduled day 07-06 through 07-11 (5/5 success). The
  06-22 OPEN row is stale bookkeeping — the doc's own "Stop worrying about it if the last scheduled
  cron run shows success" guidance applies, but nobody flipped the row.
- `collier-permits-monthly`'s last run of any kind was **2026-06-14T08:23:21Z, `workflow_dispatch`,
  success** (44s) — a manual retry after the two OPEN failures. It has **not run again since**
  (`.github/workflows/collier-permits-monthly.yml` lines 3–9): the `schedule:` trigger has been
  commented out since 2026-06-16 pending two named conditions ("(1) GHA dry-run probe passes green
  ... (2) `collier_first_lake_ingestion` gate clears"). Neither condition is tracked as a `checks`
  entry — `collier_first_lake_ingestion` does not appear anywhere in the current 314-row ledger, and
  the re-enable criteria exist only as a YAML comment. The workflow currently accepts
  `workflow_dispatch` only, defaulting `dry_run: "true"`.

---

## 3. PARKED BUILD-QUEUE DATA ITEMS (`_AUDIT_AND_ROADMAP/build-queue.md`)

The file's own banner (lines 10–18) warns that most "PUSH HELD"/"awaiting push" markers are stale
(HEAD == origin/main as of 2026-06-21) — status should be read from `checks`, not queue prose. The
following are the queue's data/pipeline-specific parked items (as opposed to the majority of the
101-line file, which is email/UI feature work):

- **Line 94 — `lee_permits` Firecrawl→crawl4ai cutover.** Firecrawl retired; ported to crawl4ai +
  UndetectedAdapter. A dry-run/live-path branch bug (fixed 07-03, commit `e103fb38`) meant two
  scheduled runs (06-22, 06-29) silently ran `--dry-run` while reporting green. First real live test
  after the fix still wrote **0 rows** — Accela WAF hit the runner with sustained 429s during
  CapDetail enrichment. Net: the only live write that has ever landed for `lee_building_permits` is
  the original 2026-06-16 one. Cross-references `lee_permits_capdetail_waf_429` [3d untouched] and the
  two cursor/WAF checks in §1b above.
- **Line 50 — `market-heat-swfl` (realtor.com brain).** Built 2026-06-25, gates all green. First
  ingest run + prod-verify still pending as of the queue entry; no corresponding `*_live_verify` check
  was found in the current 314-row list under this name, meaning either it closed without a queue-line
  flip (stale prose) or it was never opened as a check (RULE 2.4 gap) — not independently verified live
  this session.
- **Line 93 — `franchise-outcomes` SBA FOIA pipeline.** Fixture-in-prod hole closed 2026-07-03 (brain
  had shipped a synthetic 15-brand fixture under a real SBA citation for 36 rebuild cycles). Still
  parked on the first live quarterly cron landing ≥50 real brands — open check `franchise_foia_first_run`
  [26d untouched], §1b above.
- **Line 80 — ZHVI ingest / home-values-swfl / investor-zip-swfl.** Queue text still reads "⬜ deploy:
  run zhvi-tier1/2 workflows + GRANT SELECT ... data_lake" (unflipped checkbox). `home-values-swfl` and
  `investor-zip-swfl` are independently confirmed **absent from BRAIN_CATALOG** as of a same-day
  (07-10) finding — `home_values_investor_zip_not_in_catalog`, §1b above — consistent with (but not
  proof of) the queue line never having been closed out.
- **Line 81 — `tier-divergence-swfl`.** Same pattern: queue text still reads "⬜ deploy: run
  tier-divergence-tier1/2 workflows ... GRANT ... data_lake" unflipped; open check
  `tier_divergence_graduation` [26d untouched] "graduation gate (after first clean live cycle)" in §1b.
- **Line 100 — Batch Deliverable Authoring.** Explicitly `[ ]` PARKED, trigger-gated on ≥25 independent
  builds in one send window or ~$50/mo scheduled `email_build` spend (checked against
  `public.api_usage_log`). Not data-ingest, included because it's the one item in the file the author
  explicitly left in the unstarted `[ ]` state rather than `[~]`/`[x]`.

---

## 4. PROPERTY-TYPE + RENTALS CODE STATE

### 4a. Sales pipeline (`listing_lifecycle`, SteadyAPI `/search`) — the collapse fix, traced

`ingest/pipelines/listing_lifecycle/extract_api.py:69-70`:
```python
def map_property_type(raw: str | None) -> str:
    return PROPERTY_TYPE_MAP.get((raw or "").strip().lower(), "other")
```
`PROPERTY_TYPE_MAP` (`ingest/pipelines/listing_lifecycle/constants_api.py:54-63`) maps vendor type
strings to `single_family` / `condo` / `townhouse` / `multi_family` / `manufactured` / `land`.

`parse_steadyapi` (`extract_api.py:91-158`) resolves `property_type` at line 117-122:
```python
if type_hint:
    ptype = map_property_type(type_hint)
elif beds is None and lot_sqft:
    ptype = "land"
else:
    ptype = "other"
```
`type_hint` is threaded in by `scan_county_api` (`extract_api.py:321-355`), which for every city calls
`build_type_lookup(city)` (`extract_api.py:250-264`) — a sweep of `STEADYAPI_TYPE_FILTERS =
["single_family", "condos", "townhomes", "multi_family"]` (`constants_api.py:74`) against SteadyAPI's
`/search?property_type=<v>` filter, building a `{property_id: filter_value}` lookup before parsing.
`scan_county_api` is imported and called from `pipeline.py:26,69,83` — confirmed the live production
path for `--source api` (the default, `pipeline.py:187-188`).

**Fix commit: `4114768b`, 2026-07-07, `"fix(listing-lifecycle): stop hardcoding every non-land listing
to single_family"`.** Before this commit there was no `type_hint`/`build_type_lookup` mechanism —
`parse_steadyapi` had no third branch, so every non-land row fell to a hardcoded `single_family`. This
matches CLAUDE.md's RULE 2.4 postmortem text ("listing_state.property_type collapsing every condo into
single_family region-wide, found independently the very next day (07/06–07)").

**Live data verification (this session, `mcp__lake__query_lake` against `pg.data_lake.listing_state`,
2026-07-11):**
```
source_name=api_feed:  single_family 14,665 · land 8,641 · condo 5,703 · residential 2,700
                        · other 1,627 · multi_family 535 · townhouse 534
source_name=lifecycle_seed: residential 298
```
`condo` (5,703), `townhouse` (534), and `multi_family` (535) — 6,772 rows total — **can only exist
under the post-`4114768b` code path**: no pre-fix code path could ever write those three tokens (the
pre-fix branch had exactly two outputs, `single_family` and `land`/`other`-via-heuristic). Their
presence in the live table is direct evidence the fix executed against live data and produced correctly
typed output, not just a dead code path.

Caveats visible in the same query, stated as facts:
- `single_family` (14,665) is expected to be the largest single bucket regardless of correctness — the
  code comment at `constants_api.py:67` calls it "the largest, least ambiguous bucket" — so this count
  alone doesn't distinguish correctly-matched single-family homes from any residual pre-fix rows that
  haven't been re-scanned since 07-07. `distill.py`'s `upsert_state` (MERGE on
  `(source_name, address_key, sale_or_rent)`) only overwrites `property_type` when a row is re-scanned;
  a listing that left the active sweep before 07-07 keeps whatever value it was last written with.
- `residential` splits into two different explanations by source. The **298 `lifecycle_seed`** rows are
  explained by a still-in-tree code path, not a legacy one: `ingest/pipelines/listing_lifecycle/extract.py:140`
  (the Source-B scrape extractor, `SOURCE_NAME = "lifecycle_seed"`, wired into `pipeline.py:25,68-69,86`
  under `source != "api"`) hardcodes `"property_type": "land" if (acres is not None and beds is None)
  else "residential"` — `"residential"` is its only non-land output, unconditionally. 298 is also the
  exact figure `pipeline.py:37` names for the known-inert Hendry seed rows ("the 298 stale
  `lifecycle_seed` Hendry rows stay inert history"), cross-referenced by the open checks
  `hendry_seed_orphans`/`hendry_first_sweep_land` (§1b) — so these are accounted for, not orphaned.
  The **2,700 `api_feed`** rows are the genuine anomaly: `PROPERTY_TYPE_MAP`'s value set is
  `{single_family, condo, townhouse, multi_family, manufactured, land}` plus the bare fallback
  `"other"` — `"residential"` appears nowhere in it, and no code path in the current `extract_api.py`
  can produce it. These predate something (`constants_api.py`'s docstring notes the file's own history
  is "RentCast/SteadyAPI ... RentCast retired 06-30," a plausible pre-cutover origin), but the RentCast-era
  normalizer itself was not read this session — the exact origin of the 2,700 is not reconstructed,
  only that current code cannot write it and nothing in the current code migrates or re-touches them.
- `steadyapi_429_no_retry` (§1b) recorded **zero rows written** for both Lee (07/07 11:52 UTC) and
  Collier (07/07 14:36 UTC) scheduled runs — same day as the fix commit. `steadyapi_subscription_suspended`
  (§1b, §5) recorded the vendor returning 403 on every call starting ~15:15 UTC that same day, still
  open as of 07-11. The exact window in which `4114768b` ran successfully against live SteadyAPI data
  (to produce the 6,772 typed rows above) sits somewhere between the 07-07 commit and the 07-07
  suspension; this session did not reconstruct the exact GHA run that did it.

### 4b. Test debt: two same-named test files, one stale

Two files test the same module:
- `ingest/pipelines/listing_lifecycle/test_extract_api.py` (73 lines) — co-located with the fix,
  asserts the **current** contract. Line 22-25: `test_no_hint_and_not_land_falls_to_other_not_single_family`
  asserts `property_type == "other"` with no `type_hint`. Lines 29-45 assert each `type_hint` maps
  correctly (`condos`→`condo`, `townhomes`→`townhouse`, `multi_family`→`multi_family`,
  `single_family`→`single_family`).
- `ingest/tests/pipelines/listing_lifecycle/test_extract_api.py` (243 lines, last touched
  `7fe68fd1`/2026-06-30 — not touched by the 07-07 fix commit) — **stale**, matching the open check
  `test_extract_api_stale_type_lookup`:
  - Line 53: `assert r["property_type"] == "single_family"  # has beds -> a home, not land` — calls
    `parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")` with **no `type_hint`**; under
    current code this now resolves to `"other"`, not `"single_family"` — stale assertion.
  - Line 217: `assert out["search_calls"] == len(extract_api.SWFL_CITY_SEED["Lee"])  # 1 page/city,
    mocked` — current `scan_county_api` (`extract_api.py:339`) adds `build_type_lookup`'s
    `type_pages` into `search_calls`; this test only mocks `fetch_steadyapi_city`, not
    `fetch_steadyapi_type_ids`, so the arithmetic no longer matches.
  - Lines 236-243: `test_scan_county_api_dry_run_never_calls_nearby_home_values` asserts
    `mock_get.assert_not_called()` under `dry_run=True`; current `scan_county_api`'s docstring
    (`extract_api.py:327-329`) states the type sweep "still fires ... even in dry_run" (only enrichment
    skips network) — the assertion is stale.

Both files remain in the tree; the newer one is correct, the older one is red on `main` independent of
any other change, per the check description.

### 4c. Rentals — separate table, separate pipeline, unmapped vendor type

`ingest/pipelines/rentals/pipeline.py:19` — `_TABLE = "data_lake.rental_listings_swfl"` — a table
entirely distinct from `data_lake.listing_state`/`listing_transitions`. `resources.py:31-64`
(`parse_rentals_page`) reads `SteadyAPI /rentals-search`, a **different endpoint** from `/search`: per
its own docstring (`resources.py:7-9`), the response carries `description.type` directly on every row
(verified live 07/01/2026, real Naples probe). Line 52: `"property_type": desc.get("type")` — the raw
vendor string is stored **verbatim, with no `PROPERTY_TYPE_MAP` normalization** (test fixtures confirm
raw tokens like `"apartment"` and `"single_family"` land unmapped —
`ingest/tests/pipelines/rentals/test_resources.py:27,44`). This is architecturally different from the
sales-side situation (not a bug of the same class): `/search` genuinely has no property-type field at
all (confirmed live, `extract_api.py:93-94`); `/rentals-search` does, and rentals just doesn't run it
through the same token-mapping step sales uses.

### 4d. Sale/rental table separation — convention, not a DB constraint

No `CREATE TABLE` for `data_lake.listing_state` was found under `docs/sql/` (predates that migration
convention). Every writer that touches it hardcodes the discriminator:
- `ingest/pipelines/listing_lifecycle/extract.py:144`: `"sale_or_rent": "sale",  # Source B is
  for-sale only — no rent class exists`
- `ingest/pipelines/listing_lifecycle/extract_api.py:139`: `"sale_or_rent": "sale",` (no comment, same
  literal)

`address_key.py:5` documents the schema was designed to hold both: "one address can be live for sale
AND rent at once" — i.e., the column exists to support rent rows, but **no current writer ever emits
one**. No `CHECK` constraint enforcing `sale_or_rent` values was found in any committed migration.
Every downstream consumer defensively re-filters instead of relying on write-time guarantees:
`docs/sql/20260627_listing_active_stats.sql:31`, `20260630_listing_active_stats_api.sql:25`,
`20260630_market_aggregates_tables.sql:64`, and `20260711_listing_active_stats_core_counties.sql:31`
all carry `AND sale_or_rent = 'sale'`. The enforcement is: hardcoded literal at write time + repeated
defensive filter at every read time, not a schema guarantee.

### 4e. A second, separate rental-contamination class: `data_lake.active_listings_residential`

This is architecturally distinct from §4a-d — an older, still-running, scrape-based pipeline (not
`listing_lifecycle`, not SteadyAPI) that mixes sale and rental listings **into the same raw table** by
design, with an admittedly incomplete heuristic classifier.

`ingest/pipelines/active_listings/distill.py:107-143` (`normalize`), comments verbatim:
- Line 108-111: "Classifies listing_type (sale vs rent) from the card's price-suffix span so MONTHLY
  RENTALS never contaminate the for-sale list_price column — the recurring bug where a $1,200/mo lease
  read as a $1,200 'home'."
- Line 126-128: the primary signal is a rendered `<span class="listing__price-suffix">` — "but ONLY
  Sarasota-region rental cards carry it."
- Line 131-136: a price-floor backstop (`_RENT_PRICE_FLOOR`) reclassifies any sub-floor
  "residential"-typed sale card as rent for Collier-region cards that carry no suffix at all, then
  states: **"A small residual of $50k+/season luxury rentals stays mislabeled — immaterial to the
  for-sale median, and the authoritative fix (detail-page 'Rental Price:' label) is skipped to keep the
  index scrape light (no per-listing detail fetch)."** This is a permanent, accepted design tradeoff in
  the code comment, not tracked as an open check.

**Fix history:** `docs/sql/20260625_active_listings_residential_zip_stats.sql` (applied 2026-06-25/26)
added `WHERE listing_type = 'sale'` plus a per-county latest-batch window to the *view*
(`active_listings_residential_zip_stats`) — the comment block states the fix explicitly: "a $1,200/mo
lease was inflating count and dragging the median to a backwards $315k." **The raw table itself
(`data_lake.active_listings_residential`) was never cleaned** — only the view built on top of it
filters.

**That view is now dead code.** `rg -rn "active_listings_residential_zip_stats" refinery/ lib/ app/`
returns zero live consumers; the only hit is a comment in `lib/landing/load-home-map-data.ts:13`:
*"The old active_listings_residential_zip_stats scraper table is ABANDONED here — its Collier coverage
collapsed to 3 ZIPs (WAF-blocked datacenter IP), which rendered the southern half of the map dead gray
(operator report 07/03/2026)."* Live consumers (`refinery/sources/active-listings-residential-source.mts:27,68`)
now read `VIEW = "listing_active_stats"` — the SteadyAPI/`listing_state`-based view — instead.

**The raw contaminated table is still being written daily.** `.github/workflows/active-listings-daily.yml`
is live; `ingest/cadence_registry.yaml:1458-1469` confirms `active_listings` writes
`data_lake.active_listings_residential` daily at 09:00 UTC, `source_name: active_listings_seed`, and
still lists "Consumer brain: refinery/packs/active-listings-swfl.mts" — but that brain's actual source
(§ above) reads `listing_active_stats`, not this table or its abandoned `_zip_stats` view. No consumer
of the raw table was found in `refinery/`, `lib/`, or `app/`.

**This exact raw table caused a live incident 4 days before this audit.** `SESSION_LOG.md` (2026-07-11,
"Reliable-sources research mission" and "CORRECTION" entries): a design doc for
`daily-price-dual-signal` was about to wire a feature directly off `data_lake.active_listings_residential`;
querying it directly reproduced "$309,000 across 9,229 listings" for Collier vs. the correct
`listing_active_stats`-derived ~$610,000 (Redfin sold ~$625,000, ~2.4% gap on the right table). Caught
via RULE 0.5 research before shipping. Open check `price_source_wire_off_stale_seed_table` (§1b) is the
live, unfixed tracking of "never read the raw seed table" as a standing rule — the raw table itself
remains queryable, uncleaned, and still growing.

---

## 5. LIVE BLOCKERS NOT SIZE-RANKED BY "UNTOUCHED DAYS"

`check.mjs`'s age counter measures ledger-entry age, not problem age. Two entries show `[0d untouched]`
(opened/touched today) while describing problems already several days old:

- **`steadyapi_subscription_suspended`** — SteadyAPI returns HTTP 403 ("Your API access has been
  suspended due to a cancelled or past-due subscription") on every call, verified live 2026-07-07
  ~15:15 UTC across all counties. Per the check description this blocks **listing-lifecycle, rentals,
  and market-aggregates ingest entirely**. No resolution or re-verification was found in
  `SESSION_LOG.md` lines 1-200 (all 2026-07-11) — the two log mentions (lines 1386, 2729) both cite it
  as a currently-open blocker while working around it. As of this audit (2026-07-11), 4 days have
  elapsed since the suspension was confirmed, with the check still open.
- **`daily_truth_median_sale_unvalued`** — `daily_truth.median_sale_price` rows exist but are NULL for
  19 days × 3 cities (Cape Coral, Fort Myers, Naples), verified 07-11. Traced in the same-day SESSION_LOG
  entry to the Gemini web-search leg of a 3-stub cascade hitting a billing 429 — the entry's own
  conclusion is that the deeper defect is architectural ("median_sale_price web-searches a number we
  already hold in lane 1"), separately tracked as `retire_gemini_price_websearch` (§1b).

---

## 6. PROBLEMS MENTIONED IN SESSION_LOG BUT NOT TRACKED AS A DEDICATED CHECK

Scanned `SESSION_LOG.md` lines 1-200 (all dated 2026-07-11) against the full 314-row checks ledger.
Nearly every problem surfaced in this window already has a matching check (cross-referenced inline in
§1b/§4/§5 above). One finding does not:

- **Lee GIS permit FeatureServers frozen since March 2025.** "Reliable-sources research mission" entry:
  "Lee GIS permit FeatureServers (confirmed live but **frozen since March 2025** — corrects the 07/08
  vendor-ceiling audit's 'replace Accela' framing, do NOT retire the Accela cron on this)." This is a
  specific, dated freshness ceiling on a named alternative data source (the thing that would have
  replaced the WAF-troubled Accela scrape, per §3 above). It is folded only generically into
  `vendor_extraction_ceiling_audit_followup`'s free-text body ("larger: Lee GIS permit layers replacing
  Accela scrape, LeePA layers 19-23 unresolved") — a rollup check that does not itself state the
  March-2025 freeze finding or its "don't retire Accela" conclusion. No dedicated check carries this
  fact on its own.

No other log-stated problem in this window was found without a corresponding check key. The Hendry
`/desk` contamination thread (raised 07/07, `desk_hendry_scope_leak`/`hendry_seed_orphans`) was
resolved same-day (07-11, "Hendry OFF /desk" entry, view migration `20260711_listing_active_stats_core_counties.sql`
applied live) — neither check key appears in the current open list, consistent with closure, not
neglect.
