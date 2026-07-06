# Multi-ZIP City ZIP-by-ZIP Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — keywords: architecture

**Goal:** A multi-ZIP-city email build charts that city's own ZIPs (one bar per ZIP), not a SWFL-wide top-12 or a single primary ZIP.

**Architecture:** Add one pure filter, `filterOutputToZips`, to the shared chart producer. `buildChartForQuestion` gains an opt-in `{ zips }` argument that filters the fetched brain output before both chart producers run; with no `zips` the code path is byte-for-byte unchanged (chat is unaffected). The email build (`authorDoc`) passes the city's ZIP list only for a place on a fail-closed allowlist of the five USPS+Mapbox-verified multi-ZIP cities.

**Tech Stack:** TypeScript, `bun test` (lib/**), `bunx vitest run` (refinery/**), Anthropic-free (all tasks are pure/deterministic — no live model call).

## Global Constraints

- **Moat (non-negotiable):** every plotted number stays a real audited brain figure computed in code; the LLM never writes a chart number. `summarizeChartForGrounding` must run on the **filtered** chart so the grounding block only contains the city's ZIP figures.
- **Default unchanged:** `buildChartForQuestion` / `computeMetricChart` with no `zips` produce byte-identical output to today. This is the chat-regression wall — a snapshot test guards it.
- **Fail-closed allowlist:** only Cape Coral, Fort Myers, Naples, Lehigh Acres, Bonita Springs get the ZIP filter. Every other place (single-ZIP, unverified, or explicit-ZIP scope) takes the existing path and never passes `zips`.
- **No new chart shapes** (bar/table only). **No crosswalk change** (Estero already corrected to `33928` in commit `01fce907`).
- Verify: `bun test <file>` for `lib/**`, `bunx vitest run <file>` for `refinery/**`. Never bare `tsc` — use `bunx next build` only if a type question needs the Vercel toolchain.

---

## File Structure

- `refinery/lib/chart-from-metrics.mts` — add `filterOutputToZips(output, zips)` and a `detailTablesOnly` option on `computeMetricChart`. This is the ONE root of the ZIP filter.
- `refinery/lib/chart-from-metrics.test.mts` — new unit tests for the filter + the option (create if absent).
- `lib/assistant/chart-for-question.ts` — thread an opt-in `{ zips }` through `buildChartForQuestion`.
- `lib/assistant/chart-for-question.test.ts` — default-unchanged snapshot + filtered-path test (create if absent).
- `lib/email/build-doc.ts` — allowlist constant + wire `promptPlace.zips` into `buildPromptChart` in `authorDoc` only.
- `lib/email/build-doc.test.ts` — allowlist-gating unit tests (extend existing file).

---

### Task 1: `filterOutputToZips` + `detailTablesOnly` guard (the ZIP filter root)

**Files:**
- Modify: `refinery/lib/chart-from-metrics.mts`
- Test: `refinery/lib/chart-from-metrics.test.mts` (create if absent)

**Interfaces:**
- Consumes: `BrainOutput`, `BrainOutputDetailTable`, `BrainOutputDetailRow` from `../types/brain-output.mts` (already imported). Row identity: `row.key` is the ZIP on a `grain: "zip"` table (per type doc: "Stable lookup key for the row, e.g. a ZIP '33913'").
- Produces:
  - `filterOutputToZips(output: BrainOutput, zips: readonly string[]): BrainOutput` — shallow clone with per-ZIP detail-table rows kept only when their ZIP is in `zips`; non-zip-grain tables and `key_metrics` untouched; returns `output` unchanged when `zips` is empty or there are no detail tables.
  - `computeMetricChart(output: BrainOutput, opts?: { detailTablesOnly?: boolean }): ChartBlock | null` — when `detailTablesOnly` is true, skip the `key_metrics` fallback and return `null` if no detail-table chart (so a city request never yields a SWFL-wide key-metrics chart). Default `false` → identical to today.

- [ ] **Step 1: Write the failing tests**

Create `refinery/lib/chart-from-metrics.test.mts`:

```ts
import { describe, it, expect } from "vitest";
import { filterOutputToZips, computeMetricChart } from "./chart-from-metrics.mts";
import type { BrainOutput } from "../types/brain-output.mts";

// Minimal BrainOutput with a per-ZIP detail table (SWFL-wide) + a key_metrics fallback.
function makeOutput(): BrainOutput {
  return {
    refined_at: "2026-07-06T00:00:00.000Z",
    key_metrics: [
      { label: "SWFL median", value: 400000, units: "USD", display_format: "currency", variable_type: "continuous" },
      { label: "SWFL inventory", value: 12000, units: "listings", display_format: "count", variable_type: "continuous" },
      { label: "SWFL DOM", value: 60, units: "days", display_format: "count", variable_type: "continuous" },
    ],
    detail_tables: [
      {
        id: "housing_by_zip",
        title: "Median list price by ZIP",
        grain: "zip",
        columns: [{ id: "median_list", label: "Median list price", display_format: "currency", units: "USD" }],
        rows: [
          { key: "33904", label: "33904", cells: { median_list: 410000 } },
          { key: "33914", label: "33914", cells: { median_list: 560000 } },
          { key: "33990", label: "33990", cells: { median_list: 380000 } },
          { key: "34102", label: "34102", cells: { median_list: 2200000 } }, // Naples — must be dropped for a Cape Coral filter
          { key: "34145", label: "34145", cells: { median_list: 1500000 } }, // Marco — dropped
        ],
      },
    ],
  } as unknown as BrainOutput;
}

describe("filterOutputToZips", () => {
  it("keeps only rows whose ZIP is in the set (Cape Coral)", () => {
    const out = filterOutputToZips(makeOutput(), ["33904", "33914", "33990", "33991", "33993", "33909"]);
    const rows = out.detail_tables![0].rows.map((r) => r.key);
    expect(rows).toEqual(["33904", "33914", "33990"]);
  });

  it("returns the output unchanged when zips is empty", () => {
    const o = makeOutput();
    expect(filterOutputToZips(o, [])).toBe(o);
  });

  it("leaves non-zip-grain tables and key_metrics untouched", () => {
    const o = makeOutput();
    o.detail_tables![0].grain = "county";
    const out = filterOutputToZips(o, ["33904"]);
    expect(out.detail_tables![0].rows.length).toBe(5); // county grain → not filtered
    expect(out.key_metrics.length).toBe(3);
  });
});

describe("computeMetricChart detailTablesOnly", () => {
  it("charts the city's ZIPs after filtering", () => {
    const out = filterOutputToZips(makeOutput(), ["33904", "33914", "33990"]);
    const chart = computeMetricChart(out, { detailTablesOnly: true });
    expect(chart).not.toBeNull();
    expect(chart!.rows.map((r) => r[0])).toEqual(["33904", "33914", "33990"]);
  });

  it("returns null (no SWFL key-metrics fallback) when the filter leaves too few ZIP rows", () => {
    const out = filterOutputToZips(makeOutput(), ["00000"]); // no match → 0 rows
    expect(computeMetricChart(out, { detailTablesOnly: true })).toBeNull();
  });

  it("default (no opts) still falls back to key_metrics — unchanged behavior", () => {
    const out = filterOutputToZips(makeOutput(), ["00000"]);
    const chart = computeMetricChart(out);
    expect(chart).not.toBeNull(); // key_metrics group of 3 count/currency still charts
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bunx vitest run refinery/lib/chart-from-metrics.test.mts`
Expected: FAIL — `filterOutputToZips is not a function` and the `detailTablesOnly` cases fail.

- [ ] **Step 3: Implement `filterOutputToZips` and the option**

In `refinery/lib/chart-from-metrics.mts`, add near the top (after imports) the row-ZIP helper and the filter:

```ts
const FIVE_DIGIT_RE = /\b(\d{5})\b/;

/** The ZIP a per-ZIP detail row identifies: its `key` when that IS a 5-digit ZIP,
 *  else the first 5-digit token in its `label`. `null` when neither yields one. */
function rowZip(row: BrainOutputDetailRow): string | null {
  if (/^\d{5}$/.test(row.key)) return row.key;
  const m = FIVE_DIGIT_RE.exec(row.label ?? "");
  return m ? m[1] : null;
}

/**
 * Return a shallow-cloned BrainOutput whose per-ZIP (`grain` contains "zip")
 * detail-table rows are kept only when their ZIP is in `zips`. Non-per-ZIP tables
 * and `key_metrics` pass through untouched. Empty `zips` or no detail tables →
 * the SAME reference back (callers that pass no filter get byte-identical output).
 */
export function filterOutputToZips(output: BrainOutput, zips: readonly string[]): BrainOutput {
  if (zips.length === 0 || !output.detail_tables?.length) return output;
  const set = new Set(zips);
  const detail_tables = output.detail_tables.map((t) => {
    if (!/zip/i.test(t.grain)) return t;
    const rows = t.rows.filter((r) => {
      const z = rowZip(r);
      return z !== null && set.has(z);
    });
    return { ...t, rows };
  });
  return { ...output, detail_tables };
}
```

Then change `computeMetricChart` to accept the option and honor it:

```ts
export function computeMetricChart(
  output: BrainOutput,
  opts: { detailTablesOnly?: boolean } = {},
): ChartBlock | null {
  const asOf = output.refined_at.slice(0, 10);
  const fromTable = output.detail_tables ? chartFromDetailTable(output.detail_tables, asOf) : null;
  if (fromTable) return { ...fromTable, frame_id: "bar-table" };
  // A ZIP-filtered (city-scoped) request must NEVER fall back to the SWFL-wide
  // key_metrics chart — that would put region aggregates under a city's name.
  if (opts.detailTablesOnly) return null;
  const fromMetrics = chartFromKeyMetrics(output.key_metrics, asOf);
  return fromMetrics ? { ...fromMetrics, frame_id: "bar-table" } : null;
}
```

Confirm `BrainOutputDetailRow` is in the existing type import at the top of the file (it is: `BrainOutputDetailTable` is imported — add `BrainOutputDetailRow` to that same import block if not already present).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run refinery/lib/chart-from-metrics.test.mts`
Expected: PASS (all cases).

- [ ] **Step 5: Confirm no existing caller broke**

Run: `bunx vitest run refinery/lib/chart-from-metrics.test.mts && bunx vitest run refinery/`
Expected: PASS. `computeMetricChart`'s new second param is optional, so every existing call is unchanged.

- [ ] **Step 6: Commit**

```bash
git add refinery/lib/chart-from-metrics.mts refinery/lib/chart-from-metrics.test.mts
git commit -m "feat(chart): filterOutputToZips + computeMetricChart detailTablesOnly guard"
```

---

### Task 2: Opt-in `{ zips }` on `buildChartForQuestion`

**Files:**
- Modify: `lib/assistant/chart-for-question.ts`
- Test: `lib/assistant/chart-for-question.test.ts` (create if absent)

**Interfaces:**
- Consumes: `filterOutputToZips` from `@/refinery/lib/chart-from-metrics.mts`; existing `bindRankedDeltaSpec(output, opts)`, `computeMetricChart(output, opts)`, `fetchBrain`, `resolveReachTargets`, `routeChart`, `routeRankedDelta`, `summarizeChartForGrounding`.
- Produces: `buildChartForQuestion(question: string, origin: string, opts?: { zips?: string[] }): Promise<ChartForQuestion | null>` — when `opts.zips` is non-empty, every fetched brain output is run through `filterOutputToZips` before both producers, and `computeMetricChart` is called with `{ detailTablesOnly: true }`. When absent, behavior is byte-identical to today.

- [ ] **Step 1: Write the failing tests**

Create `lib/assistant/chart-for-question.test.ts`:

```ts
import { test, expect } from "bun:test";
import { filterOutputToZips } from "@/refinery/lib/chart-from-metrics.mts";
import type { BrainOutput } from "@/refinery/types/brain-output.mts";

// This task's unit-level guarantee is that the filter composes correctly with the
// producers; buildChartForQuestion itself hits the network (fetchBrain), so we test
// the composition seam here and leave the live route to the *_live_verify check.
function outputWith(zipRows: [string, number][]): BrainOutput {
  return {
    refined_at: "2026-07-06T00:00:00.000Z",
    key_metrics: [],
    detail_tables: [
      {
        id: "by_zip", title: "Median by ZIP", grain: "zip",
        columns: [{ id: "v", label: "Median", display_format: "currency", units: "USD" }],
        rows: zipRows.map(([z, v]) => ({ key: z, label: z, cells: { v } })),
      },
    ],
  } as unknown as BrainOutput;
}

test("filter keeps a city's ZIPs and drops the rest before charting", () => {
  const out = filterOutputToZips(
    outputWith([["33904", 410000], ["33914", 560000], ["33990", 380000], ["34102", 2200000]]),
    ["33904", "33914", "33990", "33991", "33993", "33909"],
  );
  expect(out.detail_tables![0].rows.map((r) => r.key)).toEqual(["33904", "33914", "33990"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/assistant/chart-for-question.test.ts`
Expected: FAIL only if the import path is wrong; if it passes immediately, that is acceptable — it pins the composition. Proceed to wire the route.

- [ ] **Step 3: Thread `{ zips }` through `buildChartForQuestion`**

In `lib/assistant/chart-for-question.ts`:

Add the import:

```ts
import { computeMetricChart, filterOutputToZips } from "@/refinery/lib/chart-from-metrics.mts";
```

Change the signature and, immediately after each `const { output } = await fetchBrain(...)`, filter:

```ts
export async function buildChartForQuestion(
  question: string,
  origin: string,
  opts: { zips?: string[] } = {},
): Promise<ChartForQuestion | null> {
  if (!question || typeof question !== "string") return null;
  const zips = opts.zips ?? [];
  const scope = (o: BrainOutput): BrainOutput => (zips.length ? filterOutputToZips(o, zips) : o);
  const metricOpts = zips.length ? { detailTablesOnly: true } : undefined;
  // ...
```

Then in each of the three layers, apply `scope(output)` and pass `metricOpts`:

- Layer 0 (ranked-delta):
  ```ts
  const { output } = await fetchBrain(rdSlug, { tier: 2, origin });
  const rd = bindRankedDeltaSpec(scope(output));
  if (rd) return { chart: rd, groundingNote: summarizeChartForGrounding(rd) };
  ```
- Layer 2 (generic loop), for each slug:
  ```ts
  const { output } = await fetchBrain(slug, { tier: 2, origin });
  const scoped = scope(output);
  const ranked = bindRankedDeltaSpec(scoped);
  if (ranked) return { chart: ranked, groundingNote: summarizeChartForGrounding(ranked) };
  const block = computeMetricChart(scoped, metricOpts);
  if (block) {
    const chart: ChartSpec = { ...block, frameId: block.frame_id ?? "bar-table" };
    return { chart, groundingNote: summarizeChartForGrounding(chart) };
  }
  ```

Add `import type { BrainOutput } from "@/refinery/types/brain-output.mts";` for the `scope` helper's annotation. Layer 1 (`buildChartForIntent`) reads fixture intents, not the per-ZIP brain table, so it is left unfiltered — a rich special-case visual is not a city ZIP breakdown; the generic layer is where city filtering belongs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/assistant/chart-for-question.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard the default path (chat-regression wall)**

Confirm the default call is unchanged: `metricOpts` is `undefined` and `scope` is identity when `zips` is empty, so `bindRankedDeltaSpec(output)` / `computeMetricChart(output)` run exactly as before. Grep to confirm no other caller passes a third arg:

Run: `grep -rn "buildChartForQuestion(" lib/ app/ --include=*.ts --include=*.tsx`
Expected: only `build-doc.ts` calls it; the chat/answer callers pass two args (unchanged).

- [ ] **Step 6: Commit**

```bash
git add lib/assistant/chart-for-question.ts lib/assistant/chart-for-question.test.ts
git commit -m "feat(chart): buildChartForQuestion opt-in { zips } filter — default byte-identical"
```

---

### Task 3: Allowlist + wire `promptPlace.zips` into the email chart

**Files:**
- Modify: `lib/email/build-doc.ts`
- Test: `lib/email/build-doc.test.ts`

**Interfaces:**
- Consumes: `zipFromPromptPlace(text)` returns `{ place, zip, zips }`; `buildChartForQuestion(question, origin, { zips })`.
- Produces: `VERIFIED_MULTI_ZIP_CITIES: ReadonlySet<string>`; `cityZipsFor(promptPlace): string[] | undefined` (exported for the unit test) — returns the full ZIP list only for an allowlisted, multi-ZIP place, else `undefined`. `buildPromptChart` gains an optional `zips?: string[]` param forwarded to `buildChartForQuestion`.

- [ ] **Step 1: Write the failing test**

Add to `lib/email/build-doc.test.ts`:

```ts
import { cityZipsFor } from "./build-doc";

test("cityZipsFor returns the ZIP list for an allowlisted multi-ZIP city", () => {
  const cape = cityZipsFor({ place: "Cape Coral", zip: "33904", zips: ["33904", "33914", "33990", "33991", "33993", "33909"] });
  expect(cape).toEqual(["33904", "33914", "33990", "33991", "33993", "33909"]);
});

test("cityZipsFor returns undefined for Estero (single ZIP, corrected 07/06/2026)", () => {
  expect(cityZipsFor({ place: "Estero", zip: "33928", zips: ["33928"] })).toBeUndefined();
});

test("cityZipsFor returns undefined for a single-ZIP place and for undefined", () => {
  expect(cityZipsFor({ place: "Sanibel", zip: "33957", zips: ["33957"] })).toBeUndefined();
  expect(cityZipsFor(undefined)).toBeUndefined();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test lib/email/build-doc.test.ts`
Expected: FAIL — `cityZipsFor` is not exported.

- [ ] **Step 3: Add the allowlist + helper**

In `lib/email/build-doc.ts`, near the top (after imports):

```ts
/** The multi-ZIP cities whose ZIP sets are USPS+Mapbox-verified (2026-07-06). Only
 *  these get the ZIP-by-ZIP city chart — a fail-closed allowlist so an unverified or
 *  wrongly-listed place (see the Estero correction) never charts neighbor-city ZIPs
 *  under its own name. New entries join only after the same three-source check. */
const VERIFIED_MULTI_ZIP_CITIES: ReadonlySet<string> = new Set([
  "Cape Coral",
  "Fort Myers",
  "Naples",
  "Lehigh Acres",
  "Bonita Springs",
]);

/** The city's full ZIP list for the ZIP-by-ZIP chart, or undefined when the place is
 *  not an allowlisted multi-ZIP city (single-ZIP places, explicit ZIP scopes, and
 *  unverified places all fall through to the existing single-scope chart). */
export function cityZipsFor(
  promptPlace: { place: string; zip: string; zips: string[] } | undefined,
): string[] | undefined {
  if (!promptPlace) return undefined;
  if (!VERIFIED_MULTI_ZIP_CITIES.has(promptPlace.place)) return undefined;
  return promptPlace.zips.length > 1 ? promptPlace.zips : undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test lib/email/build-doc.test.ts`
Expected: PASS.

- [ ] **Step 5: Forward `zips` from `buildPromptChart` and wire it in `authorDoc`**

In `buildPromptChart`, add the param and pass it through:

```ts
async function buildPromptChart(
  prompt: string,
  doc: EmailDoc,
  scope?: BuildScope,
  chartType?: ChartType,
  zips?: string[],
): Promise<{ image: EmailChartImage; groundingNote: string; note?: string } | null> {
  try {
    const question = scope?.value ? `${prompt} (${scope.kind ?? "scope"}: ${scope.value})` : prompt;
    const cfq = await buildChartForQuestion(question, BASE_URL, zips?.length ? { zips } : undefined);
```

In `authorDoc`, compute the city ZIPs and pass them into the chart call (the `Promise.all` at the `fetchLakeParts` / `buildPromptChart` / `resolveHeroPhoto` site):

```ts
const chartZips = cityZipsFor(promptPlace);
const [lakeParts, chartRes, photoRes] = await Promise.all([
  fetchLakeParts(effectiveScope),
  buildPromptChart(prompt, currentDoc, effectiveScope, chartType, chartZips),
  resolveHeroPhoto(prompt, currentDoc),
]);
```

Leave the `buildContentDoc` call to `buildPromptChart` unchanged (no `zips` — the re-fill path is not the recipe/author path). The grounding note returned by `buildPromptChart` is already derived from the (now filtered) chart, so no separate grounding change is needed.

- [ ] **Step 6: Run the full email build-doc + chart test set**

Run: `bun test lib/email/build-doc.test.ts && bunx vitest run refinery/lib/chart-from-metrics.test.mts`
Expected: PASS. Confirm the existing `build-doc.test.ts` cases (patch parser, dropSuperseded, placeholder guard) still pass.

- [ ] **Step 7: Commit**

```bash
git add lib/email/build-doc.ts lib/email/build-doc.test.ts
git commit -m "feat(email): allowlisted multi-ZIP cities chart their own ZIPs (cityZipsFor)"
```

---

### Task 4: Live-verify handoff (operator-run)

**Files:** none (verification only).

**Interfaces:** Consumes the wired build. Closes `multi_zip_city_chart_live_verify`.

- [ ] **Step 1: Offline confidence check**

Run: `bun test lib/email/build-doc.test.ts lib/assistant/chart-for-question.test.ts && bunx vitest run refinery/lib/chart-from-metrics.test.mts`
Expected: all PASS. This is the completion bar for the code; the live paid build is operator-run (no autonomous paid API calls).

- [ ] **Step 2: Operator live-verify (manual)**

In the grid email lab, build "market pulse for Cape Coral". Confirm the chart shows Cape Coral's ZIPs (33904/33909/33914/33990/33991/33993 as present in the brain), NOT Naples/beach ZIPs, and that the grounding text names only Cape Coral figures. Repeat for one more city (e.g. Fort Myers). Then close the check:

Run: `node scripts/check.mjs close multi_zip_city_chart_live_verify`

---

## Self-Review

**Spec coverage:**
- Filter helper on shared producer → Task 1. ✅
- Opt-in `{ zips }`, default byte-identical → Task 2 (Steps 3, 5). ✅
- Fail-closed allowlist, Estero excluded → Task 3 (`cityZipsFor`, tests). ✅
- Moat/grounding on filtered chart → Task 2 (Step 3, grounding runs on scoped chart) + Task 3 (Step 5 note). ✅
- "<3 city ZIPs → no chart, never wrong-city" → Task 1 `detailTablesOnly` + its null test. ✅
- Tests incl. chat-regression guard → Task 2 Step 5. ✅
- Out of scope (dossier, crosswalk, new shapes) → untouched; no task edits them. ✅

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `filterOutputToZips(output, zips)`, `computeMetricChart(output, { detailTablesOnly })`, `buildChartForQuestion(question, origin, { zips })`, `cityZipsFor(promptPlace)` — names/signatures identical across Tasks 1–3. `promptPlace` shape `{ place, zip, zips }` matches `zipFromPromptPlace`'s return.
