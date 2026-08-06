import { test, expect } from "bun:test";
import {
  TRANSITION_KINDS,
  ALLOWED_SOURCE_TABLE,
  windowWithinCoverage,
  emptyResult,
  errorResult,
  isRenderable,
  grainCoverageLabel,
  loadWeekInReview,
  type TransitionRow,
  type GeoRow,
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
    "sold->active",
  ]);
});

// A closing that fell through AFTER recording sold — added 08/06/2026, live-quantified
// at 32 occurrences since coverage began (check: sold_to_active_no_named_surface). This
// event was in the feed the whole time; the kind list simply never named it.
test("names a closing that fell through after recording sold", async () => {
  const transitions = [
    row({ address_key: "A", from_state: "sold", to_state: "active", price: 450000 }),
  ];
  const result = await loadWeekInReview("zip", "33904", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904"],
    fetchTransitions: async () => transitions,
    fetchGeo: async () => [geo({ address_key: "A" })],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  expect(result.events).toEqual([
    {
      kind: "sold->active",
      count: 1,
      facts: [
        {
          label: "Fell through after closing",
          value: 450000,
          unit: "$",
          source: "SWFL Data Gulf",
        },
      ],
    },
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

// ─── loadWeekInReview — the DB-backed query, deps-injected exactly like
// lib/why-not-selling/cut-history.ts so no test touches Supabase. ───

const WINDOW = { start: "2026-07-30", end: "2026-08-06" };
const EARLY_COVERAGE_START = "2026-06-22";

function row(overrides: Partial<TransitionRow> = {}): TransitionRow {
  return {
    address_key: "K:33904",
    from_state: "active",
    to_state: "active",
    at: "2026-08-01",
    price: 590000,
    price_delta: -10000,
    ...overrides,
  };
}

function geo(overrides: Partial<GeoRow> = {}): GeoRow {
  return {
    address_key: "K:33904",
    zip_code: "33904",
    city: "Cape Coral",
    county: "Lee",
    ...overrides,
  };
}

test("buckets matching-grain transitions by kind and counts them", async () => {
  const transitions = [
    row({ address_key: "A", from_state: "active", to_state: "active" }),
    row({ address_key: "A", from_state: "active", to_state: "active" }),
    row({ address_key: "B", from_state: "active", to_state: "holding" }),
  ];
  const result = await loadWeekInReview("zip", "33904", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904"],
    fetchTransitions: async () => transitions,
    fetchGeo: async () => [geo({ address_key: "A" }), geo({ address_key: "B" })],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  const byKind = new Map(result.events.map((e) => [e.kind, e.count]));
  expect(byKind.get("active->active")).toBe(2);
  expect(byKind.get("active->holding")).toBe(1);
});

test("excludes rows whose resolved geo does not match the requested grain and key", async () => {
  const transitions = [row({ address_key: "IN_ZIP" }), row({ address_key: "OUT_OF_ZIP" })];
  const result = await loadWeekInReview("zip", "33904", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904"],
    fetchTransitions: async () => transitions,
    fetchGeo: async () => [
      geo({ address_key: "IN_ZIP", zip_code: "33904" }),
      geo({ address_key: "OUT_OF_ZIP", zip_code: "33990" }),
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  const total = result.events.reduce((n, e) => n + e.count, 0);
  expect(total).toBe(1);
});

test("filters by city or county through the listing_state geo columns, not a fixture", async () => {
  const transitions = [row({ address_key: "A" }), row({ address_key: "B" })];
  const result = await loadWeekInReview("city", "Cape Coral", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904", "33990"],
    fetchTransitions: async () => transitions,
    fetchGeo: async () => [
      geo({ address_key: "A", city: "Cape Coral" }),
      geo({ address_key: "B", city: "Fort Myers" }),
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  const total = result.events.reduce((n, e) => n + e.count, 0);
  expect(total).toBe(1);
});

// §6.3 again, at the loader level this time: a genuinely quiet window and a
// broken query must not collapse to the same value.
test("a genuinely empty window returns ok with zero events", async () => {
  const result = await loadWeekInReview("zip", "33904", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904"],
    fetchTransitions: async () => [],
    fetchGeo: async () => [],
  });
  expect(result).toEqual(emptyResult());
});

test("a fetch failure returns an error, never a false empty", async () => {
  const result = await loadWeekInReview("zip", "33904", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904"],
    fetchTransitions: async () => {
      throw new Error("connection refused");
    },
    fetchGeo: async () => [],
  });
  expect(result.ok).toBe(false);
  expect(isRenderable(result)).toBe(false);
});

// §6.2 at the loader level: refuse before ever querying transitions.
test("refuses a window before coverage starts without querying transitions", async () => {
  let transitionsFetchCalled = false;
  const result = await loadWeekInReview(
    "zip",
    "33904",
    { start: "2026-06-01", end: "2026-06-08" },
    {
      fetchCoverageStart: async () => EARLY_COVERAGE_START,
      fetchFootprintZips: async () => ["33904"],
      fetchTransitions: async () => {
        transitionsFetchCalled = true;
        return [];
      },
      fetchGeo: async () => [],
    },
  );
  expect(result.ok).toBe(false);
  expect(transitionsFetchCalled).toBe(false);
});

// §6.6 at the loader level: the loader reports covered-vs-total so the page
// can label a partial rollup rather than presenting it as complete.
test("reports ZIP coverage for a multi-ZIP grain so a partial rollup can be labelled", async () => {
  const transitions = [row({ address_key: "A" }), row({ address_key: "B" })];
  const result = await loadWeekInReview("county", "Lee", WINDOW, {
    fetchCoverageStart: async () => EARLY_COVERAGE_START,
    fetchFootprintZips: async () => ["33904", "33905", "33990"],
    fetchTransitions: async () => transitions,
    fetchGeo: async () => [
      geo({ address_key: "A", zip_code: "33904", county: "Lee" }),
      geo({ address_key: "B", zip_code: "33905", county: "Lee" }),
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected ok");
  expect(result.coverage).toEqual({ covered: 2, total: 3 });
});

test("an empty result never carries a coverage field either", () => {
  expect(emptyResult()).not.toHaveProperty("coverage");
});
