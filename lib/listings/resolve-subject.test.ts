import { describe, test, expect } from "bun:test";
import { resolveSubjectListing, canonStreet, type FetchListingsFn } from "./resolve-subject";
import { isNewListingRecipePrompt } from "@/lib/email/listing-intent";
import type { GeocodeFn } from "@/lib/geo/geocode-address";
import type { Listing } from "./rentcast";

// A geocoder stub that returns a chosen ZIP verbatim (the resolver derives county
// from it via the real resolveZip fixture). Cast keeps the test off GeocodeResult's
// full shape — resolveSubjectListing only reads lat/lon/place/zip.
function geocodeReturning(zip: string | null): GeocodeFn {
  return (async () => ({
    lat: 26.5,
    lon: -81.9,
    place: "16447 Rainbow Meadows Ct, Fort Myers, Florida 33908, United States",
    zip,
  })) as unknown as GeocodeFn;
}

function mkListing(p: Partial<Listing>): Listing {
  return {
    id: "x",
    formattedAddress: "",
    addressLine1: "",
    city: "Fort Myers",
    state: "FL",
    county: "",
    zipCode: "33908",
    latitude: null,
    longitude: null,
    propertyType: "Single Family",
    bedrooms: null,
    bathrooms: null,
    squareFootage: null,
    lotSize: null,
    yearBuilt: null,
    status: "for_sale",
    price: null,
    listedDate: null,
    removedDate: null,
    lastSeenDate: "2026-07-07",
    daysOnMarket: null,
    mlsName: null,
    mlsNumber: null,
    photoUrl: undefined,
    ...p,
  } as Listing;
}

const SUBJECT = mkListing({
  addressLine1: "16447 Rainbow Meadows Ct", // vendor slug abbreviates the suffix
  formattedAddress: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  price: 1159150,
  bedrooms: 4,
  bathrooms: 4,
  squareFootage: 4195,
  photoUrl: "https://ap.rdcpix.com/abc/16447.jpg",
});

const listFrom =
  (pages: Record<number, Listing[]>): FetchListingsFn =>
  async ({ offset }) =>
    pages[offset ?? 0] ?? [];

describe("resolveSubjectListing", () => {
  test("resolves a Lee address to its record — Court≡Ct, photo + real numbers", async () => {
    const facts = await resolveSubjectListing(
      "16447 Rainbow Meadows Court, Fort Myers, Florida 33908",
      { geocode: geocodeReturning("33908"), fetchListings: listFrom({ 0: [SUBJECT] }) },
    );
    expect(facts).not.toBeNull();
    expect(facts!.photos[0]).toBe("https://ap.rdcpix.com/abc/16447.jpg");
    expect(facts!.price).toBe("$1,159,150");
    expect(facts!.beds).toBe("4");
    expect(facts!.baths).toBe("4");
    expect(facts!.sqft).toBe("4195");
    // Citation is our root, never a vendor permalink.
    expect(facts!.sourceUrl).toBe("https://www.swfldatagulf.com");
  });

  test("out of the Lee/Collier footprint → null (no vendor call needed)", async () => {
    let called = 0;
    const facts = await resolveSubjectListing("100 Main St, Miami, FL 33101", {
      geocode: geocodeReturning("99999"), // resolves to no SWFL county
      fetchListings: async () => {
        called++;
        return [SUBJECT];
      },
    });
    expect(facts).toBeNull();
    expect(called).toBe(0);
  });

  test("no matching record in the city → null", async () => {
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      geocode: geocodeReturning("33908"),
      fetchListings: listFrom({ 0: [mkListing({ addressLine1: "9 Elsewhere Blvd" })] }),
    });
    expect(facts).toBeNull();
  });

  test("pages past a full first page to find the subject", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) =>
      mkListing({ addressLine1: `${i} Nowhere Ln` }),
    );
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      geocode: geocodeReturning("33908"),
      fetchListings: listFrom({ 0: fullPage, 200: [SUBJECT] }),
    });
    expect(facts?.photos[0]).toBe("https://ap.rdcpix.com/abc/16447.jpg");
  });

  test("no for-sale listings (no key / empty feed) → null", async () => {
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      geocode: geocodeReturning("33908"),
      fetchListings: async () => [],
    });
    expect(facts).toBeNull();
  });

  test("empty address → null", async () => {
    expect(await resolveSubjectListing("")).toBeNull();
    expect(await resolveSubjectListing(null)).toBeNull();
  });
});

describe("canonStreet", () => {
  test("folds suffix + punctuation so Court and Ct match", () => {
    expect(canonStreet("16447 Rainbow Meadows Court")).toBe(
      canonStreet("16447 Rainbow Meadows Ct"),
    );
    expect(canonStreet("100 N.E. 19th Ter.")).toBe("100 n e 19th ter");
  });
  test("drops unit tokens", () => {
    expect(canonStreet("742 Evergreen Terrace, Apt 3")).toBe("742 evergreen ter");
  });
  test("folds directionals both ways so North matches N", () => {
    expect(canonStreet("850 10th Street North")).toBe(canonStreet("850 10th St N"));
    expect(canonStreet("100 SW 5th Ave")).toBe(canonStreet("100 Southwest 5th Avenue"));
  });
});

describe("isNewListingRecipePrompt", () => {
  test("matches the filled New Listing recipe", () => {
    expect(
      isNewListingRecipePrompt(
        "Build a new-listing announcement email for my listing at 16447 Rainbow Meadows Court, Fort Myers, Florida 33908 — key specs, price per square foot.",
      ),
    ).toBe(true);
  });
  test("does NOT match coming-soon / open-house / just-sold (different framing)", () => {
    expect(
      isNewListingRecipePrompt("Build a coming-soon teaser email for my listing at 123 X Rd"),
    ).toBe(false);
    expect(
      isNewListingRecipePrompt("Build an open-house invite email for my listing at 123 X Rd"),
    ).toBe(false);
    expect(isNewListingRecipePrompt("Build a just-sold email for 123 X Rd")).toBe(false);
  });
});
