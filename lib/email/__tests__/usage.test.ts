/**
 * Unit tests for the pure helpers in lib/email/usage.ts.
 * No DB dependency — these exercise billingPeriod, tierLimit, and the
 * allow/limit math that checkUsageLimit computes.
 */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { billingPeriod, tierLimit, resolveTier } from "../usage.ts";

// ---------------------------------------------------------------------------
// billingPeriod
// ---------------------------------------------------------------------------

describe("billingPeriod", () => {
  test("returns YYYY-MM in UTC", () => {
    assert.equal(billingPeriod(new Date("2026-06-12T14:30:00Z")), "2026-06");
  });

  test("boundary: last instant of a month stays in that month", () => {
    // 2026-06-30T23:59:59.999Z → '2026-06'
    assert.equal(billingPeriod(new Date("2026-06-30T23:59:59.999Z")), "2026-06");
  });

  test("boundary: first instant of next month advances the period", () => {
    // 2026-07-01T00:00:00Z → '2026-07'
    assert.equal(billingPeriod(new Date("2026-07-01T00:00:00Z")), "2026-07");
  });

  test("pads single-digit months", () => {
    assert.equal(billingPeriod(new Date("2026-01-15T00:00:00Z")), "2026-01");
    assert.equal(billingPeriod(new Date("2026-09-01T00:00:00Z")), "2026-09");
  });

  test("year rolls over correctly", () => {
    assert.equal(billingPeriod(new Date("2026-12-31T23:59:59.999Z")), "2026-12");
    assert.equal(billingPeriod(new Date("2027-01-01T00:00:00Z")), "2027-01");
  });
});

// ---------------------------------------------------------------------------
// tierLimit
// ---------------------------------------------------------------------------

describe("tierLimit", () => {
  test("free → 50", () => {
    assert.equal(tierLimit("free"), 50);
  });

  test("starter → 500", () => {
    assert.equal(tierLimit("starter"), 500);
  });

  test("growth → 2000", () => {
    assert.equal(tierLimit("growth"), 2000);
  });

  test("pro → 10000", () => {
    assert.equal(tierLimit("pro"), 10000);
  });

  test("unknown tier falls back to free limit (conservative)", () => {
    assert.equal(tierLimit("enterprise"), 50);
    assert.equal(tierLimit(""), 50);
    assert.equal(tierLimit("STARTER"), 50); // case-sensitive
  });
});

// ---------------------------------------------------------------------------
// allow / deny logic (pure math, no DB)
// The same logic checkUsageLimit uses: allowed = sent < tierLimit(tier)
// ---------------------------------------------------------------------------

describe("allow / deny math", () => {
  function isAllowed(sent: number, tier: string): boolean {
    return sent < tierLimit(tier);
  }

  test("free: 0 sends → allowed", () => {
    assert.equal(isAllowed(0, "free"), true);
  });

  test("free: 49 sends → allowed (one under limit)", () => {
    assert.equal(isAllowed(49, "free"), true);
  });

  test("free: 50 sends → denied (at limit, not under)", () => {
    assert.equal(isAllowed(50, "free"), false);
  });

  test("free: 51 sends → denied (over limit)", () => {
    assert.equal(isAllowed(51, "free"), false);
  });

  test("starter: 499 → allowed, 500 → denied", () => {
    assert.equal(isAllowed(499, "starter"), true);
    assert.equal(isAllowed(500, "starter"), false);
  });

  test("growth: 1999 → allowed, 2000 → denied", () => {
    assert.equal(isAllowed(1999, "growth"), true);
    assert.equal(isAllowed(2000, "growth"), false);
  });

  test("pro: 9999 → allowed, 10000 → denied", () => {
    assert.equal(isAllowed(9999, "pro"), true);
    assert.equal(isAllowed(10000, "pro"), false);
  });
});

// ---------------------------------------------------------------------------
// resolveTier (billing_subscriptions → tier)
// ---------------------------------------------------------------------------

describe("resolveTier (billing_subscriptions → tier)", () => {
  test("no subscription row → free", () => {
    assert.equal(resolveTier(null), "free");
  });
  test("row with null tier → free", () => {
    assert.equal(resolveTier({ tier: null }), "free");
  });
  test("paid row → its tier verbatim (incl. past_due rows — keep-through-dunning)", () => {
    assert.equal(resolveTier({ tier: "growth" }), "growth");
  });
});
