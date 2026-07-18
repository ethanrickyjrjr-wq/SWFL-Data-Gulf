/**
 * CRE figures normalizer — `data_lake.marketbeat_swfl` rows → `CreFigureRow[]`,
 * one row per (canonical_submarket × sector × quarter × metric × source_firm).
 *
 * Provenance (operator decision 07/18): every real professional-firm figure enters.
 * Lee & MHS carry their own report URLs and keep them; Cushman & Colliers have no
 * firm URL captured in the raw table, so they fall back to the SWFL Data Gulf citation
 * (`fallbackCitationUrl`, built once by the caller via `buildSourceCitationUrl`). The
 * no-invention rule is satisfied — the numbers are real and every row names a source.
 * The only rows dropped are out-of-core places (crosswalk → []) and null metric values.
 *
 * Fan-out: a firm's broad submarket (Colliers "Bonita/Estero") maps to MULTIPLE canonical
 * submarkets; the row's value lands on each so a broad figure can corroborate against the
 * fine-grained firms. `source_firm` = `source_name`, NEVER `_source_model`.
 */
import { canonicalSubmarkets } from "../cre-submarket-crosswalk.mts";

export interface CreFigureRow {
  canonical_submarket: string;
  sector: string;
  quarter: string;
  metric: string;
  value: number;
  units: string;
  source_firm: string;
  source_url: string;
  source_verified: boolean;
  as_of: string | null;
  /** True when this row's firm submarket fanned onto MORE THAN ONE canonical (a grain
   *  inference — e.g. Colliers "Bonita/Estero" split onto Bonita Springs + Estero).
   *  Downstream corroboration flags cells with a fanned contributor so a grain mismatch
   *  is not misread as a firm disagreement. */
  fanned: boolean;
}

export interface MarketbeatRow {
  source_name: string;
  sector: string;
  submarket: string;
  quarter: string;
  vacancy_rate: number | null;
  asking_rent_nnn: number | null;
  asking_rent_full_service: number | null;
  absorption_sqft: number | null;
  cap_rate: number | null;
  sale_price_psf: number | null;
  source_url: string | null;
  verified: boolean;
}

/** Metric → display units. asking_rent_full_service is a gross/full-service basis and
 *  must never be corroborated against asking_rent_nnn (different basis) — the metric key
 *  keeps them apart, and medical_office is the only full-service sector. */
const METRIC_UNITS: Record<string, string> = {
  vacancy_rate: "percent",
  asking_rent_nnn: "USD/sqft NNN",
  asking_rent_full_service: "USD/sqft gross",
  absorption_sqft: "sqft",
  cap_rate: "percent",
  sale_price_psf: "USD/sqft",
};

/** quarter 'YYYY-Qn' → the quarter-end ISO date (as_of). */
function quarterEnd(q: string): string | null {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  const ends = { "1": "03-31", "2": "06-30", "3": "09-30", "4": "12-31" } as const;
  return `${m[1]}-${ends[m[2] as "1" | "2" | "3" | "4"]}`;
}

/**
 * Normalize marketbeat rows into figure rows.
 * @param rows raw marketbeat rows (all firms — no `verified` filter).
 * @param fallbackCitationUrl the SWFL Data Gulf citation used when a row has no firm URL.
 */
export function normalizeMarketbeat(
  rows: MarketbeatRow[],
  fallbackCitationUrl: string,
): CreFigureRow[] {
  const out: CreFigureRow[] = [];
  for (const r of rows) {
    const source_url = r.source_url ?? fallbackCitationUrl;
    if (!source_url) continue; // no-invention guard (belt-and-braces; caller always supplies a citation)
    const canons = canonicalSubmarkets(r.source_name, r.submarket);
    if (canons.length === 0) continue; // out-of-core / non-SWFL — never force-fit
    const fanned = canons.length > 1; // one firm submarket split onto multiple canonicals
    const metrics: [string, number | null][] = [
      ["vacancy_rate", r.vacancy_rate],
      ["asking_rent_nnn", r.asking_rent_nnn],
      ["asking_rent_full_service", r.asking_rent_full_service],
      ["absorption_sqft", r.absorption_sqft],
      ["cap_rate", r.cap_rate],
      ["sale_price_psf", r.sale_price_psf],
    ];
    const as_of = quarterEnd(r.quarter);
    for (const canon of canons) {
      for (const [metric, value] of metrics) {
        if (value == null) continue;
        out.push({
          canonical_submarket: canon,
          sector: r.sector,
          quarter: r.quarter,
          metric,
          value,
          units: METRIC_UNITS[metric],
          source_firm: r.source_name,
          source_url,
          source_verified: r.verified,
          as_of,
          fanned,
        });
      }
    }
  }
  return out;
}
