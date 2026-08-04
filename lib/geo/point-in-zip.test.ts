// lib/geo/point-in-zip.test.ts
//
// Every coordinate below was VERIFIED against the fixture's own geometry before
// being written down (the plan's instruction: never tune the implementation to
// match a guessed expectation). 33901 and 33956 were resolved by running the
// ray-cast over fixtures/swfl-zip-polygons.json directly.
import { describe, expect, test } from "bun:test";
import { zipForPoint, cityForZipSourced } from "./point-in-zip";

describe("zipForPoint", () => {
  test("a point inside a known SWFL ZIP resolves to that ZIP", () => {
    // Downtown Fort Myers, inside 33901.
    expect(zipForPoint(26.6406, -81.8723)).toBe("33901");
  });

  test("a point far outside the SWFL footprint resolves to null, never a guess", () => {
    expect(zipForPoint(47.6062, -122.3321)).toBeNull(); // Seattle
  });

  test("a MultiPolygon ZIP resolves for a point in one of its parts", () => {
    // 33956 (Saint James City / Pine Island) — one of the fixture's two declared
    // multipolygon_zips. A Polygon-only implementation returns null here.
    expect(zipForPoint(26.4959, -82.0784)).toBe("33956");
  });

  test("non-finite coordinates resolve to null, never throw", () => {
    expect(zipForPoint(Number.NaN, -81.8)).toBeNull();
    expect(zipForPoint(26.6, Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("lat/lon are not silently swapped — the mirrored point is not in SWFL", () => {
    // GeoJSON stores [lon, lat]; a transposed implementation would still 'work' on
    // some inputs. Passing (lat=-81.87, lon=26.64) is off Africa: it must be null.
    expect(zipForPoint(-81.8723, 26.6406)).toBeNull();
  });
});

describe("cityForZipSourced", () => {
  test("F5 — 33919 resolves to Fort Myers, NOT the county anchor Cape Coral", () => {
    // This is the whole reason the function exists: scopeCity() maps
    // ZIP -> county -> the county's ANCHOR city, so 33919 comes back "Cape Coral".
    expect(cityForZipSourced("33919")).toBe("Fort Myers");
  });

  test("a primary zip resolves from the crosswalk", () => {
    expect(cityForZipSourced("34145")).toBe("Marco Island");
  });

  test("an out-of-scope ZIP resolves to null", () => {
    expect(cityForZipSourced("90210")).toBeNull();
  });

  test("whitespace is tolerated", () => {
    expect(cityForZipSourced(" 33919 ")).toBe("Fort Myers");
  });
});
