import { test } from "bun:test";
import assert from "node:assert/strict";
import { medianOf, round2, breakdown, summarizeDirection } from "./stats.mts";

test("medianOf: empty → null", () => {
  assert.equal(medianOf([]), null);
});

test("medianOf: odd count → middle value", () => {
  assert.equal(medianOf([3, 1, 2]), 2);
});

test("medianOf: even count → average of two middle values", () => {
  assert.equal(medianOf([1, 2]), 1.5);
});

test("medianOf: single element", () => {
  assert.equal(medianOf([7]), 7);
});

test("round2: truncates to 2 decimal places", () => {
  assert.equal(round2(1.234), "1.23");
});

test("round2: rounds up correctly (EPSILON guard)", () => {
  assert.equal(round2(1.235), "1.24");
});

test("round2: integer input", () => {
  assert.equal(round2(5), "5");
});

test("breakdown: sorts count-descending", () => {
  assert.equal(breakdown({ a: 3, b: 1, c: 2 }), "a (3), c (2), b (1)");
});

test("breakdown: single entry", () => {
  assert.equal(breakdown({ x: 4 }), "x (4)");
});

test("summarizeDirection: empty array → no-data", () => {
  const r = summarizeDirection([]);
  assert.equal(r.status, "no-data");
  assert.equal(r.direction, "stable");
});

test("summarizeDirection: all nulls → no-data", () => {
  assert.equal(summarizeDirection([null, null]).status, "no-data");
});

test("summarizeDirection: clear modal winner", () => {
  const r = summarizeDirection(["rising", "rising", "stable"]);
  assert.equal(r.status, "modal");
  assert.equal(r.direction, "rising");
});

test("summarizeDirection: tie → tied + stable fallback", () => {
  const r = summarizeDirection(["rising", "falling"]);
  assert.equal(r.status, "tied");
  assert.equal(r.direction, "stable");
});
