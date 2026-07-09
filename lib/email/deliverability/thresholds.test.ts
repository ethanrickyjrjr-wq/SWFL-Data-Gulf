import { describe, expect, it } from "bun:test";
import { classifyBounceRate, classifyDmarcPolicy, classifySpamRate } from "./thresholds";

// Thresholds verified live via crawl4ai against support.google.com/mail/answer/81126
// (2026-07-08/09): "Keep spam rates reported in Postmaster Tools below 0.10% and
// avoid ever reaching a spam rate of 0.30% or higher." Bounce-rate is NOT a
// Google-published number — 2% is the industry-convention hygiene line the
// spec adopts.
describe("classifySpamRate", () => {
  it("green well under 0.10%", () => {
    expect(classifySpamRate(0)).toBe("green");
    expect(classifySpamRate(0.0005)).toBe("green");
  });
  it("yellow at the 0.10% floor up to just under 0.30%", () => {
    expect(classifySpamRate(0.001)).toBe("yellow");
    expect(classifySpamRate(0.0029)).toBe("yellow");
  });
  it("red at 0.30% and above", () => {
    expect(classifySpamRate(0.003)).toBe("red");
    expect(classifySpamRate(0.01)).toBe("red");
  });
});

describe("classifyBounceRate", () => {
  it("green at or under 2%", () => {
    expect(classifyBounceRate(0)).toBe("green");
    expect(classifyBounceRate(0.02)).toBe("green");
  });
  it("red above 2%", () => {
    expect(classifyBounceRate(0.021)).toBe("red");
    expect(classifyBounceRate(0.1)).toBe("red");
  });
});

describe("classifyDmarcPolicy", () => {
  it("red when absent (null — no record at all)", () => {
    expect(classifyDmarcPolicy(null)).toBe("red");
  });
  it("yellow for p=none (set up but not enforcing)", () => {
    expect(classifyDmarcPolicy("none")).toBe("yellow");
  });
  it("green for p=quarantine or p=reject (enforcing)", () => {
    expect(classifyDmarcPolicy("quarantine")).toBe("green");
    expect(classifyDmarcPolicy("reject")).toBe("green");
  });
});
