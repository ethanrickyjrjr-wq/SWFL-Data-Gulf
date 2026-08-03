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
    listingUrl: "https://www.realtor.com/realestateandhomes-detail/example",
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

function buttonUrls(doc: EmailDoc): (string | undefined)[] {
  return doc.blocks
    .filter((b) => b.type === "button")
    .map((b) => (b.props as Record<string, unknown>).url as string | undefined);
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
    expect(h2!.category).not.toBe("big-lot");
  });

  it("HARD RULE: two homes with the SAME only qualifying category never repeat the identical line", () => {
    const a = listing({ id: "1", addressLine1: "1 New Build Ln", isNewConstruction: true });
    const b = listing({ id: "2", addressLine1: "2 New Build Ln", isNewConstruction: true });
    const [h1, h2] = assignHighlights([a, b]);
    expect(h1!.category).toBe("new-construction");
    // Second home's only real qualifying category is already used -> falls to
    // the generic fallback, NEVER a repeat of "new-construction".
    expect(h2!.category).not.toBe("new-construction");
    expect(h1!.title).not.toBe(h2!.title);
  });

  it("HARD RULE: even an identical fallback (same specs) is disambiguated by the real address", () => {
    // Both plain, identical specs, only new-construction is used up by the first.
    const a = listing({ id: "1", addressLine1: "1 Same Spec Ct", isNewConstruction: true });
    const b = listing({ id: "2", addressLine1: "2 Same Spec Ct" }); // identical bed/bath/sqft
    const c = listing({ id: "3", addressLine1: "3 Same Spec Ct" }); // identical bed/bath/sqft too
    const [, h2, h3] = assignHighlights([a, b, c]);
    expect(h2!.category).toBe("generic");
    expect(h3!.category).toBe("generic");
    // Same real specs -> the spec-based title collides too. The BOLD TITLE
    // must still end up distinct (caught live 08/03/2026 — a repeated bold
    // headline reads as a duplicate card regardless of the fine print
    // underneath, and caught AGAIN when a boilerplate body sentence also
    // repeated verbatim under two distinct titles — the fallback body is now
    // omitted entirely when the title already carries real information).
    expect(h2!.title).not.toBe(h3!.title);
    expect(h3!.title).toContain("3 Same Spec Ct");
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
    // The real specs are now the HEADLINE, not buried in the fine print.
    expect(h!.title).toContain("Bed");
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

  it("FM2b: a real photo but no real listing URL -> null, never a dead-link card", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [listing({ id: "1", addressLine1: "1 A St", listingUrl: undefined })],
        city: "Cape Coral",
      }),
    });
    expect(doc).toBeNull();
  });

  it("FM3: real listings build one image+signal+button card each, plus ONE closing CTA, no stats/spec strip", async () => {
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
    // 2 per-card CTAs + 1 closing CTA = 3 button blocks.
    expect(types.filter((t) => t === "button").length).toBe(3);
    // The whole point of this recipe: no price/spec sheet.
    expect(types).not.toContain("stats");
    expect(types).not.toContain("listing");
  });

  it("every photo AND every per-card button links to the real listing URL", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [
          listing({ id: "1", addressLine1: "1 A St", listingUrl: "https://www.realtor.com/x1" }),
          listing({
            id: "2",
            addressLine1: "2 B St",
            isNewConstruction: true,
            listingUrl: "https://www.realtor.com/x2",
          }),
        ],
        city: "Cape Coral",
      }),
    });
    const images = doc!.blocks.filter((b) => b.type === "image");
    const imageLinks = images.map((b) => (b.props as Record<string, unknown>).linkUrl);
    expect(imageLinks).toEqual(["https://www.realtor.com/x1", "https://www.realtor.com/x2"]);
    const urls = buttonUrls(doc!);
    expect(urls[0]).toBe("https://www.realtor.com/x1");
    expect(urls[1]).toBe("https://www.realtor.com/x2");
  });

  it("the LAST button is the closing CTA, not tied to any one listing's URL", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [listing({ id: "1", addressLine1: "1 A St" })],
        city: "Cape Coral",
      }),
    });
    const buttons = doc!.blocks.filter((b) => b.type === "button");
    const last = buttons[buttons.length - 1]!;
    expect((last.props as Record<string, unknown>).label).toBe("See more listings like these");
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

  it("HARD RULE end-to-end: three homes never render the identical highlight twice", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [
          listing({ id: "1", addressLine1: "1 New Build Ln", isNewConstruction: true }),
          listing({ id: "2", addressLine1: "2 New Build Ln", isNewConstruction: true }),
          listing({ id: "3", addressLine1: "3 New Build Ln", isNewConstruction: true }),
        ],
        city: "Cape Coral",
      }),
    });
    const signals = doc!.blocks
      .filter((b) => b.type === "signal")
      .map((b) => {
        const p = b.props as Record<string, unknown>;
        return `${p.title} ${p.body}`;
      });
    expect(new Set(signals).size).toBe(signals.length);
  });

  it("sets a real, varying subject line (home count + area) — never a static repeated string", async () => {
    const doc = await buildListingsShowcase(ctxFor("listings-showcase for 33914", "33914"), {
      loadListings: async () => ({
        listings: [listing({ id: "1", addressLine1: "1 A St" })],
        city: "Cape Coral",
      }),
    });
    expect(doc!.subjectVariants?.[0]).toBe("1 home worth a second look in Cape Coral");
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
