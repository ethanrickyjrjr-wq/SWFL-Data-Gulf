// app/r/back-on-market/resolve-q.test.ts
import { expect, test } from "bun:test";
import { resolveQToZip } from "./page";

// The injected geocoder returns a raw GeocodeResult ({ lat, lon, zip, place }) — the
// real geocodeAddress derives county itself. A bare ZIP short-circuits before geocoding.

test("a bare 5-digit query is used as the ZIP directly (no geocode call)", async () => {
  const r = await resolveQToZip("33904", { geocode: async () => null });
  expect(r).toEqual({ zip: "33904", place: undefined });
});

test("an address is geocoded to its ZIP", async () => {
  const r = await resolveQToZip("326 Shore Dr, Fort Myers", {
    geocode: async () =>
      ({ lat: 26.64, lon: -81.87, zip: "33905", place: "326 Shore Dr, Fort Myers, FL" }) as never,
  });
  expect(r?.zip).toBe("33905");
});

test("an empty query resolves to null", async () => {
  const r = await resolveQToZip("", { geocode: async () => null });
  expect(r).toBeNull();
});

test("a geocoder miss (no zip) resolves to null", async () => {
  const r = await resolveQToZip("nowhere at all", { geocode: async () => null });
  expect(r).toBeNull();
});
