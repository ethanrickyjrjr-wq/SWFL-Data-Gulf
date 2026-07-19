// lib/concoctions/defs/corridor-profiles.ts
//
// SWFL commercial market — same read as refinery/sources/cre-source.mts + the
// embed asking-rent card: verified, non-deleted, live public.corridor_profiles.
// NO county param: probed 07/12/2026 — the table has `city`, not `county`;
// deriving county from city would be invention (plan Task 3 NOTE).
//
// GRAIN (established 07/13/2026, migration 20260713_corridor_submarket_grain):
// asking rent, vacancy, absorption and cap rate are NOT corridor measurements.
// They are Cushman & Wakefield MarketBeat SUBMARKET figures (SWFL Retail, Q4
// 2025) stamped onto every corridor inside the submarket — the (rent, vacancy)
// pair on 23 of 27 verified corridors is an exact match to a row of that report's
// submarket table. So those four measures declare `grain: "submarket"` and the
// materializer collapses to it before ranking or crowning. The remaining four
// corridors match no published row and carry no source; they hold NULL submarket
// and therefore drop out of every figure shape (an uncited number is the one
// thing we may not render).
//
// What IS the corridor's own: type, character, evolution direction, seasonality.
// Naples alone has 6 distinct seasonal values across its 9 corridors. Corridor
// vocabulary is insider language — it rides the drill-down list, never the
// headline.
import { z } from "zod";
import { formatValue } from "../format";
import type { ConcoctionDef, ConcoctionRow } from "../types";

const COLS =
  "corridor_name, city, submarket, corridor_type, evolution_direction, seasonal_index, cap_rate_pct, vacancy_rate_pct, absorption_sqft, asking_rent_psf, character, metrics_verified_date";

const ParamsSchema = z.object({});
type Params = z.infer<typeof ParamsSchema>;

function maxDate(rows: ConcoctionRow[], key: string): string {
  const dates = rows
    .map((r) => r[key])
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  if (dates.length === 0) return "";
  return formatValue(dates.sort().at(-1)!, "date");
}

type QueryChain = {
  from(table: string): {
    select(cols: string): {
      is(
        col: string,
        v: null,
      ): {
        eq(
          col: string,
          v: string,
        ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
};

export const corridorProfiles: ConcoctionDef<Params> = {
  id: "corridor-profiles",
  // Plain-words label. "Corridor" is broker vocabulary — it belongs in the
  // drill-down for people who actually talk that way, not in the picker.
  label: "Commercial rents & vacancy",
  description:
    "Retail asking rent and vacancy across Southwest Florida's submarkets — Naples, Estero, Cape Coral, Lehigh Acres and the rest — with the local streets that sit inside each one.",
  category: "Commercial",
  tags: ["rent", "vacancy", "retail", "commercial", "submarket", "corridors"],
  params: ParamsSchema,
  async load(sb, _params) {
    const { data, error } = await (sb as QueryChain)
      .from("corridor_profiles")
      .select(COLS)
      .is("deleted_at", null)
      .eq("verification_status", "verified");
    if (error) throw new Error(`corridor_profiles: ${error.message}`);
    return (data ?? []) as ConcoctionRow[];
  },
  columns: [
    { key: "submarket", label: "Submarket", kind: "dimension", format: "text" },
    { key: "corridor_name", label: "Corridor", kind: "dimension", format: "text" },
    { key: "city", label: "City", kind: "dimension", format: "text" },
    { key: "corridor_type", label: "Type", kind: "dimension", format: "text" },
    { key: "evolution_direction", label: "Direction", kind: "dimension", format: "text" },
    {
      key: "asking_rent_psf",
      label: "Asking rent (per sqft)",
      kind: "measure",
      format: "usd",
      grain: "submarket",
      guards: { minDistinct: 5, minSpreadRatio: 0.2, maxNullShare: 0.3 },
      note: "Held at submarket grain — the same $60.84 sits on all three Naples corridors. Collapsed to submarket it is 11 real values, $16.04–$60.84.",
    },
    {
      key: "vacancy_rate_pct",
      label: "Vacancy",
      kind: "measure",
      format: "percent",
      grain: "submarket",
      guards: { minDistinct: 5, minSpreadRatio: 0.2, maxNullShare: 0.3 },
      note: "Held at submarket grain. 0.2% (Lehigh Acres) – 7.7% (Estero).",
    },
    {
      // The corridor's OWN measure — genuinely varies corridor by corridor
      // (9 Naples corridors, 6 distinct values), so it carries no grain override.
      key: "seasonal_index",
      label: "Seasonality",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 4, maxNullShare: 0.5 },
    },
    {
      // NOT submarket-grain (I asserted that on 07/13 and the data refuted it):
      // absorption VARIES inside a submarket — Naples 1,500 / 6,200 / null, Cape
      // Coral 3,500 / 4,500 / 6,200 — and those values appear nowhere in the C&W
      // table (its Naples row is -453 for the quarter, 15,058 YTD). So it is
      // neither a submarket figure nor a cited one. It carries no grain, and it
      // is kept OUT of the default layout until its provenance is established
      // (check: corridor_absorption_provenance).
      key: "absorption_sqft",
      label: "Net absorption (sqft)",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 5 },
    },
    {
      key: "cap_rate_pct",
      label: "Cap rate",
      kind: "measure",
      format: "percent",
      grain: "submarket",
      guards: { minDistinct: 5 },
      note: "FENCED, and coarser still: the report states ONE 6.7% average for the whole of Southwest Florida, which is why 22 corridors carry an identical 6.7. A single stated figure, never an axis. The guard enforces it.",
    },
    { key: "character", label: "Character", kind: "dimension", format: "text" },
    { key: "metrics_verified_date", label: "Verified", kind: "dimension", format: "date" },
  ],
  asOf(rows) {
    return maxDate(rows, "metrics_verified_date") || "";
  },
  async probeAsOf(sb, params) {
    // 27 rows — the load itself is already metadata-scale.
    const rows = await this.load(sb, params);
    return this.asOf(rows);
  },
  // The figures are Cushman & Wakefield's, not ours — say so. (Our own listing
  // and comp citations still read "SWFL Data Gulf"; this is a third-party report
  // we are quoting, and the report is what a broker will check us against.)
  sourceLine: "Cushman & Wakefield MarketBeat — Southwest Florida Retail, Q4 2025",
  // asOf here is metrics_verified_date — the day WE last checked the figures,
  // not the report's period (that's the "Q4 2025" in sourceLine). "As of
  // 06/09/2026" next to a Q4 2025 report reads as data currency, so the label
  // says what the date actually is (check corridor_asof_vs_report_period).
  asOfLabel: "Verified",
  defaultLayout: [
    // Every measure below is submarket-grain, so the grain seam collapses these
    // to one row per submarket and the dimension resolves to `submarket`. The
    // headline names the submarket that leads on rent; the chart ranks submarkets
    // (11 real, distinct values) instead of drawing duplicate corridor bars.
    {
      type: "hero",
      slice: { measures: ["asking_rent_psf"], dimension: "submarket" },
      layout: { x: 0, y: 0, w: 12, h: 3 },
    },
    {
      // Cap rate, not absorption: 6.7% is stated verbatim in the report as the
      // Southwest Florida average (a market-grain figure, hence the 22 identical
      // values), so it is honest AS A STATED STAT — just never as an axis, which
      // its distribution guard already enforces. Absorption is uncited; it stays off.
      type: "stats",
      slice: { measures: ["asking_rent_psf", "vacancy_rate_pct", "cap_rate_pct"] },
      layout: { x: 0, y: 3, w: 12, h: 3 },
    },
    {
      type: "image",
      slice: { measures: ["asking_rent_psf"], dimension: "submarket", topN: 8 },
      layout: { x: 0, y: 6, w: 12, h: 6 },
    },
    {
      type: "list",
      slice: {
        measures: ["asking_rent_psf", "vacancy_rate_pct"],
        dimension: "submarket",
        topN: 6,
      },
      layout: { x: 0, y: 12, w: 12, h: 5 },
    },
    {
      type: "sources",
      slice: { measures: ["asking_rent_psf"] },
      layout: { x: 0, y: 17, w: 12, h: 2 },
    },
  ],
};
