import { test, expect } from "bun:test";
import { crossCheck } from "./cross-check";
import type { ZipDomMedian } from "../types";

const median: ZipDomMedian = { medianDom: 68, sampleSize: 120, asOf: "07/25/2026" };
const heat = { medianDom: 74, asOf: "06/30/2026" };

test("clear with both sides stated — never a flag", () => {
  const r = crossCheck(median, heat, "33904");
  expect(r.status).toBe("clear");
  expect(r.headline).toContain("68");
  expect(r.headline).toContain("74");
  expect(r.figures.length).toBe(2);
  expect(r.figures.some((f) => f.source === "SWFL Data Gulf")).toBe(true);
  expect(r.figures.some((f) => f.source === "realtor.com")).toBe(true);
});

test("unavailable when our live read is missing", () => {
  expect(crossCheck(null, heat, "33904").status).toBe("unavailable");
});

test("unavailable when the realtor.com side is missing", () => {
  expect(crossCheck(median, null, "33904").status).toBe("unavailable");
});

test("unavailable when our sample is under the shared floor", () => {
  expect(crossCheck({ ...median, sampleSize: 3 }, heat, "33904").status).toBe("unavailable");
});
