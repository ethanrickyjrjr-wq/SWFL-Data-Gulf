import { describe, expect, it } from "bun:test";
import { assembleActivationReport } from "./snapshot";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";

// Minimal ParsedBrain fixtures. We return brains ONLY for housing-swfl + env-swfl
// and null for every other catalog brain, so the dossier fan-out resolves the two
// true-ZIP lines via its early-return branches (never touching toDisplayBrain).
function housingBrain(price: number, dom: number): ParsedBrain {
  return {
    brain_id: "housing-swfl",
    freshness_token: "SWFL-7421-v5-20260610",
    refined_at: "2026-06-10T00:00:00.000Z",
    output: {
      key_metrics: [],
      detail_tables: [
        {
          id: "housing_by_zip",
          grain: "zip",
          columns: [
            { id: "median_sale_price", label: "Median sale price", display_format: "currency" },
            { id: "median_dom", label: "Days on market", display_format: "count" },
          ],
          rows: [
            {
              key: "33931",
              cells: { median_sale_price: price, median_dom: dom, months_of_supply: 4, homes_sold: 22 },
            },
          ],
          source: { citation: "Redfin Data Center", url: "https://redfin.com/data" },
        },
      ],
    },
  } as unknown as ParsedBrain;
}

function envBrain(aal: number): ParsedBrain {
  return {
    brain_id: "env-swfl",
    freshness_token: "SWFL-7421-v5-20260610",
    refined_at: "2026-06-10T00:00:00.000Z",
    output: {
      key_metrics: [
        {
          metric: "swfl_zip_33931_flood_aal_usd_per_insured_property",
          label: "Flood average annual loss",
          value: aal,
          display_format: "currency",
          source: { citation: "FEMA NFIP", url: "https://fema.gov/nfip" },
        },
        {
          metric: "swfl_zip_33931_flood_aal_pct_swfl_rank",
          label: "SWFL flood percentile",
          value: 88,
          display_format: "count",
          source: { citation: "FEMA NFIP", url: "https://fema.gov/nfip" },
        },
      ],
      detail_tables: [],
    },
  } as unknown as ParsedBrain;
}

function loaderWith(price = 412000, dom = 45, aal = 30074) {
  return async (slug: string): Promise<ParsedBrain | null> => {
    if (slug === "housing-swfl") return housingBrain(price, dom);
    if (slug === "env-swfl") return envBrain(aal);
    return null;
  };
}

describe("assembleActivationReport — MOAT gate", () => {
  it("rejects an out-of-scope ZIP with an empty snapshot (never invents a number)", async () => {
    const r = await assembleActivationReport({ zip: "90210" }, { loadBrain: loaderWith() });
    expect(r.in_scope).toBe(false);
    expect(r.metrics).toHaveLength(0);
    expect(r.lines).toHaveLength(0);
    expect(r.snapshot.freshness_token).toBeNull();
  });
});

describe("assembleActivationReport — in-scope ZIP", () => {
  it("pulls per-ZIP housing + flood metrics and shapes the snapshot", async () => {
    const r = await assembleActivationReport(
      { zip: "33931" },
      { loadBrain: loaderWith(412000, 45, 30074), now: new Date("2026-06-10T12:00:00.000Z") },
    );
    expect(r.in_scope).toBe(true);
    expect(r.freshness_token).toBe("SWFL-7421-v5-20260610");

    const price = r.metrics.find((m) => m.key === "housing.median_sale_price");
    expect(price?.value).toBe(412000);
    expect(price?.display).toBe("$412,000");

    const dom = r.metrics.find((m) => m.key === "housing.median_dom");
    expect(dom?.value).toBe(45);
    expect(dom?.direction).toBe("lower_is_better");

    const aal = r.metrics.find((m) => m.key === "env.flood_aal_usd");
    expect(aal?.value).toBe(30074);

    // Snapshot mirrors the numeric metrics (no display string) + fingerprinted lines.
    expect(r.snapshot.captured_at).toBe("2026-06-10T12:00:00.000Z");
    expect(r.snapshot.metrics.find((m) => m.key === "housing.median_sale_price")?.value).toBe(412000);
    expect(r.snapshot.lines.every((l) => typeof l.fingerprint === "string")).toBe(true);
    expect(r.snapshot.lines.length).toBeGreaterThan(0);
  });

  it("re-assembly with moved numbers yields a snapshot that diffs to a real change", async () => {
    const v1 = await assembleActivationReport({ zip: "33931" }, { loadBrain: loaderWith(400000, 30, 30074) });
    const v2 = await assembleActivationReport({ zip: "33931" }, { loadBrain: loaderWith(412000, 45, 30074) });
    const p1 = v1.snapshot.metrics.find((m) => m.key === "housing.median_sale_price")!;
    const p2 = v2.snapshot.metrics.find((m) => m.key === "housing.median_sale_price")!;
    expect(p2.value! - p1.value!).toBe(12000);
  });
});
