# Deliverable Coherence Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 16 files, keywords: refactor, architecture

**Goal:** Make an incoherent chart↔headline deliverable structurally unable to ship — a red author-time CI test over every chart-bearing template, a soft runtime drop-on-incoherence in the live email build, and the Naples luxury-ring fixture that proves the rule (replacing the $3.17M-over-$802K luxury bug).

**Architecture:** One pure function already ships (`assertHeroChartCoherence` + `parseHeroFigure`, `lib/deliverable/chart-coherence.ts`). This plan wires its two callers: (1) an author-time test that resolves each template's ACTUAL rendered headline block (hero or metric-card) and its ACTUAL rendered chart asset, via a new shared, side-effect-free data module (`SEED_CHART_SERIES`); (2) a runtime hook in `lib/email/build-doc.ts`'s `buildPromptChart` that compares the live-built `ChartSpec`'s magnitude against the doc's own headline block, dropping the chart (never the send) on a clear mismatch. The Naples luxury ring fixture is real data (`data_lake.listing_price_histogram_swfl_latest`, 07/11/2026) rendered through `donutShareSvg` with a new dark/gold `ground` option, and — in Stage 2 — coupled live via the one unused seam already reserved for exactly this (`FrameBindRequest.table_id` in `lib/deliverable/bind-frame.ts`).

**Tech Stack:** TypeScript, Bun test runner, existing `refinery/packs` pipeline (Deno-free — this is app-side `lib/`), Next.js.

**Spec:** `docs/superpowers/specs/2026-07-11-deliverable-coherence-gate-design.md` (approved, pre-implementation). Checks already open: `deliverable_coherence_gate_live_verify`, `promised_deliverable_element_coherence_audit`.

## Global Constraints

- `assertHeroChartCoherence` / `parseHeroFigure` (`lib/deliverable/chart-coherence.ts`) are ALREADY SHIPPED — do not modify their logic. Every new caller imports them; none reimplements the comparison.
- FACTOR = 3× is the only threshold. Percent headlines and percent charts always abstain (`coherent: true`) — never add a percent-vs-percent special case.
- Runtime is soft: on incoherence, DROP the chart, `console.log` the reason, NEVER block or throw (RULE 0.7 — a chart is a bonus, never a blocker). Author-time is strict: red CI, no silent pass.
- `COHERENCE_ALLOWLIST` entries require a template id + one-line human reason — no wildcard, no blanket suppression.
- Every luxury-ring figure must cite a real source (`data_lake.listing_price_histogram_swfl_latest`, realtor.com, as of 07/11/2026) — no invented numbers (RULE 0.7 / four-lane).
- `lib/email/CLAUDE.md` is the one place the written rule lives — don't duplicate it elsewhere.
- Verify with `bunx next build`, not `npx tsc` (this repo's convention).
- Touching `refinery/packs/**` (Task 7) re-triggers Gate 5 (`catalog.test.mts` mirror + the pack's own `bun:test`) and is a brain pack edit changing `--- OUTPUT ---` shape (new `detail_table`) — per RULE 1 this needs an explicit ask-before-push, not autonomous push.
- Never `git add -A` — stage explicit paths only (RULE 1.5).

---

## Stage 1 — fixes the screenshot (self-contained, no cross-build dependency)

### Task 1: Extract `SEED_CHART_SERIES` — the one authority for sample chart numbers

**Files:**
- 🔴 Create: `lib/email/doc/seed-chart-series.ts`
- 🔴 Modify: `scripts/generate-seed-preview-charts.mts:194-395` (replace the 9 inline series consts with imports)
- Test: `lib/email/doc/seed-chart-series.test.ts`

**Interfaces:**
- Produces: `export type UnitClass = "currency" | "percent" | "count" | "other"`, `export interface SeedSeries { values: number[]; unit: UnitClass }`, `export const SEED_CHART_SERIES: Record<string, SeedSeries>` keyed by the committed asset's basename (e.g. `"chart-luxury-top-tier.svg"`).
- Consumes (Task 2): `SEED_CHART_SERIES[basename]` to resolve a rendered chart's plotted values.

Today `generate-seed-preview-charts.mts` defines 9 series as local consts (`ZIP_ASKING`, `LEE_ASKING`, `LEE_INVENTORY`, `LEE_TOP_TIER`, `ZIP_33914`, `FM_RENT`, `PMMS_30YR`, `LEE_SALES_BY_MONTH`, `LEE_SALE_PRICE`) and writes SVGs as a side-effecting top-level script — it CANNOT be imported by a test (it calls `writeFileSync` at module load). Extracting the values into a pure, side-effect-free module lets both the generator and the test import the SAME numbers (DRY — spec §2's stated requirement).

A 10th entry, `chart-lee-home-values.svg`, is NOT produced by this script — it's a legacy hand-built asset (`public/showcase/seed-previews/assets/chart-lee-home-values.svg`). Its own embedded comment cites real values: "Zillow Home Value Index, average across Lee County ZIPs, monthly period_end 2025-05-31 through 2026-05-31 (lake view zhvi_swfl, pulled 07/09/2026)" with 13 real points. Include it in `SEED_CHART_SERIES` too — the module's job is "every committed sample chart's real numbers," not "only the ones this one script writes."

- [ ] **Step 1: Write the failing test**

```typescript
// lib/email/doc/seed-chart-series.test.ts
import { describe, it, expect } from "bun:test";
import { SEED_CHART_SERIES } from "./seed-chart-series";

describe("SEED_CHART_SERIES", () => {
  const EXPECTED_KEYS = [
    "chart-zip-asking-bars.svg",
    "chart-lee-median-asking.svg",
    "chart-lee-active-inventory.svg",
    "chart-luxury-top-tier.svg",
    "chart-zip33914-asking.svg",
    "chart-fm-rent.svg",
    "chart-pmms-rate.svg",
    "chart-lee-sales-by-month.svg",
    "chart-lee-sale-price-year.svg",
    "chart-lee-home-values.svg",
  ];

  it("carries every committed seed-preview chart asset", () => {
    for (const key of EXPECTED_KEYS) {
      expect(SEED_CHART_SERIES[key], key).toBeTruthy();
    }
  });

  it("every series has at least one finite value and a valid unit", () => {
    const UNITS = new Set(["currency", "percent", "count", "other"]);
    for (const [key, series] of Object.entries(SEED_CHART_SERIES)) {
      expect(series.values.length, key).toBeGreaterThan(0);
      expect(series.values.every((v) => Number.isFinite(v)), key).toBe(true);
      expect(UNITS.has(series.unit), `${key} unit`).toBe(true);
    }
  });

  it("chart-luxury-top-tier plots the $745K-$802K range (the bug's own chart, pre-fix)", () => {
    const s = SEED_CHART_SERIES["chart-luxury-top-tier.svg"];
    expect(Math.min(...s.values)).toBeCloseTo(745575, -2);
    expect(Math.max(...s.values)).toBeCloseTo(801690, -2);
    expect(s.unit).toBe("currency");
  });

  it("chart-lee-home-values plots real ZHVI-average endpoints", () => {
    const s = SEED_CHART_SERIES["chart-lee-home-values.svg"];
    expect(Math.min(...s.values)).toBeCloseTo(433549, -2);
    expect(Math.max(...s.values)).toBeCloseTo(471582, -2);
    expect(s.unit).toBe("currency");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/doc/seed-chart-series.test.ts`
Expected: FAIL — `Cannot find module './seed-chart-series'`

- [ ] **Step 3: Write the module**

```typescript
// lib/email/doc/seed-chart-series.ts
//
// SEED_CHART_SERIES — the ONE authority for every committed seed-preview
// chart's REAL plotted numbers (spec: 2026-07-11-deliverable-coherence-gate).
// scripts/generate-seed-preview-charts.mts imports these arrays to render the
// SVGs; lib/email/doc/preview-fill.test.ts imports this same map to run the
// author-time chart<->headline coherence gate. One source, two consumers —
// never redefine a series in either caller.
//
// Every entry is real and sourced (see scripts/generate-seed-preview-charts.mts
// for full per-series citations; chart-lee-home-values.svg is the one
// exception — a legacy hand-built asset predating that script, values read
// verbatim from its own embedded SVG comment, Zillow ZHVI average, pulled
// 07/09/2026).

import type { UnitClass } from "@/lib/deliverable/chart-coherence";

export interface SeedSeries {
  values: number[];
  unit: UnitClass;
}

// ── weekly-pulse header — median asking across the six biggest Lee ZIPs ─────
export const ZIP_ASKING_VALUES = [550000, 525000, 418500, 409998, 369900, 326000];

// ── weekly-pulse left / market-spotlight — Lee County median asking, monthly ─
export const LEE_ASKING_VALUES = [
  424950, 415711, 405000, 399900, 399900, 399900, 399949, 399999, 399900, 399900, 399600, 399000,
  396850,
];

// ── weekly-pulse right / monthly-digest — Lee County homes for sale, monthly ─
export const LEE_INVENTORY_VALUES = [
  12892, 12353, 11160, 10670, 11041, 11692, 12045, 12332, 12676, 12442, 11981, 11347, 10575,
];

// ── luxury-market-report (PRE-FIX) — Lee County top-tier home value, monthly ─
export const LEE_TOP_TIER_VALUES = [
  801690, 789767, 777384, 765786, 760128, 758008, 754701, 752378, 750969, 750908, 750433, 748892,
  745575,
];

// ── neighborhood-report — ZIP 33914 (Cape Coral) median asking, monthly ─────
export const ZIP_33914_VALUES = [599000, 599725, 599000, 595750, 589450, 589925, 574900, 550000];

// ── investment-brief — Fort Myers typical asking rent, monthly ──────────────
export const FM_RENT_VALUES = [
  1850, 1843, 1826, 1823, 1809, 1807, 1805, 1807, 1814, 1806, 1799, 1787, 1798, 1807,
];

// ── rate-watch — 30-year fixed rate, weekly (last 13 weeks is plenty for the
// coherence check's min/max; full history stays in generate-seed-preview-charts.mts) ─
export const PMMS_30YR_VALUES = [
  6.67, 6.72, 6.75, 6.74, 6.72, 6.63, 6.58, 6.58, 6.56, 6.5, 6.35, 6.26, 6.3, 6.34, 6.3, 6.27, 6.19,
  6.17, 6.22, 6.24, 6.26, 6.23, 6.19, 6.22, 6.21, 6.18, 6.15, 6.16, 6.06, 6.09, 6.1, 6.11, 6.09,
  6.01, 5.98, 6.0, 6.11, 6.22, 6.38, 6.46, 6.37, 6.3, 6.23, 6.3, 6.37, 6.36, 6.51, 6.53, 6.48, 6.52,
  6.47, 6.49, 6.43, 6.49,
];

// ── monthly-digest — Lee County recorded sales by month ─────────────────────
export const LEE_SALES_BY_MONTH_VALUES = [
  3779, 2997, 2983, 2727, 3071, 2709, 2512, 3111, 2602, 3064, 3849, 3636,
];

// ── year-in-review — Lee County median recorded sale price, monthly ─────────
export const LEE_SALE_PRICE_VALUES = [
  349999, 325000, 325000, 316990, 336000, 325000, 307950, 327170, 318500, 325000, 320000, 330500,
];

// ── trend-snapshot — Lee County average ZIP home value (legacy hand-built
// chart-lee-home-values.svg; values read verbatim from its own SVG comment) ──
export const LEE_ZHVI_AVERAGE_VALUES = [
  471582, 465042, 457865, 450955, 445780, 442310, 440183, 438579, 437639, 437124, 436605, 435432,
  433549,
];

export const SEED_CHART_SERIES: Record<string, SeedSeries> = {
  "chart-zip-asking-bars.svg": { values: ZIP_ASKING_VALUES, unit: "currency" },
  "chart-lee-median-asking.svg": { values: LEE_ASKING_VALUES, unit: "currency" },
  "chart-lee-active-inventory.svg": { values: LEE_INVENTORY_VALUES, unit: "count" },
  "chart-luxury-top-tier.svg": { values: LEE_TOP_TIER_VALUES, unit: "currency" },
  "chart-zip33914-asking.svg": { values: ZIP_33914_VALUES, unit: "currency" },
  "chart-fm-rent.svg": { values: FM_RENT_VALUES, unit: "currency" },
  "chart-pmms-rate.svg": { values: PMMS_30YR_VALUES, unit: "percent" },
  "chart-lee-sales-by-month.svg": { values: LEE_SALES_BY_MONTH_VALUES, unit: "count" },
  "chart-lee-sale-price-year.svg": { values: LEE_SALE_PRICE_VALUES, unit: "currency" },
  "chart-lee-home-values.svg": { values: LEE_ZHVI_AVERAGE_VALUES, unit: "currency" },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/doc/seed-chart-series.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Point the generator at the shared module (no behavior change — same numbers, same output SVGs)**

In `scripts/generate-seed-preview-charts.mts`, replace the 9 local const declarations (lines 194-395: `ZIP_ASKING` through `LEE_SALE_PRICE`, plus their derived `_AVG` consts) with an import and a thin adapter back to the shapes `trend()`/`bars()` expect (`{label, value}[]` / `EmailTrendPoint[]`), keeping every existing `label` string (dates/ZIPs) exactly as today — only the numeric arrays move. Add at the top:

```typescript
import {
  ZIP_ASKING_VALUES,
  LEE_ASKING_VALUES,
  LEE_INVENTORY_VALUES,
  LEE_TOP_TIER_VALUES,
  ZIP_33914_VALUES,
  FM_RENT_VALUES,
  PMMS_30YR_VALUES,
  LEE_SALES_BY_MONTH_VALUES,
  LEE_SALE_PRICE_VALUES,
} from "../lib/email/doc/seed-chart-series";
```

Then rebuild each `points`/labeled-array const by zipping the existing label list (keep those inline — they're presentation, not the coherence-checked numbers) with the imported values array, e.g.:

```typescript
const ZIP_ASKING_LABELS = ["33914", "34135", "33904", "33993", "33908", "33974"];
const ZIP_ASKING = ZIP_ASKING_LABELS.map((label, i) => ({ label, value: ZIP_ASKING_VALUES[i] }));
```

Repeat for the other 8 series (labels are the existing ISO month strings already in the file — keep them verbatim, zip against the matching `*_VALUES` import). Delete the now-redundant raw number literals; keep every `_AVG` derivation (`ZIP_ASKING_AVG`, `LEE_SALES_AVG`) computed from the new arrays exactly as before.

- [ ] **Step 6: Run the generator and confirm byte-identical output**

Run: `bun scripts/generate-seed-preview-charts.mts`
Expected: `wrote chart-*.svg` × 9, then `done → ...`. Diff the 9 regenerated files against `git diff public/showcase/seed-previews/assets/` — expect NO changes (same numbers, same labels, same render path).

- [ ] **Step 7: Run the full existing preview-fill suite (regression check)**

Run: `bun test lib/email/doc/preview-fill.test.ts`
Expected: PASS (all existing tests green — nothing in this task touched `preview-fill.ts` itself)

- [ ] **Step 8: Commit**

```bash
git add lib/email/doc/seed-chart-series.ts lib/email/doc/seed-chart-series.test.ts scripts/generate-seed-preview-charts.mts
git commit -m "refactor(email): extract SEED_CHART_SERIES as one authority for seed-preview chart numbers"
```

---

### Task 2: Author-time coherence gate over all 9 chart-bearing templates

**Files:**
- Modify: `lib/email/doc/preview-fill.test.ts` (add exported `chartUrls` reuse + new `describe` block)
- 🔴 Modify: `lib/email/doc/preview-fill.ts` (export a `resolveHeadlineFigure` helper — see below; this is the SAME logic Task 6's runtime hook needs, written once)

**Interfaces:**
- Consumes: `assertHeroChartCoherence`, `parseHeroFigure`, `type HeroFigure` from `lib/deliverable/chart-coherence.ts`; `SEED_CHART_SERIES` from `./seed-chart-series` (Task 1).
- Produces: `export function resolveHeadlineFigure(doc: EmailDoc): HeroFigure | null` in `preview-fill.ts` — reused by Task 6's live runtime hook so the "what counts as this doc's headline" logic exists in exactly ONE place (a template's headline may render as a `hero` block OR a `metric-card` block — `trend-snapshot` has no `hero` block at all and its real headline is the `metric-card`'s `$433,549`).

The test must read the ACTUAL rendered output (via `previewFill`), not the raw `SEED_ASSIGNMENTS` fixture directly — a template can fall back to `SEED_PREVIEW_FILL.hero`/`.metricCard` when its own assignment omits one, and only the rendered doc reflects that truth (this is exactly how `trend-snapshot` gets its $433,549 headline despite no `hero` key in its `SEED_ASSIGNMENTS` entry).

- [ ] **Step 1: Add `resolveHeadlineFigure` to `preview-fill.ts` (pure, exported)**

Add near the top of `lib/email/doc/preview-fill.ts` (after the existing imports):

```typescript
import { parseHeroFigure, type HeroFigure } from "@/lib/deliverable/chart-coherence";

/**
 * The doc's headline figure for coherence-checking: a `hero` block's value if
 * the template renders one, else the first `metric-card` block's metricValue
 * (trend-snapshot has no hero block — its real headline is the metric-card).
 * Null when neither block type is present. Shared by the author-time gate
 * (preview-fill.test.ts) and the live runtime hook (build-doc.ts) — ONE
 * definition of "this doc's headline," never two.
 */
export function resolveHeadlineFigure(doc: EmailDoc): HeroFigure | null {
  for (const b of doc.blocks) {
    if (b.type === "hero" && b.props.value) return parseHeroFigure(b.props.value);
  }
  for (const b of doc.blocks) {
    if (b.type === "metric-card" && b.props.metricValue) {
      return parseHeroFigure(String(b.props.metricValue));
    }
  }
  return null;
}
```

- [ ] **Step 2: Write the failing test**

Add to `lib/email/doc/preview-fill.test.ts` (after the existing `describe("previewFill", ...)` block, same file — the spec calls this "on the existing seed-preview suite"):

```typescript
import { assertHeroChartCoherence } from "../../deliverable/chart-coherence";
import { SEED_CHART_SERIES } from "./seed-chart-series";
import { resolveHeadlineFigure } from "./preview-fill";

/** Basename of a committed chart asset URL ("/showcase/.../chart-x.svg" -> "chart-x.svg"). */
function assetBasename(url: string): string {
  return url.split("/").pop() ?? url;
}

// A real, human-reasoned exception — template id + why. Empty today: the
// luxury fixture (Task 4) is the fix, not an allowlisted exception. Adding an
// entry here is a deliberate, reviewed call — never a way to silence red CI.
const COHERENCE_ALLOWLIST: Record<string, string> = {};

describe("chart<->headline coherence gate (deliverable-coherence-gate)", () => {
  const CHART_BEARING_TEMPLATES = [
    "market-spotlight",
    "weekly-pulse",
    "trend-snapshot",
    "rate-watch",
    "luxury-market-report",
    "neighborhood-report",
    "investment-brief",
    "monthly-digest",
    "year-in-review",
  ];

  it("covers exactly the 9 chart-bearing templates (catches a new one silently gaining a chart)", () => {
    const actual = SEED_DOCS.filter((seed) => {
      const urls = chartUrls(previewFill(seed.build(), { seedId: seed.id }));
      return urls.length > 0;
    }).map((s) => s.id);
    expect(new Set(actual)).toEqual(new Set(CHART_BEARING_TEMPLATES));
  });

  it("every chart-bearing template's headline coheres with every one of its charts", () => {
    const failures: string[] = [];
    for (const id of CHART_BEARING_TEMPLATES) {
      const seed = SEED_DOCS.find((s) => s.id === id);
      if (!seed) throw new Error(`no SEED_DOCS entry for ${id}`);
      const filled = previewFill(seed.build(), { seedId: id });
      const hero = resolveHeadlineFigure(filled);
      const urls = chartUrls(filled);
      for (const url of urls) {
        const basename = assetBasename(url);
        const series = SEED_CHART_SERIES[basename];
        if (!series) throw new Error(`${id}: no SEED_CHART_SERIES entry for ${basename}`);
        const result = assertHeroChartCoherence({
          hero,
          chart: { values: series.values, unit: series.unit },
        });
        if (!result.coherent && !COHERENCE_ALLOWLIST[id]) {
          failures.push(`${id} (${basename}): ${result.reason}`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails on luxury (proves the gate catches the real bug)**

Run: `bun test lib/email/doc/preview-fill.test.ts`
Expected: FAIL — `luxury-market-report (chart-luxury-top-tier.svg): headline $3,168,000 is 4.0× above the chart's top displayed value $801,690`. This is the intended red state before Task 4's fix — do NOT proceed past this step without seeing this exact failure; if it passes here, the gate isn't wired to the real data and the rest of this task is void.

- [ ] **Step 4: Commit the red gate as its own commit (documents the bug is now mechanically caught, before the fix lands)**

```bash
git add lib/email/doc/preview-fill.ts lib/email/doc/preview-fill.test.ts
git commit -m "test(email): add author-time chart<->headline coherence gate (red on luxury-market-report)"
```

---

### Task 3: `ground` option on `donutShareSvg` — dark/gold skin, surface-neutral

**Files:**
- Modify: `lib/charts/svg/donut-share.ts`
- Test: `lib/charts/svg/donut-share.test.ts` (existing file — add cases)

**Interfaces:**
- Produces: `DonutShareOpts.ground?: "light" | "dark" | "brand-accent"` (default `"light"`, byte-identical to today's output when omitted).
- Consumes (Task 4): `donutShareSvg(segments, { ...opts, ground: "dark" })` for the Naples luxury ring.

This is a NEW field, not `ChartSpec.theme` (`components/charts/registry/chart-spec.ts:22-26`, `{ primary, accent, logoUrl }`) — that field is brand-color theming already wired for Phase 6 and unrelated to this dark-ground skin. Don't collide the two; `ground` is a rendering-surface concern (what background this chart sits on), `theme` is a brand concern (what colors a project uses).

- [ ] **Step 1: Write the failing test**

Add to `lib/charts/svg/donut-share.test.ts`:

```typescript
it("defaults to the light ground (byte-identical to no ground option)", () => {
  const withDefault = donutShareSvg([{ label: "A", value: 60 }, { label: "B", value: 40 }], {
    title: "Test",
    accent: "#2563EB",
  });
  const withExplicitLight = donutShareSvg(
    [{ label: "A", value: 60 }, { label: "B", value: 40 }],
    { title: "Test", accent: "#2563EB", ground: "light" },
  );
  expect(withExplicitLight).toBe(withDefault);
  expect(withDefault).toContain('fill="#ffffff"');
});

it("dark ground renders a dark background and light text", () => {
  const svg = donutShareSvg([{ label: "A", value: 60 }, { label: "B", value: 40 }], {
    title: "Test",
    accent: "#B8860B",
    ground: "dark",
  });
  expect(svg).not.toContain('fill="#ffffff"');
  expect(svg).toMatch(/<rect width="600" height="\d+" fill="#0[A-Fa-f0-9]{5}"\/>/);
});

it("brand-accent ground uses the passed accent as background", () => {
  const svg = donutShareSvg([{ label: "A", value: 60 }, { label: "B", value: 40 }], {
    title: "Test",
    accent: "#7B3FC7",
    ground: "brand-accent",
  });
  expect(svg).toContain('fill="#7B3FC7"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/charts/svg/donut-share.test.ts`
Expected: FAIL — `ground` is not a recognized option; default-case assertions pass but dark/brand-accent cases fail (no dark background rendered).

- [ ] **Step 3: Implement `ground` in `donut-share.ts`**

```typescript
// Add to DonutShareOpts (after `width?: number;`):
  /** Background this chart sits on. "light" (default) matches today's white
   *  canvas byte-for-byte. "dark" is the luxury/premium skin (dark ground +
   *  gold-friendly ramp). "brand-accent" washes the background in the passed
   *  `accent` color with light text — for a branded, high-contrast card. */
  ground?: "light" | "dark" | "brand-accent";
```

Replace the palette consts (`GRID`, `AXIS_TEXT`, `TITLE_FILL`, `LABEL_FILL`) with a resolver, and thread it through the two places they're used (the `head`/`caption` construction and `extendPalette`'s `background` option):

```typescript
interface GroundPalette {
  bg: string;
  title: string;
  label: string;
  axis: string;
  grid: string;
}

function resolveGround(ground: DonutShareOpts["ground"], accent: string): GroundPalette {
  switch (ground) {
    case "dark":
      return { bg: "#12100B", title: "#F5E6C8", label: "#E8D9B5", axis: "#A89768", grid: "#2A2620" };
    case "brand-accent":
      return { bg: accent, title: "#ffffff", label: "#ffffff", axis: "#F0F0F0", grid: "rgba(255,255,255,0.25)" };
    default:
      return { bg: "#ffffff", title: "#1F2937", label: "#374151", axis: "#6B7280", grid: "#EAECEF" };
  }
}
```

In `donutShareSvg`, after resolving `accent` (line 65), add `const palette = resolveGround(opts.ground, accent);` and replace every use of `GRID`/`AXIS_TEXT`/`TITLE_FILL`/`LABEL_FILL` in the function body with `palette.grid`/`palette.axis`/`palette.title`/`palette.label`, and the two hardcoded `fill="#ffffff"` rect fills (main head + the empty-state circle stroke uses `GRID`, already covered) with `palette.bg`. Pass `{ background: palette.bg }` to the existing `extendPalette([accent], rows.length, { background: "#ffffff" })` call (line 117) instead of the hardcoded `"#ffffff"`, so generated segment colors stay distinct against a dark ground too.

Delete the module-level `GRID`/`AXIS_TEXT`/`TITLE_FILL`/`LABEL_FILL` consts (replaced by `resolveGround`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/charts/svg/donut-share.test.ts`
Expected: PASS (all cases, including every pre-existing test in the file — confirms the default path is unchanged)

- [ ] **Step 5: Commit**

```bash
git add lib/charts/svg/donut-share.ts lib/charts/svg/donut-share.test.ts
git commit -m "feat(charts): add ground option (light/dark/brand-accent) to donutShareSvg"
```

---

### Task 4: The Naples luxury ring — fixes the fixture, turns the gate green

**Files:**
- 🔴 Modify: `scripts/generate-seed-preview-charts.mts` (replace the `LEE_TOP_TIER` trend call with a new donut call)
- 🔴 Modify: `lib/email/doc/seed-chart-series.ts` (Task 1's module — swap the luxury entry)
- 🔴 Modify: `lib/email/doc/preview-fill.ts` (fix `CHART_LUXURY` + the `luxury-market-report` `SEED_ASSIGNMENTS` hero/stats)
- Generated: `public/showcase/seed-previews/assets/chart-luxury-naples-ring.svg` (replaces `chart-luxury-top-tier.svg`)

**Interfaces:**
- Consumes: `donutShareSvg` with `ground: "dark"` (Task 3); `assertHeroChartCoherence` (via Task 2's gate — this is what turns it green).

**Data (real, sourced 07/11/2026, `data_lake.listing_price_histogram_swfl_latest`, active for-sale, Collier County / Naples):** `$2–3M = 378`, `$3–5M = 412`, `$5–10M = 284`, `$10M+ = 152`, center total `1,226`.

> **Naming, locked 07/11/2026 (operator decision):** the spec's §4 draft hero copy was `"1,226 homes listed above $2M"`, which overclaims — the source (SteadyAPI `/price-histogram`, realtor.com data) has no `property_type` field at all (verified against the actual ingest call, `ingest/pipelines/market_aggregates/resources.py` — it excludes the `ready_to_build` new-construction status but has no way to separately exclude an ordinary vacant lot listed under plain `for_sale`). Since land can't be confirmed excluded, this section is labeled **"Luxury Listings"** (a category name, not a property-type claim) and every count says **"1,226 listings,"** never "homes." Ship this now on the honest caveat rather than blocking on a vendor property-type check.

- [ ] **Step 1: Add the Naples luxury donut generator function**

In `scripts/generate-seed-preview-charts.mts`, add a `donut()` function alongside `trend()`/`bars()` (same file, same pattern — no new render path):

```typescript
import { donutShareSvg, type DonutSegment } from "../lib/charts/svg/donut-share";

interface DonutDef {
  file: string;
  segments: DonutSegment[];
  total: number;
  title: string;
  accent: string;
  source: string;
  asOf: string;
}

async function donut(def: DonutDef): Promise<void> {
  const svg = donutShareSvg(def.segments, {
    title: def.title,
    accent: def.accent,
    total: def.total,
    unit: "listings",
    source: def.source,
    asOf: def.asOf,
    ground: "dark",
  });
  writeFileSync(join(OUT, def.file), svg);
  console.log("wrote", def.file);
}
```

- [ ] **Step 2: Replace the `LEE_TOP_TIER` trend call with the Naples ring**

Remove the `await trend({ file: "chart-luxury-top-tier.svg", points: LEE_TOP_TIER, ... })` call (and, from Task 1's refactor, its now-unused `LEE_TOP_TIER` array construction — keep `LEE_TOP_TIER_VALUES` in `seed-chart-series.ts` itself; it stays as a citation of the OLD, since-fixed bug for the record, but nothing in the generator references it anymore). Add:

```typescript
await donut({
  file: "chart-luxury-naples-ring.svg",
  segments: [
    { label: "$2M–$3M", value: 378 },
    { label: "$3M–$5M", value: 412 },
    { label: "$5M–$10M", value: 284 },
    { label: "$10M+", value: 152 },
  ],
  total: 1226,
  title: "Luxury Listings · Naples / Collier",
  accent: "#B8860B",
  source: "SWFL Data Gulf, realtor.com price-histogram aggregate · listings, not homes",
  asOf: "2026-07-11",
});
```

- [ ] **Step 3: Update `SEED_CHART_SERIES` for the new asset**

In `lib/email/doc/seed-chart-series.ts`, replace the `"chart-luxury-top-tier.svg"` entry with the new one. Per the honesty note already in `chart-coherence.ts` ("for a donut/share that MUST include the center total, else an honest donut false-flags"), the values array carries the 4 segments PLUS the center total:

```typescript
"chart-luxury-naples-ring.svg": {
  values: [378, 412, 284, 152, 1226],
  unit: "count",
},
```

(Delete the old `"chart-luxury-top-tier.svg"` key — that asset no longer exists after Step 2/4. Keep `LEE_TOP_TIER_VALUES` the const, per Step 2's note, for historical citation; it's just no longer in the `SEED_CHART_SERIES` map since nothing renders it anymore.)

Also update `lib/email/doc/seed-chart-series.test.ts` (added in Task 1): remove the `"chart-luxury-top-tier plots the $745K-$802K range (the bug's own chart, pre-fix)"` test case entirely (that key no longer exists in the map — this assertion would otherwise fail after this task lands) and add its replacement:

```typescript
it("chart-luxury-naples-ring plots the real Naples $2M+ segments plus center total", () => {
  const s = SEED_CHART_SERIES["chart-luxury-naples-ring.svg"];
  expect(s.values).toEqual([378, 412, 284, 152, 1226]);
  expect(s.unit).toBe("count");
});
```

Also update the `EXPECTED_KEYS` list in that same test file: replace `"chart-luxury-top-tier.svg"` with `"chart-luxury-naples-ring.svg"`.

- [ ] **Step 4: Regenerate the committed assets**

Run: `bun scripts/generate-seed-preview-charts.mts`
Expected: `chart-luxury-top-tier.svg` no longer written (remove the stale file: `git rm public/showcase/seed-previews/assets/chart-luxury-top-tier.svg`); `chart-luxury-naples-ring.svg` newly written; the other 8 assets byte-identical (confirms Task 1's refactor didn't drift anything else).

- [ ] **Step 5: Fix `preview-fill.ts` — CHART_LUXURY + the luxury-market-report assignment**

Replace (around line 234-238):

```typescript
const CHART_LUXURY: Chart = {
  url: `${A}/chart-luxury-naples-ring.svg`,
  alt: "Luxury listings by price tier, Naples / Collier County",
  caption: "1,226 luxury listings priced above $2M · Naples / Collier — SWFL Data Gulf",
};
```

Replace the `"luxury-market-report"` entry's `hero`/`stats` (lines 366-377):

```typescript
"luxury-market-report": {
  hero: {
    value: "1,226",
    label: "Luxury Listings · Naples / Collier",
    prose:
      "1,226 listings are priced above $2M in Naples/Collier, top-heavy toward the very top: 152 above $10M.",
  },
  stats: [
    { value: "1,226", label: "Luxury Listings · Naples/Collier" },
    { value: "152", label: "Listed Above $10M" },
  ],
  charts: [CHART_LUXURY],
  photos: [ /* unchanged */
    {
      url: `${A}/swfl-sunset-estate-boats.jpg`,
      alt: "Waterfront estate at sunset with boat docks",
    },
  ],
  listings: [ /* unchanged — the two existing $1.3-1.4M Naples listing rows */
    {
      photoUrl: `${A}/pexels-15334539.jpg`,
      price: "$1,399,000",
      beds: "5",
      baths: "4",
      sqft: "3,359",
      address: "4347 Aurora St, Naples",
    },
    {
      photoUrl: `${A}/pexels-15368388.jpg`,
      price: "$1,360,000",
      beds: "3",
      baths: "3",
      sqft: "2,307",
      address: "9630 Campanile Cir, Naples",
    },
  ],
},
```

- [ ] **Step 6: Run the coherence gate — confirm it goes green**

Run: `bun test lib/email/doc/preview-fill.test.ts`
Expected: PASS — the `chart<->headline coherence gate` describe block now shows `luxury-market-report` coherent (hero `1,226` count vs chart values `[378,412,284,152,1226]` count, `h=1226` sits exactly at `max` — trivially within 3×). Every other pre-existing test in the file (variety guards, asset-exists, no-mutation) still passes since only this one template's fixture changed.

- [ ] **Step 7: Regenerate the gallery capture (visual proof, not test-enforced)**

Run: `bun scripts/capture-seed-previews.mts` (or whatever the project's existing capture script is named — confirm via `Glob "scripts/capture-seed-previews*"` before running; this step is visual QA, not part of the automated gate)

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-seed-preview-charts.mts lib/email/doc/seed-chart-series.ts lib/email/doc/preview-fill.ts
git rm public/showcase/seed-previews/assets/chart-luxury-top-tier.svg
git add public/showcase/seed-previews/assets/chart-luxury-naples-ring.svg
git commit -m "fix(email): replace luxury-market-report's incoherent top-tier chart with the Naples $2M+ ring"
```

---

### Task 5: The written rule

**Files:**
- Modify: `lib/email/CLAUDE.md`

- [ ] **Step 1: Append the rule to the "Charts in deliverables" bullet**

In `lib/email/CLAUDE.md`, extend the existing bullet (don't add a new top-level bullet — this is the same topic):

```markdown
- **Charts in deliverables** go through `buildChartForQuestion` (`lib/email/build-doc.ts`). Every plotted
  number is REAL (held brain / live-web-cited / upload-verified / user-stated) — the model selects points,
  never writes a number. If a shape isn't built, offer bar/table — never "can't chart it". **Every
  chart-bearing deliverable: the chart's magnitude must cohere with its headline** (same unit → headline
  within ~3× of the chart's plotted range), enforced by `assertHeroChartCoherence`
  (`lib/deliverable/chart-coherence.ts`) at author-time (a red CI test over every `SEED_DOCS` template,
  `preview-fill.test.ts`) and at runtime (soft: drop the chart, never block the send). An element type
  ships with its coherence rule — the pattern extends to pictures, commentary, and examples
  (`promised_deliverable_element_coherence_audit`).
```

- [ ] **Step 2: Commit**

```bash
git add lib/email/CLAUDE.md
git commit -m "docs(email): record the chart<->headline coherence rule"
```

---

## Stage 2 — closes the wiring (runtime hook + live-build coupling)

### Task 6: Runtime enforcement in the live email build (email surface only)

**Files:**
- Modify: `lib/deliverable/chart-coherence.ts` (add one exported helper — the ChartSpec-side counterpart to `resolveHeadlineFigure`)
- Modify: `lib/email/build-doc.ts:240-281` (`buildPromptChart`)
- Test: `lib/deliverable/chart-coherence.test.ts` (existing — add cases for the new helper)

**Interfaces:**
- Consumes: `resolveHeadlineFigure` (Task 2, exported from `preview-fill.ts`); `assertHeroChartCoherence` (already shipped).
- Produces: `export function chartMagnitudeFromSpec(spec: ChartSpec): ChartMagnitude | null` in `chart-coherence.ts` — generalizes the value-extraction patterns already proven in `lib/email/spec-to-png.ts`'s `specToBars`/`specToTrendPoints` (bar-table rows, donut-share segments + total, time-series `options.data`) into one UnitClass-aware extractor, so both bar/table AND donut charts are covered without a second bespoke reader.

`buildPromptChart` already receives `doc: EmailDoc` (the doc the chart is being inserted into) — this is exactly what `resolveHeadlineFigure` needs. NOTE: this task is EMAIL-ONLY. The spec's §3 also calls for social (`social-chart-registry` design, not yet built) and picker-parity (7 new picker types, not yet built) to inherit this same guard — those are cross-referenced in `docs/superpowers/specs/2026-07-11-social-chart-registry-design.md` and `docs/superpowers/specs/2026-07-11-chart-picker-parity-design.md` respectively and tracked by the existing `deliverable_coherence_gate_live_verify` check; wiring them is out of scope here until those builds land (writing code against files that don't exist yet would be a placeholder, not a plan).

- [ ] **Step 1: Write the failing test for `chartMagnitudeFromSpec`**

Add to `lib/deliverable/chart-coherence.test.ts`:

```typescript
describe("chartMagnitudeFromSpec", () => {
  it("extracts bar-table rows as count/currency values by value_format", () => {
    const spec = {
      title: "t",
      columns: ["zip", "value"],
      rows: [
        ["33914", 550000],
        ["34135", 525000],
      ],
      chart_type: "bar",
      value_format: "usd",
      frameId: "bar-table",
    } as unknown as import("@/components/charts/registry/chart-spec").ChartSpec;
    const mag = chartMagnitudeFromSpec(spec);
    expect(mag).toEqual({ values: [550000, 525000], unit: "currency" });
  });

  it("extracts donut-share segments PLUS the center total", () => {
    const spec = {
      title: "t",
      columns: ["segment", "share_pct"],
      rows: [],
      chart_type: "bar",
      value_format: "count",
      frameId: "donut-share",
      options: {
        segments: [
          { label: "$2M-3M", value: 378 },
          { label: "$3M-5M", value: 412 },
        ],
        total: 1226,
      },
    } as unknown as import("@/components/charts/registry/chart-spec").ChartSpec;
    const mag = chartMagnitudeFromSpec(spec);
    expect(mag).toEqual({ values: [378, 412, 1226], unit: "count" });
  });

  it("returns null for an unsupported/empty spec", () => {
    const spec = {
      title: "t",
      columns: [],
      rows: [],
      chart_type: "bar",
      frameId: "unknown-frame",
    } as unknown as import("@/components/charts/registry/chart-spec").ChartSpec;
    expect(chartMagnitudeFromSpec(spec)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/chart-coherence.test.ts`
Expected: FAIL — `chartMagnitudeFromSpec is not a function`

- [ ] **Step 3: Implement `chartMagnitudeFromSpec` in `chart-coherence.ts`**

Add (this file stays dependency-light — only a type-only import of `ChartSpec`):

```typescript
import type { ChartSpec } from "../../components/charts/registry/chart-spec";

/** ChartBlock/ChartSpec value_format -> this module's UnitClass. Mirrors
 *  lib/email/spec-to-png.ts's mapValueFormat, kept separate on purpose: that
 *  one targets the SVG builders' ValueFormat, this one targets the coherence
 *  comparison's coarser 4-way class. */
function unitClassOf(vf: string | undefined): UnitClass {
  switch (vf) {
    case "usd":
    case "currency":
    case "aal":
    case "rent":
      return "currency";
    case "percent":
      return "percent";
    case "count":
      return "count";
    default:
      return "other";
  }
}

/**
 * Extract a ChartSpec's displayed magnitude for the coherence check. Covers
 * the two shapes today's runtime callers actually produce: donut-share
 * (segments + center total — the total MUST be included, else an honest
 * donut false-flags against a whole-market headline) and bar-table (the
 * numeric column). Returns null for any other frame or empty data — the
 * caller then has nothing to compare, which `assertHeroChartCoherence`
 * already treats as coherent.
 */
export function chartMagnitudeFromSpec(spec: ChartSpec): ChartMagnitude | null {
  const unit = unitClassOf(spec.value_format as string | undefined);
  const o = (spec.options ?? {}) as Record<string, unknown>;

  if (spec.frameId === "donut-share" && Array.isArray(o.segments)) {
    const segs = o.segments as { value: number }[];
    const values = segs.map((s) => s.value).filter((v) => Number.isFinite(v));
    if (typeof o.total === "number" && Number.isFinite(o.total)) values.push(o.total);
    return values.length ? { values, unit } : null;
  }

  const rows = spec.rows as (string | number | null)[][] | undefined;
  if (Array.isArray(rows) && rows.length) {
    const valIdx = Array.isArray(spec.columns) && spec.columns.length > 1 ? 1 : rows[0].length - 1;
    const values = rows
      .map((r) => Number(r[valIdx]))
      .filter((v) => Number.isFinite(v));
    if (values.length) return { values, unit };
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/chart-coherence.test.ts`
Expected: PASS (3 new tests + all pre-existing ones in the file)

- [ ] **Step 5: Wire the runtime hook into `buildPromptChart`**

In `lib/email/build-doc.ts`, add imports:

```typescript
import { assertHeroChartCoherence, chartMagnitudeFromSpec } from "@/lib/deliverable/chart-coherence";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
```

In `buildPromptChart` (`lib/email/build-doc.ts:240-281`), after `if (!cfq?.chart) { ... return null; }` (line 254-257) and before the `chartType`/`reshapeChartToType` block (line 258+), insert the check against the PRE-reshape chart (the reshape only relabels the same figures per its own comment, so checking before or after is equivalent — checking before means one location covers both the auto-picked and the user-requested-type paths):

```typescript
    const hero = resolveHeadlineFigure(doc);
    const magnitude = chartMagnitudeFromSpec(cfq.chart);
    const coherence = assertHeroChartCoherence({ hero, chart: magnitude });
    if (!coherence.coherent) {
      console.log("[email-lab/chart] dropped incoherent chart:", coherence.reason);
      return null;
    }
```

- [ ] **Step 6: Add a regression test for the drop behavior**

Check whether `lib/email/build-doc.ts` already has a test file (`Glob "lib/email/build-doc*.test.ts"`) — if one exists, add a case there; otherwise this step documents the expected behavior for whoever adds email build-doc test coverage next (buildPromptChart's dependencies — `buildChartForQuestion`, `chartSpecToEmailImage` — require network/Supabase mocking not yet present in this codebase's test setup; do not invent a mock harness here — flag this gap to the operator rather than shipping an untested runtime path silently). At minimum, confirm by reading: `chartMagnitudeFromSpec` and `resolveHeadlineFigure` are each independently unit-tested (Steps 1-4 above, and Task 2's gate), so the only untested surface is the 6-line glue in `buildPromptChart` itself.

- [ ] **Step 7: Run the full email test suite + build**

Run: `bun test lib/email/`
Run: `bunx next build`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add lib/deliverable/chart-coherence.ts lib/deliverable/chart-coherence.test.ts lib/email/build-doc.ts
git commit -m "feat(email): drop the chart (never the send) when its magnitude contradicts the doc's headline"
```

---

### Task 7: Live-build coupling — luxury sub-bands feed the same number as the headline

**Files:**
- Modify: `refinery/packs/price-distribution-swfl.mts`
- Modify: `refinery/packs/price-distribution-swfl.test.mts`
- Modify: `lib/deliverable/bind-frame.ts` (`bindDonutShare` — extend to read the new detail_table via the already-reserved `req.table_id`)
- Test: `lib/deliverable/bind-frame.test.ts` (existing)

**Interfaces:**
- Consumes: `sumBand` (already exported from `price-distribution-swfl.mts`) to compute the $2-3M/$3-5M/$5-10M/$10M+ sub-bands per county, the same pattern `countyBuckets` already uses for the entry/mid/upper/luxury tiers.
- Produces: a new `BrainOutputDetailTable` (`id: "luxury_price_bands_by_county"`) on the `price-distribution-swfl` brain; `bindDonutShare` gains a `req.table_id === "luxury_price_bands_by_county"` branch.

**RULE 1 flag:** this changes a brain pack's `--- OUTPUT ---` shape (new `detail_table`) — ask before push, don't push autonomously. It also touches `refinery/packs/**`, which re-runs Gate 5 (`catalog.test.mts` mirror + this pack's own `bun:test`) on push.

- [ ] **Step 1: Write the failing pack test**

Add to `refinery/packs/price-distribution-swfl.test.mts` (follow that file's existing fixture-loading pattern — read its current top to match the exact test setup before writing this):

```typescript
it("emits a luxury_price_bands_by_county detail table with $2-3M/$3-5M/$5-10M/$10M+ sub-bands", () => {
  const output = priceDistributionOutputProducer({} as PackOutput);
  const table = output.detail_tables?.find((t) => t.id === "luxury_price_bands_by_county");
  expect(table).toBeTruthy();
  expect(table!.columns.map((c) => c.id)).toEqual([
    "band_2m_3m",
    "band_3m_5m",
    "band_5m_10m",
    "band_10m_plus",
    "total_2m_plus",
  ]);
  // Every row's total_2m_plus must equal the sum of its own 4 bands — the
  // SAME invariant the live-build coupling depends on (headline count ==
  // ring center).
  for (const row of table!.rows) {
    const sum =
      Number(row.cells.band_2m_3m) +
      Number(row.cells.band_3m_5m) +
      Number(row.cells.band_5m_10m) +
      Number(row.cells.band_10m_plus);
    expect(row.cells.total_2m_plus).toBe(sum);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test refinery/packs/price-distribution-swfl.test.mts`
Expected: FAIL — no `luxury_price_bands_by_county` table in `output.detail_tables`.

- [ ] **Step 3: Add the luxury sub-band table to the pack**

In `refinery/packs/price-distribution-swfl.mts`, add a helper alongside `countyBuckets` (reusing the existing `sumBand`):

```typescript
interface LuxuryBands {
  county: string;
  band2to3m: number;
  band3to5m: number;
  band5to10m: number;
  band10mPlus: number;
}

function luxuryBands(county: PriceDistributionCounty): LuxuryBands {
  return {
    county: county.county,
    band2to3m: sumBand(county, 2_000_000, 3_000_000),
    band3to5m: sumBand(county, 3_000_000, 5_000_000),
    band5to10m: sumBand(county, 5_000_000, 10_000_000),
    band10mPlus: sumBand(county, 10_000_000, null),
  };
}
```

In `priceDistributionOutputProducer`, after `const detail_tables: BrainOutputDetailTable[] = [...]` (the existing `price_distribution_by_county` table), push a second table:

```typescript
const luxuryTableSource = makeSource(
  `SWFL active $2M+ for-sale listings by price band, per county, as of ${asOf}`,
  fetchedAt,
  url,
);
const luxury = buckets.map((b) => b).map((_, i) => luxuryBands(summary.counties[i]));
detail_tables.push({
  id: "luxury_price_bands_by_county",
  title: "SWFL active $2M+ for-sale listings by price band and county",
  grain: "county",
  columns: [
    { id: "band_2m_3m", label: "$2M–$3M", display_format: "count", units: "listings" },
    { id: "band_3m_5m", label: "$3M–$5M", display_format: "count", units: "listings" },
    { id: "band_5m_10m", label: "$5M–$10M", display_format: "count", units: "listings" },
    { id: "band_10m_plus", label: "$10M+", display_format: "count", units: "listings" },
    { id: "total_2m_plus", label: "Total $2M+", display_format: "count", units: "listings" },
  ],
  rows: luxury.map((b) => ({
    key: b.county,
    label: b.county,
    cells: {
      band_2m_3m: b.band2to3m,
      band_3m_5m: b.band3to5m,
      band_5m_10m: b.band5to10m,
      band_10m_plus: b.band10mPlus,
      total_2m_plus: b.band2to3m + b.band3to5m + b.band5to10m + b.band10mPlus,
    },
  })),
  source: luxuryTableSource,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test refinery/packs/price-distribution-swfl.test.mts`
Expected: PASS

- [ ] **Step 5: Ship the vocab slug in the same commit (RULE: pack conventions)**

Run: `bun refinery/tools/check-vocab-coverage.mts --all` — this table id carries no new `key_metrics` `metric` slug (it's a detail_table, not a metric), so this is expected to pass with no new registration needed; if it flags anything, register it in `brain-vocabulary.json` before proceeding (don't skip the check to save time).

- [ ] **Step 6: Extend `bindDonutShare` to read the luxury table via `req.table_id`**

In `lib/deliverable/bind-frame.ts`, `bindDonutShare` (line 498-532) currently only reads `key_metrics` shares. Add a table-driven branch, using the ALREADY-RESERVED `req.table_id` field (`FrameBindRequest.table_id`, line 51: *"Reserved for table-driven frames (not yet bound by the supported set)"* — this is that seam):

```typescript
function bindDonutShare(
  output: BrainOutput,
  req: FrameBindRequest,
  asOf: string,
): ChartSpec | null {
  if (req.table_id === "luxury_price_bands_by_county") {
    return bindLuxuryPriceBandsDonut(output, req, asOf);
  }
  // ... existing key_metrics-driven body unchanged below
```

Add the new binder (near `findDetailTable`'s other table-driven binders, e.g. after `bindSeasonalRadial`):

```typescript
/** Naples/Collier luxury donut — bound from the luxury_price_bands_by_county
 *  detail_table (price-distribution-swfl), filtered to Collier (the
 *  ultra-luxury county per the deliverable-coherence-gate fixture). Center
 *  total is the SAME total_2m_plus the deliverable's headline reads — they
 *  cannot disagree because both come from one row. */
function bindLuxuryPriceBandsDonut(
  output: BrainOutput,
  req: FrameBindRequest,
  asOf: string,
): ChartSpec | null {
  const table = findDetailTable(output, "luxury_price_bands_by_county");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === "Collier") ?? table.rows[0];
  if (!row) return null;

  const segments = [
    { label: "$2M–$3M", value: cellNum(row.cells.band_2m_3m) ?? 0 },
    { label: "$3M–$5M", value: cellNum(row.cells.band_3m_5m) ?? 0 },
    { label: "$5M–$10M", value: cellNum(row.cells.band_5m_10m) ?? 0 },
    { label: "$10M+", value: cellNum(row.cells.band_10m_plus) ?? 0 },
  ].filter((s) => s.value > 0);
  const total = cellNum(row.cells.total_2m_plus);
  if (segments.length < 2 || total === null) return null;

  return {
    title: req.title ?? `Luxury Listings · ${row.label}`,
    columns: ["band", "count"],
    rows: segments.map((s) => [s.label, s.value]),
    chart_type: "bar",
    value_format: "count",
    asOf,
    source: sourceOf(table.source),
    frameId: "donut-share",
    options: { segments, total, unit: "listings" },
  };
}
```

- [ ] **Step 7: Write the binder test**

Add to `lib/deliverable/bind-frame.test.ts` (follow its existing fixture pattern for constructing a `BrainOutput`):

```typescript
it("binds the luxury donut from luxury_price_bands_by_county, Collier row, total == sum of segments", () => {
  const output = makeBrainOutputFixture({
    detail_tables: [
      {
        id: "luxury_price_bands_by_county",
        title: "t",
        grain: "county",
        columns: [],
        rows: [
          {
            key: "Collier",
            label: "Collier",
            cells: {
              band_2m_3m: 378,
              band_3m_5m: 412,
              band_5m_10m: 284,
              band_10m_plus: 152,
              total_2m_plus: 1226,
            },
          },
        ],
        source: { citation: "test", fetched_at: "2026-07-11T00:00:00Z", tier: 2 },
      },
    ],
  });
  const spec = bindFrameSpec(output, { frame_id: "donut-share", table_id: "luxury_price_bands_by_county" });
  expect(spec?.frameId).toBe("donut-share");
  expect((spec?.options as { total: number }).total).toBe(1226);
  const segs = (spec?.options as { segments: { value: number }[] }).segments;
  expect(segs.reduce((s, x) => s + x.value, 0)).toBe(1226);
});
```

(Adjust `makeBrainOutputFixture` to whatever helper/pattern `bind-frame.test.ts` already uses — read the file's existing tests before writing this one; don't invent a second fixture builder if one exists.)

- [ ] **Step 8: Run the binder test + full pack/binder suites**

Run: `bun test lib/deliverable/bind-frame.test.ts`
Run: `bun test refinery/packs/price-distribution-swfl.test.mts`
Expected: both PASS

- [ ] **Step 9: Rebuild the brain locally with `--target-only` (never clobber a parallel session's brains/*.md)**

Run: `bun run refinery -- price-distribution-swfl --target-only`
Confirm the regenerated `brains/price-distribution-swfl.md` carries the new `luxury_price_bands_by_county` table with real numbers.

- [ ] **Step 10: STOP — ask before push**

Per RULE 1, this is a brain pack edit changing `--- OUTPUT ---` shape. Do not push autonomously; show the diff (pack + test + bind-frame changes) and the rebuilt brain file, and get an explicit go-ahead before `node scripts/safe-push.mjs`.

---

## Out of scope for this plan (tracked, not built here)

- **Social's two chart-attach paths** (`social-chart-registry` design, manual "Add Chart" + AI-author seeding) calling `assertHeroChartCoherence` at attach time — depends on that spec's own build landing first (`social_chart_registry_live_verify` check). Wiring it now would mean writing code against files (`useSocialComposer.ts`'s chart-attach handlers, `lib/social/chart-image.ts`) that don't exist yet.
- **Picker-parity's 7 new chart types** inheriting the guard — same dependency, on `chart-picker-parity-design.md`'s own build.
- **`promised_deliverable_element_coherence_audit`** (pictures/commentary/examples coherence) — explicitly the FOLLOW-UP check in the spec, generalizing the pattern this plan establishes. Separate plan once this one ships.
- **`retire_emailchartspec_outreach`** — explicitly deferred in the spec itself, unrelated to this build.

## Test plan / final verification (run after Stage 1, again after Stage 2)

- `bun test lib/email/doc/seed-chart-series.test.ts`
- `bun test lib/email/doc/preview-fill.test.ts` (the author-time gate lives here)
- `bun test lib/charts/svg/donut-share.test.ts`
- `bun test lib/deliverable/chart-coherence.test.ts`
- `bun test lib/deliverable/bind-frame.test.ts` (Stage 2)
- `bun test refinery/packs/price-distribution-swfl.test.mts` (Stage 2)
- `bunx next build` clean
- Live-verify (`deliverable_coherence_gate_live_verify`, close via `node scripts/check.mjs close deliverable_coherence_gate_live_verify` once done): build a Luxury Market Report in the Email Lab, confirm the emitted email carries the Naples ring (center 1,226) and no coherence drop fires; confirm the gallery card at `/email-lab` (or wherever `SEED_PREVIEWS` renders) shows the same ring.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 4 | `lib/email/doc/seed-chart-series.ts`, `scripts/generate-seed-preview-charts.mts`, `lib/email/doc/preview-fill.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
