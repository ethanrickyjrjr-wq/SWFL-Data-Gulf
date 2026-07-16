import { describe, expect, it } from "bun:test";
import {
  canonicalRealtorUrl,
  normalizeNearbyComp,
  normalizeResult,
  parseSoldEvent,
  fetchNearbyValues,
  fetchPhotoListings,
  fetchSoldEvent,
  type RawNearbyProperty,
} from "./steadyapi";

// Verbatim doc-JSON shape from the approved spec's contracts section
// (docs/superpowers/specs/2026-06-30-steadyapi-comp-helper-design.md).
const NEARBY_PROP: RawNearbyProperty = {
  property_id: "M5493101642",
  listing_id: "2988776655",
  status: "sold",
  list_price: 415000,
  href: "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
  permalink: "1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
  address: { line: "1403 NE 19th Ter", city: "Cape Coral", state_code: "FL", postal_code: "33909" },
  description: { beds: 3, baths: "2.5", sqft: 1850, lot_sqft: 10000 },
  estimates: {
    best: { value: 428000, date: "2026-05-01" },
    all: [{ value: 428000, date: "2026-05-01" }],
  },
};

const NEARBY_BODY = {
  body: {
    statistics: {
      list_price: { min: 300000, max: 900000, avg: 500000, median: 480000 },
      estimated_value: { min: 310000, max: 950000, avg: 520000, median: 495000 },
      status_counts: { for_sale: 10, sold: 12, off_market: 3 },
    },
    properties: [NEARBY_PROP],
  },
};

describe("canonicalRealtorUrl — capture-only permalink canonicalizer", () => {
  it("passes a full realtor.com detail URL through verbatim", () => {
    const u =
      "https://www.realtor.com/realestateandhomes-detail/5604-Creekmore-Dr_Oklahoma-City_OK_73179_M77577-41161";
    expect(canonicalRealtorUrl(u)).toBe(u);
  });

  it("promotes a bare slug to the canonical detail URL", () => {
    expect(canonicalRealtorUrl("765-Geary-St_San-Francisco_CA_94109_M24733-64190")).toBe(
      "https://www.realtor.com/realestateandhomes-detail/765-Geary-St_San-Francisco_CA_94109_M24733-64190",
    );
  });

  it("refuses anything else — no minted URLs", () => {
    expect(canonicalRealtorUrl("")).toBeUndefined();
    expect(canonicalRealtorUrl(undefined)).toBeUndefined();
    expect(canonicalRealtorUrl(42)).toBeUndefined();
    expect(canonicalRealtorUrl("https://example.com/whatever")).toBeUndefined();
    expect(canonicalRealtorUrl("two/segments_M1-2")).toBeUndefined();
    expect(canonicalRealtorUrl("has spaces_M1-2")).toBeUndefined();
  });
});

describe("normalizeNearbyComp — MLS scrub at the boundary (structural, not AI-trust)", () => {
  it("keeps only the comp facts and drops every realtor.com id from the surfaced fields", () => {
    const comp = normalizeNearbyComp(NEARBY_PROP);
    expect(comp).not.toBeNull();
    expect(comp!.addressLine).toBe("1403 NE 19th Ter");
    expect(comp!.city).toBe("Cape Coral");
    expect(comp!.zip).toBe("33909");
    expect(comp!.beds).toBe(3);
    expect(comp!.baths).toBe(2.5); // parsed from the "2.5" string
    expect(comp!.sqft).toBe(1850);
    expect(comp!.status).toBe("sold");
    expect(comp!.listPrice).toBe(415000);
    expect(comp!.estimateValue).toBe(428000);
    expect(comp!.estimateDate).toBe("2026-05-01");

    // Structural scrub: ids stay dropped. `sourceUrl` is the ONE realtor.com-bearing
    // field (the captured permalink — functional link, operator unlock 07/11/2026),
    // so the no-id JSON sweep runs on the comp WITHOUT it.
    expect(comp as Record<string, unknown>).not.toHaveProperty("permalink");
    expect(comp as Record<string, unknown>).not.toHaveProperty("href");
    expect(comp as Record<string, unknown>).not.toHaveProperty("listing_id");
    expect(comp as Record<string, unknown>).not.toHaveProperty("source");
    const { sourceUrl: _link, ...scrubbed } = comp! as Record<string, unknown>;
    const asJson = JSON.stringify(scrubbed);
    expect(asJson).not.toContain("M54931-01642"); // the permalink M-code
    expect(asJson).not.toContain("realtor.com"); // the href host
    expect(asJson).not.toContain("2988776655"); // the listing_id
  });

  it("carries the captured permalink as sourceUrl, canonicalized", () => {
    const comp = normalizeNearbyComp(NEARBY_PROP);
    expect(comp!.sourceUrl).toBe(
      "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
    );
  });

  it("sourceUrl is null when the response has no permalink", () => {
    const comp = normalizeNearbyComp({
      property_id: "999",
      address: { line: "424 28th St" },
    });
    expect(comp?.sourceUrl).toBeNull();
  });

  it("carries the internal propertyId for the +1 sold-event lookup (never rendered)", () => {
    const comp = normalizeNearbyComp(NEARBY_PROP);
    expect(comp!.propertyId).toBe("M5493101642");
  });

  it("returns null for a property with no usable address", () => {
    expect(normalizeNearbyComp({} as RawNearbyProperty)).toBeNull();
  });
});

describe("normalizeResult permalink capture (search lane)", () => {
  const base = {
    property_id: "1234567890",
    price: { amount: 500000 },
    photo_url: "https://cdn.example.com/p.jpg",
  };

  it("carries a slug permalink as the canonical listingUrl", () => {
    const l = normalizeResult(
      { ...base, permalink: "1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642" },
      "Cape Coral",
      "FL",
    );
    expect(l?.listingUrl).toBe(
      "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
    );
  });

  it("leaves listingUrl unset when there is no usable permalink", () => {
    const l = normalizeResult({ ...base, permalink: "" }, "Cape Coral", "FL");
    expect(l?.listingUrl).toBeUndefined();
  });
});

describe("parseSoldEvent — latest Sold event from property_history", () => {
  it("returns the most-recent Sold price + date", () => {
    const body = {
      body: {
        property_history: [
          { date: "2020-03-15", event_name: "Listed", price: 250000 },
          { date: "2026-05-12", event_name: "Sold", price: 415000, source_name: "MLS" },
          { date: "2019-01-01", event_name: "Sold", price: 190000 }, // older sale — ignored
          { date: "2026-04-01", event_name: "Price Changed", price: 420000 },
        ],
      },
    };
    expect(parseSoldEvent(body)).toEqual({ soldPrice: 415000, soldDate: "2026-05-12" });
  });

  it("returns null when there is no Sold event", () => {
    const body = {
      body: { property_history: [{ date: "2026-04-01", event_name: "Listed", price: 420000 }] },
    };
    expect(parseSoldEvent(body)).toBeNull();
  });

  it("returns null on a missing/empty history", () => {
    expect(parseSoldEvent({ body: {} })).toBeNull();
    expect(parseSoldEvent({})).toBeNull();
    expect(parseSoldEvent(null)).toBeNull();
  });
});

describe("fetchNearbyValues — empty-tolerant, never throws", () => {
  const okFetch = (body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

  it("returns [] when PHOTOS_API is unset (no key → no call)", async () => {
    const prev = process.env.PHOTOS_API;
    delete process.env.PHOTOS_API;
    try {
      let called = 0;
      const out = await fetchNearbyValues(
        { lat: 26.6, lon: -81.9 },
        {
          fetchImpl: (async () => {
            called++;
            return new Response("{}", { status: 200 });
          }) as unknown as typeof fetch,
        },
      );
      expect(out).toEqual([]);
      expect(called).toBe(0);
    } finally {
      if (prev !== undefined) process.env.PHOTOS_API = prev;
    }
  });

  it("normalizes properties on a 200 body", async () => {
    process.env.PHOTOS_API = "test-key";
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9, status: "sold" },
      { fetchImpl: okFetch(NEARBY_BODY) },
    );
    expect(out).toHaveLength(1);
    expect(out[0].addressLine).toBe("1403 NE 19th Ter");
    expect(out[0].propertyId).toBe("M5493101642");
  });

  it("returns [] on a non-200 response", async () => {
    process.env.PHOTOS_API = "test-key";
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9 },
      {
        fetchImpl: (async () => new Response("nope", { status: 429 })) as unknown as typeof fetch,
        sleep: async () => {},
      },
    );
    expect(out).toEqual([]);
  });

  it("returns [] on a malformed body", async () => {
    process.env.PHOTOS_API = "test-key";
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9 },
      { fetchImpl: okFetch({ body: { properties: "not-an-array" } }) },
    );
    expect(out).toEqual([]);
  });
});

describe("bounded retry — a single throttle can no longer zero a user-facing call", () => {
  const seq = (...responses: (Response | Error)[]) => {
    let i = 0;
    const calls = { count: 0 };
    const impl = (async () => {
      calls.count++;
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r instanceof Error) throw r;
      // Response bodies are single-use — clone so a repeated tail entry stays readable.
      return r.clone();
    }) as unknown as typeof fetch;
    return { impl, calls };
  };
  const ok = () => new Response(JSON.stringify(NEARBY_BODY), { status: 200 });
  const noSleep = async () => {};

  it("retries a 429 and succeeds on a later attempt", async () => {
    process.env.PHOTOS_API = "test-key";
    const { impl, calls } = seq(new Response("slow down", { status: 429 }), ok());
    const delays: number[] = [];
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9 },
      {
        fetchImpl: impl,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    expect(out).toHaveLength(1);
    expect(calls.count).toBe(2);
    expect(delays).toHaveLength(1);
    // a throttled retry waits OUT the vendor's 1s retry_after window (429 bodies
    // answer retry_after: 1 — dashboard evidence 07/16/2026) or it can re-collide
    expect(delays[0]).toBeGreaterThanOrEqual(1100);
  });

  it("gives up after 3 attempts on a persistent 429 and reports 'throttled'", async () => {
    process.env.PHOTOS_API = "test-key";
    const { impl, calls } = seq(new Response("slow down", { status: 429 }));
    let degraded: string | null = null;
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9 },
      { fetchImpl: impl, sleep: noSleep, onDegrade: (r) => (degraded = r) },
    );
    expect(out).toEqual([]);
    expect(calls.count).toBe(3);
    expect(degraded).toBe("throttled");
  });

  it("does NOT retry a deterministic 4xx (403 = key/UA problem, not transient)", async () => {
    process.env.PHOTOS_API = "test-key";
    const { impl, calls } = seq(new Response("unauthorized", { status: 403 }));
    let degraded: string | null = null;
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9 },
      { fetchImpl: impl, sleep: noSleep, onDegrade: (r) => (degraded = r) },
    );
    expect(out).toEqual([]);
    expect(calls.count).toBe(1);
    expect(degraded).toBeNull();
  });

  it("retries a thrown network error and succeeds", async () => {
    process.env.PHOTOS_API = "test-key";
    const { impl, calls } = seq(new Error("ECONNRESET"), ok());
    const out = await fetchNearbyValues(
      { lat: 26.6, lon: -81.9 },
      { fetchImpl: impl, sleep: noSleep },
    );
    expect(out).toHaveLength(1);
    expect(calls.count).toBe(2);
  });

  it("fetchSoldEvent gives up on persistent 5xx and reports 'upstream'", async () => {
    process.env.PHOTOS_API = "test-key";
    const { impl, calls } = seq(new Response("boom", { status: 503 }));
    let degraded: string | null = null;
    const out = await fetchSoldEvent("M5493101642", {
      fetchImpl: impl,
      sleep: noSleep,
      onDegrade: (r) => (degraded = r),
    });
    expect(out).toBeNull();
    expect(calls.count).toBe(3);
    expect(degraded).toBe("upstream");
  });

  it("fetchPhotoListings rides the same retry path", async () => {
    process.env.PHOTOS_API = "test-key";
    const search = {
      body: [
        {
          property_id: "1234567890",
          price: { amount: 500000 },
          photo_url: "https://cdn.example.com/p.jpg",
          permalink: "1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
        },
      ],
    };
    const { impl, calls } = seq(
      new Response("slow down", { status: 429 }),
      new Response(JSON.stringify(search), { status: 200 }),
    );
    const out = await fetchPhotoListings(
      { city: "Cape Coral" },
      { fetchImpl: impl, sleep: noSleep },
    );
    expect(out).toHaveLength(1);
    expect(out[0].photoUrl).toBe("https://cdn.example.com/p.jpg");
    expect(calls.count).toBe(2);
  });
});

describe("fetchSoldEvent — empty-tolerant, never throws", () => {
  it("returns null when PHOTOS_API is unset", async () => {
    const prev = process.env.PHOTOS_API;
    delete process.env.PHOTOS_API;
    try {
      const out = await fetchSoldEvent("M5493101642", {
        fetchImpl: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
      });
      expect(out).toBeNull();
    } finally {
      if (prev !== undefined) process.env.PHOTOS_API = prev;
    }
  });

  it("parses a live-shaped Sold history", async () => {
    process.env.PHOTOS_API = "test-key";
    const body = {
      body: { property_history: [{ date: "2026-05-12", event_name: "Sold", price: 415000 }] },
    };
    const out = await fetchSoldEvent("M5493101642", {
      fetchImpl: (async () =>
        new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch,
    });
    expect(out).toEqual({ soldPrice: 415000, soldDate: "2026-05-12" });
  });
});
