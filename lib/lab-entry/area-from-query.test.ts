// lib/lab-entry/area-from-query.test.ts
// The /go bar holds a LISTING ADDRESS most of the time; an area-keyed option
// (Listings Digest — operator decree 08/11/2026, the "28 homes in Fort Myers"
// email) needs the CITY sliced out of whatever is typed. Never invents — a
// string we can't parse passes through so the digest's own resolver (or the
// lab's area ask) handles it.
import { describe, expect, test } from "bun:test";
import { areaFromGoQuery } from "./area-from-query";

describe("areaFromGoQuery", () => {
  test("Mapbox-retrieved full address → the city segment", () => {
    expect(areaFromGoQuery("3166 Melbury Drive, Columbus, Ohio 43230, United States")).toBe(
      "Columbus",
    );
  });

  test("hand-typed address with state abbr + ZIP in the city segment", () => {
    expect(areaFromGoQuery("123 Palm Ave, Fort Myers FL 33901")).toBe("Fort Myers");
  });

  test("a bare city passes through", () => {
    expect(areaFromGoQuery("Fort Myers")).toBe("Fort Myers");
  });

  test("a city suggestion (no street number) keeps the city, not the state", () => {
    expect(areaFromGoQuery("Fort Myers, Florida, United States")).toBe("Fort Myers");
  });

  test("a bare ZIP passes through", () => {
    expect(areaFromGoQuery("33904")).toBe("33904");
  });

  test("empty input → empty (heroDestination keeps the placeholder, lab asks)", () => {
    expect(areaFromGoQuery("   ")).toBe("");
  });
});
