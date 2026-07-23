import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildSnapshot, buildConclusionProse } from "./permits-swfl.mts";
import { permitsSwfl } from "./permits-swfl.mts";
import type { LeePermitRow, NormalizedPermitRow } from "../sources/permits-source.mts";
import type { CorridorCentroid } from "../lib/corridor-assignment.mts";
import type { PermitsSnapshot } from "./permits-swfl.mts";
import { readFileSync } from "node:fs";
import path from "node:path";

const NOW = new Date("2026-05-22T00:00:00Z");
const TEST_FIXTURE_DIR = path.resolve(import.meta.dirname, "..", "__fixtures__");
const PROD_FIXTURE_DIR = path.resolve(import.meta.dirname, "..", "..", "fixtures");

function leeToNormalized(row: LeePermitRow): NormalizedPermitRow {
  return {
    permit_uid: `lee:${row.permit_id}`,
    county: "lee",
    issued_date: row.issued_date,
    bucket: row.bucket,
    address: row.address,
    zip_code: row.zip_code,
    lat: row.lat,
    lon: row.lon,
    declared_value_usd: row.declared_value_usd,
    status: row.status,
    permit_type_raw: row.permit_type_raw,
    permit_description_raw: row.permit_description_raw,
  };
}

function loadFixtures(): {
  permits: NormalizedPermitRow[];
  rawLee: LeePermitRow[];
  corridors: CorridorCentroid[];
} {
  const rawLee: LeePermitRow[] = JSON.parse(
    readFileSync(path.join(TEST_FIXTURE_DIR, "permits-swfl.sample.json"), "utf-8"),
  );
  const corridors = JSON.parse(
    readFileSync(path.join(PROD_FIXTURE_DIR, "corridor-centroids.json"), "utf-8"),
  );
  return { permits: rawLee.map(leeToNormalized), rawLee, corridors };
}

describe("permits-swfl buildSnapshot", () => {
  it("produces per-(corridor, bucket) cells with z-scores", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    expect(snap.corridor_cells.length).toBeGreaterThan(0);
    for (const cell of snap.corridor_cells) {
      expect(cell.corridor_id).toBeTruthy();
      expect([
        "commercial_new",
        "commercial_alteration",
        "residential",
        "demolition",
        "other",
      ]).toContain(cell.bucket);
      expect(typeof cell.z).toBe("number");
      expect(Number.isFinite(cell.z)).toBe(true);
      expect(typeof cell.n_current).toBe("number");
      expect(["lee", "collier"]).toContain(cell.county);
    }
  });

  it("produces per-(zip, bucket) cells with z-scores and county field", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    expect(snap.zip_cells.length).toBeGreaterThan(0);
    for (const cell of snap.zip_cells) {
      expect(cell.zip_code).toMatch(/^\d{5}$/);
      expect(["lee", "collier"]).toContain(cell.county);
    }
  });

  it("excludes null zip_code permits from zip_cells (null guard)", () => {
    const { permits, corridors } = loadFixtures();
    // Inject a permit with null zip_code — it must NOT appear in zip_cells.
    const nullZipPermit: NormalizedPermitRow = {
      permit_uid: "collier:NULL_ZIP_TEST",
      county: "collier",
      issued_date: "2026-04-01",
      bucket: "commercial_new",
      address: "123 Test St, Naples",
      zip_code: null,
      lat: 26.14,
      lon: -81.79,
      declared_value_usd: 500000,
      status: "Issued",
      permit_type_raw: "New Construction",
      permit_description_raw: null,
    };
    const snap = buildSnapshot([...permits, nullZipPermit], corridors, NOW);
    // No zip_cell should have a null or undefined zip_code.
    for (const cell of snap.zip_cells) {
      expect(cell.zip_code).toBeTruthy();
      expect(cell.zip_code).toMatch(/^\d{5}$/);
    }
    // And the null-zip permit must not have injected a falsy-key cell.
    expect(snap.zip_cells.every((c) => c.zip_code !== null && c.zip_code !== "null")).toBe(true);
  });

  it("emits SWFL + Lee + Collier saturation indices in [0, 1]", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    for (const v of [
      snap.swfl_saturation_index,
      snap.lee_saturation_index,
      snap.collier_saturation_index,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("emits a finite SWFL + Lee weighted z (Collier 0 when only Lee fixture supplied)", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    expect(Number.isFinite(snap.swfl_weighted_z)).toBe(true);
    expect(Number.isFinite(snap.lee_weighted_z)).toBe(true);
    expect(Number.isFinite(snap.collier_weighted_z)).toBe(true);
    // Lee-only fixture should yield zero Collier rows and a zero Collier weighted z.
    expect(snap.collier_row_count).toBe(0);
    expect(snap.collier_weighted_z).toBe(0);
  });

  it("counts low-n cells for caveat aggregation", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    expect(typeof snap.low_n_cell_count).toBe("number");
    expect(snap.low_n_cell_count).toBeGreaterThanOrEqual(0);
    expect(snap.total_cell_count).toBeGreaterThanOrEqual(snap.low_n_cell_count);
  });

  it("computes thin_corridor_share in [0, 1]", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    expect(snap.thin_corridor_share).toBeGreaterThanOrEqual(0);
    expect(snap.thin_corridor_share).toBeLessThanOrEqual(1);
  });

  it("computes backfill_days from earliest issued_date in input", () => {
    const { permits, corridors } = loadFixtures();
    const snap = buildSnapshot(permits, corridors, NOW);
    expect(snap.backfill_days).toBeGreaterThan(0);
  });
});

describe("permitsOutputProducer (via pack)", () => {
  beforeAll(() => {
    process.env.REFINERY_SOURCE = "fixture";
  });
  afterAll(() => {
    delete process.env.REFINERY_SOURCE;
  });

  it("returns BrainOutputProducerResult with locked-enum direction + Lee + SWFL metrics", () => {
    const { permits, rawLee } = loadFixtures();

    const fragments = rawLee.map((r, i) => ({
      fragment_id: `lee_building_permits::${r.permit_id}`,
      source_id: "lee_building_permits",
      source_trust_tier: 1 as const,
      fetched_at: NOW.toISOString(),
      raw: {
        permit_id: r.permit_id,
        issued_date: r.issued_date,
        bucket: r.bucket,
      },
      normalized: permits[i],
    }));
    permitsSwfl.corpusSummary!(fragments);

    const result = permitsSwfl.outputProducer!({} as never);
    expect(["bullish", "bearish", "neutral", "mixed"]).toContain(result.direction);
    expect(result.magnitude).toBeGreaterThanOrEqual(0);
    expect(result.magnitude).toBeLessThanOrEqual(1);
    expect(result.key_metrics.some((m) => m.metric === "permits_lee_saturation_index")).toBe(true);
    expect(
      result.key_metrics.some((m) => m.metric === "permits_lee_county_weighted_avg_corridor_z"),
    ).toBe(true);
    expect(result.key_metrics.some((m) => m.metric === "permits_swfl_saturation_index")).toBe(true);
    expect(
      result.key_metrics.some((m) => m.metric === "permits_swfl_county_weighted_avg_corridor_z"),
    ).toBe(true);
    // Collier metrics should be absent when the Lee-only fixture is loaded.
    expect(
      result.key_metrics.some((m) => m.metric === "permits_collier_county_weighted_avg_corridor_z"),
    ).toBe(false);
  });
});

describe("permitsSidecarProducer (via pack)", () => {
  beforeAll(() => {
    process.env.REFINERY_SOURCE = "fixture";
  });
  afterAll(() => {
    delete process.env.REFINERY_SOURCE;
  });

  it("emits per-corridor headline_z weighted by n_current across non-other buckets", async () => {
    const { permits, rawLee } = loadFixtures();
    const fragments = rawLee.map((r, i) => ({
      fragment_id: `lee_building_permits::${r.permit_id}`,
      source_id: "lee_building_permits",
      source_trust_tier: 1 as const,
      fetched_at: new Date().toISOString(),
      raw: {
        permit_id: r.permit_id,
        issued_date: r.issued_date,
        bucket: r.bucket,
      },
      normalized: permits[i],
    }));
    permitsSwfl.corpusSummary!(fragments);

    const sidecars = await permitsSwfl.sidecarProducer!({} as never, fragments);
    expect(sidecars).toHaveLength(1);
    expect(sidecars[0].name).toBe("corridor-permits");

    const rows = sidecars[0].data as Array<{
      corridor_id: string;
      headline_z: number;
      n_current: number;
      last_refined_at: string;
    }>;
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(typeof row.corridor_id).toBe("string");
      expect(Number.isFinite(row.headline_z)).toBe(true);
      expect(row.n_current).toBeGreaterThanOrEqual(10);
      expect(row.last_refined_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // alphabetical, no duplicates
    const ids = rows.map((r) => r.corridor_id);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns empty array when no snapshot is available (Accela 0-fact run)", async () => {
    permitsSwfl.corpusSummary!([]);
    const sidecars = await permitsSwfl.sidecarProducer!({} as never, []);
    expect(sidecars).toEqual([]);
  });

  it("threads snapshot backfill_days onto every emitted row (so CorridorRentChart can render the narrower trailing-window caveat instead of hardcoding 365d)", async () => {
    // Synthetic, wall-clock-relative permits (not the aging sample fixture) so
    // this test stays deterministic as real time passes: 15 commercial_new
    // permits at a real corridor centroid, spread across the last 30 days,
    // clearing LOW_N_THRESHOLD for that (corridor, bucket) cell regardless of
    // when this test runs.
    const { corridors } = loadFixtures();
    const centroid = corridors.find((c) => c.corridor_id === "ben-hill-griffin-pkwy");
    if (!centroid) throw new Error("fixture missing ben-hill-griffin-pkwy centroid");

    const now = new Date();
    const synthetic: NormalizedPermitRow[] = Array.from({ length: 15 }, (_, i) => ({
      permit_uid: `synthetic:backfill-days-test:${i}`,
      county: "lee",
      issued_date: new Date(now.getTime() - i * 2 * 86400_000).toISOString().slice(0, 10),
      bucket: "commercial_new",
      address: null,
      zip_code: "33928",
      lat: centroid.center_lat,
      lon: centroid.center_lon,
      declared_value_usd: 100_000,
      status: "Issued",
      permit_type_raw: "New Construction",
      permit_description_raw: null,
    }));

    const fragments = synthetic.map((p, i) => ({
      fragment_id: `lee_building_permits::synthetic-${i}`,
      source_id: "lee_building_permits",
      source_trust_tier: 1 as const,
      fetched_at: now.toISOString(),
      raw: { permit_id: `synthetic-${i}`, issued_date: p.issued_date, bucket: p.bucket },
      normalized: p,
    }));
    permitsSwfl.corpusSummary!(fragments);

    const sidecars = await permitsSwfl.sidecarProducer!({} as never, fragments);
    const rows = sidecars[0].data as Array<{ corridor_id: string; backfill_days: number }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.backfill_days).toBe("number");
      expect(Number.isFinite(row.backfill_days)).toBe(true);
      expect(row.backfill_days).toBeGreaterThanOrEqual(0);
    }
    const row = rows.find((r) => r.corridor_id === "ben-hill-griffin-pkwy");
    expect(row).toBeDefined();
    // Earliest synthetic permit is 28 days back — backfill_days should reflect that,
    // not a hardcoded 365.
    expect(row!.backfill_days).toBeLessThan(365);
    expect(row!.backfill_days).toBeGreaterThanOrEqual(27);
  });
});

// Finding #22 (checks: sa0718_internal_build_notes_leak_into_the_served_) — the
// customer-facing conclusion prose must never carry engineering/build-system
// vocabulary ("current build", "this build", "SWFL rollup"). Those phrases are
// meaningless to a reader and were shipped verbatim to the live site.
function baseSnapshot(overrides: Partial<PermitsSnapshot> = {}): PermitsSnapshot {
  return {
    corridor_cells: [],
    zip_cells: [],
    swfl_weighted_z: 0.41,
    lee_weighted_z: 0.41,
    collier_weighted_z: 0,
    swfl_saturation_index: 0.1,
    lee_saturation_index: 0.1,
    collier_saturation_index: 0,
    top_heating_lee_alt: [],
    top_heating_lee_new: [],
    top_cooling_lee_alt: [],
    top_cooling_lee_new: [],
    top_heating_swfl_alt: [],
    top_heating_swfl_new: [],
    top_cooling_swfl_alt: [],
    top_cooling_swfl_new: [],
    low_n_cell_count: 0,
    total_cell_count: 0,
    thin_corridor_share: 0,
    backfill_days: 90,
    collier_backfill_months: 0,
    lee_backfill_months: 6,
    lee_row_count: 40,
    collier_row_count: 0,
    lee_max_issued_date: "2026-05-20",
    collier_max_issued_date: null,
    storm_caveat_fires: false,
    ...overrides,
  };
}

describe("buildConclusionProse — no build-system vocabulary leaks to the reader (finding #22)", () => {
  it("collier-empty branch never mentions 'this build' or 'SWFL rollup'", () => {
    const snap = baseSnapshot({ collier_row_count: 0, collier_max_issued_date: null });
    const prose = buildConclusionProse(snap, NOW);
    expect(prose).not.toMatch(/\bthis build\b/i);
    expect(prose).not.toMatch(/\bSWFL rollup\b/i);
    // The reader-facing meaning must survive the reword: Collier is absent.
    expect(prose).toMatch(/Collier/i);
  });

  it("collier-stale branch never mentions 'current build' or 'SWFL rollup'", () => {
    const snap = baseSnapshot({
      collier_row_count: 12,
      collier_max_issued_date: "2026-02-01", // > COLLIER_STALE_DAYS (60d) before NOW (2026-05-22)
    });
    const prose = buildConclusionProse(snap, NOW);
    expect(prose).not.toMatch(/\bcurrent build\b/i);
    expect(prose).not.toMatch(/\bSWFL rollup\b/i);
    // The reader-facing meaning must survive the reword: the stale date + the
    // fact that Collier is excluded from this read.
    expect(prose).toMatch(/2026-02-01|02\/01\/2026/);
    expect(prose).toMatch(/Collier/i);
  });
});
