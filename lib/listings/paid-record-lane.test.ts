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

  test("status and days on market STILL never fill from a cached row", async () => {
    const f = facts();
    await fillFromPaidRecord(f, {
      readCache: reader(
        row({
          list_price: 899000,
          status: "FOR_SALE",
          fetched_at: new Date().toISOString(),
          days_on_mls: 12,
        } as Partial<StoredApifyRecord>),
      ),
    });
    expect(f.daysOnMarket).toBeUndefined();
  });
});

// ── THE ASK (amended 08/18/2026) ──────────────────────────────────────────────
// The old contract ("price NEVER fills from a cached row") shipped the operator an
// email with an HOA fee and NO PRICE AT ALL, while the $689,000 ask sat unread in the
// same row. The new contract: gap-only, vendor still says for-sale, row fetched within
// PRICE_MAX_AGE_DAYS. Each test is the failure mode that would un-earn the gate.
describe("the ask, through the freshness gate", () => {
  const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const askRow = (over: Partial<StoredApifyRecord> = {}) =>
    row({ list_price: 689000, status: "FOR_SALE", fetched_at: days(2), ...over });

  test("a fresh for-sale ask fills, formatted like the spine's ($X,XXX)", async () => {
    const f = facts();
    const fill = await fillFromPaidRecord(f, { readCache: reader(askRow()) });
    expect(f.price).toBe("$689,000");
    expect(fill.price).toBe(true);
  });

  test("FAILURE: a stale ask presented as today's — beyond 14 days the slot stays OPEN", async () => {
    const f = facts();
    const fill = await fillFromPaidRecord(f, {
      readCache: reader(askRow({ fetched_at: days(21) })),
    });
    expect(f.price).toBeUndefined();
    expect(fill.price).toBe(false);
  });

  test("FAILURE: a sold/pending row's price presented as an ask", async () => {
    for (const status of ["SOLD", "PENDING", "sold", "off_market"]) {
      const f = facts();
      await fillFromPaidRecord(f, { readCache: reader(askRow({ status })) });
      expect(f.price, `status=${status} must not serve an ask`).toBeUndefined();
    }
  });

  test("the vendor's casing is not a market state — 'for_sale' and 'FOR_SALE' both serve", async () => {
    for (const status of ["for_sale", "FOR_SALE", " For_Sale "]) {
      const f = facts();
      await fillFromPaidRecord(f, { readCache: reader(askRow({ status })) });
      expect(f.price, `status=${status} must serve`).toBe("$689,000");
    }
  });

  test("FAILURE: the cached ask clobbers the live spine's — gap-only, the live record wins", async () => {
    const f = facts({ price: "$700,000" });
    const fill = await fillFromPaidRecord(f, { readCache: reader(askRow()) });
    expect(f.price).toBe("$700,000");
    expect(fill.price).toBe(false);
  });

  test("property type fills from row.style — the vendor's ACTUAL key, probed 08/18/2026", async () => {
    // The blob has NO `property_type` key; the fresh lane's read of it was dead from
    // day one. `style` (promoted column) is the real home; raw stays as a fallback.
    const f = facts();
    const fill = await fillFromPaidRecord(f, {
      readCache: reader(askRow({ style: "SINGLE_FAMILY" })),
    });
    expect(f.propertyType).toBe("SINGLE_FAMILY"); // shortType maps it at the render edge
    expect(fill.propertyType).toBe(true);

    const viaRaw = facts();
    await fillFromPaidRecord(viaRaw, {
      readCache: reader(askRow({ raw: { property_type: "condo" } })),
    });
    expect(viaRaw.propertyType).toBe("condo");

    const held = facts({ propertyType: "condo" });
    await fillFromPaidRecord(held, {
      readCache: reader(askRow({ style: "SINGLE_FAMILY" })),
    });
    expect(held.propertyType).toBe("condo"); // gap-only, the live record wins
  });

  test("FAILURE: a 0, absent, or undated price serves anyway", async () => {
    for (const over of [
      { list_price: 0 },
      { list_price: null },
      { fetched_at: null },
      { fetched_at: "not-a-date" },
    ] as Partial<StoredApifyRecord>[]) {
      const f = facts();
      await fillFromPaidRecord(f, { readCache: reader(askRow(over)) });
      expect(f.price, JSON.stringify(over)).toBeUndefined();
    }
  });
});
