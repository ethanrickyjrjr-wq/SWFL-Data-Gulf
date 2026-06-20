import { describe, it, expect } from "bun:test";
import { evaluateChange, parseNumeric } from "./change-evaluator";
import type { SignificanceRegistry } from "./types";

const registry: SignificanceRegistry = {
  _default: { threshold_type: "percent_change", threshold: 99999, impact_weight: 1 },
  mortgage_rate: {
    threshold_type: "absolute_change",
    threshold: 0.25,
    impact_weight: 10,
    unit: "percentage points",
  },
  mortgage_rate_bps: {
    threshold_type: "absolute_change",
    threshold: 0.25,
    impact_weight: 10,
    unit: "basis points",
  },
  listing_count: {
    threshold_type: "percent_change",
    threshold: 12.0,
    impact_weight: 5,
  },
  listing_status: {
    threshold_type: "state_change",
    monitored_transitions: ["active→pending", "pending→sold"],
    impact_weight: 9,
  },
  freshness_mortgage_30yr_fixed_pct: {
    threshold_type: "absolute_change",
    threshold: 0.25,
    impact_weight: 10,
    unit: "percentage points",
    category: "mortgage_rate",
  },
};

describe("parseNumeric", () => {
  it("parses plain numbers", () => {
    expect(parseNumeric("312")).toBe(312);
    expect(parseNumeric("-3.5")).toBe(-3.5);
  });

  it("strips dollar signs and commas", () => {
    expect(parseNumeric("$1,750")).toBe(1750);
    expect(parseNumeric("$14,293")).toBe(14293);
  });

  it("strips trailing percent", () => {
    expect(parseNumeric("5.25%")).toBe(5.25);
    expect(parseNumeric("-3.5%")).toBe(-3.5);
  });

  it("strips YoY suffix", () => {
    expect(parseNumeric("-3.5% YoY")).toBe(-3.5);
    expect(parseNumeric("4.2% YoY")).toBe(4.2);
  });

  it("returns null for unparseable strings", () => {
    expect(parseNumeric("active")).toBeNull();
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("N/A")).toBeNull();
  });
});

describe("evaluateChange — below threshold", () => {
  it("returns null when delta is below threshold (absolute)", () => {
    const result = evaluateChange("mortgage_rate", "i1", "30yr rate", "5.25%", "5.40%", registry);
    expect(result).toBeNull(); // delta=0.15, threshold=0.25
  });

  it("returns null when percent change is below threshold", () => {
    const result = evaluateChange("listing_count", "i1", "Active listings", "312", "330", registry);
    expect(result).toBeNull(); // 5.8% change, threshold=12%
  });

  it("returns null for unregistered slug (silenced by _default)", () => {
    const result = evaluateChange("unknown_slug", "i1", "Some metric", "100", "200", registry);
    expect(result).toBeNull(); // _default threshold=99999
  });
});

describe("evaluateChange — absolute_change", () => {
  it("fires when delta exceeds threshold", () => {
    const result = evaluateChange("mortgage_rate", "i1", "30yr fixed rate", "5.25%", "5.75%", registry);
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("mortgage_rate");
    expect(result!.signal_strength).toBe(2.0); // 0.5 / 0.25
    expect(result!.impact_weight).toBe(10);
    expect(result!.priority).toBe(20);
  });

  it("produces correct delta_description for rise", () => {
    const result = evaluateChange("mortgage_rate", "i1", "30yr fixed rate", "5.25%", "5.75%", registry);
    expect(result!.delta_description).toBe("rose 0.50 percentage points");
  });

  it("produces correct delta_description for drop", () => {
    const result = evaluateChange("mortgage_rate", "i1", "30yr fixed rate", "5.75%", "5.25%", registry);
    expect(result!.delta_description).toBe("dropped 0.50 percentage points");
  });

  it("uses basis points unit when specified", () => {
    const result = evaluateChange("mortgage_rate_bps", "i1", "Rate", "5.25%", "5.75%", registry);
    expect(result!.delta_description).toBe("rose 50bps");
  });

  it("fires at exactly threshold (signal_strength = 1.0)", () => {
    const result = evaluateChange("mortgage_rate", "i1", "Rate", "5.00%", "5.25%", registry);
    expect(result).not.toBeNull();
    expect(result!.signal_strength).toBeCloseTo(1.0);
  });
});

describe("evaluateChange — percent_change", () => {
  it("fires when relative change exceeds threshold", () => {
    const result = evaluateChange("listing_count", "i1", "Active listings", "312", "256", registry);
    expect(result).not.toBeNull();
    // (256-312)/312 * 100 = -17.9%, threshold=12% → signal_strength ≈ 1.49
    expect(result!.signal_strength).toBeGreaterThan(1.0);
    expect(result!.delta_description).toBe("dropped 17.9%");
  });

  it("fires on upward move", () => {
    const result = evaluateChange("listing_count", "i1", "Active listings", "300", "360", registry);
    expect(result).not.toBeNull(); // +20%, threshold=12%
    expect(result!.delta_description).toBe("rose 20.0%");
  });

  it("returns null when prev is zero (avoid division by zero)", () => {
    const result = evaluateChange("listing_count", "i1", "Listings", "0", "100", registry);
    expect(result).toBeNull();
  });

  it("handles formatted dollar values", () => {
    // $1,000 → $1,200 = 20% change, threshold=12%
    const result = evaluateChange("listing_count", "i1", "Metric", "$1,000", "$1,200", registry);
    expect(result).not.toBeNull();
    expect(result!.delta_description).toBe("rose 20.0%");
  });
});

describe("evaluateChange — state_change", () => {
  it("fires on monitored transition", () => {
    const result = evaluateChange(
      "listing_status",
      "i1",
      "Listing status",
      "active",
      "pending",
      registry,
    );
    expect(result).not.toBeNull();
    expect(result!.signal_strength).toBe(1.0);
    expect(result!.delta_description).toBe("changed from active to pending");
    expect(result!.priority).toBe(9);
  });

  it("returns null for unmonitored transition", () => {
    const result = evaluateChange(
      "listing_status",
      "i1",
      "Listing status",
      "pending",
      "back_to_active",
      registry,
    );
    expect(result).toBeNull(); // "pending→back_to_active" not in monitored list
  });
});

describe("evaluateChange — Gate 1 A3: kind mismatch", () => {
  it("returns null when filed value is percent but current is plain numeric", () => {
    // "5.2% YoY" vs "5.2" → same number, different series → must be silent
    const result = evaluateChange("mortgage_rate", "i1", "Rate", "6.8%", "7300", registry);
    expect(result).toBeNull();
  });

  it("returns null when filed value is dollar but current is percent", () => {
    const result = evaluateChange("listing_count", "i1", "Price", "$350,000", "15%", registry);
    expect(result).toBeNull();
  });

  it("fires when both values are percent (same kind)", () => {
    const result = evaluateChange("mortgage_rate", "i1", "Rate", "5.25%", "5.75%", registry);
    expect(result).not.toBeNull();
  });

  it("fires when both values are plain numeric (same kind)", () => {
    // fed_funds_rate not in registry → _default (threshold 99999, never fires)
    // Use listing_count with plain numbers
    const result = evaluateChange("listing_count", "i1", "Listings", "312", "256", registry);
    expect(result).not.toBeNull(); // 17.9% drop > 12% threshold, both numeric kind
  });
});

describe("evaluateChange — edge cases", () => {
  it("returns null when values cannot be parsed as numbers", () => {
    const result = evaluateChange("mortgage_rate", "i1", "Rate", "n/a", "5.75%", registry);
    expect(result).toBeNull();
  });

  it("returns null when no entry and no _default", () => {
    const emptyRegistry: SignificanceRegistry = {};
    const result = evaluateChange("mortgage_rate", "i1", "Rate", "5.25%", "5.75%", emptyRegistry);
    expect(result).toBeNull();
  });
});

describe("evaluateChange — C2: deterministic consequence", () => {
  it("attaches a per-$100K payment delta for a 30-yr mortgage rate rise", () => {
    const result = evaluateChange(
      "freshness_mortgage_30yr_fixed_pct",
      "i1",
      "30-yr fixed",
      "6.8%",
      "7.3%",
      registry,
    );
    expect(result).not.toBeNull();
    // Deterministic, no invented inputs: a rate RISE → a POSITIVE monthly delta.
    expect(result!.consequence).toMatch(/^≈ \+\$\d+\/mo per \$100K financed \(30-yr fixed\)$/);
  });

  it("uses a minus sign when the rate drops", () => {
    const result = evaluateChange(
      "freshness_mortgage_30yr_fixed_pct",
      "i1",
      "30-yr fixed",
      "7.3%",
      "6.8%",
      registry,
    );
    expect(result!.consequence).toMatch(/^≈ −\$\d+\/mo per \$100K financed/);
  });

  it("leaves consequence undefined for non-mortgage slugs (never invents one)", () => {
    const mortgageish = evaluateChange("mortgage_rate", "i1", "Rate", "5.25%", "5.75%", registry);
    expect(mortgageish).not.toBeNull();
    expect(mortgageish!.consequence).toBeUndefined();

    const listings = evaluateChange("listing_count", "i1", "Listings", "312", "256", registry);
    expect(listings!.consequence).toBeUndefined();
  });
});
