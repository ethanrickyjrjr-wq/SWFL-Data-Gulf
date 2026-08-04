// lib/listings/apify-identity.test.ts
//
// THE TWO DEFECTS THIS FILE EXISTS TO STOP — both found live 08/04/2026 by building
// a real comps email and looking at it (_ASSISTANT/2026-08-04-comp-photos-FINDINGS.md).
//
//   1. ZIP-WIDE SAMPLING NEVER JOINS. `resolveCompThumbnails` asked the vendor for 24
//      arbitrary sold homes in ZIP 33908 and tried to key them onto 6 SPECIFIC comp
//      addresses. Live intersection: 0 of 6, every build, by construction.
//   2. `[0]` WITH NO IDENTITY CHECK. The subject lookup passed the subject's address as
//      `location` (which the actor reads as a SEARCH AREA, not a lookup) and accepted
//      record [0] blind. It returned 306 Chattanooga Dr, 33905 for a query on 8348
//      Southwindbay Cir, 33908 — and that wrong house's URL became the hero photo link
//      AND the "Find Out More" CTA in a shipped email.
//
// Both are ONE bug: a vendor AREA SEARCH consumed as an EXACT ADDRESS LOOKUP with no
// verification on the way back. `matchesAddress` is the verification.

import { describe, expect, it } from "bun:test";
import {
  apifyListingUrlIndex,
  matchesAddress,
  pickAddressMatch,
  resolveCompEnrichment,
} from "./apify-identity";
import type { ApifyRecord } from "./apify-comps";

const rec = (street: string, city: string, extra: Partial<ApifyRecord> = {}): ApifyRecord => ({
  street,
  city,
  ...extra,
});

describe("matchesAddress — the identity check that was missing", () => {
  it("REJECTS the live wrong-house record that shipped as the subject's CTA", () => {
    // The exact pair observed 08/04/2026.
    expect(
      matchesAddress(
        rec("306 Chattanooga Dr", "Fort Myers"),
        "8348 Southwindbay Cir",
        "Fort Myers",
      ),
    ).toBe(false);
  });

  it("accepts the same house through punctuation and case drift", () => {
    expect(
      matchesAddress(
        rec("14503 DOLCE VISTA RD", "FORT MYERS"),
        "14503 Dolce Vista Rd",
        "Fort Myers",
      ),
    ).toBe(true);
  });

  it("REJECTS same street number+name in a DIFFERENT city (the Naples/Fort Myers trap)", () => {
    expect(matchesAddress(rec("330 5th St", "Naples"), "330 5th St", "Fort Myers")).toBe(false);
  });

  it("REJECTS a record with no street — an unidentifiable row is never a match", () => {
    expect(matchesAddress(rec("", "Fort Myers"), "8348 Southwindbay Cir", "Fort Myers")).toBe(
      false,
    );
    expect(matchesAddress({ city: "Fort Myers" }, "8348 Southwindbay Cir", "Fort Myers")).toBe(
      false,
    );
  });

  it("REJECTS when the comp address is empty — never match on a blank key", () => {
    expect(matchesAddress(rec("306 Chattanooga Dr", "Fort Myers"), "", "Fort Myers")).toBe(false);
  });
});

describe("pickAddressMatch — replaces the blind [0]", () => {
  it("returns null when the area search brought back only OTHER houses", () => {
    const area = [
      rec("306 Chattanooga Dr", "Fort Myers"),
      rec("12078 Terra Verde Ct", "Fort Myers"),
    ];
    expect(pickAddressMatch(area, "8348 Southwindbay Cir", "Fort Myers")).toBeNull();
  });

  it("finds the one real match buried in an area sample", () => {
    const area = [
      rec("306 Chattanooga Dr", "Fort Myers"),
      rec("8348 Southwindbay Cir", "Fort Myers", { property_url: "https://www.realtor.com/x" }),
      rec("12078 Terra Verde Ct", "Fort Myers"),
    ];
    const hit = pickAddressMatch(area, "8348 Southwindbay Cir", "Fort Myers");
    expect(hit?.property_url).toBe("https://www.realtor.com/x");
  });

  it("returns null on an empty result — an empty actor run is normal, never a throw", () => {
    expect(pickAddressMatch([], "8348 Southwindbay Cir", "Fort Myers")).toBeNull();
  });
});

describe("apifyListingUrlIndex — the comp-row link the lake lane cannot supply", () => {
  // comp-helper.ts:291 sets `sourceUrl: null` on every Lee lake comp (deed data carries
  // no listing page), which is why 0 of 6 rows had a link. The vendor record does carry
  // `property_url`, and it rides in on the SAME call that fetches the photo.
  it("keys property_url by the same compPhotoKey the photo index uses", () => {
    const idx = apifyListingUrlIndex([
      rec("14503 DOLCE VISTA RD", "FORT MYERS", { property_url: "https://www.realtor.com/a" }),
    ]);
    expect(idx.get("14503DOLCEVISTARD@FORTMYERS")).toBe("https://www.realtor.com/a");
  });

  it("drops a non-http property_url — never lets javascript:/data: reach an href", () => {
    const idx = apifyListingUrlIndex([
      rec("1 A St", "Naples", { property_url: "javascript:alert(1)" }),
      rec("2 B St", "Naples", { property_url: "" }),
    ]);
    expect(idx.size).toBe(0);
  });
});

describe("resolveCompEnrichment — cache first, then ONE verified call per house", () => {
  const comps = [
    { addressLine: "14503 DOLCE VISTA RD", city: "FORT MYERS" },
    { addressLine: "16686 WATERS EDGE CT", city: "FORT MYERS" },
  ];

  it("serves a cache hit WITHOUT paying, and keys the cache with listingAddressKey", async () => {
    let paid = 0;
    const seenKeys: string[] = [];
    const out = await resolveCompEnrichment(comps, {
      readCache: async (keys) => {
        seenKeys.push(...keys);
        return new Map([
          [
            "14503 dolce vista rd fort myers",
            {
              address_key: "x",
              raw: {},
              primary_photo: "https://ap.rdcpix.com/a.jpg",
              property_url: "https://www.realtor.com/a",
            },
          ],
        ]) as never;
      },
      fetchOne: async () => {
        paid++;
        return null;
      },
    });
    // The cache is queried with the STORE's key, never compPhotoKey.
    expect(seenKeys).toContain("14503 dolce vista rd fort myers");
    expect(out.get("14503 DOLCE VISTA RD")?.photoUrl).toBe("https://ap.rdcpix.com/a.jpg");
    expect(out.get("14503 DOLCE VISTA RD")?.listingUrl).toBe("https://www.realtor.com/a");
    // Only the UNCACHED house was paid for.
    expect(paid).toBe(1);
  });

  it("pays at most maxPaidLookups — the spend ceiling is real", async () => {
    let paid = 0;
    await resolveCompEnrichment(
      Array.from({ length: 20 }, (_, i) => ({ addressLine: `${i} Main St`, city: "Naples" })),
      {
        readCache: async () => new Map() as never,
        fetchOne: async () => {
          paid++;
          return null;
        },
        maxPaidLookups: 3,
      },
    );
    expect(paid).toBe(3);
  });

  it("degrades to an open slot when the cache THROWS and the paid lane misses", async () => {
    const out = await resolveCompEnrichment(comps, {
      readCache: async () => {
        throw new Error("no creds");
      },
      fetchOne: async () => null,
    });
    expect(out.size).toBe(0); // no photo, no link — never a placeholder, never a throw
  });

  it("never emits a non-http photo or url", async () => {
    const out = await resolveCompEnrichment([comps[0]!], {
      readCache: async () => new Map() as never,
      fetchOne: async () =>
        ({
          street: "14503 DOLCE VISTA RD",
          city: "FORT MYERS",
          primary_photo: "javascript:alert(1)",
          property_url: "notaurl",
          style: "SINGLE_FAMILY",
        }) as ApifyRecord,
    });
    expect(out.get("14503 DOLCE VISTA RD")?.photoUrl).toBeUndefined();
    expect(out.get("14503 DOLCE VISTA RD")?.listingUrl).toBeUndefined();
    expect(out.get("14503 DOLCE VISTA RD")?.style).toBe("SINGLE_FAMILY");
  });
});
