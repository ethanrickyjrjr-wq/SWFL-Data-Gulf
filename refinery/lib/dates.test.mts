/**
 * Coverage for the date helpers. Focus on the overflow cases that motivate
 * the helpers existing at all — JS's native setUTCMonth() / setUTCFullYear()
 * silently roll forward on month-end and Feb 29 inputs.
 */

import { test } from "bun:test";
import assert from "node:assert/strict";

import {
  isoDate,
  isoTimestamp,
  expiresDate,
  subtractMonthsUtc,
  subtractYearsUtc,
} from "./dates.mts";

// ── isoDate / isoTimestamp / expiresDate (pre-existing helpers) ─────────────

test("isoDate: returns YYYY-MM-DD in UTC", () => {
  assert.equal(isoDate(new Date("2026-05-26T12:34:56Z")), "2026-05-26");
});

test("isoTimestamp: strips milliseconds", () => {
  assert.equal(
    isoTimestamp(new Date("2026-05-26T12:34:56.789Z")),
    "2026-05-26T12:34:56Z",
  );
});

test("expiresDate: adds ttl seconds to a verified date", () => {
  // 86400s = 1 day
  assert.equal(expiresDate("2026-05-26", 86400), "2026-05-27");
});

// ── subtractMonthsUtc — month-end overflow regression ───────────────────────

test("subtractMonthsUtc: Aug 31 minus 6 months snaps to Feb 28 (not Mar 3)", () => {
  // Pre-fix: setUTCMonth() would yield 2026-03-03.
  const d = new Date("2026-08-31T00:00:00.000Z");
  assert.equal(
    subtractMonthsUtc(d, 6).toISOString().slice(0, 10),
    "2026-02-28",
  );
});

test("subtractMonthsUtc: Mar 31 minus 1 month snaps to Feb 28 (non-leap year)", () => {
  // Pre-fix: setUTCMonth() would yield 2025-03-03.
  const d = new Date("2025-03-31T00:00:00.000Z");
  assert.equal(
    subtractMonthsUtc(d, 1).toISOString().slice(0, 10),
    "2025-02-28",
  );
});

test("subtractMonthsUtc: Mar 31 minus 1 month snaps to Feb 29 in a leap year", () => {
  const d = new Date("2024-03-31T00:00:00.000Z");
  assert.equal(
    subtractMonthsUtc(d, 1).toISOString().slice(0, 10),
    "2024-02-29",
  );
});

test("subtractMonthsUtc: Aug 31 minus 12 months stays Aug 31 (same day exists)", () => {
  const d = new Date("2026-08-31T00:00:00.000Z");
  assert.equal(
    subtractMonthsUtc(d, 12).toISOString().slice(0, 10),
    "2025-08-31",
  );
});

test("subtractMonthsUtc: mid-month dates pass through cleanly across year boundary", () => {
  const d = new Date("2026-02-15T00:00:00.000Z");
  assert.equal(
    subtractMonthsUtc(d, 6).toISOString().slice(0, 10),
    "2025-08-15",
  );
});

test("subtractMonthsUtc: 0 months returns same calendar date", () => {
  const d = new Date("2026-05-26T00:00:00.000Z");
  assert.equal(
    subtractMonthsUtc(d, 0).toISOString().slice(0, 10),
    "2026-05-26",
  );
});

// ── subtractYearsUtc — Feb 29 leap year regression ──────────────────────────

test("subtractYearsUtc: Feb 29 2024 minus 1 year snaps to Feb 28 2023", () => {
  // Pre-fix: setUTCFullYear() would yield 2023-03-01.
  const d = new Date("2024-02-29T00:00:00.000Z");
  assert.equal(subtractYearsUtc(d, 1).toISOString().slice(0, 10), "2023-02-28");
});

test("subtractYearsUtc: Feb 29 2024 minus 4 years lands on Feb 29 2020 (leap → leap)", () => {
  const d = new Date("2024-02-29T00:00:00.000Z");
  assert.equal(subtractYearsUtc(d, 4).toISOString().slice(0, 10), "2020-02-29");
});

test("subtractYearsUtc: ordinary dates pass through unchanged", () => {
  const d = new Date("2026-04-30T00:00:00.000Z");
  assert.equal(subtractYearsUtc(d, 1).toISOString().slice(0, 10), "2025-04-30");
});

test("subtractYearsUtc: 0 years returns same calendar date", () => {
  const d = new Date("2024-02-29T00:00:00.000Z");
  assert.equal(subtractYearsUtc(d, 0).toISOString().slice(0, 10), "2024-02-29");
});
