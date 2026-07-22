import { test } from "bun:test";
import assert from "node:assert/strict";
import { resolveTracesSampleRate, DEFAULT_TRACES_SAMPLE_RATE } from "./sentry-sampling.ts";

// Each test is named after the failure mode it guards against — a bad sample
// rate silently over- or under-samples traces against the free-tier span budget.

test("failure: env unset falls back to the default", () => {
  assert.equal(resolveTracesSampleRate(undefined, 0.1), 0.1);
});

test("failure: empty / whitespace env falls back to the default", () => {
  assert.equal(resolveTracesSampleRate("", 0.1), 0.1);
  assert.equal(resolveTracesSampleRate("   ", 0.1), 0.1);
});

test("failure: non-numeric env ('abc') falls back rather than sampling NaN", () => {
  assert.equal(resolveTracesSampleRate("abc", 0.1), 0.1);
});

test("failure: env of '0' means OFF, not fall-back to default", () => {
  // A deliberate '0' must disable tracing, not be mistaken for 'unset'.
  assert.equal(resolveTracesSampleRate("0", 0.1), 0);
});

test("parses a valid fractional rate", () => {
  assert.equal(resolveTracesSampleRate("0.25", 0.1), 0.25);
  assert.equal(resolveTracesSampleRate("1", 0.1), 1);
});

test("failure: rate above 1 is clamped to 1 (never over-sample)", () => {
  assert.equal(resolveTracesSampleRate("5", 0.1), 1);
});

test("failure: negative rate is clamped to 0 (never negative)", () => {
  assert.equal(resolveTracesSampleRate("-1", 0.1), 0);
});

test("failure: an out-of-range fallback is itself clamped", () => {
  assert.equal(resolveTracesSampleRate(undefined, 9), 1);
  assert.equal(resolveTracesSampleRate(undefined, -3), 0);
});

test("failure: Infinity / non-finite env falls back", () => {
  assert.equal(resolveTracesSampleRate("Infinity", 0.1), 0.1);
});

test("the shipped default is applied when no fallback is passed", () => {
  assert.equal(resolveTracesSampleRate(undefined), DEFAULT_TRACES_SAMPLE_RATE);
});

test("the shipped default is a low, budget-safe baseline", () => {
  // Errors are captured independently at 100% (sampleRate); this only sizes the
  // secondary tracing feature against the verified 5M-span/mo free-tier budget.
  assert.ok(DEFAULT_TRACES_SAMPLE_RATE > 0 && DEFAULT_TRACES_SAMPLE_RATE <= 0.1);
});
