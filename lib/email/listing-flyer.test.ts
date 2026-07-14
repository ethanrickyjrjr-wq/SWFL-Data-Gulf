import { test, expect } from "bun:test";
import { buildListingFlyer } from "./listing-flyer";
import { SEED_DOCS } from "./doc/default-docs";
import type { EmailDoc } from "./doc/types";
import type { ListingFacts } from "./listing-scrape";

const FACTS: ListingFacts = {
  address: "27804 Hickory Blvd, Bonita Springs, FL 34134",
  city: "BONITA SPRINGS",
  state: "FL",
  zip: "34134",
  price: "$20,895,000",
  beds: "5",
  baths: "7",
  sqft: "7453",
  lotSize: "0.692",
  yearBuilt: "2021",
  propertyType: "Residential - Single Family",
  remarks: "There are homes with views, and then there are homes that become the view.",
  photos: ["https://cdn.beach-homes.com/images/listings/naplesmls/41/225076926-1.jpeg"],
  sourceUrl: "https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd",
};

/** A branded newsletter currently on the canvas — its brand + identity must survive. */
function brandedCurrentDoc(): EmailDoc {
  const doc = SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
  doc.globalStyle.accentColor = "#C17B3E";
  const header = doc.blocks.find((b) => b.type === "header");
  if (header && header.type === "header") header.props.companyName = "Gulf Coast Realty";
  return doc;
}

/** The hero that carries the PRICE — not the ribbon-only hero above the photo. */
function priceHero(doc: ReturnType<typeof buildListingFlyer>) {
  return doc.blocks.find((b) => b.type === "hero" && !b.props.ribbon);
}
/** The one spec STRIP. */
function strip(doc: ReturnType<typeof buildListingFlyer>) {
  return doc.blocks.find((b) => b.type === "stats" && b.props.variant === "strip");
}

// THE SAMPLE'S LAYOUT (07/13/2026). Operator: "we just need to be able to build what the
// example looks like with real data. That is all everything is."
//
// The hand-drawn sample runs: an accent RIBBON, the photo, then CENTRED — the address in
// display serif over the price in the accent colour — then ONE hairline spec strip. Ours
// ran a left-aligned 11px kicker, a near-black price, and two chunky rows of three
// identical cells. That was never a builder failure: the design was INEXPRESSIBLE, because
// the blocks had no align, no ribbon, no order, and no per-cell emphasis.
test("flyer builds THE SAMPLE'S LAYOUT — ribbon, centred address over price, one spec strip", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());

  // The ribbon is its own band, ABOVE the photo — a design element, not a caption.
  const ribbon = doc.blocks.find((b) => b.type === "hero" && b.props.ribbon);
  expect(ribbon?.type === "hero" && ribbon.props.kicker).toBe("New Listing");
  const photoIdx = doc.blocks.findIndex((b) => b.type === "image" && b.props.kind === "photo");
  expect(doc.blocks.indexOf(ribbon!)).toBeLessThan(photoIdx);

  const hero = priceHero(doc);
  expect(hero?.type === "hero" && hero.props.value).toBe("$20,895,000");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Hickory");
  // The address leads; the price is the headline number under it, centred.
  expect(hero?.type === "hero" && hero.props.order).toBe("label-first");
  expect(hero?.type === "hero" && hero.props.align).toBe("center");

  // ONE strip, in reading order — not two rows of three.
  const s = strip(doc);
  expect(s?.type === "stats" && s.props.stats.map((c) => c.label)).toEqual([
    "Beds",
    "Baths",
    "Sq Ft",
    "Lot",
    "$/Sq Ft",
    "Type",
  ]);

  // WHICH NUMBER MATTERS: $/sq ft wins a listing argument; Type is context.
  const cells = s?.type === "stats" ? s.props.stats : [];
  expect(cells.find((c) => c.label === "$/Sq Ft")?.emphasis).toBe("primary");
  expect(cells.find((c) => c.label === "Type")?.emphasis).toBe("muted");

  // A DERIVED cell states its provenance where the reader can see it.
  expect(s?.type === "stats" && s.props.footnote).toContain("Computed from list price");

  const photo = doc.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
  expect(photo?.type === "image" && (photo.props.url ?? "")).toContain("225076926");

  const text = doc.blocks.find((b) => b.type === "text");
  expect(text?.type === "text" && (text.props.body ?? "")).toContain("become the view");

  expect(doc.blocks.some((b) => b.type === "footer")).toBe(true);
});

test("flyer preserves the user's brand + company identity (sticky)", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());
  expect(doc.globalStyle.accentColor).toBe("#C17B3E");
  const header = doc.blocks.find((b) => b.type === "header");
  expect(header?.type === "header" && header.props.companyName).toBe("Gulf Coast Realty");
});

// THE OPEN-SLOT CONTRACT (07/13/2026). This test used to assert the OPPOSITE — that an
// unsourced spec was dropped at build time. That killed the naked label and the
// invitation with it; the operator asked for the invitation back (Baths was the
// example). A spec we can't source is now an EMPTY cell: the user fills it on the
// canvas, and StatsBlock drops it on the sendable paths (emailRender). The email-side
// half of this contract is pinned in lib/email/blocks/open-slot.test.tsx.
test("an unsourced spec is an OPEN SLOT to fill — never a 0, never invented", () => {
  const sparse: ListingFacts = { price: "$1,200,000", photos: [], sourceUrl: "https://x/y" };
  const doc = buildListingFlyer(sparse, brandedCurrentDoc());
  const cells = doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));

  // Every spec label is present as a slot the user can fill…
  expect(cells.map((c) => c.label)).toEqual(["Beds", "Baths", "Sq Ft", "Lot", "$/Sq Ft", "Type"]);
  // …and every unsourced one is EMPTY — no zero, no guess.
  for (const cell of cells) expect(cell.value).toBe("");

  const hero = priceHero(doc);
  expect(hero?.type === "hero" && hero.props.value).toBe("$1,200,000");
});

test("every block carries a grid layout — the coded grid, not a stack", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());
  for (const b of doc.blocks) expect(b.layout).toBeDefined();

  // Full-bleed everywhere EXCEPT the one row the chrome deliberately splits: the agent card
  // and the CTA carry one idea ("here's me, here's the ask"), so they ride together at {7,5}.
  // This assertion used to read `w === 12` for EVERY block — it was true, and it was the flat
  // stack the layout system was bought to eliminate. Full-bleed is now the DEFAULT, not the law.
  for (const b of doc.blocks) {
    const expected = b.type === "agent-card" ? 7 : b.type === "button" ? 5 : 12;
    expect(b.layout!.w).toBe(expected);
  }
  const agent = doc.blocks.find((b) => b.type === "agent-card")!;
  const cta = doc.blocks.find((b) => b.type === "button")!;
  expect(agent.layout!.y).toBe(cta.layout!.y); // ONE row, not two.

  // footer is locked (static) so a drag can't move the unsubscribe block.
  const footer = doc.blocks.find((b) => b.type === "footer");
  expect(footer?.layout?.static).toBe(true);
});

test("computes $/sq ft into the spec strip from real price + sqft", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc()); // $20,895,000 / 7453
  const s = strip(doc);
  const ppsf = s?.type === "stats" ? s.props.stats.find((c) => c.label === "$/Sq Ft") : undefined;
  expect(ppsf?.value).toBe("$2,804"); // 20,895,000 / 7,453 = 2,803.97 → rounds to 2,804
});

test("no photo → an EMPTY photo block (the canvas drag-drop), never refuses", () => {
  const noPhoto: ListingFacts = {
    address: "1 Any St, Cape Coral",
    photos: [],
    sourceUrl: "https://x/y",
  };
  const doc = buildListingFlyer(noPhoto, brandedCurrentDoc());
  const photo = doc.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
  expect(photo).toBeDefined();
  expect(photo?.type === "image" && photo.props.url).toBe("");
});

test("blank brand gets the editorial palette; a real brand is preserved", () => {
  // Blank brand = house default accent → editorial fallback applies.
  const houseDoc = SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
  const editorial = buildListingFlyer(FACTS, houseDoc);
  expect(editorial.globalStyle.accentColor).toBe("#B98F45");
  // A real brand (branded doc sets #C17B3E) is left untouched.
  const branded = buildListingFlyer(FACTS, brandedCurrentDoc());
  expect(branded.globalStyle.accentColor).toBe("#C17B3E");
});
