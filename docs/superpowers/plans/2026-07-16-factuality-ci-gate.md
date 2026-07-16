# Factuality CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 tasks, 10 files, keywords: architecture

**Goal:** A CI-only, fixture-based factuality gate that judges deliverable-narrative sentences
against the facts they were generated from, grading through the Anthropic spend seam.

**Architecture:** promptfoo's built-in `factuality` assertion (their maintained A–E rubric),
invoked per-fixture via the public `assertions.runAssertion()` Node export, with a custom
`ApiProvider` whose `callApi()` routes every grading call through
`refinery/agents/anthropic.mts` (`getAnthropic("factuality_ci")`). Live grading runs only under
`FACTUALITY_GATE=1` — locally by deliberate operator-approved invocation, in CI via a
path-filtered, warn-first GHA job.

**Tech Stack:** Bun (`bun:test`), promptfoo (npm, devDependency, pinned exact), Anthropic SDK via
the existing seam, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-16-factuality-ci-gate-design.md` — operator decisions
in it are locked; do not re-litigate.

## Global Constraints

- Grading model comes from the seam's exported `SYNTHESIS_MODEL` constant (today
  `claude-sonnet-4-6`) — never hard-code a model id anywhere in this build.
- Every Anthropic call goes through `getAnthropic("factuality_ci")`. A bare `new Anthropic()` or
  bare `ANTHROPIC_API_KEY` fetch anywhere in this build is a defect.
- Plain `bun test` must stay $0: zero network calls unless `FACTUALITY_GATE=1` is set. The flag
  never goes into any checked-in `.env` (Bun loads `.env` over shell vars).
- promptfoo is pinned exact (`bun add -D --exact promptfoo`); it is OpenAI-owned — any future
  version bump re-verifies license/feature-gating first (spec D1).
- Stage explicit paths only (`git add <paths>` / `git commit -- <paths>`); the index is shared
  with parallel sessions. Never `git add -A`. Commit per task. **No push** — the operator pushes
  (or explicitly authorizes) after reviewing the finished build.
- Fixture `reference`/`completion` strings are synthetic test data, self-contained per case — the
  reference IS the source of truth the judge grades against. They are never published anywhere,
  so four-lane sourcing does not apply to their values; realism matters only for judge difficulty.
- crawl4ai artifacts stay in the scratchpad; never `git add` anything matching `*crawl4ai*`.

---

### Task 1: `factuality_ci` call type on the spend seam

**Files:**
- Modify: `refinery/agents/anthropic.mts` (the `CallType` union, ~line 19–38)

**Interfaces:**
- Consumes: nothing.
- Produces: `CallType` accepts `"factuality_ci"` — Task 3's grader passes it to
  `getAnthropic("factuality_ci")`.

- [ ] **Step 1: Add the union member with the usual dated comment**

In the `CallType` union in `refinery/agents/anthropic.mts`, after the `insiders_author` member
and before `| "other"`, add:

```ts
  // Factuality CI gate (lib/deliverable/factuality-grader.ts) — promptfoo
  // model-graded fixtures, CI/deliberate-local only (FACTUALITY_GATE=1); spec
  // 2026-07-16-factuality-ci-gate-design.md. Added 07/16/2026.
  | "factuality_ci"
```

- [ ] **Step 2: Run the seam's existing tests**

Run: `bun test refinery/agents/anthropic.test.mts`
Expected: PASS (a widened union breaks nothing; if this file doesn't exist under that exact name,
`bun test refinery/agents/` and expect all green).

- [ ] **Step 3: Commit**

```bash
git add refinery/agents/anthropic.mts
git commit -m "feat(spend-seam): add factuality_ci call type for the CI factuality gate" -- refinery/agents/anthropic.mts
```

---

### Task 2: Install promptfoo (pinned) and prove the import surface

**Files:**
- Modify: `package.json`, `bun.lock` (same commit — pre-push Gate 1)

**Interfaces:**
- Produces: `import { assertions } from "promptfoo"` with `assertions.runAssertion` a function —
  Task 5 relies on exactly this import shape.

- [ ] **Step 1: Install pinned**

Run: `bun add -D --exact promptfoo`
Expected: `package.json` devDependencies gains `"promptfoo": "<exact version>"`; `bun.lock`
updated.

- [ ] **Step 2: Prove the import surface under Bun**

Run: `bun -e "import('promptfoo').then(m => { const pf = m.default ?? m; console.log(typeof pf.assertions?.runAssertion, typeof pf.loadApiProvider); })"`
Expected: `function function`. If `assertions` is undefined, inspect `Object.keys(pf)` and record
the actual export path — the docs (fetched 07/16/2026) show `import { assertions } from
'promptfoo'` with `assertions.runAssertion(params)`; adjust Task 5's import to match reality and
note the deviation in the handoff.

- [ ] **Step 3: Confirm `bun test` still green and still $0**

Run: `bun test lib/deliverable/ 2>&1 | tail -5`
Expected: existing suite passes; nothing new runs.

- [ ] **Step 4: Commit (lockfile in the same commit)**

```bash
git add package.json bun.lock
git commit -m "chore(deps): pin promptfoo (devDependency) for the factuality CI gate" -- package.json bun.lock
```

---

### Task 3: The seam-routed grader (`ApiProvider` adapter)

**Files:**
- Create: `lib/deliverable/factuality-grader.ts`
- Test: `lib/deliverable/factuality-grader.test.ts` (always-on, mocked, $0)

**Interfaces:**
- Consumes: `getAnthropic("factuality_ci")`, `SYNTHESIS_MODEL` from
  `../../refinery/agents/anthropic.mts` (same import style as `lib/deliverable/build.ts`).
- Produces: `export const seamFactualityGrader` with `id(): string` and
  `callApi(prompt: string): Promise<{ output: string; tokenUsage: { total: number; prompt: number; completion: number } }>`
  — Task 5 passes this object as the assertion's `provider`.

- [ ] **Step 1: Write the failing test**

`lib/deliverable/factuality-grader.test.ts` — mock the seam module the way
`lib/assistant/conversation-path.test.ts` does (`mock.module` on
`@/refinery/agents/anthropic.mts`):

```ts
import { describe, expect, mock, test } from "bun:test";
import * as anthropicModule from "../../refinery/agents/anthropic.mts";

const calls: Array<{ callType: string; body: Record<string, unknown> }> = [];

mock.module("../../refinery/agents/anthropic.mts", () => ({
  ...anthropicModule,
  getAnthropic: (callType: string) =>
    ({
      messages: {
        create: async (body: Record<string, unknown>) => {
          calls.push({ callType, body });
          return {
            content: [{ type: "text", text: "(D) There is a disagreement." }],
            usage: { input_tokens: 120, output_tokens: 9 },
          };
        },
      },
    }) as never,
}));

const { seamFactualityGrader } = await import("./factuality-grader");

describe("seamFactualityGrader", () => {
  test("routes through the seam with the factuality_ci call type and SYNTHESIS_MODEL", async () => {
    const res = await seamFactualityGrader.callApi("RUBRIC PROMPT");
    expect(calls).toHaveLength(1);
    expect(calls[0].callType).toBe("factuality_ci");
    expect(calls[0].body.model).toBe(anthropicModule.SYNTHESIS_MODEL);
    expect(res.output).toBe("(D) There is a disagreement.");
    expect(res.tokenUsage).toEqual({ total: 129, prompt: 120, completion: 9 });
  });

  test("has a stable provider id", () => {
    expect(seamFactualityGrader.id()).toBe("swfl:factuality-grader-seam");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/factuality-grader.test.ts`
Expected: FAIL — cannot resolve `./factuality-grader`.

- [ ] **Step 3: Write the grader**

`lib/deliverable/factuality-grader.ts`:

```ts
// promptfoo grading provider that routes the factuality judge's Anthropic call
// through the one enforced spend seam (spec 2026-07-16-factuality-ci-gate-design.md
// D1). Errors (incl. SpendCapError) propagate — a broken judge must surface as an
// ERROR, never as a pass/fail verdict (spec D7).
import { getAnthropic, SYNTHESIS_MODEL } from "../../refinery/agents/anthropic.mts";

export const seamFactualityGrader = {
  id: () => "swfl:factuality-grader-seam",
  callApi: async (prompt: string) => {
    const client = getAnthropic("factuality_ci");
    const msg = await client.messages.create({
      model: SYNTHESIS_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const output = msg.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return {
      output,
      tokenUsage: {
        total: msg.usage.input_tokens + msg.usage.output_tokens,
        prompt: msg.usage.input_tokens,
        completion: msg.usage.output_tokens,
      },
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/factuality-grader.test.ts`
Expected: PASS (2 tests). Note: the mocked test makes zero network calls and needs no API key.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/factuality-grader.ts lib/deliverable/factuality-grader.test.ts
git commit -m "feat(deliverable): seam-routed promptfoo grading provider for the factuality gate" -- lib/deliverable/factuality-grader.ts lib/deliverable/factuality-grader.test.ts
```

---

### Task 4: The fixture golden set

**Files:**
- 🔴 Create: `lib/deliverable/factuality-fixtures.ts`
- Test: `lib/deliverable/factuality-fixtures.test.ts` (structural, always-on, $0)

**Interfaces:**
- Produces: `export interface FactualityFixture { id; cls; reference; completion; expectPass;
  note }` and `export const FACTUALITY_FIXTURES: FactualityFixture[]` — Task 5 loops this array.
  (`cls` is a small addition over the spec's interface so class coverage is machine-checkable.)

- [ ] **Step 1: Write the failing structural test**

`lib/deliverable/factuality-fixtures.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { FACTUALITY_FIXTURES } from "./factuality-fixtures";

describe("factuality fixture set (structural — no API calls)", () => {
  test("has at least 12 fixtures with unique ids", () => {
    expect(FACTUALITY_FIXTURES.length).toBeGreaterThanOrEqual(12);
    const ids = FACTUALITY_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("covers all five classes (spec D3) and both verdicts", () => {
    const classes = new Set(FACTUALITY_FIXTURES.map((f) => f.cls));
    for (const c of ["a", "b", "c", "d", "e"] as const) expect(classes.has(c)).toBe(true);
    expect(FACTUALITY_FIXTURES.some((f) => f.expectPass)).toBe(true);
    expect(FACTUALITY_FIXTURES.some((f) => !f.expectPass)).toBe(true);
  });

  test("every fixture is fully authored", () => {
    for (const f of FACTUALITY_FIXTURES) {
      expect(f.reference.length).toBeGreaterThan(20);
      expect(f.completion.length).toBeGreaterThan(10);
      expect(f.note.length).toBeGreaterThan(10);
    }
  });

  test("fail-classes b/c expect fail; pass-classes a/d/e expect pass", () => {
    for (const f of FACTUALITY_FIXTURES) {
      expect(f.expectPass).toBe(f.cls === "a" || f.cls === "d" || f.cls === "e");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/factuality-fixtures.test.ts`
Expected: FAIL — cannot resolve `./factuality-fixtures`.

- [ ] **Step 3: Write the fixtures**

`lib/deliverable/factuality-fixtures.ts` — all 14, verbatim (values are synthetic test data;
each `reference` is the source of truth for its own case):

```ts
// Golden set for the factuality CI gate (spec 2026-07-16-factuality-ci-gate-design.md
// D3/D4). Five classes: a=accurate numeric, b=right number wrong direction (MUST fail),
// c=qualitative contradiction (MUST fail), d=boring accurate qualitative,
// e=accurate beyond-reference addition. Classes d/e are the false-positive alarm.
//
// THE IMPROVEMENT LOOP (spec D4): when a real bad narrative is caught anywhere,
// distill it here in the same session — frozen facts → reference, the bad sentence
// → completion, expectPass:false, origin in note. Good answers get frozen as
// pass-fixtures the same way. One array entry each.

export interface FactualityFixture {
  id: string; // stable slug
  cls: "a" | "b" | "c" | "d" | "e";
  reference: string; // the facts, stated plainly (source of truth for this case)
  completion: string; // the narrative sentence under judgment
  expectPass: boolean;
  note: string; // why this case exists (real-world origin if distilled from one)
}

export const FACTUALITY_FIXTURES: FactualityFixture[] = [
  // ── class a: accurate numeric sentences ─────────────────────────────────
  {
    id: "a-median-price-accurate",
    cls: "a",
    reference:
      "The median single-family sale price in the area was $410,000 in the month ending 05/31/2026, down from $432,000 the prior month.",
    completion: "The median sale price came in at $410,000, down from $432,000 a month earlier.",
    expectPass: true,
    note: "Baseline: number and direction both correct must pass.",
  },
  {
    id: "a-inventory-accurate",
    cls: "a",
    reference: "Active listings stood at 4,812 in June, up 9% from a year earlier.",
    completion: "Inventory expanded to 4,812 active listings, a 9% increase from a year ago.",
    expectPass: true,
    note: "Accurate count + accurate YoY direction must pass.",
  },
  {
    id: "a-rent-flat-accurate",
    cls: "a",
    reference: "Median asking rent was $2,150 per month, unchanged from the prior quarter.",
    completion: "Asking rents held flat at $2,150.",
    expectPass: true,
    note: "Accurate 'unchanged' claim must pass.",
  },
  // ── class b: right number, reversed direction (the founding failure) ────
  {
    id: "b-reversed-direction-median-price",
    cls: "b",
    reference:
      "The median single-family sale price in the area was $410,000 in the month ending 05/31/2026, down from $432,000 the prior month.",
    completion: "Prices rose to $410,000 this month.",
    expectPass: false,
    note: "THE founding case: the digit is anchored and real, the direction is a lie. Regex lints structurally cannot catch this.",
  },
  {
    id: "b-reversed-yoy-inventory",
    cls: "b",
    reference: "Active listings stood at 4,812 in June, down 9% from a year earlier.",
    completion: "Listings grew 9% from last year, reaching 4,812.",
    expectPass: false,
    note: "Both numbers real; the year-over-year direction is inverted.",
  },
  {
    id: "b-reversed-rank",
    cls: "b",
    reference: "Cape Coral recorded the slowest price growth of the five cities tracked this quarter.",
    completion: "Cape Coral led the five tracked cities in price growth this quarter.",
    expectPass: false,
    note: "Rank reversal with no numeral at all — nothing for exact-number anchoring to check.",
  },
  // ── class c: qualitative claims contradicted by the facts ───────────────
  {
    id: "c-demand-surging-vs-falling-sales",
    cls: "c",
    reference:
      "Closed sales fell for the fourth consecutive month, and pending contracts are at a three-year low.",
    completion: "Buyer demand is surging across the market.",
    expectPass: false,
    note: "Pure vibes contradicted by the facts; no number to anchor.",
  },
  {
    id: "c-tight-market-vs-rising-supply",
    cls: "c",
    reference: "Months of supply climbed from 4.1 to 7.3 over the past year.",
    completion: "The market remains extremely tight, with buyers facing scarce options.",
    expectPass: false,
    note: "'Tight' asserted over near-doubled supply.",
  },
  {
    id: "c-seller-leverage-vs-price-cuts",
    cls: "c",
    reference:
      "Price cuts outnumbered price increases roughly nine to one among active listings over the last 90 days.",
    completion: "Sellers hold all the leverage in today's market.",
    expectPass: false,
    note: "Leverage claim contradicted by the cut/raise ratio.",
  },
  // ── class d: boring accurate qualitative (false-positive alarm) ─────────
  {
    id: "d-supply-loosened",
    cls: "d",
    reference: "Months of supply climbed from 4.1 to 7.3 over the past year.",
    completion: "Supply conditions have loosened considerably over the past year.",
    expectPass: true,
    note: "Fair qualitative restatement of a numeric fact must pass — if this fails, the judge is noise.",
  },
  {
    id: "d-sellers-trimming",
    cls: "d",
    reference:
      "Price cuts outnumbered price increases roughly nine to one among active listings over the last 90 days.",
    completion: "Sellers are trimming asking prices far more often than they are raising them.",
    expectPass: true,
    note: "Faithful qualitative reading of the ratio must pass.",
  },
  {
    id: "d-sales-sliding",
    cls: "d",
    reference:
      "Closed sales fell for the fourth consecutive month, and pending contracts are at a three-year low.",
    completion: "Closed sales continued to slide, and forward-looking contract activity is weak.",
    expectPass: true,
    note: "Accurate paraphrase with mild interpretation must pass.",
  },
  // ── class e: accurate additions beyond the reference ────────────────────
  {
    id: "e-derived-percentage",
    cls: "e",
    reference:
      "The median sale price was $410,000 in the latest month, down from $432,000 the prior month.",
    completion:
      "The median sale price fell to $410,000 from $432,000 — a roughly 5% one-month decline.",
    expectPass: true,
    note: "The ~5% is straightforward arithmetic on reference values (superset, category B). The most judge-sensitive pass-fixture; if it flakes, document in the handoff before touching thresholds.",
  },
  {
    id: "e-restated-order",
    cls: "e",
    reference: "Median asking rent was $2,150 per month, unchanged from the prior quarter.",
    completion:
      "At $2,150 per month, the median asking rent was unchanged from the prior quarter.",
    expectPass: true,
    note: "Same facts, reordered phrasing — full-overlap (category C) must pass.",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/factuality-fixtures.test.ts`
Expected: PASS (4 tests), zero network calls.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/factuality-fixtures.ts lib/deliverable/factuality-fixtures.test.ts
git commit -m "feat(deliverable): factuality golden set — 14 fixtures across the 5 spec classes" -- lib/deliverable/factuality-fixtures.ts lib/deliverable/factuality-fixtures.test.ts
```

---

### Task 5: The gate test + first live calibration run

**Files:**
- Create: `lib/deliverable/factuality-gate.test.ts`

**Interfaces:**
- Consumes: `FACTUALITY_FIXTURES` (Task 4), `seamFactualityGrader` (Task 3),
  `assertions.runAssertion` from `promptfoo` (Task 2).

- [ ] **Step 1: Write the gate test**

`lib/deliverable/factuality-gate.test.ts`:

```ts
// LIVE factuality gate (spec 2026-07-16-factuality-ci-gate-design.md D5).
// Self-skips unless FACTUALITY_GATE=1 — plain `bun test` must stay $0.
// Each fixture = one real graded call through the spend seam (factuality_ci).
import { describe, expect, test } from "bun:test";
import { agentsAreMocked } from "../../refinery/agents/anthropic.mts";
import { FACTUALITY_FIXTURES } from "./factuality-fixtures";
import { seamFactualityGrader } from "./factuality-grader";

const LIVE = process.env.FACTUALITY_GATE === "1" && !agentsAreMocked();

describe("factuality gate (live, seam-routed)", () => {
  if (!LIVE) {
    test("skipped — set FACTUALITY_GATE=1 for a deliberate live run (real spend)", () => {
      expect(LIVE).toBe(false);
    });
    return;
  }

  for (const f of FACTUALITY_FIXTURES) {
    test(
      `${f.id} (class ${f.cls}, expect ${f.expectPass ? "pass" : "fail"})`,
      async () => {
        const { assertions } = await import("promptfoo");
        const result = await assertions.runAssertion({
          prompt: "Summarize the market facts for a reader.",
          assertion: {
            type: "factuality",
            value: f.reference,
            provider: seamFactualityGrader,
          },
          test: { vars: {}, assert: [] },
          providerResponse: { output: f.completion },
        });
        // Infra errors (SpendCapError, network) THROW out of runAssertion or land
        // in result.error — either way they must not masquerade as a verdict.
        expect(result.error ?? "").toBe("");
        expect(result.pass).toBe(f.expectPass);
      },
      120_000,
    );
  }
});
```

- [ ] **Step 2: Verify it skips by default ($0)**

Run: `bun test lib/deliverable/factuality-gate.test.ts`
Expected: 1 test passes ("skipped — set FACTUALITY_GATE=1 ..."), zero network calls.

- [ ] **Step 3: First live calibration run (operator-approved spend — this design thread IS the
  heads-up; ~14 short Sonnet calls, bounded by the seam's $25/day cap)**

Requires `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` in the local env (already
present for local deliverable builds).

Run: `FACTUALITY_GATE=1 bun test lib/deliverable/factuality-gate.test.ts`
Expected: 14 tests, all PASS (each fixture's verdict matches `expectPass`).

Calibration triage if not all green:
- A class **b/c** fixture passes when it should fail → the judge missed a contradiction. Try
  once more (LLM judges are stochastic); if stable, record it in the handoff as a judge miss —
  do NOT weaken the fixture to make it pass.
- A class **d/e** fixture fails → false positive; `e-derived-percentage` is the known-sensitive
  one. Record verbatim `result.reason` in the handoff. One retry; if stable, leave the fixture
  as-is, mark the run result in the handoff, and flag to the operator — threshold/model changes
  are an operator call, not a silent default.
- Any `result.error` / thrown `SpendCapError` → infra, not verdict; fix env and re-run.

- [ ] **Step 4: Verify the spend landed in the seam's log**

Run:
```bash
bun -e "import('@supabase/supabase-js').then(async ({ createClient }) => { const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } }); const { data, error } = await sb.from('api_usage_log').select('call_type,model,cost_usd').eq('call_type','factuality_ci'); console.log(error ?? data.length + ' rows, total $' + data.reduce((s,r)=>s+Number(r.cost_usd),0).toFixed(4)); })"
```
Expected: `14 rows, total $0.0xxx` (one row per fixture, model = the seam's SYNTHESIS_MODEL).
This closes the "no invisible spender" loop — record the row count and total in the handoff.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/factuality-gate.test.ts
git commit -m "feat(deliverable): live factuality gate test — env-gated, seam-routed, 14 fixtures" -- lib/deliverable/factuality-gate.test.ts
```

---

### Task 6: Warn-first GHA job

**Files:**
- Create: `.github/workflows/factuality-gate.yml`

**Interfaces:**
- Consumes: Task 5's test file; repo secrets `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY` (already exist — used by `daily-rebuild.yml`).

- [ ] **Step 1: Check the repo's Bun setup convention**

Run: `grep -n -A3 "setup-bun\|bun install" .github/workflows/ci.yml | head -12`
Match the action version and install flags below to what `ci.yml` actually uses.

- [ ] **Step 2: Write the workflow**

`.github/workflows/factuality-gate.yml` (spec deviation, documented: the spec's success criteria
said "a real PR" — this repo pushes to `main` and never opens PRs, so the trigger is
push-with-path-filter + manual dispatch):

```yaml
# Factuality CI gate — warn-first (spec 2026-07-16-factuality-ci-gate-design.md D5/D6).
# continue-on-error flips to false via check `factuality_gate_blocking_flip` after a
# validated clean stretch. Supabase secrets are LOAD-BEARING: without them
# logApiUsage() silently no-ops and the grading spend becomes invisible.
name: factuality-gate
on:
  push:
    branches: [main]
    paths:
      - "lib/deliverable/**"
      - "refinery/agents/anthropic.mts"
      - ".github/workflows/factuality-gate.yml"
  workflow_dispatch:

jobs:
  gate:
    runs-on: ubuntu-latest
    continue-on-error: true # D6 warn-first — do not remove without the blocking-flip check
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Run factuality gate (14 graded fixtures via spend seam)
        env:
          FACTUALITY_GATE: "1"
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: bun test lib/deliverable/factuality-gate.test.ts
```

- [ ] **Step 3: Validate the workflow file parses**

Run: `bun -e "import('js-yaml').then(y => console.log(!!y.load(require('fs').readFileSync('.github/workflows/factuality-gate.yml','utf8')) && 'yaml ok')).catch(() => console.log(require('fs').readFileSync('.github/workflows/factuality-gate.yml','utf8').length > 0 && 'yaml present (js-yaml unavailable — rely on GHA parse)'))"`
Expected: `yaml ok` (or the fallback line). The real parse proof is the first GHA run after push.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/factuality-gate.yml
git commit -m "ci: warn-first factuality-gate workflow — path-filtered, seam-metered" -- .github/workflows/factuality-gate.yml
```

---

### Task 7: Seeded-red proof (the gate can actually catch)

**Files:**
- 🔴 Temporarily modify (then revert): `lib/deliverable/factuality-fixtures.ts`

- [ ] **Step 1: Seed a known-bad expectation**

In `factuality-fixtures.ts`, flip `b-reversed-direction-median-price` to `expectPass: true`
(do NOT commit this).

- [ ] **Step 2: Run live and confirm the gate goes red**

Run: `FACTUALITY_GATE=1 bun test lib/deliverable/factuality-gate.test.ts 2>&1 | tail -8`
Expected: exactly 1 fail (`b-reversed-direction-median-price`), 13 pass — proving a red verdict
turns the suite red (success criteria in the spec). Also expected: 1 structural fail if
`bun test lib/deliverable/factuality-fixtures.test.ts` runs (class-b must expect fail) — that's
the structural test doing its job.

- [ ] **Step 3: Revert the seed**

Run: `git checkout -- lib/deliverable/factuality-fixtures.ts`
Then: `bun test lib/deliverable/factuality-fixtures.test.ts`
Expected: PASS — tree clean again (`git status --short` shows no fixture change).

Record the seeded-red result (1 fail / 13 pass) in the handoff; no commit from this task.

---

### Task 8: Checks, session log, handoff doc

**Files:**
- Create: `docs/handoff/2026-07-16-factuality-ci-gate-shipped.md`
- Modify: `SESSION_LOG.md` (top-of-file entry), `_AUDIT_AND_ROADMAP/build-queue.md` (sync entry)

- [ ] **Step 1: Close the superseded research check, open the blocking-flip check**

```bash
node scripts/check.mjs close promptfoo_factuality_ci_gate
node scripts/check.mjs open research factuality_gate_blocking_flip "Flip factuality-gate.yml continue-on-error to false after a validated clean stretch of warn-first runs (spec D6) — one-line change; record the evidence run ids"
```
(If `close` wants a different key form, run `node scripts/check.mjs list | grep -i factuality`
and use the exact key shown.)

- [ ] **Step 2: Write the handoff doc**

`docs/handoff/2026-07-16-factuality-ci-gate-shipped.md` — written fresh at execution time with
the REAL results from Tasks 5–7 (never templated numbers). Required contents:
- What shipped: the four files + CallType member + workflow, commit hashes from `git log`.
- Calibration results (Task 5): per-class outcome, any judge misses/false positives with verbatim
  `result.reason`, the spend-log row count and total from Step 4.
- Seeded-red proof result (Task 7).
- Every follow-up, each with its tracking check: live/async decision (deferred by operator
  option-4 call; evidence = the fixture calibration results here), brain-markdown phase 2
  (`factuality_gate_brain_markdown_phase2`), blocking flip (`factuality_gate_blocking_flip`),
  HHEM as the high-volume candidate (`research/hhem_narrative_consistency_scorer`), promptfoo
  governance re-verify before any version bump, and the improvement-loop reflex (mistake →
  fail-fixture, good answer → pass-fixture — spec D4).
- `factuality_ci_gate_live_verify` closure condition: stays OPEN until the GHA job has actually
  run green on a real push and its spend row is visible — closable only after the operator
  pushes.

- [ ] **Step 3: SESSION_LOG entry + build-queue sync**

Append a top-of-file `SESSION_LOG.md` entry (what shipped, calibration numbers, checks
opened/closed, "awaiting operator push"). Add/refresh the `factuality-ci-gate` line in
`_AUDIT_AND_ROADMAP/build-queue.md`.

- [ ] **Step 4: Commit docs, show the log, and STOP (no push)**

```bash
git add docs/handoff/2026-07-16-factuality-ci-gate-shipped.md SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs: factuality-ci-gate shipped — calibration results + follow-up handoff" -- docs/handoff/2026-07-16-factuality-ci-gate-shipped.md SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git log --oneline origin/main..HEAD
```
Present the commit list to the operator and ask for push authorization (`node
scripts/safe-push.mjs` once granted — check for foreign commits first and ASK before bundling
any). The first GHA gate run happens on that push; `factuality_ci_gate_live_verify` closes after
it's verified green with a visible spend row.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 4, Task 7 | `lib/deliverable/factuality-fixtures.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
