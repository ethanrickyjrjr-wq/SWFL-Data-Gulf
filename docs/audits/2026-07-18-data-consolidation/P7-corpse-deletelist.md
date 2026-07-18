# P7 — Platform Corpse Delete List

Stream: **P7 (platform corpses)**. Author: Opus subagent, 2026-07-18. READ-ONLY audit.

**Hard constraints honored:** No DROP/DELETE/TRUNCATE was executed. Every plan below is
**guarded SQL as TEXT ONLY**. All deletions are operator-gated (RULE 1) and every recommendation
is tagged **[NEEDS-SIGN-OFF]**. Every reader-claim cites a `file:line` or a live catalog probe.
No normative "X IS the authority" claim is made (out of scope for a subagent).

---

## Method (how "zero readers" was verified for each)

1. **Reader grep** across code (`refinery/ lib/ app/ components/ scripts/ tools/ ingest/`) for the
   table/view name and its Storage path. Tests (`*.test.*`), comments, doc `.md`, migration-runner
   lists, and probe/diagnostic scripts do **not** count as live readers.
2. **Connector confirmation** — opened the source connector that *names* each object to confirm what
   it actually `.from()`s (naming-landmine defense).
3. **Live catalog probe** (`mcp__supabase__execute_sql`, read-only) — object existence + relkind +
   approx row count, and a `pg_depend`/`pg_rewrite` dependents check on the three views.
4. **Cron confirmation** — read the GHA workflow file(s) that write each object.

---

## SAFETY RANKING (true corpses / safest first)

| # | Object | Kind (probed) | Readers | Cron writer | Verdict |
|---|--------|---------------|---------|-------------|---------|
| 1 | `data_lake.fema_nfip_claims_swfl` | VIEW | 0 live | none (derived view) | **DELETE — safest** [NEEDS-SIGN-OFF] |
| 2 | `data_lake.fdot_aadt_swfl_yearly` | VIEW | 0 live | none (derived view) | **DELETE — safest** [NEEDS-SIGN-OFF] |
| 3 | `data_lake.usgs_caloosahatchee_stage_latest` | VIEW | 0 live | none (derived view) | **DELETE — safe** [NEEDS-SIGN-OFF] |
| 4 | `census_vip` (cold Storage parquet) | not a PG object | 0 live | `ingest-census-vip.yml` (ACTIVE, monthly d12) | **DELETE — clean** [NEEDS-SIGN-OFF] |
| 5 | `fred_g17` (cold Storage parquet) | not a PG object | 0 live | `ingest-fred-g17.yml` (ACTIVE, monthly d17) | **DELETE — clean** [NEEDS-SIGN-OFF] |
| 6 | `data_lake.active_listings_residential` (+ `_zip_stats` view) | TABLE (~40,398 rows) + VIEW | 0 live | via `nightly-chain.yml` (standalone cron RETIRED) | **DELETE — entangled disable** [NEEDS-SIGN-OFF] |
| 7 | `bls_oews_swfl_tier1` (cold NDJSON archive) | not a PG object | 0 live | `bls-oews-annual.yml` — **SHARED with live tier-2** | **FLAGGED — do NOT cron-disable; low-value defer** |
| 8 | `usgs` tier-1 parquet (`usgs_water_swfl.parquet`) | not a PG object | 0 live **today** | `usgs-monthly.yml` (ACTIVE, monthly d10) | **FLAGGED — do NOT delete (designated zombie-replacement)** |

Row counts / relkinds are from a live `pg_class` probe 2026-07-18. `census_vip`, `fred_g17`,
`bls_oews_swfl_tier1`, `usgs_water_swfl` returned **no `data_lake` Postgres relation** — confirming
they are cold tier-1 Storage artifacts, so their deletion is a Storage-prefix + cron/writer action,
**not** a `DROP TABLE`.

---

## Pre-flight guard (run before ANY drop in this list) [NEEDS-SIGN-OFF]

Deletion is blocked until this returns as expected on the day of execution. Re-confirms zero readers
did not appear since this audit, and zero view dependents:

```sql
-- (a) Nothing depends on the three orphan views (expect 0 rows).
SELECT v.relname AS view_name, dep.relname AS dependent
FROM pg_class v
JOIN pg_namespace vn ON vn.oid=v.relnamespace AND vn.nspname='data_lake'
JOIN pg_depend d ON d.refobjid=v.oid AND d.refclassid='pg_class'::regclass
JOIN pg_rewrite rw ON rw.oid=d.objid
JOIN pg_class dep ON dep.oid=rw.ev_class AND dep.oid<>v.oid
WHERE v.relname IN ('fema_nfip_claims_swfl','fdot_aadt_swfl_yearly','usgs_caloosahatchee_stage_latest');
```
Live result on 2026-07-18: **`[]`** (zero dependents on all three). Re-run at execution time.

Plus a fresh code grep (must show only tests/comments/probe scripts):
`grep -rn "active_listings_residential\|census_vip\|fred_g17\|usgs_caloosahatchee_stage_latest\|fema_nfip_claims_swfl\|fdot_aadt_swfl_yearly" refinery/ lib/ app/ components/`

---

## DO-NOT-TOUCH list (live objects that share a name/root with a corpse)

These are the grep-and-destroy-by-name traps. **Leave every one of these intact:**

- `refinery/sources/active-listings-residential-source.mts` — its `SOURCE_ID = "active_listings_residential"`
  (line 25) is a **legacy label**; it actually reads `VIEW = "listing_active_stats"` (line 27,
  `.from(VIEW)` line 68) — the live daily spine. Deleting/renaming this file or its SOURCE_ID string
  breaks the live `active-listings-swfl` brain.
- `refinery/packs/active-listings-swfl.mts:16` — same legacy `SOURCE_ID` string; reads the spine, not the corpse.
- `ingest/pipelines/fgcu_reri_indicators/pipeline.py:48` + `refinery/sources/fgcu-reri-source.mts` —
  `"active_listings_residential"` here is an **indicator slug** (INDICATOR_LABELS: "Residential Active
  Listings" → slug) written into the `indicator` column of `public.fgcu_reri_indicators`. Pure string
  collision. fgcu reads `.from("fgcu_reri_indicators")` (source line 108), never the corpse; its
  Charlotte data comes from the FGCU RERI PDF scrape, not the corpse scraper.
- `data_lake.fema_nfip_claims` (TABLE, 448,425 rows) + views `data_lake.fema_nfip_county_year` +
  `data_lake.fema_nfip_zip_window_agg` — the **live** NFIP read path (`fema-nfip-source.mts:53-55,766-807`).
  Only the `_swfl` convenience view is the corpse.
- `data_lake.fdot_aadt_fl` (TABLE, 103,662 rows) + view `fdot_aadt_county_year` — live traffic read path
  (`fdot-source.mts`). Only `fdot_aadt_swfl_yearly` is the corpse.
- `data_lake.bls_oews_swfl` (TABLE, 220 rows) — the **live** OEWS read (`bls-oews-source.mts`). Only the
  tier-1 NDJSON archive is redundant.
- `data_lake.usgs_daily` (605 rows) + `data_lake.usgs_sites` (900 rows) — frozen but STILL the live read
  path for env-swfl. Owned by a different stream (`usgs_tier2_orphan`). Not this list.

---

# ITEM 1 — `data_lake.fema_nfip_claims_swfl` (VIEW) — DELETE, safest [NEEDS-SIGN-OFF]

- **What:** SWFL 6-county convenience view over `data_lake.fema_nfip_claims`. Def:
  `docs/sql/fema_nfip_claims_swfl.sql`.
- **Zero readers (verified):** The view's own SQL header (lines 3-9) states: *"this view is an ANALYST
  CONVENIENCE — NOT the path the brain reads."* Confirmed in code:
  `refinery/sources/fema-nfip-source.mts:35` — *"The brain reads the base table directly, not the
  convenience view at docs/sql/fema_nfip_claims_swfl.sql."* The connector `.from()`s `fema_nfip_claims`
  (TABLE, line 53/800), `fema_nfip_county_year` (line 767), `fema_nfip_zip_window_agg` (line 781) — never
  `_swfl`. Non-code refs only: `lib/welcome/grounded.test.ts`, `lib/citations/clean-url.test.ts` (tests),
  `scripts/lake-probe.mts`, `scripts/build_swfl_zip_county.py`, `ingest/scripts/migrate_nfip_flood_zone_current.py`,
  fixtures, docs.
- **Live dependents:** 0 (pg_depend probe above). View SQL header line 24 independently states "no dependents."
- **Cron:** none — it is a derived view, no writer/workflow of its own. Its base table's ingest is untouched.
- **Guarded plan (TEXT ONLY):**
  ```sql
  -- RESTRICT (default) — no CASCADE, so a surprise dependent fails LOUD instead of cascading.
  DROP VIEW IF EXISTS data_lake.fema_nfip_claims_swfl;
  NOTIFY pgrst, 'reload schema';
  ```
  Then (repo hygiene, separate commit): delete `docs/sql/fema_nfip_claims_swfl.sql`; drop the row in
  `scripts/lake-probe.mts` that probes this view. No cron, no registry, no Storage action.

# ITEM 2 — `data_lake.fdot_aadt_swfl_yearly` (VIEW) — DELETE, safest [NEEDS-SIGN-OFF]

- **What:** Lee+Collier convenience view over `data_lake.fdot_aadt_fl`. Def: `docs/sql/fdot_aadt_swfl_yearly.sql`.
- **Zero readers (verified):** SQL header lines 3-9: *"this view is an ANALYST CONVENIENCE — NOT the path
  the brain reads. The traffic-swfl brain's source connector (refinery/sources/fdot-source.mts) queries
  data_lake.fdot_aadt_fl DIRECTLY."* (data-roots.md:1408 corroborates the live read is the `fdot_aadt_county_year`
  view + raw table.) Only reader in the tree is `scripts/lake-probe.mts:22` (a diagnostic probe — does not count).
- **Live dependents:** 0 (pg_depend probe).
- **Cron:** none (derived view).
- **Guarded plan (TEXT ONLY):**
  ```sql
  DROP VIEW IF EXISTS data_lake.fdot_aadt_swfl_yearly;
  NOTIFY pgrst, 'reload schema';
  ```
  Then delete `docs/sql/fdot_aadt_swfl_yearly.sql` and the `scripts/lake-probe.mts` row.

# ITEM 3 — `data_lake.usgs_caloosahatchee_stage_latest` (VIEW) — DELETE, safe [NEEDS-SIGN-OFF]

- **What:** Single-row median-stage view over `usgs_daily` + `usgs_sites` (Caloosahatchee HUC `03090205*`,
  param `00065`). Def: `docs/sql/20260623_usgs_caloosahatchee_stage_latest_view.sql`.
- **Zero readers (verified):** SQL header says it was built to *"Replace the two selectAllPaged calls
  (sites + daily) in usgs-water-source.mts"* — but that adoption **never happened**: `usgs-water-source.mts`
  still reads the base tables `usgs_daily`/`usgs_sites` directly (data-roots.md:1367,
  `usgs-water-source.mts:196-236` fetchLive). The only reference in the tree is `scripts/run-agg-migrations.py:32`
  (the migration-runner's file list — not a reader). No `.from("usgs_caloosahatchee_stage_latest")` anywhere.
- **Live dependents:** 0 (pg_depend probe).
- **Cron:** none (derived view). NOTE: it sits *on top of* the frozen `usgs_daily` zombie, so it would
  serve stale data if wired — another reason to drop rather than adopt. The frozen base table itself is
  the separate `usgs_tier2_orphan` stream, **not** this item.
- **Guarded plan (TEXT ONLY):**
  ```sql
  DROP VIEW IF EXISTS data_lake.usgs_caloosahatchee_stage_latest;
  NOTIFY pgrst, 'reload schema';
  ```
  Then delete `docs/sql/20260623_usgs_caloosahatchee_stage_latest_view.sql` and its line in
  `scripts/run-agg-migrations.py`.

# ITEM 4 — `census_vip` (cold tier-1 Storage parquet) — DELETE, clean [NEEDS-SIGN-OFF]

- **What:** Census Value of Construction Put in Place, national grain, 4 collapsed categories. Cold parquet
  `lake-tier1/macro/census_vip/`. `consuming_pack: none` (registry). Pipeline `ingest/pipelines/census_vip/`.
- **Not a Postgres object:** live probe returned no `data_lake.census_vip` relation → deletion is
  Storage + cron, **no `DROP TABLE`**.
- **Zero readers (verified):** No `refinery/sources/` connector, no pack, no page. Only refs:
  `tools/lake-mcp-server.*` (the generic DuckDB view-name deriver — not a consumer),
  `scripts/notion-sync.mjs` (doc sync), tests. (data-roots.md:1097-1102, cross-cut #3 at :1146 concur.)
- **Cron:** `.github/workflows/ingest-census-vip.yml` — `schedule: cron "0 13 12 * *"` is **ACTIVE**
  (monthly, day 12), gated by `ENGINE_ENABLED != 'false'`.
- **Guarded plan (TEXT ONLY) — do all four for a coherent retirement:**
  1. **Disable cron:** delete `.github/workflows/ingest-census-vip.yml` (or comment its entire `on: schedule:`
     block, keeping `workflow_dispatch` for a manual re-pull if ever needed).
  2. **Delete Storage prefix** `lake-tier1/macro/census_vip/` (Supabase Storage — operator/CLI action, not SQL).
  3. **Park the registry entry** for `census_vip` in `ingest/cadence_registry.yaml` (move under a parked/
     `not_yet_running:`-style block or delete) — otherwise the freshness/staleness monitors flag an
     "expected source that never arrives" (the map's own `data_vintage` concern).
  4. **Retire pipeline** `ingest/pipelines/census_vip/`.
- No DB objects, no dependents, no live consumer — fully self-contained corpse.

# ITEM 5 — `fred_g17` (cold tier-1 Storage parquet) — DELETE, clean [NEEDS-SIGN-OFF]

- **What:** FRED G.17 industrial production / capacity utilization, national only. Cold parquet
  `lake-tier1/macro/fred_g17/`. `consuming_pack: none`. Pipeline `ingest/pipelines/fred_g17/`.
- **Not a Postgres object:** probe returned no `data_lake.fred_g17` relation → Storage + cron, no `DROP TABLE`.
- **Zero readers (verified):** The ONLY `refinery/` reference is a **comment** in `refinery/packs/macro-us.mts:222`
  (`// ...cadence_registry fred_g17=30` inside a `ttl_seconds` line) — macro-us reads `macroUsSource`
  (SOFR + CPI), not the G.17 parquet. All other hits are hooks/tests/tooling (`classify-cron-failure.test.mjs`,
  `heal-cron-failure.mjs` slug map, `push-touched-unit-coverage.test.mjs`, `lake-mcp-server.test.mts`,
  `notion-sync.mjs`). (data-roots.md:1115-1120, cross-cut #3 at :1147 concur.)
- **Cron:** `.github/workflows/ingest-fred-g17.yml` — `schedule: cron "0 13 17 * *"` is **ACTIVE** (monthly, day 17).
- **Guarded plan (TEXT ONLY):** identical four-step shape as census_vip —
  1. Disable cron (`.github/workflows/ingest-fred-g17.yml`).
  2. Delete Storage prefix `lake-tier1/macro/fred_g17/`.
  3. Park the `fred_g17` registry entry.
  4. Retire `ingest/pipelines/fred_g17/`.
  (Optional tidy: drop the stale `fred_g17` mention in the `macro-us.mts:222` comment — cosmetic.)

# ITEM 6 — `data_lake.active_listings_residential` (TABLE ~40,398 rows) + `active_listings_residential_zip_stats` (VIEW) — DELETE, entangled disable [NEEDS-SIGN-OFF]

- **What:** Region-wide scraped residential listings (crawl4ai) → base table `active_listings_residential`
  (`source_name='active_listings_seed'`) + rollup view `active_listings_residential_zip_stats`.
  Pipeline `ingest/pipelines/active_listings/`. Registry entry `cadence_registry.yaml:1841-1862`.
  **NOTE:** there is **no `data_lake.active_listings` table** — "active_listings" is the *pipeline/workflow*
  name; the actual Postgres table is `active_listings_residential`.
- **Zero readers (verified):** No live `.from("active_listings_residential")` / `.from("active_listings_residential_zip_stats")`
  in `refinery/lib/app/components`. Survivors are comments/tests only: `lib/email/sole-spine.test.ts:8`
  (`const DEAD_VIEW = "active_listings_residential"`), `lib/landing/load-home-map-data.ts:13`
  ("scraper table is ABANDONED here"). The registry entry itself declares `consuming_pack: none` and
  "FEEDS NOTHING LIVE" (lines 1843-1851). Naming-landmine + fgcu string-collision both resolved (see
  DO-NOT-TOUCH list). data-roots.md:262-267, 395-412 concur.
- **Cron / write path (CORRECTION to data-roots.md):** data-roots.md says this "still crons daily." The
  **standalone cron is RETIRED** (07/12/2026 — `active-listings-daily.yml:18-33`, the `on: schedule:`
  block is commented out). BUT the table is **still written daily** via the ordered nightly chain:
  `nightly-chain.yml:118-130` runs a `listings` job (`uses: ./.github/workflows/active-listings-daily.yml`,
  matrix `[Lee, Collier]`). So the disable step is a chain edit, not a cron toggle.
- **Not nightly-gated (good):** the registry entry is deliberately **not** `nightly: true` (comment lines
  1844-1851: gating it "would guard a corpse"). Therefore removing it from the chain will NOT red the
  `row-gate`/`assert_landed` step (it never asserted this table landed).
- **Guarded plan (TEXT ONLY), in order:**
  1. **Stop the write:** in `.github/workflows/nightly-chain.yml`, remove the `listings` job (lines ~118-130)
     **AND** remove `listings` from the `row-gate` job's `needs:` array (line 170:
     `needs: [guard, listings, lifecycle, pulse, live-search]` → drop `listings`). Both edits are required —
     deleting the job without fixing `needs:` makes the chain reference a non-existent job.
  2. **Drop the DB objects (view first, then table):**
     ```sql
     DROP VIEW  IF EXISTS data_lake.active_listings_residential_zip_stats;
     DROP TABLE IF EXISTS data_lake.active_listings_residential;
     NOTIFY pgrst, 'reload schema';
     ```
  3. **Park/remove the registry entry** `active_listings` (`cadence_registry.yaml:1841-1862`) — it carries a
     `freshness_table: data_lake.active_listings_residential` monitor that will flag a missing table otherwise.
  4. **Retire pipeline** `ingest/pipelines/active_listings/` and (optionally) the now-orphan
     `.github/workflows/active-listings-daily.yml` + its `docs/sql/20260625_active_listings_residential*.sql`.
  5. **Close the tracking check** `active_listings_ship_or_delete` with the DELETE decision.
  6. **DO NOT** touch `active-listings-residential-source.mts` / `active-listings-swfl.mts` / the fgcu files
     (DO-NOT-TOUCH list) — they read the live spine / a different table.
- Blast radius: moderate (edits the shared nightly chain), which is why this ranks below the self-contained
  Storage corpses despite being an equally-dead table.

---

# ITEM 7 — `bls_oews_swfl_tier1` (cold NDJSON archive) — FLAGGED: do NOT cron-disable; low-value defer

- **Not a clean corpse-delete.** The tier-1 NDJSON archive (`lake-tier1/labor/bls_oews_swfl/{YYYY}.ndjson`)
  has **zero readers** — no connector reads it; `bls-oews-source.mts` reads the tier-2 Postgres table
  `data_lake.bls_oews_swfl` (220 rows, live, feeds labor-demand-swfl). Verified: the only tree reference is
  `ingest/pipelines/bls_oews_swfl/pipeline.py:8` — the **writer's own docstring** (data-roots.md:1181-1195 concur).
- **Why it is NOT a clean delete:** the writer `.github/workflows/bls-oews-annual.yml` (cron `0 14 15 5 *`)
  writes **BOTH** the tier-1 NDJSON archive AND the live tier-2 Postgres table in the same run. **The cron
  cannot be disabled** — it feeds a live brain.
- **Recommendation:** **DEFER / leave as-is.** It is a cold backup of a live table; deleting it saves
  negligible storage and requires a pipeline code edit (stop writing the NDJSON copy) with a
  Gate-4/guard review — high friction, near-zero payoff. If the operator still wants it gone:
  (a) delete Storage prefix `lake-tier1/labor/bls_oews_swfl/`, (b) edit the pipeline to skip the NDJSON
  write, (c) leave the cron and the tier-2 table untouched. No `DROP` — there is no Postgres object.
  Rank last. **This is not a table that "feeds nothing and still crons" — its cron is load-bearing.**

# ITEM 8 — `usgs` tier-1 parquet (`lake-tier1/environmental/usgs_water_swfl.parquet`) — FLAGGED: do NOT delete

- **Zero readers today (verified):** only the writer references it —
  `ingest/duckdb_pipelines/usgs/{pipeline.py,constants.py}`. env-swfl reads the Postgres `usgs_daily`,
  not this parquet (data-roots.md:1352-1358).
- **But it is NOT a corpse to delete — it is the designated FIX.** The USGS split is broken both ways:
  env-swfl currently reads the **frozen zombie** `data_lake.usgs_daily` (last write 2026-05-19, producing
  module deleted in PR 3), while THIS fresh monthly parquet (cron `usgs-monthly.yml`, `0 13 10 * *`, ACTIVE)
  is the current/intended replacement read-path. Deleting the fresh parquet + its cron would **delete the
  remediation** for the `usgs_tier2_orphan` zombie, not remove dead weight.
- **Recommendation:** **Do NOT delete. Do NOT disable `usgs-monthly.yml`.** The correct move (owned by the
  `usgs_tier2_orphan` stream, not P7): wire `env-swfl`'s `usgs-water-source.mts` to read this fresh parquet,
  verify env-swfl serves current stage data, THEN retire the frozen `usgs_daily`/`usgs_sites` tables and the
  orphan view (Item 3). Migration plan referenced at
  `docs/superpowers/plans/2026-05-19-usgs-postgres-to-parquet-migration.md` (data-roots.md flags the file as
  referenced-but-not-present — unverified).
- This is the one SYSTEMIC-FINDINGS "TRUE CORPSE" entry that I am **flagging AGAINST deletion**:
  data-roots.md's headline list bins it as a corpse ("fresh but unread"), but its own detail section
  (:1358, :1426) frames it as the fresh half of a split whose fix is *wiring*, not deletion.

---

## Corrections surfaced (for data-roots.md / the map owner)

1. **`active_listings` is not "still crons daily."** Standalone cron RETIRED 07/12/2026
   (`active-listings-daily.yml:18-33`, commented). Still written daily via `nightly-chain.yml` `listings`
   job. Disable = chain edit (job + `row-gate` `needs:`), not a cron toggle.
2. **No `data_lake.active_listings` table exists.** The corpse Postgres objects are
   `active_listings_residential` (TABLE, ~40,398 rows) + `active_listings_residential_zip_stats` (VIEW).
   "active_listings" is the pipeline/workflow name only.
3. **`usgs` tier-1 parquet should be removed from the TRUE-CORPSE delete list** — it is the designated
   replacement for the frozen `usgs_daily` zombie; deleting it deletes the fix (see Item 8).
4. **`census_vip` / `fred_g17` / `bls_oews_swfl_tier1` / `usgs_water_swfl` are cold Storage artifacts, not
   Postgres tables** — their retirement is a Storage-prefix + cron/writer action, never a `DROP TABLE`.

## Net for P7

- **Delete now (operator sign-off): 6 objects.** Safest→: three orphan VIEWS (Items 1-3, pure `DROP VIEW`,
  zero dependents, self-documented convenience), then two cold Storage parquets with dedicated crons
  (Items 4-5, disable-cron + delete-prefix + park-registry), then the active_listings table+view
  (Item 6, chain-edit to disable).
- **Flag / do not delete: 2 objects.** `bls_oews_swfl_tier1` (shared live writer — defer, low value),
  `usgs` tier-1 parquet (the zombie-fix — wire it, don't kill it).
- Nothing here waits on `lee_parcels` (parcels are a different stream); each item is gated only on
  operator RULE-1 sign-off + the pre-flight guard re-check.
