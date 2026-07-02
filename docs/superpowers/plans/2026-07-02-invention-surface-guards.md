# Invention-Surface Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 9 tasks, 19 files, keywords: migration, architecture

**Goal:** Close the four invention surfaces the Latitude 26 live test exposed — mislabeled sold prices, minted URLs, mixed listing tables, $0 price binding — structurally, at existing seams.

**Architecture:** Extend the existing no-invention lint family (`gateNarrative` / `lintAuthoredProse`) with a recorded-claim gate; add one pure URL-lint module wired at the two live send/render exits and the social author; create the one-root sold-price resolution chain; swap the email data feed's single stale wire onto the SteadyAPI sole-spine view; resolve the 298 parked duplicate rows.

**Tech Stack:** TypeScript (Next.js App Router, bun:test), one SQL migration via the existing `scripts/run-migration.ts` runner. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-02-invention-surface-guards-design.md` · **Check:** `invention_surface_guards_live_verify`

## Global Constraints

- Never invent a number; 0/null is NEVER a price. Counts may legitimately be 0.
- Listing citations say "SWFL Data Gulf" (or "Public record" for a recorded deed event) — never a vendor name, never "MLS", never "SteadyAPI".
- Dates render MM/DD/YYYY.
- `fetchSoldEvent` is a PAID call — always injectable, always mocked in tests, never called speculatively.
- Reuse the ONE tokenizer (`extractNumbers`/`normalizeNumber` from `lib/deliverable/narrative-lint.ts`) — never fork a number regex.
- All signature changes are additive (optional trailing params) — existing tests must pass unchanged.
- Verify with `bunx next build`, never bare `npx tsc`.
- Commit after each task with explicit paths (`git add <paths>` — NEVER `git add -A`). Do NOT push — operator pushes.
- Disclosure copy, verbatim: `Last listed at $X; closing price not yet recorded.`

---

### Task 1: Sold-price resolution chain (one root)

**Files:**
- Create: `lib/listings/sold-price.ts`
- Test: `lib/listings/sold-price.test.ts`

**Interfaces:**
- Consumes: `fetchSoldEvent`, `SoldEvent` from `lib/listings/steadyapi.ts` (`fetchSoldEvent(propertyId: string, deps?: { fetchImpl?: typeof fetch }): Promise<SoldEvent | null>`; `SoldEvent = { soldPrice: number; soldDate: string }`).
- Produces: `resolveSoldPrice(input: SoldPriceInput, deps?): Promise<SoldPriceDisplay | null>` — the ONLY function any surface may use to turn a sold/close price into display copy. Waves 4/6 bind their sold slots through this.

- [ ] **Step 1: Write the failing test**

```ts
// lib/listings/sold-price.test.ts
import { describe, expect, test } from "bun:test";
import { resolveSoldPrice } from "./sold-price";

const noFetch = { fetchSold: () => Promise.reject(new Error("must not be called")) };

describe("resolveSoldPrice — lane 1: lake sold price", () => {
  test("nonzero lake sold price wins, no live call", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 14_800_000, soldDate: "2026-06-15", lastListPrice: 15_000_000 },
      noFetch,
    );
    expect(out).toEqual({
      kind: "sold",
      value: 14_800_000,
      asOf: "06/15/2026",
      source: "SWFL Data Gulf",
    });
  });

  test("a 0 sold price is MISSING, never a value", async () => {
    const out = await resolveSoldPrice({ soldPrice: 0, lastListPrice: 500_000 }, noFetch);
    expect(out?.kind).toBe("last_list");
  });
});

describe("resolveSoldPrice — lane 2: recorded event lookup", () => {
  test("0 in lake + propertyId → recorded event fills the price", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, propertyId: "M5493101642", lastListPrice: 500_000 },
      { fetchSold: async () => ({ soldPrice: 415_000, soldDate: "2026-05-12" }) },
    );
    expect(out).toEqual({
      kind: "sold",
      value: 415_000,
      asOf: "05/12/2026",
      source: "Public record",
    });
  });

  test("lookup miss falls to last list with the disclosure", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: null, propertyId: "M1", lastListPrice: 500_000, lastListDate: "2026-04-01" },
      { fetchSold: async () => null },
    );
    expect(out).toEqual({
      kind: "last_list",
      value: 500_000,
      asOf: "04/01/2026",
      source: "SWFL Data Gulf",
      disclosure: "Last listed at $500,000; closing price not yet recorded.",
    });
  });

  test("a 0-price recorded event is also MISSING", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, propertyId: "M1", lastListPrice: 500_000 },
      { fetchSold: async () => ({ soldPrice: 0, soldDate: "2026-05-12" }) },
    );
    expect(out?.kind).toBe("last_list");
  });
});

describe("resolveSoldPrice — never 0, never invented", () => {
  test("nothing resolvable → null (caller omits the slot)", async () => {
    const out = await resolveSoldPrice({ soldPrice: 0, lastListPrice: 0 }, noFetch);
    expect(out).toBeNull();
  });

  test("negative/NaN prices are missing", async () => {
    const out = await resolveSoldPrice({ soldPrice: -5, lastListPrice: NaN }, noFetch);
    expect(out).toBeNull();
  });

  test("no propertyId → no live call, straight to last list", async () => {
    const out = await resolveSoldPrice({ soldPrice: null, lastListPrice: 100_000 }, noFetch);
    expect(out?.kind).toBe("last_list");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/sold-price.test.ts`
Expected: FAIL — `Cannot find module './sold-price'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/listings/sold-price.ts
//
// THE one root for turning a sold/close price into display copy (spec:
// invention-surface-guards §A). Resolution chain, in lane order:
//   1. Lake: a NONZERO recorded sold price we already hold.
//   2. Live recorded event: fetchSoldEvent (property tax history — a recorded
//      deed event). PAID call: injectable, fired only for a real build.
//   3. Last list price, DISCLOSED — labeled as a list price, never a sale.
// A 0/null/negative price is MISSING by definition — it never binds. If no lane
// resolves, returns null and the caller omits the slot entirely.

import { fetchSoldEvent, type SoldEvent } from "./steadyapi";

export interface SoldPriceInput {
  /** Lake value (e.g. listing_transitions.sold_price). 0 = not yet recorded. */
  soldPrice?: number | null;
  /** ISO date of the lake sold event, when held. */
  soldDate?: string | null;
  /** Internal join key for the live recorded-event lookup. NEVER surfaced. */
  propertyId?: string | null;
  lastListPrice?: number | null;
  lastListDate?: string | null;
}

export interface SoldPriceDisplay {
  kind: "sold" | "last_list";
  /** Always > 0. */
  value: number;
  /** MM/DD/YYYY when a date is held. */
  asOf?: string;
  /** "SWFL Data Gulf" | "Public record" — never a vendor name. */
  source: string;
  /** Present when kind === "last_list" — code-owned wording, model never writes it. */
  disclosure?: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function toMdY(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/** A price is a price only when finite and positive. */
function pos(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export async function resolveSoldPrice(
  input: SoldPriceInput,
  deps: { fetchSold?: (propertyId: string) => Promise<SoldEvent | null> } = {},
): Promise<SoldPriceDisplay | null> {
  if (pos(input.soldPrice)) {
    return {
      kind: "sold",
      value: input.soldPrice,
      asOf: toMdY(input.soldDate),
      source: "SWFL Data Gulf",
    };
  }

  if (input.propertyId) {
    const fetchSold = deps.fetchSold ?? fetchSoldEvent;
    const ev = await fetchSold(input.propertyId).catch(() => null);
    if (ev && pos(ev.soldPrice)) {
      return { kind: "sold", value: ev.soldPrice, asOf: toMdY(ev.soldDate), source: "Public record" };
    }
  }

  if (pos(input.lastListPrice)) {
    return {
      kind: "last_list",
      value: input.lastListPrice,
      asOf: toMdY(input.lastListDate),
      source: "SWFL Data Gulf",
      disclosure: `Last listed at ${usd(input.lastListPrice)}; closing price not yet recorded.`,
    };
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings/sold-price.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/listings/sold-price.ts lib/listings/sold-price.test.ts
git commit -m "feat(listings): sold-price resolution chain - lake, recorded event, disclosed last-list; 0 never binds"
```

---

### Task 2: Recorded-claim gate in the narrative lint

**Files:**
- Modify: `lib/deliverable/narrative-lint.ts`
- Test: `lib/deliverable/narrative-lint.test.ts` (append)

**Interfaces:**
- Produces: `RECORDED_CLAIM_RE`, `RECORDED_LABEL_RE` (exported consts); `Gate` union gains `"recorded"`; `lintDeliverableNarrative(narrative, snapshotNumbers, recordedNumbers?: ReadonlyArray<string | number>)` — third param optional/additive.

- [ ] **Step 1: Write the failing tests (append to the existing test file)**

```ts
// append to lib/deliverable/narrative-lint.test.ts
import { RECORDED_CLAIM_RE, RECORDED_LABEL_RE } from "./narrative-lint";
// (lintDeliverableNarrative is already imported at the top of this file)

describe("recorded-claim gate", () => {
  const nar = (intro: string) => ({
    exec_summary: intro,
    sections: [],
    inference_notes: [],
  });

  test("'sold for $X' where X anchors only to a LIST price is a violation", () => {
    const r = lintDeliverableNarrative(
      nar("The property sold for $14,800,000 last month."),
      ["$14,800,000"], // list price IS in the snapshot…
      [],              // …but nothing recorded
    );
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.gate === "recorded")).toBe(true);
    expect(r.stripped.exec_summary).toBe("");
  });

  test("'sold for $X' anchored to a recorded item passes", () => {
    const r = lintDeliverableNarrative(
      nar("The property sold for $415,000."),
      ["$415,000"],
      ["Recorded sold price: $415,000"],
    );
    expect(r.violations.filter((v) => v.gate === "recorded")).toEqual([]);
  });

  test("aggregate 'median sale price' figures pass when the item label marks them", () => {
    const r = lintDeliverableNarrative(
      nar("The median sale price in Lee County is $389,000."),
      ["$389,000"],
      ["Lee County median sale price: $389,000"],
    );
    expect(r.violations.filter((v) => v.gate === "recorded")).toEqual([]);
  });

  test("a sold COUNT sentence is not a price claim", () => {
    const r = lintDeliverableNarrative(
      nar("127 homes changed hands in June."),
      ["127"],
      [],
    );
    expect(r.violations.filter((v) => v.gate === "recorded")).toEqual([]);
  });

  test("omitting the third param changes nothing (backward compat)", () => {
    const r = lintDeliverableNarrative(nar("Rents hit $2,150."), ["$2,150"]);
    expect(r.ok).toBe(true);
  });
});

describe("recorded regexes", () => {
  test("claim patterns", () => {
    expect(RECORDED_CLAIM_RE.test("it sold for $1")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("closed at $1")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("the sale price of")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("closing price was")).toBe(true);
    expect(RECORDED_CLAIM_RE.test("listed at $1")).toBe(false);
  });
  test("label patterns", () => {
    expect(RECORDED_LABEL_RE.test("Recorded sold price")).toBe(true);
    expect(RECORDED_LABEL_RE.test("Lee County median sale price")).toBe(true);
    expect(RECORDED_LABEL_RE.test("Median list price")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bun test lib/deliverable/narrative-lint.test.ts`
Expected: FAIL — `RECORDED_CLAIM_RE` not exported

- [ ] **Step 3: Implement in `lib/deliverable/narrative-lint.ts`**

3a. Extend the `Gate` union (find the existing line):

```ts
export type Gate = "number" | "smoothing" | "grounded" | "jargon" | "ttl" | "recorded";
```

3b. Add the two regexes near the other gate patterns (after `LEXICAL_NUMBER_RE`):

```ts
// [SPEC invention-surface-guards §B] A recorded-sale PRICE claim in prose. The
// number gate proves a digit exists in the payload; THIS gate proves the digit is
// wearing the right label — "sold for $14.8M" must anchor to a recorded/sold item,
// not to the list price. Count phrasing ("127 homes sold") carries no price verb
// and does not match.
export const RECORDED_CLAIM_RE =
  /\b(?:sold\s+(?:for|at)|closed\s+(?:at|for)|closing\s+price|sales?\s+price|went\s+for|fetched)\b/i;

// An item LABEL that marks its value as a recorded/sold figure. Aggregate stats
// ("median sale price") qualify — their label carries the word.
export const RECORDED_LABEL_RE = /\b(?:sold|sale|sales|closed|closing|recorded)\b/i;
```

3c. In `interface GateOpts` add the recorded anchor set:

```ts
interface GateOpts {
  numbers: boolean; // apply the exact-number gate
  forecast: boolean; // apply the fact-prose forecast gate
  /** Recorded-sale anchor set — when present, RECORDED_CLAIM_RE sentences must
   *  anchor every number here, not merely in the general anchor set. */
  recorded?: ReadonlySet<string>;
}
```

3d. In `lintFactText`, after the existing `opts.numbers` block (inside the sentence loop, before the smoothing loop), add:

```ts
    if (opts.recorded && RECORDED_CLAIM_RE.test(sentence)) {
      for (const token of extractNumbers(sentence)) {
        if (isBareYear(token) && yearHasTemporalContext(sentence, token)) continue;
        if (!anchorsExactly(token, opts.recorded)) {
          sentenceViolations.push({
            gate: "recorded",
            location,
            sectionIndex,
            token: token.trim(),
            sentence,
            reason: `sentence claims a recorded sale, but ${token.trim()} does not come from a sold/closed/recorded item`,
          });
        }
      }
    }
```

3e. Extend `lintDeliverableNarrative`'s signature and thread the set into every `lintFactText` call:

```ts
export function lintDeliverableNarrative(
  narrative: Narrative,
  snapshotNumbers: ReadonlyArray<string | number>,
  recordedNumbers: ReadonlyArray<string | number> = [],
): NarrativeLintResult {
  const anchors = buildAnchorSet(snapshotNumbers);
  const recorded = buildAnchorSet(recordedNumbers);
```

…and change the three `lintFactText(...)` option objects (exec, title, intro) from
`{ numbers: true, forecast: true }` to `{ numbers: true, forecast: true, recorded }`.
inference_notes stay exempt (projections; falsifier-governed).

- [ ] **Step 4: Run to verify pass — including the untouched existing tests**

Run: `bun test lib/deliverable/narrative-lint.test.ts lib/deliverable/narrative-lint-ttl.test.ts`
Expected: PASS, zero failures

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/narrative-lint.ts lib/deliverable/narrative-lint.test.ts
git commit -m "feat(deliverable): recorded-claim gate - a 'sold for' figure must anchor to a recorded item"
```

---

### Task 3: Thread recorded anchors through the deliverable build

**Files:**
- Modify: `lib/deliverable/build.ts`
- Test: `lib/deliverable/gate-narrative.test.ts` (append)

**Interfaces:**
- Consumes: `RECORDED_LABEL_RE` from Task 2.
- Produces: `collectRecordedNumbers(items: SnapshotItem[]): string[]` (exported from `build.ts`); `gateNarrative(narrative, anchors, verdicts, ttlGate, recordedNumbers?: ReadonlyArray<string | number>)` — fifth param optional/additive.

- [ ] **Step 1: Write the failing test (append to `gate-narrative.test.ts`)**

```ts
// append to lib/deliverable/gate-narrative.test.ts
import { collectRecordedNumbers } from "./build";
// (gateNarrative is already imported at the top of this file)

describe("recorded anchors through gateNarrative", () => {
  const metric = (label: string, value: string) =>
    ({ kind: "metric", id: "m1", added_at: "", origin: "user", label, value }) as never;

  test("collectRecordedNumbers picks only recorded-labeled items", () => {
    const items = [
      metric("Median list price", "$15,000,000"),
      metric("Recorded sold price", "$415,000"),
    ];
    const out = collectRecordedNumbers(items as never[]);
    expect(out).toContain("$415,000");
    expect(out).not.toContain("$15,000,000");
  });

  test("gateNarrative flags a list price dressed as a sale", () => {
    const narrative = {
      exec_summary: "It sold for $15,000,000.",
      sections: [],
      inference_notes: [],
    };
    const gate = gateNarrative(narrative, ["$15,000,000"], [], false, []);
    expect(gate.ok).toBe(false);
    expect(gate.violations.some((v) => v.gate === "recorded")).toBe(true);
  });

  test("four-arg calls keep working (backward compat)", () => {
    const narrative = { exec_summary: "Rents hit $2,150.", sections: [], inference_notes: [] };
    expect(gateNarrative(narrative, ["$2,150"], [], false).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/deliverable/gate-narrative.test.ts`
Expected: FAIL — `collectRecordedNumbers` not exported

- [ ] **Step 3: Implement in `lib/deliverable/build.ts`**

3a. Add `RECORDED_LABEL_RE` to the existing import from `./narrative-lint`.

3b. Add after `collectSnapshotNumbers`:

```ts
/** Values from items whose LABEL marks them recorded/sold/closed — the anchor set
 *  the recorded-claim gate checks "sold for $X" sentences against. */
export function collectRecordedNumbers(items: SnapshotItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.kind === "metric" && RECORDED_LABEL_RE.test(item.label)) {
      out.push(item.value, item.label);
    } else if (item.kind === "qa" && RECORDED_LABEL_RE.test(item.question)) {
      out.push(item.answer);
      if (item.fact) out.push(item.fact);
    }
  }
  return out;
}
```

3c. Extend `gateNarrative` (additive fifth param) and pass through:

```ts
export function gateNarrative(
  narrative: Narrative,
  anchors: ReadonlyArray<string | number>,
  verdicts: ReconciliationVerdict[],
  ttlGate: boolean,
  recordedNumbers: ReadonlyArray<string | number> = [],
): { ok: boolean; violations: NarrativeViolation[]; stripped: Narrative } {
  const lint = lintDeliverableNarrative(narrative, anchors, recordedNumbers);
```

(the rest of the function body is unchanged)

3d. In `buildDeliverableNarrative`, compute once and pass at BOTH gate calls:

```ts
  const anchors = collectSnapshotNumbers(items);
  const recordedNumbers = collectRecordedNumbers(items);
```

…and change both `gateNarrative(narrative, anchors, verdicts, ttlGate)` calls to
`gateNarrative(narrative, anchors, verdicts, ttlGate, recordedNumbers)`.

3e. In `describeViolations`, add before the `ttl` block:

```ts
  const recorded = [
    ...new Set(violations.filter((v) => v.gate === "recorded").map((v) => v.sentence)),
  ];
  if (recorded.length)
    lines.push(
      `- These sentences claim a recorded sale, but the figure is not from a sold/closed/recorded item — reword as a list-price fact or drop the claim: ${recorded.map((s) => `"${s}"`).join("; ")}`,
    );
```

- [ ] **Step 4: Run the deliverable suite**

Run: `bun test lib/deliverable/`
Expected: PASS, zero failures

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/build.ts lib/deliverable/gate-narrative.test.ts
git commit -m "feat(deliverable): thread recorded anchors through gateNarrative + name violations on retry"
```

---

### Task 4: Recorded-claim gate on the email author

**Files:**
- Modify: `lib/email/author-doc.ts`, `lib/email/build-doc.ts:617,673,685`
- Test: `lib/email/author-doc.test.ts` (append)

**Interfaces:**
- Consumes: `RECORDED_CLAIM_RE`, `RECORDED_LABEL_RE` from Task 2; `MarketFigure` (has `.label`, `.value`, `.source`).
- Produces: `collectRecordedAnchors(figures: MarketFigure[]): string[]` (exported from `author-doc.ts`); `lintAuthoredProse(doc, anchorStrings, recordedStrings?: ReadonlyArray<string | number>)` — third param optional/additive.

- [ ] **Step 1: Write the failing test (append to `lib/email/author-doc.test.ts`)**

```ts
// append to lib/email/author-doc.test.ts
import { collectRecordedAnchors } from "./author-doc";
// (lintAuthoredProse is already imported at the top of this file)

describe("author recorded-claim gate", () => {
  const docWith = (body: string) =>
    ({
      globalStyle: { backdropColor: "#fff" },
      blocks: [{ id: "b1", type: "text", props: { body } }],
    }) as never;

  test("collectRecordedAnchors keeps only recorded-labeled figures", () => {
    const figures = [
      { key: "median_list", label: "Median list price", value: "$650,000", source: "SWFL Data Gulf" },
      { key: "county_sale", label: "Lee County median sale price", value: "$389,000", source: "Redfin" },
    ] as never[];
    const out = collectRecordedAnchors(figures as never);
    expect(out).toContain("$389,000");
    expect(out).not.toContain("$650,000");
  });

  test("'sold for' a list-price figure is stripped", () => {
    const r = lintAuthoredProse(docWith("This home sold for $650,000."), ["$650,000"], []);
    expect(r.ok).toBe(false);
    expect(r.offending).toContain("This home sold for $650,000.");
  });

  test("'median sale price' quoting the recorded-labeled figure passes", () => {
    const r = lintAuthoredProse(
      docWith("The median sale price is $389,000."),
      ["$389,000"],
      ["Lee County median sale price: $389,000"],
    );
    expect(r.ok).toBe(true);
  });

  test("two-arg calls keep working (backward compat)", () => {
    const r = lintAuthoredProse(docWith("Rents hit $2,150."), ["$2,150"]);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/author-doc.test.ts`
Expected: FAIL — `collectRecordedAnchors` not exported

- [ ] **Step 3: Implement**

3a. In `author-doc.ts`, extend the import from `@/lib/deliverable/narrative-lint`:

```ts
import {
  extractNumbers,
  normalizeNumber,
  anchorsExactly,
  RECORDED_CLAIM_RE,
  RECORDED_LABEL_RE,
} from "@/lib/deliverable/narrative-lint";
```

3b. Add beside `collectAnchorNumbers`:

```ts
/** Figures whose LABEL marks them recorded/sold — what "sold for $X" prose may cite. */
export function collectRecordedAnchors(figures: MarketFigure[]): string[] {
  const out: string[] = [];
  for (const f of figures) {
    if (RECORDED_LABEL_RE.test(f.label)) {
      out.push(f.value);
      if (f.label) out.push(f.label);
    }
  }
  return out;
}
```

3c. Extend `lintAuthoredProse` — signature plus the recorded check inside `lintField`:

```ts
export function lintAuthoredProse(
  doc: EmailDoc,
  anchorStrings: ReadonlyArray<string | number>,
  recordedStrings: ReadonlyArray<string | number> = [],
): ProseLintResult {
  const anchors = buildAnchorSet(anchorStrings);
  const recorded = buildAnchorSet(recordedStrings);
  const offending: string[] = [];

  const lintField = (text: string): string => {
    const kept: string[] = [];
    for (const sentence of splitSentences(text)) {
      let bad = false;
      for (const tok of extractNumbers(sentence)) {
        if (isBareYear(tok)) continue;
        if (!anchorsExactly(tok, anchors)) {
          bad = true;
          break;
        }
        // Anchored generally — but a recorded-sale CLAIM must anchor recorded.
        if (RECORDED_CLAIM_RE.test(sentence) && !anchorsExactly(tok, recorded)) {
          bad = true;
          break;
        }
      }
      if (bad) offending.push(sentence);
      else kept.push(sentence);
    }
    return kept.join(" ");
  };
```

(the rest of the function body is unchanged)

3d. In `build-doc.ts`, add `collectRecordedAnchors` to the import from `@/lib/email/author-doc`, then at line ~617:

```ts
  const anchorStrings = collectAnchorNumbers(lakeParts.figures, chartGroundingNumbers);
  const recordedStrings = collectRecordedAnchors(lakeParts.figures);
```

…and pass `recordedStrings` as the third arg at BOTH call sites:
line ~673 `lintAuthoredProse(doc, anchorStrings, recordedStrings)` and
line ~685 `lintAuthoredProse(reparse2.data, anchorStrings, recordedStrings)`.

- [ ] **Step 4: Run the email suite**

Run: `bun test lib/email/author-doc.test.ts && bunx next build`
Expected: tests PASS; build compiles

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-doc.ts lib/email/build-doc.ts lib/email/author-doc.test.ts
git commit -m "feat(email): recorded-claim gate on authored prose - sold-for needs a recorded figure"
```

---

### Task 5: URL lint module (pure)

**Files:**
- Create: `lib/deliverable/url-lint.ts`
- Test: `lib/deliverable/url-lint.test.ts`

**Interfaces:**
- Produces:
  - `collectAllowedUrls(...roots: unknown[]): Set<string>` — deep-walks any objects, harvests every http(s) URL string.
  - `lintCompiledHtml(html: string, allowed: ReadonlySet<string>): { ok: boolean; violations: { attr: "href" | "src"; url: string }[]; stripped: string }`
  - `lintTextUrls(text: string, allowed: ReadonlySet<string>): { ok: boolean; violations: string[]; stripped: string }`

- [ ] **Step 1: Write the failing test**

```ts
// lib/deliverable/url-lint.test.ts
import { describe, expect, test } from "bun:test";
import { collectAllowedUrls, lintCompiledHtml, lintTextUrls } from "./url-lint";

describe("collectAllowedUrls", () => {
  test("harvests URLs from nested objects, arrays, and inside longer strings", () => {
    const allowed = collectAllowedUrls(
      { blocks: [{ props: { url: "https://cdn.example.com/p.jpg" } }] },
      { note: "see https://feed.example.com/listing/123 for detail" },
      "https://client-site.com/465-gordonia",
    );
    expect(allowed.has("https://cdn.example.com/p.jpg")).toBe(true);
    expect(allowed.has("https://feed.example.com/listing/123")).toBe(true);
    expect(allowed.has("https://client-site.com/465-gordonia")).toBe(true);
  });
});

describe("lintCompiledHtml", () => {
  const allowed = collectAllowedUrls({ photo: "https://cdn.example.com/p.jpg" });

  test("verbatim payload URL passes; platform, relative, mailto pass by rule", () => {
    const html =
      `<a href="https://cdn.example.com/p.jpg">photo</a>` +
      `<a href="https://www.swfldatagulf.com/p/abc">report</a>` +
      `<a href="/api/unsubscribe?id=1">unsub</a>` +
      `<a href="mailto:agent@example.com">mail</a>`;
    const r = lintCompiledHtml(html, allowed);
    expect(r.ok).toBe(true);
    expect(r.stripped).toBe(html);
  });

  test("a minted href is a violation; the anchor is unwrapped, text kept", () => {
    const html = `<p>See <a href="https://www.realtor.com/M5493101642">the listing</a> today.</p>`;
    const r = lintCompiledHtml(html, allowed);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual([{ attr: "href", url: "https://www.realtor.com/M5493101642" }]);
    expect(r.stripped).toBe(`<p>See the listing today.</p>`);
  });

  test("a minted img src removes the img tag", () => {
    const html = `<div><img src="https://ap.rdcpix.com/x-w2048.jpg" alt="p"/></div>`;
    const r = lintCompiledHtml(html, allowed);
    expect(r.ok).toBe(false);
    expect(r.stripped).toBe(`<div></div>`);
  });

  test("HTML-escaped ampersands match their raw allowed URL", () => {
    const allowed2 = collectAllowedUrls("https://cdn.example.com/p.jpg?a=1&b=2");
    const html = `<img src="https://cdn.example.com/p.jpg?a=1&amp;b=2"/>`;
    expect(lintCompiledHtml(html, allowed2).ok).toBe(true);
  });
});

describe("lintTextUrls (captions)", () => {
  test("bare minted URL in a caption is stripped and reported", () => {
    const allowed = collectAllowedUrls("https://client-site.com/listing");
    const r = lintTextUrls(
      "Tour it: https://www.realtor.com/M123 or https://client-site.com/listing",
      allowed,
    );
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(["https://www.realtor.com/M123"]);
    expect(r.stripped).toBe("Tour it:  or https://client-site.com/listing");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/deliverable/url-lint.test.ts`
Expected: FAIL — `Cannot find module './url-lint'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/deliverable/url-lint.ts
//
// The fake-link tripwire (spec: invention-surface-guards §C). Every href/src in
// compiled customer output must appear VERBATIM in the allowed set — payload,
// brand record, or user input — because a constructed URL one character off 404s
// and nothing can prove it live at build time. Outside anchor: OWASP LLM05:2025
// Improper Output Handling (allowlist-validate model output before downstream use).
//
// PURE — no I/O. Callers assemble the allowed set from what they hold:
//   interactive render → strip + warn;  unattended send → fail the build.

export interface UrlViolation {
  attr: "href" | "src";
  url: string;
}

export interface HtmlUrlLintResult {
  ok: boolean;
  violations: UrlViolation[];
  stripped: string;
}

export interface TextUrlLintResult {
  ok: boolean;
  violations: string[];
  stripped: string;
}

/** Hosts we own — compiled-in links (view-online, unsubscribe) are allowed by host. */
const PLATFORM_HOSTS = new Set(["swfldatagulf.com", "www.swfldatagulf.com"]);

/** Schemes that carry no fetchable claim to mint. */
const SAFE_SCHEME_RE = /^(?:mailto:|tel:|data:)/i;

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>()\][]+/g;

/** Minimal entity decode for attribute values our own renderer escaped. */
function decodeAttr(v: string): string {
  return v
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deep-walk any values and harvest every http(s) URL string (whole strings and
 *  URLs embedded in longer strings). Cycle-safe. */
export function collectAllowedUrls(...roots: unknown[]): Set<string> {
  const out = new Set<string>();
  const seen = new Set<object>();
  const stack: unknown[] = [...roots];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === "string") {
      if (v.startsWith("http://") || v.startsWith("https://")) out.add(v.trim());
      for (const m of v.match(URL_IN_TEXT_RE) ?? []) out.add(m);
    } else if (Array.isArray(v)) {
      stack.push(...v);
    } else if (v && typeof v === "object") {
      if (seen.has(v)) continue;
      seen.add(v);
      stack.push(...Object.values(v));
    }
  }
  return out;
}

function isAllowedUrl(url: string, allowed: ReadonlySet<string>): boolean {
  const u = url.trim();
  if (u === "" || u.startsWith("/") || u.startsWith("#")) return true; // ours by construction
  if (SAFE_SCHEME_RE.test(u)) return true;
  if (allowed.has(u)) return true;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (PLATFORM_HOSTS.has(host)) return true;
  } catch {
    return false; // unparseable absolute-ish URL → not allowed
  }
  return false;
}

/**
 * Lint every href/src attribute in compiled HTML. `stripped` unwraps a violating
 * <a> (inner content kept) and removes a violating <img> entirely.
 * Our renderers emit quoted attributes, so an attribute regex is sound here.
 */
export function lintCompiledHtml(
  html: string,
  allowed: ReadonlySet<string>,
): HtmlUrlLintResult {
  const violations: UrlViolation[] = [];
  const attrRe = /\b(href|src)\s*=\s*"([^"]*)"/gi;
  const badRaw: { attr: "href" | "src"; raw: string }[] = [];
  for (const m of html.matchAll(attrRe)) {
    const attr = m[1].toLowerCase() as "href" | "src";
    const url = decodeAttr(m[2]);
    if (!isAllowedUrl(url, allowed)) {
      violations.push({ attr, url });
      badRaw.push({ attr, raw: m[2] });
    }
  }
  let stripped = html;
  for (const { attr, raw } of badRaw) {
    const rawRe = escapeRe(raw);
    if (attr === "href") {
      // Unwrap the anchor, keep its inner content.
      stripped = stripped.replace(
        new RegExp(`<a\\b[^>]*href\\s*=\\s*"${rawRe}"[^>]*>([\\s\\S]*?)</a>`, "gi"),
        "$1",
      );
    } else {
      stripped = stripped.replace(
        new RegExp(`<img\\b[^>]*src\\s*=\\s*"${rawRe}"[^>]*/?>`, "gi"),
        "",
      );
    }
  }
  return { ok: violations.length === 0, violations, stripped };
}

/** Lint bare URLs in plain text (social captions, variants). */
export function lintTextUrls(text: string, allowed: ReadonlySet<string>): TextUrlLintResult {
  const violations: string[] = [];
  const stripped = text.replace(URL_IN_TEXT_RE, (m) => {
    if (isAllowedUrl(m, allowed)) return m;
    violations.push(m);
    return "";
  });
  return { ok: violations.length === 0, violations, stripped };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test lib/deliverable/url-lint.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/url-lint.ts lib/deliverable/url-lint.test.ts
git commit -m "feat(deliverable): URL allowlist lint - href/src must be verbatim payload/brand/user input"
```

---

### Task 6: Wire the URL lint at the send/render/author exits

**Files:**
- Modify: `app/api/deliverables/[id]/blast/route.ts` (after `baseHtml` is built, ~line 164)
- Modify: `app/api/email-lab/render/route.ts` (block-canvas branch, ~line 36)
- Modify: `lib/social/design/author.ts` (after `tryParseSocialAuthor`, ~line 246)

**Interfaces:**
- Consumes: `lintCompiledHtml`, `lintTextUrls`, `collectAllowedUrls` from Task 5; `buildVariants` (existing).
- Produces: blast route returns 422 `{ error: "url_violation", violations }` on a minted URL (unattended = hard fail); render route returns `{ html, url_warnings? }` with stripped html (interactive = strip + warn); social author caption/variants are URL-stripped before return.

- [ ] **Step 1: Blast route (hard fail).** Add the import:

```ts
import { lintCompiledHtml, collectAllowedUrls } from "@/lib/deliverable/url-lint";
```

After the `if/else` that assigns `baseHtml` (immediately after line ~164, before the sender block), insert:

```ts
  // Fake-link tripwire (unattended send = hard fail): every href/src in the
  // compiled email must be verbatim from the deliverable's own content (doc/
  // snapshot/branding) or a platform link. A minted URL never ships.
  const allowedUrls = collectAllowedUrls(
    deliverable.doc,
    deliverable.items_snapshot,
    deliverable.narrative,
    deliverable.branding,
    webUrl,
  );
  const urlGate = lintCompiledHtml(baseHtml, allowedUrls);
  if (!urlGate.ok) {
    return NextResponse.json(
      { error: "url_violation", violations: urlGate.violations },
      { status: 422 },
    );
  }
```

- [ ] **Step 2: Render route (strip + warn).** Add the import:

```ts
import { lintCompiledHtml, collectAllowedUrls } from "@/lib/deliverable/url-lint";
```

Replace the block-canvas return (lines ~33–36):

```ts
    const html = isGridDoc(parsed.data.blocks)
      ? await compileGrid(parsed.data)
      : await render(EmailDocEmail({ doc: parsed.data }));
    // Fake-link tripwire (interactive = strip + warn, never block an edit).
    const urlGate = lintCompiledHtml(html, collectAllowedUrls(parsed.data));
    return NextResponse.json({
      html: urlGate.stripped,
      ...(urlGate.ok ? {} : { url_warnings: urlGate.violations }),
    });
```

- [ ] **Step 3: Social author (strip minted URLs from caption + variants).** In `lib/social/design/author.ts` add the import:

```ts
import { lintTextUrls, collectAllowedUrls } from "@/lib/deliverable/url-lint";
```

In `authorSocialPost`, after `if (!template) return null;` insert:

```ts
    // Fake-link tripwire: the model may cite only URLs it was handed — verified
    // web sources, the real listing, the brand record. Anything else is stripped.
    const allowedUrls = collectAllowedUrls(fresh.web.verified, featured ?? {}, opts?.branding ?? {});
    const captionGate = lintTextUrls(parsed.caption, allowedUrls);
    const cleanVariants: typeof parsed.variants = {};
    for (const [p, v] of Object.entries(parsed.variants)) {
      cleanVariants[p as keyof typeof parsed.variants] = lintTextUrls(v as string, allowedUrls).stripped;
    }
```

…then change the two uses below: `buildVariants(parsed.caption, parsed.variants, opts.platforms)` → `buildVariants(captionGate.stripped, cleanVariants, opts.platforms)`; `caption: parsed.caption` → `caption: captionGate.stripped`; and the non-platform branch `: parsed.variants` → `: cleanVariants`.

- [ ] **Step 4: Verify**

Run: `bun test lib/social/ lib/deliverable/ && bunx next build`
Expected: existing suites PASS; build compiles

- [ ] **Step 5: Commit**

```bash
git add app/api/deliverables/[id]/blast/route.ts app/api/email-lab/render/route.ts lib/social/design/author.ts
git commit -m "feat: wire URL tripwire - blast hard-fails, lab render strips+warns, social captions stripped"
```

---

### Task 7: Sole-spine rewire + mixed-source tripwire

**Files:**
- Modify: `lib/email/market-context.ts` (view swap at :116, labels, price>0 guards, `singleSourcePerMetric`)
- Create: `lib/email/sole-spine.test.ts`
- Test: `lib/email/market-context.test.ts` (create — pure functions only)

**Interfaces:**
- Produces: `singleSourcePerMetric(figs: MarketFigure[]): { figures: MarketFigure[]; discrepancies: { key: string; sources: string[] }[] }` (exported). `loadMarketFigures` output shape unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/email/market-context.test.ts
import { describe, expect, test } from "bun:test";
import { singleSourcePerMetric, type MarketFigure } from "./market-context";

const fig = (key: string, value: string, source: string): MarketFigure => ({
  key,
  label: key,
  value,
  source,
});

describe("singleSourcePerMetric", () => {
  test("clean figures pass through untouched", () => {
    const figs = [fig("active", "495", "SWFL Data Gulf"), fig("rent", "$2,150", "Zillow ZORI")];
    const r = singleSourcePerMetric(figs);
    expect(r.figures).toEqual(figs);
    expect(r.discrepancies).toEqual([]);
  });

  test("same metric from two sources: first ships, second recorded as discrepancy", () => {
    const r = singleSourcePerMetric([
      fig("active", "495", "SWFL Data Gulf"),
      fig("active", "92", "MLS active-listings"),
    ]);
    expect(r.figures).toEqual([fig("active", "495", "SWFL Data Gulf")]);
    expect(r.discrepancies).toEqual([
      { key: "active", sources: ["SWFL Data Gulf", "MLS active-listings"] },
    ]);
  });
});
```

```ts
// lib/email/sole-spine.test.ts
//
// Regression tripwire (spec: invention-surface-guards §D): SteadyAPI is the SOLE
// listings source. No artifact surface may reference the dead scrape view again.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["lib/email", "lib/social", "lib/deliverable", "lib/listings"];
const DEAD_VIEW = "active_listings_residential";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("sole spine", () => {
  test("no artifact surface reads the dead scrape view", () => {
    const offenders = ROOTS.flatMap(walk).filter((f) =>
      readFileSync(f, "utf8").includes(DEAD_VIEW),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify the right failures**

Run: `bun test lib/email/market-context.test.ts lib/email/sole-spine.test.ts`
Expected: market-context test FAILS (`singleSourcePerMetric` not exported); sole-spine FAILS naming `lib/email/market-context.ts` as the offender

- [ ] **Step 3: Implement in `lib/email/market-context.ts`**

3a. The rewire — in `zipFigures`, change the third query (line ~116):

```ts
      .from("listing_active_stats")
```

(same columns — `listing_count, median_list_price, avg_days_on_market, latest_scraped_at, county` all exist on the spine view; `avg_days_on_market` is intentionally NULL until real DOM lands, so the DOM figure self-omits.)

3b. Labels — in the same block, all three `source: "MLS active-listings"` become `source: "SWFL Data Gulf"`.

3c. Price guards — a 0 price is missing, never a figure. Change these conditions (counts and YoY percentages keep 0 as legitimate):

```ts
      if (hv != null && hv > 0)      // home_value
      if (r != null && r > 0)        // rent
      if (ml != null && ml > 0)      // median_list
      if (ms != null && ms > 0)      // county_sale
      if (inc != null && inc > 0)    // income
```

3d. The mixed-source tripwire — add near the bottom, above `loadMarketFigures`:

```ts
export interface SourceDiscrepancy {
  key: string;
  sources: string[];
}

/** One source tag per metric per artifact (spec: invention-surface-guards §D).
 *  The first source wins; a second source for the same key is dropped from the
 *  customer artifact and returned as a discrepancy for the operator log. */
export function singleSourcePerMetric(figs: MarketFigure[]): {
  figures: MarketFigure[];
  discrepancies: SourceDiscrepancy[];
} {
  const firstSource = new Map<string, string>();
  const figures: MarketFigure[] = [];
  const disc = new Map<string, Set<string>>();
  for (const f of figs) {
    const prior = firstSource.get(f.key);
    if (prior === undefined) {
      firstSource.set(f.key, f.source);
      figures.push(f);
    } else if (prior === f.source) {
      figures.push(f);
    } else {
      if (!disc.has(f.key)) disc.set(f.key, new Set([prior]));
      disc.get(f.key)!.add(f.source);
    }
  }
  return {
    figures,
    discrepancies: [...disc.entries()].map(([key, s]) => ({ key, sources: [...s] })),
  };
}
```

3e. Enforce at the assembly point — in `loadMarketFigures`, replace the final `return figs;`:

```ts
  const { figures, discrepancies } = singleSourcePerMetric(figs);
  if (discrepancies.length > 0) {
    // Operator-facing record; never reaches the customer artifact.
    console.warn(
      "[market-context] one-source-per-metric tripwire:",
      JSON.stringify(discrepancies),
    );
  }
  return figures;
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test lib/email/market-context.test.ts lib/email/sole-spine.test.ts && bunx next build`
Expected: both PASS (sole-spine now finds zero offenders); build compiles

- [ ] **Step 5: Commit**

```bash
git add lib/email/market-context.ts lib/email/market-context.test.ts lib/email/sole-spine.test.ts
git commit -m "feat(email): rewire data feed onto the sole spine + one-source-per-metric tripwire + 0-price guards"
```

---

### Task 8: Resolve the 298 parked duplicate rows

**Files:**
- Create: `migrations/20260702_resolve_lifecycle_seed_stragglers.sql`
- Run via: `bun scripts/run-migration.ts` (existing runner; creds from `.dlt/secrets.toml`, `sslmode=require`)

**Interfaces:**
- Consumes: `data_lake.listing_state` — MERGE identity `(source_name, address_key, sale_or_rent)`; `first_seen` is SQL-managed.
- Produces: `lifecycle_seed` rows with an `api_feed` twin are merged (earliest `first_seen` preserved) and deleted. Twinless leftovers are UNTOUCHED and reported.

**⚠️ RULE 1: this deletes rows in `data_lake.*` — show the operator the counts and get an explicit go before Step 3.**

- [ ] **Step 1: Write the migration**

```sql
-- migrations/20260702_resolve_lifecycle_seed_stragglers.sql
--
-- invention-surface-guards §E: the 298 rows still tagged lifecycle_seed are the
-- catch-up's parked address-key collisions — each has (by construction) an
-- api_feed twin on (address_key, sale_or_rent). Merge what the twin lacks
-- (earliest first_seen), then retire the seed row. IDEMPOTENT: a second run
-- matches zero rows. Twinless leftovers (expected 0) are left untouched.

BEGIN;

-- 1. Preserve the earliest first-seen date on the surviving spine row.
UPDATE data_lake.listing_state api
SET first_seen = LEAST(api.first_seen, seed.first_seen)
FROM data_lake.listing_state seed
WHERE api.source_name = 'api_feed'
  AND seed.source_name = 'lifecycle_seed'
  AND seed.address_key = api.address_key
  AND seed.sale_or_rent = api.sale_or_rent;

-- 2. Retire the duplicate seed rows (ONLY where a spine twin exists).
DELETE FROM data_lake.listing_state seed
WHERE seed.source_name = 'lifecycle_seed'
  AND EXISTS (
    SELECT 1 FROM data_lake.listing_state api
    WHERE api.source_name = 'api_feed'
      AND api.address_key = seed.address_key
      AND api.sale_or_rent = seed.sale_or_rent
  );

COMMIT;
```

- [ ] **Step 2: Read the BEFORE counts and show the operator**

Query (lake MCP or any read path):

```sql
SELECT source_name, count(*) AS n FROM pg.data_lake.listing_state GROUP BY source_name;
SELECT count(*) AS twinless FROM pg.data_lake.listing_state seed
WHERE seed.source_name = 'lifecycle_seed'
  AND NOT EXISTS (SELECT 1 FROM pg.data_lake.listing_state api
    WHERE api.source_name = 'api_feed'
      AND api.address_key = seed.address_key
      AND api.sale_or_rent = seed.sale_or_rent);
```

Report both numbers (expected: ~298 seed rows; twinless expected 0). **STOP and get the operator's explicit go.**

- [ ] **Step 3: Run the migration (operator-approved)**

Run: `bun scripts/run-migration.ts migrations/20260702_resolve_lifecycle_seed_stragglers.sql`
Expected: completes without error

- [ ] **Step 4: Verify AFTER counts**

Re-run the Step 2 queries. Expected: `lifecycle_seed` count = the twinless count from before (0 if all had twins); `api_feed` count unchanged. Report any twinless leftovers to the operator by address_key — do NOT resolve them unilaterally.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260702_resolve_lifecycle_seed_stragglers.sql
git commit -m "feat(lake): resolve lifecycle_seed straggler duplicates into the api_feed spine"
```

---

### Task 9: Final gates + hold for push

**Files:**
- Modify: `SESSION_LOG.md` (new top entry), `_AUDIT_AND_ROADMAP/build-queue.md` (wave-1 line → built/pending-verify)

- [ ] **Step 1: Full test pass over every touched area**

Run: `bun test lib/deliverable/ lib/email/ lib/listings/ lib/social/`
Expected: PASS, zero failures

- [ ] **Step 2: The real compile gate**

Run: `bunx next build`
Expected: compiles clean (never bare tsc)

- [ ] **Step 3: SESSION_LOG entry + build-queue sync**

Append a top-of-file SESSION_LOG entry: what shipped (tasks 1–8), the live before/after straggler counts, what's next (operator runs `invention_surface_guards_live_verify`). Update the build-queue's wave-1 line to built-pending-live-verify. Commit both:

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs: wave-1 invention-surface-guards session log + build-queue sync"
```

- [ ] **Step 4: STOP — do not push**

Show `git log origin/main..HEAD --oneline` to the operator and wait for push approval (locked rule: never push without explicit confirmation). The live-verify check `invention_surface_guards_live_verify` stays open — it is operator-run.

---

## Observations logged during planning (NOT in scope, surface to operator)

1. `app/api/deliverables/[id]/blast/route.ts:144` renders block-canvas docs through the FREE renderer (`EmailDocEmail`) even when the doc is a positioned grid doc — the render route compiles grid docs through `compileGrid`, so a paid grid email previews compiled but BLASTS uncompiled. Likely a real bug; belongs to wave 3 (chart-PNG/compile wiring) or its own fix.
2. Email prose can still contain a minted URL as plain TEXT (not a clickable href) — the tripwire covers attributes and social captions. Text-URL linting in email prose was deliberately deferred (YAGNI) until a case appears.
3. The docs/sql copy of `listing_active_stats` (20260627) still shows the pre-cutover `source_name='lifecycle_seed'` filter; the LIVE view already returns spine counts (verified 495 = api_feed for 34108, 07/02/2026). The on-disk SQL doc is stale relative to the live definition — worth a refresh commit when someone next touches that view.
