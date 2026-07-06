import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type {
  CommunitiesSwflSummary,
  CommunityProfileRow,
  NeighborhoodStatRow,
} from "../sources/communities-swfl-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { communitiesSwfl } = await import("./communities-swfl.mts");

const NOW = "2026-07-05T07:17:39Z";

function community(overrides: Partial<CommunityProfileRow>): CommunityProfileRow {
  return {
    community_slug: "x",
    label: "X",
    county: "Collier",
    home_count: null,
    gated: null,
    golf_structure: null,
    golf_holes: null,
    hoa_fee_min: null,
    hoa_fee_max: null,
    cdd_flag: null,
    pool: null,
    tennis: null,
    pickleball: null,
    fitness: null,
    clubhouse: null,
    on_site_dining: null,
    boating: null,
    drive_min_rsw: null,
    drive_min_beach: null,
    drive_min_downtown: null,
    drive_min_hospital: null,
    nearby_dining_count: null,
    source_url: "https://example.com/x",
    as_of: "2026-07-05",
    ...overrides,
  };
}

function neighborhood(overrides: Partial<NeighborhoodStatRow>): NeighborhoodStatRow {
  return {
    county: "Collier",
    subdivision_name: "X",
    home_count: 100,
    count_by_type: { "single-family": 100 },
    median_just_value: 400000,
    source_url: "https://example.com/nbhd",
    as_of: "2026-07-05",
    ...overrides,
  };
}

function makeFragment(
  communities: CommunityProfileRow[],
  neighborhoods: NeighborhoodStatRow[],
): RawFragment {
  let backbone: CommunitiesSwflSummary["backbone"] = null;
  if (neighborhoods.length > 0) {
    let total = 0;
    const byType: Record<string, number> = {};
    for (const n of neighborhoods) {
      total += n.home_count ?? 0;
      for (const [t, c] of Object.entries(n.count_by_type ?? {})) byType[t] = (byType[t] ?? 0) + c;
    }
    backbone = {
      total_homes: total,
      count_by_type: byType,
      subdivision_count: neighborhoods.length,
    };
  }
  const summary: CommunitiesSwflSummary = {
    kind: "communities-swfl-summary",
    communities,
    backbone,
    as_of: "2026-07-05",
    community_source_url: "fixture://community",
    neighborhood_source_url: "fixture://neighborhood",
  };
  return {
    fragment_id: "communities_swfl:summary:test",
    source_id: "communities_swfl",
    source_trust_tier: 2,
    fetched_at: NOW,
    raw: summary,
    normalized: summary,
  } as unknown as RawFragment;
}

test("communities-swfl: both tiers populated → all five headline metrics, every metric sourced", () => {
  const communities = [
    community({
      community_slug: "heritage-bay",
      label: "Heritage Bay",
      home_count: 1400,
      gated: true,
      golf_structure: "bundled",
      golf_holes: 27,
      hoa_fee_min: 8000,
      hoa_fee_max: 9500,
    }),
    community({
      community_slug: "pelican-bay",
      label: "Pelican Bay",
      home_count: 6500,
      gated: true,
      golf_structure: "equity",
      hoa_fee_min: 2900,
      hoa_fee_max: 4200,
    }),
  ];
  const neighborhoods = [
    neighborhood({ subdivision_name: "HERITAGE BAY", home_count: 1501 }),
    neighborhood({ subdivision_name: "PELICAN BAY", home_count: 6500 }),
  ];
  communitiesSwfl.corpusSummary!([makeFragment(communities, neighborhoods)]);
  const result = communitiesSwfl.outputProducer!({} as never);

  const slugs = result.key_metrics.map((m) => m.metric).sort();
  assert.deepEqual(slugs, [
    "golf_bundled_community_share_swfl",
    "homes_in_gated_communities_swfl",
    "marketed_communities_count_swfl",
    "median_hoa_fee_midpoint_swfl",
    "total_homes_catalogued_swfl",
  ]);
  const total = result.key_metrics.find((m) => m.metric === "total_homes_catalogued_swfl");
  assert.equal(total?.value, 8001);
  const gated = result.key_metrics.find((m) => m.metric === "homes_in_gated_communities_swfl");
  assert.equal(gated?.value, 7900);
  const share = result.key_metrics.find((m) => m.metric === "golf_bundled_community_share_swfl");
  assert.equal(share?.value, 50); // 1 of 2 golf communities bundled
  const hoa = result.key_metrics.find((m) => m.metric === "median_hoa_fee_midpoint_swfl");
  assert.equal(hoa?.value, 6150); // median of midpoints 8750 & 3550 → mean = 6150
  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  for (const m of result.key_metrics) {
    assert.ok(m.source?.url, `metric ${m.metric} must carry a source url`);
    assert.ok(m.source?.citation, `metric ${m.metric} must carry a citation`);
  }
});

test("communities-swfl: marketed catalog rides in detail_tables keyed by community slug", () => {
  const communities = [
    community({
      community_slug: "heritage-bay",
      label: "Heritage Bay",
      home_count: 1400,
      gated: true,
    }),
  ];
  communitiesSwfl.corpusSummary!([makeFragment(communities, [neighborhood({})])]);
  const result = communitiesSwfl.outputProducer!({} as never);
  const catalog = result.detail_tables?.find((t) => t.id === "marketed_communities");
  assert.ok(catalog, "expected a marketed_communities detail table");
  assert.equal(catalog!.grain, "community");
  const row = catalog!.rows.find((r) => r.key === "heritage-bay");
  assert.ok(row, "expected the heritage-bay row");
  assert.equal(row!.cells.gated, true);
  assert.equal(row!.cells.home_count, 1400);
});

test("communities-swfl: backbone only (no community_profiles) → only the Tier-1 metric, no faked Tier-2", () => {
  communitiesSwfl.corpusSummary!([makeFragment([], [neighborhood({ home_count: 300 })])]);
  const result = communitiesSwfl.outputProducer!({} as never);
  const slugs = result.key_metrics.map((m) => m.metric);
  assert.deepEqual(slugs, ["total_homes_catalogued_swfl"]);
  assert.ok(!result.detail_tables || result.detail_tables.length === 0);
});

test("communities-swfl: all-null Tier-2 columns never fake a gated/golf/HOA metric", () => {
  // seed rows exist (Phase-1 T5) but golf/fee/gated not yet grafted (Phase 2/3 pending)
  const communities = [
    community({ community_slug: "a", label: "A" }),
    community({ community_slug: "b", label: "B" }),
  ];
  communitiesSwfl.corpusSummary!([makeFragment(communities, [neighborhood({})])]);
  const result = communitiesSwfl.outputProducer!({} as never);
  const slugs = result.key_metrics.map((m) => m.metric).sort();
  // count metric emits (2 communities), but gated/golf/hoa stay suppressed
  assert.ok(slugs.includes("marketed_communities_count_swfl"));
  assert.ok(!slugs.includes("homes_in_gated_communities_swfl"), "no gated homes faked");
  assert.ok(!slugs.includes("golf_bundled_community_share_swfl"), "no golf share faked");
  assert.ok(!slugs.includes("median_hoa_fee_midpoint_swfl"), "no HOA midpoint faked");
});

test("communities-swfl: zero-data path returns neutral with no metrics", () => {
  communitiesSwfl.corpusSummary!([makeFragment([], [])]);
  const result = communitiesSwfl.outputProducer!({} as never);
  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  assert.equal(result.key_metrics.length, 0);
});

test("communities-swfl: empty fragment list → neutral no-data brain", () => {
  communitiesSwfl.corpusSummary!([]);
  const result = communitiesSwfl.outputProducer!({} as never);
  assert.equal(result.direction, "neutral");
  assert.equal(result.key_metrics.length, 0);
});
