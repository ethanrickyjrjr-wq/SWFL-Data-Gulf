import { describe, expect, it } from "bun:test";
import { safeFill } from "./route";

const FALLBACK = "#2a3942";

// The `?fill=` value is spliced straight into an SVG `fill` attribute, so anything
// that isn't a plain hex or rgb() color must fall back to the neutral default —
// never reach the SVG string. This is the injection guard for the email cutout.
describe("zip-shape safeFill", () => {
  it("accepts #rgb / #rrggbb hex", () => {
    expect(safeFill("#abc")).toBe("#abc");
    expect(safeFill("#2a3942")).toBe("#2a3942");
    expect(safeFill("#D4B370")).toBe("#D4B370");
  });

  it("accepts rgb(r,g,b) — the computeZipGradient output shape", () => {
    expect(safeFill("rgb(51,82,94)")).toBe("rgb(51,82,94)");
    expect(safeFill("rgb(212, 179, 112)")).toBe("rgb(212, 179, 112)");
  });

  it("falls back to the neutral default for null/empty", () => {
    expect(safeFill(null)).toBe(FALLBACK);
    expect(safeFill("")).toBe(FALLBACK);
  });

  it("REJECTS markup / url() / quotes / named colors — never reaches the SVG", () => {
    for (const bad of [
      "<script>alert(1)</script>",
      "url(http://evil.com)",
      "red",
      '#abc" onload="x',
      "rgb(1,2,3);stroke:black",
      "#12",
      "javascript:alert(1)",
    ]) {
      expect(safeFill(bad)).toBe(FALLBACK);
    }
  });
});
