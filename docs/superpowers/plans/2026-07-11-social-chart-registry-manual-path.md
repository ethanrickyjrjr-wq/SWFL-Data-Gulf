# Social Composer Chart Support — Manual Path (Build 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 13 files, keywords: refactor, architecture

**Design:** `docs/superpowers/specs/2026-07-11-social-chart-registry-design.md` (§1–§8).
**Check:** `social_chart_registry_live_verify` (open).

**Goal:** A user can click "Add Chart" in the social composer, describe what to chart, and get a REAL chart — built from the same `ChartSpec` registry that powers email/chat/decks — painted on the Konva canvas and surviving the existing `stage.toDataURL()` export unchanged, with the same headline↔chart coherence guard email has.

**Architecture:** Extract the email chart bridge (`chartSpecToEmailSvg`) into a surface-neutral `lib/charts/spec-to-image.ts` so email and social share ONE SVG dispatch + ONE PNG conversion; social pairs that core with the bucket the Konva canvas already loads from (`email-media`, via the existing `hostEmailPng`). A new server endpoint runs the shared moat-safe producer (`buildChartForQuestion`), rasterizes, runs `assertHeroChartCoherence` against the canvas's own headline stat, and returns `{spec, src}` or a drop+reason. The client pushes a loading placeholder synchronously (never blocks the UI) and fills `src` when the async result lands — the exact pattern the existing photo-upload flow already uses.

**Tech Stack:** Next.js/TypeScript, `bun:test`, resvg (`svgToPng`), Supabase Storage (`email-media` public bucket), react-konva, Anthropic (already inside `buildChartForQuestion`, model never touches a chart number).

## Scope of THIS plan (2a — manual path)

Ships a complete, testable, valuable slice: **a human adds a chart to a post.** The **AI-author seeding** path (spec §5) is a separate follow-up — see "Milestone 2b (follow-up, NOT in this plan)" at the bottom. Nothing unguarded ships in the interim, because the author-chart capability simply does not exist until 2b builds it (guarded).

---

## Hard Preconditions (execution is gated on BOTH — writing the plan is not)

**P1 — Build 1 (chart-picker-parity) has landed its `spec-to-png.ts` switch changes.**
Build 1 Tasks 4–8 add `z-gauge` / `storm-timeline` / `seasonal-radial` / `corridor-scatter` cases to the `switch (spec.frameId)` inside `chartSpecToEmailSvg` (`lib/email/spec-to-png.ts:104`). Task 1 below MOVES that whole function. Doing the move before Build 1 finishes forces a three-way merge on every remaining Build 1 task. **Rebase Task 1 onto Build 1's final switch.** As of 2026-07-11 Build 1 has landed Phase A + B1a (`composition`) on `main` (`3cb79910`, `b3de39f3`); Tasks 4–8 remain.

**P2 — deliverable-coherence-gate has landed `chartMagnitudeFromSpec`.**
That build's Task 8 exports `chartMagnitudeFromSpec(spec: ChartSpec): ChartMagnitude | null` from `lib/deliverable/chart-coherence.ts` (the ONE UnitClass-aware spec→magnitude reader; see its plan lines 686, 786). Build 2 §6 imports it — never re-derives magnitude ([[feedback_shared-concept-one-authority]]). `assertHeroChartCoherence` + `parseHeroFigure` are ALREADY shipped in that file today. **If coherence-gate has NOT landed `chartMagnitudeFromSpec` when this executes:** Build 2 Task 4 creates it in `chart-coherence.ts` (same location, same signature) and coherence-gate imports it from there instead — one authority either way, whoever ships first owns the file. Confirm before starting Task 4: `grep -n "chartMagnitudeFromSpec" lib/deliverable/chart-coherence.ts`.

---

## Global Constraints

- **Every plotted number is REAL.** The chart comes from `buildChartForQuestion` (moat-safe: `computeMetricChart` builds bars in code from audited brain figures; the model never writes a chart number). This plan adds NO new number source.
- **One renderer, two surfaces, always.** Social rasterizes the SAME `chartSpecToEmailSvg` string email does. Never a forked social-specific SVG.
- **Coherence guard on the attach path (guardrail everywhere).** The manual attach runs `assertHeroChartCoherence`; on a clear incoherence, drop the chart (leave placeholder empty) + surface the reason — never block the compose.
- **Konva export requires a CORS-safe host.** `useKonvaImage` already sets `crossOrigin="anonymous"` (`use-konva-image.ts:29`). The chart PNG must be hosted in a bucket the canvas can load AND export from — `email-media`, the bucket the composer already loads listing/library photos from. NO new bucket.
- **Theme is `spec.theme` (`{ primary, accent, logoUrl }`), NOT `options.theme`.** `chart-spec.ts:22,50`. The dispatch already forwards `spec.theme` (`spec-to-png.ts:152`). §8 is confirm-don't-drop.
- **Dates render `MM/DD/YYYY`** via the SVG builders' existing `formatDisplayDate` — never the raw ISO/SWFL token.
- **Builds are free, send is the paywall.** The Add-Chart endpoint writes nothing user-billable and needs no auth gate beyond the composer's existing posture (mirrors `/api/email-lab/social/generate`, which is unauthed).

---

## File structure

| File | Change |
|---|---|
| `lib/charts/spec-to-image.ts` | NEW — the surface-neutral chart bridge: `chartSpecToEmailSvg` + its 3 pure helpers, MOVED verbatim from `spec-to-png.ts`. Imports `svgToPng` from `chart-image.ts`. |
| `lib/charts/spec-to-image.test.ts` | NEW — regression test: identical SVG string before/after the move, for bar-table + composition; asserts `spec.theme` is forwarded. |
| `lib/email/spec-to-png.ts` | Becomes a thin wrapper: re-exports `chartSpecToEmailSvg` from the new home; keeps `chartImageCaption` + `chartSpecToEmailImage` (email hosting) unchanged. |
| `lib/social/chart-image.ts` | NEW — `hostSocialChartPng(key, png)`: rasterize-agnostic hosting into `email-media` (thin wrapper over the existing `hostEmailPng`, documented so the bucket choice is explicit). |
| `lib/social/design/types.ts` | `ChartElement`: comment → `ChartSpec`; add `src?: string` (rasterized PNG URL, mirrors `ImageElement.src`). |
| `lib/social/design/chart-attach.ts` | NEW — `resolveSocialHero(design)`, `evaluateChartCoherence(spec, hero)`, `buildSocialChartAttach(...)` (the one producer; the network glue). |
| `lib/social/design/chart-attach.test.ts` | NEW — pure tests for `resolveSocialHero` + `evaluateChartCoherence`. |
| `components/email-lab/social/KonvaStage.tsx` | `case "chart"` reuses `ImageEl` when `src` set; placeholder when empty. |
| `app/api/email-lab/social/chart/route.ts` | NEW — the Add-Chart endpoint. |
| `app/api/email-lab/social/chart/route.test.ts` | NEW — pure request-parse + response-contract asserts. |
| `components/email-lab/social/useSocialComposer.ts` | `addChart()` async action + `chartLoadingElement()` pure helper; exported on the handle. |
| `components/email-lab/social/useSocialComposer.test.ts` | NEW (or extend) — `chartLoadingElement` returns `src:""` synchronously. |
| `components/email-lab/EmailLabGridShell.tsx` | Add the "Chart" palette button → `social.addChart()` (special-cased, async). |
| `lib/social/design/social-palette.ts` (or wherever `SOCIAL_PALETTE` is defined) | Add `{ type: "chart", label: "Chart" }`. |

---

### Task 1: Extract the shared rasterizer (behavior-preserving)

> **REBASE FIRST (P1):** confirm Build 1 Tasks 4–8 have landed — `grep -c "case \"" lib/email/spec-to-png.ts` should show the full frame set (bar/ranked/donut/dotplot/composed/composition + Build 1's additions). Move whatever switch exists at rebase time; the regression test guarantees you preserved it.

**Files:**
- Create: `lib/charts/spec-to-image.ts`
- Create: `lib/charts/spec-to-image.test.ts`
- Modify: `lib/email/spec-to-png.ts`

**Interfaces:**
- Produces: `export async function chartSpecToEmailSvg(spec: ChartSpec, accent: string): Promise<string | null>` — moved verbatim (same name, same signature) to `lib/charts/spec-to-image.ts`.
- Consumes: `svgToPng` from `@/lib/email/chart-image` (stays put — pure resvg; moving it would churn its many callers). `trendChartSvg`, `barChartSvg`, `TrendPoint` from `@/lib/email/chart-image`; all `lib/charts/svg/*` builders; `bklitTrendSvg`/`bklitComposedSvg`. All unchanged.

- [ ] **Step 1: Write the regression test FIRST (captures current output before the move)**

Create `lib/charts/spec-to-image.test.ts`. Import from the NEW path (it won't exist yet — that's the failing state):

```typescript
import { test, expect } from "bun:test";
import { chartSpecToEmailSvg } from "./spec-to-image";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

const barSpec = {
  frameId: "bar-table",
  title: "Median price by ZIP",
  chart_type: "bar",
  value_format: "usd",
  source: { citation: "cre-swfl" },
  asOf: "2026-06-30",
  columns: ["ZIP", "Median"],
  rows: [
    ["33901", 412000],
    ["33903", 389000],
    ["33914", 675000],
  ],
} as ChartSpec;

const compositionSpec = {
  frameId: "composition",
  title: "Flood exposure composition",
  chart_type: "bar",
  value_format: "count",
  source: { citation: "env-swfl" },
  asOf: "2026-06-30",
  theme: { primary: "#0f1d24", accent: "#e05c2e", logoUrl: "" },
  options: {
    segments: [
      { label: "SFHA (in flood zone)", valuePct: 32 },
      { label: "Outside SFHA", valuePct: 68 },
    ],
    callout: "357× AAL multiplier",
  },
} as ChartSpec;

test("bar-table renders a segmented bar SVG (MM/DD/YYYY date, real values)", async () => {
  const svg = await chartSpecToEmailSvg(barSpec, "#0ea5e9");
  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Median price by ZIP");
  expect(svg).toContain("06/30/2026");
});

test("composition forwards spec.theme accent to the segment fill (§8: theme not dropped)", async () => {
  const svg = await chartSpecToEmailSvg(compositionSpec, "#0ea5e9");
  expect(svg).not.toBeNull();
  // resolveCompositionColors anchors on spec.theme.accent (#e05c2e). If the
  // extraction dropped `spec.theme`, this fill would fall back to the default
  // teal and this assertion would fail — that is the §8 regression guard.
  expect(svg).toContain("#e05c2e");
  expect(svg).toContain("357");
});

test("an unsupported frame returns null (never throws — RULE 0.7)", async () => {
  const svg = await chartSpecToEmailSvg({ frameId: "not-a-frame" } as ChartSpec, "#0ea5e9");
  expect(svg).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails (module missing)**

Run: `bun test lib/charts/spec-to-image.test.ts`
Expected: FAIL — `Cannot find module './spec-to-image'`.

- [ ] **Step 3: Create `lib/charts/spec-to-image.ts` by MOVING the function**

Move `chartSpecToEmailSvg` and its three private helpers (`mapValueFormat`, `specToTrendPoints`, `specToBars`) OUT of `lib/email/spec-to-png.ts` and INTO the new file. Header:

```typescript
// lib/charts/spec-to-image.ts
//
// THE SHARED CHART BRIDGE (surface-neutral). A ChartSpec — the ONE chart contract
// that powers chat, the deliverable engine, the Email Lab builder, and (now) the
// social composer — becomes an email-safe, self-contained <svg> STRING via a
// frameId-keyed dispatch. This module does NO hosting: email hosts the resulting
// PNG in `email-media` (lib/email/spec-to-png.ts), social hosts it in the same
// bucket for the Konva canvas (lib/social/chart-image.ts). ONE dispatch, ONE PNG
// conversion (svgToPng), shared — hosting destination is the only per-surface piece.
//
// Extracted verbatim from lib/email/spec-to-png.ts (2026-07-11, Build 2a). No
// behavior change: spec-to-image.test.ts pins identical output before/after.
```

Copy the imports the function needs (lines 13–33 of the current `spec-to-png.ts`) and the three helper functions (`mapValueFormat`, `specToTrendPoints`, `specToBars`) and the `chartSpecToEmailSvg` body EXACTLY as they are today (including whatever Build 1 cases you rebased onto). Do not edit any drawing logic.

- [ ] **Step 4: Make `lib/email/spec-to-png.ts` a thin wrapper**

Delete the moved function + helpers + now-unused imports from `spec-to-png.ts`. Re-export the bridge and keep the email-hosting pieces:

```typescript
// lib/email/spec-to-png.ts
//
// EMAIL hosting wrapper over the shared chart bridge. The SVG dispatch lives in
// lib/charts/spec-to-image.ts (shared with social); this file adds the email-media
// PNG hosting + the caption. Re-exported here so every existing email import keeps
// working unchanged.
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import { chartSpecToEmailSvg } from "@/lib/charts/spec-to-image";
import { svgToPng, hostEmailPng } from "@/lib/email/chart-image";
import { formatDisplayDate } from "@/lib/format-date";

export { chartSpecToEmailSvg };

export interface EmailChartImage {
  url: string;
  alt: string;
  caption: string;
}

// chartImageCaption + chartSpecToEmailImage — UNCHANGED from today (keep the
// existing bodies verbatim: lines 186-218 of the pre-move file).
```

Keep `chartImageCaption` and `chartSpecToEmailImage` bodies exactly as they are now (they already call `chartSpecToEmailSvg`, which is now imported).

- [ ] **Step 5: Run the regression test — MUST pass unchanged**

Run: `bun test lib/charts/spec-to-image.test.ts lib/email/spec-to-png.test.ts`
Expected: PASS — the new file's tests green AND every existing `spec-to-png.test.ts` case green (proves the move preserved behavior). If any `spec-to-png.test.ts` case imports `chartSpecToEmailSvg` from `spec-to-png`, the re-export keeps it working.

- [ ] **Step 6: Typecheck**

Run: `bunx next build` (per [[feedback_verify-with-next-build-not-npx-tsc]] — the project verifies with next build, not `npx tsc`). Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/charts/spec-to-image.ts lib/charts/spec-to-image.test.ts lib/email/spec-to-png.ts
git commit -m "refactor(charts): extract chartSpecToEmailSvg into shared spec-to-image (Build 2a §1)"
```

---

### Task 2: `ChartElement` carries a real payload

**Files:**
- Modify: `lib/social/design/types.ts:44-48`
- Test: fold the round-trip assert into `lib/social/design/chart-attach.test.ts` (Task 4) — no standalone file for a pure type change.

**Interfaces:**
- Produces: `ChartElement` gains `src?: string`. `spec` stays typed `unknown` (keeps `lib/social` refinery-free, per the file's own header) but its doc comment now names `ChartSpec`.

- [ ] **Step 1: Edit the type**

Replace `ChartElement` (`lib/social/design/types.ts:44-48`):

```typescript
export interface ChartElement extends BaseElement {
  type: "chart";
  /** The registry ChartSpec that produced this chart — kept typed `unknown` here
   *  to keep lib/social refinery-free; carried for re-render / coherence context.
   *  null while a manual "Add Chart" is still building. */
  spec: unknown;
  /** The rasterized chart PNG (hosted in email-media, CORS-safe for Konva export).
   *  Mirrors ImageElement.src. Empty/undefined = "still rendering" → placeholder. */
  src?: string;
}
```

- [ ] **Step 2: Typecheck (the union must still be exhaustive)**

Run: `bunx next build`
Expected: no new errors. `SocialElement` union unchanged in shape; every existing `chart` consumer (KonvaStage `case "chart"`, serialize's `TEXT_FIELDS` which has no `chart` key) still compiles.

- [ ] **Step 3: Commit**

```bash
git add lib/social/design/types.ts
git commit -m "feat(social): ChartElement carries a rasterized src (Build 2a §2)"
```

---

### Task 3: Konva paints the chart via `ImageEl` reuse

**Files:**
- Modify: `components/email-lab/social/KonvaStage.tsx:65-77` (broaden `ImageEl`), `:129-132` (`case "chart"`)

**Interfaces:**
- Consumes: `ChartElement.src` (Task 2). `ImageEl` (existing, `crossOrigin`-safe via `useKonvaImage`).
- Produces: no new export — `case "chart"` renders `ImageEl` when `src` is set, the existing placeholder `Rect` when empty.

- [ ] **Step 1: Broaden `ImageEl` to accept a chart element**

In `KonvaStage.tsx`, change `ImageEl`'s `el` type (line 68-71) to include chart, and read `src` with an empty-string fallback (a chart's `src` is optional):

```typescript
function ImageEl({
  el,
  geom,
}: {
  el: Extract<SocialElement, { type: "image" | "logo" | "chart" }>;
  geom: ReturnType<typeof geomProps>;
}) {
  const [img, status] = useKonvaImage("src" in el ? (el.src ?? "") : "");
  if (status !== "loaded" || !img) {
    return <Rect {...geom} width={el.width} height={el.height} fill="#1f2d36" cornerRadius={6} />;
  }
  return <KonvaImg {...geom} image={img} width={el.width} height={el.height} />;
}
```

- [ ] **Step 2: Point `case "chart"` at `ImageEl`**

Replace the `case "chart"` block (line 129-132):

```typescript
    case "chart":
      // Same path as image/logo: a rasterized chart PNG (email-media, CORS-safe)
      // loads via useKonvaImage's crossOrigin="anonymous" so stage.toDataURL()
      // stays untainted. Empty src (still building / dropped by the coherence
      // guard) keeps the grey placeholder — it means "loading", not "broken".
      return <ImageEl el={el} geom={geom} />;
```

- [ ] **Step 3: Typecheck**

Run: `bunx next build`
Expected: no new errors — `el` in `case "chart"` narrows to `ChartElement`, which now matches the broadened `ImageEl` type.

- [ ] **Step 4: Manual verify-item (no konva render-test harness exists — do NOT invent one)**

This is a structural reuse of an already-tested component; there is no react-konva test harness in this repo (the sibling coherence-gate plan flagged the same gap). Verify behaviorally at Task 7's live-verify: a chart element with a populated `src` paints the image; with `src:""` it shows the grey placeholder. Record the observation in the check's live-verify note.

- [ ] **Step 5: Commit**

```bash
git add components/email-lab/social/KonvaStage.tsx
git commit -m "feat(social): Konva paints charts via ImageEl reuse (Build 2a §3)"
```

---

### Task 4: The attach producer — hero resolution, coherence, hosting

**Files:**
- Create: `lib/social/chart-image.ts`
- Create: `lib/social/design/chart-attach.ts`
- Create: `lib/social/design/chart-attach.test.ts`

**Interfaces:**
- Consumes: `buildChartForQuestion` from `@/lib/assistant/chart-for-question` (`(question, origin, opts?) => Promise<ChartForQuestion | null>`); `chartSpecToEmailSvg` from `@/lib/charts/spec-to-image`; `svgToPng`, `hostEmailPng` from `@/lib/email/chart-image`; `assertHeroChartCoherence`, `parseHeroFigure`, `chartMagnitudeFromSpec`, `type HeroFigure` from `@/lib/deliverable/chart-coherence` (see P2).
- Produces:
  - `export function resolveSocialHero(design: SocialDesign): HeroFigure | null`
  - `export function evaluateChartCoherence(spec: ChartSpec, hero: HeroFigure | null): { coherent: true } | { coherent: false; reason: string }`
  - `export async function buildSocialChartAttach(args): Promise<{ spec: ChartSpec; src: string } | { dropped: true; reason: string } | null>`
  - `export async function hostSocialChartPng(key: string, png: Buffer): Promise<string>` (in `chart-image.ts`)

- [ ] **Step 1: Write the failing pure tests**

Create `lib/social/design/chart-attach.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { resolveSocialHero, evaluateChartCoherence } from "./chart-attach";
import type { SocialDesign } from "./types";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

function designWith(elements: SocialDesign["elements"]): SocialDesign {
  return { version: 1, format: "portrait", background: "#000", elements };
}

test("resolveSocialHero: picks the largest-font stat and parses its value", () => {
  const hero = resolveSocialHero(
    designWith([
      { id: "a", type: "stat", x: 0, y: 0, width: 1, height: 1, value: "$412K", label: "median", valueFontSize: 80, labelFontSize: 20, fill: "#fff", accent: "#0ea5b7" },
      { id: "b", type: "stat", x: 0, y: 0, width: 1, height: 1, value: "$3.2M", label: "top sale", valueFontSize: 120, labelFontSize: 20, fill: "#fff", accent: "#0ea5b7" },
    ]),
  );
  expect(hero).toEqual({ value: 3_200_000, unit: "currency" }); // the 120px stat wins, deterministically
});

test("resolveSocialHero: no stat element → null (safe default, chart attaches)", () => {
  const hero = resolveSocialHero(
    designWith([{ id: "t", type: "text", x: 0, y: 0, width: 1, height: 1, text: "hi", fontSize: 40, fontFamily: "Arial", fill: "#fff" }]),
  );
  expect(hero).toBeNull();
});

test("resolveSocialHero: an unparseable stat value is skipped", () => {
  const hero = resolveSocialHero(
    designWith([{ id: "a", type: "stat", x: 0, y: 0, width: 1, height: 1, value: "Coming soon", label: "x", valueFontSize: 100, labelFontSize: 20, fill: "#fff", accent: "#0ea5b7" }]),
  );
  expect(hero).toBeNull();
});

test("evaluateChartCoherence: null hero is always coherent (nothing to compare)", () => {
  const spec = { frameId: "bar-table", value_format: "usd", columns: ["z", "v"], rows: [["a", 400000], ["b", 420000]] } as ChartSpec;
  expect(evaluateChartCoherence(spec, null)).toEqual({ coherent: true });
});

test("evaluateChartCoherence: a $3.2M headline over a ~$400K chart is incoherent", () => {
  const spec = { frameId: "bar-table", value_format: "usd", columns: ["z", "v"], rows: [["a", 400000], ["b", 420000]] } as ChartSpec;
  const res = evaluateChartCoherence(spec, { value: 3_200_000, unit: "currency" });
  expect(res.coherent).toBe(false);
});

test("evaluateChartCoherence: a $412K headline over a ~$400K chart is coherent", () => {
  const spec = { frameId: "bar-table", value_format: "usd", columns: ["z", "v"], rows: [["a", 400000], ["b", 420000]] } as ChartSpec;
  expect(evaluateChartCoherence(spec, { value: 412_000, unit: "currency" })).toEqual({ coherent: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/social/design/chart-attach.test.ts`
Expected: FAIL — module `./chart-attach` does not exist.

- [ ] **Step 3: Create the hosting wrapper**

Create `lib/social/chart-image.ts`:

```typescript
// lib/social/chart-image.ts
//
// Social's chart-PNG hosting. The Konva canvas LOADS this PNG (crossOrigin
// "anonymous") and must keep stage.toDataURL() untainted on export — so the chart
// is hosted in `email-media`, the SAME public bucket the composer already loads
// listing + library photos from (deriveListingPhoto / the project email-media
// route). That bucket's round-trip through the canvas is already exercised in
// production by every photo-bearing post; the finished-post OUTPUT bucket
// (`social-media`) is a write-only sink never loaded back into Konva, so it is the
// wrong home for a canvas-loaded asset. One line, but the bucket choice is the
// whole point (spec §7) — do not "upgrade" this to social-media.
import { hostEmailPng } from "@/lib/email/chart-image";

export async function hostSocialChartPng(key: string, png: Buffer): Promise<string> {
  return hostEmailPng(key, png);
}
```

- [ ] **Step 4: Create the attach producer**

Create `lib/social/design/chart-attach.ts`:

```typescript
// lib/social/design/chart-attach.ts
//
// The ONE producer that turns a prompt into an attachable chart for the social
// canvas — shared by the manual "Add Chart" endpoint (Build 2a) and, later, the
// AI author (Build 2b). Path: buildChartForQuestion (moat-safe; model never writes
// a number) → chartSpecToEmailSvg (the shared bridge, same SVG email uses) →
// svgToPng → host in email-media → COHERENCE guard (drop, never block) → {spec, src}.
import { buildChartForQuestion } from "@/lib/assistant/chart-for-question";
import { chartSpecToEmailSvg } from "@/lib/charts/spec-to-image";
import { svgToPng } from "@/lib/email/chart-image";
import { hostSocialChartPng } from "@/lib/social/chart-image";
import {
  assertHeroChartCoherence,
  parseHeroFigure,
  chartMagnitudeFromSpec,
  type HeroFigure,
} from "@/lib/deliverable/chart-coherence";
import type { SocialDesign } from "./types";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";

/** The canvas's headline figure for the coherence check. A social post has no
 *  STRUCTURAL hero the way an email doc does, so we resolve it deterministically:
 *  the stat element with the largest `valueFontSize` (ties broken by document
 *  order — the first such stat) whose value parses as a real figure. No parseable
 *  stat → null → assertHeroChartCoherence treats it as coherent (safe default:
 *  a post without a headline number can't contradict a chart). */
export function resolveSocialHero(design: SocialDesign): HeroFigure | null {
  const stats = design.elements
    .filter((e): e is Extract<SocialDesign["elements"][number], { type: "stat" }> => e.type === "stat")
    .slice()
    .sort((a, b) => b.valueFontSize - a.valueFontSize);
  for (const s of stats) {
    const parsed = parseHeroFigure(s.value);
    if (parsed) return parsed;
  }
  return null;
}

/** Compare a built chart against the canvas headline, reusing the ONE shared
 *  magnitude reader + comparator (never a second reading — [[shared-concept-one-authority]]). */
export function evaluateChartCoherence(
  spec: ChartSpec,
  hero: HeroFigure | null,
): { coherent: true } | { coherent: false; reason: string } {
  const magnitude = chartMagnitudeFromSpec(spec);
  return assertHeroChartCoherence({ hero, chart: magnitude });
}

export interface SocialChartAttachArgs {
  prompt: string;
  origin: string;
  hero: HeroFigure | null;
  key: string;
  zips?: string[];
}

/** Build → rasterize → host → coherence-gate. Returns the attachable {spec, src},
 *  or a drop+reason (incoherent), or null (nothing chartable / any error — the
 *  compose is NEVER blocked, RULE 0.7). */
export async function buildSocialChartAttach(
  args: SocialChartAttachArgs,
): Promise<{ spec: ChartSpec; src: string } | { dropped: true; reason: string } | null> {
  try {
    const cfq = await buildChartForQuestion(args.prompt, args.origin, { zips: args.zips });
    if (!cfq?.chart) return null;

    const coherence = evaluateChartCoherence(cfq.chart, args.hero);
    if (!coherence.coherent) return { dropped: true, reason: coherence.reason };

    const accent =
      (cfq.chart.theme?.accent as string | undefined) ?? "#0ea5b7";
    const svg = await chartSpecToEmailSvg(cfq.chart, accent);
    if (!svg) return null;

    const png = svgToPng(svg);
    const src = await hostSocialChartPng(args.key, png);
    return { spec: cfq.chart, src };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the pure tests to verify they pass**

Run: `bun test lib/social/design/chart-attach.test.ts`
Expected: PASS. (`resolveSocialHero` + `evaluateChartCoherence` are pure. `buildSocialChartAttach`'s network glue is NOT unit-tested — `buildChartForQuestion` needs brain-fetch/Supabase not mocked in this repo's setup; do NOT invent a mock harness. It is exercised at Task 7's live-verify.)

- [ ] **Step 6: Typecheck + commit**

```bash
bunx next build
git add lib/social/chart-image.ts lib/social/design/chart-attach.ts lib/social/design/chart-attach.test.ts
git commit -m "feat(social): chart-attach producer — hero resolve + coherence gate + email-media host (Build 2a §6/§7)"
```

---

### Task 5: The Add-Chart endpoint

**Files:**
- Create: `app/api/email-lab/social/chart/route.ts`
- Create: `app/api/email-lab/social/chart/route.test.ts`

**Interfaces:**
- Consumes: `buildSocialChartAttach`, `resolveSocialHero` (Task 4); `type BuildScope` from `@/lib/email/build-doc`.
- Produces: `export function parseChartRequest(body): { prompt: string; scope?: BuildScope; zips?: string[]; hero: HeroFigure | null } | null` (pure, testable); the `POST` handler. Response: `{ spec, src }` on success, `{ dropped: true, reason }` on incoherence, `{ error }` otherwise.

The client sends the current `design` (so the server resolves the hero with the one shared rule — never a second hero-resolution on the client). Endpoint mirrors `/api/email-lab/social/generate`'s posture: `runtime = "nodejs"`, unauthed (builds are free), writes only the chart PNG to `email-media`.

- [ ] **Step 1: Write the failing request-parse test**

Create `app/api/email-lab/social/chart/route.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { parseChartRequest } from "./route";

test("parseChartRequest: valid body with a stat headline resolves the hero", () => {
  const parsed = parseChartRequest({
    prompt: "median price by ZIP in Cape Coral",
    scope: { kind: "city", value: "Cape Coral" },
    design: {
      version: 1,
      format: "portrait",
      background: "#000",
      elements: [
        { id: "s", type: "stat", x: 0, y: 0, width: 1, height: 1, value: "$412K", label: "median", valueFontSize: 100, labelFontSize: 20, fill: "#fff", accent: "#0ea5b7" },
      ],
    },
  });
  expect(parsed).not.toBeNull();
  expect(parsed!.prompt).toBe("median price by ZIP in Cape Coral");
  expect(parsed!.hero).toEqual({ value: 412_000, unit: "currency" });
});

test("parseChartRequest: empty prompt → null (nothing to chart)", () => {
  expect(parseChartRequest({ prompt: "   " })).toBeNull();
});

test("parseChartRequest: missing design → hero null (still valid, chart attaches)", () => {
  const parsed = parseChartRequest({ prompt: "vacancy by corridor" });
  expect(parsed).not.toBeNull();
  expect(parsed!.hero).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test app/api/email-lab/social/chart/route.test.ts`
Expected: FAIL — module has no `parseChartRequest` export.

- [ ] **Step 3: Implement the route**

Create `app/api/email-lab/social/chart/route.ts`:

```typescript
// app/api/email-lab/social/chart/route.ts
//
// Add-Chart for the social composer. Builds a REAL chart (buildChartForQuestion —
// model never writes a number), rasterizes it, hosts it in email-media (CORS-safe
// for the Konva canvas), runs the headline<->chart coherence guard, and returns
// {spec, src} or a drop+reason. Writes only the chart PNG. Unauthed — builds are
// free (mirrors /api/email-lab/social/generate).
import { NextResponse, type NextRequest } from "next/server";
import { buildSocialChartAttach, resolveSocialHero } from "@/lib/social/design/chart-attach";
import type { HeroFigure } from "@/lib/deliverable/chart-coherence";
import type { SocialDesign } from "@/lib/social/design/types";
import type { BuildScope } from "@/lib/email/build-doc";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ParsedChartRequest {
  prompt: string;
  scope?: BuildScope;
  zips?: string[];
  hero: HeroFigure | null;
}

function isDesign(d: unknown): d is SocialDesign {
  return !!d && typeof d === "object" && Array.isArray((d as SocialDesign).elements);
}

/** Pure body parser — exported so tests assert the contract without a live build. */
export function parseChartRequest(body: unknown): ParsedChartRequest | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return null;
  const scope = b.scope as BuildScope | undefined;
  const zips = Array.isArray(b.zips) ? (b.zips as string[]) : undefined;
  const hero = isDesign(b.design) ? resolveSocialHero(b.design) : null;
  return { prompt, scope, zips, hero };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = parseChartRequest(body);
  if (!parsed) return NextResponse.json({ error: "no prompt" }, { status: 400 });

  const key = `lab/chart/${crypto.randomUUID()}.png`;
  const result = await buildSocialChartAttach({
    prompt: parsed.prompt,
    origin: req.nextUrl.origin,
    hero: parsed.hero,
    key,
    zips: parsed.zips,
  });

  if (!result) return NextResponse.json({ error: "no_chart" }, { status: 502 });
  if ("dropped" in result) return NextResponse.json({ dropped: true, reason: result.reason });
  return NextResponse.json({ spec: result.spec, src: result.src });
}
```

- [ ] **Step 4: Run the parse test to verify it passes**

Run: `bun test app/api/email-lab/social/chart/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bunx next build
git add app/api/email-lab/social/chart/route.ts app/api/email-lab/social/chart/route.test.ts
git commit -m "feat(social): Add-Chart endpoint — build, host, coherence-gate (Build 2a §4)"
```

---

### Task 6: Manual "Add Chart" in the composer

**Files:**
- Modify: `components/email-lab/social/useSocialComposer.ts`
- Create: `components/email-lab/social/useSocialComposer.test.ts`
- Modify: the `SOCIAL_PALETTE` definition (find it: `grep -rn "SOCIAL_PALETTE =" components/ lib/`)
- Modify: `components/email-lab/EmailLabGridShell.tsx:1456-1465` (palette button onClick)

**Interfaces:**
- Consumes: `mintBlockId` (already imported in the hook); the `/api/email-lab/social/chart` endpoint (Task 5).
- Produces: `chartLoadingElement(id: string): ChartElement` (pure); `addChart(): Promise<void>` on the handle.

- [ ] **Step 1: Write the failing pure test (synchronous placeholder, never blocks the UI)**

Create `components/email-lab/social/useSocialComposer.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { chartLoadingElement } from "./useSocialComposer";

test("chartLoadingElement: a freshly added chart has an empty src synchronously (UI never blocks on the async build)", () => {
  const el = chartLoadingElement("blk_test");
  expect(el.type).toBe("chart");
  expect(el.id).toBe("blk_test");
  expect(el.src).toBe(""); // renders the grey placeholder immediately
  expect(el.spec).toBeNull();
  expect(el.width).toBeGreaterThan(0);
  expect(el.height).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test components/email-lab/social/useSocialComposer.test.ts`
Expected: FAIL — `chartLoadingElement` is not exported.

- [ ] **Step 3: Add the pure helper + the async action to the hook**

In `useSocialComposer.ts`, add the exported pure helper near the top (module scope, above the hook):

```typescript
import type { SocialDesign, SocialElement, ChartElement } from "@/lib/social/design/types";

/** The placeholder a manual "Add Chart" pushes SYNCHRONOUSLY — empty src renders
 *  the grey loading placeholder; the async build fills spec+src via updateElement.
 *  Pure + exported so the "never blocks the UI" contract is unit-tested. */
export function chartLoadingElement(id: string): ChartElement {
  return { id, type: "chart", x: 80, y: 80, width: 500, height: 320, spec: null, src: "" };
}
```

Inside the hook body (after `addElement`, using the existing `prompt`/`aiBusy`/`aiStatus`/`aiError`/`updateElement`/`setDesign`/`setSelectedId` already in scope):

```typescript
  // ── AI: build a REAL chart from the prompt and attach it (async; never blocks) ──
  async function addChart() {
    if (placeholderBlocked()) return;
    const trimmed = prompt.trim();
    const id = mintBlockId();
    // 1) push the loading placeholder SYNCHRONOUSLY — the canvas shows it at once.
    setDesign((d) => ({ ...d, elements: [...d.elements, chartLoadingElement(id)] }));
    setSelectedId(id);
    if (!trimmed) {
      setAiError("Type what to chart in the box, then Add Chart.");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    setAiStatus(null);
    try {
      const res = await fetch("/api/email-lab/social/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, scope, design }),
      });
      const data = (await res.json().catch(() => null)) as
        | { spec?: unknown; src?: string; dropped?: boolean; reason?: string; error?: string }
        | null;
      if (data?.dropped) {
        // Coherence guard rejected it — drop the placeholder, tell the user plainly.
        setDesign((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
        setSelectedId(null);
        setAiStatus("Left the chart off — it didn't match the post's headline number.");
        return;
      }
      if (!res.ok || !data?.src) {
        setDesign((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
        setSelectedId(null);
        setAiError("Couldn't build that chart — try rephrasing, or add a bar/table version.");
        return;
      }
      // 2) fill spec+src on the SAME element (updateElement by id).
      updateElement({ ...chartLoadingElement(id), spec: data.spec ?? null, src: data.src });
      setAiStatus("Added a chart built from real data — drag or resize it on the canvas.");
    } catch {
      setDesign((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
      setSelectedId(null);
      setAiError("Something went wrong — try again.");
    } finally {
      setAiBusy(false);
    }
  }
```

Add `addChart` to the returned handle object (next to `addElement`).

- [ ] **Step 4: Run the pure test to verify it passes**

Run: `bun test components/email-lab/social/useSocialComposer.test.ts`
Expected: PASS. (The async `addChart` flow is exercised at Task 7 live-verify — no hook/network render harness exists; do not invent one.)

- [ ] **Step 5: Wire the palette button**

Add the chart entry to `SOCIAL_PALETTE` (wherever it is defined):

```typescript
  { type: "chart", label: "Chart" },
```

In `EmailLabGridShell.tsx` (line ~1460), special-case chart (async) so it calls `addChart` while every other type stays synchronous `addElement`:

```typescript
                    onClick={() => (p.type === "chart" ? social.addChart() : social.addElement(p.type))}
```

- [ ] **Step 6: Typecheck + commit**

```bash
bunx next build
git add components/email-lab/social/useSocialComposer.ts components/email-lab/social/useSocialComposer.test.ts components/email-lab/EmailLabGridShell.tsx
# plus the SOCIAL_PALETTE file you edited
git commit -m "feat(social): manual Add Chart — async build + attach, never blocks the canvas (Build 2a §4)"
```

---

### Task 7: CORS verify, theme confirm, live-verify + close the check

**Files:** none (verification + the check close). This is the task a reviewer would reject if the two verify-items were skipped.

- [ ] **Step 1: §7 CORS — verify EMPIRICALLY (not by memory / not a docs crawl)**

The claim to prove: an `email-media`-hosted PNG loads into Konva with `crossOrigin="anonymous"` AND survives `stage.toDataURL()`. The cheapest proof already exists in the product: **author a `listing-feature` social post (which attaches an `email-media` listing/aerial photo) and export it.** If that export succeeds today (no "an image on the canvas blocks export" error from `exportPng`, `useSocialComposer.ts:363-368`), then `email-media` round-trips through the canvas and the chart PNG (same bucket, same code path) does too. Run: add a chart via Task 6, then hit Export. Expected: a PNG URL returns, no taint error. Record the result in the check note. If it DOES taint (unexpected), the fix is a bucket CORS header on `email-media` — do that before closing, don't ship a first-export-fails chart.

- [ ] **Step 2: §8 theme — confirm the forward survived the extraction**

Already asserted structurally by Task 1's composition test (`expect(svg).toContain("#e05c2e")` — the `spec.theme.accent`). Confirm that test is green in the final tree: `bun test lib/charts/spec-to-image.test.ts`. No `options.theme` anywhere — the field is `spec.theme` (`{ primary, accent, logoUrl }`), and `buildSocialChartAttach` reads `cfq.chart.theme?.accent` for the render accent. Nothing to add; this step is the confirmation that §8 is satisfied by §1's extraction, per its own cross-ref.

- [ ] **Step 3: Full test sweep + build**

Run: `bun test lib/charts/ lib/social/ app/api/email-lab/social/ components/email-lab/social/` then `bunx next build`.
Expected: all green.

- [ ] **Step 4: Live-verify on a running dev server**

Per `/verify` posture: drive the real flow. `bun dev`, open the Email Lab in social mode, click **Chart**, type "median home price by ZIP in Cape Coral", confirm a real chart paints (recognizable ZIP labels + `MM/DD/YYYY` caption, not a placeholder), drag/resize it, then Export and confirm the PNG contains the chart. Also confirm the DROP path: build a post whose headline stat is "$5M+" and chart a ~$400K ZIP bar — the chart should be left off with the plain-language status, never attached.

- [ ] **Step 5: Close the check + SESSION_LOG + push**

```bash
node scripts/check.mjs close social_chart_registry_live_verify
```
Append a SESSION_LOG entry (what shipped, the CORS observation, the live-verify result) and push via `node scripts/safe-push.mjs` per RULE 1 / RULE 2. Note in the log that Milestone 2b (AI-author seeding) remains open under its own follow-up.

---

## Milestone 2b (follow-up — NOT in this plan)

**Why separate (Scope Check):** the manual path above ships and is valuable on its own. AI-author seeding (spec §5) is a distinct subsystem with **known unknowns that must be probed before its tasks can be written without placeholders** — so it gets its own plan, authored after 2a lands, not under-specified tasks here.

Known unknowns to probe first (each Read/Grep, then write the plan):
1. **Do any social templates carry a `chart` element slot?** `lib/social/design/templates.ts` — the author picks a template + emits a TEXT-only patch; `applyDesignPatch` (`serialize.ts`, `TEXT_FIELDS` has NO `chart` key) cannot add an element or set a chart spec, and the model cannot make the async `buildChartForQuestion` call. So the author path needs a **code-set post-pass** (mirror `attachListingPhoto` in `author.ts:163`), plus at least one chart-slot template.
2. **The author model output needs a `wantsChart`/`chartPrompt` field** so `authorSocialPost` knows whether + what to chart, then calls the SAME `buildSocialChartAttach` (Task 4) after building the design.
3. **Coherence is part of 2b's definition-of-done** — the author post-pass calls `buildSocialChartAttach`, which already runs the guard, so "guardrail everywhere" holds automatically; a dropped chart just leaves the authored post chart-less. Nothing unguarded ships in the interim because the author-chart capability does not exist until 2b builds it.

Register 2b when it starts: `node scripts/new-build.mjs social-chart-ai-author "AI-author seeds a chart on a social post"` (opens its own `*_live_verify` check).

## Non-goals (inherited from the design spec)

- Not fixing the separate automated social-card route (`app/api/social/render/[format]/route.ts` + `render-social-image.ts`)'s orphaned `EmailChartSpec` chart path — tracked under `retire_emailchartspec_outreach`.
- Not building every registry frame for social — social's frame coverage grows automatically as Build 1 adds PNG-capable frames to the shared `chartSpecToEmailSvg`, since social rasterizes the SAME dispatch.
- Not changing the Email Lab builder's picker or renderer — that's Build 1.

---

## Self-Review

- **Spec coverage:** §1 → Task 1. §2 → Task 2. §3 → Task 3. §4 (manual Add Chart) → Tasks 4–6. §5 (AI author) → Milestone 2b (scoped follow-up, by design). §6 (coherence, both triggers) → Task 4 `evaluateChartCoherence` wired into the manual path (Tasks 5–6); the AI-author trigger is 2b, guarded by the same producer. §7 (CORS) → Task 7 Step 1. §8 (theme) → Task 1 test + Task 7 Step 2.
- **Type consistency:** `chartLoadingElement` / `resolveSocialHero` / `evaluateChartCoherence` / `buildSocialChartAttach` / `hostSocialChartPng` / `parseChartRequest` — each defined once, consumed by name in later tasks. `HeroFigure`/`ChartMagnitude`/`assertHeroChartCoherence`/`chartMagnitudeFromSpec` all sourced from `lib/deliverable/chart-coherence.ts` (P2). `ChartSpec.theme` used, never `options.theme`.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. The two intentionally-untested surfaces (konva render, network glue) are named verify-items with a stated reason (no harness exists — matches the sibling coherence-gate plan's honesty), not silent gaps.
