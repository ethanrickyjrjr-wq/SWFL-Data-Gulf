import { describe, expect, it } from "bun:test";
import { withCommas } from "./format-number";

// A CHARACTERIZATION TEST, not a spec written after the fact. Eight copies of this function
// existed across the recipes and lib/email on 08/06/2026, in four spellings. Before deleting
// seven of them, every behaviour any copy had is pinned here — so the collapse is provably a
// no-op and not a silent output change on a shipped email.
describe("withCommas — the ONE root (was 8 copies)", () => {
  it("groups thousands", () => {
    expect(withCommas("1234567")).toBe("1,234,567");
    expect(withCommas("999")).toBe("999");
    expect(withCommas("1000")).toBe("1,000");
  });

  it("strips currency and existing separators before regrouping", () => {
    expect(withCommas("$1,234,567")).toBe("1,234,567");
    expect(withCommas("$429,900")).toBe("429,900");
  });

  // THE OPEN-SLOT CONTRACT. Every copy returned undefined rather than "" or "0" — a caller
  // renders an honest empty cell instead of a number we do not hold. This is the behaviour
  // the two early-return spellings and the two ternary spellings all shared.
  it("returns undefined when there is no digit to show", () => {
    expect(withCommas(undefined)).toBeUndefined();
    expect(withCommas("")).toBeUndefined();
    expect(withCommas("—")).toBeUndefined();
    expect(withCommas("Call for price")).toBeUndefined();
  });

  // `String(n ?? "")` vs `(n ?? "")` was the only real difference between the spellings, and
  // it only shows on null. The root takes the tolerant form.
  it("tolerates null", () => {
    expect(withCommas(null)).toBeUndefined();
  });

  // A DECIMAL IS NOT PRESERVED — every copy stripped it, so a caller that needs cents must
  // not route through here. Pinned so nobody "fixes" it into a behaviour change.
  it("drops non-digits, including decimals (all 8 copies did)", () => {
    expect(withCommas("1234.56")).toBe("123,456");
    expect(withCommas("3.5")).toBe("35");
  });
});
