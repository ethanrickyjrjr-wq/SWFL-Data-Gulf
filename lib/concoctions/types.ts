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
  defaultLayout: DefaultBlockSpec[];
}
