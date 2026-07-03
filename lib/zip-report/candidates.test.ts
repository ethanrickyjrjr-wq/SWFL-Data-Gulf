// lib/zip-report/candidates.test.ts
import { describe, expect, test } from "bun:test";
import { buildZipCandidates, type CandidateInput } from "./candidates";

function baseInput(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    zip: "33914",
    housingRows: [],
    floodRows: [],
    floodForZip: null,
    permitsCounts: new Map(),
    censusValues: [],
    censusDistribution: new Map(),
    ...over,
  };
}

const HOUSING_ROWS = [
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
];

describe("buildZipCandidates — housing", () => {
  test("price candidate: percentile from the all-ZIP distribution + YoY movement restated", () => {
    const { candidates } = buildZipCandidates(baseInput({ housingRows: HOUSING_ROWS }));
    const price = candidates.find((c) => c.key === "median_sale_price")!;
    expect(price.covered).toBe(true);
    expect(price.percentile).toBe(50); // middle of 3
    expect(price.rankPos).toBe(2);
    expect(price.rankOf).toBe(3);
    expect(price.movementPct).toBe(18);
    expect(price.movementText).toBe("↑ 18% YoY");
    expect(price.display).toBe("$485K");
  });

  test("DOM movement % derives from held days delta: 12 days on a 48-day prior = +25%", () => {
    const { candidates } = buildZipCandidates(baseInput({ housingRows: HOUSING_ROWS }));
    const dom = candidates.find((c) => c.key === "median_dom")!;
    expect(dom.movementPct).toBe(25); // 12 / (60 - 12) * 100
    expect(dom.movementText).toBe("↑ 12 days YoY");
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
