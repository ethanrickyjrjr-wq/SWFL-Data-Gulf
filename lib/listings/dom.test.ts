// lib/listings/dom.test.ts
import { describe, expect, test } from "bun:test";
import { daysBetweenIso, formatDom, formatSoldSpell, todayIso } from "./dom";

describe("formatDom", () => {
  test("exact spell", () => {
    expect(formatDom({ domDays: 62, isFloor: false })).toBe("62 days on market");
  });
  test("floor renders a plus", () => {
    expect(formatDom({ domDays: 15, isFloor: true })).toBe("15+ days on market");
  });
  test("singular exact day", () => {
    expect(formatDom({ domDays: 1, isFloor: false })).toBe("1 day on market");
  });
  test("zero days", () => {
    expect(formatDom({ domDays: 0, isFloor: false })).toBe("0 days on market");
  });
  test("relist context appended only when cdom - dom >= 14", () => {
    expect(formatDom({ domDays: 12, isFloor: false, cdomDays: 140 })).toBe(
      "12 days on market (relisted — 140 days total)",
    );
    expect(formatDom({ domDays: 12, isFloor: false, cdomDays: 20 })).toBe("12 days on market");
  });
  test("floor never gets relist context (the floor is already fuzzy)", () => {
    expect(formatDom({ domDays: 15, isFloor: true, cdomDays: 200 })).toBe("15+ days on market");
  });
  test("null/negative → null (caller omits the line)", () => {
    expect(formatDom({ domDays: null, isFloor: false })).toBeNull();
    expect(formatDom({ domDays: -3, isFloor: false })).toBeNull();
  });
});

describe("formatSoldSpell", () => {
  test("plural / singular / null", () => {
    expect(formatSoldSpell(79)).toBe("sold in 79 days");
    expect(formatSoldSpell(1)).toBe("sold in 1 day");
    expect(formatSoldSpell(0)).toBe("sold in 0 days");
    expect(formatSoldSpell(null)).toBeNull();
    expect(formatSoldSpell(-1)).toBeNull();
  });
});

describe("daysBetweenIso", () => {
  test("plain dates and datetime prefixes", () => {
    expect(daysBetweenIso("2026-04-02", "2026-06-20")).toBe(79);
    expect(daysBetweenIso("2026-04-02T14:00:00Z", "2026-06-20")).toBe(79);
    expect(daysBetweenIso("2026-06-20", "2026-06-20")).toBe(0);
  });
  test("garbage → null", () => {
    expect(daysBetweenIso(null, "2026-06-20")).toBeNull();
    expect(daysBetweenIso("not-a-date", "2026-06-20")).toBeNull();
  });
});

describe("todayIso", () => {
  test("UTC date of the injected clock", () => {
    expect(todayIso(new Date("2026-07-16T03:00:00Z"))).toBe("2026-07-16");
  });
});
