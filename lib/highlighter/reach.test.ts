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
