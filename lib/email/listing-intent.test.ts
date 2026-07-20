import { test, expect } from "bun:test";
import { isListingIntent, subjectAddressFromPrompt } from "./listing-intent";

const HICKORY =
  "https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd-bonita-springs-fl-34134-lhrmls-03646837";

test("true: 'just got this listing… describe it' with a URL (the real prompt)", () => {
  expect(
    isListingIntent(
      `JUST GOT THIS LISTING. BUILD ME AN EMAIL FOR MY CLIENTS DESCRIBING IT AND SHOW A CHART OF SIMILAR HOME SALE PRICES ${HICKORY}`,
    ),
  ).toBe(true);
});

test("true: 'feature this property' with a URL", () => {
  expect(isListingIntent("feature this property for my buyers https://site.com/listing/123")).toBe(
    true,
  );
});

test("false: a market newsletter ask, even with a brand URL", () => {
  expect(
    isListingIntent("Build my monthly market update on home prices https://mygulfrealty.com"),
  ).toBe(false);
});

test("false: listing words but NO url (no specific page to scrape)", () => {
  expect(isListingIntent("write something about this listing")).toBe(false);
});

// ── subjectAddressFromPrompt — the Email Lab door ────────────────────────────
// The regression this locks: the campaign button seeds the recipe TEXT and nothing
// else, so the address exists ONLY in the prompt. Every prior test injected it via
// scope.address, so the flyer lane looked covered while every in-lab campaign build
// silently fell through to the free author (photo-less ZIP grab-bag). Verbatim seed
// prompt from the registry, blank filled — the exact string the operator built with.
const SEED =
  "Build a new-listing announcement email for my listing at 326 Shore Dr, Fort Myers, FL 33905 — key specs, price per square foot, a chart of the ZIP's home-value trend, and one honest line about where that market sits.";

test("pulls the subject address out of the filled campaign seed prompt", () => {
  expect(subjectAddressFromPrompt(SEED)).toBe("326 Shore Dr, Fort Myers, FL 33905");
});

test("stops at the em-dash — the requirements clause is never part of the address", () => {
  const addr = subjectAddressFromPrompt(SEED)!;
  expect(addr).not.toContain("key specs");
  expect(addr).not.toContain("square foot");
});

test("takes the geocoder's long form too (the homepage hero's format)", () => {
  expect(
    subjectAddressFromPrompt(
      "Build a new-listing announcement email for my listing at 326 Shore Drive, Fort Myers, Florida 33905, United States — key specs and a chart.",
    ),
  ).toBe("326 Shore Drive, Fort Myers, Florida 33905, United States");
});

test("null when there is no house number — a span with no digit is not an address", () => {
  expect(subjectAddressFromPrompt("Build a new-listing email for my listing at the beach")).toBe(
    null,
  );
  expect(subjectAddressFromPrompt("Build my monthly market update for Cape Coral")).toBe(null);
  expect(subjectAddressFromPrompt("")).toBe(null);
});

// ── the naturally-typed prompt — postmortem 07/20/2026 ──────────────────────
// SUBJECT_AT only ever matched the machine seed's rigid "...at <addr> —" shape. A
// person typing their own words ("for" instead of "at", a period instead of an
// em-dash) got null every time, silently losing the address and falling through to
// the generic ZIP-stats author. This is the exact reproduction, twice-confirmed live.
test("pulls the address out of an organically typed 'for <addr>' prompt", () => {
  expect(
    subjectAddressFromPrompt(
      "New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905. Use the real listing photo and real price/specs.",
    ),
  ).toBe("14189 Mindello Dr, Fort Myers, FL 33905");
});

test("organic prompt: stops at the sentence period, never swallows the trailing ask", () => {
  const addr = subjectAddressFromPrompt(
    "New listing announcement for 326 Shore Dr, Fort Myers, FL 33905. Use the real listing photo and real price/specs.",
  )!;
  expect(addr).toBe("326 Shore Dr, Fort Myers, FL 33905");
  expect(addr).not.toContain("Use the real");
});

test("organic prompt with no city/zip suffix still yields the bare street address", () => {
  expect(subjectAddressFromPrompt("Can you build a flyer for 14189 Mindello Dr please")).toBe(
    "14189 Mindello Dr",
  );
});

test("a bare ZIP with no street suffix is still not an address (no false positive)", () => {
  expect(subjectAddressFromPrompt("Weekly market update for ZIP 33905")).toBe(null);
});
