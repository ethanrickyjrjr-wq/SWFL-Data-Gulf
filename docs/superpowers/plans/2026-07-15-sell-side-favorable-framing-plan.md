# Sell-Side Favorable Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 15 files, 3 conflict groups, keywords: refactor, architecture

**Goal:** Make the deliverable builder's sell-side recipes read as a confident, data-backed authority — leading with strength on true, sourced facts — while leaving the no-invention/claim-gate architecture, and the three story-side recipes, completely untouched.

**Architecture:** One required `positioning` field on `Recipe` closes the drift path structurally. One shared `FAVORABLE_FRAMING_POLICY` constant is pasted verbatim into exactly the three narrators whose entire job is stating facts about a property or a price (never into the two agent recipes, whose prompts carry an absolute no-numbers/no-facts constraint the block would contradict). `market-comps`'s code-authored verdict gets a direction-symmetric magnitude tier. `price-reduced` gets a new, fully-sourced chart (reusing the existing `dot-plot` frame) so the price argument is shown, not just told.

**Tech Stack:** TypeScript, Bun test runner, Anthropic SDK (`@/refinery/agents/anthropic.mts`), existing `ChartSpec`/`chartSpecToEmailImage` chart pipeline.

**Spec:** `docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md` — read it before starting; every task below cites the section it implements.

**Research (read once, cited throughout — do not re-derive):**
- `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md`
- `_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md`
- `_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md`

## Global Constraints

- **No-invention architecture is untouched.** This plan never modifies `auditClaims`, `gateNarrative`, `CLAIM_PROHIBITION`, or any banned-vocabulary regex in `lib/deliverable/claims.ts`. Every task's tests must confirm existing claim-gate tests still pass unmodified.
- **Favorable framing governs emphasis and ordering of true facts — never which facts appear.** A price cut still ships. A comp that argues against the ask still ships.
- **`FAVORABLE_FRAMING_POLICY` is pasted into exactly three call sites** — `authorListingNarrative` (`shared.ts`), `authorUnderContractNote` (`under-contract.ts`), `buildNarratorPrompt` (`market-comps.ts`) — never into `authorAreaRead` (`agent-brand-intro.ts`) or `LETTER_SYSTEM` (`agent-launch.ts`), which carry an absolute no-numbers/no-facts constraint the block would contradict.
- **Any magnitude-tiered or emphasis-scaled sentence must be direction-symmetric.** It fires identically whether a computed gap flatters the subject or not — never only when it's favorable. A tier that only sharpens language in one direction is spin, and reopens the inverted-comparison risk `market-comps.ts`'s own header incident exists to prevent.
- **As-of dates are MM/DD/YYYY, stated once** — never a raw ISO/SWFL token, per the existing house rule already enforced elsewhere in this codebase.
- **Never `git add -A`** — stage explicit paths only (CLAUDE.md RULE 1.5).
- **`bunx tsc --noEmit` and `bun test` clean before each task's commit.**

---

## Phase 1 — Positioning field, shared framing block, magnitude tier

### Task 1: Add `positioning` to the `Recipe` type and every `RECIPE_KEYS` entry

**Files:**
- 🔴 Modify: `lib/deliverable/recipes.ts:117-138` (the `Recipe` interface), and each of the 14 entries in `RECIPES` (`lib/deliverable/recipes.ts:140-349`)
- 🔴 Test: `lib/deliverable/recipes.parity.test.ts` (existing file — add to it)

**Interfaces:**
- Produces: `Recipe.positioning: "sell-side" | "story-side"`, readable by every later task via `RECIPES[key].positioning`.

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes.parity.test.ts`:

```typescript
import { RECIPE_KEYS, RECIPES } from "./recipes";

test("every recipe declares a positioning lane", () => {
  for (const key of RECIPE_KEYS) {
    expect(["sell-side", "story-side"]).toContain(RECIPES[key].positioning);
  }
});

test("positioning matches the design doc's recipe table", () => {
  const sellSide = [
    "new-listing",
    "coming-soon",
    "market-comps",
    "under-contract",
    "just-sold",
    "open-house",
    "price-reduced",
    "agent-brand-intro",
    "agent-launch",
  ];
  const storySide = ["sphere-weekly", "market-pulse", "review-reply", "social-pack", "social-cut"];
  for (const key of sellSide) expect(RECIPES[key as keyof typeof RECIPES].positioning).toBe("sell-side");
  for (const key of storySide) expect(RECIPES[key as keyof typeof RECIPES].positioning).toBe("story-side");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes.parity.test.ts`
Expected: FAIL — `positioning` does not exist on type `Recipe` (TypeScript error surfaces as a test-file compile failure under Bun).

- [ ] **Step 3: Add the field to the interface**

In `lib/deliverable/recipes.ts`, inside `export interface Recipe { ... }` (currently ending at line 138 with `target?: "email" | "social";`), add:

```typescript
  /** Which posture this recipe's prose defaults to. "sell-side" = pitches a specific
   *  property or the agent's own brand/track record; "story-side" = recurring
   *  relationship/informational content with no single sale or brand pitch riding on
   *  it. A required field so a new recipe cannot compile without declaring its lane —
   *  see docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md.
   *  NOTE: sell-side does not imply every sell-side recipe's PROMPT changes — see
   *  lib/deliverable/CLAUDE.md for which three narrators actually read
   *  FAVORABLE_FRAMING_POLICY. `social-pack`/`social-cut` ship "story-side" as an
   *  inert default: neither reads any prompt this field gates. */
  positioning: "sell-side" | "story-side";
```

- [ ] **Step 4: Set the value on every entry**

Add one line to each of the 14 objects in `RECIPES` (`lib/deliverable/recipes.ts`). Sell-side (add `positioning: "sell-side",` right after each entry's `key:` line): `new-listing`, `coming-soon`, `market-comps`, `under-contract`, `just-sold`, `open-house`, `price-reduced`, `agent-brand-intro`, `agent-launch`. Story-side (add `positioning: "story-side",`): `sphere-weekly`, `review-reply`, `market-pulse`, `social-pack`, `social-cut`.

Example for `new-listing` (`lib/deliverable/recipes.ts:142-155`):

```typescript
  "new-listing": {
    key: "new-listing",
    positioning: "sell-side",
    label: "New Listing",
    skeleton: "new-listing",
    prose: null,
    subject: "address",
    chart: "none",
    prompt:
      "Build a new-listing announcement email for my listing at [[your listing address]] — key specs, price per square foot, and one honest line about the home.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
```

Repeat for the other 13 entries with the matching lane.

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx tsc --noEmit && bun test lib/deliverable/recipes.parity.test.ts`
Expected: PASS, zero type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/deliverable/recipes.ts lib/deliverable/recipes.parity.test.ts
git commit -m "feat(deliverable): add required positioning field to Recipe"
```

---

### Task 2: Draft `FAVORABLE_FRAMING_POLICY` in `shared.ts`

**Files:**
- 🟡 Modify: `lib/deliverable/recipes/shared.ts` (add the constant near the top, after the `CLAIM_PROHIBITION` import)
- 🟡 Test: `lib/deliverable/recipes/shared.test.ts` (existing file — add to it)

**Interfaces:**
- Produces: `FAVORABLE_FRAMING_POLICY: string`, imported by Tasks 3–5.

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes/shared.test.ts`:

```typescript
import { FAVORABLE_FRAMING_POLICY } from "./shared";

test("FAVORABLE_FRAMING_POLICY states the priority sentence first", () => {
  const bodyAfterTag = FAVORABLE_FRAMING_POLICY.split("<favorable_framing_policy>")[1] ?? "";
  const priorityIdx = bodyAfterTag.indexOf("cited facts");
  expect(priorityIdx).toBeGreaterThan(-1);
  expect(priorityIdx).toBeLessThan(120); // near the very start of the block, not buried
});

test("FAVORABLE_FRAMING_POLICY never removes a fact, only orders it", () => {
  expect(FAVORABLE_FRAMING_POLICY).toContain(
    "governs the EMPHASIS AND ORDERING of true facts. It never governs which facts appear.",
  );
});

test("FAVORABLE_FRAMING_POLICY carries the magnitude permission, direction-symmetric", () => {
  expect(FAVORABLE_FRAMING_POLICY).toContain("Numbers beat adjectives, categorically");
  expect(FAVORABLE_FRAMING_POLICY).toContain("whichever direction the number points");
});

test("FAVORABLE_FRAMING_POLICY includes a counter-example boundary", () => {
  expect(FAVORABLE_FRAMING_POLICY).toContain("COUNTER-EXAMPLE");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: FAIL — `FAVORABLE_FRAMING_POLICY` is not exported from `./shared`.

- [ ] **Step 3: Add the constant**

In `lib/deliverable/recipes/shared.ts`, after the existing imports (after line 30, before `const BASE_URL = ...`), add:

```typescript
/**
 * THE ONE SHARED FRAMING BLOCK — pasted VERBATIM (never paraphrased) into the system
 * prompt of every narrator whose job is stating facts about a property or a price:
 * `authorListingNarrative` (this file), `authorUnderContractNote`
 * (recipes/under-contract.ts), `buildNarratorPrompt` (recipes/market-comps.ts).
 *
 * NEVER pasted into `authorAreaRead` (agent-brand-intro.ts) or `LETTER_SYSTEM`
 * (agent-launch.ts) — both carry an absolute no-numbers/no-facts constraint this
 * block would directly contradict ("numbers beat adjectives" inside a prompt that
 * says "not one digit, anywhere" is not inert, it's a conflicting instruction). See
 * docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md §3/§4/§4a.
 *
 * Every rule here traces to _ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md
 * and _ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md — real,
 * named sources, not invented style guidance.
 */
export const FAVORABLE_FRAMING_POLICY =
  `<favorable_framing_policy>\n` +
  `PRIORITY, STATED FIRST: cited facts — including unfavorable ones, a real price cut, ` +
  `a slow-selling comparable — are never dropped, softened, or omitted. This policy ` +
  `governs the EMPHASIS AND ORDERING of true facts. It never governs which facts appear.\n\n` +
  `Write for someone deciding whether to act on this property or this agent. Write like ` +
  `the person with the most data in the room, not like someone selling something:\n` +
  `- Benefit rides on the fact; it never replaces it. State the sourced number, then ` +
  `attach the one concrete thing it lets the reader do.\n` +
  `- Lead with a confirmed strength before any limitation.\n` +
  `- When you must acknowledge a less-favorable data point, name the specific factual ` +
  `difference — never drop it silently and never go vague.\n` +
  `- Numbers beat adjectives, categorically. A specific, sourced figure always outranks ` +
  `a descriptive word standing in for it.\n` +
  `- When the facts you were given show a LARGE gap, state its size directly and plainly. ` +
  `Do not soften a big, sourced number into hedge language ("somewhat," "a bit," "in the ` +
  `neighborhood of") — the size of the gap is the case on its own. This applies IDENTICALLY ` +
  `whichever direction the number points: a big gap is not more "sayable" just because it ` +
  `happens to favor the subject.\n` +
  `- No steering language, no describing who "should" want this property.\n` +
  `- Never a superlative or intensifier — "unbeatable," "guaranteed," "won't last," "a rare ` +
  `opportunity" remain forbidden, exactly as they always were.\n\n` +
  `WORKED EXAMPLES.\n` +
  `Weak (hedged, buries a real number): "The price is somewhat below what similar homes ` +
  `have been asking."\n` +
  `Strong (favorable, still 100% sourced, same underlying fact): "The asking price sits ` +
  `$91,000 below every comparable home in the set."\n\n` +
  `Weak (an adjective standing in for a fact): "This is an unbeatable price."\n` +
  `Strong: state the sourced figure and stop there — the number is the whole argument, not ` +
  `an adjective layered on top of it.\n\n` +
  `COUNTER-EXAMPLE — favorable framing tipping into invention (forbidden): "This home is a ` +
  `better value than anything else in the neighborhood." That is an unsourced comparison to ` +
  `homes you were never shown — the same violation this prompt has always forbidden, dressed ` +
  `up as enthusiasm instead of a market claim.\n` +
  `</favorable_framing_policy>`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes/shared.ts lib/deliverable/recipes/shared.test.ts
git commit -m "feat(deliverable): add shared FAVORABLE_FRAMING_POLICY constant"
```

---

### Task 3: Wire the block into `authorListingNarrative` (`shared.ts`)

**Files:**
- 🟡 Modify: `lib/deliverable/recipes/shared.ts:276-283` (the `getAnthropic(...).messages.create` call inside `authorListingNarrative`)
- 🟡 Test: `lib/deliverable/recipes/shared.test.ts`

**Interfaces:**
- Consumes: `FAVORABLE_FRAMING_POLICY` (Task 2).
- Produces: no signature change to `authorListingNarrative` — same `(facts, opts) => Promise<string | null>`. Covers new-listing, coming-soon, price-reduced, just-sold, open-house (all five call this function and only supply a `framing` string).

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes/shared.test.ts` (mock `getAnthropic` the same way `agent-launch.test.ts` does, capturing the `system` argument):

```typescript
import { mock } from "bun:test";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";

const anthropicOrig2 = { ...realAnthropic };
let capturedSystem = "";
mock.module("@/refinery/agents/anthropic.mts", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (args: { system: string }) => {
        capturedSystem = args.system;
        return { content: [{ type: "text", text: "A well-kept three-bedroom home." }] };
      },
    },
  }),
}));

test("authorListingNarrative's system prompt includes FAVORABLE_FRAMING_POLICY verbatim", async () => {
  const { authorListingNarrative, FAVORABLE_FRAMING_POLICY: policy } = await import("./shared");
  await authorListingNarrative({ address: "1 Main St", price: "$500,000", beds: 3 } as never);
  expect(capturedSystem).toContain(policy);
});
```

(If `shared.test.ts` already mocks `@/refinery/agents/anthropic.mts` for a different test in the same file, reuse that existing mock's capture variable instead of declaring a second `mock.module` for the same path — `mock.module` is process-global, per the file's existing comment at the top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: FAIL — `capturedSystem` does not contain the policy text.

- [ ] **Step 3: Wire it in**

In `lib/deliverable/recipes/shared.ts`, the `authorListingNarrative` function currently ends its call with:

```typescript
    const msg = await getAnthropic("email_build").messages.create({
      // Prose quality is the whole job here; Haiku wrote the robot sentence.
      model: EMAIL_MODEL_SONNET,
      max_tokens: 500,
      system: `${system}\n\n${CLAIM_PROHIBITION}`,
      messages: [{ role: "user", content: user }],
    });
```

Change the `system` line to:

```typescript
      system: `${system}\n\n${CLAIM_PROHIBITION}\n\n${FAVORABLE_FRAMING_POLICY}`,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes/shared.ts lib/deliverable/recipes/shared.test.ts
git commit -m "feat(deliverable): wire FAVORABLE_FRAMING_POLICY into authorListingNarrative"
```

---

### Task 4: Wire the block into `authorUnderContractNote` (`under-contract.ts`)

**Files:**
- Modify: `lib/deliverable/recipes/under-contract.ts:978-1021` (the `system` construction inside `authorUnderContractNote`)
- Test: `lib/deliverable/recipes/under-contract.test.ts` (existing file — add to it)

**Interfaces:**
- Consumes: `FAVORABLE_FRAMING_POLICY` from `./shared`.
- Produces: no signature change to `authorUnderContractNote`.

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes/under-contract.test.ts`, following that file's existing mock pattern for `getAnthropic` (capture `args.system` the same way `agent-launch.test.ts` and this file's own existing tests already do):

```typescript
test("authorUnderContractNote's system prompt includes FAVORABLE_FRAMING_POLICY verbatim", async () => {
  const { FAVORABLE_FRAMING_POLICY: policy } = await import("./shared");
  // reuse this file's existing `systemSeen` capture variable and existing NarratorInput
  // fixture with >1 settled fact so the model path (not the deterministic fallback) runs
  await authorUnderContractNote(richInput);
  expect(systemSeen).toContain(policy);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/under-contract.test.ts`
Expected: FAIL.

- [ ] **Step 3: Wire it in**

In `lib/deliverable/recipes/under-contract.ts`, add the import at the top (alongside the existing `CLAIM_PROHIBITION` import, `under-contract.ts:1-30` region):

```typescript
import { FAVORABLE_FRAMING_POLICY } from "./shared";
```

Then change the end of the `system` template (currently ending, per `under-contract.ts:1018-1021`):

```typescript
    `What you MAY say: any SETTLED FACT restated word for word, that backup offers are ` +
    `open, and one true NON-NUMERIC detail from the agent's description.\n\n` +
    `No hype, no exclamation marks. Plain, confident, specific. Return ONLY the paragraph.`;
```

to:

```typescript
    `What you MAY say: any SETTLED FACT restated word for word, that backup offers are ` +
    `open, and one true NON-NUMERIC detail from the agent's description.\n\n` +
    `No hype, no exclamation marks. Plain, confident, specific. Return ONLY the paragraph.\n\n` +
    FAVORABLE_FRAMING_POLICY;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/deliverable/recipes/under-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes/under-contract.ts lib/deliverable/recipes/under-contract.test.ts
git commit -m "feat(deliverable): wire FAVORABLE_FRAMING_POLICY into authorUnderContractNote"
```

---

### Task 5: Wire the block into `buildNarratorPrompt`, and add the direction-symmetric magnitude tier to `buildPriceCase` (`market-comps.ts`)

**Files:**
- 🟡 Modify: `lib/deliverable/recipes/market-comps.ts:878-941` (`buildNarratorPrompt`'s `system` string)
- 🟡 Modify: `lib/deliverable/recipes/market-comps.ts:480-600` (`buildPriceCase`'s `s1` sentence construction)
- Test: `lib/deliverable/recipes/market-comps.test.ts` (existing file — add to it)

**Interfaces:**
- Consumes: `FAVORABLE_FRAMING_POLICY` from `./shared`.
- Produces: no signature change to `buildNarratorPrompt` or `buildPriceCase` — same return shapes as today.

- [ ] **Step 1: Write the failing tests**

Add to `lib/deliverable/recipes/market-comps.test.ts`:

```typescript
import { buildNarratorPrompt, buildPriceCase } from "./market-comps";
import { FAVORABLE_FRAMING_POLICY } from "./shared";

test("buildNarratorPrompt's system includes FAVORABLE_FRAMING_POLICY verbatim", () => {
  const facts = { address: "326 Shore Dr, Fort Myers, FL 33905", price: "$595,000", sqft: "2847" } as never;
  const pc = buildPriceCase(facts, [
    { addressLine: "1 A St", city: "x", beds: 3, baths: 2, sqft: 2000, status: "sold", price: 700000, priceKind: "sold", priceDate: "2026-01-01", sourceUrl: null },
  ]);
  const { system } = buildNarratorPrompt(facts, pc!);
  expect(system).toContain(FAVORABLE_FRAMING_POLICY);
});

test("buildPriceCase states an extreme gap plainly, direction-symmetric", () => {
  const factsCheap = { address: "1 Cheap Ln, Fort Myers, FL 33905", price: "$1", sqft: "2000" } as never;
  const richComps = [
    { addressLine: "1 A St", city: "x", beds: 3, baths: 2, sqft: 2000, status: "sold", price: 400000, priceKind: "sold" as const, priceDate: "2026-01-01", sourceUrl: null },
    { addressLine: "2 B St", city: "x", beds: 3, baths: 2, sqft: 2000, status: "sold", price: 420000, priceKind: "sold" as const, priceDate: "2026-01-01", sourceUrl: null },
  ];
  const cheap = buildPriceCase(factsCheap, richComps);
  expect(cheap!.verdict).not.toMatch(/somewhat|a bit|in the neighborhood of/i);

  // direction-symmetric: an equally extreme gap ABOVE the set states just as plainly
  const factsExpensive = { address: "1 Pricey Ln, Fort Myers, FL 33905", price: "$5,000,000", sqft: "2000" } as never;
  const expensive = buildPriceCase(factsExpensive, richComps);
  expect(expensive!.verdict).not.toMatch(/somewhat|a bit|in the neighborhood of/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/market-comps.test.ts`
Expected: FAIL on the first test (policy absent from `system`).

- [ ] **Step 3: Wire the policy block in**

In `lib/deliverable/recipes/market-comps.ts`, add the import near the top (alongside the existing `claims.ts` import block, `market-comps.ts:82-90`):

```typescript
import { FAVORABLE_FRAMING_POLICY } from "./shared";
```

(`isComparableHome`/`median`/`perSqft` move to a `./shared` import too, but not in this task — Task 8 removes their local definitions from this file and switches this same import line to pull them in alongside `FAVORABLE_FRAMING_POLICY`. Importing them here now, before their local copies are removed, would just create unused-duplicate names.)

Then, in `buildNarratorPrompt` (`market-comps.ts:878-928`), the `system` string currently ends:

```typescript
    `AND A MARKET RULE IS NOT A FACT EITHER. Do not prop the argument up on a general ` +
    `claim you were not given — "price per square foot compresses as size increases", ` +
    `"new construction commands a premium". Those are assertions about a market you were ` +
    `handed no evidence for, and they are inventions exactly like a made-up number. Never ` +
    `add a selling claim of your own either: "priced to move", "won't last", "a rare ` +
    `opportunity" are YOUR words, not facts. No hype, no exclamation marks.\n\n` +
    `Return ONLY your two or three sentences.`;
```

Change the final two lines to:

```typescript
    `AND A MARKET RULE IS NOT A FACT EITHER. Do not prop the argument up on a general ` +
    `claim you were not given — "price per square foot compresses as size increases", ` +
    `"new construction commands a premium". Those are assertions about a market you were ` +
    `handed no evidence for, and they are inventions exactly like a made-up number. Never ` +
    `add a selling claim of your own either: "priced to move", "won't last", "a rare ` +
    `opportunity" are YOUR words, not facts. No hype, no exclamation marks.\n\n` +
    `Return ONLY your two or three sentences.\n\n` +
    FAVORABLE_FRAMING_POLICY;
```

- [ ] **Step 4: Add the direction-symmetric magnitude tier to `buildPriceCase`'s `s1`**

In `lib/deliverable/recipes/market-comps.ts`, `buildPriceCase` currently builds `s1` (`market-comps.ts:545-551`):

```typescript
  const s1 =
    vsMedian.dir === "level"
      ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} is level with the ` +
        `${usd(medianPpsf)} median across the ${homes} nearby.`
      : `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
        `${usd(vsMedian.diff)} ${vsMedian.dir} the ${usd(medianPpsf)} median across the ` +
        `${homes} nearby.`;
```

Replace it with a magnitude-tiered version — the EXTREME phrasing fires identically whether the subject sits far below or far above the set (never only when the gap flatters the ask). Place this directly above the `s1` construction, using `priced` (already computed earlier in the function, `market-comps.ts:482-486`):

```typescript
  // MAGNITUDE TIER — direction-symmetric. An extreme gap (the subject sits at or beyond
  // the full spread of the set, or the gap is >= 40% of the median) states its size
  // plainly and directly rather than the same flat "sits $X above/below" wording used for
  // a marginal gap. Fires IDENTICALLY whichever way the number points — this recipe exists
  // to defend a price that can legitimately sit on either side of the comps, and a tier
  // that only sharpens language in the flattering direction is spin, not honesty. See
  // docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md §4a.
  const allPpsf = priced.map((x) => x.ppsf);
  const isExtreme =
    vsMedian.dir !== "level" &&
    (vsMedian.diff / medianPpsf >= 0.4 ||
      (vsMedian.dir === "below" && subjectPpsf < Math.min(...allPpsf)) ||
      (vsMedian.dir === "above" && subjectPpsf > Math.max(...allPpsf)));
  const s1 =
    vsMedian.dir === "level"
      ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} is level with the ` +
        `${usd(medianPpsf)} median across the ${homes} nearby.`
      : isExtreme
        ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
          `${usd(vsMedian.diff)} ${vsMedian.dir} every comparable home in the set — not just ` +
          `the ${usd(medianPpsf)} median, the entire range.`
        : `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
          `${usd(vsMedian.diff)} ${vsMedian.dir} the ${usd(medianPpsf)} median across the ` +
          `${homes} nearby.`;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx tsc --noEmit && bun test lib/deliverable/recipes/market-comps.test.ts`
Expected: PASS. If the extreme-phrasing assertion doesn't trigger on the `$1` fixture, adjust the fixture's comp set so `vsMedian.diff / medianPpsf` clearly exceeds 0.4 (a $1-priced 2,000 sqft home against ~$400k comps is already >>40%, so this should pass as written).

- [ ] **Step 6: Commit**

```bash
git add lib/deliverable/recipes/market-comps.ts lib/deliverable/recipes/market-comps.test.ts
git commit -m "feat(deliverable): wire FAVORABLE_FRAMING_POLICY + direction-symmetric magnitude tier into market-comps"
```

---

### Task 6: Negative tests — the block stays OUT of story-side and the two agent recipes

**Files:**
- Test: `lib/deliverable/recipes/agent-brand-intro.test.ts` (existing — add to it)
- Test: `lib/deliverable/recipes/agent-launch.test.ts` (existing — add to it)
- Test: `lib/deliverable/recipes/sphere-weekly.test.ts`, `market-pulse.test.ts`, `review-reply.test.ts` (existing — add one assertion each)

**Interfaces:**
- Consumes: `FAVORABLE_FRAMING_POLICY` from `./shared`, each file's own existing `systemSeen`/`capturedSystem` capture variable.

- [ ] **Step 1: Write the failing tests (all five, same shape)**

In `lib/deliverable/recipes/agent-brand-intro.test.ts`, using its existing `getAnthropic` mock capture (the file already builds `authorAreaRead` calls; reuse the existing captured-system variable name from that file):

```typescript
import { FAVORABLE_FRAMING_POLICY } from "./shared";

test("authorAreaRead's system NEVER contains FAVORABLE_FRAMING_POLICY (absolute no-facts constraint)", async () => {
  await authorAreaRead(
    { place: "Cape Coral", zips: ["33914", "33991", "33990"] },
    [
      { zip: "33914", medianList: 525000 },
      { zip: "33991", medianList: 480000 },
      { zip: "33990", medianList: 410000 },
    ],
  );
  expect(systemSeen).not.toContain(FAVORABLE_FRAMING_POLICY);
});
```

In `lib/deliverable/recipes/agent-launch.test.ts`, using the file's existing `systemSeen` variable (declared at line 59 per the file already read in this session):

```typescript
import { FAVORABLE_FRAMING_POLICY } from "./shared";

test("LETTER_SYSTEM NEVER contains FAVORABLE_FRAMING_POLICY (absolute no-numbers constraint)", async () => {
  await buildAgentLaunch({
    prompt: PROMPT,
    currentDoc: SEED_DOCS["stay-in-touch"] ?? ({ globalStyle: {}, blocks: [] } as unknown as EmailDoc),
    facts: null,
    resolved: false,
    zip: "33904",
  } as RecipeBuildContext);
  expect(systemSeen).not.toContain(FAVORABLE_FRAMING_POLICY);
});
```

In each of `sphere-weekly.test.ts`, `market-pulse.test.ts`, `review-reply.test.ts`, add one assertion reusing that file's own existing captured-system variable:

```typescript
import { FAVORABLE_FRAMING_POLICY } from "./shared";

test("story-side narrator's system NEVER contains FAVORABLE_FRAMING_POLICY", () => {
  expect(systemSeen).not.toContain(FAVORABLE_FRAMING_POLICY);
});
```

(Place this test AFTER an existing test in each file that already triggers the model call and populates `systemSeen`, so it doesn't need its own fixture.)

- [ ] **Step 2: Run tests to verify they pass immediately**

Run: `bun test lib/deliverable/recipes/agent-brand-intro.test.ts lib/deliverable/recipes/agent-launch.test.ts lib/deliverable/recipes/sphere-weekly.test.ts lib/deliverable/recipes/market-pulse.test.ts lib/deliverable/recipes/review-reply.test.ts`
Expected: PASS immediately — these are regression guards (nothing in Tasks 1–5 touches these five files), not TDD-red tests. That's correct: their whole job is to fail LOUDLY the day someone pastes the block into one of these five prompts by habit, matching the pattern used everywhere else in this recipe set.

- [ ] **Step 3: Commit**

```bash
git add lib/deliverable/recipes/agent-brand-intro.test.ts lib/deliverable/recipes/agent-launch.test.ts lib/deliverable/recipes/sphere-weekly.test.ts lib/deliverable/recipes/market-pulse.test.ts lib/deliverable/recipes/review-reply.test.ts
git commit -m "test(deliverable): guard against FAVORABLE_FRAMING_POLICY leaking into story-side or agent prompts"
```

---

### Task 7: `lib/deliverable/CLAUDE.md` + playbook Part 10

**Files:**
- Create: `lib/deliverable/CLAUDE.md`
- Modify: `docs/standards/deliverable-playbook.md` (append a new Part 10 section at the end)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Create `lib/deliverable/CLAUDE.md`**

```markdown
# lib/deliverable/ — sell-side vs story-side conventions (loads when you edit here)

- **Every `Recipe` declares `positioning: "sell-side" | "story-side"`** (`recipes.ts`). Sell-side = pitches
  a specific property or the agent's own brand; story-side = recurring relationship/informational content.
  Adding a recipe? It will not compile without this field.
- **`FAVORABLE_FRAMING_POLICY` (`recipes/shared.ts`) is pasted VERBATIM into exactly THREE prompts** —
  `authorListingNarrative` (shared.ts), `authorUnderContractNote` (under-contract.ts), `buildNarratorPrompt`
  (market-comps.ts) — never paraphrased, never re-typed. **Never paste it into `authorAreaRead`
  (agent-brand-intro.ts) or `LETTER_SYSTEM` (agent-launch.ts)** — both carry an absolute no-numbers/no-facts
  constraint the block would contradict, not just leave unused. `positioning: "sell-side"` on those two
  recipes is a categorization fact only; it does not mean their prompts change.
- **The block's priority sentence is load-bearing:** cited facts — including unfavorable ones — are never
  dropped, softened, or omitted. Favorable framing governs emphasis and ordering, never which facts appear.
- **A big, sourced gap is stated directly, not hedged — and this must be direction-symmetric.** A tier or
  instruction that only sharpens language when the gap flatters the subject is spin, not authority — see
  `buildPriceCase`'s magnitude tier in `market-comps.ts` for the reference implementation.
- **Charts carry the argument too.** Where a recipe's sourced data supports a real magnitude claim, prefer a
  chart over prose alone (see `price-reduced.ts`'s `priceVsAreaDotSpec` for the pattern: reuse an existing
  frame — `dot-plot`/`z-gauge` for "one value vs. a reference" — rather than inventing a new renderer).
- **Full doctrine, citations, and the recipe table:** `docs/standards/deliverable-playbook.md` Part 10.
- **Design doc + research (do not re-derive):** `docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md`,
  `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md`,
  `_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md`,
  `_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md`.
```

- [ ] **Step 2: Append Part 10 to `docs/standards/deliverable-playbook.md`**

Read the file first to find its last line, then append:

```markdown

## Part 10 — Positioning: sell-side vs story-side

Every recipe declares `positioning: "sell-side" | "story-side"` on its `Recipe` record
(`lib/deliverable/recipes.ts`):

- **Sell-side (9):** `new-listing`, `coming-soon`, `market-comps`, `under-contract`, `just-sold`,
  `open-house`, `price-reduced`, `agent-brand-intro`, `agent-launch`.
- **Story-side (5):** `sphere-weekly`, `market-pulse`, `review-reply`, `social-pack`, `social-cut`
  (the last two ship `"story-side"` as an inert default — neither reads any prompt this design touches).

`FAVORABLE_FRAMING_POLICY` (`lib/deliverable/recipes/shared.ts`) is pasted verbatim into exactly THREE
prompts, not all nine sell-side recipes' prompts: `authorListingNarrative` (shared.ts — covers new-listing,
coming-soon, price-reduced, just-sold, open-house), `authorUnderContractNote` (under-contract.ts, its own
bespoke prompt, NOT routed through the shared narrator), and `buildNarratorPrompt` (market-comps.ts). It is
deliberately absent from `authorAreaRead` (agent-brand-intro.ts) and `LETTER_SYSTEM` (agent-launch.ts) —
both carry an absolute no-numbers/no-facts constraint the block would contradict.

The block's priority sentence, stated first inside it: cited facts — including unfavorable ones — are
never dropped, softened, or omitted. This governs emphasis and ordering of true facts, never which facts
appear.

**The magnitude permission is direction-symmetric.** When settled facts show a large gap, state its size
plainly rather than hedging it — identically whichever way the number points. `market-comps.ts`'s
`buildPriceCase` is the reference implementation: its `isExtreme` check fires on the gap's relative size,
never on which direction is "the favorable one."

**Charts carry the argument too.** `price-reduced` gained a new chart (`priceVsAreaDotSpec`) plotting the
new price's $/sq ft against a sourced comp median, using the already-registered `dot-plot` frame — no new
chart-rendering code, reusing `compsForAddress` (the same data root `market-comps.ts` calls).

Research: `_ASSISTANT/research/2026-07-15-sell-side-copywriting-research.md`,
`_ASSISTANT/research/2026-07-15-ai-steering-anti-drift-research.md`,
`_ASSISTANT/research/2026-07-15-authority-reasoning-not-hype-research.md`. Design doc:
`docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add lib/deliverable/CLAUDE.md docs/standards/deliverable-playbook.md
git commit -m "docs(deliverable): add lib/deliverable/CLAUDE.md and playbook Part 10 for sell-side positioning"
```

---

## Phase 2 — Charts carry the argument (price-reduced)

**Note on scope (writing-plans Scope Check):** this phase is an independent subsystem from Phase 1 — it
touches chart-building code, not prompts, and can ship in a separate PR/commit series without waiting on
Phase 1. It also makes an explicit, acknowledged override of a documented 07/13/2026 design call
(`price-reduced.ts`'s own header comment: "No comps bar either: this email is about a HOUSE, not a
market") — see spec § "Charts carry the argument too" for why that override is deliberate, not an
oversight.

### Task 8: Extract `isComparableHome` / `perSqft` / `median` from `market-comps.ts` into `shared.ts`

**Files:**
- 🟡 Modify: `lib/deliverable/recipes/market-comps.ts:120-154` (remove the three local functions, import instead)
- 🟡 Modify: `lib/deliverable/recipes/shared.ts` (add the three exported functions)
- 🟡 Test: `lib/deliverable/recipes/shared.test.ts`, `lib/deliverable/recipes/market-comps.test.ts` (existing files — confirm unchanged behavior)

**Interfaces:**
- Produces: `isComparableHome(c: RenderComp): boolean`, `perSqft(price: number | null, sqft: number | null): number | null`, `median(values: number[]): number | null`, all exported from `./shared`. Consumed by Task 10 (`price-reduced.ts`).

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes/shared.test.ts`:

```typescript
import { isComparableHome, perSqft, median } from "./shared";

test("isComparableHome requires beds, sqft, and price all present and positive", () => {
  expect(isComparableHome({ beds: 3, sqft: 2000, price: 400000 } as never)).toBe(true);
  expect(isComparableHome({ beds: null, sqft: 2000, price: 400000 } as never)).toBe(false);
  expect(isComparableHome({ beds: 3, sqft: 0, price: 400000 } as never)).toBe(false);
});

test("perSqft divides and rounds; null unless both parts are real", () => {
  expect(perSqft(400000, 2000)).toBe(200);
  expect(perSqft(null, 2000)).toBeNull();
  expect(perSqft(400000, 0)).toBeNull();
});

test("median: odd count returns the middle, even count averages the two middle", () => {
  expect(median([1, 3, 2])).toBe(2);
  expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 rounded
  expect(median([])).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: FAIL — none of the three functions are exported from `./shared` yet.

- [ ] **Step 3: Add the functions to `shared.ts`**

Add to `lib/deliverable/recipes/shared.ts`, after the `FAVORABLE_FRAMING_POLICY` constant (Task 2) and before `resolveSubject`:

```typescript
import type { RenderComp } from "@/lib/assistant/comp-helper";

/** A comp is a HOME iff the vendor gave us beds AND sqft AND a price. Anything else is
 *  bare land (or unpriced) and can never sit on a chart beside a house. Extracted here
 *  (copy #2 — was private in market-comps.ts, price-reduced.ts needs the same rule)
 *  per "one authority per shared concept". */
export function isComparableHome(c: RenderComp): boolean {
  return c.beds != null && c.sqft != null && c.sqft > 0 && c.price != null && c.price > 0;
}

/** Price ÷ square feet, rounded. Null unless BOTH parts are real (never back-solved). */
export function perSqft(price: number | null, sqft: number | null): number | null {
  if (price == null || sqft == null || sqft <= 0) return null;
  const v = Math.round(price / sqft);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** The median of a numeric set. Even count → the mean of the two middle values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
```

- [ ] **Step 4: Remove the local copies from `market-comps.ts` and import instead**

In `lib/deliverable/recipes/market-comps.ts`, delete the local `isComparableHome` (lines ~120-125), `perSqft` (lines ~127-132), and `median` (lines ~148-154) function definitions. Add to the existing import block near the top (alongside the `FAVORABLE_FRAMING_POLICY` import added in Task 5):

```typescript
import { FAVORABLE_FRAMING_POLICY, isComparableHome, median, perSqft } from "./shared";
```

Every existing call site in `market-comps.ts` (`isComparableHome`, `perSqft`, `median`) keeps working unchanged — same names, same signatures, now imported instead of locally defined.

- [ ] **Step 5: Run tests to verify everything still passes**

Run: `bunx tsc --noEmit && bun test lib/deliverable/recipes/shared.test.ts lib/deliverable/recipes/market-comps.test.ts`
Expected: PASS — this step is a pure refactor; every existing `market-comps.test.ts` assertion must pass byte-for-byte unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/deliverable/recipes/shared.ts lib/deliverable/recipes/market-comps.ts lib/deliverable/recipes/shared.test.ts
git commit -m "refactor(deliverable): extract isComparableHome/perSqft/median into shared.ts"
```

---

### Task 9: Add the `price-vs-area-dot` chart policy

**Files:**
- 🔴 Modify: `lib/deliverable/recipes.ts:99-115` (the `ChartPolicy` union), and the `price-reduced` entry (`recipes.ts:237-251`)
- 🔴 Test: `lib/deliverable/recipes.parity.test.ts`

**Interfaces:**
- Produces: `ChartPolicy` gains `"price-vs-area-dot"`; `RECIPES["price-reduced"].chart === "price-vs-area-dot"`.

- [ ] **Step 1: Write the failing test**

Add to `lib/deliverable/recipes.parity.test.ts`:

```typescript
test("price-reduced's chart policy reflects its new sourced chart", () => {
  expect(RECIPES["price-reduced"].chart).toBe("price-vs-area-dot");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes.parity.test.ts`
Expected: FAIL — `RECIPES["price-reduced"].chart` is currently `"none"`.

- [ ] **Step 3: Add the union member and update the entry**

In `lib/deliverable/recipes.ts`, the `ChartPolicy` type (`recipes.ts:99-115`) currently ends:

```typescript
  /** How scarce homes like the subject are — live inventory counts. */
  | "inventory-scarcity";
```

Change to:

```typescript
  /** How scarce homes like the subject are — live inventory counts. */
  | "inventory-scarcity"
  /** The subject's NEW $/sq ft (post-reduction) plotted against the median $/sq ft of
   *  real nearby comparable homes — one value vs. one reference, via the `dot-plot`
   *  frame. Comps here are used ONLY to compute the chart; never handed to the
   *  narrator (price-reduced.ts's prose stays exactly as constrained as it always
   *  was — zero market data, so it can never invent a reason the price moved). */
  | "price-vs-area-dot";
```

Update the `price-reduced` entry's comment and `chart` field (`recipes.ts:237-251`) — currently:

```typescript
  "price-reduced": {
    key: "price-reduced",
    positioning: "sell-side",
    label: "Price Improved",
    skeleton: "price-reduced",
    prose: null,
    subject: "address",
    // Two bars (was/now) is a fact wearing a chart costume — write the fact.
    // Operator, 07/13/2026: show the reduced amount ABOVE the price, in a
    // different color, in a smaller font. The vendor's `reduced_amount` is the
    // size of the CUT, not the old price: old = price + cut.
    chart: "none",
```

Change to:

```typescript
  "price-reduced": {
    key: "price-reduced",
    positioning: "sell-side",
    label: "Price Improved",
    skeleton: "price-reduced",
    prose: null,
    subject: "address",
    // Operator, 07/13/2026: show the reduced amount ABOVE the price, in a
    // different color, in a smaller font. The vendor's `reduced_amount` is the
    // size of the CUT, not the old price: old = price + cut. That call stands.
    //
    // Operator, 07/15/2026: the was/now comparison is still a fact, not a chart
    // ("two bars is a fact wearing a chart costume" stands) — but the SAME 07/13
    // comment also said "no comps bar either: this is about a HOUSE, not a
    // market," and this line is a deliberate, acknowledged override of THAT
    // clause: the new price vs. real nearby comps is a genuine market argument
    // this recipe was leaving unshown. See price-reduced.ts's priceVsAreaDotSpec.
    chart: "price-vs-area-dot",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx tsc --noEmit && bun test lib/deliverable/recipes.parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes.ts lib/deliverable/recipes.parity.test.ts
git commit -m "feat(deliverable): add price-vs-area-dot chart policy for price-reduced"
```

---

### Task 10: Build `priceVsAreaDotSpec` and wire it into `buildPriceReduced`

**Files:**
- Modify: `lib/deliverable/recipes/price-reduced.ts` (add imports, the new pure function, and the chart-building block inside `buildPriceReduced`)
- 🟢 Test: `lib/deliverable/recipes/price-reduced.test.ts` (existing file — add to it)

**Interfaces:**
- Consumes: `isComparableHome`, `perSqft`, `median` (Task 8, from `./shared`); `compsForAddress`, `type RenderComp` (`@/lib/assistant/comp-helper`); `chartSpecToEmailImage` (`@/lib/email/spec-to-png`); `assertHeroChartCoherence`, `chartMagnitudeFromSpec` (`@/lib/deliverable/chart-coherence`); `resolveHeadlineFigure` (`@/lib/email/doc/preview-fill`); `createBlock` (`@/lib/email/doc/default-docs`); `type ChartSpec` (`@/components/charts/registry/chart-spec`).
- Produces: `priceVsAreaDotSpec(facts: ListingFacts, comps: RenderComp[]): ChartSpec | null`, exported for its own unit test.

- [ ] **Step 1: Write the failing tests**

Add to `lib/deliverable/recipes/price-reduced.test.ts`:

```typescript
import { priceVsAreaDotSpec } from "./price-reduced";
import type { RenderComp } from "@/lib/assistant/comp-helper";

const comp = (price: number, sqft: number): RenderComp => ({
  addressLine: "1 A St",
  city: "Fort Myers",
  beds: 3,
  baths: 2,
  sqft,
  status: "sold",
  price,
  priceKind: "sold",
  priceDate: "2026-01-01",
  sourceUrl: null,
});

test("priceVsAreaDotSpec returns null with fewer than 2 comparable homes", () => {
  const facts = { address: "1 Main St, Fort Myers, FL 33905", price: "$500,000", sqft: "2000" } as never;
  expect(priceVsAreaDotSpec(facts, [comp(400000, 2000)])).toBeNull();
});

test("priceVsAreaDotSpec returns null with no subject price or sqft", () => {
  const facts = { address: "1 Main St, Fort Myers, FL 33905", sqft: "2000" } as never;
  expect(priceVsAreaDotSpec(facts, [comp(400000, 2000), comp(420000, 2100)])).toBeNull();
});

test("priceVsAreaDotSpec plots the subject's $/sqft against the comp median, on the dot-plot frame", () => {
  const facts = { address: "1 Main St, Fort Myers, FL 33905", price: "$400,000", sqft: "2000" } as never;
  const spec = priceVsAreaDotSpec(facts, [comp(440000, 2000), comp(460000, 2000)]); // 220, 230 $/sqft
  expect(spec).not.toBeNull();
  expect(spec!.frameId).toBe("dot-plot");
  expect((spec!.options as { data: { value: number; reference?: number }[] }).data[0].value).toBe(200); // 400000/2000
  expect((spec!.options as { data: { value: number; reference?: number }[] }).data[0].reference).toBe(225); // median(220,230)
});

test("priceVsAreaDotSpec filters out vacant-lot comps (no beds/sqft) before computing the median", () => {
  const facts = { address: "1 Main St, Fort Myers, FL 33905", price: "$400,000", sqft: "2000" } as never;
  const vacantLot: RenderComp = { ...comp(139800, 0), beds: null, sqft: null };
  const spec = priceVsAreaDotSpec(facts, [comp(440000, 2000), comp(460000, 2000), vacantLot]);
  expect(spec).not.toBeNull();
  expect((spec!.options as { data: { reference?: number }[] }).data[0].reference).toBe(225); // unaffected by the lot
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/price-reduced.test.ts`
Expected: FAIL — `priceVsAreaDotSpec` is not exported from `./price-reduced` yet.

- [ ] **Step 3: Add the imports**

At the top of `lib/deliverable/recipes/price-reduced.ts`, alongside the existing imports (`price-reduced.ts:71-81`):

```typescript
import { compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { isComparableHome, median, perSqft } from "./shared";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
} from "@/lib/deliverable/chart-coherence";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
import { createBlock } from "@/lib/email/doc/default-docs";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
```

- [ ] **Step 4: Add `priceVsAreaDotSpec` (pure function)**

Add after `previousPrice` (`price-reduced.ts:103-109`):

```typescript
/** How many real comps to require before charting a reference — one point is not a
 *  market, it's a coincidence. Matches the honest-evidence floor used elsewhere in
 *  this recipe set (buildPriceCase requires >=1 priced comp; a reference computed
 *  from ONE comp is too thin to call a market position, so this recipe asks for 2). */
const MIN_COMPS_FOR_CHART = 2;

/** How many nearby comps to pull before filtering. Mirrors market-comps.ts's COMP_POOL:
 *  pull more than we need because the vacant-lot filter (isComparableHome) eats some. */
const COMP_POOL = 12;

/**
 * The new price's $/sq ft vs. the median $/sq ft of real nearby comparable homes — one
 * value, one reference, on the already-registered `dot-plot` frame (no new chart-
 * rendering code). Pure: no I/O, invents nothing. Comps are used ONLY to compute this
 * chart — this function's caller must NEVER hand `comps` to the narrator (see
 * `buildPriceReduced`'s own header: the narrator holds zero market data, by design,
 * specifically to prevent it inventing a reason the price moved).
 *
 * Null when there's no defensible reference: fewer than MIN_COMPS_FOR_CHART real
 * comparable homes, or the subject itself has no price or sqft. `dropEmptyChartSlot`
 * (shared.ts) removes the reserved slot when this returns null — never an empty box.
 */
export function priceVsAreaDotSpec(facts: ListingFacts, comps: RenderComp[]): ChartSpec | null {
  const subjectPrice = money(facts.price);
  const subjectSqft = money(facts.sqft);
  const subjectPpsf = perSqft(subjectPrice ?? null, subjectSqft ?? null);
  if (subjectPpsf == null) return null;

  const comparable = comps.filter(isComparableHome);
  const referencePpsf = median(
    comparable.map((c) => perSqft(c.price, c.sqft)).filter((v): v is number => v != null),
  );
  if (referencePpsf == null || comparable.length < MIN_COMPS_FOR_CHART) return null;

  const street = facts.address?.split(",")[0]?.trim() || "This home";
  return {
    frameId: "dot-plot",
    title: "The new price vs. nearby comparable homes",
    columns: ["Row", "$/Sq Ft"],
    rows: [
      [street, subjectPpsf],
      ["Comparable homes (median)", referencePpsf],
    ],
    value_format: "usd",
    chart_type: "scatter",
    asOf: new Date().toISOString().slice(0, 10),
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
    options: {
      data: [{ label: street, value: subjectPpsf, reference: referencePpsf }],
      referenceLabel: "nearby comparable homes (median $/sq ft)",
      valueLabel: "this home, new price",
    },
  };
}
```

- [ ] **Step 5: Run the pure-function tests to verify they pass**

Run: `bunx tsc --noEmit && bun test lib/deliverable/recipes/price-reduced.test.ts`
Expected: PASS on all four new tests.

- [ ] **Step 6: Wire the chart into `buildPriceReduced`**

In `lib/deliverable/recipes/price-reduced.ts`, `buildPriceReduced` currently constructs `doc` with no `middle` option (`price-reduced.ts:221-256`) and comments "NO MIDDLE... NO CHART" (`price-reduced.ts:240-242`). Change the `buildLifecycleEmail` call to reserve a chart slot when this really is a reduction:

Replace:

```typescript
    specs: priceStrip(facts, previous),
    specFootnote: priceStripFootnote(facts, previous),

    // NO MIDDLE. No chart (declared on the key): was-and-now is TWO BARS, which is a
    // fact wearing a chart costume — so we wrote the fact instead (the kicker, the hero,
    // the anchor cell). No comps bar either: this email is about a HOUSE, not a market.

    // The narrative is authored BELOW, and only from a real descriptive source. An empty
    // string here is an OPEN SLOT: an instruction on the canvas, absent from the email.
    narrative: "",
```

with:

```typescript
    specs: priceStrip(facts, previous),
    specFootnote: priceStripFootnote(facts, previous),

    // A reduction reserves ONE chart slot — where the NEW price sits against real
    // nearby comps (priceVsAreaDotSpec, filled below, in place, after the async comp
    // fetch). The was/now comparison stays a written fact, not a chart (two bars from
    // the SAME house is still a fact wearing a chart costume) — this is a DIFFERENT,
    // additional argument: the new price against the market. No reduction → no slot:
    // there is no price argument to make on a listing with no sourced cut.
    middle: kicker
      ? [
          {
            block: {
              id: createBlock("image").id,
              type: "image",
              props: {
                url: "",
                kind: "chart",
                alt: "The new price vs. nearby comparable homes",
                caption: "",
              },
            },
            height: 6,
          },
        ]
      : [],

    // The narrative is authored BELOW, and only from a real descriptive source. An empty
    // string here is an OPEN SLOT: an instruction on the canvas, absent from the email.
    narrative: "",
```

Then, immediately after the existing `doc = dropEmptyChartSlot(doc);` line (`price-reduced.ts:258-261`, currently commented "NO CHART. The chrome emits none, so this is a no-op today"), replace that comment block and add the chart-building step BEFORE the `dropEmptyChartSlot` call:

Replace:

```typescript
  // NO CHART. The chrome emits none, so this is a no-op today; it is the policy stated in
  // code, and it guards a chart slot ever arriving from anywhere. An empty chart box is
  // worse than no chart.
  doc = dropEmptyChartSlot(doc);
```

with:

```typescript
  // ── THE CHART: where the new price sits against real nearby comps. Comps are used
  // ONLY to compute this chart — NEVER handed to the narrator below, which stays
  // exactly as constrained as it has always been (zero market data, so it can never
  // invent a reason the price moved). A chart is a bonus, never a blocker: any miss
  // here (no comps, incoherent chart, fetch failure) simply drops the reserved slot.
  if (kicker && facts.address) {
    const result = await compsForAddress(facts.address, { topN: COMP_POOL }).catch(() => null);
    const spec = priceVsAreaDotSpec(facts, result?.comps ?? []);
    if (spec) {
      const coherence = assertHeroChartCoherence({
        hero: resolveHeadlineFigure(doc),
        chart: chartMagnitudeFromSpec(spec),
      });
      if (coherence.coherent) {
        const accent = doc.globalStyle.accentColor || "#B98F45";
        const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
        const key = `email-charts/price-reduced-${facts.zip ?? "swfl"}-${spec.asOf}-${tint}.png`;
        const image = await chartSpecToEmailImage(spec, accent, key).catch(() => null);
        if (image) doc = fillChartSlot(doc, image.url, image.alt, "");
      } else {
        console.log("[price-reduced] dropped incoherent chart:", coherence.reason);
      }
    }
  }
  // Nothing resolved (no reduction, no comps, incoherent) → drop the slot. An empty
  // chart box is worse than no chart.
  doc = dropEmptyChartSlot(doc);
```

Finally, add the local `fillChartSlot` helper (mirrors `market-comps.ts`'s private helper of the same name/shape — not extracted, since it's a 6-line generic block-filler with no business rule in it, unlike `isComparableHome`) right before `buildPriceReduced`:

```typescript
/** Fill the reserved chart slot IN PLACE (preserving its grid position). Mirrors the
 *  same private helper in market-comps.ts — a generic block-filler, not extracted, since
 *  it carries no business rule (unlike isComparableHome/perSqft/median, Task 8). */
function fillChartSlot(doc: EmailDoc, url: string, alt: string, caption: string): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "image" && b.props.kind === "chart" && !b.props.url
        ? { ...b, props: { ...b.props, url, alt, caption } }
        : b,
    ),
  };
}
```

Make `buildPriceReduced` await the new async block (it is already an `async function`, so no signature change — just ensure the new `if (kicker && facts.address) { ... }` block uses `await` inside, as written above).

- [ ] **Step 7: Run test to verify it passes**

Run: `bunx tsc --noEmit && bun test lib/deliverable/recipes/price-reduced.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/deliverable/recipes/price-reduced.ts lib/deliverable/recipes/price-reduced.test.ts
git commit -m "feat(deliverable): price-reduced gets a sourced chart (new price vs. area comps)"
```

---

### Task 11: Build-level test — the chart appears when sourced, drops cleanly when not

**Files:**
- 🟢 Test: `lib/deliverable/recipes/price-reduced.test.ts` (existing file — add to it)

**Interfaces:**
- Consumes: `buildPriceReduced` (existing export), mocked `compsForAddress` and `chartSpecToEmailImage`.

- [ ] **Step 1: Write the test**

Add to `lib/deliverable/recipes/price-reduced.test.ts`, following this file's existing mocking conventions for network-adjacent calls (mock `@/lib/assistant/comp-helper` and `@/lib/email/spec-to-png` the same `mock.module` + `afterAll` restore pattern used in `agent-launch.test.ts`):

```typescript
import { mock, afterAll } from "bun:test";
import * as realComp from "@/lib/assistant/comp-helper";
import * as realSpecToPng from "@/lib/email/spec-to-png";

const compOrig = { ...realComp };
const pngOrig = { ...realSpecToPng };
afterAll(() => {
  mock.module("@/lib/assistant/comp-helper", () => compOrig);
  mock.module("@/lib/email/spec-to-png", () => pngOrig);
});

mock.module("@/lib/assistant/comp-helper", () => ({
  ...compOrig,
  compsForAddress: async () => ({
    comps: [comp(440000, 2000), comp(460000, 2000)],
    asOf: "07/15/2026",
    needs: [],
  }),
}));
mock.module("@/lib/email/spec-to-png", () => ({
  ...pngOrig,
  chartSpecToEmailImage: async () => ({
    url: "https://cdn.example/chart.png",
    alt: "The new price vs. nearby comparable homes",
    caption: "",
  }),
}));

test("buildPriceReduced fills the chart slot when a reduction and real comps both exist", async () => {
  const { buildPriceReduced } = await import("./price-reduced");
  const facts = {
    address: "1 Main St, Fort Myers, FL 33905",
    price: "$400,000",
    sqft: "2000",
    isPriceReduced: true,
    priceReduction: "$50,000",
    photos: [],
  } as never;
  const doc = await buildPriceReduced({
    facts,
    currentDoc: { globalStyle: { accentColor: "#B98F45" }, blocks: [] } as never,
    prompt: "",
    recipe: RECIPES["price-reduced"],
    resolved: true,
  });
  const chartBlock = doc!.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
  expect(chartBlock?.props.url).toBe("https://cdn.example/chart.png");
});

test("buildPriceReduced has no chart block at all when there is no reduction", async () => {
  const { buildPriceReduced } = await import("./price-reduced");
  const facts = {
    address: "1 Main St, Fort Myers, FL 33905",
    price: "$400,000",
    sqft: "2000",
    isPriceReduced: false,
    photos: [],
  } as never;
  const doc = await buildPriceReduced({
    facts,
    currentDoc: { globalStyle: { accentColor: "#B98F45" }, blocks: [] } as never,
    prompt: "",
    recipe: RECIPES["price-reduced"],
    resolved: true,
  });
  const chartBlock = doc!.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
  expect(chartBlock).toBeUndefined(); // dropEmptyChartSlot removed the never-reserved slot
});
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `bun test lib/deliverable/recipes/price-reduced.test.ts`
Expected: with Task 10 already landed, this should PASS immediately (it exercises the wiring built there, with the network calls mocked). If it fails, check the mock paths match the exact import specifiers used in `price-reduced.ts` (`@/lib/assistant/comp-helper`, `@/lib/email/spec-to-png`).

- [ ] **Step 3: Run the full existing claim-gate regression suite**

Run: `bun test lib/deliverable/claims.test.ts lib/deliverable/recipes/market-comps.test.ts lib/deliverable/recipes/price-reduced.test.ts lib/deliverable/recipes/under-contract.test.ts lib/deliverable/recipes/agent-brand-intro.test.ts lib/deliverable/recipes/agent-launch.test.ts`
Expected: PASS across the board — nothing in Phase 1 or Phase 2 touches `auditClaims`, `gateNarrative`, or any banned-vocabulary regex.

- [ ] **Step 4: Commit**

```bash
git add lib/deliverable/recipes/price-reduced.test.ts
git commit -m "test(deliverable): price-reduced chart fills when sourced, drops cleanly when not"
```

---

## Self-Review Notes (from the plan-writing pass)

- **Spec coverage:** §1 (positioning field) → Task 1. §2 (shared block) → Task 2. §3 (three integration points, corrected from the original four/five) → Tasks 3–4–5 + Task 6 (negative guards). §4/§4a (content + magnitude tier, direction-symmetric) → Tasks 2 and 5. §5 (enforcement stays in the existing gate) → no task touches `claims.ts`, confirmed by Task 11 Step 3. "Charts carry the argument too" → Tasks 8–11. "Where this research lives" → Task 7 (CLAUDE.md + playbook) plus the already-committed spec header and memory entries (done in-session, before this plan was written).
- **Placeholder scan:** none found — every step has real, complete code and exact file paths.
- **Type consistency:** `priceVsAreaDotSpec(facts, comps)` (Task 10) matches its test calls (Task 10 Step 1) and its wiring inside `buildPriceReduced` (Task 10 Step 6). `isComparableHome`/`perSqft`/`median` signatures in Task 8's `shared.ts` addition match both their new call sites in Task 10 and their original call sites left behind in `market-comps.ts` (Task 8 Step 4) unchanged.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 9 | `lib/deliverable/recipes.ts`, `lib/deliverable/recipes.parity.test.ts` |
| 🟡 | Task 2, Task 3, Task 5, Task 8 | `lib/deliverable/recipes/shared.ts`, `lib/deliverable/recipes/shared.test.ts`, `lib/deliverable/recipes/market-comps.ts` |
| 🟢 | Task 10, Task 11 | `lib/deliverable/recipes/price-reduced.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
