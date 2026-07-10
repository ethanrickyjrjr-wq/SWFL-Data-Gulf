import { describe, it, expect } from "vitest";
import {
  buildChartForIntent,
  vacancyChartSpecFromTable,
  zhviChartSpecFromRows,
  rentChartSpecFromRows,
  scatterChartSpecFromRows,
  corridorRowsAsOf,
  type CorridorProfileRow,
} from "./build-chart-for-intent.mts";
import type {
  ChartRow,
  ZHVITrendEntry,
  JoinedCorridorRow,
  CorridorPermitsEntry,
  CorridorCentroidEntry,
} from "@/types/viz";
import type { BrainOutputDetailTable } from "@/refinery/types/brain-output.mts";

// Live-shaped corridor_profiles rows (corridor_name is DISPLAY text; the
// permits join slugifies it via corridorKey → CORRIDOR_ALIASES).
const profileRow = (over: Partial<CorridorProfileRow> = {}): CorridorProfileRow => ({
  corridor_name: "Test Corridor",
  city: "Fort Myers",
  asking_rent_psf: 30,
  vacancy_rate_pct: 4,
  absorption_sqft: 1000,
  metrics_verified_date: "2026-07-07",
  updated_at: "2026-07-08T00:00:00Z",
  ...over,
});

// Deterministic stand-in for the live data_lake.zhvi_pivoted read (3 complete months).
const SAMPLE_ZHVI_ROWS: ChartRow[] = [
  { month: "2026-02", cape_coral: 380000, fort_myers: 360000, naples: 600000 },
  { month: "2026-03", cape_coral: 382000, fort_myers: 361000, naples: 605000 },
  { month: "2026-04", cape_coral: 384000, fort_myers: 362500, naples: 610000 },
];

// The disk-backed `fetchBrain` read (brains/cre-swfl.md) is exercised in
// production; here we unit-test the pure mapping `vacancyChartSpecFromTable`,
// which holds ALL the chart logic. That cre-swfl actually emits the table is
// proven deterministically in refinery/packs/cre-swfl.test.mts.
const SAMPLE_VACANCY_TABLE: BrainOutputDetailTable = {
  id: "corridor_vacancy",
  title: "SWFL CRE corridor vacancy rate",
  grain: "corridor",
  columns: [{ id: "vacancy_rate_pct", label: "Vacancy", display_format: "percent", units: "%" }],
  rows: [
    { key: "Estero Blvd Fort Myers Beach", label: "Estero Blvd", cells: { vacancy_rate_pct: 2.9 } },
    { key: "Pine Ridge Rd Naples", label: "Pine Ridge Rd", cells: { vacancy_rate_pct: 3.2 } },
    {
      key: "Lee Blvd Lehigh Acres",
      label: "Lee Blvd",
      cells: {
        vacancy_rate_pct: 0.2,
        coverage_note: "From the MarketBeat submarket survey — incomplete corridor-level coverage.",
      },
    },
    {
      key: "Gulf Coast Town Center",
      label: "Gulf Coast Town Center",
      cells: { vacancy_rate_pct: 7.7 },
    },
  ],
  source: {
    url: "https://x.supabase.co/rest/v1/corridor_profiles?select=corridor_name,vacancy_rate_pct",
    fetched_at: "2026-06-15T00:00:00Z",
    tier: 2,
    citation:
      "Brains Supabase corridor_profiles (verified, non-deleted) — vacancy_rate_pct per corridor. " +
      "27 of 27 corridors reporting. 2 flagged coverage_note draw on the incomplete MarketBeat submarket survey.",
  },
};

// buildChartForIntent now returns a ready ChartSpec (one normalization path).
// Frames that wrap a raw-array component carry the untouched typed array under
// `options.data` — these tests lock that the migration neither changed the data
// nor dropped fields (the regression target: scatter `permits.n_current`).

describe("buildChartForIntent → ChartSpec", () => {
  it("asking-rent maps from LIVE data: credless/empty env degrades to null, never a fixture", async () => {
    // buildRentChart now reads public.corridor_profiles (guarded); in a credless
    // env it returns null. In prod it returns a real spec with a real vintage.
    const r = await buildChartForIntent({ chart_type: "bar", scope: "asking-rent" });
    expect(r === null || (r.frameId === "bar-table" && r.asOf !== "2026-06-30")).toBe(true);
  });

  it("zhvi (pure mapper) → zhvi-area spec; raw series in options.data, all three columns", () => {
    // Pure mapping is tested directly (no I/O); the live data_lake.zhvi_pivoted read in
    // buildZhviChart is exercised in production (mirrors vacancyChartSpecFromTable).
    const r = zhviChartSpecFromRows(SAMPLE_ZHVI_ROWS, "2026-04");
    expect(r?.frameId).toBe("zhvi-area");
    const data = r?.options?.data as ZHVITrendEntry[] | undefined;
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(3);
    const e = data![0];
    expect(typeof e.month).toBe("string");
    expect(typeof e.cape_coral).toBe("number");
    expect(typeof e.fort_myers).toBe("number");
    expect(typeof e.naples).toBe("number");
  });

  it("zhvi asOf is the honest month-end ISO of the newest covered month", () => {
    const r = zhviChartSpecFromRows(SAMPLE_ZHVI_ROWS, "2026-04");
    expect(r?.asOf).toBe("2026-04-30");
    // Never the corridor sample's fabricated Jun 2026 keystone.
    expect(r?.asOf).not.toBe("2026-06-30");
  });

  it("zhvi maps from LIVE data: credless/empty env degrades to null, never a fixture", async () => {
    // buildZhviChart now reads data_lake.zhvi_pivoted via loadMetroTrend; in a credless test
    // env that returns empty → null. In prod (lake creds present) it returns a real spec.
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    expect(r === null || r.frameId === "zhvi-area").toBe(true);
  });

  it("zhvi (pure mapper) returns null when fewer than 3 complete months are present", () => {
    expect(zhviChartSpecFromRows(SAMPLE_ZHVI_ROWS.slice(0, 2), "2026-03")).toBeNull();
    expect(zhviChartSpecFromRows(SAMPLE_ZHVI_ROWS, undefined)).toBeNull();
  });

  it("corridor-scatter maps from LIVE data: credless/empty env degrades to null, never a fixture", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    expect(r === null || (r.frameId === "corridor-scatter" && r.asOf !== "2026-06-30")).toBe(true);
  });

  it("returns null for deferred vitals", async () => {
    expect(
      await buildChartForIntent({ chart_type: "bar", scope: "vitals", corridor_slug: "x" }),
    ).toBeNull();
  });

  it("returns null for flood-aal (no env detail_tables)", async () => {
    expect(await buildChartForIntent({ chart_type: "bar", scope: "flood-aal" })).toBeNull();
  });
});

describe("vacancyChartSpecFromTable (cre-swfl corridor_vacancy → ChartSpec)", () => {
  it("maps the detail_table to a bar-table spec, sorted high→low, percent format", () => {
    const r = vacancyChartSpecFromTable(SAMPLE_VACANCY_TABLE);
    expect(r?.frameId).toBe("bar-table");
    expect(r?.chart_type).toBe("bar");
    expect(r?.value_format).toBe("percent");
    expect(r?.rows.length).toBe(4);
    // sorted high→low, capped at 12; the 7.7 corridor leads, the 0.2 trails
    expect(r?.rows[0][1]).toBe(7.7);
    expect(r?.rows[r!.rows.length - 1][1]).toBe(0.2);
    // labels (display names) carry the corridor, not the raw key
    expect(r?.rows[0][0]).toBe("Gulf Coast Town Center");
  });

  it("derives asOf from the table's fetched_at, never the fabricated fixture keystone", () => {
    const r = vacancyChartSpecFromTable(SAMPLE_VACANCY_TABLE);
    expect(r?.asOf).toBe("2026-06-15");
    expect(r?.asOf).not.toBe("2026-06-30");
    expect(r?.source.citation).toMatch(/corridor_profiles/);
  });

  it("returns null when fewer than 3 corridors carry a numeric vacancy", () => {
    const thin: BrainOutputDetailTable = {
      ...SAMPLE_VACANCY_TABLE,
      rows: SAMPLE_VACANCY_TABLE.rows.slice(0, 2),
    };
    expect(vacancyChartSpecFromTable(thin)).toBeNull();
  });
});

describe("corridorRowsAsOf (real vintage, never a constant)", () => {
  it("takes the newest metrics_verified_date", () => {
    expect(
      corridorRowsAsOf([
        profileRow({ metrics_verified_date: "2026-07-01" }),
        profileRow({ metrics_verified_date: "2026-07-07" }),
      ]),
    ).toBe("2026-07-07");
  });

  it("falls back to newest updated_at when no metrics_verified_date", () => {
    expect(
      corridorRowsAsOf([
        profileRow({ metrics_verified_date: null, updated_at: "2026-07-08T12:00:00Z" }),
      ]),
    ).toBe("2026-07-08");
  });

  it("null when neither date exists (caller renders no chart)", () => {
    expect(corridorRowsAsOf([profileRow({ metrics_verified_date: null, updated_at: null })])).toBe(
      null,
    );
  });
});

describe("rentChartSpecFromRows (live corridor_profiles → bar spec)", () => {
  it("real vintage, real citation, sorted high→low, no fabricated stamp", () => {
    const spec = rentChartSpecFromRows([
      profileRow({ corridor_name: "A", asking_rent_psf: 60, metrics_verified_date: "2026-07-01" }),
      profileRow({ corridor_name: "B", asking_rent_psf: 40, metrics_verified_date: "2026-07-07" }),
      profileRow({ corridor_name: "C", asking_rent_psf: 20, metrics_verified_date: null }),
    ]);
    expect(spec).not.toBeNull();
    expect(spec!.frameId).toBe("bar-table");
    expect(spec!.asOf).toBe("2026-07-07"); // max verified date, NOT a constant
    expect(spec!.asOf).not.toBe("2026-06-30");
    expect(spec!.source.citation).toBe("SWFL Data Gulf verified corridor metrics");
    expect(spec!.rows[0][0]).toBe("A"); // sorted high→low rent
    expect(spec!.rows[0][1]).toBe(60);
  });

  it("null when fewer than 3 corridors carry a rent", () => {
    expect(
      rentChartSpecFromRows([
        profileRow(),
        profileRow({ asking_rent_psf: null }),
        profileRow({ asking_rent_psf: null }),
      ]),
    ).toBeNull();
  });
});

describe("scatterChartSpecFromRows (live rows + optional permit/centroid sidecars)", () => {
  // Real alias-covered corridors (CORRIDOR_ALIASES is an identity map of the
  // slugified corridor_name; corridorKey("Cape Coral Pkwy E") = "cape-coral-pkwy-e").
  const LIVE_ROWS: CorridorProfileRow[] = [
    profileRow({ corridor_name: "Cape Coral Pkwy E" }),
    profileRow({ corridor_name: "Daniels Pkwy", asking_rent_psf: 28, vacancy_rate_pct: 5.1 }),
    profileRow({
      corridor_name: "Cleveland Ave Fort Myers",
      asking_rent_psf: 24,
      vacancy_rate_pct: 6.2,
    }),
    profileRow({ corridor_name: "Pine Ridge Rd Naples", asking_rent_psf: 39.2 }),
  ];
  const PERMITS: CorridorPermitsEntry[] = [
    {
      corridor_id: "cape-coral-pkwy-e",
      headline_z: 1.2,
      n_current: 14,
      last_refined_at: "2026-07-01",
    },
    { corridor_id: "daniels-pkwy", headline_z: -0.4, n_current: 6, last_refined_at: "2026-07-01" },
    {
      corridor_id: "cleveland-ave-fort-myers",
      headline_z: 0.1,
      n_current: 9,
      last_refined_at: "2026-07-01",
    },
  ];
  const CENTROIDS: CorridorCentroidEntry[] = PERMITS.map((p) => ({
    corridor_id: p.corridor_id,
    corridor_label: p.corridor_id,
    center_lat: 26.5,
    center_lon: -81.9,
    submarket: "Lee",
  }));

  it("joins permits by slugified corridor_name; real vintage + citation on the spec", () => {
    const r = scatterChartSpecFromRows(LIVE_ROWS, PERMITS, CENTROIDS);
    expect(r).not.toBeNull();
    expect(r!.frameId).toBe("corridor-scatter");
    expect(r!.asOf).toBe("2026-07-07");
    expect(r!.source.citation).toBe("SWFL Data Gulf verified corridor metrics");
    const data = r!.options?.data as JoinedCorridorRow[];
    expect(data.length).toBe(4); // ALL rows pass through untouched
  });

  it("REGRESSION: preserves permits.n_current (the field flat-columns dropped)", () => {
    const r = scatterChartSpecFromRows(LIVE_ROWS, PERMITS, CENTROIDS);
    const data = (r?.options?.data as JoinedCorridorRow[]) ?? [];
    const covered = data.find((row) => row.permits != null);
    expect(covered).toBeDefined();
    expect(typeof covered!.permits!.n_current).toBe("number");
    expect(typeof covered!.permits!.headline_z).toBe("number");
  });

  it("REGRESSION: keeps no-coverage rows (permits === null) for the internal filter", () => {
    const r = scatterChartSpecFromRows(LIVE_ROWS, PERMITS, CENTROIDS);
    const data = (r?.options?.data as JoinedCorridorRow[]) ?? [];
    // Pine Ridge Rd Naples has no permits sidecar entry → null permits must survive.
    expect(data.some((row) => row.permits === null)).toBe(true);
  });

  it("null when fewer than 3 corridors are fully plottable (rent + vacancy + permits)", () => {
    expect(scatterChartSpecFromRows(LIVE_ROWS, [], [])).toBeNull();
  });
});
