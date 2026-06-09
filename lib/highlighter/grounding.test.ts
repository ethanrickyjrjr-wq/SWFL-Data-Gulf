import { test, expect } from "bun:test";
import { buildGroundingContext, type GroundingBlock } from "./grounding";
import { resolveMethod } from "../../refinery/lib/methodology-registry.mts";
import type { Dossier } from "../fetch-brain";

function fakeDossier(token: string, withZips = false): Dossier {
  return {
    freshness_token: token,
    conclusion: "Housing is cooling.",
    direction: "bearish",
    magnitude: 0.4,
    confidence: 0.7,
    confidence_dispersion: 0.1,
    joint_integrity: 0.9,
    upstream_count: 3,
    drivers: [],
    key_metrics: [
      {
        metric: "median_price",
        value: "$525,000",
        direction: "falling",
        label: "Median price",
        variable_type: "extensive",
        units: "USD",
        source: {
          url: "https://x",
          fetched_at: "2026-06-01",
          tier: 2,
          citation: "Redfin",
        },
      },
    ],
    detail_tables: withZips
      ? [
          {
            id: "housing_by_zip",
            title: "By ZIP",
            grain: "zip",
            columns: [
              {
                id: "median",
                label: "Median",
                display_format: "currency",
              },
            ],
            rows: [
              { key: "34102", label: "Naples", cells: { median: 1850000 } },
              { key: "33904", label: "Cape Coral", cells: { median: 410000 } },
            ],
            source: {
              url: "https://x",
              fetched_at: "2026-06-01",
              tier: 2,
              citation: "Redfin",
            },
          },
        ]
      : [],
    conditional_claims: [],
    grain_boundary: undefined,
    contradicts: [],
    caveats: [],
  };
}

test("primary freshness token is quoted exactly once", () => {
  const blocks: GroundingBlock[] = [
    { label: "Naples housing", dossier: fakeDossier("SWFL-7421-v5-20260607") },
  ];
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
  });
  const matches = ctx.match(/SWFL-7421-v5-20260607/g) ?? [];
  expect(matches.length).toBe(1);
});

test("detail_tables rows are inlined so cross-area compare is in-context (R0)", () => {
  const blocks: GroundingBlock[] = [
    {
      label: "Naples housing",
      dossier: fakeDossier("SWFL-7421-v5-20260607", true),
    },
  ];
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
  });
  expect(ctx).toContain("33904"); // Cape Coral row present even though page is Naples
  expect(ctx).toContain("1850000");
});

test("multiple blocks are labeled and ordered (reach blocks after primary)", () => {
  const blocks: GroundingBlock[] = [
    { label: "Naples housing", dossier: fakeDossier("SWFL-7421-v5-20260607") },
    {
      label: "Naples flood (env-swfl)",
      dossier: fakeDossier("SWFL-3000-v2-20260607"),
    },
  ];
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks,
  });
  expect(ctx.indexOf("Naples housing")).toBeLessThan(ctx.indexOf("Naples flood"));
});

test("floor: prompt forbids a dead-end and forbids guessing components", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  // The decline doctrine is gone — never instruct a dead-end.
  expect(ctx).not.toContain("DECLINE");
  expect(ctx.toLowerCase()).not.toContain("decline");
  // ...replaced by the offer-to-find + never-invent floor.
  expect(ctx.toLowerCase()).toContain("offer to find");
  expect(ctx).toContain("NEVER invent");
});

test("upgrade: an injected method entry renders held + need components", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
    method: resolveMethod("asking_rent_psf_median"),
  });
  expect(ctx).toContain("=== METHOD ===");
  expect(ctx).toContain("We HOLD");
  expect(ctx).toContain("We do NOT hold");
  // The anti-invention allowlist: the held base is named, the need-parts offered.
  expect(ctx).toContain("Property taxes");
});

test("no method entry => no METHOD block (floor path)", () => {
  const ctx = buildGroundingContext({
    rules: "RULES",
    gazetteer: "GEO",
    blocks: [{ label: "x", dossier: fakeDossier("t") }],
  });
  expect(ctx).not.toContain("=== METHOD ===");
});
