# Sentence Banks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 6 tasks, 10 files, keywords: architecture

**Goal:** Shared sentence-bank engine + the first bank (price-reduced): approved words in code,
typed fill-in slots, model prose reduced to gated connective.

**Architecture:** One pure engine (`lib/deliverable/language.ts`) owns slot types, fill,
drop-whole, essential gaps, digit audit, and word count. Each recipe ships a bank file beside its
builder; a tiny registry maps recipe key → bank. Integration happens at the existing narrator seam
in `lib/deliverable/recipes/shared.ts` — code inserts filled bank sentences; the model only ADDS
digit-free connective, still behind the existing claim gate (shared.ts:606–634).

**Tech Stack:** TypeScript, bun:test, existing render harness (`scripts/email/render-price-reduced.mts`).

**Spec:** `docs/superpowers/specs/2026-08-10-sentence-banks-design.md` — read it first, especially
Decisions and Failure modes. Verbatim rules from it apply to every task below.

## Global Constraints

- TDD: failing test first, minimal implementation, green, commit. Test names name the failure mode they target.
- `git add <explicit paths>` only, commit per task, NO PUSH (operator approves pushes per-push).
- Verify with `bunx tsc --noEmit` and `bun test <file>` (bun skips `.env.local` in tests — known).
- A recipe WITHOUT a bank must build byte-identical to today (spec FM6).
- Bank templates are digit-free outside slots (spec FM1). MM/DD/YYYY dates. No invented values, ever — an unfillable slot stays unfilled.
- Body word floor is 50 (docs/standards/emails.md §0.1); the floor guard logs, never pads.
- Read `lib/deliverable/CLAUDE.md` + `lib/email/CLAUDE.md` before editing under them (they load automatically).
- The engine is PURE: no I/O, no LLM, no imports from recipe builders (banks import the engine, never the reverse).

---

### Task 1: Engine — types, `renderTemplate`, `auditBankTemplates`

**Files:**
- 🔴 Create: `lib/deliverable/language.ts`
- 🔴 Test: `lib/deliverable/language.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact names):

```ts
export type SlotType = "number" | "money" | "date" | "time" | "address" | "community" | "text";
export interface SlotDef {
  name: string;        // matches {{name}} in the template text
  type: SlotType;
  label: string;       // canvas instruction, e.g. "Open house time — fill in"
  essential?: boolean; // spec Decision 2: blocks a manual send when unfilled
}
export interface SentenceTemplate { text: string; slots: SlotDef[] }
export interface SentenceBank {
  recipe: string;      // RecipeKey value, e.g. "price-reduced"
  research: string[];  // _RESEARCH paths the words came from (spec FM5)
  sentences: SentenceTemplate[];
}
export function renderTemplate(t: SentenceTemplate, values: Record<string, string | undefined>): string | null;
export function auditBankTemplates(bank: SentenceBank): string[]; // violations, [] = clean
```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/deliverable/language.test.ts
import { describe, expect, test } from "bun:test";
import {
  auditBankTemplates,
  renderTemplate,
  type SentenceBank,
  type SentenceTemplate,
} from "./language";

const CUT: SentenceTemplate = {
  text: "The price on {{street}} just came down.",
  slots: [{ name: "street", type: "address", label: "Street address" }],
};

describe("renderTemplate", () => {
  test("fills every slot", () => {
    expect(renderTemplate(CUT, { street: "326 Shore Dr" })).toBe(
      "The price on 326 Shore Dr just came down.",
    );
  });
  test("FM: partial fill never ships — any missing slot → null, whole sentence", () => {
    expect(renderTemplate(CUT, {})).toBeNull();
    expect(renderTemplate(CUT, { street: "" })).toBeNull(); // empty string is not a value
  });
  test("FM: an unknown {{token}} in the text is a violation, not silent passthrough", () => {
    const bad: SentenceTemplate = { text: "See {{thing}}.", slots: [] };
    expect(renderTemplate(bad, {})).toBeNull();
  });
});

describe("auditBankTemplates (spec FM1: no digit outside a slot)", () => {
  const bank = (s: SentenceTemplate[]): SentenceBank => ({
    recipe: "price-reduced",
    research: ["_RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md"],
    sentences: s,
  });
  test("digit-free template with slots is clean", () => {
    expect(auditBankTemplates(bank([CUT]))).toEqual([]);
  });
  test("FM: a digit smuggled into fixed words is caught", () => {
    expect(
      auditBankTemplates(bank([{ text: "Over 1,000 buyers waiting.", slots: [] }])),
    ).not.toEqual([]);
  });
  test("FM: a declared slot missing from the text is caught", () => {
    expect(auditBankTemplates(bank([{ text: "No token here.", slots: CUT.slots }]))).not.toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/deliverable/language.test.ts`
Expected: FAIL — module `./language` not found.

- [ ] **Step 3: Minimal implementation**

```ts
// lib/deliverable/language.ts — sentence-bank engine. PURE: no I/O, no LLM.
// Spec: docs/superpowers/specs/2026-08-10-sentence-banks-design.md
// Drop-whole precedent note: voice-guard.ts:13 is phrase-surgical because model prose
// may carry a cited number in the same sentence; a TEMPLATE sentence's only content IS
// its slot — fixed words around a hole are the vendor blank-space failure (Mailchimp/
// HubSpot ship literal blanks — _RESEARCH/.../2026-08-09-merge-tag-fallback-vendor-docs.md).

export type SlotType = "number" | "money" | "date" | "time" | "address" | "community" | "text";

export interface SlotDef {
  name: string;
  type: SlotType;
  label: string;
  essential?: boolean;
}

export interface SentenceTemplate {
  text: string;
  slots: SlotDef[];
}

export interface SentenceBank {
  recipe: string;
  research: string[];
  sentences: SentenceTemplate[];
}

const TOKEN = /\{\{([a-z0-9_]+)\}\}/g;

/** Fill one template. ANY missing/empty slot value → null (drop WHOLE — never a gap). */
export function renderTemplate(
  t: SentenceTemplate,
  values: Record<string, string | undefined>,
): string | null {
  let ok = true;
  const out = t.text.replace(TOKEN, (_, name: string) => {
    const v = values[name]?.trim();
    if (!v) {
      ok = false;
      return "";
    }
    return v;
  });
  // A {{token}} with no matching SlotDef is a bank bug: refuse to render it.
  const declared = new Set(t.slots.map((s) => s.name));
  for (const m of t.text.matchAll(TOKEN)) if (!declared.has(m[1])) return null;
  return ok ? out : null;
}

/** Every violation in a bank: digits outside slots, undeclared/unused slots. [] = clean. */
export function auditBankTemplates(bank: SentenceBank): string[] {
  const violations: string[] = [];
  for (const t of bank.sentences) {
    const fixedWords = t.text.replace(TOKEN, " ");
    if (/\d/.test(fixedWords)) violations.push(`digit in fixed words: "${t.text}"`);
    const tokens = new Set([...t.text.matchAll(TOKEN)].map((m) => m[1]));
    for (const s of t.slots)
      if (!tokens.has(s.name)) violations.push(`slot "${s.name}" not in text: "${t.text}"`);
    for (const name of tokens)
      if (!t.slots.some((s) => s.name === name))
        violations.push(`token "{{${name}}}" undeclared: "${t.text}"`);
  }
  return violations;
}
```

- [ ] **Step 4: Run to verify green**

Run: `bun test lib/deliverable/language.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/language.ts lib/deliverable/language.test.ts
git commit -m "feat(deliverable): sentence-bank engine — templates, drop-whole render, digit audit" -- lib/deliverable/language.ts lib/deliverable/language.test.ts
```

---

### Task 2: Engine — `fillSentences`, `essentialGaps`, `bodyWordCount`

**Files:**
- 🔴 Modify: `lib/deliverable/language.ts` (append)
- 🔴 Test: `lib/deliverable/language.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 types.
- Produces:

```ts
export interface FilledBank { filled: string[]; droppedLabels: string[] }
export function fillSentences(bank: SentenceBank, values: Record<string, string | undefined>): FilledBank;
export function essentialGaps(bank: SentenceBank, values: Record<string, string | undefined>): string[]; // labels
export function bodyWordCount(text: string): number;
```

- [ ] **Step 1: Failing tests (append to language.test.ts)**

```ts
import { bodyWordCount, essentialGaps, fillSentences } from "./language";

const TIME_SLOT = {
  name: "time",
  type: "time" as const,
  label: "Open house time — fill in",
  essential: true,
};
const OH_BANK: SentenceBank = {
  recipe: "open-house",
  research: [],
  sentences: [
    { text: "Join us {{time}}.", slots: [TIME_SLOT] },
    { text: "Tucked inside {{community}}.", slots: [{ name: "community", type: "community", label: "Community" }] },
  ],
};

describe("fillSentences", () => {
  test("fills what it can, drops the rest whole, reports dropped labels", () => {
    const r = fillSentences(OH_BANK, { community: "Whiskey Creek" });
    expect(r.filled).toEqual(["Tucked inside Whiskey Creek."]);
    expect(r.droppedLabels).toEqual(["Open house time — fill in"]);
  });
});

describe("essentialGaps (spec Decision 2: essential blank blocks a manual send by name)", () => {
  test("names the essential gap; a filled essential is no gap", () => {
    expect(essentialGaps(OH_BANK, {})).toEqual(["Open house time — fill in"]);
    expect(essentialGaps(OH_BANK, { time: "Saturday, 1–3 PM" })).toEqual([]);
  });
  test("FM: a non-essential gap never blocks", () => {
    expect(essentialGaps(OH_BANK, { time: "Saturday, 1–3 PM" })).toEqual([]); // community unfilled
  });
});

describe("bodyWordCount (spec FM7: the 50-word floor was unguarded anywhere)", () => {
  test("counts words, not tokens", () => {
    expect(bodyWordCount("Two words.  And   three more!")).toBe(5);
    expect(bodyWordCount("")).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expected FAIL (functions not exported).**
- [ ] **Step 3: Minimal implementation (append to language.ts)**

```ts
export interface FilledBank {
  filled: string[];
  droppedLabels: string[];
}

/** Render every sentence; a sentence that can't fully fill drops WHOLE and reports the
 *  labels of its unfilled slots (the canvas instruction text). */
export function fillSentences(
  bank: SentenceBank,
  values: Record<string, string | undefined>,
): FilledBank {
  const filled: string[] = [];
  const droppedLabels: string[] = [];
  for (const t of bank.sentences) {
    const r = renderTemplate(t, values);
    if (r) filled.push(r);
    else
      droppedLabels.push(
        ...t.slots.filter((s) => !values[s.name]?.trim()).map((s) => s.label),
      );
  }
  return { filled, droppedLabels };
}

/** Labels of ESSENTIAL slots with no value — the send gate reads this (manual send
 *  blocks by name; scheduled sends skip-with-log — spec Decision 2). */
export function essentialGaps(
  bank: SentenceBank,
  values: Record<string, string | undefined>,
): string[] {
  const gaps: string[] = [];
  for (const t of bank.sentences)
    for (const s of t.slots)
      if (s.essential && !values[s.name]?.trim() && !gaps.includes(s.label)) gaps.push(s.label);
  return gaps;
}

/** Word count for the 50-word floor (emails.md §0.1) — previously unguarded in code. */
export function bodyWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
```

- [ ] **Step 4: Run — expected PASS.**
- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/language.ts lib/deliverable/language.test.ts
git commit -m "feat(deliverable): fillSentences + essentialGaps + bodyWordCount" -- lib/deliverable/language.ts lib/deliverable/language.test.ts
```

---

### Task 3: The price-reduced bank + registry

**Files:**
- Create: `lib/deliverable/recipes/price-reduced.language.ts`
- Create: `lib/deliverable/language-banks.ts`
- Test: `lib/deliverable/recipes/price-reduced.language.test.ts`

**Interfaces:**
- Consumes: Task 1/2 engine.
- Produces: `PRICE_REDUCED_BANK: SentenceBank` and `bankFor(recipe: string): SentenceBank | null`.

**Copy note (walk-reviewed):** these sentences are the STARTING set for the §2.7 walk (Task 6).
They obey the recipe's own walked framing (price-reduced.ts:522 — the cut is mentioned ONCE in
plain words, figures stay in the grid, no reason, no market claim, no urgency). That is why every
starting sentence is digit-free INCLUDING its slots — the numbers already sit in the hero and the
strip directly above the paragraph.

- [ ] **Step 1: Failing tests**

```ts
// lib/deliverable/recipes/price-reduced.language.test.ts
import { describe, expect, test } from "bun:test";
import { auditBankTemplates, fillSentences } from "../language";
import { PRICE_REDUCED_BANK } from "./price-reduced.language";
import { bankFor } from "../language-banks";

describe("PRICE_REDUCED_BANK", () => {
  test("FM1: every template digit-free outside slots", () => {
    expect(auditBankTemplates(PRICE_REDUCED_BANK)).toEqual([]);
  });
  test("FM5: cites its research by path", () => {
    expect(PRICE_REDUCED_BANK.research.length).toBeGreaterThan(0);
    for (const p of PRICE_REDUCED_BANK.research) expect(p.startsWith("_RESEARCH/")).toBe(true);
  });
  test("the cut sentence obeys the walked framing: plain words, no figures, once", () => {
    const r = fillSentences(PRICE_REDUCED_BANK, { street: "326 Shore Dr" });
    const cut = r.filled.filter((s) => /came down/i.test(s));
    expect(cut.length).toBe(1);
    expect(/\d/.test(cut[0].replace("326 Shore Dr", ""))).toBe(false);
  });
  test("community sentence drops whole on a miss — never a blank", () => {
    const r = fillSentences(PRICE_REDUCED_BANK, { street: "326 Shore Dr" });
    expect(r.filled.some((s) => /inside\s*\./i.test(s))).toBe(false);
  });
});

describe("bankFor registry (spec FM6)", () => {
  test("price-reduced resolves; an un-banked recipe is null", () => {
    expect(bankFor("price-reduced")).toBe(PRICE_REDUCED_BANK);
    expect(bankFor("just-sold")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expected FAIL.**
- [ ] **Step 3: Implementation**

```ts
// lib/deliverable/recipes/price-reduced.language.ts
//
// THE APPROVED WORDS for Price Improved — starting set for the §2.7 walk; the walk
// session may reword, and the reworded sentences replace these IN THIS FILE in the
// same session (never in a prompt, never in the playbook only).
//
// Register rules inherited from the recipe's own framing (price-reduced.ts:522):
// the cut is stated ONCE, plain words, NO figures (they sit in the hero + strip),
// no reason, no market claim, no urgency, no CTA (the button does that job).
import type { SentenceBank } from "../language";

export const PRICE_REDUCED_BANK: SentenceBank = {
  recipe: "price-reduced",
  research: [
    "_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md",
    "_RESEARCH/voice-and-positioning/2026-07-15-sell-side-copywriting-research.md",
    "_RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md",
  ],
  sentences: [
    {
      // The ONE legal mention of the move — plain words, zero figures.
      text: "The price on {{street}} just came down.",
      slots: [{ name: "street", type: "address", label: "Street address" }],
    },
    {
      // Auto-fills on a community match; drops whole on a miss (never "inside .").
      text: "The home sits inside {{community}}.",
      slots: [{ name: "community", type: "community", label: "Community name" }],
    },
  ],
};
```

```ts
// lib/deliverable/language-banks.ts — the ONE recipe-key → bank registry.
// Banks import the engine; builders import THIS. Never the reverse (keeps the
// engine pure and the recipes free of each other).
import type { SentenceBank } from "./language";
import { PRICE_REDUCED_BANK } from "./recipes/price-reduced.language";

const BANKS: Record<string, SentenceBank> = {
  "price-reduced": PRICE_REDUCED_BANK,
};

/** Null for an un-banked recipe — its builder runs EXACTLY today's path (spec FM6). */
export function bankFor(recipe: string): SentenceBank | null {
  return BANKS[recipe] ?? null;
}
```

- [ ] **Step 4: Run — expected PASS.**
- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes/price-reduced.language.ts lib/deliverable/recipes/price-reduced.language.test.ts lib/deliverable/language-banks.ts
git commit -m "feat(deliverable): price-reduced sentence bank + bankFor registry" -- lib/deliverable/recipes/price-reduced.language.ts lib/deliverable/recipes/price-reduced.language.test.ts lib/deliverable/language-banks.ts
```

---

### Task 4: Integration — bank sentences into `buildPriceReduced`, connective additive-only, floor guard

**Files:**
- Modify: `lib/deliverable/recipes/price-reduced.ts` (the narrative section, lines ~488–585)
- Test: `lib/deliverable/recipes/price-reduced.test.ts` (append)

**Interfaces:**
- Consumes: `fillSentences`, `bodyWordCount` (engine); `bankFor` (registry); existing
  `authorListingNarrative(facts, { framing, anchors, descriptionRendered })` — UNCHANGED.
- Produces: the final paragraph = `[...bankFilled, connective].join(" ")`, assembled by CODE.

**How this respects the existing seams (read before editing):**
- The model NEVER sees bank sentences as rewritable text. They are NOT passed for rewriting; the
  framing tells the model they exist so it doesn't repeat them, and code prepends them after the
  call returns. The claim gate inside `authorListingNarrative` keeps gating the model's own prose
  exactly as today (spec FM2).
- The cut sentence duplicates the framing's "you may refer to the fact the price came down ONCE" —
  so when the bank supplies that sentence, the framing must now FORBID the model restating the
  move at all (the ONE mention is the bank's now).
- Slot values come from the recipe's already-resolved `facts` — the engine never fetches (FM3).

- [ ] **Step 1: Failing test (append to price-reduced.test.ts)**

```ts
import { bankFor } from "../language-banks";
import { fillSentences, bodyWordCount } from "../language";
import { bankValues } from "./price-reduced";

describe("sentence-bank integration", () => {
  const facts = {
    // minimal ListingFacts shape used by bankValues — mirror the file's existing test fixtures
    address: "326 Shore Dr, Fort Myers, FL 33905",
    isPriceReduced: true,
    priceReduction: "$104,975",
    price: "$595,000",
    photos: [],
  } as unknown as import("@/lib/email/listing-scrape").ListingFacts;

  test("bankValues maps facts → slot values (street from the address's first segment)", () => {
    expect(bankValues(facts).street).toBe("326 Shore Dr");
  });
  test("no reduction → no cut slot value → the cut sentence drops whole", () => {
    const v = bankValues({ ...facts, isPriceReduced: false } as typeof facts);
    const r = fillSentences(bankFor("price-reduced")!, v);
    expect(r.filled.some((s) => /came down/i.test(s))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expected FAIL (`bankValues` not exported).**
- [ ] **Step 3: Implementation (in price-reduced.ts)**

Add the exported mapper (near `previousPrice`):

```ts
/** Slot values for PRICE_REDUCED_BANK, from the recipe's ALREADY-RESOLVED facts —
 *  the engine never fetches (spec FM3). The cut sentence only earns its slot value
 *  when the vendor actually flags a reduction — same condition as the kicker, so the
 *  bank can never announce a move the record doesn't hold. */
export function bankValues(facts: ListingFacts): Record<string, string | undefined> {
  const street = (facts.address ?? "").split(",")[0]?.trim() || undefined;
  return {
    street: facts.isPriceReduced ? street : undefined,
    community: facts.communityName?.trim() || undefined,
  };
}
```

(If `ListingFacts` has no `communityName` field, check what the community lane actually exposes —
`lib/listings/community-lookup.ts` / the settled-facts lines in `shared.ts` — and map from the
field that exists. Do NOT invent a field; if no resolved community value reaches this builder
today, set `community: undefined` with a comment naming where it will come from, and the sentence
simply drops until that lane is wired.)

Then, in `buildPriceReduced`, replace the narrative assembly (after `clearNarrativeSlots`):

```ts
  const bank = bankFor("price-reduced");
  const bankFilled = bank ? fillSentences(bank, bankValues(facts)).filled : [];

  // The bank now owns the ONE legal mention of the move — the model may not restate it.
  const bankAddendum = bankFilled.length
    ? "\n• THESE SENTENCES ALREADY OPEN THE PARAGRAPH (written by us, not you — do not " +
      "repeat, rephrase, or contradict them): " +
      bankFilled.map((s) => `"${s}"`).join(" ") +
      "\n• Because the price move is already stated above, you may NOT mention it again in any words."
    : "";

  let narrative: string | null = null;
  for (let attempt = 0; attempt < 2 && !narrative; attempt++) {
    narrative = await authorListingNarrative(facts, {
      framing: framing + bankAddendum,
      ...(previous ? { anchors: [`The previous asking price was ${previous}.`] } : {}),
      descriptionRendered: hasRemarks,
    }).catch(() => null);
  }

  // CODE assembles: bank first, connective after. The model never touched the bank words.
  const paragraph = [...bankFilled, narrative ?? ""].join(" ").trim();

  // FLOOR GUARD (spec FM7, emails.md §0.1 — previously unguarded anywhere in the build
  // path): under 50 words is logged LOUDLY, never padded and never blocked — the grid
  // still carries the email; the log is what makes the shortfall visible.
  if (paragraph && bodyWordCount(paragraph) < 50) {
    console.error(
      `[price-reduced] body ${bodyWordCount(paragraph)} words — under the 50-word floor ` +
        `(bank ${bankFilled.length} sentence(s), connective ${narrative ? "ran" : "dropped"})`,
    );
  }
  if (paragraph) doc = fillNarrative(doc, paragraph);
```

Delete the old `if (narrative) doc = fillNarrative(doc, narrative);` line — the assembly above
replaces it. Everything else in the builder stays byte-identical.

- [ ] **Step 4: Run the recipe's whole suite**

Run: `bun test lib/deliverable/recipes/price-reduced.test.ts lib/deliverable/language.test.ts lib/deliverable/recipes/price-reduced.language.test.ts`
Expected: PASS, including all pre-existing tests (the doc-parses guard especially).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/deliverable/recipes/price-reduced.ts lib/deliverable/recipes/price-reduced.test.ts
git commit -m "feat(email): price-reduced rides its sentence bank — code-owned cut sentence, additive-only connective, floor guard" -- lib/deliverable/recipes/price-reduced.ts lib/deliverable/recipes/price-reduced.test.ts
```

---

### Task 5: Render + acceptance run (RENDER IT AND LOOK)

**Files:**
- Modify: `scripts/email/render-price-reduced.mts` (add assertions; keep the existing 6)

- [ ] **Step 1: Add three assertions to the harness, off the RENDERED bytes**

Follow the file's existing assertion pattern exactly (read it first). New assertions:

1. BANK VERBATIM: if the subject listing is flagged reduced, the rendered body contains the
   bank's cut sentence with the real street filled in, character-for-character.
2. NO DOUBLE MOVE: the body states the price move at most once (count case-insensitive matches
   of the move: the bank's own phrase plus the forbidden restatement family
   `/price.{0,20}(came down|reduced|cut|lowered|improved|adjusted)/i` — total ≤ 1).
3. FLOOR VISIBILITY: the run prints the body word count; under 50 the harness prints the same
   loud line the builder logs (the harness never fails the run on the floor — it fails on a
   GAP: any literal `{{` in rendered output is an instant FAIL).

- [ ] **Step 2: Run the acceptance harness on the real subject**

Run: `bun scripts/email/render-price-reduced.mts`
Expected: all original assertions still pass + the three new ones. Note the metered-call count
the harness reports — record it in the §2.7 walk (Task 6).

- [ ] **Step 3: Open the capture and LOOK** (`public/new-emails/price-reduced-email.html` or the
      harness's output path — whichever the script writes). A green suite is not evidence for a
      rendered artifact; confirm the paragraph opens with the bank sentence and reads as one
      voice.

- [ ] **Step 4: Commit**

```bash
git add scripts/email/render-price-reduced.mts
git commit -m "test(email): price-reduced acceptance asserts bank-verbatim, single move mention, no template residue" -- scripts/email/render-price-reduced.mts
```

---

### Task 6: §2.7 playbook walk + spec/status bookkeeping

**Files:**
- Modify: `docs/standards/email-build-playbook.md` (replace the `## 2.6 – 2.7 — TO BE WALKED`
  stub with `## 2.6 — TO BE WALKED` + a real `## 2.7 PRICE IMPROVED — tag price-reduced` section)
- Modify: `SESSION_LOG.md` (entry before any push)

- [ ] **Step 1: Write §2.7 from what the build PROVED** — never from memory (the playbook's own
      law). Structure it like §2.5 (Just Sold): ingredients and their lanes (the cut =
      vendor's stated `reduced_amount`; previous price = the one derivation, current + cut;
      photo/description = paid-row when held), the bank subsection listing the approved
      sentences VERBATIM with their slots and research citations (this is the Voice Card
      §1.20 extension the spec requires), the narrator's prohibition list (already in the
      recipe at price-reduced.ts:522 — cite, don't restate), and the acceptance evidence from
      Task 5's run (assertion count, metered-call count, capture path).
- [ ] **Step 2: Flag for operator review** — the walk section is the operator's artifact; mark
      the bank sentences "starting set — reword in walk review" until he signs off.
- [ ] **Step 3: SESSION_LOG entry** (what shipped, what's next, the §2.7 correction note), then
      STOP — the operator approves pushes per-push. Ask before `node scripts/safe-push.mjs`.
- [ ] **Step 4: Commit**

```bash
git add docs/standards/email-build-playbook.md SESSION_LOG.md
git commit -m "docs(playbook): §2.7 Price Improved walked — bank sentences, lanes, acceptance evidence" -- docs/standards/email-build-playbook.md SESSION_LOG.md
```

---

## Deferred by design (tracked, not silent)

- **Send-path essential blocking:** price-reduced has NO builder-typed essential slot (its cut is
  lane-1; when absent the recipe already flips to the non-reduced framing). The first real
  essential slot is open-house's time — the send-gate wiring ships with open-house's bank
  (rollout step 2, spec Rollout). `essentialGaps` is built and tested NOW (Task 2) so that build
  wires, not designs.
- **Connective-skip when bank alone ≥ 50 words:** price-reduced's starting bank is ~2 short
  sentences — the skip can't trigger. The mechanism (count `bankFilled` words before calling the
  narrator, skip when ≥ 50) lands with the first bank big enough to use it. The floor guard
  (which IS wired now) is the same counter.

## Self-review notes

Spec coverage: engine (A→Tasks 1–2), bank+registry (B→Task 3), narrator integration + 0.7b
zero-call posture + floor guard (C/D→Task 4), canvas open slots (existing mechanics, no new code —
spec D), acceptance (Testing→Task 5), walk/Voice Card (B→Task 6), FM1–FM8 each named in a test or
an explicit deferral above. Types checked: `SentenceBank`/`fillSentences`/`essentialGaps`/
`bodyWordCount`/`bankFor`/`bankValues` used consistently across tasks.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `lib/deliverable/language.ts`, `lib/deliverable/language.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
