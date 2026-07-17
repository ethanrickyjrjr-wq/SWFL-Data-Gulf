// lib/should-i-sell/load-market-snapshot.test.ts
import { expect, test } from "bun:test";
import { loadMarketSnapshot, loadZipYoyFraction } from "./load-market-snapshot";

// Minimal fakes mirroring the SERVED brain shapes (housing_by_zip / listing_momentum_by_zip).
const housingBrain = {
  freshness_token: "SWFL-7421-v12-20260717",
  output: {
    detail_tables: [
      {
        id: "housing_by_zip",
        title: "SWFL housing by ZIP — latest rolling 3-month window, data through 2026-06-30",
        grain: "zip",
        source: {
          url: "https://www.redfin.com/news/data-center/",
          fetched_at: "2026-07-17T04:00:00Z",
          citation: "Redfin Data Center — ZIP-level monthly housing metrics (all property types).",
        },
        columns: [],
        rows: [
          {
            key: "33904",
            label: "33904",
            cells: {
              median_sale_price: 415_000,
              median_sale_price_yoy_pct: 9.8,
              median_dom: 52,
              avg_sale_to_list_pct: 97.4,
              months_of_supply: 6.2,
            },
          },
          {
            // present, but its snapshot cells are null (thin-sample style)
            key: "34999",
            label: "34999",
            cells: {
              median_sale_price: 300_000,
              median_sale_price_yoy_pct: null,
              median_dom: null,
              avg_sale_to_list_pct: null,
              months_of_supply: null,
            },
          },
        ],
      },
    ],
  },
};

const momentumBrain = {
  freshness_token: "SWFL-7421-v3-20260712",
  output: {
    detail_tables: [
      {
        id: "listing_momentum_by_zip",
        title: "SWFL for-sale listing momentum by ZIP",
        grain: "zip",
        source: {
          url: "https://www.swfldatagulf.com",
          fetched_at: "2026-07-12T04:00:00Z",
          citation: "SWFL for-sale listing momentum shares, per grain, as of 2026-07-11",
        },
        columns: [],
        rows: [
          {
            key: "33904",
            label: "33904 (Lee)",
            cells: {
              active_listing_count: 1277,
              price_reduced_share: 14.8,
              new_listing_share: 8.1,
            },
          },
        ],
      },
    ],
  },
};

const loadBrain = async (slug: string) =>
  (slug === "housing-swfl"
    ? housingBrain
    : slug === "listing-momentum-swfl"
      ? momentumBrain
      : null) as never;

test("a ZIP in both tables → both halves, each with its own asOf + source", async () => {
  const s = await loadMarketSnapshot("33904", { loadBrain, place: "Cape Coral" });
  expect(s).not.toBeNull();
  expect(s!.place).toBe("Cape Coral");
  expect(s!.housing).not.toBeNull();
  expect(s!.housing!.monthsOfSupply).toBe(6.2);
  expect(s!.housing!.medianDom).toBe(52);
  expect(s!.housing!.saleToListPct).toBe(97.4);
  expect(s!.housing!.source.asOf).toBe("06/30/2026"); // from the housing title
  expect(s!.momentum).not.toBeNull();
  expect(s!.momentum!.priceCutSharePct).toBe(14.8);
  expect(s!.momentum!.source.asOf).toBe("07/11/2026"); // from the momentum citation
});

test("a ZIP present in housing but ABSENT from momentum → momentum half null", async () => {
  const s = await loadMarketSnapshot("34999", { loadBrain });
  expect(s).not.toBeNull();
  expect(s!.housing).not.toBeNull();
  // present row with null cells stays a (null-valued) half, not a dropped half
  expect(s!.housing!.monthsOfSupply).toBeNull();
  expect(s!.momentum).toBeNull(); // absent from the momentum table
});

test("a ZIP absent from BOTH tables → null object (section omitted)", async () => {
  const s = await loadMarketSnapshot("00000", { loadBrain });
  expect(s).toBeNull();
});

test("a missing brain degrades that half to null, never throws", async () => {
  const onlyMomentum = async (slug: string) =>
    (slug === "listing-momentum-swfl" ? momentumBrain : null) as never;
  const s = await loadMarketSnapshot("33904", { loadBrain: onlyMomentum });
  expect(s).not.toBeNull();
  expect(s!.housing).toBeNull();
  expect(s!.momentum!.priceCutSharePct).toBe(14.8);
});

test("YoY fraction reads the percent cell and divides by 100 (the /100 contract)", async () => {
  const frac = await loadZipYoyFraction("33904", { loadBrain });
  expect(frac).toBeCloseTo(0.098, 6); // 9.8 (percent) → 0.098 (fraction)
});

test("YoY fraction is null when the ZIP/cell is absent (projection then omitted)", async () => {
  expect(await loadZipYoyFraction("34999", { loadBrain })).toBeNull(); // cell null
  expect(await loadZipYoyFraction("00000", { loadBrain })).toBeNull(); // ZIP absent
});
