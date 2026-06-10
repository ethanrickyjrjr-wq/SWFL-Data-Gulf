import { describe, it, expect } from "bun:test";
import { projectItemSchema, projectItemsSchema, type ProjectItem } from "./items";

describe("projectItemSchema", () => {
  it("accepts a valid metric item", () => {
    const item: ProjectItem = {
      id: "x",
      added_at: "2026-06-10T00:00:00Z",
      origin: "web",
      kind: "metric",
      report_id: "env-swfl",
      label: "Annual flood loss",
      value: "$30,074/yr",
      source_url: "https://example.com",
      source_label: "FEMA NFIP",
      freshness_token: "SWFL-7421-v5-20260610",
    };
    expect(projectItemSchema.parse(item).kind).toBe("metric");
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      projectItemSchema.parse({ id: "x", added_at: "t", origin: "web", kind: "bogus" }),
    ).toThrow();
  });

  it("requires freshness_token on metric", () => {
    expect(() =>
      projectItemSchema.parse({
        id: "x",
        added_at: "t",
        origin: "web",
        kind: "metric",
        report_id: "r",
        label: "l",
        value: "v",
      }),
    ).toThrow();
  });

  it("parses an array", () => {
    expect(projectItemsSchema.parse([])).toEqual([]);
  });
});
