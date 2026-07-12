# 08e — Inventory reconciliation (registry ↔ workflows ↔ coverage)

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

Spec §7 3f: the three inventories (`/census` 74 ↔ registry ~78 ↔ scheduled workflows 77) must reconcile to one. The Phase-2 zero-coverage check IS that reconciliation. Both directions of drift are enumerated below.

---

Registry edit by the parallel session adds no entries — my counts (75) hold for both HEAD and working tree. Writing the deliverable.

## Reconciliation A — registry vs workflows

**As-of 2026-07-11.** Read-only. Sources: `.github/workflows/*.yml` (104 files, comment-aware cron parse), `gh api .../actions/workflows` (API `state`), `ingest/cadence_registry.yaml` (1,760 lines working-tree / 1,756 HEAD), `ingest/scripts/check_freshness.py`, live `data_lake` SELECTs. No workflow was triggered.

> **Working-tree caveat:** a parallel session is editing `ingest/cadence_registry.yaml` right now (+5/−1 lines). I verified the edit adds **no `- name:` entries** — count is 75 at both `HEAD` and working tree, so every number below is stable against that write.

---

### 0. Three headline drifts from the evidence on disk

The spec's §7-3f reconciliation target ("census 74 ↔ registry ~78 ↔ workflows 77") is wrong in all three terms. Fixing it *shrinks* the job.

**0a. There are TWO inventories, not three — the census IS the registry, rendered.**
At commit `62715c4b` (earlier today) the registry held **71 pipelines + 3 `not_yet_running` = 74** — exactly the census's reported "74 pipelines (71 active, 3 parked)". Corroborating: `grep -c 'source_ceiling' ingest/cadence_registry.yaml` = **68**, exactly the census's cited "68/74 source-ceiling"; and the commits that built the census (`37a3f329`, `2f26a795`, `8165467f`, `16d28461`, all titled `feat(census): …`) mutate **`ingest/cadence_registry.yaml`**, not an ops-repo data file. The census page reads the registry. So §7-3f's "three inventories must reconcile" collapses to **one join: registry (75) ↔ workflows (79)**, which is what follows.

**0b. The registry never had ~78 entries. It has 75.**
`grep -cE '^\s*- name:'` = **75** (72 `pipelines:` + 3 `not_yet_running:`); `grep -nE '^\s{3,}- name:'` matches **nothing**, so there are no nested list items inflating the count. Git history shows a monotone climb and no 78:

| commit | date | pipelines | not_yet_running | total |
|---|---|---|---|---|
| `16d28461` | 07/08 | 69 | 3 | 72 |
| `b398777c` | 07/11 | 70 | 3 | 73 |
| `62715c4b` | 07/11 | 71 | 3 | **74** ← census's "74" |
| `fd271022` | 07/11 | 72 | 3 | **75** ← today |

Audit-01's "78 pipeline entries" is **not reproducible at any commit**. Cause unknown — I am not inventing one. Spec §3's "~78 entries" backfill estimate should read **75**.

**0c. 77 scheduled workflows became 79 within hours of audit-01 — same day.**
Two commits landed **today**, each adding a live cron: `8030756b` (`airtable-checks-sync.yml`, `23 */2 * * *`) and `fd271022` (`leepa-parcel-zip-annual.yml`, `30 10 15 * *`). 77 + 2 = **79**. This is the argument for Phase 2 in one line: *a hand-counted inventory of this system goes stale in under a day.*

---

### 1. Scheduled workflows with NO registry pipeline entry

Of **79 actively-scheduled** workflows, **59 are ingest producers** and **20 are orchestration/monitoring/email**. 58 of the 59 map to a `pipelines:` entry.

#### 1a. The real gap — one workflow, and it is the root-cause-1 mechanism

| Workflow | Cron | Registry | Why it's a gap |
|---|---|---|---|
| `franchise-outcomes-quarterly.yml` | `0 8 15 1,4,7,10 *` — **next fire Jul 15, 4 days out** | `sba_foia_franchise_outcomes` — in **`not_yet_running:`** (L1614), not `pipelines:` | `check_freshness.py:206` and `:636` both iterate `registry.get("pipelines", [])` **only**. `not_yet_running:` is never probed. |

State: workflow is `active` at the API, runs `python -m ingest.duckdb_pipelines.franchise_outcomes.pipeline`, and is about to fire — while its registry entry sits in the one section the freshness probe skips by construction. **This is the executable mechanism behind 00-DIAGNOSIS root cause 1** ("`franchise-outcomes` served a synthetic 15-brand fixture under a real SBA citation for 36 rebuild cycles before a human noticed"). Not bad luck — a two-line `for` loop that cannot see it. 03 §Parked recorded "never-run is expected until then"; the finding here is that **after** it runs, nothing will check it either.

*Fix:* promote `sba_foia_franchise_outcomes` from `not_yet_running:` → `pipelines:` in the same commit that lets the cron fire; Phase-2 `--static` must assert **no `not_yet_running:` entry has an active scheduled workflow**.

#### 1b. Expected-by-design — 20 non-ingest workflows (registry is not their home)

`airtable-checks-sync` · `build-example-deliverables` · `chief-of-staff-nightly` · `daily-email-digest` · `daily-rebuild` · `data-readiness-cron` · `data-targets-daily` · `deliverables-retention-sweep-daily` · `email-scheduler` · `freshness-probe-daily` · `gate-a-parity` · `graphify-republish` · `home-values-investor-monthly` · `lifecycle-nudges-daily` · `narrative-bake` · `notion-sync-weekly` · `project-feed-change-detection-daily` · `social-pulse-scan` · `tripwire-hourly` · `view-vintages-monthly`

These are not data sources; their absence from the registry is correct. They are exactly what the spec's §7-3a watch manifest exists to cover — the registry can never be the zero-coverage authority for them.

**One exception inside that list — a genuine zero-coverage lake-writer:**

| `view-vintages-monthly.yml` | `0 13 26 * *` | runs `ingest.scripts.capture_view_vintages` → `INSERT INTO data_lake.view_vintages` (`capture_view_vintages.py:92`) |
|---|---|---|

Live: **1,357 rows, 2 views, last `as_of` = 2026-06-26** (`SELECT COUNT(*), COUNT(DISTINCT view_name), MAX(as_of) FROM pg.data_lake.view_vintages`). A scheduled workflow writing a Tier-2 lake table with **zero registry coverage** — same class as `parcel_subdivision` (03 §7). I grepped the other 19 non-ingest workflows' scripts for `INSERT/UPDATE/COPY … data_lake`: **zero hits**. `view-vintages-monthly.yml` is the only one. It should get a `pipelines:` entry or an explicit `coverage_exempt:`.

---

### 2. Registry entries with NO scheduled workflow — 12 of 75

**Group A — producer disabled at the API, entry still live in `pipelines:` (8 entries / 4 workflows).** The freshness probe still expects these fresh → each is a scheduled false-STALE. Four of the workflows are the **re-enable landmine** from 01: disabled *only* at the API, with an uncommented `cron:` still in source — a `gh workflow enable` resumes firing instantly, no code-level guard.

| Entry | L | Workflow | State |
|---|---|---|---|
| `dbpr_sirs_submissions` | 1036 | `dbpr-sirs-monthly.yml` | API-disabled, **cron `0 7 1 * *` STILL LIVE in source** |
| `fgcu_reri_indicators` | 936 | `fgcu-reri-monthly.yml` | API-disabled, **cron `0 14 5 * *` STILL LIVE** |
| `rsw_airport_monthly` | 1013 | `rsw-airport-monthly.yml` | API-disabled, **cron `0 15 8 * *` STILL LIVE** |
| `marketbeat_swfl` | 1204 | `marketbeat-pdf-ingest.yml` | API-disabled, **cron `0 10 15 1,4,7,10 *` STILL LIVE** |
| `colliers_industrial` | 1228 | `marketbeat-pdf-ingest.yml` | (same workflow) |
| `city_pulse_corridors` | 466 | `corridor-pulse-weekly.yml` | API-disabled **+ cron commented** (belt+suspenders) |
| `city_pulse_corridors_tier2` | 1188 | `corridor-pulse-weekly.yml` | (same workflow) |
| `collier_permits` | 791 | `collier-permits-monthly.yml` | API-disabled **+ cron commented** |

**Group B — orphan bug (1 entry). `usgs_tier2` (L595) has no producer at all, and never can.**

This extends 03's finding (which called it "live-consumed and silently stalling", 53/60 days, `env-swfl` reads `data_lake.usgs_daily` verbatim) with the **root cause**: the dlt→Postgres path was *deleted*.
- `ls ingest/pipelines/usgs*` → nothing. The only surviving code is `ingest/duckdb_pipelines/usgs/pipeline.py`.
- That pipeline writes **only** S3 parquet + `_tier1_inventory` (`pipeline.py:6-8`, `:136`, `:170`). Its `usgs_daily` is an **in-memory DuckDB table** (`:36 CREATE TABLE usgs_daily`, `:129 INSERT INTO usgs_daily`), never Postgres. Line 147 says it out loud: *"Avoids the post-ingest psycopg2 UPDATE that the old dlt pipeline needed."*
- Live confirmation: `SELECT schema_name, COUNT(*), MAX(inserted_at) FROM pg.data_lake._dlt_loads WHERE schema_name='usgs'` → **5 loads, last 2026-05-19**, frozen — while `usgs-monthly.yml` (tier-1) ran successfully 2026-07-10.

So `usgs_tier2` (`lane: tier-2`, `dlt_schema_name: usgs`, `count_table: data_lake.usgs_daily`, `expected_rows_min: 544`) is monitored by the probe, consumed by `env-swfl`, and **structurally unproducible**. It is not stalling; it is orphaned. It flips STALE in ~7 days on its own 60-day tolerance. Prescription: `NEVER_LANDED` / delete-or-repoint — decide whether `env-swfl` reads the frozen Postgres table or the fresh S3 parquet. *This is the same retire-the-dlt-path pattern as `faf5` (01: "resolved 06-14 by retiring the dlt→Postgres path entirely") — except `faf5`'s entry was correctly relaneled to tier-1 and `usgs_tier2`'s was not.*

**Group C — legitimately workflow-free (3 entries).**

| Entry | L | Why |
|---|---|---|
| `mhs_databook` | 1251 | ODD source — manual PDF drop, 403 on auto-fetch. Correct to have no workflow. Needs `coverage_exempt:` so the Phase-2 zero-coverage check doesn't false-flag it. (Note: its `freshness_table` is `data_lake.marketbeat_swfl` — it *shares* a table with the `marketbeat_swfl` entry.) |
| `airdna_str_swfl` | 1643 | `not_yet_running:`, no workflow — expected. |
| `land_manufactured_swfl` | 1689 | `not_yet_running:`, no workflow — expected (matches the known "parked with zero pipeline code" gap). |

---

### 3. The count reconciliation

```
WORKFLOWS                                          REGISTRY
104  .yml files                                    75  entries  (= 72 pipelines + 3 not_yet_running)
 83  with a live (uncommented) cron
 -4  API-disabled but cron still in source
 ══                                                ══
 79  ACTIVELY SCHEDULED  (live cron + state=active)
        59  ingest producers ──────────────────►   63  entries covered by an active scheduled workflow
        20  orchestration / monitor / email        ── 12  entries NOT covered:
                                                        8  producer API-disabled (Group A)
  1  ingest wf whose only entry is PARKED               1  usgs_tier2 — orphan, no producer exists (Group B)
       (franchise-outcomes-quarterly)                   3  by design: mhs_databook, airdna, land_manufactured (Group C)
  1  non-ingest wf writing data_lake, no entry
       (view-vintages-monthly)
```

**Reconciles to:** 79 scheduled = 59 ingest + 20 non-ingest. 75 registry = 63 covered + 12 uncovered. The spec's `77` was correct ~6 hours ago; `~78` was never correct; `74` is the registry at `62715c4b`, not a separate inventory.

---

### 4. What the Phase-2 zero-coverage check must assert (this diff, as executable rules)

1. **`not_yet_running:` ∩ active-schedule = ∅.** Catches `franchise-outcomes-quarterly` → `sba_foia_franchise_outcomes`. Highest value: it is the probe's structural blind spot and fires Jul 15.
2. **Every `pipelines:` entry resolves to a workflow that is `state:active` AND has an uncommented cron.** Catches Group A's 8 — modulo an explicit `disabled_reason:`/`coverage_exempt:`, because 4 of them are *deliberately* dark and will otherwise false-flood.
3. **Every `pipelines:` entry's declared producer actually writes its declared target.** `usgs_tier2` declares `dlt_schema_name: usgs` + `count_table: data_lake.usgs_daily`; no workflow in the repo produces either. Static mode can catch this: no `.py` under any workflow's run path contains a dlt Postgres destination for that schema. `--live` catches it too (`_dlt_loads` frozen 2026-05-19).
4. **Cron-in-source must agree with API state.** The 4 API-disabled-with-live-cron workflows are state that exists nowhere in the repo (01 §9). Requires `gh api` — `--live` mode only, fail-open in the hook.
5. **Any workflow whose scripts write `data_lake.*` must have a registry entry or `coverage_exempt:`.** Catches `view-vintages-monthly` (1,357 rows) — the only non-ingest lake-writer of the 20.
6. **The Spine's `workflow:` field is 100% greenfield.** `grep -cE '^\s+workflow:' ingest/cadence_registry.yaml` = **0**. Only 37 `.yml` strings exist anywhere in the file, all inside freeform comments (43 `# Cron` comments total), so **at most half** the 75 entries have a workflow filename recoverable by any parse. The map in §2/§3 above was reconstructed by joining `python -m ingest.{pipelines,duckdb_pipelines,scripts}.X` module names out of each workflow — that join is the mechanical backfill source for the `workflow:` field, but note **9 entries need a non-obvious alias** (module ≠ entry name: `dbpr_sirs`→`dbpr_sirs_submissions`, `marketbeat_pdf`→`marketbeat_swfl`+`colliers_industrial`, `rentals`→`rentals_swfl`, `live_search`→ the 2 `live_search_daily_*`, `market_aggregates`→ the 2 `market_aggregates_*`, `fl_dbpr_licenses`→ +`fl_dbpr_applicants`) and **6 workflows legitimately back 2 entries each** (`bls-oews-annual`, `ingest-local-cre-context`, `ingest-fl-dbpr-licenses`, `live-search-daily`, `marketbeat-pdf-ingest`, `corridor-pulse-weekly`), so `workflow:` cannot be a 1:1 unique key.

---

## Reconciliation B — coverage gaps + `coverage_exempt` candidates

**As-of 2026-07-11 (queries run ~21:50–22:00 UTC, SELECT-only via `mcp__lake__query_lake`; `gh run list`/`gh api` read-only).** Base: `03-lake-live-state.md` §2/§3/§5 and `04-brains-consumers.md` §UNMONITORED UPSTREAMS. Everything below is either a live query, a `file:line`, or a `git log` — no numbers from memory. **Three drifts from the evidence docs are flagged inline** (D1–D3).

---

### B.0 — The headline: two of the three "confirm these" tables have ZERO rows, and that breaks the spec's own check

The task premise (and spec §6) frames the zero-coverage check as *"live schemas with **real rows** and zero registry coverage → RED."* Live counts say only one of the three named tables has rows:

| Table | Live rows (query) | Registry coverage | Caught by spec §6 `--live` as written? |
|---|---|---|---|
| `data_lake.parcel_subdivision` | **220,875** | none (0 hits in 1,756 lines) | ✅ yes |
| `data_lake.community_profiles` | **0** | none | ❌ **no — row count is 0** |
| `data_lake.neighborhood_stats` | **0** | none | ❌ **no — row count is 0** |

**D1 (drift vs. task premise):** `community_profiles` / `neighborhood_stats` are **not** "live schemas with real rows." They are **ZERO_COVERAGE + EMPTY** — the table exists (`information_schema.tables`, both `BASE TABLE`), has never received a row, has no registry entry, and is **not** in the registry's exclusion block (`cadence_registry.yaml:1702-1756`). They therefore fall through **every net in the proposed design**:

1. No registry entry → not freshness-probed (`check_freshness` only walks `pipelines:`).
2. Zero rows → the §6 "real rows + zero coverage" rule does not fire.
3. Not in the exclusion block → the "pack reads a *legacy/excluded* table" rule (the env-swfl case) does not fire.
4. The consumer swallows it: `refinery/sources/communities-swfl-source.mts:197-203` — `readTable()` catches every error/empty and returns `[]` ("Degrade, never throw").

That is the exact mechanism behind `04`'s "communities-swfl is fresh, confident, and empty" and `00`'s root cause 1. **Spec sharpening required:** the pack-source check must fire on **any pack `sources[]` table lacking a registry entry OR an explicit `coverage_exempt:`, independent of row count.** Keying zero-coverage on "has rows" re-creates the blind spot it was built to close.

### B.1 — The causal chain (one narrative, not three rows) — ZERO_COVERAGE

`data_lake.parcel_subdivision` — **220,875 rows**, 71 dlt loads, last load **2026-07-06** (`_dlt_loads`), pipeline code at `ingest/pipelines/parcel_subdivision/{pipeline,resources,constants}.py`.
→ feeds `ingest/duckdb_pipelines/neighborhood_stats/agg.py` (docstring line 4: *"Reads a `parcel_subdivision` table already loaded into the connection"*), which writes `data_lake.neighborhood_stats` — **0 rows**.
→ which `refinery/packs/communities-swfl.mts` reads via `communities-swfl-source.mts:42-43` (`COMMUNITY_TABLE`/`NEIGHBORHOOD_TABLE`) — brain self-reports *"no community data yet"* while passing every freshness gate (`04` §HELD-OR-FAILED #4).

**No scheduled workflow exists for any link in this chain** — `grep -rln "parcel_subdivision|neighborhood_stats|community_profiles|communities" .github/workflows/` returns **nothing**. 220,875 rows landed in prod via 71 out-of-band dlt runs, on no cron, with no registry entry, feeding an aggregation that never ran, feeding a brain the product serves as healthy. Additional content gap: `SELECT count(DISTINCT county) FROM parcel_subdivision` = **1** (only `collier`; Lee absent) — so even the backbone that exists is half-built.

| Case | Live rows | Label | Recommendation |
|---|---|---|---|
| `data_lake.parcel_subdivision` | 220,875 | ZERO_COVERAGE | **New registry entry** + a GHA cron (it has neither). Note single-county coverage. |
| `data_lake.neighborhood_stats` | 0 | ZERO_COVERAGE + EMPTY | **New registry entry** (`not_yet_running:` — the agg has never run in prod). |
| `data_lake.community_profiles` | 0 | ZERO_COVERAGE + EMPTY | **New registry entry** (`not_yet_running:`). Table created by `migrations/20260706_community_profiles.sql`, which contains **0 INSERT statements** — schema-only, no seed, no pipeline. |

### B.2 — Registry entries that never landed / are empty — NEVER_LANDED + EMPTY

`gh run list --workflow=<f>` returned `[]` for all three (workflows confirmed **active** and registered: `gh api repos/:owner/:repo/actions/workflows?per_page=100` → ids 311103063 / 311116553 / 311420003). **Zero GHA runs ever, for all three.**

| Registry entry | DB state (query) | Label | Cause (git) |
|---|---|---|---|
| `redfin_city_swfl` (`registry:687-693`) | `data_lake.redfin_city_swfl` **absent** from `information_schema.tables`; 0 rows in `_dlt_loads` | **NEVER_LANDED** | Workflow committed **today** `62715c4b` 2026-07-11 01:49 EDT; first cron `0 14 18 * *` → **2026-07-18**. Registry floor `expected_rows_min: 1700` is **dry-run-derived** (`:692`) — the "green ≠ data" defect verbatim. |
| `leepa_parcel_zip` (`registry:724-731`) | `data_lake.leepa_parcel_zip` **absent**; 0 rows in `_dlt_loads` | **NEVER_LANDED** | **D2 (drift vs. doc 03):** this entry did not exist when `03` probed. Committed `fd271022` 2026-07-11 **16:34 EDT (20:34 UTC)** — ~11 h *after* doc 03's 08:18–09:10 UTC run, which is why `03` §3 found only 2 dlt gaps and this is a **third**. Floor `480000` is self-labeled `PLACEHOLDER` (`:729`). First cron `30 10 15 * *` → **2026-07-15**. |
| `dbpr_re_licensees` (`registry:1141-1145`) | `public.dbpr_re_licensees` exists, 30-col schema, **0 rows** | **EMPTY** | Workflow committed today `102c6dc8` 2026-07-11 00:30 EDT; first cron `0 12 * * 1` → **Mon 2026-07-13**. |

**Advances `03` §5's open question on `dbpr_re_licensees`** (which it correctly declined to adjudicate): the workflow has **zero runs in its life**, so CI never landed and never wiped it. The registry's *"~50% of the 30,100 kept rows observed live 07/10/2026 (Lee 18,015 / Collier 12,085)"* claim therefore describes an **out-of-band/local run against an unconfirmed environment** — not a prod GHA landing. Still not resolvable to "never landed here" vs "landed locally then truncated," but the CI-wipe branch is now ruled out.

**Spec sharpening (load-bearing for §9 acceptance):** spec §9 says the `--live` check must flag exactly `redfin_city_swfl` (never landed) and `dbpr_re_licensees` (0 rows) against the 07/11 snapshot. It will — **and it will also red-flag three brand-new pipelines whose first cron has not yet fired**, manufacturing precisely the false-red disease of root cause 5 on day one. A `--live` check that cannot distinguish **first-run-pending** from **rotted** is a new tripwire. Recommend a `first_run_after: <date>` sentinel (or the existing `not_yet_running:` block, which already has this exact semantic — `registry:1602`, `sba_foia_franchise_outcomes` "first quarterly cron fires 2026-07-15") so the probe stays silent until each pipeline's first scheduled cron has actually passed, then goes red **loudly** if it passed and nothing landed.

### B.3 — Packs reading legacy/excluded/uncovered tables — legacy-read

| Pack → table | Live rows | Read confirmed at | Registry status | Label / Recommendation |
|---|---|---|---|---|
| `sector-credit-swfl` → **`public.sba_loans_by_naics_county`** | **1,881** (2 counties, max `approval_fy` 2026) | `refinery/sources/sector-credit-swfl-source.mts:163` (`.from(SOURCE_ID)`, `SOURCE_ID` = `sba_loans_by_naics_county` at `:39`); **throws** on 0 rows (`:174-177`) | **none** — 0 hits in the registry; **no ingest writer anywhere** (`grep -rn sba_loans_by_naics_county ingest/` → empty) | **ZERO_COVERAGE + legacy-read — rank this highest.** One-time Premise-Engine copy seeded by migration (`docs/sql/20260517_brains_data_tables.sql:65-69`: *"On Premise this is a materialized view; here it's a plain table loaded by the migration script"*). A **shipping brain live-queries a table that nothing can ever refresh**, on a rolling `approval_fy >= currentYear-6` window over frozen data — it will silently decay year by year. → **new registry entry (or an honest `coverage_exempt: static_seed` + a pack caveat)**; the code's own remedy (`"run REFRESH MATERIALIZED VIEW"`, `:176`) is wrong — it is not an MV here. |
| `env-swfl` → **`data_lake.usgs_sites`** | **900** | `refinery/sources/usgs-water-source.mts:33` (`SITES_TABLE`), `:206` (`.from(SITES_TABLE)`), cited live at `:316` | **explicitly excluded**, `registry:1712-1717` (*"LEGACY DLT TABLE, SCHEDULED FOR DROP… Do not add a floor — the table will be gone before it matters"*) | **legacy-read — confirmed, `04` §2 stands.** The table has not gone; the Postgres dependency was never cut despite the migration being filed under `_FINISHED/`. → either finish the Parquet migration in `usgs-water-source.mts` **or** flip the exclusion to a real entry. An exclusion note is not a licence for a live pack to read the table. |
| `communities-swfl` → `community_profiles`, `neighborhood_stats` | 0 / 0 | `communities-swfl-source.mts:42-43`, `:198` | none (see B.0/B.1) | ZERO_COVERAGE + EMPTY + silent-degrade. |
| `permits-commercial-swfl` → `data_lake.mhs_jurisdiction_xwalk` | **12** | `04` §UNMONITORED (static crosswalk) | mentioned only in a **freeform note** (`registry:1318`), no probe field | **`coverage_exempt: static_crosswalk`** — mention-in-a-comment is not coverage; make it explicit so the §6 check doesn't false-flood. |
| ~~`storm-history-swfl` → `data_lake._tier1_inventory`~~ | 518 | — | — | **CLEARED — not a real read.** `_tier1_inventory` appears only in citation strings and an error message (`refinery/sources/storm-history-source.mts:492,510`; `packs/storm-history-swfl.mts:24,180`); there is **no `.from()` / query** anywhere in the source. Same class as `04`'s `faf_flows` correction. |

### B.4 — `coverage_exempt:` candidates (live tables, zero coverage, no entry warranted)

| Table | Live rows | Proposed `coverage_exempt:` reason |
|---|---|---|
| `public.metric_observations` | **7,603** | `brain_writeback` — written by `refinery/stages/4-output.mts` / `refinery/lib/metric-observations-log.mts`. Identical class to the registry's own `fdot_freight_nowcast_shock_log` exclusion (`registry:1719-1723`). |
| `data_lake.geo_anchor_cache` | **4** | `runtime_cache` — `ingest/lib/geo_ladder.py`, `migrations/20260710_pulse_geo.sql`. |
| `data_lake._tier1_inventory` | **518** | `dlt_internal` / probe metadata. |
| `data_lake.source_totals` | **0** | `dead` — zero rows, **zero code references repo-wide**. Drop candidate. |
| `data_lake.user_mls_listings` / `user_mls_stats` | **0** / **0** | `client_upload_surface` — not an ingest pipeline (already noted in `03` §4d). |
| `public.corridor_profiles` | **27** | Documented by comment only (`registry:476`, *"Live corridor_profiles table has 27 verified corridors as of 07/08/2026"*) → make it an explicit `coverage_exempt: reference_table`, **after** a one-line verify that no pack live-reads it. |

**Recommend DROP, not exempt — `public.sba_loans_franchise_outcomes` (275 rows).**
**D3 (drift):** `docs/sql/20260614_drop_sba_franchise_outcomes.sql` was authored on 06-14 to `DROP TABLE IF EXISTS sba_loans_franchise_outcomes` — **the table is still live with 275 rows**, so the migration was never applied to prod. Its own header states the case: *"There is NO ingest pipeline and NO cadence entry — it has never refreshed and never will. The live table (275 brands…) also contradicted the franchise-outcomes brain's curated reference fixture (15 brands), so anything querying it live disagreed with the brain's published numbers."* The sequencing precondition it names is **already met** — `refinery/sources/franchise-source.mts` is Parquet/fixture-only (`:28` `COUNTY_PARQUET_URL`, `:135` `parquetViews`; `SOURCE_ID` at `:30` is an identifier string, **not** a table read). → **apply the pending drop.** Distinct from the 15-brand synthetic fixture in `00`; this is the 275-row zombie that contradicts it.

---

### Reconciliation summary (both directions)

- **DB → registry (zero coverage):** 4 real gaps needing entries (`parcel_subdivision` 220,875 · `neighborhood_stats` 0 · `community_profiles` 0 · `sba_loans_by_naics_county` 1,881 — the last one live-consumed by a shipping brain) · 1 new-entry-not-exempt (`view_vintages`, 1,357 rows, **has** a monthly cron `view-vintages-monthly.yml` `0 13 26 * *`, last capture 2026-06-26, consumed by `refinery/lib/backtest/view-vintage-reader.mts` — a monitored-worthy pipeline with no registry row) · 6 `coverage_exempt:` · 1 DROP.
- **Registry → DB (never landed / empty):** 3 (`redfin_city_swfl`, `leepa_parcel_zip`, `dbpr_re_licensees`) — all three are **first-run-pending**, all three workflows committed **2026-07-11**, all three carry unverified/placeholder volume floors, **zero GHA runs between them**.
- **Legacy-reads:** 2 confirmed (`env-swfl`→`usgs_sites` excluded-but-live; `sector-credit-swfl`→`sba_loans_by_naics_county` unrefreshable seed), 1 cleared (`storm-history`→`_tier1_inventory`, citation-only).
- **Two spec changes fall out of this:** (1) the §6 zero-coverage rule must not be keyed on "has rows" — the `communities-swfl` blind spot is a **0-row** table; (2) the §6 `--live` check needs a first-run-pending sentinel or it red-flags three same-day pipelines and re-creates root cause 5 on its first run.
