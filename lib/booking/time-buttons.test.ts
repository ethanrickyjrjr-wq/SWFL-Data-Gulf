// lib/booking/time-buttons.test.ts
//
// Failure modes: a roleless button escapes the booking ladder; a time printed in the
// wrong zone books the wrong hour; more buttons than the researched 3–5 reads as a
// wall; a missing fallback strands every reader whose times don't fit. Pattern facts:
// _RESEARCH/email-and-social/2026-08-19-email-time-slot-cta-patterns.md (3–5 stacked
// links, click lands on a confirm page, timezone printed in copy, fallback always).
import { describe, test, expect } from "bun:test";
import { buildTimeSlotButtons } from "./time-buttons";

const SLOTS = [
  "2026-08-25T18:00:00.000Z", // Tue 2:00 PM ET
  "2026-08-26T14:00:00.000Z", // Wed 10:00 AM ET
  "2026-08-27T20:30:00.000Z", // Thu 4:30 PM ET
  "2026-08-28T15:00:00.000Z",
  "2026-08-28T16:00:00.000Z",
  "2026-08-29T17:00:00.000Z",
];
const CAL = "https://cal.com/jane/tour";
const ET = "America/New_York";

describe("buildTimeSlotButtons", () => {
  test("caps at 3 by default, appends exactly one fallback pointing at the bare link", () => {
    const b = buildTimeSlotButtons({ slotStartsISO: SLOTS, bookingUrl: CAL, timeZone: ET });
    expect(b.length).toBe(4);
    const fallback = b[b.length - 1];
    expect(fallback.url).toBe(CAL);
    expect(fallback.label).toBe("See all available times");
  });

  test("every button carries role=booking so the destination ladder owns it", () => {
    for (const btn of buildTimeSlotButtons({
      slotStartsISO: SLOTS,
      bookingUrl: CAL,
      timeZone: ET,
    })) {
      expect(btn.role).toBe("booking");
    }
  });

  test("labels print day, date, and time in the DISPLAY zone with the zone named", () => {
    const [first] = buildTimeSlotButtons({
      slotStartsISO: SLOTS,
      bookingUrl: CAL,
      timeZone: ET,
    });
    expect(first.label).toBe("Tue, Aug 25 · 2:00 PM ET");
  });

  test("slot buttons deep-link (cal.com), fallback does not carry slot params", () => {
    const b = buildTimeSlotButtons({ slotStartsISO: SLOTS, bookingUrl: CAL, timeZone: ET });
    const u = new URL(b[0].url!);
    expect(u.searchParams.get("slot")).toBe(SLOTS[0]);
    expect(new URL(b[b.length - 1].url!).searchParams.has("slot")).toBe(false);
  });

  test("page-fidelity provider: times still PRINT, all buttons carry the bare link", () => {
    const b = buildTimeSlotButtons({
      slotStartsISO: SLOTS.slice(0, 2),
      bookingUrl: "https://calendly.com/jane/30min",
      timeZone: ET,
    });
    expect(b[0].label).toContain("2:00 PM ET");
    expect(b[0].url).toBe("https://calendly.com/jane/30min");
  });

  test("max is clamped to the researched 1..5 band", () => {
    expect(
      buildTimeSlotButtons({ slotStartsISO: SLOTS, bookingUrl: CAL, timeZone: ET, max: 99 }).length,
    ).toBe(5 + 1);
    expect(
      buildTimeSlotButtons({ slotStartsISO: SLOTS, bookingUrl: CAL, timeZone: ET, max: 0 }).length,
    ).toBe(1 + 1);
  });

  test("no slots -> just the fallback button; never an empty section, never a throw", () => {
    const b = buildTimeSlotButtons({ slotStartsISO: [], bookingUrl: CAL, timeZone: ET });
    expect(b.length).toBe(1);
    expect(b[0].url).toBe(CAL);
  });

  test("an invalid slot ISO is skipped, not rendered as 'Invalid Date'", () => {
    const b = buildTimeSlotButtons({
      slotStartsISO: ["garbage", SLOTS[0]],
      bookingUrl: CAL,
      timeZone: ET,
    });
    expect(b.length).toBe(2); // one real slot + fallback
    expect(b[0].label).not.toContain("Invalid");
  });
});
