import { describe, expect, it } from "bun:test";
import {
  defaultScheme,
  normalizeHex,
  sanitizePalettes,
  schemeFromBranding,
  schemesEqual,
} from "./palette";

describe("normalizeHex", () => {
  it("expands shorthand and adds #", () => {
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("001122")).toBe("#001122");
    expect(normalizeHex("#00D4AA")).toBe("#00d4aa");
  });
  it("rejects junk", () => {
    expect(normalizeHex("nope")).toBeNull();
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex(42)).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
  });
});

describe("schemeFromBranding", () => {
  it("reads the four slot keys, normalizing", () => {
    expect(
      schemeFromBranding({
        primary_color: "#00d4aa",
        accent_color: "abc",
        text_color: "#242424",
        backdrop_color: "",
      }),
    ).toEqual(["#00d4aa", "#aabbcc", "#242424", ""]);
  });
});

describe("sanitizePalettes", () => {
  it("drops malformed entries and normalizes colors", () => {
    const out = sanitizePalettes([
      { id: "a", name: "Gulf", colors: ["#00d4aa", "abc", "", ""] },
      { colors: [] }, // no colors → dropped
      "garbage", // not an object → dropped
      { colors: ["nope"] }, // all invalid → dropped
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "a",
      name: "Gulf",
      colors: ["#00d4aa", "#aabbcc", "", ""],
    });
  });

  it("dedupes by scheme (case-insensitive)", () => {
    const out = sanitizePalettes([
      { colors: ["#00D4AA", "#000000", "#ffffff"] },
      { colors: ["#00d4aa", "#000000", "#FFFFFF"] },
    ]);
    expect(out).toHaveLength(1);
  });

  it("caps the library at 24", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      colors: [`#0000${(i + 16).toString(16).padStart(2, "0")}`, "", ""],
    }));
    expect(sanitizePalettes(many)).toHaveLength(24);
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizePalettes(null)).toEqual([]);
    expect(sanitizePalettes({})).toEqual([]);
  });
});

describe("defaultScheme", () => {
  it("prefers the first saved palette", () => {
    expect(
      defaultScheme({
        primary_color: "#111111",
        color_palettes: [{ colors: ["#00d4aa", "#222222", "#333333", "#f8f8f8"] }],
      }),
    ).toEqual(["#00d4aa", "#222222", "#333333", "#f8f8f8"]);
  });
  it("falls back to legacy primary/accent/text/backdrop columns", () => {
    expect(
      defaultScheme({
        primary_color: "#111111",
        accent_color: "#222222",
        text_color: "#242424",
      }),
    ).toEqual(["#111111", "#222222", "#242424", ""]);
  });
  it("handles an empty profile", () => {
    expect(defaultScheme(null)).toEqual(["", "", "", ""]);
  });
});

describe("schemesEqual", () => {
  it("compares the four slots case-insensitively", () => {
    expect(schemesEqual(["#AAA000", "#000", "", ""], ["#aaa000", "#000", "", ""])).toBe(true);
    expect(schemesEqual(["#aaa000", "", "", ""], ["#bbb000", "", "", ""])).toBe(false);
  });
});
