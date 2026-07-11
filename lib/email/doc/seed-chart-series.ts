//
// SEED_CHART_SERIES — the ONE authority for every committed seed-preview
// chart's REAL plotted numbers (spec: 2026-07-11-deliverable-coherence-gate).
// scripts/generate-seed-preview-charts.mts imports these arrays to render the
// SVGs; lib/email/doc/preview-fill.test.ts imports this same map to run the
// author-time chart<->headline coherence gate. One source, two consumers —
// never redefine a series in either caller.
//
// Every entry is real and sourced (see scripts/generate-seed-preview-charts.mts
// for full per-series citations; chart-lee-home-values.svg is the one
// exception — a legacy hand-built asset predating that script, values read
// verbatim from its own embedded SVG comment, Zillow ZHVI average, pulled
// 07/09/2026).

import type { UnitClass } from "@/lib/deliverable/chart-coherence";

export interface SeedSeries {
  values: number[];
  unit: UnitClass;
}

// ── weekly-pulse header — median asking across the six biggest Lee ZIPs ─────
export const ZIP_ASKING_VALUES = [550000, 525000, 418500, 409998, 369900, 326000];

// ── weekly-pulse left / market-spotlight — Lee County median asking, monthly ─
export const LEE_ASKING_VALUES = [
  424950, 415711, 405000, 399900, 399900, 399900, 399949, 399999, 399900, 399900, 399600, 399000,
  396850,
];

// ── weekly-pulse right / monthly-digest — Lee County homes for sale, monthly ─
export const LEE_INVENTORY_VALUES = [
  12892, 12353, 11160, 10670, 11041, 11692, 12045, 12332, 12676, 12442, 11981, 11347, 10575,
];

// ── luxury-market-report (PRE-FIX) — Lee County top-tier home value, monthly ─
export const LEE_TOP_TIER_VALUES = [
  801690, 789767, 777384, 765786, 760128, 758008, 754701, 752378, 750969, 750908, 750433, 748892,
  745575,
];

// ── neighborhood-report — ZIP 33914 (Cape Coral) median asking, monthly ─────
export const ZIP_33914_VALUES = [599000, 599725, 599000, 595750, 589450, 589925, 574900, 550000];

// ── investment-brief — Fort Myers typical asking rent, monthly ──────────────
export const FM_RENT_VALUES = [
  1850, 1843, 1826, 1823, 1809, 1807, 1805, 1807, 1814, 1806, 1799, 1787, 1798, 1807,
];

// ── rate-watch — 30-year fixed rate, weekly (last 13 weeks is plenty for the
// coherence check's min/max; full history stays in generate-seed-preview-charts.mts) ─
export const PMMS_30YR_VALUES = [
  6.67, 6.72, 6.75, 6.74, 6.72, 6.63, 6.58, 6.58, 6.56, 6.5, 6.35, 6.26, 6.3, 6.34, 6.3, 6.27, 6.19,
  6.17, 6.22, 6.24, 6.26, 6.23, 6.19, 6.22, 6.21, 6.18, 6.15, 6.16, 6.06, 6.09, 6.1, 6.11, 6.09,
  6.01, 5.98, 6.0, 6.11, 6.22, 6.38, 6.46, 6.37, 6.3, 6.23, 6.3, 6.37, 6.36, 6.51, 6.53, 6.48, 6.52,
  6.47, 6.49, 6.43, 6.49,
];

// ── monthly-digest — Lee County recorded sales by month ─────────────────────
export const LEE_SALES_BY_MONTH_VALUES = [
  3779, 2997, 2983, 2727, 3071, 2709, 2512, 3111, 2602, 3064, 3849, 3636,
];

// ── year-in-review — Lee County median recorded sale price, monthly ─────────
export const LEE_SALE_PRICE_VALUES = [
  349999, 325000, 325000, 316990, 336000, 325000, 307950, 327170, 318500, 325000, 320000, 330500,
];

// ── trend-snapshot — Lee County average ZIP home value (legacy hand-built
// chart-lee-home-values.svg; values read verbatim from its own SVG comment) ──
export const LEE_ZHVI_AVERAGE_VALUES = [
  471582, 465042, 457865, 450955, 445780, 442310, 440183, 438579, 437639, 437124, 436605, 435432,
  433549,
];

export const SEED_CHART_SERIES: Record<string, SeedSeries> = {
  "chart-zip-asking-bars.svg": { values: ZIP_ASKING_VALUES, unit: "currency" },
  "chart-lee-median-asking.svg": { values: LEE_ASKING_VALUES, unit: "currency" },
  "chart-lee-active-inventory.svg": { values: LEE_INVENTORY_VALUES, unit: "count" },
  "chart-luxury-top-tier.svg": { values: LEE_TOP_TIER_VALUES, unit: "currency" },
  "chart-zip33914-asking.svg": { values: ZIP_33914_VALUES, unit: "currency" },
  "chart-fm-rent.svg": { values: FM_RENT_VALUES, unit: "currency" },
  "chart-pmms-rate.svg": { values: PMMS_30YR_VALUES, unit: "percent" },
  "chart-lee-sales-by-month.svg": { values: LEE_SALES_BY_MONTH_VALUES, unit: "count" },
  "chart-lee-sale-price-year.svg": { values: LEE_SALE_PRICE_VALUES, unit: "currency" },
  "chart-lee-home-values.svg": { values: LEE_ZHVI_AVERAGE_VALUES, unit: "currency" },
};
