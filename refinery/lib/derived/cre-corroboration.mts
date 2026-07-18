/**
 * CRE corroboration engine — deterministic (code, never an LLM). For each
 * canonical_submarket × sector × quarter × metric cell, collect every firm's value
 * (keyed on `source_firm`) and assign a confidence tier under Standard tolerance.
 *
 * Sectors NEVER blend — sector is part of the cell key. NNN rent and full-service
 * rent are separate metrics, so they are never compared against each other.
 */
import type { CreFigureRow } from "./cre-figures.mts";

export interface ConfidenceRow {
  canonical_submarket: string;
  sector: string;
  quarter: string;
  metric: string;
  tier: "corroborated" | "flagged" | "single_source";
  reported_value: number;
  units: string;
  contributing_firms: string[];
  spread: number | null;
  reported_firm: string;
  /** True if any contributing value was fanned from a composite firm submarket. A flagged
   *  cell with this set may be a geography-grain mismatch, not a genuine firm disagreement. */
  has_fanned_contributor: boolean;
}

/** Standard tolerance (operator-approved 07/17). One config object, tunable without
 *  touching engine logic. abs = absolute (percentage points); rel = relative fraction. */
export const TOLERANCE: Record<string, { kind: "abs" | "rel"; limit: number }> = {
  vacancy_rate: { kind: "abs", limit: 2.0 },
  asking_rent_nnn: { kind: "rel", limit: 0.15 },
  asking_rent_full_service: { kind: "rel", limit: 0.15 },
  absorption_sqft: { kind: "rel", limit: 0.25 },
  cap_rate: { kind: "rel", limit: 0.15 },
  sale_price_psf: { kind: "rel", limit: 0.15 },
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Within tolerance? Compares the max−min spread against the metric's limit. */
function agrees(metric: string, values: number[]): { ok: boolean; spread: number } {
  const spread = Math.max(...values) - Math.min(...values);
  const t = TOLERANCE[metric] ?? { kind: "rel", limit: 0.15 };
  if (t.kind === "abs") return { ok: spread <= t.limit, spread };
  const denom = Math.abs(median(values)) || 1;
  return { ok: spread / denom <= t.limit, spread };
}

export function corroborate(rows: CreFigureRow[]): ConfidenceRow[] {
  const cells = new Map<string, CreFigureRow[]>();
  for (const r of rows) {
    const key = `${r.canonical_submarket}|${r.sector}|${r.quarter}|${r.metric}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(r);
    else cells.set(key, [r]);
  }
  const out: ConfidenceRow[] = [];
  for (const group of cells.values()) {
    // One value per FIRM (a firm reporting twice is not corroboration). Sort firms by
    // name for deterministic output regardless of input row order.
    const byFirm = new Map<string, CreFigureRow>();
    for (const r of group) byFirm.set(r.source_firm, r);
    const firms = [...byFirm.values()].sort((a, b) => a.source_firm.localeCompare(b.source_firm));
    const first = firms[0];
    const common = {
      canonical_submarket: first.canonical_submarket,
      sector: first.sector,
      quarter: first.quarter,
      metric: first.metric,
      units: first.units,
      contributing_firms: firms.map((f) => f.source_firm),
      has_fanned_contributor: firms.some((f) => f.fanned),
    };
    if (firms.length === 1) {
      out.push({
        ...common,
        tier: "single_source",
        reported_value: first.value,
        spread: null,
        reported_firm: first.source_firm,
      });
      continue;
    }
    const values = firms.map((f) => f.value);
    const { ok, spread } = agrees(first.metric, values);
    // Reported firm = a verified firm if any (all rows in a cell share the same quarter,
    // so "most-recent" doesn't discriminate here), else the first firm alphabetically.
    const reported = firms.find((f) => f.source_verified) ?? firms[0];
    const roundedSpread = Math.round(spread * 100) / 100;
    if (ok) {
      // Round the DERIVED median to 2dp (kills float noise, e.g. 3.0999…→3.1). Raw firm
      // values (single_source / flagged) pass through unrounded to stay source-faithful.
      const reportedValue = Math.round(median(values) * 100) / 100;
      out.push({
        ...common,
        tier: "corroborated",
        reported_value: reportedValue,
        spread: roundedSpread,
        reported_firm: reported.source_firm,
      });
    } else {
      out.push({
        ...common,
        tier: "flagged",
        reported_value: reported.value,
        spread: roundedSpread,
        reported_firm: reported.source_firm,
      });
    }
  }
  return out;
}
