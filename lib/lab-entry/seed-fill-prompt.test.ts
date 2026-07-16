import { describe, expect, it } from "bun:test";
import { seedFillPrompt } from "./seed-fill-prompt";

describe("seedFillPrompt", () => {
  it("address subject names the listing", () => {
    const p = seedFillPrompt(
      { name: "Just Sold", subject: "address" },
      "123 Palm Ave, Fort Myers FL",
    );
    expect(p).toContain("Just Sold");
    expect(p).toContain("123 Palm Ave, Fort Myers FL");
    expect(p).toContain("my listing at");
  });

  it("area subject names the area", () => {
    const p = seedFillPrompt({ name: "Rate Watch", subject: "area" }, "Cape Coral");
    expect(p).toContain("Cape Coral");
    expect(p).toContain("Rate Watch");
  });

  it("no subject builds from brand + region", () => {
    const p = seedFillPrompt({ name: "Welcome", subject: "none" }, null);
    expect(p).toContain("Welcome");
    expect(p.toLowerCase()).toContain("my area");
  });

  it("missing value on a subject-bearing template falls back to the region prompt, never an empty splice", () => {
    const p = seedFillPrompt({ name: "Just Sold", subject: "address" }, "   ");
    expect(p.toLowerCase()).toContain("my area");
    expect(p).not.toContain("my listing at ");
  });

  it("never fabricates figures — instructs sourced fill only", () => {
    for (const p of [
      seedFillPrompt({ name: "Just Sold", subject: "address" }, "123 Palm Ave"),
      seedFillPrompt({ name: "Rate Watch", subject: "area" }, "Cape Coral"),
      seedFillPrompt({ name: "Welcome", subject: "none" }, null),
    ]) {
      expect(p).toContain("real");
    }
  });
});
