# Brain Resilience System — Phase 2+3+5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, keywords: refactor, schema, architecture

**Goal:** Make the CLI build walk non-fatal under `--resilient`, thread the degraded-upstream set through `harvestUpstreams` to populate `BrainOutput.degraded_inputs`, and render a compact `(Label · Date)` token in tier-1/2 speaker output.

**Architecture:** Four layers built in order: (1) `resilient-build.mts` owns retry, failure classification (`degraded` vs `missing`), and the master HOLD decision — all pure/injectable for testing; (2) `cli.mts` collects `BrainBuildOutcome[]` across the walk and threads `degradedIds` through to master's `runPipeline` call; (3) `harvestUpstreams` in `4-output.mts` accepts `degradedIds` to produce `degradationCaveats` + populate `brainOutput.degraded_inputs`; (4) `speaker.mts` renders the token inline near the lead. Everything gated behind `--resilient` (default OFF) — existing GHA nightly is completely untouched until the flag is added to the workflow.

**Tech Stack:** TypeScript / Bun, `brainStatus` (lib/dag.mts), `readBrainOutput` (lib/brain-output-reader.mts), `harvestUpstreams` (stages/4-output.mts ~line 142), `outputStage` (stages/4-output.mts ~line 287), `speak`/`renderTier2` (render/speaker.mts ~lines 260–335), `PACKS` (config/packs.mts).

---

## Context

Phase 1 laid the type rails (`BrainEdge.critical`, `PackDefinition.public_label`, `BrainOutput.degraded_inputs`, `UpstreamHarvest.degradedUpstreamIds`, 5 critical edges tagged in master, registry invariant, snapshot test). Zero behavior changed.

Phase 2 wires the resilience: a `--resilient` flag makes the CLI non-fatal on brain build failures. A failed brain with an eligible last-good read (`age ≤ min(14, max(2, 1×ttl_days))`) is classified `degraded` (master publishes with a cap); one with no eligible last-good is `missing`. If any **critical** upstream is `missing` AND was previously built (expired eligibility — not never-built), master is HELD and the run exits 1. The whole run emits `brains/_build-report.json`. Exit codes: 0 clean · 2 degraded-but-complete · 1 hard (HOLD or crash).

Phase 3 wires degraded IDs into `harvestUpstreams` so the OUTPUT block carries `degraded_inputs` tokens. Phase 5 renders them in the speaker as `(Label · Date)` tokens near the lead.

**Eligibility constants (sourced 2026-06-01, verified against real TTLs):**

| Brain                       | `ttl_seconds` | ttl_days | `min(14, max(2, 1×ttl_days))` |
| --------------------------- | ------------- | -------- | ----------------------------- |
| env-swfl                    | 2,592,000     | 30       | **14** (ceiling)              |
| cre-swfl                    | 604,800       | 7        | **7**                         |
| macro-us / -florida / -swfl | 86,400        | 1        | **2** (floor)                 |

---

## Files

| Action | Path                                    | Responsibility                                                                                                                                      |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `refinery/lib/resilient-build.mts`      | Types, constants, `isTransientError`, `isEligibleLastGood`, `classifyFailure`, `buildOne`, `computeMasterDecision`                                  |
| Create | `refinery/lib/resilient-build.test.mts` | Guards 2–5 unit tests (retry, classification, HOLD/no-HOLD)                                                                                         |
| Modify | `refinery/cli.mts`                      | `--resilient` flag, outcome-collection walk (~163–216), `runPipeline` opts extension, report emit, exit codes                                       |
| Modify | `refinery/stages/4-output.mts`          | `harvestUpstreams` accepts `degradedIds: ReadonlySet<string>`, produces `degradationCaveats`, populates `degraded_inputs` on `brainOutput` assembly |
| Modify | `refinery/render/speaker.mts`           | `renderTier2` + `renderTier1` read `degraded_inputs`, insert `(Label · Date)` tokens after conclusion                                               |
| Modify | `refinery/render/speaker.test.mts`      | Token-rendering tests (round-trip already guards Phase 1)                                                                                           |

---

### Task 1: Types, constants, and pure helpers in `resilient-build.mts`

**Files:**

- Create: `refinery/lib/resilient-build.mts`

- [ ] **Step 1: Write the file with types, constants, and pure helpers**

```typescript
// refinery/lib/resilient-build.mts
import type { PackDefinition } from "../types/pack.mts";
import type { BrainOutput } from "../types/brain-output.mts";
import type { OutputResult } from "../stages/4-output.mts";
import type { BrainOutputRead } from "./brain-output-reader.mts";
import { readBrainOutput } from "./brain-output-reader.mts";

// ── Eligibility constants (sourced 2026-06-01, verified against real TTLs) ──
// Formula: eligible iff age_days ≤ min(MAX, max(FLOOR, MULT × ttl_days))
export const LAST_GOOD_MIN_WINDOW_DAYS = 2; // floor: every brain gets ≥2 nights
export const LAST_GOOD_ELIGIBILITY_MULT = 1; // one full TTL cycle
export const LAST_GOOD_ABSOLUTE_MAX_DAYS = 14; // ceiling: 30-day env-swfl would otherwise serve 30-day-stale flood data

// ── Types ──────────────────────────────────────────────────────────────────

export interface BrainBuildOutcome {
  packId: string;
  status: "built" | "skipped-fresh" | "degraded" | "missing";
  reason?: string;
  /** ISO 8601 — present on `degraded` outcomes AND on `missing` outcomes where a
   *  prior build existed but its eligibility window has expired. ABSENT on
   *  never-built `missing` outcomes (the "not-yet-online" case). This distinction
   *  drives the HOLD decision: expired last-good → HOLD; never-built → no HOLD. */
  lastGoodRefinedAt?: string;
  version?: number;
  written: boolean;
  brainOutput?: BrainOutput;
  /** Reserved for issue #61 (volume guard / row-floor integration). Empty slot
   *  so that work plugs into this health model without a second type-lift. */
  dataIntegrity?: {
    rowsRead: number;
    rowsExpected?: number;
    sampled?: boolean;
  };
}

export interface BuildReport {
  target: string;
  timestamps: { started: string; finished: string };
  source: string;
  outcomes: BrainBuildOutcome[];
  exitCode: 0 | 1 | 2;
  masterDecision?: "published" | "held" | "skipped-fresh";
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Classify a build error as transient (retry eligible) or deterministic. */
export function isTransientError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : String(err).toLowerCase();
  return (
    msg.includes("socket") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed")
  );
}

/** Whether a prior brain read is within the eligibility window for use as a
 *  last-good degraded fallback. Uses pack.ttl_seconds as the reference TTL. */
export function isEligibleLastGood(
  pack: PackDefinition,
  refinedAt: string,
): boolean {
  const ttlDays = pack.ttl_seconds / 86400;
  const windowDays = Math.min(
    LAST_GOOD_ABSOLUTE_MAX_DAYS,
    Math.max(LAST_GOOD_MIN_WINDOW_DAYS, LAST_GOOD_ELIGIBILITY_MULT * ttlDays),
  );
  const ageDays = (Date.now() - Date.parse(refinedAt)) / 86400000;
  return ageDays <= windowDays;
}

/** Pure: classify a build failure given the existing last-good read.
 *  Exported for direct unit testing without file I/O. */
export function classifyFailure(
  pack: PackDefinition,
  err: unknown,
  read: BrainOutputRead,
): BrainBuildOutcome {
  const reason = err instanceof Error ? err.message : String(err);
  if (read.kind === "ok" && isEligibleLastGood(pack, read.output.refined_at)) {
    return {
      packId: pack.id,
      status: "degraded",
      reason,
      lastGoodRefinedAt: read.output.refined_at,
      version: read.output.version,
      written: false,
    };
  }
  // `missing` with lastGoodRefinedAt → expired eligibility (HOLD trigger).
  // `missing` without it → never built ("not-yet-online", no HOLD).
  const lastGoodRefinedAt =
    read.kind === "ok" ? read.output.refined_at : undefined;
  return {
    packId: pack.id,
    status: "missing",
    reason,
    lastGoodRefinedAt,
    written: false,
  };
}

/** Determine whether master should publish, be held, or was skipped fresh.
 *  A critical upstream is a HOLD trigger only when it has an expired last-good
 *  (lastGoodRefinedAt set on a `missing` outcome) — a brain that never built
 *  is "not-yet-online" and must NOT block master. */
export function computeMasterDecision(
  masterPack: PackDefinition,
  outcomes: BrainBuildOutcome[],
): "published" | "held" {
  const outcomeById = new Map(outcomes.map((o) => [o.packId, o]));
  for (const edge of masterPack.input_brains ?? []) {
    if (!edge.critical) continue;
    const outcome = outcomeById.get(edge.id);
    if (
      outcome &&
      outcome.status === "missing" &&
      outcome.lastGoodRefinedAt !== undefined
    ) {
      return "held";
    }
  }
  return "published";
}

// ── buildOne ──────────────────────────────────────────────────────────────

type RunPipelineFn = (
  pack: PackDefinition,
  opts: { dryRun: boolean; degradedUpstreamIds?: ReadonlySet<string> },
) => Promise<OutputResult>;

/** Wrap a single pack's runPipeline call with resilience: one retry on
 *  transient errors (5s backoff), then classify as `degraded` or `missing`.
 *  `readBrainOutputFn` and `delaySec` are injectable for unit testing. */
export async function buildOne(
  pack: PackDefinition,
  opts: { dryRun: boolean; degradedUpstreamIds?: ReadonlySet<string> },
  runPipeline: RunPipelineFn,
  readBrainOutputFn: (
    brainId: string,
  ) => Promise<BrainOutputRead> = readBrainOutput,
  delaySec: number = 5,
): Promise<BrainBuildOutcome> {
  let result: OutputResult;
  try {
    result = await runPipeline(pack, opts);
  } catch (firstErr) {
    if (isTransientError(firstErr)) {
      await new Promise<void>((r) => setTimeout(r, delaySec * 1_000));
      try {
        result = await runPipeline(pack, opts);
      } catch (retryErr) {
        const read = await readBrainOutputFn(pack.brain_id);
        return classifyFailure(pack, retryErr, read);
      }
    } else {
      const read = await readBrainOutputFn(pack.brain_id);
      return classifyFailure(pack, firstErr, read);
    }
  }
  return {
    packId: pack.id,
    status: "built",
    version: result.version,
    written: result.written,
    brainOutput: result.brainOutput,
  };
}
```

- [ ] **Step 2: Verify the file compiles (typecheck only — non-zero exit is expected baseline noise)**

```bash
cd refinery && bun run tsc --noEmit 2>&1 | head -40
```

No new errors introduced by this file (baseline noise ~18 lines unchanged).

---

### Task 2: Unit tests for `buildOne` and pure helpers (guards 2–5)

**Files:**

- Create: `refinery/lib/resilient-build.test.mts`

- [ ] **Step 1: Write the test file**

```typescript
// refinery/lib/resilient-build.test.mts
import { test } from "bun:test";
import assert from "node:assert/strict";
import type { PackDefinition } from "../types/pack.mts";
import type { BrainOutputRead } from "./brain-output-reader.mts";
import type { OutputResult } from "../stages/4-output.mts";
import {
  isTransientError,
  isEligibleLastGood,
  classifyFailure,
  computeMasterDecision,
  buildOne,
} from "./resilient-build.mts";

// Minimal PackDefinition for tests — only fields used by resilient-build.mts
function minPack(overrides: Partial<PackDefinition> = {}): PackDefinition {
  return {
    id: "test-pack",
    brain_id: "test-pack",
    domain: "macro",
    scope: "test",
    ttl_seconds: 86400, // 1 day → window = max(2, 1) = 2 days
    sources: [],
    input_brains: [],
    fitScore: () => 1,
    preferences: [],
    activeProject: "test",
    prompts: { triageContext: "", synthesisContext: "" },
    ...overrides,
  } as PackDefinition;
}

function minOutput(refinedAt: string): BrainOutputRead {
  return {
    kind: "ok",
    output: {
      brain_id: "test-pack",
      version: 3,
      refined_at: refinedAt,
      direction: "neutral",
      magnitude: 0.5,
      drivers: [],
      overrides: [],
      conclusion: "test",
      key_metrics: [],
      caveats: [],
      contradicts: [],
      confidence: 0.8,
      joint_integrity: 0.8,
      confidence_dispersion: 0,
      chain_depth: 0,
      trust_tier: 2,
      upstream_count: 0,
      relevance: {
        decay_curve: "days",
        half_life_hours: 24,
        computed_at: refinedAt,
      },
      exogenous_signals: [],
    },
  };
}

// ── isTransientError ───────────────────────────────────────────────────────

test("isTransientError: network keywords → true", () => {
  for (const msg of [
    "socket hang up",
    "ECONNRESET",
    "ETIMEDOUT",
    "fetch failed",
  ]) {
    assert.ok(isTransientError(new Error(msg)), `expected transient: ${msg}`);
  }
});

test("isTransientError: validator/type errors → false", () => {
  for (const msg of [
    "Stage 4: rendered pack failed validation",
    "schema validation failed",
    "TypeError: undefined is not",
  ]) {
    assert.ok(
      !isTransientError(new Error(msg)),
      `expected non-transient: ${msg}`,
    );
  }
});

// ── isEligibleLastGood ─────────────────────────────────────────────────────

test("isEligibleLastGood: 1-day TTL pack → floor = 2 days", () => {
  const pack = minPack({ ttl_seconds: 86400 }); // 1 day → window = max(2,1) = 2
  const twoAgoDays = new Date(
    Date.now() - 2 * 86400_000 + 60_000,
  ).toISOString(); // 2d minus 1min
  assert.ok(isEligibleLastGood(pack, twoAgoDays), "just within 2-day floor");
  const twoAgoExpired = new Date(
    Date.now() - 2 * 86400_000 - 60_000,
  ).toISOString();
  assert.ok(
    !isEligibleLastGood(pack, twoAgoExpired),
    "just outside 2-day floor",
  );
});

test("isEligibleLastGood: 30-day TTL pack → ceiling = 14 days", () => {
  const pack = minPack({ ttl_seconds: 30 * 86400 }); // 30 days → window = min(14,30) = 14
  const fourteenAgo = new Date(
    Date.now() - 14 * 86400_000 + 60_000,
  ).toISOString();
  assert.ok(
    isEligibleLastGood(pack, fourteenAgo),
    "just within 14-day ceiling",
  );
  const tooOld = new Date(Date.now() - 15 * 86400_000).toISOString();
  assert.ok(!isEligibleLastGood(pack, tooOld), "outside 14-day ceiling");
});

// ── classifyFailure ────────────────────────────────────────────────────────

test("classifyFailure: eligible last-good → degraded with lastGoodRefinedAt", () => {
  const pack = minPack({ ttl_seconds: 604_800 }); // 7 days → window = 7
  const refinedAt = new Date(Date.now() - 3 * 86400_000).toISOString(); // 3 days ago
  const read = minOutput(refinedAt);
  const outcome = classifyFailure(pack, new Error("socket hang up"), read);
  assert.equal(outcome.status, "degraded");
  assert.equal(outcome.lastGoodRefinedAt, refinedAt);
  assert.equal(outcome.version, 3);
  assert.ok(outcome.reason?.includes("socket"));
});

test("classifyFailure: ineligible last-good → missing WITH lastGoodRefinedAt", () => {
  const pack = minPack({ ttl_seconds: 86400 }); // 1 day → floor = 2 days
  const oldRefinedAt = new Date(Date.now() - 10 * 86400_000).toISOString(); // 10 days ago
  const read = minOutput(oldRefinedAt);
  const outcome = classifyFailure(
    pack,
    new Error("schema validation failed"),
    read,
  );
  assert.equal(outcome.status, "missing");
  // lastGoodRefinedAt IS set — this is the HOLD trigger
  assert.equal(outcome.lastGoodRefinedAt, oldRefinedAt);
});

test("classifyFailure: never-built (read.kind=missing) → missing WITHOUT lastGoodRefinedAt", () => {
  const pack = minPack();
  const read: BrainOutputRead = { kind: "missing", reason: "file not found" };
  const outcome = classifyFailure(pack, new Error("any error"), read);
  assert.equal(outcome.status, "missing");
  // lastGoodRefinedAt ABSENT — this is the "not-yet-online" case, no HOLD
  assert.equal(outcome.lastGoodRefinedAt, undefined);
});

// ── computeMasterDecision (guards 4–5) ────────────────────────────────────

test("Guard 4 — critical upstream missing WITH lastGoodRefinedAt → HOLD", () => {
  const masterPack = minPack({
    input_brains: [{ id: "cre-swfl", edge_type: "input", critical: true }],
  });
  const outcomes = [
    {
      packId: "cre-swfl",
      status: "missing" as const,
      lastGoodRefinedAt: "2026-01-01T00:00:00Z", // was built, eligibility expired
      written: false,
    },
  ];
  assert.equal(computeMasterDecision(masterPack, outcomes), "held");
});

test("Guard 5 — critical upstream missing WITHOUT lastGoodRefinedAt → no HOLD (not-yet-online)", () => {
  const masterPack = minPack({
    input_brains: [{ id: "cre-swfl", edge_type: "input", critical: true }],
  });
  const outcomes = [
    {
      packId: "cre-swfl",
      status: "missing" as const,
      // no lastGoodRefinedAt — never built
      written: false,
    },
  ];
  assert.equal(computeMasterDecision(masterPack, outcomes), "published");
});

test("Guard 4 variant — non-critical upstream missing → no HOLD regardless", () => {
  const masterPack = minPack({
    input_brains: [{ id: "sector-credit-swfl", edge_type: "input" }], // not critical
  });
  const outcomes = [
    {
      packId: "sector-credit-swfl",
      status: "missing" as const,
      lastGoodRefinedAt: "2026-01-01T00:00:00Z",
      written: false,
    },
  ];
  assert.equal(computeMasterDecision(masterPack, outcomes), "published");
});

// ── buildOne (guards 2–3) ─────────────────────────────────────────────────

const fakeOutputResult: OutputResult = {
  brainPath: "brains/test-pack.md",
  written: true,
  markdown: "",
  version: 4,
  brainOutput: minOutput(new Date().toISOString()).output,
};

test("Guard 3 — deterministic error → runPipeline called exactly once, no retry", async () => {
  let callCount = 0;
  const runPipeline = async () => {
    callCount++;
    throw new Error("Stage 4: rendered pack failed validation");
  };
  const freshAt = new Date(Date.now() - 1 * 86400_000).toISOString();
  const readFn = async () => minOutput(freshAt);
  const pack = minPack({ ttl_seconds: 604_800 });

  const outcome = await buildOne(
    pack,
    { dryRun: false },
    runPipeline,
    readFn,
    0,
  );

  assert.equal(callCount, 1, "must not retry deterministic errors");
  assert.equal(outcome.status, "degraded"); // last-good within 7-day window
});

test("Guard 2 — transient error → retry once, then degraded on eligible last-good", async () => {
  let callCount = 0;
  const runPipeline = async () => {
    callCount++;
    throw new Error("ECONNRESET");
  };
  const freshAt = new Date(Date.now() - 1 * 86400_000).toISOString();
  const readFn = async () => minOutput(freshAt);
  const pack = minPack({ ttl_seconds: 604_800 });

  const outcome = await buildOne(
    pack,
    { dryRun: false },
    runPipeline,
    readFn,
    0,
  );

  assert.equal(callCount, 2, "must retry exactly once");
  assert.equal(outcome.status, "degraded");
});

test("buildOne — success path → built outcome", async () => {
  const runPipeline = async () => fakeOutputResult;
  const pack = minPack();
  const outcome = await buildOne(pack, { dryRun: false }, runPipeline);
  assert.equal(outcome.status, "built");
  assert.equal(outcome.version, 4);
  assert.ok(outcome.written);
});
```

- [ ] **Step 2: Run the new tests**

```bash
bun test refinery/lib/resilient-build.test.mts
```

Expected: all pass. Zero failures.

- [ ] **Step 3: Commit**

```bash
git add refinery/lib/resilient-build.mts refinery/lib/resilient-build.test.mts
git commit -m "feat(resilient): Phase 2 resilient-build lib — types, buildOne, computeMasterDecision"
```

---

### Task 3: CLI `--resilient` walk + `runPipeline` opts threading

**Files:**

- 🔴 Modify: `refinery/cli.mts`

The current cli.mts `runPipeline` function (~lines 60–128) takes `opts: { dryRun: boolean; strict: boolean }` and calls `outputStage(events, pack, fragments, { dryRun: opts.dryRun })`. The main build walk (~lines 163–216) currently hard-throws on a missing upstream at ~lines 185–190.

- [ ] **Step 1: Extend `runPipeline`'s opts type to accept `degradedUpstreamIds`**

Find the `runPipeline` function definition. Change its `opts` type:

```typescript
// Before:
async function runPipeline(
  pack: PackDefinition,
  opts: { dryRun: boolean; strict: boolean },
);

// After:
async function runPipeline(
  pack: PackDefinition,
  opts: {
    dryRun: boolean;
    strict: boolean;
    degradedUpstreamIds?: ReadonlySet<string>;
  },
);
```

Find the `outputStage` call inside `runPipeline` (the only call of `outputStage` in that function). Add `degradedUpstreamIds`:

```typescript
// Before:
const result = await outputStage(events, pack, fragments, {
  dryRun: opts.dryRun,
});

// After:
const result = await outputStage(events, pack, fragments, {
  dryRun: opts.dryRun,
  degradedUpstreamIds: opts.degradedUpstreamIds,
});
```

- [ ] **Step 2: Add `--resilient` flag to the flag parser**

Find the flag parsing block (~lines 24–37) and add:

```typescript
const resilient = args.includes("--resilient");
```

- [ ] **Step 3: Add imports for the new lib and file/path utilities**

At the top of cli.mts, add these two new import lines (cli.mts currently has no `node:fs/promises` or `node:path` import — both are needed for Task 4's report emission):

```typescript
import { writeFile } from "node:fs/promises";
import path from "node:path";
```

Then also add:

```typescript
import {
  buildOne,
  computeMasterDecision,
  type BrainBuildOutcome,
  type BuildReport,
} from "./lib/resilient-build.mts";
```

- [ ] **Step 4: Refactor the build walk to collect outcomes in resilient mode**

The walk currently spans ~lines 163–216. Add the outcome-collection scaffolding. The non-resilient path stays byte-for-byte identical. Filter master out of the main loop in resilient mode and handle it separately after:

```typescript
const outcomes: BrainBuildOutcome[] = [];
const degradedIds = new Set<string>();
const startedAt = new Date().toISOString();

// In resilient mode, master is handled separately after all upstreams so
// computeMasterDecision can inspect the full outcome set before master runs.
const nonMasterOrder = resilient
  ? buildOrder.filter((id) => id !== "master")
  : buildOrder;

for (const id of nonMasterOrder) {
  const pack = getPack(id);
  const status = await brainStatus(id);

  if (!resilient) {
    // --- EXISTING non-resilient path (untouched) ---
    if (status.kind === "missing" && !force) {
      throw new Error(
        `Upstream brain "${id}" has never been built. Run it first or use --force.`,
      );
    }
    if (status.kind === "fresh" && !force) {
      console.log(`[cli] ${id}: fresh — skipping`);
      continue;
    }
    await runPipeline(pack, { dryRun, strict });
    continue;
    // --- end existing path ---
  }

  // --- resilient path ---
  if (status.kind === "fresh" && !force) {
    outcomes.push({ packId: id, status: "skipped-fresh", written: false });
    continue;
  }

  const outcome = await buildOne(pack, { dryRun }, (p, o) =>
    runPipeline(p, {
      dryRun: o.dryRun,
      strict,
      degradedUpstreamIds: o.degradedUpstreamIds,
    }),
  );

  if (outcome.status === "degraded" || outcome.status === "missing") {
    degradedIds.add(id);
  }
  outcomes.push(outcome);
}
```

After the loop, add the resilient master block (replaces what used to be master's slot in the walk):

```typescript
if (resilient) {
  const masterPack = getPack("master");
  const masterStatus = await brainStatus("master");
  let masterDecision: BuildReport["masterDecision"];

  if (masterStatus.kind === "fresh" && !force) {
    masterDecision = "skipped-fresh";
    outcomes.push({
      packId: "master",
      status: "skipped-fresh",
      written: false,
    });
  } else {
    const decision = computeMasterDecision(masterPack, outcomes);
    if (decision === "held") {
      masterDecision = "held";
      console.warn(
        "[cli] HOLD: one or more critical upstreams have an expired last-good. Master not rebuilt.",
      );
      outcomes.push({
        packId: "master",
        status: "missing",
        reason: "HOLD: critical upstream eligibility expired",
        written: false,
      });
    } else {
      masterDecision = "published";
      const masterOutcome = await buildOne(
        masterPack,
        { dryRun, degradedUpstreamIds: degradedIds },
        (p, o) =>
          runPipeline(p, {
            dryRun: o.dryRun,
            strict,
            degradedUpstreamIds: o.degradedUpstreamIds,
          }),
      );
      outcomes.push(masterOutcome);
    }
  }
  // ... emit report, exit (Task 4 adds this block here)
}
```

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
bun test refinery/
```

Expected: 902+ pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add refinery/cli.mts
git commit -m "feat(cli): --resilient flag — outcome-collection walk, degradedIds threading, HOLD gate"
```

---

### Task 4: Build report emission + exit codes

**Files:**

- 🔴 Modify: `refinery/cli.mts`

- [ ] **Step 1: Add report emission and exit code logic after the master block**

Replace the `// ... emit report, exit (Task 4 adds this block here)` comment with:

```typescript
// Determine exit code:
// 0 — all built/skipped-fresh, no degraded or missing
// 2 — degraded-but-complete (≥1 degraded/missing, master published/skipped)
// 1 — master HELD or run crashed
const hasDegradedOrMissing = outcomes.some(
  (o) => o.status === "degraded" || o.status === "missing",
);
const masterHeld = masterDecision === "held";
const exitCode: 0 | 1 | 2 = masterHeld ? 1 : hasDegradedOrMissing ? 2 : 0;

const report: BuildReport = {
  target: packId,
  timestamps: { started: startedAt, finished: new Date().toISOString() },
  source: env.source,
  outcomes,
  exitCode,
  masterDecision,
};

const reportPath = path.join(process.cwd(), "brains", "_build-report.json");
if (!dryRun) {
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[cli] build report → ${reportPath} (exit ${exitCode})`);
}

if (exitCode !== 0) process.exit(exitCode);
```

- [ ] **Step 2: Run full test suite**

```bash
bun test refinery/
```

Expected: 902+ pass, 0 fail.

- [ ] **Step 3: Smoke test on `labor-demand-swfl --resilient`**

```bash
cd refinery && bun run cli.mts labor-demand-swfl --resilient --dry-run 2>&1
```

Expected: completes without crash, no HOLD messages (labor-demand-swfl is a leaf brain with no critical upstreams). Outcome will be `skipped-fresh` or a build attempt depending on freshness.

- [ ] **Step 4: Commit**

```bash
git add refinery/cli.mts
git commit -m "feat(cli): build report emission + exit codes 0/1/2 for resilient mode"
```

---

### Task 5: Wire `degradedIds` into `harvestUpstreams` (Phase 3)

**Files:**

- Modify: `refinery/stages/4-output.mts`

`harvestUpstreams` (~lines 142–177) returns `UpstreamHarvest` which already has `degradedUpstreamIds: ReadonlySet<string>` (Phase 1 stub, always `new Set()`). Now we populate it and add `degradationCaveats` + `degradedUpstreamDates`.

**Degradation caveat format** (distinct from staleness caveat format):

```
"Upstream brain '{id}' failed to rebuild on {today}; using last good read from {YYYY-MM-DD} (v{version})."
```

- [ ] **Step 1: Add `degradationCaveats` and `degradedUpstreamDates` to `UpstreamHarvest` interface**

```typescript
export interface UpstreamHarvest {
  upstreams: UpstreamConfidence[];
  stalenessCaveats: string[];
  /** Caveat per degraded upstream (failed rebuild, using last-good). */
  degradationCaveats: string[];
  /** ISO YYYY-MM-DD of last-good read per degraded upstream id. */
  degradedUpstreamDates: Map<string, string>;
  minStaleUpstreamConfidence: number; // staleness and degradation both feed this floor
  degradedUpstreamIds: ReadonlySet<string>;
}
```

- [ ] **Step 2: Add `degradedIds` parameter to `harvestUpstreams` and populate the new fields**

Change the signature:

```typescript
export async function harvestUpstreams(
  input_brains: readonly BrainEdge[],
  degradedIds: ReadonlySet<string> = new Set(),
): Promise<UpstreamHarvest>;
```

Add locals at the top of the function (alongside existing `stalenessCaveats` and `minStaleUpstreamConfidence`):

```typescript
const degradationCaveats: string[] = [];
const degradedUpstreamDates = new Map<string, string>();
// Rename local from minStaleUpstreamConfidence → minCappedUpstreamConfidence
// (staleness and degradation both feed this floor; return key stays unchanged).
let minCappedUpstreamConfidence = Infinity;
```

In the existing loop, **before** the existing `if (read.kind === "missing") { throw ... }` block, add a soft-skip guard for missing degraded upstreams (so a non-critical upstream with no `.md` file doesn't crash master in resilient mode — `computeMasterDecision` already blocked master for critical missing upstreams):

```typescript
if (read.kind === "missing" && degradedIds.has(upstream.id)) {
  // Soft-skip: no last-good file on disk; computeMasterDecision already held
  // master if this was critical. Non-critical: add a hole caveat, skip contribution.
  degradationCaveats.push(
    `Upstream brain '${upstream.id}' was unavailable at build time (no last-good read).`,
  );
  continue;
}
```

Inside the `if (status.kind === "stale")` block, replace `minStaleUpstreamConfidence` with `minCappedUpstreamConfidence`. Then add the degradation check immediately after the staleness check:

```typescript
if (degradedIds.has(upstream.id) && read.kind === "ok") {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = read.output.refined_at.slice(0, 10);
  degradationCaveats.push(
    `Upstream brain '${upstream.id}' failed to rebuild on ${today}; using last good read from ${lastDate} (v${read.output.version}).`,
  );
  degradedUpstreamDates.set(upstream.id, lastDate);
  minCappedUpstreamConfidence = Math.min(
    minCappedUpstreamConfidence,
    read.output.confidence,
  );
}
```

Update the return:

```typescript
return {
  upstreams,
  stalenessCaveats,
  degradationCaveats,
  degradedUpstreamDates,
  minStaleUpstreamConfidence: minCappedUpstreamConfidence,
  degradedUpstreamIds: new Set(
    [...degradedIds].filter((id) => input_brains.some((e) => e.id === id)),
  ),
};
```

- [ ] **Step 3: Thread `degradedIds` from `outputStage` opts into `harvestUpstreams`**

Find the `harvestUpstreams` call in `outputStage` (~line 347). Update the destructure and call:

```typescript
const {
  upstreams,
  stalenessCaveats,
  degradationCaveats,
  degradedUpstreamDates,
  minStaleUpstreamConfidence,
} = await harvestUpstreams(
  pack.input_brains,
  opts.degradedUpstreamIds ?? new Set(),
);
```

- [ ] **Step 4: Append `degradationCaveats` to caveats and populate `degraded_inputs` in the brainOutput assembly**

Find where `stalenessCaveats` are appended (~line 416):

```typescript
caveats.push(...stalenessCaveats);
// Add:
caveats.push(...degradationCaveats);
```

Find the `degraded_inputs: undefined` stub in the `brainOutput` assembly (~line 463). Replace:

```typescript
degraded_inputs:
  degradationCaveats.length > 0
    ? [...(opts.degradedUpstreamIds ?? new Set())]
        .filter((id) => pack.input_brains.some((e) => e.id === id && e.critical))
        .map((id) => ({
          label: PACKS[id]?.public_label ?? "a regional input",
          date:
            degradedUpstreamDates.get(id) ??
            new Date().toISOString().slice(0, 10),
        }))
    : undefined,
```

- [ ] **Step 5: Run full test suite**

```bash
bun test refinery/
```

Expected: 902+ pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add refinery/stages/4-output.mts
git commit -m "feat(harvest): Phase 3 — wire degradedIds into harvestUpstreams, populate degraded_inputs"
```

---

### Task 6: Speaker token rendering (Phase 5)

**Files:**

- Modify: `refinery/render/speaker.mts`
- Modify: `refinery/render/speaker.test.mts`

The speaker's `renderTier2` (~lines 276–335) builds a `blocks` array joined with `"\n\n"`. The token appears as a compact block immediately after the conclusion (before metrics), not as a named section.

**Token format:** `_(Label · Jan 15, 2024)_` per entry, joined with a space if multiple. Italic keeps it visually subordinate to the conclusion.

- [ ] **Step 1: Add `formatDegradedToken` helper to `speaker.mts`**

Add after the `MAX_DISPLAY_CAVEATS` constant (~line 219):

```typescript
/** Format one degraded-input token: "_(Label · Jun 1, 2026)_". */
function formatDegradedToken(entry: { label: string; date: string }): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(entry.date + "T12:00:00Z"));
  return `_(${entry.label} · ${formatted})_`;
}
```

- [ ] **Step 2: Insert tokens in `renderTier2` after the conclusion push**

`renderTier2` pushes scope and conclusion as **two separate** blocks. Find the conclusion push (~line 280) — it is the second of these two lines:

```typescript
blocks.push(`**${sanitizeProse(humanScope(brain.scope))}**`);
blocks.push(sanitizeProse(out.conclusion)); // ← anchor this line
```

Add immediately after `blocks.push(sanitizeProse(out.conclusion));`:

```typescript
if (out.degraded_inputs && out.degraded_inputs.length > 0) {
  const tokens = out.degraded_inputs.map(formatDegradedToken).join(" ");
  blocks.push(tokens);
}
```

- [ ] **Step 3: Also add in `renderTier1`**

`renderTier1` uses **string concatenation**, not a blocks array. Replace the function body as follows:

```typescript
// Before:
function renderTier1(brain: ParsedBrain, reportLink: string | null): string {
  const headline = oneLineHeadline(brain.output);
  const conclusion = sanitizeProse(brain.output.conclusion);
  const link = reportLink ? `\n\nFull breakdown → ${reportLink}` : "";
  return `${headline} ${conclusion}${link}\n\n_Freshness:_ \`${brain.freshness_token}\``;
}

// After:
function renderTier1(brain: ParsedBrain, reportLink: string | null): string {
  const headline = oneLineHeadline(brain.output);
  const conclusion = sanitizeProse(brain.output.conclusion);
  const degradedToken =
    brain.output.degraded_inputs && brain.output.degraded_inputs.length > 0
      ? "\n\n" + brain.output.degraded_inputs.map(formatDegradedToken).join(" ")
      : "";
  const link = reportLink ? `\n\nFull breakdown → ${reportLink}` : "";
  return `${headline} ${conclusion}${degradedToken}${link}\n\n_Freshness:_ \`${brain.freshness_token}\``;
}
```

- [ ] **Step 4: Write rendering tests in `speaker.test.mts`**

Add a new `describe` block at the end of the file (before the final `});`):

```typescript
describe("degraded_inputs token rendering", () => {
  test("renderTier2: degraded_inputs → (Label · Date) tokens appear after conclusion", () => {
    const brain = parsedFixture({
      degraded_inputs: [
        { label: "Flood & Environment", date: "2024-01-15" },
        { label: "US Macro", date: "2026-06-01" },
      ],
    });
    const md = speak(brain, { tier: 2 });
    assert.match(md, /\(Flood & Environment · Jan 15, 2024\)/);
    assert.match(md, /\(US Macro · Jun 1, 2026\)/);
  });

  test("renderTier2: no degraded_inputs → no token block", () => {
    const brain = parsedFixture({ degraded_inputs: undefined });
    const md = speak(brain, { tier: 2 });
    assert.ok(!md.includes("·"), "should contain no · tokens");
  });

  test("renderTier2: empty degraded_inputs array → no token block", () => {
    const brain = parsedFixture({ degraded_inputs: [] });
    const md = speak(brain, { tier: 2 });
    assert.ok(!md.includes("·"), "empty array should produce no tokens");
  });

  test("safe guard: label 'a regional input' renders as-is (bootstrapping window)", () => {
    const brain = parsedFixture({
      degraded_inputs: [{ label: "a regional input", date: "2026-06-01" }],
    });
    const md = speak(brain, { tier: 2 });
    assert.match(md, /a regional input/);
  });
});
```

`parsedFixture` (line 88 of speaker.test.mts) calls `outputFixture(overrides: Partial<BrainOutput>)` — passing `degraded_inputs` directly works.

- [ ] **Step 5: Run speaker tests**

```bash
bun test refinery/render/speaker.test.mts
```

Expected: all pass including the 4 new tests.

- [ ] **Step 6: Run full suite**

```bash
bun test refinery/
```

Expected: 906+ pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add refinery/render/speaker.mts refinery/render/speaker.test.mts
git commit -m "feat(speaker): Phase 5 — render degraded_inputs (Label · Date) tokens in tier-1/2 output"
```

---

## Verification

### End-to-end (resilient mode, fixture source)

```bash
cd refinery
REFINERY_SOURCE=fixture bun run cli.mts master --resilient --dry-run 2>&1
```

Expected: completes without crash, no HOLD messages (all fixture upstreams succeed in fixture mode), `degraded_inputs` absent from the dry-run output.

### Full test suite

```bash
bun test refinery/
```

Expected: 906+ pass, 0 changed existing assertions.

### Session log + push

Update `SESSION_LOG.md` (top-of-file entry). Then:

```bash
node scripts/safe-push.mjs
```

---

## Done-Test

`bun test refinery/` fully green (906+ pass, 0 changed existing assertions) + `brains/_build-report.json` written on a `--resilient` non-dry-run + speaker renders `_(Label · Date)_` tokens when `degraded_inputs` is populated.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 3, Task 4 | `refinery/cli.mts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
