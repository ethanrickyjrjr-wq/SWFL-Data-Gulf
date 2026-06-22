# 02 — daily-rebuild: echo the master HOLD reason before exit (so the cause gets recorded)

**Model: Sonnet.** A few lines in one TS file. **Priority: P0.**

## The defect (verified)
When master deterministic-HOLDs, `daily-rebuild` exits 1 (correct, loud) but the cron-incident logger only
sees a 30-line tail + "exit code 1" → classifies `UNKNOWN` → ledger writes `_auto-captured; pending
triage_` → next green run auto-flips to RESOLVED. **The real reason exists in `_build-report.json`
(`failureClass: deterministic`, `reason: <brain>.md not found`) but is never surfaced to the log tail.**

## Where (verified, exact)
`refinery/cli.mts`: `:459` `const exitCode = deriveExitCode(...)`; `:470` writes
`brains/_build-report.json`; `:476` `if (exitCode !== 0) process.exit(exitCode)`. Echo goes **between 470
and 476**, while the report object is in hand. (TS — NOT `daily-rebuild.yml`, so this never collides with
build 09's gate-install edit.)

> **CORRECTION (audit re-verify 2026-06-22) — the field-sourcing in the original Steps was WRONG.**
> The master-HOLD outcome pushed in `cli.mts` (the `computeMasterDecision === "held"` branch) is
> `{ packId:"master", status:"missing", reason:"HOLD: critical upstream eligibility expired" }` with
> **NO `failureClass`**, and there is **no `master` variable in scope** at the echo site. The real
> deterministic cause (`failureClass:"deterministic"`, `reason:"brains/<id>.md not found"`) lives on
> whichever outcome `classifyFailure` marked — NOT a top-level `master` field. A literal
> `master.failureClass` would print `unknown` in the exact HOLD case this build targets, so build 04's
> `DETERMINISTIC_HOLD` rule (keyed on `failureClass=deterministic`) would never match — silently
> defeating Contract A. The corrected steps below source from the deterministic outcome.

## Steps
1. **Probe first.** Read `refinery/cli.mts` ~440–490 and the outcome shape in
   `refinery/lib/resilient-build.mts` (`BrainBuildOutcome`: `packId` / `status` / `failureClass?` /
   `reason?`). Confirm the master-HELD push carries no `failureClass`.
2. When `exitCode !== 0`, before `process.exit`, `console.error` a single Contract-A line
   (`CRON-DIAG failureClass=<x> reason=<y>`), sourcing `<x>`/`<y>` from
   `outcomes.find(o => o.failureClass === "deterministic")` if present, else the master outcome
   (`outcomes.find(o => o.packId === "master")`), treating a `missing` master as `deterministic`.
   `console.error` so `gh run view --log-failed` captures it in the tail.
3. Keep it dependency-free, collapse whitespace in `reason` (it's a raw error message), and guard
   missing fields (echo `unknown` rather than throw).

> **IMPLEMENTED 2026-06-22.** Landed as a pure, unit-tested helper `formatCronDiag(outcomes)` in
> `refinery/lib/resilient-build.mts` (next to `deriveExitCode`); `cli.mts` calls
> `console.error(formatCronDiag(outcomes))` inside the `if (exitCode !== 0)` block. Tests:
> `resilient-build.test.mts` (HOLD→deterministic · leaf `.md not found` · newline-collapse ·
> honest-unknown) + `classify-cron-failure.test.mjs` (the emitted line classifies DETERMINISTIC_HOLD).

## Done when
- A forced HOLD (or a dry-run that simulates one) prints the `CRON-DIAG …` line to the run log, and a
  30-line failed-log tail now contains the real reason. Pairs with build 04's classifier rule (Contract A).

## Best-practice fold-in
SRE postmortem culture (see References) distinguishes *symptom* ("exit 1") from *cause* ("brain X not found").
This echo writes the cause into the log tail — the raw material build 28 (cron-ledger postmortem-record restructure,
REPORT HEADLINE #2) consumes to populate structured `failureClass`/`reason` fields in the incident record.

## Risk
Low. Pure observability; cannot change exit codes or the build path (`deriveExitCode` is untouched).

## References (added 2026-06-22 — crawl4ai-live + best-practices fold-in)
**crawl4ai-live (tool-usage reference, docs/audit/2026-06-21-crawl4ai-live/):**
- (n/a — not a crawl4ai build)
**best-practices-research (how to build/operate what we build, docs/audit/2026-06-21-best-practices-research/):**
- `docs/audit/2026-06-21-best-practices-research/round1/rootcause-sre-monitoring.md` (REPORT HEADLINE) — "symptom != cause"; a root cause = a defect whose repair instills confidence it won't recur. Echoing the real failureClass/reason IS recording the cause.
- `docs/audit/2026-06-21-best-practices-research/round1/rootcause-sre-postmortem-culture.md` — the postmortem record this echo feeds
- `docs/audit/2026-06-21-best-practices-research/round3/q-sre-postmortem-example.md` — concrete template/fields
**Verified:** V-11 — echo site is refinery/cli.mts, and the CRON-DIAG line contract (Phase-1 _CONTRACT A) feeds build 04 — folded into Steps above where applicable.
