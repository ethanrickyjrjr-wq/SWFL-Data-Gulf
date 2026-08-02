# databrief-autopilot — one-command build + gated program send (08/02/2026)

**Decree:** "FUCKING MAKE THE PLAYBOOK AND FUCKING SHOW ME IT CAN FUCKING DO IT. PROVE ME
WRONG. YOU HAVE AN EMAIL THAT IS THE SCORECARD SO DON'T SEND ME ANYTHING UNTIL IT IS AS
GOOD OR FUCKING BETTER. GIVE THE FUCKING PROGRAM ACCESS TO SENDING FUCKING EMAILS WHEN IT
IS TOLD TO." Plus: "NO NUMBERS ON THE CHART, WHICH SUCKS."

## What shipped (all proven in-session, 08/02/2026)

1. **Numbers on charts** — `components/charts/vendor/bklit/email-svg.tsx` gained opt-in
   `valueLabels: "endpoints" | "all"` + per-point `display`; exported geometry helpers
   (`lineEndpoints`, `barRects`, `axisLabel`, `defaultValueDisplay`) with 9 failure-mode
   tests (`email-svg-labels.test.ts`, 9 pass). The bridge
   (`scripts/email/databrief-chart.mts`) passes the option through and asserts label
   presence loud (exit 1 on geometry drift). Defaults off — existing renders byte-identical.
   Context: the hand-built `chart-image.ts` builders always drew numbers; the bklit upgrade
   dropped them — §4.17 capability-didn't-travel, one layer down.
2. **Executable playbook** — databrief `RUNBOOK.md`: the two commands, the 6-step chain,
   the send contract, the any-data generalization contract (pipeline + brain = new domain,
   everything downstream already wired), failure modes → typed guards.
3. **Program-owned send** — databrief `tools/send_brief.py` now runs `lint_no_invention` +
   `tools/scorecard.py` (NEW: 11 deterministic checks over the rendered artifact, each named
   for a real prior defect) before any network call; refusal has NO bypass flag. `--to`
   required; key from env; subject carries the edition date.
4. **One-command build** — databrief `tools/build_brief.py`: pulls → lake → brains → labeled
   charts (bridge) → render → lints → scorecard, stops UNSENT. Proven green end-to-end with
   FEMA in live outage (coverage gate held prior rows loudly).

## Failure modes → guards (named per RULE 3.5)

- bklit geometry drift mislabels a point → helpers return null, labels skipped (test);
  showcase bridge asserts presence, exit 1 (gate).
- Below-bar artifact sent → send-side gates, no bypass (gate; proven red on a doctored
  dateless subject — SEND REFUSED, network untouched).
- Scorecard false alarms erode trust → calibrated on the real artifact day 1: two probe
  bugs found and fixed (logo probe matched filename not alt; footer hex from memory), one
  REAL defect caught ("pipeline" system noun in footer copy — fixed).
- bun unresolvable from Python (Windows .cmd shim) → `bun_cmd()` resolves via `which` +
  `cmd /c`, fails loud (hit live on first proof run).
- Regression later → `databrief_autopilot_live_verify` check open; the live verify is a
  told-to send through the program once the operator gives the word.

## Open

- `databrief_autopilot_live_verify` — a real told-to send via `send_brief.py` (blocked on
  operator's word by his own no-send decree).
- brain-platform's OWN Email Lab builder (`authorDoc` lane) is a SEPARATE surface from this
  databrief program — folding the scorecard-gate pattern into that lane is future work, not
  claimed here.
