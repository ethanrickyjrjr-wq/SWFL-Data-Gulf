import { describe, expect, test } from "bun:test";
import { fetchSoldEvent } from "./steadyapi";

// THE HOLE THIS CLOSES (08/19/2026). A recorded close reached a build through
// `/property-tax-history`, rendered, and was GONE from the next build when the vendor
// didn't return it — because the build path read three numbers out of the body and
// dropped the rest at the `return`. Nothing of ours to fall back on. The lake cannot
// cover it: `lee_comp_sales_v` is month-grain and `/nearby-home-values` carries no sale
// date at all (data-roots T9), so this endpoint is the only day-grain close we can reach.
//
// These tests are OFFLINE by contract — `fetchImpl`, `saveBody` and `readStored` are all
// injected. No paid call, no database, ever, from a test.

const KEY_ENV = "PHOTOS_API";

/** A vendor envelope with one recorded sale in it — the shape live-probed 08/19/2026:
 *  `{meta, body}`, every family under `body.body`, never top-level. */
function envelope(events: Array<Record<string, unknown>>) {
  return { meta: { status: 200, property_id: "6601838911" }, body: { property_history: events } };
}

const SOLD = envelope([
  { date: "2026-07-10", event_name: "Sold", price: 1_350_000 },
  {
    date: "2026-05-27",
    event_name: "Listed",
    price: 1_495_000,
    listing: { list_date: "2026-05-27" },
  },
]);

function okFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const failFetch: typeof fetch = (async () =>
  new Response("nope", { status: 500 })) as unknown as typeof fetch;

function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const prior = process.env[KEY_ENV];
  process.env[KEY_ENV] = "test-key";
  return fn().finally(() => {
    if (prior === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = prior;
  });
}

describe("fetchSoldEvent — the body is kept, and it is the fallback", () => {
  test("a live 200 LANDS the verbatim envelope before anything is parsed out of it", async () => {
    const landed: Array<{ id: string; body: unknown }> = [];
    const ev = await withKey(() =>
      fetchSoldEvent("6601838911", {
        fetchImpl: okFetch(SOLD),
        saveBody: async (id, body) => {
          landed.push({ id, body });
          return true;
        },
      }),
    );
    expect(landed).toHaveLength(1);
    expect(landed[0].id).toBe("6601838911");
    expect(landed[0].body).toEqual(SOLD); // the WHOLE envelope, not the 3 fields we read
    expect(ev?.soldPrice).toBe(1_350_000);
    expect(ev?.provenance).toBe("live");
  });

  test("the caller's street/zip/county ride along so the row can be keyed", async () => {
    let meta: unknown = null;
    await withKey(() =>
      fetchSoldEvent(
        "6601838911",
        {
          fetchImpl: okFetch(SOLD),
          saveBody: async (_id, _body, m) => {
            meta = m;
            return true;
          },
        },
        { street: "1333 Carlene Ave", zip: "33901", county: "Lee" },
      ),
    );
    expect(meta).toEqual({ street: "1333 Carlene Ave", zip: "33901", county: "Lee" });
  });

  test("a FAILED write never breaks the call — the sale still returns", async () => {
    const ev = await withKey(() =>
      fetchSoldEvent("1", {
        fetchImpl: okFetch(SOLD),
        saveBody: async () => {
          throw new Error("connection reset");
        },
      }),
    );
    expect(ev?.soldPrice).toBe(1_350_000);
    expect(ev?.provenance).toBe("live");
  });

  // THE ACTUAL SYMPTOM: the vendor doesn't answer tonight for a house it answered for
  // last week. Before this, the build rendered nothing.
  test("vendor returns nothing -> the STORED body answers, stamped with its capture date", async () => {
    const ev = await withKey(() =>
      fetchSoldEvent("1", {
        fetchImpl: failFetch,
        sleep: async () => {},
        readStored: async () => ({ body: SOLD, fetchedAt: "2026-08-10T04:15:00.000Z" }),
      }),
    );
    expect(ev?.soldPrice).toBe(1_350_000);
    expect(ev?.soldDate).toBe("2026-07-10");
    expect(ev?.provenance).toBe("stored");
    expect(ev?.asOf).toBe("2026-08-10"); // the OBSERVATION date, never today
  });

  test("no API key at all still reaches what we already hold", async () => {
    const prior = process.env[KEY_ENV];
    delete process.env[KEY_ENV];
    try {
      const ev = await fetchSoldEvent("1", {
        readStored: async () => ({ body: SOLD, fetchedAt: "2026-08-10T04:15:00.000Z" }),
      });
      expect(ev?.provenance).toBe("stored");
    } finally {
      if (prior !== undefined) process.env[KEY_ENV] = prior;
    }
  });

  // A live answer is ALWAYS the answer. The stored body is a floor, never an override.
  test("live wins over stored — the store is not consulted on a good response", async () => {
    let consulted = false;
    const fresher = envelope([{ date: "2026-08-15", event_name: "Sold", price: 1_400_000 }]);
    const ev = await withKey(() =>
      fetchSoldEvent("1", {
        fetchImpl: okFetch(fresher),
        saveBody: async () => true,
        readStored: async () => {
          consulted = true;
          return { body: SOLD, fetchedAt: "2026-08-10T04:15:00.000Z" };
        },
      }),
    );
    expect(ev?.soldPrice).toBe(1_400_000);
    expect(consulted).toBe(false);
  });

  // THE RETRACTION GUARD. A 200 that carries no Sold event is the vendor SAYING the
  // property has no recorded sale. Reaching into the store there would resurrect a sale
  // the current source no longer reports — inventing a fact out of an old copy.
  test("a live body with no Sold event returns null — never resurrected from the store", async () => {
    let consulted = false;
    const ev = await withKey(() =>
      fetchSoldEvent("1", {
        fetchImpl: okFetch(
          envelope([{ date: "2026-07-04", event_name: "Listed", price: 749_900 }]),
        ),
        saveBody: async () => true,
        readStored: async () => {
          consulted = true;
          return { body: SOLD, fetchedAt: "2026-08-10T04:15:00.000Z" };
        },
      }),
    );
    expect(ev).toBeNull();
    expect(consulted).toBe(false);
  });

  test("nothing live and nothing stored -> null, exactly as before", async () => {
    const ev = await withKey(() =>
      fetchSoldEvent("1", {
        fetchImpl: failFetch,
        sleep: async () => {},
        readStored: async () => null,
      }),
    );
    expect(ev).toBeNull();
  });

  test("a stored read that throws is a miss, never a crash", async () => {
    const ev = await withKey(() =>
      fetchSoldEvent("1", {
        fetchImpl: failFetch,
        sleep: async () => {},
        readStored: async () => {
          throw new Error("pooler blip");
        },
      }),
    );
    expect(ev).toBeNull();
  });

  test("a live sale is stamped with TODAY as its observation date", async () => {
    const ev = await withKey(() =>
      fetchSoldEvent("1", { fetchImpl: okFetch(SOLD), saveBody: async () => true }),
    );
    expect(ev?.asOf).toBe(new Date().toISOString().slice(0, 10));
    expect(ev?.soldDate).toBe("2026-07-10"); // the SALE date is a different fact
  });
});
