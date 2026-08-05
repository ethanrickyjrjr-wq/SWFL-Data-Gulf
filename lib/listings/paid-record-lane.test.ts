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
