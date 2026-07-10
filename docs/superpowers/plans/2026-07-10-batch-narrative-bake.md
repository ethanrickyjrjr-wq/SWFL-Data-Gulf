# Batch Narrative Bake + Overnight Cron Replan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 12 files, keywords: migration, schema, architecture

**Goal:** Move the narrative bake to the Message Batches API (50% token cost) with metering at the one client seam, and re-anchor the overnight cron chain (rebuild 04:23 UTC → bake on rebuild completion → digest 14:23 UTC).

**Architecture:** Extend `refinery/agents/anthropic.mts` so the existing message-surface Proxy also wraps `batches` (spend gate on submit, per-result usage logging at half rates on collect). Rework `scripts/bake-narratives.mts` into three phases (collect-pending → assemble+submit → poll+collect) with a `narrative_bake_batches` handoff table so a died run's results are collected next run. Workflow files get the new anchors.

**Tech Stack:** TypeScript (bun), `@anthropic-ai/sdk` (`client.messages.batches`), Supabase JS, GitHub Actions, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-07-10-batch-narrative-bake-design.md` (evidence + decisions live there).

## Global Constraints

- Never invent a number: estimates are LABELED estimates; logged costs come only from returned `usage`.
- Batch pricing = 50% of standard on ALL token classes (verified 07/10/2026, vendor docs).
- `custom_id` must match `^[a-zA-Z0-9_-]{1,64}$` — generated ids only, never encoded surface/key.
- Delta gate, cadence gate, dry-run, mock behavior of the bake are UNCHANGED. Dry-run never submits.
- Stage explicit paths only (`git add <paths>`); NEVER `git add -A`; never push without operator confirmation; SESSION_LOG entry before any push.
- Verify TS with `bunx next build` where app code is touched; these files are script/refinery — `bun test` + `bun --bun tsc`-free (bun runs .mts directly; rely on tests + next build).
- All tests offline (no network, no ANTHROPIC_API_KEY needed — mock mode).

---

### Task 1: `computeCostUsd` batch flag

**Files:**
- 🔴 Modify: `refinery/agents/anthropic.mts` (function `computeCostUsd`, ~line 84)
- 🔴 Modify: `refinery/agents/anthropic.test.mts`

**Interfaces:**
- Consumes: existing `RATES`, `UsageLike`.
- Produces: `computeCostUsd(model: string, usage: UsageLike, opts?: { batch?: boolean }): number` — third param optional, `{batch: true}` halves the total. Existing 2-arg callers unchanged.

- [ ] **Step 1: Write the failing test** — append to `refinery/agents/anthropic.test.mts`:

```ts
describe("computeCostUsd batch flag", () => {
  test("batch: true halves the full-rate total (all token classes)", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    };
    const full = computeCostUsd("claude-sonnet-4-6", usage);
    const batch = computeCostUsd("claude-sonnet-4-6", usage, { batch: true });
    // full = 3 + 15 + 3*0.1 + 3*1.25 = 22.05 ; batch = exactly half
    assert.equal(full, 22.05);
    assert.equal(batch, 11.025);
  });

  test("omitting opts is unchanged behavior", () => {
    const usage = { input_tokens: 2_000_000, output_tokens: 0 };
    assert.equal(computeCostUsd("claude-sonnet-4-6", usage), 6.0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test refinery/agents/anthropic.test.mts`
Expected: FAIL — batch result equals full (flag ignored / TS error on 3rd arg).

- [ ] **Step 3: Implement** — in `computeCostUsd`:

```ts
export function computeCostUsd(
  model: string,
  usage: UsageLike,
  opts?: { batch?: boolean },
): number {
  const rate = RATES[model] ?? RATES[baseModelId(model)];
  if (!rate) return 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const full =
    (usage.input_tokens / 1_000_000) * rate.in +
    (usage.output_tokens / 1_000_000) * rate.out +
    (cacheRead / 1_000_000) * rate.in * CACHE_READ_FRACTION +
    (cacheWrite / 1_000_000) * rate.in * CACHE_WRITE_PREMIUM;
  // Batches API: 50% of standard prices on ALL usage (vendor docs, verified 07/10/2026).
  return opts?.batch ? full * 0.5 : full;
}
```

Also thread the flag through `logApiUsage`: add `batch?: boolean` to `LogApiUsageOpts` and change the insert's `cost_usd:` line to `computeCostUsd(opts.model, opts.usage, { batch: opts.batch ?? false })`.

- [ ] **Step 4: Run tests** — `bun test refinery/agents/anthropic.test.mts` → PASS (all pre-existing tests too).

- [ ] **Step 5: Commit**

```bash
git add refinery/agents/anthropic.mts refinery/agents/anthropic.test.mts
git commit -m "feat(spend): computeCostUsd batch flag — Batches API bills 50% on all usage"
```

---

### Task 2: `wrapBatchesSurface` + Proxy wiring

**Files:**
- 🔴 Modify: `refinery/agents/anthropic.mts`
- 🔴 Modify: `refinery/agents/anthropic.test.mts`

**Interfaces:**
- Consumes: `checkSpendGuardAsync()`, `logApiUsage` (with `batch` flag from Task 1), `CallType`.
- Produces: `wrapBatchesSurface<B extends BatchesSurfaceLike>(real: B, callType: CallType): B` (exported for tests). `wrapMessageSurface`'s Proxy `get` trap additionally intercepts `"batches"` and returns the wrapped surface (memoized) — so `getAnthropic(ct).messages.batches` and `.beta.messages.batches` are both metered with zero call-site changes.

- [ ] **Step 1: Write the failing test** — append to `refinery/agents/anthropic.test.mts`:

```ts
describe("wrapBatchesSurface", () => {
  test("create runs the spend gate; results logs each succeeded result at batch rates", async () => {
    const seen: string[] = [];
    async function* fakeResults() {
      yield {
        custom_id: "req-0",
        result: {
          type: "succeeded",
          message: {
            model: "claude-sonnet-4-6",
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      };
      yield { custom_id: "req-1", result: { type: "errored", error: { type: "api_error" } } };
    }
    const fake = {
      create: async (body: unknown) => {
        seen.push("create");
        return { id: "msgbatch_test", processing_status: "in_progress", body };
      },
      results: async (_id: string) => fakeResults(),
      retrieve: async (_id: string) => ({ id: "msgbatch_test", processing_status: "ended" }),
    };
    const wrapped = wrapBatchesSurface(fake, "narrative_bake");
    const batch = await wrapped.create({ requests: [] });
    assert.equal((batch as { id: string }).id, "msgbatch_test");
    assert.ok(seen.includes("create"));
    // results: iterating must yield BOTH results untouched (logging is fire-and-forget)
    const out: string[] = [];
    for await (const r of await wrapped.results("msgbatch_test")) {
      out.push((r as { custom_id: string }).custom_id);
    }
    assert.deepEqual(out, ["req-0", "req-1"]);
    // retrieve (and any other prop) forwards through untouched
    const st = await wrapped.retrieve("msgbatch_test");
    assert.equal((st as { processing_status: string }).processing_status, "ended");
  });
});

describe("messages proxy exposes metered batches", () => {
  test("wrapMessageSurface intercepts .batches and memoizes the wrapper", () => {
    const fakeMessages = {
      create: async () => ({}),
      stream: () => ({ finalMessage: async () => ({ model: "m", usage: { input_tokens: 0, output_tokens: 0 } }) }),
      batches: { create: async () => ({}), results: async () => (async function* () {})() },
    };
    const wrapped = wrapMessageSurface(fakeMessages as never, "narrative_bake") as unknown as {
      batches: unknown;
    };
    assert.notEqual(wrapped.batches, fakeMessages.batches); // wrapped, not passthrough
    assert.equal(wrapped.batches, wrapped.batches); // memoized
  });
});
```

(Mock mode: tests run without `ANTHROPIC_API_KEY`, so `checkSpendGuardAsync` short-circuits — matches the existing spend-guard test approach in this file.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test refinery/agents/anthropic.test.mts`
Expected: FAIL — `wrapBatchesSurface` not exported; `wrapped.batches === fakeMessages.batches` (passthrough).

- [ ] **Step 3: Implement** — in `refinery/agents/anthropic.mts`, below `wrapMessageSurface`:

```ts
/** A BATCHES surface is any object exposing `create` / `results`. Both the
 *  regular and beta clients reach theirs via `<messages>.batches`, which the
 *  wrapMessageSurface proxy below routes through this wrapper — closing the
 *  hole where `client.messages.batches` dodged the meter entirely.
 *  `create` runs the SAME daily/monthly spend gate as every other call path
 *  (pre-submit; actual spend lands at collection — documented softness, same
 *  class as the post-call logging note above). `results` wraps the streamed
 *  iterator and logs each succeeded result's REAL usage at batch rates
 *  (Batches API = 50% of standard on all usage, verified 07/10/2026). */
export interface BatchesSurfaceLike {
  create: (...args: never[]) => unknown;
  results: (...args: never[]) => unknown;
}

interface BatchResultLike {
  result?: {
    type?: string;
    message?: { model: string; usage: UsageLike };
  };
}

export function wrapBatchesSurface<B extends BatchesSurfaceLike>(real: B, callType: CallType): B {
  const realCreate = real.create.bind(real) as (...args: unknown[]) => Promise<unknown>;
  const realResults = real.results.bind(real) as (...args: unknown[]) => Promise<AsyncIterable<unknown>>;

  const wrappedCreate = async (...args: unknown[]) => {
    await checkSpendGuardAsync(); // throws SpendCapError on breach — never a silent drain
    return realCreate(...args);
  };

  const wrappedResults = async (...args: unknown[]) => {
    const iter = await realResults(...args);
    async function* metered() {
      for await (const item of iter) {
        const r = item as BatchResultLike;
        if (r.result?.type === "succeeded" && r.result.message) {
          void logApiUsage({
            model: r.result.message.model,
            callType,
            usage: r.result.message.usage,
            batch: true,
          }).catch((e) => console.error("[api-usage-log] batch result hook failed:", e));
        }
        yield item;
      }
    }
    return metered();
  };

  return new Proxy(real, {
    get(target, prop, _receiver) {
      if (prop === "create") return wrappedCreate;
      if (prop === "results") return wrappedResults;
      return Reflect.get(target, prop, target);
    },
  });
}
```

Then in `wrapMessageSurface`, memoize + intercept (add just above its `return new Proxy(...)`, and a new branch in the trap):

```ts
  let wrappedBatches: unknown;

  return new Proxy(real, {
    get(target, prop, _receiver) {
      if (prop === "create") return wrappedCreate;
      if (prop === "stream") return wrappedStream;
      if (prop === "batches") {
        const rawBatches = Reflect.get(target, prop, target);
        if (!rawBatches) return rawBatches; // surface without batches (defensive)
        wrappedBatches ??= wrapBatchesSurface(rawBatches as BatchesSurfaceLike, callType);
        return wrappedBatches;
      }
      return Reflect.get(target, prop, target);
    },
  });
```

Update `MessageSurfaceLike`'s doc comment to mention batches routing (no shape change — `batches` stays optional via the trap, not the interface).

- [ ] **Step 4: Run tests** — `bun test refinery/agents/anthropic.test.mts refinery/agents/spend-guard.test.mts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add refinery/agents/anthropic.mts refinery/agents/anthropic.test.mts
git commit -m "feat(spend): meter messages.batches at the one seam — gate on create, half-rate log per result"
```

---

### Task 3: `narrative_bake_batches` table (migration)

**Files:**
- Create: `migrations/20260710_narrative_bake_batches.sql`

**Interfaces:**
- Produces: table `public.narrative_bake_batches` — columns `batch_id text primary key`, `requests jsonb not null`, `submitted_at timestamptz not null default now()`, `collected_at timestamptz null`. Service-role only (internal bookkeeping; no public read).

- [ ] **Step 1: Write the migration** (mirror `migrations/20260709_narratives.sql` — idempotent, RLS, PostgREST reload):

```sql
-- Batch-bake handoff bookkeeping (spec: docs/superpowers/specs/
-- 2026-07-10-batch-narrative-bake-design.md §3). One row per submitted
-- Message Batch; `requests` maps custom_id -> {surface, key, inputsHash}.
-- A row with null collected_at is pending — next bake run's Phase 0 collects.
-- Idempotent — safe to re-run.

create table if not exists public.narrative_bake_batches (
  batch_id     text        primary key,
  requests     jsonb       not null,
  submitted_at timestamptz not null default now(),
  collected_at timestamptz
);

alter table public.narrative_bake_batches enable row level security;

-- Internal bookkeeping: service_role only, no public policies.
grant select, insert, update, delete on public.narrative_bake_batches to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run it** (creds in `.dlt/secrets.toml`, psql not installed — use the Bun runner):

```bash
bun scripts/run-migration.ts migrations/20260710_narrative_bake_batches.sql
```

Expected: `✓ done` / `Migrations complete.`

- [ ] **Step 3: Verify** (row count + PostgREST visibility):

```bash
bun -e "const{createClient}=await import('@supabase/supabase-js');const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});const{count,error}=await sb.from('narrative_bake_batches').select('*',{count:'exact',head:true});console.log('count',count,'error',error?.message??null)"
```

Expected: `count 0 error null` (a PostgREST "relation does not exist" here means the schema reload hasn't landed — re-run the migration; the `notify pgrst` line is what fixes it).

- [ ] **Step 4: Commit**

```bash
git add migrations/20260710_narrative_bake_batches.sql
git commit -m "feat(bake): narrative_bake_batches handoff table — pending batch survives a died run"
```

---

### Task 4: batch store module

**Files:**
- Create: `lib/narratives/batch-store.ts`

**Interfaces:**
- Consumes: table from Task 3; same env-based Supabase client pattern as `lib/narratives/store.ts`.
- Produces (exact — the bake script imports these in Task 6):

```ts
export interface BatchRequestEntry {
  customId: string;
  surface: string;
  key: string;
  inputsHash: string;
}
export interface PendingBatch {
  batchId: string;
  requests: BatchRequestEntry[];
  submittedAt: string;
}
export async function persistPendingBatch(batchId: string, requests: BatchRequestEntry[]): Promise<void>;
export async function loadPendingBatches(): Promise<PendingBatch[]>;
export async function markBatchCollected(batchId: string): Promise<void>;
```

- [ ] **Step 1: Implement** (no unit test — network-only module, matching `store.ts` which is also untested; correctness lands in the live verify):

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * narrative_bake_batches access — batch-bake handoff bookkeeping (spec
 * 2026-07-10-batch-narrative-bake-design.md §3). A row with null collected_at
 * is pending; Phase 0 of the bake collects it. Untyped client: table ships
 * ahead of the next database-generated.types regen (allowlisted in
 * verification/supabase-untyped-allowlist.json).
 */

export interface BatchRequestEntry {
  customId: string;
  surface: string;
  key: string;
  inputsHash: string;
}

export interface PendingBatch {
  batchId: string;
  requests: BatchRequestEntry[];
  submittedAt: string;
}

function client(): SupabaseClient | null {
  const u = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) return null;
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Persist BEFORE polling — a died run must leave a collectable trail. Throws loud. */
export async function persistPendingBatch(
  batchId: string,
  requests: BatchRequestEntry[],
): Promise<void> {
  const sb = client();
  if (!sb) throw new Error("narrative_bake_batches: SUPABASE_URL / SUPABASE_SERVICE_KEY not configured");
  const { error } = await sb
    .from("narrative_bake_batches")
    .upsert({ batch_id: batchId, requests }, { onConflict: "batch_id" });
  if (error) throw new Error(`persistPendingBatch(${batchId}) failed: ${error.message}`);
}

/** Uncollected rows, oldest first. Empty on missing config (offline dev). */
export async function loadPendingBatches(): Promise<PendingBatch[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from("narrative_bake_batches")
    .select("batch_id, requests, submitted_at")
    .is("collected_at", null)
    .order("submitted_at", { ascending: true });
  if (error || !data) return [];
  return (data as { batch_id: string; requests: BatchRequestEntry[]; submitted_at: string }[]).map(
    (r) => ({ batchId: r.batch_id, requests: r.requests, submittedAt: r.submitted_at }),
  );
}

export async function markBatchCollected(batchId: string): Promise<void> {
  const sb = client();
  if (!sb) throw new Error("narrative_bake_batches: SUPABASE_URL / SUPABASE_SERVICE_KEY not configured");
  const { error } = await sb
    .from("narrative_bake_batches")
    .update({ collected_at: new Date().toISOString() })
    .eq("batch_id", batchId);
  if (error) throw new Error(`markBatchCollected(${batchId}) failed: ${error.message}`);
}
```

- [ ] **Step 2: Allowlist the untyped client** — add `"lib/narratives/batch-store.ts"` to `verification/supabase-untyped-allowlist.json` (alphabetical position; check the file's existing format first).

- [ ] **Step 3: Type-check via the app build** (allowlist + module compile):

Run: `bunx next build`
Expected: clean (module is script-side only, but the allowlist check runs here).

- [ ] **Step 4: Commit**

```bash
git add lib/narratives/batch-store.ts verification/supabase-untyped-allowlist.json
git commit -m "feat(bake): batch-store — persist/load/mark the pending-batch handoff"
```

---

### Task 5: cap sizing (pure + tested)

**Files:**
- Create: `lib/narratives/batch-estimate.ts`
- Create: `lib/narratives/batch-estimate.test.ts`

**Interfaces:**
- Consumes: `computeCostUsd` (Task 1), `SYNTHESIS_MODEL`, `NARRATIVE_MAX_TOKENS`.
- Produces:

```ts
export function estimateRequestUsd(promptChars: number): number;
export function sizeToCap<T extends { promptChars: number }>(
  items: T[],
  capUsd: number,
): { fit: T[]; dropped: T[]; estimatedUsd: number };
```

- [ ] **Step 1: Write the failing test** — `lib/narratives/batch-estimate.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { estimateRequestUsd, sizeToCap } from "./batch-estimate";

describe("estimateRequestUsd", () => {
  it("prices chars/4 input + full output ceiling at BATCH rates", () => {
    // 4M chars -> 1M input tokens @ $1.50 batch + 1400 output tokens @ $7.50/MTok batch
    expect(estimateRequestUsd(4_000_000)).toBeCloseTo(1.5 + (1400 / 1_000_000) * 7.5, 6);
  });
});

describe("sizeToCap", () => {
  it("keeps items in order until the cap, drops the rest", () => {
    const items = [
      { promptChars: 4_000_000, key: "a" },
      { promptChars: 4_000_000, key: "b" },
      { promptChars: 4_000_000, key: "c" },
    ];
    const { fit, dropped, estimatedUsd } = sizeToCap(items, 3.1);
    expect(fit.map((i) => i.key)).toEqual(["a", "b"]);
    expect(dropped.map((i) => i.key)).toEqual(["c"]);
    expect(estimatedUsd).toBeCloseTo(2 * estimateRequestUsd(4_000_000), 6);
  });
  it("zero items fits trivially", () => {
    expect(sizeToCap([], 1)).toEqual({ fit: [], dropped: [], estimatedUsd: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test lib/narratives/batch-estimate.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `lib/narratives/batch-estimate.ts`:

```ts
import { computeCostUsd, SYNTHESIS_MODEL } from "../../refinery/agents/anthropic.mts";
import { NARRATIVE_MAX_TOKENS } from "./prompt";

/**
 * Pre-submit run-cap sizing for the batch bake — a LABELED estimate, never a
 * measurement: chars/4 ≈ input tokens, plus the full output ceiling, priced at
 * BATCH rates via the one cost root (computeCostUsd batch flag). Real spend is
 * logged from returned usage at collection; this only sizes the submission.
 */
export function estimateRequestUsd(promptChars: number): number {
  return computeCostUsd(
    SYNTHESIS_MODEL,
    { input_tokens: Math.ceil(promptChars / 4), output_tokens: NARRATIVE_MAX_TOKENS },
    { batch: true },
  );
}

/** Greedy in-order fit against the cap; dropped items are reported, never silent. */
export function sizeToCap<T extends { promptChars: number }>(
  items: T[],
  capUsd: number,
): { fit: T[]; dropped: T[]; estimatedUsd: number } {
  const fit: T[] = [];
  const dropped: T[] = [];
  let estimatedUsd = 0;
  for (const item of items) {
    const cost = estimateRequestUsd(item.promptChars);
    if (estimatedUsd + cost <= capUsd) {
      fit.push(item);
      estimatedUsd += cost;
    } else {
      dropped.push(item);
    }
  }
  return { fit, dropped, estimatedUsd };
}
```

- [ ] **Step 4: Run tests** — `bun test lib/narratives/batch-estimate.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/narratives/batch-estimate.ts lib/narratives/batch-estimate.test.ts
git commit -m "feat(bake): batch-rate cap sizing — labeled estimate through the one cost root"
```

---

### Task 6: three-phase bake script

**Files:**
- Modify: `scripts/bake-narratives.mts` (replace the per-key `messages.create` loop, lines ~112–195; keep parseArgs, SURFACE_ADAPTERS, runCapUsd, parseSections, cadence/mock gates untouched)

**Interfaces:**
- Consumes: `wrapBatchesSurface`-metered `getAnthropic("narrative_bake").messages.batches` (Task 2), `persistPendingBatch`/`loadPendingBatches`/`markBatchCollected` (Task 4), `sizeToCap`/`estimateRequestUsd` (Task 5), existing `buildNarrativePrompt`, `validateNarrative`, `upsertNarrative`, `loadInputsHashes`, `inputsHash`.
- Produces: same CLI (`--surface zip|corridor|brain|all [--keys ...] [--force] [--dry-run]`), same exit semantics (failures → 1). New env knobs: `BAKE_POLL_INTERVAL_MS` (default 60000), `BAKE_POLL_DEADLINE_MS` (default 4800000 = 80 min).

- [ ] **Step 1: Add the landing helper + phase functions** — new code in `scripts/bake-narratives.mts` (above `main`):

```ts
import { getAnthropic, agentsAreMocked, SYNTHESIS_MODEL } from "../refinery/agents/anthropic.mts";
import {
  persistPendingBatch,
  loadPendingBatches,
  markBatchCollected,
  type BatchRequestEntry,
} from "../lib/narratives/batch-store";
import { sizeToCap } from "../lib/narratives/batch-estimate";

type WorkItem = {
  entry: BatchRequestEntry;
  inputs: BakeInputs;
  system: string;
  user: string;
  promptChars: number;
};

const POLL_INTERVAL_MS = Number(process.env.BAKE_POLL_INTERVAL_MS) || 60_000;
const POLL_DEADLINE_MS = Number(process.env.BAKE_POLL_DEADLINE_MS) || 80 * 60_000;

/** Validate + upsert one result. Returns "baked" | "failed". Previous row is
 *  kept on any failure (upsert only runs after a clean validate) — same
 *  semantics as the old per-key loop. */
async function landResult(
  entry: BatchRequestEntry,
  inputs: BakeInputs,
  rawText: string,
  model: string,
): Promise<"baked" | "failed"> {
  let sections;
  try {
    sections = parseSections(rawText);
  } catch (e) {
    console.error(
      `[bake] ${entry.surface}/${entry.key} response not parseable (previous row kept):`,
      e instanceof Error ? e.message : e,
    );
    return "failed";
  }
  const errors = validateNarrative(sections, inputs);
  if (errors.length > 0) {
    console.error(
      `[bake] ${entry.surface}/${entry.key} FAILED validation (previous row kept):\n  ${errors.join("\n  ")}`,
    );
    return "failed";
  }
  await upsertNarrative({
    surface: entry.surface,
    surface_key: entry.key,
    sections,
    inputs_hash: entry.inputsHash,
    sources: inputs.sources,
    model,
  });
  return "baked";
}

type BatchResultRow = {
  custom_id: string;
  result: {
    type: string;
    message?: { model: string; content: Array<{ type: string; text?: string }> };
  };
};

/** Stream one ended batch's results and land each key. `inputsByCustomId` is
 *  the in-memory map for same-run collection; Phase 0 passes re-assembled
 *  inputs instead. Returns per-disposition counts. */
async function collectBatch(
  batchId: string,
  entries: BatchRequestEntry[],
  inputsByCustomId: Map<string, BakeInputs>,
): Promise<{ baked: number; failed: number; skipped: number; failures: string[] }> {
  const client = getAnthropic("narrative_bake");
  const byId = new Map(entries.map((e) => [e.customId, e]));
  let baked = 0,
    failed = 0,
    skipped = 0;
  const failures: string[] = [];
  for await (const raw of await client.messages.batches.results(batchId)) {
    const row = raw as BatchResultRow;
    const entry = byId.get(row.custom_id);
    if (!entry) continue; // unknown id — not ours to land
    const inputs = inputsByCustomId.get(row.custom_id);
    if (!inputs) {
      skipped++; // Phase 0 hash drift — key re-bakes fresh this run
      continue;
    }
    if (row.result.type !== "succeeded" || !row.result.message) {
      failed++;
      failures.push(`${entry.surface}/${entry.key}: batch result ${row.result.type}`);
      console.error(
        `[bake] ${entry.surface}/${entry.key} batch result ${row.result.type} (previous row kept)`,
      );
      continue;
    }
    const text = row.result.message.content.find((b) => b.type === "text")?.text ?? "";
    const landed = await landResult(entry, inputs, text, row.result.message.model);
    if (landed === "baked") {
      baked++;
      console.log(`[bake] ${entry.surface}/${entry.key} baked (batch ${batchId})`);
    } else {
      failed++;
      failures.push(`${entry.surface}/${entry.key}: validation/parse`);
    }
  }
  await markBatchCollected(batchId);
  return { baked, failed, skipped, failures };
}

/** Phase 0 — collect batches a prior run left pending. For each persisted key,
 *  re-assemble inputs; a fresh hash that no longer matches the persisted one is
 *  SKIPPED (that key re-bakes fresh in this run — nothing stale can land).
 *  Still-processing batches are returned so Phase 2 polls them alongside
 *  today's submission, and their keys are excluded from Phase 1. */
async function collectPending(): Promise<{
  baked: number;
  failed: number;
  skipped: number;
  failures: string[];
  inFlightKeys: Set<string>;
  inFlight: { batchId: string; entries: BatchRequestEntry[] }[];
}> {
  const client = getAnthropic("narrative_bake");
  let baked = 0,
    failed = 0,
    skipped = 0;
  const failures: string[] = [];
  const inFlightKeys = new Set<string>();
  const inFlight: { batchId: string; entries: BatchRequestEntry[] }[] = [];
  for (const pending of await loadPendingBatches()) {
    const status = (await client.messages.batches.retrieve(pending.batchId)) as {
      processing_status: string;
    };
    if (status.processing_status !== "ended") {
      for (const e of pending.requests) inFlightKeys.add(`${e.surface}/${e.key}`);
      inFlight.push({ batchId: pending.batchId, entries: pending.requests });
      console.log(`[bake] pending batch ${pending.batchId} still ${status.processing_status}`);
      continue;
    }
    // Re-assemble each key's inputs; hash drift -> skip (re-bakes fresh below).
    const inputsByCustomId = new Map<string, BakeInputs>();
    for (const entry of pending.requests) {
      const adapter = SURFACE_ADAPTERS[entry.surface];
      const inputs = adapter ? await adapter.assemble(entry.key) : null;
      if (inputs && inputsHash(inputs) === entry.inputsHash) {
        inputsByCustomId.set(entry.customId, inputs);
      }
    }
    const c = await collectBatch(pending.batchId, pending.requests, inputsByCustomId);
    baked += c.baked;
    failed += c.failed;
    skipped += c.skipped;
    failures.push(...c.failures);
  }
  return { baked, failed, skipped, failures, inFlightKeys, inFlight };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 2: Replace the old sequential loop inside `main`** (everything from the `outer:` loop through the final `console.log`) with the three-phase flow:

```ts
  const cap = runCapUsd();
  let baked = 0,
    skipped = 0,
    failed = 0;
  const failures: string[] = [];

  // ── Phase 0 — collect what a prior run left pending ─────────────────────────
  if (!args.dryRun) {
    const p0 = await collectPending();
    baked += p0.baked;
    failed += p0.failed;
    skipped += p0.skipped;
    failures.push(...p0.failures);
    var inFlightKeys = p0.inFlightKeys; // function-scoped: read by Phase 1 below
    var inFlight = p0.inFlight; //          and polled in Phase 2
  } else {
    var inFlightKeys = new Set<string>();
    var inFlight = [] as { batchId: string; entries: BatchRequestEntry[] }[];
  }

  // ── Phase 1 — assemble (delta-gated, unchanged) + submit ONE batch ─────────
  const work: WorkItem[] = [];
  for (const surface of surfaces) {
    const adapter = SURFACE_ADAPTERS[surface];
    const keys = args.keys ?? (await adapter.list());
    const existing = args.force ? new Map<string, string>() : await loadInputsHashes(surface);
    for (const key of keys) {
      if (inFlightKeys.has(`${surface}/${key}`)) {
        skipped++; // a prior run's batch still holds this key — don't double-spend
        continue;
      }
      const inputs = await adapter.assemble(key);
      if (!inputs) {
        skipped++;
        continue;
      }
      const hash = inputsHash(inputs);
      if (existing.get(key) === hash) {
        skipped++;
        continue;
      }
      if (args.dryRun) {
        console.log(`[bake] would bake ${surface}/${key} (${inputs.facts.length} facts)`);
        baked++;
        continue;
      }
      const { system, user } = buildNarrativePrompt(inputs);
      work.push({
        entry: { customId: `req-${work.length}`, surface, key, inputsHash: hash },
        inputs,
        system,
        user,
        promptChars: system.length + user.length,
      });
    }
  }

  if (args.dryRun) {
    console.log(`[bake] done — dry-run baked=${baked} skipped=${skipped}`);
    return 0;
  }

  const { fit, dropped, estimatedUsd } = sizeToCap(work, cap);
  for (const d of dropped) {
    failures.push(`${d.entry.surface}/${d.entry.key}: dropped — run cap ($${cap.toFixed(2)}) estimate full`);
  }
  if (dropped.length > 0) {
    console.error(
      `[bake] RUN CAP: estimate $${estimatedUsd.toFixed(2)} fits ${fit.length}/${work.length} keys — ${dropped.length} dropped (NARRATIVE_BAKE_RUN_CAP_USD)`,
    );
  }

  const toPoll = [...inFlight];
  const inputsByCustomId = new Map<string, BakeInputs>();
  if (fit.length > 0) {
    const client = getAnthropic("narrative_bake");
    const batch = (await client.messages.batches.create({
      requests: fit.map((w) => ({
        custom_id: w.entry.customId,
        params: {
          model: SYNTHESIS_MODEL,
          max_tokens: NARRATIVE_MAX_TOKENS,
          system: w.system,
          messages: [{ role: "user" as const, content: w.user }],
        },
      })),
    })) as { id: string };
    // Persist BEFORE polling — a died run must leave a collectable trail.
    await persistPendingBatch(batch.id, fit.map((w) => w.entry));
    for (const w of fit) inputsByCustomId.set(w.entry.customId, w.inputs);
    toPoll.push({ batchId: batch.id, entries: fit.map((w) => w.entry) });
    console.log(
      `[bake] submitted batch ${batch.id} — ${fit.length} keys, estimate $${estimatedUsd.toFixed(3)} (batch rates)`,
    );
  }

  // ── Phase 2 — poll + collect ────────────────────────────────────────────────
  const deadline = Date.now() + POLL_DEADLINE_MS;
  const client = getAnthropic("narrative_bake");
  let outstanding = [...toPoll];
  while (outstanding.length > 0 && Date.now() < deadline) {
    const still: typeof outstanding = [];
    for (const b of outstanding) {
      const status = (await client.messages.batches.retrieve(b.batchId)) as {
        processing_status: string;
      };
      if (status.processing_status !== "ended") {
        still.push(b);
        continue;
      }
      // Phase-0 leftovers have no same-run inputs map — re-assemble with hash guard.
      let inputsMap = inputsByCustomId;
      if (!b.entries.some((e) => inputsByCustomId.has(e.customId))) {
        inputsMap = new Map<string, BakeInputs>();
        for (const entry of b.entries) {
          const adapter = SURFACE_ADAPTERS[entry.surface];
          const inputs = adapter ? await adapter.assemble(entry.key) : null;
          if (inputs && inputsHash(inputs) === entry.inputsHash) inputsMap.set(entry.customId, inputs);
        }
      }
      const c = await collectBatch(b.batchId, b.entries, inputsMap);
      baked += c.baked;
      failed += c.failed;
      skipped += c.skipped;
      failures.push(...c.failures);
    }
    outstanding = still;
    if (outstanding.length > 0) await sleep(POLL_INTERVAL_MS);
  }
  if (outstanding.length > 0) {
    console.error(
      `[bake] HANDOFF: ${outstanding.length} batch(es) still processing at deadline — next run's Phase 0 collects (rows persisted; results live 29 days): ${outstanding.map((b) => b.batchId).join(", ")}`,
    );
  }

  console.log(
    `[bake] done — surface=${args.surface} baked=${baked} skipped=${skipped} failed=${failed} (estimate $${estimatedUsd?.toFixed?.(3) ?? "0"} at submit; real spend logs per result)`,
  );
  return failed > 0 || failures.length > 0 ? 1 : 0;
```

Also delete the now-unused `computeCostUsd` import from this file (spend is logged at the seam now) and the old `spent` accounting; keep `runCapUsd`.

Note for the implementer: `var` in the Phase-0 block is deliberate (function-scoped so Phase 1/2 read it) — if you prefer, declare `let inFlightKeys` / `let inFlight` above the `if` instead; behavior identical.

- [ ] **Step 3: Offline checks**

Run: `bun test lib/narratives refinery/agents` → all PASS (no bake-script unit tests exist; its gates are covered by the pure modules + dry-run).
Run: `bun scripts/bake-narratives.mts --surface all --dry-run --force` → prints `would bake ...` lines and `done — dry-run`, exit 0, NO batch submitted, no Supabase writes.

- [ ] **Step 4: Commit**

```bash
git add scripts/bake-narratives.mts
git commit -m "feat(bake): three-phase batch bake — collect-pending, submit one batch, poll+collect (50% rates)"
```

---

### Task 7: workflow re-anchoring

**Files:**
- Modify: `.github/workflows/daily-rebuild.yml` (cron line)
- Modify: `.github/workflows/narrative-bake.yml` (triggers + timeout)
- Modify: `.github/workflows/daily-email-digest.yml` (cron line)
- Modify: `.github/workflows/gate-a-parity.yml`, `.github/workflows/graphify-republish.yml`, `.github/workflows/build-example-deliverables.yml`, `.github/workflows/data-readiness-cron.yml` (minute nudges)

**Interfaces:**
- Consumes: rebuild workflow `name: Daily Brain Rebuild` (exact string — `workflow_run` matches on it).
- Produces: the overnight chain per spec §4.

- [ ] **Step 1: daily-rebuild.yml** — change `- cron: "0 6 * * *"` to:

```yaml
    # 04:23 UTC = 12:23 AM EDT / 11:23 PM EST — front of the operator's overnight
    # window, off the top-of-hour congestion (GitHub docs: schedule delays peak at
    # :00 and jobs can be dropped; observed drift here was 2.3-4.1h on the old 06:00
    # slot). Early anchor costs zero freshness: no lake-writing cron fires 04:23-09:00
    # UTC. Spec: 2026-07-10-batch-narrative-bake-design.md §4.
    - cron: "23 4 * * *"
```

- [ ] **Step 2: narrative-bake.yml** — replace the `schedule:` block and add `workflow_run`; bump timeout:

```yaml
on:
  # PRIMARY TRIGGER — chained, not clocked: fires when the Daily Brain Rebuild
  # completes, whenever GitHub's drifting scheduler actually ran it. The batch
  # submits immediately; results typically land within the hour.
  workflow_run:
    workflows: ["Daily Brain Rebuild"]
    types: [completed]
  # BACKSTOP — GitHub docs: heavily-loaded schedules can be DROPPED entirely. If
  # the rebuild never fired, this still bakes once a day; the delta gate makes a
  # redundant firing cost ~$0 (unchanged keys skip before any API call).
  schedule:
    - cron: "23 10 * * *"
  workflow_dispatch:
    inputs:
      surface:
        description: "Surface to bake (zip | corridor | brain | all)"
        default: "all"
      force:
        description: "Bypass cadence + delta gates (full rebake)"
        type: boolean
        default: false
```

And on the job: `timeout-minutes: 90` (was 30). If the job has an `if:` guard reading `github.event`, extend it so `workflow_run` events only proceed on success: `if: ${{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}` (combine with any existing condition using `&&`). The run step's surface arg for non-dispatch events must default to `all` (mirror however the file currently defaults the cron path — keep that mechanism, just confirm `workflow_run` takes the same default branch as `schedule`).

- [ ] **Step 3: daily-email-digest.yml** — change `- cron: "0 10 * * 1-5"` to:

```yaml
    # 14:23 UTC = 10:23 AM EDT / 9:23 AM EST weekdays — the researched engagement
    # peak (Brevo send-time study, ~10 AM local; spec §4 + companion send-window
    # spec). :23 is our anti-congestion minute, not a research finding.
    - cron: "23 14 * * 1-5"
```

- [ ] **Step 4: minute nudges** (same hour, off :00): gate-a-parity `0 7` → `23 7`; graphify-republish `0 7` → `37 7`; build-example-deliverables `0 8` → `23 8`; data-readiness-cron `0 *` → `23 *`.

- [ ] **Step 5: Sanity-check YAML** — `bunx yaml-lint` is not installed; instead run:

```bash
node -e "const y=require('js-yaml');const fs=require('fs');for(const f of ['daily-rebuild','narrative-bake','daily-email-digest','gate-a-parity','graphify-republish','build-example-deliverables','data-readiness-cron']){y.load(fs.readFileSync('.github/workflows/'+f+'.yml','utf8'));console.log(f,'ok')}"
```

Expected: seven `ok` lines. (If `js-yaml` isn't in node_modules, `bun add -d js-yaml` first — then include `package.json` + `bun.lock` in the commit per the lockfile gate.)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/daily-rebuild.yml .github/workflows/narrative-bake.yml .github/workflows/daily-email-digest.yml .github/workflows/gate-a-parity.yml .github/workflows/graphify-republish.yml .github/workflows/build-example-deliverables.yml .github/workflows/data-readiness-cron.yml
git commit -m "feat(cron): overnight replan — rebuild 04:23 UTC, bake chained to rebuild + 10:23 backstop, digest 14:23, minutes off :00"
```

---

### Task 8: ship + live verify

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)

- [ ] **Step 1: SESSION_LOG entry** (top of file, before push): what shipped (Tasks 1–7 commits), migration run + verified, live-verify plan, checks touched.

- [ ] **Step 2: OPERATOR GATE — confirm push.** Never push without explicit confirmation. Present `git log --oneline` of the new commits and ask. On yes: `node scripts/safe-push.mjs` (check for foreign commits first; ask before bundling any).

- [ ] **Step 3: Live verify** (operator-visible spend, tiny: one corridor key, well under the $1 default run cap; this is also the first live run of the batch surface — flag it before dispatching, per the spend-philosophy rule):

```bash
gh workflow run narrative-bake.yml -f surface=corridor -f force=true
```

Then watch: batch submits (log line `submitted batch msgbatch_...`), polls, lands rows, and `api_usage_log` gains `narrative_bake` rows whose `cost_usd` reflects HALF rates (spot-check: cost ≈ tokens × $1.50/$7.50 per MTok). Confirm one narrative row updated (`narratives.baked_at` fresh for the corridor baked).

- [ ] **Step 4: Overnight chain observation (next morning):** rebuild ran at/after 04:23 UTC, bake fired via `workflow_run` right after, digest at 14:23 UTC. Then close the check:

```bash
node scripts/check.mjs close batch_narrative_bake_live_verify
```

- [ ] **Step 5: Ops note** — the /spend dashboard's `narrative_bake` line will show ~half the per-key cost going forward; if the ops repo hard-codes full Sonnet rates anywhere for this call type, open a check to mirror the batch flag there (do NOT silently edit the ops repo from this session — ops pages belong to swfldatagulf-ops).

---

## Self-Review (done at write time)

- Spec coverage: §1 seam → Tasks 1–2; §2 script → Task 6; §3 table → Tasks 3–4; §4 workflows → Task 7; §5 error handling → Tasks 2/6 code paths; §6 testing/live verify → Tasks 1/2/5 tests + Task 8; §7 effects → Task 8 Step 5. Companion send-window spec: separate plan, not here.
- Placeholders: none; every code step carries full code.
- Type consistency: `BatchRequestEntry` fields (`customId`, `surface`, `key`, `inputsHash`) match across Tasks 4/6; `sizeToCap` consumes `promptChars` per Task 5; `computeCostUsd` 3-arg shape per Task 1 used in Task 5.
- Known judgment call: `collectBatch` marks a batch collected even when some results failed validation — matches today's per-key semantics (failure keeps previous row, run exits 1, delta gate re-queues the key because its stored hash never updated).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `refinery/agents/anthropic.mts`, `refinery/agents/anthropic.test.mts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
