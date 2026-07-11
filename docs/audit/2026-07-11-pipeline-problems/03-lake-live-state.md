# 03 — Lake Live State (ground truth, direct DB probe)

**AS-OF: 2026-07-11, queries run ~08:18–09:10 UTC.** All numbers below are live `SELECT`-only
results against the production Supabase Postgres (`db.jtkdowmrjaxfvwmemxso.supabase.co`), no writes
issued. Two independent methods were used and cross-checked:

1. **Production module, full-entry mode.** Imported `ingest.scripts.check_freshness` and called its
   own `run_probe()` / `check_volume_entry()` / `check_sla_violations()` directly against all 71
   `pipelines:` entries in `ingest/cadence_registry.yaml` (1757 lines, read in full) — same logic the
   daily GHA cron runs, but without the "alerting only" filter `format_summary()` applies, so every
   entry shows, not just the non-FRESH ones.
2. **Actual script run for corroboration.** `python -m ingest.scripts.check_freshness --dry-run` and
   `python -m ingest.scripts.check_data_quality --dry-run`, run twice (once without, once with
   `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` set, to also exercise the PostgREST view-liveness probe).
   Output matched the full-entry run exactly on every alerting row — no divergence.

Sibling doc `docs/audit/2026-07-11-pipeline-problems/02-known-problems-ledger.md` (written earlier the
same day) covers checks-ledger/incident-log/build-queue state and a deep trace of the
`listing_state`/`active_listings_residential` property-type history. This doc is the live-query
ground truth underneath that — cross-references are called out inline where the two overlap, and one
direct evidence-based update to that doc's `steadyapi_subscription_suspended` framing is included in
§6.

**Note on the task's `public.listing_state` pointer:** no such table exists. The real table is
`data_lake.listing_state` (confirmed via `information_schema.tables`); used throughout below.

---

## 1. FRESHNESS TABLE (all 74 registry-documented sources)

71 entries in `pipelines:`, 3 in `not_yet_running:` (all `parked: true`, deliberately excluded from
the probe — listed at the bottom for completeness, not because they're broken).

Verdict vocabulary used here is finer than the probe's own (which lumps "table absent" and "table
exists but empty" into one `MISSING` status): **TABLE MISSING** (relation doesn't exist) vs **EMPTY**
(relation exists, 0 rows) are reported separately below.

### 1a. Flagged (anything not a clean FRESH)

| Name | Lane | Last activity | Age (d) | Cadence→Threshold | Verdict | Volume |
|---|---|---|---|---|---|---|
| `redfin_city_swfl` | tier-2 | — | — | 31d→62d | **TABLE MISSING** — `data_lake.redfin_city_swfl` does not exist in `information_schema.tables`. Registry's own comment says "confirmed 07/11/2026 via live **dry-run**" — a dlt dry-run does not write; this pipeline has never actually landed a row in prod. | — |
| `dbpr_re_licensees` | tier-2 | — | — | 7d→21d | **EMPTY** — `public.dbpr_re_licensees` exists with the exact 30-column schema the registry describes (confirmed via `information_schema.columns`, including `last_seen_at`), but `SELECT COUNT(*)` = **0** right now. This directly contradicts the registry's own comment: *"expected_rows_min: 15000 # ~50% of the 30,100 kept rows observed live 07/10/2026 (Lee 18,015 / Collier 12,085)"* — a claim dated **yesterday**. Non-dlt table, no `_dlt_loads` audit trail, so this probe cannot distinguish "never actually loaded in prod (the 07/10 observation was local/pre-prod)" from "loaded then wiped." Flagging for the owner, not adjudicating. | 0 / 15,000 |
| `brevitas_listings` | tier-2, odd_window | 2026-06-22 | 19 | 7d, ±2d window | **OVERDUE** — expected window closed 2026-06-29±2d; 19 days is well past a weekly-cadence ODD window. | 1 / 1 (OK on floor, but stale) |
| `fgcu_reri_indicators` | tier-2 | 2026-06-05 | 36 | 30d→60d | FRESH on recency, **LOW_VOLUME** | 10 / 16 |
| `noaa_ghcn_rainfall` | tier-2 | 2026-07-05 | 6 | 30d→60d | FRESH on recency, **LOW_VOLUME** | 6 / 8 |
| `crexi_listings` | tier-2, odd_window | 2026-07-05 | 6 | 7d, ±2d window | **WINDOW_OPEN** (expected 2026-07-12±2d) — normal, not an alert | 61 (shared `active_listings_cre` count with brevitas) |
| `estero_edc` | tier-2, odd_window | 2026-07-01 | 10 | 30d, ±5d window | **WAITING** (silent by design — next window not open yet) | 6 / 6 |
| `lee_associates_swfl` | tier-2, odd_window | 2026-06-09 | 32 | 90d, ±10d window | **WAITING** (silent by design) | 20 / 18 |

### 1b. Near-threshold — technically FRESH, worth watching

| Name | Last activity | Age / Threshold | Note |
|---|---|---|---|
| `usgs_tier2` | 2026-05-19 (`data_lake.usgs_daily`, `MAX(obs_date)`=2026-05-18) | **53 / 60 days (88%)** | **Live-consumed and silently stalling.** `refinery/packs/env-swfl.mts` reads `data_lake.usgs_daily` verbatim for its Caloosahatchee surface-stage metric ("USGS Water Services daily values via data_lake.usgs_daily"). The sibling **tier-1** `usgs` DuckDB/Parquet pipeline is fresh (last run 2026-07-10, 1 day old) — the raw USGS fetch is working; only the **Postgres promotion** (`usgs_tier2`) has stopped, hidden under the 60-day tolerance. 7 more days and this flips STALE. |
| `collier_permits` | 2026-05-27 | 45 / 60 days (75%) | Secondary watch — matches the already-open `collier-permits-monthly` incident in the sibling doc (schedule commented out since 06-16 pending two ungated conditions). |
| `fl_dor_tdt` | 2026-05-28 | 44 / 75 days (59%) | Secondary watch, not urgent. |

### 1c. Everything else — confirmed FRESH (63 of 71 active entries)

`active_listings` (1d), `bls_laus` (16d), `bls_oews_swfl` + `bls_oews_swfl_tier1` (41d), `bls_ppi`
(25d), `bls_qcew` (46d), `census_acs` (17d), `census_cbp` (26d), `census_vip` (29d), `city_pulse`
(1d), `city_pulse_corridors` + `city_pulse_corridors_tier2` (6d), `collier_parcels` (35d),
`colliers_industrial` (32d), `dbpr_press_releases` (5d), `dbpr_public_notices` (5d),
`dbpr_sirs_submissions` (19d), `faf5` (52d), `fdle_crime_swfl` (10d), `fdot` (8d), `fema` (28d),
`fhfa` (3d), `fl_dbpr_applicants` (6d), `fl_dbpr_licenses` (6d), `fl_dor_sales_tax` (26d),
`fmb_recovery` (odd_window, in-window), `fred_g17` (24d), `fred_laus_alfred` (14d),
`fred_listing_swfl` (4d), `hurdat2_fl` (40d), `lee_permits` (3d), `leepa` (54d), `listing_lifecycle`
(1d — see §6 for a real-activity corroboration, not just a timestamp touch), `live_search_daily_median_price`
+ `live_search_daily_mortgage` (1d), `market_aggregates_details` (7d), `market_aggregates_histogram`
(5d), `market_heat_swfl` (3d), `marketbeat_swfl` (32d), `mhs_databook` (36d), `mhs_permits_swfl`
(32d), `news_swfl` (0d), `redfin_collier` + `redfin_lee` (23d), `redfin_contract_cancellations` +
`redfin_delistings_relistings` + `redfin_price_drops` + `redfin_swfl` (26d), `rentals_swfl` (5d),
`rsw_airport_monthly` (27d), `storm_history_swfl` (1d), `swfl_inc` (5d), `swfl_search_demand` (9d),
`tier_divergence_swfl_duckdb` (20d), `tier_divergence_swfl_tier2` (19d), `usgs` tier-1 (1d),
`zhvi_swfl_duckdb` + `zhvi_swfl_tier2` (13d), `zori_swfl_duckdb` (21d), `zori_swfl_tier2` (20d).

All row-volume floors (`expected_rows_min`) for these pass (`OK`), except where already listed in
§1a/§1b.

### 1d. `not_yet_running:` (parked, no probe coverage — by design)

| Name | Status | Reason |
|---|---|---|
| `sba_foia_franchise_outcomes` | PARKED | First quarterly cron fires 2026-07-15 (`franchise-outcomes-quarterly.yml`) — never-run is expected until then. |
| `airdna_str_swfl` | PARKED | Operator decision 07/05/2026 — no AirDNA subscription purchased. |
| `land_manufactured_swfl` | PARKED | No pipeline code yet — deliberate backfill deferral (operator 06/30). |

### View liveness (PostgREST GRANT check, via live REST calls)

All 3 registered `liveness_view` entries returned live rows through the actual Supabase REST surface:
`data_lake.zori_zip_latest`, `data_lake.zhvi_zip_latest`, `data_lake.tier_divergence_zip_latest` — no
missing-GRANT issue found.

### Data-quality probe (`check_data_quality.py --dry-run`)

All 12 value tests pass; all 4 schema-baselined tables (`news_articles_swfl`, `zhvi_swfl`,
`zori_swfl`, `leepa_parcels`) match baseline. **Coverage gap, stated plainly: this quality gate does
NOT cover `listing_state`, `active_listings_residential`, or `rental_listings_swfl`** — none of the
contamination findings in §5 below would be (or were) caught by it. `ingest/quality/quality_registry.yaml`
is a 4-table opt-in list; the listing/rental tables were never added.

---

## 2. UNMONITORED SCHEMAS (present in `_dlt_loads`, no registry entry)

`SELECT DISTINCT schema_name FROM data_lake._dlt_loads` returns **427** distinct values. Registry
`dlt_schema_name` fields (across `pipelines:` + `not_yet_running:`) cover **22**. The gap set of 427
breaks into two very different buckets:

**Real, live, uncovered — 1 table:**
- **`parcel_subdivision`** — 220,875 rows, 71 dlt loads, most recent load **2026-07-06** (5 days
  before this audit). Zero mention anywhere in `cadence_registry.yaml`'s 1757 lines. Columns:
  `parcel_id, county, property_type, just_value, zip, subdivision_name, phy_addr1`. Actively growing,
  actively fresh, completely outside the freshness probe's reach — a real monitoring gap.

**Dead / already-documented / vestigial — 426 tables, no action needed:**
- **330× `leepa_t2_<8-hex-hash>`** — one dlt load each, dates span 2026-05-19 to 2026-05-30, all
  `status=0` (success). Per-run schema-naming churn from an early, since-fixed pipeline-naming issue;
  fully superseded by the stable `leepa_parcels_tier2` schema (registry-covered, confirmed FRESH
  above). Zero activity since 05-30.
- **73× `collier_parcels_t2_<8-hex-hash>`** — one dlt load each, ALL clustered inside a single
  14-minute window on **2026-06-06 17:01–17:15 UTC** (a rapid retry-loop signature during one ingest
  session, not spread over time like the leepa case). Fully superseded by the stable
  `collier_parcels` schema, which landed its real 290,973-row load the same day. Zero activity since.
- **`tier1_inventory`** — 56 loads, last 2026-05-19. Legacy pre-split pipeline name; the registry's
  own comments confirm `pipeline_name="tier1_inventory"` was the original shared name before FEMA,
  LeePA, and FDOT each got a distinct `_tier2` schema name (`fema_nfip_tier2`, `leepa_parcels_tier2`,
  `fdot_aadt_tier2` — all registry-covered, all confirmed FRESH above). Dead since the split.
- **`news_swfl`** — 24 loads, most recent **today** (2026-07-11 08:10 UTC). NOT a real monitoring
  gap: the registry's `news_swfl` entry tracks freshness via `freshness_table:
  data_lake.news_articles_swfl` (confirmed FRESH, age=0, above) — that check path takes precedence
  over `dlt_schema_name` in `check_freshness.py`'s own logic (`freshness_table` branch is checked
  first). The registry's `dlt_schema_name: data_lake` field on this entry is dead/incorrect config
  (no schema literally named `data_lake` exists) — harmless today because the code never reaches it,
  but worth a one-line registry cleanup so a future reader doesn't trust the field.
- **`dbhydro`** — 1 load, 2026-05-18. Already explicitly documented in the registry's own "Tables
  intentionally excluded from the probe" comment block (`data_lake.dbhydro_stations` — DEFUNCT
  SOURCE, SFWMD DBHYDRO API decommissioned). Consistent with docs, not a new finding.

---

## 3. REGISTRY ENTRIES WITH NO DB PRESENCE (`dlt_schema_name` never appears in `_dlt_loads`)

Only **2** of the registry's 22 `dlt_schema_name` values have zero matching rows in `_dlt_loads`:

- **`redfin_city_swfl`** — real gap, see §1a (TABLE MISSING).
- **`data_lake`** (the vestigial field on the `news_swfl` entry) — not a real gap, see §2. The
  pipeline it's attached to is fine; the field itself is dead config.

---

## 4. CONTAMINATION PROBES — verbatim distributions

Two genuinely distinct non-home populations pollute residential price signals in the live tables.
They are different bugs, different magnitudes, and one is much more urgent than the other.

### 4a. THE MATERIAL ONE — land parcels blended into "median asking price," live, uncaught

`data_lake.listing_active_stats` is the view `refinery/packs/active-listings-swfl.mts` reads directly
(label: *"SWFL median asking price (active residential)"*, per-ZIP `detail_tables`). Its live
definition (`pg_get_viewdef`, confirmed current — matches the `20260711_listing_active_stats_core_counties.sql`
migration referenced in the sibling doc, applied today):

```sql
WHERE listing_state.source_name = 'api_feed' AND listing_state.state = 'active'
  AND listing_state.sale_or_rent = 'sale' AND listing_state.list_price IS NOT NULL
  AND (btrim(listing_state.county) = ANY (ARRAY['Lee','Collier']))
-- NO property_type filter anywhere in this view.
```

Region-wide `listing_state` property_type mix (active, sale, Lee+Collier, `source_name='api_feed'`):

```
property_type | count | median list_price
single_family | 12,752 | $479,900
land          |  7,404 | $47,000
condo         |  5,634 | $372,387
other         |  1,518 | $125,000
townhouse     |    526 | $295,000
multi_family  |    525 | $499,000
```

Land is ~21% of the region's "active sale residential" rows and its median ($47K) is ~10x cheaper
than single_family. Where land is locally concentrated, it dominates the ZIP-grain median because
`listing_active_stats` counts rows, not homes:

```
listing_active_stats (ZIP grain), lowest median_list_price rows:
 county | zip_code | listing_count | median_list_price | avg_list_price
 Lee    | 33975    |      1        |     20,000        |    20,000
 Lee    | 33920    |    124        |     26,750         |    79,786
 Lee    | 33095    |      1        |     28,000         |    28,000
 Lee    | 33467    |      1        |     30,000         |    30,000
 Lee    | 33974    |  1,981        |     31,000         |   137,814
 Lee    | 33972    |  1,325        |     35,000         |   136,641
 Lee    | 33792    |      1        |     39,900         |    39,900
 Collier| 34139    |      1        |     49,999         |    49,999
```

Direct decomposition of ZIP 33972 (Lehigh Acres) and 33974, both flagged above:

```
33972 (Lehigh Acres): land 918 rows, median $29,500 | single_family 385 rows, median $354,999
                       -> blended "median asking price" reported: $35,000
33974 (Lehigh Acres):  land 1,323 rows, median $25,000 | single_family 590 rows, median $319,999
                       -> blended "median asking price" reported: $31,000
```

**This is a live, currently-shipping number.** A ZIP lookup for 33972 today returns "median asking
price $35,000" when the actual single-family home median there is $354,999 — a ~10x understatement,
driven entirely by land-parcel row count, not by any rental contamination. This is the SAME BUG CLASS
the sibling doc's §4e/§3 already caught and partially fixed in the now-abandoned
`active_listings_residential` table (`price_source_wire_off_stale_seed_table` check, "$309k vs
$610k") — but that fix does not cover `listing_active_stats`, the view that actually replaced it and
is the live path today. **No existing check tracks this specific gap** (`listing_active_stats` /
`active-listings-swfl` land-blend); it is not `property_type`-filtered anywhere in the SQL, the brain
code, or `ingest/quality/quality_registry.yaml`.

### 4b. THE SMALL ONE — genuine rent-priced rows mislabeled `sale_or_rent='sale'`

Both writers into `data_lake.listing_state` hardcode `"sale_or_rent": "sale"`
(`extract_api.py:139`, `extract.py:144`) — confirmed in code, matches the sibling doc's independent
trace. Live: **100% of 34,703 rows are `sale_or_rent='sale'`** — no `'rent'` value has ever been
written to this table by any current pipeline.

List-price distribution by property_type for active/sale rows under $20,000 (isolates real land from
real mislabels, per-advisor refinement — a flat "<$10K" cut conflates the two):

```
property_type | count | min    | median  | max
land          |   523 |    700 | 18,000  | 19,999   <- plausible cheap SWFL lots (esp. Lehigh Acres/Golden Gate Estates)
other         |    61 |    600 | 15,900  | 19,900
single_family |    21 |  2,000 |  5,000  | 14,900
condo         |     9 |  1,800 |  7,000  | 10,000
```

The 91 non-land rows (0.26% of all active/sale rows) under $20,000 are the real mislabel candidates.
Full sample of the sub-$10,000 non-land set (39 rows) — verbatim:

```
address_key                    | city             | zip   | type          | price
10TAMPAPL303:34145             | Marco Island     | 34145 | condo         | 9,000
10TAMPAPL1:34145               | Marco Island     | 34145 | condo         | 7,000
10TAMPAPL404:34145             | Marco Island     | 34145 | condo         | 7,000
10TAMPAPL5:34145                | Marco Island     | 34145 | condo         | 7,000
10TAMPAPL2:34145               | Marco Island     | 34145 | condo         | 7,000
10TAMPAPL3:34145               | Marco Island     | 34145 | condo         | 7,000
10TAMPAPL203:34145             | Marco Island     | 34145 | condo         | 6,000
4324MAILBOXAVE127:33903        | North Fort Myers | 33903 | single_family | 9,900
4373HITZINGAVE92:33903         | North Fort Myers | 33903 | single_family | 9,900
...(30 more rows, $600–$9,900, single_family/condo/other, scattered North Fort Myers/
    Lehigh Acres/Cape Coral/Fort Myers/Naples — full list captured in probe output)
```

The 7-unit **10 Tampa Pl, Marco Island** cluster ($6,000–$9,000, all `condo`) is the cleanest
individual signal — a single building with every unit priced far below any plausible Marco Island
condo sale price, consistent with a furnished/extended-stay rental property whose listings SteadyAPI's
`/search` (for-sale) endpoint is returning, or that our own scrape source is misclassifying. This
flows straight into `listing_active_stats` (no price-floor guard exists) and would drag the Marco
Island 34145 ZIP median down by exactly this mechanism, layered on top of §4a's land-blend.

**Reverse direction — checked, clean.** `data_lake.rental_listings_swfl` (the dedicated
SteadyAPI `/rentals-search` table, 14,244 rows, `source_tag='realtor.com'`): `price_max` ranges
$825–$17,000 (median $1,948), **zero rows above $20,000**. No sale-priced rows leaking into the
rental table.

### 4c. `active_listings_residential` — real but stale/orphaned, not live-path

`listing_type` splits cleanly: 32,198 `sale` / 6,530 `rent`. The 5,475 rows under $10,000 are almost
entirely correctly tagged `listing_type='rent'` (verified: e.g. $9,000 Sarasota condo unit,
`listing_type='rent'`) — this table's classifier IS doing its job at the row level. The
`active_listings_residential_zip_stats` VIEW built on top of it also correctly filters
`listing_type = 'sale'`. **But per the sibling doc's independent trace (§4e there), that view has zero
live consumers** — the real `active-listings-swfl` brain reads `listing_active_stats` (§4a above)
instead. The raw table is still written daily (`active-listings-daily.yml`, confirmed live,
`source_name='active_listings_seed'`, 38,728 rows) but is orphaned data with respect to today's live
brain path — noted for completeness, not re-litigating the sibling doc's finding.

### 4d. Other tables checked — clean

- **`redfin_lee_market` / `redfin_collier_market`** — property_type buckets are all legitimate sale
  categories (`Condo/Co-op`, `Multi-Family (2-4 Unit)`, `Single Family Residential`, `Townhouse`,
  `All Residential`); `median_sale_price` ranges $130K–$1.9M, no rental-sized or contaminated values.
- **`active_listings_cre`** — 62 rows, all `status='available'`, plausible commercial types
  (retail/office/industrial/land/special purpose), `asking_price_psf` unit, no contamination signal.
- **`user_mls_listings`** — **0 rows** (client-uploaded MLS feature table, currently empty — not an
  ingest pipeline, not registry-tracked, noted for completeness only).
- **`market_details_swfl`** — 108 rows, `median_sold_price` vs `median_rent_price` sane at every ZIP
  except one: ZIP 33972 (Lehigh Acres) shows `median_sold_price=$30,000` vs `median_rent_price=$1,950`
  (ratio 15.4x, vs. typically 100–200x elsewhere) — same root cause as §4a (land-heavy inventory in
  that ZIP dragging the "sold" aggregate down), not a separate bug.
- **`leepa_parcels`** — `last_sale_amount`: 41,510 of 528,130 non-null sales (7.9%) are between $1
  and $9,999. This is a distinct, known real-estate-data phenomenon (quitclaim deeds, family
  transfers, non-arm's-length transactions recorded at nominal consideration) — not rental
  contamination; flagged separately, not conflated with §4a/4b.

---

## 5. PROBE ERRORS / things not fully resolvable from a read-only DB probe

- **`dbpr_re_licensees` empty-vs-wiped is unresolvable from this angle.** The table is non-dlt (no
  `_dlt_loads` row-level audit trail), the registry entry itself has a blank `First run:` placeholder,
  and its own volume comment is dated 07/10 — one day before this probe found 0 rows. Cannot determine
  whether the 07/10 observation was against this prod DB (and got wiped) or a different environment
  that never actually landed here. Needs the pipeline owner / GHA run history
  (`ingest-dbpr-re-licensees.yml` run log), which is outside a DB-only probe.
- Nothing else attempted failed outright — every query against every table/view named in the registry
  or discovered via `information_schema` returned a result (including the deliberately-checked
  `redfin_city_swfl`, which correctly returned "relation does not exist" rather than erroring the
  session).

---

## 6. One evidence-based update to the sibling doc's `steadyapi_subscription_suspended` check

The sibling ledger (`02-known-problems-ledger.md` §5) states SteadyAPI has returned HTTP 403
"subscription suspended" on every call since ~07-07 15:15 UTC, "still open as of 07-11." Live query
against `data_lake.listing_state` / `listing_transitions` (`source_name='api_feed'`) shows real,
substantial daily activity — not just a timestamp touch — every day since:

```
date       | rows scraped (listing_state) | real transitions (listing_transitions, seed=false)
2026-07-07 |   7      | 31    <- matches the ~15:15 UTC suspension onset (partial day)
2026-07-08 | 364      | 2,073
2026-07-09 | 8,857    | 1,279
2026-07-10 | 21,142   | 945
```

`listing_transitions` carries real state-machine events (new listings, price cuts, departures, sold,
withdrawn — visible per-day in `listing_pulse_daily`), which cannot be produced by a dead/403'd API
call; `distill.py` only writes a transition when a diff against real fetched data changes something.
This is direct evidence SteadyAPI `/search` access resumed by 07-08, contradicting the "still open as
of 07-11" framing — either the suspension was lifted (needs confirming account-side) or it's
endpoint-specific (e.g., `/search` recovered while another endpoint the check also covers,
`/rentals-search` or `/property-tax-history`, may still be affected — not independently checked here).
Flagging the discrepancy for the check owner to resolve/close or narrow, not asserting which.
