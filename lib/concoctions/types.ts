// lib/concoctions/types.ts
//
// The concoction contract: a curated, parameterized bundle of data that goes
// together, declared as columns (measures/dimensions) with DISTRIBUTION GUARDS.
// Spec: docs/superpowers/specs/2026-07-12-concoctions-design.md.
// Binding types live in the pure doc contract (lib/email/doc/types.ts imports
// from no one) — re-exported here for concoction-side consumers.

import type { z } from "zod";
import type { BlockType, BindingSlice } from "@/lib/email/doc/types";

export type { BlockBinding, BindingSlice, BindingLane } from "@/lib/email/doc/types";
export { BINDING_VERSION } from "@/lib/email/doc/types";

export type ColumnKind = "measure" | "dimension";
export type ColumnFormat = "usd" | "percent" | "number" | "text" | "date";

/** Distribution guards — a shape may only use a measure whose guards pass on the
 *  LIVE rows. This is where 07/12/2026's traps became law instead of tribal
 *  memory (near-constant cap rate, near-zero ZIP sales, all-NULL metric). */
export interface ColumnGuards {
  minDistinct?: number;
  /** 0–1 ceiling on null share. */
  maxNullShare?: number;
  /** (max−min)/max(|max|,|min|) floor over non-null numeric values. */
  minSpreadRatio?: number;
}

export interface ColumnSpec {
  key: string;
  label: string;
  kind: ColumnKind;
  format: ColumnFormat;
  guards?: ColumnGuards;
  /** Probe-facts worth keeping next to the column (e.g. why a guard exists). */
  note?: string;
  /**
   * GRAIN — the dimension this measure is actually HELD at, when that is coarser
   * than one row. Names another column's key (e.g. "submarket").
   *
   * Omitted = the measure is measured per row, and may be ranked/crowned/charted
   * row-by-row. Set = the value is SHARED by every row in the group, so ranking
   * rows on it is a lie: it invents an order that the source never asserted.
   *
   * 07/13/2026, the incident that made this law: corridor asking rent and vacancy
   * are Cushman & Wakefield SUBMARKET figures stamped onto each corridor inside
   * the submarket. Three Naples corridors all carry $60.84 / 1.8%. The lab crowned
   * "Waterside Shops — $60.84" as the top corridor and charted three identical
   * bars. Distribution guards could not catch it: spread, distinctness and null
   * share ALL passed. Spread is not grain.
   *
   * The materializer honors this by COLLAPSING rows to the grain before any shape
   * that ranks or crowns — which is also the better chart (15 real submarkets,
   * genuinely different rents) rather than a padded list of duplicates.
   */
  grain?: string;
}

export type ConcoctionRow = Record<string, string | number | null>;

export interface DefaultBlockSpec {
  type: BlockType;
  slice: BindingSlice;
  layout: { x: number; y: number; w: number; h: number };
}

export interface ConcoctionDef<P = Record<string, string | number>> {
  id: string;
  /** Product copy — the picker + AI read these verbatim. No system nouns. */
  label: string;
  description: string;
  category: string;
  tags: string[];
  params: z.ZodType<P>;
  /** Server-only. `sb` is the caller-supplied Supabase client (typed or untyped
   *  per the def's tables) — defs never construct clients, so tests stub them. */
  load(sb: unknown, params: P): Promise<ConcoctionRow[]>;
  columns: ColumnSpec[];
  /** MM/DD/YYYY derived from rows — never a stamped constant. */
  asOf(rows: ConcoctionRow[]): string;
  /** Cheap staleness probe (metadata-scale query) — MM/DD/YYYY. */
  probeAsOf(sb: unknown, params: P): Promise<string>;
  sourceLine: string;
  /** Presentation label for the asOf date (default "As of"). Set when asOf is
   *  OUR verification date rather than the source's data period — the period
   *  belongs in sourceLine, and "As of" on a verify date reads as data
   *  currency (check corridor_asof_vs_report_period). */
  asOfLabel?: string;
  defaultLayout: DefaultBlockSpec[];
}
