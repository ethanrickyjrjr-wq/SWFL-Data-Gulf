import { test, expect } from "bun:test";
import { claimRedirectUrl } from "./claim-redirect";

test("no seed → bare project URL", () => {
  expect(claimRedirectUrl("abc123abc123", null)).toBe("/project/abc123abc123");
  expect(claimRedirectUrl("abc123abc123")).toBe("/project/abc123abc123");
});

test("full seed → §I ?seed=&scope_kind=&scope_value= URL", () => {
  expect(
    claimRedirectUrl("abc123abc123", { template: "email", scopeKind: "zip", scopeValue: "33931" }),
  ).toBe("/project/abc123abc123?seed=email&scope_kind=zip&scope_value=33931");
});

test("seed with null scope → seed param only (no empty scope params)", () => {
  expect(
    claimRedirectUrl("abc123abc123", { template: "email", scopeKind: null, scopeValue: null }),
  ).toBe("/project/abc123abc123?seed=email");
});

test("seed with empty template → treated as no seed", () => {
  expect(
    claimRedirectUrl("abc123abc123", { template: "", scopeKind: "zip", scopeValue: "33931" }),
  ).toBe("/project/abc123abc123");
});
