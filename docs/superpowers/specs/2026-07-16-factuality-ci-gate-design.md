# Promptfoo factuality CI gate (deliverable narratives)

> **Recommended model:** ⚡ Sonnet — 7 tasks


**Date:** 2026-07-16 · **Status:** design approved in-session (operator, 07/16/2026), pending spec
sign-off · **Build slug:** `factuality-ci-gate` (check: `factuality_ci_gate_live_verify`)

Lineage: HuggingFace/launch-tooling research
(`docs/research/2026-07-16-huggingface-and-launch-tooling-deep-dive.md`) → mid-brainstorm handoff
(`docs/handoff/2026-07-16-promptfoo-factuality-gate-handoff.md`) → this design. All promptfoo
vendor facts below were verified live via crawl4ai on 07/16/2026 (RULE 0.4), not from memory.

## Problem

The existing narrative lint (`lib/deliverable/narrative-lint.ts`, `lintDeliverableNarrative()`)
enforces exact-number anchoring: every numeral in LLM-generated deliverable prose must match a
number in the frozen snapshot facts. It structurally cannot catch:

1. **Direction-reversal on a real number** — the anchor set holds $410,000 as this period's median
   (prior period higher), and the narrative says "prices rose to $410,000." The digit passes; the
   claim is a lie.
2. **Unanchored qualitative claims contradicted by the facts** — "demand is surging" over
   falling-sales facts. No numeral, so no anchor check fires at all.

Both are "making up numbers" in the sense the operator means it, and no current lint (deliverable
side or `refinery/validate/*.mts` side) operates on claim-truth rather than numeral-presence.

## Goal

A CI-only, fixture-based factuality gate that judges narrative sentences against the facts they
were generated from, catching both failure classes above — with every grading dollar routed
through the one enforced Anthropic spend seam, zero cost added to local `bun test` runs, and zero
touch on the live build path.

## Operator decisions (all confirmed 07/16/2026 — do not re-litigate silently)

1. **Tool: promptfoo** (npm, MIT, verified; now OpenAI-owned — banner live on every doc page).
   Over HHEM (Python decoupling; stays the candidate for any future high-volume/live phase — check
   `research/hhem_narrative_consistency_scorer` stays open) and over hand-rolling the rubric.
2. **Placement: CI fixtures only.** No live `buildDeliverableNarrative` integration, no post-send
   sampler this round. That is a deliberately separate future conversation, to be had with fixture
   evidence in hand.
3. **Spend routing: hybrid via our seam.** Use promptfoo's built-in `factuality` assertion (their
   maintained rubric + A–E parsing) but pass a custom `ApiProvider` whose `callApi()` routes
   through `refinery/agents/anthropic.mts`. Verified legal: `options.provider` /
   per-assertion `provider` accept `string | ProviderOptions | ApiProvider | Record<string, any>`
   (promptfoo config reference, fetched 07/16/2026), and `assertions.runAssertion()` is a public
   Node export that grades a pre-generated output directly — no echo provider, no full
   `evaluate()` ceremony needed.
4. **Surface: deliverable narrative only.** Brain markdown (`OUTPUT.conclusion` / master synthesis
   prose) is deferred — check `factuality_gate_brain_markdown_phase2` opened same session
   (RULE 2.4); when picked up, first re-evaluate whether promptfoo fits that surface.

## Design

### D1. Files

Three new files in `lib/deliverable/` (the existing lint-module convention), plus one union
member, one devDependency, one GHA job:

- **`lib/deliverable/factuality-grader.ts`** — a ~25-line promptfoo `ApiProvider`:
  `id()` returns a stable label; `callApi(prompt)` sends the rubric prompt promptfoo hands it to
  `getAnthropic("factuality_ci").messages.create({ model: SYNTHESIS_MODEL, ... })` and returns
  `{ output, tokenUsage }`. Imports the seam exactly the way `lib/deliverable/build.ts` already
  does.
- **`refinery/agents/anthropic.mts`** — add `"factuality_ci"` to the `CallType` union with the
  usual dated comment. The gate gets its own labeled spend line under the existing daily/monthly
  caps; no other seam change.
- **`lib/deliverable/factuality-fixtures.ts`** — the golden set:

  ```ts
  interface FactualityFixture {
    id: string;          // stable slug, e.g. "reversed-direction-median-price"
    reference: string;   // the facts, stated plainly, as derived from a frozen snapshot
    completion: string;  // the narrative sentence under judgment
    expectPass: boolean;
    note: string;        // why this case exists (real-world origin if distilled from one)
  }
  ```

- **`lib/deliverable/factuality-gate.test.ts`** — loops fixtures through
  `assertions.runAssertion({ assertion: { type: "factuality", value: fixture.reference,
  provider: seamGrader }, providerResponse: { output: fixture.completion }, test: {...} })` and
  asserts `result.pass === fixture.expectPass`.
- **`bun add -D promptfoo`**, version pinned. Governance note: promptfoo is OpenAI-owned as of
  this writing (MIT license file unchanged, verified 07/16/2026) — re-verify license and feature
  gating before ANY version bump. Lockfile ships in the same push (pre-push Gate 1).

### D2. Grading model

The adapter uses the seam's exported `SYNTHESIS_MODEL` constant (currently `claude-sonnet-4-6`) —
one authority for model ids, already priced in the seam's cost table. Rationale: the target
failure mode (subtle direction-reversal) is judge-quality-sensitive, and volume is ~15 short calls
firing only when narrative surfaces change — Haiku's savings are pennies against a mushier judge.
`TRIAGE_MODEL` remains a one-constant swap if evidence shows Sonnet is overkill.

### D3. Fixture set — ~12–16 cases, five classes

- (a) accurate numeric sentence → **pass**
- (b) right number, reversed direction → **fail** (the founding case; promptfoo category D)
- (c) qualitative claim, no numeral, contradicted by reference facts → **fail**
- (d) boring accurate qualitative sentence → **pass**
- (e) narrative adding accurate detail beyond the reference → **pass** (category B — guards
  against an over-strict judge)

Classes (d)/(e) are the false-positive alarm: if they start failing, the judge is noise, not
signal. Category thresholds stay at promptfoo defaults (A/B/C/E pass, D fails) unless calibration
evidence says otherwise.

### D4. The improvement loop (how mistakes and good answers make the system better)

- **Mistake → fixture, as a standing reflex.** Any real bad narrative caught anywhere (preview,
  test send, screenshot) gets distilled into a fixture in the same session it's found: frozen
  facts → `reference`, the bad sentence → `completion`, `expectPass: false`, origin in `note`.
  One array entry. The fixture file is the product's permanent memory of every factuality mistake
  it has ever made; CI goes red before that class of mistake can ship again.
- **Good answer → pass-fixture.** A narrative the operator would sign gets frozen as a
  pass-fixture, so future prompt/template "improvements" cannot silently degrade proven-good
  output. Good answers become the floor.
- **Judge calibration doubles as decision evidence.** Fixture results ARE the evidence base for
  the deferred live/async decision: clean on (d)/(e) + reliable on (b)/(c) is the case for a
  post-send sampler or live gate; noisy means we learned it offline for pennies.
- **Deferred (operator decision #2):** the closed loop — feeding the judge's verdict-with-reason
  into `gateNarrative`'s existing retry-with-violations-named regeneration so the system corrects
  itself before a user sees the sentence. That is the live-path phase, revisited with the
  calibration evidence above.

### D5. CI wiring — no silent local spend

`factuality-gate.test.ts` self-skips unless `FACTUALITY_GATE=1` (same shape as the CI-only vitest
view-parity tests), so routine local `bun test` runs cost $0 and make zero network calls. The flag
lives only in the GHA job's `env:` — never in any checked-in `.env` (Bun loads `.env` over
shell-set vars, so a stray committed entry would silently arm the gate for every local run). The
GHA job sets the flag and runs the gate only when any of these paths change:
`lib/deliverable/narrative-lint.ts`, `lib/deliverable/build.ts`, deliverable templates, or the
fixture/grader/gate files themselves. The gate does NOT join the Gate 1–5 pre-push hook family.

### D6. Warn-first, then flip to blocking

The GHA job starts report-only (`continue-on-error: true`) while catch rate and false-positive
rate shake out — the same report-only → BLOCKING pattern the `assert_landed` row-gate is mid-flight
on. At ship time, open a check to flip it to blocking after a validated clean stretch, so the soft
launch cannot silently become permanent.

### D7. Error handling

- Infra failure (rate limit, network, `SpendCapError`) surfaces as a distinct loud error — never
  as a fixture pass OR fail. A broken judge must not look like a factuality verdict in either
  direction.
- Under `agentsAreMocked()`, the gate skips with an explicit message.
- An unparseable judge response surfaces through promptfoo's own `GradingResult.error`.

## Out of scope this round (each with a paper trail)

- Live build path / post-send sampler — operator decision #2; revisit with D4 evidence.
- Brain-markdown prose — check `factuality_gate_brain_markdown_phase2`.
- HHEM — check `research/hhem_narrative_consistency_scorer` stays open as the high-volume
  candidate.
- Gate 5 / pre-push hook integration — excluded until (at earliest) the D6 blocking flip.

## Success criteria (`factuality_ci_gate_live_verify`)

The check closes only on live proof: the GHA job runs on a real PR touching a trigger path, all
pass-fixtures pass, all fail-fixtures fail, and spend for the run appears in the seam's usage log
under `factuality_ci`. A seeded known-bad fixture flipped to `expectPass: true` must turn the job
red (proving the gate can actually catch, not just run).

## Notes for the implementation plan

- Confirm promptfoo's exact `ApiProvider`/`ProviderResponse` interface against the installed,
  pinned version at build time (the adapter round-trip is proven by the first fixture run).
- `runAssertion`'s `test`/`prompt` params: the factuality rubric interpolates an original
  question/prompt for context — pass a short generic instruction (e.g. "Summarize the market
  facts") or the fixture's own framing; settle in the plan.
- promptfoo warns Node 20 support ends 07/30/2026 — we run under Bun; note only.
- Close `research/promptfoo_factuality_ci_gate` when this ships (superseded by this build's
  checks).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 4, Task 4, Task 4, Task 4, Task 4, Task 4, Task 4 |  |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
