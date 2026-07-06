// lib/lab-entry/address-reconcile.test.ts
import { describe, expect, test } from "bun:test";
import { reconcileAddress, normalizeAddress, addressItem } from "./address-reconcile";

describe("reconcileAddress", () => {
  test("no belief yet → adopt silently", () => {
    expect(reconcileAddress("123 Palm Ave", null).kind).toBe("no-belief");
    expect(reconcileAddress("123 Palm Ave", "").kind).toBe("no-belief");
  });
  test("same address (case/space/punct-insensitive) → match", () => {
    expect(reconcileAddress("123 Palm Ave, Fort Myers", "123  palm ave  fort myers").kind).toBe(
      "match",
    );
  });
  test("different address → differ (keep/new confirm)", () => {
    expect(reconcileAddress("456 Oak St", "123 Palm Ave").kind).toBe("differ");
  });
});

test("normalizeAddress lowercases, collapses space, strips punctuation", () => {
  expect(normalizeAddress("123 Palm Ave., Fort Myers")).toBe("123 palm ave fort myers");
});

test("addressItem carries the kind + address (caller stamps id/added_at/origin)", () => {
  expect(addressItem("123 Palm Ave")).toEqual({ kind: "address", address: "123 Palm Ave" });
});
