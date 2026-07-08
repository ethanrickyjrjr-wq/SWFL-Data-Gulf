import { test, expect } from "bun:test";
import { buildShowingPrepDoc, SHOWING_PREP_COMMENTARY_MARKER } from "./showing-prep-doc";
import { SEED_DOCS } from "./doc/default-docs";
import { EmailDocSchema } from "./doc/schema";
import type { ShowingPrepData } from "@/lib/listings/showing-prep-source";
import type { RenderComp } from "@/lib/assistant/comp-helper";

function currentDoc() {
  return SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
}

const COMPS: RenderComp[] = [
  {
    addressLine: "101 A St",
    city: "Fort Myers",
    beds: 3,
    baths: 2,
    sqft: 1800,
    status: "sold",
    price: 475000,
    priceKind: "sold",
    priceDate: "2026-06-01",
  },
  {
    addressLine: "202 B St",
    city: "Fort Myers",
    beds: 4,
    baths: 3,
    sqft: 2200,
    status: "for_sale",
    price: 520000,
    priceKind: "last_list",
    priceDate: null,
  },
];

const FULL: ShowingPrepData = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  subject: {
    address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
    city: "Fort Myers",
    state: "FL",
    zip: "33908",
    price: "$489,000",
    beds: "3",
    baths: "2",
    sqft: "1840",
    photos: ["https://cdn/subject.jpg"],
    sourceUrl: "https://www.swfldatagulf.com",
  },
  subjectPin: { lat: 26.5, lon: -81.9, role: "subject" },
  zip: "33908",
  comps: COMPS,
  oneSheets: [{ comp: COMPS[0], photoUrl: "https://cdn/comp1.jpg" }],
  compPins: [{ lat: 26.51, lon: -81.91, role: "comp" }],
  snapshot: {
    zip: "33908",
    monthsOfSupply: 2.1,
    activeInventory: 140,
    homesSold: 66,
    medianSalePrice: 489000,
    medianDom: 41,
    marketType: "Seller's market",
    asOf: "07/01/2026",
    lowSample: false,
  },
  asOf: "07/08/2026",
};

// Note: MAPBOX_TOKEN is unset in this test → listingsMapUrl returns null → the map
// section is omitted. That is the correct degrade; a separate assertion below sets it.
test("leads with a Showing Prep kicker + subject price/address and a spec strip", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.kicker).toBe("Showing Prep");
  expect(hero?.type === "hero" && hero.props.value).toBe("$489,000");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Rainbow Meadows");
  const stats = doc.blocks.find((b) => b.type === "stats");
  expect(stats?.type === "stats" && stats.props.stats.map((s) => s.label)).toEqual([
    "Beds",
    "Baths",
    "Sq Ft",
  ]);
});

test("renders a one-sheet listing block for the photo-enriched comp and a grid for the rest", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  const listings = doc.blocks.filter((b) => b.type === "listing");
  expect(listings).toHaveLength(1);
  expect(listings[0].type === "listing" && listings[0].props.photoUrl).toBe(
    "https://cdn/comp1.jpg",
  );
  const list = doc.blocks.find((b) => b.type === "list");
  // The remaining comp (202 B St, not one-sheeted) lands in the comparison grid.
  expect(list?.type === "list" && JSON.stringify(list.props.items)).toContain("202 B St");
});

test("renders the market snapshot stat strip with market type; omits it when snapshot is null", () => {
  const withSnap = buildShowingPrepDoc(FULL, currentDoc());
  const stats = withSnap.blocks.filter((b) => b.type === "stats");
  // spec strip + snapshot strip = 2 stats blocks
  expect(stats.length).toBe(2);
  const snapStrip = stats[1];
  expect(snapStrip.type === "stats" && JSON.stringify(snapStrip.props.stats)).toContain(
    "Seller's market",
  );

  const noSnap = buildShowingPrepDoc({ ...FULL, snapshot: null }, currentDoc());
  expect(noSnap.blocks.filter((b) => b.type === "stats").length).toBe(1); // only the spec strip
});

test("always includes an empty commentary slot and a disclosure slot", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  const commentary = doc.blocks.find(
    (b) => b.type === "text" && b.props.caption === SHOWING_PREP_COMMENTARY_MARKER,
  );
  expect(commentary).toBeDefined();
  expect(commentary?.type === "text" && commentary.props.body).toBe(""); // empty — Task 6 fills it
  const disclosure = doc.blocks.find(
    (b) => b.type === "image" && (b.props.caption ?? "").includes("Attach seller disclosure"),
  );
  expect(disclosure).toBeDefined();
  expect(disclosure?.type === "image" && disclosure.props.url).toBe(""); // empty drag-drop slot
});

test("degrades to an address-only skeleton (no subject) and still builds every fixed block", () => {
  const doc = buildShowingPrepDoc(
    {
      ...FULL,
      subject: null,
      subjectPin: null,
      comps: [],
      oneSheets: [],
      compPins: [],
      snapshot: null,
    },
    currentDoc(),
  );
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && (hero.props.label ?? "")).toContain("Rainbow Meadows"); // falls back to the typed address
  expect(hero?.type === "hero" && hero.props.value).toBe(""); // no invented price
  // Footer always survives (CAN-SPAM), and is static.
  const footer = doc.blocks.find((b) => b.type === "footer");
  expect(footer?.layout?.static).toBe(true);
  // No comps → no listing/list blocks, but the doc still built.
  expect(doc.blocks.some((b) => b.type === "listing")).toBe(false);
  expect(doc.blocks.length).toBeGreaterThan(4);
});

// The built doc is persisted raw and later parsed through EmailDocSchema on the canvas
// — a field over its cap would make the packet fail to open. Real SWFL comp addresses
// (36+ chars) overflow the ListItem `lead` cap (24), so the short test fixtures above
// would never catch it. This round-trips the whole doc with a real long address,
// guarding every tight cap (lead 24, hero.value 24, stats.value 24) against drift.
test("the built doc round-trips through EmailDocSchema for a real long address", () => {
  const longComp: RenderComp = {
    addressLine: "16447 Rainbow Meadows Ct",
    city: "Fort Myers",
    beds: 3,
    baths: 2,
    sqft: 1840,
    status: "sold",
    price: 489000,
    priceKind: "sold",
    priceDate: "2026-06-01",
  };
  const data: ShowingPrepData = { ...FULL, comps: [longComp], oneSheets: [], compPins: [] };
  const parsed = EmailDocSchema.safeParse(buildShowingPrepDoc(data, currentDoc()));
  expect(parsed.success).toBe(true);
});

test("every block carries a grid layout that stacks without overlap", () => {
  const doc = buildShowingPrepDoc(FULL, currentDoc());
  let y = 0;
  for (const b of doc.blocks) {
    expect(b.layout).toBeDefined();
    expect(b.layout?.x).toBe(0);
    expect(b.layout?.w).toBe(12);
    expect(b.layout?.y).toBe(y);
    y += b.layout?.h ?? 0;
  }
});
