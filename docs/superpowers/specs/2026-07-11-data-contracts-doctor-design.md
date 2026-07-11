# Pipeline Health — Build Spec: Data Contracts + Doctor (Path A now · Path C gated) — CONSOLIDATED

**Date:** 07/11/2026 · **Check:** `data_contracts_doctor_live_verify`

**This is the single self-contained build spec.** It absorbs and **supersedes** `docs/audit/2026-07-11-pipeline-problems/05-BUILD-SCOPE.md` (architecture + phases) and `07-plan-C-orchestrator-migration.md` (the gated orchestrator path + hosting costs), which are now tombstoned pointers back here. Evidence trail stays in `00-DIAGNOSIS.md` + `01`–`04`; live-doc vendor research stays in `06-orchestrator-vendor-research.md`. Read those for *why*; this file is *what to build and how it closes*.

> **Handoff:** the assembly + Path-A architecture + acceptance/testing/check-linkage below are complete and buildable now. The section **"§13 — Open for Fable 5 tonight"** lists the harder parts left to finish.

---

## 1. The one-line shape

Every scoping pass independently arrived at the same center of gravity: **make `ingest/cadence_registry.yaml` the single source of config truth**, then hang three things off it — content assertions that run at load, a CI cross-check that kills the wrong-letter class at PR time, and one `doctor` health model that absorbs the watcher fleet. The nightly ordered chain (ingest → row-gate → rebuild → bake → warm → email) rides the same registry. No new framework, no new host. Operator decision (recorded in `05`): **A now, on GitHub Actions; Dagster rejected as the near-term path; Path C gated (see §12).**

## 2. Why not an orchestrator now (the honest ledger)

The capability the diagnosis pointed at — an assertion bound to a data asset, run at load, rolled into one health status — is a Dagster-specific primitive; neither Prefect nor Airflow ships it in self-hosted/OSS form (`06`, live-doc verified 07/11/2026). But **Path A hand-rolls that exact primitive on infra already running, for $0**: `contracts.py::evaluate_batch()` at the merge locus = a hand-rolled `@asset_check(blocking=True)`; `doctor` = the free `FreshnessPolicy` equivalent **plus** the rolled-up health status Dagster charges Dagster+ for. So an orchestrator migration buys nothing on the live-bleeding class (root causes 1–2) — only a framework-native home for assertions A already owns, at the cost of a persistent always-on service. That is why C is gated, not built (§12).

## 3. The Spine — registry as single source of config truth (do this FIRST)

Four new/structured fields on each `cadence_registry.yaml` entry. Everything else consumes them.

- `workflow: <file>.yml` — today the workflow filename lives only in freeform `# Cron:` comments (registry lines 140, 810, 831…). Structured field enables the pipeline→workflow map every other deliverable needs. Mechanical backfill, ~78 entries.
- `consuming_pack: <pack>|[packs]|none` — the pack this source feeds. `none` is a stated fact; silence is a gap the cross-check flags.
- `source_tag: <literal>` — where applicable; must equal the `source_tag=`/`SOURCE_TAG=` literal in the pipeline Python. This is the exact `source_name`-vs-`source_tag` string that cost two weeks of false-RED (registry line 52-54).
- `nightly: true` + `min_rows: <n>` — on the 4 daily load-bearing sources (active-listings, listing-lifecycle, city-pulse, live-search). Drives the night-chain row gate.
- `coverage_exempt: <reason>` — for live schemas consciously outside registry coverage, so the zero-coverage check doesn't false-flood.

**Lane awareness (load-bearing):** registry entries come in three shapes and assertions must branch on them — tier-1 (`inventory_id`, no SQL table), tier-2 **dlt** (`dlt_schema_name` + optional `count_table`), tier-2 **non-dlt** (`freshness_table` only — the raw psycopg upserts: `daily_truth`/live-search, `dbpr_re_licensees`, `city_pulse_corridors`, and the listing tables). Plus the `not_yet_running:` block (line 1589) whose join fields may legitimately be sentinels.

## 4. Act-today (stop the live bleeding)

Status as of 07/11/2026:

1. **~~$35k median hotfix~~ — DONE** (commit `c9748a6c`): homes-only `listing_active_stats` migration applied to prod (ZIP 33972 median $35,000 → $359,000; 33974 $31,360 → $325,000).
2. **~~Tripwire false-RED~~ — list corrected** (6-day false RED ended); structural fix (reads the manifest) still owed in Phase 3a.
3. **SteadyAPI new-key live test** — operator asked; run the new key against the live endpoint and report working/not-working. Diagnostic, not a build (no code can auto-test the account — one-shot manual verify).
4. **CI green on main** — `ci.yml` was red 35 straight pushes; get it fully green so a new red is visible again.

**Correction that survives:** `actions/checkout@v6` is **valid today** (v6 shipped since the diagnosis). Don't "fix" it — the Phase-2 version check must resolve against live/maintained tags, never a baked-in "v6 is bad" literal.

## 5. Phase 1 — Content contracts (the core fix: checks travel with the data)

**Goal:** "a sales table contains no rental-priced rows" and "median asking price counts homes only" become executable assertions that run at load. Today: zero such assertions exist.

**Locus correction (load-bearing):** the contaminated writers are **NOT dlt** — they're hand-rolled psycopg merges (`listing_lifecycle/distill.py:upsert_state`, `active_listings/distill.py:upsert_rows`, `market_aggregates/pipeline.py:run_details`), and `listing_active_stats` is a **view with no pipeline**. So there is no "dlt post-load callback." The gate goes **in the merge orchestrator, on the candidate batch, right before the merge call**; view-level contamination is caught by an at-rest tripwire.

Build:
- `ingest/quality/contracts.py` — NEW pure, DB-free, unit-testable module: `evaluate_batch(rows, table) -> (clean, quarantined, stats)` + the failing-row SQL builders.
- `ingest/quality/quality_registry.yaml` — add per-table `content_contracts:` blocks. Three genuinely-missing contract types (freshness/row-count already have authorities — do NOT re-add them): `enum` (allowlist scoped to a subset), `range` (WHERE-scoped numeric floor — e.g. non-land sale price ≥ $20k), `sql_expectation` (cross-column/cross-grain, e.g. sold/rent ratio band, land-drags-median tripwire).
- `ingest/lib/guards.py` — add `ContentContractError` (sibling of `VolumeGuardError`).
- **Locus A (blocking-capable):** in-pipeline, on the batch, before merge. Policy per contract: `quarantine` (drop offending rows, merge the clean rest — 91 bad of 34k → drop 91), `abort` (violating *share* > threshold → whole feed changed shape, kill the run). Never abort a 34k load over 91 rows.
- **Locus B (report-only):** extend `check_data_quality.py` to read the same `content_contracts` block and run `locus ∈ {probe,both}` entries at rest, folding into the existing `data-quality` checks ledger. This is the ONLY locus that can guard `listing_active_stats` (the view).
- **One-time backfill:** `check_data_quality.py --contracts-backfill` (read-only triage of already-landed contamination) + `--purge` (separate, explicit destructive cleanup of the 91 rows).

**False-positive traps the range contracts MUST avoid** (both real, both in evidence): legit sub-$20k land lots (523 real lots — protected by `where property_type <> 'land'`) and `leepa_parcels.last_sale_amount` $1–9,999 (41,510 nominal-consideration/quitclaim transfers — protected by table-scoping; no leepa price contract authored).

## 6. Phase 2 — Config-identity cross-check CI (kill the wrong-letter class at PR time)

**Goal:** the ~6 hand-synced identity strings get machine-verified against each other, so a one-letter drift fails the PR instead of going silent for weeks.

Build `ingest/tools/check-registry-identity.mts` (Bun/TS, mirrors `check-vocab-coverage.mts`). Two modes:
- **`--static`** (files only — runs in pre-push hook, fail-OPEN when it needs a DB): join fields resolve (dir/workflow/pack exist or are sentinels); `dlt_schema_name` appears as a literal in the pipeline Python (mark `schema_static: unverifiable` for runtime-random names like leepa); every `os.getenv` secret the code reads is in the workflow `env:` block (the FRED/S3/Firecrawl kill); `uses:` versions resolve against a maintained allowlist / live `gh api tags`; `timeout-minutes` present; `source_tag` matches.
- **`--live`** (adds `data_lake` reads — CI only): `dlt_schema_name` actually landed (`_dlt_loads`, status 0 — catches `redfin_city_swfl` "confirmed but never landed"); `count_table` exists and `COUNT(*) >= expected_rows_min` (catches `dbpr_re_licensees` 0 rows); registry entries pointing at ghost tables → RED; live schemas with real rows and zero registry coverage → RED (catches `parcel_subdivision`, 220k rows) modulo `coverage_exempt`; pack `sources:[...]` reading a legacy/excluded table → RED (the `env-swfl` case).

Slots into `check-prepush-gate.mjs` (new gate, same block/exit contract as Gate 2/5, fail-open on tooling error) + a `--live` step in `ci.yml`. Failure output names **both sides** of every drift.

## 7. Phase 3 — Monitoring consolidation (one reader, absorb the fleet)

**3a. Watch-list manifest + drift-check** (smallest, do first): `scripts/build-watch-lists.mjs` scans `.github/workflows/*.yml` → `_watch-manifest.json` per workflow: `{name, file, scheduled, timeout_minutes, cancel_in_progress, paid, should_be_dark, disabled}`. Regenerates the `workflows:` arrays in both watcher YAMLs from `scheduled === true` (ends the 70% blind spot). `workflow_run.workflows:` has **no wildcard support** (confirmed live), so this is codegen + a `ci.yml` drift-test. Tripwire's `checkPulseDark()` and `paidWorkflows()` read the same manifest → one truth, three consumers.

**3b. Cancelled-run blind-spot fix:** widen both watcher gates to admit `cancelled`/`timed_out` for *classification*. Handler adds `classifyTermination(run)`: **TIMEOUT** (elapsed ≥ ~95% of `timeout-minutes`) → incident + "bump timeout" Rx; **SUPERSEDED** (has `cancel-in-progress` + a newer run) → skip silently; **UNKNOWN-CANCEL** (neither, e.g. leepa's 4/4) → incident anyway. Scope the cancelled path to `run.event == 'schedule'`. **Money guard:** TIMEOUT class maps to `should_retry = false` — never re-run a run that already hit its ceiling (the corridor-pulse burn).

**3c. `doctor` entrypoint** — `ingest/scripts/doctor.py` (Python, so it *imports* `check_freshness.py` + `check_data_quality.py` rather than re-querying). Joins three cred domains (Postgres freshness/volume, Supabase content-contracts + checks ledger, `gh` last-run/last-success) + the manifest. One health line per dataset = worst of {freshness, volume, content, run-status} + a prescription. Modes: default report, `--json` (backs the existing `/census` ops page — §7 3f), `--cron`/`--fail-on red`. Ship advisory first, flip to gating after one green confirm. Register via `new-build.mjs`.

**3d. Retire vs keep** — fold the *read/report* half of `freshness-probe-daily.yml` into `doctor --cron` (file stays, body becomes doctor); point the ops dashboard at `doctor --json`. **Keep** the reactive ones (log-cron-incident, heal-cron-failure, tripwire spend alarm) and the producers/send-verifiers (data-targets, data-readiness, smoke-prod). Honest framing: this consolidates the *read* surface to one reader, it is not six deletions.

**3e. Stale-caveat TTL** — `4-output.mts` re-lifts each upstream's baked `caveats[]` every build, so a frozen "macro-florida failed 06/29" text re-ships for ~30 days. Add `caveatIsFresh(caveat, now, ttlDays=14)` — regex the date already in the caveat string, drop if older than TTL — applied at the re-lift boundary (`:438`/`:458-459`). Parse-at-render, NOT a structured field (turning `caveats: string[]` into `{text, expires_at}[]` is a `BrainOutput` type-lift → backfill all packs same commit; render-TTL avoids that and catches hand-written caveats too).

**3f. Reconcile with the existing `/census` ops page — do NOT build a parallel surface.** `swfldatagulf-ops.vercel.app/census` ("Pipeline Data Census /ops") already tracks **74 pipelines** (71 active, 3 parked) with per-pipeline guard status (FRESH/EMPTY/MISSING), cadence, current count, and — critically — **source-ceiling research already done and cited** (70/74 confirmed-total, 68/74 source-ceiling, dated 07/07–07/08/2026: what each vendor *could* give vs. what we pull). This is the human-facing pipeline inventory; **`doctor --json` is the machine that backs it, not a competing dashboard.** Splits cleanly with the ops-repo rule: `doctor` (the Python health model) lives here in `ingest/`; the census **view** is ops-repo React that consumes `doctor --json`. Three inventories must reconcile to one — the census's **74 pipelines** ↔ the registry's ~78 entries (the Spine, §3) ↔ the 77 scheduled workflows (the Phase-3 manifest); the Phase-2 zero-coverage check (§6) *is* that reconciliation. The census's guard column overlaps `doctor`'s freshness/volume signal but has **no content-contract signal** — it shows counts + vendor ceilings, not the $35k-median correctness class — so `doctor` extends it and the census gains a content-health column. (The census already surfaces `tier_divergence_swfl` = EMPTY / "query failed", matching the diagnosis.) Operator flag: the census was mis-built by two prior sessions (most content sank to the page bottom) — that cleanup is ops-repo work (§13, Fable 5), not a re-research.

## 8. Phase 4 — GHA-native nightly ordered chain (the operator's headline ask)

**Goal:** ingest → prove rows landed → rebuild → bake → warm caches → (email preflight), all inside midnight–7 AM EDT, gated on real row-landing. Fixes the live bug: rebuild fires 04:23 UTC but ingests run 09:00–18:00 UTC, so the nightly rebuild consumes *yesterday's* data. **The email reads the *published* brains**, so its true precondition is a **today-dated freshness token**, produced by the rebuild.

Build:
- `ingest/scripts/assert_landed.py` — the load-bearing row gate. Reuses `check_freshness.py`'s connection + registry, but stricter: for each `nightly: true` entry, `last_run == today (UTC)` AND `count(*) >= min_rows`. Any stale/empty → name it → exit 1 → skip rebuild. A post-load DB assertion, independent of any job's self-reported green.
- Add `on: workflow_call:` to the 8 chain members (4 ingests + rebuild + bake + graphify + gate-a) — pure addition, keep `workflow_dispatch`.
- `nightly-chain.yml` — ONE clocked head (`5 4 * * *` = 00:05 EDT), everything after ordered by `needs`. ingests (parallel, county matrix Lee+Collier only) → `row-gate` → `rebuild` (do NOT force) → `bake` → `warm`+`gate-a` (parallel). `secrets: inherit` mandatory. **Delete `daily-rebuild.yml`'s standalone `23 4` cron** and comment out the daily-ingest `schedule:` crons (keep dispatch). Timing: typical finish ~06:00 UTC, worst ~07:30 UTC — inside the 11:00 UTC deadline.
- **Email preflight** — add to `scripts/email/build-digest.mts`: read master's `freshness_token`; if not today's date, **refuse to send + alert**. Structurally drift-immune: even if GHA drops the head cron, the email refuses rather than sends bad.

## 9. Acceptance criteria per phase (close = live evidence, never dev attestation)

- **Spine:** every `pipelines:` entry carries `workflow:`; a deliberately wrong filename fails the Phase-2 static check. Zero freeform `# Cron:` comments remain load-bearing.
- **Phase 1:** (a) the pre-fix contaminated listings batch (91 rental-priced "sale" rows + land blend), replayed as a fixture, is **quarantined** by `evaluate_batch()` with correct counts; (b) both known false-positive traps pass clean (523 legit sub-$20k land lots; 41,510 LeePA nominal-consideration transfers); (c) a synthetic >threshold contamination share **aborts** the run loud and the incident logger captures it.
- **Phase 2:** static mode red on each seeded drift fixture (bad workflow ref, `dlt_schema_name` absent from pipeline source, secret read but not in `env:`, missing `timeout-minutes`, `source_tag` mismatch); live mode, run against the 07/11 snapshot, flags exactly the two real-world cases (`redfin_city_swfl` never landed; `dbpr_re_licensees` 0 rows).
- **Phase 3:** manifest codegen — a new scheduled workflow added in a test branch fails the drift-test until regenerated; `classifyTermination` labels leepa 4/4-cancelled UNKNOWN-CANCEL and corridor-pulse's timeout kill TIMEOUT with `should_retry=false`.
- **Phase 4:** `assert_landed.py` report-only run names any stale nightly source; after cutover, master's freshness token dates today after the chain, and the email preflight refuses a stale token in a forced test.
- **Doctor:** one run on live state produces one line per dataset + one per watcher, and every red line carries a prescription or an explicit "unknown class — evidence attached" (never an invented diagnosis).

## 10. Testing regime

- `contracts.py` is pure and DB-free: unit tests per contract type (`enum`, `range` WHERE-scoped, `sql_expectation`) plus quarantine/abort policy math at the thresholds.
- Deliberate-failure proofs stay in the repo: `leepa.last_sale_amount` (existing not_null proof), pre-fix listings batch (Phase-1 proof), seeded drift fixtures (Phase-2 proof), synthetic cancelled run (Phase-3 proof).
- Read-only integration: `doctor --dry-run` < 2 min against live, correct on the two real broken tables.
- Existing gates untouched: `bunx next build`, `pytest ingest/`, Gate 2/4/5 hooks, vocab coverage.

## 11. Prescriptions enum (doctor + incident handler share it)

`ACTION_VERSION · SECRET_NOT_WIRED · SCHEMA_NAME_DRIFT · TIMEOUT_KILL (should_retry=false) · GAP_SENTINEL (verify vendor account — dead key = green run) · NEVER_LANDED (registry claims, DB lacks) · ZERO_COVERAGE (DB has, registry lacks) · WAF_BLOCK · TRANSIENT (retry ≤ 2, then escalate) · UNKNOWN (print evidence, say so)`. Seeded from `docs/cron-rebuild-failures.md` Recurring Patterns; every enum member has a test asserting its fix-text names the file/workflow it applies to.

## 12. Path C — orchestrator migration (Dagster), CONDITIONAL and gated

Full evidence: `06`. Path C is **not a fix** — Path A already owns root causes 1–2 (§2). C is an *operability upgrade* that trades a persistent always-on service for retiring the 77-workflow GHA + hand-synced-config sprawl (root causes 3–4, deeper) + first-party `dagster-dlt`. Build it only if the gate opens.

**The gate — open only when ALL hold:** (1) all of A shipped, nightly chain + `doctor --cron` green **≥ 60 consecutive days** no manual intervention; (2) ≥ 3 config-drift/sprawl incidents in a rolling 90 days that the Phase-2 CI cross-check + manifest **structurally cannot catch**; (3) workflow count/interdependency outgrew "one clocked head + `needs` ordering"; (4) an operator willing to run an always-on service (OSS Dagster is not serverless — webserver + daemon + Postgres, per `06`).

**Kill criteria (any true → don't migrate):** A green and the config/watcher surface quiet; registry-YAML + CI cross-check holding drift at PR time; nobody will run the always-on service; anyone proposes rewriting `contracts.py`/`doctor` *inside* Dagster.

**Invariants C may never violate:** (1) **port, don't re-invent** — a `@asset_check` body *calls* `contracts.evaluate_batch` and maps its return to `AssetCheckResult`; assertion logic stays in `contracts.py`. (2) **registry survives as config truth** — the Dagster `Definitions` graph is generated/validated from it, not hand-authored in parallel. (3) **`doctor` stays the health reporter** — Dagster+'s rolled-up health is paid; we don't buy it. (4) **views keep Locus B** — Dagster has no clean answer for a bare view either.

**Migration mechanics (reference; do not start until gate met):** dlt pipelines wrap via first-party `dagster-dlt` (low friction); the 3 non-dlt psycopg writers migrate by hand (`@asset` calling the existing merge + `@asset_check` calling `evaluate_batch`) — **the real labor**; non-ingest CI stays on GHA; Locus-B tripwire, `doctor`, and the CI cross-check never migrate. Stand up read-only alongside prod → wrap dlt still GHA-triggered → port assertions (zero-diff gate) → per-asset `FreshnessPolicy` advisory → move ONE low-risk schedule off GHA (ask-first) → roll the rest one-at-a-time with soaks → migrate the nightly chain LAST (highest blast radius, ask-first).

**Cost — we build/run it entirely ourselves; no SaaS bill, no Dagster+.** The cost-collapsing move: run webserver + daemon + Postgres as containers on **one** small VM via Docker Compose (Dagster OSS officially supports single-host Docker-Compose; no Kubernetes, no separate managed DB — `docs.dagster.io/deployment/oss/deployment-options`, v1.13.13, fetched 07/11/2026). Sourced hosting (07/11/2026): **$0** — Oracle Cloud Always Free Arm Ampere A1 ~2 OCPU/12 GB continuous (`oracle.com/cloud/free`), ideal for the read-only stand-up (caveats: ARM, idle-reclaim, regional capacity); **Amazon flat/reliable** — AWS Lightsail (`aws.amazon.com/lightsail/pricing`), first 3 months free, **$12/mo = 2 GB/2 vCPU (tight floor), $24/mo = 4 GB/2 vCPU (comfortable pick, ≈ $288/yr)**; Hetzner ~€4–6/mo exists (not priced here). Backups: nightly `pg_dump` to object storage or Lightsail snapshots (cents). **Net: infra $0 → ~$24/mo; the real cost is engineering time + the ops attention to keep the daemon from silently hanging — which is exactly what gate condition (4) tests.**

## 13. Open for Fable 5 tonight (the harder parts)

- **Write the per-task TDD breakdown** (Spine → Phase 1 → 2 → 3a/3b → 3c → 4 → 3e) — bite-sized failing-test-first steps with exact file paths, per the `writing-plans` skill. This spec is the *what*; the executable *how* is still owed.
- **Nail the exact contract thresholds** — the `range` floors, the `abort` contamination-share %, the sold/rent ratio band — against the live 07/11 snapshot, not from memory.
- **Enumerate `listing_active_stats` / `market_details_swfl` DOWNSTREAM consumers** before the Locus-B tripwire lands (blast-radius list — this is downstream pack/view usage, which `/census` does NOT track; the census covers upstream sources only).
- **Confirm the nightly-chain timing envelope** against real recent run durations (the ~06:00 / worst ~07:30 UTC estimate needs live confirmation before deleting the `daily-rebuild.yml` cron — ask-first per RULE 1).
- **Wire `doctor --json` into `/census` + reconcile the three inventories** (§7 3f: census 74 ↔ registry ~78 ↔ workflows 77) and clean the mis-built census layout — ops-repo work. **Do NOT re-research pipeline source ceilings**; that exists (70/74, 68/74 cited). Fable 5's job here is reconciliation + wiring, not rediscovery.

## 14. Out of scope

Everything above's non-goals, plus: no Dagster/Prefect/Airflow adoption inside A (§12 gates C); the `/census` page's **React rebuild/cleanup** is ops-repo work, not brain-platform — but `/census` is **NOT walled off**: `doctor --json` must back it and reconcile with its existing pipeline/source-ceiling research (§7 3f); no `BrainOutput` type-lift for caveats (§3e chose render-TTL for exactly that reason); no re-adding freshness/row-count contract types (they have authorities already); **no re-researching pipeline source ceilings** — that work already exists on `/census` (70/74, 68/74 done), leverage it.

## 15. Sequencing (each step independently shippable + revertable; SESSION_LOG + `--dry-run` per RULE 1)

0. **Act-today** — SteadyAPI new-key test · CI green (hotfix + tripwire list already done). 
1. **The Spine** — the six registry fields. Unblocks everything.
2. **Content contracts** (§5) — `contracts.py` + registry blocks + Locus A gate + Locus B probe + backfill.
3. **Config cross-check** (§6) — `check-registry-identity.mts` static→hook, live→CI.
4. **Watch-list manifest + cancelled-run fix** (§7 3a/3b).
5. **Doctor** (§7 3c/3d) — imports the above, advisory→gating.
6. **Nightly chain** (§8) — `assert_landed.py` report-only first, then `workflow_call` on children, then `nightly-chain.yml` (**ask-first** — deletes rebuild cron), then email preflight.
7. **Caveat TTL** (§7 3e) — independent, any time.

**RULE 1 ask-first flags:** Step 6's rebuild-cron deletion rewires the live email precondition; steps touching `4-output.mts` (caveats ship to live answers) and the watcher handlers are live-surface. Steps 1, 2 (Locus B), 3, 4 are additive/safe to land incrementally.

## Check linkage & tracking

- `data_contracts_doctor_live_verify` closes only on: Phase 1–3 acceptance (§9) green **live** + doctor's first real run archived in `verification/`.
- Phase 4 (nightly chain) and its ask-first cron rewires get their own check at execution time.
- Related checks already open: `empty_brain_content_detector` (stays open), `tier_divergence_dag_orphan` (Phase-2 live mode surfaces it; closing requires the ship-or-delete decision), `caveat_expiry_rebuild` (tracked by §7 3e).

---

**Evidence:** `docs/audit/2026-07-11-pipeline-problems/00-DIAGNOSIS.md` · `01`–`04` (sweeps) · `06-orchestrator-vendor-research.md` (vendor, live-doc 07/11/2026). `05` and `07` are absorbed into this file.
