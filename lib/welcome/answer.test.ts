import { test, expect } from "bun:test";
import { buildWelcomeAnswer } from "./answer";
import type { LocationDossier, LocationDossierLine } from "@/lib/zip-dossier";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import type { PlaceEcho } from "@/lib/welcome/frames";

// ── Stub factories — match the REAL brain shapes read this session ──────────────
// (housing-swfl detail table `housing_by_zip`/`median_sale_price`; rentals-swfl
//  detail table `rentals_by_zip`/`rent_index_latest`; env-swfl per-ZIP flood AAL
//  key_metric `swfl_zip_<zip>_flood_aal_usd_per_insured_property`.)

function brain(output: Record<string, unknown>): ParsedBrain {
  return {
    brain_id: "stub",
    version: 1,
    freshness_token: "SWFL-7421-v9-20260601",
    scope: "",
    refined_at: "2026-06-01",
    raw_md: "",
    output: output as unknown,
  } as unknown as ParsedBrain;
}

const HOUSING = brain({
  detail_tables: [
    {
      id: "housing_by_zip",
      title: "",
      grain: "zip",
      columns: [
        {
          id: "median_sale_price",
          label: "Median sale price",
          display_format: "currency",
          units: "USD",
        },
      ],
      rows: [{ key: "33913", label: "33913", cells: { median_sale_price: 512000 } }],
      source: {
        url: "https://www.redfin.com/news/data-center/",
        fetched_at: "2026-06-03T00:00:00Z",
        tier: 1,
        citation: "Redfin Data Center — ZIP-level monthly housing metrics.",
      },
    },
  ],
  key_metrics: [
    {
      metric: "housing_median_sale_price_swfl",
      value: 400000,
      direction: "falling",
      label: "SWFL median sale price",
      variable_type: "intensive",
      units: "USD",
      display_format: "currency",
      source: {
        url: "https://www.redfin.com/news/data-center/",
        fetched_at: "2026-06-03T00:00:00Z",
        tier: 1,
        citation: "Redfin Data Center.",
      },
    },
  ],
});

const RENTALS = brain({
  detail_tables: [
    {
      id: "rentals_by_zip",
      title: "",
      grain: "zip",
      columns: [
        {
          id: "rent_index_latest",
          label: "Rent index (USD/month)",
          display_format: "currency",
          units: "USD/month",
        },
        { id: "rent_yoy_pct", label: "Rent YoY %", display_format: "percent", units: "percent" },
      ],
      rows: [
        { key: "33913", label: "33913", cells: { rent_index_latest: 2075, rent_yoy_pct: -1.9 } },
      ],
      source: {
        url: "https://files.zillowstatic.com/research/public_csvs/zori/x.csv",
        fetched_at: "2026-06-12T00:00:00Z",
        tier: 2,
        citation: "Zillow Observed Rent Index (ZORI); Tier 2 cache: data_lake.zori_swfl.",
      },
    },
  ],
  // NOTE: the YoY% slug precedes the rent-index slug — a generic `_zip_` find would
  // wrongly grab the percent. The card must target the rent DOLLAR specifically.
  key_metrics: [
    {
      metric: "rental_rent_yoy_pct_zip_33913",
      value: -1.9,
      direction: "falling",
      label: "",
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: {
        url: "https://files.zillowstatic.com/x.csv",
        fetched_at: "2026-06-12T00:00:00Z",
        tier: 2,
        citation: "ZORI.",
      },
    },
    {
      metric: "rental_rent_index_zori_zip_33913",
      value: 2075,
      direction: "stable",
      label: "",
      variable_type: "intensive",
      units: "USD/month",
      display_format: "currency",
      source: {
        url: "https://files.zillowstatic.com/x.csv",
        fetched_at: "2026-06-12T00:00:00Z",
        tier: 2,
        citation: "ZORI.",
      },
    },
    {
      metric: "rental_rent_index_zori_regional_median",
      value: 2169,
      direction: "stable",
      label: "",
      variable_type: "intensive",
      units: "USD/month",
      display_format: "currency",
      source: {
        url: "https://files.zillowstatic.com/x.csv",
        fetched_at: "2026-06-12T00:00:00Z",
        tier: 2,
        citation: "ZORI.",
      },
    },
  ],
});

const ENV = brain({
  detail_tables: [],
  key_metrics: [
    {
      metric: "swfl_zip_33931_flood_aal_usd_per_insured_property",
      value: 30074.61,
      direction: "stable",
      label: "33931 per-insured-property NFIP AAL",
      variable_type: "intensive",
      units: "USD/year",
      display_format: "currency",
      source: {
        url: "https://www.fema.gov/api/open/v2/FimaNfipClaims",
        fetched_at: "2026-06-12T01:08:17Z",
        tier: 1,
        citation: "OpenFEMA FimaNfipClaims via data_lake.fema_nfip_claims, ZIP 33931.",
      },
    },
  ],
});

function loaderFor(map: Record<string, ParsedBrain>) {
  return async (slug: string): Promise<ParsedBrain | null> => map[slug] ?? null;
}

function line(over: Partial<LocationDossierLine>): LocationDossierLine {
  return {
    brain_id: "housing-swfl",
    domain: "real-estate",
    grain: "zip",
    coverage_label: "ZIP 33913",
    is_true_zip: true,
    text: "",
    source_citation: "Redfin Data Center — ZIP-level monthly housing metrics.",
    source_url: "https://www.redfin.com/news/data-center/",
    ...over,
  };
}

function dossier(
  lines: LocationDossierLine[],
  over: Partial<LocationDossier> = {},
): LocationDossier {
  return {
    resolved_as: "zip",
    zip: "33913",
    in_scope: true,
    resolution: null,
    lines,
    freshness_tokens: {
      "housing-swfl": "SWFL-7421-v9-20260601",
      "rentals-swfl": "SWFL-7421-v9-20260601",
      "env-swfl": "SWFL-7421-v9-20260601",
    },
    coverage_caveats: [],
    ...over,
  };
}

const PLACE: PlaceEcho = { zip: "33913", name: "Gateway" };

test("true-ZIP dossier → cards whose value/format come from the brain, gating from the dossier line", async () => {
  const d = dossier([
    line({ brain_id: "housing-swfl", coverage_label: "ZIP 33913", is_true_zip: true }),
    line({
      brain_id: "rentals-swfl",
      coverage_label: "ZIP 33913",
      is_true_zip: true,
      source_url: "https://files.zillowstatic.com/x.csv",
      source_citation: "ZORI.",
    }),
  ]);
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: true,
    place: PLACE,
    loadBrain: loaderFor({ "housing-swfl": HOUSING, "rentals-swfl": RENTALS }),
  });
  expect(answer).not.toBeNull();
  expect(answer!.place).toEqual(PLACE);
  expect(answer!.freshness_token).toBe("SWFL-7421-v9-20260601");
  expect(answer!.metrics.length).toBeLessThanOrEqual(4);

  const home = answer!.metrics.find((m) => m.key === "home_value")!;
  expect(home.value).toBe(512000); // brain detail cell, verbatim
  expect(home.display_format).toBe("currency");
  expect(home.is_true_zip).toBe(true); // from the dossier line
  expect(home.coverage_label).toBe("ZIP 33913"); // from the dossier line, never relabeled
});

test("rent card surfaces the rent DOLLAR (rent_index_latest), never the YoY %", async () => {
  const d = dossier([line({ brain_id: "rentals-swfl", is_true_zip: true })]);
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: true,
    place: PLACE,
    loadBrain: loaderFor({ "rentals-swfl": RENTALS }),
  });
  const rent = answer!.metrics.find((m) => m.key === "rent")!;
  expect(rent.value).toBe(2075); // the rent index, not -1.9
  expect(rent.display_format).toBe("currency"); // not "percent"
});

test("coarse line (is_true_zip:false) → headline metric, labeled coarse, value still from the brain", async () => {
  const d = dossier([
    line({
      brain_id: "housing-swfl",
      coverage_label: "Lee county-wide — covers 33913",
      is_true_zip: false,
    }),
  ]);
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: false,
    place: PLACE,
    loadBrain: loaderFor({ "housing-swfl": HOUSING }),
  });
  const home = answer!.metrics.find((m) => m.key === "home_value")!;
  expect(home.value).toBe(400000); // the SWFL headline (coarse), not the per-ZIP 512000
  expect(home.is_true_zip).toBe(false);
  expect(home.coverage_label).toBe("Lee county-wide — covers 33913"); // verbatim, never relabeled
});

test("as_of is the YYYY-MM of the brain source's fetched_at (not the metric root)", async () => {
  const d = dossier(
    [line({ brain_id: "env-swfl", coverage_label: "ZIP 33931", is_true_zip: true })],
    { zip: "33931" },
  );
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: true,
    place: { zip: "33931", name: "Fort Myers Beach" },
    loadBrain: loaderFor({ "env-swfl": ENV }),
  });
  const flood = answer!.metrics.find((m) => m.key === "flood_aal")!;
  expect(flood.source.as_of).toBe("2026-06"); // sliced from "2026-06-12T01:08:17Z"
});

test("leak guard: an internal source_url is dropped to '' and domain is prettySource-cleaned", async () => {
  const d = dossier([
    line({
      brain_id: "rentals-swfl",
      is_true_zip: true,
      source_url: "postgresql://x/data_lake.zori_swfl",
      source_citation: "Zillow Observed Rent Index (ZORI); Tier 2 cache: data_lake.zori_swfl.",
    }),
  ]);
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: true,
    place: PLACE,
    loadBrain: loaderFor({ "rentals-swfl": RENTALS }),
  });
  const rent = answer!.metrics.find((m) => m.key === "rent")!;
  expect(rent.source.url).toBe(""); // internal URL never leaks
  expect(rent.source.domain).toBe("zillow.com"); // cleaned from the citation, not the raw host
});

test("FLOOD GATE — a town (explicitZip:false) suppresses flood even when env has a true-ZIP line", async () => {
  const d = dossier(
    [line({ brain_id: "env-swfl", coverage_label: "ZIP 33931", is_true_zip: true })],
    { zip: "33931" },
  );
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: false, // a town spans many ZIPs
    place: { zip: "33931", name: "Naples" },
    loadBrain: loaderFor({ "env-swfl": ENV }),
  });
  expect(answer?.metrics.find((m) => m.key === "flood_aal")).toBeUndefined();
});

test("FLOOD GATE — an explicit ZIP with no per-ZIP AAL row (is_true_zip:false) suppresses flood", async () => {
  // The live-confirmed inland 34112 case: env-swfl falls back to county grain.
  const d = dossier(
    [
      line({
        brain_id: "env-swfl",
        coverage_label: "Collier county-wide — covers 34112",
        is_true_zip: false,
      }),
    ],
    { zip: "34112" },
  );
  const answer = await buildWelcomeAnswer({
    dossier: d,
    explicitZip: true,
    place: { zip: "34112", name: "Naples" },
    loadBrain: loaderFor({ "env-swfl": ENV }),
  });
  expect(answer).toBeNull(); // no hero card matched → null answer
});
