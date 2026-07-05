# Sourced Movement-Band + Confirm-on-Outlier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 6 tasks, keywords: architecture

> **Revision 2026-07-05 (implemented):** the outlier path gained a **web-confirm** step (operator ask). An out-of-band metric is verified against live authoritative sources via the existing data-readiness ladder (`verifyMetricItem`) BEFORE any note: a grounded source that agrees → ship clean; a source that disagrees → discrepancy note; no grounded confirm → please-confirm note. This split Task 3 into a pure `bandOutliers` detector + a pure `resolveOutlierNote` resolver, added `lib/deliverable/band-guard-web.ts` (the ladder projection), and threaded an injectable `confirmOutlier` through `buildDeliverableNarrative` → `assembleDeliverable`. Shipped shape reflects this; the task bodies below are the pre-revision draft.

**Goal:** Compare every number a deliverable prints against what the previous deliverable in its series printed, against a sourced movement band; on an implausible move, web-confirm it against live sources and append a discrepancy/please-confirm note only when it can't be verified — never silently shipping an implausible number.

**Architecture:** A new pure module `lib/deliverable/band-guard.ts` (family classification + sourced band table + a pure `checkBand` + a snapshot differ that emits confirm-notes). The single build chokepoint `assembleDeliverable` (`lib/deliverable/assemble.ts`) loads the prior deliverable's frozen `items_snapshot` for the same `project_id` + `template`, runs the guard over label-matched `metric` items, and appends any confirm-notes to `narrative.inference_notes`. Entirely behind `BAND_GUARD_ENABLED` (default OFF) — flag OFF is byte-identical to today, mirroring the existing `RECONCILE_TTL_GATE_ENABLED` pass.

**Tech Stack:** TypeScript, `bun:test` (run `bun test <path>`), Supabase JS client (service role), Next.js App Router.

## Global Constraints

- **Baseline rule (operator decree, LOCKED 2026-07-05):** the baseline is the value the PREVIOUS deliverable in the series printed — never a lake time-series, never a second source. "Whatever the brain says now is right; base the next email off what the first email said."
- **Additive only:** the current (trusted) number always ships. The guard APPENDS a confirm inference-note; it never strips or alters a number.
- **No invention (four-lane moat):** a confirm-note may estimate but must name its basis; only a number with no source is forbidden.
- **Note gate invariants:** any appended inference note MUST contain a `falsifier:` clause and MUST include at least one number that anchors to a filed snapshot item (the current value qualifies). It MUST NOT contain smoothing tokens or the jargon words (`master`, `brain`, `payload`, `grain`, `dossier`). Verified by `lintDeliverableNarrative` in Task 4.
- **Flag default OFF:** `BAND_GUARD_ENABLED` unset ⇒ no behavior change anywhere.
- **Bands are sourced (spec §4):** volatile counts ±~10–12%/mo (Census construction ± CI: starts ±9.8%, completions ±12.3%); slow prices/values ~1%/mo (Zillow 0.8% YoY home value, 2.0% YoY rent); bounded ratios/scores use absolute point delta; durations ±~15%/mo; structural/annual — any monthly move confirms.
- **Test framework:** `import { test, expect, describe } from "bun:test";` co-located as `./<name>.test.ts`.

---

## File Structure

- **Create** `lib/deliverable/band-guard.ts` — family types, `FAMILY_BANDS`, `classifyFamily`, `parseMagnitude`, `checkBand`, `bandConfirmNotes`. One responsibility: decide whether a number moved implausibly and phrase the confirm-note.
- **Create** `lib/deliverable/band-guard.test.ts` — unit tests for every export.
- **Modify** `lib/deliverable/build.ts` — add `bandGuardEnabled()` env reader; extend `buildDeliverableNarrative` opts with optional `priorItems` + `gapDays`; append confirm-notes when the flag is on.
- **Modify** `lib/deliverable/assemble.ts` — load the prior deliverable snapshot for `projectId` + `template`, compute `gapDays`, thread both into `buildDeliverableNarrative`.

---

### Task 1: Family classification + sourced band table

**Files:**
- 🔴 Create: `lib/deliverable/band-guard.ts`
- 🔴 Test: `lib/deliverable/band-guard.test.ts`

**Interfaces:**
- Produces: `type MetricFamily = "slow_price" | "volatile_count" | "duration" | "bounded_ratio" | "structural" | "unknown"`; `FAMILY_BANDS: Record<MetricFamily, FamilyBand>` where `interface FamilyBand { monthlyBand: number; kind: "pct" | "abs"; confirmMultiple: number }`; `classifyFamily(label: string): MetricFamily`.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { classifyFamily, FAMILY_BANDS } from "./band-guard";

describe("classifyFamily", () => {
  test("slow prices/values", () => {
    expect(classifyFamily("Median Home Value")).toBe("slow_price");
    expect(classifyFamily("Median Asking Rent")).toBe("slow_price");
    expect(classifyFamily("Price per Square Foot")).toBe("slow_price");
  });
  test("volatile counts", () => {
    expect(classifyFamily("Active Inventory")).toBe("volatile_count");
    expect(classifyFamily("Homes Sold")).toBe("volatile_count");
    expect(classifyFamily("New Permits (90 Days)")).toBe("volatile_count");
  });
  test("bounded ratios/scores", () => {
    expect(classifyFamily("Sale-to-List Ratio")).toBe("bounded_ratio");
    expect(classifyFamily("Market Heat Score")).toBe("bounded_ratio");
    expect(classifyFamily("Months of Supply")).toBe("bounded_ratio");
  });
  test("durations", () => {
    expect(classifyFamily("Days on Market")).toBe("duration");
  });
  test("structural/annual", () => {
    expect(classifyFamily("Median household income")).toBe("structural");
    expect(classifyFamily("Save-Our-Homes Gap")).toBe("structural");
  });
  test("unknown label falls through", () => {
    expect(classifyFamily("Some Novel Metric")).toBe("unknown");
  });
});

describe("FAMILY_BANDS", () => {
  test("every family has a band grounded in the spec", () => {
    expect(FAMILY_BANDS.volatile_count.monthlyBand).toBeGreaterThanOrEqual(10);
    expect(FAMILY_BANDS.slow_price.monthlyBand).toBeLessThanOrEqual(3);
    expect(FAMILY_BANDS.bounded_ratio.kind).toBe("abs");
    expect(FAMILY_BANDS.unknown).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/band-guard.test.ts`
Expected: FAIL — `Cannot find module "./band-guard"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/deliverable/band-guard.ts
//
// Sourced movement-band guard for deliverable numbers. Baseline = the previous
// deliverable's printed value (operator decree 2026-07-05). Bands are sourced
// (spec docs/superpowers/specs/2026-07-05-sourced-band-number-guard-design.md §4):
// Census construction ± CI for counts, Zillow YoY for slow prices, absolute
// point-delta for bounded ratios/scores. Pure — no I/O, no model.

export type MetricFamily =
  | "slow_price"
  | "volatile_count"
  | "duration"
  | "bounded_ratio"
  | "structural"
  | "unknown";

export interface FamilyBand {
  /** Normal move over ~30 days. `pct` families: percent; `abs` families: points. */
  monthlyBand: number;
  kind: "pct" | "abs";
  /** A move beyond monthlyBand × confirmMultiple (cadence-scaled) is implausible. */
  confirmMultiple: number;
}

// Grounded in the crawl4ai research pass (spec §4). `unknown` gets a wide band so
// an unclassified metric is never falsely flagged.
export const FAMILY_BANDS: Record<MetricFamily, FamilyBand> = {
  slow_price: { monthlyBand: 3, kind: "pct", confirmMultiple: 2.5 }, // Zillow ~0.8–2% YoY
  volatile_count: { monthlyBand: 12, kind: "pct", confirmMultiple: 2.5 }, // Census ±9.8–12.3% MoM
  duration: { monthlyBand: 15, kind: "pct", confirmMultiple: 2.5 },
  bounded_ratio: { monthlyBand: 8, kind: "abs", confirmMultiple: 2.5 }, // ±8 points
  structural: { monthlyBand: 1, kind: "pct", confirmMultiple: 2.5 }, // annual cadence — any real move confirms
  unknown: { monthlyBand: 100, kind: "pct", confirmMultiple: 2.5 }, // never false-flag
};

// Ordered keyword → family. First match wins; keep the specific words above the
// generic ones (e.g. "rent" before a bare "value").
const FAMILY_KEYWORDS: [RegExp, MetricFamily][] = [
  [/\b(home value|asking rent|rent|price per square foot|price\/sqft|median (listing|sold|sale) price|list-side asking|median listing price|median sold price)\b/i, "slow_price"],
  [/\b(inventory|homes sold|permits?|new[- ]listing count|active (rental )?listings?|listing count|new listings?)\b/i, "volatile_count"],
  [/\b(days on market|dom)\b/i, "duration"],
  [/\b(ratio|share|score|months of supply|pending|sale-to-list|price-cut|heat|hotness|spread|save-our-homes|sold-to-rent|list-to-sold)\b/i, "bounded_ratio"],
  [/\b(household income|median age|population|poverty|save-our-homes gap|annual flood loss|owner[- ]occupied|household size)\b/i, "structural"],
];

// A couple of labels match two buckets ("Save-Our-Homes Gap" hits ratio + structural);
// structural cadence dominates, so re-pin those explicitly ahead of the generic scan.
const STRUCTURAL_OVERRIDE = /\b(save-our-homes gap|median household income|annual flood loss)\b/i;

export function classifyFamily(label: string): MetricFamily {
  if (STRUCTURAL_OVERRIDE.test(label)) return "structural";
  for (const [re, fam] of FAMILY_KEYWORDS) if (re.test(label)) return fam;
  return "unknown";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/band-guard.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/band-guard.ts lib/deliverable/band-guard.test.ts
git commit -m "feat(band-guard): metric family classification + sourced band table"
```

---

### Task 2: `parseMagnitude` + `checkBand` — the pure verdict

**Files:**
- 🔴 Modify: `lib/deliverable/band-guard.ts`
- 🔴 Test: `lib/deliverable/band-guard.test.ts`

**Interfaces:**
- Consumes: `MetricFamily`, `FAMILY_BANDS` (Task 1).
- Produces: `parseMagnitude(value: string): number | null`; `type BandStatus = "ok" | "confirm_outlier" | "uncheckable"`; `checkBand(args: { nowValue: string; priorValue: string; family: MetricFamily; gapDays: number }): { status: BandStatus; movePct: number | null; allowed: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { parseMagnitude, checkBand } from "./band-guard";

describe("parseMagnitude", () => {
  test("handles currency, commas, percent, K/M/B suffix", () => {
    expect(parseMagnitude("$485K")).toBe(485000);
    expect(parseMagnitude("$1.2M")).toBe(1_200_000);
    expect(parseMagnitude("$30,074")).toBe(30074);
    expect(parseMagnitude("4.8%")).toBe(4.8);
    expect(parseMagnitude("127")).toBe(127);
    expect(parseMagnitude("—")).toBeNull();
    expect(parseMagnitude("n/a")).toBeNull();
  });
});

describe("checkBand", () => {
  test("in-band slow price is ok (monthly)", () => {
    const r = checkBand({ nowValue: "$490K", priorValue: "$485K", family: "slow_price", gapDays: 30 });
    expect(r.status).toBe("ok");
  });
  test("home value 3x prior is a confirm_outlier", () => {
    const r = checkBand({ nowValue: "$1.5M", priorValue: "$485K", family: "slow_price", gapDays: 30 });
    expect(r.status).toBe("confirm_outlier");
    expect(r.movePct).toBeGreaterThan(100);
  });
  test("a 9% permit-count move is noise (in band)", () => {
    const r = checkBand({ nowValue: "109", priorValue: "100", family: "volatile_count", gapDays: 30 });
    expect(r.status).toBe("ok");
  });
  test("a 40% permit-count move confirms", () => {
    const r = checkBand({ nowValue: "140", priorValue: "100", family: "volatile_count", gapDays: 30 });
    expect(r.status).toBe("confirm_outlier");
  });
  test("bounded ratio uses absolute points, not ratio", () => {
    // 12 → 30 is +18 points; band 8 × 2.5 = 20 → in band; +25 points would confirm.
    expect(checkBand({ nowValue: "30", priorValue: "12", family: "bounded_ratio", gapDays: 30 }).status).toBe("ok");
    expect(checkBand({ nowValue: "40", priorValue: "12", family: "bounded_ratio", gapDays: 30 }).status).toBe("confirm_outlier");
  });
  test("structural: any real monthly move confirms", () => {
    expect(checkBand({ nowValue: "$61,000", priorValue: "$60,000", family: "structural", gapDays: 30 }).status).toBe("confirm_outlier");
  });
  test("band scales to the send gap — a weekly gap tightens the count band", () => {
    // 12%/mo × (7/30) ≈ 2.8% normal; × 2.5 ≈ 7% confirm line. A 20% weekly jump confirms.
    expect(checkBand({ nowValue: "120", priorValue: "100", family: "volatile_count", gapDays: 7 }).status).toBe("confirm_outlier");
  });
  test("unparseable or zero prior → uncheckable, never a false confirm", () => {
    expect(checkBand({ nowValue: "$5", priorValue: "—", family: "slow_price", gapDays: 30 }).status).toBe("uncheckable");
    expect(checkBand({ nowValue: "5", priorValue: "0", family: "slow_price", gapDays: 30 }).status).toBe("uncheckable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/band-guard.test.ts`
Expected: FAIL — `parseMagnitude`/`checkBand` are not exported.

- [ ] **Step 3: Write minimal implementation** (append to `lib/deliverable/band-guard.ts`)

```ts
import { FAMILY_BANDS, type MetricFamily } from "./band-guard"; // (same file — inline; no self-import)
```

> NOTE: do NOT add the self-import line above — `FAMILY_BANDS` and `MetricFamily` are already in this file. Append only the code below.

```ts
export type BandStatus = "ok" | "confirm_outlier" | "uncheckable";

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** Parse a display value to a magnitude. Understands $, commas, %, and a K/M/B
 *  suffix so "$1.2M" vs "$485K" compare correctly. Returns null when there is no
 *  parseable number (an em-dash, "n/a", empty). */
export function parseMagnitude(value: string): number | null {
  const raw = String(value).trim().toLowerCase();
  const m = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const suffix = raw.slice(raw.indexOf(m[0]) + m[0].length).trimStart()[0];
  return suffix && SUFFIX[suffix] ? n * SUFFIX[suffix] : n;
}

/** Decide whether `nowValue` moved implausibly from `priorValue` for its family,
 *  scaling the normal band to the number of days between the two sends. Pure. */
export function checkBand(args: {
  nowValue: string;
  priorValue: string;
  family: MetricFamily;
  gapDays: number;
}): { status: BandStatus; movePct: number | null; allowed: number } {
  const band = FAMILY_BANDS[args.family] ?? FAMILY_BANDS.unknown;
  const now = parseMagnitude(args.nowValue);
  const prior = parseMagnitude(args.priorValue);
  // Scale the monthly band to the actual gap (min 1 day so a same-day rebuild
  // doesn't divide the band to zero and false-flag everything).
  const scale = Math.max(1, args.gapDays) / 30;
  const allowed = band.monthlyBand * scale * band.confirmMultiple;
  if (now === null || prior === null || prior === 0) {
    return { status: "uncheckable", movePct: null, allowed };
  }
  if (band.kind === "abs") {
    const moveAbs = Math.abs(now - prior);
    return { status: moveAbs > allowed ? "confirm_outlier" : "ok", movePct: null, allowed };
  }
  const movePct = Math.abs((now - prior) / prior) * 100;
  return { status: movePct > allowed ? "confirm_outlier" : "ok", movePct, allowed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/band-guard.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/band-guard.ts lib/deliverable/band-guard.test.ts
git commit -m "feat(band-guard): parseMagnitude + cadence-scaled checkBand verdict"
```

---

### Task 3: `bandConfirmNotes` — match by label, emit gate-safe confirm-notes

**Files:**
- 🔴 Modify: `lib/deliverable/band-guard.ts`
- 🔴 Test: `lib/deliverable/band-guard.test.ts`

**Interfaces:**
- Consumes: `classifyFamily`, `checkBand` (Tasks 1–2); `SnapshotItem` from `./templates`.
- Produces: `bandConfirmNotes(nowItems: SnapshotItem[], priorItems: SnapshotItem[], gapDays: number): string[]` — one confirm-note string per label-matched `metric` whose move is `confirm_outlier`.

- [ ] **Step 1: Write the failing test**

```ts
import { bandConfirmNotes } from "./band-guard";
import { lintDeliverableNarrative } from "./narrative-lint";
import type { SnapshotItem } from "./templates";
import type { Narrative } from "./templates";

function metric(label: string, value: string): SnapshotItem {
  return { id: crypto.randomUUID(), added_at: "2026-07-05T00:00:00Z", origin: "web",
    kind: "metric", report_id: "d1", label, value, freshness_token: "" } as SnapshotItem;
}

describe("bandConfirmNotes", () => {
  test("an outlier metric yields one confirm-note", () => {
    const now = [metric("Median Home Value", "$1.5M")];
    const prior = [metric("Median Home Value", "$485K")];
    const notes = bandConfirmNotes(now, prior, 30);
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain("$1.5M");        // current value present (anchors)
    expect(notes[0].toLowerCase()).toContain("please confirm");
    expect(notes[0]).toMatch(/falsifier\s*:/i); // note-gate requirement
  });
  test("an in-band metric yields no note", () => {
    const now = [metric("Median Home Value", "$490K")];
    const prior = [metric("Median Home Value", "$485K")];
    expect(bandConfirmNotes(now, prior, 30)).toEqual([]);
  });
  test("a metric with no prior match yields no note", () => {
    const now = [metric("Median Home Value", "$1.5M")];
    const prior = [metric("Active Inventory", "100")];
    expect(bandConfirmNotes(now, prior, 30)).toEqual([]);
  });
  test("label match is case/space-insensitive", () => {
    const now = [metric("  median home value ", "$1.5M")];
    const prior = [metric("Median Home Value", "$485K")];
    expect(bandConfirmNotes(now, prior, 30).length).toBe(1);
  });
  test("the emitted note survives the deliverable note gate", () => {
    const now = [metric("Median Home Value", "$1.5M")];
    const prior = [metric("Median Home Value", "$485K")];
    const notes = bandConfirmNotes(now, prior, 30);
    const narrative: Narrative = { exec_summary: "", sections: [], inference_notes: notes };
    // Anchor set = the current snapshot's numbers (what the deliverable actually holds).
    const res = lintDeliverableNarrative(narrative, ["$1.5M"], []);
    expect(res.violations.filter((v) => v.location === "inference_note")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/band-guard.test.ts`
Expected: FAIL — `bandConfirmNotes` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `lib/deliverable/band-guard.ts`)

```ts
import type { SnapshotItem } from "./templates";

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

type MetricItem = Extract<SnapshotItem, { kind: "metric" }>;

/** For each `metric` in the new snapshot that label-matches a `metric` in the
 *  prior snapshot and moved beyond its sourced band, emit ONE confirm-note. The
 *  note is constructed to satisfy the deliverable note gate: it contains a
 *  `falsifier:` clause and cites the CURRENT value (which anchors to a filed
 *  item), and avoids smoothing/jargon tokens. Additive — the number still ships. */
export function bandConfirmNotes(
  nowItems: SnapshotItem[],
  priorItems: SnapshotItem[],
  gapDays: number,
): string[] {
  const priorByLabel = new Map<string, MetricItem>();
  for (const it of priorItems) {
    if (it.kind === "metric") priorByLabel.set(normLabel(it.label), it);
  }
  const notes: string[] = [];
  for (const it of nowItems) {
    if (it.kind !== "metric") continue;
    const prior = priorByLabel.get(normLabel(it.label));
    if (!prior) continue;
    const family = classifyFamily(it.label);
    const verdict = checkBand({
      nowValue: it.value,
      priorValue: prior.value,
      family,
      gapDays,
    });
    if (verdict.status !== "confirm_outlier") continue;
    notes.push(
      `${it.label} reads ${it.value} in this update, versus ${prior.value} in the last one — ` +
        `a larger shift than this figure usually makes over this period. We can make mistakes; ` +
        `please confirm ${it.value} before this sends. ` +
        `falsifier: this holds if a named source shows ${it.value} for this period.`,
    );
  }
  return notes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/band-guard.test.ts`
Expected: PASS (all tests). If the "survives the note gate" test fails on a smoothing/jargon token, adjust the note wording (not the gate) until it passes.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/band-guard.ts lib/deliverable/band-guard.test.ts
git commit -m "feat(band-guard): bandConfirmNotes — label-matched, gate-safe confirm notes"
```

---

### Task 4: Flag + wire the guard into `buildDeliverableNarrative`

**Files:**
- Modify: `lib/deliverable/build.ts` (add env reader; extend `buildDeliverableNarrative` opts + append notes)
- Test: `lib/deliverable/band-guard-wire.test.ts` (new)

**Interfaces:**
- Consumes: `bandConfirmNotes` (Task 3).
- Produces: `bandGuardEnabled(): boolean`; `buildDeliverableNarrative` accepts optional `priorItems?: SnapshotItem[]` and `gapDays?: number`.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { buildDeliverableNarrative } from "./build";
import type { SnapshotItem } from "./templates";

function metric(label: string, value: string): SnapshotItem {
  return { id: crypto.randomUUID(), added_at: "2026-07-05T00:00:00Z", origin: "web",
    kind: "metric", report_id: "d1", label, value, freshness_token: "" } as SnapshotItem;
}

// buildDeliverableNarrative short-circuits to a mock narrative when agents are
// mocked (agentsAreMocked()) — this repo's tests run with that env set. The mock
// narrative has empty inference_notes, so any note present came from the band pass.
describe("band guard wiring", () => {
  const now = [metric("Median Home Value", "$1.5M")];
  const prior = [metric("Median Home Value", "$485K")];

  afterEach(() => { delete process.env.BAND_GUARD_ENABLED; });

  test("flag OFF → no confirm note appended", async () => {
    delete process.env.BAND_GUARD_ENABLED;
    const r = await buildDeliverableNarrative({
      instruction: "", items: now, template: "email", priorItems: prior, gapDays: 30,
    });
    expect(r.narrative.inference_notes.some((n) => n.includes("please confirm"))).toBe(false);
  });

  test("flag ON + outlier vs prior → confirm note appended", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const r = await buildDeliverableNarrative({
      instruction: "", items: now, template: "email", priorItems: prior, gapDays: 30,
    });
    expect(r.narrative.inference_notes.some((n) => n.toLowerCase().includes("please confirm"))).toBe(true);
  });

  test("flag ON but no priorItems → no note (first send establishes baseline)", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const r = await buildDeliverableNarrative({ instruction: "", items: now, template: "email" });
    expect(r.narrative.inference_notes.some((n) => n.includes("please confirm"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/band-guard-wire.test.ts`
Expected: FAIL — `buildDeliverableNarrative` ignores `priorItems`/`gapDays`; no note appended when ON.

- [ ] **Step 3: Add the env reader** near the existing `ttlGateEnabled` in `lib/deliverable/build.ts`

Find the existing `ttlGateEnabled` reader (search `ttlGateEnabled`) and add beside it:

```ts
/** Band guard (spec 2026-07-05) — default OFF; "1"/"true" turns it on. Mirrors
 *  ttlGateEnabled so the whole pass ships dark until explicitly enabled. */
export function bandGuardEnabled(): boolean {
  const v = process.env.BAND_GUARD_ENABLED;
  return v === "1" || v === "true";
}
```

- [ ] **Step 4: Import + append notes in `buildDeliverableNarrative`**

At the top of `lib/deliverable/build.ts` add:

```ts
import { bandConfirmNotes } from "./band-guard";
```

Extend the opts type of `buildDeliverableNarrative` (currently `{ instruction; items; template }`):

```ts
export async function buildDeliverableNarrative(opts: {
  instruction: string;
  items: SnapshotItem[];
  template: string;
  /** Prior deliverable's frozen items — the band-guard baseline. Omitted on a
   *  first send (no prior) → the guard runs on nothing. */
  priorItems?: SnapshotItem[];
  /** Days between the prior send and now — scales the movement band. Default 30. */
  gapDays?: number;
}): Promise<BuildResult> {
```

Then, immediately before `return { narrative, regenerations, stripped };` (the final return), insert:

```ts
  // Band guard (flag-gated, additive): append a "please confirm" note for any
  // metric that moved implausibly vs what the previous deliverable printed. The
  // trusted number still ships; the note is constructed to satisfy the note gate.
  if (bandGuardEnabled() && opts.priorItems && opts.priorItems.length > 0) {
    const confirmNotes = bandConfirmNotes(opts.items, opts.priorItems, opts.gapDays ?? 30);
    if (confirmNotes.length > 0) {
      narrative = {
        ...narrative,
        inference_notes: [...narrative.inference_notes, ...confirmNotes],
      };
    }
  }
```

> The mock-narrative early return (`if (agentsAreMocked())`) is BEFORE this block, so the flag-ON test above must not rely on it — instead, move the band-guard block to run on the mock path too. To keep it in ONE place, change the mock early-return from `return { narrative: mockNarrative(items), ... }` to assign `narrative = mockNarrative(items)` and `let regenerations = 0; let stripped = false;` then fall through to the shared band-guard block + final return. Verify by re-reading the function so both the mock and live paths hit the same append.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test lib/deliverable/band-guard-wire.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Guard against regressions on the existing build tests**

Run: `bun test lib/deliverable/`
Expected: PASS — the flag defaults OFF, so all prior deliverable tests are unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/deliverable/build.ts lib/deliverable/band-guard-wire.test.ts
git commit -m "feat(band-guard): flag-gated append into buildDeliverableNarrative"
```

---

### Task 5: Load the prior deliverable in `assembleDeliverable`

**Files:**
- Modify: `lib/deliverable/assemble.ts`
- Test: `lib/deliverable/assemble-band.test.ts` (new)

**Interfaces:**
- Consumes: `buildDeliverableNarrative` (Task 4, now accepting `priorItems`/`gapDays`).
- Produces: no new export — `assembleDeliverable` internally loads the prior snapshot and threads it through.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { assembleDeliverable } from "./assemble";

// A minimal fake service-role client capturing the deliverables SELECT (prior lookup)
// and the INSERT. Returns a prior row with an outlier-inducing snapshot.
function fakeDb(priorSnapshot: unknown[]) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "saved_charts") {
        return { select: () => ({ in: () => ({ data: [] }) }) };
      }
      if (table === "deliverables") {
        return {
          // prior lookup: select(...).eq(...).eq(...).lt(...).order(...).limit(...)
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{ items_snapshot: priorSnapshot, created_at: "2026-06-05T00:00:00Z" }],
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; },
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
  return { db, inserted };
}

describe("assembleDeliverable threads the prior snapshot into the band guard", () => {
  const nowItems = [{ kind: "metric", label: "Median Home Value", value: "$1.5M", report_id: "x", id: "a", added_at: "2026-07-05T00:00:00Z", origin: "web", freshness_token: "" }];
  const priorItems = [{ kind: "metric", label: "Median Home Value", value: "$485K", report_id: "y", id: "b", added_at: "2026-06-05T00:00:00Z", origin: "web", freshness_token: "" }];

  test("flag ON → the built deliverable carries a confirm note", async () => {
    process.env.BAND_GUARD_ENABLED = "1";
    const { db, inserted } = fakeDb(priorItems);
    await assembleDeliverable({
      db: db as never, projectId: "p1", ownerId: "u1",
      items: nowItems, branding: null, template: "email", instruction: "",
    });
    const notes = (inserted[0]?.narrative as { inference_notes: string[] }).inference_notes;
    expect(notes.some((n) => n.toLowerCase().includes("please confirm"))).toBe(true);
    delete process.env.BAND_GUARD_ENABLED;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/assemble-band.test.ts`
Expected: FAIL — `assembleDeliverable` does not load the prior snapshot, so no note is present.

- [ ] **Step 3: Load the prior deliverable + thread it through** in `lib/deliverable/assemble.ts`

Replace the current `buildDeliverableNarrative` call block (lines ~76–81) with:

```ts
  const itemsSnapshot = await freezeSnapshot(opts.db, parsed.data);

  // Band-guard baseline (spec 2026-07-05): the previous deliverable in this series
  // (same project + template), most recent first. Its frozen items are the prior
  // values the new numbers are judged against. Best-effort — a missing prior (first
  // send) simply means no band gate. Never throws into the build.
  let priorItems: typeof itemsSnapshot | undefined;
  let gapDays = 30;
  try {
    const nowIso = new Date().toISOString();
    const { data: priorRows } = await opts.db
      .from("deliverables")
      .select("items_snapshot, created_at")
      .eq("project_id", opts.projectId)
      .eq("template", opts.template)
      .lt("created_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1);
    const prior = priorRows?.[0];
    if (prior?.items_snapshot) {
      priorItems = prior.items_snapshot as typeof itemsSnapshot;
      const ms = Date.parse(nowIso) - Date.parse(prior.created_at as string);
      if (Number.isFinite(ms) && ms > 0) gapDays = Math.max(1, Math.round(ms / 86_400_000));
    }
  } catch {
    // prior lookup failed — proceed with no baseline (no band gate), never block a build
  }

  const { narrative } = await buildDeliverableNarrative({
    instruction: opts.instruction,
    items: itemsSnapshot,
    template: opts.template,
    priorItems,
    gapDays,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/assemble-band.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard the existing assemble/build tests**

Run: `bun test lib/deliverable/`
Expected: PASS — flag OFF by default; the prior lookup is best-effort and does not change flag-OFF behavior.

- [ ] **Step 6: Typecheck the whole app (Vercel parity — memory: use next build, not bare tsc)**

Run: `bunx next build`
Expected: compiles clean (no type error from the new opts / prior-row typing).

- [ ] **Step 7: Commit**

```bash
git add lib/deliverable/assemble.ts lib/deliverable/assemble-band.test.ts
git commit -m "feat(band-guard): assembleDeliverable loads prior deliverable as the band baseline"
```

---

### Task 6: Live-verify + close the check

**Files:**
- No code. This task produces the live proof that closes `sourced_band_number_guard_live_verify`.

- [ ] **Step 1: Enable the flag in the target environment (operator action)**

Set `BAND_GUARD_ENABLED=1` in the Vercel project env for a preview/staging deployment (operator runs this — do not touch prod without a green light).

- [ ] **Step 2: Build a deliverable twice for the same project + template**

Build once (establishes the baseline snapshot). Then edit one `metric` to an implausible value (e.g. a home value 3× the first) and build again for the same project.

- [ ] **Step 3: Observe the live proof**

Open the second `/p/[id]`. Confirm:
1. The outlier number still renders (additive — nothing stripped).
2. An inference note reads "…please confirm … falsifier: …" naming that metric.
3. A normal in-band rebuild produces NO such note (no false alarm).

- [ ] **Step 4: Close the check with the live evidence**

```bash
node scripts/check.mjs close sourced_band_number_guard_live_verify "observed confirm-note on /p/<id> for a 3x home-value move; in-band rebuild clean"
```

- [ ] **Step 5: Move the Operation-July task file + SESSION_LOG + push (operator-gated)**

Flip task 18's status, `git mv "_AUDIT_AND_ROADMAP/Operation July/18-content-freshness-guards.md" "_AUDIT_AND_ROADMAP/Operation-July-DONE/"` (or leave 18 open if only this sub-scope shipped), append a SESSION_LOG entry, and push via `node scripts/safe-push.mjs` after the operator's explicit go.

---

## Self-Review

**Spec coverage:**
- Fallback ladder step 1 (in-band ship / out-of-band confirm) → Tasks 2–4. ✓
- Sourced per-family bands + cadence scaling → Task 1 (`FAMILY_BANDS`) + Task 2 (`checkBand` gapDays). ✓
- Baseline = prior deliverable's printed value → Task 5 (prior-row load) + Task 3 (label match). ✓
- Additive, never strip → Task 4 (append to `inference_notes`). ✓
- Note-gate safety (falsifier + anchored current value) → Task 3 test "survives the note gate." ✓
- First send establishes baseline, no gate → Task 4 test "no priorItems → no note." ✓
- Flag default OFF, byte-identical → Task 4/5 flag-OFF tests + `bun test lib/deliverable/`. ✓
- Scheduled-send ships asterisked, never blocks → additive append + best-effort prior lookup (Task 5 try/catch). ✓
- Live proof done-when → Task 6. ✓
- Ladder step 2 (crawl4ai for a missing brand-new number) → NOT in this plan's tasks; it belongs to the fill path, not the band comparison. Flagged as out-of-scope for v1 below.

**Deferred to a follow-up (named, not silent):** lane-2 crawl fill for a brand-new metric with no prior AND no lake value (spec ladder step 2). This plan implements the band comparison + confirm-note (steps 1 and 3); the proactive crawl-fill for a first-time absent number is a separate build on the number-fill path and does not block the guard.

**Placeholder scan:** no TBD/TODO; every code step carries complete code. ✓

**Type consistency:** `MetricFamily`, `FamilyBand`, `BandStatus`, `checkBand` args/return, `bandConfirmNotes` signature, and `bandGuardEnabled` are used identically across Tasks 1–5. `parseMagnitude` returns `number | null` consistently. ✓

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2, Task 3 | `lib/deliverable/band-guard.ts`, `lib/deliverable/band-guard.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
