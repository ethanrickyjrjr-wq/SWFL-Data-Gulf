import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { normalizeEmail, isValidEmail, sanitizeSource } from "../validation.ts";

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  });
  test("non-strings collapse to empty", () => {
    assert.equal(normalizeEmail(undefined), "");
    assert.equal(normalizeEmail(null), "");
    assert.equal(normalizeEmail(42), "");
    assert.equal(normalizeEmail({}), "");
  });
});

describe("isValidEmail", () => {
  test("accepts a normal address", () => {
    assert.equal(isValidEmail("a@b.co"), true);
  });
  test("rejects empty / malformed", () => {
    assert.equal(isValidEmail(""), false);
    assert.equal(isValidEmail("no-at-sign"), false);
    assert.equal(isValidEmail("a@b"), false); // no dot in domain
    assert.equal(isValidEmail("a b@c.com"), false); // whitespace
  });
  test("rejects over 254 chars", () => {
    const long = "a".repeat(250) + "@b.com";
    assert.equal(long.length > 254, true);
    assert.equal(isValidEmail(long), false);
  });
});

describe("sanitizeSource", () => {
  test("passes clean tags through", () => {
    assert.equal(sanitizeSource("landing"), "landing");
    assert.equal(sanitizeSource("r-page:housing-swfl"), "r-page:housing-swfl");
  });
  test("rejects junk to 'unknown'", () => {
    assert.equal(sanitizeSource(123), "unknown");
    assert.equal(sanitizeSource(""), "unknown");
    assert.equal(sanitizeSource("has spaces"), "unknown");
    assert.equal(sanitizeSource("drop;table"), "unknown");
  });
  test("caps length at 64 (over-length collapses to unknown)", () => {
    const over = "a".repeat(65);
    // 65 'a's slice to 64 'a's which is still clean → stays, but verify the slice
    assert.equal(sanitizeSource(over).length, 64);
  });
});
