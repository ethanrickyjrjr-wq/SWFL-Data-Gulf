# Data Contracts + Doctor — Design (Path A, shaped for C)

**Date:** 2026-07-11 · **Check:** `data_contracts_doctor_live_verify`
**Evidence base:** `docs/audit/2026-07-11-pipeline-problems/00-DIAGNOSIS.md` (+ evidence files 01–04, same folder). Every component below names the incident class it kills.
**Industry pattern verified in-session (RULE 0.4):** Dagster asset checks / freshness policies / per-asset health (docs.dagster.io/guides/test/asset-checks, v1.13); Great Expectations declarative expectations + checkpoints (docs.greatexpectations.io, v1.18).

---

## Problem

Every health signal we have measures whether a *process* ran, not whether *data* exists and is right. Confirmed on 07/11/2026: a registry entry "confirmed via live dry-run" for a table that does not exist; a "30,100 rows observed" note over an empty table; green vendor runs coded to swallow a suspended subscription as "data gap"; a public ZIP median of $35,000 where the real single-family median is $354,999 because the live listings view never filters land or mislabeled rentals; ~70% of scheduled workflows invisible to both failure watchers; timeout-killed runs (`conclusion: cancelled`) invisible to all watchers; CI red through 35 consecutive pushes. Root causes 1–5 with citations: the diagnosis doc.

## Goal

Checks travel with the data. Each table declares its contract; the contract is enforced *inside the pipeline run that writes the table*; the hand-synced wiring strings are machine-verified in CI; one `doctor` command joins declared truth against live reality and prescribes exact fixes. Every artifact is declarative and table-keyed so the later orchestrator migration (Path C) is mechanical translation, not redesign.

**Non-goals (v1):** no Dagster adoption now; no new standalone watcher crons; no blanket gating of every table on day one; no ops-page UI (ops repo, parked); no refinery-side brain-content checks (parked, check opened); no caveat-expiry fix (parked, check opened). SteadyAPI billing is an operator action, not code.

## Design principles

1. **Asset-keyed everything.** `quality_registry.yaml` is already keyed by physical table — it stays the one contract file. `cadence_registry.yaml` stays pipeline-keyed for scheduling truth. Doctor joins the two.
2. **Extend, don't erect (C2 rule).** Every piece extends an existing seam: `quality_registry.yaml` + `check_data_quality.py` (SOLO-25), `ingest.lib.guards` (Gate 4), `check_freshness.py`, incident auto-capture, the Recurring Patterns catalog. Zero new frameworks.
3. **In-process enforcement.** Error-severity failures on gated tables make the *writing run* exit 1 loud — caught by existing auto-capture. The daily at-rest sweep keeps its "observability, exit 0" contract unchanged as backstop.
4. **Prescriptions, not stack traces.** Every failure class maps to exact fix text (the last30days doctor pattern), seeded from `docs/cron-rebuild-failures.md` → Recurring Patterns.
5. **Warn-first rollout**, except the proven-broken listings family which gates day one.

## What we're building

### C0 — Stop the bleeding (ships first, same build)

- **CI → green.** Fix the 7 failing tests on main (started as 1 `MaterialRow` test, grew under red). Accept: `ci.yml` green on main. *(Kills: RC5 ambient red.)*
- **Listings contamination hotfix + its contract.** Patch the `listing_active_stats` path (migration: property-type filter + rental-price guard; raw tables untouched, consumers repointed same PR), re-verify ZIP 33972/33974 medians against the homes-only decomposition ($354,999 / $319,999 single-family medians per audit `03`). Ship the contract that would have caught it in the same PR and prove it: contract red against pre-fix data, green post-fix. *(Kills: RC2's live ~10x public error.)*
- **Watcher blind spots.** `log-cron-incident.yml` + `heal-cron-failure.yml`: trigger on `conclusion ∈ {failure, cancelled, timed_out}` (today `== 'failure'` only — `log-cron-incident.yml:63`; 30 cancelled runs invisible, incl. corridor-pulse's 3-week death and leepa-annual 4/4-cancelled). Derive watch-lists from `.github/workflows/*.yml` cron presence instead of the two hardcoded lists (~53–55/77 scheduled workflows unwatched today). *(Kills: RC3 blind spots.)*
- **Tripwire false RED.** Replace `checkPulseDark()`'s hardcoded pipeline list (`scripts/tripwire-scan.mjs:101`) with a config read (cadence registry pulse entries / explicit `tripwire: true` flag). *(Kills: the 6-day false RED, issue #106.)*

### C1 — Contract engine (extend `quality_registry.yaml`)

New test types alongside `not_null | unique | accepted_values`:

- `range`: `{ col, test: range, min?, max?, severity }` — failing rows outside bounds.
- `row_floor`: `{ test: row_floor, min, severity }` — table-level minimum row count for in-process assertion right after a write (cadence's `expected_rows_min` stays authoritative for the daily probe).
- `sql_assert`: `{ name, test: sql_assert, sql, severity }` — named failing-row `SELECT count(*)` for semantic rules ("sales rows are never rental-priced non-land"). Read-only, single-statement, validated `SELECT` prefix, parameter-free, PR-reviewed like code.
- `freshness_col` *(optional)*: `{ col, max_age_days, severity }` — age of `MAX(col)`; catches the `usgs_tier2` silent-stall class at table grain.

New per-table field: `gating: true|false` (default false). Gating applies **only** to the in-process runner; the at-rest sweep never gates.

Builders move to `ingest/quality/builders.py` (pure, psycopg3 Identifier/bound-param composition, unit-testable); `check_data_quality.py` re-imports for back-compat.

### C2 — In-process runner (`ingest/lib/contracts.py`)

`enforce_contracts(tables, *, source_tag) -> ContractReport`, called at the end of each wired pipeline's `run()` after load — the same seam as Gate-4 guards.

- Any **error**-severity failure on a `gating: true` table → raise `ContractViolation` → run exits 1 loud → existing auto-capture opens the incident. **warn**/non-gating → stderr + report, never blocks.
- Cost guard: per-table suite < 30s, measured in tests; `sql_assert`s on big tables must carry an indexed/windowed WHERE.
- Phase-1 wiring (each cites its incident class): `rentals` + `market_aggregates` (vendor gap-sentinel), `listing_lifecycle` (property-type), `active_listings` scrape (land/rental mix), `live_search` (daily_truth NULL-19-days), `lee_permits` (silent no-op), `news_swfl` (date↔text, gains gating). Other pipelines opt in by registry entry only — no further code.

### C3 — Wiring consistency suite (static, CI)

`tests/wiring/wiring-consistency.test.mts` (bun:test — TS because it parses `.mts` packs). No DB access; < 10s; deterministic.

1. Every cadence/quality table reference → pipeline dir exists, its workflow exists and has `timeout-minutes`.
2. Every `data_lake.*` / `lake-tier1/` reference in `refinery/packs/**` + `refinery/sources/**` resolves to a registry entry → **unmonitored-upstream detector** (kills the `parcel_subdivision` / `communities-swfl` / legacy-`usgs_sites` class).
3. Every `os.environ[...]` read in a pipeline appears in its workflow's `env:` block → kills secret-wired-not-passed (3 incidents).
4. Workflow action versions ∈ allowlist → kills the `checkout@v6` class (3 incidents).
5. `First run: <fill` registry placeholders fail after 14 days (6/7 stale today).
6. Every pack in `refinery/packs/index.mts` is reachable in the rebuild DAG → kills the `tier-divergence-swfl` orphan class (built, never rendered, 404s live).

### C4 — Doctor (`python -m ingest.doctor`)

On-demand; no new cron in v1. Runs: (1) freshness probe (imported), (2) quality sweep (extended), (3) **live wiring joins** — every `dlt_schema_name` present in `_dlt_loads`, every `count_table` exists with count ≥ floor, DB schemas with no registry entry and registry entries with no DB presence → catches the `redfin_city_swfl` TABLE-MISSING and `dbpr_re_licensees` empty-table classes same-day, (4) shells `bun test tests/wiring/`, (5) **rollup**: one line per dataset — freshness | volume | contracts | wiring | VERDICT — plus one line per watcher (probe/tripwire/auto-capture last-ran; watch the watchers), (6) **prescriptions** from `ingest/doctor/prescriptions.yaml` seeded from Recurring Patterns (ACTION_VERSION → "bump to checkout@v4 in <file>"; SECRET_NOT_WIRED → "add <name> to env: of <workflow>"; TIMEOUT_KILL → "raise timeout-minutes in <file>; check spend-before-death"; GAP_SENTINEL → "verify vendor account — dead key produces green runs"; unknown class → print evidence, say so, never invent). Flags: `--json` (future ops panel), `--dry-run` (read-only, existing convention), `--strict` (exit 1 on any red; future cron use only).

### C→C bridge (why this survives the migration)

| This build | Dagster equivalent | Migration action |
|---|---|---|
| `quality_registry.yaml` entry | `@asset_check` | generate defs from YAML |
| cadence `cadence_days`/tolerance/SLA | `FreshnessPolicy` | generate from YAML |
| `enforce_contracts()` post-load | checks on materialization | drop the call; orchestrator owns it |
| doctor rollup | asset health status | replaced by UI |
| `prescriptions.yaml` | alert policies | port text |
| wiring suite | obsolete (single config truth) | delete happily |

Everything declarative, table-keyed, engine-agnostic: C = write the generator, not rewrite contracts.

## Failure semantics summary

In-process error+gating → exit 1 loud → auto-capture. In-process warn/non-gating → stderr + report. At-rest sweep → unchanged (exit 0, summary, `public.checks` rows). CI wiring suite → red PR, no DB, no flake surface. Doctor → informational unless `--strict`. Rollout: warn-first 7 days per table, flip to gating by PR; listings family gates day one.

## Testing

- Unit: every new builder (range/row_floor/sql_assert/freshness_col); prescriptions mapping covers every failure-class enum.
- Deliberate-failure proofs: `leepa.last_sale_amount` stays the not_null proof; pre-fix listings data is the `sql_assert` proof (red before fix, green after).
- Integration (read-only dev-run): doctor `--dry-run` completes < 2 min and correctly flags today's two real broken tables (`redfin_city_swfl` missing, `dbpr_re_licensees` empty) — real-world fixtures until fixed.
- Wiring self-test: seeded violation fixtures (bad action version, unmonitored table ref, missing env var, DAG orphan) must each redden the suite.
- Existing gates unaffected: `bunx next build`, `pytest ingest/`, Gate-5 pack tests.

## Sequencing & acceptance

1. **C0** — accept: ZIP 33972 median reflects homes-only; tripwire green; a test `cancelled` run opens an incident; CI green on main.
2. **C1+C2** — accept: seeded bad row in a fixture table fails the writing run when gating; 7 pipelines wired warn-first.
3. **C3** — accept: suite red on each seeded violation; green on main after fixing/allowlisting (with check refs) what it finds — it WILL find today's orphans.
4. **C4** — accept: doctor on live 07/11 state flags the two real broken tables with correct prescriptions.
5. Close `data_contracts_doctor_live_verify` on live evidence only.

## Risks

- **Alert fatigue reborn** → warn-first, gating-by-PR, doctor consolidates to one rollup; success metric is fewer red surfaces, not more.
- **`sql_assert` misuse** → validated read-only SELECT, PR review; runner can't execute DDL/DML.
- **Query cost** → 30s/table budget measured in tests; windowed WHERE on big tables.
- **View-patch blast radius (listings)** → additive migration, raw tables untouched, before/after numbers verified in PR.
- **Two-registries confusion** → deliberate (scheduling vs contracts); doctor is the join; documented in both file headers.

## Out of scope → checks opened this session

- `empty_brain_content_detector` — refinery-side "brain passes freshness while content says no data."
- `caveat_expiry_rebuild` — stale caveats served indefinitely (06/29 failure still shown 07/11).
- `tier_divergence_dag_orphan` — ship or delete the built-but-never-wired brain.
- Ops-page doctor panel (`--json` consumer) — ops repo queue.
- Path C orchestrator migration — revisit after this stabilizes; bridge table is the entry.
