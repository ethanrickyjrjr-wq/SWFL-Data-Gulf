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

test("flyer leads with the property and puts real facts in the right slots", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());

  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.value).toBe("$20,895,000");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Hickory");

  const stats = doc.blocks.find((b) => b.type === "stats");
  expect(stats?.type === "stats" && stats.props.stats).toEqual([
    { value: "5", label: "Beds" },
    { value: "7", label: "Baths" },
    { value: "7,453", label: "Sq Ft" },
  ]);

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

test("flyer omits specs it doesn't have — never fabricates a 0", () => {
  const sparse: ListingFacts = { price: "$1,200,000", photos: [], sourceUrl: "https://x/y" };
  const doc = buildListingFlyer(sparse, brandedCurrentDoc());
  const stats = doc.blocks.find((b) => b.type === "stats");
  if (stats && stats.type === "stats") {
    for (const cell of stats.props.stats) expect(cell.value).not.toBe("0");
  }
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.value).toBe("$1,200,000");
});

test("every block carries a grid layout — the coded grid, not a stack", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc());
  for (const b of doc.blocks) {
    expect(b.layout).toBeDefined();
    expect(b.layout && b.layout.w).toBe(12);
  }
  // footer is locked (static) so a drag can't move the unsubscribe block.
  const footer = doc.blocks.find((b) => b.type === "footer");
  expect(footer?.layout?.static).toBe(true);
});

test("computes $/sq ft into the second spec row from real price + sqft", () => {
  const doc = buildListingFlyer(FACTS, brandedCurrentDoc()); // $20,895,000 / 7453
  const rowB = doc.blocks.filter((b) => b.type === "stats")[1];
  const ppsf =
    rowB?.type === "stats" ? rowB.props.stats.find((c) => c.label === "$/Sq Ft") : undefined;
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
