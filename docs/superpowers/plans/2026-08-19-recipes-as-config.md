# Recipes-as-Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 11 files, keywords: migration, architecture

**Goal:** Collapse the 7 hand-coded listing-lifecycle recipe builders into JSON-serializable `RecipeConfig` literals consumed by ONE config builder, with the irreducible math in a keyed derivations registry — net-negative lines, behind per-recipe render parity.

**Architecture:** Promote the boundary that already exists (`buildLifecycleEmail` chrome vs. recipe) into a declared one. A `RecipeConfig` (a new field ON the existing `Recipe` entries in `lib/deliverable/recipes.ts` — never a second registry) declares ribbon/CTA/subject-templates/spec-cell-keys/narrator-framing; a keyed cell catalog owns labels+formatters+policy class; a keyed derivations registry owns the genuinely computational parts (`under-contract/speed`, comps banding, …); `buildFromConfig` consumes config + derivations and hands `buildLifecycleEmail` its chrome exactly as today's builders do.

**Tech Stack:** TypeScript, bun test, existing seams: `lib/email/lifecycle-chrome.ts` (untouched), `lib/deliverable/recipes.ts`, `lib/deliverable/recipes/shared.ts`, `lib/deliverable/cell-policy.ts`, `lib/deliverable/language-banks.ts`, acceptance scripts `scripts/email/render-*.mts`.

**Spec:** `docs/superpowers/specs/2026-08-18-recipes-as-config-amendment-design.md` (+ registration stub `2026-08-19-recipes-as-config-design.md`). Check: `recipes_as_config_live_verify`.

## Global Constraints

- **Approach B only** — config over shared builders. NO mini-language: `RecipeConfig` must survive `JSON.parse(JSON.stringify(config))` identical; a function value inside a config fails the fleet test. Anything needing logic is a NAMED derivation referenced BY KEY.
- **One registry** — configs live INSIDE the existing `Recipe` entry (`recipes.ts` gains a `config?` field). A parallel config store is the 08/02 sin re-committed; the operator's standing suspicion ("same thing as lib/email... typical Claude", 08/18/2026) is refuted only by NET-NEGATIVE lines and zero new roots.
- **`buildLifecycleEmail` is untouched** — spec "Out of scope". The chrome stays the ONE layout authority.
- **Parity gate per recipe** — each migration rides its existing acceptance render script (`scripts/email/render-<key>.mts`, RED assertions intact) + `registry-seam.test.ts` (all builders run twice over two contexts → identical docs; determinism is load-bearing).
- **Cell-policy is structural** — the catalog carries a policy class per cell key; a cost-class cell referenced by a buyer-facing config fails the fleet test BEFORE the chrome's render-time backstop (`stripBannedCells`) even runs.
- **Never refuse a build (RULE 0.7)** — unresolved cell → open slot (undefined value, instructive label); unknown derivation key → fleet-test failure at CI, skipped block at runtime, never a throw.
- **Comments are institutional memory** — decree comments (dated operator quotes) move WITH the code they govern (into the catalog entry, derivation, or config-side comment), never deleted.
- **Wave order (operator decree 08/18/2026):** seam + under-contract parity first, then the remaining lifecycle emails as a WAVE. Non-lifecycle recipes migrate per-touch AFTER the wave. Quick-swap (cycle button, paid) is OUT of this plan — it needs ≥2 authored alternate grids; check stays open.
- Sentence banks (`language-banks.ts`) are consumed exactly as today via `bankFor(key)` — a config carries no bank reference in this plan (the keyed registry already keys on `RecipeKey`; adding a second pointer would be a duplicate root).
- Commit per task; `bun test lib/deliverable lib/email` + `bunx next build` green before each commit is claimed done (RULE 0.8: paste output).

## File Structure

- Create: `lib/deliverable/recipes/config.ts` — `RecipeConfig` type + `SUBJECT_TEMPLATE` placeholder contract. Types only + tiny pure helpers.
- Create: `lib/deliverable/recipes/config.test.ts` — serializability fleet test + template tests.
- Create: `lib/deliverable/recipes/cell-catalog.ts` — `CELL_CATALOG` keyed record + `resolveCells()`.
- Create: `lib/deliverable/recipes/cell-catalog.test.ts`.
- Create: `lib/deliverable/recipes/derivations.ts` — `DERIVATIONS` keyed record + types.
- Create: `lib/deliverable/recipes/derivations.test.ts`.
- Create: `lib/deliverable/recipes/config-builder.ts` — `buildFromConfig()`.
- Create: `lib/deliverable/recipes/config-builder.test.ts`.
- Modify: `lib/deliverable/recipes.ts` — `Recipe` gains `config?: RecipeConfig`; lifecycle entries gain literals as they migrate.
- Modify: `lib/deliverable/recipes/index.ts` — dispatch prefers `recipe.config` → `buildFromConfig`; explicit builder entries deleted as recipes migrate.
- Modify then shrink: `lib/deliverable/recipes/{under-contract,new-listing,coming-soon,just-sold,open-house,price-reduced,market-comps}.ts` — each collapses to its derivations module (or is deleted when nothing irreducible remains).
- Modify: `scripts/email/status.mts` + regen `docs/standards/email-status.md` (new `config` column).

---

### Task 1: `RecipeConfig` type + serializability fleet test

**Files:**
- Create: `lib/deliverable/recipes/config.ts`
- Test: `lib/deliverable/recipes/config.test.ts`

**Interfaces:**
- Produces: `RecipeConfig`, `renderTemplate(tpl: string, vars: Record<string, string>): string`, `CONFIGURED_RECIPES(): { key: RecipeKey; config: RecipeConfig }[]` (reads `RECIPES`, returns entries carrying a config — the fleet tests iterate this so every later migration is auto-covered).

- [ ] **Step 1: Write the failing test**

```ts
// lib/deliverable/recipes/config.test.ts
import { describe, expect, test } from "bun:test";
import { RECIPES } from "@/lib/deliverable/recipes";
import { CONFIGURED_RECIPES, renderTemplate } from "./config";

describe("RecipeConfig fleet", () => {
  test("every config survives a JSON round-trip identical (NO functions, NO Dates)", () => {
    for (const { key, config } of CONFIGURED_RECIPES()) {
      expect(JSON.parse(JSON.stringify(config))).toEqual(config as unknown as object);
      expect(key).toBe(config.key);
    }
  });
  test("configs live INSIDE the one registry — CONFIGURED_RECIPES reads RECIPES", () => {
    for (const { key, config } of CONFIGURED_RECIPES()) {
      expect(RECIPES[key].config).toBe(config);
    }
  });
});

describe("renderTemplate", () => {
  test("fills {placeholders} and leaves unknown ones empty", () => {
    expect(renderTemplate("Under contract: {street}", { street: "326 Shore Dr" })).toBe(
      "Under contract: 326 Shore Dr",
    );
    expect(renderTemplate("Hi {nobody}", {})).toBe("Hi ");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test lib/deliverable/recipes/config.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/deliverable/recipes/config.ts
//
// THE DECLARATIVE ~80% OF A LIFECYCLE RECIPE (amendment 2026-08-18, Approach B).
// A RecipeConfig is DATA: it must survive JSON.parse(JSON.stringify(c)) identical —
// config.test.ts enforces this over every configured recipe. Anything needing logic
// is a NAMED derivation in derivations.ts, referenced BY KEY.
import { RECIPES, RECIPE_KEYS } from "@/lib/deliverable/recipes";
import type { RecipeKey } from "@/lib/deliverable/recipes";
import type { CellKey } from "./cell-catalog";
import type { DerivationKey } from "./derivations";

/** Where the ONE button lands. An enum, never a URL template — §1.8's rule that the
 *  label must match the destination is enforced by the builder, per destination kind.
 *  "brand-site": agent's own site (brandWebsiteUrl(currentDoc) ?? SWFL site).
 *  "listing": the subject's real listing page via listingButtonUrl(facts); unresolved →
 *  the slot stays empty, NEVER our homepage (role "listing" semantics). */
export type CtaDestination = "brand-site" | "listing";

export interface RecipeConfig {
  key: RecipeKey;
  /** The chrome's ribbon word — "Under Contract", "Just Sold", … */
  ribbon: string;
  /** Subject-line templates, deterministic, never model-authored. Placeholders:
   *  {street} {city} {days}. Resolution ladder: withStreet → withCity → bare. */
  subject: { withStreet: string; withCity: string; bare: string };
  /** Photo alt template. Placeholder: {address}. */
  photoAlt: string;
  /** Ordered spec-strip cells, by catalog key. The HOA incident lived exactly here. */
  specs: CellKey[];
  /** Suppress the street address everywhere (coming-soon's whole point). */
  suppressAddress?: boolean;
  /** Render the seller's remarks verbatim in the reserved descriptionSlot. */
  includeDescription: boolean;
  /** The recipe's own MIDDLE + TAIL + narrator, in the derivations registry. Order
   *  is render order for middles. */
  middle: DerivationKey[];
  tail: DerivationKey[];
  /** The ONE button. */
  ctaLabel: string;
  ctaDestination: CtaDestination;
  /** Narrator framing prose (data, not code). Absent = no narrator call: the
   *  narrative slot ships as an open slot. `common` is always appended. */
  framing?: { withDescription: string; withoutDescription: string; common: string };
  /** Phrases that DROP the authored paragraph to an open slot (lowercased match) —
   *  under-contract's SOLD_LANGUAGE class. Render scripts read this same field. */
  bannedNarrativePhrases?: string[];
  /** Facts stripped from the narrator's sheet (claim-gate architecture: a fact you
   *  hand the writer is a fact it will try to use). Keys of ListingFacts. */
  narratorStrips?: string[];
  /** Numeric knobs a derivation reads (e.g. minMedianSample). Flat and serializable. */
  params?: Record<string, number | string>;
}

/** Template fill: "{street}" → vars.street ?? "". Unknown placeholder → "". */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** Every registry entry that carries a config — the fleet tests iterate THIS, so a
 *  migrated recipe is covered the moment its literal lands in RECIPES. */
export function CONFIGURED_RECIPES(): { key: RecipeKey; config: RecipeConfig }[] {
  const out: { key: RecipeKey; config: RecipeConfig }[] = [];
  for (const key of RECIPE_KEYS) {
    const config = RECIPES[key].config;
    if (config) out.push({ key, config });
  }
  return out;
}
```

Also in this task, `lib/deliverable/recipes.ts`: add to `Recipe`:

```ts
  /** Recipes-as-config (spec 2026-08-18): the declarative layer consumed by
   *  buildFromConfig. Present = this recipe is migrated; index.ts dispatches on it.
   *  Lives HERE because this file is the ONE registry — never a sibling store. */
  config?: import("./recipes/config").RecipeConfig;
```

(Use a type-only import to avoid a cycle: `recipes.ts` → type of config; `config.ts` → values of `recipes.ts`. Type-only imports are erased at runtime, so no cycle exists in emitted JS.)

- [ ] **Step 4: Run** — `bun test lib/deliverable/recipes/config.test.ts` → PASS (fleet loops are vacuous until Task 5 lands the first config — that is by design). Then `bunx tsc` via `bun test lib/deliverable` for regressions.

- [ ] **Step 5: Commit** — `git add lib/deliverable/recipes/config.ts lib/deliverable/recipes/config.test.ts lib/deliverable/recipes.ts && git commit -m "feat(recipes-config): RecipeConfig seam — type, template engine, serializability fleet test"`

---

### Task 2: The cell catalog

**Files:**
- Create: `lib/deliverable/recipes/cell-catalog.ts`
- Test: `lib/deliverable/recipes/cell-catalog.test.ts`

**Interfaces:**
- Consumes: `spec`, `pricePerSqft`, `shortType` from `@/lib/email/listing-flyer`; `withCommas` from `@/lib/format-number`; `bannedCellRule` from `@/lib/deliverable/cell-policy`; `StatItem` from `@/lib/email/doc/types`; `ListingFacts` from `@/lib/email/listing-scrape`.
- Produces: `CellKey` (string-literal union), `CELL_CATALOG: Record<CellKey, CellDef>`, `resolveCells(keys: CellKey[], facts: ListingFacts): StatItem[]`.

- [ ] **Step 1: Failing test**

```ts
// lib/deliverable/recipes/cell-catalog.test.ts
import { describe, expect, test } from "bun:test";
import { bannedCellRule } from "@/lib/deliverable/cell-policy";
import { CELL_CATALOG, resolveCells } from "./cell-catalog";
import { CONFIGURED_RECIPES } from "./config";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const FACTS = {
  beds: "3", baths: "2", sqft: 1450, price: "$399,000",
  lotSize: "0.19 ac", propertyType: "Single Family Residence",
  address: "326 Shore Dr, Fort Myers Beach, FL 33931", photos: [],
} as unknown as ListingFacts;

describe("CELL_CATALOG", () => {
  test("every catalog label is clean against cell-policy (a banned label may not even be authored)", () => {
    for (const def of Object.values(CELL_CATALOG)) {
      expect(bannedCellRule(def.label)).toBeNull();
    }
  });
  test("resolveCells maps keys in order; a missing fact is an OPEN SLOT, never a zero", () => {
    const cells = resolveCells(["beds", "baths", "sqft", "price-per-sqft", "lot", "type"], FACTS);
    expect(cells.map((c) => c.label)).toEqual(["Beds", "Baths", "Sq Ft", "$/Sq Ft", "Lot", "Type"]);
    expect(cells[0].value).toBe("3");
    expect(cells[2].value).toBe("1,450");
    const empty = resolveCells(["beds"], {} as ListingFacts);
    expect(empty[0].value).toBeUndefined(); // open slot
  });
  test("no configured recipe references a key outside the catalog", () => {
    for (const { config } of CONFIGURED_RECIPES()) {
      for (const k of config.specs) expect(CELL_CATALOG[k]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run** — `bun test lib/deliverable/recipes/cell-catalog.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/deliverable/recipes/cell-catalog.ts
//
// THE ONE CELL CATALOG. Each key owns its LABEL, its source field, and its formatter,
// so a content ruling ("no HOA cell") or a label fix is a one-line change here, walked
// to every configured recipe automatically. Labels are checked clean against
// cell-policy at TEST time (cell-catalog.test.ts) — the render-time chrome backstop
// stays as the second line, exactly as before.
//
// THE UNIT IS ALREADY IN THE VALUE (under-contract lesson, 08/06/2026 — "0.19 ac ac"):
// resolve-subject.ts formats lot_acres as "0.19 ac" before a recipe sees it. Formatters
// here NEVER append a unit the spine already printed.
import { withCommas } from "@/lib/format-number";
import { pricePerSqft, shortType, spec } from "@/lib/email/listing-flyer";
import type { StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export interface CellDef {
  label: string;
  /** The reader-facing value, or undefined = OPEN SLOT (RULE 0.7 — never a zero). */
  value: (facts: ListingFacts) => string | number | undefined;
}

export const CELL_CATALOG = {
  beds: { label: "Beds", value: (f) => f.beds ?? undefined },
  baths: { label: "Baths", value: (f) => f.baths ?? undefined },
  sqft: { label: "Sq Ft", value: (f) => withCommas(f.sqft) },
  "price-per-sqft": { label: "$/Sq Ft", value: (f) => pricePerSqft(f.price, f.sqft) },
  lot: { label: "Lot", value: (f) => f.lotSize ?? undefined },
  type: { label: "Type", value: (f) => shortType(f.propertyType) || undefined },
} as const satisfies Record<string, CellDef>;

export type CellKey = keyof typeof CELL_CATALOG;

/** Keys → StatItems, in order. Total: an unknown-at-runtime key is skipped (the fleet
 *  test makes that unreachable from a committed config). */
export function resolveCells(keys: CellKey[], facts: ListingFacts): StatItem[] {
  return keys
    .filter((k) => CELL_CATALOG[k])
    .map((k) => spec(CELL_CATALOG[k].value(facts), CELL_CATALOG[k].label));
}
```

NOTE for the implementer: check `spec()`'s exact signature in `lib/email/listing-flyer.ts` before writing — under-contract calls it as `spec(facts.beds, "Beds")` (value first, label second) and passes `withCommas(facts.sqft)` and `undefined` values. Match it exactly; if `spec` narrows types, adjust `CellDef.value`'s return to what `spec` accepts.

- [ ] **Step 4: Run** — `bun test lib/deliverable/recipes/cell-catalog.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add lib/deliverable/recipes/cell-catalog.ts lib/deliverable/recipes/cell-catalog.test.ts && git commit -m "feat(recipes-config): keyed cell catalog — labels+formatters+policy-clean, one ruling walks the fleet"`

---

### Task 3: The derivations registry

**Files:**
- 🔴 Create: `lib/deliverable/recipes/derivations.ts`
- Test: `lib/deliverable/recipes/derivations.test.ts`

**Interfaces:**
- Consumes: `RecipeBuildContext` from `./index`; `ChromeBlock` from `@/lib/email/lifecycle-chrome`.
- Produces: `DerivationKey` (string union — grows per migration), `DerivationResult { blocks: ChromeBlock[]; subjectVars?: Record<string, string> }`, `DERIVATIONS: Record<DerivationKey, Derivation>`, `runDerivations(keys, ctx, params): Promise<{ blocks: ChromeBlock[]; subjectVars: Record<string, string> }>`.

- [ ] **Step 1: Failing test**

```ts
// lib/deliverable/recipes/derivations.test.ts
import { describe, expect, test } from "bun:test";
import { CONFIGURED_RECIPES } from "./config";
import { DERIVATIONS, runDerivations } from "./derivations";

describe("derivations registry", () => {
  test("every derivation key referenced by a configured recipe exists", () => {
    for (const { config } of CONFIGURED_RECIPES()) {
      for (const k of [...config.middle, ...config.tail]) {
        expect(DERIVATIONS[k]).toBeDefined();
      }
    }
  });
  test("runDerivations is empty-tolerant: no keys → no blocks, never throws", async () => {
    const r = await runDerivations([], {} as never, {});
    expect(r.blocks).toEqual([]);
    expect(r.subjectVars).toEqual({});
  });
  test("a failing derivation degrades to no blocks (RULE 0.7), never a throw", async () => {
    (DERIVATIONS as Record<string, unknown>)["__test-boom"] = async () => {
      throw new Error("boom");
    };
    const r = await runDerivations(["__test-boom" as never], {} as never, {});
    expect(r.blocks).toEqual([]);
    delete (DERIVATIONS as Record<string, unknown>)["__test-boom"];
  });
});
```

- [ ] **Step 2: Run** → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/deliverable/recipes/derivations.ts
//
// THE IRREDUCIBLE ~20%. Named, typed functions a config references BY KEY — the
// speed ladder, comps banding, scarcity funnels. The registry is Partial-free on
// purpose: a config referencing a missing key fails derivations.test.ts at CI.
// At runtime a derivation that throws degrades to NO blocks (RULE 0.7): the email
// ships quieter, never broken, never invented.
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import type { RecipeBuildContext } from "./index";

export interface DerivationResult {
  /** Blocks for the slot (middle or tail) the config listed this key under. */
  blocks: ChromeBlock[];
  /** Values the subject-line templates may reference (e.g. { days: "9" }). */
  subjectVars?: Record<string, string>;
}

export type Derivation = (
  ctx: RecipeBuildContext,
  params: Record<string, number | string>,
) => Promise<DerivationResult>;

/** Keys land here per migration (Task 5+): "under-contract/speed", … */
export const DERIVATIONS: Record<string, Derivation> = {};

export type DerivationKey = keyof typeof DERIVATIONS & string;

export async function runDerivations(
  keys: string[],
  ctx: RecipeBuildContext,
  params: Record<string, number | string>,
): Promise<{ blocks: ChromeBlock[]; subjectVars: Record<string, string> }> {
  const blocks: ChromeBlock[] = [];
  const subjectVars: Record<string, string> = {};
  for (const k of keys) {
    const d = DERIVATIONS[k];
    if (!d) continue;
    try {
      const r = await d(ctx, params);
      blocks.push(...r.blocks);
      Object.assign(subjectVars, r.subjectVars ?? {});
    } catch {
      /* degrade quiet — the email ships without this block */
    }
  }
  return { blocks, subjectVars };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git add lib/deliverable/recipes/derivations.ts lib/deliverable/recipes/derivations.test.ts && git commit -m "feat(recipes-config): keyed derivations registry — the irreducible 20%, empty-tolerant"`

---

### Task 4: `buildFromConfig` — the one config builder

**Files:**
- Create: `lib/deliverable/recipes/config-builder.ts`
- Test: `lib/deliverable/recipes/config-builder.test.ts`
- 🔴 Modify: `lib/deliverable/recipes/index.ts` (dispatch)

**Interfaces:**
- Consumes: everything above + `buildLifecycleEmail`, `LifecycleChrome` from `@/lib/email/lifecycle-chrome`; `addressLineOf`, `listingDescription`, `specFootnote` from `@/lib/email/listing-flyer`; `brandWebsiteUrl` from `@/lib/email/inject-photo`; `listingButtonUrl` (find its export — grep `listingButtonUrl` in `lib/email/`; it is the 08/05 ONE root for listing CTAs); `authorListingNarrative`, `clearNarrativeSlots`, `fillNarrative` from `./shared`.
- Produces: `buildFromConfig(ctx: RecipeBuildContext, config: RecipeConfig): Promise<EmailDoc | null>`.

- [ ] **Step 1: Failing tests** — pin the pure seams (subject ladder, address gate, CTA destination, banned-phrase drop). Narrator + DB never fire in tests (no creds → framing path exercised with a stub derivation only).

```ts
// lib/deliverable/recipes/config-builder.test.ts
import { describe, expect, test } from "bun:test";
import { subjectFor, resolveCtaUrl, cleanNarrative } from "./config-builder";
import type { RecipeConfig } from "./config";

const CFG: RecipeConfig = {
  key: "under-contract",
  ribbon: "Under Contract",
  subject: {
    withStreet: "Under contract: {street}",
    withCity: "Under contract in {city}",
    bare: "Under contract",
  },
  photoAlt: "Under contract — {address}",
  specs: ["beds", "baths", "sqft", "price-per-sqft", "lot", "type"],
  includeDescription: true,
  middle: [],
  tail: [],
  ctaLabel: "See What Else Is Available",
  ctaDestination: "brand-site",
  bannedNarrativePhrases: ["sold for", "closed at"],
};

describe("subjectFor — the deterministic ladder", () => {
  test("street wins, then city, then bare", () => {
    expect(subjectFor(CFG, { address: "326 Shore Dr, Fort Myers Beach", city: "Fort Myers Beach" }, {})).toBe(
      "Under contract: 326 Shore Dr",
    );
    expect(subjectFor(CFG, { city: "Fort Myers Beach" }, {})).toBe("Under contract in Fort Myers Beach");
    expect(subjectFor(CFG, {}, {})).toBe("Under contract");
  });
});

describe("cleanNarrative — banned phrases drop the paragraph, never rewrite it", () => {
  test("clean passes, banned drops to null", () => {
    expect(cleanNarrative("A lovely community near the beach.", CFG)).toBe(
      "A lovely community near the beach.",
    );
    expect(cleanNarrative("It SOLD FOR a record price.", CFG)).toBeNull();
  });
});

describe("resolveCtaUrl", () => {
  test("brand-site falls back to the SWFL site; listing yields undefined when unresolved (never the homepage)", () => {
    expect(resolveCtaUrl("brand-site", { blocks: [], globalStyle: {} } as never, null)).toBe(
      "https://www.swfldatagulf.com",
    );
    expect(resolveCtaUrl("listing", { blocks: [], globalStyle: {} } as never, null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** → FAIL. 

- [ ] **Step 3: Implement.** `buildFromConfig` mirrors `buildUnderContract`'s spine generically (read `under-contract.ts:392-654` side-by-side while writing):

```ts
// lib/deliverable/recipes/config-builder.ts — THE ONE CONFIG BUILDER.
// Consumes RecipeConfig + derivations, hands buildLifecycleEmail its chrome. This
// file is the only place a configured recipe's control flow lives; a recipe file
// that still contains control flow after migration is an unfinished migration.
```

Skeleton (implementer fleshes out against the under-contract original, preserving every behavior its comments pin):

```ts
export function subjectFor(
  config: RecipeConfig,
  facts: Pick<ListingFacts, "address" | "city">,
  subjectVars: Record<string, string>,
): string {
  const street = String(facts.address ?? "").split(",")[0]?.trim() ?? "";
  if (street && !subjectVarsSuppressed(config))
    return renderTemplate(config.subject.withStreet, { street, ...subjectVars });
  const city = facts.city?.trim();
  if (city) return renderTemplate(config.subject.withCity, { city, ...subjectVars });
  return renderTemplate(config.subject.bare, subjectVars).trim() || config.ribbon;
}
// suppressAddress: the street rung is SKIPPED (coming-soon) — city template leads.

export function cleanNarrative(raw: string | null, config: RecipeConfig): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const banned = (config.bannedNarrativePhrases ?? []).some((p) => lower.includes(p));
  return banned ? null : raw;
}

export function resolveCtaUrl(
  dest: CtaDestination,
  currentDoc: EmailDoc,
  facts: ListingFacts | null,
): string | undefined {
  if (dest === "listing") return facts ? (listingButtonUrl(facts) ?? undefined) : undefined;
  return brandWebsiteUrl(currentDoc) ?? "https://www.swfldatagulf.com";
}

export async function buildFromConfig(
  ctx: RecipeBuildContext,
  config: RecipeConfig,
): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  if (!facts) return null;
  // THE ADDRESS GATE — street-or-city, not addressLineOf-non-empty (the "FL" hero bug,
  // under-contract.ts:399-411). suppressAddress recipes gate on city only.
  if (!facts.address?.trim() && !facts.city?.trim()) return null;
  const address = addressLineOf(facts);
  if (!address.trim()) return null;

  const params = config.params ?? {};
  const [middle, tail] = [
    await runDerivations(config.middle, ctx, params),
    await runDerivations(config.tail, ctx, params),
  ];
  const subjectVars = { ...middle.subjectVars, ...tail.subjectVars };
  const ctaUrl = resolveCtaUrl(config.ctaDestination, currentDoc, facts);

  const chrome: LifecycleChrome = {
    ribbon: config.ribbon,
    photo: facts.photos[0]
      ? { url: facts.photos[0], alt: renderTemplate(config.photoAlt, { address }), linkUrl: ctaUrl }
      : null,
    heroValue: facts.price ?? "",
    heroLabel: config.suppressAddress ? (facts.city ?? "") : address,
    specs: resolveCells(config.specs, facts),
    specFootnote: specFootnote(facts),
    description: config.includeDescription ? listingDescription(facts.remarks) : undefined,
    narrative: "",
    middle: middle.blocks,
    tail: tail.blocks,
    ctaLabel: config.ctaLabel,
    ctaUrl,
  };

  let doc: EmailDoc = {
    ...buildLifecycleEmail(currentDoc, chrome),
    subjectVariants: [subjectFor(config, facts, subjectVars)],
  };

  if (config.framing) {
    const narratorFacts = { ...facts } as Record<string, unknown>;
    for (const k of config.narratorStrips ?? []) narratorFacts[k] = undefined;
    const hasDescription = Boolean(facts.remarks) && config.includeDescription;
    const hasCommunity = Boolean(
      facts.community || facts.insideTheGate || facts.communityStats || facts.neighborhood,
    );
    const raw =
      hasDescription || hasCommunity
        ? await authorListingNarrative(narratorFacts as ListingFacts, {
            descriptionRendered: hasDescription,
            framing:
              (hasDescription ? config.framing.withDescription : config.framing.withoutDescription) +
              config.framing.common,
          }).catch(() => null)
        : null;
    const clean = cleanNarrative(raw, config);
    if (clean) doc = fillNarrative(clearNarrativeSlots(doc), clean);
  }
  return doc;
}
```

Then in `lib/deliverable/recipes/index.ts`, the dispatch consumed by `authorDoc` (find where `RECIPE_BUILDERS[key]` is read — likely exported and read in `build-doc.ts`; add the config branch AT THE LOOKUP so both callers get it):

```ts
import { buildFromConfig } from "./config-builder";
/** A migrated recipe (config present) builds through the ONE config builder; a
 *  legacy recipe uses its hand-coded entry. FENCE (spec, migration rule 3): never
 *  add a feature to a legacy builder — migrate it in the same session instead. */
export function builderFor(recipe: Recipe): RecipeBuilder | null {
  if (recipe.config) {
    const config = recipe.config;
    return (ctx) => buildFromConfig(ctx, config);
  }
  return RECIPE_BUILDERS[recipe.key] ?? null;
}
```

Rewire the existing consumer(s) of `RECIPE_BUILDERS` (grep `RECIPE_BUILDERS` — `build-doc.ts` and `registry-seam.test.ts`) to `builderFor`.

- [ ] **Step 4: Run** — `bun test lib/deliverable` → all green (no recipe carries a config yet, so behavior is byte-identical; `registry-seam.test.ts` proves it).
- [ ] **Step 5: Commit** — `git commit -m "feat(recipes-config): buildFromConfig — one builder consumes config+derivations, dispatch prefers config"` (explicit paths).

---

### Task 5: Migrate under-contract behind render parity (the proof)

**Files:**
- Modify: `lib/deliverable/recipes.ts` (the `under-contract` entry gains its `config` literal)
- Shrink: `lib/deliverable/recipes/under-contract.ts` (654 → ~250 lines: the speed derivation + `SOLD_LANGUAGE` + `UNDER_CONTRACT_FIELDS` re-export shims for the render script)
- 🔴 Modify: `lib/deliverable/recipes/derivations.ts` (register `"under-contract/speed"`)
- 🔴 Modify: `lib/deliverable/recipes/index.ts` (DELETE the `"under-contract": buildUnderContract` entry)
- Test: existing `under-contract` unit tests + `scripts/email/render-under-contract.mts`

- [ ] **Step 1: Capture the BEFORE artifact** — `bun scripts/email/render-under-contract.mts` (note its output path from the script header) and copy the rendered HTML to the scratchpad dir as `under-contract.before.html`. This is the parity baseline. Paste the script's PASS output.

- [ ] **Step 2: Register the speed derivation.** Move `daysToContract`, `Speed`, `loadSpeed`, `speedStats`, `speedOpenSlots`, and the sources-note tail (under-contract.ts:175-474, comments INCLUDED) into the under-contract module as one derivation, registered in `derivations.ts`:

```ts
// in under-contract.ts (now the derivations module for this recipe)
export const underContractSpeed: Derivation = async (ctx, params) => {
  const facts = ctx.facts!;
  const days = daysToContract(facts);
  const speed = await loadSpeed(facts, { ...UNDER_CONTRACT_FIELDS, minMedianSample: Number(params.minMedianSample ?? 10) }).catch(() => null);
  const blocks: ChromeBlock[] = [
    { block: { id: createBlock("stats").id, type: "stats",
        props: { stats: speed ? speedStats(speed) : speedOpenSlots(), variant: "strip" } },
      height: 3 },
  ];
  // + the sources-note tail block exactly as under-contract.ts:443-474 builds it,
  //   emitted only when medianShipped — return it from a SECOND derivation
  //   "under-contract/speed-sources" listed under config.tail, sharing the loaded
  //   Speed via a module-level per-build memo keyed on ctx (or simplest: the tail
  //   derivation re-runs loadSpeed — it is one cheap RPC; determinism per
  //   registry-seam holds because the test env has no creds → both null).
  return { blocks, subjectVars: days != null ? { days: String(days) } : {} };
};
```

then in `derivations.ts`: `DERIVATIONS["under-contract/speed"] = underContractSpeed; DERIVATIONS["under-contract/speed-sources"] = underContractSpeedSources;` (import from `./under-contract` — one direction only, no cycle: derivations.ts imports recipe modules, recipe modules never import derivations.ts).

- [ ] **Step 3: The config literal** in `recipes.ts` `under-contract` entry — every value copied VERBATIM from `UNDER_CONTRACT_FIELDS` and the builder (654-line file is the source of truth; the framing strings move byte-identical, including the withDescription/withoutDescription branch and the common tail from under-contract.ts:573-636):

```ts
config: {
  key: "under-contract",
  ribbon: "Under Contract",
  subject: {
    withStreet: "Under contract: {street}",
    withCity: "Under contract in {city}",
    bare: "Under contract",
  },
  photoAlt: "Under contract — {address}",
  specs: ["beds", "baths", "sqft", "price-per-sqft", "lot", "type"],
  includeDescription: true,
  middle: ["under-contract/speed"],
  tail: ["under-contract/speed-sources"],
  ctaLabel: "See What Else Is Available",
  ctaDestination: "brand-site",
  bannedNarrativePhrases: ["sold for", "sold price", "closed at", "final sale", "sale price"],
  narratorStrips: ["daysOnMarket", "lotSize", "yearBuilt", "hoaFee"],
  params: { minMedianSample: 10 },
  framing: { withDescription: "…", withoutDescription: "…", common: "…" }, // verbatim moves
},
```

Delete `buildUnderContract` and the parts of `under-contract.ts` the config now owns. Keep `SOLD_LANGUAGE` exported as `config.bannedNarrativePhrases`'s source (`export const SOLD_LANGUAGE = RECIPES["under-contract"].config!.bannedNarrativePhrases!;` — the render script's import keeps working and the two can never diverge). Delete the `"under-contract"` line from `RECIPE_BUILDERS`.

- [ ] **Step 4: The parity gate.** Run in order, paste all outputs:
1. `bun test lib/deliverable/recipes/` → green (fleet tests now REALLY iterate: serializability, catalog refs, derivation keys).
2. `bun test lib/deliverable lib/email` → green, including `registry-seam.test.ts` and under-contract's own unit tests (update their imports; behavioral assertions stay).
3. `bun scripts/email/render-under-contract.mts` → exits 0 with its RED assertions intact (the SOLD_LANGUAGE bytes gate).
4. Diff the AFTER render against `under-contract.before.html` — layout-identical (block sequence, cells, subject). Narrative text may differ run-to-run (LLM); everything deterministic must match. Record the diff summary in the commit body.
- [ ] **Step 5: Commit** — `git commit -m "feat(recipes-config): under-contract is a CONFIG — first migration, render-parity proven, -N lines"` with the real net line count in the body.

---

### Task 6–11: The lifecycle WAVE (one recipe per task, one commit per recipe)

Same procedure per recipe — spelled per-recipe below. For EACH: (a) capture BEFORE render via its script; (b) read the whole builder file; (c) classify every export: printable literal → `config`, computation → a `"<key>/<name>"` derivation, dead-after-migration → delete; (d) config literal into `recipes.ts`, derivations registered, `RECIPE_BUILDERS` entry deleted; (e) parity gate (its render script + full suites + before/after diff); (f) commit with net-line count. Load-bearing decree comments move with their code. If a recipe's structure genuinely cannot express through `RecipeConfig` (a middle the chrome can't carry), STOP and extend `RecipeConfig`/`DerivationResult` minimally in a SEPARATE commit first — never fork a second chrome path.

- [ ] **Task 6: new-listing** (`recipes/new-listing.ts`, builder `buildNewListing`; script `scripts/email/render-new-listing.mts`). Knowns: ribbon "New Listing"; chart policy `none`; address SHIPS (its bytes-invariant); imports the list-date chain from `lib/listings/list-date.ts` (stays put). Expect derivations for its DOM/list-date cells.
- [ ] **Task 7: coming-soon** (`recipes/coming-soon.ts` 944 lines, `buildComingSoon`; script `render-coming-soon.mts`). Knowns: `suppressAddress: true` (bytes-invariant: address does NOT ship — verify the render script's RED assertion still fires by test-mutating once); scarcity funnel middle → `"coming-soon/scarcity-funnel"` derivation; drops the `lot` cell (parcel-search narrowing) → its `specs` list simply omits `"lot"`.
- [ ] **Task 8: just-sold** (`recipes/just-sold.ts` 736 lines, `buildJustSold`; script `render-just-sold.mts`). Knowns: sentence BANK live (`just-sold.language.ts` — untouched, `bankFor` keeps working); comps-bar chart → `"just-sold/comps-context"` derivation; `chromeAccent()` (just-sold.ts:498) → derivation or config param, decide by what it computes.
- [ ] **Task 9: open-house** (`recipes/open-house.ts`, `buildOpenHouse`; script `render-open-house.mts`). Knowns: no chart; the date/time cells are user-provided facts → likely pure config; CTA is RSVP-shaped.
- [ ] **Task 10: price-reduced** (`recipes/price-reduced.ts` 669 lines, `buildPriceReduced`; script `render-price-reduced.mts`). Knowns: BANK live; `heroKicker` ("PRICE CUT $104,975") → config gains optional `heroKicker` template + a `"price-reduced/cut"` derivation supplying `{cut}` var; `priceVsAreaDotSpec` chart → `"price-reduced/price-vs-area-dot"` derivation.
- [ ] **Task 11: market-comps** (`recipes/market-comps.ts` 1,717 lines, `buildMarketComps` + `buildCompsGrid`; script `render-market-comps.mts`). The heaviest: comps fetch/banding/chart/price-case (`buildPriceCase`, `buildNarratorPrompt` with FAVORABLE_FRAMING_POLICY pasted verbatim — that paste rule survives migration untouched) → multiple derivations. If after honest classification the derivations module is still >70% of the original, say so in the commit body rather than forcing it — the spec's promise is config for the declarative share, not the math.

---

### Task 12: Fleet closure + status + docs

**Files:** `scripts/email/status.mts` (+ regen `docs/standards/email-status.md`), `docs/standards/email-build-playbook.md`, `SESSION_LOG.md`, checks.

- [ ] **Step 1:** Add a `config` column to `status.mts` (derived: `RECIPES[key].config != null`), regen, and confirm `status.test.mts` green. All 7 lifecycle rows read `yes`.
- [ ] **Step 2:** Fleet assertions final pass: `bun test lib/deliverable lib/email` and `bunx next build` → paste outputs.
- [ ] **Step 3:** Total the net line change across commits (`git diff --stat <first-task-commit>^..HEAD -- lib/deliverable/recipes/`) — the number that answers the operator's "same thing as lib/email" suspicion. Report n of 7 migrated with names of any NOT done (RULE 0.8).
- [ ] **Step 4:** Playbook PART 0 gains the config-layer paragraph (one findable place: config in `recipes.ts`, cells in `cell-catalog.ts`, math in `derivations.ts`, fence: no features on legacy builders). SESSION_LOG entry. `node scripts/check.mjs` — progress-note `recipes_as_config_live_verify` (closes only on operator live-verify: a real lab build of a migrated recipe renders correctly).
- [ ] **Step 5:** Commit + (operator-approved) push.

## Self-Review (done at write time)

- Spec coverage: seam (T1-4), under-contract parity PR (T5), wave (T6-11) — spec's PR-1 + operator's wave decree. Quick-swap explicitly out (needs alternate-grid families; check open). Config-inside-registry (T1 Step 3), serializability guard (T1), cell-policy compile-time class (T2 test 1), parity gates (every migration task), banks untouched (constraint + T8).
- Types: `RecipeConfig`/`CellKey`/`DerivationKey` defined T1-3 before use in T4-5; `builderFor` replaces raw `RECIPe_BUILDERS` reads — grep both call sites in T4.
- Placeholders: T5 framing strings marked "verbatim moves" — the executor copies from under-contract.ts:573-636, which is named with exact lines; T6-11 knowns name files, builders, scripts, and expected derivation keys.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 3, Task 4, Task 5 | `lib/deliverable/recipes/derivations.ts`, `lib/deliverable/recipes/index.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
