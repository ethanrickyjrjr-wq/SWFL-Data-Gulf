import { describe, test, expect } from "bun:test";
import { addressKey } from "./address-key";

describe("addressKey", () => {
  test("relist under a different id collapses to the same key (short vs long suffix)", () => {
    expect(addressKey("11145 2nd Ave", "33971")).toBe(addressKey("11145 2nd Avenue", "33971"));
  });

  test("case and punctuation insensitive", () => {
    expect(addressKey("14150 OSTROM AVE.", "33971")).toBe(addressKey("14150 ostrom ave", "33971"));
  });

  test("unit is part of condo identity", () => {
    const a = addressKey("3006 Caring Way Unit 301", "33990");
    const b = addressKey("3006 Caring Way Unit 414", "33990");
    expect(a).not.toBe(b);
    expect(a).toContain("UNIT301");
  });

  test("same street different zip is distinct", () => {
    expect(addressKey("100 Main St", "33901")).not.toBe(addressKey("100 Main St", "33902"));
  });

  test("zip normalized to five digits", () => {
    expect(addressKey("100 Main St", "33901-1234")).toBe(addressKey("100 Main St", "33901"));
  });

  test("empty inputs are deterministic, not a crash", () => {
    expect(addressKey("", "")).toBe(addressKey("", ""));
  });

  test("directional long and short forms collapse", () => {
    expect(addressKey("1403 Northeast 19th Ter", "33909")).toBe(
      addressKey("1403 NE 19th Ter", "33909"),
    );
    expect(addressKey("100 Southwest 5th St", "33991")).toBe(addressKey("100 SW 5th St", "33991"));
    expect(addressKey("200 North Cleveland Ave", "33901")).toBe(
      addressKey("200 N Cleveland Ave", "33901"),
    );
  });

  test("directional quadrants never merge", () => {
    const z = "33990";
    const quads = new Set(["SE", "SW", "NE", "NW"].map((d) => addressKey(`123 ${d} 1st St`, z)));
    expect(quads.size).toBe(4);
    expect(addressKey("123 Southeast 1st St", z)).toBe(addressKey("123 SE 1st St", z));
    expect(addressKey("123 Southeast 1st St", z)).not.toBe(addressKey("123 SW 1st St", z));
  });

  test("suffix long and short forms collapse", () => {
    expect(addressKey("100 Pelican Cove", "34104")).toBe(addressKey("100 Pelican Cv", "34104"));
    expect(addressKey("200 Sunset Point", "33957")).toBe(addressKey("200 Sunset Pt", "33957"));
  });

  test("ordinal street collapses regardless of spacing or suffix form", () => {
    const z = "33901";
    const keys = new Set([
      addressKey("700 4th street", z),
      addressKey("700 4th st.", z),
      addressKey("700 4th ST", z),
      addressKey("700 4thST", z),
    ]);
    expect(keys.size).toBe(1);
  });
});
