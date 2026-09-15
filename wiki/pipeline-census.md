---
title: Pipeline census
type: overview
status: active
updated: 2026-09-15
sources:
  - ingest/cadence_registry.yaml
  - .github/workflows/*.yml (all 111)
  - docs/standards/repo-inventory-audit.md
  - wiki/pipeline-health.md
  - _ASSISTANT/2026-09-15-fedora-network-and-data-integrity-handoff.md
---
# Pipeline census

**Status (09/15/2026):** all 111 GitHub Actions workflows accounted for, one row each, via a 5-way
fan-out (market/listings, macro/econ, environmental, CRE/permits/parcels, deliverables+social+infra).
This page is the row-per-pipeline reference; [Pipeline health](pipeline-health.md) is the dated
rebuild-order narrative — different concept, don't merge them.

## What it is

The chain every pipeline sits on: **source → ingest (GHA workflow) → `data_lake.*` table →
`consuming_pack` (leaf brain) → master** (`refinery/lib/master-gate.mts`). A gap anywhere in that
chain is a finding: a workflow with no registry entry, a table with no reader, a reader with no
fresh table. `ingest/cadence_registry.yaml` already carries `workflow:`, `consuming_pack:`,
`expected_rows_min`, and `source_scope` (`confirmed_total`/`source_ceiling`) on every entry — this
census is that registry cross-checked against live `gh run list`/`gh run view` state, not
re-derived from scratch.

## Facts — the fleet right now

- 09/15/2026 — **111 of 111 workflows matched a registry entry** (several workflows back 2+
  entries: `bls-oews-annual.yml`, `corridor-pulse-weekly.yml`, `ingest-fl-dbpr-licenses.yml`,
  `ingest-local-cre-context.yml`, `lee-planned-developments-quarterly.yml`,
  `marketbeat-pdf-ingest.yml`). Zero orphans. (source: 5-agent census, cross-checked against
  `node scripts/schedule-catalog.mjs`)
- 09/15/2026 — **`nightly-chain.yml` has failed its `assert_landed` row-gate every run for 3+
  weeks** (40 runs checked back to 08/25, 100% failure). Everything downstream of it —
  `daily-rebuild`, `narrative-bake`, `gate-a-parity`, `grade-predictions` — is stalled, not
  individually broken; their stale last-success dates (07/12, 07/12, 07/12, 08/12) are a symptom.
  Two independent agents confirmed this (market-bucket census + the GHA-pricing agent). (source:
  `gh run list --workflow nightly-chain.yml`, job-level detail via `gh run view --json jobs`)
- 09/15/2026 — Root cause of the row-gate failure: the `city_pulse` leg hits the same Anthropic
  `400 credit balance too low` killing `factuality-gate.yml`, and all 3 `listing_lifecycle` county
  legs (Lee/Collier/Hendry) return 0 rows nightly from SteadyAPI's `/search` sweep — the pipeline's
  own no-fake-green guard is correctly refusing to write, not silently failing.
  `data_lake.listing_state` hasn't had a genuine nightly write since **08/14/2026** (32 days stale
  as of today). (source: `gh run view --log-failed` on today's nightly-chain run)
- 09/15/2026 — **`home-values-investor-monthly.yml` has failed 3/3 recent runs** (08/24, 07/24,
  06/24). The brain rebuild itself succeeds; the auto-commit push fails every time on
  `GH013: Repository rule violations found for refs/heads/main` — a branch-protection ruleset
  silently blocks this bot's direct push. `brains/home-values-swfl.md` and
  `brains/investor-zip-swfl.md` have been stale since at least June. (source: `gh run view
  --log-failed`)
- 09/15/2026 — **`ingest-crexi-listings.yml` and `dbpr-sirs-monthly.yml`** both target
  `runs-on: [self-hosted, swfl-local]` — Ricky's Windows box, currently offline. Every scheduled
  run queues for GitHub's 24h max-wait and auto-cancels. Crexi has never graduated past "not yet
  activated" for this exact reason. This is also the residential-IP problem the Fedora box is
  meant to solve — see [Fedora and public exposure](fedora-and-exposure.md).
- 09/15/2026 — **`redfin-monthly.yml` failed TODAY** (a live, unresolved break): `duckdb.
  BinderException: Referenced column "MEDIAN DAYS ON MARKET MOM (%)" not found in FROM clause` —
  Redfin likely renamed a CSV header the DuckDB query hard-references.
- 09/15/2026 — **`bls-qcew-quarterly.yml` has been broken since 08/09** with no scheduled retry
  until 11/09 (quarterly cadence): `RuntimeError: could not find latest available quarter within
  6 back-steps` in `ingest/pipelines/bls_qcew/pipeline.py:45`.
- 09/15/2026 — **`usgs-monthly.yml` is red right now** (last run 09/10, no rerun since): unhandled
  `503` from `waterservices.usgs.gov` on the first of 27 year-chunks in the backfill loop, no
  retry/backoff.
- 09/15/2026 — **`ingest-fl-dbpr-licenses.yml` failed 09/05** (and 08/05 before it — 2 straight
  months): the licenses half completes (11,455 rows matched), then
  `DatabaseUndefinedRelation: relation "data_lake_staging.fl_dbpr_applicants" does not exist` kills
  the applicants half.
- 09/15/2026 — **`redfin-collier-monthly.yml` and `redfin-lee-monthly.yml` both failed 08/18** on
  the same `ContentStaleError`: the shared Redfin source hadn't advanced past 05/31 (79 days > the
  55-day guard). The guard worked correctly; the vendor feed was stale that day. Next run ~09/18.
- 09/15/2026 — **`swfl-search-demand-monthly.yml` failed 09/02**: DataForSEO returned `402` for all
  3 locations — account balance/payment issue, not a code bug.
- 09/15/2026 — **`leepa-parcels-annual.yml` cancelled 3/3 recent runs** on a genuine GHA 1h30m
  job-timeout ceiling (LeePA HTTP fetches don't land cleanly on GitHub-hosted runners).
- 09/15/2026 — **`lee-planned-developments-quarterly.yml`** hit one real (self-recovered) failure
  08/30: `psycopg2.errors.DatatypeMismatch` on the `assigned_at` column — retried same day, green.
- 09/15/2026 — **CI (`ci.yml`) is currently green on main**; the push that briefly broke two
  workflow-watch tests (5f6ae7fc, 18:30 UTC) was reverted by Ricky himself 12 minutes later
  (e0eadb0b, 18:41 UTC) — main is clean as of this report.
- 09/15/2026 — **`factuality-gate.yml` is red** (`400 credit balance too low`) but structurally
  **cannot block a merge**: the branch-protection ruleset's only required check is `ci.yml`'s
  `build` job, and the operator's account has `bypass_mode: always` regardless.

## The NEVER_LANDED false-positive — a real doctor bug, not 3 broken pipelines

- 09/15/2026 — **`leepa_comp_sales` contradiction resolved with a live query**:
  `SELECT count(*) FROM data_lake.leepa_comparable_sales` → **108,848 rows**, matching the prior
  audit almost exactly. The freshness doctor's `NEVER_LANDED` verdict is wrong.
- 09/15/2026 — **Root cause, cited**: `ingest/scripts/check_freshness.py`'s `_fetch_max_freshness()`
  (lines 241–292) only has two paths — use `entry["freshness_table"]`, or fall back to
  `entry["dlt_schema_name"]` unconditionally (line 274). An entry with **neither key** but a real
  `count_table` (this is deliberate for `leepa_comp_sales` — its dlt schema name is
  runtime-random, `schema_static: unverifiable` per the registry's own comment) hits a `KeyError`
  at line 274, caught by the broad `except Exception:` at line 281, and silently returns `None` →
  freshness `MISSING` → `NEVER_LANDED`, even though `count_table` (which `check_volume_entry`
  *does* read, lines 412–463) already names the right table.
  - Fix shape (not yet applied — needs the 3 tables' actual freshness-column names verified before
    editing a gating script): teach `_fetch_max_freshness` to fall back to `count_table` (using
    `entry.get("freshness_column", "inserted_at")`) when both `freshness_table` and
    `dlt_schema_name` are absent, inside the same try/except so a wrong column still fails safe to
    `None` rather than crashing.
- 09/15/2026 — **Two more entries confirmed to share the identical bug shape**, both independently
  verified as landing real data despite reading `NEVER_LANDED`:
  - `neighborhood_stats` — 20,400 rows confirmed (GHA green, 08/24 + 08/02 runs)
  - `collier_official_records` — currently GHA green, real daily rows landing
- All three are exactly the "three ghost NEVER_LANDED entries" named in
  [Pipeline health](pipeline-health.md) — this page corrects the framing from "tables that never
  populated" to "a checker that can't see the table populated."

## Dark roots — `consuming_pack: none` (data lands, nothing reads it)

Confirmed across all 5 buckets, file:line cited in `ingest/cadence_registry.yaml`:

- `listing_week` (:~1036 region) — feeds the sell-odds hazard model, but that consumer isn't
  named as a `consuming_pack`
- `realtor_geo_trends` — full geo-block medians landing monthly, zero consumers
- `redfin_city_swfl` — every FL city's Redfin data landing monthly; only 3 desk cities are read
  anywhere
- `swfl_search_demand` — 275-keyword DataForSEO pull landing monthly (when not `402`-blocked),
  zero consumers
- `dbpr_re_licensees` (:1558) — by design: feeds a bare Postgres view (`public.new_re_agents`) for
  outreach, not a brain
- `cre_figures` (:1754) — by design: `workflow: none`, manual `bun scripts/build-cre-figures.mjs`
  build

Two more workflows aren't modeled with a `consuming_pack` field at all because they're registered
under `jobs:`, not `pipelines:`: `home-values-investor-monthly.yml` (a brain-rebuild trigger, not
a data writer) and `view-vintages-monthly.yml` (writes `data_lake.view_vintages`, sits in
`coverage_exempt:` pending a promote-to-`pipelines:` decision).

## Fleet hygiene — GitHub issues, auto-close, and a repo-name trap

- 09/15/2026 — **22 open `cron-failure`-labeled issues**, oldest #98 from 06/22/2026. The repo's
  canonical name is `ethanrickyjrjr-wq/SWFL-Data-Gulf` (renamed from `brain-platform`, which
  still resolves as a redirect for most `gh` commands) — but **`gh issue list --label` silently
  returns an empty array against the redirect name**, not an error. One agent hit this trap and
  reported "zero cron-failure issues ever" before the fix was known; the real number, queried
  against the canonical name, is 22 open. Use the canonical name for any label-filtered `gh`
  query going forward.
- 09/15/2026 — The auto-close mechanism is real, not vaporware: `log-cron-incident.yml`'s
  `maybe_auto_resolve` job runs `gh issue close` when that same workflow's *next* scheduled/push
  run succeeds. It only fires on a genuine next-success — a chronically broken workflow (billing,
  WAF, an offline self-hosted runner) never gets that success, so its issue sits open indefinitely.
  That's the whole 22-issue backlog: every one of them is a workflow that hasn't had a clean run
  since it broke.
- 09/15/2026 — `/api/health` (a signal target named in `wiki/pipeline-health.md`) is confirmed
  genuinely missing — no file, no reference anywhere in the repo.

## Per-bucket detail

Full per-workflow tables (what it does, registry entry, `data_lake.*` table, `consuming_pack`,
live run status, real red cause, data-we-have / data-we-could-have, documented Y/N+where) were
produced for all 111 workflows across 5 domain buckets — market/listings (31), macro/econ (12),
environmental (6), CRE/permits/parcels (19), deliverables+social+infra (43). The full tables are
long-form and live in this session's transcript; ping the desk for the raw per-workflow detail on
any specific pipeline not already summarized above. Two callouts worth a permanent home:

- **Real, near-zero-cost data-ceiling items** (already fetched, sitting unused, no new API cost):
  HURDAT2's wind-radii/RMW fields (parser discards 16 fields/observation); BLS QCEW's
  industry-sector detail (same API response, filtered at parse time); Lee & Associates' Naples/
  Collier PDFs (same URL pattern, confirmed HTTP 200, same extractor would work) plus a `cap_rate`
  value already parsed in memory but never written to a column; FDOT's 1,586-layer ArcGIS org
  (we use 1 layer); LeePA layer 21 Delinquent Tax Advertising (10,964 rows, a real seller-distress
  signal, fully field-confirmed, unpulled).
- **Vendor ceilings with nothing left to pull** (confirmed, not assumed): `bls_laus`,
  `fl_dor_sales_tax`, `franchise_outcomes` (453 rows is the full FOIA total), `mhs_permits_swfl`
  (all 6 vendor columns extracted), `ingest-market-aggregates-histogram.yml` ("full extraction
  confirmed").

## Open questions

- The `check_freshness.py` NEVER_LANDED fix — who applies it, and does it need the 3 tables'
  freshness-column names verified first (this census didn't verify them, to avoid guessing on a
  gating script).
- `bls_qcew`'s quarter-detection bug, `usgs-monthly`'s missing retry/backoff, and
  `redfin-monthly`'s DuckDB column break all need someone to actually fix them — named here,
  not fixed here (out of this pass's scope).
- Who owns un-blocking `home-values-investor-monthly.yml`'s branch-protection push failure —
  Ricky (ruleset owner) needs to either exempt the bot or grant it a token that can push.

## Related

- [Pipeline health](pipeline-health.md) — the dated rebuild order this census cross-checks against
- [Fedora and public exposure](fedora-and-exposure.md) — the Spectre/Fedora box, private-repo
  pricing, `brains/` exposure options
- `docs/standards/data-roots.md`, `docs/standards/repo-inventory-audit.md` — the other 2 catalogs
  this census reconciles against
