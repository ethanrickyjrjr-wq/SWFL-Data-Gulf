// lib/concoctions/defs/asking-price-trend.ts
//
// Daily median ASKING price per city — data_lake.daily_truth, read exactly like
// lib/desk/loaders.ts: metric_key='median_asking_price' (median_sale_price was
// RETIRED 07/12/2026 — nineteen days of all-NULL rows, no daily sold source),
// non-finite values dropped in code.
import { z } from "zod";
import { formatValue } from "../format";
import type { ConcoctionDef, ConcoctionRow } from "../types";

const ParamsSchema = z.object({
  area: z.enum(["cape_coral", "fort_myers", "naples"]),
});
type Params = z.infer<typeof ParamsSchema>;

type SchemaChain = {
  schema(name: string): {
    from(table: string): {
      select(cols: string): {
        eq(
          col: string,
          v: string,
        ): {
          eq(
            col: string,
            v: string,
          ): {
            order(
              col: string,
              opts: { ascending: boolean },
            ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
};

export const askingPriceTrend: ConcoctionDef<Params> = {
  id: "asking-price-trend",
  label: "Asking price trend",
  description:
    "Daily median asking price for a city, computed from our own cleaned active inventory. The honest day-by-day pulse of what sellers are asking.",
  category: "Residential",
  tags: ["asking price", "trend", "daily", "median", "city"],
  params: ParamsSchema,
  async load(sb, params) {
    const { data, error } = await (sb as SchemaChain)
      .schema("data_lake")
      .from("daily_truth")
      .select("metric_key, area, period, value, unit, source_title")
      .eq("metric_key", "median_asking_price")
      .eq("area", params.area)
      .order("period", { ascending: true });
    if (error) throw new Error(`daily_truth: ${error.message}`);
    // Mirror lib/desk/loaders.ts: drop non-finite values in code.
    return ((data ?? []) as ConcoctionRow[]).filter(
      (r) => typeof r.value === "number" && Number.isFinite(r.value),
    );
  },
  columns: [
    { key: "period", label: "Day", kind: "dimension", format: "date" },
    {
      key: "value",
      label: "Median asking price",
      kind: "measure",
      format: "usd",
      guards: { maxNullShare: 0.4, minDistinct: 3 },
    },
    { key: "area", label: "City", kind: "dimension", format: "text" },
    { key: "source_title", label: "Source", kind: "dimension", format: "text" },
  ],
  asOf(rows) {
    const days = rows
      .map((r) => r.period)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (days.length === 0) return "";
    return formatValue(days.sort().at(-1)!, "date");
  },
  async probeAsOf(sb, params) {
    const rows = await this.load(sb, params);
    return this.asOf(rows);
  },
  sourceLine: "SWFL Data Gulf daily market truth",
  defaultLayout: [
    {
      type: "metric-card",
      slice: { measures: ["value"], dimension: "period" },
      layout: { x: 0, y: 0, w: 12, h: 3 },
    },
    {
      type: "image",
      slice: { measures: ["value"], dimension: "period" },
      layout: { x: 0, y: 3, w: 12, h: 6 },
    },
    {
      type: "sources",
      slice: { measures: ["value"] },
      layout: { x: 0, y: 9, w: 12, h: 2 },
    },
  ],
};
