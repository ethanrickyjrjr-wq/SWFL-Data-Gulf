# Data Consolidation — Execution Handoff (2026-07-18)

**What this is:** the playbook to execute the one-root-per-concept consolidation. The map is already
built — `docs/standards/data-roots.md` (the catalog: every source, cadence band, field scope, routes,
status, redundancies, one-root targets). The method/doctrine is `docs/standards/data-consolidation-plan.md`.
This file is HOW to run the work: the per-root unit, the fan-out pattern, the order, the guardrails.

## The doctrine (locked, operator 2026-07-18)
- One root PER PURPOSE (current vs historical, list-side vs sold-side), not one per concept.
- Our own updated data is the root; external monthly (Redfin/Zillow/Realtor) — pick exactly ONE per
  purpose, kept for history, wired to the root that needs it. We derive our own monthly once we hold a
  month of daily.
- A consumer reads ONLY a registered root, never a raw base table (enforced by the gate).
- If a chart already gets data via the brain, DO NOT run a second wire to the chart. Fix at the root.
- After a root runs correctly and all consumers are on it, DELETE the tables it replaced.

## The unit of work — ONE ROOT (repeat per concept, in walk order)
Each root is a self-contained job. Run it as: OPUS builds → SONNET verifies → ADVISOR checks → close.

1. **OPUS (build):** confirm/create the ONE root view per the catalog; repoint EVERY consumer to it
   (grep proves no raw-table reads remain for that concept); compute the correct numbers live.
2. **SONNET (verify):** independently confirm — the root serves correct live numbers (query the lake);
   every consumer is repointed (grep for the old raw-table reads returns zero); the tables slated for
   deletion have NO remaining readers anywhere; no NEW bypass wire was introduced.
3. **ADVISOR (check):** review the diff before it ships — especially the destructive deletes and any
   live-surface repoint. Adversarially: "what breaks, what number moves, what did the repoint miss?"
4. **DELETE only after green:** drop the duplicate tables/views + their crons (verify-before-delete;
   never kill a parallel session's in-flight ingest — coordinate).
5. **Close** the concept's `checks`; mark 🟢 in `data-roots.md`; register the root in `data-roots.json`.

## Walk order (sale page first — from data-roots.md)
Each entry: root → consumers to repoint → tables to delete → checks it closes.

1. **CORPSES (safe warm-up, no consumers):** delete `active_listings` + `active_listings_residential`(+`_zip_stats`)
   + crons (`active_listings_ship_or_delete`); confirm `census_vip`/`fred_g17` truly unread then delete;
   `bls_oews_swfl_tier1` cold dup; `usgs` tier-1 unread. ZOMBIE FIRST: `usgs_tier2`/`usgs_daily` is a
   DEAD table a live brain reads (env-swfl serves frozen water data) — fix the read path, not just delete.
2. **Active inventory count** → `listing_active_stats.listing_count`; repoint /desk + brains off the
   land-blended momentum count; deletes per catalog. (`active_stats_zip_median_dup_rows`, contamination checks.)
3. **DOM (daily current)** → `listing_dom`; repoint homepage map + email + active-listings brain off the
   dead avg + realtor snapshot; `listing_dom_historical` = ONE external (`market_heat_swfl`) + wire the
   unwired `fred_listing_swfl` MSA history as the cross-check. Closes the DOM check family.
4. **Price cuts** → event `listing_transitions.price_delta` + share `listing_momentum_stats.price_reduced_share`
   (0–100); kill the should-i-sell double-render + the 0–1/0–100 trap.
5. **List/sold price + value** → the parcel poster child: ONE FDOR parcel table (Lee+Collier) for
   properties-value + communities; decide leepa vs lee_parcels; ZHVI "median"→"typical" (3 places).
6. **Price bands (weekly)** · **Rent (weekly sweep + monthly index)** · **Market-temp (reconcile the two
   realtor feeds)** — per catalog.
7. **Bypass-wire sweep:** delete/route the 6 raw-table reads that skip brains (email→zori/redfin,
   charts→tier-divergence/hurricane, landing snapshot, market_details fanout).
8. **Rest of platform by cadence band** (permits, CRE dark-ingest gate, macro, env, civic) — after sale page.

## Build the gate (after the first 3–4 roots are registered)
Two enforcement layers, both extending the proven `verification/supabase-untyped-allowlist.json` seam.
Brainstorm first (RULE 3.5) — this changes system shape (RULE 3 C2).
1. **Source gate:** consumers may read ONLY a table listed in `data-roots.json`, never a raw base. This
   makes "don't build new ones" physically enforced.
2. **Vintage tripwire (`data_vintage_tripwire_missing`):** a root's job isn't done when it's registered —
   it's done when it SERVES the freshest lake data. Every freshness monitor today measures PROCESS
   recency; none measures served DATA vintage, so a surface serves March data with all lights green
   (`seller_stress_swfl_serving_stale_period`, P0). The gate compares served-output period vs lake-newest
   vs `cadence_registry` cadence, and a leaf TTL must not exceed its source cadence — mirroring
   `masterIsStaleVsUpstreams`. Without this, "one root" still serves stale.

## Ground rules (every step)
- Verify a root serves correct live numbers BEFORE deleting anything it replaces.
- Never kill an in-flight ingest from a parallel session — coordinate.
- No autonomous push; operator-gated, diff shown (git has a live parallel-session divergence).
- Every figure names a real source; no invention. As-of dates MM/DD/YYYY.
- One verification pass per step (advisor); don't audit the audit.

## Fan-out sizing
- One OPUS per root (it holds the concept + its consumers).
- One SONNET verifier per root (independent, cheaper — verification is confirmation not creation).
- ADVISOR once per root, on the finished diff.
- Roots are mostly independent → run several in parallel, but isolate any that touch the same file
  (e.g. two sale-page roots touching /desk) in worktrees (RULE 1.5).

## Open verification (3 Sonnets, dispatched 2026-07-18) — "did we miss anything"
1. Table completeness: every lake + Tier-1 dataset mapped in the catalog (find orphans).
2. Route completeness: every consumer read traced (find bypass wires the tracers missed).
3. Concept/root completeness: every shared-concept duplication caught, every root has one canonical.
Advisor reviews the plan + their gap findings at the end.


---

# VERIFICATION PASS — 3 Sonnet completeness checks (2026-07-18)

Gaps to fold into data-roots.md (kept here because a parallel session is actively committing that file):
- 13 tables unmapped (verify-1): incl. cre_figures/cre_figures_confidence (NEW today, untracked — the marketbeat verified=false fix landing while we map it), community_profiles (untracked, 0 rows), zori_pivoted (asymmetric miss), usgs_caloosahatchee_stage_latest (orphan view), + cache/exempt tables.
- 7 undocumented consumer reads (verify-2): community_profiles, zori_pivoted, extra zhvi_pivoted/zhvi_zip_yoy_monthly consumers, and lib/pulse city_pulse + city_pulse_corridors RE-IMPLEMENTING the brain filter (redundant wire vs legit geo-grain second consumer — needs a check).
- 2 cross-domain duplications (verify-3): fgcu-reri is a SHADOW VOTE ENGINE (re-derives 7 concepts that already have dedicated roots+brains, feeds master a second vote on all of them — biggest missed dup); employment growth answered twice (bls_qcew macro-swfl + bls_oews labor-demand-swfl). lee_parcels confirmed PHANTOM (table not created yet).


## === verify-1-tables ===

# data-roots.md completeness check — Tier-2 (`data_lake.*`) tables vs the catalog

Method: pulled the live `information_schema.tables` list for `data_lake` (87 rows) via
`mcp__lake__query_lake`, read the ENTIRE `docs/standards/data-roots.md` (1578 lines) and the
ENTIRE `ingest/cadence_registry.yaml` (2247 lines), then grepped every one of the 87 table names
against `data-roots.md` to confirm presence/absence, cross-checked absentees against the
registry's `pipelines:` block and `coverage_exempt:` block, and grepped the repo for who
reads/writes each.

## Counts
- **Tables/views checked:** 87 (83 real data_lake objects + 4 internal `_dlt_*`/`_tier1_inventory` system tables)
- **Missing from the catalog (`data-roots.md`) entirely — zero mentions:** 13
- **Untracked ingest (table exists, NO cadence_registry.yaml entry at all — not even `coverage_exempt`):** 3 (`community_profiles`, `cre_figures`, `cre_figures_confidence`)
- **Phantom registry entry (registry names a table that doesn't exist in the live DB today):** 1 (`lee_parcels`)

## The 13 missing tables/views

1. **`community_profiles`** — Tier-2, ~300 marketed golf/gated communities (golf/fee/amenity scrape
   + Mapbox drive-time/nearby). Read by `refinery/packs/communities-swfl.mts`
   (`communitiesOutputProducer`) alongside `neighborhood_stats` — it's the SECOND of the two tables
   the communities-swfl brain needs (`neighborhood_stats` = Tier-1 parcel-name-join backbone;
   `community_profiles` = Tier-2 marketed-community catalog). Migration
   `migrations/20260706_community_profiles.sql`. Currently **0 rows** — pack's own empty-message:
   "the Phase-1/2/3 backbone has not landed." **NO cadence_registry.yaml entry of any kind**
   (confirmed by grep — the only registry hit is a comment flagging it as one of "the three REAL
   gaps deliberately NOT exempted... community_profiles + neighborhood_stats (check
   `communities_tables_zero_coverage`)"). Genuine untracked-ingest gap, already known internally via
   a named check but never promoted into the catalog doc.

2. **`cre_figures`** — brand-new table, created TODAY (`migrations/20260718_cre_figures.sql`, same
   day as this audit). Per-firm normalized CRE figures (vacancy/asking-rent/absorption/cap-rate/
   sale-$psf), one row per (canonical_submarket, sector, quarter, metric, source_firm), derived from
   `data_lake.marketbeat_swfl` (all 4 firms: cw_marketbeat/colliers_industrial/mhs_databook/
   lee_associates) and computed in TypeScript (`refinery/lib/derived/cre-figures.mts` +
   `cre-corroboration.mts`), not a raw ingest. **NO cadence_registry.yaml entry.** This looks like
   the FIX for the exact "verified=false gate drops 261 of 285 marketbeat rows" problem
   data-roots.md spends several paragraphs on (marketbeat_swfl / colliers_industrial /
   lee_associates_swfl entries) — built same-day, not yet reflected anywhere in the catalog.

3. **`cre_figures_confidence`** — same migration as #2; tiered corroboration layer (corroborated /
   flagged / single_source per cell, cross-firm spread). Same "NO registry entry, uncatalogued"
   status as `cre_figures`.

4. **`dbhydro_stations`** (12,937 rows) — defunct source (SFWMD DBHYDRO API decommissioned/OAuth
   wall). **IS tracked in the registry** via `coverage_exempt:` (`reason: defunct_source`), just
   never carried into `data-roots.md`.

5. **`fdot_aadt_swfl_yearly`** — an undocumented SQL view (`docs/sql/fdot_aadt_swfl_yearly.sql`).
   No cadence_registry entry, no data-roots.md mention. Only reference anywhere in the repo is
   `scripts/lake-probe.mts:22`. Likely a superseded/duplicate of the documented
   `fdot_aadt_county_year` view — worth a quick check for whether it's dead weight or a second live
   consumer nobody wrote down.

6. **`fema_nfip_claims_swfl`** — an undocumented "convenience view"
   (`docs/sql/fema_nfip_claims_swfl.sql`) that a code comment in
   `refinery/sources/fema-nfip-source.mts:35` explicitly says is NOT what the live path reads
   ("directly, not the convenience view at docs/sql/fema_nfip_claims_swfl.sql"). Otherwise only
   appears in test fixtures (`lib/welcome/grounded.test.ts`, `lib/citations/clean-url.test.ts`) and
   `scripts/lake-probe.mts`. Effectively a dead/unused view, never in the catalog.

7. **`geo_anchor_cache`** — geocode-ladder runtime cache (`ingest/lib/geo_ladder.py`). **IS tracked**
   via `coverage_exempt:` (`reason: runtime_cache`), absent from `data-roots.md`.

8. **`source_totals`** — `/census` ops-page source-ceiling snapshot writer (derived telemetry, not a
   vendor source). **IS tracked** via `coverage_exempt:` (`reason: derived_signal_write_back`),
   absent from `data-roots.md`.

9. **`user_mls_listings`** — client RESO/MLS upload surface (`lib/reso/sync.ts`). **IS tracked** via
   `coverage_exempt:` (`reason: client_upload_surface`), absent from `data-roots.md`.

10. **`user_mls_stats`** — aggregate over `user_mls_listings`, same writer/class. **IS tracked** via
    `coverage_exempt:`, absent from `data-roots.md`.

11. **`usgs_caloosahatchee_stage_latest`** — an undocumented SQL view
    (`docs/sql/20260623_usgs_caloosahatchee_stage_latest_view.sql`). Grep across every `.ts`/`.mts`
    file in the repo returns **zero hits** — nothing reads it. data-roots.md's own `usgs_tier2`
    write-up confirms the live path is `usgs-water-source.mts:196-236` reading `usgs_daily`/
    `usgs_sites` directly via PostgREST, not this view. Looks like a genuinely dead/orphan view.

12. **`view_vintages`** — point-in-time capture of the ZHVI/ZORI views
    (`ingest/scripts/capture_view_vintages.py`, monthly). **IS tracked** via `coverage_exempt:`
    (`reason: derived_snapshot`), absent from `data-roots.md`.

13. **`zori_pivoted`** — the live `/charts` "rent" display view, read at
    `lib/charts/gallery-loaders.ts:257` (`loadMetros(db, "zori_pivoted")`) — the exact same role as
    `zhvi_pivoted`, which data-roots.md's `zhvi_swfl_tier2` entry DOES explicitly list as a chart
    view. The parallel `zori_swfl_tier2` entry documents `zori_zip_latest` (brain input) and the
    email direct-read, but omits `zori_pivoted` — an asymmetric miss against the ZHVI entry it
    mirrors line-for-line otherwise.

## Untracked ingest (no cadence_registry entry, real base tables — not views)
- `community_profiles`, `cre_figures`, `cre_figures_confidence` (all three detailed above). These
  are the only ones with genuinely NO registry accounting at all — not even `coverage_exempt`.

## Phantom registry entry (table doesn't exist in DB today)
- **`lee_parcels`** — `cadence_registry.yaml`'s `lee_parcels` entry (`dlt_schema_name: lee_parcels`,
  `count_table: data_lake.lee_parcels`) has no matching table in the live `information_schema.tables`
  query. This is explained, not a bug: the registry entry itself says "first run in flight
  07/18/2026" and `confirmed_total: value: null` — today's dispatch-only 556k-parcel FDOR pull for
  Lee County simply hasn't landed a table yet as of this query. Re-check after the run completes;
  if it's still absent afterward, that would be a real failure to flag.

## Everything else (70 of 87) IS accounted for
The remaining 70 tables/views (all core spine tables — `listing_state`, `listing_active_stats`,
`daily_truth`, `bls_laus/qcew/oews_swfl`, `census_acs_zcta`, `census_cbp_fl(+agg view)`,
`collier_parcels(+3 views)`, `leepa_parcels(+3 views)`, `parcel_subdivision`, `neighborhood_stats`,
`fhfa_hpi`, `fdot_aadt_fl(+county_year view)`, `fema_nfip_claims(+2 views)`, `redfin_*`, `zhvi_*`
except `zori_pivoted`'s twin gap, `zori_swfl`/`zori_zip_latest`, `tier_divergence_*`, `marketbeat_swfl`,
`mhs_permits_swfl`, `mhs_jurisdiction_xwalk`, `fl_dbpr_licenses/applicants`, `dbpr_sirs_submissions`,
`news_articles_swfl`, `noaa_ghcn_rainfall`, `local_cre_context`, `active_listings_cre`,
`active_listings_residential(+zip_stats view)`, `rental_listings_swfl(+latest view, +stats view)`,
`usgs_daily`, `usgs_sites` (via `coverage_exempt` + explicit narrative), `listing_transitions` (via
`coverage_exempt` + extensive narrative), and the 4 `_dlt_*`/`_tier1_inventory` system tables which
are infrastructure, not data roots) are explicitly named and traced (root / raw-base / rollup /
dead-and-tracked) somewhere in `data-roots.md`'s per-batch route-tracer sections.

## === verify-2-routes ===

# Route-catalog completeness check — direct lake reads vs `docs/standards/data-roots.md`

Method: grepped `lib/`, `app/`, `components/`, `refinery/`, `scripts/` for every
`.from("table")`, `.schema("data_lake")....from(...)`, `.rpc(...)`, and DuckDB/parquet
(`s3_url`/`parquetViews`/`makeDuckDBSource`) read; built the distinct table/view/RPC set;
cross-checked each against the full 1578-line catalog (all 8 route-tracer batches read in
full, plus the SYSTEMIC FINDINGS / BYPASS WIRES section). `components/` had zero direct
reads (clean — all lake access goes through `lib`/`app`/`refinery`).

## Counts

- **Distinct lake table/view/RPC reads found: ~37** (data_lake-schema tables/views + RPC +
  the DuckDB/parquet sources, excluding user-owned RESO/MLS tables and app-plane caches that
  merely live in the data_lake namespace for storage reasons, not vendor-ingest reasons).
- **NOT documented in the catalog: 7** (5 missed *consumers* of already-catalogued
  tables/views, 1 missed *view* entirely (`zori_pivoted`), 1 missed *table* entirely
  (`community_profiles`)).
- Everything else (daily spine, external-market, permits, macro, environment, civic-news
  tables) checked out — every consumer I found for those already has a file:line citation
  somewhere in the catalog.

## NOT documented — the 7 gaps

### 1. `community_profiles` (data_lake) — whole table missing from the catalog
- **Read at:** `refinery/sources/communities-swfl-source.mts:42` (the brain's own source
  connector, `COMMUNITY_TABLE = "community_profiles"`) AND directly at
  `app/r/communities-swfl/communities.ts:129` (`db.schema("data_lake").from("community_profiles").select("*")`,
  `fetchCommunityProfiles()`).
- **Status:** real, live, in `cadence_registry.yaml:2218` (flagged there as a
  `communities_tables_zero_coverage` check). It's the sibling table to `neighborhood_stats`
  (~300 marketed communities vs. the parcel-derived subdivision rollup) that the
  communities-swfl brain also reads.
- **Why missed:** Batch 3 (value-parcels)'s stated scope was `leepa, collier_parcels,
  lee_parcels, parcel_subdivision, neighborhood_stats, zhvi_*, fhfa, tier_divergence_*` —
  `community_profiles` was never in scope for any of the 8 batches. Its `neighborhood_stats`
  sibling in the SAME file/function got a "Direct page read (bypasses the brain)" line;
  `community_profiles` got none.
- **Verdict:** legitimate by the same logic the catalog already applies to
  `neighborhood_stats` at that file (brain + one drill-down page both read it directly) —
  not a redundant wire to delete, just an undocumented root. Recommend adding it alongside
  `neighborhood_stats` in the value-parcels section.

### 2. `zori_pivoted` (data_lake view) — whole view missing from the catalog
- **Read at:** `app/charts/page.tsx:228` (`loadMetros(supabase,"zori_pivoted")`),
  `lib/charts/gallery-loaders.ts:257` (`loadMetros(db,"zori_pivoted")`, gallery panel),
  `app/insiders/page.tsx:112` (`loadMetroTrend("zori_pivoted")`).
- **Status:** real, defined in `docs/sql/20260612_zori_pivoted_views.sql` — the ZORI sibling
  of `zhvi_pivoted` (which IS documented, catalog lines 647-650, 685-686).
- **Why missed:** Batch 4 (rentals-investor) traced `zori_swfl_duckdb`/`zori_swfl_tier2` and
  their `zori_zip_latest` brain-input view in detail, but never mentioned the parallel
  `zori_pivoted` chart-display view — the same class of omission the catalog's own
  `zhvi_pivoted` entry warns about ("Chart pages read the LAKE VIEW, bypass the brain").
- **Verdict:** legitimate non-brain chart surface (same status as `zhvi_pivoted`), just
  never written down. Not a redundant wire — no brain computes a rent-index time series for
  charting.

### 3. `zhvi_pivoted` — 2 of 3 live consumers undocumented
- Catalog only cites `app/r/housing-swfl/page.tsx:140` for `loadMetroTrend("zhvi_pivoted")`.
- **Missed:** `app/insiders/page.tsx:111` and `app/r/zip-report/[zip]/page.tsx:98` call the
  same `loadMetroTrend("zhvi_pivoted")`.
- **Verdict:** same non-brain-surface status as the documented instance — just two more
  call sites of a function the catalog only partially traced.

### 4. `zhvi_zip_yoy_monthly` — 1 of 2 live consumers undocumented
- Catalog cites only `lib/charts/zip-heatmap-series.ts:70` (ZIP heatmap).
- **Missed:** `lib/deliverable/recipes/review-reply.ts:212` — direct
  `.schema("data_lake").from("zhvi_zip_yoy_monthly")` read for a 24-month ZIP trend chart in
  the review-reply deliverable. Self-documented as KNOWN-DEBT in-file (tracked check
  `review_reply_untyped_zhvi_view_read`) — but that check is about the untyped-client risk,
  not about catalog completeness.
- **Verdict:** legitimate (same view, same "chart bypasses brain" class), just missing from
  the catalog's consumer list.

### 5. `city_pulse` — bypass consumer never traced
- **Read at:** `lib/pulse/nearby.ts:67-77` — two direct `.schema("data_lake").from("city_pulse")`
  queries (geocoded point/neighborhood + city-wide), independently re-implementing the
  TTL/supersession filter the file's own comment says matches "same hygiene as the brain
  source" (i.e., duplicates `refinery/sources/city-pulse-source.mts`'s filter logic instead
  of reading the brain's `pulse_by_zip` output).
- **Live callers:** `app/r/zip-report/[zip]/page.tsx:101` (ZIP report "what's happening
  near you" section) and `scripts/email/weekly-read-run.mts:244` (the Weekly Read email).
- **Status:** Batch 8 (civic-news) traced `city_pulse` in depth but only as far as the
  `city-pulse-swfl` brain; this whole "nearby" consumer path (2 production surfaces: a page
  + a recurring email) is absent.
- **Verdict:** worth a second look, not just a doc gap — it's a second independent reader of
  raw `city_pulse` with its own copy of the filter/freshness logic. If the brain's
  `pulse_by_zip` detail table already carries point/neighborhood grain, this could be a
  redundant wire; if it needs row-level geo fields the rolled-up brain table drops, it's a
  legitimate second consumer. Either way it should be in the catalog and probably in
  `checks`.

### 6. `city_pulse_corridors` — bypass consumer never traced
- **Read at:** `lib/pulse/corridor-nearby.ts:26` — direct
  `.schema("data_lake").from("city_pulse_corridors")` read.
- **Live caller:** `app/r/cre-swfl/[corridor]/page.tsx:92`
  (`loadPulseNearbyCorridor(corridor, displayN)`) — the CRE corridor drill-down page.
- **Status:** same pattern as #5, one level down (corridor-pulse-swfl → cre-swfl brain chain
  documented; this direct page read is not). Batch 8 documents
  `corridor-pulse-source.mts`'s own `.schema("data_lake").from("city_pulse_corridors")` read
  (the brain's connector) but not this second, independent reader.
- **Verdict:** same open question as #5 — flag alongside it.

### 7. `fema_nfip_county_year` — bypass consumer never traced
- **Read at:** `lib/concoctions/defs/nfip-storm-years.ts:38-40` — direct
  `.schema("data_lake").from("fema_nfip_county_year")` read for the "Flood claims by storm
  year" ad-hoc chart concoction (`/api/concoctions` chart-builder system).
- **Status:** Batch 7 (environment) documents the `fema_nfip_county_year` VIEW's existence
  (as one of two views `fema-nfip-source.mts` reads for env-swfl) but not this separate
  concoction consumer.
- **Verdict:** legitimate — matches the SAME already-catalogued pattern as
  `zip-listing-activity.ts` → `listing_transitions_recent_zip_stats` and
  `asking-price-trend.ts` → `daily_truth` (2 of the 4 real concoction defs are already
  documented as intentional direct-view reads for the chart-builder). This is just the 3rd
  of 4 concoction defs, and it's the one the catalog didn't catch.

## Checked and NOT flagged (already fully covered)

Everything else the grep turned up traced cleanly to an existing catalog entry: the full
daily listing spine (`listing_state`, `listing_transitions`, `listing_active_stats`,
`listing_momentum_stats`, `listing_pulse_daily`, `listing_price_bands`, `listing_dom`,
`listing_transitions_recent_zip_stats`), `market_details_swfl_latest` (the documented
highest-fanout node), `daily_truth`, `redfin_city_swfl`, `zhvi_zip_latest`/`zhvi_swfl`,
`zori_zip_latest`/`zori_swfl`, `tier_divergence_zip_latest`/`tier_divergence_pivoted`,
`census_acs_zcta`, `news_articles_swfl`, `neighborhood_stats`, `rsw_airport_monthly`,
`lee_building_permits`/`collier_building_permits`, `mhs_permits_swfl`,
`redfin_lee_market`/`redfin_collier_market` (the documented email bypass), all
`zip_active_dom_median`/`listing_dom`/`listing_momentum_stats`/`listing_transitions`
buyer-leverage reads (documented as unwired), and the full DuckDB/parquet set
(`bls_ppi`, `redfin_swfl`, `storm_events_swfl`, `sba_foia_franchise_county`,
`market_heat_core_swfl`/`market_heat_hotness_swfl`, the three `redfin_*` stress parquets,
`faf5`, `hurdat2_fl`).

**Out of scope, not flagged (not raw vendor-lake reads):**
- `corridor_profiles` (public schema, not `data_lake`) — an internally-generated
  "corridor character" table (not in `cadence_registry.yaml`, confirmed by grep — no
  external vendor ingest feeds it), read directly by the cre-swfl brain's own connector
  AND by embed cards/charts/concoctions. Same status as `swfl_search_demand`/
  `new_re_agents` (public-schema computed roots outside the vendor-ingest gate) — a real
  architectural pattern, just not a "bypass a brain that already carries vendor data" case.
- `user_mls_listings` / `user_mls_stats` (RESO/MLS sync, `lib/reso/*`) — user-owned data
  stored in the `data_lake` namespace for isolation, not a vendor ingest; no brain exists
  for it.
- `market_event_snapshots` (`lib/email/zip-events/state.ts`) — plain `public` schema
  write-back cache, not a raw lake table.
- `refinery/tools/*.mts` reads of `corridor_profiles`, `bls_laus`, `marketbeat_swfl`,
  `_tier1_inventory` — dev/debug/preview tooling, not product consumer surfaces.
- `scripts/project-feed/watch-scan.mts`, `scripts/project-feed/lifecycle-nudges.mts`,
  `scripts/geo/build-market-areas.mts` — additional direct readers of `listing_state`/
  `listing_transitions`, which the catalog already documents as having many legitimate
  direct readers (project-watch feature family); these are more instances of an
  already-acknowledged pattern, not a new table or new bypass class.

## Bottom line

The catalog is thorough for the 8 batches it explicitly walked, but the completeness claim
doesn't fully hold: **1 whole table** (`community_profiles`) and **1 whole view**
(`zori_pivoted`) never got traced by any batch, and **5 individual consumer reads**
(2 more `zhvi_pivoted` callers, 1 more `zhvi_zip_yoy_monthly` caller, plus the `city_pulse`/
`city_pulse_corridors`/`fema_nfip_county_year` "nearby"/concoction bypass consumers) are
real, live, and missing from an otherwise-detailed route trace. None of the 7 look like
urgent breakage — most fit patterns the catalog already blesses elsewhere (chart pages
reading pivoted views directly, concoctions reading views directly) — but two
(`city_pulse` via `lib/pulse/nearby.ts` and `city_pulse_corridors` via
`lib/pulse/corridor-nearby.ts`) duplicate filter/freshness logic the brain's source
connector already implements and are worth a `checks` entry to decide redundant-wire vs.
legitimate-second-consumer.

## === verify-3-concepts ===

# Verification of docs/standards/data-roots.md (2026-07-18)

Read-only. Full file read (1578 lines). All DB claims checked live against the Postgres lake
(`pg.data_lake.*` / `pg.public.*` via mcp__lake__query_lake), not the registry text alone.

## 1. Root existence verification

Pulled the full `information_schema.tables` listing for `data_lake` + `public` schemas (≈130 tables/views)
and cross-checked every Postgres-lane root the catalog names as "IS a root" / 🟡 / live. Spot-checked row
counts on every entry the catalog itself flagged as risky (nascent, paused, in-flight, frozen, or
"not yet activated").

**~47 distinct roots verified present and non-phantom**, including all of: `listing_dom` (33,267 rows),
`listing_active_stats` (66), `listing_momentum_stats` (79), `listing_state`, `listing_transitions`,
`daily_truth`, `listing_price_histogram_swfl(_latest)`, `rental_listings_swfl`/`rental_listing_stats`,
`lee_building_permits`, `collier_building_permits`, `redfin_lee_market`, `redfin_collier_market`,
`redfin_city_swfl`, `zhvi_swfl` (34,031) + 3 views, `zori_swfl` (5,277) + 2 views, `leepa_parcels` + 3
views, `collier_parcels` + 3 views, `parcel_subdivision`, `neighborhood_stats`, `fhfa_hpi`,
`tier_divergence_swfl` (39,308) + 2 views, `active_listings_residential`(+`_zip_stats`) — corpse
confirmed still present at 40,423/58 rows, zero readers per code — `usgs_daily` (605 rows, confirmed
frozen zombie still live-read), `market_details_swfl(_latest)`, `fdot_aadt_fl`+views, `fema_nfip_claims`+
views, `noaa_ghcn_rainfall`, `bls_oews_swfl`, `bls_laus`, `bls_qcew`, `census_cbp_fl`+agg view,
`census_acs_zcta`, `marketbeat_swfl`, `mhs_permits_swfl`, `local_cre_context`, `active_listings_cre`
(62 rows — catalog says "NOT YET ACTIVATED"; data has since landed, stale status note but not a
phantom), `news_articles_swfl`, `city_pulse`, `city_pulse_corridors` (198 rows, confirmed data present
despite paused cron), `dbpr_press_releases`, `dbpr_public_notices`, `dbpr_re_licensees`,
`new_re_agents` view (289 rows — confirms "half-wired, data lands, unread" claim is accurate),
`fl_dbpr_licenses`, `fl_dbpr_applicants`, `dbpr_sirs_submissions`, `fl_dor_sales_tax`,
`fl_dor_tdt_collections`, `rsw_airport_monthly`, `swfl_inc_announcements`, `fgcu_reri_indicators`,
`sba_loans_franchise_outcomes`, `swfl_search_demand`, `fdle_crime_swfl`. Also confirmed the SQL function
`zip_active_dom_median` exists (`information_schema.routines`).

Correctly-ABSENT roots (catalog marks these 🔴/unwired/parked and they are, in fact, absent from
Postgres — no phantom claim here): `listing_dom_historical` (🔴 not built), `census_vip`, `fred_g17`
(tier-1 cold parquet only, no consumer, correctly not in Postgres), `airdna_str_swfl` (parked, no
pipeline), `land_manufactured_swfl` (parked, writes into shared `listing_state`, no dedicated table).
Redfin's tier-1-duckdb sources (`redfin_swfl`, `redfin_price_drops`, `redfin_contract_cancellations`,
`redfin_delistings_relistings`) are S3 Parquet, not Postgres tables — correctly absent from this list,
consistent with their documented lane.

## 2. PHANTOM ROOT FOUND

**`lee_parcels`** — the catalog states (data-roots.md:756-770, and the ANNUAL section:157) this "IS a
root — `data_lake.lee_parcels` (count_table)... first run IN FLIGHT 07/18/2026," wired into
`properties-lee-value.mts:603` (`fdor_commercial_parcel_count` metric). Live query against
`information_schema.tables` AND a `%lee_parcel%` name search return **zero matches** — the table does
not exist in Postgres at all (not merely empty). The catalog does hedge this with "UNCONFIRMED... may
still be empty," but "does not exist" is a stronger and different condition than "empty" — worth
correcting the entry from "may be empty" to "table not yet created; first FDOR dispatch run has not
landed as of this verification." Not a fabrication in the doc (it disclosed uncertainty), but the
catalog's confidence level ("IS a root") overstates what's actually live right now.

No other declared root came back empty-or-missing under the same check.

## 3. NEW missed duplications (not in the catalog's flagged list of DOM/value/price-cuts/active-count/rent/market-temp/parcels)

### (a) `fgcu_reri_indicators` is a shadow duplicate-vote engine — 7 of its 8 metrics re-derive concepts already sourced (and brained) elsewhere

Verified directly in `refinery/packs/fgcu-reri.mts` (lines 27-30, 139-182): the pack emits 8
polarity-voted metrics from FGCU RERI's scraped monthly dashboard —
`airport_activity`, `tourist_tax_revenues`, `taxable_sales`, `unemployment_rate`,
`permits_single_family`, `home_sales_single_family`, `home_prices_single_family` (Lee/Collier/Charlotte),
`active_listings_residential`. Every one of these ALREADY has a dedicated, independently-ingested,
government/vendor-primary source feeding its OWN brain, also wired into master:

| RERI indicator | Duplicates root → brain |
|---|---|
| airport_activity | `rsw_airport_monthly` → `rsw-airport` |
| tourist_tax_revenues | `fl_dor_tdt` → `tourism-tdt` |
| taxable_sales | `fl_dor_sales_tax` → `sector-credit-swfl` |
| unemployment_rate | `bls_laus` → `macro-swfl` (critical) |
| permits_single_family | `lee_permits`+`collier_permits` → `permits-swfl` (critical) |
| home_sales_single_family | `redfin_lee`/`redfin_collier` + `leepa`/`collier_parcels` sold-median → `properties-lee/collier-value` |
| home_prices_single_family | `zhvi_*` → `home-values-swfl`, + parcel assessed/sold value roots |
| active_listings_residential | `listing_active_stats` → `active-listings-swfl` |

`fgcu-reri` computes its OWN bullish/bearish direction vote (`polarityAdjusted`, fgcu-reri.mts:44-45,
187-224) from these 8 indicators and rides into master as a non-critical `input_brains` edge — meaning
master receives a SECOND, independently-sourced vote on unemployment, permits, home sales, home prices,
tourist tax, taxable sales, airport activity, and active listings, from a scraped tri-county dashboard
summary that is itself almost certainly re-publishing the same underlying BLS/DOR/RSW/MLS numbers one
county cut removed. The catalog's macro-labor batch entry for `fgcu_reri_indicators` (data-roots.md
~1258-1264) documents field scope and master-wiring history but never cross-references this against the
other 7 brains it structurally echoes — none of the 8 route-tracer batches caught it because each worked
one source-domain at a time and never diffed RERI's indicator list against the other batches' brain
metrics. This is the single largest missed duplication class in the catalog — 8 concepts, not 1.

### (b) Employment level/YoY, Lee+Collier — computed from two independent BLS programs into two different brains

Verified in `refinery/packs/macro-swfl.mts:423-444` and `refinery/packs/labor-demand-swfl.mts:85-235`:
`macro-swfl` emits `qcew_lee_private_employment` / `qcew_collier_private_employment` (QCEW covered
private-sector employment count + YoY direction, county grain, **critical** master edge) from `bls_qcew`.
Separately, `labor-demand-swfl` emits `{cape_coral|naples}_total_employment_yoy_pct` (OEWS
survey-based total employment YoY, MSA grain — Cape Coral MSA ≈ Lee, Naples MSA ≈ Collier, non-critical
edge) from `bls_oews_swfl`. Both answer "is Lee/Collier employment growing" from the same two counties,
sourced from two different BLS survey programs (QCEW establishment reporting vs OEWS wage/occupation
survey), feeding two separate brains that both roll into master. The catalog's macro-labor cross-cutting
section only notes that `bls_laus`+`bls_qcew` SHARE one brain (macro-swfl) — it does not note this
second, cross-brain employment-level echo between macro-swfl and labor-demand-swfl.

Both findings are smaller-scope but real "same concept computed from >1 source, feeding >1 brain, both
into master" cases the route-tracer sweep did not catch because it worked source-by-source rather than
concept-by-concept across brain outputs.
