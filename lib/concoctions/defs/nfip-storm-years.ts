// lib/concoctions/defs/nfip-storm-years.ts
//
// NFIP flood claims by county and year — data_lake.fema_nfip_county_year
// (probed 07/12/2026: the real object name has NO `_view` suffix; the 07/12
// viz plan's `fema_nfip_county_year_view` was the SQL filename, not the view).
import { z } from "zod";
import type { ConcoctionDef, ConcoctionRow } from "../types";

const ParamsSchema = z.object({
  /** FIPS county code, e.g. Lee = "12071", Collier = "12021". */
  countyCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
});
type Params = z.infer<typeof ParamsSchema>;

type SchemaChain = {
  schema(name: string): {
    from(table: string): {
      select(
        cols: string,
      ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

export const nfipStormYears: ConcoctionDef<Params> = {
  id: "nfip-storm-years",
  label: "Flood claims by storm year",
  description:
    "Federal flood-insurance claims per county per year — claim counts and total paid. Storm years stand out on their own; no editorializing required.",
  category: "Risk",
  tags: ["flood", "NFIP", "storms", "insurance", "claims", "risk"],
  params: ParamsSchema,
  async load(sb, params) {
    const { data, error } = await (sb as SchemaChain)
      .schema("data_lake")
      .from("fema_nfip_county_year")
      .select("county_code, year, claim_count, paid_total_usd");
    if (error) throw new Error(`fema_nfip_county_year: ${error.message}`);
    let rows = (data ?? []) as ConcoctionRow[];
    if (params.countyCode) rows = rows.filter((r) => r.county_code === params.countyCode);
    return rows;
  },
  columns: [
    { key: "county_code", label: "County", kind: "dimension", format: "text" },
    { key: "year", label: "Year", kind: "dimension", format: "number" },
    {
      key: "claim_count",
      label: "Claims",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 3 },
    },
    {
      key: "paid_total_usd",
      label: "Total paid",
      kind: "measure",
      format: "usd",
      guards: { minDistinct: 3 },
    },
  ],
  asOf(rows) {
    const years = rows
      .map((r) => r.year)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (years.length === 0) return "";
    // County-year grain: the honest "data through" is year end.
    return `12/31/${Math.max(...years)}`;
  },
  async probeAsOf(sb, params) {
    const rows = await this.load(sb, params);
    return this.asOf(rows);
  },
  sourceLine: "OpenFEMA NFIP claims (county-year)",
  defaultLayout: [
    {
      type: "hero",
      slice: { measures: ["paid_total_usd"], dimension: "year" },
      layout: { x: 0, y: 0, w: 12, h: 3 },
    },
    {
      type: "image",
      slice: { measures: ["paid_total_usd"], dimension: "year", topN: 12 },
      layout: { x: 0, y: 3, w: 12, h: 6 },
    },
    {
      type: "list",
      slice: { measures: ["claim_count", "paid_total_usd"], dimension: "year", topN: 6 },
      layout: { x: 0, y: 9, w: 12, h: 5 },
    },
    {
      type: "sources",
      slice: { measures: ["paid_total_usd"] },
      layout: { x: 0, y: 14, w: 12, h: 2 },
    },
  ],
};
