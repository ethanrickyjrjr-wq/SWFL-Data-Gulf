import { test } from "bun:test";
import assert from "node:assert/strict";
import { fmtInt, fmtUsd, fmtPct, fmtRatio } from "./number-format.mts";

test("fmtInt adds thousands separators", () => {
  assert.equal(fmtInt(548798), "548,798");
  assert.equal(fmtInt(999), "999");
  assert.equal(fmtInt(0), "0");
});

test("fmtInt rounds non-integers", () => {
  assert.equal(fmtInt(35810.6), "35,811");
});

test("fmtUsd formats whole dollars with a leading sign", () => {
  assert.equal(fmtUsd(425000), "$425,000");
  assert.equal(fmtUsd(1234.5), "$1,235");
});

test("fmtPct always renders exactly 2 decimals, matching the speaker.mts display chokepoint", () => {
  assert.equal(fmtPct(43.2), "43.20%");
  assert.equal(fmtPct(-8.86), "-8.86%");
  assert.equal(fmtPct(36.7), "36.70%");
});

test("fmtRatio renders exactly 1 decimal, no suffix", () => {
  assert.equal(fmtRatio(65.34), "65.3");
  assert.equal(fmtRatio(-0.9), "-0.9");
  assert.equal(fmtRatio(100), "100.0");
});
