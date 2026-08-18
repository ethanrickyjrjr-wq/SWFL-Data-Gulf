# Live AI Build Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 12 files, keywords: schema, architecture, breaking

**Goal:** Stream the AI email/social build onto the canvas piece-by-piece over our own route (NDJSON), with a status chip and a human-wins race rule — zero new vendor spend.

**Architecture:** A pure event protocol module + a validated emitter wrap the existing `authorDoc` build via an optional progress callback; the route returns a `ReadableStream` when the client opts in (`stream: true`), unchanged JSON otherwise. The client consumes the stream through a pure reducer that enforces the touched-blocks race rule. Phase 2 applies the same protocol to the social generate route.

**Tech Stack:** Next.js route handlers (Node runtime, Web `ReadableStream` — verified against nextjs.org route.js reference 08/18/2026), Zod (`EmailDocSchema`), bun:test. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-live-build-streaming-design.md`

## Global Constraints

- Wire format: newline-delimited JSON, `Content-Type: application/x-ndjson`.
- Event names exactly: `status`, `skeleton`, `block`, `slot`, `done`, `error` (spec §Event protocol).
- Every content-bearing event is schema-validated server-side BEFORE it is written to the stream; the full-doc gate still runs before `done`.
- The stream never writes to the database. Persistence stays the explicit save.
- Non-streaming requests (no `stream: true`) get today's exact JSON — deploy-skew guard.
- `authorDoc`'s computation, sourcing, and gates are untouched — the callback only observes.
- No new vendor, no new dependency, no Supabase Realtime.
- Deno-style imports do NOT apply here (this is Next.js `lib/`/`app/`, not `supabase/functions`).

---

### Task 1: Event protocol types + NDJSON codec (pure)

**Files:**
- Create: `lib/email/lab/stream-events.ts`
- Test: `lib/email/lab/stream-events.test.ts`

**Interfaces:**
- Produces: `type BuildStreamEvent`, `encodeEvent(ev: BuildStreamEvent): string`, `decodeEvents(chunk: string, carry: string): { events: BuildStreamEvent[]; carry: string }`
- Consumes: `EmailDoc` type from `lib/email/doc/types`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/lab/stream-events.test.ts
import { describe, expect, test } from "bun:test";
import { encodeEvent, decodeEvents, type BuildStreamEvent } from "./stream-events";

describe("stream-events codec", () => {
  test("encode produces one JSON line per event", () => {
    const ev: BuildStreamEvent = { e: "status", label: "pulling comps" };
    expect(encodeEvent(ev)).toBe('{"e":"status","label":"pulling comps"}\n');
  });

  test("decode reassembles events split across chunk boundaries", () => {
    const a = '{"e":"status","label":"x"}\n{"e":"block","id":"b1","pr';
    const b = 'ops":{"prose":"hi"}}\n';
    const first = decodeEvents(a, "");
    expect(first.events).toEqual([{ e: "status", label: "x" }]);
    const second = decodeEvents(b, first.carry);
    expect(second.events).toEqual([{ e: "block", id: "b1", props: { prose: "hi" } }]);
    expect(second.carry).toBe("");
  });

  test("a malformed line becomes an error event, not a throw", () => {
    const { events } = decodeEvents("not-json\n", "");
    expect(events[0]?.e).toBe("error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/lab/stream-events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/email/lab/stream-events.ts
//
// The ONE protocol for live build streaming (spec 2026-08-18). Both lanes —
// email (/api/email-lab/ai) and social (/api/email-lab/social/generate) —
// speak exactly these events. NDJSON: one JSON object per line.
import type { EmailDoc } from "@/lib/email/doc/types";

export type BuildStreamEvent =
  | { e: "status"; label: string }
  | { e: "skeleton"; doc: EmailDoc }
  | { e: "block"; id: string; props: Record<string, unknown> }
  | { e: "slot"; id: string; text: string }
  | { e: "done"; payload: unknown }
  | { e: "error"; message: string };

export function encodeEvent(ev: BuildStreamEvent): string {
  return `${JSON.stringify(ev)}\n`;
}

/** Reassemble events from arbitrary chunk boundaries. `carry` is the unfinished
 *  tail of the previous chunk; pass it back on the next call. */
export function decodeEvents(
  chunk: string,
  carry: string,
): { events: BuildStreamEvent[]; carry: string } {
  const lines = (carry + chunk).split("\n");
  const nextCarry = lines.pop() ?? "";
  const events: BuildStreamEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as BuildStreamEvent);
    } catch {
      events.push({ e: "error", message: "malformed stream line" });
    }
  }
  return { events, carry: nextCarry };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/lab/stream-events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/email/lab/stream-events.ts lib/email/lab/stream-events.test.ts
git commit -m "feat(email-lab): NDJSON event protocol for live build streaming"
```

---

### Task 2: Validated server-side emitter (guard: nothing unvalidated reaches the stream)

**Files:**
- Create: `lib/email/lab/stream-emitter.ts`
- Test: `lib/email/lab/stream-emitter.test.ts`

**Interfaces:**
- Consumes: `BuildStreamEvent`, `encodeEvent` (Task 1); `EmailDocSchema` from `@/lib/email/doc/schema`.
- Produces: `createBuildEmitter(write: (s: string) => void): BuildEmitter` where `BuildEmitter` = `{ status(label: string): void; skeleton(doc: unknown): boolean; block(workingDoc: unknown, id: string, props: Record<string, unknown>): boolean; done(payload: unknown): void; error(message: string): void }`. Content methods return `false` (and emit nothing content-bearing) when validation fails.

Validation strategy — no per-block schema exists, so a `block` event validates by
applying the props to the block's copy inside the working doc and running
`EmailDocSchema.safeParse` on the WHOLE doc. Failure emits `error`, never the block.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/lab/stream-emitter.test.ts
import { describe, expect, test } from "bun:test";
import { createBuildEmitter } from "./stream-emitter";
import { decodeEvents } from "./stream-events";
import { seedById } from "@/lib/email/doc/default-docs";

function collector() {
  let out = "";
  return { write: (s: string) => (out += s), read: () => decodeEvents(out, "").events };
}

describe("stream-emitter validation gate", () => {
  test("a valid block event is emitted with its props", () => {
    const doc = seedById("trend-snapshot")!.build();
    const target = doc.blocks.find((b) => b.type === "text") ?? doc.blocks[0];
    const c = collector();
    const em = createBuildEmitter(c.write);
    const ok = em.block(doc, target.id, { ...target.props });
    expect(ok).toBe(true);
    expect(c.read()).toEqual([{ e: "block", id: target.id, props: { ...target.props } }]);
  });

  test("an invalid block never reaches the stream — error event instead", () => {
    const doc = seedById("trend-snapshot")!.build();
    const c = collector();
    const em = createBuildEmitter(c.write);
    // type-breaking props: blocks are discriminated by shape; a number where the
    // schema wants a string must fail whole-doc validation.
    const ok = em.block(doc, doc.blocks[0].id, { prose: 42 as unknown as string });
    expect(ok).toBe(false);
    const events = c.read();
    expect(events.some((e) => e.e === "block")).toBe(false);
    expect(events.some((e) => e.e === "error")).toBe(true);
  });

  test("an unknown block id is rejected", () => {
    const doc = seedById("trend-snapshot")!.build();
    const c = collector();
    const em = createBuildEmitter(c.write);
    expect(em.block(doc, "no-such-id", { prose: "x" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/lab/stream-emitter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/email/lab/stream-emitter.ts
//
// Server-side gate: every content-bearing event is validated BEFORE it is
// written to the stream (spec failure mode 3). A block validates by applying
// its props inside a copy of the working doc and safeParse-ing the whole doc —
// there is deliberately no second, weaker per-block schema.
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { encodeEvent, type BuildStreamEvent } from "./stream-events";

export interface BuildEmitter {
  status(label: string): void;
  skeleton(doc: unknown): boolean;
  block(workingDoc: unknown, id: string, props: Record<string, unknown>): boolean;
  done(payload: unknown): void;
  error(message: string): void;
}

export function createBuildEmitter(write: (s: string) => void): BuildEmitter {
  const emit = (ev: BuildStreamEvent) => write(encodeEvent(ev));
  return {
    status: (label) => emit({ e: "status", label }),
    skeleton: (doc) => {
      const parsed = EmailDocSchema.safeParse(doc);
      if (!parsed.success) {
        emit({ e: "error", message: "skeleton failed validation" });
        return false;
      }
      emit({ e: "skeleton", doc: parsed.data });
      return true;
    },
    block: (workingDoc, id, props) => {
      const base = EmailDocSchema.safeParse(workingDoc);
      if (!base.success) {
        emit({ e: "error", message: "working doc invalid" });
        return false;
      }
      const idx = base.data.blocks.findIndex((b) => b.id === id);
      if (idx === -1) {
        emit({ e: "error", message: `unknown block ${id}` });
        return false;
      }
      const candidate = {
        ...base.data,
        blocks: base.data.blocks.map((b, i) => (i === idx ? { ...b, props } : b)),
      };
      if (!EmailDocSchema.safeParse(candidate).success) {
        emit({ e: "error", message: `block ${id} failed validation` });
        return false;
      }
      emit({ e: "block", id, props });
      return true;
    },
    done: (payload) => emit({ e: "done", payload }),
    error: (message) => emit({ e: "error", message }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/lab/stream-emitter.test.ts`
Expected: PASS (3 tests). If the `prose: 42` case unexpectedly passes schema
(loose props), switch the invalid fixture to a shape the schema demonstrably
rejects (e.g. `blocks[0]` with `type` removed) — the test's contract is
"invalid never streams", not one specific fixture.

- [ ] **Step 5: Commit**

```bash
git add lib/email/lab/stream-emitter.ts lib/email/lab/stream-emitter.test.ts
git commit -m "feat(email-lab): validated stream emitter — nothing unvalidated reaches the wire"
```

---

### Task 3: Client reducer with the human-wins race rule (pure)

**Files:**
- Create: `lib/email/lab/consume-stream.ts`
- Test: `lib/email/lab/consume-stream.test.ts`

**Interfaces:**
- Consumes: `BuildStreamEvent` (Task 1); `EmailDoc` from `lib/email/doc/types`.
- Produces:
  - `type StreamCanvasState = { doc: EmailDoc | null; touched: Set<string>; statusLabel: string | null; finished: boolean; errorMessage: string | null }`
  - `initialStreamState(): StreamCanvasState`
  - `applyStreamEvent(state: StreamCanvasState, ev: BuildStreamEvent): StreamCanvasState`
  - `markTouched(state: StreamCanvasState, blockId: string): StreamCanvasState`
- The race rule lives HERE and only here: `block` and `done` merge around ids in `touched`, never over them.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/lab/consume-stream.test.ts
import { describe, expect, test } from "bun:test";
import { initialStreamState, applyStreamEvent, markTouched } from "./consume-stream";
import { seedById } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

const skel = (): EmailDoc => seedById("trend-snapshot")!.build();

describe("consume-stream race rule — the human wins", () => {
  test("a block event fills an untouched block", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const id = s.doc!.blocks[0].id;
    s = applyStreamEvent(s, { e: "block", id, props: { ...s.doc!.blocks[0].props, prose: "ai wrote this" } });
    expect((s.doc!.blocks[0].props as Record<string, unknown>).prose).toBe("ai wrote this");
  });

  test("a block event is DROPPED for a touched block", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const id = s.doc!.blocks[0].id;
    s = markTouched(s, id);
    const before = s.doc!.blocks[0].props;
    s = applyStreamEvent(s, { e: "block", id, props: { prose: "ai overwrite" } });
    expect(s.doc!.blocks[0].props).toEqual(before);
  });

  test("done reconciles around touched blocks, never over them", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "skeleton", doc: skel() });
    const touchedId = s.doc!.blocks[0].id;
    s = markTouched(s, touchedId);
    const userProps = s.doc!.blocks[0].props;
    const finalDoc = skel(); // same ids as the skeleton build for this seed? if not, use structuredClone(s.doc)
    const full = structuredClone(s.doc!) as EmailDoc;
    for (const b of full.blocks) (b.props as Record<string, unknown>).prose = "final";
    s = applyStreamEvent(s, { e: "done", payload: { doc: full } });
    expect(s.finished).toBe(true);
    expect(s.doc!.blocks[0].props).toEqual(userProps); // human's block survives
    expect((s.doc!.blocks[1].props as Record<string, unknown>).prose).toBe("final"); // ai's blocks land
    void finalDoc;
  });

  test("status and error update chip state without touching the doc", () => {
    let s = applyStreamEvent(initialStreamState(), { e: "status", label: "pulling comps" });
    expect(s.statusLabel).toBe("pulling comps");
    s = applyStreamEvent(s, { e: "error", message: "boom" });
    expect(s.errorMessage).toBe("boom");
    expect(s.doc).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/lab/consume-stream.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/email/lab/consume-stream.ts
//
// Pure reducer the canvas runs over stream events. THE RACE RULE LIVES HERE:
// once a user touches a block, no AI event may overwrite it (spec failure
// mode 1). Keeping this pure (no React, no fetch) is what makes the rule
// testable without a browser.
import type { EmailDoc } from "@/lib/email/doc/types";
import type { BuildStreamEvent } from "./stream-events";

export interface StreamCanvasState {
  doc: EmailDoc | null;
  touched: Set<string>;
  statusLabel: string | null;
  finished: boolean;
  errorMessage: string | null;
}

export function initialStreamState(): StreamCanvasState {
  return { doc: null, touched: new Set(), statusLabel: null, finished: false, errorMessage: null };
}

export function markTouched(state: StreamCanvasState, blockId: string): StreamCanvasState {
  const touched = new Set(state.touched);
  touched.add(blockId);
  return { ...state, touched };
}

export function applyStreamEvent(
  state: StreamCanvasState,
  ev: BuildStreamEvent,
): StreamCanvasState {
  switch (ev.e) {
    case "status":
      return { ...state, statusLabel: ev.label };
    case "skeleton":
      return { ...state, doc: ev.doc };
    case "block": {
      if (!state.doc || state.touched.has(ev.id)) return state;
      return {
        ...state,
        doc: {
          ...state.doc,
          blocks: state.doc.blocks.map((b) =>
            b.id === ev.id ? ({ ...b, props: ev.props } as typeof b) : b,
          ),
        },
      };
    }
    case "done": {
      const payload = ev.payload as { doc?: EmailDoc } | undefined;
      const full = payload?.doc;
      if (!full || !state.doc) return { ...state, finished: true, statusLabel: null };
      const mine = new Map(state.doc.blocks.map((b) => [b.id, b]));
      return {
        ...state,
        finished: true,
        statusLabel: null,
        doc: {
          ...full,
          blocks: full.blocks.map((b) =>
            state.touched.has(b.id) && mine.has(b.id) ? mine.get(b.id)! : b,
          ),
        },
      };
    }
    case "error":
      return { ...state, errorMessage: ev.message, statusLabel: null };
    case "slot":
      return state; // social lane; email canvas ignores it
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/lab/consume-stream.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/email/lab/consume-stream.ts lib/email/lab/consume-stream.test.ts
git commit -m "feat(email-lab): stream reducer with human-wins race rule"
```

---

### Task 4: `authorDoc` progress callback (observe-only)

**Files:**
- Modify: `lib/email/build-doc.ts` — `BuildArgs` interface + `authorDoc` (declared at `build-doc.ts:1132`) and the recipe branch it calls.
- Test: extend an existing `authorDoc`-adjacent test file only if one already covers `authorDoc` end-to-end with mocks; otherwise the emitter integration is covered in Task 5's route test. Do NOT build a new model-mock harness for this task.

**Interfaces:**
- Consumes: nothing new.
- Produces: `BuildArgs` gains `onProgress?: (ev: { stage: "status" | "skeleton" | "block"; label?: string; doc?: unknown; blockId?: string; props?: Record<string, unknown> }) => void`.
- `authorDoc({ …, onProgress })` — existing callers pass nothing and see byte-identical behavior.

- [ ] **Step 1: Add the optional field to `BuildArgs`** (same file, wherever `BuildArgs` is declared — locate with `grep -n "interface BuildArgs" lib/email/build-doc.ts`). The callback type above, one field, JSDoc: "Observe-only build progress for the streaming lane. Never alters what the build computes; never awaited."

- [ ] **Step 2: Emit at the existing stage boundaries inside the keyed-recipe branch of `authorDoc`:**
  - immediately after the recipe's coded grid (with brand chrome) exists and BEFORE any model call: `onProgress?.({ stage: "skeleton", doc: <the grid doc> })` plus `onProgress?.({ stage: "status", label: "laying out your email" })`
  - around `fillSkeletonFromSources`: `onProgress?.({ stage: "status", label: "filling in sourced facts" })` before; after it returns, one `block` emission per block whose props changed (diff by block id against the pre-fill doc)
  - around `upsertChartBlock`: status `"building the chart"`, then a `block` emission for the chart's image block
  - around the author pass (the model call writing prose): status `"writing commentary"`, then `block` emissions for authored blocks
  Every call site is `onProgress?.(…)` — optional chaining, no behavior when absent.

- [ ] **Step 3: Verify no behavior change for existing callers**

Run: `bun test lib/email`
Expected: the full suite passes exactly as before (1809 passed on 08/18/2026 baseline; count may have moved — the requirement is 0 fail).

- [ ] **Step 4: Commit**

```bash
git add lib/email/build-doc.ts
git commit -m "feat(email): authorDoc onProgress callback at existing stage boundaries (observe-only)"
```

---

### Task 5: Streaming response on `/api/email-lab/ai`

**Files:**
- Modify: `app/api/email-lab/ai/route.ts`
- Test: `app/api/email-lab/ai/stream.test.ts` (new; mock `authorDoc` at module boundary the way `campaign-sim`/existing route tests mock — process-local `mock.module`, zero prod files changed)

**Interfaces:**
- Consumes: `createBuildEmitter` (Task 2), `authorDoc` + `onProgress` (Task 4).
- Produces: `POST /api/email-lab/ai` with `stream: true` in the JSON body → `200`, `Content-Type: application/x-ndjson`, events per Task 1's protocol, terminal event `done` carrying **exactly the payload the non-streaming branch would have returned** (the `BuildResult.payload`). Without `stream: true` → today's `NextResponse.json` path, byte-identical.

- [ ] **Step 1: Write the failing test** — mock `authorDoc` to invoke its `onProgress` with a skeleton + one block + return a fixed payload; POST with `stream: true`; read the body via `decodeEvents`; assert event order `status|skeleton → block → done`, `done.payload` equals the mock's payload, and content-type is `application/x-ndjson`. Second test: POST WITHOUT `stream` asserts a plain JSON response with the same payload (deploy-skew guard, spec failure mode 6).

- [ ] **Step 2: Run it, verify both fail** (`bun test app/api/email-lab/ai/stream.test.ts`).

- [ ] **Step 3: Implement.** In the route's POST, after body parse: if `body.stream !== true`, run the existing code path untouched. If `true`:

```ts
const encoder = new TextEncoder();
const streamBody = new ReadableStream<Uint8Array>({
  async start(controller) {
    const emitter = createBuildEmitter((s) => controller.enqueue(encoder.encode(s)));
    try {
      const result = await authorDoc({
        // …identical args to the non-streaming call…
        onProgress: (p) => {
          if (p.stage === "status" && p.label) emitter.status(p.label);
          else if (p.stage === "skeleton") emitter.skeleton(p.doc);
          else if (p.stage === "block" && p.blockId)
            emitter.block(p.doc, p.blockId, p.props ?? {});
        },
      });
      if (result.httpStatus >= 400) emitter.error(String((result.payload as { error?: string }).error ?? "build failed"));
      else emitter.done(result.payload);
    } catch (err) {
      emitter.error(err instanceof Error ? err.message : "build failed");
    } finally {
      controller.close();
    }
  },
});
return new Response(streamBody, {
  headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
});
```

Note: the `onProgress` handler needs the working doc for block validation — extend Task 4's
`block` emission to carry `doc` (the post-stage working doc) alongside `blockId`/`props` so the
route never re-derives it. Keep `checkBuildAllowance`/`recordBuild` exactly where they are today
(before/after the build, once per request).

- [ ] **Step 4: Run tests** (`bun test app/api/email-lab/ai/stream.test.ts` then `bun test lib/email`) — all green.

- [ ] **Step 5: Commit**

```bash
git add app/api/email-lab/ai/route.ts app/api/email-lab/ai/stream.test.ts
git commit -m "feat(api): /api/email-lab/ai streams NDJSON build events behind stream:true"
```

---

### Task 6: Canvas consumption in the grid shell

**Files:**
- Modify: `components/email-lab/EmailLabGridShell.tsx` — the four `fetch("/api/email-lab/ai", …)` sites (lines 586, 689, 832, 996 as of 08/18/2026; re-locate by grep, lines drift).
- Test: covered by Task 3's reducer tests (the shell only wires; keep ALL merge/race logic in `consume-stream.ts` so the shell adds no untested branching).

**Interfaces:**
- Consumes: `decodeEvents` (Task 1), `initialStreamState`/`applyStreamEvent`/`markTouched` (Task 3).
- Produces: user-visible streaming build + status chip; block edit handlers call `markTouched`.

- [ ] **Step 1: Extract ONE shared helper inside the shell** (module-level, not per call site): `async function runStreamingBuild(body: object, onState: (s: StreamCanvasState) => void)` — fetches with `stream: true`, reads `res.body!.getReader()`, runs `decodeEvents` with carry, folds `applyStreamEvent`, calls `onState` per event. On non-`res.ok` or missing body, falls back to the existing JSON path so a proxy that strips streaming degrades to today's behavior (spec failure mode 6).

- [ ] **Step 2: Wire the four call sites** to `runStreamingBuild`, mapping `onState` to the existing setDoc/state setters; a retry resets to last saved doc before consuming a new stream (spec failure mode 4). Add the status chip UI where the current build spinner renders — reuse the existing spinner slot, text from `statusLabel`; on `errorMessage` show "build interrupted — retry" with the existing retry affordance.

- [ ] **Step 3: Hook `markTouched`** into the shell's existing block-edit path (wherever user edits mutate a block's props — locate the setter the block editor calls and add the id to touched state there, once).

- [ ] **Step 4: Verify** `bunx next build` passes (the operator's required verify — never `npx tsc`), and `bun test lib/email` stays green.

- [ ] **Step 5: RENDER IT AND LOOK.** Run the dev server, open a project's email lab, run a build, watch blocks land live, edit a block mid-build and confirm the AI never overwrites it. A green suite is not evidence for a rendered artifact.

- [ ] **Step 6: Commit**

```bash
git add components/email-lab/EmailLabGridShell.tsx
git commit -m "feat(email-lab): canvas consumes the build stream — live fill, status chip, human-wins edits"
```

---

### Task 7: Phase 2 — social composer streaming

**Files:**
- Modify: `app/api/email-lab/social/generate/route.ts` (both fill and author modes), the social canvas client (locate via `grep -rn "social/generate" components/ app/` — the composer that POSTs fill/author).
- Test: `app/api/email-lab/social/generate/stream.test.ts` mirroring Task 5's shape with `buildSocialCanvasFill`/`authorSocialPost` mocked.

**Interfaces:**
- Consumes: Tasks 1–3 modules unchanged — social emits `status` + `slot` + `done`; `applyStreamEvent`'s `slot` case gains a social-canvas equivalent reducer (`lib/social/consume-stream.ts` if the social canvas state shape differs; same race rule keyed by element id).
- Produces: streamed fill/author on the social composer.

- [ ] **Step 1: Emitter test first** (slot events validated: a slot id must exist in the submitted skeleton; unknown ids → `error`, mirroring Task 2's unknown-block rule).
- [ ] **Step 2: Route streaming behind `stream: true`,** legacy JSON otherwise — same structure as Task 5.
- [ ] **Step 3: Social canvas consumes,** same touched-set rule keyed by element id.
- [ ] **Step 4: `bunx next build` + full `bun test lib/email lib/social` green; render-and-look on the social composer.**
- [ ] **Step 5: Commit** (`feat(social): composer streams slot fills live`).

---

### Task 8: Close-out

- [ ] **Step 1:** Attach the live-verify signal or close by hand after the Task 6 render-and-look on production: `node scripts/check.mjs close live_build_streaming_live_verify` (only after watching it stream live — the check was opened 08/18/2026).
- [ ] **Step 2:** Update `docs/standards/email-build-playbook.md` — one short subsection in PART 0 (the pipe) noting the build's streamed delivery + the human-wins rule, same commit.
- [ ] **Step 3:** Update `docs/standards/repo-inventory-audit.md` #llm-call-sites-email if any call-site shape moved (Task 4 adds no call, but confirm before closing).
- [ ] **Step 4:** SESSION_LOG entry + `node scripts/safe-push.mjs` — push only with the operator's per-push approval.

## Self-review

Spec coverage: transport (T5), protocol (T1), validation gate (T2 + T5), race rule (T3 + T6), skeleton-first (T4 + T5), status chip (T6), deploy-skew fallback (T5 test 2 + T6 step 1), retry reset (T6), social (T7), no-DB-writes (structural — emitter has no DB import; noted in T5), allowance unchanged (T5 note). Placeholders: none — every code step carries code or an exact locator. Type consistency: `BuildStreamEvent` names match across T1/T2/T3/T5; `onProgress` shape matches T4↔T5 (T5 notes the doc-carrying extension explicitly).
