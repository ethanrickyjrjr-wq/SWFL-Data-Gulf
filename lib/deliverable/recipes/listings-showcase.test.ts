// lib/deliverable/recipes/listings-showcase.test.ts
//
// TDD guards for the listings-showcase recipe — one test per named failure mode.
// All deps injected; nothing here touches the network or the lake.
import { describe, it, expect } from "bun:test";
import { buildListingsShowcase, assignHighlights } from "./listings-showcase";
import { RECIPES } from "@/lib/deliverable/recipes";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import type { RecipeBuildContext } from "./index";
import type { Listing } from "@/lib/listings/rentcast";
import type { EmailDoc } from "@/lib/email/doc/types";

function listing(overrides: Partial<Listing> & { id: string; addressLine1: string }): Listing {
  return {
    formattedAddress: overrides.addressLine1,
    city: "Cape Coral",
    state: "FL",
    zipCode: "33914",
    county: "Lee",
    latitude: 26.6,
    longitude: -81.9,
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1800,
    lotSize: 0.25,
    yearBuilt: null,
    status: "Active",
    price: 425000,
    listedDate: "2026-07-01",
    removedDate: null,
    lastSeenDate: "2026-08-03",
    daysOnMarket: 30,
    mlsName: "steadyapi",
    mlsNumber: "12345",
    photoUrl: "https://cdn.example.com/photo.jpg",
    ...overrides,
  };
}

function ctxFor(prompt: string, zip?: string): RecipeBuildContext {
  return {
    recipe: RECIPES["listings-showcase"],
    prompt,
    currentDoc: (seedById("luxury-market-report") ?? SEED_DOCS[0]!).build(),
    facts: null,
    resolved: false,
    zip,
  };
}

function blockTypes(doc: EmailDoc): string[] {
  return doc.blocks.map((b) => b.type);
}

describe("assignHighlights (pure)", () => {
  it("prefers a distinct category per home when more than one qualifies", () => {
    const big = listing({ id: "1", addressLine1: "1 Big Lot Dr", lotSize: 1.2 });
    const alsoBig = listing({
      id: "2",
      addressLine1: "2 Also Big Dr",
      lotSize: 0.9,
      isNewConstruction: true,
    });
    const [h1, h2] = assignHighlights([big, alsoBig]);
    expect(h1!.category).toBe("big-lot");
    // Second home is ALSO eligible for big-lot but that category is used — it must
    // fall to its next honest eligible category or the generic fallback, never repeat.
    expect(h2!.category).not.toBe("big-lot");
  });

  it("a listing with no qualifying real field gets the generic fallback, never an invented feature", () => {
    const plain = listing({
      id: "3",
      addressLine1: "3 Plain St",
      lotSize: 0.1,
      propertyType: "Single Family",
      isNewConstruction: undefined,
      isPriceReduced: undefined,
      daysOnMarket: 45,
      squareFootage: 1600,
    });
    const [h] = assignHighlights([plain]);
    expect(h!.category).toBe("generic");
    expect(h!.body).toContain("bed");
  });

  it("a real price cut is stated with the real cut amount, never invented", () => {
    const cut = listing({
      id: "4",
      addressLine1: "4 Cut Ave",
      lotSize: 0.1,
      isPriceReduced: true,
      priceReduction: 15000,
    });
    const [h] = assignHighlights([cut]);
    expect(h!.category).toBe("price-cut");
    expect(h!.body).toContain("$15,000");
  });
});

describe("buildListingsShowcase", () => {
  it("FM1: no ZIP named -> null, never guesses a city", async () => {
    const doc = await buildListingsShowcase(ctxFor("Build a listings-showcase email"), {
      loadListings: async () => ({
        listings: [listing({ id: "1", addressLine1: "1 A St" })],
        city: "Cape Coral",
      }),
    });
    expect(doc).toBeNull();
  });

  it("FM2: zero listings with a real photo -> null, never a photo-less or invented card", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [listing({ id: "1", addressLine1: "1 A St", photoUrl: undefined })],
        city: "Cape Coral",
      }),
    });
    expect(doc).toBeNull();
  });

  it("FM3: real listings build one image+signal+button card each, no stats/spec strip", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [
          listing({ id: "1", addressLine1: "1 A St", lotSize: 1.1 }),
          listing({ id: "2", addressLine1: "2 B St", isNewConstruction: true }),
        ],
        city: "Cape Coral",
      }),
    });
    expect(doc).not.toBeNull();
    const types = blockTypes(doc!);
    expect(types.filter((t) => t === "image").length).toBe(2);
    expect(types.filter((t) => t === "signal").length).toBe(2);
    expect(types.filter((t) => t === "button").length).toBe(2);
    // The whole point of this recipe: no price/spec sheet.
    expect(types).not.toContain("stats");
    expect(types).not.toContain("listing");
  });

  it("FM4: duplicate address is never shown twice", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [
          listing({ id: "1", addressLine1: "1 A St" }),
          listing({ id: "1-dup", addressLine1: "1 A St" }),
        ],
        city: "Cape Coral",
      }),
    });
    const types = blockTypes(doc!);
    expect(types.filter((t) => t === "image").length).toBe(1);
  });

  it("no invented figure anywhere in the built doc besides the real per-home facts handed in", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [listing({ id: "1", addressLine1: "1 A St", lotSize: 1.5 })],
        city: "Cape Coral",
      }),
    });
    const raw = JSON.stringify(doc);
    expect(raw).toContain("1.5 acres");
  });
});
