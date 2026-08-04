import { describe, expect, it } from "bun:test";

import {
  matchNeighborhoodByPoint,
  neighborhoodAmenitiesSourceLine,
  resolveNeighborhoodForListing,
  summarizeAmenities,
  type AmenityRow,
  type NeighborhoodRow,
} from "./neighborhood-amenities";

// A unit square around (-81.8..-81.7, 26.1..26.2). Vendor boundaries are GeoJSON
// Polygons in [lon, lat] order — the shape verified in the 08/03/2026 probe doc.
function square(
  slug: string,
  west: number,
  south: number,
  size = 0.1,
  over: Partial<NeighborhoodRow> = {},
): NeighborhoodRow {
  return {
    slug_id: slug,
    name: slug.replace(/_.*$/, "").replace(/-/g, " "),
    city: "Naples",
    level: "macro_neighborhood",
    boundary: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [west + size, south],
          [west + size, south + size],
          [west, south + size],
          [west, south],
        ],
      ],
    },
    scores: [{ label: "Quiet", value: 8.1, text: "quiet" }],
    search_radius: 5,
    source_url: "https://api.steadyapi.com/v1/real-estate/neighborhood-amenities",
    as_of: "2026-08-03",
    ...over,
  };
}

const RURAL = square("Rural-Estates_Naples_FL", -81.8, 26.1);

describe("matchNeighborhoodByPoint", () => {
  it("matches a point inside the boundary", () => {
    const hit = matchNeighborhoodByPoint(26.15, -81.75, [RURAL]);
    expect(hit?.slug_id).toBe("Rural-Estates_Naples_FL");
  });

  it("returns null for a point outside every boundary", () => {
    expect(matchNeighborhoodByPoint(27.5, -82.5, [RURAL])).toBeNull();
  });

  // FAILURE MODE: a wrong community ships as a STATED FACT downstream. Two
  // same-level polygons covering one point is not a tie to break — it is an
  // unknown. Same rule as community-lookup.ts's condo-tower fan-out.
  it("returns null when two SAME-LEVEL boundaries both contain the point", () => {
    const overlapping = square("Golden-Gate_Naples_FL", -81.78, 26.12);
    expect(matchNeighborhoodByPoint(26.15, -81.75, [RURAL, overlapping])).toBeNull();
  });

  // A micro neighborhood nested inside a macro one IS resolvable — the more
  // specific level is a real vendor signal, not a coin flip.
  it("prefers the more specific level when a macro and a sub-neighborhood overlap", () => {
    const inner = square("Twin-Eagles_Naples_FL", -81.78, 26.12, 0.1, {
      level: "neighborhood",
    });
    const hit = matchNeighborhoodByPoint(26.15, -81.75, [RURAL, inner]);
    expect(hit?.slug_id).toBe("Twin-Eagles_Naples_FL");
  });

  // FAILURE MODE (measured live 08/04/2026, and the reason these tests exist):
  // LEVEL_SPECIFICITY shipped with an INVENTED level, "subdivision", which the
  // vendor never emits, and it omitted the two levels that carry the actual
  // community names. Live level census over all 429 stored areas:
  //   neighborhood 78 · macro_neighborhood 7 · residential_neighborhood 341 · sub_neighborhood 3
  // "residential_neighborhood" is the community grain ("Bella Vida", "Sanibel
  // Bayous", "Bonita Beachwalk Condominiums"); the bare "neighborhood" level is a
  // ROAD-CORRIDOR sector ("Jacaranda", "West End"). Both unmapped levels scored 0,
  // so a corridor at specificity 1 BEAT the real community — over 6,000 real
  // listing coordinates, 40 of the 102 multi-boundary hits named the corridor
  // instead of the community, and the wrong one would have shipped as a stated
  // fact in an email. Not a null; an actively wrong answer.
  it("prefers a residential_neighborhood over the road-corridor neighborhood containing it", () => {
    const corridor = square("Jacaranda_Cape-Coral_FL", -81.8, 26.1, 0.1, {
      level: "neighborhood",
    });
    const community = square("Bella-Vida_Cape-Coral_FL", -81.78, 26.12, 0.1, {
      level: "residential_neighborhood",
    });
    const hit = matchNeighborhoodByPoint(26.15, -81.75, [corridor, community]);
    expect(hit?.slug_id).toBe("Bella-Vida_Cape-Coral_FL");
  });

  it("prefers a sub_neighborhood over the neighborhood containing it", () => {
    const outer = square("Jacaranda_Cape-Coral_FL", -81.8, 26.1, 0.1, {
      level: "neighborhood",
    });
    const inner = square("Magnolia-Landing_North-Fort-Myers_FL", -81.78, 26.12, 0.1, {
      level: "sub_neighborhood",
    });
    const hit = matchNeighborhoodByPoint(26.15, -81.75, [outer, inner]);
    expect(hit?.slug_id).toBe("Magnolia-Landing_North-Fort-Myers_FL");
  });

  // The ordering must be the VENDOR's four real levels, so an unrecognized level
  // stays broad-by-default and can never outrank a known specific one.
  it("treats an unknown level as broadest, never beating a known specific level", () => {
    const unknown = square("Mystery_FL", -81.8, 26.1, 0.1, { level: "county_thing" });
    const community = square("Bella-Vida_Cape-Coral_FL", -81.78, 26.12, 0.1, {
      level: "residential_neighborhood",
    });
    expect(matchNeighborhoodByPoint(26.15, -81.75, [unknown, community])?.slug_id).toBe(
      "Bella-Vida_Cape-Coral_FL",
    );
  });

  it("returns null on absent or non-finite coordinates", () => {
    expect(matchNeighborhoodByPoint(Number.NaN, -81.75, [RURAL])).toBeNull();
    expect(matchNeighborhoodByPoint(26.15, Number.NaN, [RURAL])).toBeNull();
  });

  it("survives a malformed boundary instead of throwing", () => {
    const broken = { ...RURAL, slug_id: "Broken_FL", boundary: { type: "Polygon" } };
    expect(() => matchNeighborhoodByPoint(26.15, -81.75, [broken])).not.toThrow();
  });
});

describe("summarizeAmenities", () => {
  const rows: AmenityRow[] = [
    {
      slug_id: "s",
      category: "golf",
      name: "Olde Florida Golf Club",
      distance_from_property: 0.24,
    },
    { slug_id: "s", category: "golf", name: "Calusa Pines", distance_from_property: 1.42 },
    { slug_id: "s", category: "countryclubs", name: "Quail Creek CC", distance_from_property: 2.1 },
    { slug_id: "s", category: "cafes", name: "Bad Ass Coffee", distance_from_property: 3.0 },
  ];

  it("counts per category and names the NEAREST of each, with its real distance", () => {
    const out = summarizeAmenities(rows);
    const golf = out.find((c) => c.category === "golf");
    expect(golf?.count).toBe(2);
    expect(golf?.nearest?.name).toBe("Olde Florida Golf Club");
    expect(golf?.nearest?.distanceMiles).toBe(0.24);
  });

  it("puts golf and country clubs first — the categories the decree named", () => {
    const out = summarizeAmenities(rows);
    expect(out[0]?.category).toBe("golf");
    expect(out.map((c) => c.category)).toContain("countryclubs");
  });

  it("is empty for no rows — never a zero-filled category list", () => {
    expect(summarizeAmenities([])).toEqual([]);
  });

  it("ignores a row with no usable distance rather than inventing one", () => {
    const out = summarizeAmenities([
      { slug_id: "s", category: "golf", name: "No Distance GC", distance_from_property: null },
    ]);
    expect(out[0]?.count).toBe(1);
    expect(out[0]?.nearest).toBeNull();
  });
});

describe("neighborhoodAmenitiesSourceLine", () => {
  const resolved = {
    slugId: "Rural-Estates_Naples_FL",
    name: "Rural Estates",
    city: "Naples",
    level: "macro_neighborhood",
    scores: [{ label: "Quiet", value: 8.1, text: "quiet" }],
    searchRadiusMiles: 5,
    amenities: [
      {
        category: "golf",
        count: 3,
        nearest: { name: "Olde Florida Golf Club", distanceMiles: 0.24 },
      },
    ],
    sourceUrl: "https://api.steadyapi.com/v1/real-estate/neighborhood-amenities",
    asOf: "2026-08-03",
  };

  // THE failure mode for this whole lane. The probe doc is explicit: these are
  // businesses in a vendor-fixed radius, NOT bundled community amenities. A line
  // that omits the distinction hands the narrator a false claim to make.
  it("states these are NEARBY businesses, not in-gate community amenities", () => {
    const line = neighborhoodAmenitiesSourceLine(resolved)!;
    expect(line).toContain("5 miles");
    expect(line.toLowerCase()).toContain("not amenities inside the community");
  });

  it("forbids the on-site / resident-only / community-has vocabulary explicitly", () => {
    const line = neighborhoodAmenitiesSourceLine(resolved)!.toLowerCase();
    expect(line).toContain("resident-only");
    expect(line).toContain("on-site");
  });

  it("states the count and the real nearest distance", () => {
    const line = neighborhoodAmenitiesSourceLine(resolved)!;
    expect(line).toContain("golf");
    expect(line).toContain("0.24");
  });

  // FAILURE MODE — A ROAD STATED AS A PLACE. Measured live 08/04/2026 over all
  // 21,008 rows of the pairing edge: 18,013 of them (86%) resolve to a vendor area
  // at `neighborhood` or `macro_neighborhood` grain, and at those two levels this
  // vendor's "neighborhood" names are ROADS AND CITY SECTORS, not communities —
  // Lehigh Acres boulevards (Eisenhower 2,074 listings, Joel 1,182, Richmond 1,048,
  // Harris 795) and Cape Coral parkways (Burnt Store 1,493, Mariner 1,335, Diplomat
  // 1,204, Pelican 1,124, Hancock 981). "The vendor places it in Eisenhower, Lehigh
  // Acres" asserts a street as a neighborhood in 86% of listing emails. It is
  // vendor-sourced, so no no-invention lint catches it — the guard has to be here.
  //
  // The AMENITY COUNTS are unaffected and stay: they are measured from the property,
  // not from the area name. So the placement clause is dropped and the counts are
  // kept, rather than going silent and losing a real sourced fact.
  it("does NOT state a placement for a road-corridor area (macro_neighborhood)", () => {
    const line = neighborhoodAmenitiesSourceLine({ ...resolved, level: "macro_neighborhood" })!;
    expect(line).not.toContain("Rural Estates");
    expect(line.toLowerCase()).not.toContain("places it in");
    // the sourced facts survive
    expect(line).toContain("golf");
    expect(line).toContain("0.24");
    expect(line).toContain("5 miles");
  });

  it("does NOT state a placement at the bare neighborhood level either", () => {
    const line = neighborhoodAmenitiesSourceLine({
      ...resolved,
      level: "neighborhood",
      name: "Eisenhower",
      city: "Lehigh Acres",
    })!;
    expect(line).not.toContain("Eisenhower");
    expect(line).toContain("golf");
  });

  // At community grain the name IS what a buyer would call the place, so it is stated.
  it("states the placement at community grain (residential_neighborhood)", () => {
    const line = neighborhoodAmenitiesSourceLine({
      ...resolved,
      level: "residential_neighborhood",
      name: "Bella Vida",
      city: "Cape Coral",
    })!;
    expect(line).toContain("Bella Vida");
    expect(line).toContain("Cape Coral");
  });

  it("states the placement for a sub_neighborhood", () => {
    const line = neighborhoodAmenitiesSourceLine({
      ...resolved,
      level: "sub_neighborhood",
      name: "Magnolia Landing",
    })!;
    expect(line).toContain("Magnolia Landing");
  });

  // An unrecognized level is NOT assumed to be a community — same broad-by-default
  // posture as the specificity table, for the same reason.
  it("withholds the placement for an unknown level", () => {
    const line = neighborhoodAmenitiesSourceLine({
      ...resolved,
      level: "county_thing",
      name: "Mystery Area",
    })!;
    expect(line).not.toContain("Mystery Area");
  });

  // FAILURE MODE — false feature licensing. shared.ts's authorListingNarrative turns
  // every fact line into a SETTLED claim, and auditClaims derives allowedFeatures from
  // that settled text (claims.ts "unsourced-feature"). A business NAME in this line
  // therefore licenses its words as sourced house features: "Gulf Harbour Marina" makes
  // "gulf" sourced, "Bay Colony Golf Club" makes "bay" sourced — and the model may then
  // claim the HOUSE is on the gulf. Same shape as the BRAND_NAME hole ("SWFL Data Gulf"
  // once licensed a false "gulf view"), but over 29k+ business rows instead of one name.
  // The name was never load-bearing for an email, so it is not emitted at all.
  it("emits NO business names — a name's words would license a false house feature", () => {
    const line = neighborhoodAmenitiesSourceLine({
      ...resolved,
      amenities: [
        {
          category: "marinas",
          count: 2,
          nearest: { name: "Gulf Harbour Bay Waterfront Marina", distanceMiles: 1.1 },
        },
      ],
    })!;
    expect(line).not.toContain("Gulf Harbour");
    expect(line).not.toContain("Waterfront");
    expect(line.toLowerCase()).not.toContain("gulf harbour");
    // the sourced facts themselves survive
    expect(line).toContain("marinas");
    expect(line).toContain("1.1");
  });

  it("writes as-of MM/DD/YYYY", () => {
    expect(neighborhoodAmenitiesSourceLine(resolved)!).toContain("08/03/2026");
  });

  // Absence stays SILENT — never "no golf nearby", which is a claim we cannot make.
  it("returns null when absent, and when there are no amenities at all", () => {
    expect(neighborhoodAmenitiesSourceLine(undefined)).toBeNull();
    expect(neighborhoodAmenitiesSourceLine({ ...resolved, amenities: [] })).toBeNull();
  });
});

describe("resolveNeighborhoodForListing", () => {
  const deps = {
    loadNeighborhoodsNear: async () => [RURAL],
    loadNeighborhoodBySlug: async (slug: string) =>
      slug === "Rural-Estates_Naples_FL" ? RURAL : null,
    loadAmenities: async (slug: string) =>
      [
        {
          slug_id: slug,
          category: "golf",
          name: "Olde Florida Golf Club",
          distance_from_property: 0.24,
        },
      ] as AmenityRow[],
    loadAssignment: async (propertyId: string) =>
      propertyId === "PAIRED" ? "Rural-Estates_Naples_FL" : null,
  };

  it("uses the VENDOR's own pairing when a property_id is paired — no geometry guess", async () => {
    const out = await resolveNeighborhoodForListing(
      { propertyId: "PAIRED", lat: 99, lon: 99 }, // coordinates deliberately nowhere near
      deps,
    );
    expect(out?.name).toBe("Rural Estates");
    expect(out?.amenities[0]?.count).toBe(1);
  });

  it("falls back to the boundary polygon when the property_id is unpaired", async () => {
    const out = await resolveNeighborhoodForListing(
      { propertyId: "UNPAIRED", lat: 26.15, lon: -81.75 },
      deps,
    );
    expect(out?.slugId).toBe("Rural-Estates_Naples_FL");
  });

  it("works on coordinates alone — a listing outside the paired book still resolves", async () => {
    const out = await resolveNeighborhoodForListing({ lat: 26.15, lon: -81.75 }, deps);
    expect(out?.slugId).toBe("Rural-Estates_Naples_FL");
  });

  it("returns null when nothing resolves", async () => {
    expect(await resolveNeighborhoodForListing({ lat: 27.9, lon: -82.9 }, deps)).toBeNull();
    expect(await resolveNeighborhoodForListing({}, deps)).toBeNull();
  });

  // Empty-tolerant / ODD contract: no creds, no rows, a query error -> null, never a throw.
  it("returns null instead of throwing when the lake is unreachable", async () => {
    const broken = {
      loadNeighborhoodsNear: async () => {
        throw new Error("no creds");
      },
      loadNeighborhoodBySlug: async () => {
        throw new Error("no creds");
      },
      loadAmenities: async () => {
        throw new Error("no creds");
      },
      loadAssignment: async () => {
        throw new Error("no creds");
      },
    };
    expect(await resolveNeighborhoodForListing({ lat: 26.15, lon: -81.75 }, broken)).toBeNull();
  });
});
