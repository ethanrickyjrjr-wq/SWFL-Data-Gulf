// lib/listings/apify-baths.test.ts — the paid baths fallback's guards.
//
// Every test injects `runActor`, so NO test can reach the vendor or spend money.
import { describe, expect, test } from "bun:test";
import { bathsFromRecord, listingAddressKey, fetchApifyBathsByAddress } from "./apify-baths";
import type { ApifyRecord } from "./apify-comps";

const rec = (over: Partial<ApifyRecord> = {}): ApifyRecord => ({
  street: "1442 Byron Rd",
  city: "Fort Myers",
  full_baths: 2,
  half_baths: 0,
  ...over,
});

describe("bathsFromRecord", () => {
  test("full + half/2 — the MLS convention (2 full + 1 half reads 2.5)", () => {
    expect(bathsFromRecord(rec({ full_baths: 2, half_baths: 1 }))).toBe(2.5);
  });

  test("half_baths arriving as a STRING still counts", () => {
    // The vendor types half_baths as `number | string` — a bare Number() on the
    // sentinel would yield NaN and poison the total.
    expect(bathsFromRecord(rec({ full_baths: 3, half_baths: "1" }))).toBe(3.5);
  });

  test("the vendor's <NA> sentinel is not a number — it must never become NaN", () => {
    expect(bathsFromRecord(rec({ full_baths: 2, half_baths: "<NA>" }))).toBe(2);
  });

  test("no full bath count -> null, never a half-bath-only total", () => {
    // A home reported as "0.5 baths" because only half_baths came back would be a
    // fabricated figure, not a partial one.
    expect(
      bathsFromRecord(rec({ full_baths: "<NA>" as unknown as number, half_baths: 1 })),
    ).toBeNull();
    expect(bathsFromRecord(rec({ full_baths: null, half_baths: 1 }))).toBeNull();
  });
});

describe("listingAddressKey", () => {
  test("the CITY is part of the key — one street name in two cities cannot swap counts", () => {
    expect(listingAddressKey("330 5th St", "Naples")).not.toBe(
      listingAddressKey("330 5th St", "Fort Myers"),
    );
  });

  test("punctuation and case do not split a match", () => {
    expect(listingAddressKey("1442 Byron Rd.", "Fort Myers")).toBe(
      listingAddressKey("1442  byron rd", "FORT MYERS"),
    );
  });
});

describe("fetchApifyBathsByAddress", () => {
  test("maps address -> baths for real records", async () => {
    const map = await fetchApifyBathsByAddress("33919", {
      runActor: async () => [rec({ full_baths: 2, half_baths: 1 })],
    });
    expect(map.get(listingAddressKey("1442 Byron Rd", "Fort Myers"))).toBe(2.5);
  });

  test("a non-ZIP location never reaches the vendor — no run, no charge", async () => {
    let called = 0;
    const map = await fetchApifyBathsByAddress("Fort Myers", {
      runActor: async () => {
        called++;
        return [rec()];
      },
    });
    expect(called).toBe(0);
    expect(map.size).toBe(0);
  });

  test("an empty run is NORMAL, not an error — returns an empty Map, never throws", async () => {
    const map = await fetchApifyBathsByAddress("33919", { runActor: async () => [] });
    expect(map.size).toBe(0);
  });

  test("a throwing client degrades to an empty Map so a build is never refused", async () => {
    const map = await fetchApifyBathsByAddress("33919", {
      runActor: async () => {
        throw new Error("429");
      },
    });
    expect(map.size).toBe(0);
  });

  test("a record with no street is dropped, never keyed on an empty address", async () => {
    const map = await fetchApifyBathsByAddress("33919", {
      runActor: async () => [rec({ street: null })],
    });
    expect(map.size).toBe(0);
  });

  test("first writer wins — a later duplicate never overwrites an earlier record", async () => {
    const map = await fetchApifyBathsByAddress("33919", {
      runActor: async () => [
        rec({ full_baths: 2, half_baths: 0 }),
        rec({ full_baths: 9, half_baths: 0 }),
      ],
    });
    expect(map.get(listingAddressKey("1442 Byron Rd", "Fort Myers"))).toBe(2);
  });
});
