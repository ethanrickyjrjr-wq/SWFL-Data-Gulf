import { describe, it, expect } from "bun:test";
import { materializeLoad, mapSliceToBlock } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";

export const CORRIDOR_ROWS = [
  {
    corridor_name: "Alico Industrial",
    city: "Fort Myers",
    corridor_type: "industrial flex",
    evolution_direction: "growing",
    seasonal_index: 0.1,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 3.0,
    absorption_sqft: 185000,
    asking_rent_psf: 16.04,
    character: "Logistics.",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "Estero Blvd",
    city: "Fort Myers Beach",
    corridor_type: "beachfront",
    evolution_direction: "repositioning",
    seasonal_index: 0.88,
    cap_rate_pct: 8.3,
    vacancy_rate_pct: 7.7,
    absorption_sqft: -5000,
    asking_rent_psf: 60.84,
    character: "Rebuild.",
    metrics_verified_date: "2026-06-01",
  },
  {
    corridor_name: "Pine Ridge Rd",
    city: "Naples",
    corridor_type: "medical",
    evolution_direction: "stable",
    seasonal_index: 0.3,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 0.2,
    absorption_sqft: 28000,
    asking_rent_psf: 38.0,
    character: "Medical.",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "Immokalee Rd",
    city: "Naples",
    corridor_type: "strip",
    evolution_direction: "stable",
    seasonal_index: 0.45,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 4.2,
    absorption_sqft: 120500,
    asking_rent_psf: 42.5,
    character: "Gravity.",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "Cape Coral Pkwy",
    city: "Cape Coral",
    corridor_type: "suburban",
    evolution_direction: "growing",
    seasonal_index: 0.2,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 5.0,
    absorption_sqft: 32000,
    asking_rent_psf: 32.5,
    character: "Rooftops.",
    metrics_verified_date: "2026-05-22",
  },
];

describe("materializeLoad", () => {
  it("produces the defaultLayout as blocks with baked values + bindings; deterministic ids", async () => {
    const { blocks, asOf } = await materializeLoad(
      corridorProfiles,
      {},
      {
        sb: stubSb(CORRIDOR_ROWS),
        hostPng: async () => "https://cdn.example/chart.png",
      },
    );
    expect(asOf).toBe("06/01/2026");
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const b of blocks) {
      expect(b.binding?.lane).toBe("lake");
      expect(b.binding?.concoctionId).toBe("corridor-profiles");
      expect(b.binding?.asOf).toBe("06/01/2026");
      expect(b.id).toMatch(/^conc-corridor-profiles-\d+$/);
      expect(b.layout).toBeDefined();
    }
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("stats block bakes formatted values verbatim (top row by first measure)", () => {
    const spec = corridorProfiles.defaultLayout.find((s) => s.type === "stats")!;
    let n = 0;
    const block = mapSliceToBlock(
      corridorProfiles,
      CORRIDOR_ROWS as never,
      spec,
      () => `conc-corridor-profiles-${n++}`,
    )!;
    expect(block.type).toBe("stats");
    const stats = (block.props as { stats: { value: string; label: string }[] }).stats;
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats.length).toBeLessThanOrEqual(3);
    expect(stats.every((s) => s.value.length > 0)).toBe(true);
    // top row by asking_rent_psf = Estero Blvd → its values verbatim
    expect(stats[0].value).toBe("$60.84");
    expect(stats[1].value).toBe("7.7%");
  });
  it("list block: topN rows ordered by first measure desc, values formatted", () => {
    const spec = corridorProfiles.defaultLayout.find((s) => s.type === "list")!;
    let n = 0;
    const block = mapSliceToBlock(
      corridorProfiles,
      CORRIDOR_ROWS as never,
      spec,
      () => `x-${n++}`,
    )!;
    const items = (block.props as { items: { lead?: string; text: string }[] }).items;
    expect(items).toHaveLength(Math.min(spec.slice.topN ?? 6, CORRIDOR_ROWS.length));
    expect(items[0].text).toContain("Estero Blvd");
    expect(items[0].text).toContain("$60.84");
  });
  it("guard-failing chart slice degrades to a LIST of the same verbatim values, never a lying axis", () => {
    let n = 0;
    const spec = {
      type: "image" as const,
      slice: {
        measures: ["cap_rate_pct"],
        dimension: "corridor_name" as string | undefined,
        topN: 8,
      },
      layout: { x: 0, y: 0, w: 12, h: 6 },
    };
    const near = [...Array(22).fill(CORRIDOR_ROWS[0]), ...Array(3).fill(CORRIDOR_ROWS[1])];
    const block = mapSliceToBlock(corridorProfiles, near as never, spec, () => `y-${n++}`);
    expect(block).not.toBeNull();
    expect(block!.type).toBe("list");
    const items = (block!.props as { items: { text: string }[] }).items;
    expect(items[0].text).toContain("Cap rate");
  });
  it("chart failure (hosting unavailable) degrades in materializeLoad too — list in place of image", async () => {
    const { blocks } = await materializeLoad(
      corridorProfiles,
      {},
      {
        sb: stubSb(CORRIDOR_ROWS),
        hostPng: async () => {
          throw new Error("no host in test");
        },
      },
    );
    expect(blocks.some((b) => b.type === "image")).toBe(false);
    expect(blocks.filter((b) => b.type === "list").length).toBeGreaterThanOrEqual(2);
  });
  it("with hosting available the image slice renders as a real chart block", async () => {
    const { blocks } = await materializeLoad(
      corridorProfiles,
      {},
      {
        sb: stubSb(CORRIDOR_ROWS),
        hostPng: async (k) => `https://cdn/x/${k}`,
      },
    );
    const img = blocks.find((b) => b.type === "image");
    expect(img).toBeDefined();
    expect((img!.props as { kind?: string }).kind).toBe("chart");
    expect(img!.binding?.concoctionId).toBe("corridor-profiles");
  });
  it("empty rows → labeled throw", async () => {
    await expect(materializeLoad(corridorProfiles, {}, { sb: stubSb([]) })).rejects.toThrow(
      /no rows/i,
    );
  });
  it("sources block carries the def's citation + as-of note", () => {
    const spec = corridorProfiles.defaultLayout.find((s) => s.type === "sources")!;
    let n = 0;
    const block = mapSliceToBlock(
      corridorProfiles,
      CORRIDOR_ROWS as never,
      spec,
      () => `s-${n++}`,
    )!;
    const props = block.props as { sources: { label?: string }[]; note?: string };
    expect(props.sources[0].label).toBe("SWFL Data Gulf verified corridor metrics");
    expect(props.note).toBe("As of 06/01/2026");
  });
});
