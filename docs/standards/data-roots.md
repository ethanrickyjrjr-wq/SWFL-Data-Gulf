<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- READ THIS FIRST. The 1,500-line catalog below is the searchable backing. -->
<!-- This top section is the 30-second map. Filed 2026-07-18 (lineage fan-out). -->
<!-- ══════════════════════════════════════════════════════════════════════ -->

# READ THIS FIRST — "where's the authority for X?" in 30 seconds

You're about to answer a data question or wire a consumer. **Do NOT grep for a table and read the
first one you find** — that is exactly how the same claim renders 2–14× apart across our surfaces.
Find the concept in the table below, read its **recommended root**, route through its **brain**.
(Full answer-flow: the "SWFL Intelligence Lake — data protocol v3" block in `CLAUDE.md` — fetch
master `…/api/b/master?view=speak&tier=2&v=5`, quote its `freshness_token`, route to the named leaf,
then read the ROOT, never a raw base table.)

**These picks are RECOMMENDATIONS from the 2026-07-18 lineage audit — NOT ratified architecture.**
Declaring a source "the authority" is a C1/C2 decision needing operator sign-off; everything tagged
**[NEEDS-SIGN-OFF]** is ratification-ready, not settled. Where the catalog below still says "IS a
root," treat that as the audit's recommendation too until signed off. Roots carry a status marker:
🔴 not built · 🟡 chosen, consumers not repointed / duplicates not deleted · 🟢 live, duplicates deleted.
A 🔴 root is the *intended home*, never a served value. **Never `DROP`/`DELETE` a duplicate** until its
replacement runs, every consumer repoints, and the operator signs off (RULE 1).

## Decision table — CONCEPT → recommended ROOT → BRAIN → DO-NOT-READ  **[NEEDS-SIGN-OFF]**

"no single brain" = a view/spine read directly by many surfaces, not owned by one pack (don't invent an owner).

| Concept | Recommended root | Brain | DO-NOT-READ (dead / dup / wrong) |
|---|---|---|---|
| **DOM — per-listing, list-side** | `listing_dom` view (`lib/listings/dom.ts formatDom`) | no single brain | `listing_state.days_on_market` (0%) · `listing_active_stats.avg_days_on_market` (NULL) · `listing_active_homes.days_on_market` (NULL) · `active_listings_residential*` (corpse) · `market_details_swfl.median_days_on_market` (realtor dup) — **T1** |
| **DOM — typical list-side (history)** | `listing_dom_historical` 🔴 → external `market_heat_swfl` (view `market_heat_core_swfl`, ZIP×month+YoY) | market-heat-swfl | never interchange w/ sold-side |
| **DOM — sold-side** | `redfin_swfl.median_dom` | housing-swfl | never interchange w/ list-side |
| **Value — assessed / just** | `leepa_parcels` (Lee) · `collier_parcels` (Collier) | properties-lee-value · properties-collier-value | per-ZIP assessed answerable for Collier, NOT Lee (real asymmetry) |
| **Value — list / asking** | `listing_state.list_price` (median-by-zip) | no single brain | `active_listings_residential` asking median (stale seed) |
| **Value — sold / recorded-sale** | metro chart: `redfin_metro_sold_pivoted` 🟢 · per-ZIP: `market_details_swfl_latest.median_sold_price` 🟢 · county deep-history: `redfin_lee_market`/`redfin_collier_market` | properties-value / housing-swfl | LeePA/FDOR deeds = different statistic, LABEL it. Redfin→realtor cutover parallel-run LIVE (`realtor_geo_medians` + `realtor_redfin_median_overlap` view, check `realtor_redfin_overlap_cutover`) — NEVER splice the two vendors into one line |
| **Value — home-value INDEX** | `zhvi_*` (Zillow ZHVI) — **demoted 07/18: no user surface serves the index as a VALUE** (charts/map/email swapped to real medians) | home-values-swfl (internal) | legit remaining index uses: YoY growth panels + investor yield calc (growth-rate work, no "median" claim) — **T2** |
| **Price cut — EVENT (per-listing)** | `listing_transitions.price_delta` (forward-only) | no single brain (rollups `listing_pulse_daily`, `listing_transitions_recent_zip_stats`) | — |
| **Price cut — SHARE (area)** | `listing_momentum_stats.price_reduced_share` (**0–100**) | listing-momentum-swfl | `market_details_swfl` (no cut field) — **T3** |
| **Active inventory — for-sale HOMES** | `listing_active_stats.listing_count` (homes-only, Lee/Collier; add `zip_code IS NOT NULL` to skip region rollup) | active-listings-swfl | `listing_momentum_stats.active_listing_count` (all-types, +~7,300 land, ~3.2×) · `active_listings_residential*` (dead) |
| **Rent — INDEX (monthly)** | `zori_*` (Zillow ZORI) | consumers: investor-zip-swfl (yield calc) + email `zori_zip_latest` (bypass) | don't conflate w/ the weekly own-sweep |
| **Rent — own inventory (weekly)** | `rentals_swfl` | active-rentals-swfl | FIXED 07/18: `_latest` now per-county-latest (Lee restored; per-county `captured_date` makes staleness visible) |
| **Rent — yield** | generic → realtor sold-to-rent · investor → `investor-zip-swfl.gross_rent_yield_pct` (ZORI×12 ÷ ZHVI) | market-temperature-swfl (generic) · investor-zip-swfl (investor) | 3 rent numbers/ZIP disagree up to ~7× — LABEL which |
| **Market-state / "temperature"** | `market-heat-swfl` (YoY verdict) | market-heat-swfl | **`market-temperature-swfl` is MISNAMED — emits rent-yield, NOT heat** · momentum + 2 others = neutral `0` reporters — **T4** |
| **Seller-stress verdict** | seller-stress-swfl (2019–21 z-score) | seller-stress-swfl | incompatible baseline vs market-heat — can point opposite for one region |

**Traps (nuance the cells can't hold):**
- **T1 — aggregate DOM is not trustworthy today.** Row-level `listing_dom` is fine; the *aggregate* is censored — ~63% of the active book is a `first_seen` floor (07/18 backfill de-flooring it). A 30-sec "typical DOM" off the aggregate is confidently wrong right now.
- **T2 — ZHVI is a typical-value INDEX, not a median.** Resolved harder later on 07/18: ZHVI left the value-serving user surfaces entirely (metro charts → `redfin_metro_sold_pivoted`, homepage map + email → realtor per-ZIP median sold); it survives only doing index work — YoY growth panels + investor yield calc, no "median" claim anywhere. The label lesson generalizes to ANY index (ZORI's "Median Monthly Rent" panel is the same violation, tracked `zori_median_monthly_rent_label`). Same ZIP (33901): assessed $244,810 / ZHVI $261,247 / deed-sold $269,900 / list $309k–$340k — never blend.
- **T3 — 0–1 vs 0–100 unit trap.** `price_reduced_share` is **0–100** in our `listing_momentum_stats` (20.1) but a **0–1 fraction** in realtor's `market_heat_core_swfl` (0.232). Both convert correctly today; a future swap is a silent 100×.
- **T4 — the most dangerous name in the system.** `market-temperature-swfl` does NOT carry market temperature (it's a rent-yield ratio). For "how hot is the market," use `market-heat-swfl`. Grabbing by name gets the wrong brain.

## PARCELS — four tables, easy to confuse (live-probed 2026-07-18)  **[NEEDS-SIGN-OFF]**

| Table | Rows / cols | What it is | Read for | Note |
|---|---|---|---|---|
| `collier_parcels` | 290,973 / **104** | FDOR cadastral, Collier (CO_NO=21) — comprehensive, **DONE** | properties-collier-value | don't re-widen |
| `leepa_parcels` | 548,798 / **20** | Lee **Property Appraiser** — a **DIFFERENT source** (valuation+sale only) | properties-lee-value | distinctive: `folioid`, `building_value` (`soh_cap`/`cap_difference` derivable from FDOR `jv_hmstd−av_hmstd`). A **cross-check of FDOR, NOT slated for deletion**. `strap` LANDED 07/19/2026 (FabricParcels crosswalk) — joins `lee_parcels.parcel_id` at parcel grain |
| `lee_parcels` | 556,083 / **104** | FDOR cadastral, Lee (CO_NO=46) — **LANDED 07/18/2026**, all parcel types | properties-lee-value | `lee_parcels_summary` view live (522,205 res / 14,052 com / 211,838 homesteaded / SOH gap median 31.6%); shape = `collier_parcels` (byte-identical `OUT_FIELDS`) |
| `parcel_subdivision_v` (VIEW) | 604,362 / 28 | FDOR homes-only slice of `lee_parcels`+`collier_parcels` — **replaced the `parcel_subdivision` table 07/19/2026** | communities-swfl | `subdivision_name` re-derived in-view from `legal_description` (validated `\y` stem, 100% match; 476 Collier parcels NULL where the fresher vintage lost their legal) |

- **ONE-ROOT TARGET — EXECUTED 07/19/2026:** one canonical FDOR parcel pair (Lee+Collier, shared 104-col schema). The LeePA keep-vs-retire question is **RESOLVED — operator ratified KEEP BOTH** (leepa stays as the appraiser cross-check, never dropped; `docs/handoff/2026-07-18-parcel-consolidation.md`). The greenlit dedup is DONE: `parcel_subdivision` (table + pipeline + cron) retired for the `parcel_subdivision_v` VIEW after full-join verification (604,362 = 604,362, zip/type/just_value 0 diffs) + all 3 readers repointed + `neighborhood_stats` rebuilt. Checks: `lee_parcels_leepa_redundant_into_properties_lee`, `collier_parcels_parcel_subdivision_redundant_scrape`, `data_authority_single_source_registry`.

---

# Data Roots — THE one place

**This is the catalog.** Before you build anything that reads a number, look here for its root and wire
to it. If the root isn't here, you add a root — you do NOT add another table. One root per
concept-per-cadence. Every consumer wires from a root. Nothing is wired twice. When a number is wrong,
there is exactly one place to fix it.

**Rules (enforced by the gate — see `data-consolidation-plan.md`):**
1. A consumer (brain / chart / page / email) reads ONLY a root listed here — never a raw base table.
2. One root per concept per cadence/purpose. External (Redfin/Zillow/Realtor) → pick exactly ONE per purpose.
3. When a real root runs correctly and every consumer is on it, **DELETE the roots it replaced** (dead
   tables, duplicate views, their crons). No corpses left to be grepped and re-wired.
4. Roots are VIEWS (or one loader function for cross-table math) — one definition, fix once.

## Field-level scope — the census, per column (the format every source follows)

For each source list EVERY field it can bring in (the ceiling), then mark each: **pulled?** (in the
ingest) and **used?** (read by a real consumer, and which). This is what stops re-ingesting — you see
"already pulled, just unwired" instead of re-scraping. Worked template = the FDOR parcel layer:

- **PULLED + USED (the ~10 that actually run today):** `jv` (just/market value → value brains) ·
  `jv_hmstd` + `av_hmstd` (SOH gap → properties-value → should-i-sell) · `sale_prc1`/`sale_yr1`/`sale_mo1`
  (sold-median by ZIP) · `phy_addr1`/`phy_zipcd`/`legal_description` (address + subdivision join) ·
  `land_value`/`living_area_sqft` (comp context).
- **PULLED + UNUSED, but the exact data our planned sale-page builds need (wire, don't re-fetch):**
  `effective_year_built`/`actual_year_built` (insurability + pre-listing inspection-risk) ·
  `improvement_quality`/`construction_class` (inspection-risk) · `multi_parcel_sale_1`/`_2` (investor
  purchase-share) · the homestead-portability chain `assessment_transfer_flag`/`prev_homestead_*`/
  `assessment_diff_transferred`/`year_value_transferred` (the SOH cost-of-waiting calculator, rank 1).
- **PULLED + UNUSED, no consumer planned (~75):** the classified-use JV/AV splits (`jv_h2o_recharge`,
  `jv_conservation`, `jv_hist_*`, `jv_working_waterfront`, non-hmstd-resd…), `township`/`range_code`/
  `section_code`, tax/stratum/assessment-admin codes, `special_circumstances_*`, disaster codes.
- **AVAILABLE, NOT PULLED (the ceiling gap):** owner/fiduciary fields (PII, deliberately excluded).
- **HYGIENE:** the `_TIER2_COLUMNS` dict has DUPLICATE keys (`jv` ×3, `jv_hmstd`/`av_hmstd`/`sale_prc1`/
  `av_sd`/`dor_uc`/`pa_uc` ×2) — Python keeps the last, so the "102 fields" count is inflated; dedupe it.

Every source below gets this same four-way field mark once the route fan-out lands. `source_scope` in
`cadence_registry.yaml` is the machine home for pulled-vs-available; usage comes from grep + graphify.

**Reconciled against `cadence_registry.yaml` (77 entries) 2026-07-18.** That registry is the machine
source for cadence + lane + consumer; this catalog promotes it into governed roots. Cadence bands present
in the registry: **daily 6 · weekly 11 · monthly 37 · quarterly 9 · annual 13.** Status per root:
🔴 not built · 🟡 root chosen, consumers not repointed / duplicates not deleted · 🟢 live, all consumers on it, duplicates deleted.

---

## "No brain reads it" (`consuming_pack: none`) — NOT the same as dead

CORRECTION (operator, 2026-07-18): `consuming_pack: none` means *no brain* reads it — it does NOT mean
dead. We wanted this data at some point; RECORD what each holds (below + its `source_scope`), never
delete-and-forget. Real status:
- **TRUE CORPSE (delete):** `active_listings` — 40k rows, still cron'd, feeds nothing. Tracked `active_listings_ship_or_delete`.
- **LIVE via a non-brain surface (keep):** `redfin_city_swfl` (monthly city-grain SOLD anchor under the desk hero) · `swfl_search_demand` (operator demand digest, `refinery/tools/search-demand.mts`) · `dbpr_re_licensees` (new-agent outreach radar, `public.new_re_agents`).
- **UNWIRED but valuable (wire, don't delete):** `fred_listing_swfl` — **Lee/Collier MSA monthly DOM + active + list-price + new-listings since 2016** (a real `listing_dom_historical` candidate) · `fred_g17` (national IP; FRED also has Lee/Collier county HPI/GDP/income/permits, unpulled) · `census_vip` (national construction value, many sub-categories unpulled) · `fred_laus_alfred` (national LAUS, capped at national grain).

The full "what we get vs what's available" per source is its `source_scope` block in `cadence_registry.yaml`
(`confirmed_total` = pulled, `source_ceiling` = available+unpulled). The route-measurement fan-out
(2026-07-18) is assembling all of it — scope + every route + status — into this one file.

---

## SYSTEMIC FINDINGS — what all 8 route-tracers found in aggregate (2026-07-18)

**TRUE CORPSES (feed nothing live — delete):** `active_listings` + `active_listings_residential`(+`_zip_stats`)
(daily cron, zero readers) · `census_vip`, `fred_g17` (no consumer at all) · `bls_oews_swfl_tier1` (cold
NDJSON dup of the live tier-2). (The `usgs` tier-1 parquet came OFF this list 07/19/2026 — it is now
env-swfl's live read.)

**ZOMBIE READ — FIXED 07/19/2026:** `usgs_tier2` / `data_lake.usgs_daily` (frozen 05/19/2026, producer
deleted) WAS env-swfl's live read path for the Caloosahatchee stage metric. `usgs-water-source.mts` now
dual-reads the fresh tier-1 Parquets (`usgs_water_swfl` + `_sites`, monthly via `usgs-monthly.yml`);
the frozen `usgs_daily`/`usgs_sites` tables drop once the env-swfl rebuild is verified serving the
Parquet number. Check `usgs_tier2_orphan`.

**REDUNDANT DOUBLE-INGEST:** parcels — the poster child — RESOLVED 07/19/2026: `parcel_subdivision`
retired for the view; `leepa` is the ratified-KEEP appraiser cross-check; `lee_parcels` +
`collier_parcels` are the one canonical FDOR pair. CORRECTION: duckdb→tier2 pairs (`zhvi`,
`tier_divergence`) are NOT redundant — a promotion chain (parquet raw → Postgres → view), by design.

**BYPASS WIRES — a surface reads the raw table, skipping the brain that already carries it** (your exact
"don't run a second wire to the chart" rule; each is either a wire to delete OR a brain to route through):
email reads `zori_zip_latest` directly (skips rent brain) · email reads `redfin_*_market` directly (skips
value brains) · `/charts` reads `tier_divergence_pivoted` directly (skips its near-orphan brain) ·
`/charts` HurricaneRingChart = hardcoded snapshot bypassing the stale hurricane brain · `landing-data`
hardcodes a stale 06/05 cre/labor snapshot · `market_details_swfl_latest` = highest-fanout node, read
directly by brain + charts + landing + email + desk.

**UNWIRED-BUT-VALUABLE (wire, don't re-fetch):** `fred_listing_swfl` (Lee/Collier MSA DOM history since
2016 → `listing_dom_historical` candidate, has a citation bug) · `airdna_str`, `land_manufactured`,
`crexi`/`brevitas` (parked scaffolds) · `fred_laus_alfred` (backtest-only, intentional) · the 07/18
`buyer-leverage` module (built this session, correctly held/unwired).

**DARK PAID INGEST (gated out):** CRE brokers (marketbeat/colliers/lee_associates) — 261 rows dropped at
a `verified=false` gate, only 48 reach the brain · `sba_franchise` — cron fires but brain defaults to
FIXTURE mode (no real figures served).

**HALF-WIRED / RENDERED-NOWHERE:** `dbpr_re_licensees` writes `new_re_agents` but ZERO code reads it (the
outreach radar exists at the DB layer, rendered nowhere) · `storm-timeline` deliverable parked.

**STALE / BROKEN:** news project-alert cron 500s every run (phantom `projects.lat/lng`) · ZHVI "median"
mislabel live in THREE places (email + `/charts` + brain label) · `rsw_airport` note references Firecrawl
(crawl4ai-only violation — confirm stale) · corridor-pulse pair paused since 07/05.

**MOCK/FAKE DATA SERVED AS REAL (a surface not wired to a real root — tracked):** `/map` renders
hardcoded mock flood-loss dollars as if they were real per-ZIP data (`sa0718_map_page_always_renders_hardcoded_mock_flo`),
and its "live" flood-gradient bounds are numerically identical to the mock fixture — the calibration was
copied from fake data (`sa0718_live_flood_gradient_bounds_are_numerically`). Same class as the hardcoded
landing/hurricane snapshots. The fix is wiring `/map` to the real env-swfl flood root.

**FRESHNESS-WIRING — sale-page surfaces serve STALE brain periods while all lights are green (the wiring
that isn't done until it SERVES fresh):** `/r/should-i-sell` + `/r/back-on-market` serve Mar 2026 while
Jun-30 data has sat in the lake since 07/15 (`seller_stress_swfl_serving_stale_period`, P0 due today —
needs a brain rebuild, not SQL). ROOT CAUSE, architectural: every freshness monitor measures PROCESS
recency; none measures served DATA vintage (`data_vintage_tripwire_missing`). A root's job is not done
when it's *registered* — it's done when it SERVES the freshest lake data. **The gate must include a
data-vintage tripwire** (served output period vs lake-newest vs cadence).

**FIELD UNDERUSE (FULL-SCOPE-FIRST):** parcels pull ~102 fields, only ~10 used today (rest sit for
planned builds/unused) · `faf5` mode-blind (transport-mode column never read). (The
`parcel_subdivision` 25/120 underuse case closed 07/19/2026 with the table's retirement — the view
exposes the wide tables' fields.)

**NAMING LANDMINE:** the `active-listings-swfl` brain's `SOURCE_ID` + source file name point at the
`active_listings_residential` corpse by string, but actually read the live `listing_active_stats` — wire
by data, not by name.

---

## DAILY (cadence_days = 1)

The daily spine is ONE pipeline — `listing_lifecycle` (the SteadyAPI api_feed sweep) → `listing_state` →
the lake roots below. Everything "how the market looks right now" descends from it.

- **`listing_state`** — raw daily spine (api_feed). NOT a consumer root; the base the daily lake roots compute from.
- **`listing_dom`** 🟡 — root: **current per-listing DOM** (list-side), computed from `listing_state`. Wording root `lib/listings/dom.ts formatDom`.
  · Wires to: `/r/how-long-has-it-sat`, `/r/should-i-sell`, chat comps, homepage-map DOM pill (repoint), email DOM (repoint), active-listings brain (repoint).
  · DELETE after live: `listing_state.days_on_market` (0% pop), `listing_active_stats.avg_days_on_market` (NULL), `listing_active_homes.days_on_market` (NULL), `active_listings_residential`+`_zip_stats` (corpse), `market_details_swfl.median_days_on_market` (realtor dup).
- **`listing_active_stats.listing_count`** 🟡 — root: **active for-sale HOME inventory** (homes-only, Lee/Collier).
  · Wires to: /desk KPI + watchlist, active-listings brain, housing brain.
  · Govern/DELETE: `listing_momentum_stats.active_listing_count` — **RATIFIED 07/19/2026 (operator): the all-types count becomes its OWN root** — extend the `listing_active_stats` rollup with a labeled all-types lane ("all active listings incl. land & commercial"), repoint momentum onto it, kill momentum's own computation (check `all_types_active_count_own_root`; never labeled "active listings" unqualified). Also govern/DELETE: `active_listings_residential_zip_stats`, raw flag-counts.
- **`listing_transitions.price_delta`** 🟡 — root: **per-listing price-cut EVENT** (forward-only). Rollups `listing_pulse_daily`, `listing_transitions_recent_zip_stats` ride it.
- **`listing_momentum_stats.price_reduced_share`** 🟡 — root: **area price-cut SHARE** (own inventory, **0–100**). (dedupe the 33936 double-row first — tracked.)
- **`listing_state.list_price` (median-by-zip)** 🟡 — root: **current list/asking price**. DELETE the stale `active_listings_residential` asking median (tracked `price_source_wire_off_stale_seed_table`).
- **`daily_truth` (live_search)** — root: **daily asking-price + mortgage** into freshness-pulse. (Mortgage source is FRED weekly, served daily — see Weekly.)
- Also daily: `city_pulse` (→ city-pulse), `news_swfl` (→ app/insiders).

## WEEKLY (cadence_days = 7)

- **`market_aggregates_histogram`** 🟡 — root: **price distribution / bands** (list-side, weekly). → price-distribution-swfl. *(Was missing from v1 of this catalog.)*
- **`rentals_swfl`** 🟡 — root: **our own rental listing inventory + rent** (weekly sweep). → active-rentals-swfl. Completeness bug FIXED 07/18: `_latest` is now per-county-latest (at verify: Lee 3,927 @ 07/06 + Collier 3,082 @ 07/13). Distinct from the monthly ZORI index.
- **`lee_permits`** 🟡 — root: **Lee building permits** (weekly). *(Collier permits are MONTHLY — cadence mismatch between the two; the permits brain must not treat them as same-cadence.)*
- Also weekly: `swfl_inc` (econ-dev), `dbpr_press_releases`/`dbpr_public_notices` (news), `city_pulse_corridors` (corridor/cre), `crexi_listings`/`brevitas_listings` (cre).

## MONTHLY (cadence_days = 30/31) — external "pick ONE per purpose"

- **`listing_dom_historical`** 🔴 — root: **typical DOM over time (list-side history)**. ONE external monthly = realtor.com **`market_heat_swfl`** (has real ZIP×month history + YoY). Once we hold a month of de-floored daily `listing_dom`, our own monthly fills this root and realtor becomes a labeled cross-check.
  · RECONCILE: there are TWO realtor monthly feeds — `market_heat_swfl` (tier-1, → market-heat-swfl) and `market_aggregates_details` (tier-2, → market-temperature-swfl). Decide which is the market-state root; the other's DOM/heat columns collapse.
- **`redfin_swfl.median_dom`** 🟡 — root: **sold-side DOM** (housing brain). Different purpose, own root.
- **`redfin_price_drops` / `redfin_contract_cancellations` / `redfin_delistings_relistings`** 🟡 — roots: seller-stress inputs (external monthly). One each, one purpose.
- **`redfin_lee` / `redfin_collier` (31d)** 🟡 — root: **sold price / market by county** → properties-value brains. SECOND route: `lib/email/market-context.ts` reads the raw `redfin_*_market` tables directly for email county figures (bypasses the brains).
- **`redfin_city_swfl` (31d)** 🟡 — root: **monthly city-grain SOLD price** → LIVE via the desk hero (`lib/desk/loaders.ts:174`), price-trend fallback (`lib/charts/gallery-loaders.ts:203`), AND since 07/18 the metro chart root `redfin_metro_sold_pivoted` (view over this table: /charts + gallery + zip-report). Slated for retirement after the realtor cutover below.
- **`realtor_geo_medians` (30d)** 🟡 — root: **realtor city/county/neighborhood median sold/list/DOM/ppsqft** (the Redfin-retirement parallel run, live 07/18 — 9 rows first run). Consumer today = the cutover decision (`realtor_redfin_median_overlap` view, check `realtor_redfin_overlap_cutover`); after 2-3 tolerant overlap months + operator sign-off it becomes THE ongoing sold-median root and the redfin pulls retire.
- **`zhvi_*` (Zillow)** 🟡 — root: **home-value INDEX** — demoted 07/18 to index-only work (YoY growth panels + investor yield); no user surface serves it as a value and nothing calls it a median.
- **`zori_*` (Zillow)** 🟡 — root: **rent INDEX** (monthly). Distinct purpose from the weekly own-sweep above.
- **`airdna_str_swfl`** 🟡 — root: short-term-rental → investor-zip. **`collier_permits`** (monthly) → permits. Plus tdt/sales-tax/sirs/licenses/rainfall/rsw/fgcu/bls-monthly (each its own root, walked later).

## QUARTERLY (cadence_days = 90)

`fema` (env/flood) · `fhfa` (HPI → value brains) · `bls_qcew` (macro) · `fdle_crime` (safety) ·
`marketbeat_swfl`/`colliers_industrial`/`lee_associates_swfl`/`fmb_recovery` (CRE, C&W/Colliers publish quarterly) ·
`sba_foia_franchise_outcomes`. One root per source; walked with their brains.

## ANNUAL (cadence_days = 365) — includes the parcel/value base

**PARCELS — the redundancy poster child. FOUR overlapping ingests; target = ONE FDOR parcel root.**
- **`leepa`** (Lee) — LeePA appraiser feed (gissvr.leepa.org, layers 0/9/10/12), 548,798 parcels → **properties-lee-value**. 24 vendor layers exist; 4 pulled.
- **`lee_parcels`** (Lee) — NEW 07/18/2026, FDOR ArcGIS Statewide Parcel (CO_NO=46), **LANDED same day: 556,083 unique parcels** (556,100 raw features; 17 unservable OBJECTIDs logged + skipped), 104 cols, dispatch-only → **properties-lee-value** (the SAME brain as `leepa` — operator ratified KEEP BOTH). "Lee never had a comprehensive FDOR parcel table before this."
- **`collier_parcels`** (Collier) — FDOR ArcGIS (CO_NO=21), 290,973 parcels, 102 fields → **properties-collier-value**.
- **`parcel_subdivision`** — RETIRED 07/19/2026: was a homes-only pull of the SAME FDOR layer; now the VIEW `parcel_subdivision_v` over `lee_parcels`+`collier_parcels` → **communities-swfl**.
- **THE PROBLEM (largely resolved):** Lee is ingested twice into one brain (`leepa` appraiser + `lee_parcels` FDOR) — ratified KEEP BOTH as a cross-check; the triple-scrape of the identical FDOR layer ended 07/19/2026 with `parcel_subdivision`'s retirement (`collier_parcels_parcel_subdivision_redundant_scrape`); Lee overlap tracked (`lee_parcels_leepa_redundant_into_properties_lee`).
- **ONE-ROOT TARGET:** a single canonical FDOR parcel table (Lee CO_NO=46 + Collier CO_NO=21, shared schema) that properties-lee-value + properties-collier-value + communities all read. The `leepa` question is **RESOLVED (operator, 07/18): KEEP BOTH** — LeePA carries fields FDOR lacks (`building_value`, deed instrument, full sale date, `folioid` key) and stays as the appraiser cross-check.
- Also annual, walked later: `neighborhood_stats`, `fdot` (traffic), `census_acs`/`census_cbp`, `bls_oews`, `hurdat2`, `faf5`, `mhs_databook`/`mhs_permits`.

---

## Walk order (build one root, verify, delete duplicates, then next)

Sale-page block first: **active count → DOM (daily) → list/sold price → price-cuts → price-bands (weekly)
→ rent (weekly sweep + monthly index) → market-temp (reconcile the two realtor feeds) → value (annual parcels).**
Each: confirm/build the root view → repoint every consumer → verify live → DELETE the duplicates → mark 🟢
→ turn the gate on for its base tables. Then the rest of the platform by cadence band.

This file grows into the complete map as each concept is walked. Every entry above is reconciled to
`cadence_registry.yaml`; consumer + dead-claims for the sale-page roots are live-verified, deeper concepts
verified as walked.


---

# FULL PER-SOURCE DETAIL — route-tracer reports (2026-07-18)

Eight read-only Opus tracers, one per domain, verified against code (not the registry alone). Each
source: field scope (pulled/available), status, and every downstream route. This is the searchable
detail behind the catalog above.



## === daily-spine ===

# Route Catalog — Batch 1: the real-estate daily spine

READ-ONLY audit, 2026-07-18. Traced from `ingest/cadence_registry.yaml` + live code (`refinery/`, `lib/`, `app/`, `components/`). No DB access — DB-runtime claims (row counts, "cron parked" vs "graduated") are flagged, never asserted.

## The spine in one picture

```
listing_lifecycle (SteadyAPI /search, DAILY)
  └─ writes data_lake.listing_state (MERGE)  +  data_lake.listing_transitions (log)
       │
       ├─ listing_state ──► listing_active_homes (authority view: api_feed·active·sale·Lee/Collier·not-land·≥$20k)
       │                       ├─► listing_active_stats  (GROUPING SETS rollups)  ──► active-listings-swfl brain + desk + landing + email
       │                       └─► live_search median_asking WRITER (lake mode) ──► data_lake.daily_truth
       │     listing_state ──► listing_momentum_stats (view, roots HERE not market_aggregates) ──► listing-momentum-swfl brain + desk + buyer-leverage
       │     listing_state ──► listing_price_bands (view) ──► desk price histogram
       │     listing_state ──► listing_dom (view, + transitions relists) ──► loadListingContext (deliverables) + buyer-leverage(unwired) + zip_active_dom_median()
       │     listing_state ──► direct reads: desk, project-watch, coming-soon, zip-events email, rentcast, listed-date-write
       │
       └─ listing_transitions ──► listing_pulse_daily (view) ──► desk + charts gallery
             listing_transitions ──► listing_transitions_recent_zip_stats (view, joins listing_state for geo) ──► concoctions + email
             listing_transitions ──► direct: desk, back-on-market page, buyer-leverage(unwired), project-watch, zip-events email

market_aggregates_histogram (SteadyAPI, WEEKLY) ─► listing_price_histogram_swfl(_latest) ─► price-distribution-swfl brain
market_aggregates_details   (SteadyAPI, MONTHLY)─► market_details_swfl(_latest) ─► market-temperature-swfl brain + charts page + landing DOM + email + desk

live_search_daily_mortgage  (FRED, DAILY) ─► daily_truth(mortgage_30yr_fixed) ─► freshness-pulse brain + desk + charts gallery
live_search_daily_median_asking (lake mode over listing_active_homes, DAILY) ─► daily_truth(median_asking_price) ─► freshness-pulse + desk + charts + concoctions

active_listings (crawl4ai scrape, DAILY) ─► active_listings_residential(_zip_stats) ─► ☠ NOTHING. CORPSE.
```

Five brains off this spine are all `input_brains` of `master` (`refinery/packs/master.mts:335-345`, freshness-pulse is a `modifier` edge :314): active-listings-swfl, listing-momentum-swfl, price-distribution-swfl, market-temperature-swfl, freshness-pulse. Every brain is served at `/api/b/[slug]` (`app/api/b/[slug]/route.ts`) and flows into master → conversation.

---

## SOURCES

### listing_lifecycle · cadence 1d · lane tier-2
- STATUS: **live** (the spine; `nightly:` gated by assert_landed.py; floor 28,000 rows)
- ROOT: **IS the root** of the entire daily listing spine. Writes two base tables: `data_lake.listing_state` (MERGE) + `data_lake.listing_transitions` (log). Every `listing_*` view below roots here.
- DATA WE GET: Daily SteadyAPI `/search` sweep, **Lee + Collier + Hendry**: address/price/beds/sqft/lot/lat-lon/county/photo/status/property_type, all 7 status flags, reduced_amount. State-machine diff (new/active/price-cut/holding/relist). Closings captured (budget-sampled departures resolve to sold_price+sold_date via `/property-tax-history`). `listed_date` captured 07/16 (opportunistic, probed listings only). Pipeline `ingest/pipelines/listing_lifecycle/pipeline.py`; workflow `.github/workflows/listing-lifecycle-daily.yml`.
- DATA AVAILABLE, unpulled: per-listing DOM (today−listed_date) not yet a served metric — `listed_date` lands in `listing_state` but only `listing_dom` view (07/17) derives it. Brokerage/agent fields are a genuine vendor ceiling (zero agent/broker fields across all 18 SteadyAPI RE endpoints). Only aggregate median_days_on_market exists (city/county/ZIP), not per-listing.
- ROUTES:
  - `listing_lifecycle → listing_state → listing_active_homes → listing_active_stats → active-listings-swfl brain` (`refinery/sources/active-listings-residential-source.mts:27` VIEW=`listing_active_stats`) → master input + `fgcu-reri` brain (`refinery/packs/fgcu-reri.mts:182` reads the served fragment) + conversation.
  - `→ listing_state → listing_active_stats → /desk` (`lib/desk/loaders.ts:275`)
  - `→ listing_state → listing_active_stats → homepage map` (`lib/landing/load-home-map-data.ts:160`, Market Activity layer)
  - `→ listing_state → listing_active_stats → insiders desk-stats` (`app/insiders/_lib/desk-stats.ts:83`)
  - `→ listing_state → listing_active_stats → email market context` (`lib/email/market-context.ts:118`) + agent-brand-intro deliverable (`lib/deliverable/recipes/agent-brand-intro.ts:516`)
  - `→ listing_state → listing_active_homes → live_search median_asking writer → daily_truth` (registry `source_scope`: "median over listing_active_homes"; lake-mode) — see live_search_daily_median_asking entry.
  - `→ listing_state → listing_momentum_stats → listing-momentum-swfl brain` → master + `should-i-sell` page (`lib/should-i-sell/load-market-snapshot.ts:123` loadBrain) + `/desk`/buyer-leverage (see momentum entry).
  - `→ listing_state → listing_price_bands → /desk` price-band histogram (`lib/desk/loaders.ts` reduceActiveStats lane).
  - `→ listing_state → listing_dom → loadListingContext` (`lib/listings/select.ts:341`) → coming-soon / build-doc / social-calendar / listing-photo deliverables.
  - `→ listing_state (direct)`: project property-watch (`app/api/projects/[id]/watch/route.ts:59`), coming-soon deliverable (`lib/deliverable/recipes/coming-soon.ts:289,309`), email zip-events (`lib/email/zip-events/state.ts:64,155`), rentcast listing loader (`lib/listings/rentcast.ts`), listed-date self-heal write (`lib/listings/listed-date-write.ts:30`).
  - `→ listing_transitions → listing_pulse_daily → /desk` (`lib/desk/loaders.ts:339`) + charts gallery (`lib/charts/gallery-loaders.ts:148`).
  - `→ listing_transitions → listing_transitions_recent_zip_stats → concoctions` (`lib/concoctions/defs/zip-listing-activity.ts:38`) + email (`lib/email/market-context.ts:458`).
  - `→ listing_transitions (direct)`: /desk (`lib/desk/loaders.ts:489`), back-on-market page (`lib/back-on-market/relist-fact.ts:98` → `app/r/back-on-market/page.tsx:15`), email zip-events (`lib/email/zip-events/state.ts:119,262`), project-watch (`lib/project/watch-event.ts`).
- NOTES: The single most-consumed source in the batch. Naming trap: the `active-listings-swfl` brain carries `SOURCE_ID = "active_listings_residential"` (`refinery/packs/active-listings-swfl.mts:16`) — a **legacy string that does NOT mean the dead scraper table**; its data comes from `listing_active_stats` (this spine). Don't wire the canonical file to the corpse on the strength of that string.

### active_listings · cadence 1d · lane tier-2
- STATUS: **dead-corpse** (ingested daily, zero live readers)
- ROOT: raw base of `active_listings_residential` (+ `_zip_stats` view) — a root that feeds nothing.
- DATA WE GET: Region-wide SWFL residential active listings scraped (crawl4ai HTTP) from an undisclosed brokerage site (base URL is the `LISTINGS_SOURCE_BASE_URL` GHA secret): mls_id, list_price, street_address, city, community, beds, baths, sqft, acres, days_on_market, status, property_type, listing_type, zip_code, county, state, listing_url. Pipeline `ingest/pipelines/active_listings/`; workflow `.github/workflows/active-listings-daily.yml`; still crons daily.
- DATA AVAILABLE, unpulled: per-listing detail pages (year built, garage, pool/waterfront, HOA fee, agent/office, photos, tour, open house, price history, remarks) — deliberately skipped to keep the index scrape light.
- ROUTES: **NONE.** Verified zero live `.from("active_listings_residential")` / `.from("active_listings_residential_zip_stats")` in `refinery`/`lib`/`app`/`components`. Only survivors are comments + tests: `lib/email/sole-spine.test.ts:8` (`const DEAD_VIEW = "active_listings_residential"`), `lib/landing/load-home-map-data.ts:13` ("scraper table is ABANDONED"). The registry `consuming_pack: none` is a stated fact here, not a stub.
- NOTES: **This is the corpse the whole spine story hinges on.** Its table (`active_listings_residential`) was the pre-SteadyAPI seed; `listing_lifecycle` (SteadyAPI api_feed → `listing_state`) replaced it and every consumer moved to `listing_active_stats`. The pipeline still runs and burns a daily cron writing a table nobody reads. Registry (`cadence_registry.yaml:1841-1870`) already documents SHIP-OR-DELETE (`check active_listings_ship_or_delete`) and correctly says it's NOT nightly-gated ("gating this would guard a corpse"). Canonical file: mark for deletion, do not wire.

### market_aggregates_histogram · cadence 7d · lane tier-2
- STATUS: **live** (graduated 07/01; feeds price-distribution-swfl brain) — see NOTE on the stale "cron parked" pack message.
- ROOT: **IS a root** — writes `data_lake.listing_price_histogram_swfl` (append time-series) + `_latest` view.
- DATA WE GET: Price-band histogram (band_min/max/range, listing_count, total_listings, status), per county (Lee, Collier), for-sale only, weekly. SteadyAPI Layer-B (realtor.com origin). ~2 calls/run. Pipeline `ingest/pipelines/market_aggregates/`; workflow `ingest-market-aggregates-histogram.yml`.
- DATA AVAILABLE, unpulled: none noted — registry says "Full extraction confirmed; parsed field-by-field with no gap on this endpoint."
- ROUTES:
  - `market_aggregates_histogram → listing_price_histogram_swfl_latest → price-distribution-swfl brain` (`refinery/sources/price-distribution-source.mts:24` VIEW=`listing_price_histogram_swfl_latest`) → master input + conversation.
  - `→ listing_price_histogram_swfl_latest → seed chart series` (`lib/email/doc/seed-chart-series.ts:40`, Collier active for-sale price histogram) — deliverable seed-preview chart.
- NOTES: The `_latest` view (`docs/sql/20260630_market_aggregates_tables.sql:87`) is the read node (keeps under PostgREST cap). DISCREPANCY: `refinery/packs/price-distribution-swfl.mts:102-106` still emits "pipeline not yet run live (cron parked)" as its empty-message, but the registry says GRADUATED 07/01 with scheduled fires. No DB access to confirm which is current — report the wiring as live, treat "cron parked" as a possibly-stale string to verify at DB level.

### market_aggregates_details · cadence 30d · lane tier-2
- STATUS: **live** (graduated 07/01; feeds market-temperature-swfl brain) — same stale-message caveat.
- ROOT: **IS a root** — writes `data_lake.market_details_swfl` (append time-series) + `_latest` view.
- DATA WE GET: Per-ZIP (57 in-scope Lee+Collier ZIPs, monthly): median_sold_price, median_listing_price, median_rent_price, median_days_on_market, median_price_per_sqft, local_hotness_score, list_to_sold_ratio_pct, sold_to_rent_ratio, market_strength, is_competitive; + 07/16 fill: national_hotness_score, local/national_temperature, hot_market_badge, hot_market_rank, market_comparison block (ratio_of_days_on_market_vs_typical_*, ratio_of_ldp_views_vs_typical_*). ~57 calls/run. Workflow `ingest-market-aggregates-details.yml`.
- DATA AVAILABLE, unpulled: field-level extraction complete as of 07/16; remaining ceiling is ENDPOINT-level — unused sibling SteadyAPI endpoints (/neighborhood-market-trends, /neighborhood-amenities, /environment-risk, /nearby-home-values, /similar-homes, /new-construction, /property-urgency views-saves, etc.). See `docs/steadyapi-research/2026-07-16-realtor-full-scope-audit.md`.
- ROUTES:
  - `market_aggregates_details → market_details_swfl_latest → market-temperature-swfl brain` (`refinery/sources/market-temperature-source.mts:25` VIEW=`market_details_swfl_latest`) → master input + conversation.
  - `→ market_details_swfl_latest → charts page` (`app/charts/page.tsx:144`, ~54 rows one-per-ZIP).
  - `→ market_details_swfl_latest → homepage map` (`lib/landing/load-home-map-data.ts:197`, Days-on-Market layer — realtor.com median DOM).
  - `→ market_details_swfl_latest → email market context` (`lib/email/market-context.ts:165`, per-ZIP median sold).
  - `→ market_details_swfl_latest → /desk` (`lib/desk/loaders.ts:548`).
- NOTES: This is a HIGH-FANOUT node — one ingested table, five distinct surfaces (brain + charts page + landing + email + desk), most reading the `_latest` view DIRECTLY (not through the brain). All five are real, non-redundant wires. `market-temperature-swfl.mts:44-48` carries the same stale "cron parked" empty-message discrepancy as histogram. Vendor's `ratio_of_days_on_market_*` are signed day DELTAS despite the name — stored verbatim.

### live_search_daily_median_asking · cadence 1d · lane tier-2
- STATUS: **live** (`nightly:` gated, `count_filter metric_key=median_asking_price`, `count_nonnull: value`)
- ROOT: **NOT its own root — it is a `listing_lifecycle` DERIVATIVE.** Lake mode: deterministic median over `data_lake.listing_active_homes` (which roots to listing_state). No web search, no LLM. It is a WRITER into the shared `data_lake.daily_truth` table (not a fresh external source).
- DATA WE GET: Daily median asking (list) price for 3 desk cities (Cape Coral, Fort Myers, Naples), computed from our own cleaned active inventory. Row shape → `daily_truth(metric_key=median_asking_price, area, value, unit, source_url, retrieved_at…)`. Engine `ingest/pipelines/live_search/engine.py`; workflow `live-search-daily.yml`.
- DATA AVAILABLE, unpulled: any city with lake inventory is a config-only `areas:` addition (Bonita Springs, Estero, Marco Island, Lehigh…). Same lake mode could answer active-count or median-DOM per city. SOLD companion lives in `data_lake.redfin_city_swfl` (monthly).
- ROUTES:
  - `listing_active_homes → (this writer) → daily_truth(median_asking_price) → freshness-pulse brain` (`refinery/sources/daily-truth-source.mts:37` TABLE=`daily_truth`) → master modifier + conversation.
  - `→ daily_truth → /desk` (`lib/desk/loaders.ts:98`, daily ASKING price series per city).
  - `→ daily_truth → charts gallery` (`lib/charts/gallery-loaders.ts:179`, daily median ASKING per city).
  - `→ daily_truth → concoctions asking-price-trend` (`lib/concoctions/defs/asking-price-trend.ts:50`).
- NOTES: Replaced the RETIRED `live_search_daily_median_price` (web-searched SOLD median, 19 days of NULLs, killed 07/12). `daily_truth` has no `source_name` column (source_tag is hardcoded `'live_search'` for both metrics), so the gate discriminates on `metric_key` via `count_filter` — this is why the mortgage/asking twins can't false-LANDED off each other's rows. The **circularity to flag for the canonical file**: this metric both READS the spine (listing_active_homes) and WRITES a shared table read by the freshness brain — it is a spine derivative masquerading as a "daily source."

### live_search_daily_mortgage · cadence 1d · lane tier-2
- STATUS: **live** (`nightly:` gated, `count_filter metric_key=mortgage_30yr_fixed`, `count_nonnull: value`)
- ROOT: **IS a root** (external: FRED). api mode, authoritative, no search.
- DATA WE GET: Daily 30-yr fixed mortgage rate (national), FRED series `MORTGAGE30US` (weekly Thu release). Writes `daily_truth(metric_key=mortgage_30yr_fixed, area=swfl, value, unit=pct…)`. 1 row/day. `api_config: {provider: fred, series_id: MORTGAGE30US}`.
- DATA AVAILABLE, unpulled: same FRED release (rid=190) carries `MORTGAGE15US` (15-yr fixed) — confirmed live, same call shape, zero new integration cost. All other series in that release (5/1 ARM, 1-yr ARM, points/margin, regional) are confirmed DISCONTINUED by FRED (real vendor ceiling).
- ROUTES:
  - `FRED → daily_truth(mortgage_30yr_fixed) → freshness-pulse brain` (`refinery/sources/daily-truth-source.mts:37`) → master modifier + conversation.
  - `→ daily_truth → /desk` (`lib/desk/loaders.ts:98`, mortgage lane alongside asking).
  - `→ daily_truth → charts gallery` (`lib/charts/gallery-loaders.ts:179`, mortgage series).
- NOTES: Shares `freshness_table` `daily_truth` with median_asking — the `count_filter` on `metric_key` is what keeps a dead mortgage feed from hiding behind the median metric's rows (the mask that false-REDded both until 07/05). This is the ONE genuinely external daily root in the batch; the other daily "source" (median_asking) is derived from our own inventory.

---

## LAKE VIEWS (computed off the daily sweep)

### listing_state · cadence 1d (refreshed by listing_lifecycle) · lane lake-view (BASE TABLE)
- STATUS: **live** (base table; read by a brain via derived views + many direct surfaces)
- ROOT: raw base of the spine — written directly by `listing_lifecycle` (MERGE), `source_name='api_feed'`. Migration `migrations/20260627_listing_lifecycle.sql`.
- DATA WE GET: One row per (source_name, address_key, sale_or_rent): address, list_price, beds, sqft, lot, lat/lon, county, zip_code, photo, state (active/holding/sold/withdrawn), property_type, sale_or_rent, all 7 status flags (flag_price_reduced, flag_new_listing…), reduced_amount, listed_date, first_seen, scraped_at, days_on_market (NULL by design — no per-listing DOM from /search).
- DATA AVAILABLE, unpulled: `days_on_market` column exists but is NULL region-wide (see `lib/email/zip-events/types.ts:73`); DOM now derived in the `listing_dom` view instead.
- ROUTES (derived-view routes are attributed to their view; direct reads listed here):
  - Derived: `→ listing_active_homes → listing_active_stats` (active-listings-swfl brain, desk, landing, email); `→ listing_momentum_stats` (listing-momentum-swfl brain); `→ listing_price_bands` (desk); `→ listing_dom` (loadListingContext, buyer-leverage). Each has its own entry below.
  - Direct: `/desk` inventory-mix strip (`lib/desk/loaders.ts:381,441,502`); project property-watch subject auto-fill (`app/api/projects/[id]/watch/route.ts:59`); coming-soon deliverable county counts (`lib/deliverable/recipes/coming-soon.ts:289,309`); email zip-events (`lib/email/zip-events/state.ts:64,155` — address_key→zip join, since transitions carry no geo); rentcast listing loader (`lib/listings/rentcast.ts`); listed-date self-heal write (`lib/listings/listed-date-write.ts:30`).
- NOTES: Untyped-lake table (data_lake schema, typed client is public-only) — every reader carries a `KNOWN-DEBT(data_lake)` note and uses `.schema("data_lake")`. `agent-brand-intro.ts:21` documents `listing_state.brokerage` is 100% NULL (that's why the intro can't cite a brokerage). Rekeyed 07/16 for streetless rows (`docs/sql/20260716_listing_state_streetless_rekey.sql`).

### listing_transitions · cadence 1d · lane lake-view (BASE TABLE / log)
- STATUS: **live-via-non-brain-surface** (no brain reads it RAW; feeds views that feed brains, + direct page/email/desk reads). `coverage_exempt` (secondary pipeline table).
- ROOT: raw base — second table written by `listing_lifecycle` in the same run as listing_state (the transition LOG). Carries NO geography column (joined to listing_state via address_key,sale_or_rent for zip/county).
- DATA WE GET: One row per state transition: source_name, address_key, sale_or_rent, at, from_state, to_state, price_delta, sold_price, seed (baseline flag), scraped_at, days_off_market (added 07/17). Seed rows = the 25,616 SteadyAPI cutover baseline (seed=true), excluded from every activity view.
- DATA AVAILABLE, unpulled: none noted (it's our own derived log).
- ROUTES:
  - Derived: `→ listing_pulse_daily` (desk + charts); `→ listing_transitions_recent_zip_stats` (concoctions + email); `→ listing_dom` relists CTE (loadListingContext + buyer-leverage). Separate entries below.
  - Direct: `/desk` (`lib/desk/loaders.ts:489`); back-on-market report page (`lib/back-on-market/relist-fact.ts:98` → `app/r/back-on-market/page.tsx:15`); email zip-events counts (`lib/email/zip-events/state.ts:119,262`); project property-watch nearby-comp delta (`lib/project/watch-event.ts:24`, `lib/project/watch-delta.ts:80`); buyer-leverage cut-history (`lib/buyer-leverage/cut-history.ts:65` — **unwired, see listing_dom NOTE**).
- NOTES: `days_off_market` migration `migrations/20260717_listing_transitions_days_off_market.sql`; price/pending stats `docs/sql/20260702_listing_transitions_price_pending_stats.sql`; seed-baseline heal `migrations/20260701_listing_transitions_seed_baseline_heal.sql`.

### listing_active_homes · cadence 1d · lane lake-view
- STATUS: **live** (authority view; read by the median_asking writer + is the base of listing_active_stats which a brain reads)
- ROOT: raw base of `listing_active_stats` — the ONE authority for "active, for-sale, clean-priced HOME in core scope". View over `listing_state`. Def `docs/sql/20260712_listing_active_homes_authority.sql`.
- DATA WE GET: `SELECT *` from listing_state WHERE `source_name='api_feed' AND state='active' AND sale_or_rent='sale' AND list_price IS NOT NULL AND county IN ('Lee','Collier') AND property_type<>'land' AND list_price>=20000`. Extracted so the cleaning predicate has ONE root (kills the drift class that caused the ZIP-scope bug).
- DATA AVAILABLE, unpulled: n/a (it's a filter view).
- ROUTES:
  - `listing_active_homes → listing_active_stats → active-listings-swfl brain + desk + landing + email` (see listing_active_stats entry — this view is its FROM clause, `20260712...sql:40`).
  - `listing_active_homes → live_search median_asking writer → daily_truth` (registry `source_scope.confirmed_total`; lake-mode median). This is the SECOND consumer the authority view was extracted to serve.
- NOTES: Both consumers read this ONE view — the whole point of the 07/12 extraction (one shared concept, one authority, per the coherence rule). Hendry stays in the lake but drops from these rollups (county filter). No direct app/desk read — always reached through listing_active_stats or the median writer.

### listing_active_stats · cadence 1d · lane lake-view
- STATUS: **live** (read by active-listings-swfl brain + 4 direct non-brain surfaces)
- ROOT: rollup view over `listing_active_homes` (→ listing_state → listing_lifecycle). GROUPING SETS: region / county / ZIP. Def `docs/sql/20260712_listing_active_homes_authority.sql:31` (supersedes `20260711_*homes_only.sql`, `20260711_*core_counties.sql`, `20260630_*api.sql`, `20260627_*.sql`).
- DATA WE GET per grain: county, zip_code, listing_count, median_list_price (percentile_cont, per-grain — never median-of-medians), avg_days_on_market (NULL by design — no RentCast DOM anymore), avg_list_price, latest_scraped_at.
- DATA AVAILABLE, unpulled: n/a.
- ROUTES:
  - `listing_active_stats → active-listings-swfl brain` (`refinery/sources/active-listings-residential-source.mts:27` VIEW; `refinery/packs/active-listings-swfl.mts:24,54`) → master input + fgcu-reri brain (`refinery/packs/fgcu-reri.mts:182`) + conversation.
  - `→ /desk` (`lib/desk/loaders.ts:275`, reduceActiveStats — the ONE place a row is chosen; dedup + core-county guard).
  - `→ homepage map` Market-Activity layer (`lib/landing/load-home-map-data.ts:160`).
  - `→ insiders desk-stats` (`app/insiders/_lib/desk-stats.ts:83`).
  - `→ email market context` (`lib/email/market-context.ts:118`) + agent-brand-intro deliverable (`lib/deliverable/recipes/agent-brand-intro.ts:516,549`, via the one cited-figure root).
- NOTES: The brain source connector is misleadingly FILE-NAMED `active-listings-residential-source.mts` and its `SOURCE_ID="active_listings_residential"` — but `VIEW="listing_active_stats"`. The corpse's NAME lives on as a source_id string; the DATA is this spine. `core-scope.mts:69` notes the county-NAME grouping ISN'T a ZIP predicate (isCoreScope guard). Direct reads are NON-redundant with the brain wire.

### listing_momentum_stats · cadence 1d · lane lake-view
- STATUS: **live** (read by listing-momentum-swfl brain + desk + buyer-leverage)
- ROOT: view over `listing_state` (api_feed·active·sale·zip NOT NULL) — **roots to listing_lifecycle, NOT to the market_aggregates ingested tables**, even though it is DEFINED IN `docs/sql/20260630_market_aggregates_tables.sql:55`. Point-in-time flag SHARES, no metered calls.
- DATA WE GET per grain (GROUPING SETS region/county/ZIP): county, zip_code, active_listing_count, price_reduced_share (%, guarded — only when every row in grain has flag data), new_listing_share (%), latest_scraped_at.
- DATA AVAILABLE, unpulled: n/a (derived from our flags).
- ROUTES:
  - `listing_momentum_stats → listing-momentum-swfl brain` (`refinery/sources/listing-momentum-source.mts:26` VIEW) → master input + `should-i-sell` page (`lib/should-i-sell/load-market-snapshot.ts:87,123` reads the SERVED `listing_momentum_by_zip` table off the brain → `app/r/should-i-sell/page.tsx` + `[zip]/page.tsx`) + conversation.
  - `→ /desk` (`lib/desk/loaders.ts:298`; values are PERCENT e.g. 15.7).
  - `→ buyer-leverage zip-benchmark` (`lib/buyer-leverage/zip-benchmark.ts:33` — **unwired, see listing_dom NOTE**).
- NOTES: Filing trap for the canonical file — DEFINED in the market_aggregates SQL but its FROM is `listing_state`, so it must be filed under the listing_lifecycle root, not under market_aggregates. should-i-sell reaches it THROUGH the brain (served table), so no direct source→page wire there — the direct wire is desk + buyer-leverage.

### listing_pulse_daily · cadence 1d · lane lake-view
- STATUS: **live-via-non-brain-surface** (no brain; desk + charts gallery only)
- ROOT: view over `listing_transitions` (seed=false, not-rent). Daily transition pulse aggregated at source (~30 rows vs ~1.3k raw/day). Def `migrations/20260711_listing_pulse_daily.sql`.
- DATA WE GET per day: new_listings, price_cuts, price_increases, returned, departures, sold, withdrawn, total_events, latest_scraped_at.
- DATA AVAILABLE, unpulled: n/a.
- ROUTES:
  - `listing_pulse_daily → /desk` Daily Market Pulse panel (`lib/desk/loaders.ts:339`; typed at `lib/desk/types.ts:111`).
  - `listing_pulse_daily → charts gallery` (`lib/charts/gallery-loaders.ts:148`) → `app/api/charts/save-gallery/route.ts`, `app/api/concoctions/route.ts`.
- NOTES: Pure non-brain surface. If the canonical file wires "what the desk shows," this is a first-class node even though no PackDefinition touches it.

### listing_dom · cadence 1d (read-time computed) · lane lake-view
- STATUS: **live-via-non-brain-surface** (reached via loadListingContext deliverables) + **partially unwired** (buyer-leverage reader has no downstream)
- ROOT: view over `listing_state` (api_feed) LEFT JOIN `listing_transitions` (holding→relist anchor). Days COMPUTED at read time, never materialized (can't go stale). Def `docs/sql/20260717_listing_dom.sql` (07/17 build).
- DATA WE GET: passthrough listing_state cols + last_relist_at, spell_anchor, cdom_anchor, dom_is_floor (bool), dom_days (current spell, matches realtor.com counter), cdom_days (cumulative across relists).
- DATA AVAILABLE, unpulled: n/a (derived).
- ROUTES:
  - `listing_dom → loadListingContext` (`lib/listings/select.ts:341`) → coming-soon deliverable (`lib/deliverable/recipes/coming-soon.ts`), email build-doc (`lib/email/build-doc.ts`), social-calendar (`lib/social/social-calendar/build-week.ts`), listing-photo (`lib/media/listing-photo.ts`), social design author (`lib/social/design/author.ts`). ← LIVE surface.
  - `listing_dom → zip_active_dom_median(p_zip)` function (`docs/sql/20260718_zip_active_dom_median.sql`) → `lib/buyer-leverage/zip-benchmark.ts:17` — **UNWIRED** (see NOTE).
  - `listing_dom → buyer-leverage dom-read` (`lib/buyer-leverage/dom-read.ts:24`) — **UNWIRED** (see NOTE).
- NOTES: **buyer-leverage is a 07/18 build with NO downstream consumer** — grep found zero importers of `dom-read`/`zip-benchmark` outside `lib/buyer-leverage/` itself; the `2026-07-18-buyer-leverage-report` plan/design exist but no page or deliverable-recipe imports it yet. So the `zip_active_dom_median` RPC and the buyer-leverage `listing_dom`/`listing_transitions`/`listing_momentum_stats` reads are BUILT-BUT-UNWIRED. `listing_dom` itself IS live via loadListingContext. Open a check if not already tracked.

### active_listings_residential (+ _zip_stats) · cadence 1d · lane lake-view
- STATUS: **dead-corpse** (the view over the dead scraper table)
- ROOT: view over `data_lake.active_listings_residential` (the `active_listings` corpse table). Def `docs/sql/20260625_active_listings_residential_zip_stats.sql`.
- DATA WE GET (if anything read it): county, zip_code, listing_count, median_list_price, avg_days_on_market, avg_list_price, latest_scraped_at — GROUPING SETS region/county/ZIP, sale-only, per-county latest 20h batch.
- DATA AVAILABLE, unpulled: same detail-page ceiling as the `active_listings` source entry.
- ROUTES: **NONE.** Zero live `.from("active_listings_residential_zip_stats")`. Only comment `lib/landing/load-home-map-data.ts:13` ("scraper table is ABANDONED here"). The homepage map explicitly abandoned this view in favor of `listing_active_stats` + `market_details_swfl_latest`.
- NOTES: Corpse view over the corpse table. Delete alongside the `active_listings` pipeline. Its aggregation logic (per-county latest-batch, sale-only, GROUPING SETS) was the template later reused, cleanly, by `listing_active_stats` on the live spine.

---

## Extra derived nodes referenced in routes (not required entries, logged so none drop)
- `listing_price_bands` (view over listing_state, `docs/sql/20260711_listing_price_bands.sql`) → /desk price-band histogram. Filter mirrors listing_active_homes exactly so histogram total reconciles with the desk "Active listings" KPI.
- `listing_transitions_recent_zip_stats` (view over listing_transitions ⋈ listing_state, `docs/sql/20260701_listing_transitions_recent_zip_stats.sql`) → concoctions (`lib/concoctions/defs/zip-listing-activity.ts:38`) + email (`lib/email/market-context.ts:458`). 30d/90d windows in one pass.
- `listing_price_histogram_swfl_latest` / `market_details_swfl_latest` — the `_latest` read views (`docs/sql/20260630_market_aggregates_tables.sql:87,92`); the ingested history tables are never read directly by brains.
- `zip_active_dom_median(text)` — STABLE SQL function over listing_dom (`docs/sql/20260718_zip_active_dom_median.sql`); only caller is unwired buyer-leverage.

## Cross-cutting discrepancies for the canonical file
1. **CORPSE**: `active_listings` pipeline + `active_listings_residential(_zip_stats)` = fully dead, still cronning daily. Registry already flags SHIP-OR-DELETE (`active_listings_ship_or_delete`).
2. **Naming landmine**: `active-listings-swfl` brain's `SOURCE_ID="active_listings_residential"` + source file named `active-listings-residential-source.mts` — but it reads `listing_active_stats` (live spine), NOT the corpse. Anyone wiring by string will misfile.
3. **Root misattribution risk**: `listing_momentum_stats` is DEFINED in the market_aggregates SQL but ROOTS to listing_state. `live_search_daily_median_asking` is a listing_lifecycle derivative, not an external source.
4. **Stale pack empty-messages**: price-distribution-swfl + market-temperature-swfl still say "cron parked / not yet run live" while registry says graduated 07/01. Verify at DB level; don't propagate either as fact.
5. **Built-but-unwired**: the 07/18 buyer-leverage module (dom-read, zip-benchmark, `zip_active_dom_median` RPC) has no downstream consumer yet.


## === external-market ===

# Routes catalog — Batch 2: Real-estate EXTERNAL market feeds

Read-only route-tracing audit, 2026-07-18. Verified against `cadence_registry.yaml`,
`refinery/sources/*`, `refinery/packs/*`, `lib/desk/*`, `lib/charts/*`, `lib/email/*`,
and `docs/standards/data-roots.md`. All paths absolute-anchored to the repo root
`C:/Users/ethan/dev/brain-platform/`.

Canonical governance doc already exists and covers most of this batch:
`docs/standards/data-roots.md` (§"No brain reads it" lines 22-33; MONTHLY §lines 62-71).

Every leaf brain below is also served, in addition to the routes listed, at
`/api/b/<pack>` and over the MCP surface (`/api/mcp`) — that is the standard leaf
delivery path and is not re-listed per source. The chain of interest is source →
brain → master/chart/page/email.

---

### market_heat_swfl · cadence 30d · lane tier-1
- STATUS: **live**
- ROOT: realtor.com monthly market-state; the chosen external source for the (not-yet-built 🔴) `listing_dom_historical` root (list-side DOM history). data-roots.md:64.
- DATA WE GET: TWO ZIP-grain SWFL-filtered CSVs, monthly (registry :510). Core CSV: active_listing_count, median_days_on_market, pending_ratio, new_listing_count, price_reduced_share, median_listing_price, all +YoY; ceiling-fill 07/16 added average_listing_price, median_listing_price_per_square_foot, median_square_feet, pending_listing_count, price_increased_count, total_listing_count each +MoM+YoY. Hotness CSV: hotness_score, supply_score, demand_score, hotness_rank +MoM+YoY, hh_rank (Nielsen HH rank), median_dom_vs_us, page_view_count_per_property (MoM/YoY/vs-US). Two fixed-path parquets: `market_heat_core_swfl` + `market_heat_hotness_swfl`. Gate-4 MIN_ROWS=200.
- DATA AVAILABLE, unpulled (registry :513): same ZIP-grain CSVs — MoM deltas of the original vote-driver families (median_listing_price_mm, active_listing_count_mm, median_days_on_market_mm, new_listing_count_mm, price_reduced_share_mm, pending_ratio_mm), price_increased_share + price_reduced_count families, Hotness day-deltas (median_dom_mm_day/_yy_day) and median_listing_price dupes. (07/16 discrepancy resolved: the 07/08 note's "Hotness Rank Change/Prev/Within-CBSA/Within-County" columns do NOT exist in the ZIP History header.)
- ROUTES:
  - `refinery/sources/market-heat-core-source.mts:39` (reads s3 `market_heat_core_swfl.parquet`, SOURCE_ID `realtor_market_heat_core_swfl`) → pack `refinery/packs/market-heat-swfl.mts`
  - `refinery/sources/market-heat-hotness-source.mts:32` (reads s3 `market_heat_hotness_swfl.parquet`, SOURCE_ID `realtor_market_heat_hotness_swfl`) → same pack
  - `market-heat-swfl` brain → master input: `refinery/packs/master.mts:252` (+ edge :324)
  - No live chart/page panel. (`lib/charts/svg/z-gauge.test.ts:27` names `market-heat-swfl` as a chart source, but it is test-only — no gallery panel wires it.)
- NOTES: **DOM duplication hotspot.** This feed's `median_days_on_market` is one of the multiple DOM homes flagged this sweep. data-roots.md:65 RECONCILE: two realtor monthly feeds carry DOM/heat — `market_heat_swfl` (tier-1 → market-heat-swfl) and `market_aggregates_details` (tier-2 → market-temperature-swfl); one must be picked as market-state root, the other's DOM/heat columns collapse. Separately, `redfin_swfl.median_dom` (sold-side) and daily `listing_dom` (list-side, own inventory) are distinct-purpose DOM roots, not dupes of this one.

---

### redfin_swfl · cadence 30d · lane tier-1-duckdb
- STATUS: **live**
- ROOT: housing brain — **sold-side DOM** (`redfin_swfl.median_dom`, data-roots.md:66) + ZIP-grain sold price/market. Own root, distinct purpose.
- DATA WE GET (registry :295): 10,072 rows = 126 ZIPs × ~80 rolling-3-month windows since 2019; **ALL 50 source columns** pulled, values as-written. Fixed-path parquet `redfin_swfl.parquet`.
- DATA AVAILABLE, unpulled (registry :299): same bucket/prefix — `property_types/monthly/all_zips.csv` (1.42 GB, per-property-type ONLY, no all-residential rollup); the contract_cancellations + delistings_relistings + price_drops ZIP files (each has its OWN pipeline in this batch). Weekly feeds are metro-grain only — no weekly ZIP file exists; monthly is the finest ZIP cadence.
- ROUTES:
  - `refinery/sources/housing-source.mts:109` (reads s3 `redfin_swfl.parquet`, SOURCE_ID `redfin_swfl`, SQL :133) → pack `refinery/packs/housing-swfl.mts`
  - `housing-swfl` brain → master input: `refinery/packs/master.mts:243` (+ edge :297)
- NOTES: **RETARGETED 07/16/2026** (spec `docs/superpowers/specs/2026-07-17-redfin-datacenter-retarget-design.md`). The legacy dump (`redfin_market_tracker/zip_code_market_tracker.tsv000.gz`) FROZE at Last-Modified 06/02/2026 while serving stale 200s — two green crons re-landed identical bytes and the housing brain served a March window into mid-July. Now pulls `redfin_data_center/housing_market/monthly/all_zips.csv` (~660 MB) with in-pipeline guards: MIN_ROWS floor + newest-PERIOD-END content gate (40d) + ETag/Last-Modified recorded on the inventory row. `housing-source.mts:89` explicitly nulls `price_drops` — it moved to its own dataset (`redfin_price_drops`).

---

### redfin_price_drops · cadence 30d · lane tier-1-duckdb
- STATUS: **live**
- ROOT: seller-stress input (external monthly; one source, one purpose — data-roots.md:67). raw base of the `seller-stress-swfl` brain.
- DATA WE GET (registry :317): 9,955 rows / 126 ZIPs. Source `redfin_data_center/price_drops/monthly/all_zips.csv` (333 MB). Fixed-path parquet `redfin_price_drops.parquet`. Cron 15th 17:00 UTC. First run 2026-06-14.
- DATA AVAILABLE, unpulled: none noted in registry.
- ROUTES:
  - `refinery/sources/stress-price-drops-source.mts:30` (reads s3 `redfin_price_drops.parquet`, SOURCE_ID `redfin_price_drops_swfl`) → pack `refinery/packs/seller-stress-swfl.mts`
  - `seller-stress-swfl` brain → master input: `refinery/packs/master.mts:251` (+ edge :323)
- NOTES: one of THREE Redfin monthly ZIP files feeding the single `seller-stress-swfl` brain (see cancellations + delistings below). Was carved out of the redfin_swfl housing pull (housing-source.mts:89 comment).

---

### redfin_contract_cancellations · cadence 30d · lane tier-1-duckdb
- STATUS: **live**
- ROOT: seller-stress input (external monthly, one purpose — data-roots.md:67). raw base of `seller-stress-swfl`.
- DATA WE GET (registry :334): 9,955 rows / 126 ZIPs. Source `redfin_data_center/contract_cancellations/monthly/all_zips.csv` (278 MB). Fixed-path parquet `redfin_contract_cancellations.parquet`. Cron 15th 18:00 UTC. First run 2026-06-14.
- DATA AVAILABLE, unpulled: none noted.
- ROUTES:
  - `refinery/sources/stress-cancellations-source.mts:29` (reads s3 `redfin_contract_cancellations.parquet`, SOURCE_ID `redfin_contract_cancellations_swfl`) → pack `refinery/packs/seller-stress-swfl.mts`
  - `seller-stress-swfl` brain → master input: `refinery/packs/master.mts:251`
- NOTES: shares its consuming brain with redfin_price_drops + redfin_delistings_relistings — three sources, one brain, three distinct seller-stress signals.

---

### redfin_delistings_relistings · cadence 30d · lane tier-1-duckdb
- STATUS: **live**
- ROOT: seller-stress input (external monthly, one purpose — data-roots.md:67). raw base of `seller-stress-swfl`.
- DATA WE GET (registry :351): 9,955 rows / 126 ZIPs. Source `redfin_data_center/delistings_relistings/monthly/all_zips.csv` (328 MB). Fixed-path parquet `redfin_delistings_relistings.parquet`. Cron 15th 19:00 UTC. First run 2026-06-14.
- DATA AVAILABLE, unpulled: none noted.
- ROUTES:
  - `refinery/sources/stress-delistings-source.mts:30` (reads s3 `redfin_delistings_relistings.parquet`, SOURCE_ID `redfin_delistings_relistings_swfl`) → pack `refinery/packs/seller-stress-swfl.mts`
  - `seller-stress-swfl` brain → master input: `refinery/packs/master.mts:251`
- NOTES: third of the seller-stress trio.

---

### redfin_lee · cadence 31d · lane tier-2
- STATUS: **live** (TWO live routes: brain + email)
- ROOT: **sold price / market by county** → properties-value brain (data-roots.md:68). Table `data_lake.redfin_lee_market`.
- DATA WE GET (registry :882): 660 rows (5 property types × ~13yr monthly), Lee County FL slice of the Redfin Data Center county market tracker (free public TSV). Columns read downstream: median_sale_price, median_sale_price_yoy, homes_sold, months_of_supply, median_dom, period_end, property_type. dlt_schema_name `redfin_lee`; expected_rows_min 594.
- DATA AVAILABLE, unpulled: none noted (registry has confirmed_total only).
- ROUTES:
  - **Brain:** `refinery/sources/lee-market-source.mts:40` (reads `data_lake.redfin_lee_market`, SOURCE_ID `redfin_lee_market`) → pack `refinery/packs/properties-lee-value.mts` → master input `refinery/packs/master.mts:239` (+ edge :293)
  - **Email (non-brain):** `lib/email/market-context.ts:41` (`REDFIN_TABLE.lee = "redfin_lee_market"`) → `countyFigures()` :229-241 → `loadMarketFigures()` (exported) → consumed by `lib/deliverable/recipes/sphere-weekly.ts:114`, `lib/deliverable/recipes/review-reply.ts:41`, `lib/email/build-doc.ts:30`, `lib/brand/bio-tokens.ts:44`, `lib/listings/select.ts:12`, `lib/email/address-context.ts:11`. Emits county median sale price / YoY / homes-sold / months-of-supply figures cited "Redfin".
- NOTES: county-grain sold price. `median_dom` here is county sold-side DOM — yet another DOM surface, but county-grain and read only by the email path's figure set (not currently surfaced as a DOM figure). The email route bypasses the brain entirely and reads the raw `data_lake` table directly (KNOWN-DEBT comment `market-context.ts:14`).

---

### redfin_collier · cadence 31d · lane tier-2
- STATUS: **live** (TWO live routes: brain + email)
- ROOT: **sold price / market by county** → properties-value brain (data-roots.md:68). Table `data_lake.redfin_collier_market`.
- DATA WE GET (registry :866): 782 rows (5 property types × ~13yr monthly), Collier County FL slice of Redfin county market tracker (free TSV). Same column set as redfin_lee. dlt_schema_name `redfin_collier`; expected_rows_min 700.
- DATA AVAILABLE, unpulled: none noted.
- ROUTES:
  - **Brain:** `refinery/sources/collier-market-source.mts:34` (reads `data_lake.redfin_collier_market`, SOURCE_ID `redfin_collier_market`) → pack `refinery/packs/properties-collier-value.mts` → master input `refinery/packs/master.mts:240` (+ edge :294)
  - **Email (non-brain):** `lib/email/market-context.ts:42` (`REDFIN_TABLE.collier = "redfin_collier_market"`) → `countyFigures()` → `loadMarketFigures()` → same six deliverable/brand consumers as redfin_lee.
- NOTES: mirror of redfin_lee for Collier. Same dual brain+email routing; same direct-table-read debt in the email path.

---

### redfin_city_swfl · cadence 31d · lane tier-2
- STATUS: **live-via-non-brain-surface** (`consuming_pack: none`, but LIVE — data-roots.md:28)
- ROOT: IS a root of its own — monthly true-sold median at CITY grain (the SOLD anchor beneath the desk hero). Feeds no brain; feeds the desk page + charts directly.
- DATA WE GET (registry :904): monthly true-sold median sale price at city grain for EVERY Florida city in Redfin's free city tracker, full period_end history, all property types. Widened 07/12 from 3 desk cities to all FL cities. 389,986 rows / 896 FL regions verified 07/12. Columns read: area, period_end, median_sale_price, months_of_supply, property_type. Source: Redfin `city_market_tracker` (~1 GB gz).
- DATA AVAILABLE, unpulled (registry :906): national file also carries every non-FL city (no consumer) + per-property-type breakouts already landed. Within FL: no ceiling — whole-state city grain is ingested.
- ROUTES:
  - **Desk hero page:** `lib/desk/loaders.ts:174` `loadSoldSeries()` (reads `data_lake.redfin_city_swfl`, filter property_type="All Residential", desk cities, null-guarded + `selectAllPaged`) → aggregated in `loadDeskData()` (`loaders.ts:899`) → `app/desk/page.tsx:52` → rendered by `app/desk/_components/DeskHero.tsx` (grain note :92). Supplies the "sold" price series + months-of-supply gauge.
  - **Charts fallback lane:** `lib/charts/gallery-loaders.ts:203` `loadDeskPriceTrend()` — lane 2 of 3 (daily asking → **monthly sold (this table)** → ZHVI). Renders the desk price-trend panel when the daily asking lane is thin.
- NOTES: **DISCREPANCY — do not delete.** data-roots.md:68 has a stale parenthetical "(`redfin_city_swfl` = none → DEAD.)" that directly contradicts the operator correction at data-roots.md:24-28 (listed under "LIVE via a non-brain surface (keep)") and the verified code routes above. It is LIVE, not dead. This is the exact "consuming_pack:none ≠ dead" trap the task called out. It is the ONLY true city-grain sold median we hold (SteadyAPI/Redfin county grain can't serve it).

---

### fred_listing_swfl · cadence 30d · lane tier-1
- STATUS: **unwired** (ingested, nothing reads it live)
- ROOT: **UNWIRED candidate** for `listing_dom_historical` (data-roots.md:29) — holds Lee/Collier MSA monthly DOM + active + list-price + new-listings since 2016. No live consumer.
- DATA WE GET (registry :486): 8 Realtor.com FRED monthly series = 4 metrics (active_listing_count, median_days_on_market, median_list_price, new_listing_count) × 2 MSAs (Lee 15980, Collier 34940), monthly since Jul 2016. MSA grain only (no ZIP). Prefix parquet `lake-tier1/market/fred_listing_swfl/{YYYY-MM}.parquet`.
- DATA AVAILABLE, unpulled (registry :489): same FRED release (rid=462), same MSAs — Avg Listing Price, Median Listing Price per Sqft, Median Listing Sqft, Pending Listing Count (raw), Price Increase Count, Price Reduced Count (raw), Total Listing Count, plus every metric's M/M and Y/Y percent-change companion — all same-cost FRED calls.
- ROUTES:
  - **NONE live.** No `refinery/sources/*` reads it; `pipeline.py` pack_id=None; zero refinery references (confirmed via grep + audit `docs/audit/2026-07-11-pipeline-problems/08a-spine-identity.md:210`).
  - Only appearance downstream: `scripts/generate-seed-preview-charts.mts:239,262` — but these are **hardcoded snapshot values** (LEE_ASKING_VALUES / LEE_INVENTORY_VALUES, manually pulled 07/09/2026) with `fred_listing_swfl` named only in a provenance COMMENT. NOT a live read of the lake. So even the showcase seed-preview does not query this table at runtime.
- NOTES: (1) **BUG — wrong citation** (`fred_listing_swfl_wrong_source_url`): `ingest/pipelines/fred_listing_swfl/constants.py:21` SOURCE_URL = `fred.stlouisfed.org/categories/32287`, which live-resolves to a Singapore/International-Data category, NOT the real Realtor.com release `rid=462`. Wrong provenance persisted to every `_tier1_inventory` row. Correct URL confirmed `https://fred.stlouisfed.org/release?rid=462` (handoff `docs/handoff/2026-07-11-reliable-sources-findings.md:202-206`); the pipeline's SERIES_MAP already pulls the right 8 series — only the citation constant is wrong. (2) **DOM duplication:** its `median_days_on_market` (MSA grain, list-side) overlaps market_heat_swfl's list-side DOM and is one of the several DOM homes in this sweep — but at MSA grain it is coarser than market_heat's ZIP grain, so market_heat_swfl was chosen as the `listing_dom_historical` external source, leaving this one the labeled cross-check candidate (data-roots.md:64,29). (3) A prior spec floated retiring it (`docs/superpowers/specs/2026-06-25-market-heat-swfl-design.md:278`); operator direction in data-roots.md:29 is "wire, don't delete."

---

## Cross-batch reconciliation notes

- **DOM (days-on-market) lives in MANY places** across this batch alone: `market_heat_swfl.median_days_on_market` (ZIP, list-side, chosen root source), `fred_listing_swfl.median_days_on_market` (MSA, list-side, unwired cross-check), `redfin_swfl.median_dom` (ZIP, sold-side — own root, data-roots.md:66), `redfin_lee_market.median_dom` / `redfin_collier_market.median_dom` (county, sold-side, email-figure only). Plus the daily own-inventory `listing_dom` root (data-roots.md:43) outside this batch. Purpose differs by list-side vs sold-side and by grain — not all are dupes, but the two list-side monthly feeds (market_heat vs market_aggregates_details/market-temperature-swfl) are a genuine unreconciled duplicate flagged at data-roots.md:65.
- **Two Redfin county grains vs one city grain:** redfin_lee + redfin_collier (county, tier-2, → brains + email) and redfin_city_swfl (city, tier-2, → desk page only). Distinct grains, no overlap; redfin_swfl is the ZIP grain (tier-1 → housing brain). Three separate Redfin monthly footprints, cleanly separated by grain.
- **Email path reads raw lake tables, not roots:** `lib/email/market-context.ts` reads `redfin_lee_market`/`redfin_collier_market` directly (KNOWN-DEBT :14) rather than through a governed root or the properties-value brains — a second consumer of the same county sold data that the data-roots governance would eventually route through one root.


## === value-parcels ===

# Route catalog — Batch 3: home value / parcels / value indices

Read-only route-trace. Every chain verified against code (registry + pack + source + downstream file:line).
Scope: `leepa`, `collier_parcels`, `lee_parcels`, `parcel_subdivision`, `neighborhood_stats`,
`zhvi_swfl_duckdb`, `zhvi_swfl_tier2`, `fhfa`, `tier_divergence_swfl_duckdb`, `tier_divergence_swfl_tier2`.

---

## Cross-cutting facts (read once, applies to the whole batch)

### The four competing "value" definitions in THIS batch (they diverge 3–14×)
1. **Assessed / just value** (government tax roll, SUPPRESSED for taxation by the SOH cap):
   `leepa` (`just_value`/`taxable_value`/`cap_difference`), `collier_parcels` (`jv_hmstd`/`av_hmstd`),
   `lee_parcels` (FDOR just value by use-code), `parcel_subdivision` (`just_value_1`),
   `neighborhood_stats` (`median_just_value`). These are what the **SOH-gap** metrics are built from.
2. **Sold value** (recorded deeds / closed sales): the parcel sources also carry `sale_price_1`;
   surfaced as `leepa_sold_median_by_zip` / `collier_sold_median_by_zip` (homes-only recorded-deed medians),
   and the Redfin county trackers' `median_sale_price` (out of this batch, but the sibling source in the
   same packs). Built explicitly to correct the vacant-land "land-blend" that poisons active-listing asking medians.
3. **Index value** (repeat-sale / typical-value indices): `zhvi_*` (Zillow smoothed typical-value index,
   middle-tier 0.33–0.67), `fhfa` (FHFA repeat-sale HPI), `tier_divergence_*` (ZHVI top/bottom tier split).
4. (List/asking value lives in the active-listing sources — NOT this batch — but is the thing #2 corrects.)

**Where this batch's values overlap each other:**
- `fhfa` (repeat-sale index) and `zhvi_*` (typical-value index) are TWO INDEPENDENT price-level indices
  of the *same* market. FHFA is MSA-quarterly repeat-sale; ZHVI is ZIP-monthly typical-value. They feed
  *different* brains (FHFA → properties-lee/collier-value as an exogenous benchmark; ZHVI → home-values-swfl)
  and are never reconciled — deliberately complementary, not interchangeable.
- `leepa.just_value` vs `collier_parcels.jv_hmstd` vs `lee_parcels` (FDOR just value) vs
  `parcel_subdivision.just_value_1` vs `neighborhood_stats.median_just_value` are all "assessed value" off
  overlapping/identical FDOR sources at different grains. properties-lee-value's own caveat
  (`properties-lee-value.mts:858`) warns LeePA `total_parcels` ≠ FDOR `lee_parcels` total — "cross-check on
  scale, not reconciled to the parcel."

### The collier_parcels ⇄ parcel_subdivision redundant scrape — RESOLVED 07/19/2026
Both pipelines hit the SAME FDOR layer —
`services9.arcgis.com/.../Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0` — for overlapping
Collier parcels, landing overlapping fields into TWO tables. Resolved by retiring the
`parcel_subdivision` pipeline + table: its homes-only slice is now the VIEW
`data_lake.parcel_subdivision_v` over `lee_parcels` + `collier_parcels`
(migrations/20260719_parcel_subdivision_v.sql), verified row-for-row (604,362 = 604,362; the
`subdivision_name` stem matched 100%, with 476 Collier parcels folding to NULL where the fresher FDOR
vintage carries no `legal_description`). Check `collier_parcels_parcel_subdivision_redundant_scrape`
closes with this.

### The duckdb ↔ tier2 relationship = PROMOTION CHAIN (not a redundant double-pull) — VERIFIED
For both ZHVI and tier-divergence, the `_duckdb` (tier-1) entry writes a Parquet to
`s3://lake-tier1/market/*.parquet`; the `_tier2` entry does NOT re-fetch Zillow — it READS that Parquet and
merges it into Postgres. Verified directly on the ZHVI sibling: `ingest/pipelines/zhvi_swfl/resources.py:1-9`
("Reads the Parquet that ingest.duckdb_pipelines.zhvi_swfl wrote"), `:59-87` `read_tier1_parquet()`,
`:90-123` merges to `data_lake.zhvi_swfl`. The chart/brain views sit over the tier2 Postgres table
(`docs/sql/20260612_zhvi_pivoted_views.sql:2` "Two read-only views over data_lake.zhvi_swfl";
`:9` `zhvi_pivoted` = display view for /charts; `:11` `zhvi_zip_latest` = brain-input view).
So: **duckdb parquet = raw base → tier2 Postgres = promotion → views = brain + chart surfaces.**

### as_of freshness spread (task asked for stale scan)
- Fresh (parcels cluster, this week): `collier_parcels` 07/18/2026 (widened + re-ingested today),
  `parcel_subdivision` 07/14/2026, `neighborhood_stats` first real run 07/14/2026, `lee_parcels` in flight 07/18/2026.
- Older (verified in the May DB sweep): `leepa` MAX(inserted_at)=2026-05-18 / confirmed 2026-05-31,
  `fhfa` MAX(inserted_at)=2026-05-18 / confirmed 2026-05-31.
- Index sources: `zhvi_*` / `tier_divergence_*` duckdb source_scope has NO confirmed_total value
  (ceiling notes dated 07/07–07/08); tier2 promotions are nascent (`zhvi_swfl_tier2` floor=1;
  `tier_divergence_swfl_tier2` probe-anchored 2026-06-14, floor 107).

---

### zhvi_swfl_duckdb · cadence 30d · lane tier-1-duckdb
- **STATUS:** live
- **ROOT:** IS the raw base of the ZHVI chain — writes `s3://lake-tier1/market/zhvi_swfl.parquet`
  (`inventory_id: lake-tier1/market/zhvi_swfl.parquet`, exact). Everything ZHVI descends from this.
- **DATA WE GET:** ZHVI ZIP-level all-homes middle-tier (0.33–0.67), smoothed + seasonally-adjusted, monthly.
  Columns pulled: `zip_code, period_end, home_value, metro, county_name, city, ingested_at`
  (`ingest/pipelines/zhvi_swfl/resources.py:73-84`). Live coverage 109 SWFL ZIPs / 316 months
  (`20260612_zhvi_pivoted_views.sql:25`).
- **DATA AVAILABLE, unpulled:** Zillow also publishes ZHVI cut by bedroom count and SF-vs-condo, a raw
  (non-SA) variant, and ZHVF (Home Value Forecast, 1yr-ahead) — same ZIP grain, free, not pulled
  (registry source_ceiling, `zillow.com/research/data/`).
- **ROUTES:** ingest writer `ingest/duckdb_pipelines/zhvi_swfl/pipeline.py` (Parquet)
  → promoted by `ingest/pipelines/zhvi_swfl/resources.py:59-123` into `data_lake.zhvi_swfl` (see zhvi_swfl_tier2).
  The duckdb parquet itself is NOT read by any brain/page directly — its ONLY consumer is the tier2 promotion.
  Workflow `zhvi-tier1-monthly.yml` (day 22).
- **NOTES:** cadence_registry lists `consuming_pack: home-values-swfl` on this entry, but the pack does NOT
  read the parquet — it reads the tier2 view. The "consuming_pack" here means the eventual downstream brain,
  not a direct reader. `home_value` is Zillow's *index*, not a transaction median (see mislabel note under zhvi_swfl_tier2).

### zhvi_swfl_tier2 · cadence 30d · lane tier-2
- **STATUS:** live (nascent — registry floor still 1, `expected_rows_min: 1`)
- **ROOT:** promotion of `zhvi_swfl_duckdb`. Postgres table `data_lake.zhvi_swfl` is the canonical root the
  ZHVI brain + charts read. `liveness_view: data_lake.zhvi_zip_latest`, `dlt_schema_name: zhvi_swfl`.
- **DATA WE GET:** same fields as the parquet, merged idempotently (PK `zip_code, period_end`,
  `write_disposition=merge`, `resources.py:90-94`).
- **DATA AVAILABLE, unpulled:** same vendor ceiling as duckdb (bedroom-cut, SF-vs-condo, raw non-SA, ZHVF).
- **ROUTES (real chain):**
  - Views over `data_lake.zhvi_swfl` (`docs/sql/20260612_zhvi_pivoted_views.sql`):
    - `data_lake.zhvi_zip_latest` (1 row/ZIP, brain-input) — read by `refinery/sources/zhvi-zip-latest-source.mts:20`
      → brain `refinery/packs/home-values-swfl.mts` (outputProducer `:209`; detail_table `home_values_by_zip` `:400`).
    - `data_lake.zhvi_pivoted` (wide, 1 row/month, /charts display).
    - `data_lake.zhvi_zip_yoy_monthly` → `lib/charts/zip-heatmap-series.ts:70` (ZIP heatmap).
  - **Brain → master (INDIRECT ONLY):** home-values-swfl is NOT in master's input_brains. It reaches master
    solely through the investor composite: `refinery/packs/investor-zip-swfl.mts:168,257` joins
    `home_values_by_zip → home_value_zhvi` by ZIP; investor-zip-swfl IS in master
    (`refinery/packs/master.mts:262` source, `:344` input edge).
  - **Brain → chat (direct):** catalogued at `refinery/packs/catalog.mts:39` (independently askable).
  - **Brain → zip-report:** `REGISTRY_PACK_IDS` `lib/zip-report/assemble.ts:30`; rail-citation candidate
    `lib/zip-report/candidates.ts:220-221` (`home-values-swfl:home_values_by_zip`); also `lib/zip-dossier.ts:89`
    (grains zip+region, METRO_4).
  - **Chart pages (read the LAKE VIEW, bypass the brain):** `/charts` + `/embed/charts` "Median Home Value"
    area panel `lib/charts/gallery-loaders.ts:248` (`loadMetros(db,"zhvi_pivoted")`, rootId `home-values`) and
    "Home Value Year-Over-Year Growth" panel `:275`; `lib/charts/load-metro-trend.ts:21`; housing brain page
    `app/r/housing-swfl/page.tsx:140` (`loadMetroTrend("zhvi_pivoted")`, rootId `housing-zhvi` `:201`).
- **NOTES — ZHVI "median" MISLABEL (live in the UI):** the /charts panel is TITLED **"Median Home Value"**
  (`gallery-loaders.ts:243`) but its source is ZHVI, Zillow's *smoothed typical-value INDEX*
  (middle-tier 0.33–0.67), not a median of transactions. The brain carries the same conflation:
  `home-values-swfl.mts` emits `home_value_zhvi_regional_median` labelled "SWFL regional median ZHVI home value"
  (`:259-262`) and a detail column "Home value (USD)" (`:409`). Defensible as "median-across-ZIPs of an index
  value," but reads to a layperson as a sale-price median. The pack's *citation* text is correct
  ("Zillow Home Value Index (ZHVI) … middle-tier … seasonally-adjusted", `:193`); the metric LABEL + chart TITLE are the leak.

### tier_divergence_swfl_duckdb · cadence 30d · lane tier-1-duckdb
- **STATUS:** live
- **ROOT:** IS the raw base of the tier-divergence chain — `lake-tier1/market/tier_divergence_swfl.parquet` (exact).
  FULL OUTER JOIN of Zillow ZHVI top-tier (0.67–1.0 luxury) vs bottom-tier (0.0–0.33 starter), RAW (not SA), per zip×month.
- **DATA WE GET:** ZHVI tier split, ZIP grain, raw. (registry confirmed_total: summary only, no value.)
- **DATA AVAILABLE, unpulled:** vendor CEILING, not a gap — Zillow's inventory/DOM/price-cut/new-construction/
  sales/affordability categories are metro-or-national grain only; no ZIP tier cut exists beyond what we pull.
- **ROUTES:** `ingest/duckdb_pipelines/tier_divergence_swfl/pipeline.py` (Parquet) → promoted into
  `data_lake.tier_divergence_swfl` (see tier_divergence_swfl_tier2). Parquet not read directly by any brain/page.
  Workflow `tier-divergence-tier1-monthly.yml` (day 21).
- **NOTES:** registry `consuming_pack: tier-divergence-swfl` = eventual brain, not a direct parquet reader.

### tier_divergence_swfl_tier2 · cadence 30d · lane tier-2
- **STATUS:** live-via-non-master surfaces — the DATA is live (charts + zip-report), but the tier-divergence
  BRAIN's directional vote NEVER reaches master, and it is NOT in the answer-engine catalog. See notes.
- **ROOT:** promotion of `tier_divergence_swfl_duckdb`. Postgres `data_lake.tier_divergence_swfl` is the canonical root.
  `liveness_view: data_lake.tier_divergence_zip_latest`, `dlt_schema_name: tier_divergence_swfl`.
  (Promotion mechanism: registry declares it "the Postgres promotion pipeline"; verified identical sibling
  pattern to zhvi_swfl_tier2 `resources.py`.)
- **DATA WE GET:** ZHVI tier split (top 0.67–1.0 vs bottom 0.0–0.33), ZIP grain, raw. Probe-anchored ≥107
  both-tier SWFL ZIPs at latest month (2026-06-14); table holds full zip×month history.
- **DATA AVAILABLE, unpulled:** same vendor ceiling as duckdb (no finer Zillow ZIP cut exists).
- **ROUTES (real chain):**
  - Views over `data_lake.tier_divergence_swfl`:
    - `data_lake.tier_divergence_zip_latest` (brain-input) → `refinery/sources/tier-divergence-zip-latest-source.mts`
      → brain `refinery/packs/tier-divergence-swfl.mts` (outputProducer `:249`; detail_table `tier_divergence_by_zip` `:467`).
    - `data_lake.tier_divergence_pivoted` (chart) → `lib/charts/tier-divergence-series.ts` (`mapTierIndexed`)
      → `/charts` "tier-gap" panel "Luxury vs. Starter Home Price Index"
      (`lib/charts/gallery-loaders.ts:91,106,278-284`).
  - **Brain → zip-report (its ONLY brain-output consumer):** `REGISTRY_PACK_IDS` `lib/zip-report/assemble.ts:37`;
    rail-citation candidate `lib/zip-report/candidates.ts:313-314` (`tier-divergence-swfl:tier_divergence_by_zip`).
- **NOTES — the tier-divergence BRAIN is under-wired:**
  - NOT in master input_brains (`refinery/packs/master.mts` — absent; contrast the value brains at `:239-240,265`).
    Its bullish/bearish K-shape vote never enters synthesis.
  - NOT in the answer-engine catalog — `refinery/packs/catalog.test.mts:25` pins it in `KNOWN_INCOMPLETE`;
    it's absent from `catalog.mts`. So it is NOT directly askable in chat.
  - Its most prominent surface, the /charts "tier-gap" panel, reads the LAKE VIEW `tier_divergence_pivoted`
    directly and BYPASSES the brain entirely. The chart subtitle even states the regional read is flat
    ("the two tiers have risen in near-lockstep … the K-shaped split shows up ZIP by ZIP, not in the median",
    `gallery-loaders.ts:281-282`) — i.e. the headline the brain computes is deliberately not shown at region grain.
  - Net: the brain is genuinely reachable ONLY through zip-report rail citations; master + chat + the flagship
    chart all get tier-divergence WITHOUT the brain. Closest thing to an orphan in this batch.

### leepa · cadence 365d · lane tier-2
- **STATUS:** live
- **ROOT:** IS a root — `data_lake.leepa_parcels` (count_table). Lee County Property Appraiser feed
  (distinct from FDOR). `dlt_schema_name: leepa_parcels_tier2` (runtime-randomized pipeline name; freshness
  keyed on count_table, not the phantom schema).
- **DATA WE GET:** 548,798 parcels (as_of 2026-05-31; MAX inserted_at 2026-05-18). LeePA ParcelInfo/MapServer
  layers 0, 9, 10, 12 joined on FOLIOID — the Just Value bundle (`just_value`, `taxable_value`, `cap_difference`,
  `last_sale_date`, `use_code`). Pre-aggregated in Postgres views `leepa_parcels_summary`,
  `leepa_parcels_sales_yearly`, `leepa_sold_median_by_zip`.
- **DATA AVAILABLE, unpulled:** 24 layers total on the MapServer (not ~4). We pull 0/9/10/12; layers 1–8 are
  cartographic label dupes (not a gap); layers 19–23 (Non-CT Sales, Land Type, Delinquent Tax Advertising,
  Cert of Title Sales, Comparable Sales) are genuinely unexamined — field schemas UNCONFIRMED (07/08/2026
  live-query timeouts). Source: `gissvr.leepa.org/.../ParcelInfo/MapServer`.
- **ROUTES:** ingest `ingest/pipelines/leepa/pipeline.py` → `data_lake.leepa_parcels` (+ views)
  → source `refinery/sources/leepa-value-source.mts` (summary + sales-yearly) + `leepa-sold-median-source.mts`
  (`leepa_sold_median_by_zip`)
  → brain `refinery/packs/properties-lee-value.mts` (metrics `total_parcels` `:572`, `sales_velocity_zscore` `:544`,
  `soh_gap_median_pct` `:560`, `lee_sold_median_homes_only` `:753`; detail_table `lee_sold_median_by_zip` `:765`)
  → master input_brains (`refinery/packs/master.mts:239` source, `:293` input edge)
  → chat catalog (`refinery/packs/catalog.mts:151`).
- **NOTES:** LeePA `just_value`/`taxable_value` is the assessed-value lane; its SOH gap = (just−taxable)/just.
  The pack ALSO carries a FDOR cross-check (`lee_parcels`) and warns the two parcel counts won't reconcile
  (`:858`). Sold-median (recorded deeds, homes-only) is the sold-value lane in the same pack — 3 value
  definitions coexist inside properties-lee-value (assessed via LeePA, sold via recorded deeds, index via FHFA).

### collier_parcels · cadence 365d · lane tier-2
- **STATUS:** live (freshly widened + re-ingested 07/18/2026)
- **ROOT:** IS a root — `data_lake.collier_parcels` (count_table). FDOR Statewide Cadastral / Parcel Centroid
  ArcGIS FeatureServer, CO_NO=21. `dlt_schema_name: collier_parcels`.
- **DATA WE GET:** 290,973 unique PARCEL_IDs (as_of 07/18/2026), **102 of 120 fields** (widened from 15 the same
  day). All parcel types (no DOR_UC filter). Landed 104 columns, 78 distinct DOR use codes; SOH fields
  `jv_hmstd`/`av_hmstd`/`av_sd`/etc., `sale_price_1`, new-construction value, special-features value, census block group.
  Pre-aggregated views: `collier_parcels_summary`, `collier_parcels_zip_summary`, `collier_sold_median_by_zip`.
- **DATA AVAILABLE, unpulled:** 120 fields total; the 18-field gap is DELIBERATE — 14 owner/fiduciary PII fields
  (`OWN_*`/`FIDU_*`) + 4 ArcGIS row artifacts (`OBJECTID`/`OID_`/`ORIG_FID`/`PARCELNO`). Source:
  `services9.arcgis.com/.../Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0`.
- **ROUTES:** ingest `ingest/pipelines/collier_parcels/pipeline.py` → `data_lake.collier_parcels` (+ views)
  → source `refinery/sources/collier-parcels-source.mts:29` (reads `collier_parcels_summary` `:104` +
  `collier_parcels_zip_summary` `:141`) + `collier-sold-median-source.mts`
  → brain `refinery/packs/properties-collier-value.mts` (metrics `collier_total_parcels` `:459`,
  `collier_soh_gap_median_pct` `:448`, `collier_sold_median_homes_only` `:515`; detail_tables
  `collier_parcels_by_zip` `:530`, `collier_sold_median_by_zip` `:571`)
  → master input_brains (`master.mts:240` source, `:294` input edge)
  → chat catalog (`catalog.mts:161`) → zip-report (`assemble.ts:39`).
- **NOTES:** THE redundant-scrape source — hits the identical FDOR FeatureServer/0 layer that `parcel_subdivision`
  also scrapes, for overlapping Collier parcels (check `collier_parcels_parcel_subdivision_redundant_scrape`,
  registry `:931`). SOH gap here = median (`jv_hmstd`−`av_hmstd`)/`jv_hmstd` — the textbook homestead-portion
  measure, NOT numerically identical to Lee's whole-parcel just-vs-taxable proxy (pack caveat `:642`).

### lee_parcels · cadence null (dispatch-only) · lane tier-2
- **STATUS:** live-just-landing / UNCONFIRMED — first run in flight 07/18/2026 (TODAY);
  `confirmed_total: null`, `expected_rows_min: null`. `data_lake.lee_parcels` may still be empty right now,
  in which case the `fdor_commercial_parcel_count` metric in properties-lee-value is SUPPRESSED (emitted only
  when the FDOR summary fragment is present, `properties-lee-value.mts:586-613`).
- **ROOT:** IS a root — `data_lake.lee_parcels` (count_table). FDOR Statewide Cadastral, CO_NO=46
  (Lee sibling of collier_parcels). `dlt_schema_name: lee_parcels`. Dispatch-only (556k-parcel annual pull,
  `lee-parcels-annual.yml`, no cron by design).
- **DATA WE GET:** server-reported 556,100 raw features (07/18); unique-parcel count TBD. Same 102-of-120-field
  scope as collier_parcels. All parcel types (no DOR_UC filter).
- **DATA AVAILABLE, unpulled:** same 18 excluded fields as collier (14 PII + 4 ArcGIS artifacts), same
  FeatureServer/0 source.
- **ROUTES:** ingest `ingest/pipelines/lee_parcels/pipeline.py` → `data_lake.lee_parcels` (+ view
  `lee_parcels_summary`) → source `refinery/sources/lee-parcels-source.mts` → brain
  `refinery/packs/properties-lee-value.mts` (metric `fdor_commercial_parcel_count` `:603`, use-code categorized
  per FDOR 2025 NAL guide) → master (via properties-lee-value `:239/:293`) → chat catalog (`catalog.mts:151`).
- **NOTES:** a FDOR CROSS-CHECK for Lee, NOT LeePA's replacement — Lee's primary parcel/value signal still
  sources from the LeePA appraiser feed (`leepa`). New table built 07/18/2026 (Lee never had a comprehensive
  FDOR-sourced parcel table before). Its `just value` is a 3rd "assessed value" definition for Lee alongside
  LeePA and neighborhood_stats.

### parcel_subdivision_v · VIEW (retired the parcel_subdivision table 07/19/2026)
- **STATUS:** live (view; no pipeline, no cron — refreshes with `lee_parcels`/`collier_parcels`)
- **ROOT:** IS a root — `data_lake.parcel_subdivision_v`
  (migrations/20260719_parcel_subdivision_v.sql): the homes-only (`dor_uc IN
  ('001','002','004','005','007','008')`) two-county slice of `lee_parcels` + `collier_parcels`,
  exposing the retired table's exact 26 data columns; `subdivision_name` derived in-view from
  `legal_description` via the validated `\y` stem.
- **RETIREMENT EVIDENCE (07/19/2026):** full join old-vs-view on (parcel_id, county): 604,362 = 604,362,
  zero unmatched either side; `zip`/`property_type`/`just_value` 0 diffs; `subdivision_name` identical
  except 476 Collier parcels (0.08%) that fold to NULL because the fresher FDOR vintage carries no
  `legal_description` for them. Old table + `ingest/pipelines/parcel_subdivision/` +
  `parcel-subdivision-annual.yml` all retired.
- **ROUTES:** NOT read by any brain directly; consumers = the neighborhood_stats aggregation
  (`ingest/duckdb_pipelines/neighborhood_stats/pipeline.py` via psycopg), the address→community
  resolver (`lib/listings/community-lookup.ts`), and the `/r/source/parcel_subdivision_v` provenance
  page (`app/r/source/_tables.ts`). Chain to product: parcel_subdivision_v → neighborhood_stats →
  communities-swfl brain → master (`master.mts:265/:361`) + chat catalog + community drill pages.
- **NOTES:** neighborhood/address resolution backbone. Field-underuse case CLOSED — the view sits on
  the 104-col wide tables, so every FDOR field is one SELECT away.

### neighborhood_stats · cadence 365d · lane tier-2 (non-dlt)
- **STATUS:** live (nascent — first real run 07/14/2026, `expected_rows_min: 1`, no stable baseline yet)
- **ROOT:** IS a derived root — `data_lake.neighborhood_stats` (count_table). NOT a dlt pipeline (no
  `dlt_schema_name`). First DuckDB↔Postgres bridge in the repo: reads `data_lake.parcel_subdivision_v`
  (repointed 07/19/2026) via psycopg, aggregates in an in-memory DuckDB `GROUP BY`, full-replaces the
  table. Scheduled day 24, after `collier-parcels-annual` day 20 (`neighborhood-stats-annual.yml`);
  re-dispatch after any manual `lee_parcels` refresh.
- **DATA WE GET:** one row per (county, subdivision_name): `home_count`, count-by-type, `median_just_value`
  (per `ingest/duckdb_pipelines/neighborhood_stats/agg.py`).
- **DATA AVAILABLE, unpulled:** ceiling = whatever more of the wide tables' fields could be rolled up
  through the view (living area, sale price already exposed by `parcel_subdivision_v` but not
  aggregated here yet; `median_year_built` added 07/1x).
- **ROUTES (TWO consumers — brain AND direct page reads):**
  - Brain: `refinery/sources/communities-swfl-source.mts:43` (`NEIGHBORHOOD_TABLE = neighborhood_stats`,
    read at `:145`) → brain `refinery/packs/communities-swfl.mts` (metric `total_homes_catalogued_swfl` `:111`)
    → master input_brains (`master.mts:265` source, `:361` input edge) → chat catalog (`catalog.mts:132`).
  - Direct page read (bypasses the brain): `app/r/communities-swfl/communities.ts:145`
    (`db.schema("data_lake").from("neighborhood_stats")`) → neighborhood drill page
    `app/r/communities-swfl/n/[neighborhood]/page.tsx`. Community drill page
    `app/r/communities-swfl/[community]/page.tsx:38` also reads the brain md `communities-swfl.md`.
- **NOTES:** communities-swfl is a NEUTRAL reporter (direction "neutral", magnitude 0, `communities-swfl.mts:298-299`)
  — it cannot skew master's market vote; it rides as cited, route-able context only. `median_just_value` is the
  5th "assessed value" definition in the batch.

### fhfa · cadence 90d · lane tier-2
- **STATUS:** live
- **ROOT:** IS a root — `data_lake.fhfa_hpi` (`dlt_schema_name: fhfa_hpi`; pipeline_name matches).
  FHFA House Price Index, purchase-only/traditional, MSA-quarterly.
- **DATA WE GET:** 133,226 rows (as_of 2026-05-31; MAX inserted_at 2026-05-18), MSA-quarterly grain.
  Surfaced as `HpiSwflSummary` with `cape_coral_msa` (Lee), `naples_msa` (Collier), `fl_state`.
- **DATA AVAILABLE, unpulled:** FHFA also publishes COUNTY- and ZIP-level annual HPI variants — current
  MSA-quarterly grain is a choice, not a vendor ceiling (revisitable). Source `fhfa.gov/data/hpi`.
- **ROUTES:** ingest `ingest/pipelines/fhfa_hpi/pipeline.py` → `data_lake.fhfa_hpi`
  → source `refinery/sources/fhfa-hpi-source.mts` (`HpiSwflSummary`)
  → **two brains** (registry `consuming_pack: [properties-collier-value, properties-lee-value]`):
    - `refinery/packs/properties-lee-value.mts` — `fhfa_cape_coral_msa_yoy_pct` `:624`, `fhfa_fl_state_yoy_pct` `:642`
      (also exogenous_signals `:838-850`).
    - `refinery/packs/properties-collier-value.mts` — `fhfa_naples_msa_yoy_pct` `:479`.
  → both brains → master (`master.mts:239-240/:293-294`) + chat catalog (`catalog.mts:151,161`)
  → Lee side also reaches zip-report via properties-collier-value list membership (Collier only, `assemble.ts:39`).
- **NOTES:** the INDEX-value lane; overlaps ZHVI (both are home-price indices of the same market — FHFA
  repeat-sale MSA-quarterly vs ZHVI typical-value ZIP-monthly) but they feed different brains and are never
  reconciled. In-pack the FHFA metric cites the vendor JSON directly (`fhfa.gov/hpi/download/monthly/hpi_master.json`,
  tier:1) even though data is served from `data_lake.fhfa_hpi` — provenance points at source, not the lake table.

---

## Unwired / corpse / under-wired findings (summary)
- **tier_divergence_swfl_tier2 / tier-divergence-swfl BRAIN — UNDER-WIRED (closest to orphan).** The brain
  is NOT in master input_brains and NOT in the answer-engine catalog (`catalog.test.mts:25` KNOWN_INCOMPLETE).
  Its only brain-output consumer is zip-report rail citations (`candidates.ts:313-314`). Master, chat, and the
  flagship `/charts` "tier-gap" panel all get tier-divergence data WITHOUT the brain — the chart reads
  `data_lake.tier_divergence_pivoted` directly and even states the regional signal is flat.
- **home-values-swfl BRAIN reaches master only INDIRECTLY** via investor-zip-swfl (not a direct master input).
  Not a defect, but a non-obvious routing dependency: if investor-zip-swfl drops the value join, ZHVI silently
  stops informing master.
- **lee_parcels — UNCONFIRMED/just-landing (07/18, today).** `confirmed_total: null`; `data_lake.lee_parcels`
  may be empty, in which case properties-lee-value's `fdor_commercial_parcel_count` metric is currently suppressed.
- No dead corpses in this batch. No fully-unwired data table (every source has at least one live downstream).
- Redundant scrape (collier_parcels ⇄ parcel_subdivision, same FDOR FeatureServer/0) is REAL and OPEN,
  tracked as check `collier_parcels_parcel_subdivision_redundant_scrape`.
- ZHVI "median" mislabel is LIVE in the UI ("Median Home Value" chart title over an index) and in the brain
  metric label — `gallery-loaders.ts:243` + `home-values-swfl.mts:259-262`.


## === rentals-investor ===

# Route catalog — Batch 4: rentals / rent index / investor / STR

READ-ONLY route-tracing audit. Every route below verified against code (registry entry + source + pack + downstream grep), not memory.

Batch: `rentals_swfl`, `zori_swfl_duckdb`, `zori_swfl_tier2`, `airdna_str_swfl`, `land_manufactured_swfl`, `swfl_search_demand`.

Cross-cutting note — **THREE different rent numbers coexist per ZIP** and disagree (up to ~7x), by design. Each of the three sources serves a DISTINCT purpose:
- **Monthly ZORI rent INDEX** (`zori_*` → `rentals-swfl`, `rent_index_latest`): macro trend / direction (YoY, MoM). A smoothed repeat-rent index, ~$2,000/mo regional median.
- **Own weekly sweep** (`rentals_swfl` → `active-rentals-swfl`): live for-rent INVENTORY — a COUNT plus the observed asking-price MIN/MAX (e.g. $485–$17,000/mo). Deliberately NOT a median (never blends the per-listing min/max into a synthetic point).
- **Listing median** (`market-temperature-swfl`, `median_rent_price`, realtor.com monthly — NOT in this batch): the source-faithful per-ZIP median rent. This is the third leg the other two point users toward.
The pairing is codified in `lib/zip-report/candidates.ts:232-270` (ZORI = "macro trend", median asking = "micro snapshot", inventory = separate concept). The disagreement is expected: an index basket, a live-inventory range, and a listing median are three different measures — no source in this batch is the "true rent".

---

### rentals_swfl · cadence 7d · lane tier-2
- **STATUS:** live (brain built + served; freshness at risk — SteadyAPI subscription 403'd "suspended" 07/07/2026 per `docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md:117`; a suspended sub returns a green run with missing data).
- **ROOT:** IS a root — SteadyAPI `/rentals-search` (realtor.com origin; access layer never surfaced). Raw base of the `active-rentals-swfl` brain.
- **DATA WE GET:** Lee + Collier only, 7,185 rows after PK dedupe (as_of 2026-07-02). Per-listing: property_id, county, zip_code, city, address_line, property_type, price_min/max, beds_min/max, baths_min/max, sqft_min/max, captured_date (`docs/sql/20260701_rentals_swfl_table.sql:14-33`). Brain surfaces only COUNT + observed price MIN/MAX per grain (region/county/ZIP GROUPING SETS via `data_lake.rental_listing_stats`).
- **DATA AVAILABLE, unpulled:** Hendry County — gets residential for-sale listings via `listing_lifecycle` but zero rental coverage; same `/rentals-search` endpoint could cover it (registry source_ceiling, 07/07/2026).
- **ROUTES (source → brain → surface):**
  - Pipeline: `ingest/pipelines/rentals/pipeline.py` → writes `data_lake.rental_listings_swfl`. Cron `.github/workflows/ingest-rentals.yml:15` (Mondays 12:00 UTC, weekly).
  - SQL views: `docs/sql/20260701_rentals_swfl_table.sql:35` (`rental_listings_swfl_latest`) → `:43` (`rental_listing_stats`).
  - Source connector: `refinery/sources/active-rentals-source.mts:64-75` (reads `data_lake.rental_listing_stats`).
  - Brain pack: `refinery/packs/active-rentals-swfl.mts` → served `brains/active-rentals-swfl.md` (via generic `/r/active-rentals-swfl` + `/api/b/active-rentals-swfl`).
  - Master rollup: input_brain `refinery/packs/master.mts:264` (source) + `:352` (input edge).
  - Chart: `lib/zip-report/candidates.ts:260-270` (concept `rental_inventory` → `rental_listing_count`, "Active Rental Listings" bar). Routing: `lib/route-chart.ts` (rent/rental keywords).
  - Highlighter/reach: `lib/highlighter/reach.ts:124` (`active-rentals-swfl` ranked ABOVE `rentals-swfl` — inventory phrasing outranks the index).
  - ZIP report pool: `lib/zip-report/assemble.ts:32`. ZIP dossier coverage: `lib/zip-dossier.ts:143` (grains zip/county/region, LEE_COLLIER).
  - Speaker label: `refinery/render/speaker.mts:108` ("SWFL active rentals").
- **NOTES:**
  - Three-rent drift: this source is the **weekly inventory** leg — count + observed range, never a median. Points to `market-temperature-swfl` for the source-faithful median and to `rentals-swfl` for the ZORI trend (pack caveats `active-rentals-swfl.mts:164-181`).
  - **Active-rentals latest-view Collier-only completeness bug (CONFIRMED mechanism):** `rental_listings_swfl_latest` filters on a SINGLE GLOBAL `WHERE captured_date = (SELECT max(captured_date) FROM data_lake.rental_listings_swfl)` (`20260701_rentals_swfl_table.sql:35-38`). Because the weekly sweep writes Lee and Collier rows with their own `captured_date`, any run where the two counties don't land the IDENTICAL date (split across a UTC-midnight boundary, a partial/retried sweep, or one county failing) leaves the latest view holding ONLY the county with the newest date — the other county silently vanishes from `rental_listing_stats` and the brain. Same global-max pattern flagged on the sibling `market_details_swfl` view (`docs/audit/.../08b-contract-thresholds.md:600`). Not currently firing: the served brain shows both (Lee 3,927 + Collier 3,132 @ 2026-07-06, `brains/active-rentals-swfl.md:49`) because that build shared one captured_date — it is a structural risk, not a current outage.

---

### zori_swfl_duckdb · cadence 30d · lane tier-1-duckdb
- **STATUS:** live (Tier-1 cold/raw parquet stage; the LIVE serving path runs through the tier-2 Postgres promotion, see next entry).
- **ROOT:** raw base of `rentals-swfl` (and the rent leg of `investor-zip-swfl`). Zillow ZORI rent index, unadjusted, ZIP grain.
- **DATA WE GET:** ZORI rent index (unadjusted), ZIP grain — parquet `lake-tier1/market/zori_swfl.parquet` (as_of 2026-05-23). All-homes monthly composite (SFR + Condo + Multifamily).
- **DATA AVAILABLE, unpulled:** Zillow's seasonally-adjusted ZORI variant, same ZIP grain, free — not pulled (registry source_ceiling, 07/07/2026; `zillow.com/research/data`).
- **ROUTES:**
  - Pipeline → `lake-tier1/market/zori_swfl.parquet`. Cron `zori-tier1-monthly.yml` (monthly). `consuming_pack: rentals-swfl`.
  - Feeds forward to Postgres via `zori_swfl_tier2` (the promotion pipeline), which is what `data_lake.zori_zip_latest` (the view `rentals-swfl` actually reads) is built from. The duckdb parquet is the cold/raw copy; it is not read directly by the brain source connector.
  - Downstream brain routes: identical to `zori_swfl_tier2` below (single consuming brain `rentals-swfl`).
- **NOTES:** This is the "monthly ZORI index" leg of the three-rent drift — trend/direction, not a live number. Two separate ZORI entries by design: `zori_swfl_duckdb` = Tier-1 parquet stage; `zori_swfl_tier2` = Postgres promotion (registry comment `cadence_registry.yaml:1172`).

---

### zori_swfl_tier2 · cadence 30d · lane tier-2
- **STATUS:** live (this is the lane whose Postgres table backs the view the brain reads).
- **ROOT:** raw base of `rentals-swfl` (Postgres promotion of `zori_swfl_duckdb`). Feeds `data_lake.zori_swfl` → view `data_lake.zori_zip_latest`.
- **DATA WE GET:** ZORI rent index (unadjusted), ZIP grain — `data_lake.zori_swfl` (dlt schema `zori_swfl`), expected_rows_min 4666 (~90% of 5,185 confirmed 2026-05-31). Liveness view `data_lake.zori_zip_latest` probed daily via PostgREST. Per-ZIP columns exposed to the brain: zip_code, metro, county_name, city, latest_period, rent_index_latest, rent_yoy_pct, rent_mom_pct (`refinery/sources/zori-zip-latest-source.mts:50-63`).
- **DATA AVAILABLE, unpulled:** same vendor ceiling — seasonally-adjusted ZORI variant, unpulled.
- **ROUTES (source → brain → surfaces):**
  - Pipeline: promotes duckdb → `data_lake.zori_swfl`. Cron `zori-tier2-monthly.yml` (monthly, day 24). View `data_lake.zori_zip_latest` (brain-input pivot, MAX-within-±7d YoY/MoM).
  - Source connector: `refinery/sources/zori-zip-latest-source.mts:65-99` (GATE B: throws on 0 rows / floor 79 ZIPs).
  - Brain pack: `refinery/packs/rentals-swfl.mts` (reads `zoriZipLatestSource`, `:450`) → served `brains/rentals-swfl.md`.
  - **Investor composite (rent leg):** `refinery/packs/investor-zip-swfl.mts:50` (`UP_RENTALS`), reads `rentals_by_zip → rent_index_latest`; **yield = ZORI rent x 12 / ZHVI value x 100** (`investor-zip-swfl.mts:194-197`, `:389`).
  - Master rollup: `refinery/packs/master.mts:242` (source) + `:296` (input edge).
  - **Email:** `lib/email/market-context.ts:83-110` reads `data_lake.zori_zip_latest` DIRECTLY (bypasses the brain) → "Typical asking rent" + "Rent YoY" figures, cited "Zillow ZORI".
  - **Homepage hero card:** `lib/welcome/answer.ts:67-73` ("Median Rent" card, brain `rentals-swfl`, `rent_index_latest`, coarse fallback `rental_rent_index_zori_regional_median`).
  - **Chart:** `lib/zip-report/candidates.ts:232-245` (concept `rent_level` → ZORI "Zillow Rent Index", "Monthly index — macro trend"). Chart fallback list `lib/assistant/chart-for-question.ts:106`. Ranked-delta routing `lib/route-chart.ts` (rent keywords).
  - **Project feed signal:** `lib/project/change-detection.ts:60` — `rentals-swfl.rent_index_latest` is a tracked per-ZIP metric that appends a `data-change` row when rent moves.
  - ZIP report pool `lib/zip-report/assemble.ts:31`; ZIP dossier `lib/zip-dossier.ts:82` (grains zip/region, METRO_4). Reach `lib/highlighter/reach.ts:132`. Speaker `refinery/render/speaker.mts:94,696`.
- **NOTES:** Monthly ZORI = the trend leg of the three-rent drift. `rentals-swfl` NEVER recomputes a median from raw counts — reads rates as written (view precomputes YoY/MoM). Note the same brain is reachable two ways: through its own OUTPUT (chart/report/master/investor) AND through a direct `zori_zip_latest` view read in the email path — the email is a non-brain-surface route off the same Tier-2 view.

---

### airdna_str_swfl · cadence 30d · lane tier-1-duckdb
- **STATUS:** unwired (parked ODD source; operator 07/05/2026 — no AirDNA sub purchase. `workflow: none`, no pipeline, no rows). Consumer ships empty-tolerant.
- **ROOT:** would-be raw base of the STR column inside `investor-zip-swfl`. Reserved Tier-1 target `lake-tier1/market/airdna_str_swfl.parquet`.
- **DATA WE GET:** none — nothing ingested. Consumer emits `str_revenue_est_monthly = null`, `str_source_tag = "available_on_request"` (`refinery/packs/investor-zip-swfl.mts:245-246`).
- **DATA AVAILABLE, unpulled:** STR revenue/occupancy/ADR at ZIP grain — no free source exists; AirDNA is the only authoritative feed. Parked on cost (single-market $19.95–99.95/mo by listing count, FL statewide $179/mo; verified 2026-06-11 `airdna.co/pricing`). Idempotent graduation key `(zip_code, period_end)`.
- **ROUTES:**
  - Consumer: `refinery/packs/investor-zip-swfl.mts` — STR placeholder column present but null: card cells `:499-500`, detail column def `:578-584`, caveat "available on request" `:466-467`. Renders in the `investor_zip_card` detail table on every investor card (all null today).
  - No pipeline, no cron, no chart, no email. Zero-code graduation: buy sub → drop MarketMinder export → move registry block to `pipelines:`.
- **NOTES:** Textbook Operation Dumbo Drop scaffold — consumer wired empty-tolerant so a later manual AirDNA drop needs no code change. The STR column is the ONLY unfilled slot in the investor composite; everything else (ZHVI value, ZORI rent, gross yield, flood-adj cap rate) is live.

---

### land_manufactured_swfl · cadence 30d · lane tier-2
- **STATUS:** unwired / near-corpse (parked backfill, operator 06/30/2026; `workflow: none`; **NO pipeline code exists** — confirmed by registry code-read note `cadence_registry.yaml:2066-2092`, do NOT treat as graduated).
- **ROOT:** would write into the SHARED `data_lake.listing_state` table (`property_type` column distinguishes rows) — no new table. `consuming_pack: active-listings-swfl` (the for-sale/inventory brain).
- **DATA WE GET:** none for a dedicated land/manufactured sweep. Today `parse_steadyapi` only ever emits `"land"` (beds-null + lot_sqft heuristic) or `"single_family"`; a manufactured home is mis-typed `single_family`/falls to `other`. No call sends a `property_type` filter to `/search`. `PROPERTY_TYPE_MAP` has the tokens but nothing writes them.
- **DATA AVAILABLE, unpulled:** VENDOR-CEILING confirmed 07/07/2026: land + manufactured listings cannot be filtered at the SteadyAPI/realtor.com level at all. Land caught only by heuristic; manufactured has no signal. This is the vendor's real limit, not a research gap.
- **ROUTES:**
  - Consumer `refinery/packs/active-listings-swfl.mts` exists and is live for the for-sale sweep, but nothing writes land/manufactured true type into it. No source connector, no pipeline, no cron, no chart, no email specific to this source.
  - Graduation requires REAL code (not zero-code): per-type `/search` sweeps (API accepts one property_type per call), true-token emission, a property_type-scoped freshness view — then move to `pipelines:`. Plan: `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/phase-5-land-manufactured-parked.md`.
  - `source_tag`/citation MUST read "realtor.com", never "SteadyAPI" (operator decree).
- **NOTES:** Effectively a parked scaffold that never ran; the "coverage" it implies is currently satisfied only by mis-typed rows flowing through `active-listings-swfl`. Closest thing to a corpse in this batch, but it's a never-run parked entry rather than a decommissioned one.

---

### swfl_search_demand · cadence 30d · lane tier-2
- **STATUS:** live-via-non-brain-surface (`consuming_pack: none` — VERIFIED correct; it feeds a TOOL, not a brain).
- **ROOT:** IS a root — DataForSEO Google Ads search-volume (a DEMAND PROXY: what SWFL searches for; NOT our own engagement data). Operator-only roadmap signal, not customer-facing.
- **DATA WE GET:** keyword, avg_monthly_searches, competition (HIGH/MEDIUM/LOW text), cpc, 12-month search-trend array. 275 seed keywords (15 SWFL places × 18 topic templates + 5 core terms), 3 locations (Fort Myers metro, Naples metro, state FL). First backfill 825 rows (2026-06-03). Table `public.swfl_search_demand`.
- **DATA AVAILABLE, unpulled:** same DataForSEO response also carries `competition_index` (0–100 precise vs our coarse text), `low/high_top_of_page_bid`, and `spell` — none stored, zero extra API cost. Separate `keywords_for_keywords` expansion endpoint = Phase-2 (registry source_ceiling, 07/08/2026).
- **ROUTES:**
  - Pipeline: `ingest/pipelines/swfl_search_demand/pipeline.py` → `public.swfl_search_demand`. Cron `swfl-search-demand-monthly.yml` (2nd of month, 16:00 UTC, monthly — DataForSEO bills per task so weekly would burn ~4x for identical monthly numbers).
  - **Consumer = a TOOL, not a brain:** `refinery/tools/search-demand.mts` — the operator-only demand digest. Reads `public.swfl_search_demand` (`:318-336`, paginated PostgREST), buckets keywords into Build / Sharpen / Rising / Thin (`:145-201`), and PRINTS suggested `check.mjs open` lines. It is passive: never mutates a tracker, never runs the checks. Run on-demand during the RULE-2 CHECK.
  - NO brain, NO chart, NO page, NO email, NOT in master, NOT in any `/r/` or `/api/b/` surface. Precedent: `dbpr_public_notices` (also `public.*`, brain-first gate only targets `data_lake.*`).
- **NOTES:** The one source in this batch with genuinely no customer-facing route by design — it's an internal roadmap-prioritization signal. `consuming_pack: none` is accurate and intentional, not a gap.

---

## Summary of statuses

| Source | Cadence | Lane | Status | Consuming brain / surface |
|---|---|---|---|---|
| rentals_swfl | 7d | tier-2 | live (freshness at risk: SteadyAPI 403) | active-rentals-swfl |
| zori_swfl_duckdb | 30d | tier-1-duckdb | live (raw/cold stage) | rentals-swfl (via tier2) |
| zori_swfl_tier2 | 30d | tier-2 | live (serving path) | rentals-swfl (+ investor rent leg + email) |
| airdna_str_swfl | 30d | tier-1-duckdb | unwired (parked ODD, empty-tolerant consumer) | investor-zip-swfl (null STR column) |
| land_manufactured_swfl | 30d | tier-2 | unwired (parked, NO pipeline code) | active-listings-swfl (mis-typed rows only) |
| swfl_search_demand | 30d | tier-2 | live-via-non-brain-surface | refinery/tools/search-demand.mts (TOOL) |


## === permits-cre ===

# Route-tracing audit — Batch 5: permits / CRE / construction

READ-ONLY. Verified against registry (`ingest/cadence_registry.yaml`), source connectors
(`refinery/sources/*.mts`), packs (`refinery/packs/*.mts`), `master.mts`, `catalog.mts`, `app/`.

Served-surface convention (applies to every LIVE brain below): each catalog brain is served at
`app/api/b/[slug]/route.ts` → `/api/b/<brain-id>`, gets a public report page via the dynamic
`app/r/[slug]/page.tsx` → `/r/<brain-id>`, and is exposed on MCP via `app/api/mcp/server.ts`.
Registration is `refinery/packs/catalog.mts`.

---

### lee_permits · cadence 7d · lane tier-2
- STATUS: live
- ROOT: raw base of `permits-swfl` (which is a critical→master input AND a brain-input into `cre-swfl`)
- DATA WE GET: Accela Angular-SPA scrape (crawl4ai stealth), ~90d backfill → `data_lake.lee_building_permits`. Columns read by the connector: permit_id, issued_date, permit_type_raw, permit_description_raw, bucket, address, zip_code, lat, lon, declared_value_usd, status.
- DATA AVAILABLE, unpulled: Lee County ArcGIS FeatureServers could replace the fragile Accela scrape — 9,386 unincorporated permits, 719 commercial, 2,192 Cape Coral residential, plus 93,976-row code-enforcement, 43,000+ manufactured-home lots, 550,454-row parcel table, subdivisions, 8,017-row ZoningCases (registry source_ceiling).
- ROUTES:
  - `refinery/sources/permits-source.mts` (source_id `lee_building_permits`, tier 1) → reads `data_lake.lee_building_permits` via `selectAllPaged` (448-day window, minRows:1).
  - `refinery/packs/permits-swfl.mts:1059` — `sources: [permitsSource, collierPermitsSource]`; corridor + ZIP z-scores; `detail_tables: permits_by_zip` (Lee only); `sidecarProducer` writes `fixtures/corridor-permits.json`.
  - → master: `refinery/packs/master.mts:241` `makeBrainInputSource("permits-swfl")` + `:295` `input_brains {id:"permits-swfl", edge:input}`.
  - → cre-swfl: `refinery/packs/cre-swfl.mts:740` `brainInputFrom(allFragments,"permits-swfl")` (thin-pipe, narrative stash only).
  - Served: `/api/b/permits-swfl`, `/r/permits-swfl`, MCP. Catalog `catalog.mts:60`.

### collier_permits · cadence 30d · lane tier-2 (dispatch_only — cron commented out)
- STATUS: live-but-dispatch-only (table has rows; scheduled cron deliberately OFF pending a crawl4ai-port dry-run proving out on lee_permits first — a stated fact, not a gap). Pack is built to tolerate empty/stale Collier.
- ROOT: raw base of `permits-swfl` (SAME pack as lee — both counties merge into one `NormalizedPermitRow` stream)
- DATA WE GET: Issued-series monthly XLSX, 23 mapped cols → `data_lake.collier_building_permits`. Connector reads: permit_number, declared_value, permit_type_desc, permit_status, site_address, date_issued, lat, lon, zip_code, bucket, building_type, permit_class, const_type. (owner_*/contractor_* stay in lake, never reach brain.)
- DATA AVAILABLE, unpulled: Applied-series XLSX (leading indicator vs Issued's built) — same page/cadence/layout, deliberately excluded (needs composite permit_number+series PK).
- ROUTES:
  - `refinery/sources/collier-permits-source.mts` (source_id `collier_building_permits`, tier 1) → `data_lake.collier_building_permits` (448-day window, minRows:3000). Drops NULL-bucket / NULL-date rows and exports `getCollierDroppedRowCounts()`.
  - Then identical to lee_permits downstream (permits-swfl → master + cre-swfl brain-input → `/r/permits-swfl`, `/api/b`, MCP).
- NOTE — **the cadence mismatch the task flagged**: lee_permits (WEEKLY 7d) + collier_permits (MONTHLY 30d) feed ONE brain (`permits-swfl`). The pack absorbs the mismatch deterministically: pack `ttl_seconds:604800` (7d, driven by Lee weekly); `COLLIER_STALE_DAYS=60` (2× monthly), `LEE_STALE_DAYS=14` (~2× weekly); per-source fetched_at tracked separately (`lastLeeFetchedAt`/`lastCollierFetchedAt`, `permits-swfl.mts:476-486`); when Collier is empty or its max issued_date > 60d old, **Collier is dropped from the SWFL rollup and only Lee is used**, with an explicit stale/zero caveat (`buildConclusionProse`, caveats block ~905-935). Lee rows arrive with null lat/lon → county-level z fallback (`:334-346`).

### mhs_permits_swfl · cadence 365d · lane tier-2
- STATUS: live (graduated from ODD-window 2026-06-10)
- ROOT: raw base of `permits-commercial-swfl` (→ master input). NOT blended with `permits-swfl`.
- DATA WE GET: 281 commercial permits (CY2025, 12 SWFL jurisdictions) → `data_lake.mhs_permits_swfl`; all 6 vendor columns extracted (issued_date, asset_class, project address/name, permit_value_usd, building_sf, jurisdiction, calendar_year); 184/281 carry an in-scope site zip_code. `source_name='mhs_databook'`.
- DATA AVAILABLE, unpulled: field-complete (the vendor permit table only has these 6 cols). Only open item is data-quality: multi-jurisdiction pages can mis-assign rows to the first header.
- ROUTES:
  - `refinery/sources/mhs-permits-source.mts` (source_id `mhs_permits_swfl`, tier 1) → `data_lake.mhs_permits_swfl` (plain select, <1000 rows). Uses `data_lake.mhs_jurisdiction_xwalk` (submarket_slug + site zip stamped at ingest by `ingest/pipelines/mhs_permits_swfl/geocode.py`).
  - `refinery/packs/permits-commercial-swfl.mts:523` — `sources: [mhsPermitsSource]`, leaf, deterministic; key_metrics commercial_permits_count/value_usd/sf; `detail_tables` commercial_permits_by_submarket + commercial_permits_by_zip.
  - → master: `master.mts:258` `makeBrainInputSource("permits-commercial-swfl")` + `:330` input edge.
  - Served: `/api/b/permits-commercial-swfl`, `/r/permits-commercial-swfl`, MCP. Catalog `catalog.mts:325`.
- NOTE: two registry entries carry `source_name='mhs_databook'` off the same annual MHS PDF but write DIFFERENT tables for DIFFERENT brains — this entry → `mhs_permits_swfl` (281 permit rows → permits-commercial-swfl); the `mhs_databook` entry below → `marketbeat_swfl` (48 CRE market rows → cre-swfl). Don't conflate.

### marketbeat_swfl · cadence 90d · lane tier-2
- STATUS: **live ingest, DARK to the brain.** Data lands, but the consuming brain reads ZERO of it (verified=false gate) — see NOTE. Cron (marketbeat-pdf-ingest.yml) auto-downloads Industrial only; Medical Office is manual/CLI.
- ROOT: nominal raw base of `cre-swfl` (via `data_lake.marketbeat_swfl`, `source_name='cw_marketbeat'`)
- DATA WE GET: 173 rows (industrial 109 / 7 quarters + medical_office 64 / 4 quarters) → `data_lake.marketbeat_swfl`.
- DATA AVAILABLE, unpulled: C&W Fort Myers/Naples hub also publishes Office + Retail (no `extractor.py` parser yet); oldest Q1-2024 medical PDF uses a different layout, unparsed.
- ROUTES (wire exists, delivers nothing):
  - `refinery/sources/marketbeat-swfl-source.mts` (source_id `marketbeat_swfl`, tier 2) → `data_lake.marketbeat_swfl`, `.in("sector",[retail,industrial,office,medical_office])`, then `selectLatestVerifiedPerSubmarket`.
  - `refinery/packs/cre-swfl.mts:29` `marketbeatSwflSource` → per-submarket + per-sector + parent-rollup CRE key_metrics.
  - cre-swfl → master (critical) → `/r/cre-swfl`, `/api/b/cre-swfl`, embed cards, MCP.
- NOTE — **KEY FINDING (registry lines 1550-1554, check `marketbeat_medical_wiring_followup`):** `cw_marketbeat` rows hit the `else` branch of `selectLatestVerifiedPerSubmarket` (`marketbeat-swfl-source.mts:188-192`), which requires `verified===true`. Every cw_marketbeat / colliers_industrial / lee_associates row in the table is `verified=false`, so **all 261 rows across those 3 sources are dropped before the brain sees them.** Only the 48-row `mhs_databook` feed (per-field gated) actually reaches cre-swfl.

### colliers_industrial · cadence 90d · lane tier-2
- STATUS: **live ingest, DARK to brain** (same verified=false gate as cw_marketbeat)
- ROOT: nominal raw base of `cre-swfl` (via `data_lake.marketbeat_swfl`, `source_name='colliers_industrial'`)
- DATA WE GET: 132 rows (11 quarters × 12), 6 SWFL submarkets × Industrial+Flex → `data_lake.marketbeat_swfl` (inventory_sf, total vacancy %, net absorption current+YTD, deliveries, under construction, asking NNN).
- DATA AVAILABLE, unpulled: building count + direct-vacancy % (parsed by column position, never stored); Office/Retail/MF unconfirmed (colliers.com Cloudflare/JS-SPA blocked live crawl).
- ROUTES: lands in `data_lake.marketbeat_swfl` via `marketbeat-pdf-ingest.yml` (same pipeline). Nominally read by `marketbeat-swfl-source.mts` → cre-swfl — but `source_name='colliers_industrial'` → else-branch → `verified===true` required → **all rows dropped** (verified=false). Its `flex` sector is also outside SURFACED_SECTORS. Contributes nothing to the brain today. Part of the 261-row standing gap.

### lee_associates_swfl · cadence 90d · lane tier-2 (probe_mode: odd_window)
- STATUS: **live ingest, DARK to brain** (verified=false gate) + not-yet-graduated (odd_window)
- ROOT: nominal raw base of `cre-swfl` (via `data_lake.marketbeat_swfl`, `source_name='lee_associates'`)
- DATA WE GET: 20 rows (Q1-2025–Q1-2026), Fort Myers only, all 4 sectors (Office/Retail/Industrial/Multifamily): vacancy, asking NNN/mf, absorption, sale $/psf, under-construction, inventory_sf.
- DATA AVAILABLE, unpulled: Naples/Collier (same URL pattern returns HTTP 200 for all 4 Naples sector PDFs — check `lee_associates_missing_naples`); Cap Rate is parsed into memory but silently dropped (no cap_rate column on `marketbeat_swfl`).
- ROUTES: same as colliers_industrial — lands in `data_lake.marketbeat_swfl` (`ingest-lee-associates-swfl.yml`), read by `marketbeat-swfl-source.mts` → cre-swfl, but verified=false → **all rows dropped**. `multifamily` sector also outside SURFACED_SECTORS. Part of the 261-row standing gap.

### fmb_recovery · cadence 90d · lane tier-2 (probe_mode: odd_window)
- STATUS: live-ingest (seed-based, always upserts 8 SEED_ROWS), wired to cre-swfl
- ROOT: raw base of `cre-swfl` (via `data_lake.local_cre_context`, `source_name='fmb_planning'`)
- DATA WE GET: 8 seed rows ($1.107B CDBG-DR, pier contract $11.7M, beach renourishment, Bay Oaks, Big Carlos Pass Bridge) → `data_lake.local_cre_context`.
- DATA AVAILABLE, unpulled: FMB recovery-projects dashboard has street-level repaving, 19-street stormwater program, lighting, 4 county parks — more than the 8 seeds carry (the one genuine gap in this vendor group).
- ROUTES:
  - `refinery/sources/local-cre-context-source.mts` (source_id `local_cre_context`, tier 2) → `data_lake.local_cre_context` `WHERE city IN ('Estero','Fort Myers Beach')`. **Filters by CITY, not source_name — so this ONE connector reads both fmb_recovery (FMB rows) and estero_edc (Estero rows).**
  - `refinery/packs/cre-swfl.mts:36` `localCreContextSource` (fitScore 4); injected into cre-swfl caveats/narrative.
  - cre-swfl → master → `/r/cre-swfl`, `/api/b`, MCP.

### estero_edc · cadence 30d · lane tier-2 (probe_mode: odd_window)
- STATUS: live-ingest (seed-based, always upserts 6 SEED_ROWS), wired to cre-swfl
- ROOT: raw base of `cre-swfl` (via `data_lake.local_cre_context`, `source_name='estero_edc'`)
- DATA WE GET: 6 seed rows (Corkscrew Rd Widening Ph2 ~$27M, mini-warehouse 75,910 SF, High 5 40k SF, Aldi, Home2 Suites, Walmart expansion) → `data_lake.local_cre_context`.
- DATA AVAILABLE, unpulled: none — estero-fl.gov source page is a flat 404; seed-only fallback is the correct posture (the "526" in an old note was a Cloudflare SSL error code, not a row count).
- ROUTES: same connector as fmb_recovery (`local-cre-context-source.mts`, city IN Estero) → cre-swfl → master/pages.

### crexi_listings · cadence 7d · lane tier-2 (probe_mode: odd_window, NOT YET ACTIVATED)
- STATUS: unwired-pipeline — table `data_lake.active_listings_cre` exists, pipeline needs a first green GHA run to graduate (registry note: "NOT YET ACTIVATED"). Connector/pack wire is fully built and ready.
- ROOT: raw base of `cre-swfl` (via `data_lake.active_listings_cre`, `source_name='crexi'`)
- DATA WE GET (target): active CRE lease listings, Estero (33928) + Fort Myers Beach (33931) only, ~1-4 leases/city.
- DATA AVAILABLE, unpulled: 300+ active for-sale/lease listings county-wide across Lee/Collier (registry ceiling value 300).
- ROUTES:
  - `refinery/sources/active-listings-source.mts` (source_id `active_listings_cre`, tier 2) → aggregates `data_lake.active_listings_cre` `WHERE city IN ('Estero','Fort Myers Beach') AND status='available'`, per-city count/available_sqft/median asking rent. **Filters by CITY, not source_name — so this ONE connector reads both crexi and brevitas rows.**
  - `refinery/packs/cre-swfl.mts:32` `activeListingsSource` (fitScore 5) → cre-swfl → master/pages.
- NOTE: registry note says "Firecrawl agent scrape" but the connector citation reads "Crexi crawl4ai weekly scrape" (crawl4ai is the current tool per RULE 0.4).

### brevitas_listings · cadence 7d · lane tier-2 (probe_mode: odd_window)
- STATUS: unwired-pipeline (odd_window; supplements crexi, same table)
- ROOT: raw base of `cre-swfl` (via `data_lake.active_listings_cre`, `source_name='brevitas'`)
- DATA WE GET (target): for-lease only, Estero + FMB, ~1-4 leases/city (address, city, state, single top-level property_type, sqft, asking_price_psf, status, source_url). Clean JSON API (brevitas.com/api/search, no auth).
- DATA AVAILABLE, unpulled: for-sale listings (brevitas.com/search — never queried; `transaction_type=for_lease` hardcoded, check `brevitas_lease_only_hardcoded`); much richer type/subtype taxonomy than the flat top-level type stored.
- ROUTES: same connector as crexi (`active-listings-source.mts`, reads both by city) → cre-swfl → master/pages.

### census_vip · cadence 30d · lane tier-1 · consuming_pack: none
- STATUS: **unwired (dead corpse)** — cold tier-1 parquet with zero consumer, confirmed by grep across `refinery/`.
- ROOT: IS a root (nothing reads it)
- DATA WE GET: Census Value of Construction Put in Place, monthly, 10-yr window — 4 collapsed categories only (total / residential / nonresidential / manufacturing), seasonally-adjusted value only, national grain → cold `lake-tier1/macro/census_vip/`. Written by `ingest-census-vip.yml`.
- DATA AVAILABLE, unpulled: dozens of VIP sub-categories collapsed away (residential SF/MF/improvements split; nonresidential lodging/office/commercial/health-care/~10 education/religious/public-safety/recreation/transport/comms/power; 13 manufacturing sub-sectors); non-SA series. Vendor ceiling: VIP is national-only (no state/county cut).
- ROUTES: **NONE.** No source connector in `refinery/sources/`, no pack, no page. Only references anywhere are the ingest pipeline (`ingest/pipelines/census_vip/`), the workflow, the registry, and docs. Holds national construction-spending data no brain reads.

### faf5 · cadence 365d · lane tier-1
- STATUS: live
- ROOT: raw base of `logistics-swfl` (→ master input)
- DATA WE GET: FAF5.7.1 regional O-D freight flows, FL's 5 zones (SWFL is undifferentiated inside "Remainder of Florida" zone 129), tons/value/tmiles; connector filters `dms_dest=129 AND trade_type=1 (domestic inbound) AND tons>0`, years 2020-2024. Cold Parquet `lake-tier1/faf5/` (+ `year=YYYY` partitions), written by `ingest/scripts/faf5_to_parquet.py`.
- DATA AVAILABLE, unpulled: **MODE of transport (truck/rail/water/air/pipeline) — never read, so every SWFL freight number we serve is mode-blind**; FAF5 experimental County-Level estimates (could split Lee/Collier out of the catch-all zone); state-level file; High/Low forecast bands (we pull mid only); 1997-2012 backfill; Truck Network Highway Assignment.
- ROUTES:
  - `refinery/sources/faf5-source.mts` (source_id `faf5_flows_swfl`, tier 1) — DuckDB over 3 Parquet views (per-year flows UNION + `faf_zone_lookup` + `faf_sctg_lookup`).
  - `refinery/packs/logistics-swfl.mts` — `sources: [faf5Source]`, leaf, deterministic; aggregates by origin + commodity.
  - → master: `master.mts:236` `makeBrainInputSource("logistics-swfl")` + `:290` input edge. (Sibling `logistics-swfl-nowcast` also feeds master, `:237/:291` — not in this batch.)
  - Served: `/api/b/logistics-swfl`, `/r/logistics-swfl`, MCP. Catalog `catalog.mts:224`.

### fred_g17 · cadence 30d · lane tier-1 · consuming_pack: none
- STATUS: **unwired (dead corpse)** — cold tier-1 parquet, no consumer.
- ROOT: IS a root (nothing reads it)
- DATA WE GET: G.17 industrial production / capacity utilization, national series only → cold `lake-tier1/macro/fred_g17/`. Written by `ingest-fred-g17.yml`.
- DATA AVAILABLE, unpulled: FRED publishes real Lee/Collier county-level annual series (HPI, county GDP, per-capita income, median HH income, poverty rate, building permits) — none pulled. Vendor ceiling: MSA-level GDP discontinued 2023; claims never finer than statewide.
- ROUTES: **NONE.** The ONLY `refinery/` reference is a COMMENT in `refinery/packs/macro-us.mts:222` (`// ...cadence_registry fred_g17=30`) — macro-us actually reads `macroUsSource` (SOFR + CPI), NOT the G.17 parquet. No source connector, no pack consumption, no page. Truly unwired.

### mhs_databook · cadence 365d · lane tier-2 · workflow: none (manual ODD)
- STATUS: live-via-manual-drop (`workflow:none` + `dispatch_only` by design — a human drops the PDF; identity check reads this as a stated manual source, not a zombie).
- ROOT: raw base of `cre-swfl` (via `data_lake.marketbeat_swfl`, `source_name='mhs_databook'`) — **the ONLY marketbeat_swfl feed that actually reaches the brain.**
- DATA WE GET: 48 rows (16 submarkets × 3 sectors: retail / industrial / office) → `data_lake.marketbeat_swfl`. Collision rule: mhs_databook wins over cw_marketbeat on identical (sector, submarket, period).
- DATA AVAILABLE, unpulled: Multi-Family sector (confirmed live in the same annual PDF, zero extra cost, never built = "Recipe 3"; check `mhs_databook_missing_multifamily`).
- ROUTES:
  - Lands in `data_lake.marketbeat_swfl` via manual PDF drop (no code writer).
  - Read by `refinery/sources/marketbeat-swfl-source.mts` → cre-swfl. mhs_databook rows use PER-FIELD gating (verified_vacancy / verified_rents / verified_absorption in `selectLatestVerifiedPerSubmarket:188-192`), so they DO reach the brain (unlike the verified=false cw_marketbeat/colliers/lee_associates rows).
  - cre-swfl → master (critical) → `/r/cre-swfl`, `/api/b/cre-swfl`, embed cards, MCP.
- NOTE: same vendor PDF also feeds the separate `mhs_permits_swfl` table/brain (entry above) — two ingests, two tables, two brains, one source_name.

---

## Cross-cutting findings

1. **cre-swfl's CRE-broker data is almost entirely dark.** Of the marketbeat_swfl table's feeds, only
   `mhs_databook` (48 rows) reaches the brain. `cw_marketbeat` (173), `colliers_industrial` (132), and
   `lee_associates` (20) — the registry's "261 rows across 3 sources" — are all `verified=false`, and
   both `marketbeat-swfl-source.mts` and `cre-swfl.mts` gate the else-branch on `verified===true`. This
   is a tracked check (`marketbeat_medical_wiring_followup`) but it means most of the CRE ingest effort
   currently delivers nothing to the answer surface.
2. **cre-swfl's alt-listing feeds are pre-graduation.** `crexi_listings` / `brevitas_listings`
   (active_listings_cre) are odd_window, "NOT YET ACTIVATED" — the connector/pack wire is built and
   ready (one connector reads both by city), but no green GHA run has graduated them.
3. **Two true dead corpses:** `census_vip` and `fred_g17` — both tier-1, `consuming_pack: none`, both
   confirmed to have zero refinery consumer (fred_g17's only mention is a cadence comment in
   macro-us.mts). National-grain data sitting cold with no brain, no page.
4. **The lee(7d)/collier(30d) → permits-swfl cadence mismatch is handled correctly** — pack TTL is
   Lee-driven, per-source staleness thresholds differ (14d vs 60d), and stale/empty Collier is
   excluded from the SWFL rollup with a caveat rather than silently averaged in.
5. **faf5 is mode-blind** — the biggest content gap among the live feeds: we never read FAF5's
   transport-mode column, so every served SWFL freight figure aggregates all modes invisibly.


## === macro-labor ===

# Route-Trace Catalog — Batch 6: macro / labor / tourism / econ

Read-only audit. Chain shorthand:

- **Serve routes are UNIVERSAL** — every brain that writes `brains/<id>.md` gets, for free:
  - `app/api/b/[slug]/route.ts` → `/api/b/<id>` (HTTP; `?view=speak&tier=N`, `?format=json` adds dossier + rules). Served via `lib/fetch-brain` (`fetchBrain`/`readBrainMarkdown`).
  - `app/api/mcp/server.ts` → the MCP `swfl_fetch` tool (`fetchBrain(slug, {tier})` at server.ts:332, `report_id ?? "master"` default, gated by `VALID_REPORT_IDS`). **Generic — serves any brain by slug, no per-source wiring.** (server.ts prose only *names* tourism-tdt/cre-swfl/macro-swfl as "never speak the slug" examples — not routes.)
  - `app/r/[slug]/page.tsx` → `/r/<id>` public report page (metrics table + auto chart). Listed in `app/sitemap.ts:76-96` (enumerates every `brains/*.md`). Curated discovery index `app/llms.txt/route.ts` hand-lists a subset (master, housing-swfl, **cre-swfl** at llms.txt:22).
  - If in master's `input_brains[]` (`refinery/packs/master.mts`): rolled into `/api/b/master` dossier → which feeds emails at `lib/email/build-doc.ts:137` (`fetch(/api/b/master?...)`) and the insiders dossier (`lib/email/insiders/dossier.ts`, default `brainSlugs:["master"]`).
- To avoid repeating those universal wires per-entry, ROUTES below lists the **source-specific** chain (lake→connector→pack→root) and only calls out NON-generic surfaces (custom pages/charts/emails).

THE-GOAL tiers: leaf **Reporter** brains → **master** synthesizer → conversation. "Root it feeds" = master, unless noted.

---

### bls_ppi · cadence 30d · lane tier-1 (prefix cold Parquet)
- STATUS: **live**
- ROOT: feeds **cre-swfl** (Reporter) → master
- DATA WE GET: 12 PPI industry series (NAICS 236 "Nonresidential Building Construction"), 10-yr rolling monthly index. cre-swfl consumes **8 of 12** (industrial/warehouse/office/health-care building + 4 nonresidential trade-contractor indexes). 236222 (school) ingested-but-unconsumed (check `bls_ppi_school_series_no_consumer`); 236400/236500/2381MR are aggregate rollups, not surfaced.
- DATA AVAILABLE, unpulled: BLS Final Demand Construction composite (WPUFD43x) + Materials & Components for Construction input-cost index (WPUID612x) — different series scheme, not pulled. No BLS PPI residential-construction series exists (BLS coverage gap, not ours).
- ROUTES: `s3://lake-tier1/macro/bls_ppi/*.parquet` → `refinery/sources/bls-ppi-source.mts` (DuckDB reads Parquet directly; GROUP BY + MAX(value) dedup across overlapping monthly files; normalizes all 12, `BLS_PPI_SERIES` L44) → `refinery/packs/cre-swfl.mts:2125` (`sources:[…blsPpiSource]`; `BLS_PPI_METRIC_MAP` selects 8) → brain `cre-swfl` → master (`master.mts:283`, edge `input`, **critical:true**). Custom surfaces for the cre-swfl brain: `/r/cre-swfl` bespoke MarketBeat chart + corridor breakdown (`app/r/[slug]/page.tsx:239-256`), corridor drill `/r/cre-swfl/[corridor]`, and the `/r/cre-swfl` sitemap+llms.txt discovery entries.
- NOTES: Cold-lane pattern (connector reads Parquet, no live API in refinery — Python ingest owns fetch), same as faf5. ⚠️ Homepage `app/api/landing-data/route.ts:45,56,64` carries `corridorRents`/`marketEvents`/`keyMetrics` attributed in comments to "cre-swfl … + labor-demand-swfl brains 2026-06-05" — but these are **HARDCODED SNAPSHOT values, NOT a live wire** to the brain output. A homepage-facing surface, stale-by-construction.

### bls_oews_swfl_tier1 · cadence 365d · lane tier-1 (prefix cold NDJSON)
- STATUS: **unwired** (cold archive — no connector reads it; the tier-2 Postgres twin is the live read path)
- ROOT: **raw base of the `bls_oews_swfl` (tier-2) read** — nominal consumer labor-demand-swfl, but the brain does NOT read this NDJSON (see NOTES).
- DATA WE GET: 220 rows (2021-2025), 2 MSAs (15980 Cape Coral-Ft Myers/Lee, 34940 Naples-Marco/Collier), NDJSON archive `lake-tier1/labor/bls_oews_swfl/{YYYY}.ndjson`.
- DATA AVAILABLE, unpulled: BLS CES/SAE monthly nonfarm payroll by industry for both MSAs (free, unpulled). No metro CPI exists for either MSA (vendor ceiling).
- ROUTES: `ingest/pipelines/bls_oews_swfl` (workflow `bls-oews-annual.yml`) writes BOTH this tier-1 NDJSON cold copy AND the tier-2 Postgres table. **No refinery source connector reads the tier-1 NDJSON** — `bls-oews-source.mts` queries the Postgres table (see `bls_oews_swfl` below).
- NOTES: **DUPLICATE PAIR.** `bls_oews_swfl_tier1` (this, tier-1 cold NDJSON archive) vs `bls_oews_swfl` (tier-2 Postgres, next entry) are two registry entries for ONE pipeline/workflow, same 220 rows, same `consuming_pack: labor-demand-swfl`. **The tier-2 Postgres entry is CANONICAL for the live read**; this tier-1 entry is the raw cold backup/base of that read. Same `expected_rows_min:198`.

### bls_oews_swfl · cadence 365d · lane tier-2 (dlt Postgres)
- STATUS: **live** — this is the CANONICAL live read for OEWS.
- ROOT: feeds **labor-demand-swfl** (Reporter) → master
- DATA WE GET: 220 rows (2021-2025), `data_lake.bls_oews_swfl`, major SOC groups (`o_group='major'`), 2 MSAs.
- DATA AVAILABLE, unpulled: same as tier-1 (CES/SAE payroll-by-industry; no metro CPI).
- ROUTES: `data_lake.bls_oews_swfl` → `refinery/sources/bls-oews-source.mts` (live Supabase query, 2 most-recent ref_years for YoY; builds `bls-oews-swfl-summary` fragment) → `refinery/packs/labor-demand-swfl.mts:288` (`sources:[blsOewsSource]`, deterministic, `skipSynthesisAgent`) → brain `labor-demand-swfl` → master (`master.mts:299`, edge `input`, non-critical). Metrics: top occupation group, construction LOC_Q, healthcare employment, construction median wage, total-employment YoY.
- NOTES: canonical vs bls_oews_swfl_tier1 — see prior entry. Connector's `SOURCE_ID` = `bls_oews_swfl`; `blsOewsSource` reads Postgres `data_lake.bls_oews_swfl` NOT the tier-1 NDJSON.

### bls_laus · cadence 30d · lane tier-2 (dlt Postgres)
- STATUS: **live**
- ROOT: feeds **macro-swfl** (Reporter, leaf of macro chain) → master
- DATA WE GET: 328 rows, `data_lake.bls_laus`, monthly unemployment for FL state (12000) + Lee (12071) + Collier (12021); measures 03/04/05/06 (rate/unemployed/employed/labor-force).
- DATA AVAILABLE, unpulled: none meaningful — vendor ceiling (LAUS has no sub-state demographic breakdown; JOLTS state-only; ECI census-region-only).
- ROUTES: `data_lake.bls_laus` → `refinery/sources/bls-laus-source.mts` (3 parallel Supabase queries by FIPS; emits single `laus-swfl-summary` fragment) → `refinery/packs/macro-swfl.mts:537` (`sources:[makeBrainInputSource("macro-florida"), blsLausSource, blsQcewSource]`) → brain `macro-swfl` → master (`master.mts:286`, edge `input`, **critical:true**). Metrics: Lee/Collier/FL unemployment rate + Lee YoY delta.
- NOTES: macro-swfl is the LEAF of the 3-tier macro chain (macro-us→macro-florida→macro-swfl); it also consumes macro-florida via brain-input for the FL baseline.

### bls_qcew · cadence 90d · lane tier-2 (dlt Postgres)
- STATUS: **live**
- ROOT: feeds **macro-swfl** (same brain as bls_laus) → master
- DATA WE GET: 32 rows (all-industries headline), `data_lake.bls_qcew`, latest quarter + same quarter prior-year, FL+Lee+Collier, private-sector (own_code=5) surfaced.
- DATA AVAILABLE, unpulled: industry-sector detail (mining/construction/retail…) returns in the SAME API response, filtered out at parse — zero extra API cost.
- ROUTES: `data_lake.bls_qcew` → `refinery/sources/bls-qcew-source.mts` (3 parallel Supabase queries; per-row `bls-qcew-record` fragments + one `labor-swfl-summary`) → `refinery/packs/macro-swfl.mts:537` (shared with bls_laus) → brain `macro-swfl` → master (`master.mts:286`, critical). Metrics: Lee/Collier private avg weekly wage + YoY %, private employment.
- NOTES: SHARES its consuming brain (macro-swfl) with bls_laus — one brain, two BLS sources.

### census_cbp · cadence 365d · lane tier-2 (dlt Postgres)
- STATUS: **live**
- ROOT: feeds **macro-florida** (Reporter, middle tier of macro chain) → master
- DATA WE GET: 255,563 rows in base table `data_lake.census_cbp_fl`; the connector reads the SQL **aggregate view** `data_lake.census_cbp_fl_agg_by_naics` (~20 sector-level NAICS rows, SUM pushed to SQL) — establishments/employment/annual-payroll per NAICS sector, all FL counties summed.
- DATA AVAILABLE, unpulled: Census Building Permits Survey (county + permit-place grain) — an independent govt cross-check vs our scraped permit pipelines, not pulled.
- ROUTES: `data_lake.census_cbp_fl` → SQL view `census_cbp_fl_agg_by_naics` (`docs/sql/20260623_...view.sql`) → `refinery/sources/macro-florida-cbp-source.mts` (`SOURCE_ID=census_cbp_fl`, reads AGG_VIEW, `fl-cbp-aggregate` fragments) → `refinery/packs/macro-florida.mts:402` (one of several sources) → brain `macro-florida` → master (`master.mts:285`, edge `input`, **critical:true**).
- NOTES: connector reads the AGGREGATE VIEW, not the raw 255k-row table (replaced an old 43k-row paged fetch + TS reduce — aggregate-at-source).

### census_acs · cadence 365d · lane tier-2 (dlt Postgres)
- STATUS: **live-via-non-brain-surface**
- ROOT: **IS-A-non-brain-root** — feeds NO brain/pack. Registry `consuming_pack: lib/zip-summary`.
- DATA WE GET: 100 in-scope ZCTAs, `data_lake.census_acs_zcta`, ACS 5-year per-ZCTA demographics (population, median HH income, median age, owner-occupied %, avg HH size, poverty rate, employment rate, moved-in-past-year %).
- DATA AVAILABLE, unpulled: Census SAIPE (income/poverty county grain), Nonemployer Statistics, Population Estimates — not pulled.
- ROUTES (all TS lib, NO brain): `data_lake.census_acs_zcta` read by three consumers →
  1. `lib/zip-summary/load.ts:48` (`loadZipQuickSummary`) → ZIP report page "Quick data summary" (consumed across `lib/zip-report/assemble.ts`, `load-ranked-signals.ts`, `census-values.ts`).
  2. `lib/zip-report/candidates.ts` (ZIP candidate ranking).
  3. `lib/email/market-context.ts` (email/deliverable ZIP market context).
- NOTES: **The registry note is correct — census_acs feeds `lib/zip-summary`, NOT a brain.** No source connector in `refinery/sources`, no pack, no master edge. It is the demographic layer beneath the ZIP report + emails.

### fred_laus_alfred · cadence 30d · lane tier-1 (prefix cold Parquet)
- STATUS: **UNWIRED (live-via-offline-tool-only)** ⚠️ FINDING
- ROOT: **feeds no root.** Registry `consuming_pack: none`.
- DATA WE GET: ALFRED vintage-LAUS Parquet at `lake-tier1/macro/fred_laus_alfred/{snapshot}.parquet` (vintage/as-first-published LAUS series for point-in-time backtesting).
- DATA AVAILABLE, unpulled: none noted (vendor ceiling: LAUS has no sub-state demographic breakdown at any vintage).
- ROUTES: `ingest/pipelines/fred_laus_alfred` (workflow `fred-laus-alfred-monthly.yml`) → `s3://lake-tier1/macro/fred_laus_alfred/*.parquet`. **Only consumer** = `refinery/tools/flywheel-backtest.mts:258` (offline flywheel backtest tool) + `refinery/tools/ian-retrodiction-demo.mts`. **No source connector, no brain, no page, no email.**
- NOTES: **Genuinely unwired from the live product.** It exists to give the offline flywheel-grade backtest a point-in-time (vintage) LAUS series so historical grading doesn't peek at revised numbers. Legitimate purpose, but zero live surface — matches registry `consuming_pack: none`. Not a corpse (pipeline + tool consumer both live), but not in any user-facing chain.

### fl_dor_tdt · cadence 30d · lane tier-2 (non-dlt Postgres)
- STATUS: **live**
- ROOT: feeds **tourism-tdt** (Reporter) → master
- DATA WE GET: monthly Tourist Development Tax collections ($), Lee + Collier, from Form 3 workbook's TDT sheet only. `public.fl_dor_tdt_collections` (666 rows; FY1999-FY2026).
- DATA AVAILABLE, unpulled: same downloaded workbook has 7 sheets, we parse 1 — Local Option Sales Tax, Conv & Tourist Impact tax (same layout as TDT sheet), 3 Local Option Fuel Tax sheets — all real monthly county revenue, zero extra download cost.
- ROUTES: `public.fl_dor_tdt_collections` → `refinery/sources/tourism-tdt-source.mts` (`SOURCE_ID=fl_dor_tdt`; "THIS IS THE ONLY FILE THAT KNOWS THE SCHEMA"; per-row `tdt-collection` fragments, FL fiscal-year + post-Ian derived) → `refinery/packs/tourism-tdt.mts:805` (`sources:[tourismTdtSource]`) → brain `tourism-tdt` → master (`master.mts:288`, edge `input`). Hospitality constitution overrides (hospitality-yoy-collapse) can fire off this brain.
- NOTES: FY derived from `period` (no fiscal_year column). Trust tier 1 (FL DOR primary).

### fl_dor_sales_tax · cadence 30d · lane tier-2 (non-dlt Postgres)
- STATUS: **live**
- ROOT: feeds **sector-credit-swfl** (Reporter) → master
- DATA WE GET: monthly taxable sales ($) by kind_code/business_type per county (Lee+Collier), `public.fl_dor_sales_tax` (40,140 rows; connector windows last 26 months). Form 10.
- DATA AVAILABLE, unpulled: vendor ceiling confirmed — the 2 other sheets (Summary = statewide rollup, Line Item Detail = glossary) are not data. County×business-type×month is DOR's finest grain; no ZIP cut.
- ROUTES: `public.fl_dor_sales_tax` → `refinery/sources/fl-dor-sales-tax-source.mts` (`SOURCE_ID=fl_dor_sales_tax`; `selectAllPaged` by (county,kind_code,period) to beat PostgREST 1000-row cap; `sales-tax-row` fragments) → `refinery/packs/sector-credit-swfl.mts:716` (one of several sources) → brain `sector-credit-swfl` → master (`master.mts:287`, edge `input`).
- NOTES: `selectAllPaged` guards the db-max-rows=1000 truncation (~3.3k rows).

### rsw_airport_monthly · cadence 30d · lane tier-2 (non-dlt Postgres)
- STATUS: **live**
- ROOT: feeds **rsw-airport** (Reporter) → master
- DATA WE GET: 2,580 rows (5 metrics × 516), `public.rsw_airport_monthly`, RSW (Southwest Florida Intl) monthly enplanements, deplanements, total_passengers, aircraft_operations, total_freight_lbs; connector windows last 30 months.
- DATA AVAILABLE, unpulled: Page Field (LCPA general-aviation) entirely unscraped; RSW financials/route/concessions need doc parsing or aren't published at this grain.
- ROUTES: `public.rsw_airport_monthly` → `refinery/sources/rsw-airport-source.mts` (`SOURCE_ID=rsw_airport_monthly`; `rsw-airport-row` fragments, RSW-only) → `refinery/packs/rsw-airport.mts:429` (`sources:[rswAirportSource]`) → brain `rsw-airport` → master (`master.mts:302`, edge `input`).
- NOTES: ⚠️ minor discrepancy — connector header says "self-ingested"; the registry note for this entry says "Scrapes via **Firecrawl**", which contradicts the crawl4ai-only rule (likely a stale registry comment; ingest-side, not on the trace path). Worth confirming the pipeline uses crawl4ai, not Firecrawl.

### swfl_inc · cadence 7d · lane tier-2 (non-dlt Postgres)
- STATUS: **live**
- ROOT: feeds **econ-dev-swfl** (Reporter) → master
- DATA WE GET: 3 blog category feeds (business-development, chamber-news, policy) scraped weekly, `public.swfl_inc_announcements` (32 rows; connector windows last 180 days). Fields: title/announced_date/county/category/investment_usd/jobs/summary.
- DATA AVAILABLE, unpulled: swflinc.com/blog lists 13 category feeds; 4 more econ-dev-relevant (Nonprofit News, Veteran Resources, Accommodations & Hotels, Shop Local) same shape, unpulled.
- ROUTES: `public.swfl_inc_announcements` → `refinery/sources/swfl-inc-source.mts` (`SOURCE_ID=swfl_inc_announcements`, trust_tier **2** — editorial/EDO secondary; `swfl-inc-announcement` fragments) → `refinery/packs/econ-dev-swfl.mts:356` (`sources:[swflIncSource]`) → brain `econ-dev-swfl` → master (`master.mts:300`, edge `input`).
- NOTES: freshness keyed on `scraped_at` (source publishes sporadically → measures pipeline-alive). Only tier-2-trust source in this batch's brain feeds.

### fgcu_reri_indicators · cadence 30d · lane tier-2 (non-dlt Postgres)
- STATUS: **live**
- ROOT: feeds **fgcu-reri** (Reporter) → master
- DATA WE GET: 8 monthly pct-change indicators (airport activity, tourist tax, taxable sales, unemployment, single-family permits, home sales, home prices, active listings), scraped from RERI homepage summary text; `public.fgcu_reri_indicators` (connector windows last 3 months). Lee+Collier+Charlotte.
- DATA AVAILABLE, unpulled: RERI's own Indicators Dashboard lists 13 categories vs our 8 — 5 untouched (Employment by Industry, Consumer Sentiment, regional CPI, SWFL Stock Index, Industry Diversification Index). Monthly PDF report (raw index levels) never parsed.
- ROUTES: `public.fgcu_reri_indicators` → `refinery/sources/fgcu-reri-source.mts` (`SOURCE_ID=fgcu_reri_indicators`, trust_tier 1; `reri-row` fragments) → `refinery/packs/fgcu-reri.mts:262` (`sources:[fgcuReriSource]`) → brain `fgcu-reri` → master (`master.mts:329`, edge `input`).
- NOTES: fgcu-reri was one of the 7 brains added to master `sources[]` in 672180c but missing from `input_brains[]` until the 2026-06-20 reconcile (its missing `brains/fgcu-reri.md` threw the 06-18 master HOLD) — now wired.

### sba_foia_franchise_outcomes · cadence 90d · lane tier-1 (exact Parquet)
- STATUS: **live pipeline, PARKED entry, brain runs in FIXTURE mode** ⚠️
- ROOT: feeds **franchise-outcomes** (Reporter) → master
- DATA WE GET: 453 franchise rows (full FOIA total, not a subset) at `lake-tier1/franchise/sba_foia_franchise_county.parquet`. County-grain: (franchise_code, franchise_name), survival/chargeoff rates, gross approval.
- DATA AVAILABLE, unpulled: source_ceiling = 453 (already complete — full FOIA total). A ZIP-approx Parquet (`franchise_zip_approx`) exists but isn't consumed by the connector yet.
- ROUTES: `ingest/duckdb_pipelines/franchise_outcomes` (workflow `franchise-outcomes-quarterly.yml`) → `s3://lake-tier1/franchise/sba_foia_franchise_county.parquet` → `refinery/sources/franchise-source.mts` (`SOURCE_ID=sba_loans_franchise_outcomes`; **gated by `REFINERY_FRANCHISE_SOURCE=live`** — DEFAULTS TO FIXTURE) → `refinery/packs/franchise-outcomes.mts:330` (`sources:[franchiseSource]`; publishes empty-tolerant "awaiting first live SBA FOIA load — no figures published" in fixture mode) → brain `franchise-outcomes` → master (`master.mts:282`, edge `input`). Has `detail_tables` (franchise-outcomes.mts:245) — surfaces a per-brand table when live.
- NOTES: Registry `parked: true` + `known_drift: parked_but_scheduled` (check `sba_franchise_parked_but_live`): the cron REALLY fires (first 07/15/2026) but `check_freshness` never probes `not_yet_running:`/parked entries, so its first landing is invisible until promoted. Brain is wired end-to-end but publishes NO real figures until `REFINERY_FRANCHISE_SOURCE=live` graduation.

---

## Cross-batch findings

- **UNWIRED:** `fred_laus_alfred` — live pipeline + cold Parquet, but its ONLY consumer is the offline `refinery/tools/flywheel-backtest.mts:258` (+ `ian-retrodiction-demo.mts`). No connector/brain/page/email. Matches registry `consuming_pack: none`. Purpose: vintage LAUS for point-in-time backtest grading. Not a corpse; just not in any user-facing chain.
- **NON-BRAIN SURFACE:** `census_acs` — feeds `lib/zip-summary/load.ts` + `lib/zip-report/candidates.ts` + `lib/email/market-context.ts` (ZIP report page + emails). No brain/pack/master edge. (Registry note is accurate.)
- **DUPLICATE PAIR (bls_oews ×2):** `bls_oews_swfl_tier1` (tier-1 cold NDJSON archive) and `bls_oews_swfl` (tier-2 Postgres) are one pipeline/workflow (`bls-oews-annual.yml`), same 220 rows, same consuming pack. **Canonical live read = the tier-2 Postgres entry** (`bls-oews-source.mts` queries `data_lake.bls_oews_swfl`); tier-1 NDJSON is the raw cold base, read by no connector.
- **SHARED BRAIN (bls_laus + bls_qcew):** both feed the single `macro-swfl` brain (`macro-swfl.mts:537`) — two BLS sources, one Reporter.
- **PARKED-BUT-LIVE:** `sba_foia_franchise_outcomes` — cron fires quarterly (first 07/15/2026) and brain is fully wired into master, but the connector defaults to FIXTURE mode; no real figures publish until `REFINERY_FRANCHISE_SOURCE=live`.
- **No dead corpses in this batch.** Every source has either a live brain, a live non-brain surface, or a live offline-tool consumer.
- **STALE HOMEPAGE SNAPSHOT:** `app/api/landing-data/route.ts` hardcodes chart/keyMetric values attributed to the **cre-swfl** (bls_ppi consumer) + **labor-demand-swfl** (bls_oews consumer) brains as of 2026-06-05 — a homepage surface fed by copy-paste, not a live route. Not a broken wire (no wire was intended), but worth flagging as stale-by-construction.
- ⚠️ **Verify:** `rsw_airport_monthly` registry note says "Scrapes via Firecrawl" (violates crawl4ai-only rule); connector header says "self-ingested." Likely stale comment — confirm the ingest pipeline uses crawl4ai.

## Master-wiring summary (all in `refinery/packs/master.mts` input_brains)
| source | brain (Reporter) | master edge | critical |
|---|---|---|---|
| bls_ppi | cre-swfl | input | ✅ |
| bls_oews_swfl(+_tier1) | labor-demand-swfl | input | — |
| bls_laus | macro-swfl | input | ✅ |
| bls_qcew | macro-swfl | input | ✅ |
| census_cbp | macro-florida | input | ✅ |
| fl_dor_tdt | tourism-tdt | input | — |
| fl_dor_sales_tax | sector-credit-swfl | input | — |
| rsw_airport_monthly | rsw-airport | input | — |
| swfl_inc | econ-dev-swfl | input | — |
| fgcu_reri_indicators | fgcu-reri | input | — |
| sba_foia_franchise_outcomes | franchise-outcomes | input | — |
| census_acs | (none — lib/zip-summary) | — | — |
| fred_laus_alfred | (none — offline backtest tool) | — | — |


## === environment ===

# Route catalog — Batch 7: environment / weather / traffic / safety

Read-only route-trace of 8 sources. Verified against cadence_registry.yaml + refinery/sources + refinery/packs + downstream app/lib code (not memory). Every downstream endpoint cites file:line.

Method note: `graphify-out/graph.json` IS present, but I traced primarily via Grep/Glob/Read of the live source (per RULE 0.5 fallback) and verified every endpoint against code.

Universal surfaces for ALL brains below (stated once; per-source ROUTES add only the source-specific chain):
- **Serve:** `app/api/b/[slug]/route.ts` serves each brain's `--- OUTPUT ---` at `/api/b/<brain-id>`; master's fused dossier at `/api/b/master`.
- **Chat/answer:** `lib/highlighter/reach.ts` `TOPIC_TO_SLUG` routes question phrasing → brain slug → grounding (`lib/highlighter/grounding.ts`) → `lib/assistant/conversation-path.ts` answer, which reasons over that brain's OUTPUT + master's dossier. Speaker hygiene via `refinery/render/speaker.mts`. **CHAT DOES NOT CHART** (auto-chart lane deleted 07/09/2026 — `lib/assistant/CLAUDE.md`).
- **AI-authored email chart:** `buildChartForQuestion` (`lib/assistant/chart-for-question.ts`) survives ONLY as the email-doc chart path (`lib/email/build-doc.ts` buildPromptChart); its `CHART_FALLBACKS` allowlist (L101-112) includes **env-swfl** (the only batch brain in it).
- **Deliverable frames:** `lib/deliverable/bind-frame.ts` + `lib/email/spec-to-png.ts` — the storm-timeline frame case is live-but-table-absent (see env-swfl NOTES).

---

### fema · cadence 90d · lane tier-2
- **STATUS:** live (registered; quarterly `fema-nfip-quarterly.yml`; consumed by 2 brains + 1 non-brain chart). Registry verified `MAX(inserted_at)=2026-05-19` (~60d as of 2026-07-18 — within the 90d window; true current freshness is unverifiable under read-only).
- **ROOT:** raw base of **env-swfl** (realized flood loss) AND **hurricane-tracks-fl** (HURDAT2×NFIP join). `consuming_pack: [env-swfl, hurricane-tracks-fl]` (registry L805).
- **DATA WE GET:** 448,381 NFIP paid-claim rows (as_of 2026-05-31), FL state, SWFL core Lee+Collier+Hendry (FIPS 12071/12021/12051). Table `data_lake.fema_nfip_claims` (dlt_schema_name `fema_nfip_tier2`). Columns read: year_of_loss, date_of_loss, county_code, reported_zipcode, amount_paid_on_{building,contents,ico}_claim, building_property_value (fema-nfip-source.mts:193-211).
- **DATA AVAILABLE, unpulled:** FEMA "NFIP Residential Penetration Rates" (real dataset — code substitutes a static `INSURED_PENETRATION_FACTOR=0.3` NSI proxy for exactly this); Policies-in-Force dataset; Community Status Book. None pulled (registry L820).
- **ROUTES:**
  - Ingest: `ingest/pipelines/fema/resources.py` (dlt) → `data_lake.fema_nfip_claims` + SQL views `fema_nfip_county_year` / `fema_nfip_zip_window_agg`.
  - → **env-swfl** via `refinery/sources/fema-nfip-source.mts:755-815` (reads the two views + raw 2024-only claims for the Helene/Milton date split) → emits nfip-swfl-aggregate / nfip-storm-total / nfip-zip-aggregate / nfip-zip-window-full fragments → `refinery/packs/env-swfl.mts:835-993` key_metrics (swfl_storm_year_claims_usd, swfl_nonstorm_claims_baseline, swfl_post_ian_claims_ratio, per-ZIP swfl_zip_*_flood_aal_*) + `flood_by_zip` detail table.
  - env-swfl flood surface → **ZIP report**: `lib/zip-report/load-ranked-signals.ts:75-105` reads env-swfl `flood_by_zip` table + `swfl_zip_<zip>_flood_aal_*` metrics → flood gradient shape-fill (`computeZipGradient`) → `app/r/zip-report/[zip]/page.tsx` + `lib/zip-dossier.ts`. (This is the ONLY dedicated live web surface for a batch brain.)
  - → **hurricane-tracks-fl** via `refinery/packs/hurricane-tracks-fl.mts:141-176` — DuckDB cross-tier join `pg.data_lake.fema_nfip_claims` (Postgres) × HURDAT2 Parquet → nfip_paid_per_landfall / worst_storm_county metrics.
  - → master dossier: env-swfl edge `modifier, critical:true` (master.mts:289); hurricane-tracks-fl edge `input` (master.mts:326).
  - env-swfl → chat (reach.ts:91-92, phrasing "flood / insurance / aal / nfip / storm / surge / hurricane"; skipped for non-explicit-ZIP per conversation-path.ts:368) and → AI-authored email chart (chart-for-question.ts CHART_FALLBACKS, env-swfl only). NOTE its dedicated `flood-aal` chart-for-intent case returns null / deferred (build-chart-for-intent.mts:68-70) — its comment "env-swfl has no detail_tables" is STALE: env-swfl DOES emit a `flood_by_zip` detail table (consumed by the ZIP-report route above), so the chart is deferred, not data-less.
  - **NON-BRAIN surface (live-via-non-brain):** `lib/charts/hurricane-series.ts` is a HARDCODED `HURRICANE_STORM_DAMAGE` snapshot (Charley/Irma/Ian/Helene/Milton NFIP paid) pulled by a direct `mcp__lake__query_lake` against `data_lake.fema_nfip_claims` — its header explicitly says it does NOT read the hurricane-tracks-fl brain (that brain md is stale + never published a per-storm breakdown). Rendered by `components/charts/HurricaneRingChart.tsx` on `app/charts/page.tsx`. So fema data reaches a public chart while bypassing both brains.
- **NOTES:** env-swfl ALSO queries the **FEMA NFHL flood-polygon layer** live on every build (`refinery/sources/env-swfl-source.mts`, hazards.fema.gov Layer 28) — a SEPARATE FEMA surface, NOT this `fema` registry entry (NFIP claims only). Both live-path NFIP views still filter to the pre-lock 6-county footprint, so fema-nfip-source re-filters to SWFL_FIPS (load-bearing, fema-nfip-source.mts:766-769). The `storm-timeline` deliverable frame (`lib/charts/svg/storm-timeline.ts` + `TimelineFrame.tsx` + bind-frame.ts case) is built and `fixtureOnly:false` but **PARKED** — it returns null until env-swfl emits a `storm_timeline` detail_table, which it does not today (bind-frame.ts:66-69, 374-376).

---

### usgs · cadence 30d · lane tier-1-duckdb
- **STATUS:** LIVE — env-swfl's hydro read since 07/19/2026. The Parquet is refreshed monthly (`usgs-monthly.yml` → `python -m ingest.duckdb_pipelines.usgs.pipeline`, writes `lake-tier1/environmental/usgs_water_swfl.parquet` + `_sites`).
- **ROOT:** IS a root (Tier-1 Parquet). The raw base of env-swfl's hydro metric.
- **DATA WE GET:** 4 parameters extracted per `ingest/duckdb_pipelines/usgs/constants.py`, ~580 USGS SWFL sites, vintage 2000-2026, ~4.7M daily rows.
- **DATA AVAILABLE, unpulled:** same sites in the same fetch also carry streamflow/discharge, water temperature, salinity, dissolved oxygen/pH — free, not extracted.
- **ROUTES:** `ingest/duckdb_pipelines/usgs/{fetch,pipeline}.py` → the two Parquets → `refinery/sources/usgs-water-source.mts` (makeDuckDBSource dual-read: daily × sites join for the Caloosahatchee HUC filter, latest-date median) → hydro-swfl-aggregate fragment → `refinery/packs/env-swfl.mts` `swfl_sw_stage_caloosahatchee_ft` key_metric → `/api/b/env-swfl` + master dossier.
- **NOTES:** Was "fresh but unread" until the 07/19/2026 repoint closed the USGS split (P8 zombie fix). Workflow header confirms it "supersedes the deprecated `ingest/pipelines/usgs` (deleted in PR 3)."

---

### usgs_tier2 · DROPPED 07/19/2026 (zombie read fixed, corpse deleted)
- **STATUS:** gone. `data_lake.usgs_daily` (605-row stub) + `data_lake.usgs_sites` + the orphan view
  `usgs_caloosahatchee_stage_latest` dropped (migrations/20260719_drop_usgs_tier2_corpses.sql) after
  the env-swfl rebuild was verified on SERVED bytes: `/api/b/env-swfl` serves 3.36 ft @ 07/09 from
  the tier-1 Parquet dual-read (the frozen stub's last value was 3.17 @ 05/17). Registry entry
  retired; check `usgs_tier2_orphan` closed.
- **NOTES:** the frozen stub was not merely stale — it was a degenerate one-shot load (~1 row/site,
  2 of 4 params) while the Parquet holds the full 4.7M-row series. History: P8 zombie postmortem
  (`docs/audits/2026-07-18-data-consolidation/P8-bypass-and-zombie.md`).

---

### noaa_ghcn_rainfall · cadence 30d · lane tier-2
- **STATUS:** live (`noaa-ghcn-rainfall-monthly.yml`, 5th of month; first runs 06/05 + 07/05/2026 both GREEN, registry L1488).
- **ROOT:** raw base of **env-swfl** (rainfall metric).
- **DATA WE GET:** annual precipitation totals only, 4 Lee+Collier anchor stations (USW00012835 Page Field, USW00012894 RSW, USW00012897 Naples Muni, USC00086078 Naples COOP). Table `data_lake.noaa_ghcn_rainfall` (one row per station per year). Source: AWS Open Data `s3://noaa-ghcn-pds/csv/by_year/` (no auth).
- **DATA AVAILABLE, unpulled:** the same yearly file carries temperature, wind, humidity, pressure at zero extra cost — only PRCP extracted (registry L1502).
- **ROUTES:** `ingest/pipelines/noaa_ghcn_rainfall/` (dlt) → `data_lake.noaa_ghcn_rainfall` → `refinery/sources/noaa-ghcn-rainfall-source.mts:85-114` (reads station/year/annual_in/day_count; `MIN_DAY_COUNT=300` completeness floor; latest year with ≥1 Lee AND ≥1 Collier station) → ghcn-rainfall-aggregate fragment → `refinery/packs/env-swfl.mts:901-913` `swfl_rainfall_annual_in` key_metric + conclusion prose → `/api/b/env-swfl` + master dossier.
- **NOTES:** Empty in fixture mode (source returns `[]`, env-swfl degrades silently). Known floor issue: USC00086078 chronically under-reports (<300 days) and can drop out — open check `noaa_ghcn_missing_station_masked_by_floor` (registry L1495).

---

### hurdat2_fl · cadence 365d · lane tier-1-duckdb
- **STATUS:** live (`hurdat2-annual.yml`; NHC publishes HURDAT2 annually).
- **ROOT:** IS a root (Tier-1 Parquet `lake-tier1/environmental/hurdat2_fl.parquet`). Raw base of **hurricane-tracks-fl**.
- **DATA WE GET:** full Atlantic HURDAT2 best-track, storms touching the FL bounding box, 6-hourly obs (position/wind/pressure/Saffir category), 1851-2024 (registry L366).
- **DATA AVAILABLE, unpulled:** NHC file (already downloaded) also carries wind-radii/RMW fields (34/50/64kt quadrant radii + radius-of-max-wind, since 2004) — parser explicitly discards 16 per obs, zero extra fetch. Companion NE/NC Pacific HURDAT2 DB at same URL — deliberately/correctly excluded (FL-only product) (registry L369).
- **ROUTES:** `ingest/duckdb_pipelines/hurdat2_fl/pipeline.py` (from nhc.noaa.gov/data/hurdat/) → `hurdat2_fl.parquet` → `refinery/packs/hurricane-tracks-fl.mts:262-279` (`makeDuckDBSource`, parquet view `tracks`) → DuckDB cross-tier join with `pg.data_lake.fema_nfip_claims` (query L93-176: haversine within 50mi of SWFL county centroids, landfall proxy record_id='L' within 30mi) → key_metrics hurricane_landfalls_30yr / cat3plus_passes_within_50mi_30yr / nfip_paid_per_landfall / worst_storm_county / most_recent_landfall / closest_pass_5yr → `/api/b/hurricane-tracks-fl` + master dossier (edge `input`, master.mts:326) + chat (reach.ts:83-84, phrasing "landfall / hurricane history / closest pass / cat 3-5").
- **NOTES:** Cross-tier brain — HURDAT2 supplies storm geometry, `fema` (NFIP claims) the realized-loss half. Distinct from storm-history-swfl (NOAA Storm Events, different upstream). **No dedicated chart/page/email surface** (verified: the /charts hurricane chart deliberately bypasses this brain — see fema non-brain surface). Surfaces via /api/b + master + chat only.

---

### storm_history_swfl · cadence 30d · lane tier-1-duckdb
- **STATUS:** live (`storm-history-monthly.yml`).
- **ROOT:** IS a root (Tier-1 Parquet `lake-tier1/environmental/storm_events_swfl.parquet`). Raw base of **storm-history-swfl**.
- **DATA WE GET:** NOAA Storm Events with an event-type allowlist, 1996-2025 modern-schema vintage, Lee+Collier (Charlotte removed 07/07/2026). ~1,178 live rows (source doc L24). Major event types: Hurricane, Tropical Storm, Tornado, Flash Flood, Storm Surge/Tide.
- **DATA AVAILABLE, unpulled:** the allowlist silently excludes **Flood** and **Waterspout** event types (unlike Drought/Frost-Freeze which are excluded on purpose) — a real gap for a FL product (registry L388).
- **ROUTES:** `ingest/duckdb_pipelines/storm_history_swfl/pipeline.py` (from ncei.noaa.gov storm events csv) → `storm_events_swfl.parquet` → `refinery/sources/storm-history-source.mts:239-497` (DuckDB httpfs read of the Parquet; pre-aggregates per-county + corpus rollup, damage-string parse, distinct-tropical-cyclone 10yr set, last billion-dollar event) → `refinery/packs/storm-history-swfl.mts:201-298` key_metrics storm_property_damage_events_10yr / storm_tropical_cyclones_10yr / storm_major_storm_count_30yr / storm_total_storm_count_30yr / storm_last_billion_dollar_event_{date,name,type} → `/api/b/storm-history-swfl` + master dossier (edge `input`, master.mts:325) + chat (reach.ts:87-88, phrasing "storm history / storm events / billion-dollar").
- **NOTES:** Direction bearish when ≥3 distinct tropical cyclones in trailing 10yr (structurally always true for SWFL — Irma/Ian/Helene/Milton). Vintage end bump lives in `ingest/duckdb_pipelines/storm_history_swfl/constants.py` (YEAR_RANGE_END). **No dedicated chart/page/email** — /api/b + master + chat only.

---

### fdot · cadence 365d · lane tier-2
- **STATUS:** live (`fdot-aadt-annual.yml`; `consuming_pack: [traffic-swfl, logistics-swfl-nowcast]`, registry L1029). `MAX(inserted_at)=2026-05-18`.
- **ROOT:** raw base of **traffic-swfl** AND **logistics-swfl-nowcast**.
- **DATA WE GET:** 103,662 AADT segment rows (as_of 2026-05-31), statewide layer filtered to Lee/Collier (+Charlotte for the Ian-recovery exception). Table `data_lake.fdot_aadt_fl` (dlt_schema_name `fdot_aadt_tier2`). Columns: `yearx`, county, roadway, desc_frm, desc_to, aadt, aadtflg, tfctr, shape_length (fdot-source.mts:66-77). `LATEST_FDOT_YEAR=2025`.
- **DATA AVAILABLE, unpulled:** FDOT ArcGIS org runs 1,586 public layers; we use 1. Untouched: crash/fatality data (standout safety signal), bridge inventory/condition, 5-Year Work Program, transit ridership, bike/ped infrastructure (registry L1044).
- **ROUTES:**
  - Ingest: `ingest/pipelines/fdot/resources.py` (dlt) → `data_lake.fdot_aadt_fl` + view `fdot_aadt_county_year`.
  - → **traffic-swfl** via `refinery/sources/fdot-source.mts:228-269` (reads `fdot_aadt_county_year` view + raw Lee/Collier cohort segments for YoY self-join) → `refinery/packs/traffic-swfl.mts:293-360` key_metrics aadt_swfl_avg / aadt_yoy_pct / aadt_5yr_cagr / truck_share_median / post_ian_recovery → `/api/b/traffic-swfl` + master dossier (edge `input`, master.mts:292) + chat (reach.ts:157-158, phrasing "traffic / aadt / congestion / commutes / road volumes").
  - → **logistics-swfl-nowcast** via `refinery/sources/fdot-freight-source.mts` (freight-coded I-*/US-* segments, same table) → `refinery/packs/logistics-swfl-nowcast.mts:362-661` z-score deviation vs rolling FDOT history (current_activity, deviation_z, shock_state, baseline_validity_flag) → `/api/b/logistics-swfl-nowcast` + master dossier (edge `input`, master.mts:291) + chat (reach.ts:189). This pack ALSO write-backs `data_lake.fdot_freight_nowcast_shock_log` (brain write-back during Stage-4, NOT ingest — registry L2128). No dedicated chart/page/email.
- **NOTES — year-column drift history (MEMORY: FIXED):** the raw layer's year column is `yearx` (what fdot-source.mts reads); legacy REST citation URLs in `traffic-swfl.mts:182` and `logistics-swfl-nowcast.mts:306` still hardcode `year_` (cosmetic citation strings, not the live read path). The prior break — FDOT renaming the year column between vintages — is the `fdot-year-column-drift` postmortem, resolved. logistics-swfl-nowcast ALSO takes a `brain-input` edge from logistics-swfl (FAF5 context, display-only under Path B — not fdot).

---

### fdle_crime_swfl · cadence 90d · lane tier-2
- **STATUS:** live (`fdle-crime-quarterly.yml`, non-dlt pipeline; activated 2026-06-06, issue #59). `consuming_pack: safety-swfl`.
- **ROOT:** raw base of **safety-swfl**.
- **DATA WE GET:** county-total property crime (burglary, larceny-theft, motor-vehicle-theft, arson → total_property_crimes + property_crime_per_1k), Lee+Collier, 2022-2024 backfilled (2021 excluded — Cape Coral PD didn't report). Table `public.fdle_crime_swfl`. Source = FBI Crime Data Explorer NIBRS API (coverage-matched county rate; replaced unfit FIBRS ~2.3x undercount). County total is computed by summing already-fetched city detail then discarding the breakdown (registry L1153).
- **DATA AVAILABLE, unpulled:** city-level crime AND offense-type breakdown are already computed in a local variable and discarded — no new API call needed, just stop discarding. Ceiling: sub-county grain needs a per-agency NIBRS-certification coverage check first (registry L1156).
- **ROUTES:** `ingest/pipelines/fdle_crime_swfl/cde.py` (needs `FBI_CDE_API_KEY` from api.data.gov) → `public.fdle_crime_swfl` → `refinery/sources/fdle-crime-source.mts:116-137` (reads last ~5 data_years) → `refinery/packs/safety-swfl.mts:289-393` key_metrics safety_property_crime_per_1k_{lee,collier,swfl} / _yoy_pct_{swfl,lee,collier} / safety_total_property_crimes_{lee,collier} → `/api/b/safety-swfl` + master dossier (edge `input`, master.mts:298) + chat (reach.ts:161-162, phrasing "crime / safety / burglary / larceny / theft"). No dedicated chart/page/email.
- **NOTES:** safety-swfl `domain: "real-estate"` (crime as an underwriting input), NOT a public-safety product. Coverage-shift guard suppresses YoY direction to neutral when covered-population moves >10% (agency roster change, e.g. Cape Coral PD entering in 2022). Distinct concern: the daily-digest "City Voices" crime gate (MEMORY) is an email-content policy, unrelated to this brain's data path.

---

## Cross-cutting findings
- **USGS split is broken both ways** (the batch's headline corpse). `usgs` Parquet lane = fresh-but-unconsumed; `usgs_tier2` Postgres = frozen-but-live-read. env-swfl reads the frozen orphan (`data_lake.usgs_daily`, last write 2026-05-19); the monthly Parquet reaches no brain. Zombie verdict + "producing module deleted (PR 3)" both VERIFIED in code (`usgs-monthly.yml` L6, `check-prepush-gate.mjs:276`, absent `ingest/pipelines/usgs`). Open check `usgs_tier2_orphan`.
- **fema feeds two brains** — env-swfl (via fema-nfip-source.mts + the two SQL views) and hurricane-tracks-fl (via DuckDB pg-attach in the HURDAT2 join). VERIFIED.
- **fdot feeds two brains** — traffic-swfl (county-year view) and logistics-swfl-nowcast (freight-coded segments); the latter also write-backs a shock-log table. `yearx` vs legacy-citation `year_` drift is cosmetic-only now (read path uses `yearx`); the historical drift break is FIXED.
- **env-swfl is the heaviest downstream consumer** in this batch: it pulls fema (NFIP) + usgs_tier2 + noaa_ghcn_rainfall (+ live FEMA NFHL polygons, unregistered), and is the ONLY batch brain wired past /api/b + master + chat into a dedicated web surface (the ZIP-report flood gradient) and the AI-authored email chart.
- **Downstream reality (corrected after full trace):** the other 5 batch brains have NO dedicated chart/page/email — they surface only via `/api/b/<id>`, master's dossier, and chat routing (`reach.ts` TOPIC_TO_SLUG). Chat itself does not chart (lane deleted 07/09/2026). Two storm/hurricane display surfaces exist but are DECOUPLED from the brains: `storm-timeline` (deliverable frame) is PARKED awaiting an env-swfl `storm_timeline` table, and the `/charts` HurricaneRingChart runs off a hardcoded `hurricane-series.ts` lake-query snapshot that deliberately bypasses the hurricane-tracks-fl brain.


## === civic-news ===

# Batch 8 — Civic / News / Licenses / Social — Source Route Catalog

Read-only route trace. 11 sources. Verified against `ingest/cadence_registry.yaml`,
`refinery/sources/*`, `refinery/packs/*`, `refinery/packs/master.mts`, `app/*`, `lib/*`,
and the GHA workflow files.

**Shared serve chain for every LEAF brain below** (not repeated per-entry): a brain's
`--- OUTPUT ---` is rolled into `master` per its `input_brains[]` edge, and every brain
(leaf or master) is served generically at:
- `app/api/b/[slug]/route.ts` — MCP + tiered JSON API (`/api/b/<brain>?view=speak&tier=N`)
- `app/r/[slug]/page.tsx` — generic brain report page (`/r/<brain>`)
No brain in this batch has a *dedicated* `/r/` page (only cre-swfl, communities-swfl,
housing-swfl, zip-report, should-i-sell, back-on-market do).

master.mts edges relevant here (refinery/packs/master.mts): `sector-credit-swfl` input (:233/:287),
`city-pulse-swfl` input (:247/:301), `news-swfl` **modifier** (:249/:303), `licenses-swfl` input
(:255/:327), `condo-sirs-swfl` input (:256/:328). `corridor-pulse-swfl` is NOT a direct master
input — it is a brain-input edge into `cre-swfl`, which is a master input.

---

### news_swfl · cadence 1d · lane tier-2
- STATUS: **live-via-non-brain-surface** (enum) — news LAKE, not a brain. BUT also the upstream CORPUS for two brains (city-pulse-swfl + corridor-pulse-swfl distill); one app-cron leg is broken.
- ROOT: **IS a root** — `data_lake.news_articles_swfl` is the SWFL news lake; feeds app + email surfaces directly (no brain) AND is the distill corpus for the pulse brains.
- DATA WE GET: 4 named sources scraped daily via crawl4ai — Naples Daily News (business), Fort Myers News-Press (business), Lee County govt releases, Collier County govt news. Cols: headline, article_url, body_text, source_name, published_date, swfl_relevance, scraped_at, processed_at.
- DATA AVAILABLE, unpulled: 6 live SWFL outlets not scraped — Gulfshore Business, WINK News (fox4now redirects in — one outlet), NBC2/WBBH (gulfcoastnewsnow), WGCU news, Cape Coral Breeze, Florida Weekly (separate Naples/FM editions).
- ROUTES (real chain):
  - Ingest: `ingest/pipelines/news_swfl/pipeline.py` (crawl4ai) → `data_lake.news_articles_swfl`.
  - `/desk` Flash feed: `lib/desk/loaders.ts:404` `loadNews()` (limit 6, newest scrape) → assembled in `loadDeskData` (`:903`, `:1154` flash) → `app/desk/page.tsx` / `app/desk/_components/FlashFeed.tsx`.
  - `/insiders` wire: `app/insiders/_lib/desk-stats.ts:113-123` `newsThisMonth` count (this-month story count) → `app/insiders/page.tsx`.
  - Insiders EMAIL: `lib/email/insiders/dossier.ts:58-60` reads news_articles_swfl (headline/url/body/source/date/relevance).
  - Project-alert cron: `app/api/cron/news-crawl/route.ts` reads unprocessed rows → `extractEventFromArticle` → `scoreEvent` → `insertProjectEvent` → `project_events`. **BROKEN leg:** KNOWN-DEBT at `:40-43` — selects `projects.lat/lng` which don't exist on the live table, so this cron 500s at the projects step every run (deferred per operator 2026-06-26).
  - **BRAIN CORPUS (load-bearing, retrofit 07/07/2026):** `ingest/lib/pulse_lake.py:34` `load_recent_articles` (reads `data_lake.news_articles_swfl`, :28; 45-day pool, evicted by `ingest/pipelines/pulse_pool_evict.py` via `evict_stale_pool` :110) → imported by `ingest/pipelines/city_pulse/pipeline.py:37` (`build_capture`) → Sonnet distill → `data_lake.city_pulse` → **city-pulse-swfl brain → master** [LIVE, nightly]; and by `ingest/pipelines/city_pulse_corridors/pipeline.py:46` → `data_lake.city_pulse_corridors` → **corridor-pulse-swfl → cre-swfl → master** [code retrofitted; pipeline PAUSED/dispatch_only]. This retrofit replaced the paid `web_search_20250305` capture.
- NOTES: registry `consuming_pack: app/insiders` UNDER-states reach — it also feeds `/desk` flash, the insiders email, (attempts) `project_events`, AND is the distill corpus for city-pulse-swfl + corridor-pulse-swfl. `source_tag: news_crawl` was deleted 07/11/2026 (phantom field nothing read).

### city_pulse · cadence 1d · lane tier-1 (HYBRID: tier-1 freshness + tier-2 count_table)
- STATUS: **live** (enum) — nightly-gated.
- ROOT: **raw base of `city-pulse-swfl`** brain. CORPUS = news_swfl lake (`data_lake.news_articles_swfl` via `ingest/lib/pulse_lake.py`).
- DATA WE GET: 13 named SWFL cities scanned daily — Lehigh Acres, Cape Coral, Fort Myers, Naples, Estero, Bonita Springs, Fort Myers Beach, Sanibel, North Fort Myers, Marco Island, East Naples, North Naples, Golden Gate. One citation-backed fact per row (city, topic, fact, source_url, source_title, cited_text, captured_at, expires_at, run_at). Steady state ~207 non-expired rows; floor 50.
- DATA AVAILABLE, unpulled: config-only city adds — Immokalee, Ave Maria, Everglades City, Goodland, Chokoloskee, Copeland (Collier); Captiva, Pine Island, Alva, San Carlos Park (Lee).
- ROUTES:
  - Ingest: `ingest/pipelines/city_pulse/pipeline.py` — reads the news_swfl lake (`pulse_lake.load_recent_articles`, :37) + one Sonnet distill/city, `distill.py` writes rows deterministically (psycopg) → `data_lake.city_pulse`. Clocked by `nightly-chain.yml` (workflow_call; standalone `city-pulse-daily.yml` cron commented out).
  - Brain: `refinery/sources/city-pulse-source.mts` (`TABLE="city_pulse"`, non-expired filter) → `refinery/packs/city-pulse-swfl.mts` → BrainOutput (≤8 signals as key_metrics + `pulse_by_zip` detail table) → master (input edge).
- NOTES: hybrid entry — tier-1 `_tier1_inventory` freshness + `count_table: data_lake.city_pulse` gated by `assert_landed.py` (Phase 4), NOT the tier-2 volume probe. One of only 4 `nightly:` entries.

### city_pulse_corridors · cadence 7d · lane tier-1
- STATUS: **unwired** (enum; nearest fit) — pipeline code live but PAUSED (dispatch_only, cron off since 07/05/2026); brain code intact so it re-lights on dispatch.
- ROOT: **raw base of `corridor-pulse-swfl`** (tier-1 Parquet-upload watch on the corridor pulse). CORPUS = news_swfl lake (`data_lake.news_articles_swfl` via `pulse_lake.py`, retrofit built but pipeline paused).
- DATA WE GET: 27 verified CRE corridors — Lee (17) + Collier (9, all Naples-labeled), weekly. Corridor-grain citation-backed current-events facts.
- DATA AVAILABLE, unpulled: Alico Road + Corkscrew Road (Lee, both real & missing); zero corridor coverage for Marco Island (though city_pulse tracks it as a city).
- ROUTES:
  - Ingest: `ingest/pipelines/city_pulse_corridors/pipeline.py` (reads news_swfl lake via `pulse_lake.load_recent_articles`, :46) → `data_lake.city_pulse_corridors` (+ tier-1 Parquet `lake-tier1/city_pulse_corridors/`). Workflow `corridor-pulse-weekly.yml` — **schedule commented out, PAUSED 07/05/2026** (paid web_search spend control); `workflow_dispatch` only. (Pipeline code was retrofitted to the free news lake 07/07/2026, but the workflow stays dispatch-only.)
  - Brain: `refinery/sources/corridor-pulse-source.mts` (`TABLE="city_pulse_corridors"`) → `refinery/packs/corridor-pulse-swfl.mts` → BrainOutput → **brain-input edge into `cre-swfl`** (NOT direct to master; makeBrainInputSource) → cre-swfl → master.
  - Public: corridor data also surfaces on `app/r/cre-swfl/*` (corridor-metrics / corridors.ts / `[corridor]/page.tsx`) via the cre-swfl brain.
- NOTES: `consuming_pack: [corridor-pulse-swfl, cre-swfl]`.

### city_pulse_corridors_tier2 · cadence 7d · lane tier-2
- STATUS: **unwired** (enum; nearest fit) — PAUSED (dispatch_only), same pipeline as above; this is a WATCHDOG entry, not a second scrape.
- ROOT: **raw base of `corridor-pulse-swfl`** — same table `data_lake.city_pulse_corridors`; the tier-2 Postgres recency watchdog (freshness_column `captured_at`, 21-day window, NO row floor).
- DATA WE GET / unpulled: identical to `city_pulse_corridors` (same table; registry points back to that entry's source_scope).
- ROUTES: same brain chain as `city_pulse_corridors` (corridor-pulse-swfl → cre-swfl → master). One `corridor-pulse-weekly.yml` workflow backs BOTH registry entries.
- NOTES: the tier-1 entry watches only the Parquet upload; this tier-2 entry catches "cron ran green but distill wrote 0 rows to Postgres for weeks" (the silent-stop class). Overlap is by design — two failure modes, one table.

### dbpr_press_releases · cadence 7d · lane tier-2
- STATUS: **live** (pipeline healthy) — but SOURCE is quiet (newest release dated 02/07/2025).
- ROOT: **raw base of `news-swfl`** brain (this is SourceA — Sonnet-enriched, aggregate/announced signal).
- DATA WE GET: single DBPR press-release feed, fully paginated (30 pages = complete 2016–2026 history, 151 rows). Sonnet fills summary/topics/affected_industries/geographic_mentions/is_swfl_relevant. Table `public.dbpr_press_releases`; freshness on `scraped_at` (pipeline-alive, source frozen).
- DATA AVAILABLE, unpulled: none real — exhaustive single-feed scrape; `/news-room/` is the same page under a different nav slug. Only "gap" is the source itself going quiet.
- ROUTES:
  - Ingest: `dbpr-press-releases-weekly.yml` (Mon 09:00 UTC) crawl4ai → `public.dbpr_press_releases`.
  - Brain: `refinery/sources/dbpr-press-releases-source.mts` → `refinery/packs/news-swfl.mts` (SourceA; `toPressReleaseEnforcement`, core Lee/Collier relevance recomputed in-pack from geographic_mentions) → 5 of 9 key_metrics (dbpr_swfl_releases_90d, _prior_90d, dbpr_total_releases_90d, dbpr_releases_construction_90d, dbpr_releases_abt_90d) → master (**modifier** edge).
- NOTES: news-swfl direction vote is driven by SourceA momentum only.

### dbpr_public_notices · cadence 7d · lane tier-2
- STATUS: **live** (re-enabled 07/05/2026).
- ROOT: **raw base of `news-swfl`** brain (this is SourceB — hard-parsed, confirmed individual actions).
- DATA WE GET: respondent_name, county, case_number(s), violation_type, industry, response_deadline + LLM (Haiku) pdf_summary. Table `public.dbpr_public_notices`, freshness on `last_seen_at`. Scrape scope is 7-county (Lee, Collier, Charlotte, Sarasota, Manatee, Hendry, Monroe) — pack drops non-core counties before any count.
- DATA AVAILABLE, unpulled: PDF-binary fields (statute citations / civil-penalty dollar amounts as discrete fields) unconfirmed — only folded into pdf_summary prose.
- ROUTES:
  - Ingest: `dbpr-public-notices-weekly.yml` (Mon 10:00 UTC) → `public.dbpr_public_notices`.
  - Brain: `refinery/sources/dbpr-public-notices-source.mts` → `refinery/packs/news-swfl.mts` (SourceB; `toNoticeEnforcement`, core-county gate `CORE_NOTICE_COUNTIES = {lee, collier}`) → 4 of 9 key_metrics (dbpr_notices_construction_90d, dbpr_notices_abt_90d, dbpr_notices_lee_90d, dbpr_notices_collier_90d) → master (modifier edge, via news-swfl).
- NOTES: SourceA (announced) and SourceB (confirmed) counts must never be summed — enforced by a pack caveat.

### dbpr_re_licensees · cadence 7d · lane tier-2
- STATUS: **unwired** (enum) — pipeline live-scheduled weekly and data lands, but nothing in code reads the `new_re_agents` surface it feeds.
- ROOT: **IS a root** → feeds `public.new_re_agents` view (new-agent outreach radar) — a non-brain surface, NOT dead. But see finding.
- DATA WE GET: license_number, name (raw + split), address, county, license_type, rank, status, original/effective/expiration dates, employer name+license, alternate_license_number — Lee + Collier individual RE agents only (~30,100 kept: Lee 18,015 / Collier 12,085). Table `public.dbpr_re_licensees`, freshness on `last_seen_at` (merge, not replace). email column always NULL from this pipeline.
- DATA AVAILABLE, unpulled: no email or phone anywhere in RE_rgn7.csv (23 cols, mailing address only; DBPR online lookup also renders no email). Email is public record only via Chapter 119 records request — a separate lane, outside this pipeline.
- ROUTES:
  - Ingest: `ingest-dbpr-re-licensees.yml` (cron `0 12 * * 1` — Mon 12:00 UTC, **ACTIVE**), `ingest/pipelines/dbpr_re_licensees/pipeline.py` → `public.dbpr_re_licensees` → `public.new_re_agents` view (SQL: `docs/sql/20260711_dbpr_re_licensees.sql`).
  - Consumer: **NONE FOUND.** `grep new_re_agents` across `app/`+`lib/`+`refinery/` = 0 hits (only `database-generated.types.ts:2154` schema type + docs). The view exists and the data lands, but no page, email, or API surface renders it yet. Spec: `docs/superpowers/specs/2026-07-11-new-agent-radar-design.md`.
- NOTES: registry `consuming_pack: none` is literally true; the intended surface (new_re_agents view) is BUILT at the DB layer but has **no downstream reader in code** — the radar is not surfaced anywhere. This is the batch's clearest "half-wired" finding (see summary).

### fl_dbpr_licenses · cadence 30d · lane tier-2
- STATUS: **live**.
- ROOT: **raw base of `licenses-swfl`** brain.
- DATA WE GET: 9,623 active (Lee 6,342 + Collier 3,281) from 2 of 35 boards — Construction (06) + Electrical (08); county codes 46 (Lee) + 21 (Collier). Cols consumed: license_number, statuses, occupation_code, original_licensure_date, county_code. Table `data_lake.fl_dbpr_licenses`.
- DATA AVAILABLE, unpulled: 33 of 35 license boards (Community Association Managers board pairs directly with our SIRS data). Source CSV carries full street address in already-downloaded cols 5-10 but the column map DROPS them → zero ZIP-grain license data today (check dbpr_licenses_dropped_street_address).
- ROUTES:
  - Ingest: `ingest-fl-dbpr-licenses.yml` (5th of month 10:00 UTC) → `data_lake.fl_dbpr_licenses`.
  - Brain: `refinery/sources/fl-dbpr-licenses-source.mts` (`LICENSES_TABLE`) → `refinery/packs/licenses-swfl.mts` → key_metrics licenses_active_lee, _active_collier, licenses_new_12m_swfl, licenses_lapse_rate_swfl (headline/direction), licenses_cbc_share_swfl → master (input edge).
- NOTES: one GHA workflow (`ingest-fl-dbpr-licenses.yml`) lands BOTH fl_dbpr_licenses + fl_dbpr_applicants; one source connector reads both tables.

### fl_dbpr_applicants · cadence 30d · lane tier-2
- STATUS: **live**.
- ROOT: **raw base of `licenses-swfl`** brain (applicant-pipeline metric).
- DATA WE GET: occupation_code, first/last name, city/state/zip, county, phone — from `constr_app.csv` (15-col), Lee + Collier filtered (~8,727: Lee 6,031 / Collier 2,696). Table `data_lake.fl_dbpr_applicants` (write_disposition=replace, same run as licenses).
- DATA AVAILABLE, unpulled: 6 unused cols in the same downloaded CSV — Occupation Description (label), Middle/Second Name, Suffix, full Address 1/2/3 (dropped — only city/state/zip kept), Phone Extension.
- ROUTES:
  - Ingest: `ingest-fl-dbpr-licenses.yml` (same run as fl_dbpr_licenses) — the `applicants` resource → `data_lake.fl_dbpr_applicants`.
  - Brain: `refinery/sources/fl-dbpr-licenses-source.mts` (`APPLICANTS_TABLE`, :150) → `refinery/packs/licenses-swfl.mts` → key_metric `licenses_applicants_swfl` (leading indicator of future license growth) → master (via licenses-swfl input edge).
- NOTES: `dlt_schema_name` shares `fl_dbpr_licenses` with the licenses entry; distinguished by `count_table: data_lake.fl_dbpr_applicants`. Was silently 0 until fixed 2026-06-13 (wrong URL/layout/no county_code).

### dbpr_sirs_submissions · cadence 30d · lane tier-2
- STATUS: **live** — **NOT disabled** (task's suspicion refuted, see NOTES).
- ROOT: **raw base of `condo-sirs-swfl`** brain.
- DATA WE GET: full QIX hypercube pull from BOTH DBPR SIRS Qlik apps (pre-Jul-2025 appid 14f1ed21 + Jul-2025+ appid d217126f), Lee+Collier filtered: project_type/name, association_name, city, zip, county, dbpr_id (~1,358 SWFL rows; Lee 83 / Collier 159 at 2026-06-02 backfill era). Table `data_lake.dbpr_sirs_submissions`, freshness on `scraped_at`. Positive-signal-only register.
- DATA AVAILABLE, unpulled: none in this source — live QIX introspection shows each app exposes exactly one hypercube (7 / 5 cols), fully mapped. Reserve-study dollar figures / structural findings aren't published here at all (vendor ceiling).
- ROUTES:
  - Ingest: `dbpr-sirs-monthly.yml` — cron `0 7 1 * *` (1st of month 07:00 UTC, **ACTIVE**), `ingest/pipelines/dbpr_sirs/pipeline.py` (Qlik QIX websocket) → `data_lake.dbpr_sirs_submissions`.
  - Brain: `refinery/sources/dbpr-sirs-source.mts` → `refinery/packs/condo-sirs-swfl.mts` (public_label "Condo Milestones") → key_metrics sirs_confirmed_swfl, sirs_lee_count, sirs_collier_count, sirs_july2025_plus_count, sirs_result_truncated → master (input edge).
- NOTES: **CORRECTION to task note** — dbpr_sirs is NOT disabled. Workflow `dbpr-sirs-monthly.yml` has an active `schedule` cron `0 7 1 * *` (verified in file); registry shows first cron run 2026-06-02 success, 239 rows. (Minor registry-comment drift: comment says "first Monday of month" but cron is the 1st — cosmetic, not a disable.)

### fl_dor_sales_tax · cadence 30d · lane tier-2
- STATUS: **live**.
- ROOT: **raw base of `sector-credit-swfl`** brain (demand-side pulse branch; the SBA-loan MV is the other branch).
- DATA WE GET: monthly taxable sales ($) by kind_code/business_type per county (Lee + Collier), 24-month coverage per file. Table `public.fl_dor_sales_tax` (non-dlt; freshness via MAX(inserted_at)). ~40,140 rows backfill (cy0203–cy2425).
- DATA AVAILABLE, unpulled: none real — the 2 unused workbook sheets (Summary, Line Item Detail) are a statewide rollup + a static glossary, not data. County × business-type × month is the finest grain DOR publishes (no ZIP cut).
- ROUTES:
  - Ingest: `fl-dor-sales-tax-monthly.yml` (15th 11:00 UTC), `ingest/pipelines/fl_dor_sales_tax` → `public.fl_dor_sales_tax`.
  - Brain: `refinery/sources/fl-dor-sales-tax-source.mts` (`TABLE="fl_dor_sales_tax"`) → `refinery/packs/sector-credit-swfl.mts` (`flDorSalesTaxSource`; `buildSalesTaxSnapshot` combines Lee+Collier per month) → key_metrics swfl_taxable_sales_latest_usd, _yoy_pct, _trailing_12mo_usd → master (input edge, via sector-credit-swfl).
- NOTES: sector-credit-swfl also pulls SBA MV + 3 brain-inputs (franchise-outcomes, macro-us, macro-florida). fl_dor is the demand-pulse complement to the credit-risk core. (Pack comment loosely tags it "T1"; registry authority = tier-2.)

---

## Findings — unwired / corpse / corrections

1. **dbpr_re_licensees → new_re_agents = HALF-WIRED (real gap).** Pipeline is live-scheduled
   weekly (cron `0 12 * * 1`) and writes `public.dbpr_re_licensees` + the `public.new_re_agents`
   view, but **zero code reads `new_re_agents`** anywhere in `app/`, `lib/`, or `refinery/` (only
   the generated DB type + docs reference it). The outreach radar surface is built at the DB layer
   and NOT rendered by any page/email/API. `consuming_pack: none` is accurate; the intended
   non-brain surface has no reader yet.

2. **news_swfl project-alert leg is BROKEN.** `app/api/cron/news-crawl/route.ts` 500s every run —
   selects `projects.lat/lng` columns that don't exist on the live table (KNOWN-DEBT `:40-43`,
   deferred per operator 2026-06-26). The `/desk` flash feed, `/insiders` count, and insiders email
   legs of news_swfl are fine; only the news→project_events scoring cron is dead.

3. **dbpr_sirs is NOT disabled** (task's flag refuted). `dbpr-sirs-monthly.yml` has an active
   `schedule` cron `0 7 1 * *`; live monthly, brain wired into master.

4. **Both city_pulse_corridors entries are PAUSED (dispatch_only).** `corridor-pulse-weekly.yml`
   schedule is commented out since 07/05/2026 (paid web_search spend control). The brain code +
   cre-swfl brain-input edge are intact; the feed just isn't refreshing on a cron. (city_pulse
   itself is live/nightly — the tier-1 city entry vs. the two tier-1/tier-2 corridor watchdog
   entries are distinct and only the corridor pair is paused.)
