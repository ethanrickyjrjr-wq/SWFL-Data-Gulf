// Each test is named after the FAILURE MODE it stops, not after the function it calls.
// Zero network, zero vendor calls, zero tokens — the cache read is injected.
import { test, expect, describe } from "bun:test";
import { fillFromPaidRecord, servableHoaFee, mergeGallery, NO_FILL } from "./paid-record-lane";
import { listingAddressKey } from "./apify-baths";
import type { StoredApifyRecord } from "./apify-record-store";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const STREET = "326 Shore Dr";
const CITY = "Cape Coral";
const KEY = listingAddressKey(STREET, CITY);

function row(over: Partial<StoredApifyRecord> = {}): StoredApifyRecord {
  return {
    address_key: KEY,
    raw: {},
    description: "A well-kept waterfront home with a southern exposure.",
    alt_photos: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
    baths_total: 2.5,
    hoa_fee: 596,
    ...over,
  };
}

function facts(over: Partial<ListingFacts> = {}): ListingFacts {
  return { address: STREET, city: CITY, photos: [], sourceUrl: "https://example.com", ...over };
}

const reader = (r: StoredApifyRecord | null) => async () =>
  new Map(r ? [[KEY, r]] : []) as Map<string, StoredApifyRecord>;

describe("the paid row we already own", () => {
  test("FAILURE: an HOA fee of 0 renders as '$0/mo' — a fabricated figure", async () => {
    // 7 of 19 non-null values were literally 0, counted live 08/05/2026. A 0 is
    // indistinguishable from a field the vendor never filled.
    expect(servableHoaFee(0)).toBeNull();
    expect(servableHoaFee(-5)).toBeNull();
    expect(servableHoaFee(null)).toBeNull();
    expect(servableHoaFee("596")).toBeNull(); // a string is not a served number
    expect(servableHoaFee(596)).toBe(596);

    const f = facts();
    await fillFromPaidRecord(f, { readCache: reader(row({ hoa_fee: 0 })) });
    expect(f.hoaFee).toBeUndefined(); // OPEN SLOT, never 0
  });

  test("FAILURE: the paid description overwrites the agent's own pasted words", async () => {
    const f = facts({ remarks: "The words the agent typed in himself." });
    const fill = await fillFromPaidRecord(f, { readCache: reader(row()) });
    expect(f.remarks).toBe("The words the agent typed in himself.");
    expect(fill.description).toBe(false);
  });

  test("fills the description only when the cell is genuinely empty", async () => {
    const f = facts();
    const fill = await fillFromPaidRecord(f, { readCache: reader(row()) });
    expect(f.remarks).toBe("A well-kept waterfront home with a southern exposure.");
    expect(fill.description).toBe(true);
  });

  test("FAILURE: the gallery duplicates the hero photo on every build", async () => {
    // The vendor's own alt_photos list LEADS with the primary photo.
    const hero = "https://cdn.example.com/a.jpg";
    expect(mergeGallery([hero], [hero, "https://cdn.example.com/b.jpg"])).toEqual([
      hero,
      "https://cdn.example.com/b.jpg",
    ]);
  });

  test("FAILURE: the gallery displaces the MIRRORED hero and re-exposes us to link rot", async () => {
    const mirrored = "https://our-storage.example.com/hero-photos/abc.webp";
    const f = facts({ photos: [mirrored] });
    await fillFromPaidRecord(f, { readCache: reader(row()) });
    expect(f.photos[0]).toBe(mirrored); // our copy stays first
    expect(f.photos).toHaveLength(3);
  });

  test("FAILURE: a junk URL in the gallery ships as a broken image", async () => {
    expect(mergeGallery([], ["not-a-url", "", "https://cdn.example.com/ok.jpg"])).toEqual([
      "https://cdn.example.com/ok.jpg",
    ]);
  });

  test("fills baths — the only source at all for a Collier listing", async () => {
    const f = facts();
    await fillFromPaidRecord(f, { readCache: reader(row()) });
    expect(f.baths).toBe("2.5");

    const whole = facts();
    await fillFromPaidRecord(whole, { readCache: reader(row({ baths_total: 3 })) });
    expect(whole.baths).toBe("3"); // never "3.0"
  });

  test("FAILURE: a stale cached row overwrites a fact the LIVE record already stated", async () => {
    const f = facts({ baths: "4", remarks: "Live record remarks." });
    const fill = await fillFromPaidRecord(f, { readCache: reader(row()) });
    expect(f.baths).toBe("4");
    expect(f.remarks).toBe("Live record remarks.");
    expect(fill.baths).toBe(false);
  });

  test("FAILURE: a cache miss or a dead connection refuses the build (RULE 0.7)", async () => {
    const miss = facts();
    expect(await fillFromPaidRecord(miss, { readCache: reader(null) })).toEqual(NO_FILL);
    expect(miss.photos).toEqual([]);

    const thrown = facts();
    const boom = async () => {
      throw new Error("connection reset");
    };
    expect(await fillFromPaidRecord(thrown, { readCache: boom as never })).toEqual(NO_FILL);
    expect(thrown.sourceUrl).toBe("https://example.com");
  });

  test("FAILURE: an address with no city builds a wrong cache key and lends another town's facts", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Map();
    }) as never;
    const f = facts({ city: undefined });
    expect(await fillFromPaidRecord(f, { readCache: spy })).toEqual(NO_FILL);
    expect(called).toBe(false); // never guesses a key
  });

  // ── THE REST OF THE LADDER (census 08/05/2026) ─────────────────────────────
  // Live counts over data_lake.listing_state, 35,202 rows, and the column ceiling
  // read from information_schema. The free spine carries beds 73.7%, sqft 70.6%,
  // lot_acres 78.0% — and NO year_built column AT ALL. The paid row carries
  // year_built on 20 of 26. Without these rungs those cells are permanently open.

  test("FAILURE: year built is on NO free source, so an unfilled paid rung leaves it empty forever", async () => {
    // `information_schema`, 08/05/2026: data_lake.listing_state has no year_built
    // column. This rung is not a nicety — it is the ONLY source we hold.
    const f = facts();
    const fill = await fillFromPaidRecord(f, { readCache: reader(row({ year_built: 2019 })) });
    expect(f.yearBuilt).toBe("2019");
    expect(fill.yearBuilt).toBe(true);
  });

  test("FAILURE: a lot size in SQUARE FEET renders as '8712 ac' — the free lane's unit is ACRES", async () => {
    // resolve-subject.ts writes `${acres} ac`; the paid row stores lot_sqft. Filling
    // one into the other without converting prints a 43,560x wrong number.
    const f = facts();
    await fillFromPaidRecord(f, { readCache: reader(row({ lot_sqft: 8712 })) });
    expect(f.lotSize).toBe("0.2 ac");
  });

  test("FAILURE: beds and square feet stay open on the ~27% of listings the free spine misses", async () => {
    const f = facts();
    const fill = await fillFromPaidRecord(f, { readCache: reader(row({ beds: 3, sqft: 2847 })) });
    expect(f.beds).toBe("3");
    expect(f.sqft).toBe("2847");
    expect(fill.beds).toBe(true);
    expect(fill.sqft).toBe(true);
  });

  test("FAILURE: a new rung overwrites what the LIVE record already stated", async () => {
    const f = facts({ beds: "4", sqft: "3100", lotSize: "0.5 ac", yearBuilt: "2001" });
    const fill = await fillFromPaidRecord(f, {
      readCache: reader(row({ beds: 3, sqft: 2847, lot_sqft: 8712, year_built: 2019 })),
    });
    expect(f.beds).toBe("4");
    expect(f.sqft).toBe("3100");
    expect(f.lotSize).toBe("0.5 ac");
    expect(f.yearBuilt).toBe("2001");
    expect([fill.beds, fill.sqft, fill.lotSize, fill.yearBuilt]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("FAILURE: a 0 or absent spec renders as a real number — NEVER a zero (playbook 1.14)", async () => {
    const f = facts();
    const fill = await fillFromPaidRecord(f, {
      readCache: reader(row({ beds: 0, sqft: 0, lot_sqft: 0, year_built: 0 })),
    });
    expect(f.beds).toBeUndefined();
    expect(f.sqft).toBeUndefined();
    expect(f.lotSize).toBeUndefined();
    expect(f.yearBuilt).toBeUndefined();
    expect([fill.beds, fill.sqft, fill.lotSize, fill.yearBuilt]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("NEVER fills a moving fact — price, status and days on market stay with the live record", async () => {
    const f = facts();
    await fillFromPaidRecord(f, {
      readCache: reader(
        row({
          list_price: 899000,
          status: "FOR_SALE",
          days_on_mls: 12,
        } as Partial<StoredApifyRecord>),
      ),
    });
    expect(f.price).toBeUndefined();
    expect(f.daysOnMarket).toBeUndefined();
  });
});
