// lib/booking/calcom-slots.test.ts
//
// Failure modes: a missing api-version header silently serves an old response shape;
// a bare-username link has no event to ask about; a vendor outage must degrade to
// "no slots" (plain button), never block a build. Endpoint facts:
// _RESEARCH/competitor-and-strategy/2026-08-19-calcom-api-v2-slots.md (public GET,
// header cal-api-version: 2024-09-04, response { status, data: { "date": [{start}] } }).
import { describe, test, expect } from "bun:test";
import { parseCalLink, fetchCalcomSlots } from "./calcom-slots";

describe("parseCalLink — username + event slug off a pasted cal.com URL", () => {
  test("username/event-slug", () => {
    expect(parseCalLink("https://cal.com/jane/tour")).toEqual({
      username: "jane",
      eventSlug: "tour",
    });
  });
  test("bare username has no event to fetch slots for", () => {
    expect(parseCalLink("https://cal.com/jane")).toEqual({ username: "jane", eventSlug: null });
  });
  test("query params and trailing slash don't leak into segments", () => {
    expect(parseCalLink("https://cal.com/jane/tour/?theme=dark")).toEqual({
      username: "jane",
      eventSlug: "tour",
    });
  });
  test("non-cal.com and garbage return null", () => {
    expect(parseCalLink("https://calendly.com/jane/30min")).toBeNull();
    expect(parseCalLink("nope")).toBeNull();
  });
});

describe("fetchCalcomSlots — public v2 slots, degrade to [] on anything wrong", () => {
  const ok = (body: unknown) =>
    (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))();

  test("happy path: flattens per-day arrays into ordered ISO starts, and sends the pinned header", async () => {
    let captured: { url: string; headers: Record<string, string> } | null = null;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = {
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      };
      return ok({
        status: "success",
        data: {
          "2026-08-25": [
            { start: "2026-08-25T18:00:00.000Z" },
            { start: "2026-08-25T19:00:00.000Z" },
          ],
          "2026-08-26": [{ start: "2026-08-26T14:00:00.000Z" }],
        },
      });
    }) as typeof fetch;

    const slots = await fetchCalcomSlots(
      {
        calLink: "https://cal.com/jane/tour",
        startISO: "2026-08-25",
        endISO: "2026-08-31",
        timeZone: "America/New_York",
      },
      fetchImpl,
    );
    expect(slots).toEqual([
      "2026-08-25T18:00:00.000Z",
      "2026-08-25T19:00:00.000Z",
      "2026-08-26T14:00:00.000Z",
    ]);
    const got = captured!;
    // The version header is load-bearing: without it the API silently serves an
    // OLD response shape (research file, vendor docs verbatim).
    expect(got.headers["cal-api-version"]).toBe("2024-09-04");
    const u = new URL(got.url);
    expect(u.searchParams.get("username")).toBe("jane");
    expect(u.searchParams.get("eventTypeSlug")).toBe("tour");
    expect(u.searchParams.get("timeZone")).toBe("America/New_York");
  });

  test("bare-username link: no event slug -> no fetch, empty result", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return ok({});
    }) as typeof fetch;
    const slots = await fetchCalcomSlots(
      {
        calLink: "https://cal.com/jane",
        startISO: "2026-08-25",
        endISO: "2026-08-31",
        timeZone: "UTC",
      },
      fetchImpl,
    );
    expect(slots).toEqual([]);
    expect(called).toBe(false);
  });

  test("HTTP error, network throw, and malformed body all degrade to []", async () => {
    const cases: (typeof fetch)[] = [
      (async () => new Response("nope", { status: 500 })) as typeof fetch,
      (async () => {
        throw new Error("ECONNRESET");
      }) as typeof fetch,
      (async () => ok({ status: "success", data: "not-an-object" })) as unknown as typeof fetch,
    ];
    for (const fetchImpl of cases) {
      const slots = await fetchCalcomSlots(
        {
          calLink: "https://cal.com/jane/tour",
          startISO: "2026-08-25",
          endISO: "2026-08-31",
          timeZone: "UTC",
        },
        fetchImpl,
      );
      expect(slots).toEqual([]);
    }
  });
});

describe("send-path safety — the vendor call is time-bounded", () => {
  test("the fetch carries an AbortSignal so a hung vendor cannot stall a send", async () => {
    let signal: AbortSignal | null | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal as AbortSignal | null | undefined;
      return new Response(JSON.stringify({ status: "success", data: {} }), { status: 200 });
    }) as typeof fetch;
    await fetchCalcomSlots(
      {
        calLink: "https://cal.com/jane/tour",
        startISO: "2026-08-25",
        endISO: "2026-08-31",
        timeZone: "UTC",
      },
      fetchImpl,
    );
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
