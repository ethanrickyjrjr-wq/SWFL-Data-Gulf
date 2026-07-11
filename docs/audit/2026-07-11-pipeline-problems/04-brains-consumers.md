# Consumer-side audit — brains/*.md, live API, brain→upstream mapping

Scope: CONSUMER side only (`brains/*.md`, `refinery/packs/*`, live `swfldatagulf.com` API). Read-only.
"Now" for all age/TTL math: **2026-07-11T08:19:22Z** (system clock at audit time). All findings below are
sourced from files in this repo or live HTTP responses fetched during this session — no memory, no
inference beyond what's cited.

---

## BRAIN FRESHNESS TABLE

41 files in `brains/*.md` (40 production packs + `test-alpha`, a test fixture — excluded from the
production count below). "Fresh?" = whether `refined_at + ttl_seconds > now`, i.e. the brain's own
freshness contract (the same math as `refinery/lib/freshness.mts:freshnessGate` / `dag.mts:brainStatus`).
**Every production brain is fresh per its own TTL contract as of audit time** — see LIVE API
SPOT-CHECKS and HELD-OR-FAILED PACKS for the caveats that don't show up in this table's raw numbers.

| Brain | As-of (refined_at) | Age (days) | TTL (days) | Fresh (own TTL)? | Confidence | Caveats present |
|---|---|---|---|---|---|---|
| active-listings-swfl | 2026-07-11 | 0 | 2 | Y | 0.80 | Y |
| active-rentals-swfl | 2026-07-11 | 0 | 8 | Y | 0.80 | Y |
| city-pulse-swfl | 2026-07-11 | 0 | 1 | Y | 0.80 | Y |
| communities-swfl | 2026-07-06 | 5 | 180 | Y | 0.80 | Y — self-reports empty (see HELD-OR-FAILED) |
| condo-sirs-swfl | 2026-06-29 | 12 | 30 | Y | 1.00 | Y |
| corridor-pulse-swfl | 2026-07-07 | 4 | 7 | Y | 0.80 | Y |
| cre-swfl | 2026-07-07 | 4 | 7 | Y | 0.84 | Y |
| econ-dev-swfl | 2026-07-07 | 4 | 7 | Y | 0.80 | Y |
| env-swfl | 2026-07-03 | 8 | 30 | Y | 1.00 | Y |
| fgcu-reri | 2026-06-29 | 12 | 30 | Y | 1.00 | Y |
| franchise-outcomes | 2026-07-03 | 8 | 90 | Y | 1.00 | Y — self-reports empty (see HELD-OR-FAILED) |
| freshness-pulse | 2026-07-11 | 0 | 1 | Y | 0.80 | Y |
| home-values-swfl | 2026-06-12 | 29 | 35 | Y | 0.60 | N |
| housing-swfl | 2026-06-29 | 12 | 35 | Y | 0.60 | N |
| hurricane-tracks-fl | 2026-06-19 | 22 | 365 | Y | 1.00 | Y |
| investor-zip-swfl | 2026-06-12 | 29 | 35 | Y | 0.78 | Y |
| labor-demand-swfl | 2026-06-29 | 12 | 90 | Y | 1.00 | Y |
| licenses-swfl | 2026-06-29 | 12 | 30 | Y | 1.00 | N |
| listing-momentum-swfl | 2026-07-09 | 2 | 8 | Y | 0.80 | Y |
| logistics-swfl | 2026-07-03 | 8 | 30 | Y | 1.00 | Y |
| logistics-swfl-nowcast | 2026-07-03 | 8 | 30 | Y | 0.91 | Y |
| macro-florida | 2026-06-29 | 12 | 30 | Y | 1.00 | Y |
| macro-swfl | 2026-06-29 | 12 | 30 | Y | 1.00 | **Y — carries a frozen degradation caveat naming macro-florida (see below)** |
| macro-us | 2026-06-29 | 12 | 30 | Y | 1.00 | Y |
| market-heat-swfl | 2026-07-01 | 10 | 35 | Y | 0.60 | Y |
| market-temperature-swfl | 2026-07-01 | 10 | 35 | Y | 0.80 | Y |
| **master** | 2026-07-11 | 0 | 7 | Y | 0.90 | **Y — 153 entries, incl. the macro-florida phantom caveat + a live self-reported Collier permit staleness caveat (see below)** |
| news-swfl | 2026-07-07 | 4 | 7 | Y | 0.80 | Y |
| permits-commercial-swfl | 2026-06-29 | 12 | 365 | Y | 1.00 | Y |
| permits-swfl | 2026-07-07 | 4 | 7 | Y | 1.00 | **Y — self-reports Collier/Naples permit feed stale 68+ days (live, current — see below)** |
| price-distribution-swfl | 2026-07-09 | 2 | 8 | Y | 0.80 | Y |
| properties-collier-value | 2026-06-29 | 12 | 30 | Y | 0.88 | Y |
| properties-lee-value | 2026-06-29 | 12 | 30 | Y | 0.88 | Y |
| rentals-swfl | 2026-06-29 | 12 | 35 | Y | 0.60 | Y |
| rsw-airport | 2026-06-29 | 12 | 30 | Y | 1.00 | N |
| safety-swfl | 2026-06-29 | 12 | 90 | Y | 1.00 | Y |
| sector-credit-swfl | 2026-07-07 | 4 | 7 | Y | 1.00 | Y |
| seller-stress-swfl | 2026-06-29 | 12 | 30 | Y | 0.60 | Y |
| storm-history-swfl | 2026-06-29 | 12 | 365 | Y | 1.00 | Y |
| tourism-tdt | 2026-07-07 | 4 | 7 | Y | 1.00 | Y |
| traffic-swfl | 2026-07-11 | 0 | 30 | Y | 0.80 | Y |
| *test-alpha (fixture, not production)* | 2026-05-14 | 58 | 1 | **N (expired 57d)** | n/a | n/a |

**Not in this table at all: `tier-divergence-swfl`.** Registered in `refinery/packs/index.mts`, has a
built pack (`refinery/packs/tier-divergence-swfl.mts`) and a passing test file, but has **never rendered
a `brains/tier-divergence-swfl.md`**. See HELD-OR-FAILED PACKS.

Read as written: the raw "age in days" column looks alarming next to short TTLs (`home-values-swfl` /
`investor-zip-swfl` at 29 days against a 35-day TTL, `hurricane-tracks-fl` at 22 days against a 365-day
TTL), but every production brain is inside its own contract right now. The real problems in this fleet
are not expired TTLs — they're the caveat-hygiene and orphan-brain issues below.

---

## LIVE API SPOT-CHECKS (verbatim tokens + caveats)

All fetched live via `curl` against `https://www.swfldatagulf.com` during this session.

### `GET /api/b/master?view=speak&tier=1&v=5` — HTTP 200
```
Mixed read (magnitude 43%, confidence 90%). Read is mixed (moderate magnitude). Note conflicts:
national macro (bearish) vs SWFL building permits (bullish).

Full breakdown → https://www.swfldatagulf.com/r/master

_Freshness:_ as of 07/11/2026
```
Tier-1 speak view does **not** expose the raw `freshness_token` string — only a human date. Confirmed
by reading `app/api/b/[slug]/route.ts`: `view=speak` returns plain text (or a JSON envelope with
`&format=json`); the raw token only appears in the frontmatter/HTML-comment served by the **no-`view`**
raw-markdown path, or in the `format=json` envelope's `freshness_token` field.

### `GET /api/b/master?view=speak&tier=1&v=5&format=json` — HTTP 200
Verbatim: **`"freshness_token":"SWFL-7421-v100-20260711"`** — matches `brains/master.md` exactly
(`<!-- FRESHNESS: v100 | Token: SWFL-7421-v100-20260711 -->`). Confirms the deployed production brain is
byte-identical to the current repo working tree for `master` (no drift between last GHA rebuild and this
checkout).

### `GET /api/b/master` (raw, no `view` param) — HTTP 200
```
<!-- FRESHNESS: v100 | Token: SWFL-7421-v100-20260711 -->
---
brain_id: master
version: 100
refined_at: 2026-07-11T06:32:37Z
freshness_token: SWFL-7421-v100-20260711
ttl_seconds: 604800
...
```

### `GET /api/b/master?view=speak&tier=2&v=5` — HTTP 200 — **the important one**
Caveats block, verbatim (top of the truncated live list; full list is 153 entries per `brains/master.md`):
```
- flood barrier active: 4 barrier ZIPs, worst-case AAL $32,610/insured property
- No figures published: this source has not yet received its first real SBA FOIA load. A synthetic
  development sample exists for offline testing only and is never shipped.
- Broker-survey (MarketBeat) coverage is incomplete for some areas this build...
- FRED can revise recent observations within ~30 days of first publication...
- Census CBP data is an annual snapshot...
- BLS LAUS data for 2026-M04 is preliminary...
- Upstream brain 'Florida macro' failed to rebuild on 06/29/2026; using last good read from
  06/29/2026 (v23).
- Sectors with fewer than 5 resolved loans are not ranked...
- …and 82 more in the full audit.
```
The raw JSON in `brains/master.md` (line 724) has the machine form of that same caveat:
`"Upstream brain 'macro-florida' failed to rebuild on 2026-06-29; using last good read from 2026-06-29
(v23)."` **This is a live, user-facing caveat served today (2026-07-11) about an event dated 12 days
earlier.** Traced this to source — see HELD-OR-FAILED PACKS for the mechanism; it is a frozen/phantom
caveat, not an active failure (macro-florida itself is fresh, v23, confidence 1.0, well inside its
30-day TTL).

Also live in the same tier-2 response: `brains/master.md` line 766's Collier/Naples permit staleness
caveat is **not** in the truncated tier-2 top-8 shown above, but is present verbatim in the full caveats
array — see permits-swfl below, which IS a currently-true, live degradation (unlike the macro-florida one).

### `GET /api/b/env-swfl?view=speak&tier=2&v=5` — HTTP 200
Freshness line: `_Freshness:_ as of 07/03/2026`. 6 caveats served, all methodology/measurement-limitation
notes (WGS84 area units, NFIP policyholder-only undercount, 2020-ACS insured-property proxy, USGS
provisional-qualifier revision window, GHCN-Daily station-point vs areal rainfall). No staleness or
degradation caveats. Matches `brains/env-swfl.md` exactly.

### `GET /api/b/cre-swfl?view=speak&tier=2&v=5` — HTTP 200
Freshness line: `_Freshness:_ as of 07/07/2026`. One caveat: "Broker-survey (MarketBeat) coverage is
incomplete for some areas this build — those areas are not reflected in the survey-backed rent and
vacancy metrics." No staleness/degradation caveat. Matches `brains/cre-swfl.md`.

### `GET /api/b/tier-divergence-swfl?view=speak&tier=1&v=5` — **HTTP 404**
```json
{"error":"brain not found"}
```
Confirms live: this registered pack has never produced a servable brain. See HELD-OR-FAILED PACKS.

---

## BRAIN→UPSTREAM MAP

Built by tracing each pack's `sources[]` imports in `refinery/packs/*.mts` into the connector files in
`refinery/sources/*.mts`, grepping each connector for `data_lake.*` / `lake-tier1/*` literals, and
cross-checking against the live-served citations for a few spot-checked brains. `brain-input:*` edges
(thin-pipe reads of another brain's `--- OUTPUT ---`, never raw data) are listed separately.

| Brain | Direct data_lake / lake-tier1 dependencies | brain-input upstreams |
|---|---|---|
| active-listings-swfl | `data_lake.listing_active_stats` (view), `data_lake.listing_state` | — |
| active-rentals-swfl | `data_lake.rental_listing_stats` (view), `data_lake.market_details_swfl` | — |
| city-pulse-swfl | `data_lake.city_pulse` | — |
| communities-swfl | `data_lake.community_profiles`, `data_lake.neighborhood_stats` | — |
| condo-sirs-swfl | `data_lake.dbpr_sirs_submissions` | — |
| corridor-pulse-swfl | `data_lake.city_pulse_corridors` | corridor-pulse-swfl (self-referential brain-input wrapper in the pack file) |
| cre-swfl | `data_lake.active_listings_cre`, `data_lake.local_cre_context`, `data_lake.marketbeat_swfl`, `data_lake.city_pulse_corridors` | corridor-pulse-swfl, permits-swfl |
| econ-dev-swfl | `public.swfl_inc_announcements` (via cadence registry; not a literal grep hit in source) | — |
| env-swfl | `data_lake.fema_nfip_claims`, `data_lake.fema_nfip_county_year`\*, `data_lake.fema_nfip_zip_window_agg`\*, `data_lake.noaa_ghcn_rainfall`, `data_lake.usgs_daily`, **`data_lake.usgs_sites`** | — |
| fgcu-reri | `public.fgcu_reri_indicators` | — |
| franchise-outcomes | `lake-tier1/franchise/sba_foia_franchise_county.parquet` | — |
| freshness-pulse | `data_lake.daily_truth` | — |
| home-values-swfl | `data_lake.zhvi_swfl`, `data_lake.zhvi_zip_latest` (view) | — |
| housing-swfl | `lake-tier1/market/redfin_swfl.parquet` | — |
| hurricane-tracks-fl | `data_lake.fema_nfip_claims`, `lake-tier1/environmental/hurdat2_fl.parquet` | — |
| investor-zip-swfl | (reads ZHVI/ZORI via brain-input only) | home-values-swfl, rentals-swfl (implied; wrapper-only pack) |
| labor-demand-swfl | `data_lake.bls_oews_swfl` | — |
| licenses-swfl | `data_lake.fl_dbpr_licenses`, `data_lake.fl_dbpr_applicants` | — |
| listing-momentum-swfl | `data_lake.listing_momentum_stats` (view) | — |
| logistics-swfl | `lake-tier1/faf5/` (S3 parquet, via `faf5Source` — see note below) | — |
| logistics-swfl-nowcast | `data_lake.fdot_aadt_fl`, `data_lake.fdot_freight_nowcast_shock_log`\*\* | logistics-swfl (implied) |
| macro-florida | `public.*` FRED series (no literal table grep hit; FRED API-backed) | macro-us |
| macro-swfl | `data_lake.bls_laus`, `data_lake.bls_qcew` | macro-florida |
| macro-us | FRED API-backed, no table literal | — |
| market-heat-swfl | `lake-tier1/market/market_heat_core_swfl.parquet`, `lake-tier1/market/market_heat_hotness_swfl.parquet` | — |
| market-temperature-swfl | `data_lake.market_details_swfl_latest` (view) | — |
| **master** | none directly — pure aggregator | all 38 other production brains (full list in `brains/master.md` `drivers[]`) |
| news-swfl | `public.dbpr_press_releases`, `public.dbpr_public_notices` | — |
| permits-commercial-swfl | `data_lake.mhs_permits_swfl`, `data_lake.mhs_jurisdiction_xwalk` | — |
| permits-swfl | `data_lake.collier_building_permits`, `data_lake.lee_building_permits` | — |
| price-distribution-swfl | `data_lake.listing_price_histogram_swfl_latest` (view) | — |
| properties-collier-value | `data_lake.collier_parcels`, `data_lake.collier_parcels_summary` (view), `data_lake.fhfa_hpi`, `data_lake.redfin_collier_market` | — |
| properties-lee-value | `data_lake.leepa_parcels`, `data_lake.leepa_parcels_summary` (view), `data_lake.leepa_parcels_sales_yearly` (view), `data_lake.fhfa_hpi`, `data_lake.redfin_lee_market` | — |
| rentals-swfl | `data_lake.zori_swfl`, `data_lake.zori_zip_latest` (view) | — |
| rsw-airport | `public.rsw_airport_monthly` | — |
| safety-swfl | `public.fdle_crime_swfl` | — |
| sector-credit-swfl | `public.fl_dor_sales_tax` | franchise-outcomes, macro-florida, macro-us |
| seller-stress-swfl | `lake-tier1/market/redfin_price_drops.parquet`, `redfin_contract_cancellations.parquet`, `redfin_delistings_relistings.parquet` | — |
| storm-history-swfl | `lake-tier1/environmental/storm_events_swfl.parquet`, `data_lake._tier1_inventory` (probe metadata) | — |
| tier-divergence-swfl (orphaned, never built) | `data_lake.tier_divergence_zip_latest` (view) | — |
| tourism-tdt | `public.fl_dor_tdt_collections` | — |
| traffic-swfl | `data_lake.fdot_aadt_fl`, `data_lake.fdot_aadt_county_year`\* (view) | — |

\* Verified plain (non-materialized) `CREATE OR REPLACE VIEW`, not a separate ingest: see UNMONITORED
UPSTREAMS for the full derived-view list and why this is not a freshness risk.
\*\* `data_lake.fdot_freight_nowcast_shock_log` is a **brain write-back**, not an ingest table — the
pack writes to it during its own run (confirmed via `cadence_registry.yaml`'s explicit exclusion note).

**Correction made during this audit:** `logistics-swfl.mts` contains defensive error-message *text*
mentioning `data_lake.faf_flows` ("confirm the dlt pipeline ran... GRANT SELECT... data_lake.faf_flows"),
which initially looked like a live Postgres dependency. Verified against the pack's actual `sources: [
faf5Source ]` wiring and `faf5-source.mts`'s `parquetViews` (no `pgAttachments`): the live connector
reads **only** the S3 parquet `lake-tier1/faf5/`, which the cadence registry does monitor
(`faf5` entry, `cadence_days: 365`). The error-message text is stale/vestigial, not a real code path —
**not** an unmonitored-upstream finding. (Confirmed also by the live-served citation on `master`'s
`inbound_freight_tons_swfl` metric: `"ORNL/FHWA Cold Lane Parquet"`, not a Postgres cache.)

---

## HELD-OR-FAILED PACKS

`brains/_build-report.json` (the latest/live rebuild record, `master` v100, run started
`2026-07-11T06:32:34.778Z`, finished `2026-07-11T06:32:37.993Z`) shows **only two status values across
all 41 outcomes: `"built"` (6) and `"skipped-fresh"` (35)**. No pack in this run reported `failed` or
`held` — the build-report file, by itself, shows a clean run. **The real degradation/held signal in this
fleet does not live in the build report — it lives in caveats baked into already-served brain output**,
found by reading the brains themselves and the live API:

1. **`tier-divergence-swfl` — permanently dark, not a build-report entry at all.** Registered in
   `refinery/packs/index.mts` (`tierDivergenceSwfl.id`), has a real pack file
   (`refinery/packs/tier-divergence-swfl.mts`) and test file, and its upstream data
   (`data_lake.tier_divergence_zip_latest`, a view over the monitored `tier_divergence_swfl` table) is
   live and monitored. But `brains/tier-divergence-swfl.md` **does not exist on disk**, the id appears
   **nowhere** in `brains/_build-report.json`, and it is **not** in `master`'s `input_brains`/`sources[]`
   (not in the 38-brain `drivers[]` list or the 38-row citation table in `brains/master.md`). Confirmed
   live: `GET /api/b/tier-divergence-swfl` → HTTP 404 `{"error":"brain not found"}`. Since the daily
   rebuild walks the DAG from `master`'s declared upstreams, this pack can never be built by the normal
   cron — it is orphaned from the pipeline entirely, not merely stale. Would need an explicit
   `--target-only tier-divergence-swfl` run and a `master` pack-definition edit adding it to
   `input_brains` to ever become reachable.

2. **`permits-swfl` — a live, currently-true, self-reported stale SOURCE inside an otherwise-fresh
   brain.** `brains/permits-swfl.md` (built 2026-07-07, 4 days old, confidence 1.0 — "fresh" by every
   metric in the table above) carries this caveat verbatim in its current OUTPUT block:
   *"Most recent Naples permit issued 2026-04-30; monthly XLSX has not refreshed for 68 days (cadence
   30d). Collier signal in this build is stale."* Cross-checked against `ingest/cadence_registry.yaml`'s
   `collier_permits` entry: fetcher was rewritten 2026-06-16 (crawl4ai UndetectedAdapter replacing a
   blocked Firecrawl/Spider path) with a note that a "GHA dry-run probe [is] required before re-enabling
   cron," and the last verified load was the April 2026 XLSX on 2026-05-27 — consistent with the brain's
   own 68-day-stale figure. **This caveat propagates verbatim into `master.md` (line 766)** via master's
   producer lifting `upstream.caveats` from every passing input brain (`refinery/packs/master.mts` line
   188). So master is currently serving a real, live, unresolved Collier/Naples permit staleness signal
   to every consumer today. Confidence on `permits-swfl` is NOT reduced by this caveat (still 1.0) — the
   caveat is advisory text only; nothing in Stage 4's confidence math (`applyStalenessCap`) reacts to a
   self-reported source-level staleness note, only to the DAG-level `stalenessCaveats`/`degradationCaveats`
   mechanism described next.

3. **`macro-swfl` / `master` — a frozen/phantom degradation caveat, not an active failure.** Both files
   carry, verbatim: *"Upstream brain 'macro-florida' failed to rebuild on 2026-06-29; using last good
   read from 2026-06-29 (v23)."* Traced the mechanism in `refinery/stages/4-output.mts`
   (`harvestUpstreams`, lines 152-213): when an upstream is in the `degradedUpstreamIds` set at build
   time, it stamps `` `Upstream brain '${id}' failed to rebuild on ${today}; using last good read from
   ${lastDate} (v${version}).` `` into that build's caveats — `today` is the date of **that specific
   build run**. Because the text is frozen at "06-29" across master's subsequent 100 versions (master
   was rebuilt again today, 2026-07-11, and the text did not update to today's date), this was a
   one-time event on `macro-swfl`'s 2026-06-29 build (`macro-swfl.md` itself hasn't rebuilt since — it's
   `skipped-fresh` every day since, still inside its 30-day TTL) that got baked into `macro-swfl.md`'s
   own `caveats[]` array permanently. `master`'s producer then re-lifts `macro-swfl`'s full caveat list
   on every master rebuild (same line-188 mechanism as finding #2), so this stale, date-frozen text keeps
   shipping to live users **every single day** until `macro-swfl` itself next rebuilds (~2026-07-29, when
   its 30-day TTL expires) — regardless of whether macro-florida has been fine since. **macro-florida
   itself is not currently degraded**: its own `brains/macro-florida.md` shows v23, confidence 1.0,
   refined 2026-06-29T16:30:38Z, well inside its 30-day TTL, with no self-reported issue — the most
   likely read is a same-day transient rebuild failure that self-healed later that day. **Finding is a
   caveat-hygiene bug (caveats have no TTL/expiry of their own and get re-propagated by every downstream
   rebuild), not a live dead upstream.** No other brain in the fleet carries this pattern — grepped all
   41 `brains/*.md` for `"failed to rebuild"` / `"last good read"`; only `macro-swfl.md` and `master.md`
   match.

4. **`communities-swfl` and `franchise-outcomes` — fresh-by-TTL but empty.** Both pass every freshness
   check in the table above (confidence 0.80 / 1.00 respectively, well inside TTL) while self-reporting
   zero real content:
   - `communities-swfl` conclusion (verbatim): *"communities-swfl: no community data yet. Neither
     data_lake.neighborhood_stats (Tier-1 parcel name-join) nor data_lake.community_profiles (Tier-2
     marketed communities) returned rows. Run the communities-backbone pipeline."* Its 0 upstream tables
     are also **not monitored anywhere** in `ingest/cadence_registry.yaml` — see UNMONITORED UPSTREAMS.
   - `franchise-outcomes` caveat (verbatim): *"No figures published: this source has not yet received
     its first real SBA FOIA load. A synthetic development sample exists for offline testing only and is
     never shipped."* Unlike communities-swfl, its Tier-1 source (`sba_foia_franchise_county.parquet`)
     **is** actively monitored (`sba_foia_franchise_outcomes` cadence entry) — this is a pre-launch /
     "never seeded" gap, not an unmonitored-pipeline gap. It also flows through to `master`'s citation
     table (`s01`, live-served in the tier-2 spot-check above) as the very first caveat users may see
     depending on truncation order.
   These are "held" in the sense the task means (a brain the product is currently serving with
   effectively zero content) even though nothing in the freshness/build-report machinery flags either
   one — both look 100% healthy by every automated signal.

---

## UNMONITORED UPSTREAMS

Cross-referenced every `data_lake.*` / `lake-tier1/*` / `public.*` table found in the BRAIN→UPSTREAM MAP
against all 74 `- name:` pipeline entries in `ingest/cadence_registry.yaml` (`name`, `dlt_schema_name`,
`count_table`, `freshness_table`, `inventory_id` fields).

**Genuinely unmonitored:**

1. **`data_lake.community_profiles` and `data_lake.neighborhood_stats` (communities-swfl's only two
   upstream tables) do not appear anywhere in `cadence_registry.yaml`.** No pipeline entry, no exclusion
   note (unlike the deliberate exclusions documented at the bottom of the file for `dbhydro_stations`,
   `usgs_sites`, `fdot_freight_nowcast_shock_log`, `project_feed`, and the deliverables retention sweep).
   Combined with finding #4 above (the brain is currently empty), there is **no automated signal anywhere
   in this platform** that would catch or alert on this gap — it was only visible by reading the brain's
   own self-reported conclusion text.

2. **`data_lake.usgs_sites` (read live by `env-swfl` via `refinery/sources/usgs-water-source.mts`,
   `SITES_TABLE = "usgs_sites"`, used to resolve the SWFL site list for the Caloosahatchee surface-stage
   metric) is explicitly excluded from the probe** — `cadence_registry.yaml` lines 1699-1704: *"LEGACY
   DLT TABLE, SCHEDULED FOR DROP. The active USGS workflow (usgs-monthly.yml) writes Parquet to Tier-1
   only. These rows are from a deprecated dlt pipeline... Do not add a floor — the table will be gone
   before it matters."* The referenced migration doc
   (`docs/superpowers/plans/_FINISHED/2026-05-19-usgs-postgres-to-parquet-migration.md`) is filed under
   `_FINISHED/`, but the live source connector's docstring and code (lines 14, 33) still actively query
   `data_lake.usgs_sites` in live mode today — the Postgres dependency was apparently never fully cut
   despite the migration being marked complete. Low severity in practice (900 rows of largely-static
   site metadata — lat/lon/name — unlikely to silently drift in a way that breaks the metric), but it is
   a real, currently-live dependency on a table the team decided was safe to leave unmonitored because it
   "will be gone before it matters" — it has not gone, and nothing would alert if it did.

**Investigated and cleared (not real gaps):**

- **The `_stats` / `_latest` / `_summary` / `_county_year` derived-view pattern** — `active-listings-swfl`
  (`listing_active_stats`), `active-rentals-swfl` (`rental_listing_stats`), `home-values-swfl`
  (`zhvi_zip_latest`), `rentals-swfl` (`zori_zip_latest`), `tier-divergence-swfl`
  (`tier_divergence_zip_latest`), `market-temperature-swfl` (`market_details_swfl_latest`),
  `price-distribution-swfl` (`listing_price_histogram_swfl_latest`), `listing-momentum-swfl`
  (`listing_momentum_stats`), `properties-collier-value` (`collier_parcels_summary`),
  `properties-lee-value` (`leepa_parcels_summary`, `leepa_parcels_sales_yearly`), `env-swfl`
  (`fema_nfip_county_year`, `fema_nfip_zip_window_agg`), and `traffic-swfl` (`fdot_aadt_county_year`) all
  read a view name the cadence registry does not literally list. Checked every one against
  `docs/sql/*.sql`: all are plain `CREATE OR REPLACE VIEW` (never `MATERIALIZED VIEW`) computed live over
  a base table the registry DOES monitor (`listing_state`, `rental_listings_swfl`, `zhvi_swfl`,
  `zori_swfl`, `tier_divergence_swfl`, `market_details_swfl`, `listing_price_histogram_swfl`,
  `collier_parcels`, `leepa_parcels`, `fema_nfip_claims`, `fdot_aadt_fl`). A plain view can't go stale
  independently of its base table, so base-table monitoring transitively covers these. Some cadence
  entries even document the exact consumer explicitly (e.g. line 1498: "Consumer brain:
  refinery/packs/active-listings-swfl.mts (via data_lake.listing_active_stats)").
- **`data_lake.faf_flows`** — see the correction note at the end of the BRAIN→UPSTREAM MAP section;
  logistics-swfl does not actually read this table live.
- **`data_lake.fdot_freight_nowcast_shock_log`** — explicitly documented in the registry's exclusion list
  as a brain write-back, not an ingest table; the pack owns its own integrity here by design.
- **`data_lake.mhs_jurisdiction_xwalk`** (read by `permits-commercial-swfl` alongside the monitored
  `mhs_permits_swfl`) — not in the registry, but appears to be a small static jurisdiction-name crosswalk
  reference table rather than a time-series ingest target; flagging for completeness, not as a live risk.
- **Master's embedded CITATION TABLE "expires" column is a display artifact, not a real staleness
  signal — but only surfaces outside the default speak views.** `brains/master.md`'s reference-block
  citation table shows roughly 20 of 38 upstream rows with an `expires` date already in the past (e.g.
  `hurricane-tracks-fl`: verified 2026-06-19, expires 2026-06-26). Traced to
  `refinery/sources/brain-input-source.mts:citationMeta` (line 87-94): `expires` is computed as the
  **upstream's own `verified` date + the CONSUMING brain's `ttl_seconds`** (`master`'s 7-day TTL,
  passed in from `refinery/stages/4-output.mts` line 345 as `pack.ttl_seconds`), not the upstream's own
  TTL. A brain like `hurricane-tracks-fl` with a real 365-day TTL will always show "expired" in this
  table 7 days after its own last refresh, even though it is nowhere close to actually stale. Confirmed
  this is cosmetic: `master`'s real `caveats[]` array (the one actually served) contains zero genuine
  `stalenessCaveats` ("was stale at build time") entries this run — the DAG-level freshness gate
  (`freshnessGate`/`brainStatus`, which correctly uses each upstream's own TTL) found nothing stale.
  **Per the live spot-checks above, this citation table does not appear in `view=speak` at tier 1 or
  tier 2** (only in the raw markdown / full tier-3 audit) — so its reach is limited to an agent or human
  reading the raw brain file, not the default consumer-facing answer surface.
