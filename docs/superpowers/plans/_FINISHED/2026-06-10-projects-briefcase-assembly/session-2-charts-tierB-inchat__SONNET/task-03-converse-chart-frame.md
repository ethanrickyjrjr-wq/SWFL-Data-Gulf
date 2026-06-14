# Task 03 — Emit an SSE `chart` frame from `/api/converse`

**Context (verified):** `app/api/converse/route.ts` is an SSE route (returns `text/event-stream`) that streams text from Claude Haiku (`TRIAGE_MODEL = "claude-haiku-4-5"`). It does **no** chart routing today. Add: before the LLM call, run `routeChart(question)` → `buildChartForIntent` → emit ONE `chart` SSE frame ahead of the text stream. On any failure, skip silently — **a chart must never block or delay the text answer.**

**Files:**
- Modify: `app/api/converse/route.ts`

- [ ] **Step 1: Route the chart before the text stream.** Near the top of the stream body, before the Haiku call:

```ts
import { routeChart } from "@/lib/route-chart";
import { buildChartForIntent } from "@/lib/build-chart-for-intent.mts";

// inside the stream's start(controller):
try {
  const intent = routeChart(question);
  if (intent) {
    const chart = await buildChartForIntent(intent);
    if (chart) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chart })}\n\n`));
    }
  }
} catch { /* chart is best-effort — never block the answer */ }
// … existing text stream continues unchanged …
```

Match the existing SSE frame format in this file exactly (the audit confirmed `data: {...}\n\n` frames for text/done/reach/answered). The `chart` frame is just another typed frame the client learns to read (Task 04).

- [ ] **Step 2: LLM isolation.** Confirm the chart data is built entirely in code (`buildChartForIntent`) and the prompt sent to Haiku is unchanged — the LLM never sees or generates chart numbers (Tier C NL charts stay deferred, A8).

- [ ] **Step 3: Manual SSE smoke.** `bun run dev`, then:

```bash
curl -N -s "http://localhost:3000/api/converse" -H 'content-type: application/json' \
  -d '{"question":"what are asking rents in the corridors?","reportId":"master"}' | head -20
```

Expected: a `data: {"chart":{"block":{...}}}` frame appears **before** the text frames. Then an off-scope question (e.g. "what's the weather") emits NO chart frame, text only.

- [ ] **Step 4: Commit (do NOT push yet — diff-review gate).**

```bash
git add app/api/converse/route.ts
git commit -m "feat(charts): emit best-effort SSE chart frame from /api/converse (LLM never touches numbers)"
```

> **Diff-review gate (RULE 1):** `/api/converse` is a live response surface. Before the session push, show the operator the diff of this route and get the OK.
