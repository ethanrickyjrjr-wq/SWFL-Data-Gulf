// lib/concoctions/chart-block.ts
//
// The chart shape for a concoction slice: rows → email-safe SVG (bar for
// categorical dimensions, trend for date dimensions) → PNG (resvg) → hosted
// email-media URL → an `image` block (kind:"chart"). Provenance (source line +
// as-of) is burned INTO the SVG caption by the chart primitives AND carried on
// the block caption. Keys are content-deterministic: same def+slice+params →
// same key (idempotent upsert re-uses the object).
import { createHash } from "node:crypto";
import {
  barChartSvg,
  trendChartSvg,
  svgToPng,
  hostEmailPng,
  type TrendPoint,
} from "@/lib/email/chart-image";
import type { ValueFormat } from "@/lib/charts/format";
import type { EmailBlock } from "@/lib/email/doc/types";
import type { ColumnFormat, ConcoctionDef, ConcoctionRow, DefaultBlockSpec } from "./types";

export interface ChartBlockOpts {
  asOf: string;
  hostPng?: (key: string, buf: Buffer) => Promise<string>;
  accent?: string;
  ids?: () => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = ConcoctionDef<any>;

/** ColumnFormat → the chart primitives' ValueFormat vocabulary. */
function toValueFormat(f: ColumnFormat): ValueFormat {
  if (f === "usd") return "usd";
  if (f === "percent") return "pct";
  return "count";
}

/** Deterministic media key for a slice render. */
export function chartKey(
  defId: string,
  spec: DefaultBlockSpec,
  params: Record<string, unknown>,
): string {
  const stable = JSON.stringify({
    measures: spec.slice.measures,
    dimension: spec.slice.dimension ?? null,
    topN: spec.slice.topN ?? null,
    filter: spec.slice.filter ?? null,
    params: Object.fromEntries(Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b))),
  });
  const h = createHash("sha256").update(stable).digest("hex").slice(0, 16);
  return `concoctions/${defId}/${h}.png`;
}

export async function buildChartBlock(
  def: AnyDef,
  rows: ConcoctionRow[],
  spec: DefaultBlockSpec,
  opts: ChartBlockOpts,
  params: Record<string, string | number> = {},
): Promise<EmailBlock> {
  const measureKey = spec.slice.measures[0];
  const mCol = def.columns.find((c) => c.key === measureKey);
  const dimKey = spec.slice.dimension;
  const dCol = dimKey ? def.columns.find((c) => c.key === dimKey) : undefined;
  if (!mCol || !dCol) throw new Error(`${def.id}: chart slice needs a measure and a dimension`);

  const accent = opts.accent ?? "#3DC9C0";
  const title = `${mCol.label} — ${def.label}`;
  const valueFormat = toValueFormat(mCol.format);

  let svg: string;
  if (dCol.format === "date") {
    const points: TrendPoint[] = rows
      .filter(
        (r) =>
          typeof r[dCol.key] === "string" &&
          typeof r[measureKey] === "number" &&
          Number.isFinite(r[measureKey] as number),
      )
      .sort((a, b) => String(a[dCol.key]).localeCompare(String(b[dCol.key])))
      .map((r) => ({ label: String(r[dCol.key]).slice(0, 10), value: r[measureKey] as number }));
    if (points.length < 2) throw new Error(`${def.id}: not enough points for a trend`);
    svg = trendChartSvg(points, {
      title,
      accent,
      valueFormat,
      source: def.sourceLine,
      asOf: opts.asOf,
    });
  } else {
    const bars = rows
      .filter((r) => typeof r[measureKey] === "number" && Number.isFinite(r[measureKey] as number))
      .sort((a, b) => (b[measureKey] as number) - (a[measureKey] as number))
      .slice(0, spec.slice.topN ?? 8)
      .map((r) => ({
        label: String(r[dCol.key] ?? ""),
        value: r[measureKey] as number,
      }));
    if (bars.length === 0) throw new Error(`${def.id}: no bars to chart`);
    svg = barChartSvg(bars, {
      title,
      accent,
      valueFormat,
      source: def.sourceLine,
      asOf: opts.asOf,
    });
  }

  const png = svgToPng(svg);
  const key = chartKey(def.id, spec, params);
  const url = await (opts.hostPng ?? hostEmailPng)(key, png);

  return {
    id: opts.ids ? opts.ids() : `conc-${def.id}-chart`,
    type: "image",
    props: {
      url,
      alt: title,
      caption: `${mCol.label} · ${def.sourceLine} · As of ${opts.asOf}`,
      kind: "chart",
    },
    layout: { ...spec.layout },
  };
}
