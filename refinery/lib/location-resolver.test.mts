import { describe, expect, it } from "vitest";
import { resolveLocation } from "./location-resolver.mts";

describe("location-resolver §B dispatcher", () => {
  // ---- 1. bare ZIP → resolveZip ----
  it('"33908" → kind:"zip" with the full ZipResolution attached', async () => {
    const loc = await resolveLocation("33908");
    expect(loc.kind).toBe("zip");
    if (loc.kind !== "zip") throw new Error("narrow");
    expect(loc.resolution.zip).toBe("33908");
    expect(loc.resolution.in_scope).toBe(true);
    expect(loc.resolution.primary_county).toBe("12071"); // Fort Myers alt ZIP, Lee
  });

  // ---- 2. gazetteer place FIRST → primary ZIP, NO geocode (the Immokalee case) ----
  it('"Immokalee" → kind:"place", ZIP 34142, corridors:[] (gazetteer-first, no geocoder)', async () => {
    const loc = await resolveLocation("Immokalee");
    expect(loc.kind).toBe("place");
    if (loc.kind !== "place") throw new Error("narrow");
    expect(loc.matched).toBe("Immokalee");
    expect(loc.resolution.zip).toBe("34142");
    expect(loc.resolution.in_scope).toBe(true);
    expect(loc.resolution.primary_county).toBe("12021"); // Collier
    expect(loc.resolution.corridors).toEqual([]); // Immokalee sits in no pocket
  });

  // ---- 3. county name → kind:"county", NO ZIP ----
  it('"Lee County" → kind:"county" (no ZIP synthesized)', async () => {
    const loc = await resolveLocation("Lee County");
    expect(loc.kind).toBe("county");
    if (loc.kind !== "county") throw new Error("narrow");
    expect(loc.county).toBe("12071");
    expect(loc.county_name).toBe("Lee County");
    expect(loc).not.toHaveProperty("resolution");
  });

  // ---- 4. exact corridor slug → kind:"corridor", NO ZIP ----
  it('"airport-pulling-naples" → kind:"corridor" with pocket+county, no synthesized ZIP', async () => {
    const loc = await resolveLocation("airport-pulling-naples");
    expect(loc.kind).toBe("corridor");
    if (loc.kind !== "corridor") throw new Error("narrow");
    expect(loc.corridor_id).toBe("airport-pulling-naples");
    expect(loc.pocket).toBe("North Naples");
    expect(loc.county).toBe("12021"); // North Naples → Collier
    expect(loc).not.toHaveProperty("resolution");
  });

  // ---- 5. region terms → kind:"region" ----
  it('"SWFL" → kind:"region"', async () => {
    expect((await resolveLocation("SWFL")).kind).toBe("region");
  });
  it('"Southwest Florida" → kind:"region"', async () => {
    expect((await resolveLocation("Southwest Florida")).kind).toBe("region");
  });

  // ---- 6. genuinely out-of-scope place name → kind:"out-of-scope" ----
  it('"Miami" → kind:"out-of-scope" (a real place, just not SWFL — not mislabeled as an address)', async () => {
    const loc = await resolveLocation("Miami");
    expect(loc.kind).toBe("out-of-scope");
    if (loc.kind !== "out-of-scope") throw new Error("narrow");
    expect(loc.raw).toBe("Miami");
  });

  // ---- 7. free-text street address (pre-§E) → kind:"address-unsupported" ----
  it('"16448 Rainbow Meadows Ct" → kind:"address-unsupported" (pre-geocoder)', async () => {
    const loc = await resolveLocation("16448 Rainbow Meadows Ct");
    expect(loc.kind).toBe("address-unsupported");
    if (loc.kind !== "address-unsupported") throw new Error("narrow");
    expect(loc.raw).toBe("16448 Rainbow Meadows Ct");
  });

  // ---- 8. fuzzy-vs-gazetteer: gazetteer WINS ----
  // "Estero" both names a corridor pocket (place-resolver would match) AND is a
  // sourced gazetteer place. Dispatch order resolves it via the gazetteer → an
  // honest primary ZIP, never a no-ZIP corridor.
  it('"Estero" resolves via the gazetteer (kind:"place"), not as a corridor/pocket', async () => {
    const loc = await resolveLocation("Estero");
    expect(loc.kind).toBe("place");
    if (loc.kind !== "place") throw new Error("narrow");
    expect(loc.resolution.zip).toBe("33928"); // Estero primary ZIP
  });

  // ---- gazetteer alias path also lands as kind:"place" ----
  it('"fmb" (gazetteer alias) → kind:"place", ZIP 33931', async () => {
    const loc = await resolveLocation("fmb");
    expect(loc.kind).toBe("place");
    if (loc.kind !== "place") throw new Error("narrow");
    expect(loc.resolution.zip).toBe("33931");
  });

  // ---- input hygiene: whitespace + empty ----
  it("trims surrounding whitespace before dispatch", async () => {
    expect((await resolveLocation("  33908 ")).kind).toBe("zip");
  });
  it('empty / whitespace input → kind:"out-of-scope" (nothing to resolve)', async () => {
    expect((await resolveLocation("   ")).kind).toBe("out-of-scope");
  });

  // ---- pocket-only match (no single corridor_id) is honest, not a crash ----
  // "North Naples" is a pocket name (not a gazetteer place, not a county) → corridor
  // grain, but there is no ONE corridor, so corridor_id is null (documented deviation).
  it('"North Naples" → kind:"corridor", pocket set, corridor_id null (pocket grain)', async () => {
    const loc = await resolveLocation("North Naples");
    expect(loc.kind).toBe("corridor");
    if (loc.kind !== "corridor") throw new Error("narrow");
    expect(loc.pocket).toBe("North Naples");
    expect(loc.corridor_id).toBeNull();
    expect(loc.county).toBe("12021");
  });
});
