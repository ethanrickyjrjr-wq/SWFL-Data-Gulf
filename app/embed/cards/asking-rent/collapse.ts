// Submarket-grain collapse for the asking-rent embed card.
//
// corridor_profiles rent/vacancy figures are Cushman & Wakefield MarketBeat
// SUBMARKET figures stamped onto every corridor inside the submarket (07/13
// finding, check corridor_grain_bug_is_live_on_embed_and_brain) — ranking raw
// corridor rows crowns whichever corridor happens to sort first among identical
// stamped values and weights the median by corridor count. The honest grain is
// the submarket: one entry per named submarket, rows with no submarket (figures
// with no named source) drop out of every rendered figure.
import { medianOf } from "@/lib/stats";

export interface SubmarketRent {
  /** C&W MarketBeat submarket name (the DB `submarket` column). */
  submarket: string;
  /** Asking rent $/sqft NNN — identical across a submarket's corridors by
   *  construction; median-within-group guards degraded (fixture) inputs. */
  value: number;
  /** How many corridor rows mapped into this submarket. */
  corridors: number;
}

export function collapseToSubmarkets(
  rows: { submarket: string | null; value: number | null }[],
): SubmarketRent[] {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.submarket || typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
    const list = groups.get(r.submarket) ?? [];
    list.push(r.value);
    groups.set(r.submarket, list);
  }
  const out: SubmarketRent[] = [];
  for (const [submarket, values] of groups) {
    const value = medianOf(values);
    if (value == null) continue;
    out.push({ submarket, value, corridors: values.length });
  }
  return out.sort((a, b) => b.value - a.value);
}
