# USGS Postgres → Parquet Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the USGS migration from the dlt+Postgres lane to the DuckDB+Parquet Cold Lane. The DuckDB pipeline has already shipped and the Parquet artifact lives at `s3://lake-tier1/environmental/usgs_water_swfl.parquet` (4,745,183 rows, 2000-01-01 → 2026-05-18, 596 sites, 4 parameter codes). The consuming brain `env-swfl` still reads `data_lake.usgs_daily` / `data_lake.usgs_sites` in Postgres — the migration is not done until env-swfl reads the Parquet and the dlt/Postgres lane is deleted.

**Rationale:** Two reasons we close this out now:

1. **Data tier policy compliance** (locked 2026-05-17): Tier 2 (Postgres) is permitted only when a consuming brain ships in the same sprint. Today USGS data exists redundantly in both Tier 1 (Parquet, source of truth) and Tier 2 (Postgres, legacy from the dlt era). Policy says one source.
2. **Deprecation header gate**: `ingest/pipelines/usgs/pipeline.py` lines 2–7 state the dlt lane "will be removed in next sprint once DuckDB→Parquet is validated in production AND the data*lake.usgs*\* tables are tombstoned by a consuming brain." The first condition is met (Parquet verified). This plan closes the second.

**Architecture:** Mirror `storm-history-swfl` and `hurricane-tracks-fl`. Both use `makeDuckDBSource` to read Tier 1 Parquet over the DuckDB `httpfs` extension with the same `SUPABASE_S3_*` credentials the ingest pipeline already uses. The SWFL filter (county_cd IN ('12071','12021') OR Caloosahatchee/Big-Cypress HUC prefixes) moves from post-fetch JS into the DuckDB SQL query.

**Drift expectation:** env-swfl values WILL change after the rebuild. The Postgres tables had a partial backfill; the Parquet has 26 years of full history across 596 sites. Median groundwater, rainfall annual sums, and high-water exceedance counts will all shift toward more accurate baselines. Gate on **render-cleanly + citations-resolve**, not on numeric stability.

**Risks:**

- Source rewrite is the largest change. If the DuckDB query shape doesn't match `makeDuckDBSource`'s contract, the rewrite needs to invoke DuckDB directly — adds complexity. Mitigation: Step 0 reads the contract before any code.
- env-swfl is a master input + has the `edge_type: veto` flood-veto edge. A silent regression in env-swfl propagates to master. Mitigation: Step 5.5 re-renders master and diffs against current `brains/master.md` before any destructive Postgres operation.
- Fixture tests in `refinery/packs/env-swfl.test.mts` use a JSON sample. Conversion to a Parquet fixture is non-trivial. Mitigation: Step 1.5 mirrors storm-history-swfl's fixture Parquet pattern exactly.

---

## File Structure

| File                                              | Action  | Responsibility                                                                                                           |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `refinery/sources/usgs-water-source.mts`          | Rewrite | Switch from Postgres `data_lake.usgs_*` reads to Parquet reads via `makeDuckDBSource`.                                   |
| `refinery/__fixtures__/usgs-water.sample.parquet` | Create  | Small fixture Parquet for env-swfl tests, mirroring `refinery/__fixtures__/storm-events-swfl.parquet`.                   |
| `refinery/__fixtures__/usgs-water.sample.json`    | Delete  | Old JSON fixture; superseded.                                                                                            |
| `refinery/packs/env-swfl.mts`                     | Modify  | Update USGS citation strings — Parquet URL, not `data_lake.usgs_daily`.                                                  |
| `refinery/packs/env-swfl.test.mts`                | Modify  | Point fixture loader at the new Parquet path; adjust assertions only if shape changes.                                   |
| `ingest/pipelines/usgs/pipeline.py`               | Delete  | Old dlt entry point. DEPRECATED in commit `03ffdaf`; this PR removes it.                                                 |
| `ingest/pipelines/usgs/resources.py`              | Delete  | dlt resource definitions; no other importers.                                                                            |
| `ingest/pipelines/usgs/urls.py`                   | Delete  | URL builders for the old lane; the DuckDB pipeline has its own.                                                          |
| `ingest/pipelines/usgs/constants.py`              | Delete  | Old constants; duckdb_pipelines has its own.                                                                             |
| `ingest/.dlt/config.toml`                         | Modify  | Remove the commented-out `[pipeline.usgs]` lines (20–22).                                                                |
| `scripts/lake-probe.mts`                          | Modify  | Drop the `usgs_daily` and `usgs_sites` entries (lines 17–18).                                                            |
| `refinery/vocab/brain-vocabulary.json`            | Modify  | Update `scope_note` at line 1026 — replace `data_lake.usgs_daily` with the Parquet path.                                 |
| `docs/semantic-ledger.md`                         | Regen   | Auto-generated; bumped by `npm run ledger` after the vocab update.                                                       |
| `docs/API_BLUEPRINTS_USGS.md`                     | Rewrite | Replace §7 "Tier 2 Schema" with a "Tier 1 Parquet" section. Keep the 2027 OGC API sunset note. Update §package-location. |
| `docs/sql/usgs_water_grant.sql`                   | Delete  | Granted on tables that will be dropped; obsolete.                                                                        |
| `brains/env-swfl.md`                              | Regen   | Step 3 rebuild output. Citations should now point at Parquet URL.                                                        |
| `brains/master.md`                                | Regen   | Step 5.5 re-render. Should preserve env-swfl edge + `edge_type: veto`.                                                   |

---

## Tasks

### Step 0 — Read the contract (no code changes)

- [ ] Read `refinery/sources/duckdb-source.mts` (or wherever `makeDuckDBSource` is defined) to confirm the function signature, env-var requirements, and how SQL queries flow through it.
- [ ] Read `refinery/sources/storm-history-swfl-source.mts` to see the Parquet-via-DuckDB pattern in production.
- [ ] Read the hurricane-tracks source to confirm cross-tier joins look the same.
- [ ] Read `refinery/__fixtures__/storm-events-swfl.parquet` directory / fixture conventions — how does the test inject a fixture Parquet path?
- [ ] Read `refinery/sources/usgs-water-source.mts` end-to-end so the rewrite preserves all current behaviors (SWFL filtering, per-parameter handling, fixture vs live mode).
- [ ] Read `refinery/packs/env-swfl.test.mts` to know what fixture-shape the tests demand.

**Verification:** No code changes. Confirms the API surface before Step 1. Brief notes captured in scratch as needed.

### Step 1 — Rewrite the source connector

- [ ] Rewrite `refinery/sources/usgs-water-source.mts`:
  - Replace the Postgres queries against `data_lake.usgs_daily` / `data_lake.usgs_sites` with `makeDuckDBSource` reads against `s3://lake-tier1/environmental/usgs_water_swfl.parquet` and the sites Parquet.
  - Push the SWFL filter (`county_cd IN ('12071','12021') OR huc_cd LIKE '03090205%' OR huc_cd LIKE '...'`) into the DuckDB SQL `WHERE` clause via a Daily × Sites join. No more post-fetch JS filtering.
  - Preserve the public function signature and return shape — the env-swfl pack should not need to change its data-access calls.
  - Preserve fixture-mode entry point but point it at the new Parquet fixture.

**Verification:** TypeScript compiles (`npx tsc --noEmit` or `bun check`). No execution yet.

### Step 1.5 — Generate the fixture Parquet

- [ ] Write a one-off Python script (or inline Bash heredoc) that reads ~1000 rows from the live S3 Parquet, filtered to 2 SWFL sites across all 4 parameter codes, and writes `refinery/__fixtures__/usgs-water.sample.parquet`.
- [ ] Mirror the schema exactly — same column names and types as the live Parquet.
- [ ] Generate a matching small sites fixture if the test needs both daily and sites data.
- [ ] Update `refinery/packs/env-swfl.test.mts` fixture path constant to `usgs-water.sample.parquet`.
- [ ] Delete `refinery/__fixtures__/usgs-water.sample.json`.

**Verification:** `bun test refinery/packs/env-swfl.test.mts` passes against the new fixture. If assertions change shape, prefer adjusting the test to match new fixture data over twisting the source.

### Step 2 — Update pack citations

- [ ] In `refinery/packs/env-swfl.mts:327` and any sibling lines, replace the citation string template:
  - Old: `USGS Water Services daily values via data_lake.usgs_daily, parameterCd ${parameterCd}, ${windowDesc}, sites: ${sites}.`
  - New: `USGS Water Services daily values via Tier 1 Parquet (s3://lake-tier1/environmental/usgs_water_swfl.parquet), parameterCd ${parameterCd}, ${windowDesc}, sites: ${sites}.`
- [ ] Verify no other pack references `data_lake.usgs_*` (grep the whole `refinery/packs/` tree).

**Verification:** Grep returns zero hits for `data_lake.usgs` outside of files queued for deletion.

### Step 3 — Rebuild env-swfl

- [ ] Run `npm run refinery env-swfl`.
- [ ] Gate criteria (all four must pass):
  1. Render exits cleanly — no spec-validator failures, no facts-only-lint failures, no inference-bait-lint failures.
  2. All four USGS-sourced citations resolve and appear in `brains/env-swfl.md`.
  3. Citations point at the Parquet URL, not `data_lake.usgs_daily`.
  4. `freshness_token` in the frontmatter bumps cleanly to the new version.
- [ ] Values are expected to drift. Do not gate on numeric stability. Note material drifts in the commit message so the master re-render is properly scoped.

**Verification:** The four gates above. If any fails, STOP and investigate before continuing.

### Step 4 — Delete dlt code + scrub references

- [ ] Delete `ingest/pipelines/usgs/{pipeline.py,resources.py,urls.py,constants.py}` (the directory should be removable wholesale).
- [ ] Remove the `[pipeline.usgs]` commented section from `ingest/.dlt/config.toml` (lines 20–22).
- [ ] Remove the `usgs_daily` and `usgs_sites` entries from `scripts/lake-probe.mts` (lines 17–18).
- [ ] Update the `scope_note` at `refinery/vocab/brain-vocabulary.json:1026` — replace `data_lake.usgs_daily` with the Parquet path.
- [ ] Run `npm run ledger` to regenerate `docs/semantic-ledger.md`.
- [ ] Final grep sweep: `grep -ri 'data_lake.usgs' .` should return zero hits (modulo `docs/sql/usgs_water_grant.sql` which is deleted in Step 5).

**Verification:** Final grep is clean except for the doc deletions in Step 5.

### Step 5 — Documentation rewrite

- [ ] Rewrite `docs/API_BLUEPRINTS_USGS.md`:
  - Replace §7 "Tier 2 Schema (`data_lake.usgs_daily` + `data_lake.usgs_sites`)" with §7 "Tier 1 Parquet Storage" — describe the S3 path, the schema (columns from the pipeline DDL), how downstream consumers read it via `makeDuckDBSource`.
  - Update §package-location from `ingest/pipelines/usgs/` to `ingest/duckdb_pipelines/usgs/`.
  - Update any URL spec references to point at the new module.
  - Preserve the 2027 OGC API sunset warning.
- [ ] Delete `docs/sql/usgs_water_grant.sql` (the tables it grants on will be dropped in Step 6).

**Verification:** Doc reads coherently top-to-bottom. No lingering "data_lake.usgs" references.

### Step 5.5 — Re-render master, gate on edge preservation

- [ ] Run `npm run refinery master`.
- [ ] Diff against the current `brains/master.md`. Gate criteria:
  1. `env-swfl` still appears as a driver in the `--- OUTPUT ---` block.
  2. The `env-swfl` edge has `edge_type: veto` preserved.
  3. master's `freshness_token` bumps cleanly.
  4. No spec-validator / lint failures.
- [ ] If any of (1)–(4) fail, STOP. Do not proceed to Step 6. The Postgres tables are still load-bearing for recovery.

**Verification:** master renders, env-swfl veto preserved, no validator failures.

### Step 6 — Print DROP SQL for the human

- [ ] Print the DROP TABLE statements (no execution by Claude — human runs them manually against Supabase):

```sql
-- Run only after Steps 0–5.5 are verified green.
-- Parquet at s3://lake-tier1/environmental/usgs_water_swfl.parquet is the
-- canonical record; the Postgres copies are now redundant.

DROP TABLE IF EXISTS data_lake.usgs_daily;
DROP TABLE IF EXISTS data_lake.usgs_sites;
```

**Verification:** None by Claude. After the human runs the DROP, the env-swfl + master renders should continue to succeed (they no longer depend on these tables after Step 3 + 5.5).

---

## Out of scope

- **Incremental nightly ingest.** The DuckDB pipeline today is full-backfill only. A nightly incremental mode is mentioned in the pipeline docstring as out of scope; not addressed here.
- **OGC API sunset cutover (2027).** The API_BLUEPRINTS doc preserves the warning, but no code changes against the new endpoint are part of this plan.
- **Adding new USGS consumers.** This plan migrates exactly one consumer (env-swfl). Any future brain that wants USGS data will read the Parquet directly via the new source pattern.

---

## Rollback

If Step 3 fails: revert `refinery/sources/usgs-water-source.mts` and `refinery/packs/env-swfl.mts`. Postgres tables still present; old behavior restored.

If Step 5.5 fails: revert env-swfl source/pack changes. Postgres tables still present; do not run Step 6 SQL.

If Step 6 SQL is run and a regression surfaces later: re-run the dlt pipeline OR write a one-off Parquet → Postgres `COPY` to restore the tables. The Parquet is the durable backup.
