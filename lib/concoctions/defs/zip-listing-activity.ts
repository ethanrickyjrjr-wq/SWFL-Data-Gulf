// lib/concoctions/defs/zip-listing-activity.ts
//
// Listing-market activity per ZIP from data_lake.listing_transitions_recent_zip_stats.
// The view holds THREE grains (probed 07/12/2026): per-ZIP rows, county rollups
// (county NOT NULL + zip_code NULL) and ONE SWFL-wide total (county NULL +
// zip_code NULL). This def is the per-ZIP grain ONLY — both rollup grains are
// filtered in code, in exactly one place.
import { z } from "zod";
import { formatValue } from "../format";
import type { ConcoctionDef, ConcoctionRow } from "../types";

const ParamsSchema = z.object({
  county: z.enum(["Lee", "Collier", "Hendry"]).optional(),
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

export const zipListingActivity: ConcoctionDef<Params> = {
  id: "zip-listing-activity",
  label: "ZIP listing activity",
  description:
    "Fresh listing-market activity for every ZIP we track — new listings, price cuts, and recorded sales over the recent window. Compare ZIPs inside a county or spotlight one.",
  category: "Residential",
  tags: ["listings", "price cuts", "ZIP", "inventory", "market activity"],
  params: ParamsSchema,
  async load(sb, params) {
    const { data, error } = await (sb as SchemaChain)
      .schema("data_lake")
      .from("listing_transitions_recent_zip_stats")
      .select("county, zip_code, price_cuts_90d, sales_90d, new_listings_90d, latest_at");
    if (error) throw new Error(`listing_transitions_recent_zip_stats: ${error.message}`);
    let rows = ((data ?? []) as ConcoctionRow[]).filter(
      (r) => r.zip_code !== null && r.county !== null,
    );
    if (params.county) rows = rows.filter((r) => r.county === params.county);
    return rows;
  },
  columns: [
    { key: "zip_code", label: "ZIP", kind: "dimension", format: "text" },
    { key: "county", label: "County", kind: "dimension", format: "text" },
    {
      key: "new_listings_90d",
      label: "New listings (recent window)",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 5, minSpreadRatio: 0.3 },
    },
    {
      key: "price_cuts_90d",
      label: "Price cuts (recent window)",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 5, minSpreadRatio: 0.3 },
    },
    {
      key: "sales_90d",
      label: "Recorded sales (recent window)",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 6, minSpreadRatio: 0.5 },
      note: "FENCED — probed 07/12/2026: near-zero at ZIP grain (Lee max 7/ZIP, 38 county-wide). Likely a transition-detection ingest gap, not market truth; guard stays until that check resolves.",
    },
    { key: "latest_at", label: "Latest activity", kind: "dimension", format: "date" },
  ],
  asOf(rows) {
    const dates = rows
      .map((r) => r.latest_at)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (dates.length === 0) return "";
    return formatValue(dates.sort().at(-1)!.slice(0, 10), "date");
  },
  async probeAsOf(sb, params) {
    const rows = await this.load(sb, params); // ~56 rows — metadata-scale
    return this.asOf(rows);
  },
  sourceLine: "SWFL Data Gulf listing activity",
  defaultLayout: [
    {
      type: "hero",
      slice: { measures: ["new_listings_90d"], dimension: "zip_code" },
      layout: { x: 0, y: 0, w: 12, h: 3 },
    },
    {
      type: "image",
      slice: { measures: ["new_listings_90d"], dimension: "zip_code", topN: 10 },
      layout: { x: 0, y: 3, w: 12, h: 6 },
    },
    {
      type: "list",
      slice: { measures: ["new_listings_90d", "price_cuts_90d"], dimension: "zip_code", topN: 8 },
      layout: { x: 0, y: 9, w: 12, h: 5 },
    },
    {
      type: "sources",
      slice: { measures: ["new_listings_90d"] },
      layout: { x: 0, y: 14, w: 12, h: 2 },
    },
  ],
};
