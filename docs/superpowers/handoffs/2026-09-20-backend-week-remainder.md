# Backend-week plan — what is left after the 09/20/2026 fan-out

Parent plan: `docs/superpowers/plans/2026-09-15-master-brain-backend-week.md`.
State after 09/20: 14 of 15 tasks landed (A0's question was answered by the 09/15 chain run).
Only E1 is unstarted. Everything below is sectioned by who can do it.

## 1. Needs Ricky — nothing else moves these

- **Fedora runner: DONE by a session 09/20, never was an operator task.** `fedora-swfl-local` is
  online (`gh api .../actions/runners`), systemd --user unit `gha-runner.service`, runner v2.337.0,
  ingest venv `~/swfl-runner-venv` (py 3.12, crawl4ai-doctor green, Chromium launches natively).
  Commit 86770e2b ports all 5 `swfl-local` workflows to it and fixes runner-smoke. What is left is
  only sequencing, all doable by a session once 86770e2b is on main: re-run `runner-smoke.yml`,
  dispatch each ported workflow with `dry_run=true`, then
  `gh variable set SWFL_LOCAL_RUNNER_READY --body true --repo ethanrickyjrjr-wq/SWFL-Data-Gulf`
  (`false` reverts). Proven ON THE BOX 09/20 (pipelines' own --dry-run over ssh, residential IP): dbpr_sirs
  would upsert 1389 rows; crexi Estero 29 raw listings; collier records 871 rows for 09/17-09/19.
  Venv rebuilds need `python -m patchright install chromium` (runbook 2c). Smoke note: crexi answers 403 to any bare curl - that is Cloudflare, not a fail.
- **One click worth his eye:** the repo is public and fork-PR approval is `first_time_contributors`.
  With a runner on his home box, `all_external_contributors` is the safe setting:
  `gh api -X PUT repos/ethanrickyjrjr-wq/SWFL-Data-Gulf/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors`
- **Ruleset:** remove the weekly-dep-scan routine's identity from the `main` bypass list. The
  09/20 hook change is a stopgap; a routine can still push through the GitHub tools or `gh api`.
- **Routine prompt:** append to weekly-dep-scan — "Never push. Never set OPERATOR_APPROVED_PUSH —
  that token is the human operator's word and the push hook will refuse it in this session. If a
  push is blocked, do not retry, rephrase, or push by any other route (gh api, GitHub MCP tools,
  PowerShell, a script). Commit locally, report the bump list in a GitHub issue titled
  `weekly-dep-scan <date>`, and stop."

## 2. Known Fedora risks — RESOLVED by 86770e2b (kept for the record)

Setup steps now run only on github-hosted runners; self-hosted uses `~/swfl-runner-venv`.

All three gated workflows use `actions/setup-python` (downloads Ubuntu-targeted CPython; Fedora is
not a supported distro) and bare `pip install` with no venv on a persistent box. The Collier
records workflow also runs `crawl4ai-setup`, whose `playwright install --with-deps` calls
`apt-get` — the most likely first failure. `leepa-parcels-annual` pins Python 3.13, the other two
3.12. Expect to pre-install Python + browser libs via `dnf` and gate or replace those steps.
First real proof after the flip: dispatch ONE of the three with `dry_run=true`.

## 3. One bounded session each — DONE 09/20 session 2 except where named

- **`dry_run_flag_ignored_three_pipelines`** — FIXED 4ef6c071. It was FOUR (scope scan: 41 modules
  receive `--dry-run`, 4 never read it; `hurdat2_fl` was missed). zori + hurdat2 real dry-runs exit 0,
  temp target, no inventory row. Check stays open until a GHA `dry_run=true` dispatch prints the
  "--dry-run, writing to a temp dir" line (needs the push).
- **hurdat2 was about to break in production** — found by that dry-run. NHC's 09/12/2026 file
  `hurdat2-1851-2025-091226.txt` has a missing lat/lon comma (line 30687, repaired losslessly) and a
  hemisphere-less latitude `38.83` (line 33698, skipped loudly; more than 5 bad lines still raises).
- **`approval_token_self_set_paid_hooks`** — FIXED 86cded9a. Four sites, not three (2 hooks +
  `dispatch-rebuild.mjs` + `paid-run.mjs`), one root `.claude/hooks/lib/unattended.mjs`, push hook
  reads it too. A 5th site (the product spend dial) is deliberately untouched →
  check `apify_spend_switch_honors_token_unattended`.
- **Live proof B1/B2/B3** — all confirmed; the real usgs-monthly run 35490402310 completed success.
- **Sibling Redfin `_KEEP` guard** — FIXED 6c077dae. `ingest.lib.guards.assert_header_has` at the
  header parse in redfin_lee / redfin_collier / redfin_city_swfl. Checked against the LIVE county +
  city headers 09/20: all required columns present, so nothing breaks today.
- **Ingest suite** — FIXED 12dea963: it could not even collect; now 1662 passed / 2 failed.
  The real find: the suite loaded PRODUCTION keys at collection time (conftest set its guard in a
  fixture; collection imports come first) and the "no key" tests made real billed SteadyAPI calls
  on every full local run. Guard now sets at conftest import; 4 import-time dotenv sites moved to
  the guarded loader (81 production vars before, 0 after).
  **Still red, needs his word (recursive delete is operator-gated):**
  `ingest/tests/pipelines/census_vip/` and `ingest/tests/pipelines/fred_g17/` (3 files each) —
  orphan tests of pipelines retired in cb803b1c.
- **`bun run lint`** — FIXED 80c018cf, exits 0 (ignored `**/.venv/**` and gitignored `__scratch__/`).

## 4. Ask-first — do not start without his word

- **`redfin_dom_yoy_unit_days_not_pct`** (check open): days-on-market YoY is a DAY delta;
  `refinery/sources/housing-source.mts:97` divides it by 100 and `refinery/packs/housing-swfl.mts:501-504`
  re-multiplies and serves it as a percent (the −2796% on the 07/18 site audit). Vendor relabel
  09/2026 confirms the unit. Fix = rename to `median_dom_yoy_days` across both files + vocab in one
  change. It alters a served number's name and unit → pack-output ask-first list.
- **`data_lake.bls_qcew` has three permanently-NULL columns** (`area_title`, `own_title`,
  `industry_title`) — the live CSV never carried them. Drop or derive; schema change.
- **E1 — Lee permits from Lee's ArcGIS org.** Plan gate: "not started until A0–A3 and B1–B5 have
  pasted green runs." B is now green or dispatched; A's rebuild leg is still red on the parked
  unattended-model leg. Permits ingest does not depend on the rebuild to LAND, only to be SERVED,
  so the gate is his to waive. When started: `.claude/playbooks/ingest-pipeline.md` verbatim,
  `node scripts/new-build.mjs lee-permits-arcgis "Lee permits from Lee ArcGIS (replaces Accela scrape)"`
  first, `?returnCountOnly=true` for full scope, `--source arcgis` beside the Accela path, diff a
  week of row counts, then flip. One root: `data_lake.lee_building_permits`.
