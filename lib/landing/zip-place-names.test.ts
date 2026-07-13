// lib/landing/zip-place-names.test.ts
//
// LABELS ARE NOT SCOPE. Scope has exactly one root — CORE_SCOPE_ZIPS (Lee +
// Collier, 57). This file's job is to give each of those a human name; it must
// cover the scope EXACTLY, no more and no less.
//
// Why this test exists: the homepage map used to derive its ZIP set from this
// object's KEYS, which made it a second, silent scope authority. The two agreed
// only because a human kept them in sync — and the lake holds 56 out-of-scope ZIPs
// in home values alone (Sarasota, Charlotte, Bradenton), so a drifted list would
// paint counties we don't cover. The map now reads the scope root directly, and
// this test keeps the labels honest against it: add a ZIP to scope without a name
// and it turns RED here instead of rendering an unnamed shape on the homepage.
import { describe, expect, test } from "bun:test";
import { CORE_SCOPE_ZIPS } from "@/refinery/lib/core-scope.mts";
import { ZIP_PLACE_NAMES } from "./zip-place-names";

describe("ZIP place names track the scope root exactly", () => {
  test("every core-scope ZIP has a place name (no unnamed shape on the map)", () => {
    const missing = [...CORE_SCOPE_ZIPS].filter((z) => !ZIP_PLACE_NAMES[z]).sort();
    expect(missing).toEqual([]);
  });

  test("no place name for a ZIP outside scope (labels never widen coverage)", () => {
    const extra = Object.keys(ZIP_PLACE_NAMES)
      .filter((z) => !CORE_SCOPE_ZIPS.has(z))
      .sort();
    expect(extra).toEqual([]);
  });

  test("the label set IS the scope set — 57, Lee + Collier", () => {
    expect(Object.keys(ZIP_PLACE_NAMES).length).toBe(CORE_SCOPE_ZIPS.size);
    expect(CORE_SCOPE_ZIPS.size).toBe(57);
  });
});
