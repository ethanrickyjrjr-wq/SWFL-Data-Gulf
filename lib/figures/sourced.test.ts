// lib/figures/sourced.test.ts
import { describe, expect, test } from "bun:test";
import { getSourcedFigures, mapSourcedRows, sourcedFiguresPromptBlock } from "./sourced";

const ROW = {
  metric_key: "permits_90d",
  label: "New building permits issued in ZIP 33914 (Cape Coral), last 90 days",
  value_num: 412,
  value_text: "412",
  unit: null,
  source_name: "capecoral.gov",
  source_url: "https://www.capecoral.gov/permit-report",
  as_of: "2026-06-30",
};

describe("mapSourcedRows", () => {
  test("maps a row, preferring value_text, and formats as_of MM/DD/YYYY", () => {
    const [fig] = mapSourcedRows([ROW]);
    expect(fig).toEqual({
      key: "permits_90d",
      label: ROW.label,
      value: "412",
      source: "capecoral.gov",
      source_url: ROW.source_url,
      as_of: "06/30/2026",
    });
  });

  test("falls back to value_num + unit when value_text is null", () => {
    const [fig] = mapSourcedRows([{ ...ROW, value_text: null, value_num: 6.75, unit: "%" }]);
    expect(fig.value).toBe("6.75 %");
  });

  test("drops rows with neither value_text nor value_num", () => {
    expect(mapSourcedRows([{ ...ROW, value_text: null, value_num: null }])).toEqual([]);
  });
});

describe("sourcedFiguresPromptBlock", () => {
  test("empty figures → empty string (zero tokens added)", () => {
    expect(sourcedFiguresPromptBlock([])).toBe("");
  });

  test("lists label: value (source, as of date); no system nouns, no §", () => {
    const block = sourcedFiguresPromptBlock(mapSourcedRows([ROW]));
    expect(block).toContain(
      "- New building permits issued in ZIP 33914 (Cape Coral), last 90 days: 412 (capecoral.gov, as of 06/30/2026)",
    );
    expect(block).toContain("never invent a figure");
    expect(block).not.toContain("§");
    expect(block).not.toContain("master");
  });
});

describe("getSourcedFigures — empty-tolerant contract", () => {
  test("no creds → [] (never throws)", async () => {
    const saved = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      BRAINS_SUPABASE_URL: process.env.BRAINS_SUPABASE_URL,
      BRAINS_SUPABASE_SERVICE_KEY: process.env.BRAINS_SUPABASE_SERVICE_KEY,
    };
    for (const k of Object.keys(saved)) delete process.env[k];
    try {
      expect(await getSourcedFigures({ kind: "zip", key: "33914" })).toEqual([]);
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  });
});
