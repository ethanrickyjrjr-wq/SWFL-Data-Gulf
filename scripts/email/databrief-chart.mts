/**
 * scripts/email/databrief-chart.mts — the CLI bridge that lets the sibling
 * greenfield repo `databrief` render REAL bklit charts (the same components
 * that draw this platform's live web frames and its production email PNGs)
 * without importing this repo.
 *
 *   bun scripts/email/databrief-chart.mts <spec.json> [--local-only]
 *
 * In: a JSON spec of chart definitions (shape below). Out: a PNG per chart,
 * always written under DATABRIEF_OUT, optionally also uploaded to the public
 * `email-media` bucket, and ONE JSON line on stdout describing both.
 *
 * Path: points → bklitComposedSvg / bklitTrendSvg (real bklit ComposedChart /
 * AreaChart via renderBklitStaticSvg's SSR bridge) → svgToPng (resvg, bundled
 * fonts) → hostEmailPng. Every one of those is the production module, not a
 * copy — see components/charts/vendor/bklit/NOTICE.md.
 *
 * MOAT: pure presentation. Every (label, value) pair arrives already sourced by
 * the caller; this file draws it and never computes, adjusts or invents one.
 * In particular it does NOT baseline-shift a trend series to exaggerate a
 * shallow slope — bklit pins the y-domain to [0, max*1.1] and renders no y-axis,
 * so a shift would be magnitude with no number on the image to correct it.
 *
 * NOT drawn: per-point labels. bklit renders bare geometry; email-svg.tsx adds
 * only the title + source/as-of caption. `label` positions a point, it does not
 * appear in the PNG. If the caller ever needs value/axis labels, the technique
 * is scripts/generate-seed-preview-charts.mts (regex-scrape the bklit subtree
 * for bar rects / line endpoints, inject <text> in outer coords).
 *
 * This is a showcase path: any render that comes back empty exits NON-ZERO.
 * There is no silent fallback to a hand-built SVG here.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  bklitTrendSvg,
  bklitComposedSvg,
  type EmailTrendPoint,
} from "@/components/charts/vendor/bklit/email-svg";
import { svgToPng, hostEmailPng } from "@/lib/email/chart-image";

/** Where databrief picks the PNGs up. Written on every run, hosted or not. */
const DATABRIEF_OUT = "C:/Users/ethan/dev/databrief/out/charts";

interface ChartSpec {
  kind: "composed" | "trend";
  key: string;
  title: string;
  points: { label: string; value: number }[];
  average?: number;
  accent: string;
  source: string;
  asOf: string;
  width?: number;
  height?: number;
}

interface Spec {
  charts: ChartSpec[];
}

/** stdout is the machine channel — the sibling repo parses the single JSON
 *  line this script ends with, so every human-facing word goes to stderr. */
function note(msg: string): void {
  console.error(msg);
}

function fail(msg: string): never {
  console.error(`databrief-chart: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const localOnly = args.includes("--local-only");
const specPath = args.find((a) => !a.startsWith("--"));
if (!specPath) {
  fail("usage: bun scripts/email/databrief-chart.mts <spec.json> [--local-only]");
}

let spec: Spec;
try {
  spec = JSON.parse(await readFile(specPath, "utf8")) as Spec;
} catch (e) {
  fail(`could not read/parse spec ${specPath}: ${(e as Error).message}`);
}
if (!Array.isArray(spec.charts) || spec.charts.length === 0) {
  fail(`spec ${specPath} has no charts[]`);
}

function validate(c: ChartSpec, i: number): void {
  const at = `charts[${i}]`;
  if (c.kind !== "composed" && c.kind !== "trend")
    fail(`${at}: unknown kind ${JSON.stringify(c.kind)} (composed|trend)`);
  if (!c.key || c.key.startsWith("/")) fail(`${at}: key must be a non-empty relative storage key`);
  if (!c.title) fail(`${at}: title is required`);
  if (!c.accent) fail(`${at}: accent hex is required`);
  if (!Array.isArray(c.points) || c.points.length < 2) {
    fail(`${at}: needs at least 2 points (bklit returns null below that)`);
  }
  c.points.forEach((p, j) => {
    if (typeof p.label !== "string" || !p.label)
      fail(`${at}.points[${j}]: label must be a non-empty string`);
    if (typeof p.value !== "number" || !Number.isFinite(p.value)) {
      fail(`${at}.points[${j}]: value must be a finite number (got ${JSON.stringify(p.value)})`);
    }
  });
  if (c.kind === "composed" && (typeof c.average !== "number" || !Number.isFinite(c.average))) {
    fail(`${at}: kind "composed" requires a finite "average" (the reference line)`);
  }
  // Negative values are REFUSED, not drawn. Probed 08/02/2026 on a 24-point
  // composed series spanning -6.1..+7.2: bklit's shell draws no zero baseline,
  // so every bar grows from the plot floor and a -6.1 renders as the SHORTEST
  // bar — ordinally right, sign-blind, and magnitudinally wrong. With no
  // y-axis and no value labels there is nothing on the image to correct it, so
  // a decline reads as a small gain. That is a misleading chart, which is worse
  // than no chart; plot the LEVEL, or rebase the series so the floor is zero.
  const neg = c.points.find((p) => p.value < 0);
  if (neg) {
    fail(
      `${at}: negative value ${neg.value} at ${JSON.stringify(neg.label)} — bklit draws no zero baseline, so negatives render as short POSITIVE bars (a decline would read as a small gain). Plot the level instead of the delta, or rebase so the minimum is 0.`,
    );
  }
  if (c.kind === "trend") {
    // bklit's time-series shell x-accessor does `new Date(value)` on the raw
    // label, and AreaChart passes labels straight through (unlike composed,
    // which substitutes synthetic dates). A non-date label doesn't error — it
    // silently scrambles/overlaps the x positions. A shape test, NOT
    // `Number.isNaN(new Date(label))`: per email-svg.tsx, `new Date("33921")`
    // parses as the YEAR 33921, so a ZIP or any bare number sails past a
    // validity check and quietly wrecks the spacing.
    const bad = c.points.find((p) => !/^\d{4}-\d{2}(-\d{2})?/.test(p.label));
    if (bad) {
      fail(
        `${at}: kind "trend" labels are parsed as dates; ${JSON.stringify(bad.label)} is not one (use "YYYY-MM" or an ISO date). Category labels belong on kind "composed".`,
      );
    }
  }
}

spec.charts.forEach(validate);

await mkdir(DATABRIEF_OUT, { recursive: true });

const out: Record<string, { url: string | null; local: string; bytes: number }> = {};

for (const c of spec.charts) {
  const opts = {
    title: c.title,
    accent: c.accent,
    width: c.width,
    height: c.height,
    source: c.source,
    asOf: c.asOf,
  };
  const svg =
    c.kind === "composed"
      ? await bklitComposedSvg(c.points, c.average as number, opts)
      : await bklitTrendSvg(c.points as EmailTrendPoint[], opts);
  if (!svg) {
    fail(
      `${c.kind} render returned NULL for ${c.key} — bklit produced no <svg>. No fallback here.`,
    );
  }

  const png = svgToPng(svg);
  if (png.length === 0) fail(`resvg produced 0 bytes for ${c.key}`);

  const local = join(DATABRIEF_OUT, basename(c.key));
  await writeFile(local, png);

  let url: string | null = null;
  if (!localOnly) {
    url = await hostEmailPng(c.key, png);
  }

  note(`${c.kind} ${c.key} → ${local} (${png.length} bytes)${url ? ` · ${url}` : ""}`);
  out[c.key] = { url, local, bytes: png.length };
}

console.log(JSON.stringify({ charts: out }));
