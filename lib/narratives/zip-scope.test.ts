// lib/narratives/zip-scope.test.ts
//
// THE BAKE POPULATION IS 57 ZIPS — LEE + COLLIER. NOTHING ELSE.
//
// This existed as a spec (2026-07-11-zip-scope-core-design.md) and as a predicate
// (isCoreScope), and the bake surface was still written without it: the housing
// table carries 124 ZIP keys (a Gulf-coast-wide feed), of which 91 had enough
// signals to bake and only 54 are ours. We were one Monday away from paying a model
// to write market narration for Bradenton, Sarasota, Punta Gorda, and Port
// Charlotte — places we do not cover and have never claimed to.
//
// The leak reopens every time a NEW surface enumerates ZIPs by hand. So this test
// does not check a number; it checks the PREDICATE — any key the bake would ever
// hand a model must satisfy isCoreScope. A future surface that forgets the gate
// turns this RED before it can spend a cent.
import { describe, expect, test } from "bun:test";
import {
  isCoreScope,
  CORE_SCOPE_ZIPS,
  CORE_SCOPE_COUNTY_FIPS,
} from "@/refinery/lib/core-scope.mts";
import { listZipSurfaceKeys } from "./zip-inputs";

describe("ZIP bake population — core scope only (Lee + Collier)", () => {
  test("core scope is the two counties, 57 ZIPs — not a Gulf-coast-wide list", () => {
    expect(CORE_SCOPE_COUNTY_FIPS.size).toBe(2); // 12071 Lee, 12021 Collier
    expect(CORE_SCOPE_ZIPS.size).toBe(57);
  });

  test("EVERY ZIP the bake would enumerate is in core scope", async () => {
    const keys = await listZipSurfaceKeys();
    const leaked = keys.filter((z) => !isCoreScope(z));
    expect(leaked).toEqual([]);
    // and the population can never exceed the scope itself
    expect(keys.length).toBeLessThanOrEqual(CORE_SCOPE_ZIPS.size);
  });

  test("the ZIPs that leaked on 07/13/2026 are gate-rejected by name", () => {
    // Sarasota / Manatee / Charlotte — each was in the 91 and would have been paid for.
    for (const zip of ["34236", "34205", "34292", "34293", "33950", "33980", "34224"]) {
      expect(isCoreScope(zip)).toBe(false);
    }
    // …while real coverage still passes.
    for (const zip of ["33914", "33993", "33901", "34102", "34112"]) {
      expect(isCoreScope(zip)).toBe(true);
    }
  });
});
