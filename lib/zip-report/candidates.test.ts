// lib/zip-report/candidates.test.ts
import { describe, expect, test } from "bun:test";
import {
  buildZipCandidates,
  buildRegistryCandidates,
  type CandidateInput,
  type RegistryTableData,
} from "./candidates";

function tableMap(entries: Record<string, RegistryTableData>): Map<string, RegistryTableData> {
  return new Map(Object.entries(entries));
}

function baseInput(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    zip: "33914",
    registryTables: new Map(),
    floodRows: [],
    floodForZip: null,
    permitsCounts: new Map(),
    censusValues: [],
    censusDistribution: new Map(),
    ...over,
  };
}

const HOUSING_TABLE: RegistryTableData = {
  rows: [
    {
      key: "33914",
      cells: {
        median_sale_price: 485_000,
        median_sale_price_yoy_pct: 18,
        median_dom: 60,
        median_dom_yoy_days: 12,
        homes_sold: 90,
        inventory: 300,
        months_of_supply: 5,
        avg_sale_to_list_pct: 96,
      },
    },
    {
      key: "33901",
      cells: {
        median_sale_price: 300_000,
        median_sale_price_yoy_pct: null,
        median_dom: 40,
        median_dom_yoy_days: null,
        homes_sold: 50,
        inventory: 100,
        months_of_supply: 3,
        avg_sale_to_list_pct: 97,
      },
    },
    {
      key: "34102",
      cells: {
        median_sale_price: 900_000,
        median_sale_price_yoy_pct: 2,
        median_dom: 80,
        median_dom_yoy_days: -5,
        homes_sold: 20,
        inventory: 200,
        months_of_supply: 8,
        avg_sale_to_list_pct: 94,
      },
    },
  ],
};

describe("buildZipCandidates — housing (via the registry)", () => {
  test("price candidate: percentile from the all-ZIP distribution + YoY movement restated", () => {
    const { candidates } = buildZipCandidates(
      baseInput({ registryTables: new Map([["housing-swfl:housing_by_zip", HOUSING_TABLE]]) }),
    );
    const price = candidates.find((c) => c.key === "median_sale_price")!;
    expect(price.covered).toBe(true);
    expect(price.percentile).toBe(50);
    expect(price.rankPos).toBe(2);
    expect(price.rankOf).toBe(3);
    expect(price.movementPct).toBe(18);
    expect(price.movementText).toBe("↑ 18% YoY");
    expect(price.display).toBe("$485K");
  });

  test("DOM movement % derives from held days delta: 12 days on a 48-day prior = +25%", () => {
    const { candidates } = buildZipCandidates(
      baseInput({ registryTables: new Map([["housing-swfl:housing_by_zip", HOUSING_TABLE]]) }),
    );
    const dom = candidates.find((c) => c.key === "median_dom")!;
    expect(dom.movementPct).toBe(25);
    expect(dom.movementText).toBe("↑ 12 days YoY");
  });

  test("a widened-pool concept (e.g. rent_index_latest) rides the same registry path", () => {
    const { candidates } = buildZipCandidates(
      baseInput({
        registryTables: new Map([
          [
            "rentals-swfl:rentals_by_zip",
            { rows: [{ key: "33914", cells: { rent_index_latest: 2100, rent_yoy_pct: 4 } }] },
          ],
        ]),
      }),
    );
    const rent = candidates.find((c) => c.key === "rent_index_latest")!;
    expect(rent.display).toBe("$2K/mo");
    expect(rent.movementText).toBe("↑ 4% YoY");
  });
});

describe("buildZipCandidates — flood", () => {
  test("flood candidate ranks from the all-ZIP table rows", () => {
    const floodRows = [
      { zip: "33914", aal: 500, pctRank: null },
      { zip: "33931", aal: 30_000, pctRank: null },
      { zip: "33901", aal: 100, pctRank: null },
    ];
    const { candidates } = buildZipCandidates(baseInput({ floodRows, floodForZip: floodRows[0] }));
    const flood = candidates.find((c) => c.key === "flood_aal")!;
    expect(flood.covered).toBe(true);
    expect(flood.percentile).toBe(50);
    expect(flood.rankPos).toBe(2);
    expect(flood.rankOf).toBe(3);
  });

  test("key_metrics fallback (no table rows): held pct_rank used, rankOf = 57", () => {
    const { candidates } = buildZipCandidates(
      baseInput({ floodRows: [], floodForZip: { zip: "33914", aal: 500, pctRank: 89.29 } }),
    );
    const flood = candidates.find((c) => c.key === "flood_aal")!;
    expect(flood.percentile).toBe(89);
    expect(flood.rankOf).toBe(57);
  });

  test("no flood data at all → no flood candidate (it doesn't compete)", () => {
    const { candidates } = buildZipCandidates(baseInput());
    expect(candidates.find((c) => c.key === "flood_aal")).toBeUndefined();
  });
});

describe("buildZipCandidates — permits + gaps", () => {
  test("covered permits ZIP → candidate, no gap", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({
        zip: "33901",
        permitsCounts: new Map([
          ["33901", 120],
          ["33914", 0],
          ["33903", 40],
        ]),
      }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")?.covered).toBe(true);
    expect(gaps).toEqual([]);
  });

  test("city-permitted ZIP with zero Accela rows → Find-it gap slot, no candidate", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({ zip: "33914", permitsCounts: new Map([["33901", 120]]) }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")).toBeUndefined();
    expect(gaps.length).toBe(1);
    expect(gaps[0].metric_key).toBe("permits_90d");
    expect(gaps[0].coverage.name).toBe("City of Cape Coral permitting");
  });

  test("non-city ZIP with zero permits → no candidate AND no gap (not allowlisted)", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({ zip: "33901", permitsCounts: new Map() }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")).toBeUndefined();
    expect(gaps).toEqual([]);
  });
});

describe("buildZipCandidates — thin permit counts (the 33993 one-permit crowning, 07/12/2026)", () => {
  test("city-permitted ZIP with a stray trace count → Find-it gap slot, NOT an n=1 candidate", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({
        zip: "33914",
        permitsCounts: new Map([
          ["33914", 1],
          ["33901", 120],
        ]),
      }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")).toBeUndefined();
    expect(gaps.length).toBe(1);
    expect(gaps[0].coverage.name).toBe("City of Cape Coral permitting");
  });

  test("33993 is a Cape Coral city-permitting ZIP — zero rows → gap slot, never invisible", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({ zip: "33993", permitsCounts: new Map([["33901", 120]]) }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")).toBeUndefined();
    expect(gaps.length).toBe(1);
    expect(gaps[0].coverage.name).toBe("City of Cape Coral permitting");
  });

  test("city-permitted ZIP with a real count (city feed landed) competes normally", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({
        zip: "33914",
        permitsCounts: new Map([
          ["33914", 80],
          ["33901", 120],
        ]),
      }),
    );
    const p = candidates.find((c) => c.key === "permits_90d");
    expect(p?.covered).toBe(true);
    expect(p?.sampleThin).toBeFalsy();
    expect(gaps).toEqual([]);
  });

  test("non-city ZIP with a tiny count still shows the card but is sampleThin + never lead-eligible", () => {
    const { candidates } = buildZipCandidates(
      baseInput({
        zip: "33901",
        permitsCounts: new Map([
          ["33901", 2],
          ["33903", 40],
          ["33916", 15],
        ]),
      }),
    );
    const p = candidates.find((c) => c.key === "permits_90d")!;
    expect(p.sampleThin).toBe(true);
    expect(p.leadEligible).toBe(false);
    expect(p.display).toBe("2");
  });
});

describe("buildRegistryCandidates — thinBelow floor on count metrics", () => {
  test("commercial permits below the floor → sampleThin + not lead-eligible; healthy peer unaffected", () => {
    const tables = tableMap({
      "permits-commercial-swfl:commercial_permits_by_zip": {
        rows: [
          { key: "33914", cells: { count: 1 } },
          { key: "33901", cells: { count: 30 } },
          { key: "34102", cells: { count: 12 } },
        ],
        source: { label: "Lee County", url: "https://example.com" },
      },
    });
    const thin = buildRegistryCandidates("33914", tables).candidates.find(
      (c) => c.key === "commercial_permits",
    )!;
    expect(thin.sampleThin).toBe(true);
    expect(thin.leadEligible).toBe(false);
    const healthy = buildRegistryCandidates("33901", tables).candidates.find(
      (c) => c.key === "commercial_permits",
    )!;
    expect(healthy.sampleThin).toBeFalsy();
    expect(healthy.leadEligible).not.toBe(false);
  });
});

describe("buildZipCandidates — census", () => {
  test("census value gets percentile from its SWFL distribution", () => {
    const { candidates } = buildZipCandidates(
      baseInput({
        censusValues: [
          {
            key: "median_household_income",
            label: "Median household income",
            value: 90_000,
            display: "$90,000",
            sourceLabel: "U.S. Census ACS 5-year (2019–2023)",
            sourceUrl: "https://data.census.gov/",
          },
        ],
        censusDistribution: new Map([
          ["median_household_income", [40_000, 60_000, 90_000, 120_000]],
        ]),
      }),
    );
    const inc = candidates.find((c) => c.key === "median_household_income")!;
    expect(inc.percentile).toBe(67);
    expect(inc.rankPos).toBe(2);
    expect(inc.rankOf).toBe(4);
    expect(inc.movementPct).toBeNull();
  });
});

// --------------------------------------------------------------------------
// buildRegistryCandidates — concept-deduped registry (spec 2026-07-03
// zip-hero-pool-all-brains). Standalone in this task; wired into
// buildZipCandidates in the next task.
// --------------------------------------------------------------------------

describe("buildRegistryCandidates — concept dedup", () => {
  test("housing-swfl's median_sale_price competes; a same-concept demoted column from another pack does NOT produce a second candidate", () => {
    const { candidates } = buildRegistryCandidates(
      "33914",
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [
            { key: "33914", cells: { median_sale_price: 485_000, median_sale_price_yoy_pct: 18 } },
            {
              key: "33901",
              cells: { median_sale_price: 300_000, median_sale_price_yoy_pct: null },
            },
          ],
          source: { label: "MLS", url: "https://example.com/mls" },
        },
        "active-listings-swfl:active_listings_by_zip": {
          rows: [{ key: "33914", cells: { median_list_price: 499_000 } }],
          source: { label: "realtor.com", url: "https://realtor.com" },
        },
      }),
    );
    expect(candidates.filter((c) => c.key === "median_sale_price")).toHaveLength(1);
    expect(candidates.find((c) => c.key === "median_list_price")).toBeUndefined();
  });

  test("the demoted column lands in railContext under the winning concept, cited with its own source", () => {
    const { railContext } = buildRegistryCandidates(
      "33914",
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [{ key: "33914", cells: { median_sale_price: 485_000 } }],
        },
        "active-listings-swfl:active_listings_by_zip": {
          rows: [{ key: "33914", cells: { median_list_price: 499_000 } }],
          source: { label: "realtor.com", url: "https://realtor.com" },
        },
      }),
    );
    const demoted = railContext.get("home_value");
    expect(demoted).toHaveLength(1);
    expect(demoted![0].display).toBe("$499K");
    expect(demoted![0].sourceLabel).toBe("realtor.com");
  });

  test("assessed_value is absent for a ZIP with no row in either county's parcel table — not a fake zero", () => {
    const { candidates } = buildRegistryCandidates(
      "33914", // Lee ZIP, but no Lee table held in this map
      tableMap({
        "properties-collier-value:collier_parcels_by_zip": {
          rows: [{ key: "34102", cells: { median_jv: 900_000 } }], // Naples, Collier
        },
      }),
    );
    expect(candidates.find((c) => c.key === "assessed_value")).toBeUndefined();
  });

  test("a Collier ZIP with a held row DOES get the assessed_value candidate", () => {
    const { candidates } = buildRegistryCandidates(
      "34102",
      tableMap({
        "properties-collier-value:collier_parcels_by_zip": {
          rows: [{ key: "34102", cells: { median_jv: 900_000 } }],
          source: { label: "FDOR cadastral", url: "https://floridarevenue.com" },
        },
      }),
    );
    const av = candidates.find((c) => c.key === "assessed_value")!;
    expect(av.display).toBe("$900K");
    expect(av.covered).toBe(true);
  });

  test("a Lee ZIP with a held row in lee_parcels_by_zip gets assessed_value with the Lee sub-label", () => {
    const { candidates } = buildRegistryCandidates(
      "33901",
      tableMap({
        "properties-lee-value:lee_parcels_by_zip": {
          rows: [{ key: "33901", cells: { median_jv: 241_151, soh_gap_median_pct: 42.3 } }],
          source: { label: "FDOR cadastral", url: "https://floridarevenue.com" },
        },
      }),
    );
    const av = candidates.find((c) => c.key === "assessed_value")!;
    expect(av.display).toBe("$241K");
    expect(av.sub).toBe("Lee County median just value");
    const soh = candidates.find((c) => c.key === "soh_gap")!;
    expect(soh).toBeDefined();
  });

  test("county-pair disjointness: with BOTH parcel tables held, a ZIP gets exactly one assessed_value candidate", () => {
    // The sources guarantee a straddle ZIP appears in only one county's table
    // (refinery/lib/parcel-zip-scope.mts); this asserts the registry side —
    // same key from two tables never doubles up when the tables are disjoint.
    const both = tableMap({
      "properties-lee-value:lee_parcels_by_zip": {
        rows: [{ key: "34134", cells: { median_jv: 600_000 } }], // Bonita Springs — Lee-primary
      },
      "properties-collier-value:collier_parcels_by_zip": {
        rows: [{ key: "34110", cells: { median_jv: 800_000 } }], // Collier-primary
      },
    });
    for (const zip of ["34134", "34110"]) {
      const { candidates } = buildRegistryCandidates(zip, both);
      expect(candidates.filter((c) => c.key === "assessed_value")).toHaveLength(1);
    }
    const lee = buildRegistryCandidates("34134", both).candidates;
    expect(lee.find((c) => c.key === "assessed_value")!.sub).toBe("Lee County median just value");
  });

  test("the home-value pair: ZHVI and MLS both compete independently AND both carry a matching footnote when both held", () => {
    const { candidates } = buildRegistryCandidates(
      "33914",
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [{ key: "33914", cells: { median_sale_price: 500_000 } }],
        },
        "home-values-swfl:home_values_by_zip": {
          rows: [{ key: "33914", cells: { home_value_zhvi: 530_000 } }],
        },
      }),
    );
    const mls = candidates.find((c) => c.key === "median_sale_price")!;
    const zhvi = candidates.find((c) => c.key === "home_value_zhvi")!;
    expect(mls).toBeDefined();
    expect(zhvi).toBeDefined();
    expect(mls.footnote).toBeDefined();
    expect(zhvi.footnote).toBe(mls.footnote);
    expect(mls.footnote).toContain("6%"); // |500000-530000|/530000 = 5.66% -> rounds to 6
  });

  test("the home-value pair: only ZHVI held (no MLS row) -> ZHVI still competes, with no footnote", () => {
    const { candidates } = buildRegistryCandidates(
      "33914",
      tableMap({
        "home-values-swfl:home_values_by_zip": {
          rows: [{ key: "33914", cells: { home_value_zhvi: 530_000 } }],
        },
      }),
    );
    const zhvi = candidates.find((c) => c.key === "home_value_zhvi")!;
    expect(zhvi).toBeDefined();
    expect(zhvi.footnote).toBeUndefined();
    expect(candidates.find((c) => c.key === "median_sale_price")).toBeUndefined();
  });

  test("the market-sentiment composite: market_heat_score competes, hotness_score from the SAME pack is demoted", () => {
    const { candidates, railContext } = buildRegistryCandidates(
      "33914",
      tableMap({
        "market-heat-swfl:market_heat_by_zip": {
          rows: [{ key: "33914", cells: { market_heat_score: 72.5, hotness_score: 81 } }],
          source: { label: "realtor.com list-side", url: "https://realtor.com" },
        },
      }),
    );
    expect(candidates.find((c) => c.key === "market_heat_score")?.display).toBe("73");
    expect(candidates.find((c) => c.key === "hotness_score")).toBeUndefined();
    expect(railContext.get("market_sentiment")?.[0].display).toBe("81");
  });

  test("a table absent entirely from the map (pack failed to load) -> its concepts just don't compete, never throws", () => {
    expect(() => buildRegistryCandidates("33914", new Map())).not.toThrow();
    const { candidates, railContext } = buildRegistryCandidates("33914", new Map());
    expect(candidates).toEqual([]);
    expect(railContext.size).toBe(0);
  });
});

describe("buildZipCandidates — core-scope on flood + permits", () => {
  test("flood: non-core ZIP rows are excluded from the ranking denominator", () => {
    const floodRows = [
      { zip: "33914", aal: 500, pctRank: null }, // core (Cape Coral)
      { zip: "34102", aal: 100, pctRank: null }, // core (Naples)
      { zip: "34285", aal: 30_000, pctRank: null }, // Sarasota — non-core
      { zip: "33950", aal: 25_000, pctRank: null }, // Charlotte — non-core
    ];
    const { candidates } = buildZipCandidates(baseInput({ floodRows, floodForZip: floodRows[0] }));
    const flood = candidates.find((c) => c.key === "flood_aal")!;
    // Denominator = 2 core rows, not 4. 500 is the top (lowest loss) of [100, 500].
    expect(flood.rankOf).toBe(2);
  });

  test("permits: a stray non-core ZIP is dropped from the Accela ranking", () => {
    const { candidates } = buildZipCandidates(
      baseInput({
        zip: "33901", // Fort Myers, core
        permitsCounts: new Map([
          ["33901", 120], // core
          ["33914", 40], // core
          ["34205", 200], // Manatee leak — must not count
        ]),
      }),
    );
    const permits = candidates.find((c) => c.key === "permits_90d")!;
    expect(permits.rankOf).toBe(2); // 33901 + 33914 only
  });
});

describe("buildRegistryCandidates — core-scope denominator (Lee+Collier=57)", () => {
  test("non-core SWFL (Sarasota) and pure-leak (Manatee) rows are excluded from the ranking denominator", () => {
    const { candidates } = buildRegistryCandidates(
      "33914", // Cape Coral, core
      tableMap({
        "housing-swfl:housing_by_zip": {
          rows: [
            { key: "33914", cells: { median_sale_price: 485_000 } }, // core (Lee)
            { key: "33901", cells: { median_sale_price: 300_000 } }, // core (Lee)
            { key: "34102", cells: { median_sale_price: 900_000 } }, // core (Collier)
            { key: "34285", cells: { median_sale_price: 700_000 } }, // Sarasota — non-core
            { key: "34205", cells: { median_sale_price: 650_000 } }, // Manatee — pure leak
          ],
        },
      }),
    );
    const price = candidates.find((c) => c.key === "median_sale_price")!;
    // Denominator counts the 3 core rows only, NOT all 5. 485K is the middle of [300K,485K,900K].
    expect(price.rankOf).toBe(3);
    expect(price.rankPos).toBe(2);
    expect(price.percentile).toBe(50);
  });
});
