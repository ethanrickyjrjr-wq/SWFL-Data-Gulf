import { test, expect } from "bun:test";
import { resolveReachTargets } from "./reach";
import { buildReportIdSet } from "@/app/api/mcp/inventory";

test("flood question on a housing page reaches env-swfl", () => {
  const t = resolveReachTargets("what about flood risk and insurance here?", "housing-swfl");
  expect(t).toContain("env-swfl");
});

test("commercial-rent question reaches cre-swfl", () => {
  const t = resolveReachTargets("how do office cap rates compare?", "housing-swfl");
  expect(t).toContain("cre-swfl");
});

test("big-picture question reaches master", () => {
  const t = resolveReachTargets("what's the overall outlook for the whole market?", "housing-swfl");
  expect(t).toContain("master");
});

test("never returns the current slug", () => {
  const t = resolveReachTargets("housing prices and flood", "env-swfl");
  expect(t).not.toContain("env-swfl");
});

test("only returns allowlisted slugs, capped at 3", () => {
  const t = resolveReachTargets(
    "flood and commercial and permits and rent and jobs and tourism",
    "housing-swfl",
  );
  expect(t.length).toBeLessThanOrEqual(3);
});

test("a plain same-vertical compare needs no reach (R0 covers it)", () => {
  const t = resolveReachTargets("how does Naples compare to Cape Coral on price?", "housing-swfl");
  expect(t).toEqual([]);
});

test("output is always a subset of the catalog allowlist", () => {
  const allowed = buildReportIdSet();
  const questions = [
    "flood and commercial and permits and rent and jobs and tourism",
    "overall outlook for the whole market",
    "office cap rates and insurance",
    "",
  ];
  for (const q of questions) {
    for (const slug of resolveReachTargets(q, "housing-swfl")) {
      expect(allowed.has(slug)).toBe(true);
    }
  }
});

test("falsy question returns no targets", () => {
  expect(resolveReachTargets("", "housing-swfl")).toEqual([]);
});

// --- Regressions for the 07/09/2026 live report: every chart-shaped question
// --- routed to nothing, and the verb "build" routed to a construction permit.

test("the verb 'build' does not hijack a rent question into permits", () => {
  const t = resolveReachTargets("build me a chart of rents by ZIP", "master");
  expect(t).toEqual(["rentals-swfl"]);
});

test("the single most obvious question in the product routes somewhere", () => {
  const t = resolveReachTargets("chart the median sale price by ZIP", "master");
  expect(t).toContain("housing-swfl");
});

test("'heating up' reaches market-heat-swfl", () => {
  expect(resolveReachTargets("Which corridors are heating up?", "master")).toContain(
    "market-heat-swfl",
  );
});

// "Tightening" is a DIRECTION. market-heat-swfl carries `Inventory Y/Y`;
// active-listings-swfl is levels-only and cannot express a direction at all.
test("'inventory tightening' reaches market-heat-swfl, not active-listings-swfl", () => {
  const t = resolveReachTargets("a chart of inventory tightening by corridor", "master");
  expect(t).toContain("market-heat-swfl");
  expect(t).not.toContain("active-listings-swfl");
});

// The residential rules sit ABOVE cre-swfl, so nothing in them may claim a
// commercial keyword. This is the priority-inversion guard.
test("a commercial cap-rate question still reaches cre-swfl", () => {
  expect(resolveReachTargets("how do office cap rates compare?", "master")).toContain("cre-swfl");
});

// MAX_REACH=3 truncates from the END of the table, and the six original rules now
// sit there. A question spanning residential + commercial + flood must not starve
// env/cre out of the reach entirely.
test("a mixed-topic question still reaches the pre-existing rules under the cap", () => {
  const t = resolveReachTargets("flood risk, office vacancy, and days on market", "master");
  expect(t.length).toBeLessThanOrEqual(3);
  expect(t).toContain("listing-momentum-swfl");
  expect(t).toContain("env-swfl");
  expect(t).toContain("cre-swfl");
});

// --- Regressions for the 07/09/2026 coverage audit: 26 of 39 catalogued brains
// --- had no topic rule at all (check `reach_topic_rules_backfill`).

test("a safety question reaches safety-swfl", () => {
  expect(resolveReachTargets("is Cape Coral safe? what's the crime rate?", "master")).toContain(
    "safety-swfl",
  );
});

// `\bemploy\b` never matches "unemployment" — the word boundary eats the suffix.
// LAUS unemployment lives in macro-swfl, not the OEWS occupations brain.
test("an unemployment question reaches macro-swfl", () => {
  expect(resolveReachTargets("what's the unemployment rate in Lee County?", "master")).toContain(
    "macro-swfl",
  );
});

// Plural-boundary bug class, third instance: "price cut|price reduction" matched
// neither "price cuts" nor "price drops".
test("'where are prices dropping' reaches listing-momentum-swfl", () => {
  expect(resolveReachTargets("where are prices dropping the most?", "master")).toContain(
    "listing-momentum-swfl",
  );
});

test("a rent-yield question reaches market-temperature-swfl", () => {
  expect(resolveReachTargets("chart the gross rent yield by ZIP", "master")).toContain(
    "market-temperature-swfl",
  );
});

// Yield phrasing sits BELOW cre-swfl and must never steal a cap-rate question.
test("a cap-rate question still routes cre-swfl first, not market-temperature", () => {
  const t = resolveReachTargets("how do office cap rates compare?", "master");
  expect(t[0]).toBe("cre-swfl");
  expect(t).not.toContain("market-temperature-swfl");
});

// History phrasing outranks modeled flood exposure; env still rides via "hurricane".
test("a landfall question slots hurricane-tracks-fl ahead of env-swfl", () => {
  const t = resolveReachTargets("when did the last hurricane make landfall here?", "master");
  expect(t[0]).toBe("hurricane-tracks-fl");
  expect(t).toContain("env-swfl");
});

// Inventory phrasing outranks the ZORI rent index; both ride together.
test("a rental-availability question slots active-rentals-swfl ahead of rentals-swfl", () => {
  const t = resolveReachTargets("how many rentals are available in Naples?", "master");
  expect(t[0]).toBe("active-rentals-swfl");
  expect(t).toContain("rentals-swfl");
});

test("a mortgage-rate question reaches freshness-pulse", () => {
  expect(resolveReachTargets("what are mortgage rates doing today?", "master")).toContain(
    "freshness-pulse",
  );
});

test("a condo SIRS question reaches condo-sirs-swfl", () => {
  expect(
    resolveReachTargets("has my condo association filed its SIRS reserve study?", "master"),
  ).toContain("condo-sirs-swfl");
});

test("a traffic question reaches traffic-swfl", () => {
  expect(resolveReachTargets("how bad is traffic on US-41?", "master")).toContain("traffic-swfl");
});

// --- 07/09/2026: home-values-swfl + investor-zip-swfl catalogued (operator decision,
// --- check home_values_investor_zip_not_in_catalog) with the yield disambiguation:
// --- generic yield → market-temperature (source-faithful), investor → investor-zip (computed).

test("a home-value/appreciation question reaches home-values-swfl", () => {
  expect(resolveReachTargets("which ZIPs are appreciating fastest?", "master")).toContain(
    "home-values-swfl",
  );
  expect(resolveReachTargets("chart home values by ZIP", "master")).toContain("home-values-swfl");
});

test("an investor question reaches investor-zip-swfl, not market-temperature", () => {
  const t = resolveReachTargets("best ZIPs for investors right now?", "master");
  expect(t).toContain("investor-zip-swfl");
  expect(t).not.toContain("market-temperature-swfl");
});

test("generic rent-yield stays on market-temperature, flood-adjusted goes to investor-zip", () => {
  expect(resolveReachTargets("what's the gross rent yield in Naples?", "master")).toContain(
    "market-temperature-swfl",
  );
  expect(resolveReachTargets("show the flood-adjusted cap rate by ZIP", "master")).toContain(
    "investor-zip-swfl",
  );
});
