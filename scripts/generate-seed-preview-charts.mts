/**
 * Generates the committed seed-preview chart SVGs under
 * public/showcase/seed-previews/assets/ — one DISTINCT chart per chart-bearing
 * template (check `seed_preview_variety_pass`; handoff
 * docs/handoff/2026-07-09-seed-preview-presentability-handoff.md).
 *
 * Rendered through the PRODUCTION bklit email path (bklitTrendSvg /
 * bklitComposedSvg → renderBklitStaticSvg), so previews show exactly the chart
 * geometry real built emails produce; this script only adds label chrome
 * (endpoint values, axis endpoints, per-bar labels) OUTSIDE the bklit subtree
 * — the same pattern email-svg.tsx itself uses for title/caption.
 *
 * EVERY series below is real and named (four-lane honest, lane 1 or lane 3):
 * values were pulled live on 07/09/2026 and are inlined with their source so
 * the file re-derives without a database handle. Re-run + re-capture after any
 * data refresh:  bun scripts/generate-seed-preview-charts.mts
 */
import { writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bklitTrendSvg,
  bklitComposedSvg,
  type EmailTrendPoint,
} from "../components/charts/vendor/bklit/email-svg";
import {
  ZIP_ASKING_VALUES,
  LEE_ASKING_VALUES,
  LEE_INVENTORY_VALUES,
  LEE_TOP_TIER_VALUES,
  ZIP_33914_VALUES,
  FM_RENT_VALUES,
  PMMS_30YR_VALUES,
  LEE_SALES_BY_MONTH_VALUES,
  LEE_SALE_PRICE_VALUES,
} from "../lib/email/doc/seed-chart-series";

const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "showcase",
  "seed-previews",
  "assets",
);

const W = 600;
const H = 300;
// bklit static geometry (probed 07/09/2026): plot group at translate(40,40),
// plot area (W-80) × (H-80). Line paths and bar rects are in plot coordinates.
const PLOT_X = 40;
const PLOT_Y = 40;
const INK = "#1F2937";
const MUTED = "#6B7280";

const fmtK = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;
const fmtInt = (v: number) => v.toLocaleString("en-US");
const fmtPct = (v: number) => `${v.toFixed(2)}%`;
const fmtMonYr = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    m - 1
  ];
  return `${mon} ’${String(y).slice(2)}`;
};

/** First/last coordinate pair of the bklit line path (plot coords). */
function lineEndpoints(svg: string): { x0: number; y0: number; x1: number; y1: number } | null {
  const m = svg.match(/class="visx-linepath" d="([^"]+)"/);
  if (!m) return null;
  const pairs = [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)];
  if (pairs.length < 2) return null;
  const f = pairs[0];
  const l = pairs[pairs.length - 1];
  return { x0: +f[1], y0: +f[2], x1: +l[1], y1: +l[2] };
}

/** Accent-filled bar rects (plot coords), in document order. */
function barRects(svg: string, accent: string): { cx: number; top: number }[] {
  const out: { cx: number; top: number }[] = [];
  const re = new RegExp(
    `<rect fill="${accent}"[^>]*width="([\\d.]+)" x="(-?[\\d.]+)" y="(-?[\\d.]+)"`,
    "g",
  );
  for (const m of svg.matchAll(re)) {
    out.push({ cx: +m[2] + +m[1] / 2, top: +m[3] });
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inject extra chrome (already in OUTER coords) before </svg>. */
function inject(svg: string, chrome: string): string {
  return svg.replace("</svg>", `${chrome}</svg>`);
}

interface TrendDef {
  file: string;
  points: EmailTrendPoint[];
  title: string;
  accent: string;
  source: string;
  asOf: string;
  fmt: (v: number) => string;
}

async function trend(def: TrendDef): Promise<void> {
  // bklit's time-series shell pins the y-domain to [0, max*1.1]; a 5-8% price
  // move plots as a flat line. Plot against a tight baseline instead (shift
  // values down; the shell's zero-baseline then sits at `lo`), exactly the
  // domain the hand-built chart-lee-home-values.svg used ($425K–$475K). No
  // y-axis numbers are rendered, and the endpoint labels carry TRUE values —
  // the shift changes shape emphasis, never a displayed figure.
  const vals = def.points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const lo = max > min ? min - (max - min) * 0.25 : min * 0.99;
  const plotted = def.points.map((p) => ({ ...p, value: p.value - lo }));
  const svg = await bklitTrendSvg(plotted, {
    title: def.title,
    accent: def.accent,
    width: W,
    height: H,
    source: def.source,
    asOf: def.asOf,
  });
  if (!svg) throw new Error(`trend render failed: ${def.file}`);
  const ep = lineEndpoints(svg);
  if (!ep) throw new Error(`no line path: ${def.file}`);
  const first = def.points[0];
  const last = def.points[def.points.length - 1];
  const x0 = PLOT_X + ep.x0;
  const y0 = PLOT_Y + ep.y0;
  const x1 = PLOT_X + ep.x1;
  const y1 = PLOT_Y + ep.y1;
  // Endpoint markers + selective direct labels (dataviz: single series → no
  // legend, endpoint labels carry the numbers) + first/last x-axis labels.
  const chrome = [
    `<circle cx="${x0}" cy="${y0}" r="4" fill="${def.accent}" stroke="#ffffff" stroke-width="2"/>`,
    `<circle cx="${x1}" cy="${y1}" r="4" fill="${def.accent}" stroke="#ffffff" stroke-width="2"/>`,
    // flip a label below its endpoint when the line immediately rises past it
    `<text x="${x0 + 8}" y="${plotted[1].value > plotted[0].value ? y0 + 18 : y0 - 8}" font-family="Arial" font-size="12" font-weight="bold" fill="${INK}">${esc(def.fmt(first.value))}</text>`,
    `<text x="${x1 - 8}" y="${plotted[plotted.length - 2].value > plotted[plotted.length - 1].value ? y1 + 18 : y1 - 8}" font-family="Arial" font-size="12" font-weight="bold" fill="${INK}" text-anchor="end">${esc(def.fmt(last.value))}</text>`,
    `<text x="${x0}" y="${H - 24}" font-family="Arial" font-size="10" fill="${MUTED}">${esc(fmtMonYr(first.label))}</text>`,
    `<text x="${x1}" y="${H - 24}" font-family="Arial" font-size="10" fill="${MUTED}" text-anchor="end">${esc(fmtMonYr(last.label))}</text>`,
  ].join("");
  writeFileSync(join(OUT, def.file), inject(svg, chrome));
  console.log("wrote", def.file);
}

interface BarsDef {
  file: string;
  points: { label: string; value: number }[];
  average: number;
  title: string;
  accent: string;
  source: string;
  asOf: string;
  fmt: (v: number) => string;
  /** label every bar with its value (skip when bars are too dense) */
  valueLabels: boolean;
}

async function bars(def: BarsDef): Promise<void> {
  const svg = await bklitComposedSvg(def.points, def.average, {
    title: def.title,
    accent: def.accent,
    width: W,
    height: H,
    source: def.source,
    asOf: def.asOf,
  });
  if (!svg) throw new Error(`composed render failed: ${def.file}`);
  const rects = barRects(svg, def.accent);
  if (rects.length !== def.points.length) {
    throw new Error(`bar count mismatch in ${def.file}: ${rects.length} vs ${def.points.length}`);
  }
  const chrome = rects
    .map((r, i) => {
      const cx = PLOT_X + r.cx;
      const parts = [
        `<text x="${cx}" y="${H - 24}" font-family="Arial" font-size="10" fill="${MUTED}" text-anchor="middle">${esc(def.points[i].label)}</text>`,
      ];
      if (def.valueLabels) {
        parts.push(
          `<text x="${cx}" y="${PLOT_Y + r.top - 6}" font-family="Arial" font-size="11" font-weight="bold" fill="${INK}" text-anchor="middle">${esc(def.fmt(def.points[i].value))}</text>`,
        );
      }
      return parts.join("");
    })
    .join("");
  writeFileSync(join(OUT, def.file), inject(svg, chrome));
  console.log("wrote", def.file);
}

// ── 1. weekly-pulse header — median asking across the six biggest Lee ZIPs ──
// Realtor.com market hotness per-ZIP (lake view market_heat_core_swfl),
// month 2026-06, pulled 07/09/2026. Six largest Lee County ZIPs by active
// listing count: 33914 (601), 34135 (507), 33904 (483), 33993 (744),
// 33908 (760), 33974 (468).
const ZIP_ASKING_LABELS = ["33914", "34135", "33904", "33993", "33908", "33974"];
const ZIP_ASKING = ZIP_ASKING_LABELS.map((label, i) => ({ label, value: ZIP_ASKING_VALUES[i] }));
// mean of the six shown medians — deterministic derivation, drawn as the line
const ZIP_ASKING_AVG = Math.round(ZIP_ASKING.reduce((s, p) => s + p.value, 0) / ZIP_ASKING.length);

// ── 2. weekly-pulse left — Lee County median asking price, monthly ──────────
// Realtor.com via FRED (series MEDLISPRI15980; lake view fred_listing_swfl),
// 2025-06-01 → 2026-06-01, pulled 07/09/2026.
const LEE_ASKING_LABELS = [
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
  "2026-06-01",
];
const LEE_ASKING: EmailTrendPoint[] = LEE_ASKING_LABELS.map((label, i) => ({
  label,
  value: LEE_ASKING_VALUES[i],
}));

// ── 3. weekly-pulse right — Lee County homes for sale, monthly ──────────────
// Realtor.com via FRED (series ACTLISCOU15980; lake view fred_listing_swfl),
// 2025-06-01 → 2026-06-01, pulled 07/09/2026.
const LEE_INVENTORY_LABELS = [
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
  "2026-06-01",
];
const LEE_INVENTORY: EmailTrendPoint[] = LEE_INVENTORY_LABELS.map((label, i) => ({
  label,
  value: LEE_INVENTORY_VALUES[i],
}));

// ── 4. luxury-market-report — Lee County top-tier home value, monthly ───────
// Zillow Home Value Index top tier, averaged across Lee County ZIPs (lake
// view tier_divergence_swfl), period_end 2025-05-31 → 2026-05-31, pulled
// 07/09/2026.
const LEE_TOP_TIER_LABELS = [
  "2025-05-31",
  "2025-06-30",
  "2025-07-31",
  "2025-08-31",
  "2025-09-30",
  "2025-10-31",
  "2025-11-30",
  "2025-12-31",
  "2026-01-31",
  "2026-02-28",
  "2026-03-31",
  "2026-04-30",
  "2026-05-31",
];
const LEE_TOP_TIER: EmailTrendPoint[] = LEE_TOP_TIER_LABELS.map((label, i) => ({
  label,
  value: LEE_TOP_TIER_VALUES[i],
}));

// ── 5. neighborhood-report — ZIP 33914 (Cape Coral) median asking, monthly ──
// Realtor.com market hotness (lake view market_heat_core_swfl), months
// 2025-11 → 2026-06, pulled 07/09/2026.
const ZIP_33914_LABELS = [
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
  "2026-06-01",
];
const ZIP_33914: EmailTrendPoint[] = ZIP_33914_LABELS.map((label, i) => ({
  label,
  value: ZIP_33914_VALUES[i],
}));

// ── 6. investment-brief — Fort Myers typical asking rent, monthly ───────────
// Zillow Observed Rent Index, averaged across Fort Myers ZIPs (lake view
// zori_swfl), period_end 2025-04-30 → 2026-05-31, pulled 07/09/2026.
const FM_RENT_LABELS = [
  "2025-04-30",
  "2025-05-31",
  "2025-06-30",
  "2025-07-31",
  "2025-08-31",
  "2025-09-30",
  "2025-10-31",
  "2025-11-30",
  "2025-12-31",
  "2026-01-31",
  "2026-02-28",
  "2026-03-31",
  "2026-04-30",
  "2026-05-31",
];
const FM_RENT: EmailTrendPoint[] = FM_RENT_LABELS.map((label, i) => ({
  label,
  value: FM_RENT_VALUES[i],
}));

// ── 7. rate-watch — 30-year fixed rate, weekly ──────────────────────────────
// Freddie Mac Primary Mortgage Market Survey historical weekly data
// (freddiemac.com/pmms), weeks 2025-07-03 → 2026-07-09, pulled 07/09/2026.
const PMMS_30YR_LABELS = [
  "2025-07-03",
  "2025-07-10",
  "2025-07-17",
  "2025-07-24",
  "2025-07-31",
  "2025-08-07",
  "2025-08-14",
  "2025-08-21",
  "2025-08-28",
  "2025-09-04",
  "2025-09-11",
  "2025-09-18",
  "2025-09-25",
  "2025-10-02",
  "2025-10-09",
  "2025-10-16",
  "2025-10-23",
  "2025-10-30",
  "2025-11-06",
  "2025-11-13",
  "2025-11-20",
  "2025-11-26",
  "2025-12-04",
  "2025-12-11",
  "2025-12-18",
  "2025-12-24",
  "2025-12-31",
  "2026-01-08",
  "2026-01-15",
  "2026-01-22",
  "2026-01-29",
  "2026-02-05",
  "2026-02-12",
  "2026-02-19",
  "2026-02-26",
  "2026-03-05",
  "2026-03-12",
  "2026-03-19",
  "2026-03-26",
  "2026-04-02",
  "2026-04-09",
  "2026-04-16",
  "2026-04-23",
  "2026-04-30",
  "2026-05-07",
  "2026-05-14",
  "2026-05-21",
  "2026-05-28",
  "2026-06-04",
  "2026-06-11",
  "2026-06-18",
  "2026-06-25",
  "2026-07-02",
  "2026-07-09",
];
const PMMS_30YR: EmailTrendPoint[] = PMMS_30YR_LABELS.map((label, i) => ({
  label,
  value: PMMS_30YR_VALUES[i],
}));

// ── 8. monthly-digest — Lee County recorded sales by month ──────────────────
// Lee County Property Appraiser recorded sales (lake view last_sale, vintage
// 05/30/2026): count of arm's-length recordings (amount ≥ $10,000) per sale
// month, 2025-05 → 2026-04. Pulled 07/09/2026.
const LEE_SALES_BY_MONTH_LABELS = [
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
];
const LEE_SALES_BY_MONTH = LEE_SALES_BY_MONTH_LABELS.map((label, i) => ({
  label,
  value: LEE_SALES_BY_MONTH_VALUES[i],
}));
const LEE_SALES_AVG = Math.round(
  LEE_SALES_BY_MONTH.reduce((s, p) => s + p.value, 0) / LEE_SALES_BY_MONTH.length,
);

// ── 9. year-in-review — Lee County median recorded sale price, monthly ──────
// Same LeePA recorded-sale set as #8 (amount ≥ $10,000), median per month,
// 2025-05 → 2026-04. Pulled 07/09/2026.
const LEE_SALE_PRICE_LABELS = [
  "2025-05-01",
  "2025-06-01",
  "2025-07-01",
  "2025-08-01",
  "2025-09-01",
  "2025-10-01",
  "2025-11-01",
  "2025-12-01",
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
];
const LEE_SALE_PRICE: EmailTrendPoint[] = LEE_SALE_PRICE_LABELS.map((label, i) => ({
  label,
  value: LEE_SALE_PRICE_VALUES[i],
}));

await bars({
  file: "chart-zip-asking-bars.svg",
  points: ZIP_ASKING,
  average: ZIP_ASKING_AVG,
  title: "Median asking price · six biggest Lee County ZIPs",
  accent: "#0891B2",
  source: "Realtor.com residential listings · line marks the six-ZIP average",
  asOf: "2026-06-30",
  fmt: fmtK,
  valueLabels: true,
});
await trend({
  file: "chart-lee-median-asking.svg",
  points: LEE_ASKING,
  title: "Median asking price · Lee County",
  accent: "#0891B2",
  source: "Realtor.com via FRED",
  asOf: "2026-06-30",
  fmt: fmtK,
});
await trend({
  file: "chart-lee-active-inventory.svg",
  points: LEE_INVENTORY,
  title: "Homes for sale · Lee County",
  accent: "#0891B2",
  source: "Realtor.com via FRED",
  asOf: "2026-06-30",
  fmt: fmtInt,
});
await trend({
  file: "chart-luxury-top-tier.svg",
  points: LEE_TOP_TIER,
  title: "Top-tier home value · Lee County",
  accent: "#B8860B",
  source: "Zillow Home Value Index, top tier",
  asOf: "2026-05-31",
  fmt: fmtK,
});
await trend({
  file: "chart-zip33914-asking.svg",
  points: ZIP_33914,
  title: "Median asking price · ZIP 33914 · Cape Coral",
  accent: "#0891B2",
  source: "Realtor.com residential listings",
  asOf: "2026-06-30",
  fmt: fmtK,
});
await trend({
  file: "chart-fm-rent.svg",
  points: FM_RENT,
  title: "Typical asking rent · Fort Myers",
  accent: "#2E7D32",
  source: "Zillow Observed Rent Index",
  asOf: "2026-05-31",
  fmt: (v) => `$${fmtInt(v)}`,
});
await trend({
  file: "chart-pmms-rate.svg",
  points: PMMS_30YR,
  title: "30-year fixed mortgage rate · weekly",
  accent: "#3F51B5",
  source: "Freddie Mac Primary Mortgage Market Survey",
  asOf: "2026-07-09",
  fmt: fmtPct,
});
await bars({
  file: "chart-lee-sales-by-month.svg",
  points: LEE_SALES_BY_MONTH,
  average: LEE_SALES_AVG,
  title: "Homes sold by month · Lee County",
  accent: "#0891B2",
  source: "Lee County Property Appraiser recorded sales · line marks the 12-month average",
  asOf: "2026-05-30",
  fmt: fmtInt,
  valueLabels: false,
});
await trend({
  file: "chart-lee-sale-price-year.svg",
  points: LEE_SALE_PRICE,
  title: "Median recorded sale price · Lee County",
  accent: "#7B3FC7",
  source: "Lee County Property Appraiser recorded sales",
  asOf: "2026-05-30",
  fmt: fmtK,
});

console.log("done →", OUT);
