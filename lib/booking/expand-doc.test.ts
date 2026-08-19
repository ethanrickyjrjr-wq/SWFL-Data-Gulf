// lib/booking/expand-doc.test.ts
//
// Failure modes: expanding a SECOND CTA into the doc violates §1.8's one-CTA
// rule (the stack must REPLACE the booking button, never sit beside it); a doc
// with no booking button must come back untouched (no phantom section); block
// ids must be fresh and unique or the canvas dedupes/clobbers on save.
import { describe, test, expect } from "bun:test";
import type { EmailDoc } from "@/lib/email/doc/types";
import { expandBookingButtonWithTimes } from "./expand-doc";

const SLOTS = ["2026-08-25T18:00:00.000Z", "2026-08-26T14:00:00.000Z"];
const CAL = "https://cal.com/jane/tour";

const docWith = (blocks: Array<Record<string, unknown>>): EmailDoc =>
  ({ globalStyle: {}, blocks }) as unknown as EmailDoc;

const bookingButton = (over: Record<string, unknown> = {}) => ({
  id: "b-book",
  type: "button",
  props: { label: "Book a time", url: CAL, role: "booking" },
  ...over,
});

describe("expandBookingButtonWithTimes", () => {
  test("replaces the booking button in place with slot buttons + fallback", () => {
    const doc = docWith([
      { id: "b-text", type: "text", props: {} },
      bookingButton(),
      { id: "b-foot", type: "footer", props: {} },
    ]);
    const out = expandBookingButtonWithTimes(doc, {
      slotStartsISO: SLOTS,
      bookingUrl: CAL,
      timeZone: "America/New_York",
    });
    const types = out.blocks.map((b) => b.type);
    expect(types).toEqual(["text", "button", "button", "button", "footer"]);
    const labels = out.blocks
      .filter((b) => b.type === "button")
      .map((b) => (b.props as { label?: string }).label);
    expect(labels[0]).toBe("Tue, Aug 25 · 2:00 PM ET");
    expect(labels[2]).toBe("See all available times");
  });

  test("one CTA stays one CTA: only the FIRST booking button expands; the doc never gains a second stack", () => {
    const doc = docWith([bookingButton(), bookingButton({ id: "b-book2" })]);
    const out = expandBookingButtonWithTimes(doc, {
      slotStartsISO: SLOTS,
      bookingUrl: CAL,
      timeZone: "America/New_York",
    });
    // first expands to 3, second is untouched
    expect(out.blocks.length).toBe(4);
    expect((out.blocks[3].props as { label?: string }).label).toBe("Book a time");
  });

  test("no booking button -> the doc comes back IDENTICAL (same reference)", () => {
    const doc = docWith([{ id: "b-cta", type: "button", props: { role: "primary-cta" } }]);
    expect(
      expandBookingButtonWithTimes(doc, {
        slotStartsISO: SLOTS,
        bookingUrl: CAL,
        timeZone: "America/New_York",
      }),
    ).toBe(doc);
  });

  test("no slots -> doc untouched; the existing single button already IS the fallback", () => {
    const doc = docWith([bookingButton()]);
    expect(
      expandBookingButtonWithTimes(doc, {
        slotStartsISO: [],
        bookingUrl: CAL,
        timeZone: "America/New_York",
      }),
    ).toBe(doc);
  });

  test("every inserted block gets a fresh unique id — never the original's, never duplicates", () => {
    const doc = docWith([bookingButton()]);
    const out = expandBookingButtonWithTimes(doc, {
      slotStartsISO: SLOTS,
      bookingUrl: CAL,
      timeZone: "America/New_York",
    });
    const ids = out.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("b-book");
  });

  test("a user-typed booking button (urlSource:user) is the user's — never expanded", () => {
    const doc = docWith([
      bookingButton({ props: { label: "Book", url: CAL, role: "booking", urlSource: "user" } }),
    ]);
    expect(
      expandBookingButtonWithTimes(doc, {
        slotStartsISO: SLOTS,
        bookingUrl: CAL,
        timeZone: "America/New_York",
      }),
    ).toBe(doc);
  });
});
