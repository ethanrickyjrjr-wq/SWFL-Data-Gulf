import { describe, it, expect } from "bun:test";
import { formatValue } from "./format";

describe("formatValue", () => {
  it("usd", () => expect(formatValue(495000, "usd")).toBe("$495,000"));
  it("usd decimals round", () => expect(formatValue(16.04, "usd")).toBe("$16.04"));
  it("percent", () => expect(formatValue(4.2, "percent")).toBe("4.2%"));
  it("number", () => expect(formatValue(12071, "number")).toBe("12,071"));
  it("date passes through ISO → MM/DD/YYYY", () =>
    expect(formatValue("2026-05-22", "date")).toBe("05/22/2026"));
  it("text passes through", () =>
    expect(formatValue("Alico Industrial", "text")).toBe("Alico Industrial"));
  it("null → empty string, NEVER a placeholder", () => {
    expect(formatValue(null, "usd")).toBe("");
    expect(formatValue(null, "text")).toBe("");
    expect(formatValue(undefined, "percent")).toBe("");
  });
});
