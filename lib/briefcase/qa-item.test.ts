import { test, expect } from "bun:test";
import { buildQaItem } from "./qa-item";
import { projectItemSchema, projectItemsSchema } from "@/lib/project/items";

test("buildQaItem produces a schema-valid `qa` ProjectItem with base fields stamped", () => {
  const item = buildQaItem({
    report_id: "33931",
    question: "What's the flood read for Fort Myers Beach?",
    answer: "AAL is $30,074/yr for ZIP 33931 [OpenFEMA].",
    freshness_token: "SWFL-7421-v9-20260601",
  });
  // The single source of truth for what "File this answer" files.
  expect(() => projectItemSchema.parse(item)).not.toThrow();
  expect(projectItemsSchema.safeParse([item]).success).toBe(true);
  expect(item.kind).toBe("qa");
  expect(item.origin).toBe("web");
  expect(item.id.length).toBeGreaterThan(0);
  expect(typeof item.added_at).toBe("string");
});

test("buildQaItem omits optional provenance when not provided", () => {
  const item = buildQaItem({ report_id: "swfl", question: "q", answer: "a" });
  expect(projectItemSchema.safeParse(item).success).toBe(true);
  expect("freshness_token" in item).toBe(false);
  expect("fact" in item).toBe(false);
  expect("reach" in item).toBe(false);
});

test("buildQaItem carries optional provenance (fact/selection_type/reach) when provided", () => {
  const item = buildQaItem({
    report_id: "cre-swfl",
    question: "what is NNN here?",
    answer: "Triple-net rent on US-41 averages $22.29 [Cushman & Wakefield].",
    fact: "$22.29",
    selection_type: "metric",
    reach: ["housing-swfl"],
    freshness_token: "SWFL-7421-v9-20260601",
  });
  expect(projectItemSchema.safeParse(item).success).toBe(true);
  if (item.kind === "qa") {
    expect(item.fact).toBe("$22.29");
    expect(item.reach).toEqual(["housing-swfl"]);
    expect(item.freshness_token).toBe("SWFL-7421-v9-20260601");
  }
});
