// lib/should-i-sell/load-zip-soh.test.ts
import { describe, expect, test } from "bun:test";
import { loadZipSoh } from "./load-zip-soh";
import type { ParsedBrain } from "../../refinery/render/speaker.mts";

function brainWith(tableId: string, zip: string, pct: number | null): ParsedBrain {
  return {
    output: {
      detail_tables: [
        {
          id: tableId,
          title: "t",
          grain: "zip",
          columns: [],
          rows: [
            {
              key: zip,
              label: zip,
              cells: {
                parcel_count: 100,
                homesteaded_count: 60,
                median_jv: 300000,
                soh_gap_median_pct: pct,
              },
            },
          ],
          source: {
            url: "https://example.test/src",
            fetched_at: "2026-07-19T02:00:00Z",
            tier: 2,
            citation: "FDOR",
          },
        },
      ],
    },
  } as unknown as ParsedBrain;
}

describe("loadZipSoh", () => {
  test("Lee row maps with MM/DD/YYYY as-of", async () => {
    const r = await loadZipSoh("33904", ["Lee"], {
      loadBrain: async (slug) =>
        slug === "properties-lee-value" ? brainWith("lee_parcels_by_zip", "33904", 37.9) : null,
    });
    expect(r).not.toBeNull();
    expect(r!.county).toBe("Lee");
    expect(r!.sohGapMedianPct).toBe(37.9);
    expect(r!.homesteadedCount).toBe(60);
    expect(r!.source.asOf).toBe("07/19/2026");
  });
  test("ZIP missing from primary county's table falls through to the other county", async () => {
    const r = await loadZipSoh("34134", ["Collier"], {
      loadBrain: async (slug) =>
        slug === "properties-lee-value"
          ? brainWith("lee_parcels_by_zip", "34134", 30.1)
          : brainWith("collier_parcels_by_zip", "99999", 1),
    });
    expect(r!.county).toBe("Lee"); // straddle drift covered
  });
  test("null gap cell (no homesteaded parcels) → null line", async () => {
    const r = await loadZipSoh("33904", ["Lee"], {
      loadBrain: async () => brainWith("lee_parcels_by_zip", "33904", null),
    });
    expect(r).toBeNull();
  });
  test("brain unavailable → null", async () => {
    const r = await loadZipSoh("33904", ["Lee"], { loadBrain: async () => null });
    expect(r).toBeNull();
  });
});
