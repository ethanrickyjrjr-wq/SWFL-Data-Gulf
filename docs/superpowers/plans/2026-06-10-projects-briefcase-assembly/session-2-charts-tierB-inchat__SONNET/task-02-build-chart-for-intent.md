# Task 02 — `lib/build-chart-for-intent.mts`

**Context (verified):** `lib/route-chart.ts` exports `routeChart(question): ChartIntent | null` with scopes `asking-rent | vacancy | zhvi | vitals | flood-aal`. There is no producer turning an intent into data. Build it, using the **Task 01 findings** for each scope's real source. Import `ChartBlock` + `lintChartBlock` from `refinery/validate/chart-block-lint.mts` (`[AUDIT-FIX C4]`).

**Files:**
- Create: `lib/build-chart-for-intent.mts`
- Test: `lib/build-chart-for-intent.test.mts`

- [ ] **Step 1: Define the return contract + write failing tests.**

```ts
import { describe, it, expect } from "vitest";
import { buildChartForIntent } from "./build-chart-for-intent.mts";

describe("buildChartForIntent", () => {
  it("returns a linted bar block for asking-rent", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "asking-rent" });
    expect(r && "block" in r ? r.block.chart_type : null).toBe("bar");
  });
  it("returns a zhvi component marker", async () => {
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    expect(r && "component" in r ? r.component : null).toBe("zhvi");
  });
  it("returns null for deferred vitals", async () => {
    expect(await buildChartForIntent({ chart_type: "bar", scope: "vitals", corridor_slug: "x" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Signature: `export async function buildChartForIntent(intent: ChartIntent): Promise<{ block: ChartBlock } | { component: "zhvi"; data: unknown } | null>`. Per scope, using Task 01's findings:
  - `asking-rent` → load the real source (fixture or `fetchBrain` per the recorded decision), shape ≤6 rows into a `ChartBlock` (bar), **pass it through `lintChartBlock`**; if lint fails return `null`.
  - `flood-aal` → env brain AAL-by-ZIP detail_table → bar block → lint.
  - `zhvi` → `{ component: "zhvi", data }` (the `ZHVIAreaChart` renderer handles it — `components/viz/ZHVIAreaChart.tsx` exists).
  - `vacancy` → per Task 01: build if a real source exists, else `null`.
  - `vitals` → `null` (deferred, A8).
  - Any error / <3 comparable points → `null`. **Never invent a number; lint is the gate.**

- [ ] **Step 4: Run — expect PASS.** Then `npm run refinery:typecheck` adds no NEW errors for this file (baseline debt is accepted — `reference_refinery-typecheck-exits-nonzero`; run it alone, compare against baseline).

- [ ] **Step 5: Commit.**

```bash
git add lib/build-chart-for-intent.mts lib/build-chart-for-intent.test.mts
git commit -m "feat(charts): buildChartForIntent (Tier B producer) — lint-gated, per Task01 datapaths"
```
