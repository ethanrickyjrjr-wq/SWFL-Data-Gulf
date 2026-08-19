// lib/booking/offer-times.test.ts
//
// Failure modes: a window that includes TODAY offers a slot the reader opens
// an hour too late (start tomorrow); a vendor outage must yield the untouched
// doc (the single booking button already is the fallback), never a failed send.
import { describe, test, expect } from "bun:test";
import type { EmailDoc } from "@/lib/email/doc/types";
import { offerTimesInDoc } from "./offer-times";

const CAL = "https://cal.com/jane/tour";
const NOW = new Date("2026-08-19T15:00:00.000Z");

const doc = (): EmailDoc =>
  ({
    globalStyle: {},
    blocks: [
      { id: "b-book", type: "button", props: { label: "Book a time", url: CAL, role: "booking" } },
    ],
  }) as unknown as EmailDoc;

const slotsResponse = {
  status: "success",
  data: { "2026-08-25": [{ start: "2026-08-25T18:00:00.000Z" }] },
};

describe("offerTimesInDoc", () => {
  test("fetches a tomorrow→+8d window and expands the booking button", async () => {
    let requested: URL | null = null;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      requested = new URL(String(input));
      return new Response(JSON.stringify(slotsResponse), { status: 200 });
    }) as typeof fetch;

    const out = await offerTimesInDoc(doc(), { bookingUrl: CAL, now: NOW }, fetchImpl);
    const got = requested!;
    expect(got.searchParams.get("start")).toBe("2026-08-20");
    expect(got.searchParams.get("end")).toBe("2026-08-27");
    const buttons = out.blocks.filter((b) => b.type === "button");
    expect(buttons.length).toBe(2); // 1 slot + fallback
    expect((buttons[0].props as { label?: string }).label).toContain("Aug 25");
  });

  test("vendor failure returns the doc untouched — a send never breaks on a nicety", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const d = doc();
    expect(await offerTimesInDoc(d, { bookingUrl: CAL, now: NOW }, fetchImpl)).toBe(d);
  });

  test("non-cal.com booking link: no fetch at all, doc untouched", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    const d = doc();
    const out = await offerTimesInDoc(
      d,
      { bookingUrl: "https://calendly.com/jane/30min", now: NOW },
      fetchImpl,
    );
    expect(out).toBe(d);
    expect(called).toBe(false);
  });
});
