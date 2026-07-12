// lib/concoctions/defs/corridor-profiles.ts
//
// SWFL CRE corridors — same read as refinery/sources/cre-source.mts + the embed
// asking-rent card: verified, non-deleted, live public.corridor_profiles.
// NO county param: probed 07/12/2026 — the table has `city`, not `county`;
// deriving county from city would be invention (plan Task 3 NOTE).
import { z } from "zod";
import { formatValue } from "../format";
import type { ConcoctionDef, ConcoctionRow } from "../types";

const COLS =
  "corridor_name, city, corridor_type, evolution_direction, seasonal_index, cap_rate_pct, vacancy_rate_pct, absorption_sqft, asking_rent_psf, character, metrics_verified_date";

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
  label: "Commercial corridors",
  description:
    "Every verified commercial corridor in Lee and Collier — asking rent, vacancy, seasonality, absorption, and the corridor's character read. Position corridors against each other or profile one.",
  category: "Commercial",
  tags: ["corridors", "rent", "vacancy", "CRE", "retail", "industrial"],
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
    { key: "corridor_name", label: "Corridor", kind: "dimension", format: "text" },
    { key: "city", label: "City", kind: "dimension", format: "text" },
    { key: "corridor_type", label: "Type", kind: "dimension", format: "text" },
    { key: "evolution_direction", label: "Direction", kind: "dimension", format: "text" },
    {
      key: "asking_rent_psf",
      label: "Asking rent (per sqft)",
      kind: "measure",
      format: "usd",
      guards: { minDistinct: 5, minSpreadRatio: 0.2, maxNullShare: 0.3 },
      note: "Probed 07/12/2026: $16.04–$60.84 across 27 verified — real spread.",
    },
    {
      key: "vacancy_rate_pct",
      label: "Vacancy",
      kind: "measure",
      format: "percent",
      guards: { minDistinct: 5, minSpreadRatio: 0.2, maxNullShare: 0.3 },
      note: "Probed 07/12/2026: 0.2–7.7% — real spread.",
    },
    {
      key: "seasonal_index",
      label: "Seasonality",
      kind: "measure",
      format: "number",
      guards: { minDistinct: 4, maxNullShare: 0.5 },
    },
    {
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
      guards: { minDistinct: 5 },
      note: "FENCED — probed 07/12/2026: 6.7 ×22 / 8.3 ×3 / null ×2. Near-constant; may render as a single stated figure, never an axis. The guard enforces it.",
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
  sourceLine: "SWFL Data Gulf verified corridor metrics",
  defaultLayout: [
    {
      type: "hero",
      slice: { measures: ["asking_rent_psf"], dimension: "corridor_name" },
      layout: { x: 0, y: 0, w: 12, h: 3 },
    },
    {
      type: "stats",
      slice: { measures: ["asking_rent_psf", "vacancy_rate_pct", "seasonal_index"] },
      layout: { x: 0, y: 3, w: 12, h: 3 },
    },
    {
      type: "image",
      slice: { measures: ["asking_rent_psf"], dimension: "corridor_name", topN: 8 },
      layout: { x: 0, y: 6, w: 12, h: 6 },
    },
    {
      type: "list",
      slice: {
        measures: ["asking_rent_psf", "vacancy_rate_pct"],
        dimension: "corridor_name",
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
