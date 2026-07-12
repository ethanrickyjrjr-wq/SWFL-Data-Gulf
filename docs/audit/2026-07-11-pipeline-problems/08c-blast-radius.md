# 08c — Downstream blast radius of the contaminated tables

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

Spec §13.3: enumerate the DOWNSTREAM consumers before the Locus-B at-rest tripwire lands. `04-brains-consumers.md` covered the brain/pack side only; this is the **non-brain reach** — desk, email, landing, insiders, API routes, scripts — which `/census` does not track either.

---

## Reference census

55 total references. Bucket split: **live-consumer=17** · **doc-or-spec=3** · **test=7** · **other=13** · **sql-def=15**

### LIVE CONSUMERS (17) — the blast list

| file | line | table(s) | what it reads |
|---|---|---|---|
| `lib/desk/loaders.ts` | 131 | listing_active_stats | loadActiveStats(): county+ZIP+region rollups (listing_count, median_list_price, latest_scraped_at) for the /desk spine widget; dedupes stray duplicate county rows by max listing_count |
| `lib/desk/loaders.ts` | 165 | listing_momentum_stats | loadMomentum(): region+ZIP active_listing_count/price_reduced_share/new_listing_share percentages for the desk momentum widget |
| `lib/desk/loaders.ts` | 248 | listing_state | countActiveFlag(): exact-count of state='active' rows matching a boolean flag column, for the inventory-mix strip |
| `lib/desk/loaders.ts` | 308 | listing_state | loadNotableCuts(): top 15 active+flag_price_reduced rows ordered by reduced_amount desc, feeds the flash-feed price-cut cards |
| `lib/desk/loaders.ts` | 367 | listing_state | loadClosings(): joins listing_transitions sold rows back to listing_state by listing_id to resolve street_address/city/list_price for the closings flash-feed card |
| `lib/desk/loaders.ts` | 412 | market_details_swfl_latest | loadMarketTemp(): zip_code/local_hotness_score/captured_date filtered to core-scope ZIPs, feeds the market-temperature gauge |
| `app/insiders/_lib/desk-stats.ts` | 83 | listing_active_stats | homepage/insiders stats bar: zip_code, listing_count, latest_scraped_at — verbatim counts, no derived rates, for active-listing total + scrape date |
| `lib/landing/load-home-map-data.ts` | 146 | listing_active_stats | homepage map 'Market Activity' pill: zip_code/county/listing_count/median_list_price/latest_scraped_at, full Lee+Collier active inventory |
| `lib/landing/load-home-map-data.ts` | 183 | market_details_swfl_latest | homepage map 'Days on Market' pill: zip_code/county/median_days_on_market/captured_date (realtor.com median DOM; separate source from activity since listing_active_stats carries no DOM for Collier) |
| `app/charts/page.tsx` | 144 | market_details_swfl_latest | /charts gallery: zip_code/local_hotness_score/captured_date for the market-temperature dial (~54 rows, one per ZIP) |
| `lib/email/market-context.ts` | 117 | listing_active_stats | email market-context builder: listing_count/median_list_price/avg_days_on_market/latest_scraped_at/county — feeds deliverable market-snapshot copy |
| `lib/email/zip-events/state.ts` | 64 | listing_state | zipJoin(): address_key→zip_code lookup (sale_or_rent='sale') to attach a footprint ZIP to sold-transition rows, since listing_transitions carries no zip_code itself |
| `lib/email/zip-events/state.ts` | 155 | listing_state | assembleFreshSnapshots(): counts state='active' rows per ZIP (sale_or_rent='sale') for per-ZIP email-digest snapshot 'actives'; comment notes days_on_market/listed_date are NULL at source so median_dom stays null |
| `lib/listings/select.ts` | 288 | listing_state | loadListingContext(): the sole listing-detail read path — selects LAKE_LISTING_COLUMNS and coerces a listing_state row into the shared Listing shape (yearBuilt/removedDate left null, no lake column) |
| `app/api/projects/[id]/watch/route.ts` | 59 | listing_state | Property Watch POST handler: autoFillSpec() selects beds/baths/sqft/list_price for the tracked address to auto-fill the watch subject spec when it's itself an active listing (four-lane lane 4 fallback otherwise) |
| `scripts/project-feed/watch-scan.mts` | 132 | listing_state | Property Watch cron: joins each recent listing_transitions row to its listing_state row (source_name/address_key/sale_or_rent/lat/lon/beds/baths/sqft/list_price) for haversine radius filtering and comp classification; rows with NULL lat/lon are excluded, never guessed |
| `scripts/project-feed/lifecycle-nudges.mts` | 99 | listing_state | lifecycle-nudge cron: selects state for each ARMED email_sequences row's resolved address_key, feeds the pure decideLifecycleNudges core |

### Non-blast references (for completeness)

| file | line | table(s) | bucket |
|---|---|---|---|
| `lib/landing/load-home-map-data.ts` | 13 | active_listings_residential | doc-or-spec |
| `lib/landing/load-home-map-data.test.ts` | 70 | listing_active_stats | test |
| `lib/landing/load-home-map-data.test.ts` | 71 | market_details_swfl_latest | test |
| `lib/landing/load-home-map-data.test.ts` | 118 | listing_active_stats | test |
| `lib/landing/load-home-map-data.test.ts` | 119 | market_details_swfl_latest | test |
| `lib/listings/select.test.ts` | 76 | listing_state | test |
| `lib/project/lifecycle-nudge.test.ts` | 100 | listing_state | test |
| `lib/email/sole-spine.test.ts` | 8 | active_listings_residential | test |
| `lib/project/watch-delta.ts` | 19 | listing_state | other |
| `lib/project/watch-event.ts` | 4 | listing_state | other |
| `lib/listings/rentcast.ts` | 5 | listing_state | doc-or-spec |
| `lib/signals/types.ts` | 83 | listing_state | other |
| `lib/email/doc/preview-fill.ts` | 25 | listing_state | other |
| `scripts/generate-seed-preview-charts.mts` | 40 | listing_price_histogram_swfl_latest | other |
| `lib/email/doc/seed-chart-series.ts` | 286 | listing_price_histogram_swfl_latest | other |
| `refinery/lib/core-scope.mts` | 69 | listing_active_stats | doc-or-spec |
| `migrations/20260627_listing_lifecycle.sql` | 14 | listing_state | sql-def |
| `migrations/20260630_listing_state_api_columns.sql` | 10 | listing_state | sql-def |
| `migrations/20260630b_listing_state_budget_fix_columns.sql` | 9 | listing_state | sql-def |
| `docs/sql/20260627_listing_active_stats.sql` | 25 | listing_active_stats | sql-def |
| `docs/sql/20260630_listing_active_stats_api.sql` | 19 | listing_active_stats | sql-def |
| `docs/sql/20260711_listing_active_stats_core_counties.sql` | 25 | listing_active_stats | sql-def |
| `docs/sql/20260711_listing_active_stats_homes_only.sql` | 34 | listing_active_stats | sql-def |
| `docs/sql/20260630_market_aggregates_tables.sql` | 32 | market_details_swfl | sql-def |
| `docs/sql/20260630_market_aggregates_tables.sql` | 55 | listing_momentum_stats | sql-def |
| `docs/sql/20260630_market_aggregates_tables.sql` | 87 | listing_price_histogram_swfl_latest | sql-def |
| `docs/sql/20260630_market_aggregates_tables.sql` | 92 | market_details_swfl_latest | sql-def |
| `docs/sql/20260625_active_listings_residential.sql` | 10 | active_listings_residential | sql-def |
| `docs/sql/20260625_active_listings_residential_zip_stats.sql` | 32 | active_listings_residential | sql-def |
| `migrations/20260626_active_listings_listing_type.sql` | 15 | active_listings_residential | sql-def |
| `docs/sql/20260701_rentals_swfl_table.sql` | 43 | rental_listing_stats | sql-def |
| `ingest/cadence_registry.yaml` | 1471 | active_listings | other |
| `ingest/pipelines/market_aggregates/pipeline.py` | 29 | market_details_swfl | other |
| `refinery/packs/active-listings-swfl.mts` |  | listing_active_stats | other |
| `refinery/sources/market-temperature-source.mts` | 25 | market_details_swfl_latest | other |
| `refinery/packs/listing-momentum-swfl.mts` |  | listing_momentum_stats | other |
| `refinery/packs/active-rentals-swfl.mts` |  | rental_listing_stats | other |
| `refinery/packs/price-distribution-swfl.mts` |  | listing_price_histogram_swfl_latest | other |

---

## Blast radius — `listing_active_stats`

**As-of:** 2026-07-11. All row counts from live `SELECT` via the lake MCP (`pg.data_lake.*`, read-only). All code claims are `file:line`. Current view definition: `docs/sql/20260711_listing_active_stats_homes_only.sql:34-61` (homes-only, applied live in `c9748a6c`). Extends `03-lake-live-state.md` §4a/§4c and `04-brains-consumers.md`; two drifts from them are flagged inline.

### Live view state (baseline the tripwire will assert against)

```sql
SELECT CASE WHEN county IS NULL AND zip_code IS NULL THEN 'region'
            WHEN zip_code IS NULL THEN 'county' ELSE 'zip' END AS grain,
       count(*), sum(listing_count) FROM pg.data_lake.listing_active_stats GROUP BY 1;
-- region: 1 row, 20,822    county: 3 rows, 20,823    zip: 52 rows, 20,821
-- max(latest_scraped_at) = 2026-07-11 09:23:59-04
```
Region median `$420,000`; Lee 14,032 / `$365,000`; Collier 6,790 / `$649,900`. **The county grain has 3 rows, not 2** — see Trap 1.

---

### 1. LIVE CONSUMERS (the Fable-5 pre-tripwire list) — 5 paths

| # | Path | Reads (columns) | Grain(s) used | Error behavior | Surface |
|---|---|---|---|---|---|
| 1 | `refinery/sources/active-listings-residential-source.mts:27,65-76` (`const VIEW = "listing_active_stats"`) → consumed by `refinery/packs/active-listings-swfl.mts` | `county, zip_code, listing_count, median_list_price, avg_days_on_market, avg_list_price, latest_scraped_at` — **all 7** | all 3 (region / county / ZIP), split by null-ness in `summarize()` :83-89 | **THROWS** (`:73`) — the only consumer that hard-fails | `brains/active-listings-swfl.md` → `master` → `/api/b/*`, `/r/*`, MCP, email-via-brain |
| 2 | `lib/desk/loaders.ts:127-149` (`loadActiveStats`) | `county, zip_code, listing_count, median_list_price, latest_scraped_at` | all 3; region → KPI + ticker (`:555-575`, `:691`), counties → ticker (`:700`), zips → movers `medianByZip` (`:647-649`) | empty-tolerant (returns nulls) | `/desk` (`app/desk/page.tsx:7`) **and** `/embed/desk/pulse` (`app/embed/desk/pulse/page.tsx:10`) |
| 3 | `app/insiders/_lib/desk-stats.ts:81-108` | `zip_code, listing_count, latest_scraped_at` | **ZIP only** (`.not("zip_code","is",null)`); derives the region total by **summing ZIP rows** (= 20,821, not the region row's 20,822) | empty-tolerant (item hides) | `/insiders` stats bar (`app/insiders/page.tsx:113`) |
| 4 | `lib/landing/load-home-map-data.ts:142-174` | `zip_code, county, listing_count, median_list_price, latest_scraped_at` | ZIP only, further gated to `MAP_ZIPS` | empty-tolerant (pill hides) | homepage `/` "Market Activity" map pill (`app/page.tsx:33`) |
| 5 | `lib/email/market-context.ts:114-154` (`loadMarketFigures`) | `listing_count, median_list_price, avg_days_on_market, latest_scraped_at, county` | **single ZIP**, `.eq("zip_code", zip).maybeSingle()` | try/catch → **silently drops all 3 figures** | email/deliverable market snapshot (`lib/email/build-doc.ts:27`, `lib/email/outreach/demo-content.ts:17`) |

**Gap vs the collected-hits JSON:** hit #51 listed the *pack* but not `refinery/sources/active-listings-residential-source.mts` — that file holds the actual `.from()` call and is the only throwing consumer. It must be in the tripwire's list.

**Dropped buckets (noted, not in the blast list).** Of the 55 collected hits, the ones touching `listing_active_stats`: **4 sql-def** (`docs/sql/20260627_…`, `20260630_…_api`, `20260711_…_core_counties`, `20260711_…_homes_only` — only the last is current), **3 test refs** (`lib/landing/load-home-map-data.test.ts:70,118`; `refinery/packs/active-listings-swfl.test.mts:33`), **1 fixture** (`refinery/__fixtures__/active-listings-residential.sample.json`), **2 doc-only comments** (`refinery/lib/core-scope.mts:69`; `lib/landing/load-home-map-data.ts:10,13`), **1 registry comment** (`ingest/cadence_registry.yaml:1511`). Across the full 55-hit set: 18 live-consumer / 7 test / 15 sql-def / 3 doc-or-spec / 12 other — but 13 of those 18 "live-consumer" hits read `listing_state`, `listing_momentum_stats` or `market_details_swfl_latest`, i.e. sibling tables, not this view.

**Not a consumer — broken citation target.** The brain's live citations point at `https://www.swfldatagulf.com/r/source/listing_active_stats?…&date_col=scraped_at` (`brains/active-listings-swfl.md:60,79,145,655`), but `listing_active_stats` is **not** in `SOURCE_PROVENANCE_TABLES` (`app/r/source/_tables.ts:33-63`) → `app/r/source/[table]/page.tsx:43` renders the "Not a published source" panel. Every provenance link on the platform's flagship listings brain dead-ends today. (Secondary: that page calls `supabase.from(table)` with no `.schema("data_lake")` — it could not read the view even if allowlisted, and `date_col=scraped_at` names a column the view doesn't have; the column is `latest_scraped_at`.)

---

### 2. AFFECTED vs merely READ — the axis is **propagation timing**, not column overlap

- **IMMEDIATE (per-request reads — a view redefinition shows on the next page load):** consumers 2, 3, 4, 5. `/desk`, `/embed/desk/pulse`, `/insiders`, `/`, and every email built after the change.
- **LAGGED (build-time read, baked into brain output, refreshed only on rebuild, TTL 172800s = 2 days):** consumer 1 → `active-listings-swfl` → `master` → everything downstream of `/api/b/*`.

**This is live right now, and it is the demonstration the tripwire designer needs.** The homes-only migration landed at 11:36 (`c9748a6c`); the brain rebuilt at **06:32** (`brains/active-listings-swfl.md:5`, `refined_at: 2026-07-11T06:32:37Z`, v7). So:

- the view says **20,822 listings / median $420,000** (query above);
- the live brain still says **"28,350 active SWFL residential listings, median asking $345,000 … Lee 20,748 (median $295,945), Collier 7,602 (median $610,000)"** (`brains/active-listings-swfl.md:49`) — the **pre-fix, land-blended** numbers, and `master` v100 (rebuilt the same 06:32) lifted them.

An at-rest Locus-B tripwire reads *view* state and would go green while the *published brain* is still serving the contaminated figures for up to 2 more days. **A view-level content contract does not close the loop on its own — it needs either a rebuild trigger or a paired assertion on the baked brain output.**

**What a definition change breaks, by class:**
- **Column change** (add/rename/drop): breaks **only** consumers 1 and 5 — they are the only ones selecting `avg_days_on_market` / `avg_list_price`. Consumers 2/3/4 select strict subsets.
- **Grain change** (touching the `GROUPING SETS`): breaks the null-ness splitters — consumer 1's `summarize()` (`:83-89`), consumer 2's `rows.find(county == null && zip == null)` (`loaders.ts:135`), consumer 3's null-zip exclusion. A region row that stops being `(NULL, NULL)` silently blanks the `/desk` KPI row and the whole brain.
- **Row-population change** (the `property_type <> 'land'` example): breaks **nobody** — it shifts every consumer's numbers, which is the point. This class is invisible to type/shape checks, which is exactly why the content contract exists.

---

### 3. Locus B breaks nothing — it can only FALSE-ALARM. Two traps, both live.

Per spec §5, Locus B is report-only (folds into the `data-quality` checks ledger; no quarantine). So the design risk is a naive at-rest assertion firing on clean data. Both traps below are real today.

**Trap 1 — the phantom `county + NULL-zip` bucket (Lee, `listing_count = 1`).**
```sql
SELECT county, zip_code, listing_count, median_list_price
FROM pg.data_lake.listing_active_stats WHERE zip_code IS NULL;
-- (NULL, NULL, 20822, 420000) | (Lee, NULL, 14032, 365000)
-- (Collier, NULL, 6790, 649900) | (Lee, NULL, 1, 319900)   <-- phantom
```
The `(county, zip_code)` grouping set emits a bucket for the one active listing whose `zip_code` is NULL. **This is documented behavior**, not new drift — the migration's own comment calls it out (`docs/sql/20260711_listing_active_stats_homes_only.sql:58-60`). A "county rows sum to region" or "county appears exactly once" assertion **false-fires on it**. Only live victim: **consumer 1** — `summarize()` puts it in `by_county` (any row with `county != null && zip == null`), so the brain ships a duplicate county entry, live: *"…Collier 7,602 (median $610,000), **Lee 1 (median $319,900)**"* (`brains/active-listings-swfl.md:49`, plus two `"key": "Lee"` rows at `:117` and `:135`). `lib/desk/loaders.ts:136-143` explicitly dedupes it by max `listing_count`; consumers 3/4/5 exclude null-zip rows. **The brain is the one that needs the same guard the desk already has.**

**Trap 2 — 3 ZIPs legitimately appear TWICE (cross-county straddle). NEW — not in `03`/`04`.**
```sql
SELECT zip_code, count(*) FROM pg.data_lake.listing_active_stats
WHERE zip_code IS NOT NULL GROUP BY 1 HAVING count(*) > 1;   -- 34119, 33971, 34110
-- 33971: Lee 581 ($320,000) + Collier 7 ($337,900)
-- 34110: Collier 444 ($659,000) + Lee 14 ($1,599,500)
-- 34119: Collier 467 ($689,000) + Lee 6 ($4,147,500)
```
The grouping key is `(county, zip_code)`, so a ZIP crossing the Lee/Collier line yields two rows. A "one row per ZIP" / "ZIP is unique" tripwire **false-fires on all three**. Live consumer damage today:
- **Consumer 5 (worst):** `.eq("zip_code", zip).maybeSingle()` (`lib/email/market-context.ts:119-120`) returns 2 rows → PostgREST errors → the `catch` at `:152` swallows it → **active-listing count, median list price, and avg DOM all silently vanish** from every deliverable built for 33971, 34110, or 34119. All three are real, populated SWFL ZIPs (Lehigh Acres W, North Naples ×2 — `lib/landing/zip-place-names.ts:39,54,60`).
- **Consumer 4:** all three are in `MAP_ZIPS` (confirmed: same `zip-place-names.ts` lines feed `MAP_ZIPS` via `load-home-map-data.ts:31`). `metricFromRows` does `data[zip] = val` (`:81`) — **last row wins**, and the query has no `.order()`, so the homepage map can render 33971's Market Activity as **7** instead of **581**, non-deterministically.
- **Consumer 2:** `medianByZip.set(...)` (`loaders.ts:648`) — same last-write-wins; 33971's movers-board median flips between `$320,000` and `$337,900`.
- **Consumer 1:** `by_zip` keeps both → the brain emits **duplicate detail-table keys** (`"key": "33971"` ×2, `"34119"` ×2, `"34110"` ×2 in `brains/active-listings-swfl.md`).

**Design implication:** the at-rest contract on this view must be keyed on `(county, zip_code)`, never on `zip_code` alone, and must special-case the null-zip bucket. Both traps belong in the Phase-1 acceptance fixtures (spec §9) alongside the 523 legit sub-$20k land lots and the LeePA nominal-consideration rows.

---

### 4. The stale/orphaned variant — nothing to re-point, but a live write with zero readers

`refinery/sources/active-listings-residential-source.mts` still *carries the old name* (`SOURCE_ID = "active_listings_residential"`, `:25`) but was already re-pointed to `listing_active_stats` (`:27`). **Repo-wide grep confirms zero live reads of `active_listings_residential` or `active_listings_residential_zip_stats`** in `refinery/`, `lib/`, `app/`, `scripts/` — only migrations, docs, and the `lib/email/sole-spine.test.ts` tripwire. **So: no consumer needs re-pointing.**

The real orphan is on the **write** side, and it is a correction of tone (not fact) vs `03` §4c's "stale/orphaned":
```sql
SELECT count(*), max(scraped_at), count(DISTINCT county) FROM pg.data_lake.active_listings_residential;
-- 39,050 rows | 2026-07-11 15:14:46-04 | 5 counties
```
It is **not stale** — it was written *today, six hours after* `listing_active_stats`'s own `latest_scraped_at`, and has grown from the 38,728 rows `03` recorded this morning. `active-listings-daily.yml` (09:00 UTC cron, `freshness_table: data_lake.active_listings_residential`, `ingest/cadence_registry.yaml:1475`) is still crawling and merging daily into a table **no live code reads**. That is a daily crawl-budget burn on dead data, and it belongs in `doctor`'s ZERO-CONSUMER class (a mirror of the spec §6 ZERO_COVERAGE prescription: registry-covered, DB-populated, consumer-less).

**Two known coverage gaps for the tripwire's own guard:** `lib/email/sole-spine.test.ts:8` only walks `lib/email`, `lib/social`, `lib/deliverable`, `lib/listings` — it would **not** catch a new read of `active_listings_residential` from `lib/desk`, `lib/landing`, `app/insiders`, `app/api`, or `components/`. And a Locus-B tripwire keyed on the literal string `active_listings` will false-positive on the *pipeline name* (`ingest/cadence_registry.yaml:1471`) and on metric slugs (`active_listings_count`, `region_median_active_listings`) — key it on `active_listings_residential`.

---

## Blast radius — `market_details_swfl`

**Scope:** `data_lake.market_details_swfl` (base) + `data_lake.market_details_swfl_latest` (the view every consumer actually reads). As-of 2026-07-11. This is the list Fable 5 checks before a Locus-B at-rest tripwire lands (spec §5 Locus B, §13.3). Every claim below is a file:line read or a SELECT-only query run this session.

### 0. The two structural facts that determine everything else

**(a) There is no `property_type` column — so a "property_type filter" fix is impossible on this table.** Unlike the sibling `listing_active_stats` (a view over row-level `listing_state`, filterable), `market_details_swfl` is **pre-aggregated at the vendor**: `ingest/pipelines/market_aggregates/pipeline.py:53-63` (`run_details`) makes **one realtor.com `/housing-market-details` call per ZIP** and stores the vendor's own precomputed medians. Schema: `docs/sql/20260630_market_aggregates_tables.sql:32-49` — PK `(zip_code, captured_date)`, columns are `median_sold_price / median_listing_price / median_rent_price / median_days_on_market / median_price_per_sqft / local_hotness_score / list_to_sold_ratio_pct / sold_to_rent_ratio / market_strength / is_competitive`. **No property_type, no sub-rows.** The land-blend is baked in upstream of us. This independently corroborates the already-open check `market-details-swfl-land-blend-and-dupes` ("land-blended at the VENDOR … needs a display-layer plausibility caveat, **NOT a rewrite**" — `docs/audit/2026-07-11-open-issues-after-triage.md:317`). The only Locus-B move available is a **plausibility assertion**, and the only quarantine granularity is **the whole ZIP row**.

**(b) The contaminated price columns have exactly ONE live consumer — the brain.** The three app consumers read only `local_hotness_score` / `median_days_on_market`. This is the single biggest blast-radius-shrinker in this doc.

### 1. LIVE CONSUMERS (4) — the tripwire list

| # | Path | Reads (verbatim `.select()`) | Grain | Touches contaminated price cols? |
|---|---|---|---|---|
| 1 | `refinery/sources/market-temperature-source.mts:25,68-74` → `refinery/packs/market-temperature-swfl.mts` | **all 13 columns**, incl. `median_sold_price, median_listing_price, median_rent_price, sold_to_rent_ratio` | ZIP (+ region median of `sold_to_rent_ratio`, `:102`) | **YES — the only one** |
| 2 | `lib/desk/loaders.ts:408-419` (`loadMarketTemp`) | `zip_code, local_hotness_score, captured_date` | ZIP → one region gauge | No |
| 3 | `app/charts/page.tsx:138-154` (`loadMarketTemperature`) | `zip_code, local_hotness_score, captured_date` | ZIP → temperature dial | No |
| 4 | `lib/landing/load-home-map-data.ts:179-207` | `zip_code, county, median_days_on_market, captured_date` | ZIP → homepage map DOM pill | No |

**#1 is the load-bearing one and must not be treated as "already covered by 04."** `market-temperature-swfl` is in master's drivers, so its numbers reach `/api/b/master` and every consumer of the dossier. Consumers 2–4 are all **empty-tolerant** (`catch → return null` / `if (error) return {gauge:null}` / pill hides) — a tripwire cannot *crash* them; it can only shift a value or drop a ZIP.

**Non-blast-list counts (dropped, per instructions):** tests **2** (`lib/landing/load-home-map-data.test.ts:71,119` — fixture + forced-error path); sql-defs **2** (`docs/sql/20260630_market_aggregates_tables.sql:32` base, `:92` `_latest`); write path **1** (`ingest/pipelines/market_aggregates/pipeline.py:29` `_DET_TABLE` — sole upstream writer); fixture **1** (`refinery/__fixtures__/market-temperature.sample.json`). Also: the generic provenance route `/r/source/[table]` renders this view dynamically (cited at `brains/market-temperature-swfl.md:60`) — a generic reader, broken by no fix.

### 2. AFFECTED if the definition changes vs merely READ

The answer splits by **which kind of fix** lands — this distinction is load-bearing:

- **Column-correct / plausibility-caveat fix** (the existing check's prescription — flag or annotate the implausible ZIPs, leave rows in place): **affects consumer #1 only.** #2/#3/#4 read `local_hotness_score` and `median_days_on_market`, which are not land-blended in the same way and are not the flagged columns. They are pure READs, insensitive to a price-column fix.
- **Row-drop / quarantine fix** (drop the implausible whole-ZIP rows — the *only* available granularity, since there are no sub-rows to filter): **affects all 4.** The dropped ZIPs vanish from the brain's per-ZIP detail table, from both hotness gauges (shifting the region median hotness), and from the homepage DOM pill (one fewer ZIP on the map).
- **Anything that changes `_latest`'s `captured_date` selection**: affects all 4 — every consumer reads `_latest`, none reads the base table.

Honest framing for the spec: no consumer *breaks*. The blast radius is **value drift** (a region median moves, a ZIP disappears from a map) plus **corrected price context in brain + master**. Nothing throws.

### 3. Stale / orphaned variant to re-point — **N/A here (stated explicitly)**

Unlike the sibling table's `active_listings_residential` situation, `market_details_swfl` has **no stale or orphaned variant**. All four live consumers read `market_details_swfl_latest`; the base table is read by nothing but the freshness probe (`ingest/cadence_registry.yaml:1552` `freshness_table: data_lake.market_details_swfl`). There is no dead sibling view and no consumer to re-point.

### 4. CONFIRMED FINDING — drift in the prior evidence (and in this task's own framing)

**`active-rentals-swfl` does NOT read `market_details_swfl`.** `docs/audit/2026-07-11-pipeline-problems/04-brains-consumers.md:165` lists `data_lake.market_details_swfl` as an active-rentals-swfl upstream, and the task brief inherits it ("the active-rentals-swfl + market-temperature-swfl path"). Both are wrong:

- `refinery/packs/active-rentals-swfl.mts:200` — `sources: [activeRentalsSource]` (that one source, nothing else).
- `refinery/sources/active-rentals-source.mts:27` — `const VIEW = "rental_listing_stats";` is its only read.
- The `market_details_swfl` string at `active-rentals-source.mts:20` is a **docstring pointer away** from it: *"…NEVER a derived median blended from those ranges — the source-faithful median rent per ZIP already lives in market-temperature-swfl via data_lake.market_details_swfl"*.
- No indirect path either: `rental_listing_stats` is defined over `rental_listings_swfl_latest` (`docs/sql/20260701_rentals_swfl_table.sql:43-46`), never over `market_details_swfl`.

**One brain leaves the blast radius.** The correct name for this locus is the **market-temperature-swfl path**, singular.

### 5. Tripwire discriminator + false-alarm cautions (hand-off to the threshold-nailing task)

Live distribution of `sold_to_rent_ratio` (= sold ÷ annual rent) on `market_details_swfl_latest`, 54 rows:

| min | p05 | median | p95 | max | rows < 5 | rows with `median_sold_price` < $100k |
|---|---|---|---|---|---|---|
| **1.28** | 7.22 | 11.40 | 19.15 | 21.14 | **2** | **2** |

The two low outliers are the same two rows on both cuts: **33972** (Lehigh Acres — sold $30,000 / list $34,000 / rent $1,950 → ratio **1.28**) and **33920** (sold $88,750 → ratio **1.90**). Next-lowest legit ZIP is 33903 at **7.12**. So a `sold_to_rent_ratio >= 5` `sql_expectation` isolates exactly the 2 known-bad ZIPs with a ~2.5x safety margin against the cleanest legit row — **zero false positives on the other 52**. Offered as inherited evidence; final threshold-nailing is the separate §13 bullet.

**Two false-alarm traps a naive tripwire will hit:**
1. **Coverage is 54, not 57.** `market_details_swfl_latest` = 54 rows / 54 distinct ZIPs (Lee 34, Collier 20), but `refinery/lib/core-scope.mts:50-52` asserts `CORE_SCOPE_ZIPS.size === 57` (Lee 35 + Collier 22). An "all core ZIPs present" assertion **REDs today**. Do not key on presence.
2. **The "dupes" half of the check name is structurally impossible.** PK is `(zip_code, captured_date)` (`20260630_market_aggregates_tables.sql:48`); the dupe query (`GROUP BY zip_code HAVING count(DISTINCT county) > 1 OR count(*) > 2`) returned **0 rows**. Do not key on uniqueness — spend the assertion budget on plausibility.

**Table state for the record:** 108 rows total, 54 distinct ZIPs, **2 snapshots only** (`captured_date` 2026-07-01 and 2026-07-04). Latest-snapshot null counts: `local_hotness_score` 50/54 non-null, `median_days_on_market` 53/54, `median_sold_price` 51/54, `median_rent_price` + `sold_to_rent_ratio` 49/54 — so any contract on the price columns must be **null-tolerant** (5 of 54 ZIPs legitimately carry no rent/ratio).

---

