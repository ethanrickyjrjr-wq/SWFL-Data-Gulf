import { test, expect } from "bun:test";
import { asOfFromToken, tokenDayKey } from "./as-of";

test("parses a standard freshness token", () => {
  expect(asOfFromToken("SWFL-7421-v5-20260610")).toBe("06/10/2026");
});

test("tokenDayKey returns the sortable YYYYMMDD tail (lexical == chronological)", () => {
  expect(tokenDayKey("SWFL-7421-v5-20260610")).toBe("20260610");
  // A LATER date sorts greater even when the version number is LOWER — the bug a
  // raw whole-token `>` would hit (v10 < v9 lexically). Day-tail compare avoids it.
  expect(tokenDayKey("SWFL-7421-v9-20260701")! > tokenDayKey("SWFL-7421-v10-20260610")!).toBe(true);
  expect(tokenDayKey(null)).toBeNull();
  expect(tokenDayKey("SWFL-no-date")).toBeNull();
  expect(tokenDayKey("SWFL-7421-v1-20261310")).toBeNull(); // impossible month
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
