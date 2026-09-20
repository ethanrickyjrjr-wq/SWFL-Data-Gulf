/**
 * housing-swfl helper unit tests. Lock the two side-bug fixes and the
 * thin-sample guard that shipped with the per-ZIP detail-table fix:
 *  - formatDomYoyDays / domYoyDaysCell: days-on-market YoY is a DAY DELTA (live-verified
 *    09/20/2026: 14,918 of 17,904 parquet rows equal median_dom minus the same window a
 *    year earlier; the vendor relabelled the column MOM/YOY (DAYS) in 09/2026). It was
 *    served as a percent twice - "650.0% YoY" on the legacy feed, "-2796.2%" / "-28.0%"
 *    on this one. It renders as days, and a thin-sample ZIP renders nothing.
 *  - monthsOfSupply: derived inventory ÷ 90-day sales pace, SUPPRESSED on
 *    thin-sample ZIPs (a 1–4 sale denominator produces nonsense).
 *  - aggregateMonthsOfSupply: a TRUE regional absorption rate, robust to the
 *    thin-ZIP long tail (not a median of per-ZIP ratios).
 *  - isLowSample: flags a row that rests on too few sales to quote as a median.
 */
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  monthsOfSupply,
  aggregateMonthsOfSupply,
  formatDomYoyDays,
  isLowSample,
  buildSnapshot,
  domYoyDaysCell,
} from "./housing-swfl.mts";
import type { HousingZipRow } from "../sources/housing-source.mts";

function row(p: Partial<HousingZipRow>): HousingZipRow {
  return {
    zip_code: "33901",
    period_begin: "2026-01-01",
    period_end: "2026-03-31",
    parent_metro_region: "Cape Coral, FL",
    median_sale_price: null,
    median_list_price: null,
    median_ppsf: null,
    median_dom: null,
    avg_sale_to_list: null,
    sold_above_list: null,
    price_drops: null,
    off_market_in_two_weeks: null,
    homes_sold: null,
    inventory: null,
    months_of_supply: null,
    pending_sales: null,
    median_sale_price_yoy: null,
    median_sale_price_mom: null,
    median_dom_yoy_days: null,
    inventory_yoy: null,
    avg_sale_to_list_yoy: null,
    ...p,
  };
}

describe("housing-swfl helpers", () => {
  describe("formatDomYoyDays - a day delta is never rendered as a percent", () => {
    test("renders signed days, singular at one, no percent sign anywhere", () => {
      assert.equal(formatDomYoyDays(-28), "-28 days");
      assert.equal(formatDomYoyDays(12), "+12 days");
      assert.equal(formatDomYoyDays(1), "+1 day");
      assert.equal(formatDomYoyDays(-1), "-1 day");
      assert.equal(formatDomYoyDays(0), "0 days");
      // a regional median of per-ZIP deltas can land on a half day
      assert.equal(formatDomYoyDays(-12.5), "-12.5 days");
      assert.equal(formatDomYoyDays(-28).includes("%"), false);
      // round half AWAY from zero: JS Math.round alone turns -28.25 into -28.2 but 28.25 into 28.3
      assert.equal(formatDomYoyDays(-28.25), "-28.3 days");
      assert.equal(formatDomYoyDays(28.25), "+28.3 days");
    });
  });

  describe("monthsOfSupply — per-ZIP, derived", () => {
    test("derives inventory*3/homes_sold for a healthy sample (33913)", () => {
      const m = monthsOfSupply(row({ inventory: 503, homes_sold: 297 }));
      assert.ok(m !== null);
      assert.ok(Math.abs((m as number) - 5.08) < 0.01, `got ${m}`);
    });
    test("suppresses derivation for a thin sample (< 5 sales)", () => {
      assert.equal(monthsOfSupply(row({ inventory: 60, homes_sold: 2 })), null);
      assert.equal(monthsOfSupply(row({ inventory: 60, homes_sold: 4 })), null);
    });
    test("prefers a published value when Redfin provides one", () => {
      assert.equal(
        monthsOfSupply(row({ months_of_supply: 4.2, inventory: 9999, homes_sold: 1 })),
        4.2,
      );
    });
    test("null when inputs are missing", () => {
      assert.equal(monthsOfSupply(row({ inventory: null, homes_sold: 100 })), null);
    });
  });

  describe("aggregateMonthsOfSupply — regional absorption, outlier-robust", () => {
    test("aggregates inventory and sales rather than averaging ratios", () => {
      const m = aggregateMonthsOfSupply([
        row({ inventory: 100, homes_sold: 30 }),
        row({ inventory: 50, homes_sold: 10 }),
      ]);
      // (150 * 3) / 40 = 11.25
      assert.ok(m !== null && Math.abs((m as number) - 11.25) < 1e-9, `got ${m}`);
    });
    test("a thin-sample ZIP does not blow up the regional figure", () => {
      const m = aggregateMonthsOfSupply([
        row({ inventory: 1000, homes_sold: 300 }),
        row({ inventory: 60, homes_sold: 2 }), // 90 months as a raw ratio
      ]);
      // aggregate stays sane (~10.5), not dragged toward the 90-month outlier
      assert.ok(m !== null && (m as number) < 12, `got ${m}`);
    });
    test("null when no row has a real sales count", () => {
      assert.equal(aggregateMonthsOfSupply([row({ inventory: 100, homes_sold: 0 })]), null);
    });
  });

  describe("buildSnapshot — window labeled by what it COVERS, not when it opens", () => {
    test("period_end is the LATEST window's end, laggard ZIPs don't drag it", () => {
      const snap = buildSnapshot([
        row({
          zip_code: "33904",
          period_begin: "2026-04-01",
          period_end: "2026-06-30",
          median_sale_price: 365000,
        }),
        // Thin rural ZIP whose latest Redfin window is years old — must not
        // define the regional window label in either direction.
        row({
          zip_code: "34266",
          period_begin: "2020-01-01",
          period_end: "2020-03-31",
          median_sale_price: 100000,
        }),
      ]);
      assert.ok(snap !== null);
      assert.equal(snap!.period_begin, "2026-04-01");
      assert.equal(snap!.period_end, "2026-06-30");
    });
  });

  describe("isLowSample", () => {
    test("flags fewer than 5 sales (incl. missing)", () => {
      assert.equal(isLowSample(row({ homes_sold: 2 })), true);
      assert.equal(isLowSample(row({ homes_sold: 4 })), true);
      assert.equal(isLowSample(row({ homes_sold: 5 })), false);
      assert.equal(isLowSample(row({ homes_sold: 297 })), false);
      assert.equal(isLowSample(row({ homes_sold: null })), true);
    });
  });

  describe("domYoyDaysCell - per-ZIP day delta, suppressed on a thin sample", () => {
    test("live 33904 (08/31/2026): 60 days vs 88 a year ago is -28 DAYS, passed through", () => {
      assert.equal(domYoyDaysCell(row({ homes_sold: 271, median_dom_yoy_days: -28 })), -28);
    });
    test("a big swing on a real sample is a fact, not an outlier (live 34216: +85 on 13 sales)", () => {
      assert.equal(domYoyDaysCell(row({ homes_sold: 13, median_dom_yoy_days: 85 })), 85);
    });
    test("a one-sale ZIP's swing is suppressed (live 34140: +1404 days on 1 sale)", () => {
      assert.equal(domYoyDaysCell(row({ homes_sold: 1, median_dom_yoy_days: 1404 })), null);
      assert.equal(domYoyDaysCell(row({ homes_sold: null, median_dom_yoy_days: 10 })), null);
    });
    test("the raw payload never ships a long float (the 2.3837188145672608 leak shape)", () => {
      assert.equal(
        domYoyDaysCell(row({ homes_sold: 50, median_dom_yoy_days: -12.3456789 })),
        -12.3,
      );
    });
    test("null stays null", () => {
      assert.equal(domYoyDaysCell(row({ homes_sold: 50, median_dom_yoy_days: null })), null);
    });
  });
});
