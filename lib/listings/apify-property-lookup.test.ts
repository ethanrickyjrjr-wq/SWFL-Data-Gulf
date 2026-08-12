// lib/listings/apify-property-lookup.test.ts
//
// Offline by construction: every test injects runActor/save; no network, no spend.
// The fixture mirrors run MdWKQA4bKzH8uufrO (the live proof, 08/10/2026) — a
// Title-Case summary plus `Raw` as a JSON STRING, which is the shape the vendor
// actually returns.
import { describe, expect, test } from "bun:test";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import {
  cityFromTypedAddress,
  fetchApifyPropertyByAddress,
  fillFactsFromFreshRow,
  normalizeOneApiItem,
  seedFactsLocationFromAddress,
} from "./apify-property-lookup";
import type { ApifyRecord } from "./apify-comps";

const RAW = {
  property_id: "6605137571",
  listing_id: "2999136947",
  status: "for_sale",
  href: "https://www.realtor.com/realestateandhomes-detail/2287-Somerset-Pl_Naples_FL_34120_M66051-37571",
  list_date: "2026-07-31T20:26:32Z",
  list_price: 1420000,
  price_per_sqft: 504,
  last_sold_price: 735000,
  last_sold_date: "2019-04-08",
  details: {
    beds: 4,
    baths: "3",
    sqft: 2815,
    lot_sqft: 23087,
    stories: 1,
    year_built: 2019,
    garage: 3,
    type: "single_family",
    text: "Unrivaled Luxury & Timeless Elegance in LaMorada. Welcome home to this grand luxury estate.",
  },
  hoa_fee: 675,
  tax_history: [
    { tax: 6900, year: 2025, assessment: { building: null, land: null, total: 672180 } },
  ],
  address: {
    line: "2287 Somerset Pl",
    city: "Naples",
    state_code: "FL",
    postal_code: "34120",
    latitude: 26.269345,
    longitude: -81.66515,
  },
  mls: { id: "NAFL", name: "Naples", days_on_mls: null },
  photo_count: 2,
  photos: [
    { href: "https://ap.rdcpix.com/hero.jpg", tags: ["house_view"] },
    { href: "https://ap.rdcpix.com/second.jpg", tags: ["kitchen"] },
  ],
  estimates: {
    current_values: [
      { source: { type: "quantarium" }, estimate: 1416467, isbest_homevalue: true },
      { source: { type: "corelogic" }, estimate: 1388700, isbest_homevalue: false },
    ],
  },
};

const ITEM = {
  Mode: "details/byaddress",
  "Input Given": "2287 Somerset Pl, Naples, FL 34120",
  "Property ID": "6605137571",
  Status: "for_sale",
  Price: 1420000,
  Beds: 4,
  Baths: "3",
  Sqft: 2815,
  "Lot Sqft": 23087,
  "Year Built": 2019,
  "Property Type": "single_family",
  Street: "2287 Somerset Pl",
  City: "Naples",
  State: "FL",
  Zip: "34120",
  "Days on Market": "",
  "List Date": "2026-07-31T20:26:32Z",
  "Listing URL": RAW.href,
  Raw: JSON.stringify(RAW),
};

function bareFacts(over: Partial<ListingFacts> = {}): ListingFacts {
  return {
    address: "2287 Somerset Pl, Naples, FL 34120",
    photos: [],
    sourceUrl: "https://example.com",
    ...over,
  } as ListingFacts;
}

describe("normalizeOneApiItem", () => {
  test("maps the live item shape onto the ApifyRecord field names the paid lane speaks", () => {
    const r = normalizeOneApiItem(ITEM) as unknown as Record<string, unknown>;
    expect(r).not.toBeNull();
    expect(r.street).toBe("2287 Somerset Pl");
    expect(r.city).toBe("Naples");
    expect(r.state).toBe("FL");
    expect(r.zip_code).toBe("34120");
    expect(r.list_price).toBe(1420000);
    expect(r.status).toBe("for_sale");
    expect(r.text).toContain("Unrivaled Luxury");
    expect(r.hoa_fee).toBe(675);
    expect(r.tax).toBe(6900);
    expect(r.assessed_value).toBe(672180);
    expect(r.estimated_value).toBe(1416467); // the isbest_homevalue source, not [0]
    expect(r.primary_photo).toBe("https://ap.rdcpix.com/hero.jpg");
    expect(r.alt_photos).toEqual([
      "https://ap.rdcpix.com/hero.jpg",
      "https://ap.rdcpix.com/second.jpg",
    ]);
    expect(r.property_url).toBe(RAW.href);
    expect(r.parking_garage).toBe(3);
    expect(r.year_built).toBe(2019);
  });

  test("FAILURE: a whole-number bath total must not grow a phantom half bath (and X.5 must keep it)", () => {
    const r = normalizeOneApiItem(ITEM) as unknown as Record<string, unknown>;
    expect(r.full_baths).toBe(3);
    expect(r.half_baths).toBe(0); // 3 stays exactly 3 through full + half/2

    const withHalf = {
      ...ITEM,
      Raw: JSON.stringify({ ...RAW, details: { ...RAW.details, baths: "3.5" } }),
    };
    const h = normalizeOneApiItem(withHalf) as unknown as Record<string, unknown>;
    expect(h.full_baths).toBe(3);
    expect(h.half_baths).toBe(1); // 3 + 1/2 = the vendor's stated 3.5, exactly
  });

  test("Raw as an OBJECT (shape drift) and Raw missing both still map from the summary fields", () => {
    const asObject = { ...ITEM, Raw: RAW as unknown };
    const r = normalizeOneApiItem(asObject) as unknown as Record<string, unknown>;
    expect(r.street).toBe("2287 Somerset Pl");
    expect(r.text).toContain("Unrivaled Luxury");

    const noRaw = { ...ITEM } as Record<string, unknown>;
    delete noRaw.Raw;
    const n = normalizeOneApiItem(noRaw) as unknown as Record<string, unknown>;
    expect(n).not.toBeNull();
    expect(n.street).toBe("2287 Somerset Pl");
    expect(n.list_price).toBe(1420000); // from Price
    expect(n.property_url).toBe(RAW.href); // from "Listing URL"
  });

  test("FAILURE: junk items (error shape, no street) must yield null, never a keyless row", () => {
    expect(normalizeOneApiItem({ error: "not found" })).toBeNull();
    expect(normalizeOneApiItem("a bare string")).toBeNull();
    expect(normalizeOneApiItem(null)).toBeNull();
    expect(normalizeOneApiItem({ ...ITEM, Street: "", Raw: "{}" })).toBeNull();
  });
});

describe("fetchApifyPropertyByAddress", () => {
  test("requests exactly {property_inputs:[address]} and returns the stored-row shape", async () => {
    let seen: unknown = null;
    const row = await fetchApifyPropertyByAddress("2287 Somerset Pl, Naples, FL 34120", {
      runActor: async (input) => {
        seen = input;
        return [ITEM];
      },
    });
    expect(seen).toEqual({ property_inputs: ["2287 Somerset Pl, Naples, FL 34120"] });
    expect(row).not.toBeNull();
    expect(row!.address_key).toBe("2287 somerset pl naples");
    expect(row!.list_price).toBe(1420000);
    expect(row!.description).toContain("Unrivaled Luxury");
  });

  test("saves what we paid for through the injected save seam", async () => {
    const saved: ApifyRecord[][] = [];
    await fetchApifyPropertyByAddress("2287 Somerset Pl, Naples, FL 34120", {
      runActor: async () => [ITEM],
      save: async (records) => {
        saved.push([...records]);
        return records.length;
      },
    });
    expect(saved.length).toBe(1);
    expect((saved[0]![0] as unknown as Record<string, unknown>).street).toBe("2287 Somerset Pl");
  });

  test("FAILURE: a bare city/ZIP must never reach the vendor — it would bill for a stranger's house", async () => {
    let called = 0;
    const run = async () => {
      called++;
      return [ITEM];
    };
    expect(await fetchApifyPropertyByAddress("Naples, FL", { runActor: run })).toBeNull();
    expect(await fetchApifyPropertyByAddress("34120", { runActor: run })).toBeNull();
    expect(await fetchApifyPropertyByAddress("", { runActor: run })).toBeNull();
    expect(await fetchApifyPropertyByAddress(null, { runActor: run })).toBeNull();
    expect(called).toBe(0);
  });

  test("FAILURE: junk items / a thrown runner return null and save nothing (RULE 0.7, never throws)", async () => {
    let saves = 0;
    const save = async () => {
      saves++;
      return 0;
    };
    expect(
      await fetchApifyPropertyByAddress("123 Main St, Columbus, OH", {
        runActor: async () => [{ error: "nope" }],
        save,
      }),
    ).toBeNull();
    expect(
      await fetchApifyPropertyByAddress("123 Main St, Columbus, OH", {
        runActor: async () => {
          throw new Error("vendor down");
        },
        save,
      }),
    ).toBeNull();
    expect(saves).toBe(0);
  });
});

describe("seedFactsLocationFromAddress / cityFromTypedAddress", () => {
  test("derives city for ANY state so the paid-cache key exists (the one-pull-per-address dedupe)", () => {
    expect(cityFromTypedAddress("123 Main St, Columbus, Ohio 43215, United States")).toBe(
      "Columbus",
    );
    expect(cityFromTypedAddress("123 Main St, Columbus, OH 43215")).toBe("Columbus");
    expect(cityFromTypedAddress("123 Main St, Columbus OH 43215")).toBe("Columbus");
    expect(cityFromTypedAddress("123 Main St, Fort Myers, FL 33908")).toBe("Fort Myers");
    expect(cityFromTypedAddress("no commas here")).toBe("");
  });

  test("fills only ABSENT cells, never overwrites a resolved fact", () => {
    const f = bareFacts({ address: "123 Main St, Columbus, OH 43215" });
    seedFactsLocationFromAddress(f);
    expect(f.city).toBe("Columbus");
    expect(f.state).toBe("OH");
    expect(f.zip).toBe("43215");

    const resolved = bareFacts({ city: "Naples", state: "FL", zip: "34120" });
    seedFactsLocationFromAddress(resolved);
    expect(resolved.city).toBe("Naples");
    expect(resolved.zip).toBe("34120");
  });
});

describe("fillFactsFromFreshRow", () => {
  async function freshRow(item: Record<string, unknown> = ITEM) {
    return (await fetchApifyPropertyByAddress("2287 Somerset Pl, Naples, FL 34120", {
      runActor: async () => [item],
    }))!;
  }

  test("fills the full fact set — specs via the ONE gap-fill lane, price/DOM because the row is fresh", async () => {
    const row = await freshRow();
    const f = bareFacts();
    await fillFactsFromFreshRow(f, row);
    expect(f.city).toBe("Naples");
    expect(f.zip).toBe("34120");
    expect(f.price).toBe("$1,420,000");
    expect(f.beds).toBe("4");
    expect(f.baths).toBe("3");
    expect(f.sqft).toBe("2815");
    expect(f.yearBuilt).toBe("2019");
    expect(f.lotSize).toBe("0.53 ac");
    expect(f.hoaFee).toBe(675);
    expect(f.remarks).toContain("Unrivaled Luxury");
    expect(f.photos[0]).toBe("https://ap.rdcpix.com/hero.jpg");
    expect(f.photos.length).toBe(2);
    expect(f.listingUrl).toBe(RAW.href);
    expect(f.propertyType).toBe("single_family");
    expect(f.lat).toBeCloseTo(26.269345);
  });

  test("FAILURE: a SOLD record's old list price must not render as today's ask", async () => {
    const soldRaw = { ...RAW, status: "sold", sold_price: 1380000 };
    const row = await freshRow({ ...ITEM, Status: "sold", Raw: JSON.stringify(soldRaw) });
    const f = bareFacts();
    await fillFactsFromFreshRow(f, row);
    expect(f.price).toBeUndefined(); // open slot, never a stale ask
    expect(f.beds).toBe("4"); // specs still fill — they don't move
    expect(f.remarks).toContain("Unrivaled Luxury");
  });

  test("FAILURE: fresh fill may never overwrite a fact the live/free record already stated", async () => {
    const row = await freshRow();
    const f = bareFacts({ price: "$1,999,999", beds: "5", city: "Naples" });
    await fillFactsFromFreshRow(f, row);
    expect(f.price).toBe("$1,999,999");
    expect(f.beds).toBe("5");
  });

  test("FAILURE: a unit number must never be dropped from the printed address (found live 08/11/2026 — Nashville Apt 173 printed as a bare street)", async () => {
    const raw = { ...RAW, address: { ...RAW.address, unit: "173" } };
    const row = await freshRow({ ...ITEM, Raw: JSON.stringify(raw) });
    const f = bareFacts({ address: "4400 Belmont Park Terrace" });
    await fillFactsFromFreshRow(f, row);
    expect(f.address).toContain("#173");
    expect(f.address).toBe("2287 Somerset Pl #173, Naples, FL, 34120");
  });

  test("no unit on the record — address prints exactly as before, no stray '#'", async () => {
    const row = await freshRow();
    const f = bareFacts({ address: "2287 Somerset Pl" });
    await fillFactsFromFreshRow(f, row);
    expect(f.address).not.toContain("#");
    expect(f.address).toBe("2287 Somerset Pl, Naples, FL, 34120");
  });
});
