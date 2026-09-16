# Data inventory — what we have, what we can get, how big it is

**Live-verified 09/15/2026** against Supabase Postgres (`SUPABASE_PG_*` creds, exact
`pg_total_relation_size` + server-side exact `count(*)` via `query_to_xml`, one round trip per
metric — no estimates, no `reltuples`) and `ingest/cadence_registry.yaml` (75 `pipelines:` + 4
`not_yet_running:` + 13 `coverage_exempt:`). This is the source-by-source companion to
[`data-roots.md`](./data-roots.md) (concept → root, for answering a number) and
[`repo-inventory-audit.md`](./repo-inventory-audit.md) (source → destination format). This file
answers a different question: **do we have it, is it on a schedule, and how big is it.**

Re-run the two live checks that built this file:
- Row counts + byte sizes: `pg_stat_user_tables` joined to `pg_total_relation_size` (see
  `scripts/CLAUDE.md` session-loop tools for the pattern; SQL run via `new Bun.SQL`, same
  connection the migrations use).
- Cadence/status: parse `ingest/cadence_registry.yaml` with any YAML lib — `pipelines[].parked`,
  `.dispatch_only`, `.cadence_days`, `.count_table`/`.freshness_table`.

**Storage confirmed:** Supabase is still the only warehouse — `@supabase/supabase-js` +
`@supabase/ssr` in `package.json`, migrations via `Bun.SQL`, every new `data_lake.*` table gets a
`GRANT SELECT ... TO service_role` + PostgREST reload (`ingest/CLAUDE.md`). No infra change needed
to bring in more data — it drops into the same pipe.

## Top line

- **Total Postgres/Supabase size: 2,709,122,195 bytes = 2,584 MB ≈ 2.58 GB**, across 173 tracked
  tables in `data_lake` + `public`, as of 09/15/2026.
- **≈2.05 GB of that (62 tables) is registered external source data** — the tables listed below,
  fed by a named `pipelines:` entry. The remaining ≈0.53 GB splits between product/app tables
  (contacts, emails, checks, social scheduling, billing — each ≤64 kB, dozens of them) and
  ingest-internal staging (`_dlt_version`, `_dlt_loads`, SteadyAPI `_raw` landing tables,
  `apify_property_records`, `google_maps_amenities`). Not a precise partition — some `_raw`
  staging tables sit outside the clean pipeline-name mapping — but accurate within a few percent.
- **A second lake exists outside Postgres: `s3://lake-tier1/...`**, cold Parquet cache for ~16
  more sources (Redfin CSVs, ZHVI/ZORI raw, FAF5 freight, HURDAT2, NOAA storm events, USGS raw,
  three FRED series, BLS PPI/OEWS raw, Census VIP). **Size not measured this pass** — no AWS
  CLI/boto3 wired for a listing call, and I won't invent a number. Follow-up: `aws s3 ls
  --recursive --summarize s3://lake-tier1/` (or boto3 equivalent) once creds are confirmed.

---

## WHAT WE HAVE — live in Postgres, cron-scheduled (or dispatch-only)

Cadence is in days. Status `cron` = fires on its own schedule; `DISPATCH-ONLY` = code runs, but
only on a manual/chained trigger, not its own clock. Rows and size are exact, live, 09/15/2026.

### Real estate — parcels & valuation

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| leepa | `data_lake.leepa_parcels` | 365d | cron | 548,798 | 280 MB | properties-lee-value |
| collier_parcels | `data_lake.collier_parcels` | 365d | cron | 290,973 | 329 MB | properties-collier-value |
| lee_parcels | `data_lake.lee_parcels` | 365d | DISPATCH-ONLY | 556,083 | 449 MB | properties-lee-value |
| leepa_comp_sales | `data_lake.leepa_comparable_sales` | 365d | cron | 108,848 | 28 MB | properties-lee-value (**zero downstream consumer** — see below) |
| neighborhood_stats | `data_lake.neighborhood_stats` | 365d | cron | 20,400 | 11 MB | communities-swfl |
| lee_planned_developments | `data_lake.lee_planned_developments` | 92d | cron | 1,627 | 4 MB | communities-swfl |
| parcel_community_pd | `data_lake.parcel_community_pd` | 92d | cron | 104,911 | 83 MB | communities-swfl |
| fhfa (HPI) | `data_lake.fhfa_hpi` | 90d | cron | 184,817 | 61 MB | properties-lee/collier-value |

### Recorded sales & deeds

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| lee_deed_official_records | `data_lake.lee_deed_official_records` | manual (ODD — Akamai blocks unattended fetch) | **PARKED by design, but has real data** | 28,186 | 31 MB | lee-deed-records-swfl |
| collier_official_records | `data_lake.collier_official_records` | 1d | cron | 22,866 | 8 MB | collier-official-records-swfl |

### Listings & market activity

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| listing_lifecycle | `data_lake.listing_state` | 1d | cron | 36,491 | 26 MB | active-listings-swfl |
| listing_week | `data_lake.listing_week` | 7d | cron | 310,860 | 76 MB | **pack=none, landed & unread** |
| redfin_city_swfl | `data_lake.redfin_city_swfl` | 31d | cron | 420,201 | 183 MB | **pack=none, landed & unread** |
| redfin_collier | `data_lake.redfin_collier_market` | 31d | cron | 782 | 424 kB | properties-collier-value |
| redfin_lee | `data_lake.redfin_lee_market` | 31d | cron | 660 | 232 kB | properties-lee-value |
| zori_swfl_tier2 | `data_lake.zori_swfl` | 30d | cron | 5,460 | 3.2 MB | rentals-swfl |
| zhvi_swfl_tier2 | `data_lake.zhvi_swfl` | 30d | cron | 34,249 | 17 MB | home-values-swfl |
| tier_divergence_swfl_tier2 | `data_lake.tier_divergence_swfl` | 30d | cron | 39,526 | 20 MB | tier-divergence-swfl |
| market_aggregates_histogram | `data_lake.listing_price_histogram_swfl` | 7d | cron | 400 | 128 kB | price-distribution-swfl |
| market_aggregates_details | `data_lake.market_details_swfl` | 30d | cron | 162 | 80 kB | market-temperature-swfl |
| realtor_geo_trends | `data_lake.realtor_geo_medians` | 30d | cron | 18 | 32 kB | **pack=none, landed & unread** |
| rentals_swfl | `data_lake.rental_listings_swfl` | 7d | cron | 38,620 | 7 MB | active-rentals-swfl |
| neighborhood_amenities | `data_lake.steadyapi_property_neighborhood` (+2 sibling tables) | 1d | DISPATCH-ONLY | 21,008 | 4.6 MB | communities-swfl |

**Per-property SteadyAPI enrichment (listing-scoped, not a county roll — T12 in data-roots.md):**
`steadyapi_listing_events` 235,383 rows / 93 MB, `steadyapi_tax_history` 273,051 rows / 57 MB,
`steadyapi_property_permits` 79,281 rows / 20 MB. All three registered under `listing_lifecycle`'s
family, live, cron-fed.

### Government / regulatory / licensing

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| fl_dbpr_licenses | `data_lake.fl_dbpr_licenses` | 30d | cron | 12,733 | 5.2 MB | licenses-swfl — **2 of 35 license boards pulled (Construction + Electrical)** |
| fl_dbpr_applicants | `data_lake.fl_dbpr_applicants` | 30d | cron | 8,769 | 1.6 MB | licenses-swfl |
| dbpr_re_licensees | `public.dbpr_re_licensees` | 7d | cron | 30,509 | 25 MB | **pack=none, landed & unread** |
| dbpr_sirs_submissions | `data_lake.dbpr_sirs_submissions` | 30d | cron | 1,366 | 1.2 MB | condo-sirs-swfl |
| dbpr_press_releases | `public.dbpr_press_releases` | 7d | cron | 152 | 1.1 MB | news-swfl |
| dbpr_public_notices | `public.dbpr_public_notices` | 7d | cron | 14 | 152 kB | news-swfl |
| fdot (AADT) | `data_lake.fdot_aadt_fl` | 365d | cron | 103,662 | 26 MB | traffic-swfl — **1 of 1,586 FDOT ArcGIS layers pulled** |
| lee_permits | `data_lake.lee_building_permits` | 7d | cron | 333 | 304 kB | permits-swfl |
| collier_permits | `data_lake.collier_building_permits` | 30d | DISPATCH-ONLY | 14,181 | 9.2 MB | permits-swfl |
| mhs_permits_swfl | `data_lake.mhs_permits_swfl` | 365d | cron | 412 | 360 kB | permits-commercial-swfl |
| fl_dor_tdt | `public.fl_dor_tdt_collections` | 30d | cron | 666 | 272 kB | tourism-tdt |
| fl_dor_sales_tax | `public.fl_dor_sales_tax` | 30d | cron | 40,140 | 18 MB | sector-credit-swfl |
| fdle_crime_swfl | `public.fdle_crime_swfl` | 90d | cron | 8 | 64 kB | safety-swfl — **county-total only; city + offense breakdown already computed, then discarded** |

### Economic / labor

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| census_cbp | `data_lake.census_cbp_fl` | 365d | cron | 255,563 | 56 MB | macro-florida |
| census_acs | `data_lake.census_acs_zcta` | 365d | cron | 100 | 72 kB | zip-summary |
| bls_laus | `data_lake.bls_laus` | 30d | cron | 364 | 232 kB | macro-swfl |
| bls_qcew | `data_lake.bls_qcew` | 90d | cron | 32 | 80 kB | macro-swfl |
| bls_oews_swfl | `data_lake.bls_oews_swfl` | 365d | cron | 220 | 192 kB | labor-demand-swfl |
| rsw_airport_monthly | `public.rsw_airport_monthly` | 30d | cron | 2,580 | 1.7 MB | rsw-airport |
| fgcu_reri_indicators | `public.fgcu_reri_indicators` | 30d | cron | 17 | 64 kB | fgcu-reri |
| swfl_search_demand | `public.swfl_search_demand` | 30d | cron | 2,475 | 2 MB | **pack=none, landed & unread** |
| swfl_inc | `public.swfl_inc_announcements` | 7d | cron | 35 | 168 kB | econ-dev-swfl |

### Environmental / hazard

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| fema (NFIP claims) | `data_lake.fema_nfip_claims` | 90d | cron | 448,425 | 108 MB | env-swfl, hurricane-tracks-fl — **penetration rate is a hardcoded snapshot, not a live pull** |
| noaa_ghcn_rainfall | `data_lake.noaa_ghcn_rainfall` | 30d | cron | 6 | 32 kB | env-swfl |

### Commercial real estate

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| marketbeat_swfl + colliers_industrial + lee_associates_swfl (cron) + mhs_databook (DISPATCH-ONLY) | `data_lake.marketbeat_swfl` | 90d/365d | mixed | 377 | 328 kB | cre-swfl |
| crexi_listings + brevitas_listings | `data_lake.active_listings_cre` | 7d | cron | 68 | 120 kB | cre-swfl |
| estero_edc + fmb_recovery | `data_lake.local_cre_context` | 30d/90d | cron | 14 | 64 kB | cre-swfl |
| cre_figures | `data_lake.cre_figures` (+`cre_figures_confidence`) | 92d | DISPATCH-ONLY | 1,078 (+985) | 992 kB (+584 kB) | **pack=none, landed & unread, no cron either — manual `bun scripts/build-cre-figures.mjs` only** |

### News / local signal

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| news_swfl | `data_lake.news_articles_swfl` | 1d | cron | 506 | 1.6 MB | app/insiders |
| city_pulse | `data_lake.city_pulse` | 1d | cron | 134 | 968 kB | city-pulse-swfl |
| city_pulse_corridors | `data_lake.city_pulse_corridors` | 7d | DISPATCH-ONLY | 198 | 984 kB | corridor-pulse-swfl, cre-swfl |

### Daily-truth / freshness pulse

| Source | Table | Cadence | Status | Rows | Size | Feeds |
|---|---|---|---|---|---|---|
| live_search_daily_median_asking + live_search_daily_mortgage | `data_lake.daily_truth` | 1d | cron | 259 | 240 kB | freshness-pulse |

---

## LANDED BUT NOBODY READS IT — wire before fetching anything new

Seven tables hold real, cron-fed data with **zero consuming pack** today (`pack=none` above, plus
one more found live):

`redfin_city_swfl` (183 MB, 420,201 rows) · `listing_week` (76 MB, 310,860 rows) ·
`dbpr_re_licensees` (25 MB, 30,509 rows) · `leepa_comparable_sales` (28 MB, 108,848 rows — LeePA
layer 23, beds/baths/year-built/geometry) · `realtor_geo_medians` (32 kB, 18 rows) ·
`swfl_search_demand` (2 MB, 2,475 rows) · `cre_figures` (992 kB, 1,078 rows, and its own cron
isn't even wired — manual build only).

That's ~315 MB of already-paid-for data with no reader. Matches the session's own "dark roots"
tracking exactly (`redfin_city_swfl`, `listing_week`, `dbpr_re_licensees`, `cre_figures`,
`swfl_search_demand`, `realtor_geo_trends`), plus `leepa_comparable_sales` as a seventh not yet in
that list.

---

## PARKED — no automated cron running today

| Source | Table | Why parked |
|---|---|---|
| sba_foia_franchise_outcomes | not yet built | franchise-outcomes pack waiting |
| airdna_str_swfl | not yet built | cost decision — needs a paid AirDNA sub ($19.95–99.95/mo single-market, $179/mo FL statewide), operator declined 07/05/2026 |
| land_manufactured_swfl | not yet built | no pipeline code yet, deliberate backfill deferral (operator 06/30/2026) |
| lee_deed_official_records | **has data** (see Recorded sales table above) | FETCH half is manual — Akamai Bot Manager blocks every unattended access method tried (crawl4ai, CDP Chromium, curl, curl_cffi w/ Chrome TLS impersonation) |

---

## TIER-1 ONLY — S3 Parquet cache (`s3://lake-tier1/...`), landed, size not measured this pass

These run on a cron and land real files, but never got promoted to a Postgres table (or the
promotion is a separate `_tier2` entry already counted above). No live byte size — that needs an
S3 listing call this pass didn't make.

`redfin_swfl` · `redfin_price_drops` · `redfin_contract_cancellations` ·
`redfin_delistings_relistings` · `hurdat2_fl` (hurricane tracks) · `storm_history_swfl` ·
`usgs` (raw water data) · `faf5` (freight flows) · `market_heat_swfl` · `bls_ppi` ·
`bls_oews_swfl_tier1` · `zori_swfl_duckdb` / `zhvi_swfl_duckdb` / `tier_divergence_swfl_duckdb`
(raw twins of the Tier-2 tables above) · **`fred_g17`, `fred_laus_alfred`, `fred_listing_swfl`
— confirmed zero consumer each**, `fred_listing_swfl` specifically being Lee/Collier MSA monthly
DOM + active + list-price + new-listings history back to 2016 · `census_vip` — confirmed zero
consumer.

---

## WHAT WE CAN GET — free, confirmed NOT in our database today

Live-checked 09/15/2026 against `information_schema.tables` for both `data_lake` and `public` —
none of these exist anywhere in the DB. All were live-verified reachable (real fetch, real row
counts, real field names) in an earlier research pass (`_RESEARCH/data-and-ingest/` greenfield
scouts), just never built into a pipeline:

- **OSM Overpass** — live JSON query API, no key, restaurant/POI nodes with cuisine + geocoding
  FDOR lacks
- **NOAA CO-OPS tides** — no key, Fort Myers + Naples stations (different product from
  `noaa_ghcn_rainfall`, which we do have)
- **FWC Derelict Vessels** — ArcGIS REST, statewide with a Lee+Collier filter
- **FWC Marinas** — bulk CSV, statewide with a Lee+Collier filter
- **FL Sunbiz daily Corporate Data File** — SFTP, zip-filterable, new-business-formation signal
- **FDIC BankFind API** — no key, deposit dollars by branch
- **FLHSMV Annual Vessel Stats by County** — text-layer PDF, Lee/Collier boat registration counts
  back to 2019

## WHAT WE CAN GET — free, same pipeline we already run, just pull more of it

No new auth, no new cron, no new vendor relationship — these are unused ceiling inside a source
we already ingest (full detail + `source_url` per item in `data-roots.md`'s ceiling section):

- **FDOT** — 1 of 1,586 public ArcGIS layers pulled (AADT). Free and unpulled: crash/fatality
  data, bridge inventory/condition, the 5-Year Work Program (capital projects), transit ridership,
  bike/ped infrastructure.
- **fl_dbpr_licenses** — 2 of 35 license boards pulled (Construction + Electrical). Food-service
  is one of the other 33, same bulk-CSV mechanism.
- **FEMA** — NFIP claims live; Policies-in-Force and the Community Status Book are unpulled from
  the same OpenFEMA API family. Separately: the NFIP Residential Penetration Rate is a hardcoded
  snapshot (Lee 24.25%, Collier 29.55%, Hendry 4.4%, set 08/12/2026) — should be a live quarterly
  re-pull off `https://www.fema.gov/api/open/v1/NfipResidentialPenetrationRates`, not a re-hardcode.
- **census_cbp** — base County Business Patterns live; the Census Building Permits Survey (down to
  county + permit-issuing-place grain, an independent cross-check against our own scraped permit
  pipelines) is unpulled from the same API.
- **fdle_crime_swfl** — city-level detail and offense-type breakdown (burglary, robbery, assault,
  etc.) are already fetched and summed into the county total, then the detail is discarded before
  it's persisted. A code change, not a new fetch.
- **lee_permits** — currently scraped via Accela/CapDetail HTML. Lee County's own ArcGIS runs a
  structured permit FeatureServer with 9,386 unincorporated-Lee permits, unread.

---

## Corrections to earlier statements in this session

- LeePA MapServer layer 23 ("Comparable Sales") is **already pulled** — `data_lake
  .leepa_comparable_sales`, 108,848 rows, 28 MB, live cron. It was reported as an unpulled ceiling
  earlier in this conversation; that was wrong. The real gap is that it has zero consumers, not
  that it's missing.
- Census CBP, FEMA NFIP claims, FDLE crime, and `fl_dbpr_licenses` were all reported as
  unbuilt/untested earlier in this conversation. All four are live, cron-fed, and hold real,
  growing row counts as shown above. The real gaps are narrower than "not built" — see the ceiling
  list above for exactly what's still missing inside each.
