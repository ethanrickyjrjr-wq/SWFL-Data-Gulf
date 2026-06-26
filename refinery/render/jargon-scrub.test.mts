import { test, expect } from "bun:test";
import { sanitizeProse } from "./speaker.mts";

/**
 * Jargon guard (Phase 0.2). `sanitizeProse` is the chokepoint every customer-facing
 * brain string passes through (chat speaker + the dossier's `toDisplayBrain`, which
 * feeds the ZIP report's city section). It must strip the internal build jargon the
 * operator flagged — "the CRE pack", "verified corridors" — so a reader never sees a
 * pack id or a corpus-QA word. Phase 3 rewrites the cre-swfl emitter at source; this
 * is the render-time safety net + the regression guard.
 */

test("sanitizeProse strips cre-swfl pack jargon a reader should never see", () => {
  const out = sanitizeProse(
    "The SWFL CRE pack covers 27 verified corridors across Lee and Collier counties.",
  );
  expect(out).not.toMatch(/\bCRE pack\b/i);
  expect(out).not.toMatch(/\bpack\b/i);
  expect(out).not.toMatch(/\bverified (areas?|corridors?)\b/i);
  // Reads like a human sentence, mapped to the same label PACK_ID_LABELS gives cre-swfl.
  expect(out).toContain("commercial real estate read");
});

test("sanitizeProse leaves clean prose untouched", () => {
  const clean = "Median home value rose across Naples and Bonita Springs.";
  expect(sanitizeProse(clean)).toBe(clean);
});

test("sanitizeProse converts ISO dates to MM/DD/YYYY", () => {
  expect(sanitizeProse("reads mixed at 2026-01-01 across 125 ZIPs")).toBe(
    "reads mixed at 01/01/2026 across 125 ZIPs",
  );
  expect(sanitizeProse("latest period = 2026-03-01.")).toBe("latest period = 03/01/2026.");
  // Freshness tokens (SWFL-YYYYMMDD format) must NOT be converted — no hyphens.
  expect(sanitizeProse("token SWFL-20260603")).toBe("token SWFL-20260603");
});
