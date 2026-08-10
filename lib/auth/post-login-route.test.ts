import { describe, expect, test } from "bun:test";
import { brandProfileStarted, postLoginDestination } from "./post-login-route";

// Spec 2026-08-10-auth-create-account-design §D2: routing keys on profile state,
// never on which door (Sign in / Create account) was clicked.
describe("postLoginDestination", () => {
  test("stay-in-place mode NEVER navigates (failure mode 1: email-lab regression)", () => {
    expect(
      postLoginDestination({ stayInPlace: true, profileStarted: false, next: "/project" }),
    ).toBeNull();
    expect(
      postLoginDestination({ stayInPlace: true, profileStarted: "unknown", next: "/project" }),
    ).toBeNull();
  });

  test("first login (no brand profile yet) lands on Brand welcome", () => {
    expect(
      postLoginDestination({ stayInPlace: false, profileStarted: false, next: "/project" }),
    ).toBe("/account/brand?welcome=1");
  });

  test("started profile honors next", () => {
    expect(
      postLoginDestination({ stayInPlace: false, profileStarted: true, next: "/project" }),
    ).toBe("/project");
  });

  test("profile fetch failed (unknown) falls back to next, never strands (failure mode 3)", () => {
    expect(
      postLoginDestination({ stayInPlace: false, profileStarted: "unknown", next: "/alerts" }),
    ).toBe("/alerts");
  });

  test("unsafe next collapses to / through the same-origin guard (failure mode 4)", () => {
    expect(
      postLoginDestination({ stayInPlace: false, profileStarted: true, next: "//evil.com" }),
    ).toBe("/");
    expect(
      postLoginDestination({
        stayInPlace: false,
        profileStarted: "unknown",
        next: "https://evil.com",
      }),
    ).toBe("/");
  });
});

describe("brandProfileStarted", () => {
  test("empty payload (no row) = not started", () => {
    expect(brandProfileStarted({})).toBe(false);
  });

  test("synthetic keys never count as started", () => {
    expect(brandProfileStarted({ account_email: "a@b.com", color_palettes: [], error: "x" })).toBe(
      false,
    );
  });

  test("any saved brand value counts", () => {
    expect(brandProfileStarted({ agent_name: "Jane Doe", contact_email: "" })).toBe(true);
  });

  test("null / blank columns do not count", () => {
    expect(brandProfileStarted({ agent_name: null, contact_email: "  " })).toBe(false);
  });
});
