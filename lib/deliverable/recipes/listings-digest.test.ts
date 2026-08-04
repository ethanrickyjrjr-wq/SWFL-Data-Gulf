// lib/deliverable/recipes/listings-digest.test.ts
//
// Every test is named for the failure mode it guards (design spec §6). ALL of them
// run against fixtures with injected deps — zero vendor quota and zero DB in the dev
// loop (data-and-build-bible.md §0.1–0.2). No test can spend money.
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

/** Offline deps — nothing here touches a network or a database. */
const offline = (listings: Listing[], city = "Fort Myers") => ({
  loadListings: async () => ({ listings, city }),
  fetchBaths: async () => new Map<string, number>(),
  fetchApifyBaths: async () => new Map<string, number>(),
});

describe("assignCategories", () => {
  test("F2 — no home appears in two categories", () => {
    const pool = many(12, {
      isNewConstruction: true,
      isPriceReduced: true,
      priceReduction: 5000,
      isNewListing: true,
    });
    const keys = assignCategories(pool, "Fort Myers").flatMap((s) =>
      s.listings.map((l) => l.addressLine1 || l.id),
    );
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
    expect(
      assignCategories(pool, "Fort Myers").some((s) => s.category === "new-construction"),
    ).toBe(false);
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
    const urls = assignCategories(pool, "Fort Myers").flatMap((s) =>
      s.listings.map((l) => l.photoUrl ?? ""),
    );
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

  // ── F14 — "Room to spread out" measured the LOT and nothing else ─────────────
  // Operator, 08/04/2026: "I just don't understand apartments in Room To Spread Out
  // section- this one has about 800 sq ft listed… 800 sq ft is not room to spread
  // out." The row he saw is verbatim vendor data, live-verified this session:
  // 3704 Broadway Apt 100 → {"beds":1,"sqft":752,"lot_sqft":25857} = 0.59 acres. On a
  // condo/apartment row `lot_sqft` is the WHOLE BUILDING's parcel, so every unit in
  // the complex passed a lot-only predicate. The vendor's /search `description` gives
  // us six keys and no property type (checked live — beds/sqft/lot_sqft + their
  // _display twins), so we cannot filter condos out by type. A living-area floor is
  // the only lever this endpoint offers.
  test("F14 — a small home on a big lot is NOT room to spread out (the 752 sqft condo)", () => {
    const pool = [
      ...rekey(many(4, { lotSize: 0.59, squareFootage: 752 }), "condo", 600),
      ...rekey(many(6, { lotSize: 2.1, squareFootage: 3663 }), "estate", 700),
    ];
    const bigLot = assignCategories(pool, "Fort Myers").find((s) => s.category === "big-lot");
    expect(bigLot).toBeDefined();
    for (const l of bigLot!.listings) expect(l.squareFootage).toBeGreaterThanOrEqual(3000);
  });

  test("F14 — big lots that are ALL small homes emit no section at all, never a filler", () => {
    const pool = [
      ...rekey(many(6, { lotSize: 0.95, squareFootage: 1314 }), "small", 800),
      ...rekey(many(6), "other", 900),
    ];
    expect(assignCategories(pool, "Fort Myers").some((s) => s.category === "big-lot")).toBe(false);
  });

  test("the catch-all title names the real city, never a hardcoded one", () => {
    const sections = assignCategories(many(6), "Naples");
    expect(sections.at(-1)!.title).toContain("Naples");
  });
});

describe("buildListingsDigest", () => {
  const ctx = (zip?: string) => ({ zip, currentDoc: { globalStyle: {}, blocks: [] } }) as never;
  const grids = (doc: { blocks: { type: string; props: unknown }[] }) =>
    doc.blocks.filter((b) => b.type === "listing-grid");
  const cards = (doc: { blocks: { type: string; props: unknown }[] }) =>
    grids(doc).flatMap((b) => (b.props as { cards: Record<string, string>[] }).cards);

  test("no ZIP named -> null, never a guessed city", async () => {
    expect(await buildListingsDigest(ctx(undefined))).toBeNull();
  });

  test("F12 — a degraded vendor fetch returns null, never an empty digest", async () => {
    const doc = await buildListingsDigest(ctx("33919"), offline([]));
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
    const doc = await buildListingsDigest(ctx("33919"), offline(pool));
    const planned = assignCategories(pool, "Fort Myers").length;
    expect(grids(doc!)).toHaveLength(planned);
  });

  test("F8 — a listing with no bath count emits NO specs line at all", async () => {
    const doc = await buildListingsDigest(ctx("33919"), offline(many(6)));
    for (const c of cards(doc!)) expect(c.specs).toBeUndefined();
  });

  test("F8 — beds+baths+sqft all present emits the full three-field line", async () => {
    const doc = await buildListingsDigest(ctx("33919"), offline(many(6, { bathrooms: 2 })));
    for (const c of cards(doc!)) expect(c.specs).toBe("3 bed · 2 bath · 1,500 sqft");
  });

  test("F13 — a grid never mixes carded and uncarded specs: all cards or none", async () => {
    // Half the pool has a bath count, half does not. A per-card rule would ship a
    // grid where two cards carry a spec line and two are blank, which reads broken.
    const pool = rekey(many(8), "mix", 60).map((l, i) =>
      i % 2 === 0 ? { ...l, bathrooms: 2 } : l,
    );
    const doc = await buildListingsDigest(ctx("33919"), offline(pool));
    for (const g of grids(doc!)) {
      const cs = (g.props as { cards: { specs?: string }[] }).cards;
      const withSpecs = cs.filter((c) => c.specs).length;
      expect(withSpecs === 0 || withSpecs === cs.length).toBe(true);
    }
  });

  test("the free lake baths lane fills bathrooms without a paid call", async () => {
    const doc = await buildListingsDigest(ctx("33919"), {
      ...offline(many(6)),
      // keyed on the SteadyAPI property_id embedded in `sa_<id>`
      fetchBaths: async () => new Map(Array.from({ length: 6 }, (_, i) => [`${i + 1}`, 2])),
    });
    for (const c of cards(doc!)) expect(c.specs).toBe("3 bed · 2 bath · 1,500 sqft");
  });

  test("the Apify lane is only consulted when the free lane leaves a gap", async () => {
    let apifyCalls = 0;
    await buildListingsDigest(ctx("33919"), {
      ...offline(many(6)),
      fetchBaths: async () => new Map(Array.from({ length: 6 }, (_, i) => [`${i + 1}`, 2])),
      fetchApifyBaths: async () => {
        apifyCalls++;
        return new Map();
      },
    });
    expect(apifyCalls).toBe(0);
  });

  test("F6 — each card states its OWN zip, so a backfilled home never implies the named ZIP", async () => {
    const pool = rekey(many(6), "z", 70).map((l, i) => ({
      ...l,
      zipCode: i < 3 ? "33919" : "33907",
    }));
    const doc = await buildListingsDigest(ctx("33919"), offline(pool));
    expect(cards(doc!).some((c) => c.addressLine2?.includes("33907"))).toBe(true);
  });

  test("F10 — no two emitted cards are field-identical", async () => {
    const doc = await buildListingsDigest(ctx("33919"), offline(many(6)));
    const seen = cards(doc!).map((c) => JSON.stringify(c));
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("ONE CTA — no per-section grid CTA, exactly one closing button", async () => {
    // emails.md §0.1: "ONE CTA per email. Never three." Five categories with their
    // own CTAs would ship six (operator decision 08/03/2026).
    const pool = [
      ...rekey(many(6, { isNewConstruction: true }), "a", 10),
      ...rekey(many(6, { isPriceReduced: true, priceReduction: 4000 }), "b", 20),
      ...rekey(many(6), "e", 50),
    ];
    const doc = await buildListingsDigest(ctx("33919"), offline(pool));
    for (const g of grids(doc!)) {
      const p = g.props as { ctaLabel?: string; ctaUrl?: string };
      expect(p.ctaLabel).toBeUndefined();
      expect(p.ctaUrl).toBeUndefined();
    }
    expect(doc!.blocks.filter((b) => b.type === "button")).toHaveLength(1);
  });

  test("the subject varies with the real counts, so two builds never thread", async () => {
    const doc = await buildListingsDigest(ctx("33919"), offline(many(6)));
    expect(doc!.subjectVariants?.[0]).toBeTruthy();
    expect(doc!.subjectVariants![0]!.length).toBeLessThanOrEqual(60);
  });
});
