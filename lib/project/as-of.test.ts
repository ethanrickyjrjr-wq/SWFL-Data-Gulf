import { test, expect } from "bun:test";
import { asOfFromToken, asOfFromIso, tokenDayKey, tokenVersion } from "./as-of";

test("tokenVersion extracts the numeric refinery version (for same-day tie-breaks)", () => {
  expect(tokenVersion("SWFL-7421-v5-20260610")).toBe(5);
  expect(tokenVersion("SWFL-7421-v10-20260610")).toBe(10);
  expect(tokenVersion(null)).toBeNull();
  expect(tokenVersion("SWFL-no-version")).toBeNull();
});

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

test("asOfFromIso formats a raw ISO date/timestamp as MM/DD/YYYY — never year-first", () => {
  expect(asOfFromIso("2026-06-03")).toBe("06/03/2026");
  expect(asOfFromIso("2026-06-03T12:00:00Z")).toBe("06/03/2026");
  // The exact backwards-date the operator kept seeing must NOT survive.
  expect(asOfFromIso("2026-06-03")).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
});

test("asOfFromIso → null on null/empty/garbage/impossible month", () => {
  expect(asOfFromIso(null)).toBeNull();
  expect(asOfFromIso(undefined)).toBeNull();
  expect(asOfFromIso("")).toBeNull();
  expect(asOfFromIso("not-a-date")).toBeNull();
  expect(asOfFromIso("2026-13-01")).toBeNull();
});
