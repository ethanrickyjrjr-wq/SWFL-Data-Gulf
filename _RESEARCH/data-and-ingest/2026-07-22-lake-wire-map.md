# Lake wire map — every data group, what it's wired to, what's dangling

Built 07/22/2026 by fanning 16 subagents (in batches of ~9-10) over the full `ingest/cadence_registry.yaml`
(93 tracked sources), `refinery/packs/master.mts`, and a live-API sweep. Every edge below was
grep-verified against real code, not trusted from the registry's `consuming_pack` field (which is
hand-maintained and drifts — this sweep found several places it had). Ground truth for the raw table
list came from `mcp__supabase__list_tables` on `data_lake` + `public`, not memory.

Format: `source(s) → pack → master? → direct consumers`. No arrow = column-1-only, nothing reads it.

---

## Real estate — value & parcels

- **properties-lee-value** ← `leepa_parcels` (LeePA), `lee_parcels` (FDOR), `redfin_lee_market`, `fhfa_hpi` (shared)
  → master (input) → `lib/zip-report/candidates.ts`, `assemble.ts`, `lib/should-i-sell/load-zip-soh.ts`
  - `leepa_comparable_sales` (108,848 rows, LeePA layer 23) is filed under this pack in the registry but **zero code reads it** — confirmed dead, matches the already-open check `leepa_comp_sales_no_consumer`.
- **properties-collier-value** ← `collier_parcels` (FDOR), `redfin_collier_market`, `fhfa_hpi` (shared)
  → master (input) → `lib/zip-report/candidates.ts`, `assemble.ts`, `lib/should-i-sell/load-zip-soh.ts`
- **home-values-swfl** ← `zhvi_swfl` (DuckDB parquet → Postgres promotion → `zhvi_zip_latest` view)
  → **NOT wired to master** → `app/desk/page.tsx`, `lib/deliverable/recipes/market-pulse.ts`
- **housing-swfl** ← `redfin_swfl` (DuckDB, direct read)
  → master (input) → `app/r/housing-swfl`, `app/r/zip-report/[zip]`, MCP server, email activation snapshot, `lib/deliverable/examples.ts` + `under-contract.ts`, chat chart routing
- **tier-divergence-swfl** ← `tier_divergence_swfl` (DuckDB → `tier_divergence_zip_latest` view)
  → **NOT wired to master** → `lib/zip-report/candidates.ts`, `assemble.ts`
- **seller-stress-swfl** ← `redfin_price_drops`, `redfin_contract_cancellations`, `redfin_delistings_relistings` (all DuckDB)
  → master (input) → `app/r/housing-swfl/page.tsx`
- **active-listings-swfl** ← `listing_state` (via `listing_active_homes` → `listing_active_stats` view chain)
  → master (input) → `app/desk`, `app/r/zip-report/[zip]`, email activation snapshot, chat chart routing
  - sibling `active_listings_residential` is a **dead duplicate table** — confirmed zero consumer.
  - `land_manufactured_swfl` — parked, no pipeline code written yet.
- **active-rentals-swfl** ← `rental_listings_swfl` (via `rental_listing_stats` view)
  → master (input) → no direct consumer found outside master
- **investor-zip-swfl** — registry names `airdna_str_swfl` as its source, but **that's not real**: `str_revenue_est_monthly` is a hardcoded `null` placeholder (`str_source_tag: 'available_on_request'`) — no AirDNA feed exists.
  → master (input) → no direct consumer found outside master
- **listing-momentum-swfl** — **no cadence_registry row declares a source for this pack.** It feeds master (confirmed), but this sweep didn't trace what it reads — flagging as an audit gap, not asserting it's unwired.
- **price-distribution-swfl** ← `listing_price_histogram_swfl` (via `_latest` view)
  → master (input) → `lib/highlighter/reach.ts`, `lib/deliverable/bind-frame.ts`
- **market-temperature-swfl** ← `market_details_swfl` (via `_latest` view)
  → master (input) → no direct consumer found outside master
- **market-heat-swfl** ← `market_heat_core_swfl` + `market_heat_hotness_swfl` (Tier-1 realtor parquets)
  → master (input) → chat chart routing
- **communities-swfl** ← `neighborhood_stats`
  → master (input) → `app/r/communities-swfl/[community]`, `app/r/source/_tables.ts`
- **condo-sirs-swfl** ← `dbpr_sirs_submissions`
  → master (input) → no direct consumer found outside master
- **lee-deed-records-swfl** ← `lee_deed_official_records` — consumer code is real and wired, but the table is **empty** (Akamai blocks the unattended Lee Clerk fetch; manual capture only)
  → **NOT wired to master** → no direct consumer found outside master
- **corridor-pulse-swfl** ← `city_pulse_corridors` (direct read)
  → **NOT wired to master directly** — feeds **cre-swfl** as a brain-input instead (cre-swfl explicitly does not read the raw table — thin-pipe rule) → `lib/email/activation/delta.ts`
- **cre-swfl** ← `bls_ppi`, corridor-pulse-swfl's OUTPUT (not the raw table), `marketbeat_swfl` (4 separate scrapers write the same table: Colliers, MHS databook, Lee Associates, the base marketbeat pull), `active_listings_cre` (Crexi + Brevitas), `local_cre_context` (Estero EDC + FMB Recovery)
  → master (input) → `app/sitemap.ts`, `app/r/housing-swfl`, `app/r/[slug]`, `app/r/source/_tables.ts`, `app/r/cre-swfl/[corridor]`, chat chart routing

## Macro / labor / econ

- **macro-us** — no lake table at all; reads FRED's live API directly (SOFR, CPIAUCSL) at request/build time.
  → master (input) → no direct consumer found outside master
  - The Tier-1 parquets `fred_g17`, `fred_laus_alfred`, `fred_listing_swfl` are registered but **confirmed unconsumed** by any pack/app/lib code.
- **macro-florida** ← `census_cbp_fl` (via `census_cbp_fl_agg_by_naics` view)
  → master (input) → no direct consumer found outside master
- **macro-swfl** ← `bls_laus`, `bls_qcew`
  → master (input) → chat chart routing, `lib/deliverable/examples.ts`
- **labor-demand-swfl** ← `bls_oews_swfl` (same source landed twice: Tier-1 parquet + Tier-2 Postgres restage)
  → master (input) → chat chart routing, `lib/deliverable/examples.ts`
- **sector-credit-swfl** ← `fl_dor_sales_tax`
  → master (input) → no direct consumer found outside master
- **econ-dev-swfl** ← `swfl_inc_announcements`
  → master (input) → `lib/email/activation/delta.ts`
- **fgcu-reri** ← `fgcu_reri_indicators`
  → **NOT wired to master** (deliberately dropped 07/18 — was a shadow-vote on 8 concepts other brains already carry) → standalone reporter at `/api/b/fgcu-reri`

## Environmental / hazard

- **env-swfl** ← `usgs_water_swfl.parquet` (Tier-1, the real live source), `noaa_ghcn_rainfall`, `fema_nfip_claims`
  → master (modifier) → `app/embed/charts`, `app/r/zip-report/[zip]`, chat conversation + chart routing, email activation snapshot
  - The Tier-2 `usgs`/`usgs_daily` table is a **confirmed zombie** — nothing reads it since the 07/19 repoint to the Tier-1 parquet; the registry note documenting this is itself stale (says "still live-read," that stopped being true 07/19).
- **hurricane-tracks-fl** ← `hurdat2_fl` (DuckDB), `fema_nfip_claims` (shared with env-swfl, joined live via cross-tier DuckDB SQL)
  → master (input) → no direct consumer found outside master
- **storm-history-swfl** ← `storm_events_swfl.parquet` (DuckDB)
  → master (input) → no direct consumer found outside master
- **traffic-swfl** ← `fdot_aadt_fl`
  → master (input) → no direct consumer found outside master
- **logistics-swfl** ← FAF5 (Tier-1)
  → master (input) → no direct consumer found outside master
- **logistics-swfl-nowcast** ← `fdot_aadt_fl` (shared with traffic-swfl)
  → master (input) → no direct consumer found outside master
  - `fdot_freight_nowcast_shock_log` is this pack's own write-back/read-back state, not an upstream source.

## Permits / licensing / safety / news / airport / tourism

- **permits-swfl** ← `lee_building_permits`, `collier_building_permits`
  → master (input) → chat chart routing, `lib/highlighter/reach.ts`, `lib/zip-report/load-ranked-signals.ts`, email delta
- **permits-commercial-swfl** ← `mhs_permits_swfl` (jurisdiction-crosswalked against `mhs_jurisdiction_xwalk` on every ingest run)
  → master (input) → `lib/zip-report/candidates.ts` + `assemble.ts`, email delta
- **licenses-swfl** ← `fl_dbpr_licenses`, `fl_dbpr_applicants`
  → master (input) → no direct consumer found outside master
- **safety-swfl** ← `fdle_crime_swfl`
  → master (input) → `lib/highlighter/reach.ts`
- **news-swfl** ← `dbpr_press_releases`, `dbpr_public_notices` (NOT `news_articles_swfl` — that table feeds `app/insiders` directly, a separate non-pack consumer, not this brain)
  → master (modifier) → MCP server, email delta
- **rsw-airport** ← `rsw_airport_monthly`
  → master (input) → `lib/highlighter/reach.ts`
- **tourism-tdt** ← `fl_dor_tdt_collections`
  → master (input) → chat chart routing
- **freshness-pulse** ← `daily_truth` (live-search median-asking + mortgage rate rows)
  → master (modifier) → no direct consumer found outside master
- **franchise-outcomes** ← `sba_foia_franchise_county.parquet` (not_yet_running — parked)
  → master (input) → no direct consumer found outside master

## Non-pack direct consumers (lake table → app code, bypassing a brain entirely)

- `census_acs_zcta` → `lib/zip-summary/load.ts` (ZIP Quick Summary)
- `news_articles_swfl` → `app/insiders/_lib/desk-stats.ts`
- `redfin_city_swfl` → `lib/desk/loaders.ts` + `lib/charts/gallery-loaders.ts` (`app/desk` dashboard) — **registry says "none" reads this; that's stale**, a real consumer exists.
- `user_mls_listings` → `lib/reso/pull-zip-stats.ts` (per-user MLS upload surface, read back for ZIP stats)
- `listing_transitions` → `lib/desk/loaders.ts`, `lib/why-not-selling/cut-history.ts`, `lib/back-on-market/relist-fact.ts`, `lib/buyer-leverage/cut-history.ts`, `lib/concoctions/defs/zip-listing-activity.ts`, `lib/project/watch-delta.ts` + `watch-event.ts`, `lib/listings/sold-price.ts`, `lib/email/market-context.ts` (via `listing_transitions_recent_zip_stats` view) — **registry marks this `coverage_exempt(secondary_pipeline_table)`, implying no consumer; it's actually one of the most-read tables in the app layer.**
- `public.deliverables` → dozens of `app/api/deliverables/*` routes, `app/p/[id]/page.tsx`, `lib/deliverable/*` — **registry marks this `coverage_exempt(bounded_delete_sweep)`; that's only true of the retention-sweep cron, the table itself is the primary deliverable product record.**

## Unwired — listed only, nothing reads them (confirmed by grep, not assumed)

- `data_lake.leepa_comparable_sales` — 108,848 rows, zero consumer (tracked: `leepa_comp_sales_no_consumer`)
- `data_lake.active_listings_residential` — dead duplicate of the active-listings-swfl view chain
- `public.dbpr_re_licensees` — zero consumer
- `data_lake.realtor_geo_medians` — zero consumer
- `tier1:lake-tier1/macro/fred_g17/` — zero consumer
- `tier1:lake-tier1/macro/fred_laus_alfred/` — zero consumer (only touched by one-off backtest tooling under `refinery/tools/`)
- `tier1:lake-tier1/market/fred_listing_swfl/` — zero consumer (only a hardcoded seed-chart script references it)
- `tier1:lake-tier1/macro/census_vip/` — zero consumer
- `data_lake.listing_week` — built for a sell-odds model that doesn't exist yet
- `data_lake.dbhydro_stations` — dead source, SFWMD decommissioned the API
- `data_lake.usgs_sites` — orphaned, dropped 07/19 (companion of the usgs_tier2 zombie above)
- `data_lake.view_vintages` — reader exists (`refinery/lib/backtest/view-vintage-reader.mts`) but is self-labeled UNWIRED, only its own test imports it
- `data_lake.source_totals` — feeds the *separate ops repo's* `/ops/census` dashboard only; nothing in this repo reads it
- `land_manufactured_swfl` — parked, no pipeline code
- `lee_deed_official_records` — wired in code, table empty (manual-fetch blocked)
- `airdna_str_swfl` — declared as investor-zip-swfl's source but not actually read (see above)

## True orphans — not even in the registry (the "search for anything not accounted for" pass)

- **`data_lake.community_profiles`** — a full ingest pipeline exists at `ingest/pipelines/community_profiles/`
  (~15 files: pipeline, merge, normalize, discover, distill scripts for 3 named sources, its own SQL
  migrations `20260706_community_profiles.sql` + `20260720_*`) but has **zero `cadence_registry.yaml`
  entry and zero pack consumer**. Matches `data-roots.md`'s existing note that this table is
  "EMPTY + uncatalogued" — this sweep confirms the pipeline code is real, just never registered or wired.
- **`data_lake.cre_figures`** + **`data_lake.cre_figures_confidence`** — created by
  `migrations/20260718_cre_figures.sql` (four days before this sweep), not in `cadence_registry.yaml`,
  no pack consumer found.

## Packs built but not feeding master (5 of 41 leaf packs)

- `fgcu-reri` — deliberate (07/18 shadow-vote dedup decree), standalone at `/api/b/fgcu-reri`
- `corridor-pulse-swfl` — deliberate, reaches master indirectly through cre-swfl instead
- `home-values-swfl` — **not deliberate**, a real wiring gap; only reachable via `app/desk` + the market-pulse deliverable recipe
- `tier-divergence-swfl` — **not deliberate**, only reachable via zip-report candidates
- `lee-deed-records-swfl` — moot for now since its table is empty

## Live-API lane — answers a user directly, never touches the lake

- **Mapbox Search Box API** (`app/api/address-suggest`, `app/api/address-retrieve`) → homepage address-bar autocomplete
- **Mapbox Geocoding v6 + Census Geocoder fallback** (`refinery/lib/geocode.mts`) → resolves free-text addresses for the live chat comp answer
- **SteadyAPI `/nearby-home-values` + `/property-tax-history`** (`lib/listings/steadyapi.ts` → `lib/assistant/comp-helper.ts`) → live property-comp answers in chat
- **Anthropic `web_search`** — 4 separate call sites, each a live gap-fill: chart composition (`compose-chart.ts`), plain-text chat fallback (`web-fallback.ts`), figures lookup (`lib/figures/find.ts`), deliverable outlier confirmation (`lib/deliverable/band-guard-web.ts`)
- **Mapbox Static Images API** (`lib/listings/aerial.ts`, `lib/listings/listings-map.ts`) → aerial + comp-map images, fetched client-side, never touch our servers
- **Pexels** (`lib/email/pexels.ts`) → Email Lab's live photo picker
- **Brandfetch** (`lib/brand/brandfetch.ts`) → competitor-switch brand-kit autofill

---

## Method note

Skeleton built deterministically from `ingest/cadence_registry.yaml` (93 tracked sources) +
`refinery/packs/master.mts`'s `input_brains[]` (36 of 41 leaf packs) + `refinery/packs/index.mts`'s
41-pack roster, cross-checked against the live `data_lake`/`public` table list from
`mcp__supabase__list_tables`. 16 subagents (fan-out in batches of ~9-10, three phases: verify
declared source→pack edges, trace pack→master/downstream edges, sweep for live-API bypasses) then
grep-verified every edge against real code rather than trusting the registry's `consuming_pack`
field — which the sweep proved wrong in 7 places (listed under "registry data-quality corrections"
above, inline). `listing-momentum-swfl` is the one pack this sweep could not trace a source for; flagged
rather than guessed. Full per-agent evidence (file:line citations) in the workflow journal:
`C:\Users\ethan\.claude\projects\C--Users-ethan-dev-brain-platform\bb992290-671b-4143-81cc-7e362582ed13\subagents\workflows\wf_3d4ebd1b-860/journal.jsonl`.
