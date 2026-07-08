import { test, expect } from "bun:test";
import { gatherShowingPrepData } from "./showing-prep-source";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { CompResult, RenderComp } from "@/lib/assistant/comp-helper";
import type { GeocodedAddress } from "@/lib/geo/geocode-address";

const SUBJECT: ListingFacts = {
  address: "16447 Rainbow Meadows Ct, Fort Myers, FL 33908",
  city: "Fort Myers",
  state: "FL",
  zip: "33908",
  price: "$489,000",
  beds: "3",
  baths: "2",
  sqft: "1840",
  photos: ["https://cdn/subject.jpg"],
  sourceUrl: "https://www.swfldatagulf.com",
};

const COMPS: RenderComp[] = [
  {
    addressLine: "101 A St",
    city: "Fort Myers",
    beds: 3,
    baths: 2,
    sqft: 1800,
    status: "sold",
    price: 475000,
    priceKind: "sold",
    priceDate: "2026-06-01",
  },
  {
    addressLine: "202 B St",
    city: "Fort Myers",
    beds: 4,
    baths: 3,
    sqft: 2200,
    status: "for_sale",
    price: 520000,
    priceKind: "last_list",
    priceDate: null,
  },
];

function deps(over: Partial<Parameters<typeof gatherShowingPrepData>[1]> = {}) {
  return {
    geocode: async (t: string): Promise<GeocodedAddress | null> =>
      t.includes("Rainbow")
        ? {
            lat: 26.5,
            lon: -81.9,
            matchedAddress: t,
            zip: "33908",
            county: "Lee",
            countyFips: "12071",
          }
        : {
            lat: 26.51,
            lon: -81.91,
            matchedAddress: t,
            zip: "33908",
            county: "Lee",
            countyFips: "12071",
          },
    resolveSubject: async () => SUBJECT,
    comps: async (): Promise<CompResult> => ({ comps: COMPS, asOf: "07/08/2026", needs: [] }),
    snapshot: async () => null,
    enrichPhoto: async (c: RenderComp) =>
      c.addressLine === "101 A St" ? "https://cdn/comp1.jpg" : null,
    photoEnrichN: 2,
    ...over,
  };
}

test("assembles a full packet from all lanes; never throws", async () => {
  const data = await gatherShowingPrepData(SUBJECT.address!, deps());
  expect(data.subject?.price).toBe("$489,000");
  expect(data.subjectPin).toEqual({ lat: 26.5, lon: -81.9, role: "subject" });
  expect(data.zip).toBe("33908");
  expect(data.comps).toHaveLength(2);
  expect(data.compPins.length).toBe(2); // both comps geocoded
  expect(data.oneSheets).toHaveLength(1); // only comp 1 had a photo
  expect(data.oneSheets[0].photoUrl).toBe("https://cdn/comp1.jpg");
  expect(data.asOf).toBe("07/08/2026");
});

test("degrades to an address-only skeleton on a subject miss (still returns comps)", async () => {
  const data = await gatherShowingPrepData(
    SUBJECT.address!,
    deps({ resolveSubject: async () => null }),
  );
  expect(data.subject).toBeNull();
  expect(data.comps).toHaveLength(2); // comps still gathered
  expect(data.subjectPin).not.toBeNull(); // geocode still gives a subject pin
});

test("degrades to nothing but an address when every lane misses; never throws", async () => {
  const data = await gatherShowingPrepData("nowhere", {
    geocode: async () => null,
    resolveSubject: async () => null,
    comps: async () => ({ comps: [], asOf: "07/08/2026", needs: [] }),
    snapshot: async () => null,
    enrichPhoto: async () => null,
  });
  expect(data.address).toBe("nowhere");
  expect(data.subject).toBeNull();
  expect(data.subjectPin).toBeNull();
  expect(data.comps).toHaveLength(0);
  expect(data.oneSheets).toHaveLength(0);
  expect(data.compPins).toHaveLength(0);
  expect(data.snapshot).toBeNull();
});

test("a thrown lane is swallowed — the packet still builds", async () => {
  const data = await gatherShowingPrepData(
    SUBJECT.address!,
    deps({
      comps: async () => {
        throw new Error("steady down");
      },
      snapshot: async () => {
        throw new Error("brain missing");
      },
    }),
  );
  expect(data.subject?.price).toBe("$489,000"); // other lanes unaffected
  expect(data.comps).toHaveLength(0);
  expect(data.snapshot).toBeNull();
});
