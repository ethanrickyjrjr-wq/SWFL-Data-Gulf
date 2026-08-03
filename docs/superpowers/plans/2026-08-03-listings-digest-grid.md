# Multi-Category Listings Digest + `listing-grid` Block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 16 files, keywords: schema, architecture

**Goal:** Ship a realtor.com-style multi-category listings digest email where each category is one reusable `listing-grid` block holding 4 or 6 real home cards, with no home repeated across categories.

**Architecture:** A new `listing-grid` block type renders a whole category section (title, subtitle, a 2-across card grid, one CTA) as a SINGLE block — because `EmailDoc` is capped at 20 blocks and one `listing` block per home costs 6 blocks per category, capping the email at 3 categories. The block is data-seeded (never AI-authored) and palette-addable. A new recipe assigns real listings into categories scarcest-first, removing each category's picks from a shared pool so no home can appear twice. Scope resolves ZIP → city via a USPS-sourced crosswalk, filters to the ZIP, and backfills city-wide when a category is short.

**Tech Stack:** TypeScript, Next.js, React Email (`@react-email/components`), Zod, `bun:test`, SteadyAPI (vendor listings), tracked GeoJSON ZCTA fixtures.

**Spec:** `docs/superpowers/specs/2026-08-03-listings-digest-grid-design.md` — read it before Task 1. This plan implements it; the spec holds the reasoning and the 12 failure modes (F1–F12), which the tests below are named after.

## Global Constraints

- **Verify with `bunx next build`, never `npx tsc`.** Repo-ruled command.
- **Tests run with `bun test <path>`.** Zero vendor quota in the dev loop — every listing test uses an injected `loadListings` dep against fixtures, never a live SteadyAPI call.
- **No invention.** Every rendered field traces to a real held vendor value. A listing missing a real photo or a real listing URL is DROPPED, never rendered as a dead card.
- **Three render engines must agree.** `lib/email/blocks/BlockRenderer.tsx` serves TWO of them (free-tier `EmailDocRenderer.tsx` and grid-tier `compile-grid.ts` both dispatch through it); `lib/pdf/email-doc-pdf.tsx` has its OWN independent `switch`. A block added to one and not the other ships broken — the repo's documented recurring failure (`docs/standards/emails.md` §5).
- **`MIN_CARDS = 4`, `MAX_CARDS = 6`, emitted count is 4 or 6 — never 5** (odd counts orphan a half-width card in a 2-across grid).
- **Spec line is all-three-or-omitted:** beds AND baths AND sqft, or no `specs` field at all. Never a two-field line, never an empty "bath" slot.
- **Photo host guard:** the builder passes `l.photoUrl` through verbatim and NEVER constructs a URL. Any card whose photo host is `api.mapbox.com` is dropped.
- **`git add` explicit paths only, never `-A`** (RULE 1.5). SESSION_LOG entry before any push. Never `--no-verify`.
- **File contention:** Tasks 1–2 touch `types.ts`, `schema.ts`, `block-contract.ts`, `default-docs.ts`, `BlockRenderer.tsx`. Run `repolith claim list` and `git status` first; if another session holds them, work in a worktree via `scripts/worktree.mjs`.

---

### Task 1: The `listing-grid` block vocabulary (types, schema, contract, defaults)

Adds the block type to the four registries that define the block vocabulary. No renderer yet — this task ends with the type existing, validating, and being minted by `createBlock`.

**Files:**
- Modify: `lib/email/doc/types.ts` — add `ListingGridCard` + `ListingGridProps`, register in `BlockPropsMap` (the map containing `listing: ListingProps;` at line 383)
- Modify: `lib/email/doc/schema.ts` — add `ListingGridCardSchema` + `ListingGridPropsSchema` after `ListPropsSchema` (closes line 204), register in the block union
- Modify: `lib/email/doc/block-contract.ts` — add the `BLOCK_CONTRACT` entry after `listing` (closes line 62)
- Modify: `lib/email/doc/default-docs.ts` — add the `DEFAULT_BLOCK_PROPS` entry after `listing` (closes line 87)
- Test: `lib/email/doc/listing-grid-schema.test.ts` (create)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `ListingGridCard` and `ListingGridProps` exported from `lib/email/doc/types.ts`; `BlockType` gains the literal `"listing-grid"`; `createBlock("listing-grid")` returns a block whose `props.cards` is `[]`.

- [ ] **Step 1: Write the failing schema test**

Create `lib/email/doc/listing-grid-schema.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { BlockSchema } from "./schema";
import { createBlock } from "./default-docs";

const card = {
  photoUrl: "https://ap.rdcpix.com/abc/x.jpg",
  linkUrl: "https://www.realtor.com/realestateandhomes-detail/1442-Byron-Rd_Fort-Myers_FL_33919_M1",
  price: "$259,900",
  addressLine1: "1442 Byron Rd",
  addressLine2: "Fort Myers, FL 33919",
};

describe("listing-grid schema", () => {
  test("accepts a real 4-card grid", () => {
    const parsed = BlockSchema.safeParse({
      id: "b1",
      type: "listing-grid",
      props: { title: "New construction homes", subtitle: "Fort Myers", cards: [card, card, card, card] },
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts an EMPTY grid — a palette-added block is an open slot, not a hollow card", () => {
    const parsed = BlockSchema.safeParse({ id: "b2", type: "listing-grid", props: { cards: [] } });
    expect(parsed.success).toBe(true);
  });

  test("rejects more than 6 cards", () => {
    const parsed = BlockSchema.safeParse({
      id: "b3",
      type: "listing-grid",
      props: { cards: [card, card, card, card, card, card, card] },
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects a card with no photoUrl — a dead card must never validate", () => {
    const { photoUrl: _drop, ...noPhoto } = card;
    const parsed = BlockSchema.safeParse({ id: "b4", type: "listing-grid", props: { cards: [noPhoto] } });
    expect(parsed.success).toBe(false);
  });

  test("rejects a card with no linkUrl", () => {
    const { linkUrl: _drop, ...noLink } = card;
    const parsed = BlockSchema.safeParse({ id: "b5", type: "listing-grid", props: { cards: [noLink] } });
    expect(parsed.success).toBe(false);
  });

  test("createBlock mints an empty grid", () => {
    const block = createBlock("listing-grid");
    expect(block.type).toBe("listing-grid");
    expect((block.props as { cards: unknown[] }).cards).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test lib/email/doc/listing-grid-schema.test.ts`
Expected: FAIL — the `"listing-grid"` literal is not in the block union, so every `safeParse` returns `success: false` and `createBlock` is a type error.

- [ ] **Step 3: Add the types**

In `lib/email/doc/types.ts`, add immediately after the `ListingProps` interface (which ends at its `linkUrl?: string;` closing brace, around line 208):

```ts
/** One home in a category grid. Every field is DATA-SEEDED from a real listing —
 *  named OUTSIDE the AI content-patch allowlist, exactly like ListingProps' price/beds,
 *  so a content patch can never write a price or a photo. */
export interface ListingGridCard {
  /** REQUIRED. The listing's own photo, passed through verbatim — never constructed,
   *  never a map tile. A card without one is dropped, never rendered. */
  photoUrl: string;
  photoAlt?: string;
  /** REQUIRED. Real listing-detail URL. A card without one is dropped. */
  linkUrl: string;
  statusLabel?: string;
  statusTone?: "active" | "sold";
  price?: string;
  /** The size of the CUT, preformatted (e.g. "$1,600") — rendered beside the price. */
  priceCut?: string;
  /** "3 bed  2 bath  1,295 sqft" — ALL THREE or absent. Never a partial line. */
  specs?: string;
  addressLine1?: string;
  addressLine2?: string;
}

/** One category section: a header, an optional city subtitle, a 2-across card grid,
 *  and one CTA. ONE block per category — the 20-block EmailDoc cap makes a
 *  block-per-home layout top out at 3 categories. `cards[]` is a structural
 *  exception ordered by array position, like `stats` and `items`. */
export interface ListingGridProps extends BlockBase {
  title?: string;
  subtitle?: string;
  cards: ListingGridCard[];
  ctaLabel?: string;
  ctaUrl?: string;
}
```

Then register it in `BlockPropsMap` by adding directly beneath the `listing: ListingProps;` line:

```ts
  "listing-grid": ListingGridProps;
```

- [ ] **Step 4: Add the schema**

In `lib/email/doc/schema.ts`, add immediately after `ListPropsSchema` (which closes with `}) satisfies z.ZodType<ListProps>;`):

```ts
const ListingGridCardSchema = z.object({
  // REQUIRED, both of them: a card missing either is a dead card. The builder
  // drops such listings; the schema makes it impossible to persist one.
  photoUrl: z.string().min(1),
  linkUrl: z.string().min(1),
  photoAlt: z.string().max(160).optional(),
  statusLabel: z.string().max(24).optional(),
  statusTone: z.enum(["active", "sold"]).optional(),
  price: z.string().max(24).optional(),
  priceCut: z.string().max(24).optional(),
  specs: z.string().max(60).optional(),
  addressLine1: z.string().max(80).optional(),
  addressLine2: z.string().max(80).optional(),
});

const ListingGridPropsSchema = z.object({
  title: z.string().max(120).optional(),
  subtitle: z.string().max(80).optional(),
  // NO .min(1) — deliberately unlike ListProps.items. A palette-added grid starts
  // EMPTY (the repo's open-slot convention); a .min(1) would force
  // DEFAULT_BLOCK_PROPS to ship a placeholder card with a fabricated photo.
  cards: z.array(ListingGridCardSchema).max(6),
  ctaLabel: z.string().max(40).optional(),
  ctaUrl: z.string().optional(),
  paddingY: paddingY(),
  sectionBg: sectionBg(),
}) satisfies z.ZodType<ListingGridProps>;
```

Import `ListingGridProps` alongside the other prop types already imported at the top of `schema.ts`.

Then wire it into the discriminated block union: find where `ListPropsSchema` is attached to its `type: z.literal("list")` variant and add a sibling variant in the identical shape, with `z.literal("listing-grid")` and `ListingGridPropsSchema`. Mirror the neighbouring entry exactly — do not invent a different wrapper shape.

- [ ] **Step 5: Add the contract entry**

In `lib/email/doc/block-contract.ts`, add to `BLOCK_CONTRACT` directly after the `listing` entry:

```ts
  "listing-grid": {
    // NOT authorable — same reason as `listing`: every field is data-seeded from a
    // real listing (photoUrl/price/address), deliberately outside AuthoredBlockSchema.
    // An authored one would ship a hollow card with every field defaulting to "".
    authorable: false,
    bandable: true,
    zone: "body",
    menu: { label: "Listing Grid", icon: "⊞" },
  },
```

Placement matters: the file's header states entries are listed in `DEFAULT_BLOCK_PROPS` insertion order so a `.filter(...)` derivation reproduces the pre-converge lists byte-for-byte. Insert at the SAME relative position in both files.

- [ ] **Step 6: Add the default props**

In `lib/email/doc/default-docs.ts`, add to `DEFAULT_BLOCK_PROPS` directly after the `listing` entry:

```ts
  "listing-grid": {
    title: "Homes worth a look",
    // EMPTY on purpose — an open slot the builder fills with real listings. A seeded
    // placeholder card would need a fabricated photoUrl (THE SLOT RULE, lib/email/CLAUDE.md).
    cards: [],
    ctaLabel: "View all",
  },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test lib/email/doc/listing-grid-schema.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 8: Run the block-contract test — it enforces derivation order**

Run: `bun test lib/email/doc/block-contract.test.ts`
Expected: PASS. If it fails on list ordering, the contract entry and the default-props entry sit at different relative positions — align them per Step 5's note.

- [ ] **Step 9: Typecheck**

Run: `bunx next build`
Expected: compiles. `BlockPropsMap` is exhaustive-keyed, so a renderer switch missing the new case surfaces here — that is Task 2's deliverable; note any such errors and proceed.

- [ ] **Step 10: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/block-contract.ts lib/email/doc/default-docs.ts lib/email/doc/listing-grid-schema.test.ts
git commit -m "feat(email): listing-grid block vocabulary — one block per listing category"
```

---

### Task 2: Render `listing-grid` in all three engines

**Files:**
- Create: `lib/email/blocks/ListingGridBlock.tsx`
- Modify: `lib/email/blocks/BlockRenderer.tsx` — add `case "listing-grid"` after `case "listing":` (line 87); serves free-tier AND grid-tier
- Modify: `lib/pdf/email-doc-pdf.tsx` — add `case "listing-grid"` to its independent switch (its `listing` case is at line 590, `multi-column` at line 654)
- Test: `lib/email/blocks/listing-grid-render.test.tsx` (create)

**Interfaces:**
- Consumes: `ListingGridProps`, `ListingGridCard` from `lib/email/doc/types.ts` (Task 1).
- Produces: `ListingGridBlock({ props, globalStyle })` exported from `lib/email/blocks/ListingGridBlock.tsx`.

- [ ] **Step 1: Write the failing render test**

Create `lib/email/blocks/listing-grid-render.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test";
import { render } from "@react-email/components";
import { ListingGridBlock } from "./ListingGridBlock";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";

const card = (n: number) => ({
  photoUrl: `https://ap.rdcpix.com/photo${n}.jpg`,
  linkUrl: `https://www.realtor.com/realestateandhomes-detail/home-${n}`,
  price: `$${200 + n},000`,
  addressLine1: `${n} Byron Rd`,
  addressLine2: "Fort Myers, FL 33919",
});

const html = (props: Parameters<typeof ListingGridBlock>[0]["props"]) =>
  render(<ListingGridBlock props={props} globalStyle={DEFAULT_GLOBAL_STYLE} />);

describe("ListingGridBlock", () => {
  test("renders every card's real photo and real link", async () => {
    const out = await html({ title: "Price drops", cards: [card(1), card(2), card(3), card(4)] });
    for (const n of [1, 2, 3, 4]) {
      expect(out).toContain(`photo${n}.jpg`);
      expect(out).toContain(`home-${n}`);
    }
  });

  test("renders the section title and subtitle", async () => {
    const out = await html({ title: "New construction homes", subtitle: "Fort Myers", cards: [card(1), card(2)] });
    expect(out).toContain("New construction homes");
    expect(out).toContain("Fort Myers");
  });

  test("F11 — an EMPTY grid renders nothing, never a hollow card", async () => {
    const out = await html({ cards: [] });
    expect(out).not.toContain("<img");
  });

  test("F8 — omits the specs line entirely when absent, never a blank bath slot", async () => {
    const out = await html({ cards: [card(1), card(2)] });
    expect(out).not.toContain("bath");
  });

  test("renders the price-cut badge only when a real cut exists", async () => {
    const withCut = await html({ cards: [{ ...card(1), priceCut: "$1,600" }, card(2)] });
    expect(withCut).toContain("$1,600");
    const noCut = await html({ cards: [card(1), card(2)] });
    expect(noCut).not.toContain("$1,600");
  });

  test("renders the CTA only when both label and url are present", async () => {
    const out = await html({ cards: [card(1), card(2)], ctaLabel: "View price drops", ctaUrl: "https://example.com/x" });
    expect(out).toContain("View price drops");
    expect(out).toContain("https://example.com/x");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test lib/email/blocks/listing-grid-render.test.tsx`
Expected: FAIL — `Cannot find module './ListingGridBlock'`.

- [ ] **Step 3: Write the block component**

Read `lib/email/blocks/MultiColumnBlock.tsx` FIRST and copy its side-by-side structure — it is the repo's proven Cerberus hybrid 2-across pattern (fluid inline-block; degrades to stacked in Outlook). Do not invent a new column mechanism. Read `lib/email/blocks/ListingBlock.tsx` for the per-card visual order (photo → price → specs → address → "View listing →") and reuse its `text()`/`space()`/`legibleInk()` scale helpers so typography matches the system.

Create `lib/email/blocks/ListingGridBlock.tsx`:

```tsx
// lib/email/blocks/ListingGridBlock.tsx — PURE. ONE category section: a header,
// an optional city subtitle, a 2-across grid of real listing cards, one CTA.
//
// WHY THIS EXISTS AS A BLOCK: EmailDoc is capped at 20 blocks (schema.ts). A
// block-per-home layout costs 6 blocks per category and tops the email out at 3
// categories with no hero and no closing CTA. One block per category makes a
// 5-category digest ~9 blocks. See the design spec, §1.
//
// Every field is listing-sourced. The AI content-patch never writes a price or a
// photo (no-invention moat) — same fence as ListingBlock.
import { Section, Row, Column, Img, Text, Link } from "@react-email/components";
import type { EmailGlobalStyle, ListingGridCard, ListingGridProps } from "../doc/types";
import { fontStack, sectionPad, MUTED, BORDER, CARD_BG } from "./styles";
import { text, space, WEIGHT } from "./scale";
import { legibleInk } from "./on-dark";

/** Pair the cards into rows of two — the reference's 2x2. An odd trailing card
 *  sits alone at half width; the RECIPE only ever emits 4 or 6, so this is a
 *  defensive shape for hand-built palette grids. */
function pairs(cards: ListingGridCard[]): ListingGridCard[][] {
  const out: ListingGridCard[][] = [];
  for (let i = 0; i < cards.length; i += 2) out.push(cards.slice(i, i + 2));
  return out;
}

export function ListingGridBlock({
  props,
  globalStyle,
}: {
  props: ListingGridProps;
  globalStyle: EmailGlobalStyle;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const bg = props.sectionBg ?? CARD_BG;
  const cards = props.cards ?? [];
  // An empty grid renders NOTHING in a sent email — a palette-added block is an
  // open slot, never a hollow card.
  if (cards.length === 0) return null;

  return (
    <Section style={{ backgroundColor: bg, padding: sectionPad(props.paddingY), border: `1px solid ${BORDER}`, borderRadius: "8px" }}>
      {props.title ? (
        <Text style={{ fontFamily: font, ...text("subhead", { weight: WEIGHT.emphasis }), color: globalStyle.textColor, margin: space(0, 0, 4) }}>
          {props.title}
        </Text>
      ) : null}
      {props.subtitle ? (
        <Text style={{ fontFamily: font, ...text("caption", { weight: WEIGHT.emphasis }), color: MUTED, margin: space(0, 0, 12) }}>
          {props.subtitle}
        </Text>
      ) : null}

      {pairs(cards).map((row, ri) => (
        <Row key={ri}>
          {row.map((c, ci) => (
            <Column key={ci} style={{ width: "50%", verticalAlign: "top", paddingRight: ci === 0 ? "8px" : "0", paddingBottom: "16px" }}>
              <Link href={c.linkUrl}>
                <Img
                  src={c.photoUrl}
                  alt={c.photoAlt ?? c.addressLine1 ?? "Listing photo"}
                  width={252}
                  style={{ width: "100%", maxWidth: "252px", height: "auto", display: "block", borderRadius: "6px" }}
                />
              </Link>

              {c.statusLabel ? (
                <Text style={{ fontFamily: font, ...text("caption"), color: c.statusTone === "sold" ? "#c0272d" : "#1c8a4a", margin: space(8, 0, 0) }}>
                  ● {c.statusLabel}
                </Text>
              ) : null}

              {c.price ? (
                <Text style={{ fontFamily: font, ...text("metric", { numeric: true }), color: legibleInk(globalStyle.primaryColor, bg, 3), margin: space(4, 0, 0) }}>
                  {c.price}
                  {c.priceCut ? (
                    <span style={{ ...text("caption", { numeric: true }), color: "#1c8a4a" }}>{"  ↓ "}{c.priceCut}</span>
                  ) : null}
                </Text>
              ) : null}

              {/* ALL THREE specs or nothing — the builder never sets a partial line. */}
              {c.specs ? (
                <Text style={{ fontFamily: font, ...text("caption", { numeric: true }), color: MUTED, margin: space(4, 0, 0) }}>{c.specs}</Text>
              ) : null}

              {c.addressLine1 ? (
                <Text style={{ fontFamily: font, ...text("caption"), color: globalStyle.textColor, margin: space(6, 0, 0) }}>{c.addressLine1}</Text>
              ) : null}
              {c.addressLine2 ? (
                <Text style={{ fontFamily: font, ...text("caption"), color: globalStyle.textColor, margin: space(0, 0, 0) }}>{c.addressLine2}</Text>
              ) : null}

              <Text style={{ margin: space(6, 0, 0) }}>
                <Link href={c.linkUrl} style={{ fontFamily: font, ...text("caption", { weight: WEIGHT.emphasis }), color: legibleInk(globalStyle.accentColor, bg, 4.5) }}>
                  View listing →
                </Link>
              </Text>
            </Column>
          ))}
        </Row>
      ))}

      {props.ctaLabel && props.ctaUrl ? (
        <Text style={{ margin: space(8, 0, 0) }}>
          <Link href={props.ctaUrl} style={{ fontFamily: font, ...text("caption", { weight: WEIGHT.emphasis }), color: legibleInk(globalStyle.accentColor, bg, 4.5) }}>
            {props.ctaLabel}
          </Link>
        </Text>
      ) : null}
    </Section>
  );
}
```

If `text("subhead")` is not a real scale key, read `lib/email/blocks/scale.ts` and substitute the key other block components use for a section heading. Do not invent a scale key.

- [ ] **Step 4: Run the render test to verify it passes**

Run: `bun test lib/email/blocks/listing-grid-render.test.tsx`
Expected: PASS, 6/6.

- [ ] **Step 5: Wire the free-tier + grid-tier engines**

In `lib/email/blocks/BlockRenderer.tsx`, add directly after `case "listing":` a sibling case in the identical shape the neighbouring cases use:

```tsx
    case "listing-grid":
      return <ListingGridBlock props={block.props} globalStyle={globalStyle} />;
```

Import `ListingGridBlock` alongside the other block imports at the top of the file. This single case serves TWO engines: `EmailDocRenderer.tsx` (free tier) and `compile-grid.ts` (grid tier) both dispatch through `BlockRenderer`.

- [ ] **Step 6: Wire the PDF engine**

`lib/pdf/email-doc-pdf.tsx` has its OWN `switch` and does NOT use `BlockRenderer` — Step 5 does not cover it. Read its `case "listing": {` block and its `case "multi-column": {` block, then add a `case "listing-grid": {` that renders the same content with `@react-pdf` primitives: take the two-column layout from the `multi-column` case and the per-card field order from the `listing` case.

- [ ] **Step 7: Write the three-engine parity test**

Append to `lib/email/blocks/listing-grid-render.test.tsx`:

```tsx
test("F9 — the block renders in all three engines, not just one", async () => {
  const doc = {
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [
      {
        id: "g1",
        type: "listing-grid" as const,
        props: { title: "Price drops", cards: [card(1), card(2), card(3), card(4)] },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
    ],
  };
  const gridHtml = await compileGridEmail(doc as never);
  expect(gridHtml).toContain("photo1.jpg");
  const pdf = await renderEmailDocPdf(doc as never);
  expect(pdf).toBeTruthy();
});
```

Add the two imports at the top of the file. **Correct both names and their call signatures against the real exports** in `lib/email/compile-grid.ts` and `lib/pdf/email-doc-pdf.tsx` before running — use whatever those files actually export, do not assume these names.

- [ ] **Step 8: Run the full block test file**

Run: `bun test lib/email/blocks/listing-grid-render.test.tsx`
Expected: PASS, 7/7.

- [ ] **Step 9: Verify the build**

Run: `bunx next build`
Expected: compiles clean — no non-exhaustive-switch errors remain in either renderer.

- [ ] **Step 10: Commit**

```bash
git add lib/email/blocks/ListingGridBlock.tsx lib/email/blocks/BlockRenderer.tsx lib/pdf/email-doc-pdf.tsx lib/email/blocks/listing-grid-render.test.tsx
git commit -m "feat(email): render listing-grid in all three engines"
```

---

### Task 3: ZIP scope lane — point-in-polygon + sourced ZIP→city

Touches no shared file. Can be built in parallel with Tasks 1–2.

**Files:**
- Create: `lib/geo/point-in-zip.ts`
- Test: `lib/geo/point-in-zip.test.ts` (create)

**Interfaces:**
- Consumes: `fixtures/swfl-zip-polygons.json` (tracked, 2020 TIGERweb ZCTA GeoJSON, `properties.zip`, Polygon and MultiPolygon, `multipolygon_zips: ["33956","34102"]`); `fixtures/swfl-place-zip-crosswalk.json` (`zip`, `alt_zips[]`, `usps_preferred_city`); `cityForZip` from `lib/swfl-zip-city.ts`.
- Produces: `zipForPoint(lat: number, lon: number): string | null` and `cityForZipSourced(zip: string): string | null`, both exported from `lib/geo/point-in-zip.ts`.

- [ ] **Step 1: Write the failing test**

Create `lib/geo/point-in-zip.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { zipForPoint, cityForZipSourced } from "./point-in-zip";

describe("zipForPoint", () => {
  test("a point inside a known SWFL ZIP resolves to that ZIP", () => {
    // Downtown Fort Myers, inside 33901.
    expect(zipForPoint(26.6406, -81.8723)).toBe("33901");
  });

  test("a point far outside the SWFL footprint resolves to null, never a guess", () => {
    expect(zipForPoint(47.6062, -122.3321)).toBeNull(); // Seattle
  });

  test("a MultiPolygon ZIP resolves for a point in one of its parts", () => {
    // 33956 (Saint James City / Pine Island) is declared multipolygon in the fixture.
    expect(zipForPoint(26.4959, -82.0784)).toBe("33956");
  });

  test("non-finite coordinates resolve to null, never throw", () => {
    expect(zipForPoint(Number.NaN, -81.8)).toBeNull();
  });
});

describe("cityForZipSourced", () => {
  test("F5 — 33919 resolves to Fort Myers, NOT the county anchor Cape Coral", () => {
    expect(cityForZipSourced("33919")).toBe("Fort Myers");
  });

  test("an out-of-scope ZIP resolves to null", () => {
    expect(cityForZipSourced("90210")).toBeNull();
  });
});
```

Before running, open `fixtures/swfl-zip-polygons.json` and confirm the three test coordinates fall in the ZIPs asserted. If one does not, replace it with a coordinate you verify from the fixture's own geometry — do NOT adjust the implementation to match a wrong expectation.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test lib/geo/point-in-zip.test.ts`
Expected: FAIL — `Cannot find module './point-in-zip'`.

- [ ] **Step 3: Implement**

Create `lib/geo/point-in-zip.ts`:

```ts
// lib/geo/point-in-zip.ts — ZIP resolution for a coordinate, and the SOURCED
// ZIP -> city lane.
//
// WHY: scopeCity() (lib/listings/select.ts) does NOT resolve a ZIP to its city —
// it maps ZIP -> county -> the county's ANCHOR city, so 33919 (Fort Myers)
// resolves to "Cape Coral" (check zip_scope_resolves_to_county_anchor_city).
// Anything needing the REAL city for a ZIP uses cityForZipSourced here.
//
// Geometry is the tracked 2020 TIGERweb ZCTA fixture — no network, no vendor call.
import zipPolygons from "@/fixtures/swfl-zip-polygons.json";
import placeCrosswalk from "@/fixtures/swfl-place-zip-crosswalk.json";
import { cityForZip } from "@/lib/swfl-zip-city";

type Ring = [number, number][];
interface Feature {
  properties?: { zip?: string };
  geometry?: { type?: string; coordinates?: unknown };
}

/** Standard ray-casting. `ring` is GeoJSON order: [lon, lat]. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const straddles = yi > lat !== yj > lat;
    if (straddles && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A polygon is [outerRing, ...holes] — inside the outer ring and in no hole. */
function inPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  if (!poly.length || !inRing(lon, lat, poly[0]!)) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h]!)) return false;
  return true;
}

const FEATURES: Feature[] = (zipPolygons as { features?: Feature[] }).features ?? [];

/** The ZIP whose ZCTA boundary contains this point, or null. Never guesses. */
export function zipForPoint(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const f of FEATURES) {
    const zip = f.properties?.zip;
    const g = f.geometry;
    if (!zip || !g?.coordinates) continue;
    if (g.type === "Polygon") {
      if (inPolygon(lon, lat, g.coordinates as Ring[])) return zip;
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as Ring[][]) {
        if (inPolygon(lon, lat, poly)) return zip;
      }
    }
  }
  return null;
}

interface CrosswalkEntry {
  zip?: string;
  alt_zips?: string[];
  usps_preferred_city?: string;
}

const CITY_BY_ZIP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const entries: CrosswalkEntry[] = (placeCrosswalk as { entries?: CrosswalkEntry[] }).entries ?? [];
  // Primaries first, so a primary always wins over another place's alt.
  for (const e of entries) if (e.zip && e.usps_preferred_city) m.set(e.zip, e.usps_preferred_city);
  for (const e of entries) {
    if (!e.usps_preferred_city) continue;
    for (const alt of e.alt_zips ?? []) if (!m.has(alt)) m.set(alt, e.usps_preferred_city);
  }
  return m;
})();

/** The real USPS-preferred city for a ZIP — the SOURCED lane (the crosswalk carries
 *  its own `source` + `verified_date`), falling back to the unsourced
 *  lib/swfl-zip-city map so the caller stays total. NEVER the county anchor. */
export function cityForZipSourced(zip: string): string | null {
  const z = zip.trim();
  return CITY_BY_ZIP.get(z) ?? cityForZip(z) ?? null;
}
```

Confirm the crosswalk's real top-level key and per-entry field names by opening `fixtures/swfl-place-zip-crosswalk.json` before running; adjust `CrosswalkEntry` to match. Confirm `cityForZip`'s exact export name and return type in `lib/swfl-zip-city.ts` (it may return `string | undefined`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/geo/point-in-zip.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/geo/point-in-zip.ts lib/geo/point-in-zip.test.ts
git commit -m "feat(geo): ZIP-from-coordinate + sourced ZIP-to-city lane"
```

---

### Task 4: The `listings-digest` recipe

**Files:**
- Create: `lib/deliverable/recipes/listings-digest.ts`
- Modify: `lib/deliverable/recipes.ts` — add to `RECIPE_KEYS` (array at line 51) and add the `Recipe` entry (mirror `"listings-showcase"` at line 384)
- Modify: `lib/deliverable/recipes/index.ts` — import (mirror line 54) + register in `RECIPE_BUILDERS` (mirror line 109)
- Test: `lib/deliverable/recipes/listings-digest.test.ts` (create)

**Interfaces:**
- Consumes: `ListingGridProps`/`ListingGridCard` (Task 1); `zipForPoint`/`cityForZipSourced` (Task 3); `fetchPhotoListings` from `lib/listings/steadyapi`; `rankListings` from `lib/listings/select`; `finalizeDoc`/`PlanEntry` from `lib/email/doc/finalize-doc`; `GRID_COLS` from `lib/email/grid-schema`; `RecipeBuildContext` from `./index`.
- Produces: `assignCategories(listings: readonly Listing[], city: string): CategorySection[]` and `buildListingsDigest(ctx: RecipeBuildContext, deps?: ListingsDigestDeps): Promise<EmailDoc | null>`, where `CategorySection = { category: string; title: string; listings: Listing[] }` and `ListingsDigestDeps = { loadListings?: (zip: string) => Promise<{ listings: Listing[]; city: string }> }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/deliverable/recipes/listings-digest.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { assignCategories, buildListingsDigest } from "./listings-digest";
import type { Listing } from "@/lib/listings/rentcast";

const base = (i: number, over: Partial<Listing> = {}): Listing =>
  ({
    id: `sa_${i}`,
    addressLine1: `${i} Byron Rd`,
    city: "Fort Myers",
    state: "FL",
    zipCode: "33919",
    photoUrl: `https://ap.rdcpix.com/p${i}.jpg`,
    listingUrl: `https://www.realtor.com/realestateandhomes-detail/home-${i}`,
    price: 200000 + i,
    bedrooms: 3,
    bathrooms: null,
    squareFootage: 1500,
    lotSize: null,
    latitude: 26.55,
    longitude: -81.9,
    ...over,
  }) as Listing;

const many = (n: number, over: Partial<Listing> = {}) =>
  Array.from({ length: n }, (_, i) => base(i + 1, over));

/** Re-key a batch so distinct groups never collide on the dedupe key. */
const rekey = (ls: Listing[], tag: string, from: number) =>
  ls.map((l, i) => ({ ...l, id: `${tag}_${i}`, addressLine1: `${from + i} ${tag} St` }));

describe("assignCategories", () => {
  test("F2 — no home appears in two categories", () => {
    const pool = many(12, { isNewConstruction: true, isPriceReduced: true, priceReduction: 5000, isNewListing: true });
    const keys = assignCategories(pool, "Fort Myers").flatMap((s) => s.listings.map((l) => l.addressLine1 || l.id));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("F3 — the scarce category fills before the catch-all eats the pool", () => {
    const pool = [...many(4, { isNewConstruction: true }), ...rekey(many(8), "other", 100)];
    const sections = assignCategories(pool, "Fort Myers");
    expect(sections[0]!.category).toBe("new-construction");
    expect(sections[0]!.listings).toHaveLength(4);
  });

  test("F2b — a category short of 4 emits no grid at all", () => {
    const pool = [...many(3, { isNewConstruction: true }), ...rekey(many(8), "other", 200)];
    expect(assignCategories(pool, "Fort Myers").some((s) => s.category === "new-construction")).toBe(false);
  });

  test("F2b — every emitted section holds exactly 4 or 6, never 5", () => {
    for (const s of assignCategories(many(17), "Fort Myers")) {
      expect([4, 6]).toContain(s.listings.length);
    }
  });

  test("F1 — a mapbox photo host is dropped, never rendered", () => {
    const pool = [
      ...rekey(many(4, { photoUrl: "https://api.mapbox.com/styles/v1/static/x.png" }), "map", 300),
      ...rekey(many(6), "real", 400),
    ];
    const urls = assignCategories(pool, "Fort Myers").flatMap((s) => s.listings.map((l) => l.photoUrl ?? ""));
    expect(urls.some((u) => u.includes("api.mapbox.com"))).toBe(false);
  });

  test("F7 — every emitted listing carries a real photo AND a real link", () => {
    const pool = [...many(6), ...rekey(many(3, { listingUrl: undefined }), "nolink", 500)];
    for (const s of assignCategories(pool, "Fort Myers")) {
      for (const l of s.listings) {
        expect(l.photoUrl).toBeTruthy();
        expect(l.listingUrl).toBeTruthy();
      }
    }
  });
});

describe("buildListingsDigest", () => {
  const ctx = (zip?: string) => ({ zip, currentDoc: { globalStyle: {}, blocks: [] } }) as never;
  const cards = (doc: { blocks: { type: string; props: unknown }[] }) =>
    doc.blocks.filter((b) => b.type === "listing-grid").flatMap((b) => (b.props as { cards: Record<string, string>[] }).cards);

  test("no ZIP named -> null, never a guessed city", async () => {
    expect(await buildListingsDigest(ctx(undefined))).toBeNull();
  });

  test("F12 — a degraded vendor fetch returns null, never an empty digest", async () => {
    const doc = await buildListingsDigest(ctx("33919"), { loadListings: async () => ({ listings: [], city: "Fort Myers" }) });
    expect(doc).toBeNull();
  });

  test("F4 — every planned category survives capBlocks as a rendered grid", async () => {
    const pool = [
      ...rekey(many(6, { isNewConstruction: true }), "a", 10),
      ...rekey(many(6, { isPriceReduced: true, priceReduction: 4000 }), "b", 20),
      ...rekey(many(6, { isNewListing: true }), "c", 30),
      ...rekey(many(6, { lotSize: 0.9 }), "d", 40),
      ...rekey(many(6), "e", 50),
    ];
    const doc = await buildListingsDigest(ctx("33919"), { loadListings: async () => ({ listings: pool, city: "Fort Myers" }) });
    const planned = assignCategories(pool, "Fort Myers").length;
    expect(doc!.blocks.filter((b) => b.type === "listing-grid")).toHaveLength(planned);
  });

  test("F8 — a listing with no bath count emits NO specs line at all", async () => {
    const doc = await buildListingsDigest(ctx("33919"), { loadListings: async () => ({ listings: many(6), city: "Fort Myers" }) });
    for (const c of cards(doc!)) expect(c.specs).toBeUndefined();
  });

  test("F6 — each card states its OWN zip, so a backfilled home never implies the named ZIP", async () => {
    const pool = rekey(many(6), "z", 60).map((l, i) => ({ ...l, zipCode: i < 3 ? "33919" : "33907" }));
    const doc = await buildListingsDigest(ctx("33919"), { loadListings: async () => ({ listings: pool, city: "Fort Myers" }) });
    expect(cards(doc!).some((c) => c.addressLine2?.includes("33907"))).toBe(true);
  });

  test("F10 — no two emitted cards are field-identical", async () => {
    const doc = await buildListingsDigest(ctx("33919"), { loadListings: async () => ({ listings: many(6), city: "Fort Myers" }) });
    const seen = cards(doc!).map((c) => JSON.stringify(c));
    expect(new Set(seen).size).toBe(seen.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test lib/deliverable/recipes/listings-digest.test.ts`
Expected: FAIL — `Cannot find module './listings-digest'`.

- [ ] **Step 3: Write the recipe builder**

Read `lib/deliverable/recipes/listings-showcase.ts` first and follow its `push()`/`PlanEntry`/`keepOrDefault` structure verbatim — it is the closest precedent and is already proven to build and send.

Create `lib/deliverable/recipes/listings-digest.ts` with these constants and category table:

```ts
const MAX_CARDS = 6;
const MIN_CARDS = 4;
const BANNED_PHOTO_HOSTS = ["api.mapbox.com"]; // F1 — a map tile is not a home photo

export interface CategorySection {
  category: string;
  title: string;
  listings: Listing[];
}

const CATEGORIES: ReadonlyArray<{
  category: string;
  title: (city: string) => string;
  eligible: (l: Listing) => boolean;
}> = [
  { category: "new-construction", title: () => "New construction homes", eligible: (l) => l.isNewConstruction === true },
  { category: "price-drops", title: () => "Price drops", eligible: (l) => l.isPriceReduced === true && (l.priceReduction ?? 0) > 0 },
  { category: "just-listed", title: () => "Just listed", eligible: (l) => l.isNewListing === true },
  { category: "big-lot", title: () => "Room to spread out", eligible: (l) => l.lotSize != null && l.lotSize >= 0.5 },
  { category: "more-homes", title: (city) => `More homes in ${city}`, eligible: () => true },
];

const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
```

`assignCategories(listings, city)` — pure, exported:
1. Filter to renderable listings: a real `photoUrl` whose host is in no `BANNED_PHOTO_HOSTS` entry, a real `listingUrl`, and not already seen under key `addressLine1 || id` (F1, F7, dedupe key).
2. Walk `CATEGORIES` in order. For each, `take` the first `MAX_CARDS` eligible from the remaining pool.
3. If `take.length < MIN_CARDS`, skip the category entirely (F2b).
4. Truncate `take` to the largest even length (F2b — 4 or 6, never 5).
5. Remove `take` from the pool before the next category runs (F2 — this single step is the whole no-duplicate guarantee).

`buildListingsDigest(ctx, deps = {})`:
1. `const zip = ctx.zip?.trim(); if (!zip) return null;`
2. Default `loadListings` resolves the city with `cityForZipSourced(zip)` — **never `scopeCity`** (F5) — then calls `fetchPhotoListings({ city, state: "FL" })` and returns `rankListings(...)`. Wrap in `.catch(() => ({ listings: [], city: "" }))` like `listings-showcase` does.
3. Partition the ranked pool into ZIP-local (`l.zipCode === zip`, or `zipForPoint(l.latitude, l.longitude) === zip` when `zipCode` is empty) and the city remainder. Concatenate ZIP-local first, remainder second — ONE shared pool, ZIP-preferred. This is what makes F2 hold across the ZIP/city boundary.
4. `if (pool.length === 0) return null;` (F12).
5. `const sections = assignCategories(pool, city); if (sections.length === 0) return null;`
6. Push: header (`keepOrDefault`), hero, one `listing-grid` entry per section at `span: GRID_COLS` / `newRow: true`, a closing `button`, then footer with `isStatic`.
7. Card mapping, per listing — every field from a held value:
   - `photoUrl: l.photoUrl!`, `linkUrl: l.listingUrl!`
   - `statusLabel: "For sale"`, `statusTone: "active"`
   - `price: l.price != null ? usd(l.price) : undefined`
   - `priceCut: l.isPriceReduced && (l.priceReduction ?? 0) > 0 ? usd(l.priceReduction!) : undefined`
   - `specs`: set ONLY when `l.bedrooms != null && l.bathrooms != null && l.squareFootage != null` (F8) — `` `${l.bedrooms} bed  ${l.bathrooms} bath  ${l.squareFootage.toLocaleString("en-US")} sqft` ``
   - `addressLine1: l.addressLine1 || undefined`
   - `addressLine2`: built from the listing's OWN `city`/`state`/`zipCode` (F6), never the requested ZIP
8. Return `finalizeDoc({ globalStyle: { ...ctx.currentDoc.globalStyle }, entries })` spread with `subjectVariants` composed in code from the real section and home counts, so no two builds ship an identical subject.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/deliverable/recipes/listings-digest.test.ts`
Expected: PASS, 12/12 (6 `assignCategories`, 6 `buildListingsDigest`).

- [ ] **Step 5: Register the recipe**

In `lib/deliverable/recipes.ts`, add `"listings-digest",` to the `RECIPE_KEYS` array, then add the `Recipe` entry mirroring `"listings-showcase"`:

```ts
  "listings-digest": {
    key: "listings-digest",
    // Pitches no specific property and no agent brand — recurring discovery content
    // for a saved-search audience. FAVORABLE_FRAMING_POLICY is NOT used here; this
    // recipe has no LLM prompt at all.
    positioning: "story-side",
    label: "Listings Digest",
    // The builder composes its own category sections — a variable category count
    // has no fixed grid (listings-showcase precedent).
    skeleton: null,
    prose: null,
    subject: "area",
    chart: "none",
    prompt:
      "Build a listings digest for [[your city or ZIP]] — several categories of real " +
      "homes for sale right now (new construction, price drops, just listed), each " +
      "category showing four real homes with photos, prices and links.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
```

In `lib/deliverable/recipes/index.ts`:

```ts
import { buildListingsDigest } from "./listings-digest";
// ...in RECIPE_BUILDERS:
  "listings-digest": (ctx) => buildListingsDigest(ctx), // one grid block per category, 4-6 real homes each
```

- [ ] **Step 6: Verify the build and the full recipe suite**

Run: `bunx next build`
Expected: compiles. `RECIPE_BUILDERS` is keyed by `RecipeKey`, so a missing registration fails here.

Run: `bun test lib/deliverable/recipes/`
Expected: PASS — including the pre-existing `listings-showcase.test.ts`, unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/deliverable/recipes/listings-digest.ts lib/deliverable/recipes/listings-digest.test.ts lib/deliverable/recipes.ts lib/deliverable/recipes/index.ts
git commit -m "feat(deliverable): listings-digest recipe — multi-category, no home twice"
```

---

### Task 5: Live proof send

Evidence, not attestation. `docs/standards/emails.md` §6 governs.

**Files:**
- Create: `scripts/email/tmp-listings-digest-send.mts` (LOCAL ONLY, gitignored via `scripts/email/tmp-*.mts` — never commit it, and never mutate `tmp-listings-showcase-send.mts`, which a future re-run may need)

- [ ] **Step 1: Write the proof script**

Copy `scripts/email/tmp-listings-showcase-send.mts` to `scripts/email/tmp-listings-digest-send.mts`, change the recipe key to `listings-digest` and the ZIP to a real Lee County ZIP (33919). Leave its send lane, brand application, and CAN-SPAM footer path untouched.

- [ ] **Step 2: Build once WITHOUT sending, and grep the rendered HTML**

```bash
bun scripts/email/tmp-listings-digest-send.mts --dry-run > /tmp/digest.html
grep -c "rdcpix" /tmp/digest.html                    # expect >= 8 — real listing photos
grep -c "api.mapbox.com" /tmp/digest.html            # expect 0 — F1
grep -c "realestateandhomes-detail" /tmp/digest.html # expect >= 8 — real links
grep -c "unsubscribe" /tmp/digest.html               # expect >= 1 — CAN-SPAM
```

Every count must match before sending. A zero `rdcpix` count means the vendor returned nothing — fix that first; never send a digest with no photos.

- [ ] **Step 3: Send to the operator inbox**

Send to `hello@swfldatagulf.com`. **Verify against the INBOX, not the script's own record of having sent it** (`lib/email/CLAUDE.md`).

- [ ] **Step 4: Close the check and log**

```bash
node scripts/check.mjs close listings_digest_grid_live_verify
```

Append a SESSION_LOG entry with the pasted Resend id, the four grep counts, and the category count actually rendered. Then push with `node scripts/safe-push.mjs` — needs `OPERATOR_APPROVED_PUSH=1` and explicit operator say-so; publication is his call every time.

---

## Open items this plan deliberately does NOT close

- **Baths.** SteadyAPI `/search` returns none, so every v1 card omits the spec line (F8). Owned by `_ASSISTANT/2026-08-03-listings-baths-HANDOFF.md`. **Check before starting Task 4:** commit `7811e60b` ("wire LeePA layer-23 beds/baths into the comp path + free email baths lane") may have landed a free baths lane that changes this. If `l.bathrooms` is now populated for `/search` listings, the F8 test's expectation flips from "no specs line" to "a full three-field specs line", and the spec's §5 must be updated in the same commit.
- **A `sold` category.** Needs `lee_deed_official_records` / LEEPA per `docs/standards/data-roots.md` — a different source entirely.
- **The ZIP stats header** ("33919 by the numbers"). A separate figure lane with its own provenance; v1 uses a plain hero.
- **`scopeCity`'s county-anchor bug** (check `zip_scope_resolves_to_county_anchor_city`). This plan routes AROUND it via `cityForZipSourced`; it does not fix `listings-showcase.ts`, which still calls `scopeCity` on its ZIP and builds the wrong city's homes for a named ZIP.
