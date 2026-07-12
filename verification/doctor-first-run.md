# doctor — first live read-only run (Task 9 acceptance)

**Run:** 2026-07-12T02:38Z, worktree `bp-dcd` (branch `wt/dcd`), local creds (`.dlt/secrets.toml`).
**Command:** `python -m ingest.scripts.doctor --dry-run` · **exit 0** · **62 seconds wall clock**
(spec §10 requires < 2 min — passes with ~50% headroom; `--json` run archived alongside as
`verification/doctor-first-run.json`, full report as `verification/doctor-first-run-report.md`).

## Headline

**72 datasets: 16 red · 26 yellow · 30 green.**
Coverage line: workflow joined **71/72** (the Spine's `workflow:` field, live) · content contracts
**7/72** · **gh: ok** (bulk `gh run list --limit 500` + `gh workflow list --all` + targeted
backfill) · **manifest: ok** (`.github/_watch-manifest.json`, 103 workflows).

## What the four-signal join surfaced on its first breath

- Every red line carries a prescription (or a failing content test) — the §9 invariant held on
  live data, not just fixtures.
- `NEVER_RAN` reds (e.g. `bls_oews_swfl` / `bls_oews_swfl_tier1` via `bls-oews-annual.yml`) are
  backfill-CONFIRMED never-runs, not window artifacts — the targeted `gh run list --workflow`
  pass distinguishes them from `NO_RUNS_IN_WINDOW` yellows.
- The DISABLED-with-cron class (4 zombie workflows from the watch manifest) renders as
  UNKNOWN + evidence naming the file — no invented diagnosis (enum decision rides check
  `doctor_rx_workflow_disabled_member`).
- Content signal is LIVE: `run_content_contracts` folded in (CONTENT_ENGINE =
  value_tests+content_contracts) — Phase 1's price-floor FAIL (21 rows) reds its dataset line.

## Advisory posture

Doctor exits 0 (no `--fail-on`). The 16 reds are the triage list, not a gate — the gating flip
(`--fail-on red`) is Task 12, ASK-FIRST, after the reds are worked down or ledger-tracked.

The parent check `data_contracts_doctor_live_verify` stays OPEN — it closes on Phase 1–3
acceptance green LIVE + this archived run per spec §9 (D-6), at the operator checkpoint.
