# 05 — BUILD SCOPE: Path A (checks-on-data) + GHA-native nightly chain

**As of 07/11/2026.** Synthesis of four parallel Opus scoping passes (night-chain, content-contracts, config-identity cross-check, doctor+watchers), each grounded in live code — not the diagnosis's memory. Path decided by operator: **A now, on GitHub Actions. Dagster rejected.** Orchestrator/config-truth vendor (Prefect vs Airtable) is an open operator decision this scope deliberately leaves room for — see §The Spine.

Companion to `00-DIAGNOSIS.md` (the why) and `01`–`04` (the evidence). This file is the *what to build*.

---

## The one-line shape

Every scoping pass independently arrived at the same center of gravity: **make `ingest/cadence_registry.yaml` the single source of config truth**, then hang three things off it — content assertions that run at load, a CI cross-check that kills the wrong-letter class at PR time, and one `doctor` health model that absorbs the watcher fleet. The nightly ordered chain (ingest → row-gate → rebuild → bake → warm → email) rides the same registry. No new framework, no new host.

---

## The Spine — registry as single source of config truth (do this FIRST)

Four new/structured fields on each `cadence_registry.yaml` entry. Everything else consumes them. This is the piece a config-truth vendor (Prefect/Airtable) would own if you go that way — build it as data first, and moving it to Airtable later is an export, not a rewrite.

- `workflow: <file>.yml` — today the workflow filename lives only in freeform `# Cron:` comments (registry lines 140, 810, 831…). Structured field enables the pipeline→workflow map every other deliverable needs. Mechanical backfill, ~78 entries.
- `consuming_pack: <pack>|[packs]|none` — the pack this source feeds. `none` is a stated fact (faf5 has no pack), silence is a gap the cross-check flags.
- `source_tag: <literal>` — where applicable; must equal the `source_tag=`/`SOURCE_TAG=` literal in the pipeline Python. This is the exact `source_name`-vs-`source_tag` string that cost two weeks of false-RED (registry line 52-54).
- `nightly: true` + `min_rows: <n>` — on the 4 daily load-bearing sources (active-listings, listing-lifecycle, city-pulse, live-search). Drives the night-chain row gate.
- `coverage_exempt: <reason>` — for live schemas consciously outside registry coverage, so the zero-coverage check doesn't false-flood.

**Lane awareness (load-bearing):** registry entries come in three shapes and assertions must branch on them — tier-1 (`inventory_id`, no SQL table), tier-2 **dlt** (`dlt_schema_name` + optional `count_table`), tier-2 **non-dlt** (`freshness_table` only — the raw psycopg upserts: `daily_truth`/live-search, `dbpr_re_licensees`, `city_pulse_corridors`, and the listing tables). Plus the `not_yet_running:` block (line 1589) whose join fields may legitimately be sentinels.

---

## Act-today (stop the live bleeding — mostly small, independent)

These are separate from the build phases and can land immediately.

1. **SteadyAPI new key test** — operator asked; run the new key against the live endpoint and report working/not-working. Diagnostic, not a build. (No code can *auto*-test the account — this is a one-shot manual verify.)
2. **The $35k median hotfix** — `docs/sql/20260711_listing_active_stats_core_counties.sql` (a VIEW — no pipeline writes it) has no property-type filter. Add a `property_type <> 'land'` filter / home-only median so ZIP 33972 stops shipping a $35k asking median against a $354,999 single-family median. Also drop the 91 rental-priced "sale" rows ($600–$9,900). **Scope the exact change against the view SQL before touching it** (the rejected 6th agent was to do this — do it inline or re-dispatch). Blast radius: every consumer reading `listing_active_stats` / `market_details_swfl` — enumerate before landing.
3. **CI red on main** — `ci.yml` red 35 straight pushes. Fix to green as its own task before new work lands, so a new red is visible again.
4. **Tripwire false-RED** — 6-day RED from `tripwire-scan.mjs:109` `checkPulseDark()`'s hardcoded `["Corridor pulse weekly","City pulse daily"]`. 5-min fix now (correct the list); structural fix in Phase 3 (reads the manifest).

**Correction the scope surfaced:** `actions/checkout@v6` is **valid today** — v6 shipped since the diagnosis was written; `fema-nfip-quarterly.yml` is green on that axis. Don't "fix" it. This is why the version check (Phase 2) must resolve against live/maintained tags, never a baked-in "v6 is bad" literal.

---

## Phase 1 — Content contracts (the core fix: checks travel with the data)

**Goal:** somewhere in the repo, "a sales table contains no rental-priced rows" and "median asking price counts homes only" become executable assertions that run at load. Today: zero such assertions exist.

**Correction from scoping (load-bearing):** the contaminated writers are **NOT dlt** — they're hand-rolled psycopg merges (`listing_lifecycle/distill.py:upsert_state`, `active_listings/distill.py:upsert_rows`, `market_aggregates/pipeline.py:run_details`), and `listing_active_stats` is a **view with no pipeline**. So there is no "dlt post-load callback." The gate goes **in the merge orchestrator, on the candidate batch, right before the merge call**, and view-level contamination is caught by an at-rest tripwire.

Build:
- `ingest/quality/contracts.py` — NEW pure, DB-free, unit-testable module: `evaluate_batch(rows, table) -> (clean, quarantined, stats)` + the failing-row SQL builders.
- `ingest/quality/quality_registry.yaml` — add per-table `content_contracts:` blocks. Three genuinely-missing contract types (freshness/row-count already have authorities — do NOT re-add them): `enum` (allowlist scoped to a subset), `range` (WHERE-scoped numeric floor — e.g. non-land sale price ≥ $20k), `sql_expectation` (cross-column/cross-grain, e.g. sold/rent ratio band, land-drags-median tripwire).
- `ingest/lib/guards.py` — add `ContentContractError` (sibling of `VolumeGuardError`).
- **Locus A (blocking-capable):** in-pipeline, on the batch, before merge. Policy per contract: `quarantine` (drop offending rows, merge the clean rest — 91 bad of 34k → drop 91), `abort` (violating *share* > threshold → whole feed changed shape, kill the run). Never abort a 34k load over 91 rows.
- **Locus B (report-only):** extend `check_data_quality.py` to read the same `content_contracts` block and run `locus ∈ {probe,both}` entries at rest, folding into the existing `data-quality` checks ledger. This is the ONLY locus that can guard `listing_active_stats` (the view).
- **One-time backfill:** `check_data_quality.py --contracts-backfill` (read-only triage of already-landed contamination) + `--purge` (separate, explicit destructive cleanup of the 91 rows).

**False-positive traps the range contracts MUST avoid** (both real, both in evidence): legit sub-$20k land lots (523 real lots — protected by the `where property_type <> 'land'` predicate) and `leepa_parcels.last_sale_amount` $1–9,999 (41,510 nominal-consideration/quitclaim transfers — protected by table-scoping; no leepa price contract authored).

---

## Phase 2 — Config-identity cross-check CI (kill the wrong-letter class at PR time)

**Goal:** the ~6 hand-synced identity strings get machine-verified against each other, so a one-letter drift fails the PR instead of going silent for weeks.

Build `ingest/tools/check-registry-identity.mts` (Bun/TS, mirrors `check-vocab-coverage.mts`). Two modes: `--static` (files only — runs in pre-push hook, fail-OPEN when it needs a DB) and `--live` (adds `data_lake` reads — CI only). Assertions, lane-conditional:
- **Static:** join fields resolve (dir/workflow/pack exist or are sentinels); `dlt_schema_name` appears as a literal in the pipeline Python (typo-catcher; mark `schema_static: unverifiable` for runtime-random names like leepa); every `os.getenv` secret the code reads is in the workflow `env:` block (the FRED/S3/Firecrawl kill); `uses:` versions resolve against a maintained allowlist / live `gh api tags`; `timeout-minutes` present; `source_tag` matches.
- **Live:** `dlt_schema_name` actually landed (`_dlt_loads`, status 0 — catches `redfin_city_swfl` "confirmed but never landed"); `count_table` exists and `COUNT(*) >= expected_rows_min` (catches `dbpr_re_licensees` 0 rows); registry entries pointing at ghost tables → RED; live schemas with real rows and zero registry coverage → RED (catches `parcel_subdivision`, 220k rows, uncovered) modulo `coverage_exempt`; pack `sources:[...]` reading a legacy/excluded table → RED (the `env-swfl` case).

Slots into `check-prepush-gate.mjs` (new gate, same block/exit contract as Gate 2/5, fail-open on tooling error) + a `--live` step in `ci.yml`. Failure output names **both sides** of every drift.

---

## Phase 3 — Monitoring consolidation (one reader, absorb the fleet)

**3a. Watch-list manifest + drift-check** (smallest, do first — kills the drift class):
- `scripts/build-watch-lists.mjs` scans `.github/workflows/*.yml` → `_watch-manifest.json` per workflow: `{name, file, scheduled, timeout_minutes, cancel_in_progress, paid, should_be_dark, disabled}`. Regenerates the `workflows:` arrays in both watcher YAMLs from `scheduled === true` (ends the 70% blind spot — 53–55 of 77 scheduled workflows are watched by neither today). `workflow_run.workflows:` has **no wildcard support** (confirmed live), so this is codegen + a `ci.yml` drift-test, not a runtime glob. The drift-test *is* the machine-check: a new scheduled cron can't be born unwatched. Tripwire's `checkPulseDark()` and `paidWorkflows()` read the same manifest → one truth, three consumers.

**3b. Cancelled-run blind-spot fix:**
- Widen both watcher gates to admit `cancelled`/`timed_out` for *classification* (not blanket — that pulls in by-design concurrency-supersede cancels). Handler adds `classifyTermination(run)`: **TIMEOUT** (elapsed ≥ ~95% of `timeout-minutes`) → incident + "bump timeout" Rx; **SUPERSEDED** (has `cancel-in-progress` + a newer run) → skip silently; **UNKNOWN-CANCEL** (neither, e.g. leepa's 4/4) → incident anyway. Scope the cancelled path to `run.event == 'schedule'`.
- **Money guard:** TIMEOUT class maps to `should_retry = false`. Never re-run a run that already hit its ceiling — that re-spends the API money (the corridor-pulse burn).

**3c. `doctor` entrypoint** — `ingest/scripts/doctor.py` (Python, so it *imports* `check_freshness.py` + `check_data_quality.py` rather than re-querying — a `.mjs` doctor would rot into a 9th partial watcher). Joins three cred domains (Postgres freshness/volume, Supabase content-contracts + checks ledger, `gh` last-run/last-success) + the manifest. One health line per dataset = worst of {freshness, volume, content, run-status} + a prescription ("table empty, workflow 4/4 cancelled, bump timeout, then `gh workflow run X`"). Modes: default report, `--json` (ops dashboard reads this — one pane replaces 5 disagreeing surfaces), `--cron`/`--fail-on red`. Ship advisory first, flip to gating after one green confirm (the `crawl4ai-doctor` precedent). Register via `new-build.mjs`.

**3d. Retire vs keep** — fold the *read/report* half of `freshness-probe-daily.yml` into `doctor --cron` (file stays, body becomes doctor; heartbeat preserved); point the ops dashboard at `doctor --json`. **Keep** the reactive ones (log-cron-incident, heal-cron-failure, tripwire spend alarm) and the producers/send-verifiers (data-targets, data-readiness, smoke-prod) — these were never really watchers. Honest framing: this consolidates the *read* surface to one reader, it is not six deletions.

**3e. Stale-caveat TTL** — `4-output.mts` re-lifts each upstream's baked `caveats[]` every build, so a frozen "macro-florida failed 06/29" text re-ships for ~30 days. Add `caveatIsFresh(caveat, now, ttlDays=14)` — regex the date already in the caveat string, drop if older than TTL — applied at the re-lift boundary (`:438`/`:458-459`). Parse-at-render, NOT a structured field: turning `caveats: string[]` into `{text, expires_at}[]` is a `BrainOutput` type-lift (Brain Factory rule 3 → backfill all packs same commit). Render-TTL avoids that and catches hand-written caveats too.

---

## Phase 4 — GHA-native nightly ordered chain (the operator's headline ask)

**Goal:** ingest → prove rows landed → rebuild → bake → warm caches → (email preflight), all inside midnight–7 AM EDT, gated on real row-landing. Fixes the live bug: rebuild fires 04:23 UTC (00:23 EDT) but ingests run 09:00–18:00 UTC, so the nightly rebuild consumes *yesterday's* data and the 10:23 EDT email can go out before the day's ingest lands.

**The email reads the *published* brains** (`fetch-digest-data.mts` → `/api/b/master?view=speak`), not `data_lake` directly — so its true precondition is a **today-dated freshness token**, produced by the rebuild.

Build:
- `ingest/scripts/assert_landed.py` — the load-bearing row gate. Reuses `check_freshness.py`'s connection + registry, but stricter: for each `nightly: true` entry, `last_run == today (UTC)` AND `count(*) >= min_rows`. Any stale/empty → name it → exit 1 → skip rebuild → chain reddens. A **post-load DB assertion**, independent of any job's self-reported green.
- Add `on: workflow_call:` to the 8 chain members (4 ingests + rebuild + bake + graphify + gate-a) — pure addition, keep `workflow_dispatch`.
- `nightly-chain.yml` — ONE clocked head (`5 4 * * *` = 00:05 EDT), everything after ordered by `needs`. ingests (parallel, county matrix Lee+Collier only — not Charlotte/Sarasota per SCOPE) → `row-gate` → `rebuild` (do NOT force — it naturally rebuilds because ingest now lands before it) → `bake` → `warm`+`gate-a` (parallel). `secrets: inherit` mandatory. **Delete `daily-rebuild.yml`'s standalone `23 4` cron** and comment out the daily-ingest `schedule:` crons (keep dispatch) — else double-ingest/queue-behind. Timing: typical finish ~06:00 UTC (02:00 EDT), worst ~07:30 UTC — inside the 11:00 UTC / 07:00 EDT deadline with ~8h margin before the email.
- **Email preflight** — add to `scripts/email/build-digest.mts`: read master's `freshness_token`; if not today's date, **refuse to send + alert**. Keeps the email on its researched 10:23-EDT engagement clock while guaranteeing it never sends stale — the real coupling without welding send-time to build-time. Structurally drift-immune: even if GHA drops the head cron, the email refuses rather than sends bad.

**"Cache sessions" the operator flagged** = `narrative-bake` (surface narratives → Supabase page cache), `graphify-republish` (code-graph snapshot), `gate-a-parity` (view⇄pack parity). No Vercel ISR/CDN cron and no prompt-cache warmer exist. Contiguous rebuild→bake also keeps Anthropic's prompt-cache warm — today's 04:23-vs-10:23 spread guarantees a cold cache on every bake; collapsing the window recovers it.

---

## Unified sequencing (each step independently shippable + revertable; SESSION_LOG + `--dry-run` per RULE 1)

0. **Act-today** — SteadyAPI test · $35k view hotfix · CI green · tripwire list fix. (Independent, land now.)
1. **The Spine** — add `workflow`/`consuming_pack`/`source_tag`/`nightly`/`min_rows`/`coverage_exempt` to the registry. Unblocks everything.
2. **Content contracts** (Phase 1) — the core defect fix. `contracts.py` + registry blocks + Locus A gate + Locus B probe + backfill.
3. **Config cross-check** (Phase 2) — `check-registry-identity.mts` static→hook, live→CI.
4. **Watch-list manifest + cancelled-run fix** (Phase 3a/3b) — small, high-leverage.
5. **Doctor** (Phase 3c/3d) — imports the above, one health model, advisory→gating.
6. **Nightly chain** (Phase 4) — `assert_landed.py` report-only first, then `workflow_call` on children, then `nightly-chain.yml` (deletes rebuild cron — **ask-first**), then email preflight.
7. **Caveat TTL** (Phase 3e) — independent, any time.

**RULE 1 "ask-first" flags:** Step 6's rebuild-cron deletion rewires the live email precondition; steps touching `4-output.mts` (caveats ship to live answers) and the watcher handlers (incident capture) are live-surface. Push nothing on these without operator approval. Steps 1, 2 (Locus B), 3, 4 are additive/safe to land incrementally.

**Open operator decision (does not block Phase 1-2):** Prefect vs Airtable for the config-truth layer. The Spine builds that truth as registry data either way; a vendor move later is an export, not a rewrite. Decide once the registry-as-source-of-truth shape is real and you can see what it needs to hold.

---

Evidence: `00-DIAGNOSIS.md` · `01`–`04`. Scoping passes: 4× Opus, 07/11/2026, each grounded in live code (files cited in each pass; full briefs in session transcript).
