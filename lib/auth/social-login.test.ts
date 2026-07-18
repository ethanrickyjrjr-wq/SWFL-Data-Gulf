import { describe, expect, it } from "bun:test";
import { parseLoginProviders } from "./social-login";

describe("parseLoginProviders", () => {
  it("returns [] for unset / empty / whitespace", () => {
    expect(parseLoginProviders(undefined)).toEqual([]);
    expect(parseLoginProviders(null)).toEqual([]);
    expect(parseLoginProviders("")).toEqual([]);
    expect(parseLoginProviders("   ")).toEqual([]);
  });

  it("recognizes linkedin_oidc (the retired `linkedin` slug is NOT a provider)", () => {
    expect(parseLoginProviders("linkedin_oidc").map((p) => p.slug)).toEqual(["linkedin_oidc"]);
    expect(parseLoginProviders("linkedin")).toEqual([]);
  });

  it("maps every known slug to its brand label", () => {
    const all = parseLoginProviders("google,linkedin_oidc,facebook,apple");
    expect(all).toEqual([
      { slug: "google", label: "Google" },
      { slug: "linkedin_oidc", label: "LinkedIn" },
      { slug: "facebook", label: "Facebook" },
      { slug: "apple", label: "Apple" },
    ]);
  });

  it("preserves the operator's written order (Google first if listed first)", () => {
    expect(parseLoginProviders("apple,google").map((p) => p.slug)).toEqual(["apple", "google"]);
  });

  it("trims, lowercases, drops unknown slugs, and de-dupes", () => {
    expect(parseLoginProviders(" GOOGLE , github , google , twitter ").map((p) => p.slug)).toEqual([
      "google",
    ]);
  });
});
