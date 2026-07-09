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

const AXIS_TEXT = "#6B7280";

export interface EmailTrendPoint {
  label: string;
  value: number;
}

export interface BklitTrendOpts {
  title: string;
  accent: string;
  width?: number;
  height?: number;
  source?: string;
  asOf?: string;
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
      <Grid horizontal stroke="#EAECEF" />
      <Area
        curve={undefined}
        dataKey="value"
        fill={opts.accent}
        fillOpacity={0.18}
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
  const chrome = [
    `<text x="16" y="26" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${escXml(opts.title)}</text>`,
    captionParts.length
      ? `<text x="16" y="${H - 10}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${escXml(captionParts.join(" · "))}</text>`
      : "",
  ].join("");

  return svg.replace(
    /<svg([^>]*)>/,
    `<svg$1><rect width="${W}" height="${H}" fill="#ffffff"/>${chrome}`,
  );
}

export interface EmailComposedPoint {
  label: string;
  value: number;
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

  const svg = await renderBklitStaticSvg(
    <ComposedChart data={data} staticSize={{ width: W, height: H }} xDataKey="date">
      <Grid horizontal stroke="#EAECEF" />
      <SeriesBar dataKey="value" fill={opts.accent} />
      <Line dataKey="average" stroke={AXIS_TEXT} strokeWidth={2} />
    </ComposedChart>,
  );
  if (!svg) return null;

  // Same chrome pattern as bklitTrendSvg — see its comment for why this is
  // plain <text> outside the bklit subtree rather than bklit's own axis text.
  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  const chrome = [
    `<text x="16" y="26" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${escXml(opts.title)}</text>`,
    captionParts.length
      ? `<text x="16" y="${H - 10}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${escXml(captionParts.join(" · "))}</text>`
      : "",
  ].join("");

  return svg.replace(
    /<svg([^>]*)>/,
    `<svg$1><rect width="${W}" height="${H}" fill="#ffffff"/>${chrome}`,
  );
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
