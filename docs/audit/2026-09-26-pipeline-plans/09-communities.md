# 09 communities — pipeline plan (09/26/2026)

Family 09 owns the community layer: Lee County's Planned Development boundaries (lee_planned_developments), the parcel-to-community spatial join built from them (parcel_community_pd), the two-county subdivision rollup (neighborhood_stats) and the SteadyAPI neighborhood + amenity pull (neighborhood_amenities). All four feed the communities-swfl brain and the email-path community resolvers. Verdict: the three ingests land clean, but the chain is broken where it matters. The communities-swfl brain serves "53,860 homes in 1,000 neighborhoods" (brains/communities-swfl.md:36) while the live table holds 604,362 homes in 20,400 rows. The cause is a 1,000-row PostgREST cap on an unpaged read. The same cap 404s the neighborhood pages for the five largest subdivisions on production. A wrong column name also silences the community-info email's assessed-value cell. Separately, the PD boundary ingest drops one source field to all-NULL, and the SteadyAPI leg is dead with the vendor. REPAIR neighborhood_stats (consumer side), IMPROVE lee_planned_developments and parcel_community_pd, RETIRE the neighborhood_amenities ingest. There are no LLM legs in this family.

## 1. Scope

Count: 4 pipelines, 3 workflow files, 6 lake tables + 1 view, 1 leaf brain, 6 live app/lib readers (5 found by the first pass + the provenance page `app/r/source/[table]/page-data.ts`, added by the second-Opus consumer grep).

- lee_planned_developments. Registry `ingest/cadence_registry.yaml:838`. Workflow `.github/workflows/lee-planned-developments-quarterly.yml` (step "Ingest PD boundaries", :45-55). Code `ingest/pipelines/lee_planned_developments/pipeline.py` + `resources.py` + `normalize.py`. Table `data_lake.lee_planned_developments`. Registry consumers `[communities-swfl, lib/listings/community-identity]` (:840). Verified reader: only `spatial_join.py:111-115`. It is an input table; `lib/listings/community-identity.ts` names it only in comments (:5, :21).
- parcel_community_pd. Registry `:863`. Same workflow, second step (:57-67). Code `ingest/pipelines/lee_planned_developments/spatial_join.py` + `assign.py`. Table `data_lake.parcel_community_pd` plus view `data_lake.parcel_community_pd_summary_v`. Readers: `lib/listings/community-identity.ts:56` (per-parcel `.in(parcel_id)`) and `refinery/sources/communities-swfl-source.mts:47,298` (the one-row summary view). The brain cites that view at `/r/source/parcel_community_pd_summary_v` (`communities-swfl-source.mts:323`, `brains/communities-swfl.md:80`), but the view is not in the provenance allowlist, so the link renders "Not a published source" (P13).
- neighborhood_stats. Registry `:1087`. Workflow `.github/workflows/neighborhood-stats-annual.yml`. Code `ingest/duckdb_pipelines/neighborhood_stats/pipeline.py` + `agg.py`. Table `data_lake.neighborhood_stats`, from view `data_lake.parcel_subdivision_v` over `lee_parcels` + `collier_parcels`. Readers:
  - `refinery/sources/communities-swfl-source.mts:215` (brain)
  - `app/r/communities-swfl/communities.ts:165` (public neighborhood pages)
  - `lib/deliverable/recipes/community-info.ts:173-176` (email recipe)
  - `lib/listings/community-lookup.ts:190-194` (address spine)
  - `ingest/pipelines/community_profiles/build_master_list.py:172-174` (psycopg)
  - `app/r/source/[table]/page-data.ts:41-50` (the public provenance page `/r/source/neighborhood_stats`, allowlisted at `app/r/source/_tables.ts:48`). Every neighborhood_stats row's `source_url` points here (`agg.py:87`), and so does the brain's neighborhood citation. It renders "Rows 0 ... Table is published but has no rows yet." (P12).
- neighborhood_amenities. Registry `:2279`, `dispatch_only: true` (:2281). Workflow `.github/workflows/neighborhood-amenities-daily.yml`, `disabled_manually` (`gh api repos/:owner/:repo/actions/workflows`). Code `ingest/pipelines/neighborhood_amenities/pipeline.py` + `distill.py`. Tables `data_lake.steadyapi_neighborhoods`, `steadyapi_neighborhood_amenities`, `steadyapi_property_neighborhood`. Readers: `lib/deliverable/recipes/community-info.ts:113,150` and `lib/listings/neighborhood-amenities.ts:370-409`, fed through `lib/deliverable/recipes/shared.ts:36`.

Reader scope pass for the 1,000-row truncation shape (RULE 0.5c), over every non-test reader above:
- 2 truncate: `communities-swfl-source.mts:215` and `communities.ts:165`. Both do `.select("*")` with no range against 20,400 rows.
- 1 names a column that does not exist: `community-info.ts:174-175`.
- 1 reads the wrong schema: `app/r/source/[table]/page-data.ts:42-44, :50` (P12). It is not the truncation shape, but it is a seventh reader and it serves a wrong row count.
- 5 are safe:
  - `community-lookup.ts:190` (eq on county + name)
  - `community-identity.ts:56` (in-list)
  - `neighborhood-amenities.ts:370-409` (bbox, eq, per-slug)
  - `community-info.ts:113` (429 rows, under the cap)
  - `community-info.ts:150` (largest slug holds 89 rows)
- The per-slug maximum comes from `select slug_id, count(*) ... group by 1 order by 2 desc limit 3` → 89. `build_master_list.py` reads through a psycopg cursor, which has no cap.

## 2. What is being brought in

lee_planned_developments
- Source: the Lee County DCD "PlannedDevelopments" ArcGIS FeatureServer layer 0 (`constants.py:19-22`; homepage https://www.leegov.com/dcd/zoning/pd). Public, free, no WAF.
- Fields: 10 of 26 source fields (`resources.py:48-51` `_OUT_FIELDS`) + normalized name + WGS84 GeoJSON geometry (server reprojection outSR=4326). The ceiling is 26 fields (`cadence_registry.yaml:857`).
- Geography: unincorporated Lee plus legacy incorporated polygons. Cape Coral, Fort Myers and Bonita Springs are not fully covered (`constants.py:10-13`). Collier 0, Hendry 0.
- Cadence: quarterly cron `30 13 2 1,4,7,10 *` (workflow :10). `cadence_days: 92` (:843).
- Live rows (fam09 `q.mts`, `select count(*) ... from data_lake.lee_planned_developments`):
  - 1,627 rows, 1,627 distinct objectid
  - MAX(last_edited_date) 08/20/2026
  - `_dlt_loads` newest `lee_planned_developments` load 08/30/2026 01:55 UTC
- Source today (`curl .../FeatureServer/0/query?where=1=1&returnCountOnly=true`):
  - 1,631 features
  - layer `dataLastEditDate` 1790252359634 = 09/24/2026 (`date -u -d @1790252359`)
  - MAX(last_edited_date) 1790185233000 = 09/23/2026
  - The source is alive and still being edited.

parcel_community_pd
- Source: derived. DuckDB ST_Contains over `leepa_parcels` lat/lon × the Approved + residential-allowlist PD polygons (`spatial_join.py:102-126`, `assign.py:33-38`).
- Fields: parcel_id, pd_object_id, community_name_normalized, case_name_raw, zoning_category, input_method, acres, ambiguous, assignment_criteria, assigned_at (`spatial_join.py:129-142`).
- Geography: Lee only. Collier is excluded explicitly (220,875 rows counted from `parcel_subdivision_v` county='collier'; run 33286533675 log). Hendry 0.
- Cadence: same quarterly workflow, step 2.
- Live, from `select count(*), max(assigned_at), count(distinct community_name_normalized), sum(ambiguous), sum(low-trust) from data_lake.parcel_community_pd`:
  - 104,911 rows
  - assigned_at 08/30/2026 01:57 UTC (MIN = MAX: one snapshot)
  - 409 communities
  - 7,429 ambiguous
  - 803 low-trust
- Summary view (`select * from data_lake.parcel_community_pd_summary_v`): servable_parcels 96,679, servable_communities 401.
- Input: `leepa_parcels` holds 548,798 rows, 547,724 of them with latitude (`select count(*), count(latitude) from data_lake.leepa_parcels`). Its newest load is 07/11/2026 (`max(_dlt_load_id)` 1783812523 → `date -u -d @1783812523`).

neighborhood_stats
- Source: derived from the FDOR 2025 roll through `parcel_subdivision_v` (lee_parcels + collier_parcels). Homes only.
- Fields: county, subdivision_name, home_count, count_by_type, median_just_value, median_year_built, source_url, as_of, inserted_at, updated_at (information_schema query).
- Geography: Lee + Collier. Hendry 0 (the view is two-county, `docs/standards/data-roots.md:132`).
- Cadence: cron `0 15 24 * *` (monthly, workflow :8) against `cadence_days: 365` (registry :1091).
- Live, from `select county, count(*), max(inserted_at), max(as_of), sum(home_count) from data_lake.neighborhood_stats group by county`:
  - Lee: 11,569 rows / 383,487 homes
  - Collier: 8,831 rows / 220,875 homes
  - both inserted 09/24/2026 18:55 UTC
  - = 20,400 rows / 604,362 homes
- Newest run 36044060884 log: "604362 parcel rows -> 20400 (county, subdivision) groups".
- Shape (`count(*) filter ...` query):
  - 12,949 of 20,400 groups have home_count < 5
  - 2 groups (792 homes) have a blank name
  - 0 have a null median
- Inputs: collier_parcels loaded 09/20/2026 16:00 UTC (`_dlt_loads`; its cron `0 12 20 * *` runs monthly). lee_parcels loaded 07/18/2026 (`max(_dlt_load_id)` 1784408492).
- The 604,362 figure is identical to `data-roots.md:132` for 07/19/2026. The monthly job is recomputing an unchanged roll. [INFERENCE from the matching count; the Collier re-merge may still move just_value.]

neighborhood_amenities
- Source: SteadyAPI `/neighborhood-amenities` (realtor.com data via the vendor; `distill.py:12`). Input is one propertyId per call (`pipeline.py:32-34`).
- Fields:
  - vendor neighborhood with boundary polygon, centroid and 12 location scores
  - Yelp-derived nearby businesses
  - property_id → slug_id pairing
- Geography: effectively Lee. `select city, count(*) from data_lake.steadyapi_neighborhoods group by 1` returns 30 cities. Of the 429 neighborhoods:
  - 1 in a Collier city (Naples)
  - 0 in a Hendry city
  - 3 in out-of-scope cities (Sarasota among them)
  - the rest under Lee city names (Fort Myers 111, Bonita Springs 47, ...)
  - [INFERENCE: the city → county mapping is mine, from the city names]
- Cadence: none. Cron commented out (workflow :26-27), workflow `disabled_manually`, `AMENITIES_DRAIN_ENABLED` unset (`gh variable list` returns 12 variables; none is named AMENITIES_DRAIN_ENABLED).
- Live, from `select (count/max as_of) ...`:
  - steadyapi_neighborhoods 429 rows (as_of 08/04/2026)
  - steadyapi_neighborhood_amenities 29,118
  - steadyapi_property_neighborhood 21,008 (as_of 08/04/2026)
  - newest `_dlt_loads` `neighborhood_amenities` load 08/04/2026 04:30 UTC
- Grain (`select level, count(*) ... group by 1`): residential_neighborhood 341, neighborhood 78, macro_neighborhood 7, sub_neighborhood 3.
- Vendor: the subscription returned 403 "You do not have an active subscription" (`_ASSISTANT/SCRATCHPAD.md:946`). SteadyAPI is OUT permanently on the operator's word (`_ASSISTANT/SCRATCHPAD.md:492`).

## 3. What is working

- lee_planned_developments. Run 33286722483 (08/30/2026, workflow_dispatch) succeeded in about 4 minutes (job 01:54:15 to 01:58:12 UTC). Log: "1629 features fetched, 1627 rows normalized, 2 dropped", then "1627 rows merged into data_lake".
  - Guards that exist and fire before any write:
    - canonical count check `resources.py:64-65`
    - 2% drop floor `resources.py:78-82`
    - Lee bounds assertion on every vertex `normalize.py:83-95`
  - Tests: 26 collected in `ingest/pipelines/lee_planned_developments` (`pytest --collect-only`), all green. The family run `ingest/.venv/Scripts/python.exe -m pytest -q ...` returned "59 passed".
- parcel_community_pd.
  - The same run landed 21 chunks, "stale rows swept: 0", "LIVE: parcel_community_pd holds 104,911 assignments across 409 communities". The live table matches exactly (section 2).
  - The silence rules for Sketched / "Bad Legal" / ambiguous are enforced in `lib/listings/community-identity.ts:16-25` and tested: `bun test ... lib/listings/community-identity.test.ts` is part of the 77-pass run below.
  - The brain carries the servable metric's number correctly: `brains/communities-swfl.md:72-83`, `parcels_with_pd_community_identity_lee` = 96,679, which matches the view. Its citation link is dead, though (`:80` → "Not a published source", P13).
  - The registry already routes freshness through `freshness_table` + `assigned_at` (:880-881). The doctor graded it FRESH on 09/26 (freshness-probe-daily run 36259690113).
- neighborhood_stats.
  - The last 3 runs are green: 36044060884 (09/24 schedule), 32746191778 (08/24 schedule), 30765299583 (08/02 dispatch).
  - The two old failures are fixed in code:
    - SSL EOF on the held connection → one connection per phase (`pipeline.py:120-127`)
    - 20-minute kill → timeout 45 (workflow :23-28)
  - The pooler-timeout read uses a server-side cursor with no ORDER BY (`pipeline.py:36-67`).
  - Tests: 15 in `ingest/duckdb_pipelines/neighborhood_stats` + 3 in `ingest/tests/duckdb_pipelines/neighborhood_stats`, all green.
  - Doctor: "neighborhood_stats | table | FRESH | OK | NO_CONTRACT | GREEN | 🟢 green" (run 36259690113 log).
  - `lib/listings/community-lookup.ts:190-194` reads it correctly (keyed eq).
- neighborhood_amenities.
  - The frozen tables serve with their own date: `neighborhoodAmenitiesSourceLine` renders "as of" from the row's as_of (`lib/listings/neighborhood-amenities.ts:293`), and community-info carries `asOf` from the row (`community-info.ts:139`).
  - No business names ship (`neighborhood-amenities.ts:299-306`, test-enforced).
  - Tests: 15 in `ingest/pipelines/neighborhood_amenities`, green.
  - The spend guard held: the workflow `if:` is fail-closed on a dedicated variable (workflow :55).
- Consumer tests: `bun test refinery/packs/communities-swfl.test.mts lib/deliverable/recipes/community-info.test.ts lib/listings/community-identity.test.ts lib/listings/neighborhood-amenities.test.ts lib/listings/community-lookup.test.ts` → "77 pass, 0 fail".

## 4. Problems

P1. The communities-swfl brain serves a 1,000-row sample as the whole of SWFL.
- Symptom:
  - `brains/communities-swfl.md:36` "53,860 homes in 1,000 neighborhoods"
  - `:50` "53,860 SWFL homes catalogued across 1,000 neighborhoods"
  - `:64` "53,860 residential parcels across 1,000 SWFL neighborhoods"
  - The live table holds 20,400 rows / 604,362 homes (section 2 query).
- Root cause: `refinery/sources/communities-swfl-source.mts:213-221` `readTable` does `.select("*")` with no `.range()`. PostgREST's `db-max-rows` is 1,000 on this project. That comes from memory `reference_postgrest-db-max-rows-truncation.md` (86,574 vs 1,000 measured 06/01/2026), and the brain's own "1,000" matches it. The read has no ORDER BY, so which 1,000 rows arrive is arbitrary.
- The shared fix already exists and is unused here: `refinery/lib/paginate.mts:47` `selectAllPaged` (used by 8 sources: `rg -l selectAllPaged refinery/sources | wc -l`).
- Severity: blocks a served number. It is the brain's headline fact, and the doctor grades the table green.
- First seen: 07/14/2026. `git log -S'1,000 neighborhoods' -- brains/communities-swfl.md` → first commit b842e87d (2026-07-14 21:21 UTC). It was still served in the 09/15/2026 rebuild (`brains/communities-swfl.md:5`). The brain TTL is 180 days (`refinery/packs/communities-swfl.mts:390`), so the wrong number would otherwise stand until 03/2027.

P2. Neighborhood pages 404 for most subdivisions.
- Symptom (production, 09/26/2026):
  - `curl -w %{http_code}` on /r/communities-swfl/n/{cape-coral, lehigh-acres, golden-gate-est, marco-bch, golden-gate} → 404 for all five. These are the five largest rows, by `order by home_count desc limit 5`.
  - The three physically-first rows (marina-south-shore-condo, marina-south-shore-ph-iv, east-shore-acres-ii) → 200.
- Root cause: `app/r/communities-swfl/communities.ts:162-178` fetches all rows unpaged, then `.find()` by slug. Only the first 1,000 of 20,400 are searchable, and `app/r/communities-swfl/n/[neighborhood]/page.tsx:54-55` calls `notFound()` on a miss.
- Severity: blocks a consumer (public report pages).
- First seen: the probe today. The shape is as old as the route.

P3. The community-info email's assessed-value cell is always silent.
- Symptom: `lib/deliverable/recipes/community-info.ts:174-175` selects and filters on column `subdivision`. `data_lake.neighborhood_stats` has no such column (information_schema lists `subdivision_name`), so PostgREST errors and the function returns null (`:177`). `asOf` is also hard-coded null (`:179`).
- Why tests stay green: the lake read is injected in tests (`deps.loadAssessedValue ?? loadAssessedValueFromLake`, `:262`), so no test ever touches the real column.
- Severity: blocks a consumer.
- First seen: introduced 08/03/2026 in commit 2d308c1d (`git log -S'.ilike("subdivision"'`).

P4. INITIALAPPROVAL lands 100% NULL.
- Symptom: `select count(initialapproval) from data_lake.lee_planned_developments` → 0 of 1,627.
- The source field is `esriFieldTypeString` length 4, default "Pend". Values seen: "1993", "WD", "Pend". The source has 65 distinct values, top "Pend" 99 / "WD" 81 / "1986" 66 (groupByFieldsForStatistics query), and `where INITIALAPPROVAL IS NOT NULL` returns 1,631, i.e. every feature.
- Root cause:
  - `normalize.py:123` passes the string to `coerce_date`, which returns None for any string under 10 characters (`ingest/lib/coercion.py:56`).
  - `resources.py:41` declares the column `date`.
- The test never saw the real shape: its fixture feeds None (`test_normalize.py:23`). The registry's "We land 10" claim (`cadence_registry.yaml:861`) is false for this field.
- Severity: cosmetic today (no reader), but it silently destroys the one field that dates a community's approval.
- First seen: first landing 08/28/2026 (registry :854 as_of).
- Deadline: next scheduled fire 10/02/2026 13:30 UTC (cron :10). This is also the first scheduled fire ever, since both prior runs were workflow_dispatch.

P5. Row floors in code are placeholders, while the registry holds the real ones.
- `spatial_join.py:228` `assert_min_rows(len(rows), 1_000, ...)`. The code's own comment at :226-227 says to raise it to about 90% of the first measured run. The registry floor is 94,000 (:872).
- `neighborhood_stats/pipeline.py:103` `assert_min_rows(len(stats), 1, ...)` sits in front of `DELETE FROM data_lake.neighborhood_stats` (:70, :105). The registry floor is 18,360 (:1093).
- A broken read that returns 50 groups would wipe 20,400 rows down to 50. The registry LOW_VOLUME fires only after the damage.
- Severity: blocks a served number (latent).
- First seen: code as shipped (08/28 for the spatial join, 07/15 for stats per the `pipeline.py:96` comment).

P6. neighborhood_stats has slowed 3.5×, and the slow phase is the write.
- The aggregation step took 6.5 min on 08/24 (15:40:30 → 15:47:00, run 32746191778) and 23 min on 09/24 (18:51:45 → 19:14:42, run 36044060884), against a 45-minute timeout (workflow :28).
- Both log lines print in the same millisecond at the end (19:14:42.434 and 19:14:42.435), because Python stdout is buffered in Actions. The log cannot split the phases, but the table can:
  - `inserted_at` is `DEFAULT now()` (`migrations/20260706_neighborhood_stats.sql:19`). In Postgres, now() is the transaction start, and the write opens its own transaction on a fresh connection at the DELETE (`pipeline.py:141`, `pipeline.py:105`).
  - `select min(inserted_at), max(inserted_at), count(distinct inserted_at) from data_lake.neighborhood_stats` → one value for all 20,400 rows: 09/24/2026 18:55:53.076 UTC.
  - So on 09/24 the connect, read of 604,362 rows and DuckDB aggregate took about 4 min 8 s (18:51:45 → 18:55:53). The DELETE, 20,400 single-row `cur.execute(_INSERT)` round trips (`pipeline.py:106-107`) and the commit took about 18 min 49 s (18:55:53 → 19:14:42).
- The input row count did not change (604,362 both times per the logs). The 08/24 run's split cannot be recovered, because the full replace overwrote its rows. [INFERENCE: per-row round-trip latency to the pooler varies from run to run, and 20,400 of them multiply it. The first draft blamed read-side pooler slowness; the measured split points at the write.]
- Severity: blocks a consumer if it crosses 45 minutes.
- First seen: 09/24/2026.

P7. A registry claim contradicts the code on as_of.
- `cadence_registry.yaml:1100` says "as_of is the data vintage, not the landing".
- `agg.py:88` stamps `as_of = date.today()`, so as_of is the aggregation date. The brain cites "as of 2026-08-24" (`brains/communities-swfl.md:64`), which is the 08/24 run date, not the roll year.
- Freshness read path: the claim that neighborhood_stats is probed on `inserted_at` is verified. It is a `count_table`-only entry, and `ingest/scripts/check_freshness.py:278-300` reads `freshness_column` in that branch (added 09/15). The registry comment at `:874-879` (parcel_community_pd), which says `freshness_column` is read only under `freshness_table`, is stale and needs review (item 11).
- Row `source_url` points to our own page `https://www.swfldatagulf.com/r/source/neighborhood_stats` (`agg.py:87`), not the FDOR homepage. That page currently says the table has 0 rows (P12).
- Severity: cosmetic.
- First seen: 09/15/2026 (the registry comment date).

P8. The neighborhood_amenities ingest is dead three ways.
- Vendor subscription 403 (`SCRATCHPAD.md:946`) and SteadyAPI OUT (`:492`).
- Workflow `disabled_manually` with its cron commented out.
- Latent: the workflow could not have written on GHA anyway. It exports `DATABASE_URL` (workflow :59), but `_get_connection` reads only `DESTINATION__POSTGRES__CREDENTIALS` and falls back to `.dlt/secrets.toml` (`ingest/lib/tier1_inventory.py:35-46`). That file is gitignored (`git check-ignore -v .dlt/secrets.toml` → `.gitignore:34`), so `secrets["host"]` raises KeyError. Even the default dry run calls `_load_spine_and_known()` first (`pipeline.py:247`).
- The workflow header's claim "a ROAD at 18,013 of 21,008 paired listings" (:24) was measured wrong on 08/12/2026 (about 370 of 21,008, `SCRATCHPAD.md:1713-1720`).
- The doctor still grades the entry yellow every day: "neighborhood_amenities | table | STALE | OK | NO_CONTRACT | DISABLED | 🟡 yellow" (run 36259690113).
- Severity: cosmetic plus alert noise. The served data is frozen at 08/04/2026 and dated on the page.
- First seen: 08/04/2026 (disabled), 08/14/2026 (vendor dead, `SCRATCHPAD.md:948-949`).

P9. An incident issue stays open after its failure was fixed.
- Symptom: issue #191 "[cron-failure:lee-planned-developments-quarterly] SCHEMA_DRIFT · Lee Planned Developments quarterly — 2026-08-30" is still open (`gh issue list --state open --search planned`).
- The failure it tracks, run 33286533675, was fixed five minutes later by run 33286722483. The classifier returns `{"klass":"SCHEMA_DRIFT","signal":"column \"assigned_at\" is of type timestamp with time zone but expression is of type character varying"}` (`node cls.mjs r1.log`).
- Root cause: `.github/scripts/log-cron-incident.mjs:131` resolves only on a `schedule` success. The record-failure path opens issues for a dispatch failure too, with no trigger filter; it only checks branch at :68.
- On a quarterly workflow, a dispatched fix can never close its own issue. The earliest close is 10/02.
- Severity: cosmetic (noise).
- First seen: 08/30/2026.

P10. The doctor yellows both PD rows although their last run was green.
- Symptom: "lee_planned_developments | table | FRESH | OK | NO_CONTRACT | NO_RUNS_IN_WINDOW | 🟡 yellow" and the same line for parcel_community_pd (run 36259690113), while run 33286722483 was green.
- Root cause: could not verify. The candidate is that the NO_RUNS_IN_WINDOW backfill list is sorted alphabetically (`ingest/lib/gh_runs.py:199`) and capped at 40 (`ingest/scripts/doctor.py:516,544`).
- Severity: cosmetic (noise).
- First seen: the 09/26 probe (earlier probes not read).

P11. The neighborhood_stats 07/20 failure's classifier signal is misleading.
- Run 29719097092 classified `TRANSIENT` with signal "429", but the log line is `psycopg.OperationalError: consuming input failed: SSL error: unexpected eof while reading`.
- The class regex (`classify-cron-failure.mjs:199`) includes `SSL[: ][^\n]*EOF`; the signal regex (:204) does not, so it grabbed a stray "429".
- Severity: cosmetic. It belongs to the cross-cutting family 19, noted here so it is not lost.
- First seen: 07/20/2026 (closed issue #139).

P12. The public provenance page says neighborhood_stats is empty. (Added by the second Opus.)
- Symptom (production, 09/26/2026): `curl https://www.swfldatagulf.com/r/source/neighborhood_stats` renders "Rows 0 · Date range no date column detected · Table is published but has no rows yet." The live table holds 20,400 rows (`pg_class.reltuples` = 20,400; section 2 count).
- Root cause: `app/r/source/[table]/page-data.ts:42-44` (the count) and `:50` (the sample) call `supabase.from(table)` on the default schema. They never call `.schema("data_lake")`, and `utils/supabase/service-role.ts` sets no schema.
- Scope: 4 of the 5 allowlisted tables in `app/r/source/_tables.ts` live in `data_lake`, and all 4 render "Rows 0": neighborhood_stats, community_profiles, parcel_subdivision_v, marketbeat_swfl (curl of each page). The one `public` table, fl_dor_tdt_collections, renders "Rows 666" (`information_schema.tables` confirms the schemas). The defect is in the shared route, so the fix is cross-family (family 19 or the route owner).
- [INFERENCE: why the status is "empty" rather than "count_error". A HEAD count against a relation missing from `public` seems to return a null count with no error, so `rowCount` becomes 0 at `:47-48`. The public-vs-data_lake split above is the evidence; the client internals were not traced.]
- Severity: blocks a consumer. It is the citation target of every neighborhood_stats row (`agg.py:87`) and of the brain's neighborhood citation, and it tells a reader the table is empty.
- First seen: the 09/26 probe. The page cache is hourly (`page-data.ts:67`, `revalidate: 3600`).

P13. The brain's 96,679 PD metric cites a page that refuses it. (Added by the second Opus.)
- Symptom: `brains/communities-swfl.md:80` cites `https://www.swfldatagulf.com/r/source/parcel_community_pd_summary_v?...`. That page returns 200 with "Not a published source ... This table is not exposed via the public provenance route" (curl, 09/26/2026).
- Root cause: `refinery/sources/communities-swfl-source.mts:323` builds the citation with `buildSourceCitationUrl(PD_SUMMARY_VIEW, ...)`, but `parcel_community_pd_summary_v` is not a key of `SOURCE_PROVENANCE_TABLES` (`app/r/source/_tables.ts`; `grep -n parcel_community_pd app/r/source/_tables.ts` returns nothing). `app/r/source/[table]/page.tsx:47-48` then renders the NotPublished panel.
- Severity: blocks a consumer. The number is right, but its provenance link is dead.
- First seen: 08/29/2026. `git log -S'PD_SUMMARY_VIEW' -- refinery/sources/communities-swfl-source.mts` → dce476ed 2026-08-29.

Checks ledger: none of the 21 open checks (`node scripts/check.mjs list`) is in this family. `registry_source_ceiling_no_freshness_field` touches our three source_ceiling blocks (:856-861, :890-895, :2318-2322).

## 5. What is missing

- lee_planned_developments vs source_ceiling (26 fields, :857-861):
  - unpulled: PL_COM, REMARKS, TIDEMARK_ID, DATASHEET, INIT_RESOLUTION, TESTFIELD, GlobalID/edit-audit fields, Shape__*
  - INITIALAPPROVAL is pulled but destroyed (P4)
  - DATASHEET and INIT_RESOLUTION are the only unpulled fields with plausible consumer value (a link to the zoning resolution). Nothing asks for them today, so they stay unpulled.
- lee_planned_developments has no removal of features deleted upstream. It is merge on objectid by design (`resources.py:13-17`). The source moved from 1,629 (08/28) to 1,631 (09/26 probe), so the layer grows today. Acceptable.
- Collier community identity: 0 parcels.
  - Two halves are missing: a Collier PD/boundary layer, still unconfirmed with lead `hub-collierbcc.opendata.arcgis.com` (`docs/standards/community-crosswalk-playbook.md:55`), and Collier parcel coordinates.
  - The coordinates half is a pull choice, not a source ceiling. The FDOR layer collier_parcels already reads is `esriGeometryPoint` ("FDOR Cadastral Centroids 2025", `curl .../Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0?f=json`), yet `collier_parcels` and `lee_parcels` carry no lat/lon/geom column (information_schema query returned []).
  - "Collier holds no coordinates" (`spatial_join.py:18-20`) is true of our table, not of the source.
- Hendry: 0 rows in all four pipelines. `parcel_subdivision_v` is two-county. Hendry is a minor-scope county (CLAUDE.md SCOPE), so this is not planned now.
- neighborhood_stats has no `source_scope` block and no `freshness_sla` (registry :1087-1110 read in full). Its registry cadence (365) does not match its monthly cron (:8).
- The SQL stemmer twin in `migrations/20260719_parcel_subdivision_v.sql:38-40` is still unfixed (`community-crosswalk-playbook.md:33`, :56). It feeds the neighborhood_stats names. The TS twin's fix collapsed only 23 of 20,369 names (`community-crosswalk-playbook.md:32`), so the expected effect is small.
- The schools family is returned on the same SteadyAPI call and was never persisted (:2319). This is moot now that the vendor is out.
- Consumer that should exist and does not: nothing links to the /r/communities-swfl/n/ pages. `curl` of /r/communities-swfl returned 200 with 0 `href="/r/communities-swfl/n/` links, so the 20,400-page surface is reachable only by typed URL.

## 6. Verdict per pipeline

- lee_planned_developments — IMPROVE. The ingest is sound and guarded; one field is destroyed (P4) and must be fixed before the 10/02 fire. Number that changes it: `count(<approval text column>)` after the 10/02 run. 0 → REPAIR, matching the source's non-null count (1,631 on 09/26) → GOOD ENOUGH.
- parcel_community_pd — IMPROVE. The output matches the log and the served metric's number is correct, but its citation link is dead (P13). The in-code floor is 1,000 against a real 104,911 (P5). Number that changes it: the floor in `spatial_join.py:228`. At or above 94,000 → GOOD ENOUGH.
- neighborhood_stats — REPAIR. The ingest is right, but its two biggest consumers read 1,000 of 20,400 rows, a third names a missing column (P1-P3), and its provenance page says it has 0 rows (P12). A served number is wrong. Number that changes it: the brain's "homes" figure. When `brains/communities-swfl.md` states 604,362 homes / 20,400 rows (or whatever `sum(home_count)` reads that day) → GOOD ENOUGH.
- neighborhood_amenities — RETIRE (the ingest and workflow). The vendor is dead and SteadyAPI is out by decree. The three tables stay as frozen, dated reference data because two recipes read them. Number that changes it: none on our side. Only an operator decision to re-subscribe would.

## 7. The plan

Ordered. Every item is lane D (deterministic, no model). Nothing in this family needs a model.

1. DO — Page the brain's neighborhood_stats read and assert completeness.
   - Where: `refinery/sources/communities-swfl-source.mts:213-221, 296`. Replace `readTable(NEIGHBORHOOD_TABLE)` with `selectAllPaged` (`refinery/lib/paginate.mts:47`), ordered on the PK (county, subdivision_name) from `migrations/20260706_neighborhood_stats.sql:21`.
   - Then compare the paged length to a `count: "exact", head: true` probe. On mismatch, degrade the fragment instead of emitting a sample. First write the failing test `communities-swfl.test.mts`: "serves_a_1000_row_sample_as_the_whole_table", with a 1,001-row fake.
   - Lane D. Effort S.
   - Proof: `bun test refinery/packs/communities-swfl.test.mts` green with the new test. After item 4, `grep -n "homes in" brains/communities-swfl.md` shows the live `sum(home_count)`.
   - Unblocks: P1.
2. DO — Make the neighborhood page lookup keyed, not fetch-all.
   - Where: `app/r/communities-swfl/communities.ts:162-178`. `fetchNeighborhoodBySlug` should query `.ilike("subdivision_name", slug.replace(/-/g, "%"))` and keep only rows whose `nameToSlug` equals the slug (`:66-71`).
   - 30 subdivision names exist in both counties (`select subdivision_name ... group by 1 having count(*) > 1` → 30; e.g. TRAIL ACRES, SABAL SHORES), so the lookup can return two rows. Deterministic pick: the larger `home_count`, then county ascending. The page must state the county it shows. Today's `.find()` picks whichever row arrives first. `fetchNeighborhoodStats` (the fetch-all) then has no caller; delete it if nothing else imports it (`rg fetchNeighborhoodStats app lib` shows only communities.ts).
   - Lane D. Effort S.
   - Proof: `curl -s -o /dev/null -w "%{http_code}" https://www.swfldatagulf.com/r/communities-swfl/n/cape-coral` → 200, plus the same for the other four slugs in P2.
   - Unblocks: P2.
3. DO — Fix the community-info assessed-value column.
   - Where: `lib/deliverable/recipes/community-info.ts:174-175`: `subdivision` → `subdivision_name`. Carry `as_of` into `asOf` (`:179`).
   - Add one test that asserts every column named in the select exists in `migrations/20260706_neighborhood_stats.sql`. That is the guard for the "tests inject the read" blind spot.
   - Lane D. Effort S.
   - Proof: `bun test lib/deliverable/recipes/community-info.test.ts` green including the new column test.
   - Unblocks: P3.
4. DO — Rebuild the communities-swfl brain after 1 and 3 land.
   - Where: `daily-rebuild.yml` dispatch with `pack_id=communities-swfl`, `force=true` for this pack only, never master.
   - Lane D (GHA). Effort S.
   - Proof: `gh run list --workflow daily-rebuild.yml --limit 1` green, and the `brains/communities-swfl.md` diff shows the new homes/rows fact.
   - Unblocks: P1 going live. A code fix is not live until the brain rebuilds; the TTL is 180 days (`communities-swfl.mts:390`).
5. DO — Stop destroying INITIALAPPROVAL, before 10/02/2026 13:30 UTC.
   - Where: `resources.py:41` + `normalize.py:123`. Add a new text column `initial_approval_raw` carrying the verbatim value (additive: dlt adds the column; it will not retype the existing `date` column). Fix `test_normalize.py:23` to feed real shapes ("1993", "Pend", "WD").
   - Add an in-run guard: raise if `initial_approval_raw` is null on more than 2% of rows, the same shape as `resources.py:78-82`.
   - Lane D. Effort S.
   - Proof: after the 10/02 fire, `select count(initial_approval_raw) from data_lake.lee_planned_developments` equals the source `where=INITIALAPPROVAL IS NOT NULL&returnCountOnly=true`.
   - Unblocks: P4. Update the registry field census (:861) in the same commit.
6. ASK-FIRST — Drop the all-NULL `initialapproval` date column after item 5 lands. It is a schema drop on `data_lake`, needs the operator's word, and is revertable only by re-ingest. Lane D. Effort S. Proof: information_schema no longer lists it. Unblocks: removes a column that reads as "no approval dates exist".
7. DO — Raise the spatial-join floor to the measured value.
   - Where: `spatial_join.py:228`, `1_000` → `94_000` (registry :872). Update the comment at :224-227.
   - Lane D. Effort S.
   - Proof: `ingest/.venv/Scripts/python.exe -m pytest -q ingest/pipelines/lee_planned_developments` green, and `grep -n "94_000" ingest/pipelines/lee_planned_developments/spatial_join.py`.
   - Unblocks: P5 (half).
8. DO — Raise the neighborhood_stats pre-DELETE floor.
   - Where: `ingest/duckdb_pipelines/neighborhood_stats/pipeline.py:103`, `1` → `18_360` (registry :1093). Add a failing test "wipes_table_on_hollow_aggregate" first.
   - Lane D. Effort S.
   - Proof: `pytest -q ingest/duckdb_pipelines/neighborhood_stats` green with the new test.
   - Unblocks: P5 (half).
9. DO — Batch the stats write, and make the run observable.
   - Where: `ingest/duckdb_pipelines/neighborhood_stats/pipeline.py:104-108`. Replace the 20,400 single-row `cur.execute(_INSERT, ...)` calls with one `cur.executemany(_INSERT, rows)` (or a `COPY`) inside the same transaction as the DELETE, so the full-replace stays atomic.
   - Also: `neighborhood-stats-annual.yml` job env `PYTHONUNBUFFERED: "1"`, plus a timestamped print after the read, after the aggregate and after the write in `pipeline.py:130-144`.
   - Lane D. Effort S.
   - Proof: on the next run, `select min(inserted_at) from data_lake.neighborhood_stats` minus the step start, and the step end minus it, show the write phase well under the 18 min 49 s measured on 09/24 (P6). The log shows three timestamps more than a second apart.
   - Unblocks: P6. The measured split (read + aggregate about 4 min, write about 19 min) says the write is the slow phase. The workflow comment's own fallback (materialize the view read, :27) targets the fast phase, so it is not the fix. Do not raise the timeout.
10. DO — Align the neighborhood_stats registry with reality.
    - Where: `cadence_registry.yaml:1087-1110`:
      - `cadence_days: 31` (it runs monthly). With the existing `tolerance_multiplier: 1.5` (:1092), the doctor row goes STALE after 46 days (`int(cadence * tolerance)`, `ingest/scripts/check_freshness.py:362-363, 418`), i.e. two missed monthly fires. Today's threshold is 547 days. No `freshness_sla` is added; see section 8 for why.
      - replace the false as_of sentence at :1100 with "as_of is the aggregation date"
      - add a `source_scope` block (confirmed_total 20,400 as of 09/24/2026 from run 36044060884; source_ceiling = derived from the FDOR 2025 roll, two counties, Hendry not covered)
    - Lane D. Effort S.
    - Proof: `node scripts/schedule-catalog.mjs | grep neighborhood` and the next freshness-probe-daily row.
    - Unblocks: P7 plus the section 8 signal.
11. DO — Correct the stale parcel_community_pd registry comment.
    - Where: `cadence_registry.yaml:874-879`. The comment says `check_freshness.py` reads `freshness_column` only inside the `freshness_table` branch. Since 09/15 the `count_table` branch reads it too (`ingest/scripts/check_freshness.py:278-300`), which is exactly the branch neighborhood_stats uses.
    - Keep `freshness_table`. It is still required for this entry, for a different reason than the comment gives: the entry also carries `dlt_schema_name: parcel_community_pd` (:871), and `check_freshness.py` tests `dlt_schema_name` (:273) before `count_table` (:281). Without `freshness_table` the probe would fall into the dlt branch on a schema name that never appears. Rewrite the comment to say that, and change only the claim.
    - Leave the PD `freshness_sla` blocks as they are (:848-850, :882-884). Their 370-day error is later than the doctor's own 184-day STALE (92 × 2.0), so they add nothing and remove nothing.
    - Lane D. Effort S.
    - Proof: `sed -n 874,879p ingest/cadence_registry.yaml`.
    - Unblocks: stops the next reader from "fixing" neighborhood_stats by adding a redundant `freshness_table`.
12. DO — Stop the neighborhood_amenities schedule surface (4 files).
    - Delete `.github/workflows/neighborhood-amenities-daily.yml`.
    - Retire the hook regression test that reads that file from disk: `.claude/hooks/lib/cron-failclosed.test.mjs:159-161` (`readFileSync(".github/workflows/neighborhood-amenities-daily.yml")`). It fails with ENOENT the moment the workflow is deleted. Keep the synthetic-fixture case at :190-194, which carries the same guard without the real file. (Found by the second Opus: `rg -l "neighborhood_amenities|neighborhood-amenities-daily" --hidden --glob '!docs/**'` over the whole repo.)
    - Move the registry entry (:2263-2322) out of `pipelines:` into a RETIRED comment block, the same shape as the `parcel_subdivision` retirement at :1075-1085.
    - Regenerate `.github/_watch-manifest.json`, the only other generated reference (`.claude/hooks/check-prepush-gate.mjs:1399` and `.claude/hooks/lib/cron-failclosed.mjs:6` name it only in comments) (`rg -l "neighborhood-amenities-daily|neighborhood_amenities" .github scripts ingest refinery lib`; the lib hits are comment paths in `community-info.ts`, `neighborhood-amenities.ts` and `ray-cast.ts`).
    - Keep the three tables and their two readers.
    - This follows the standing SteadyAPI-OUT decision; no new operator word is needed for the schedule. The serving question is question 1 below.
    - Lane D. Effort S.
    - Proof:
      - `ls .github/workflows | grep amenities` → nothing
      - Gate 10 passes on push
      - the next freshness-probe-daily log has no `neighborhood_amenities` row
    - Unblocks: P8, and deletes one daily yellow row.
13. DO — Close issue #191 with a pointer to run 33286722483. Lane D. Effort S. Proof: `gh issue view 191 --json state` → CLOSED. Unblocks: P9 noise.
14. DO (cross-family, hand to family 19) — Resolve incidents on any green main run of the same workflow that is newer than the failure, not only `schedule`.
    - Where: `.github/scripts/log-cron-incident.mjs:131`. Also add the `SSL[: ][^\n]*EOF` alternative to the signal regex at `classify-cron-failure.mjs:204`.
    - Lane D. Effort S.
    - Proof: the `--dry-run` mode (:13) on a dispatch-success event prints "would close".
    - Unblocks: P9 and P11 class-wide.
15. DO (research) — Settle the Collier boundary layer once.
    - Where: check `community-crosswalk-playbook.md:55` first. Then crawl4ai `hub-collierbcc.opendata.arcgis.com` with the pinned `C:\Users\ethan\crawl4ai-venv\Scripts\python.exe`, file the result under `_RESEARCH/data-and-ingest/`, and index it.
    - Lane D. Effort M.
    - Proof: a new `_RESEARCH/INDEX.md` line and the playbook box ticked or struck.
    - Unblocks: the Collier half of community identity.
16. ASK-FIRST (cross-family, parcels family) — Land the FDOR centroid point geometry as lat/lon on `collier_parcels`. The layer is `esriGeometryPoint`; section 5 has the evidence. It changes a data_lake write shape in another family's pipeline. Lane D. Effort M. Proof: `select count(latitude) from data_lake.collier_parcels`. Unblocks: the Collier half of the spatial join, once item 15 finds a boundary layer.
17. ASK-FIRST — Fix the SQL stemmer twin in `migrations/20260719_parcel_subdivision_v.sql:38-40` (`\y` → the `(?=\s|\d|$)` fix the TS twin got). It is a live-view DDL on data_lake. Lane D. Effort S. Proof: `select count(distinct subdivision_name) from data_lake.parcel_subdivision_v` before/after, plus the neighborhood_stats row count on the next run. Unblocks: small name-collapse gains (section 5).
18. ASK-FIRST — Delete `ingest/pipelines/neighborhood_amenities/` (6 files: `__init__.py`, `pipeline.py`, `distill.py`, `test_pipeline.py`, `test_distill.py`, `fixtures/amenities_naples_6588181567.json`). Together with item 12 this passes RULE 1's more-than-5-files bar. It also breaks the hook positive control `.claude/hooks/lib/table-consumer.test.mjs:60-66`, which reads `ingest/pipelines/neighborhood_amenities/pipeline.py` from disk. Move that control to an inline fixture in the same commit. The code is dead with the vendor and item 12 removes its only runner. Lane D. Effort S. Proof: `ls ingest/pipelines | grep neighborhood_amenities` → nothing, and the ingest suite passes. Unblocks: removes code that can make paid calls if anyone runs it by hand.

## 8. Checks and balances

Design: one signal per pipeline, on existing seams. It fires only when a served number would be wrong or a consumer would read stale, it auto-closes when green, and it never opens a GitHub issue per run.

Which channel carries a per-pipeline signal: the doctor row, not the probe's exit code.
- `freshness-probe-daily` exits 1 when any opted-in `freshness_sla` breaches. It is already red: run 36259690113 on 09/26 was `failure`, issue #110 has been open since 07/12, and check `cron_incident_freshness_probe_daily` is 70 days untouched (`node scripts/check.mjs list`).
- A new SLA breach there cannot be told apart from the standing red, and it cannot auto-close while other pipelines keep the probe red.
- The per-pipeline surface that does change is the doctor row: STALE when age > `cadence_days × tolerance_multiplier` (`ingest/scripts/check_freshness.py:362-363, 418`), LOW_VOLUME below `expected_rows_min`. That row renders on `https://swfldatagulf-ops.vercel.app/coverage` and turns FRESH again on the next landed load.

- lee_planned_developments.
  - Signal: the doctor row. It goes STALE at 184 days (92 × 2.0, registry :843-844), i.e. two missed quarterly fires, and clears on the next load, since `_dlt_loads` schema `lee_planned_developments` matches `pipeline_name` at `resources.py:107`.
  - Bad snapshots never land: the canonical-count, drop-share, bounds and new approval-share guards (items 5 and 7) fail the run instead of writing. A red run is visible through the existing `classify-cron-failure.mjs` path, and a scheduled green closes it.
- parcel_community_pd.
  - Signal: the doctor row, read off the existing `freshness_table` + `assigned_at` (:880-881): STALE at 184 days, LOW_VOLUME under `expected_rows_min: 94000` (:872).
  - The in-run floor (item 7) moves the LOW_VOLUME case from "after the swap" to "before the write". No new mechanism.
- neighborhood_stats.
  - Signal: the source-side completeness assertion from item 1. The communities-swfl source compares its paged row count to an exact head count and degrades the fragment on mismatch. The degraded status lands in `brains/_build-report.json`, which already records per-pack `status: degraded` + `failureClass`.
  - This is the only signal that would have caught P1. A lake-side check cannot see a consumer's truncation, and the doctor graded this row green the whole time.
  - Limit, stated plainly: the assertion runs only when the pack actually builds.
    - `daily-rebuild.yml` has no cron of its own (:12 is commented out); it runs through `nightly-chain.yml`, whose last 5 runs all failed (`gh run list --workflow nightly-chain.yml --limit 5`).
    - The newest build-report commit is 09/22/2026 (`git log -- brains/_build-report.json`), where communities-swfl reads `skipped-fresh` on its 180-day TTL.
    - So the regression test from item 1, which runs in CI on every PR, is the standing guard. The build-time assertion is the backstop when a build happens.
    - A degraded build keeps the last good brain (`written: false` in the build report). Today that brain is the 1,000-row one, so item 4 must succeed once before this guard protects anything.
  - Landing health: the doctor row, STALE at 46 days after item 10 (547 today), LOW_VOLUME under the existing `expected_rows_min: 18360`.
- neighborhood_amenities. Signal: none. After item 12 there is no ingest to watch. The frozen tables are dated on every page they reach (`neighborhood-amenities.ts:293`, `community-info.ts:139`).

Noise to delete:
- GitHub issue #191 (item 13).
- The daily yellow `neighborhood_amenities | STALE | DISABLED` doctor row (item 12).
- The asymmetric incident open/close rule that keeps dispatch-failure issues open for a quarter (item 14, family 19).
- The PD `NO_RUNS_IN_WINDOW` yellows (P10): if family 19 confirms the alphabetical 40-cap at `doctor.py:544`, the fix is to sort the backfill list by cadence or raise the cap. Not a new signal.

Nothing to add in `node scripts/check.mjs`: no open check is in this family, and none should be opened per run. `heal-cron-failure.mjs` needs nothing for these three workflows.

## 9. Box placement

- lee_planned_developments + parcel_community_pd (one workflow): stays on GHA `ubuntu-latest`.
  - The source is a public ArcGIS FeatureServer with no WAF. The 09/26 probe answered from this machine, and run 33286722483 fetched all 1,629 features from a GitHub IP.
  - The job took about 4 minutes against a 45-minute timeout.
  - It needs no browser, no SSD archive and no local model.
  - Its input `leepa_parcels` is refreshed by `leepa-parcels-annual.yml`, which already runs on Fedora when `SWFL_LOCAL_RUNNER_READY` is true (`leepa-parcels-annual.yml:28`). That does not require the join to follow it.
- neighborhood_stats: stays on GHA `ubuntu-latest`.
  - It reads and writes only our own Postgres, needs no residential IP, and took 23 minutes against 45.
  - If item 9 shows the read phase crossing about 35 minutes, the fix is materializing the view read (workflow :27), not moving the box. A home box does not make a pooler faster.
- neighborhood_amenities: goes nowhere; it is retired (item 12). It would have needed nothing from the box anyway (a vendor REST API, 15-minute cap).
- Already on the box that should not be: none from this family. `rg -l "swfl-local" .github/workflows` lists dbpr-sirs, collier-official-records, leepa-comparable-sales, crexi, leepa-parcels, runner-smoke. None of the three workflows here is among them.

## 10. Compute lane per LLM leg

None. Proof:

```
rg -n -i "anthropic|claude|openai|ANTHROPIC_API_KEY|refinery|ollama|llm|gpt" .github/workflows/lee-planned-developments-quarterly.yml .github/workflows/neighborhood-stats-annual.yml .github/workflows/neighborhood-amenities-daily.yml ingest/pipelines/lee_planned_developments ingest/duckdb_pipelines/neighborhood_stats ingest/pipelines/neighborhood_amenities
```

- The only hits are the docstring "No LLM anywhere." (`neighborhood_amenities/pipeline.py:10`) and a README pointer to the refinery pack (`lee_planned_developments/README.md:33`).
- The consumer brain runs no model: `refinery/packs/communities-swfl.mts:397-398` sets `skipSynthesisAgent: true` and `skipTriageAgent: true`.
- `rg -n -i "anthropic|callClaude|messages\.create|openai|generateText"` over the pack, the source, community-identity, neighborhood-amenities and community-info returns only those two flags and the `:435` description.
- community-info composes its paragraph from the vendor's own score sentences in code (`community-info.ts:20-23`).
- Every leg is lane D today and stays lane D.

## 11. Double-check log

I re-read the file top to bottom. The last query batch was re-run after writing (fam09 `q.mts` / `q11.sql`, see the last entries). Format: claim · verifier · result.

- 1,627 PD rows, 1,627 distinct objectid, MAX(last_edited_date) 08/20/2026 · q1 · verified.
- Newest PD `_dlt_loads` 08/30/2026 01:55 UTC · q1 · verified.
- Source 1,631 features, INITIALAPPROVAL non-null 1,631, field type String length 4 · curl returnCountOnly + layer JSON · verified.
- dataLastEditDate 09/24/2026, MAX(last_edited_date) 09/23/2026 · `date -u -d @1790252359` and `@1790185233` · verified.
- 65 INITIALAPPROVAL distinct values, top Pend 99 / WD 81 / 1986 66 · groupByFieldsForStatistics · verified.
- `count(initialapproval)` = 0 · q2 · verified.
- IMS_STATUS spread (Approved 1,207, Pending 66, null 20) differs from the registry census (:861: Pending 67, null 21) · q1 · verified. The difference is the 2 dropped empty-name features; left as is, not a defect.
- 104,911 / 409 / 7,429 / 803, assigned_at 08/30 01:57 UTC · q1 · verified.
- Summary view 96,679 / 401 · q3 · verified.
- leepa_parcels 548,798 / 547,724 with lat, last load 07/11/2026 · q2 + `date -u -d @1783812523` · verified.
- neighborhood_stats 11,569 + 8,831 = 20,400 rows; 383,487 + 220,875 = 604,362 homes; inserted 09/24 · q1 · verified (arithmetic re-done).
- 12,949 groups < 5 homes, 2 blank-name groups / 792 homes · q2 · verified.
- Top-5 subdivisions (CAPE CORAL 85,713 ...) · q2 · verified.
- collier_parcels load 09/20/2026, lee_parcels 07/18/2026 · q8 + `date -u` · verified.
- Steadyapi counts 429 / 29,118 / 21,008, as_of 08/04 · q1 · verified.
- Level spread 341/78/7/3 · q3 · verified.
- Max amenities per slug 89 · q6 · verified.
- Run lists: PD 2 runs (1 success, 1 failure); stats 7 runs (5 success, 1 failure, 1 cancelled); amenities 1 run (skipped) · `gh run list --limit 15` · verified. Section 3 cites only the green ids.
- Stats step durations 6.5 min vs 23 min · `gh run view --json jobs` step timestamps · verified.
- Classifier outputs SCHEMA_DRIFT (r1), TRANSIENT/"429" (r2), UNKNOWN (r3 = the 07/24 cancelled run) · `node cls.mjs` · verified. Section 4 uses r1 and r2 only.
- Brain text "53,860 homes in 1,000 neighborhoods" at :36, :50, :64; metric 96,679 at :74 · `grep -n` · verified.
- The 1,000-row cap on this project · corroborated, not probed directly. Memory note `reference_postgrest-db-max-rows-truncation.md` plus the brain's own "1,000". The service key sits behind the blocked env file, so a direct PostgREST probe was not possible.
- /n/ page 404 ×5 largest, 200 ×3 physically-first · curl · verified.
- Index page has 0 /n/ links · curl + grep · verified.
- community-info column bug `:174-175`, commit 2d308c1d 08/03/2026 · `rg -n` + `git log -S` · verified.
- neighborhood_stats columns (no `subdivision`) · q2 information_schema · verified.
- `spatial_join.py:228` floor 1_000; `pipeline.py:103` floor 1 · `grep -n assert_min_rows` · verified.
- Registry lines :838, :863, :1087, :2279, :849-850, :872, :880-884, :1093, :1100 · `grep -n` / `awk` · verified.
- neighborhood_stats has no freshness_sla/source_scope · `awk` over :1087-1112 · verified.
- Amenities workflow exports DATABASE_URL; `_get_connection` reads only DESTINATION__POSTGRES__CREDENTIALS · workflow :59 + `tier1_inventory.py:35-46` · verified.
- `.dlt/` gitignored · `git check-ignore -v` · verified.
- Issue #191 open since 08/30/2026 01:52 UTC · `gh issue view 191` · verified.
- `log-cron-incident.mjs:131` schedule-only resolve · sed · verified.
- Doctor rows for all four · freshness-probe-daily run 36259690113 log · verified.
- P10 cause (40-cap) · `gh_runs.py:199` + `doctor.py:544` read · could-not-verify. Worded as a candidate in section 4.
- Pytest counts 26 / 15 / 3 / 15 = 59 · `pytest --collect-only` per dir + the combined run "59 passed" · verified.
- Bun 77 pass / 5 files · bun test output · verified.
- FDOR centroid layer is esriGeometryPoint; collier_parcels/lee_parcels have no lat/lon/geom columns · curl + q7 · verified.
- ENGINE_ENABLED true, SWFL_LOCAL_RUNNER_READY true, no AMENITIES_DRAIN_ENABLED · `gh variable list` · verified.
- Brain TTL 180 days · `communities-swfl.mts:390` · verified.
- `selectAllPaged` used by 8 sources · `rg -l | wc -l` · verified.
- Neighborhood_stats PK (county, subdivision_name) · `migrations/20260706_neighborhood_stats.sql:21` · verified.
- LLM grep shows none · re-run in section 10 · verified.
- Correction applied: a first-draft line said lee_planned_developments is read by `lib/listings/community-identity.ts`. Re-reading showed only comments name it there (:5, :21). Section 1 now says its only reader is `spatial_join.py`.
- neighborhood_stats freshness uses the `count_table` branch on `inserted_at` · `ingest/scripts/check_freshness.py:253-300` · verified. The registry comment :874-879 is stale.
- Doctor STALE threshold = int(cadence × tolerance): PD 184 days, stats 547 today · `check_freshness.py:362-363, 418` + registry :843-844, :869-870, :1091-1092 · verified.
- freshness-probe-daily red 09/26, issue #110 open, check 70d untouched · `gh run list` / `gh issue list` / `check.mjs list` · verified.
- daily-rebuild has no own cron; nightly-chain last 5 runs failed; newest build-report commit 09/22; communities-swfl `skipped-fresh` · `grep -n cron daily-rebuild.yml`, `gh run list --workflow nightly-chain.yml --limit 5`, `git log -- brains/_build-report.json` · verified.
- P1 first seen 07/14/2026 (b842e87d) · `git log -S` · verified.
- 30 subdivision names in both counties · q12 · verified.
- steadyapi_neighborhoods: 30 cities, 1 Naples, 0 Hendry cities, 3 out-of-scope · q12/q13 · verified (the city → county mapping is marked INFERENCE).
- Retirement touch list: workflow + registry + `.github/_watch-manifest.json` + comment-only lib paths; pipeline dir holds 6 files · `rg -l` + `ls` · verified.
- Correction applied: section 8 first routed the PD signals through `freshness_sla` + the probe exit code, and cited a wrong path (`ingest/check_freshness.py`). That exit code is already red (run 36259690113), so it cannot carry a per-pipeline signal. Section 8, item 10 and item 11 were rewritten to use the doctor row (`ingest/scripts/check_freshness.py`), and the SLA edits were dropped.
- Correction applied: the first draft's item 12 deleted 7+ files as a single DO, which is past RULE 1's >5-file bar. It is now split into item 12 (DO, 3 files) and item 18 (ASK-FIRST, the 6-file pipeline dir).
- Correction applied: the amenities geography said "Lee/Collier/Hendry listings" with no command behind it. It was replaced with the q13 city count.
- Correction applied: line anchors were re-pinned with `grep -n` against the real files. The first draft took some numbers from a concatenated `cat -n`.
  - `resources.py`: canonical :113-114 → :64-65, drop floor :127-131 → :78-82, docstring :14-17 → :13-17, pipeline_name :156 → :107
  - `community-info.ts` asOf :128 → :139
  - registry PD census :858 → :861, confirmed as_of :853 → :854, ceiling blocks → :856-861 / :890-895 / :2318-2322, amenities block → :2263-2322, parcel_subdivision retirement → :1075-1085
  - playbook "23 of 20,369" :31 → :32
- Correction applied: a first-draft sentence called the classifier's 07/20 class wrong. The class (TRANSIENT) is right; only the signal field is wrong (P11 reworded).
- Re-run 09/26/2026 · `bun q.mts q11.sql` → PD 1,627 rows, 0 initialapproval non-null; parcel_community_pd 104,911; neighborhood_stats 20,400 rows / 604,362 homes; steadyapi_property_neighborhood 21,008 · verified, nothing moved during the session.

## 12. Questions for the operator

1. The SteadyAPI subscription is dead and the vendor is out. Should the community-info email and the address-spine "nearby amenities" line keep serving the frozen 08/04/2026 neighborhood scores and amenity counts? They are dated on the page. The alternative is dropping that lane from the product, which would then let the three `steadyapi_*` tables be removed.
