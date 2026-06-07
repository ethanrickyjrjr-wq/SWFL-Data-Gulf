import { test, expect } from "bun:test";
import { resolveReachTargets } from "./reach";
import { buildReportIdSet } from "@/app/api/mcp/inventory";

test("flood question on a housing page reaches env-swfl", () => {
  const t = resolveReachTargets(
    "what about flood risk and insurance here?",
    "housing-swfl",
  );
  expect(t).toContain("env-swfl");
});

test("commercial-rent question reaches cre-swfl", () => {
  const t = resolveReachTargets(
    "how do office cap rates compare?",
    "housing-swfl",
  );
  expect(t).toContain("cre-swfl");
});

test("big-picture question reaches master", () => {
  const t = resolveReachTargets(
    "what's the overall outlook for the whole market?",
    "housing-swfl",
  );
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
  const t = resolveReachTargets(
    "how does Naples compare to Cape Coral on price?",
    "housing-swfl",
  );
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
