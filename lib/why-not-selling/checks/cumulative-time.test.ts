import { test, expect } from "bun:test";
import { cumulativeTime } from "./cumulative-time";
import type { SubjectHome } from "../types";

const subject = (dom: number, cdom: number): SubjectHome => ({
  addressKey: "K:33904",
  display: "123 SE 10th Pl",
  zip: "33904",
  city: "Cape Coral",
  county: "Lee",
  listPrice: 400000,
  sqft: 1500,
  domDays: dom,
  domIsFloor: false,
  cdomDays: cdom,
  listedDate: "2026-06-01",
  propertyId: "2",
  status: "for_sale",
});

test("flags a relist hiding 14+ prior days; both numbers in figures", () => {
  const r = cumulativeTime(subject(12, 140), { date: "06/01/2026", daysOffMarket: 21 });
  expect(r.status).toBe("flag");
  expect(r.figures.some((f) => f.value.includes("140"))).toBe(true);
});

test("clear when cumulative ~= current", () => {
  expect(cumulativeTime(subject(60, 60), null).status).toBe("clear");
});

test("unavailable when cdom unknown", () => {
  expect(cumulativeTime(subject(60, null as unknown as number), null).status).toBe("unavailable");
});
