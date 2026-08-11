# Repo inventory — sources, free-text columns, LLM call sites, precompute candidates

**LIVING DOC. Audited 07/30/2026 from live code + live Supabase queries — not from memory.**
This exists so the 5-part audit (ingest sources → free-text schema → row counts/cadence → every
LLM call site → every precompute candidate) never has to be re-run cold. It replaces re-auditing
with reading.

## The contract (why this file doesn't go stale)

Each area's `CLAUDE.md` (`ingest/`, `lib/assistant/`, `lib/email/`, `lib/deliverable/`,
`app/api/`, `refinery/packs/`) carries a short block at the top pointing at this file's section
for that area — **read it before you start working there.** When you add/remove a source, table,
free-text column, LLM call site, or a cache around a per-request computation, **update the matching
section here before you leave** — same commit, not a follow-up. A section that isn't kept current
here is exactly the failure this file exists to stop (RULE 0.8).

---

## Ingest sources & destination tables {#ingest-sources}

`ingest/cadence_registry.yaml` holds 76 `pipelines:` + 4 `not_yet_running:` + 13
`coverage_exempt:` = 93 tracked entries. No `format:` field exists in the registry — format below
is read from the actual pipeline code, not the registry.

### Tier-1 (DuckDB → Parquet/NDJSON, not Postgres)

| Source | Format | Destination |
|---|---|---|
| zori_swfl_duckdb | CSV (Zillow Research) via DuckDB | lake-tier1/market/zori_swfl.parquet |
| zhvi_swfl_duckdb | CSV (Zillow Research) via DuckDB | lake-tier1/market/zhvi_swfl.parquet |
| tier_divergence_swfl_duckdb | CSV (Zillow Research) via DuckDB | lake-tier1/market/tier_divergence_swfl.parquet |
| redfin_swfl | CSV (redfin-public-data S3) | lake-tier1/market/redfin_swfl.parquet |
| redfin_price_drops | CSV (redfin-public-data S3) | lake-tier1/market/redfin_price_drops.parquet |
| redfin_contract_cancellations | CSV (redfin-public-data S3) | lake-tier1/market/redfin_contract_cancellations.parquet |
| redfin_delistings_relistings | CSV (redfin-public-data S3) | lake-tier1/market/redfin_delistings_relistings.parquet |
| hurdat2_fl | fixed-width/CSV (NHC) | lake-tier1/environmental/hurdat2_fl.parquet |
| storm_history_swfl | CSV.gz (NCEI StormEvents) | lake-tier1/environmental/storm_events_swfl.parquet |
| usgs | API (USGS water services) | lake-tier1/environmental/usgs_water_swfl.parquet |
| faf5 | ZIP archive (FAF5.7.1) | lake-tier1/faf5/ |
| fred_g17 | API (FRED) | lake-tier1/macro/fred_g17/ — confirmed zero consumer |
| fred_laus_alfred | API (ALFRED) | lake-tier1/macro/fred_laus_alfred/ — confirmed zero consumer |
| fred_listing_swfl | API (FRED) | lake-tier1/market/fred_listing_swfl/ — confirmed zero consumer |
| market_heat_swfl | CSV (realtor.com econdata S3) | lake-tier1/market/market_heat_* |
| bls_ppi | API (BLS) | lake-tier1/macro/bls_ppi/ |
| bls_oews_swfl_tier1 | API (BLS) | lake-tier1/labor/bls_oews_swfl/ |
| census_vip | API (Census) | lake-tier1/macro/census_vip/ — confirmed zero consumer |
| city_pulse | scrape (crawl4ai) + LLM (Sonnet) | lake-tier1/city_pulse/ **and** data_lake.city_pulse |
| city_pulse_corridors | scrape (crawl4ai) + LLM (Sonnet) | lake-tier1/city_pulse_corridors/ **and** data_lake.city_pulse_corridors |
| sba_foia_franchise_outcomes *(parked)* | CSV | lake-tier1/franchise/sba_foia_franchise_county.parquet |
| airdna_str_swfl *(parked, workflow:none)* | parquet drop | lake-tier1/market/airdna_str_swfl.parquet — not actually read; investor-zip-swfl's declared source is a placeholder null |

### Tier-2 (Postgres)

| Source | Format | Destination |
|---|---|---|
| live_search_daily_median_asking | derivation over our own lake | data_lake.daily_truth |
| live_search_daily_mortgage | API + Anthropic web_search | data_lake.daily_truth |
| bls_laus | API (BLS) | data_lake.bls_laus |
| bls_qcew | CSV (BLS) | data_lake.bls_qcew |
| bls_oews_swfl | API (BLS) | data_lake.bls_oews_swfl |
| census_cbp | API (Census) | data_lake.census_cbp_fl |
| census_acs | API (Census acs5) | data_lake.census_acs_zcta |
| usgs_tier2 | ZOMBIE — module deleted, workflow:none | data_lake.usgs_daily — **table does not exist** |
| fema | API (OpenFEMA) | data_lake.fema_nfip_claims |
| leepa | ArcGIS REST (gissvr.leepa.org) | data_lake.leepa_parcels |
| leepa_comp_sales | ArcGIS REST | data_lake.leepa_comparable_sales — 108,848 rows, zero consumer |
| redfin_collier | CSV (redfin-public-data S3) | data_lake.redfin_collier_market |
| redfin_lee | CSV (redfin-public-data S3) | data_lake.redfin_lee_market |
| redfin_city_swfl | CSV (redfin-public-data S3, `redfin_data_center/housing_market/monthly/all_cities.csv` — retargeted 08/10/2026 off the frozen legacy dump) | data_lake.redfin_city_swfl |
| collier_parcels | ArcGIS REST (FDOR services9) | data_lake.collier_parcels |
| lee_parcels | ArcGIS REST (FDOR services9) | data_lake.lee_parcels |
| neighborhood_stats | DuckDB derivation over our lake | data_lake.neighborhood_stats |
| fhfa | JSON API | data_lake.fhfa_hpi |
| fdot | ArcGIS REST | data_lake.fdot_aadt_fl |
| lee_permits | scrape (crawl4ai, Accela) + CSV | data_lake.lee_building_permits |
| collier_permits | scrape (crawl4ai) + CSV | data_lake.collier_building_permits |
| fl_dor_tdt | API | public.fl_dor_tdt_collections |
| fl_dor_sales_tax | API | public.fl_dor_sales_tax |
| fdle_crime_swfl | API (FBI CDE) | public.fdle_crime_swfl |
| zori_swfl_tier2 | parquet promotion | data_lake.zori_swfl |
| zhvi_swfl_tier2 | parquet promotion | data_lake.zhvi_swfl |
| tier_divergence_swfl_tier2 | parquet promotion | data_lake.tier_divergence_swfl |
| fgcu_reri_indicators | scrape (crawl4ai) | public.fgcu_reri_indicators |
| swfl_inc | scrape (crawl4ai, stealth) | public.swfl_inc_announcements |
| listing_week | derivation, no external fetch | data_lake.listing_week |
| dbpr_press_releases | scrape (crawl4ai) + LLM (Sonnet) | public.dbpr_press_releases |
| rsw_airport_monthly | PDF (pdfplumber) + crawl4ai | public.rsw_airport_monthly |
| dbpr_sirs_submissions | Qlik QIX API via crawl4ai | data_lake.dbpr_sirs_submissions |
| fl_dbpr_licenses | CSV bulk extract | data_lake.fl_dbpr_licenses |
| fl_dbpr_applicants | CSV bulk extract | data_lake.fl_dbpr_applicants |
| dbpr_public_notices | scrape + PDF (pdfplumber) + LLM | public.dbpr_public_notices |
| dbpr_re_licensees | CSV | public.dbpr_re_licensees — zero consumer |
| noaa_ghcn_rainfall | CSV (AWS Open Data S3) | data_lake.noaa_ghcn_rainfall |
| city_pulse_corridors_tier2 | scrape (crawl4ai) + LLM (Sonnet) | data_lake.city_pulse_corridors |
| marketbeat_swfl | PDF (PyMuPDF) + Haiku vision | data_lake.marketbeat_swfl |
| colliers_industrial | PDF (PyMuPDF) + Haiku vision | data_lake.marketbeat_swfl |
| mhs_databook | PDF, **manual human drop** (workflow:none) | data_lake.marketbeat_swfl |
| swfl_search_demand | API (DataForSEO) | public.swfl_search_demand |
| mhs_permits_swfl | PDF (pdfplumber) + CSV | data_lake.mhs_permits_swfl |
| crexi_listings | scrape (crawl4ai) | data_lake.active_listings_cre |
| brevitas_listings | scrape (crawl4ai) | data_lake.active_listings_cre |
| lee_associates_swfl | PDF (pdfplumber) | data_lake.marketbeat_swfl |
| estero_edc | scrape | data_lake.local_cre_context |
| fmb_recovery | scrape | data_lake.local_cre_context |
| news_swfl | scrape (crawl4ai, markdown) | data_lake.news_articles_swfl |
| active_listings | scrape (crawl4ai) | data_lake.active_listings_residential — dead duplicate, zero consumer |
| listing_lifecycle | scrape (crawl4ai) + API | data_lake.listing_state (+ listing_transitions) |
| market_aggregates_histogram | API (SteadyAPI) | data_lake.listing_price_histogram_swfl |
| market_aggregates_details | API (SteadyAPI) | data_lake.market_details_swfl |
| realtor_geo_trends | API (SteadyAPI) | data_lake.realtor_geo_medians |
| rentals_swfl | API (SteadyAPI) | data_lake.rental_listings_swfl |
| neighborhood_amenities | API (SteadyAPI) | data_lake.steadyapi_neighborhoods + steadyapi_neighborhood_amenities + steadyapi_property_neighborhood (pairing edge) — **consumers (wired 08/04/2026):** `lib/deliverable/recipes/community-info.ts` (typed community NAME → neighborhood + amenity counts) and `lib/listings/neighborhood-amenities.ts` (a LISTING → its community, vendor pairing first then boundary polygon; reaches every address-spine recipe via `resolveSubject`/`authorListingNarrative` in `recipes/shared.ts`). All three tables read by product code; before 08/04 the pairing edge had ZERO readers and Gate 12 now blocks that shape |
| land_manufactured_swfl *(parked)* | not determinable — no pipeline code exists | none |
| lee_deed_official_records *(parked)* | DuckDB | data_lake.lee_deed_official_records — 0 rows (Akamai blocks unattended fetch) |

### Orphans & registry drift (found by cross-checking code against the registry both directions)

Pipeline code exists, **no registry entry, no GHA cron** — see [`orphan_ingest_pipelines_unregistered`](#checks):
- `report_design_research` — crawl4ai + Anthropic → writes a `report-designs.json` file, no DB table, no cadence
- `social_best_practices` — crawl4ai + Anthropic → writes a `social-practices.json` file, no DB table, no cadence
- `corridor_grounded` — Anthropic `web_search_20250305` → NDJSON to lake-tier1, no PG table, no cadence
- `community_profiles` — crawl4ai distill → `data_lake.community_profiles` (69 rows), unregistered

~~Live table in neither `pipelines:` nor `coverage_exempt:` — see [`cre_figures_unregistered`](#checks):
`data_lake.cre_figures` (1,078 rows) + `cre_figures_confidence` (985 rows), written by
`scripts/build-cre-figures.mjs`, no cadence entry.~~ **PARTLY STALE — re-verified 08/11/2026.** The
REGISTRY half is fixed: `cre_figures` now has a real entry at `ingest/cadence_registry.yaml:1624`
(`dispatch_only: true`, `freshness_table: data_lake.cre_figures`, with `cre_figures_confidence`
documented as the secondary table from the same build). **Two gaps remain, both real:** (1) still
`consuming_pack: none` — zero readers, the writer `scripts/build-cre-figures.mjs` and the
derivation `refinery/lib/derived/cre-figures.mts` exist but nothing consumes the materialized
tables; (2) still **no GHA cron** — `grep -rn "build-cre-figures" .github/` returns nothing, so it
refreshes only on a manual `bun scripts/build-cre-figures.mjs`. Open check:
`cre_figures_build_cron_cadence` (24d untouched as of 08/11/2026). **Row counts RE-PROBED LIVE
08/11/2026: `cre_figures` = 1,078, `cre_figures_confidence` = 985 — byte-identical to the
07/18/2026 census, 24 days later.** That is not reassurance, it is the proof of gap (2): with no
cron the table has not moved a single row since the day it was built. **This needs WIRING, not
deletion.**

Stale registry entry — see [`stale_registry_usgs_sites`](#checks): `coverage_exempt` still lists
`data_lake.usgs_sites`; the table was dropped 07/19/2026
(`migrations/20260719_drop_usgs_tier2_corpses.sql`), confirmed against live `pg_class`.

---

## Free-text columns {#free-text-columns}

Free text = **measured** (avg/max length + distinct-value ratio), never name-matched. ~45 other
ingest tables were checked and confirmed to hold none (codes, FIPS, ZIPs, place names, enums,
`_dlt` lineage ids only) — only tables with at least one real free-text column are listed.

| Table | Column | Type | Free text? | Evidence |
|---|---|---|---|---|
| data_lake.news_articles_swfl | headline | text | **YES** | avg 67 / max 101 chars, scraped |
| | body_text | text | **YES** | avg 2,974 / max **3,000** chars (hard-truncated), 234/234 rows, scraped |
| | (article_url, source_name, published_date, timestamps) | text/timestamptz | no | — |
| public.dbpr_press_releases | title | text | **YES** | avg 77 / max 227, scraped |
| | body_text | text | **YES** | avg 2,692 / max 18,520, not truncated at rest, scraped |
| | summary | text | **YES** | avg 310 / max 605, 151/151 rows — **LLM output (Sonnet)** |
| | topics / affected_industries / geographic_mentions | ARRAY | short, LLM output | Sonnet |
| public.dbpr_public_notices | pdf_summary | text | **YES** | avg 461 / max 517, 14/14 — **LLM output** over pdfplumber text (PDF text itself never stored) |
| | (respondent_name, county, case_number, violation_type, industry) | text | no | codes/names, 2-19 distinct |
| data_lake.city_pulse | fact | text | **YES** | avg 174 / max 299, 171/181 — **LLM output (Sonnet)** |
| | source_title | text | **YES** | avg 68 / max 151, 81 distinct, scraped |
| | cited_text | text | **YES** | avg 2,459 / max **3,000** (hard-truncated), scraped verbatim span |
| data_lake.city_pulse_corridors | fact | text | **YES** | avg 154 / max 366, 198/198 — **LLM output (Sonnet)** |
| | source_title | text | **YES** | avg 78 / max 153, 163/198, scraped |
| | cited_text | text | **YES** | avg 279 / max **1,500** (hard-truncated), scraped |
| data_lake.local_cre_context | headline | text | **YES** | avg 49 / max 64, 14/14, scraped |
| | detail | text | **YES** | avg 186 / max 328, 14/14, scraped |
| public.swfl_inc_announcements | title | text | **YES** | avg 55 / max 93, 32/32, scraped |
| | summary | text | **YES** | avg 375 / max 448, 32/32, scraped blog excerpt — **no LLM in this pipeline** |
| data_lake.lee_building_permits | permit_description_raw | text | **YES** | avg 67 / max 955, 271/303, scraped scope-of-work |

Measured and confirmed **NOT** free text despite narrative-sounding names:
`lee_parcels`/`collier_parcels.legal_description` (avg 20-25 chars, abbreviated FDOR code),
`special_circumstances_text` (0 non-null on both tables), `leepa_parcels.use_description` (avg 21,
86 distinct — a DOR use-code label), `community_profiles` (all 23 text columns measured, longest
non-URL value is 34 chars), `bls_qcew.industry_title` (0 non-null), `dbpr_sirs_submissions`/
`dbpr_re_licensees` name/address fields (proper nouns, not prose).

Structural note: `dbpr_public_notices` and `marketbeat_swfl` never persist the source PDF text at
all — the extracted text/image goes straight into the ingest-time LLM prompt and is discarded;
only the model's output lands in the table.

---

## Refresh cadence — free-text tables only {#refresh-cadence}

Row counts are live `SELECT count(*)`, measured 07/30/2026. `cadence_days` in the registry is the
source's own publish cadence, not our run cadence — both given.

| Table | Row count | Actual GHA/cron refresh | Registry cadence_days |
|---|---|---|---|
| data_lake.news_articles_swfl | 234 | daily 06:00 UTC (`news-swfl-ingest.yml`) | 1 |
| public.dbpr_press_releases | 151 | weekly, Mon 09:00 UTC | 7 |
| public.dbpr_public_notices | 14 | weekly, Mon 10:00 UTC | 7 |
| data_lake.city_pulse | 181 | daily 04:23 UTC, via nightly-chain (own cron file commented out, called as reusable workflow) | 1 |
| data_lake.city_pulse_corridors | 198 | **not scheduled** — cron commented out, `dispatch_only: true`; paused 07/05/2026 for paid web_search spend control | 7 |
| data_lake.local_cre_context | 14 | monthly, 1st 01:00 UTC | 30 / 90 (two sources) |
| public.swfl_inc_announcements | 32 | weekly, Mon 08:00 UTC | 7 |
| data_lake.lee_building_permits | 303 | weekly, Mon 11:00 UTC | 7 |

---

## LLM call sites {#llm-call-sites}

19 metered call types (11 TS `CallType` + 8 Python ingest), grouped by when they actually fire.
Root: `refinery/agents/anthropic.mts` (`CallType` union, `getAnthropic(callType)`, `RATES` table).

**08/02/2026 — user-data typed-lane routes added, ZERO LLM calls in any of them** (so this audit
needn't re-check): `app/api/listings/import` (CSV parse + upsert + read-back echo),
`app/api/tokens` (per-user token mint), `app/api/connect/skill` (static skill markdown),
`app/api/uploads/parked` (checks-entry insert). All deterministic; the only LLM touching
user-brought data remains `extract-pdf` above (blob lane, unchanged).

### Chat/answer surfaces (per user request) {#llm-call-sites-chat}
- `lib/assistant/stream.ts:103` — chat streaming response — `assistant_stream`, Sonnet
- `lib/assistant/compose-chart.ts:552` — chat chart composition/selection — `assistant_chart`, Haiku (TRIAGE_MODEL)
- `lib/assistant/web-fallback.ts:122` — classify which figures a question needs — default callType, Haiku
- `lib/assistant/gap-fill.ts:188` — live web-search gap-fill for external figures — default callType, Sonnet (SEARCH_MODEL)
- `lib/assistant/report-path.ts:183` — chat report-grounded answer generation — default callType
- `lib/grounded-answer.ts:147` — grounded chat answer generation — default callType
- `app/api/projects/[id]/extract-pdf/route.ts:125` — user-uploaded PDF extraction — default callType, Haiku (EXTRACTION_MODEL)
- `app/api/projects/[id]/action/route.ts:235` — project action processing — default callType, Haiku (ACTION_MODEL)
- `app/api/email/schedule-command/route.ts:222` — user-typed schedule command parsing — default callType, Haiku (COMMAND_MODEL)
- `app/api/email-lab/ai/route.ts:206` — Email Lab AI assist (legacy token-fill branch) — default callType

### Deliverable/email build (per user request) {#llm-call-sites-email}
- `lib/deliverable/build.ts:344` — deliverable narrative synthesis — `deliverable_build`, Sonnet
- `lib/email/data-readiness.ts:227` — grounded lookup / outlier web-confirm during a build — default callType
- `lib/email/build-doc.ts:552,853,1058` — email document build, 3 call sites (added-slot author, skeleton fill, listing narrative) — `email_build`, Sonnet/Haiku. Was 4: the free-author `callAuthor` site died in the one-lane collapse (spec 2026-08-02)
- `lib/email/suggest-recipe.ts:54` — suggestion chips: keyless-ask → ≤2 recipe-key proposals (closed-list filtered, navigation only) — `email_build`, Haiku
- `lib/deliverable/recipes/{under-contract,sphere-weekly,agent-brand-intro,shared,agent-launch,market-comps,market-pulse,review-reply}.ts` — 8 recipe-authoring call sites — `email_build`, Sonnet
- `lib/email/showing-prep-assemble.ts:87` — showing-prep document build — `email_build`
- `lib/email/social-calendar/build-canvas-fill.ts:60`, `build-week.ts:250` — social calendar build — default callType
- `lib/social/design/author.ts:243` — social content authoring — default callType

### Brain-rebuild pipeline (GHA dispatch, not a live request, not raw ingest) {#llm-call-sites-brain-rebuild}
- `refinery/agents/triage-agent.mts:163` — cheap classification stage — `triage`, Haiku
- `refinery/agents/synthesis-agent.mts:100` — pack data → refined prose facts — `synthesis`, Sonnet

### Scheduled/cron (not per-request, not raw ingest) {#llm-call-sites-scheduled}
- `scripts/bake-narratives.mts:157,223,355,382` — weekly/daily surface-narrative bake — `narrative_bake`, Sonnet/Fable-5
- `lib/email/insiders/author.ts:134` — Insiders Edition flagship draft+editor, own spend ledger — `insiders_author`, Fable-5 (refusal fallback: Opus)
- `lib/social-pulse/narrative.ts:18` — social pulse narrative generation — default callType

### CI/developer-triggered only (never production ingest or user request) {#llm-call-sites-ci}
- `lib/deliverable/factuality-grader.ts:10` — promptfoo model-graded factuality gate — `factuality_ci`, SYNTHESIS_MODEL, only under `FACTUALITY_GATE=1`
- `scripts/prove-*.mts` (9 scripts: web-fallback, user-chart, upload-chart, tier-divergence-wiring, gap-fill, fact-injection, deflection, compose-chart, chart-deflection, chart-conversation) — live answer-proof verification, pre-push gate — `proof`
- `scripts/audit-spec-estate.mts:24` — dev audit script — default callType
- `refinery/tools/synthesize-corridor-character.mts:467` — operator-run corridor-character synthesis — default callType
- `lib/prospects/enrich-brand.ts:187` — operator prospect/brand enrichment tool — default callType, injectable client

### Python, ingest time (all 8, meter through `log_api_usage()`) {#llm-call-sites-python-ingest}
- `ingest/lib/extract_client.py:202` — `ingest_extract` — general document text extraction
- `ingest/pipelines/corridor_grounded/pipeline.py:183` — `ingest_corridor_grounded` — web-search-grounded corridor facts (orphaned, see above)
- `ingest/pipelines/city_pulse_corridors/distill.py:216` — `ingest_corridor_pulse_distill` — corridor pulse "fact" rows, Sonnet — currently unscheduled (paused 07/05/2026)
- `ingest/pipelines/city_pulse/distill.py:251` — `ingest_city_pulse_distill` — city pulse "fact" rows, Sonnet
- `ingest/pipelines/dbpr_public_notices/summarize.py:26` — `ingest_dbpr_notices` — summarize public-notice PDFs — **doc/code mismatch, see [`dbpr_notices_model_mismatch`](#checks)**: header comment + registry claim Haiku for cost; default param is `claude-sonnet-4-6` and the call site passes no override, so Sonnet runs today
- `ingest/pipelines/dbpr_press_releases/enricher.py:98` — `ingest_dbpr_press` — enrich press releases (summary + topics + industries + geo), Sonnet
- `ingest/pipelines/report_design_research/crawl_report_designs.py:97` — `ingest_report_research` — research report design patterns, writes JSON, orphaned (see above)
- `ingest/pipelines/marketbeat_pdf/extractor.py:505` — `ingest_marketbeat` — CRE marketbeat PDF extraction via page-image vision, Haiku

---

## Precompute candidates — per-request work that could be cached {#precompute-candidates}

- `lib/fetch-brain.ts:295` `buildDossier()` — recomputes `scrubDossierStrings` + `computeMetricChart` every call; `fetchBrain()` IS memoized (in-process `brainCache`), `buildDossier` wrapping it is not. Uncached callers: `app/api/b/[slug]/route.ts:75`, `app/api/mcp/server.ts:352`, `lib/assistant/conversation-path.ts:282,306,385`, `lib/highlighter/report-grounding.ts:50`, `lib/highlighter/fetch-reach.ts:24`, `lib/grounded-answer.ts:143`.
- `lib/fetch-brain.ts:173` `loadParsedBrain()` — raw `readFile` + parse, **zero memoization**. Uncached callers: `app/r/zip-report/[zip]/page.tsx:96` (15 brains/render), `lib/zip-report/load-ranked-signals.ts:72,75,76` (a second independent 15-brain load for the ZIP email seed), `lib/should-i-sell/load-market-snapshot.ts:120,142`, `lib/back-on-market/load-zip.ts:87`, `lib/should-i-sell/load-zip-soh.ts:35`, `lib/deliverable/build.ts:135`, `lib/deliverable/examples.ts:135`, `lib/reconcile/lane1.ts:167`, `lib/landing/load-map-flood.ts:36`, `lib/narratives/zip-inputs.ts:27,37`, `lib/narratives/corridor-inputs.ts:63`, `app/api/mcp/project-tools.ts:134`. A `page-data.ts:20-23` comment claiming brain reads are "disk + in-process-memoized already" is false for this function — it conflates it with the separate, actually-memoized `fetchBrain` path.
- `app/r/zip-report/[zip]/page.tsx:45` — `export const dynamic = "force-dynamic"` (a `revalidate = 3600` attempt was reverted 07/25/2026 after production crashes). Every request re-runs 15 uncached brain parses + a permits-count loop + `buildZipCandidates` + `rankSignals`. A separate part of the same page (`page-data.ts:65-73`) IS `unstable_cache`d — the page is half-cached.
- `lib/zip-report/load-ranked-signals.ts` — its own comment says it duplicates `assemble.ts`'s brain-load → aggregate → rank pipeline "until the page adopts this helper." Same ZIP's 15 brains re-parsed and re-ranked independently by the webpage path and the email-seed path.
- `lib/zip-report/candidates.ts:682,749,788,817` — `buildZipCandidates` calls `percentileOf` up to 4×/request, each a full sort over the cross-ZIP distribution, fresh every request.
- `lib/back-on-market/load-zip.ts:82-117` `loadBackOnMarketZip()` — computes the ZIP's stress-score rank among all ZIPs fresh every call (via uncached `loadParsedBrain`). Called from the should-i-sell page AND `app/api/og/should-i-sell/[zip]/route.ts` — both recompute the region-wide rank on every hit.
- `app/api/og/should-i-sell/[zip]/route.ts` — `force-dynamic` but sets `Cache-Control: public, max-age=3600, s-maxage=86400`, implying reliance on CDN/edge caching; not verified live whether Vercel's edge honors this on a force-dynamic route.
- `app/api/b/[slug]/route.ts` — 08/03/2026: success responses now `public, s-maxage=3600, stale-while-revalidate=86400` (errors stay `no-store`), unparking the 2026-06-06 clone-protection record's parked s-maxage option (external Apify Actor consumers arrived; operator decree). Freshness-safe because brains ship in the deploy bundle — every rebuild redeploys and purges the CDN cache. VERIFIED LIVE 08/03/2026: consecutive hits returned x-vercel-cache MISS then HIT — Vercel's CDN honors s-maxage on a force-dynamic route handler, which also answers the og route's open question above.
- `app/api/z/[zip]/route.ts` — public, `force-dynamic`, `Cache-Control: no-store`. Calls `assembleLocationDossier()` (the same ~28-brain fan-out `lib/welcome/dossier-cache.ts` exists to guard with a 5-min TTL + LRU on the chat path) with no cache override — every hit re-parses ~28 brain files, less protected than the chat-path equivalent.
- `lib/assistant/comp-helper.ts` `compsForAddress`/`compHelper` — every chat comp/valuation question geocodes, queries `lee_comp_sales_v` live (≤500 rows) or SteadyAPI, then `rankComps`. No caching keyed by address/subject — identical "comps near X" re-runs the full chain every time.
- `lib/assistant/web-fallback.ts:121-142` `defaultProbe` — synchronous Haiku call per figure-shaped question (gated only by a cheap regex). No caching of prior probe results.
- `lib/assistant/gap-fill.ts:244-288` `fillExternalPoint()` — live Sonnet + web_search call per external-figure request, no cache — same `{label, search_query}` from two different users (or a retry) triggers a brand-new paid search both times.
- `lib/assistant/compose-chart.ts:531-702` `composeChartFromRequest()` — rebuilds the full chart-candidate menu (every key_metric/detail_table cell, bounded to 240 points) fresh per request, then a tool-forced Haiku call to select from it. No caching of the menu or a repeated identical request.
- `lib/assistant/conversation-path.ts:480-527` `otherProjectsBlockFor()` — every PROJECT-AI turn with an open project re-queries + re-indexes + computes overlap across the user's other projects, even though that set rarely changes mid-conversation.
- `lib/deliverable/build.ts:474-557` `buildDeliverableNarrative()` — 1-2 synchronous Sonnet calls per build/refresh, plus per-outlier live web-confirm calls when enabled. `POST /api/deliverables/[id]/refresh` re-runs the entire pipeline including the LLM narrative call even when the underlying brain data hasn't changed since the prior render. **⚠️ MEASURED 08/06/2026 — DO NOT SPEND EFFORT HERE: this path is effectively DEAD.** `api_usage_log` `deliverable_build` fired **187 times lifetime, last on 07/17/2026, zero in the 30 days to 08/06**; `/refresh` has been used **once ever** (1 of 92 `deliverables` rows). The code claim above is true and worth ~nothing in practice. The LIVE narrative traffic is `email_build` — **636 calls / $5.89 per 30 days** — the recipe path below. A caching spec was written against this dead path before anyone checked volume; the correction is `docs/superpowers/specs/2026-08-06-precompute-narrative-cache-design.md` (marked SUPERSEDED).
- `lib/deliverable/recipes/*.ts` (8 files) — each fires its own synchronous Sonnet call per user-triggered build, no cross-file caching. **This is the real target** (`email_build`, 636 calls/30d), not `buildDeliverableNarrative` above.
  - **PARTIALLY ADDRESSED 08/06/2026 (bake side only).** The `area-email` surface (`lib/narratives/area-email-inputs.ts`, registered in `scripts/bake-narratives.mts`) precomputes and validates the AREA read for the 52 core ZIPs, so an area recipe can read an already-checked row instead of authoring one. Dry-run proven: 52 surfaces, 6 copy-ready facts each. **NO RECIPE READS IT YET** — check `area_email_readthrough_phase2`. ADDRESS-spined recipes are deliberately NOT precomputable (unbounded subject) and keep generating live.
  - Only AREA-spined recipes are candidates. The split is decided by `Recipe.subject` in `lib/deliverable/recipes.ts`, a required compile-time field.
- `app/api/email-lab/ai/route.ts:206-211` — direct LLM call in the legacy branch, plus a lake-context fan-out across brains on every legacy-mode request — internal caching not examined further.

**Already-cached, for contrast:** `lib/fetch-brain.ts:112` `brainCache` (in-process Map, no TTL, backs `fetchBrain()` only); `lib/welcome/dossier-cache.ts` (5-min TTL + LRU around the 28-brain fan-out, chat path only); `lib/figures/sourced.ts` `getSourcedFigures` (real DB-backed cache with `expires_at`); **`lib/narratives/*` + `scripts/bake-narratives.mts` — a full precompute→validate→cache pipeline (`public.narratives`, `inputsHash` delta gate, fail-closed validator, Message Batches API at 50%), 1,446 calls/30d, four surface adapters (`zip`, `corridor`, `brain`, `area-email`); `lib/email/zip-seed.ts:76` already reads a baked row into an email**; `app/r/zip-report/[zip]/page-data.ts:65-73` (`unstable_cache`, 3600s). A repo-wide grep found only 18 files anywhere using `"use cache"`/`unstable_cache`/`export const revalidate`.

---

## What could not be fully verified (07/30/2026 pass)

1. `land_manufactured_swfl` / `airdna_str_swfl` — both parked `workflow: none`; the former has no pipeline directory, format not determinable.
2. `mhs_databook` — manual human PDF drop by design; no automated fetch path to verify format beyond "PDF."
3. `report_design_research`, `social_best_practices`, `corridor_grounded` — each writes to a file/object path, not a table; no committed output file, so row counts/volume not determinable.
4. Full column listing for all ~196 tables — this covers every column on the 11 free-text tables plus a confirmed-negative check on ~45 more; the remaining tables' full ~2,565-column list was not printed (depth over breadth).
5. Whether `app/api/og/should-i-sell/[zip]`'s cache headers actually produce a CDN hit on Vercel — not tested against a live deployment.
6. Whether `buildDossier`'s recomputed chart duplicates an equivalent already persisted in a committed `brains/*.md` file — plausible, not confirmed.

## Open checks tracking the defects found here {#checks}

- `stale_registry_usgs_sites` — `coverage_exempt` lists a dropped table
- `dbpr_notices_model_mismatch` — doc says Haiku, code runs Sonnet
- `orphan_ingest_pipelines_unregistered` — 4 pipelines with no registry/cron entry
- `cre_figures_unregistered` — 2 live tables outside the registry entirely
- `precompute_candidates_triage` — the [precompute-candidates](#precompute-candidates) list above needs a fix/skip decision per row
