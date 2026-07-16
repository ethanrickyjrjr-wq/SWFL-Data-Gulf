# HANDOFF — promptfoo factuality gate for the deliverable-narrative pipeline

**Written 07/16/2026, for Fable 5.** This is a mid-brainstorm handoff — the design is NOT finished
and NOT approved. Two decisions are locked (operator-confirmed), one was interrupted mid-question,
and several more haven't been asked yet. Nothing has been built. No code has changed. This doc is
meant to be self-contained — you shouldn't need the prior conversation to pick this up.

We're in the `superpowers:brainstorming` skill flow (per project rule RULE 3.5, no exceptions
without the operator saying "Change Storming"). The hard gate on that skill: **no code, no
scaffolding, no implementation action until a design is presented and the operator approves it.**
Whatever you land on with the operator, the next and ONLY next step is writing the design to
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, a self-review pass, operator sign-off on the
spec file, then handing off to `superpowers:writing-plans` — never straight to code.

---

## 0. How we got here (lineage, so nothing looks arbitrary)

1. Operator: "huggingface seems to have tons of data and resources we can use... deep deep dive
   with crawl4ai to find answers to data problems and solutions... make a file... look into better
   ways of getting this project off the ground with Automated help, marketing ideas and tools that
   make us better with building and AI doing what it is supposed to and not making up numbers."
2. Ran a live crawl4ai research pass (project RULE 0.4 — vendor/tool facts must be verified
   in-session, never from memory). Full writeup:
   `docs/research/2026-07-16-huggingface-and-launch-tooling-deep-dive.md`. Headline verdicts:
   - HuggingFace Hub is **not usable as a SWFL data source** — every promising dataset across
     real-estate/census/parcel/geospatial searches was a toy, a synthetic set, or a worse-provenance
     mirror of a source we already hold directly. Closed, don't re-open.
   - The real find was **anti-hallucination / factuality-scoring tooling** — directly relevant
     because this product's single most protected invariant is "never invent a number" (four-lane
     sourcing, `gateNarrative`, the whole `verification/answer-proofs.jsonl` machinery). Two
     candidates surfaced: **Vectara HHEM-2.1-Open** and **promptfoo**. Also touched: n8n (ops
     alerting — unrelated to this thread, parked separately) and a programmatic-SEO note (also
     unrelated, feeds an existing marketing check).
3. Opened 3 checks so none of this evaporates silently (project RULE 2.4): `research/
   promptfoo_factuality_ci_gate`, `research/hhem_narrative_consistency_scorer`, `research/
   n8n_ops_alerting_automation`. None piloted yet.
4. Operator, next turn: **"which one we going with? bring it in"** — pointing at the two pasted
   bullets (HHEM vs promptfoo) and asking for a pick + actual implementation, not just more
   research.
5. I picked **promptfoo** and said so plainly: HHEM would drag in a whole decoupled Python job
   (venv, scheduled runner, a table to write scores into) for a model that loses to GPT-4 on one of
   its three own reported benchmarks. promptfoo runs `npx`/npm-native inside the same Bun/CI surface
   `bun test` already lives in. **This pick has NOT been separately re-confirmed by the operator in
   so many words** — they said "bring it in" right after I named promptfoo, which reads as
   agreement, but flag it back to them if anything below makes HHEM (or a third option) look better
   on closer inspection. Nothing here is so locked that it can't be revisited.
6. Per RULE 3.5 (brainstorm before any non-trivial build) I invoked `superpowers:brainstorming`.
   Below is everything gathered inside that flow so far.

---

## 1. What exists today (probed live, RULE 0.5 — this is the actual code, not a description of it)

### 1.1 The live gate this would extend: `lib/deliverable/build.ts`

`gateNarrative()` (line 444) runs on every LLM-generated deliverable narrative before it ships:

```ts
export function gateNarrative(
  narrative: Narrative,
  anchors: ReadonlyArray<string | number>,
  verdicts: ReconciliationVerdict[],
  ttlGate: boolean,
  recordedNumbers: ReadonlyArray<string | number> = [],
): { ok: boolean; violations: NarrativeViolation[]; stripped: Narrative }
```

Called from `buildDeliverableNarrative()` (line ~474): forced-tool-call generates the narrative →
`gateNarrative` lints it → on violation, **one regeneration** with the violations named in the
retry prompt → if still bad, **hard-strip** the offending sentences and proceed. This retry-then-
strip shape is the thing any new gate would need to either plug into or deliberately NOT plug into.

### 1.2 The actual lint logic: `lib/deliverable/narrative-lint.ts`

`lintDeliverableNarrative()` (line 311) is more sophisticated than "check for smoothing words." It
does, sentence-by-sentence, across `exec_summary` and every section's `title`/`intro`:

- **Exact-number-anchoring**: every number mentioned in prose is extracted and must exactly match a
  number present in `snapshotNumbers` (the frozen, real, code-computed facts for this build/send).
  A number in the narrative that isn't in the anchor set is a violation — this is the core
  no-invented-numbers enforcement mechanism, and it's already rigorous.
- Smoothing-phrase bans (re-encoding a deterministic value in hedgy language).
- Jargon bans (internal terms leaking to a customer).
- Forecast detection — a forward-looking claim in fact prose is a violation; it belongs in an
  `inference_notes` entry instead.
- `inference_notes` are exempt from exact-anchoring (projections are allowed to cite non-anchored
  numbers) but MUST carry an actual `falsifier: <condition>` clause, and if a note cites numbers at
  all, at least one must still be anchored (a note can't launder a pure fabrication as "inference").

**What none of this catches, and what a factuality gate would add:** a sentence whose NUMBER is a
real, anchored, correct figure, but whose CLAIM about that number is semantically backwards or
unsupported — e.g. the anchor set has `$410,000` as this period's median and last period's was
higher, but the narrative says "prices rose to $410,000." The digit passes the anchor check; the
direction is a lie. Same gap for purely qualitative claims with no number to anchor at all
("demand is surging") — there's currently no check against the underlying facts for those either.
This is the specific, concrete gap the operator's "not making up numbers" ask points at that today's
lints structurally cannot close, because they operate on numeral-presence, not claim-truth.

### 1.3 The parallel lint family: `refinery/validate/*.mts`

Different pipeline, same philosophy, gates the BRAIN markdown (not the deliverable/email narrative)
before Stage 4 writes to `brains/*.md`: `facts-only-lint.mts` (bans instruction-shaped language
inside the ` ```reference ` fence), `inference-bait-lint.mts` (ambiguous-denominator detection +
cross-brain causal-chain detection in `OUTPUT.conclusion`), `smoothing-lint.mts`,
`grain-guard-lint.mts`, `zip-scope-lint.mts`, `corridor-character-lint.mts`,
`zip-level-framing-lint.mts`, `chart-block-lint.mts`, `speculative-block-lint.mts`, plus
`spec-validator.mts` itself (structural frontmatter/section-shape validation). Each has a sibling
`.test.mts` with hand-authored pass/fail markdown fixtures — this is the established test-shape
convention in this codebase for a new lint module, and whatever gets built should look like these.

**Open question for the design, not yet resolved:** does a factuality gate belong only in the
deliverable-narrative path (`lib/deliverable/`), only in the brain-markdown path
(`refinery/validate/`), or both? The operator's original ask ("AI doing what it is supposed to and
not making up numbers") doesn't specify which surface. Leaf-brain `OUTPUT.conclusion` text and
master's synthesis prose are both LLM-generated narrative sitting next to a block of established
facts, structurally the same shape as the deliverable-narrative problem. This hasn't been asked yet.

### 1.4 The constraint that changes the design: the Anthropic spend-guard seam

`refinery/agents/anthropic.mts` is the **one enforced seam** for metered Anthropic calls in this
codebase (operator directive 07/05/2026, hard daily/monthly caps on logged spend). The file's own
comment: "routing through here gives them logging + the spend cap... again be the invisible
spender" — i.e. this file exists specifically because something ELSE bypassing it and becoming an
invisible spender already happened once and got locked against. Any new Anthropic-calling surface
in this codebase is expected to route through this seam.

promptfoo's built-in `factuality` assertion type calls a model directly (default OpenAI; overridable
to `anthropic:claude-sonnet-4-5-...` — verified live, see §2) using **its own provider
implementation**, authenticated via a bare `ANTHROPIC_API_KEY` env var. That call would NOT go
through `refinery/agents/anthropic.mts`. It would NOT be counted against the daily/monthly spend
caps. It would NOT show up in whatever spend-logging/reporting reads off that seam. This is exactly
the "invisible spender" shape the seam's own comment warns about — the only question is whether
that matters enough to block on, given the surface is small and CI-only (see §3, the interrupted
question).

---

## 2. promptfoo — everything verified live this session (crawl4ai, not memory)

- **Package:** `promptfoo` on npm, MIT license (verified via raw LICENSE file fetch). 23.3k GitHub
  stars, commits landing same-day as this research — actively maintained.
- **Governance flag (verified, not assumed):** every promptfoo doc page carries a live banner —
  **"Promptfoo is now part of OpenAI."** The MIT license file is unchanged as of this fetch. Worth
  re-checking before deep integration in case of future OpenAI-only feature gating; doesn't block
  today's use.
- **The `factuality` assertion type** (`docs/configuration/expected-outputs/model-graded/
  factuality/`): compares an LLM output ("completion") against a reference string ("value") and
  categorizes the relationship as:
  - (A) output is a subset of the reference, fully consistent
  - (B) output is a superset of the reference, fully consistent
  - (C) output contains all the same details as the reference
  - (D) output and reference **disagree** — this is the failing category, exactly the
    direction-reversal / contradiction failure mode described in §1.2
  - (E) they differ but the difference doesn't matter for factuality
  - By default A/B/C/E pass, D fails. Thresholds per category are configurable
    (`defaultTest.options.factuality.{subset,superset,agree,disagree,differButFactual}`).
- **The grading model is overridable to Claude** — confirmed via three documented mechanisms: CLI
  flag (`promptfoo eval --grader anthropic:claude-sonnet-4-5-...`), `defaultTest.options.provider`,
  or per-assertion `provider:` field. This matters because it means we are NOT forced onto OpenAI
  models for the grading call even though promptfoo itself is now OpenAI-owned — we can point the
  judge at our own already-trusted vendor.
- **The `echo` provider** (`docs/providers/echo/`) — "a simple utility provider that returns the
  input prompt as the output... particularly useful for testing, debugging, and validating
  **pre-generated outputs without making any external API calls**." This is the mechanism that
  solves the "we already have the narrative sentence, we don't want promptfoo to generate a NEW one
  by calling a live model" problem — feed the already-generated narrative sentence in as the
  prompt/var, `echo` passes it straight through as the "output" with zero extra calls, and only the
  `factuality` assertion's grading call is a real API hit.
- **Node.js library usage** (`docs/usage/node-package/`): `npm install promptfoo`; `import promptfoo
  from 'promptfoo'; const evalRecord = await promptfoo.evaluate(testSuite, options);`. There's also
  a lower-level `loadApiProvider` export and an `AssertionValueFunction` mechanism (a plain JS
  function can BE an assertion, receiving `output`, `context` including `prompt`/`vars`/`test`/
  `providerResponse`). **Not yet fully explored:** whether there's an even-lower-level exported
  function to run a single assertion directly (bypassing the full `TestSuiteConfiguration`/
  `evaluate()` ceremony) — the Node API reference page (`docs/usage/node-api-reference/`) was
  linked but not yet fetched. Worth checking before locking the integration shape.
- **Not yet researched at all:** DeepEval and any other RAG-eval framework's programmatic/static-text
  invocation path — promptfoo was judged sufficient once its stack-fit (TS-native, no Python
  decoupling) was confirmed against DeepEval (Python-only, same category). If promptfoo turns out to
  have a dealbreaker in deeper research, DeepEval is the fallback, unresearched at this depth.

---

## 3. Decisions status

### 3.1 LOCKED — tool choice: promptfoo over HHEM (see §0 point 5)

Reasoning: no Python decoupling needed, runs natively in the existing Bun/`bun test`/CI surface,
MIT license, grading model can be pinned to Claude. HHEM's counter-case (for the record, in case
this gets revisited): Apache-2.0, purpose-built NLI classifier (not an LLM-as-judge), independently
benchmarked to beat GPT-3.5/GPT-4 zero-shot on AggreFact/RAGTruth, CPU-runnable, **zero marginal
per-call cost** once running (no paid API call at all — it's a local 0.1B-param model) versus
promptfoo's factuality check being a real paid Claude call every single time it runs. HHEM's cost
model is genuinely better for anything that needs to run at volume (e.g. an eventual live/every-send
gate); promptfoo's is better for occasional CI checks. If the eventual scope grows past "small CI
fixture set" into "every real send, sampled or otherwise," this tradeoff should be re-litigated —
right now it's decided in promptfoo's favor specifically because the scope is CI-only (see 3.2).

### 3.2 LOCKED — placement: CI fixtures now, discuss live/async later

Operator was asked to choose between four options (verbatim, for context):
1. **CI-only, on fixtures** — runs against curated golden narrative test cases whenever
   `narrative-lint.ts`/templates change. Zero cost on live traffic, zero added latency on real
   sends. Catches regressions before merge. Doesn't catch drift in real, never-fixtured narratives.
2. **Async post-send audit** — samples real generated narratives after they ship, scores off the
   critical path, logs failures for review. Real per-sample cost, zero send-latency. Catches live
   drift, only after the fact.
3. **Sync in the live build path** — inside `gateNarrative` on every build (including free builds,
   the highest-traffic surface in the product — recall "builds free, SEND is the paywall"). Catches
   everything before a user sees it. Real cost + latency on every free build.
4. **CI fixtures now, discuss live/async later** — ship option 1, treat 2/3 as a deliberately
   separate follow-up decision once there's evidence from real fixture results.

**Operator picked option 4.** So: scope this round to CI fixtures ONLY. Do not design, scope, or
build anything that touches the live `buildDeliverableNarrative` request path or a scheduled
post-send sampler in this pass — that's explicitly a later, separate conversation.

### 3.3 INTERRUPTED — spend-guard routing (this is where the operator cut in and asked for this handoff instead)

The question that was being asked, verbatim, when the operator interrupted:

> promptfoo's built-in factuality grader calls Anthropic directly, bypassing our one spend-guard
> seam (`refinery/agents/anthropic.mts`). For a small, fixed CI fixture set (e.g. ~15 hand-authored
> cases, run only when `narrative-lint.ts` or templates change) the exposure is naturally bounded —
> but it's still spend outside the guard. How do you want to handle it?

Two options were on the table:

- **Option A — use promptfoo's grader as-is (this was the recommended option).** Let promptfoo call
  Anthropic directly for the factuality grade, using a cheap model (Haiku-class). Bounded by a
  small fixed fixture count, documented as an explicit, narrow exception to the spend-guard seam.
  Fastest to ship, uses promptfoo exactly as designed, no extra code to maintain.
- **Option B — hand-roll the grader through our own seam.** Skip promptfoo's built-in `factuality`
  assertion type entirely; port its published rubric prompt (the A/B/C/D/E structure, described in
  §2) into our own code and call it through `refinery/agents/anthropic.mts` via an
  `AssertionValueFunction`, so every dollar spent is guard-visible and capped. More code to own
  (reimplementing a rubric promptfoo maintains for us), loses the "just use the library" benefit,
  but zero raw-Anthropic-bypass anywhere in the codebase — closes the gap the seam's own comment
  warns about, permanently, rather than carving an exception into it.

**This has not been decided.** Whoever picks this back up should ask it plainly, the same way,
before proceeding — this is a real operator call (project rule: "spend deliberately, never
secretly — heads-up before a new surface's first live run"), not something to default silently.

### 3.4 NOT YET ASKED — everything else still open

None of these have been raised with the operator yet. Listed here so nothing gets independently
invented by whoever picks this up without at least considering asking:

- **Scope: deliverable-narrative only, or also `refinery/validate/`?** (§1.3) — leaf-brain/master
  `OUTPUT.conclusion` prose has the identical structural gap. Could be a second phase, could be
  in-scope now, could be explicitly out-of-scope forever (maybe the regex lints there are judged
  sufficient) — genuinely open.
- **Which specific Claude model grades?** Haiku was assumed for cost in the interrupted question but
  never actually confirmed — worth weighing Haiku's lower cost against whether a subtler
  direction-reversal claim needs a stronger judge to catch reliably. Ties into memory note that
  Haiku has a 4,096-token prompt-caching floor vs Sonnet's 1,024 — irrelevant here probably (short
  grading prompts) but worth a sanity check.
- **Fixture design**: how many fixtures, and critically, what do they need to REPRESENT? At minimum
  this should include: (a) a known-good narrative sentence that should pass, (b) a number-correct/
  claim-wrong sentence (the exact gap this whole gate exists to close — e.g. right number, reversed
  direction), (c) a qualitative claim with no anchor-checkable number at all but that's contradicted
  by the facts, (d) probably a case verifying the gate does NOT false-positive on a normal, boring,
  accurate sentence (avoiding a gate that's all noise). None of these fixtures have been drafted.
- **Module shape/location**: following the `refinery/validate/*.mts` convention (§1.3), this
  probably wants to be its own module (e.g. something like `lib/deliverable/factuality-lint.ts` with
  a sibling `.test.ts`) rather than bolted directly into `narrative-lint.ts` — but this hasn't been
  proposed or confirmed, just pattern-matched from how the codebase already does things.
  `bun add -D promptfoo` (devDependency, since it's test/CI-only, not a runtime import) was assumed
  but not stated as a decision.
- **CI wiring specifics**: does this run inside the existing `bun test` sweep every time (meaning
  every `bun test` invocation — including ones devs run locally many times a day — makes a real paid
  Claude call), or does it need to be its own separately-invoked script/gate so routine local test
  runs don't quietly rack up API spend? This is a real risk if it's just dropped into `bun test`
  as-is — needs a deliberate answer, not a default.
- **Relationship to Gate 5** (CLAUDE.md: pack ⇆ catalog test hook, `catalog.test.mts` mirror + each
  pack's `bun:test`, runs on pre-push for touched packs) — should a factuality-gate failure be
  wired into that same pre-push hook family, or stay separate/advisory for now given it's a brand
  new, unproven check that could have its own false-positive rate to shake out first?
- **What "pass" means operationally**: if a fixture fails in CI, does that block the push (hard
  gate, like the existing Gate 1-5 hooks), or does it warn-and-continue while the check-catch-rate
  gets validated against real cases first? Given this is a NEW, unvalidated semantic check (LLM
  judges can themselves be wrong — recall the interrupted question already flagged "the judge model
  itself could be wrong/rate-limited" as a real risk class), a soft-launch/warn-first period before
  it becomes a hard blocking gate is worth considering explicitly, not assumed either way.

---

## 4. Alternatives considered and set aside (full detail, "open to more" — revisit any of these if new info changes the calculus)

- **Vectara HHEM-2.1-Open** — see §3.1, the primary alternative, set aside specifically because of
  scope (CI-only, low volume) not because it's worse in general. Would be the stronger pick if scope
  ever expands to live/high-volume (§3.2 option 3) given its zero marginal cost per call. Detail in
  `docs/research/2026-07-16-huggingface-and-launch-tooling-deep-dive.md` Part 2.
- **`grounded-ai/phi3-hallucination-judge`** — considered and rejected outright (not just
  deprioritized): only 79% accuracy on its own reported benchmark, needs GPU for acceptable latency
  as a 3B+-parameter PEFT adapter. Strictly worse than HHEM on every axis checked. Not worth
  revisiting unless both promptfoo and HHEM turn out to be dead ends.
- **`confident-ai/deepeval`** — same category as promptfoo (LLM-eval framework, has a
  `hallucination` metric), 16.9k GitHub stars, actively maintained. Set aside purely on stack fit:
  it's Python-only, would need the same decoupled-job pattern as `dlt`/HHEM. Not deeply researched
  beyond confirming it's Python — if promptfoo hits a real blocker (e.g. the Node API turns out not
  to support the echo+factuality combination cleanly, or the spend-guard question in §3.3 can't be
  resolved acceptably), this is the next thing to actually dig into, not just note.
- **Guardrails AI, RAGAS, TruLens** — named as adjacent RAG-eval libraries in the original research
  doc but explicitly NOT evaluated ("promptfoo and DeepEval were sufficient to establish the
  TS-vs-Python stack-fit verdict; revisit only if promptfoo's factuality assertion proves
  insufficient in a real pilot"). Zero research done on these — pure names, not verified claims.

---

## 5. What to actually do with this handoff

Per the brainstorming skill's hard gate: the next real step is finishing the clarifying-questions
pass (§3.3's interrupted question, plus whatever of §3.4 seems worth raising), then propose 2-3
approaches with trade-offs (the shape is mostly already implied above — CI-fixtures-with-promptfoo-
as-designed vs CI-fixtures-with-hand-rolled-guard-routed-grader, per §3.3), present a sectioned
design and get approval section-by-section, THEN write it to
`docs/superpowers/specs/2026-07-16-promptfoo-factuality-gate-design.md` (self-review, operator
reviews the file, only then hand off to `superpowers:writing-plans`). Nothing before that point
touches code. Checks already open and waiting: `research/promptfoo_factuality_ci_gate` (should
close or get superseded once this actually ships), `research/hhem_narrative_consistency_scorer`
(stays open regardless — HHEM is a live candidate for the future live/async phase per §3.2), and
`research/n8n_ops_alerting_automation` (unrelated to this thread, don't conflate).
