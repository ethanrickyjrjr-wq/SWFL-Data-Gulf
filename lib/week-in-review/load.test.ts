import { test, expect } from "bun:test";
import {
  TRANSITION_KINDS,
  ALLOWED_SOURCE_TABLE,
  windowWithinCoverage,
  emptyResult,
  errorResult,
  isRenderable,
  grainCoverageLabel,
} from "./load";

// Named for the failure mode each targets (RULE 3.5), matching the design's §6:
// docs/superpowers/specs/2026-08-06-week-in-review-design.md
//
// The whole risk on this surface is that a week-in-review LOOKS correct while
// being silently wrong: a quiet ZIP and a broken query render identically, and
// two price-cut lanes that disagree BY DESIGN (data-roots T11) look like the
// same number. Every test below is one of those.

// §6.1 — cross-lane price-cut sum.
// T11: listing_transitions.price_delta is our FORWARD-only sweep; the vendor's
// steadyapi_listing_events_v.price_change is a BACKWARD history that exists only
// for probed properties and can NEVER roll up to an area. Summing them, or
// letting the vendor lane reach an area figure, is the defect.
test("reads only the forward-only transitions lane, never the vendor backward lane", () => {
  expect(ALLOWED_SOURCE_TABLE).toBe("listing_transitions");
  expect(ALLOWED_SOURCE_TABLE).not.toContain("steadyapi");
});

// The seven buckets are the states the sweep already writes — not a taxonomy we
// invent. Measured live 08/06/2026 (design §1). A renamed or invented kind means
// someone stopped reading the feed and started authoring one.
test("buckets are the transition kinds the sweep actually writes", () => {
  expect(TRANSITION_KINDS).toEqual([
    "active->active",
    "active->holding",
    "holding->sold",
    "holding->active",
    "active->sold",
    "active->withdrawn",
    "holding->withdrawn",
  ]);
});

// §6.2 — silent window truncation.
// The sweep is blind before it started watching a listing, so a window opening
// before coverage begins renders an artificially quiet market as if it were real.
test("refuses a window that begins before the feed's coverage starts", () => {
  const coverageStart = "2026-06-22";
  expect(windowWithinCoverage({ start: "2026-07-30", end: "2026-08-06" }, coverageStart)).toBe(
    true,
  );
  expect(windowWithinCoverage({ start: "2026-06-01", end: "2026-06-08" }, coverageStart)).toBe(
    false,
  );
});

test("a window starting exactly on the coverage start is allowed", () => {
  expect(windowWithinCoverage({ start: "2026-06-22", end: "2026-06-29" }, "2026-06-22")).toBe(true);
});

// §6.3 — empty window rendered as "nothing happened".
// A quiet ZIP and a broken query must NOT be the same value. This is the one
// place copying lib/figures/sourced.ts verbatim would be wrong: it collapses
// both to []. Empty is renderable ("no recorded changes"); an error is not.
test("distinguishes a genuine empty window from a query error", () => {
  const empty = emptyResult();
  const failed = errorResult("connection refused");

  expect(empty).not.toEqual(failed);
  expect(isRenderable(empty)).toBe(true);
  expect(isRenderable(failed)).toBe(false);
});

test("an empty window carries zero events, not absent events", () => {
  const empty = emptyResult();
  expect(empty.ok).toBe(true);
  expect(empty.events).toEqual([]);
});

test("an error result never presents itself as zero activity", () => {
  const failed = errorResult("timeout");
  expect(failed.ok).toBe(false);
  expect(failed).not.toHaveProperty("events");
});

// §6.6 — grain leak.
// A city figure computed from a partial ZIP set, presented as the city's number,
// is an unsourced claim wearing a real number's clothes.
test("labels a grain whose ZIP coverage is incomplete inside the window", () => {
  expect(grainCoverageLabel({ covered: 8, total: 8 })).toBeNull();
  expect(grainCoverageLabel({ covered: 5, total: 8 })).toBe(
    "Based on 5 of 8 ZIP codes with recorded activity in this window.",
  );
});

test("a grain with zero covered ZIPs is labelled, never silently rolled up", () => {
  expect(grainCoverageLabel({ covered: 0, total: 8 })).toBe(
    "Based on 0 of 8 ZIP codes with recorded activity in this window.",
  );
});
