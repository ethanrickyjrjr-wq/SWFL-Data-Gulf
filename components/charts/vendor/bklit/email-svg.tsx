// email-svg.tsx — real bklit components, rendered server-side to the SAME
// standalone SVG string shape lib/email/chart-image.ts's hand-built builders
// return, so lib/email/spec-to-png.ts can drop these in as an additional
// producer with zero change to its resvg/hosting plumbing. THE POINT: the
// exact component that renders the live web frame (client, animated) also
// renders the email PNG (server, static) — no second hand-authored SVG string
// per shape. See render-static.tsx for the SSR mechanics and NOTICE.md for the
// two-prop fork (`staticSize`, `initialLoaded`) that makes it possible.
//
// MOAT: pure presentation. Every (label, value) pair here is a value the
// caller already extracted from an audited ChartSpec (chart-for-question.ts /
// compose-chart.ts's point-selection) — this file draws it, never computes or
// invents it.
import { AreaChart } from "./area-chart";
import { Area } from "./area";
import { ComposedChart } from "./composed-chart";
import { Grid } from "./grid";
import { Line } from "./line";
import { SeriesBar } from "./series-bar";
import { renderBklitStaticSvg } from "./render-static";
import { formatDisplayDate } from "@/lib/format-date";
import { TABULAR } from "@/lib/charts/format";

const AXIS_TEXT = "#6B7280";
const LABEL_INK = "#1F2937";

export interface EmailTrendPoint {
  label: string;
  value: number;
  /** Text drawn when value labels are on. Defaults to a locale-formatted
   *  `value` — presentation of an already-sourced number, never a new one. */
  display?: string;
}

/** Default on-chart number: the sourced value, locale-formatted, no unit. */
export function defaultValueDisplay(v: number): string {
  return Number.isInteger(v)
    ? v.toLocaleString("en-US")
    : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// bklit static geometry (probed 07/09/2026, re-proven by the count-mismatch
// guard on every labeled render): plot group at translate(40,40), plot area
// (W-80) × (H-80). Line paths and bar rects are in PLOT coordinates.
const PLOT_X = 40;
const PLOT_Y = 40;

/** First/last coordinate pair of the bklit line path (plot coords), or null
 *  when the path shape drifted — callers skip labels rather than misplace. */
export function lineEndpoints(
  svg: string,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const m = svg.match(/class="visx-linepath" d="([^"]+)"/);
  if (!m) return null;
  const pairs = [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)];
  if (pairs.length < 2) return null;
  const f = pairs[0];
  const l = pairs[pairs.length - 1];
  return { x0: +f[1], y0: +f[2], x1: +l[1], y1: +l[2] };
}

/** The composed chart's reference line (plot coords). Unlike the AreaChart's
 *  line, ComposedChart's `Line` renders a CLASS-LESS `<path>` whose stroke is a
 *  per-series gradient (`url(#line-gradient-<dataKey>-…)`) — probed 08/09/2026
 *  when the visx-linepath scrape silently drew no label. Keyed to the `average`
 *  series' own gradient id so a second Line could never be misread. */
export function averageLinePath(
  svg: string,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const m = svg.match(/<path d="([^"]+)"[^>]*stroke="url\(#line-gradient-average-/);
  if (!m) return null;
  const pairs = [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)];
  if (pairs.length < 2) return null;
  const f = pairs[0];
  const l = pairs[pairs.length - 1];
  return { x0: +f[1], y0: +f[2], x1: +l[1], y1: +l[2] };
}

/** Accent-filled bar rects (plot coords), in document order. */
export function barRects(svg: string, accent: string): { cx: number; top: number }[] {
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

/** "YYYY-MM…" → "Mon ’YY"; anything else passes through untouched. */
export function axisLabel(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})/);
  if (!m) return raw;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    +m[2] - 1
  ];
  return mon ? `${mon} ’${m[1].slice(2)}` : raw;
}

export interface BklitTrendOpts {
  title: string;
  accent: string;
  width?: number;
  height?: number;
  source?: string;
  asOf?: string;
  /** Plot background. Default keeps the historical white; pass a light grey
   *  (e.g. "#F4F6F5") when the accent needs a surface to show up against. */
  background?: string;
  /** Area fill opacity. The 0.18 default measured too faint in a delivered
   *  email (operator finding 08/02/2026); ~0.35 survives Gmail rendering. */
  fillOpacity?: number;
  /** Gridline stroke. Default #EAECEF is tuned for white; go a step darker
   *  on a grey background so the grid stays visible. */
  gridStroke?: string;
  /** Draw the NUMBERS on the chart (operator decree 08/02/2026: a chart with
   *  no numbers on it sucks). Off by default — existing renders stay
   *  byte-identical. "endpoints": first/last value + first/last x label
   *  (right density for a long series). "all": every point — trend treats it
   *  as endpoints; composed labels every bar + its category. Geometry is
   *  scraped from the rendered bklit subtree; if the scrape misses (version
   *  drift), the chart renders UNLABELED rather than mislabeled — showcase
   *  callers assert label presence and fail loud (databrief-chart.mts). */
  valueLabels?: "endpoints" | "all";
  /** Composed only: text drawn ON the reference line (left end, dark ink), so the
   *  line identifies itself — e.g. "$377/sq ft — this home now". Looked at
   *  08/09/2026: an unlabeled grey line was both invisible and unexplained. The
   *  caller composes it from already-sourced values; this file never invents it.
   *  Same scrape-miss posture as valueLabels: no geometry → no label. */
  averageLabel?: string;
}

/** A time-series trend as a real bklit `AreaChart` (gradient fill + line),
 *  server-rendered — the upgrade path for what `trendChartSvg` draws by hand.
 *  Returns `null` on <2 points or any render failure (caller falls back to
 *  `trendChartSvg`, RULE 0.7 — best-effort, never blocks the build). */
export async function bklitTrendSvg(
  points: EmailTrendPoint[],
  opts: BklitTrendOpts,
): Promise<string | null> {
  if (points.length < 2) return null;
  const W = opts.width ?? 600;
  const H = opts.height ?? 300;
  const data = points.map((p) => ({ date: p.label, value: p.value }));

  const svg = await renderBklitStaticSvg(
    <AreaChart data={data} staticSize={{ width: W, height: H }} xDataKey="date">
      <Grid horizontal stroke={opts.gridStroke ?? "#EAECEF"} />
      <Area
        curve={undefined}
        dataKey="value"
        fill={opts.accent}
        fillOpacity={opts.fillOpacity ?? 0.18}
        stroke={opts.accent}
        strokeWidth={2.5}
      />
    </AreaChart>,
  );
  if (!svg) return null;

  // Title + caption chrome to match the hand-built trend/bar builders' look —
  // drawn as plain <text> (Arial, matches CHART_FONT_FILES) OUTSIDE the bklit
  // subtree rather than through bklit's own axis/legend text (which would need
  // its own font-availability check under resvg's loadSystemFonts:false — a
  // follow-up, not this pass).
  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  // ON THE EMAIL'S OWN TYPE SCALE (08/09/2026 — operator, on the rendered chart:
  // "DIFFERENT FONTS??? SIZES???"): title 16/500, values 12/500 tabular, small
  // text 12. The bridge's original 15-bold/11-bold/10 chrome existed on no step
  // of the seven-size scale — same defect, same day, same fix as dot-plot.ts.
  const chrome = [
    `<text x="16" y="26" font-family="Arial" font-size="16" font-weight="500" fill="#1F2937">${escXml(opts.title)}</text>`,
    captionParts.length
      ? `<text x="16" y="${H - 10}" font-family="Arial" font-size="12" fill="${AXIS_TEXT}">${escXml(captionParts.join(" · "))}</text>`
      : "",
  ].join("");

  // Numbers on the chart — endpoint dots + first/last values + first/last x
  // labels, geometry scraped from the line path. Scrape miss → no labels,
  // never misplaced ones.
  let labels = "";
  if (opts.valueLabels) {
    const ep = lineEndpoints(svg);
    if (ep) {
      const first = points[0];
      const last = points[points.length - 1];
      const x0 = PLOT_X + ep.x0;
      const y0 = PLOT_Y + ep.y0;
      const x1 = PLOT_X + ep.x1;
      const y1 = PLOT_Y + ep.y1;
      // flip a label below its endpoint when the line immediately rises past it
      const y0text = points[1].value > first.value ? y0 + 18 : y0 - 8;
      const y1text = points[points.length - 2].value > last.value ? y1 + 18 : y1 - 8;
      labels = [
        `<circle cx="${x0}" cy="${y0}" r="4" fill="${opts.accent}" stroke="#ffffff" stroke-width="2"/>`,
        `<circle cx="${x1}" cy="${y1}" r="4" fill="${opts.accent}" stroke="#ffffff" stroke-width="2"/>`,
        `<text x="${x0 + 8}" y="${Math.max(y0text, 44)}" font-family="Arial" ${TABULAR} font-size="12" font-weight="500" fill="${LABEL_INK}">${escXml(first.display ?? defaultValueDisplay(first.value))}</text>`,
        `<text x="${x1 - 8}" y="${Math.max(y1text, 44)}" font-family="Arial" ${TABULAR} font-size="12" font-weight="500" fill="${LABEL_INK}" text-anchor="end">${escXml(last.display ?? defaultValueDisplay(last.value))}</text>`,
        `<text x="${x0}" y="${H - 24}" font-family="Arial" font-size="12" fill="${AXIS_TEXT}">${escXml(axisLabel(first.label))}</text>`,
        `<text x="${x1}" y="${H - 24}" font-family="Arial" font-size="12" fill="${AXIS_TEXT}" text-anchor="end">${escXml(axisLabel(last.label))}</text>`,
      ].join("");
    }
  }

  return svg
    .replace(
      /<svg([^>]*)>/,
      `<svg$1><rect width="${W}" height="${H}" fill="${opts.background ?? "#ffffff"}"/>${chrome}`,
    )
    .replace("</svg>", `${labels}</svg>`);
}

export interface EmailComposedPoint {
  label: string;
  value: number;
  /** Text drawn when value labels are on — see EmailTrendPoint.display. */
  display?: string;
}

/** A bar + reference-line combo as a real bklit `ComposedChart` (SeriesBar +
 *  Line), server-rendered — the upgrade path for a plain bar-table when the
 *  caller also has a derived reference value (e.g. the mean of the same
 *  points, per `reshapeChartToType`'s "composed" case — never a second
 *  invented number). Returns `null` on <2 points or any render failure
 *  (caller falls back to `barChartSvg`, RULE 0.7 — best-effort, never blocks
 *  the build). */
export async function bklitComposedSvg(
  points: EmailComposedPoint[],
  average: number,
  opts: BklitTrendOpts,
): Promise<string | null> {
  if (points.length < 2) return null;
  const W = opts.width ?? 600;
  const H = opts.height ?? 300;
  // NOT `date: p.label` — ComposedChart shares bklit's time-series shell,
  // whose xAccessor always does `new Date(value)`. Category labels here are
  // ZIP codes / city names, not dates: `new Date("33921")` parses as year
  // 33921 (not Invalid Date), silently re-sorting/overlapping the bars by
  // that bogus year instead of the given order (caught via a spike render —
  // real bars landed at scrambled/overlapping x positions). A synthetic
  // strictly-increasing day sequence positions points in the given order;
  // no axis is rendered (no <XAxis> child below) so the fake dates are never
  // shown — only the real (label, value) pairs plot as bar height + line.
  const data = points.map((p, i) => ({ date: new Date(2000, 0, i + 1), value: p.value, average }));

  let svg = await renderBklitStaticSvg(
    <ComposedChart data={data} staticSize={{ width: W, height: H }} xDataKey="date">
      <Grid horizontal stroke={opts.gridStroke ?? "#EAECEF"} />
      <SeriesBar dataKey="value" fill={opts.accent} />
      {/* Dark ink, not axis grey (looked at 08/09/2026): a 2px #6B7280 line over
          teal bars was nearly invisible — and the reference line IS the argument. */}
      <Line dataKey="average" stroke={LABEL_INK} strokeWidth={2.5} />
    </ComposedChart>,
  );
  if (!svg) return null;

  // Scrape the reference line's geometry BEFORE recoloring it — averageLinePath
  // keys on the gradient stroke the next line removes (the first cut ran these
  // in the other order and the label silently never drew — looked at 08/09/2026).
  const avgEp = averageLinePath(svg);

  // SOLID reference line (looked at 08/09/2026): bklit strokes a Line with a
  // per-series gradient whose ends fade to opacity 0 — right for a decorative
  // trend, wrong for a reference line, which read as a smear. Swap the
  // `average` series' gradient stroke for flat ink; the orphaned <defs>
  // gradient is inert.
  svg = svg.replace(/stroke="url\(#line-gradient-average-[^)]*\)"/, `stroke="${LABEL_INK}"`);

  // Same chrome pattern as bklitTrendSvg — see its comment for why this is
  // plain <text> outside the bklit subtree rather than bklit's own axis text,
  // and its type-scale comment for why 16/500 · 12/500 tabular · 12.
  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  const chrome = [
    `<text x="16" y="26" font-family="Arial" font-size="16" font-weight="500" fill="#1F2937">${escXml(opts.title)}</text>`,
    captionParts.length
      ? `<text x="16" y="${H - 10}" font-family="Arial" font-size="12" fill="${AXIS_TEXT}">${escXml(captionParts.join(" · "))}</text>`
      : "",
  ].join("");

  // Numbers on the chart — per-bar category + value labels ("all"), or
  // first/last bars only ("endpoints"). Geometry from the rendered rects; a
  // count mismatch means bklit drift → no labels, never wrong ones. The
  // value label y is clamped below the title line so a full-height bar's
  // number never collides with the chart title.
  let labels = "";
  if (opts.valueLabels) {
    const rects = barRects(svg, opts.accent);
    if (rects.length === points.length) {
      const wanted = opts.valueLabels === "all" ? points.map((_, i) => i) : [0, points.length - 1];
      labels = rects
        .map((r, i) => {
          if (!wanted.includes(i)) return "";
          const cx = PLOT_X + r.cx;
          const p = points[i];
          return [
            `<text x="${cx}" y="${H - 24}" font-family="Arial" font-size="12" fill="${AXIS_TEXT}" text-anchor="middle">${escXml(axisLabel(p.label))}</text>`,
            `<text x="${cx}" y="${Math.max(PLOT_Y + r.top - 6, 44)}" font-family="Arial" ${TABULAR} font-size="12" font-weight="500" fill="${LABEL_INK}" text-anchor="middle">${escXml(p.display ?? defaultValueDisplay(p.value))}</text>`,
          ].join("");
        })
        .join("");
    }
  }

  // The reference line names itself — dark ink at its LEFT end, where ascending
  // bars are shortest so the text sits over open plot, not over a bar. Geometry
  // is `avgEp`, scraped above pre-recolor (the visx-linepath class exists only
  // on the AreaChart's line, not here); a scrape miss draws nothing.
  if (opts.averageLabel && avgEp) {
    labels += `<text x="${PLOT_X + avgEp.x0}" y="${Math.max(PLOT_Y + avgEp.y0 - 10, 44)}" font-family="Arial" ${TABULAR} font-size="12" font-weight="500" fill="${LABEL_INK}">${escXml(opts.averageLabel)}</text>`;
  }

  return svg
    .replace(
      /<svg([^>]*)>/,
      `<svg$1><rect width="${W}" height="${H}" fill="${opts.background ?? "#ffffff"}"/>${chrome}`,
    )
    .replace("</svg>", `${labels}</svg>`);
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
