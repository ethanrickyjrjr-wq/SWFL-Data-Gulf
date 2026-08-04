// lib/listings/apify-comps.test.ts
//
// Every test is named after the failure mode it targets in
// docs/superpowers/specs/2026-08-03-apify-comp-email-design.md §4 (RULE 3.5 TDD gate).

import { describe, test, expect } from "bun:test";
import { compPhotoKey } from "./comp-photos";
import {
  parseAltPhotos,
  truncateDescription,
  buildActorInput,
  fetchApifyComps,
  apifyPhotoIndex,
  selectPhotographedComps,
  DESCRIPTION_CHAR_CAP,
  type ApifyRecord,
} from "./apify-comps";

// ── F8 — alt_photos arrives as a comma-space-joined STRING, not an array ───────
describe("F8 · parseAltPhotos", () => {
  test("splits the vendor's comma-space-joined STRING into real urls", () => {
    const raw =
      "https://ap.rdcpix.com/a.jpg, https://ap.rdcpix.com/b.jpg, https://ap.rdcpix.com/c.jpg";
    expect(parseAltPhotos(raw)).toEqual([
      "https://ap.rdcpix.com/a.jpg",
      "https://ap.rdcpix.com/b.jpg",
      "https://ap.rdcpix.com/c.jpg",
    ]);
  });

  test("an array input still works (vendor shape drift is not a crash)", () => {
    expect(parseAltPhotos(["https://ap.rdcpix.com/a.jpg"])).toEqual([
      "https://ap.rdcpix.com/a.jpg",
    ]);
  });

  test("null / undefined / empty / <NA> yield [], never a bogus one-element list", () => {
    expect(parseAltPhotos(null)).toEqual([]);
    expect(parseAltPhotos(undefined)).toEqual([]);
    expect(parseAltPhotos("")).toEqual([]);
    expect(parseAltPhotos("<NA>")).toEqual([]);
  });

  test("drops non-http junk rather than shipping it into an <img src>", () => {
    expect(parseAltPhotos("javascript:alert(1), https://ap.rdcpix.com/a.jpg")).toEqual([
      "https://ap.rdcpix.com/a.jpg",
    ]);
  });
});

// ── F2 — a 3,000-char description blows the 20-line / 102KB budget ────────────
describe("F2 · truncateDescription", () => {
  const long = "Some waterfront homes impress you the moment you walk in. ".repeat(60);

  test("a 3,000-char description comes back under the cap", () => {
    const out = truncateDescription(long)!;
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_CHAR_CAP);
    expect(out.length).toBeGreaterThan(0);
  });

  test("never ends mid-sentence — the cut lands on a sentence boundary", () => {
    const out = truncateDescription(long)!;
    expect(out.trimEnd().endsWith(".")).toBe(true);
  });

  test("a description already under the cap is returned untouched", () => {
    const short = "Bright three-bedroom pool home on a quiet cul-de-sac.";
    expect(truncateDescription(short)).toBe(short);
  });

  test("<NA> and empty are not descriptions — they yield null, never the literal string", () => {
    expect(truncateDescription("<NA>")).toBeNull();
    expect(truncateDescription("")).toBeNull();
    expect(truncateDescription(null)).toBeNull();
  });
});

// ── F3 — truncation must NOT strip the virtual-staging disclosure ─────────────
describe("F3 · the virtual-staging disclosure survives truncation", () => {
  const DISCLOSURE = "Some photos have been virtually staged and enhanced using AI.";

  test("a long description whose LAST sentence is the disclosure still carries it", () => {
    const body = "This waterfront home impresses the moment you walk in. ".repeat(60);
    const out = truncateDescription(`${body}${DISCLOSURE}`)!;
    expect(out).toContain(DISCLOSURE);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_CHAR_CAP + DISCLOSURE.length + 2);
  });

  test("a SHORT description with the disclosure is not duplicated", () => {
    const short = `Bright pool home. ${DISCLOSURE}`;
    const out = truncateDescription(short)!;
    expect(out.split(DISCLOSURE).length - 1).toBe(1);
  });

  test("the disclosure is matched on its meaning, not one exact vendor string", () => {
    const body = "Lovely home with a big yard. ".repeat(80);
    const variant = "Photos may be virtually staged.";
    expect(truncateDescription(`${body}${variant}`)).toContain(variant);
  });
});

// ── F2/F3 against REAL VENDOR BYTES, not a fixture ────────────────────────────
// The live MLS remarks for 2601 SW 37th Ter, Cape Coral (Apify run JTdmKKjpQCNV3cBwX,
// 08/03/2026). Kept verbatim because the thing under test IS the vendor's real shape:
// ~2,100 chars, and the virtual-staging disclosure is the LAST thing in the string —
// exactly where a truncator cuts. This is the case F3 exists for, caught from prod.
const REAL_REMARKS =
  "Discover the perfect combination of comfort, space, and location in this beautifully maintained 3-bedroom, 2-bath pool home offering 1,983 square feet of living space in one of Southwest Cape Coral's most desirable residential neighborhoods. Situated on a spacious corner lot, this home features a desirable split-bedroom floor plan, vaulted ceilings that enhance the sense of space, abundant natural light, and spacious living areas designed for both everyday living and entertaining. Proudly owned and meticulously cared for by its original owner, this home offers a newer roof, new A/C, new gutters, new carpet, fresh interior paint, and beautifully updated bathrooms, providing peace of mind with major improvements already completed while allowing you to add your own personal touch over time if desired. The spacious kitchen overlooks the pool and flows seamlessly into the dining and family rooms, creating an inviting space for gathering with family and friends. The beautifully renovated primary bathroom offers a spa-inspired retreat with a large walk-in shower, soaking tub, and contemporary finishes. Step outside to your expansive screened lanai featuring a sparkling pool and spa, creating the perfect setting for relaxing, entertaining, and enjoying the Florida lifestyle year-round. A convenient pool bath with direct lanai access, a spacious two-car garage with a side entry door, a sprinkler system, and fully paid city water and sewer assessments add even more value to this exceptional home. Ideally located in a quiet, family-friendly neighborhood near the highly sought-after Oasis Charter Schools, this home is just minutes from parks, shopping, dining, and everyday conveniences. Surrounded by beautifully maintained homes in one of Southwest Cape Coral's most established residential communities, this property offers an exceptional opportunity to enjoy comfort, privacy, and the Southwest Florida lifestyle. Don't miss your chance to make this wonderful home your own! Some photos have been virtually staged and enhanced using AI for illustrative purposes. Furniture and decor shown are not included in the sale.";

describe("F2/F3 · the REAL vendor remarks, end to end", () => {
  test("2,100 chars of live MLS copy comes back inside the render budget", () => {
    expect(REAL_REMARKS.length).toBeGreaterThan(2000);
    const out = truncateDescription(REAL_REMARKS)!;
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_CHAR_CAP + 200);
    expect(out.trim()).toMatch(/[.!?]$/);
  });

  test("the disclosure is the LAST sentence in the source and it still survives", () => {
    expect(REAL_REMARKS.trimEnd().endsWith("not included in the sale.")).toBe(true);
    expect(truncateDescription(REAL_REMARKS)).toContain("virtually staged");
  });

  test("nothing is invented — the prose is the vendor's own bytes", () => {
    const out = truncateDescription(REAL_REMARKS)!;
    const beforeDisclosure = out.split(" Some photos")[0];
    expect(REAL_REMARKS).toContain(beforeDisclosure);
  });

  test("the vendor's literal <NA> (seen live on half_baths) never prints as prose", () => {
    expect(truncateDescription("<NA>")).toBeNull();
  });
});

// ── F7 / F9 — the actor input is where money and correctness are decided ──────
describe("F7 · buildActorInput always caps the run", () => {
  test("max_results_per_location is ALWAYS set and positive (0 = unlimited = $100 run)", () => {
    const input = buildActorInput({ location: "33914", listingType: "sold" });
    expect(input.max_results_per_location).toBeGreaterThan(0);
  });

  test("an explicit cap is honored but can never be 0 or negative", () => {
    expect(
      buildActorInput({ location: "33914", listingType: "sold", maxResults: 0 })
        .max_results_per_location,
    ).toBeGreaterThan(0);
    expect(
      buildActorInput({ location: "33914", listingType: "sold", maxResults: -5 })
        .max_results_per_location,
    ).toBeGreaterThan(0);
  });

  test("land is excluded at the SOURCE so we are never billed for a vacant lot", () => {
    expect(buildActorInput({ location: "33914", listingType: "sold" }).property_type).not.toContain(
      "land",
    );
  });
});

describe("F9 · radius only works on a specific address, never a bare ZIP", () => {
  test("a radius with a bare ZIP is DROPPED rather than silently ignored by the vendor", () => {
    const input = buildActorInput({ location: "33914", listingType: "sold", radiusMiles: 2 });
    expect(input.radius).toBeUndefined();
  });

  test("a radius with a full street address is kept", () => {
    const input = buildActorInput({
      location: "409 SW 44th St, Cape Coral, FL 33914",
      listingType: "sold",
      radiusMiles: 2,
    });
    expect(input.radius).toBe(2);
  });

  test("date_from / date_to ride through as YYYY-MM-DD", () => {
    const input = buildActorInput({
      location: "33914",
      listingType: "sold",
      dateFrom: "2025-06-01",
      dateTo: "2025-06-30",
    });
    expect(input.date_from).toBe("2025-06-01");
    expect(input.date_to).toBe("2025-06-30");
  });
});

// ── F6 — an empty run is NORMAL. 2 of 5 store actors tested were junk. ────────
describe("F6 · empty-tolerant: a bad run is never an exception", () => {
  test("a client that THROWS yields [] — the build still lands", async () => {
    const out = await fetchApifyComps(
      { location: "33914", listingType: "sold" },
      {
        runActor: async () => {
          throw new Error("actor exit 1");
        },
      },
    );
    expect(out).toEqual([]);
  });

  test("a run that returns ZERO items yields [] and is not an error", async () => {
    const out = await fetchApifyComps(
      { location: "33914", listingType: "sold" },
      { runActor: async () => [] },
    );
    expect(out).toEqual([]);
  });

  test("garbage rows are dropped, real ones survive the same run", async () => {
    const out = await fetchApifyComps(
      { location: "33914", listingType: "sold" },
      {
        runActor: async () =>
          [
            { error: "boom" },
            null,
            {
              street: "409 SW 44th St",
              city: "Cape Coral",
              primary_photo: "https://ap.rdcpix.com/x.jpg",
            },
          ] as unknown as ApifyRecord[],
      },
    );
    expect(out).toHaveLength(1);
    expect(out[0].street).toBe("409 SW 44th St");
  });

  test("no token configured is a miss, not a crash", async () => {
    const out = await fetchApifyComps(
      { location: "33914", listingType: "sold" },
      {
        runActor: async () => {
          throw new Error("APIFY_TOKEN missing");
        },
      },
    );
    expect(out).toEqual([]);
  });
});

// ── F10 — the SAME normalizer as lane 1. Never a second one. ──────────────────
describe("F10 · a comp never borrows another house's photo", () => {
  const rows: ApifyRecord[] = [
    { street: "330 5th St", city: "Naples", primary_photo: "https://ap.rdcpix.com/naples.jpg" },
    {
      street: "409 SW 44th St",
      city: "Cape Coral",
      primary_photo: "https://ap.rdcpix.com/cape.jpg",
    },
  ];

  test("same street, DIFFERENT city — no match", () => {
    const idx = apifyPhotoIndex(rows);
    expect(idx.get(compPhotoKey("330 5th St", "Fort Myers"))).toBeUndefined();
    expect(idx.get(compPhotoKey("330 5th St", "Naples"))).toBe("https://ap.rdcpix.com/naples.jpg");
  });

  test("suffix and punctuation drift still matches the right house", () => {
    const idx = apifyPhotoIndex([
      {
        street: "409 SW 44th Street",
        city: "Cape Coral",
        primary_photo: "https://ap.rdcpix.com/cape.jpg",
      },
    ]);
    expect(idx.get(compPhotoKey("409 SW 44th St", "Cape Coral"))).toBe(
      "https://ap.rdcpix.com/cape.jpg",
    );
  });

  test("a row with no photo never enters the index", () => {
    const idx = apifyPhotoIndex([{ street: "1 Nowhere Ln", city: "Naples", primary_photo: null }]);
    expect(idx.size).toBe(0);
  });
});

// ── F1 — THE SILENT ONE. Partial coverage must not ship a photo-less table. ───
describe("F1 · photo coverage gates comp SELECTION, not rendering", () => {
  const comps = [1, 2, 3, 4, 5, 6].map((n) => ({
    addressLine: `${n}00 Test St`,
    city: "Cape Coral",
  }));

  test("4 of 6 photographed → ships 4 comps that ALL have photos, never 6 with none", () => {
    const photos = new Map(
      comps.slice(0, 4).map((c) => [c.addressLine, "https://ap.rdcpix.com/x.jpg"]),
    );
    const picked = selectPhotographedComps(comps, photos, 6);
    expect(picked).toHaveLength(4);
    expect(picked.every((c) => photos.has(c.addressLine))).toBe(true);
  });

  test("full coverage keeps the whole set, capped at max", () => {
    const photos = new Map(comps.map((c) => [c.addressLine, "https://ap.rdcpix.com/x.jpg"]));
    expect(selectPhotographedComps(comps, photos, 6)).toHaveLength(6);
    expect(selectPhotographedComps(comps, photos, 3)).toHaveLength(3);
  });

  test("ZERO coverage falls back to the text+link table rather than shipping nothing", () => {
    const picked = selectPhotographedComps(comps, new Map(), 6);
    expect(picked).toHaveLength(6);
  });

  test("below the informative floor, coverage does NOT get to shrink the set", () => {
    // 1 photographed comp is not a comps email — a 1-row table is worse than 6 unphotographed.
    const photos = new Map([[comps[0].addressLine, "https://ap.rdcpix.com/x.jpg"]]);
    expect(selectPhotographedComps(comps, photos, 6)).toHaveLength(6);
  });

  test("vendor order (nearest-first) is preserved among the photographed set", () => {
    const photos = new Map(
      [comps[1], comps[3], comps[5]].map((c) => [c.addressLine, "https://ap.rdcpix.com/x.jpg"]),
    );
    const picked = selectPhotographedComps(comps, photos, 6);
    expect(picked.map((c) => c.addressLine)).toEqual(["200 Test St", "400 Test St", "600 Test St"]);
  });
});
