/**
 * mapHousingRow — the ONE place vendor units become contract units after the
 * redfin_data_center retarget (07/16/2026, spec:
 * docs/superpowers/specs/2026-07-17-redfin-datacenter-retarget-design.md).
 *
 * The new feed publishes percents (96.12) where the HousingZipRow contract
 * carries ratios/fractions (0.9612). The Tier-1 parquet stores AS-WRITTEN;
 * conversion happens here, exactly once. Fields whose source column vanished
 * with the feed redesign (median_list_price, price_drops) are null — never
 * mapped from a lookalike column (MEDIAN NEW LISTING PRICE is a different
 * concept than the old list-price median).
 */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { mapHousingRow } from "./housing-source.mts";

const RAW_33904 = {
  zip_code: "33904",
  period_begin: "2026-04-01",
  period_end: "2026-06-30",
  metro: "Cape Coral, FL metro area",
  median_sale_price: 365000,
  median_ppsf: 215.56,
  median_dom: 69,
  avg_sale_to_list_pct: 96.12,
  sold_above_list_pct: 5.47,
  off_market_in_two_weeks_pct: 14.57,
  homes_sold: 120,
  inventory: 106,
  months_of_supply: 5,
  pending_sales: 118,
  median_sale_price_yoy_pct: 3.98,
  median_sale_price_mom_pct: null,
  // Live 08/31/2026 row: 60 days now vs 88 a year ago. The vendor column is a DAY delta
  // under a legacy `_pct` parquet name (relabelled MOM/YOY (DAYS) 09/2026).
  median_dom_yoy_pct: -28,
  inventory_yoy_pct: -7.45,
  avg_sale_to_list_yoy_ppts: -0.4,
};

describe("mapHousingRow — vendor percents → contract fractions", () => {
  test("converts each percent column ÷100, passes counts/dollars through", () => {
    const r = mapHousingRow(RAW_33904);
    assert.equal(r.zip_code, "33904");
    assert.equal(r.period_begin, "2026-04-01");
    assert.equal(r.parent_metro_region, "Cape Coral, FL metro area");
    assert.equal(r.median_sale_price, 365000);
    assert.equal(r.median_ppsf, 215.56);
    assert.equal(r.median_dom, 69);
    assert.ok(Math.abs((r.avg_sale_to_list as number) - 0.9612) < 1e-9);
    assert.ok(Math.abs((r.sold_above_list as number) - 0.0547) < 1e-9);
    assert.ok(Math.abs((r.off_market_in_two_weeks as number) - 0.1457) < 1e-9);
    assert.ok(Math.abs((r.median_sale_price_yoy as number) - 0.0398) < 1e-9);
    assert.ok(Math.abs((r.inventory_yoy as number) - -0.0745) < 1e-9);
    // PPTS ÷ 100 = the absolute delta of the ~1.0 ratio (-0.4 ppts → -0.004)
    assert.ok(Math.abs((r.avg_sale_to_list_yoy as number) - -0.004) < 1e-9);
    assert.equal(r.homes_sold, 120);
    assert.equal(r.inventory, 106);
    assert.equal(r.months_of_supply, 5);
    assert.equal(r.pending_sales, 118);
  });

  // Failure mode (site audit 07/18/2026; live 09/20/2026): the day delta was divided by 100
  // as if it were a percent, then re-multiplied and served as "-28.0%" when the truth is
  // -28 days (-31.8%).
  test("days-on-market YoY is a DAY delta: passed through as days, never divided by 100", () => {
    const r = mapHousingRow(RAW_33904);
    assert.equal(r.median_dom_yoy_days, -28);
    assert.equal("median_dom_yoy" in r, false);
  });

  test("fields without a successor column are null, never a lookalike", () => {
    const r = mapHousingRow(RAW_33904);
    assert.equal(r.median_list_price, null);
    assert.equal(r.price_drops, null);
  });

  test("nulls and legacy 'NA' strings stay null through conversion", () => {
    const r = mapHousingRow({
      ...RAW_33904,
      avg_sale_to_list_pct: "NA",
      median_dom_yoy_pct: null,
      median_sale_price: undefined,
    });
    assert.equal(r.avg_sale_to_list, null);
    assert.equal(r.median_dom_yoy_days, null);
    assert.equal(r.median_sale_price, null);
  });
});
