import { describe, it, expect } from "bun:test";
import { buildChartBlock, chartKey } from "./chart-block";
import { corridorProfiles } from "./defs/corridor-profiles";
import { askingPriceTrend } from "./defs/asking-price-trend";

const CORRIDOR_ROWS = [
  {
    corridor_name: "A",
    asking_rent_psf: 16.04,
    vacancy_rate_pct: 3.0,
    city: "X",
    corridor_type: "t",
    evolution_direction: "g",
    seasonal_index: 0.1,
    cap_rate_pct: 6.7,
    absorption_sqft: 1,
    character: "",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "B",
    asking_rent_psf: 60.84,
    vacancy_rate_pct: 7.7,
    city: "Y",
    corridor_type: "t",
    evolution_direction: "r",
    seasonal_index: 0.8,
    cap_rate_pct: 8.3,
    absorption_sqft: 2,
    character: "",
    metrics_verified_date: "2026-05-22",
  },
];
const TREND_ROWS = [
  {
    metric_key: "median_asking_price",
    area: "cape_coral",
    period: "2026-06-01",
    value: 380000,
    unit: "usd",
    source_title: "t",
  },
  {
    metric_key: "median_asking_price",
    area: "cape_coral",
    period: "2026-07-01",
    value: 391500,
    unit: "usd",
    source_title: "t",
  },
];

describe("buildChartBlock", () => {
  it("categorical dimension → bar chart image block, hosted URL, provenance caption", async () => {
    const keys: string[] = [];
    const block = await buildChartBlock(
      corridorProfiles,
      CORRIDOR_ROWS as never,
      {
        type: "image",
        slice: { measures: ["asking_rent_psf"], dimension: "corridor_name", topN: 8 },
        layout: { x: 0, y: 0, w: 12, h: 6 },
      },
      {
        asOf: "05/22/2026",
        hostPng: async (k, buf) => {
          keys.push(k);
          expect(buf.byteLength).toBeGreaterThan(0);
          return `https://cdn/x/${k}`;
        },
      },
    );
    expect(block.type).toBe("image");
    const props = block.props as { url?: string; kind?: string; caption?: string };
    expect(props.kind).toBe("chart");
    expect(props.url).toContain("concoctions/corridor-profiles/");
    expect(props.caption).toContain("SWFL Data Gulf verified corridor metrics");
    expect(props.caption).toContain("As of 05/22/2026");
  });
  it("date dimension → trend chart; key is stable across identical calls", async () => {
    const keys: string[] = [];
    const host = async (k: string) => {
      keys.push(k);
      return `https://cdn/x/${k}`;
    };
    const spec = {
      type: "image" as const,
      slice: { measures: ["value"], dimension: "period" },
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };
    await buildChartBlock(askingPriceTrend, TREND_ROWS as never, spec, {
      asOf: "07/01/2026",
      hostPng: host,
    });
    await buildChartBlock(askingPriceTrend, TREND_ROWS as never, spec, {
      asOf: "07/01/2026",
      hostPng: host,
    });
    expect(keys[0]).toBe(keys[1]);
  });
  it("chartKey differs when params differ", () => {
    const spec = {
      type: "image" as const,
      slice: { measures: ["value"], dimension: "period" },
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };
    expect(chartKey("asking-price-trend", spec, { area: "cape_coral" })).not.toBe(
      chartKey("asking-price-trend", spec, { area: "naples" }),
    );
  });
  it("single point trend throws (materializer degrades it to list)", async () => {
    const spec = {
      type: "image" as const,
      slice: { measures: ["value"], dimension: "period" },
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };
    await expect(
      buildChartBlock(askingPriceTrend, [TREND_ROWS[0]] as never, spec, {
        asOf: "06/01/2026",
        hostPng: async () => "u",
      }),
    ).rejects.toThrow(/not enough points/);
  });
});
