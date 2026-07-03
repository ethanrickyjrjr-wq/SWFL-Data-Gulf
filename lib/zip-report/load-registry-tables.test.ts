// lib/zip-report/load-registry-tables.test.ts
import { describe, expect, test } from "bun:test";
import { buildRegistryTableMap } from "./load-registry-tables";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";

function fakeBrain(detail_tables: ParsedBrain["output"]["detail_tables"]): ParsedBrain {
  return {
    brain_id: "x",
    version: 1,
    freshness_token: "SWFL-x-20260703",
    scope: "test",
    refined_at: "2026-07-03T00:00:00Z",
    raw_md: "",
    output: {
      conclusion: "",
      key_metrics: [],
      caveats: [],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
      detail_tables,
    },
  } as unknown as ParsedBrain;
}

describe("buildRegistryTableMap", () => {
  test("extracts rows + source for a table the registry references, keyed packId:tableId", () => {
    const brains = new Map<string, ParsedBrain | null>([
      [
        "housing-swfl",
        fakeBrain([
          {
            id: "housing_by_zip",
            title: "t",
            grain: "zip",
            columns: [],
            rows: [{ key: "33914", label: "33914", cells: { median_sale_price: 485_000 } }],
            source: {
              url: "https://example.com",
              fetched_at: "2026-07-01T00:00:00Z",
              tier: 1,
              citation: "MLS",
            },
          },
        ]),
      ],
    ]);
    const map = buildRegistryTableMap(brains);
    const entry = map.get("housing-swfl:housing_by_zip")!;
    expect(entry.rows).toEqual([{ key: "33914", cells: { median_sale_price: 485_000 } }]);
    expect(entry.source).toEqual({ label: "MLS", url: "https://example.com" });
  });

  test("a brain that's null (failed to load) -> its tables are simply absent from the map, never throws", () => {
    const brains = new Map<string, ParsedBrain | null>([["housing-swfl", null]]);
    expect(() => buildRegistryTableMap(brains)).not.toThrow();
    expect(buildRegistryTableMap(brains).has("housing-swfl:housing_by_zip")).toBe(false);
  });

  test("a brain present but missing the referenced table id -> absent from the map", () => {
    const brains = new Map<string, ParsedBrain | null>([["housing-swfl", fakeBrain([])]]);
    expect(buildRegistryTableMap(brains).has("housing-swfl:housing_by_zip")).toBe(false);
  });

  test("a pack the registry never references is ignored even if present in the input map", () => {
    const brains = new Map<string, ParsedBrain | null>([
      [
        "some-unrelated-brain",
        fakeBrain([
          {
            id: "whatever",
            title: "t",
            grain: "zip",
            columns: [],
            rows: [],
            source: { url: "", fetched_at: "", tier: 1, citation: "" },
          },
        ]),
      ],
    ]);
    expect(buildRegistryTableMap(brains).size).toBe(0);
  });
});
