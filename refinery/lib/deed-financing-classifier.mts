// refinery/lib/deed-financing-classifier.mts
//
// Cash-vs-financed classifier for Lee County recorded deeds
// (docs/superpowers/specs/2026-08-12-deed-cash-financed-split-design.md).
//
// Pure logic mirroring the pairing/dedupe/suppression rules that
// data_lake.lee_deed_purchase_financing_v must reproduce in SQL -- this module is
// the TDD-gated source of truth for the three deterministic failure modes named
// in the spec (FM-1 pairing window, FM-2 unclassifiable suppression, FM-3
// multi-parcel/multi-doc double-count). The view is the shipped implementation;
// this function is what its tests are measured against.
//
// windowDays is a same-day-by-default parameter kept ONLY so FM-1's guard test
// can prove the classifier never gets WORSE (a wider window can only reclassify
// no_recorded_financing -> financed, never the reverse) -- the shipped view
// hardcodes windowDays=0 per the 08/12/2026 measurement (the curve is flat).

const NOMINAL_CONSIDERATION_CEIL = 100;
const UNCLASSIFIABLE_SUPPRESSION_FLOOR = 0.15;

export interface DeedRow {
  record_date: string; // YYYY-MM-DD
  parcel_strap: string | null;
  consideration_usd: number;
}

export interface MortgageRow {
  record_date: string; // YYYY-MM-DD
  parcel_strap: string | null;
}

export type FinancingClass = "financed" | "no_recorded_financing" | "unclassifiable";

export interface FinancingClassificationRow {
  record_date: string;
  parcel_strap: string | null;
  consideration_usd: number;
  financing_class: FinancingClass;
}

export interface ClassifyResult {
  rows: FinancingClassificationRow[];
  total_arms_length: number;
  financed: number;
  no_recorded_financing: number;
  unclassifiable: number;
  unclassifiable_share: number;
  suppressed: boolean;
  /** null when suppressed (FM-2) or when there are zero classifiable rows. */
  no_recorded_financing_share: number | null;
}

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Classify arm's-length (consideration > $100) Lee County deeds as financed /
 * no_recorded_financing / unclassifiable, pairing each deed to a same-strap
 * mortgage-family recording within `windowDays` of the deed's record_date (EXISTS
 * semantics -- never a join fan-out, FM-3). Strap-carrying deed rows are deduped
 * to one per (record_date, parcel_strap) before pairing (FM-3); a deed with no
 * parcel_strap is unclassifiable (FM-2) and is never deduped against other
 * no-strap deeds, since a null strap cannot identify a distinct property. If
 * unclassifiable rows exceed the 15% floor, the share is suppressed (null)
 * rather than published on a biased denominator.
 */
export function classifyPurchaseFinancing(
  deedRows: DeedRow[],
  mortgageRows: MortgageRow[],
  windowDays = 0,
): ClassifyResult {
  const armsLength = deedRows.filter((r) => r.consideration_usd > NOMINAL_CONSIDERATION_CEIL);

  const seen = new Set<string>();
  const deduped: DeedRow[] = [];
  for (const r of armsLength) {
    if (!r.parcel_strap) {
      deduped.push(r);
      continue;
    }
    const key = r.record_date + "::" + r.parcel_strap;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  const mortgageDatesByStrap = new Map<string, string[]>();
  for (const m of mortgageRows) {
    if (!m.parcel_strap) continue;
    const list = mortgageDatesByStrap.get(m.parcel_strap);
    if (list) list.push(m.record_date);
    else mortgageDatesByStrap.set(m.parcel_strap, [m.record_date]);
  }

  const rows: FinancingClassificationRow[] = deduped.map((d) => {
    if (!d.parcel_strap) {
      return {
        record_date: d.record_date,
        parcel_strap: null,
        consideration_usd: d.consideration_usd,
        financing_class: "unclassifiable",
      };
    }
    // FM-3: EXISTS, not a fan-out -- .some() short-circuits on the first match.
    const paired = (mortgageDatesByStrap.get(d.parcel_strap) ?? []).some(
      (md) => daysBetween(md, d.record_date) <= windowDays,
    );
    return {
      record_date: d.record_date,
      parcel_strap: d.parcel_strap,
      consideration_usd: d.consideration_usd,
      financing_class: paired ? "financed" : "no_recorded_financing",
    };
  });

  const financed = rows.filter((r) => r.financing_class === "financed").length;
  const no_recorded_financing = rows.filter(
    (r) => r.financing_class === "no_recorded_financing",
  ).length;
  const unclassifiable = rows.filter((r) => r.financing_class === "unclassifiable").length;
  const total = rows.length;
  const unclassifiable_share = total > 0 ? round4(unclassifiable / total) : 0;
  const suppressed = unclassifiable_share > UNCLASSIFIABLE_SUPPRESSION_FLOOR;
  const classifiable = financed + no_recorded_financing;

  return {
    rows,
    total_arms_length: total,
    financed,
    no_recorded_financing,
    unclassifiable,
    unclassifiable_share,
    suppressed,
    no_recorded_financing_share:
      suppressed || classifiable === 0 ? null : round4(no_recorded_financing / classifiable),
  };
}
