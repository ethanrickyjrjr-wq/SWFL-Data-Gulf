# Listing Flyer Design Variants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 9 tasks, 14 files, keywords: migration, schema, architecture

**Goal:** Turn the single, stacked New-Listing flyer (`506f799f`) into a cross-category
design-family registry — one design (`"classic"`) rendered on the real 2D grid across
all three listing-scoped hero chips (New Listing / Just Sold / Coming to Market), tier-
gated free/paid, with a sticky per-user default design that a per-category override can
beat — no picker UI yet, nothing new to choose from, just the machinery proven end to end.

**Architecture:** A `DesignFamily` registry (`lib/email/listing-flyer-designs.ts`) maps
one design id to one builder function per `BuildCategory`. Each builder is a thin
wrapper around a shared `buildFlyerCore` in `lib/email/listing-flyer.ts`, which now also
assigns `layout` + resize bounds to every block (previously stacked, no layout at all).
Tiering reuses the existing `FONT_ROUTING`-shaped dial in `capabilities.ts`. Design
selection is a two-tier Supabase lookup (`resolveUserDesign`, mirrors `resolveUserBrand`'s
query shape) wired into the one call site that already resolves a listing subject
(`authorDoc` in `build-doc.ts`), reached via `app/api/email-lab/ai/route.ts`.

**Tech Stack:** TypeScript, Next.js App Router, Supabase (Postgres), Bun test runner,
`react-grid-layout` v2 (`GridCanvas`) — no new dependencies.

## Global Constraints

- Market Update is explicitly OUT of scope — area-scoped (`input:"area"`), no
  `ListingFacts` subject, cannot use a `(facts, current) => EmailDoc` builder.
- `BuildCategory` is exactly `"new-listing" | "just-sold" | "coming-to-market"`.
- No design-picker/chooser UI, no "Change Template" UI, no swap-design-on-an-existing-
  doc action, no AI-authored prose, no "refresh listing data" feature — this plan ships
  the registry, the grid layout, the tiering dial, and the resolution machinery only.
- Free tier must ALWAYS resolve to `"classic"` — never a choice, by design.
- SQL migrations run directly (idempotent, `IF NOT EXISTS`), per house rule — no need to
  ask before running one.
- Stage explicit file paths only when committing — never `git add -A`.

---

### Task 1: Category detection for Just Sold and Coming to Market

**Files:**
- Modify: `lib/email/listing-intent.ts`
- Test: `lib/email/listing-intent.test.ts`

**Interfaces:**
- Produces: `isJustSoldRecipePrompt(prompt: string): boolean`,
  `isComingToMarketRecipePrompt(prompt: string): boolean`,
  `detectListingCategory(prompt: string): "new-listing" | "just-sold" | "coming-to-market" | null`
  (all exported from `lib/email/listing-intent.ts`). Task 7 consumes
  `detectListingCategory`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/email/listing-intent.test.ts`:

```ts
import {
  isJustSoldRecipePrompt,
  isComingToMarketRecipePrompt,
  detectListingCategory,
} from "./listing-intent";

test("isJustSoldRecipePrompt matches the Sold recipe's own wording", () => {
  expect(
    isJustSoldRecipePrompt(
      "Build a just-sold email for my listing at 123 X Rd — set the close among the week's real sales nearby",
    ),
  ).toBe(true);
});

test("isJustSoldRecipePrompt does not match new-listing or coming-soon wording", () => {
  expect(isJustSoldRecipePrompt("Build a new-listing announcement email for 123 X Rd")).toBe(
    false,
  );
  expect(isJustSoldRecipePrompt("Build a coming-soon teaser email for 123 X Rd")).toBe(false);
});

test("isComingToMarketRecipePrompt matches the Coming Soon recipe's own wording", () => {
  expect(
    isComingToMarketRecipePrompt(
      "Build a coming-soon teaser email for my listing at 123 X Rd — hold the street address back",
    ),
  ).toBe(true);
});

test("isComingToMarketRecipePrompt does not match new-listing or just-sold wording", () => {
  expect(isComingToMarketRecipePrompt("Build a new-listing announcement email for 123 X Rd")).toBe(
    false,
  );
  expect(isComingToMarketRecipePrompt("Build a just-sold email for 123 X Rd")).toBe(false);
});

test("detectListingCategory routes each recipe to its own category, and returns null otherwise", () => {
  expect(detectListingCategory("Build a new-listing announcement email for 123 X Rd")).toBe(
    "new-listing",
  );
  expect(detectListingCategory("Build a just-sold email for 123 X Rd")).toBe("just-sold");
  expect(detectListingCategory("Build a coming-soon teaser email for 123 X Rd")).toBe(
    "coming-to-market",
  );
  expect(detectListingCategory("Build my monthly market update on home prices")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/listing-intent.test.ts`
Expected: FAIL — `isJustSoldRecipePrompt`/`isComingToMarketRecipePrompt`/`detectListingCategory` are not exported.

- [ ] **Step 3: Implement the minimal code**

In `lib/email/listing-intent.ts`, append after the existing `isNewListingRecipePrompt`:

```ts
// The JUST-SOLD recipe, detected the same way as NEW_LISTING_RECIPE — tight wording
// only ("just-sold"), never the generic "sold" (too broad — would match unrelated text).
const JUST_SOLD_RECIPE = /\bjust[-\s]?sold\b/i;

export function isJustSoldRecipePrompt(prompt: string): boolean {
  return !!prompt && JUST_SOLD_RECIPE.test(prompt);
}

// The COMING-TO-MARKET / coming-soon teaser recipe — holds the street address back
// (see the recipe's own copy in lib/showcase/registry.ts), so this category's builder
// must never display the full street line (Task 2).
const COMING_TO_MARKET_RECIPE = /\bcoming[-\s]?soon\b/i;

export function isComingToMarketRecipePrompt(prompt: string): boolean {
  return !!prompt && COMING_TO_MARKET_RECIPE.test(prompt);
}

/** Which listing-flyer category a build-doc prompt belongs to, or null when it's
 *  none of the three (e.g. a market newsletter, or ordinary free-form composition).
 *  Checked in a fixed order — New Listing first because "new-listing" is the most
 *  specific/common wording and none of the three regexes overlap in practice. */
export function detectListingCategory(
  prompt: string,
): "new-listing" | "just-sold" | "coming-to-market" | null {
  if (isNewListingRecipePrompt(prompt)) return "new-listing";
  if (isJustSoldRecipePrompt(prompt)) return "just-sold";
  if (isComingToMarketRecipePrompt(prompt)) return "coming-to-market";
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/listing-intent.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add lib/email/listing-intent.ts lib/email/listing-intent.test.ts
git commit -m "feat(email): detect Just Sold / Coming to Market recipes, add detectListingCategory"
```

---

### Task 2: Shared flyer core, two new category builders, grid layout + bounds

**Files:**
- Modify: `lib/email/listing-flyer.ts`
- Test: `lib/email/listing-flyer.test.ts`

**Interfaces:**
- Consumes: nothing new (same `ListingFacts`, `EmailDoc`, `EmailBlock`, `BlockLayout`,
  `StatItem` types already imported).
- Produces: `buildListingFlyer` (unchanged signature/behavior, now with `layout` on its
  blocks), `buildJustSoldFlyer(facts, current): EmailDoc`,
  `buildComingToMarketFlyer(facts, current): EmailDoc` — all from
  `lib/email/listing-flyer.ts`. Task 3 consumes all three.

- [ ] **Step 1: Write the failing tests**

Append to `lib/email/listing-flyer.test.ts`:

```ts
import { buildJustSoldFlyer, buildComingToMarketFlyer } from "./listing-flyer";

test("classic flyer blocks all carry a grid layout, footer stays static", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());
  for (const b of doc.blocks) {
    expect(b.layout).toBeDefined();
    expect(b.layout?.x).toBe(0);
    expect(b.layout?.w).toBe(12);
  }
  const footer = doc.blocks.find((b) => b.type === "footer");
  expect(footer?.layout?.static).toBe(true);
});

test("blocks stack without overlapping (each y starts where the previous one ends)", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());
  let expectedY = 0;
  for (const b of doc.blocks) {
    expect(b.layout?.y).toBe(expectedY);
    expectedY += b.layout?.h ?? 0;
  }
});

test("buildJustSoldFlyer leads with a Just Sold kicker and the full address", () => {
  const doc = buildJustSoldFlyer(FACTS, brandedCurrentDoc());
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.kicker).toBe("Just Sold");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Hickory");
});

test("buildComingToMarketFlyer holds the street address back — city/state only", () => {
  const doc = buildComingToMarketFlyer(FACTS, brandedCurrentDoc());
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.kicker).toBe("Coming Soon");
  const label = (hero?.type === "hero" && hero.props.label) || "";
  expect(label).not.toContain("Hickory");
  expect(label).toContain("BONITA SPRINGS");
});

test("layout bounds are internally consistent — min <= h <= max, width fits the grid", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());
  for (const b of doc.blocks) {
    const l = b.layout!;
    expect(l.w).toBeLessThanOrEqual(12);
    if (l.minH !== undefined) expect(l.minH).toBeLessThanOrEqual(l.h);
    if (l.maxH !== undefined) expect(l.h).toBeLessThanOrEqual(l.maxH);
    if (l.minH !== undefined && l.maxH !== undefined) {
      expect(l.minH).toBeLessThanOrEqual(l.maxH);
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/listing-flyer.test.ts`
Expected: FAIL — no `layout` on any block; `buildJustSoldFlyer`/`buildComingToMarketFlyer` not exported.

- [ ] **Step 3: Implement the minimal code**

Replace the full contents of `lib/email/listing-flyer.ts` with:

```ts
// lib/email/listing-flyer.ts
//
// Turn scraped ListingFacts into a property FLYER EmailDoc — the layout the old
// builder couldn't produce because it was forbidden to restructure blocks. The
// flyer LEADS with the property (photo -> price + address -> beds/baths/sqft ->
// real description -> CTA) but PRESERVES the user's brand + identity (globalStyle,
// the header's company/logo, the footer's CAN-SPAM + socials, the agent card) —
// those are sticky and lifted from the doc currently on the canvas. Pure: returns
// a NEW doc, mutates nothing, invents nothing (a missing spec is simply omitted).
//
// One shared core (buildFlyerCore) powers all three listing-scoped categories (spec
// 2026-07-07-listing-flyer-design-variants-design.md) — same visual language, only the
// hero kicker and address handling differ. Every block gets a grid `layout` + resize
// bounds so the flyer lands on the real 2D GridCanvas instead of rendering stacked.

import { createBlock } from "./doc/default-docs";
import { heroPhotoBlock } from "./inject-photo";
import { GRID_COLS } from "./grid-schema";
import type { BlockLayout, BlockType, EmailBlock, EmailDoc, StatItem } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

/** Reuse the current doc's block of a type (identity/brand is sticky), else a
 *  fresh default block of that type. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  const found = current.blocks.find((b) => b.type === type);
  return found ?? createBlock(type);
}

/** "7453" -> "7,453"; strips any non-digits first. Undefined in -> undefined. */
function withCommas(n?: string): string | undefined {
  if (!n) return undefined;
  const digits = n.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Per-block-type grid sizing for every flyer design — height + resize bounds
 *  (spec's durability contract: "to a certain extent", not unlimited). A type
 *  absent here falls back to h:4 with no explicit bounds. */
const FLYER_BLOCK_BOUNDS: Partial<Record<BlockType, { h: number; minH?: number; maxH?: number }>> =
  {
    header: { h: 3, minH: 2, maxH: 4 },
    image: { h: 8, minH: 5, maxH: 12 },
    hero: { h: 6, minH: 4, maxH: 9 },
    stats: { h: 4, minH: 3, maxH: 6 },
    text: { h: 5, minH: 3, maxH: 14 },
    "agent-card": { h: 6, minH: 4, maxH: 9 },
    button: { h: 2, minH: 1, maxH: 3 },
    footer: { h: 5 },
  };

/** Stack every block full-width (x:0, w:GRID_COLS) with FLYER_BLOCK_BOUNDS sizing —
 *  lands the flyer on the real 2D GridCanvas instead of stacked. Footer stays
 *  `static` (the existing unsubscribe-lock mechanism) so it can't be dragged away
 *  from the bottom. */
function layoutFlyerBlocks(blocks: EmailBlock[]): EmailBlock[] {
  let y = 0;
  return blocks.map((b) => {
    const bounds = FLYER_BLOCK_BOUNDS[b.type] ?? { h: 4 };
    const layout: BlockLayout = {
      x: 0,
      y,
      w: GRID_COLS,
      h: bounds.h,
      ...(bounds.minH !== undefined ? { minH: bounds.minH } : {}),
      ...(bounds.maxH !== undefined ? { maxH: bounds.maxH } : {}),
      ...(b.type === "footer" ? { static: true } : {}),
    };
    y += bounds.h;
    return { ...b, layout };
  });
}

interface FlyerCopy {
  /** Hero kicker text — "New Listing" / "Just Sold" / "Coming Soon". */
  kicker: string;
  /** "areaOnly" withholds the street address (Coming Soon's own recipe wording:
   *  "hold the street address back") — shows city/state only, even when the full
   *  address is available. "full" is today's existing behavior. */
  addressMode: "full" | "areaOnly";
}

function buildFlyerCore(facts: ListingFacts, current: EmailDoc, copy: FlyerCopy): EmailDoc {
  const blocks: EmailBlock[] = [];

  // 1. Header — keep the agent's branded header (company, logo, colors).
  blocks.push(keepOrDefault(current, "header"));

  // 2. Hero PHOTO — the real first listing photo, clickable back to the listing.
  if (facts.photos[0]) {
    blocks.push(
      heroPhotoBlock({
        url: facts.photos[0],
        alt: facts.address ?? "Featured property",
        linkUrl: facts.sourceUrl,
      }),
    );
  }

  // 3. Hero — kicker + price + address (or area-only) lead the email.
  const areaLine = [facts.city, facts.state].filter(Boolean).join(", ") || undefined;
  const addressLine = copy.addressMode === "areaOnly" ? areaLine : (facts.address ?? areaLine);
  blocks.push({
    id: createBlock("hero").id,
    type: "hero",
    props: {
      kicker: copy.kicker,
      ...(facts.price ? { value: facts.price } : {}),
      ...(addressLine ? { label: addressLine } : {}),
    },
  });

  // 4. Stats — beds / baths / sqft. Only the cells we actually have; never a 0.
  const cells: StatItem[] = [];
  if (facts.beds) cells.push({ value: facts.beds, label: "Beds" });
  if (facts.baths) cells.push({ value: facts.baths, label: "Baths" });
  const sqft = withCommas(facts.sqft);
  if (sqft) cells.push({ value: sqft, label: "Sq Ft" });
  if (cells.length) {
    blocks.push({ id: createBlock("stats").id, type: "stats", props: { stats: cells } });
  }

  // 5. Description — the REAL marketing remarks (clamped to the text cap).
  if (facts.remarks) {
    blocks.push({
      id: createBlock("text").id,
      type: "text",
      props: { body: facts.remarks.slice(0, 2000), align: "left" },
    });
  }

  // 6. Agent card — keep the agent's own card if the canvas had one.
  blocks.push(keepOrDefault(current, "agent-card"));

  // 7. CTA -> the listing page.
  blocks.push({
    id: createBlock("button").id,
    type: "button",
    props: { label: "See the Listing", url: facts.sourceUrl },
  });

  // 8. Footer — keep the agent's CAN-SPAM footer (address, socials, unsubscribe).
  blocks.push(keepOrDefault(current, "footer"));

  return { globalStyle: { ...current.globalStyle }, blocks: layoutFlyerBlocks(blocks) };
}

export function buildListingFlyer(facts: ListingFacts, current: EmailDoc): EmailDoc {
  return buildFlyerCore(facts, current, { kicker: "New Listing", addressMode: "full" });
}

export function buildJustSoldFlyer(facts: ListingFacts, current: EmailDoc): EmailDoc {
  return buildFlyerCore(facts, current, { kicker: "Just Sold", addressMode: "full" });
}

export function buildComingToMarketFlyer(facts: ListingFacts, current: EmailDoc): EmailDoc {
  return buildFlyerCore(facts, current, { kicker: "Coming Soon", addressMode: "areaOnly" });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/listing-flyer.test.ts`
Expected: PASS (all tests, including the three pre-existing ones — `buildListingFlyer`'s
kicker/label/stats/photo/text/footer behavior is unchanged, only `layout` was added).

- [ ] **Step 5: Commit**

```bash
git add lib/email/listing-flyer.ts lib/email/listing-flyer.test.ts
git commit -m "feat(email): shared flyer core + Just Sold / Coming to Market builders, grid layout + bounds"
```

---

### Task 3: Design family registry + completeness gate

**Files:**
- Create: `lib/email/listing-flyer-designs.ts`
- Test: `lib/email/listing-flyer-designs.test.ts`

**Interfaces:**
- Consumes: `buildListingFlyer`, `buildJustSoldFlyer`, `buildComingToMarketFlyer` (Task 2).
- Produces: `type BuildCategory`, `BUILD_CATEGORIES: BuildCategory[]`,
  `type ListingFlyerDesignId`, `interface DesignFamily`,
  `LISTING_FLYER_DESIGNS: DesignFamily[]`, `resolveDesign(id): DesignFamily`. Tasks 4, 5,
  7 consume `ListingFlyerDesignId`/`BuildCategory`/`resolveDesign`.

- [ ] **Step 1: Write the failing tests**

Create `lib/email/listing-flyer-designs.test.ts`:

```ts
import { test, expect } from "bun:test";
import { LISTING_FLYER_DESIGNS, BUILD_CATEGORIES, resolveDesign } from "./listing-flyer-designs";

test("every design has a builder for every listing category (completeness gate)", () => {
  for (const design of LISTING_FLYER_DESIGNS) {
    for (const category of BUILD_CATEGORIES) {
      expect(typeof design.builders[category]).toBe("function");
    }
  }
});

test("BUILD_CATEGORIES is exactly the three listing-scoped categories", () => {
  expect(BUILD_CATEGORIES).toEqual(["new-listing", "just-sold", "coming-to-market"]);
});

test("resolveDesign returns the matching design", () => {
  expect(resolveDesign("classic").id).toBe("classic");
  expect(resolveDesign("classic").showcaseId).toBe("listing-to-close");
});

test("resolveDesign throws on an unregistered id", () => {
  expect(() => resolveDesign("nonexistent" as never)).toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/listing-flyer-designs.test.ts`
Expected: FAIL — `lib/email/listing-flyer-designs.ts` does not exist.

- [ ] **Step 3: Implement the minimal code**

Create `lib/email/listing-flyer-designs.ts`:

```ts
// lib/email/listing-flyer-designs.ts
//
// Registry of listing-flyer DESIGN FAMILIES — a visual language that must render
// consistently across every listing-scoped hero-chip category (New Listing / Just
// Sold / Coming to Market). Market Update is excluded: it's area-scoped, has no
// single ListingFacts subject, and cannot fit this shape (spec
// docs/superpowers/specs/2026-07-07-listing-flyer-design-variants-design.md).
//
// Completeness is enforced by listing-flyer-designs.test.ts, not assumed: every
// registered design must have a builder for every BuildCategory.

import {
  buildListingFlyer,
  buildJustSoldFlyer,
  buildComingToMarketFlyer,
} from "./listing-flyer";
import type { EmailDoc } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

export type BuildCategory = "new-listing" | "just-sold" | "coming-to-market";

export const BUILD_CATEGORIES: BuildCategory[] = [
  "new-listing",
  "just-sold",
  "coming-to-market",
];

/** Extend this union when a second design ships (the paid "choose a design" fast-follow). */
export type ListingFlyerDesignId = "classic";

export interface DesignFamily {
  id: ListingFlyerDesignId;
  name: string;
  description: string;
  /** The Showcase card (lib/showcase/registry.ts) this design is presented on. */
  showcaseId: string;
  builders: Record<BuildCategory, (facts: ListingFacts, current: EmailDoc) => EmailDoc>;
}

export const LISTING_FLYER_DESIGNS: DesignFamily[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Photo-led flyer — price and specs up front, your brand around it.",
    showcaseId: "listing-to-close",
    builders: {
      "new-listing": buildListingFlyer,
      "just-sold": buildJustSoldFlyer,
      "coming-to-market": buildComingToMarketFlyer,
    },
  },
];

export function resolveDesign(id: ListingFlyerDesignId): DesignFamily {
  const found = LISTING_FLYER_DESIGNS.find((d) => d.id === id);
  if (!found) throw new Error(`Unknown listing flyer design: "${id}"`);
  return found;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/listing-flyer-designs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/listing-flyer-designs.ts lib/email/listing-flyer-designs.test.ts
git commit -m "feat(email): listing flyer design-family registry with completeness gate"
```

---

### Task 4: Tiering — DESIGN_ROUTING dial

**Files:**
- Modify: `lib/email/lab/capabilities.ts`
- Test: `lib/email/lab/capabilities.test.ts`

**Interfaces:**
- Consumes: `type ListingFlyerDesignId` (Task 3, `import type` only — no runtime cycle).
- Produces: `DESIGN_ROUTING: Record<ListingFlyerDesignId, Routing>`,
  `designsFor(tier: EmailLabTier): ListingFlyerDesignId[]`. Not called by Task 8 in this
  plan — the API route the tasks below wire through doesn't discriminate free/paid tier
  today (tier is route-based: `/email-lab` vs `/email-lab/grid` share this same AI
  endpoint), and with only `"classic"` registered, `resolveUserDesign` cannot return
  anything else regardless of tier. This dial is scaffolding for the moment a second
  design exists AND the route becomes tier-aware — both fast-follows, not this slice.

- [ ] **Step 1: Write the failing tests**

Append to `lib/email/lab/capabilities.test.ts` (add `DESIGN_ROUTING, designsFor` to the
existing import from `"./capabilities"`):

```ts
import {
  EMAIL_LAB_CAPABILITIES,
  FEATURE_ROUTING,
  FONT_ROUTING,
  DESIGN_ROUTING,
  capabilitiesFor,
  fontsFor,
  designsFor,
  type EmailLabCapabilities,
  type Routing,
} from "./capabilities";

test("designs land exactly where routed", () => {
  const freeDesigns = designsFor("free");
  const paidDesigns = designsFor("paid");
  for (const [design, routing] of Object.entries(DESIGN_ROUTING)) {
    const inFree = freeDesigns.includes(design as never);
    const inPaid = paidDesigns.includes(design as never);
    expect(expectRouting(inFree, inPaid, routing as Routing)).toBe(true);
  }
});

test("free tier always has at least the classic design — no design is ever free-blank", () => {
  expect(designsFor("free")).toContain("classic");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/lab/capabilities.test.ts`
Expected: FAIL — `DESIGN_ROUTING`/`designsFor` are not exported.

- [ ] **Step 3: Implement the minimal code**

In `lib/email/lab/capabilities.ts`, add near the top (after the existing `FontFamily`
import) and after `FONT_ROUTING`/`fontsFor`:

```ts
import type { ListingFlyerDesignId } from "@/lib/email/listing-flyer-designs";
```

```ts
// ── Listing flyer designs route the same way as fonts — "more designs in paid" is
//    the headline example. classic is "both" — it's the only design free tier will
//    ever see, and paid keeps it as the base fallback (never downgraded). ──────────
export const DESIGN_ROUTING: Record<ListingFlyerDesignId, Routing> = {
  classic: "both",
};

/** The listing-flyer designs a tier may offer. Free always includes classic. */
export function designsFor(tier: EmailLabTier): ListingFlyerDesignId[] {
  return (Object.keys(DESIGN_ROUTING) as ListingFlyerDesignId[]).filter((d) =>
    reaches(DESIGN_ROUTING[d], tier),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/lab/capabilities.test.ts`
Expected: PASS (all tests, including the pre-existing font/feature dial tests).

- [ ] **Step 5: Commit**

```bash
git add lib/email/lab/capabilities.ts lib/email/lab/capabilities.test.ts
git commit -m "feat(email): route listing flyer designs through the tier dial (DESIGN_ROUTING)"
```

---

### Task 5: SQL migration — sticky default + per-category override storage

**Files:**
- Create: `docs/sql/20260707_listing_flyer_design_columns.sql`

**Interfaces:**
- Produces: `public.user_brand_profiles.default_design_id` (text, nullable) and
  `public.user_design_overrides` (user_id, category, design_id) — Task 6 reads both.

- [ ] **Step 1: Write the migration file**

Create `docs/sql/20260707_listing_flyer_design_columns.sql`:

```sql
-- Listing flyer design selection (spec 2026-07-07-listing-flyer-design-variants):
-- a sticky per-user default design, plus a per-category override that beats it.
-- Idempotent.
ALTER TABLE public.user_brand_profiles
  ADD COLUMN IF NOT EXISTS default_design_id text;

CREATE TABLE IF NOT EXISTS public.user_design_overrides (
  user_id uuid NOT NULL,
  category text NOT NULL,
  design_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.user_design_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user reads own design overrides" ON public.user_design_overrides;
CREATE POLICY "user reads own design overrides"
  ON public.user_design_overrides FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user writes own design overrides" ON public.user_design_overrides;
CREATE POLICY "user writes own design overrides"
  ON public.user_design_overrides FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run the migration**

Run: `bun scripts/run-migration.ts docs/sql/20260707_listing_flyer_design_columns.sql`
Expected: `Running docs/sql/20260707_listing_flyer_design_columns.sql...` then `✓ done` then
`Migrations complete.`

- [ ] **Step 3: Verify the columns/table exist**

Run: `bun run gen:types` (the `package.json` script wrapping `bun scripts/gen-supabase-types.ts`)
and confirm `database-generated.types.ts` now has `default_design_id` under
`user_brand_profiles.Row` and a new `user_design_overrides` table entry.

- [ ] **Step 4: Commit**

```bash
git add docs/sql/20260707_listing_flyer_design_columns.sql database-generated.types.ts
git commit -m "feat(db): add default_design_id + user_design_overrides for listing flyer design selection"
```

---

### Task 6: `resolveUserDesign` — two-tier resolution

**Files:**
- Create: `lib/email/templates/resolve-design.ts`
- Test: `lib/email/templates/resolve-design.test.ts`

**Interfaces:**
- Consumes: `type BuildCategory`, `type ListingFlyerDesignId` (Task 3); the
  `user_design_overrides`/`user_brand_profiles.default_design_id` storage (Task 5).
- Produces: `resolveUserDesign(supabase, userId, category): Promise<ListingFlyerDesignId>`.
  Task 8 consumes this.

- [ ] **Step 1: Write the failing tests**

Create `lib/email/templates/resolve-design.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserDesign } from "./resolve-design";

/** Minimal fake of the Supabase chain resolveUserDesign uses:
 *    .from(table).select(cols).eq(...).eq(...)?.single()
 *  Each table maps to the `{ data }` the terminal `.single()` resolves to. */
function fakeSupabase(tables: Record<string, { data: unknown }>) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        single() {
          calls.push({ table, filters });
          return Promise.resolve(tables[table] ?? { data: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("resolveUserDesign", () => {
  it("returns the category override when one is set", () => {
    const { client } = fakeSupabase({
      user_design_overrides: { data: { design_id: "bold-photo" } },
    });
    return resolveUserDesign(client, "user-1", "just-sold").then((d) =>
      expect(d).toBe("bold-photo"),
    );
  });

  it("falls through to the user's sticky default when there's no override", async () => {
    const { client } = fakeSupabase({
      user_design_overrides: { data: null },
      user_brand_profiles: { data: { default_design_id: "bold-photo" } },
    });
    expect(await resolveUserDesign(client, "user-1", "new-listing")).toBe("bold-photo");
  });

  it("falls back to classic when there's no override and no default", async () => {
    const { client } = fakeSupabase({
      user_design_overrides: { data: null },
      user_brand_profiles: { data: { default_design_id: null } },
    });
    expect(await resolveUserDesign(client, "user-new", "coming-to-market")).toBe("classic");
  });

  it("scopes the override lookup to this user AND this category", async () => {
    const { client, calls } = fakeSupabase({
      user_design_overrides: { data: null },
      user_brand_profiles: { data: null },
    });
    await resolveUserDesign(client, "user-7", "just-sold");
    const overrideCall = calls.find((c) => c.table === "user_design_overrides")!;
    expect(overrideCall.filters.user_id).toBe("user-7");
    expect(overrideCall.filters.category).toBe("just-sold");
  });

  it("short-circuits before reading user_brand_profiles when an override exists", async () => {
    const { client, calls } = fakeSupabase({
      user_design_overrides: { data: { design_id: "classic" } },
    });
    await resolveUserDesign(client, "user-1", "new-listing");
    expect(calls.some((c) => c.table === "user_brand_profiles")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/templates/resolve-design.test.ts`
Expected: FAIL — `lib/email/templates/resolve-design.ts` does not exist.

- [ ] **Step 3: Implement the minimal code**

Create `lib/email/templates/resolve-design.ts`:

```ts
// lib/email/templates/resolve-design.ts
//
// Two-tier design resolution for the listing flyer (spec
// docs/superpowers/specs/2026-07-07-listing-flyer-design-variants-design.md):
// a per-category override wins, else the user's sticky default, else "classic".
// Mirrors resolve-brand.ts's project-then-user query shape (this is category-then-
// user instead of project-then-user, but the same "most specific wins" idea).
//
// Free tier NEVER resolves to anything but "classic" — enforced by the CALLER via
// designsFor("free") (lib/email/lab/capabilities.ts), not here: this function has no
// idea what tier is asking, it only resolves what a user has stored.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuildCategory, ListingFlyerDesignId } from "@/lib/email/listing-flyer-designs";

const BASE_DESIGN: ListingFlyerDesignId = "classic";

export async function resolveUserDesign(
  supabase: SupabaseClient,
  userId: string,
  category: BuildCategory,
): Promise<ListingFlyerDesignId> {
  // 1. Category override — this user set a different design for THIS category.
  const { data: override } = await supabase
    .from("user_design_overrides")
    .select("design_id")
    .eq("user_id", userId)
    .eq("category", category)
    .single();
  if (override?.design_id) return override.design_id as ListingFlyerDesignId;

  // 2. User-level sticky default — applies to every category with no override.
  const { data: profile } = await supabase
    .from("user_brand_profiles")
    .select("default_design_id")
    .eq("user_id", userId)
    .single();
  if (profile?.default_design_id) return profile.default_design_id as ListingFlyerDesignId;

  // 3. Base fallback — brand-new user, or free tier (caller filters free regardless).
  return BASE_DESIGN;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/templates/resolve-design.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates/resolve-design.ts lib/email/templates/resolve-design.test.ts
git commit -m "feat(email): resolveUserDesign — category override beats sticky default beats classic"
```

---

### Task 7: Generalize `authorDoc`'s address-lane branch across all three categories

**Files:**
- Modify: `lib/email/build-doc.ts:396-411` (`BuildArgs`), `lib/email/build-doc.ts:709-745`
  (the address-lane branch inside `authorDoc`)
- Test: `lib/email/build-doc-listing-categories.test.ts` (new)

**Interfaces:**
- Consumes: `detectListingCategory` (Task 1), `resolveDesign`, `BuildCategory` (Task 3).
- Produces: `BuildArgs.designId?: string` — Task 8 sets this before calling `authorDoc`.

- [ ] **Step 1: Write the failing test**

Create `lib/email/build-doc-listing-categories.test.ts`:

```ts
import { test, expect, mock, afterAll } from "bun:test";
import * as realResolveSubject from "@/lib/listings/resolve-subject";

const FACTS = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  city: "Fort Myers",
  state: "FL",
  price: "$489,000",
  beds: "3",
  baths: "2",
  sqft: "1840",
  photos: [],
  sourceUrl: "https://www.swfldatagulf.com",
};

const orig = { ...realResolveSubject };
afterAll(() => {
  mock.module("@/lib/listings/resolve-subject", () => orig);
});
mock.module("@/lib/listings/resolve-subject", () => ({
  resolveSubjectListing: async () => FACTS,
}));

const { authorDoc } = await import("./build-doc");
const { SEED_DOCS } = await import("./doc/default-docs");

function blankDoc() {
  return SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
}

test("New Listing prompt builds the new-listing flyer (kicker 'New Listing')", async () => {
  const res = await authorDoc({
    prompt: "Build a new-listing announcement email for my listing at 16447 Rainbow Meadows Ct",
    rawDoc: blankDoc(),
    scope: { address: FACTS.address },
  });
  const doc = res.payload.doc as { blocks: Array<{ type: string; props: Record<string, unknown> }> };
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.props.kicker).toBe("New Listing");
});

test("Just Sold prompt builds the just-sold flyer (kicker 'Just Sold')", async () => {
  const res = await authorDoc({
    prompt: "Build a just-sold email for my listing at 16447 Rainbow Meadows Ct",
    rawDoc: blankDoc(),
    scope: { address: FACTS.address },
  });
  const doc = res.payload.doc as { blocks: Array<{ type: string; props: Record<string, unknown> }> };
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.props.kicker).toBe("Just Sold");
});

test("Coming Soon prompt builds the coming-to-market flyer (kicker 'Coming Soon', address withheld)", async () => {
  const res = await authorDoc({
    prompt: "Build a coming-soon teaser email for my listing at 16447 Rainbow Meadows Ct",
    rawDoc: blankDoc(),
    scope: { address: FACTS.address },
  });
  const doc = res.payload.doc as { blocks: Array<{ type: string; props: Record<string, unknown> }> };
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.props.kicker).toBe("Coming Soon");
  expect(String(hero?.props.label ?? "")).not.toContain("Rainbow Meadows");
});

test("an unresolved designId falls back to classic (no crash, no invented design)", async () => {
  const res = await authorDoc({
    prompt: "Build a just-sold email for my listing at 16447 Rainbow Meadows Ct",
    rawDoc: blankDoc(),
    scope: { address: FACTS.address },
    designId: "not-a-real-design",
  });
  const doc = res.payload.doc as { blocks: Array<{ type: string; props: Record<string, unknown> }> };
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.props.kicker).toBe("Just Sold"); // still built — classic fallback, not a crash
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test lib/email/build-doc-listing-categories.test.ts`
Expected: FAIL — only the New Listing case passes today; Just Sold / Coming Soon fall
through to the generic free author (no flyer, no matching kicker); `designId` is not a
recognized `BuildArgs` field.

- [ ] **Step 3: Implement the minimal code**

In `lib/email/build-doc.ts`, line 43 (`import { buildListingFlyer } from "@/lib/email/listing-flyer";`)
stays exactly as-is — `buildContentDoc`'s separate URL-paste lane (line 452,
`if (isListingIntent(prompt)) { ... buildListingFlyer(facts, doc) ... }`) still calls it
directly and is OUT OF SCOPE for this plan (it always uses the classic arrangement,
never category-aware — untouched). Only line 40 changes, replacing the now-unused
`isNewListingRecipePrompt` with `detectListingCategory` (its one call site, line 716, is
what Task 7 is rewriting):

```ts
import { isListingIntent, detectListingCategory } from "@/lib/email/listing-intent";
```

Add one new import for the design registry (anywhere with the other `@/lib/email/*` imports):

```ts
import { resolveDesign, type ListingFlyerDesignId } from "@/lib/email/listing-flyer-designs";
```

In `BuildArgs` (around line 396-411), add one field:

```ts
export interface BuildArgs {
  prompt: string;
  rawDoc: unknown;
  scope?: BuildScope;
  mode?: string;
  chartType?: ChartType;
  assets?: LibraryAsset[];
  replyEmail?: string;
  /** Resolved listing-flyer design id (Task 6's resolveUserDesign, called by the
   *  route before authorDoc — this module has no Supabase dependency). Absent or
   *  unrecognized -> falls back to "classic", never a crash, never an invented design. */
  designId?: string;
}
```

Replace the address-lane branch (around line 709-745) — change the guard condition and
the builder call site, keep everything else (photo mirroring, chart injection) as-is:

```ts
  // ── Subject-listing flyer lane (address spine) ─────────────────────────────
  // Any of the three listing-scoped recipes (New Listing / Just Sold / Coming to
  // Market) carries the subject ADDRESS but no URL. Resolve THAT property's own
  // for-sale record — real photo + price + beds/sqft — and build the fixed listing
  // FLYER grid for that category's design (same registry the pasted-URL path could
  // also use), instead of letting the free author improvise a generic ZIP/comp card
  // with no house photo. A resolve miss returns the "paste your link or add a photo"
  // ask — never the placeholder grid (that would invent numbers), never a blocked build.
  const listingCategory = scope?.address ? detectListingCategory(prompt) : null;
  if (listingCategory) {
    const facts = await resolveSubjectListing(scope!.address).catch(() => null);
    if (facts) {
      if (facts.photos[0]) {
        const mirrored = await mirrorHeroPhoto(facts.photos[0]).catch(() => null);
        if (mirrored) facts.photos[0] = mirrored;
      }
      const design = resolveDesign(
        LISTING_FLYER_DESIGN_IDS.has(designId as ListingFlyerDesignId)
          ? (designId as ListingFlyerDesignId)
          : "classic",
      );
      let flyer = design.builders[listingCategory](facts, currentDoc);
      const chartScope = facts.zip ? { kind: "zip", value: facts.zip } : scope;
      try {
        const chart = await buildPromptChart(prompt, flyer, chartScope, chartType);
        if (chart) {
          flyer = upsertChartBlock(
            flyer,
            chartImageBlock({
              url: chart.image.url,
              alt: chart.image.alt,
              linkUrl: brandWebsiteUrl(currentDoc),
```

(the rest of that block — everything after `linkUrl: brandWebsiteUrl(currentDoc),` —
is unchanged; only the guard condition and the builder-selection lines above it moved).

Add the small membership-check set near the top of the file, next to the other module-
level constants (anywhere before `authorDoc`):

```ts
const LISTING_FLYER_DESIGN_IDS = new Set<ListingFlyerDesignId>(["classic"]);
```

Destructure `designId` in `authorDoc`'s parameter list (around line 692-700):

```ts
export async function authorDoc({
  prompt,
  rawDoc,
  scope,
  mode,
  chartType,
  assets,
  replyEmail,
  designId,
}: BuildArgs): Promise<BuildResult> {
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test lib/email/build-doc-listing-categories.test.ts lib/email/build-doc-listing.test.ts lib/email/build-doc.test.ts`
Expected: PASS — all four new cases, plus the pre-existing URL-paste flyer test and the
pure-helper tests, unaffected.

- [ ] **Step 5: Commit**

```bash
git add lib/email/build-doc.ts lib/email/build-doc-listing-categories.test.ts
git commit -m "feat(email): authorDoc routes all three listing categories through the design registry"
```

---

### Task 8: Wire `resolveUserDesign` into the API route

**Files:**
- Modify: `app/api/email-lab/ai/route.ts`

**Interfaces:**
- Consumes: `resolveUserDesign` (Task 6), `detectListingCategory` (Task 1),
  `BuildArgs.designId` (Task 7).

- [ ] **Step 1: Implement the wiring**

In `app/api/email-lab/ai/route.ts`, update `loadCaller` to also return the Supabase
client and the caller's user id (needed to resolve a design):

```ts
import { detectListingCategory } from "@/lib/email/listing-intent";
import { resolveUserDesign } from "@/lib/email/templates/resolve-design";
```

```ts
async function loadCaller(): Promise<{
  assets: LibraryAsset[];
  email?: string;
  userId?: string;
  db: ReturnType<typeof createClient>;
}> {
  const db = createClient(await cookies());
  try {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { assets: [], db };
    const { data } = await db
      .from("email_media_assets")
      .select()
      .order("created_at", { ascending: false })
      .limit(24);
    return {
      assets: ((data ?? []) as unknown as MediaAssetRow[]).map(toPanelItem),
      email: user.email ?? undefined,
      userId: user.id,
      db,
    };
  } catch {
    return { assets: [], db };
  }
}
```

In the `POST` handler, where `authorDoc` is called (around line 84-95), resolve the
design right before the call — only when this is an author build with a detected
listing category and a signed-in caller (anonymous/free-flow builds simply omit
`designId`, and `authorDoc` already falls back to `"classic"` per Task 7):

```ts
    try {
      const caller = isAuthor ? await loadCaller() : null;
      let designId: string | undefined;
      if (isAuthor && caller?.userId && body.scope?.address) {
        const category = detectListingCategory(prompt);
        if (category) {
          designId = await resolveUserDesign(caller.db, caller.userId, category).catch(
            () => undefined,
          );
        }
      }
      const { httpStatus, payload } = isAuthor
        ? await authorDoc({
            prompt,
            rawDoc: body.doc,
            scope: body.scope,
            mode: body.mode,
            chartType: body.chartType as ChartType | undefined,
            assets: caller?.assets,
            replyEmail: caller?.email,
            designId,
          })
        : await buildContentDoc({
            prompt,
            rawDoc: body.doc,
            scope: body.scope,
            mode: body.mode,
```

- [ ] **Step 2: Verify with the existing test suite + typecheck**

Run: `bun test lib/email/build-doc-listing-categories.test.ts lib/email/build-doc-listing.test.ts`
Expected: PASS (route.ts itself has no existing unit test file — this wiring is thin
HTTP glue verified by the typecheck + the already-covered `authorDoc`/`resolveUserDesign`
behavior beneath it).

Run: `bunx next build`
Expected: clean build, no type errors (the Vercel-truth typecheck per house rule — bare
`npx tsc` is not the completion bar).

- [ ] **Step 3: Commit**

```bash
git add app/api/email-lab/ai/route.ts
git commit -m "feat(email): resolve the caller's sticky listing-flyer design before authorDoc runs"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all green, including every test touched or added in Tasks 1-8.

- [ ] **Step 2: Run the Vercel-truth typecheck**

Run: `bunx next build`
Expected: clean build.

- [ ] **Step 3: Append a SESSION_LOG entry**

Add a new top-of-file entry to `SESSION_LOG.md` describing what shipped: cross-category
listing-flyer design registry (`"classic"` across New Listing / Just Sold / Coming to
Market), grid layout + resize bounds, tier dial, sticky-default + per-category-override
resolution, and the still-deferred pieces (chooser UI, Change Template UI, swap-on-
existing-doc, second design) per the spec's Non-goals.

- [ ] **Step 4: Commit**

```bash
git add SESSION_LOG.md
git commit -m "docs: SESSION_LOG — listing flyer design variants (cross-category, tiered, sticky default) shipped"
```

- [ ] **Step 5: Close the check opened at brainstorm time**

Run: `node scripts/check.mjs close listing_flyer_design_variants_live_verify`

Note: this closes the OFFLINE-verified portion. The spec's live-verify step (pick each of
the three categories with a real Lee/Collier address, confirm the flyer builds on the
real 2D grid, drag/resize within bounds, delete a block) is operator-run — do not claim
it complete without that manual pass, and do not spend paid API credits attempting to
simulate it.
