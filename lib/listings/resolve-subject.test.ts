import { describe, test, expect } from "bun:test";
import {
  resolveSubjectListing,
  canonStreet,
  sameCanonStreet,
  extractRealtorPropertyId,
  type FetchListingsFn,
} from "./resolve-subject";
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

// The bath lane's fetcher, stubbed. /search carries NO bath count, so a bath can only
// come from /nearby-home-values — but this suite is offline by contract, so every call
// injects this. A resolve must still make ZERO live vendor calls.
const noNearby = async () => [];
// The lake lane, stubbed empty — vendor-lane tests below exercise the FALLBACK path.
const noLake = async () => [];

describe("resolveSubjectListing — lake-first (vendor slug drift 07/19/2026)", () => {
  test("a subject in our own lake resolves with ZERO vendor listing calls", async () => {
    let vendorCalls = 0;
    const facts = await resolveSubjectListing(
      "16447 Rainbow Meadows Court, Fort Myers, Florida 33908",
      {
        fetchNearby: noNearby,
        geocode: geocodeReturning("33908"),
        fetchLakeCandidates: async () => [SUBJECT],
        fetchListings: async () => {
          vendorCalls++;
          return [];
        },
      },
    );
    expect(facts).not.toBeNull();
    expect(facts!.price).toBe("$1,159,150");
    expect(facts!.beds).toBe("4");
    expect(facts!.photos[0]).toBe("https://ap.rdcpix.com/abc/16447.jpg");
    expect(vendorCalls).toBe(0);
  });

  test("the lake fetcher receives the parsed house number + geocoded ZIP", async () => {
    let got: { houseNumber: string; zip: string | null; city: string } | null = null;
    await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, Florida 33908", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async (q) => {
        got = q;
        return [];
      },
      fetchListings: noLake,
    });
    expect(got).toEqual({ houseNumber: "16447", zip: "33908", city: "Fort Myers" });
  });

  test("lake candidates that don't match fall through to the vendor lane", async () => {
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => [mkListing({ addressLine1: "9 Elsewhere Blvd" })],
      fetchListings: listFrom({ 0: [SUBJECT] }),
    });
    expect(facts?.price).toBe("$1,159,150");
  });

  test("a lake fetcher failure never blocks — the vendor lane still resolves", async () => {
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => {
        throw new Error("lake down");
      },
      fetchListings: listFrom({ 0: [SUBJECT] }),
    });
    expect(facts?.price).toBe("$1,159,150");
  });

  test("a lake hit carries the sweep's real DOM onto facts (never a floored count)", async () => {
    const real = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => [
        { ...SUBJECT, daysOnMarket: 83, domIsFloor: false } as typeof SUBJECT,
      ],
      fetchListings: noLake,
    });
    expect(real!.daysOnMarket).toBe(83);

    const floored = await resolveSubjectListing(
      "16447 Rainbow Meadows Court, Fort Myers, FL 33908",
      {
        fetchNearby: noNearby,
        geocode: geocodeReturning("33908"),
        fetchLakeCandidates: async () => [
          { ...SUBJECT, daysOnMarket: 12, domIsFloor: true } as typeof SUBJECT,
        ],
        fetchListings: noLake,
      },
    );
    expect(floored).not.toBeNull(); // the resolve itself still lands
    expect(floored!.daysOnMarket).toBeUndefined(); // a floor is never printed as exact
  });

  test("a lake hit prints the FULL address line, not the bare street", async () => {
    const facts = await resolveSubjectListing(
      "16447 Rainbow Meadows Court, Fort Myers, Florida 33908",
      {
        fetchNearby: noNearby,
        geocode: geocodeReturning("33908"),
        // lakeRowToListing sets formattedAddress to the bare street line.
        fetchLakeCandidates: async () => [
          mkListing({
            addressLine1: "16447 Rainbow Meadows Ct",
            formattedAddress: "16447 Rainbow Meadows Ct",
            price: 1159150,
            photoUrl: "https://ap.rdcpix.com/abc/16447.jpg",
          }),
        ],
        fetchListings: noLake,
      },
    );
    expect(facts!.address).toBe("16447 Rainbow Meadows Ct, Fort Myers, FL, 33908");
  });
});

describe("resolveSubjectListing", () => {
  test("resolves a Lee address to its record — Court≡Ct, photo + real numbers", async () => {
    const facts = await resolveSubjectListing(
      "16447 Rainbow Meadows Court, Fort Myers, Florida 33908",
      {
        fetchNearby: noNearby,
        geocode: geocodeReturning("33908"),
        fetchLakeCandidates: noLake,
        fetchListings: listFrom({ 0: [SUBJECT] }),
      },
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
      fetchNearby: noNearby,
      geocode: geocodeReturning("99999"), // resolves to no SWFL county
      fetchLakeCandidates: noLake,
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
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: noLake,
      fetchListings: listFrom({ 0: [mkListing({ addressLine1: "9 Elsewhere Blvd" })] }),
    });
    expect(facts).toBeNull();
  });

  test("pages past a full first page to find the subject", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) =>
      mkListing({ addressLine1: `${i} Nowhere Ln` }),
    );
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: noLake,
      fetchListings: listFrom({ 0: fullPage, 200: [SUBJECT] }),
    });
    expect(facts?.photos[0]).toBe("https://ap.rdcpix.com/abc/16447.jpg");
  });

  test("no for-sale listings (no key / empty feed) → null", async () => {
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: noLake,
      fetchListings: async () => [],
    });
    expect(facts).toBeNull();
  });

  test("empty address → null", async () => {
    expect(await resolveSubjectListing("")).toBeNull();
    expect(await resolveSubjectListing(null)).toBeNull();
  });

  // The bath lane. /search carries beds, sqft and lot but NO bath count, so every
  // listing shipped a blank "Baths" cell. The count is not missing from the vendor —
  // /nearby-home-values returns beds/baths/sqft, and a property is the nearest property
  // to its OWN coordinates, so the subject comes back as its own row (verified live
  // 07/13/2026: 326 Shore Dr → baths 3.5).
  test("fills baths from the nearby lane when the listing row has none", async () => {
    const noBaths = mkListing({
      addressLine1: "16447 Rainbow Meadows Ct",
      price: 1159150,
      bedrooms: 4,
      bathrooms: null, // /search never returns this
      squareFootage: 4195,
      latitude: 26.5,
      longitude: -81.9,
      photoUrl: "https://ap.rdcpix.com/abc/16447.jpg",
    });
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: noLake,
      fetchListings: listFrom({ 0: [noBaths] }),
      fetchNearby: async () => [
        { addressLine: "9 Somewhere Else Dr", baths: 9 },
        { addressLine: "16447 Rainbow Meadows Ct", baths: 3.5 }, // the subject's own row
      ],
    });
    expect(facts!.baths).toBe("3.5");
  });

  test("a bath count is never invented — no nearby match leaves the cell absent", async () => {
    const noBaths = mkListing({
      addressLine1: "16447 Rainbow Meadows Ct",
      bedrooms: 4,
      bathrooms: null,
      latitude: 26.5,
      longitude: -81.9,
      photoUrl: "https://ap.rdcpix.com/abc/16447.jpg",
    });
    const facts = await resolveSubjectListing("16447 Rainbow Meadows Court, Fort Myers, FL 33908", {
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: noLake,
      fetchListings: listFrom({ 0: [noBaths] }),
      fetchNearby: async () => [{ addressLine: "9 Somewhere Else Dr", baths: 9 }],
    });
    expect(facts!.baths).toBeUndefined();
  });
});

describe("withBaths — free LeePA lane before the paid vendor call (P1b Step 2)", () => {
  // The subject's own record with NO bath count, but WITH coordinates, so the paid
  // vendor lane is genuinely reachable — proving LeePA runs FIRST is the point.
  const BATHLESS = mkListing({
    addressLine1: "16447 Rainbow Meadows Ct",
    formattedAddress: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
    price: 500000,
    bedrooms: 3,
    bathrooms: null,
    latitude: 26.5,
    longitude: -81.9,
    photoUrl: "https://ap.rdcpix.com/abc/x.jpg",
  });
  const ADDRESS = "16447 Rainbow Meadows Court, Fort Myers, Florida 33908";

  test("baths fill from LeePA on a unique address match — paid vendor never called", async () => {
    let nearbyCalls = 0;
    const facts = await resolveSubjectListing(ADDRESS, {
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => [BATHLESS],
      fetchListings: noLake,
      fetchLeePaBaths: async () => [{ addressLine: "16447 RAINBOW MEADOWS CT", baths: 3 }],
      fetchNearby: async () => {
        nearbyCalls++;
        return [];
      },
    });
    expect(facts!.baths).toBe("3");
    expect(nearbyCalls).toBe(0);
  });

  test("baths stay absent on an ambiguous LeePA match — two parcels, one key, NEVER guess", async () => {
    const facts = await resolveSubjectListing(ADDRESS, {
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => [BATHLESS],
      fetchListings: noLake,
      fetchLeePaBaths: async () => [
        { addressLine: "16447 RAINBOW MEADOWS CT", baths: 2 },
        { addressLine: "16447 Rainbow Meadows Court", baths: 4 },
      ],
      fetchNearby: noNearby,
    });
    expect(facts!.baths).toBeUndefined();
  });

  test("LeePA never overwrites a bath count the record already carries", async () => {
    let leepaCalls = 0;
    const facts = await resolveSubjectListing(ADDRESS, {
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => [SUBJECT], // carries bathrooms: 4
      fetchListings: noLake,
      fetchLeePaBaths: async () => {
        leepaCalls++;
        return [{ addressLine: "16447 RAINBOW MEADOWS CT", baths: 1 }];
      },
      fetchNearby: noNearby,
    });
    expect(facts!.baths).toBe("4");
    expect(leepaCalls).toBe(0);
  });

  test("missing baths renders NO cell — undefined, never a zero", async () => {
    const facts = await resolveSubjectListing(ADDRESS, {
      geocode: geocodeReturning("33908"),
      fetchLakeCandidates: async () => [BATHLESS],
      fetchListings: noLake,
      fetchLeePaBaths: async () => [],
      fetchNearby: noNearby,
    });
    expect(facts!.baths).toBeUndefined();
    expect(facts!.baths).not.toBe("0");
  });
});

// ── THE ID LANE — 08/06/2026, the Horsecreek postmortem ─────────────────────
// "4140 Horse Creek Blvd" (typed, correctly spaced) missed "4140 Horsecreek Blvd" (the
// MLS feed's own one-word spelling) through canonStreet, on a listing that was fully in
// our lake — property_id 6863097870, flag_pending true. A pasted realtor.com URL
// carries that same id verbatim in its slug ("..._M68630-97870"). An id match is exact
// and needs no street-text parsing, no geocode, and no county gate at all.
const REALTOR_URL =
  "https://www.realtor.com/realestateandhomes-detail/4140-Horse-Creek-Blvd_Fort-Myers_FL_33905_M68630-97870";

const PENDING_HOME = mkListing({
  addressLine1: "4140 Horsecreek Blvd",
  formattedAddress: "4140 Horsecreek Blvd",
  city: "Fort Myers",
  state: "FL",
  zipCode: "33905",
  price: 1220000,
  bedrooms: 4,
  bathrooms: 3.5,
  squareFootage: 3162,
  photoUrl: "https://ap.rdcpix.com/abc/4140.jpg",
});

describe("extractRealtorPropertyId", () => {
  test("pulls the digits out of a realtor.com detail URL's trailing slug", () => {
    expect(extractRealtorPropertyId(REALTOR_URL)).toBe("6863097870");
  });
  test("works when the URL sits inside a longer pasted message", () => {
    expect(
      extractRealtorPropertyId(`this one just went pending: ${REALTOR_URL} — build the email`),
    ).toBe("6863097870");
  });
  test("null on plain text or a non-realtor URL — never guesses at a shape", () => {
    expect(extractRealtorPropertyId("4140 Horse Creek Blvd, Fort Myers, FL 33905")).toBeNull();
    expect(extractRealtorPropertyId("https://www.zillow.com/homedetails/4140-x/12345_zpid/")).toBe(
      null,
    );
    expect(extractRealtorPropertyId("")).toBeNull();
  });
});

describe("resolveSubjectListing — the ID lane (exact, beats fuzzy street text)", () => {
  test("resolves via the vendor id even though the typed street MISSES the lake's spelling", async () => {
    let geocodeCalls = 0;
    let streetLakeCalls = 0;
    // The realistic repro: the operator pastes the address AND the listing link in the
    // same message. The id in the URL is what saves this build, not the street text —
    // that street text alone still misses (see the next describe block).
    const facts = await resolveSubjectListing(
      `4140 Horse Creek Blvd, Fort Myers, FL 33905 ${REALTOR_URL}`,
      {
        geocode: (async () => {
          geocodeCalls++;
          return { lat: 26.68, lon: -81.75, place: "", zip: "33905" };
        }) as unknown as GeocodeFn,
        fetchNearby: noNearby,
        fetchLakeCandidates: async () => {
          streetLakeCalls++;
          return []; // the real bug: "Horse Creek" never matches lake's "Horsecreek"
        },
        fetchLakeById: async (id) => (id === "6863097870" ? [PENDING_HOME] : []),
        fetchListings: noLake,
      } as never,
    );
    expect(facts).not.toBeNull();
    expect(facts!.price).toBe("$1,220,000");
    // Only reachable when the caller HANDS us the id — plain typed text carries none,
    // so the fuzzy lanes must still run when there is no URL to extract from.
    expect(geocodeCalls).toBe(0);
    expect(streetLakeCalls).toBe(0);
  });

  test("resolves off a BARE pasted URL — no typed street at all", async () => {
    const facts = await resolveSubjectListing(REALTOR_URL, {
      fetchLakeById: async (id) => (id === "6863097870" ? [PENDING_HOME] : []),
      fetchListings: noLake,
      fetchLakeCandidates: noLake,
      fetchNearby: noNearby,
    } as never);
    expect(facts).not.toBeNull();
    expect(facts!.address).toContain("Horsecreek");
    expect(facts!.zip).toBe("33905");
  });

  test("an id present but not yet in the lake falls through to the ordinary address lanes", async () => {
    const facts = await resolveSubjectListing("4140 Horse Creek Blvd, Fort Myers, FL 33905", {
      geocode: geocodeReturning("33905"),
      fetchNearby: noNearby,
      fetchLakeById: async () => [], // not swept yet
      fetchLakeCandidates: noLake,
      fetchListings: noLake,
    } as never);
    expect(facts).toBeNull(); // same honest miss as before — never worse than today
  });
});

// ── COMPOUND-WORD SPELLING DRIFT — 08/19/2026, the Park Shore repro ──────────
// Second strike of the Horsecreek shape, this time with NO URL to rescue it: the
// operator TYPED "767 Park Shore Dr, Naples, FL 34103" into the Lab. The lake held
// the listing as "767 Parkshore Dr" (one word, property_id 5601341444, $6,999,500,
// flag_price_reduced, dom_days 134) — the lake fetch RETURNED the row and the street
// matcher threw it away, so the price-improved email rendered a fully empty skeleton
// over data we held. The fix: canonical street lines compare space-insensitively
// (full-string equality only — never a despaced prefix, which would let
// "767 Park…" swallow a different street).
describe("resolveSubjectListing — compound street names (Park Shore ≡ Parkshore)", () => {
  const PARKSHORE = mkListing({
    id: "5601341444",
    addressLine1: "767 Parkshore Dr",
    formattedAddress: "767 Parkshore Dr",
    city: "Naples",
    zipCode: "34103",
    price: 6999500,
    bedrooms: 5,
    squareFootage: 4887,
    lotSize: 0.32,
    daysOnMarket: 134,
    photoUrl: "https://ap.rdcpix.com/abc/767.jpg",
  });

  test("a typed two-word street resolves the lake's one-word spelling", async () => {
    const facts = await resolveSubjectListing("767 Park Shore Dr, Naples, FL 34103", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("34103"),
      fetchLakeCandidates: async () => [PARKSHORE],
      fetchListings: noLake,
    });
    expect(facts).not.toBeNull();
    expect(facts!.price).toBe("$6,999,500");
    expect(facts!.beds).toBe("5");
    expect(facts!.daysOnMarket).toBe(134);
    expect(facts!.photos[0]).toBe("https://ap.rdcpix.com/abc/767.jpg");
  });

  test("the reverse direction too — typed one-word, lake two-word", async () => {
    const facts = await resolveSubjectListing("4140 Horsecreek Blvd, Fort Myers, FL 33905", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("33905"),
      fetchLakeCandidates: async () => [
        mkListing({ addressLine1: "4140 Horse Creek Blvd", zipCode: "33905", price: 1220000 }),
      ],
      fetchListings: noLake,
    });
    expect(facts?.price).toBe("$1,220,000");
  });

  test("a despaced PREFIX never matches — 767 Park Ave is not 767 Parkshore Dr", async () => {
    const facts = await resolveSubjectListing("767 Park Ave, Naples, FL 34103", {
      fetchNearby: noNearby,
      geocode: geocodeReturning("34103"),
      fetchLakeCandidates: async () => [PARKSHORE],
      fetchListings: noLake,
    });
    expect(facts).toBeNull();
  });
});

describe("sameCanonStreet — the compound-word equality every street compare must use", () => {
  test("internal spacing folds — Horse Creek ≡ Horsecreek, Park Shore ≡ Parkshore", () => {
    expect(
      sameCanonStreet(canonStreet("4140 Horse Creek Blvd"), canonStreet("4140 Horsecreek Blvd")),
    ).toBe(true);
    expect(sameCanonStreet(canonStreet("767 Park Shore Dr"), canonStreet("767 Parkshore Dr"))).toBe(
      true,
    );
  });
  test("full-string only — a despaced prefix never matches, empties never match", () => {
    expect(sameCanonStreet(canonStreet("767 Park Ave"), canonStreet("767 Parkshore Dr"))).toBe(
      false,
    );
    expect(sameCanonStreet("", "")).toBe(false);
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
