import { test, expect } from "bun:test";
import { asOfFromToken } from "./as-of";

test("parses a standard freshness token", () => {
  expect(asOfFromToken("SWFL-7421-v5-20260610")).toBe("06/10/2026");
});

test("null/empty/garbage → null", () => {
  expect(asOfFromToken(null)).toBeNull();
  expect(asOfFromToken(undefined)).toBeNull();
  expect(asOfFromToken("")).toBeNull();
  expect(asOfFromToken("SWFL-no-date")).toBeNull();
});

test("rejects an impossible month", () => {
  expect(asOfFromToken("SWFL-7421-v1-20261310")).toBeNull();
});

test("single-digit day renders with leading zero (MM/DD/YYYY)", () => {
  expect(asOfFromToken("SWFL-7421-v2-20260103")).toBe("01/03/2026");
});
