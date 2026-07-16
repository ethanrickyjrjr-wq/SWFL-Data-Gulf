# HANDOFF — factuality CI gate: BUILT, calibrated 14/14, awaiting push

**Written 07/16/2026 after full plan execution.** Everything below is verifiable in `git log`
and the run outputs quoted verbatim. Spec:
`docs/superpowers/specs/2026-07-16-factuality-ci-gate-design.md` · Plan:
`docs/superpowers/plans/2026-07-16-factuality-ci-gate.md` · Lineage: the 07/16 promptfoo
brainstorm handoff (`docs/handoff/2026-07-16-promptfoo-factuality-gate-handoff.md`).

## What shipped (8 local commits, NOT pushed)

- `9f62dcca` spec · `dd6a52ba` plan
- `8e2dc0b8` — `"factuality_ci"` CallType on the spend seam (`refinery/agents/anthropic.mts`);
  the gate has its own labeled line under the existing daily/monthly caps.
- `14def3f1` — promptfoo **0.121.19** pinned exact, devDependency (+lockfile, Gate 1). It is
  OpenAI-owned (banner verified 07/16/2026, MIT license unchanged) — **re-verify license/feature
  gating before ANY version bump.**
- `0ee9c623` — `lib/deliverable/factuality-grader.ts`: promptfoo `ApiProvider` whose `callApi()`
  routes through `getAnthropic("factuality_ci")` with `SYNTHESIS_MODEL` (never a hard-coded model
  id). Errors (incl. `SpendCapError`) propagate — a broken judge is an ERROR, never a verdict.
  Mocked unit test alongside.
- `9365ff86` — `lib/deliverable/factuality-fixtures.ts`: 14 fixtures across the 5 spec classes
  (a accurate-numeric / b right-number-wrong-direction / c qualitative-contradiction / d
  boring-accurate / e accurate-superset) + always-on structural test (unique ids, class coverage,
  class→verdict invariant).
- `55d4c35c` — `lib/deliverable/factuality-gate.test.ts`: live gate, self-skips unless
  `FACTUALITY_GATE=1` **and** a real key is present; plain `bun test` stays $0.
- `fa69620e` — `.github/workflows/factuality-gate.yml`: warn-first (`continue-on-error: true`),
  path-filtered (`lib/deliverable/**`, the seam file, itself), push-to-main + manual dispatch.
  Supabase secrets in the job env are LOAD-BEARING — without them `logApiUsage()` silently
  no-ops and grading spend goes invisible.

## Calibration evidence (first live run, 07/16/2026)

- **14/14 correct verdicts** in 51.26s: all 6 must-fail fixtures (3 reversed-direction, 3
  qualitative-contradiction) failed as required; all 8 must-pass fixtures passed — zero false
  positives, including the judge-sensitive `e-derived-percentage` (arithmetic beyond the
  reference) and all three class-d false-positive-alarm cases.
- **Spend fully visible:** 14 `api_usage_log` rows, `call_type=factuality_ci`,
  model `claude-sonnet-4-6`, **total $0.0418** for the complete run. The "no invisible spender"
  loop is closed end-to-end.
- **Seeded-red proof:** flipping the founding fixture (`b-reversed-direction-median-price`) to
  `expectPass: true` produced exactly 1 fail / 13 pass, then was reverted (tree clean). The gate
  demonstrably catches; it doesn't just run.
- **Operational gotcha, learned live:** `bun test` (NODE_ENV=test) does NOT load `.env.local` —
  that's why the whole suite is offline/mocked by design. A deliberate local live run must inline
  `ANTHROPIC_API_KEY` / `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` into the shell alongside
  `FACTUALITY_GATE=1`. Documented in the test's skip message.

## Immediate next step (operator)

Push the 8 commits (`node scripts/safe-push.mjs` — check for foreign commits first). The push
itself touches `lib/deliverable/**`, so the first prod GHA gate run fires on it. Then:
- Verify the `factuality-gate` run is green in Actions and a fresh `factuality_ci` spend row
  exists → close **`factuality_ci_gate_live_verify`**.

## Follow-ups (all tracked — nothing lives only in this doc)

1. **`factuality_gate_blocking_flip`** (check, opened 07/16) — after a validated clean stretch
   of warn-first runs, flip `continue-on-error` to `false` in `factuality-gate.yml` (one line).
   Record the evidence run ids on the check. Same report-only→BLOCKING pattern as the
   `assert_landed` row gate.
2. **`factuality_gate_brain_markdown_phase2`** (check, opened 07/16) — the identical claim-truth
   gap exists in brain `OUTPUT.conclusion` / master synthesis prose (`refinery/validate/*.mts` is
   all regex lints). Deferred by operator call: deliverable-narrative only this round.
   When picked up, first re-evaluate whether promptfoo fits that surface.
3. **Live/async phase — the closed loop** (deliberately NOT a check yet; operator option-4 call
   07/16: "CI fixtures now, discuss live/async later"). The payoff design: feed the judge's
   verdict-with-reason into `gateNarrative`'s existing retry-with-violations-named regeneration
   (`lib/deliverable/build.ts`) so a reversed-direction sentence gets corrected before a user
   sees it. The calibration evidence above (14/14, $0.0418/run) is the input to that
   conversation. If scope goes high-volume/every-send, re-litigate promptfoo-vs-HHEM —
   **`research/hhem_narrative_consistency_scorer`** stays open as the zero-marginal-cost
   candidate for exactly that.
4. **The improvement loop is a standing reflex, not a phase** (spec D4, header comment in
   `factuality-fixtures.ts`): every real bad narrative caught anywhere gets distilled into a
   fail-fixture in the same session (facts → `reference`, bad sentence → `completion`,
   origin in `note`); every operator-signed good narrative can be frozen as a pass-fixture.
   One array entry each — the fixture file is the product's permanent memory of both.
5. **promptfoo governance** — OpenAI-owned; before any version bump re-verify the MIT license and
   that `factuality`/`runAssertion` remain un-gated. Pinned at 0.121.19.

## Spec deviations (both deliberate, both documented in-code)

- Spec success-criteria said "a real PR"; this repo pushes to main and never opens PRs — the
  workflow triggers on push-with-path-filter + `workflow_dispatch` instead.
- `FactualityFixture` gained a `cls` field beyond the spec interface so class coverage is
  machine-checkable by the structural test.
