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

import { describe, expect, it, test } from "bun:test";
import {
  apifyListingUrlIndex,
  compSaleWindow,
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

describe("resolveCompEnrichment — cache first, then ONE dated ZIP pull", () => {
  // Both dated: the paid lane derives its window from these and buys nothing without one.
  const comps = [
    { addressLine: "14503 DOLCE VISTA RD", city: "FORT MYERS", priceDate: "2026-05-01" },
    { addressLine: "16686 WATERS EDGE CT", city: "FORT MYERS", priceDate: "2026-03-01" },
  ];

  it("serves a cache hit WITHOUT paying, and keys the cache with listingAddressKey", async () => {
    let paid = 0;
    const seenKeys: string[] = [];
    const out = await resolveCompEnrichment(comps, {
      zip: "33908",
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
      fetchZip: async () => {
        paid++;
        return [];
      },
    });
    // The cache is queried with the STORE's key, never compPhotoKey.
    expect(seenKeys).toContain("14503 dolce vista rd fort myers");
    expect(out.get("14503 DOLCE VISTA RD")?.photoUrl).toBe("https://ap.rdcpix.com/a.jpg");
    expect(out.get("14503 DOLCE VISTA RD")?.listingUrl).toBe("https://www.realtor.com/a");
    // ONE pull covers every uncached house — the lane is a dated ZIP pull now, not a
    // per-house lookup, so the call count is 1 whether 1 or 6 houses are missing.
    expect(paid).toBe(1);
  });

  it("20 uncached comps still cost ONE capped call — the spend ceiling is real", async () => {
    // The old lane billed one call PER HOUSE. Twenty comps meant twenty calls, each one
    // an area sample that could not match. Now the ceiling is on RESULTS in a single pull.
    let calls = 0;
    let cap = -1;
    await resolveCompEnrichment(
      Array.from({ length: 20 }, (_, i) => ({
        addressLine: `${i} Main St`,
        city: "Naples",
        priceDate: "2026-04-01",
      })),
      {
        zip: "34102",
        readCache: async () => new Map() as never,
        fetchZip: async (q) => {
          calls++;
          cap = q.maxResults ?? -1;
          return [];
        },
        maxPaidResults: 3,
      },
    );
    expect(calls).toBe(1);
    expect(cap).toBe(3);
  });

  it("degrades to an open slot when the cache THROWS and the paid lane misses", async () => {
    const out = await resolveCompEnrichment(comps, {
      readCache: async () => {
        throw new Error("no creds");
      },
      fetchZip: async () => [],
    });
    expect(out.size).toBe(0); // no photo, no link — never a placeholder, never a throw
  });

  it("never emits a non-http photo or url", async () => {
    const out = await resolveCompEnrichment([comps[0]!], {
      zip: "33908",
      readCache: async () => new Map() as never,
      fetchZip: async () => [
        {
          street: "14503 DOLCE VISTA RD",
          city: "FORT MYERS",
          primary_photo: "javascript:alert(1)",
          property_url: "notaurl",
          style: "SINGLE_FAMILY",
        } as ApifyRecord,
      ],
    });
    expect(out.get("14503 DOLCE VISTA RD")?.photoUrl).toBeUndefined();
    expect(out.get("14503 DOLCE VISTA RD")?.listingUrl).toBeUndefined();
    expect(out.get("14503 DOLCE VISTA RD")?.style).toBe("SINGLE_FAMILY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PHOTO LANE — a DATED ZIP PULL, not a per-address lookup and not a blind sweep.
//
// 08/04/2026. Two things were proven live and both are encoded here:
//   1. Per-address lookup DOES NOT EXIST on this actor. Asking for
//      "14503 DOLCE VISTA RD, FORT MYERS, FL 33908" returned 12078 Terraverde Ct,
//      16820 Sanibel Sunset Ct, 18200 Creekside View Dr, 16299 San Carlos Blvd and
//      12423 McGregor Woods Cir — the same area sample a bare-ZIP sweep returns, with
//      `radius` ignored. Those five rows are still sitting in the record cache as the
//      receipt. Paying ~6 calls per build for guaranteed nulls is what this replaces.
//   2. A ZIP sweep with NO DATE WINDOW can never join. 24 arbitrary sold homes in a ZIP
//      with hundreds of sales intersected our 6 specific comps 0 times, every build.
//
// The only shape that can work: the SAME ZIP, narrowed to the window the comps actually
// sold in, pulled deep enough to contain them. A window we cannot derive means we do NOT
// buy — an unwindowed sweep is the original defect wearing a new function name.
// ─────────────────────────────────────────────────────────────────────────────
describe("compSaleWindow — the window is derived from the comps, never hardcoded", () => {
  test("spans min to max sale date, padded on both ends", () => {
    const w = compSaleWindow(["2026-05-01", "2026-03-01", "2026-04-01"], 30);
    expect(w).not.toBeNull();
    expect(w!.dateFrom).toBe("2026-01-30"); // 03-01 minus 30d
    expect(w!.dateTo).toBe("2026-05-31"); // 05-01 plus 30d
  });

  test("ONE dated comp is enough — the window is just that day, padded", () => {
    const w = compSaleWindow(["2026-04-15"], 10);
    expect(w!.dateFrom).toBe("2026-04-05");
    expect(w!.dateTo).toBe("2026-04-25");
  });

  test("NO dates -> NULL, and null must mean DO NOT BUY", () => {
    // The vendor valuation lane sets priceDate: null on every comp (comp-helper.ts:440
    // — "the vendor dates no sale"). A build on that lane can derive no window, and the
    // correct spend there is ZERO, not a blind sweep of the ZIP.
    expect(compSaleWindow([], 30)).toBeNull();
    expect(compSaleWindow([null, undefined, ""], 30)).toBeNull();
  });

  test("garbage dates are ignored, not turned into a fabricated window", () => {
    expect(compSaleWindow(["not-a-date", "??"], 30)).toBeNull();
    expect(compSaleWindow(["not-a-date", "2026-04-15"], 0)!.dateFrom).toBe("2026-04-15");
  });
});

describe("resolveCompEnrichment — LANE B is a dated ZIP pull", () => {
  const comps = [
    { addressLine: "14503 DOLCE VISTA RD", city: "FORT MYERS", priceDate: "2026-05-01" },
    { addressLine: "16686 WATERS EDGE CT", city: "FORT MYERS", priceDate: "2026-03-01" },
  ];
  const rec = (street: string, extra: Record<string, unknown> = {}) =>
    ({
      street,
      city: "Fort Myers",
      primary_photo: `https://ap.rdcpix.com/${street.replace(/\s/g, "")}.jpg`,
      property_url: `https://www.realtor.com/realestateandhomes-detail/${street.replace(/\s/g, "-")}`,
      ...extra,
    }) as never;

  test("the actor is asked for the ZIP over the comps' OWN window — not a bare sweep", async () => {
    const calls: unknown[] = [];
    await resolveCompEnrichment(comps, {
      zip: "33908",
      readCache: async () => new Map(),
      fetchZip: async (q) => {
        calls.push(q);
        return [];
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      location: "33908",
      listingType: "sold",
      dateFrom: "2026-01-15", // 03-01 padded back 45d
      dateTo: "2026-06-15", // 05-01 padded forward 45d
    });
  });

  test("a returned record JOINS to its comp by address, and brings photo + link", async () => {
    const out = await resolveCompEnrichment(comps, {
      zip: "33908",
      readCache: async () => new Map(),
      fetchZip: async () => [rec("14503 Dolce Vista Rd"), rec("999 Somewhere Else Dr")],
    });
    expect(out.get("14503 DOLCE VISTA RD")?.photoUrl).toContain("rdcpix.com");
    expect(out.get("14503 DOLCE VISTA RD")?.listingUrl).toContain("realtor.com");
    // The house that was not asked for never becomes an answer for one that was.
    expect(out.has("16686 WATERS EDGE CT")).toBe(false);
    expect(out.has("999 Somewhere Else Dr")).toBe(false);
  });

  test("NO DERIVABLE WINDOW -> NOT ONE PAID CALL", async () => {
    // The exact spend the vendor-valuation lane used to make for a guaranteed 0% join.
    const calls: unknown[] = [];
    const out = await resolveCompEnrichment(
      [{ addressLine: "18601 Marco Blvd", city: "Bonita Springs", priceDate: null }],
      {
        zip: "34134",
        readCache: async () => new Map(),
        fetchZip: async (q) => {
          calls.push(q);
          return [];
        },
      },
    );
    expect(calls).toHaveLength(0);
    expect(out.size).toBe(0);
  });

  test("a CACHE HIT is never re-bought — and if the cache covers everything, zero calls", async () => {
    const calls: unknown[] = [];
    const out = await resolveCompEnrichment(comps, {
      zip: "33908",
      readCache: async () =>
        new Map([
          ["14503 dolce vista rd fort myers", rec("14503 Dolce Vista Rd")],
          ["16686 waters edge ct fort myers", rec("16686 Waters Edge Ct")],
        ] as never),
      fetchZip: async (q) => {
        calls.push(q);
        return [];
      },
    });
    expect(out.size).toBe(2);
    expect(calls).toHaveLength(0);
  });

  test("the result ceiling is passed to the vendor — an uncapped pull is a $100 run", async () => {
    let cap = -1;
    await resolveCompEnrichment(comps, {
      zip: "33908",
      maxPaidResults: 150,
      readCache: async () => new Map(),
      fetchZip: async (q) => {
        cap = q.maxResults ?? -1;
        return [];
      },
    });
    expect(cap).toBe(150);
  });

  test("a vendor throw is an open slot, never a build failure", async () => {
    const out = await resolveCompEnrichment(comps, {
      zip: "33908",
      readCache: async () => new Map(),
      fetchZip: async () => {
        throw new Error("actor exited 1");
      },
    });
    expect(out.size).toBe(0);
  });
});
