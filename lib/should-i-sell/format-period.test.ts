// lib/should-i-sell/format-period.test.ts
import { expect, test } from "bun:test";
import { monthYearLabel } from "./format-period";

test("MM/DD/YYYY → 'Month YYYY' (rolling-window currency, no bare day)", () => {
  expect(monthYearLabel("03/01/2026")).toBe("March 2026");
  expect(monthYearLabel("06/30/2026")).toBe("June 2026");
  expect(monthYearLabel("12/15/2025")).toBe("December 2025");
});

test("empty / unparseable input → '' (never throws, never a bad label)", () => {
  expect(monthYearLabel("")).toBe("");
  expect(monthYearLabel(null)).toBe("");
  expect(monthYearLabel(undefined)).toBe("");
  expect(monthYearLabel("2026-03-01")).toBe(""); // ISO is not our input form
  expect(monthYearLabel("13/01/2026")).toBe(""); // invalid month
});
