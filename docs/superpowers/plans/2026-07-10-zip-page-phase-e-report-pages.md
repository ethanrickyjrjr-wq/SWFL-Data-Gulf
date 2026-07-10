# Phase E — narration on all report pages + report-AI one root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 14 files, 2 conflict groups, keywords: migration, refactor, schema

**Goal:** Roll the Phase-B narration treatment out to corridor and brain report pages via bake adapters, and consolidate the per-page AI wiring (highlighter bridge + metric suggestions) into ONE root under `app/r/_components/` — killing the six-page drift the spec calls out.

**Architecture:** The Phase-B harness is reused unchanged (one prompt root, one renderer, one sink) — a new surface is one adapter file + one `SURFACE_ADAPTERS` entry. A new `ReportAi` server component owns `highlighterUiEnabled()` gating, `buildReportId` encoding, and `MetricSuggestion` normalization; all six `/r/` pages mount it instead of hand-rolling `ReportHighlightBridge`. The zip page's assembly glue (deliberately mirrored ~80 lines in `lib/narratives/zip-inputs.ts`) extracts into `lib/zip-report/assemble.ts` consumed by both. Corridor pages also gain the Phase-C news section over `city_pulse_corridors` (rows already carry geo columns).

**Tech Stack:** Next.js App Router server components, bun:test, Supabase (service-role, untyped for `data_lake.*`), existing bake harness (`scripts/bake-narratives.mts`).

**Spec:** `docs/superpowers/specs/2026-07-09-zip-page-destination-design.md` §Phase E + §One root · Handoff: `docs/handoff/2026-07-09-zip-page-phases-de-handoff.md` §Phase E · Check: `zip_page_destination_live_verify`

## Vendor evidence (RULE 0.4)

No new vendor surface in Phase E. The Anthropic call path (`refinery/agents/anthropic.mts`, `SYNTHESIS_MODEL`, metering, caps) was verified at spec time and is reused byte-identically; geocoder terms were verified in Phase C (SESSION_LOG 07/09/2026) and no new geocoding is added — corridor news reads columns Phase C already wrote. Batch API remains the flagged, NOT-built optimization per spec.

## Surface inventory (enumerated from the route registry, this plan)

- `corridor` — live set from `fetchVerifiedCorridorRows()` → `toCorridorLinks()` (the same source the route + sitemap use); fixture cross-check `fixtures/corridor-centroids.json` holds 27.
- `brain` — `brains/*.md` minus `test-alpha` = **41 slugs** (incl. `master`; served by `/r/[slug]`, plus the dedicated `/r/housing-swfl` page which reads the same `housing-swfl` narrative row). A brain whose display metrics are empty is skipped by the adapter (assemble → null), never faked.
- `community`/`neighborhood` — **DEFERRED** this build: the pages exist (`app/r/communities-swfl/…`) but are not sitemap-published and need their own input-assembly design. Task 8 opens check `narratives_communities_surface` (RULE 2.4 — no silent deferrals).
- Excluded per spec: `/r/search`, `/r/method/*`, `/r/source/*` (those two still migrate to `ReportAi` — they're grounded routes — they just never bake narratives).

Cost envelope: ~68 new surfaces (27+41) × ~2.6¢ ≈ **$1.77 full first bake**, delta-gated weekly after; the $1.00 run cap stops a run at ~38 surfaces, so the first all-surface bake splits across runs exactly like the zip first bake (operator-gated, unchanged posture).

## Global Constraints

- **One root (spec §One root):** bridge mounting/suggestion assembly in ONE component; `NarrativeSections` is the ONLY narrative renderer; `lib/narratives/prompt.ts` is the ONLY prompt root — no per-surface forks of any of them.
- **Guard tests move WITH the migration, never dropped:** `lib/highlighter/report-surface.test.ts` GUARD + `lib/highlighter/grounding-coverage.test.ts` Check 2 are updated in the SAME commit that migrates pages, keeping their 404-class / ungrounded-page protection intact.
- **Hash stability:** `inputsHash` covers `facts` + `asOf` only. The zip extraction (Task 3) must keep `assembleZipBakeInputs` output byte-identical — a silent change re-bakes ~123 ZIPs.
- **Additive + empty-tolerant:** every new page section renders nothing without a row; a page with no narrative row is byte-identical to today.
- **Phone standard** (spec §Phone): new sections reuse `NarrativeSections`/`PulseNearby` (already phone-verified patterns); verify no layout shift at 390px in Task 8.
- **No system nouns in any rendered copy; as-of dates MM/DD/YYYY once** (validator-enforced).
- **Spend guards unchanged:** every bake call stays on `getAnthropic("narrative_bake")`; `NARRATIVE_BAKE_RUN_CAP_USD: "1.00"` stays an explicit workflow line.
- **No push without operator confirmation** (standing rule). Commit per task. Verify with `bunx next build`, never `npx tsc`.
- **No pack/vocab/ingest changes in this plan** → Gates 2/4/5 not triggered (nothing under `refinery/packs/`, `ingest/` untouched).

---

### Task 1: `ReportAi` — the one-root report AI component

**Files:**
- Create: `app/r/_components/report-ai.tsx`
- Test: `app/r/_components/report-ai.test.tsx`

**Interfaces:**
- Consumes: `ReportHighlightBridge` (`components/highlighter/ReportHighlightBridge.tsx`), `buildReportId` + `ReportSurfaceKind` (`lib/highlighter/report-surface.ts`), `highlighterUiEnabled` (`lib/highlighter/flag.ts`), `suggestionsForMetric` (`lib/highlighter/suggestions.ts`), `MetricSuggestion` (`lib/highlighter/report-context-store.ts`).
- Produces: `ReportAi({ surface, surfaceKey, conclusion?, freshnessToken?, metrics? })` and `ReportAiMetric` — the ONLY way an `/r/` page publishes report context from Task 2 on.

- [ ] **Step 1: Write the failing test** `app/r/_components/report-ai.test.tsx`:

```tsx
import { test, expect, beforeEach } from "bun:test";
import { ReportAi } from "./report-ai";
import { ReportHighlightBridge } from "../../../components/highlighter/ReportHighlightBridge";

beforeEach(() => {
  delete process.env.HIGHLIGHTER_UI; // default = enabled
});

function render(props: Parameters<typeof ReportAi>[0]) {
  return ReportAi(props) as React.ReactElement | null;
}

test("encodes the surface via buildReportId (synthetic namespaced, brain bare)", () => {
  const zip = render({ surface: "zip", surfaceKey: "33901" });
  expect(zip?.type).toBe(ReportHighlightBridge);
  expect(zip?.props.reportId).toBe("zip:33901");
  const brain = render({ surface: "brain", surfaceKey: "housing-swfl" });
  expect(brain?.props.reportId).toBe("housing-swfl");
});

test("normalizes metrics: stringifies values, defaults per-metric freshness to the page token", () => {
  const el = render({
    surface: "corridor",
    surfaceKey: "us-41-fort-myers",
    freshnessToken: "tok-1",
    metrics: [{ label: "Cap rate", value: 6.2, sourceUrl: "https://x.example" }],
  });
  expect(el?.props.metricSuggestions).toEqual([
    {
      label: "Cap rate",
      value: "6.2",
      suggestions: [],
      sourceUrl: "https://x.example",
      sourceLabel: undefined,
      freshnessToken: "tok-1",
    },
  ]);
});

test("precomputed suggestions win; packId computes via suggestionsForMetric", () => {
  const el = render({
    surface: "zip",
    surfaceKey: "33901",
    metrics: [
      { label: "Median sale price", value: "$525,000", suggestions: ["keep me"] },
      { label: "Days on market", value: "12", packId: "housing-swfl" },
    ],
  });
  const [pre, computed] = el?.props.metricSuggestions ?? [];
  expect(pre.suggestions).toEqual(["keep me"]);
  expect(computed.suggestions.length).toBeGreaterThan(0);
});

test("renders nothing when the highlighter UI flag is off", () => {
  process.env.HIGHLIGHTER_UI = "0";
  expect(render({ surface: "method", surfaceKey: "cap_rate_median" })).toBeNull();
});
```

(If `highlighterUiEnabled` reads a different env name/values, mirror the real flag file — read `lib/highlighter/flag.ts` first and use its actual off-switch in the last test.)

- [ ] **Step 2: Run to verify failure.** `bun test app/r/_components/report-ai.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `app/r/_components/report-ai.tsx`:**

```tsx
import { ReportHighlightBridge } from "../../../components/highlighter/ReportHighlightBridge";
import { buildReportId, type ReportSurfaceKind } from "../../../lib/highlighter/report-surface";
import { highlighterUiEnabled } from "../../../lib/highlighter/flag";
import { suggestionsForMetric } from "../../../lib/highlighter/suggestions";
import type { MetricSuggestion } from "../../../lib/highlighter/report-context-store";

/**
 * ONE root for every /r/ page's AI wiring (spec 2026-07-09-zip-page-destination
 * §One root #1). Owns the highlighter flag gate, the buildReportId encoding
 * (the 404-class contract), and MetricSuggestion normalization — pages pass
 * plain data and mount this; none of them touch ReportHighlightBridge or
 * buildReportId directly (report-surface.test.ts enforces it).
 */
export interface ReportAiMetric {
  label: string;
  value: string | number;
  /** Precomputed chips (DisplayBrain metrics carry them) — win when present. */
  suggestions?: string[];
  /** When set and `suggestions` is absent, chips are computed via
   *  suggestionsForMetric against this pack id (the zip-page pattern). */
  packId?: string;
  /** Metric key handed to suggestionsForMetric; defaults to label.toLowerCase(). */
  metricKey?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  /** Per-metric freshness override; defaults to the page-level token. */
  freshnessToken?: string;
}

export function ReportAi({
  surface,
  surfaceKey,
  conclusion,
  freshnessToken,
  metrics = [],
}: {
  surface: ReportSurfaceKind;
  surfaceKey: string;
  conclusion?: string;
  freshnessToken?: string;
  metrics?: ReportAiMetric[];
}) {
  if (!highlighterUiEnabled()) return null;
  const metricSuggestions: MetricSuggestion[] = metrics.map((m) => {
    const value = typeof m.value === "string" ? m.value : String(m.value);
    return {
      label: m.label,
      value,
      suggestions:
        m.suggestions ??
        (m.packId
          ? suggestionsForMetric({ metric: m.metricKey ?? m.label.toLowerCase(), value }, m.packId)
          : []),
      sourceUrl: m.sourceUrl,
      sourceLabel: m.sourceLabel,
      freshnessToken: m.freshnessToken ?? freshnessToken,
    };
  });
  return (
    <ReportHighlightBridge
      reportId={buildReportId(surface, surfaceKey)}
      conclusion={conclusion}
      freshnessToken={freshnessToken}
      metricSuggestions={metricSuggestions}
    />
  );
}
```

- [ ] **Step 4: Run.** `bun test app/r/_components/report-ai.test.tsx` → PASS.

- [ ] **Step 5: Commit.** `git add app/r/_components/report-ai.tsx app/r/_components/report-ai.test.tsx docs/superpowers/plans/2026-07-10-zip-page-phase-e-report-pages.md && git commit -m "feat(report-ai): ReportAi one-root component — gate + reportId encoding + suggestion normalization"`

---

### Task 2: migrate all six `/r/` pages to `ReportAi` + move the guards

**Files:**
- 🔴 Modify: `app/r/zip-report/[zip]/page.tsx`, `app/r/[slug]/page.tsx`, `app/r/housing-swfl/page.tsx`, `app/r/cre-swfl/[corridor]/page.tsx`, `app/r/method/[metric]/page.tsx`, `app/r/source/[table]/page.tsx`
- Modify: `lib/highlighter/report-surface.test.ts` (GUARD test), `lib/highlighter/grounding-coverage.test.ts` (Check 2)

**Interfaces:**
- Consumes: `ReportAi` / `ReportAiMetric` (Task 1).
- Produces: no page imports `ReportHighlightBridge`, `buildReportId`, or `highlighterUiEnabled` for bridge purposes anymore (remove those imports where now unused; keep `highlighterUiEnabled` only if the page uses it for something else — grep each page before deleting).

Known intentional behavior delta (state in the commit message): housing + [slug] previously FILTERED OUT metrics with zero suggestions; `ReportAi` passes all metrics through, so their popups now carry full provenance rows with type-aware fallback chips — the same "provenance now flows" fix the corridor page already got (its inline comment, [AUDIT-FIX C-meta EXTENDED]).

- [ ] **Step 1: Migrate the two bare pages.** `app/r/method/[metric]/page.tsx` — replace

```tsx
{highlighterEnabled && <ReportHighlightBridge reportId={buildReportId("method", metric)} />}
```

with

```tsx
<ReportAi surface="method" surfaceKey={metric} />
```

`app/r/source/[table]/page.tsx` — same shape: `<ReportAi surface="source" surfaceKey={table} />`. In both files: import `{ ReportAi }` from `../../_components/report-ai`; delete the now-unused `ReportHighlightBridge`/`buildReportId`/`highlighterUiEnabled` imports and the `highlighterEnabled` const (verify unused first).

- [ ] **Step 2: Migrate housing + [slug].** `app/r/housing-swfl/page.tsx` — replace the `{highlighterEnabled && <ReportHighlightBridge …/>}` block with:

```tsx
<ReportAi
  surface="brain"
  surfaceKey="housing-swfl"
  conclusion={housing.conclusion}
  freshnessToken={housing.freshnessToken}
  metrics={housing.metrics.map((m) => ({
    label: m.label,
    value: m.value,
    suggestions: m.suggestions,
    sourceUrl: m.sourceUrl,
    sourceLabel: m.sourceLabel,
  }))}
/>
```

`app/r/[slug]/page.tsx` — same shape with `surfaceKey={slug}`, `display.*` instead of `housing.*` (keep the existing explanatory comment block above the mount, reworded to name `ReportAi`). Bare-brain encoding is preserved structurally: `buildReportId("brain", slug) === slug`.

- [ ] **Step 3: Migrate corridor.** `app/r/cre-swfl/[corridor]/page.tsx`:

```tsx
<ReportAi
  surface="corridor"
  surfaceKey={corridor}
  conclusion={
    c.character_render ? stripCitations(c.character_render).slice(0, 500) : undefined
  }
  freshnessToken={freshnessToken || undefined}
  metrics={metrics.map((m) => ({
    label: m.label,
    value: m.value,
    sourceUrl: m.sourceUrl ?? undefined,
  }))}
/>
```

(No `suggestions`/`packId` → `ReportAi` emits `suggestions: []` — byte-equivalent to today's mapping, including per-metric freshness defaulting to the page token.)

- [ ] **Step 4: Migrate zip.** `app/r/zip-report/[zip]/page.tsx` — rewrite the `metricSuggestions` assembly (the `const metricSuggestions: MetricSuggestion[] = []` block) as a `ReportAiMetric[]` named `aiMetrics`, dropping the inline `suggestionsForMetric` calls in favor of `packId`:

```tsx
const aiMetrics: ReportAiMetric[] = [];
if (hasHousing) {
  const hm = (label: string, value: string): ReportAiMetric => ({
    label,
    value,
    packId: "housing-swfl",
  });
  aiMetrics.push(
    hm("Median sale price", `$${(price as number).toLocaleString()}`),
    hm("Days on market", String(dom)),
  );
  if (saleToList != null) aiMetrics.push(hm("Sale-to-list ratio", `${saleToList}%`));
  if (mos != null) aiMetrics.push(hm("Months of supply", String(mos)));
  if (homesSold != null) aiMetrics.push(hm("Homes sold (90 days)", String(homesSold)));
  if (inventory != null) aiMetrics.push(hm("Active inventory", String(inventory)));
}
if (hasFlood && floodForZip) {
  const aalVal = floodForZip.aal;
  const floodPctVal = floodForZip.pctRank != null ? Math.round(floodForZip.pctRank) : null;
  const fp = { sourceUrl: floodSourceUrl, sourceLabel: floodSourceCitation || "FEMA NFIP" };
  aiMetrics.push({
    label: "Avg Annual Loss",
    value: `$${aalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} / yr`,
    packId: "env-swfl",
    metricKey: "avg annual loss",
    ...fp,
  });
  if (floodPctVal !== null) {
    aiMetrics.push({
      label: "SWFL percentile rank",
      value: `${floodPctVal}th`,
      packId: "env-swfl",
      metricKey: "SWFL percentile rank",
      ...fp,
    });
  }
  // …carry over EVERY remaining push in the current block the same way —
  // value string expressions verbatim, suggestionsForMetric(...) 1st arg's
  // `metric` string → metricKey, its 2nd arg → packId. Do not drop any metric.
}
```

Replace the bottom mount with `<ReportAi surface="zip" surfaceKey={zip} freshnessToken={freshnessToken} metrics={aiMetrics} />`. NOTE: the current zip block passes each `suggestionsForMetric` a RAW value (number for AAL, string elsewhere) while the popup value is the formatted string; `ReportAi` computes from the formatted string — chip text for the flood metrics may shift trivially (e.g. "$12,340 / yr" instead of 12340 inside a chip sentence). Acceptable; keep `metricKey` verbatim so the metric names don't shift.

- [ ] **Step 5: Move the GUARD** — rewrite the final test in `lib/highlighter/report-surface.test.ts` (keep the round-trip + resolver tests above it untouched):

```ts
// ---------------------------------------------------------------------------
// THE GUARD — ends the 404 class AND enforces the one-root (Phase E). Pages
// never touch ReportHighlightBridge directly: they mount <ReportAi> with a
// literal surface="…" from REPORT_SURFACE_KINDS, and ReportAi (unit-tested in
// app/r/_components/report-ai.test.tsx) is the single buildReportId call site.
// ---------------------------------------------------------------------------

test("GUARD: pages mount ReportAi (never the bridge) with a literal known surface", () => {
  const glob = new Glob("app/r/**/page.tsx");
  const offenders: string[] = [];

  for (const rel of glob.scanSync(REPO_ROOT)) {
    const src = readFileSync(path.join(REPO_ROOT, rel), "utf-8");
    const norm = rel.replace(/\\/g, "/");

    if (src.includes("ReportHighlightBridge")) {
      offenders.push(`${norm}: touches ReportHighlightBridge directly — mount <ReportAi> instead`);
    }
    if (!src.includes("<ReportAi")) continue;

    const surfaces = [...src.matchAll(/<ReportAi\b[\s\S]*?\bsurface="([^"]+)"/g)].map((m) => m[1]);
    if (surfaces.length === 0) {
      offenders.push(`${norm}: <ReportAi> without a literal surface="…" prop`);
    }
    for (const s of surfaces) {
      if (!(REPORT_SURFACE_KINDS as readonly string[]).includes(s)) {
        offenders.push(`${norm}: surface="${s}" is not a known report surface kind`);
      }
    }
  }

  expect(offenders).toEqual([]);
});
```

- [ ] **Step 6: Move grounding-coverage Check 2** in `lib/highlighter/grounding-coverage.test.ts` — add housing to the registry, retarget the import assertion, and pin the chain:

```ts
  test("every grounded report route still mounts the report AI root", () => {
    const GROUNDED_ROUTES = [
      "app/r/[slug]/page.tsx",
      "app/r/zip-report/[zip]/page.tsx",
      "app/r/source/[table]/page.tsx",
      "app/r/method/[metric]/page.tsx",
      "app/r/cre-swfl/[corridor]/page.tsx",
      "app/r/housing-swfl/page.tsx",
    ];
    for (const route of GROUNDED_ROUTES) {
      const abs = join(REPO_ROOT, route);
      expect(existsSync(abs), `Grounded route moved/renamed — update this registry: ${route}`).toBe(
        true,
      );
      expect(
        importsSpecifier(readFileSync(abs, "utf8"), "report-ai"),
        `${route} no longer mounts ReportAi — its numbers degraded to ungrounded.`,
      ).toBe(true);
    }
    // The chain must stay intact: ReportAi is the ONE importer of the bridge.
    const shell = readFileSync(join(REPO_ROOT, "app/r/_components/report-ai.tsx"), "utf8");
    expect(importsSpecifier(shell, "ReportHighlightBridge")).toBe(true);
  });
```

(Check 1 and Check 3 stay as-is; the Check 2 doc-comment above the describe block gets a one-line update mentioning ReportAi.)

- [ ] **Step 7: Verify.** `bun test lib/highlighter/ lib/briefcase/page-mount-coverage.test.ts app/r/_components/report-ai.test.tsx` → PASS. `bunx next build` → green.

- [ ] **Step 8: Commit.** `git add app/r lib/highlighter/report-surface.test.ts lib/highlighter/grounding-coverage.test.ts && git commit -m "refactor(report-ai): all six /r/ pages mount ReportAi; guards enforce the one-root (spec §One root #1)"`

---

### Task 3: extract `lib/zip-report/assemble.ts` (kill the 80-line mirror)

**Files:**
- Create: `lib/zip-report/assemble.ts`
- 🔴 Modify: `app/r/zip-report/[zip]/page.tsx` (data-assembly region), `lib/narratives/zip-inputs.ts`

**Interfaces:**
- Consumes: everything `lib/narratives/zip-inputs.ts` imports today (`resolveZip`, `loadParsedBrain`, `buildRegistryTableMap`, `rankSignals`, `buildZipCandidates`, `loadCensusSignals`, `loadZipQuickSummary`, `assembleLocationDossier`).
- Produces: `assembleZipReport(zip: string): Promise<ZipReportAssembly | null>` where:

```ts
export interface ZipReportAssembly {
  res: ReturnType<typeof resolveZip>;            // in_scope guaranteed true
  primaryPlace: string | null;
  freshnessToken: string | undefined;
  registryBrains: Map<string, Awaited<ReturnType<typeof loadParsedBrain>>>;
  registryTables: ReturnType<typeof buildRegistryTableMap>;
  env: Awaited<ReturnType<typeof loadParsedBrain>>;
  permits: Awaited<ReturnType<typeof loadParsedBrain>>;
  dossier: Awaited<ReturnType<typeof assembleLocationDossier>>;
  summary: Awaited<ReturnType<typeof loadZipQuickSummary>>;
  censusSignals: Awaited<ReturnType<typeof loadCensusSignals>>;
  censusValues: CensusValue[];
  floodRows: FloodZipRow[];
  floodForZip: FloodZipRow | null;
  floodSourceUrl: string;
  floodSourceCitation: string;
  permitsCountMap: Map<string, number>;
  permitsSourceUrl: string;
  permitsSourceCitation: string;
  permitsTable: /* the permits detail table (or undefined) */;
  candidates: ReturnType<typeof buildZipCandidates>["candidates"];
  gaps: ReturnType<typeof buildZipCandidates>["gaps"];
  railContext: ReturnType<typeof buildZipCandidates>["railContext"];
  ranked: ReturnType<typeof rankSignals>;
}
```

**Procedure (behavior-preserving refactor — no TDD cycle of its own; the oracles are the existing suites + `next build` + hash stability):**

- [ ] **Step 1: Write `assemble.ts`** by MOVING the shared block: the `Promise.all` of registry brains/env/permits/dossier/summary/censusSignals (as in `zip-inputs.ts` today) + the flood/permits/census/candidates/ranking derivation as it appears in `zip-inputs.ts` lines 55–130 (which the page mirrors). `REGISTRY_PACK_IDS` moves here (export it). Return the full `ZipReportAssembly`; return `null` when `!res.in_scope`. Do NOT change any expression — copy, don't rewrite.
- [ ] **Step 2: Shrink `lib/narratives/zip-inputs.ts`** to: `listZipSurfaceKeys` (unchanged), `stripStatAnnotation` (unchanged), and `assembleZipBakeInputs` = `const a = await assembleZipReport(zip); if (!a || a.ranked.length === 0) return null;` then the existing facts/context/sources/asOf mapping verbatim from `a.*`. Update the file doc-comment: the mirror note is DEAD — say it now consumes the shared root.
- [ ] **Step 3: Rewire the page.** In `app/r/zip-report/[zip]/page.tsx`, replace the mirrored loads/derivations with `const a = await assembleZipReport(zip)` (slot it into the existing load flow — the page's other loads: metro trend, sourced figures, narrative, pulse, seed doc stay in a `Promise.all` alongside it; `notFound()` when `a === null` exactly where `!res.in_scope` 404s today). Rebind local names from `a.*` (`const { ranked, gaps, railContext, freshnessToken, … } = a`) so the render body below is untouched.
- [ ] **Step 4: Hash-stability proof.** `bun -e` a quick script: import BOTH the old logic path via git stash? No — simpler: BEFORE starting this task, run `bun -e "const {assembleZipBakeInputs}=await import('./lib/narratives/zip-inputs.ts');const {inputsHash}=await import('./lib/narratives/hash.ts');const i=await assembleZipBakeInputs('33901');console.log(i?inputsHash(i):'null')"` and record the hash; re-run AFTER the refactor — identical output required (needs lake creds in env; if unavailable locally, both runs return 'null' equally — then rely on the verbatim-move discipline + tests).
- [ ] **Step 5: Verify.** `bun test lib/narratives/ lib/zip-report/ lib/pulse/` → PASS. `bunx next build` → green.
- [ ] **Step 6: Commit.** `git add lib/zip-report/assemble.ts lib/narratives/zip-inputs.ts "app/r/zip-report/[zip]/page.tsx" && git commit -m "refactor(zip-report): ONE assembly root lib/zip-report/assemble.ts — page + bake adapter consume it"`

---

### Task 4: corridor bake adapter

**Files:**
- Create: `app/r/cre-swfl/corridor-metrics.ts` (extraction), `lib/narratives/corridor-inputs.ts`
- Modify: `app/r/cre-swfl/[corridor]/page.tsx` (import the extracted helpers), `scripts/bake-narratives.mts` (one `SURFACE_ADAPTERS` line)
- Test: `lib/narratives/corridor-inputs.test.ts`

**Interfaces:**
- Consumes: `fetchVerifiedCorridorRows` (`app/r/cre-swfl/corridors.ts`), `normalizeCorridor`/`CorridorNormalized` (`refinery/sources/cre-source.mts`), `corridorKey` (`refinery/lib/corridor-display.mts`), `loadParsedBrain`, `asOfFromToken`.
- Produces: `listCorridorSurfaceKeys(): Promise<string[]>`, `assembleCorridorBakeInputs(slug): Promise<BakeInputs | null>`, pure `corridorBakeFacts(c: CorridorNormalized): BakeFact[]` and `corridorBakeContext(c): string[]` (exported for offline tests). `buildMetricRows` + `stripCitations` move to `app/r/cre-swfl/corridor-metrics.ts` (page keeps behavior via import).

- [ ] **Step 1: Extract page helpers.** Create `app/r/cre-swfl/corridor-metrics.ts` containing `buildMetricRows` and `stripCitations` MOVED VERBATIM from `app/r/cre-swfl/[corridor]/page.tsx` (exported; `MetricRow` type import comes with them from `../_components/metrics-table`; `CorridorNormalized` type from `refinery/sources/cre-source.mts`). Update the page to import them; delete the local copies. `bunx next build` still green before proceeding.

- [ ] **Step 2: Write the failing test** `lib/narratives/corridor-inputs.test.ts` (offline — pure functions only):

```ts
import { describe, expect, it } from "bun:test";
import { corridorBakeFacts, corridorBakeContext } from "./corridor-inputs";
import type { CorridorNormalized } from "../../refinery/sources/cre-source.mts";

const c = {
  name: "US 41 Fort Myers",
  display_name: "US 41 — Fort Myers",
  city: "Fort Myers",
  county: "Lee",
  corridor_type: "retail-strip",
  metrics_period: "Q2 2026",
  cap_rate_pct: 6.2,
  cap_rate_direction: null,
  cap_rate_source_url: "https://x.example/cap",
  vacancy_rate_pct: null,
  absorption_sqft: null,
  asking_rent_psf: 27.51,
  asking_rent_psf_direction: null,
  asking_rent_psf_source_url: null,
  character_facts: "Anchored by big-box retail [internal-1]. Vacancy tightened in 2025 [web-2].",
  flags: [{ flag: "New Publix under construction", status: "active", type: "development" }],
} as unknown as CorridorNormalized;

describe("corridorBakeFacts", () => {
  it("maps metric rows to facts with display strings and a named source", () => {
    const facts = corridorBakeFacts(c);
    expect(facts.map((f) => f.label)).toEqual(["Cap rate", "Asking rent (NNN)"]);
    expect(facts[0].display).toBe("6.2%");
    expect(facts[1].display).toBe("$27.51/sf");
    for (const f of facts) expect(f.source.length).toBeGreaterThan(0);
  });
});

describe("corridorBakeContext", () => {
  it("strips citation tokens and folds in active-intel flags", () => {
    const ctx = corridorBakeContext(c);
    expect(ctx.join(" ")).not.toMatch(/\[(?:internal|web)-\d+\]/);
    expect(ctx.some((l) => l.includes("Publix"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify failure**, then implement `lib/narratives/corridor-inputs.ts`:

```ts
import { fetchVerifiedCorridorRows } from "../../app/r/cre-swfl/corridors";
import { buildMetricRows, stripCitations } from "../../app/r/cre-swfl/corridor-metrics";
import { corridorKey } from "../../refinery/lib/corridor-display.mts";
import { normalizeCorridor, type CorridorNormalized } from "../../refinery/sources/cre-source.mts";
import { loadParsedBrain } from "../fetch-brain";
import { asOfFromToken } from "../project/as-of";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * Corridor surface adapter (spec §Phase E). Reads the SAME verified rows the
 * /r/cre-swfl/[corridor] route resolves against and the SAME metric rows the
 * page renders — the bake can never cite a figure the page doesn't hold.
 */

/** Every corridor with a live drill-down page — the corridor bake population. */
export async function listCorridorSurfaceKeys(): Promise<string[]> {
  try {
    const rows = await fetchVerifiedCorridorRows();
    return [
      ...new Set(rows.map((r) => corridorKey(String(r.corridor_name ?? ""))).filter(Boolean)),
    ].sort();
  } catch {
    return []; // no lake creds (e.g. offline dry-run) — bake nothing, never crash
  }
}

export function corridorBakeFacts(c: CorridorNormalized): BakeFact[] {
  return buildMetricRows(c).map((m) => ({
    label: m.label,
    display: typeof m.value === "string" ? m.value : String(m.value),
    sub: c.metrics_period ? `period: ${c.metrics_period}` : null,
    why: null,
    source: "SWFL Data Gulf commercial corridor data",
  }));
}

export function corridorBakeContext(c: CorridorNormalized): string[] {
  const out: string[] = [];
  if (c.character_facts) {
    out.push(
      ...stripCitations(c.character_facts)
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
    );
  }
  for (const f of (c.flags ?? []).slice(0, 3)) out.push(f.flag);
  return out;
}

export async function assembleCorridorBakeInputs(slug: string): Promise<BakeInputs | null> {
  const rows = await fetchVerifiedCorridorRows();
  const row = rows.find((r) => corridorKey(String(r.corridor_name ?? "")) === slug);
  if (!row) return null;
  const c = normalizeCorridor(row);
  const facts = corridorBakeFacts(c);
  if (facts.length === 0) return null;

  const cre = await loadParsedBrain("cre-swfl");
  const sources = new Map<string, SourceRef>();
  for (const m of buildMetricRows(c)) {
    if (m.sourceUrl) {
      sources.set(m.sourceUrl, { label: "SWFL Data Gulf — commercial corridors", url: m.sourceUrl });
    }
  }
  return {
    surface: "corridor",
    key: slug,
    place: c.display_name ?? c.name,
    county: c.county !== "Unknown" ? c.county : null,
    asOf: (cre ? asOfFromToken(cre.freshness_token) : null) ?? null,
    facts,
    context: corridorBakeContext(c),
    sources: [...sources.values()],
  };
}
```

(Adjust field access ONLY if `CorridorNormalized`'s actual property names differ — read the interface in `refinery/sources/cre-source.mts` first; the page's `buildMetricRows`/`c.character_facts`/`c.flags`/`c.metrics_period`/`c.county`/`c.display_name` usage above is grep-proven.)

- [ ] **Step 4: Register the surface.** In `scripts/bake-narratives.mts`: import the two functions; add `corridor: { list: listCorridorSurfaceKeys, assemble: assembleCorridorBakeInputs },` to `SURFACE_ADAPTERS`.

- [ ] **Step 5: Run.** `bun test lib/narratives/` → PASS. `bunx next build` → green (page compiles against the extracted helpers).

- [ ] **Step 6: Commit.** `git add app/r/cre-swfl "app/r/cre-swfl/[corridor]/page.tsx" lib/narratives/corridor-inputs.ts lib/narratives/corridor-inputs.test.ts scripts/bake-narratives.mts && git commit -m "feat(narratives): corridor bake adapter — same rows/metric roots as the corridor page"`

---

### Task 5: corridor page — narration + corridor-radius news

**Files:**
- Create: `lib/pulse/corridor-nearby.ts`
- Modify: `lib/pulse/nearby-rank.ts` (+ its test), `components/narratives/PulseNearby.tsx`, `app/r/cre-swfl/[corridor]/page.tsx`
- Test: `lib/pulse/nearby-rank.test.ts` (extend)

**Interfaces:**
- Consumes: `city_pulse_corridors` geo columns (Phase C), `corridorKey`, `loadNarrative`, `NarrativeSections`, `PulseNearby`.
- Produces: `rankCorridorPulse(rows, slug, displayName, limit): NearbyPulseItem[]` (pure, in nearby-rank.ts); `loadPulseNearbyCorridor(slug, displayName): Promise<NearbyPulseItem[]>`; `PulseNearby` gains optional `heading` + `wideSuffix` props (zip call site untouched).

Scope note (deviation from the handoff's "reuse the banding"): v1 ranks THIS corridor's own rows only — anchored points first, corridor-wide after, newest first. No cross-corridor haversine banding: corridors are linear, a centroid band is a worse locality signal than the corridor key itself. The pattern (grain-ordered, labeled, empty-tolerant, OSM attribution) is what's reused.

- [ ] **Step 1: Failing tests** — append to `lib/pulse/nearby-rank.test.ts`:

```ts
import { rankCorridorPulse } from "./nearby-rank";

describe("rankCorridorPulse", () => {
  const row = (over: Record<string, unknown>) => ({
    fact: "F", topic: "business", location_anchor: null,
    source_url: "https://x.example", source_title: null, cited_text: null,
    captured_at: "2026-07-09T00:00:00Z", zip_code: null, lat: null, lon: null,
    geo_grain: null, corridor: "US 41 Fort Myers", ...over,
  });
  it("keeps only this corridor's rows, points before corridor-wide, newest first", () => {
    const rows = [
      row({ geo_grain: null, captured_at: "2026-07-09T00:00:00Z" }),
      row({ geo_grain: "point", lat: 26.6, lon: -81.87, zip_code: "33901",
            location_anchor: "4125 Cleveland Ave", captured_at: "2026-07-08T00:00:00Z" }),
      row({ corridor: "Pine Island Rd", geo_grain: "point" }),
    ];
    const out = rankCorridorPulse(rows as never, "us-41-fort-myers", "US 41 — Fort Myers", 10);
    expect(out).toHaveLength(2);
    expect(out[0].geo_grain).toBe("point");
    expect(out[1].city).toBe("US 41 — Fort Myers"); // wide item labels by display name
  });
  it("caps at the limit", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ captured_at: `2026-07-0${(i % 9) + 1}T00:00:00Z` }),
    );
    expect(rankCorridorPulse(rows as never, "us-41-fort-myers", "US 41", 10)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement in `lib/pulse/nearby-rank.ts` (append; import `corridorKey` from `../../refinery/lib/corridor-display.mts`):

```ts
export type CorridorPulseRow = Omit<PulseGeoRow, "city"> & { corridor: string };

/** Corridor variant of rankNearby: THIS corridor's rows only — anchored points
 * (grain point/neighborhood) first, corridor-wide items after, newest first
 * within each group. `city` is set to the display name so the shared renderer
 * labels wide items "{display} — {wideSuffix}". */
export function rankCorridorPulse(
  rows: CorridorPulseRow[],
  slug: string,
  displayName: string,
  limit: number,
): NearbyPulseItem[] {
  const kept: NearbyPulseItem[] = rows
    .filter((r) => corridorKey(r.corridor) === slug)
    .map((r) => ({
      ...r,
      city: displayName,
      geo_grain: (r.geo_grain === "point" || r.geo_grain === "neighborhood"
        ? r.geo_grain
        : "city") as PulseGeoRow["geo_grain"],
      distance_mi: null,
    }));
  kept.sort((a, b) => {
    const g =
      GRAIN_ORDER[a.geo_grain as keyof typeof GRAIN_ORDER] -
      GRAIN_ORDER[b.geo_grain as keyof typeof GRAIN_ORDER];
    if (g !== 0) return g;
    return b.captured_at.localeCompare(a.captured_at);
  });
  return kept.slice(0, limit);
}
```

- [ ] **Step 3: Loader `lib/pulse/corridor-nearby.ts`** (mirrors `nearby.ts` posture — empty-tolerant, untyped `data_lake`):

```ts
// KNOWN-DEBT(data_lake: city_pulse_corridors lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { rankCorridorPulse, type CorridorPulseRow, type NearbyPulseItem } from "./nearby-rank";

/** "What's happening along {corridor}" loader — Phase E reuse of the Phase C
 * geo columns on data_lake.city_pulse_corridors. Empty-tolerant: no creds, no
 * rows, or any error → [] (section renders nothing). */
const LIMIT = 10;

export async function loadPulseNearbyCorridor(
  slug: string,
  displayName: string,
): Promise<NearbyPulseItem[]> {
  let supabase: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    supabase = createServiceRoleClientUntyped();
  } catch {
    return [];
  }
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("city_pulse_corridors")
      .select(
        "fact, topic, corridor, location_anchor, source_url, source_title, cited_text, captured_at, zip_code, lat, lon, geo_grain",
      )
      .is("superseded_by", null)
      .gt("expires_at", new Date().toISOString())
      .order("captured_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return rankCorridorPulse(data as CorridorPulseRow[], slug, displayName, LIMIT);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Generalize `PulseNearby`** — add optional `heading` and `wideSuffix` props, defaults preserving the zip page byte-for-byte:

In `components/narratives/PulseNearby.tsx` change the signature/labels only:

```tsx
export function PulseNearby({
  zip,
  items,
  heading,
  wideSuffix = "city-wide",
}: {
  zip?: string;
  items: NearbyPulseItem[];
  heading?: string;
  wideSuffix?: string;
}) {
```

`grainLabel` wide branch becomes `` `${it.city} — ${wideSuffix}` ``; the `<h2>` and `aria-label` use `heading ?? `What’s happening near ${zip}``. Everything else (list markup, as-of format, OSM attribution line) untouched.

- [ ] **Step 5: Mount on the corridor page.** In `app/r/cre-swfl/[corridor]/page.tsx`, after `const { corridor: c, freshnessToken } = d;` add:

```tsx
const [narrative, pulseItems] = await Promise.all([
  loadNarrative("corridor", corridor),
  loadPulseNearbyCorridor(corridor, displayN),
]);
```

(imports: `loadNarrative` from `../../../../lib/narratives/store`, `NarrativeSections` from `../../../../components/narratives/NarrativeSections`, `loadPulseNearbyCorridor` from `../../../../lib/pulse/corridor-nearby`, `PulseNearby` from `../../../../components/narratives/PulseNearby`). Then directly after the `<WebCitations citations={c.character_citations} />` line:

```tsx
      {/* ── Baked narrative + corridor-radius news — additive, empty-tolerant (Phase E) ── */}
      <NarrativeSections row={narrative} />
      <PulseNearby
        items={pulseItems}
        heading={`What’s happening along ${displayN}`}
        wideSuffix="corridor-wide"
      />
```

- [ ] **Step 6: Verify.** `bun test lib/pulse/` → PASS. `bunx next build` → green.

- [ ] **Step 7: Commit.** `git add lib/pulse components/narratives/PulseNearby.tsx "app/r/cre-swfl/[corridor]/page.tsx" && git commit -m "feat(corridor-page): baked narration + What's happening along {corridor} (Phase C geo reuse)"`

---

### Task 6: brain bake adapter + brain-page mounts

**Files:**
- Create: `lib/narratives/brain-inputs.ts`
- 🟡 Modify: `scripts/bake-narratives.mts` (one `SURFACE_ADAPTERS` line), `app/r/[slug]/page.tsx`, `app/r/housing-swfl/page.tsx`
- Test: `lib/narratives/brain-inputs.test.ts`

**Interfaces:**
- Consumes: `parseBrainMarkdown` + `toDisplayBrain` (`refinery/render/speaker.mts`), `brains/*.md` on disk, `asOfFromToken`.
- Produces: `listBrainSurfaceKeys(): Promise<string[]>` (41 slugs today: every `brains/*.md` minus `test-alpha` — the sitemap's exact registry), `assembleBrainBakeInputs(slug): Promise<BakeInputs | null>`.

- [ ] **Step 1: Failing test** `lib/narratives/brain-inputs.test.ts` (runs against the repo's real brains dir — shape assertions only, never value assertions):

```ts
import { describe, expect, it } from "bun:test";
import { listBrainSurfaceKeys, assembleBrainBakeInputs } from "./brain-inputs";

describe("listBrainSurfaceKeys", () => {
  it("lists published brain slugs, excluding the dev fixture", async () => {
    const keys = await listBrainSurfaceKeys();
    expect(keys).toContain("housing-swfl");
    expect(keys).toContain("master");
    expect(keys).not.toContain("test-alpha");
  });
});

describe("assembleBrainBakeInputs", () => {
  it("assembles facts + context from the display layer", async () => {
    const inputs = await assembleBrainBakeInputs("housing-swfl");
    expect(inputs).not.toBeNull();
    expect(inputs!.surface).toBe("brain");
    expect(inputs!.key).toBe("housing-swfl");
    expect(inputs!.facts.length).toBeGreaterThan(0);
    for (const f of inputs!.facts) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.display.length).toBeGreaterThan(0);
      expect(f.source.length).toBeGreaterThan(0);
    }
    expect(inputs!.context.length).toBeGreaterThan(0);
  });
  it("returns null for a missing brain", async () => {
    expect(await assembleBrainBakeInputs("no-such-brain")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement `lib/narratives/brain-inputs.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseBrainMarkdown, toDisplayBrain } from "../../refinery/render/speaker.mts";
import { asOfFromToken } from "../project/as-of";
import type { BakeFact, BakeInputs, SourceRef } from "./types";

/**
 * Brain-page surface adapter (spec §Phase E). The key list mirrors the route
 * registry exactly (any brains/*.md is a live /r/[slug] page; test-alpha is
 * the dev fixture the sitemap also skips). Facts come from the SAME display
 * layer the page renders (toDisplayBrain) — the bake can never cite a figure
 * the page doesn't hold. Brains with no display metrics are skipped (null).
 */

const BRAINS_DIR = path.join(process.cwd(), "brains");
const EXCLUDED = new Set(["test-alpha"]);

export async function listBrainSurfaceKeys(): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(BRAINS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .filter((s) => !EXCLUDED.has(s))
    .sort();
}

export async function assembleBrainBakeInputs(slug: string): Promise<BakeInputs | null> {
  let content: string;
  try {
    content = await readFile(path.join(BRAINS_DIR, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
  let display: ReturnType<typeof toDisplayBrain>;
  try {
    display = toDisplayBrain(parseBrainMarkdown(content));
  } catch {
    return null; // unparseable brain renders as raw fallback — nothing to bake
  }

  const facts: BakeFact[] = display.metrics.map((m) => ({
    label: m.label,
    display: typeof m.value === "string" ? m.value : String(m.value),
    sub: null,
    why: null,
    source: m.sourceLabel ?? "SWFL Data Gulf",
  }));
  if (facts.length === 0) return null;

  const sources = new Map<string, SourceRef>();
  for (const m of display.metrics) {
    if (m.sourceUrl) sources.set(m.sourceUrl, { label: m.sourceLabel ?? "SWFL Data Gulf", url: m.sourceUrl });
  }
  return {
    surface: "brain",
    key: slug,
    place: display.title,
    county: null,
    asOf: asOfFromToken(display.freshnessToken) ?? null,
    facts,
    // Context numbers are whitelisted by the validator, so the conclusion's
    // figures can't trip the no-invention lint.
    context: [display.scope, display.conclusion].filter(Boolean),
    sources: [...sources.values()],
  };
}
```

(If `DisplayBrain`'s metric entries lack `sourceLabel`/`sourceUrl` under those exact names, read the `metrics` property type in `refinery/render/speaker.mts:733` and use the real names — the [slug] page maps `m.sourceUrl`/`m.sourceLabel`, so they exist.)

- [ ] **Step 3: Register.** `scripts/bake-narratives.mts`: add `brain: { list: listBrainSurfaceKeys, assemble: assembleBrainBakeInputs },` to `SURFACE_ADAPTERS`.

- [ ] **Step 4: Mount on `/r/[slug]`.** In `app/r/[slug]/page.tsx`: import `loadNarrative` + `NarrativeSections`; after `display` is built add `const narrative = await loadNarrative("brain", slug);`; mount directly after the conclusion section's closing `</section>` (the block ending `<AnswerText text={display.conclusion} />…</section>`, currently line ~204):

```tsx
      {/* ── Baked narrative — ONE renderer root, additive (Phase E) ── */}
      <NarrativeSections row={narrative} />
```

- [ ] **Step 5: Mount on `/r/housing-swfl`.** Same import pair; `const narrative = await loadNarrative("brain", "housing-swfl");` in the page body; mount directly after ITS conclusion section's `</section>` (the block ending `<p …>{housing.conclusion}</p>`, currently line ~171). Both pages read the SAME `('brain','housing-swfl')` row — one bake, two mounts, zero drift.

- [ ] **Step 6: Verify.** `bun test lib/narratives/` → PASS. `bunx next build` → green.

- [ ] **Step 7: Commit.** `git add lib/narratives/brain-inputs.ts lib/narratives/brain-inputs.test.ts scripts/bake-narratives.mts "app/r/[slug]/page.tsx" app/r/housing-swfl/page.tsx && git commit -m "feat(narratives): brain bake adapter (41 slugs) + narration mounts on /r/[slug] and /r/housing-swfl"`

---

### Task 7: `--surface all` — one cron covers every surface

**Files:**
- 🟡 Modify: `scripts/bake-narratives.mts` (surface loop), `.github/workflows/narrative-bake.yml`

**Interfaces:**
- Consumes: `SURFACE_ADAPTERS` (now zip + corridor + brain).
- Produces: `bun scripts/bake-narratives.mts --surface all` iterates every adapter under ONE shared run cap; the scheduled workflow bakes all surfaces; `--keys` with `all` is rejected.

- [ ] **Step 1: Restructure `main()`.** After `parseArgs`:

```ts
  const surfaces = args.surface === "all" ? Object.keys(SURFACE_ADAPTERS) : [args.surface];
  if (args.surface === "all" && args.keys) {
    console.error("--keys requires a single named --surface (not all)");
    return 1;
  }
  for (const surface of surfaces) {
    if (!SURFACE_ADAPTERS[surface]) {
      console.error(
        `unknown surface "${surface}" — known: ${Object.keys(SURFACE_ADAPTERS).join(", ")}, all`,
      );
      return 1;
    }
  }
```

Wrap the existing per-key loop in `for (const surface of surfaces) { const adapter = SURFACE_ADAPTERS[surface]; const keys = …; const existing = …; … }` — counters (`spent/baked/skipped/failed/failures`) hoist ABOVE the surface loop so the run cap is shared across surfaces (a cap breach `break`s out of BOTH loops — use a labeled `outer:` loop). Replace every `args.surface` inside the loop body with `surface`. The final summary line prints `surface=${args.surface}` (the requested selector) plus the shared totals — keep its format otherwise.

- [ ] **Step 2: Workflow.** In `.github/workflows/narrative-bake.yml`: change the dispatch input default `"zip"` → `"all"` and the run line default `'zip'` → `'all'`, and update the input description to `"Surface to bake (zip | corridor | brain | all)"`. `NARRATIVE_BAKE_RUN_CAP_USD: "1.00"` stays untouched.

- [ ] **Step 3: Verify offline.** `bun scripts/bake-narratives.mts --surface all --dry-run --force` → cadence line, then per-surface `[bake] would bake …` for zip + brain keys (corridor list returns `[]` without lake creds — must NOT crash), summary line, exit 0. Then `bun scripts/bake-narratives.mts --surface all --keys 33901 --dry-run --force` → the `--keys` rejection, exit 1.

- [ ] **Step 4: Commit.** `git add scripts/bake-narratives.mts .github/workflows/narrative-bake.yml && git commit -m "feat(bake): --surface all — one cron, one shared run cap across zip/corridor/brain"`

---

### Task 8: gates, log, checks — STOP before push

- [ ] **Step 1: Full gate sweep.** `bun test lib/ app/r/_components/report-ai.test.tsx` → PASS · `bunx next build` → green · phone check: `bunx next start`, devtools 390 px on `/r/cre-swfl/<any-corridor>` and `/r/housing-swfl` — new sections render nothing (no baked rows yet — correct), no layout shift, no horizontal scroll.
- [ ] **Step 2: Open the deferral check** (RULE 2.4): `node scripts/check.mjs open brain-platform narratives_communities_surface "Phase E follow-up: communities/neighborhood narrative surface — adapter + /r/communities-swfl mounts (pages exist, not sitemap-published; needs own input-assembly design)"`.
- [ ] **Step 3: Build-queue sync.** Update the zip-page line in `_AUDIT_AND_ROADMAP/build-queue.md`: Phases A–E built; communities surface deferred to its own check; first bake still operator-gated.
- [ ] **Step 4: SESSION_LOG entry** (top of file): Phase E built — ReportAi one-root (6 pages migrated, guards moved, housing added to grounded registry), zip assembly root extracted (hash-stable), corridor + brain adapters (27 + 41 surfaces, ~$1.77 full first bake under the $1/run cap ⇒ multi-run like zip), corridor news over `city_pulse_corridors`, `--surface all` cron; communities deferred → check; test/build evidence; live-verify posture unchanged (`zip_page_destination_live_verify` closes on the operator's live pass after the first bake).
- [ ] **Step 5: STOP.** Show `git log --oneline` + summary. Ask before ANY push (standing rule; a question is not push authorization).

## Failure posture

- A surface with no assemblable inputs (missing brain, zero metrics, unknown corridor) → adapter returns null → key skipped, never faked.
- Corridor list without lake creds → `[]`, loud-clean skip (dry-runs stay offline-runnable).
- Missing `narratives` row / missing pulse rows / query error → sections render nothing; pages byte-identical to today.
- Validator failure on any new surface keeps the previous row and exits 1 loud (unchanged harness posture). If legitimate corridor/brain phrasing trips the numeric lint, widen `lib/narratives/validate.ts` deliberately — never skip validation.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3 | `app/r/zip-report/[zip]/page.tsx` |
| 🟡 | Task 6, Task 7 | `scripts/bake-narratives.mts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
