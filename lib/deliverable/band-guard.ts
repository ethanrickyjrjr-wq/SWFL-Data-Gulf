// lib/deliverable/band-guard.ts
//
// Sourced movement-band guard for deliverable numbers. Baseline = the previous
// deliverable's printed value (operator decree 2026-07-05). Bands are sourced
// (spec docs/superpowers/specs/2026-07-05-sourced-band-number-guard-design.md §4):
// Census construction ± CI for counts, Zillow YoY for slow prices, absolute
// point-delta for bounded ratios/scores. Pure — no I/O, no model.

export type MetricFamily =
  "slow_price" | "volatile_count" | "duration" | "bounded_ratio" | "structural" | "unknown";

export interface FamilyBand {
  /** Normal move over ~30 days. `pct` families: percent; `abs` families: points. */
  monthlyBand: number;
  kind: "pct" | "abs";
  /** A move beyond monthlyBand × confirmMultiple (cadence-scaled) is implausible. */
  confirmMultiple: number;
}

// Grounded in the crawl4ai research pass (spec §4). `unknown` gets a wide band so
// an unclassified metric is never falsely flagged.
export const FAMILY_BANDS: Record<MetricFamily, FamilyBand> = {
  slow_price: { monthlyBand: 3, kind: "pct", confirmMultiple: 2.5 }, // Zillow ~0.8–2% YoY
  volatile_count: { monthlyBand: 12, kind: "pct", confirmMultiple: 2.5 }, // Census ±9.8–12.3% MoM
  duration: { monthlyBand: 15, kind: "pct", confirmMultiple: 2.5 },
  bounded_ratio: { monthlyBand: 8, kind: "abs", confirmMultiple: 2.5 }, // ±8 points
  structural: { monthlyBand: 1, kind: "pct", confirmMultiple: 2.5 }, // annual cadence — any real move confirms
  unknown: { monthlyBand: 100, kind: "pct", confirmMultiple: 2.5 }, // never false-flag
};

// Ordered keyword → family. First match wins; keep the specific words above the
// generic ones (e.g. "rent" before a bare "value").
const FAMILY_KEYWORDS: [RegExp, MetricFamily][] = [
  [
    /\b(home value|asking rent|rent|price per square foot|price\/sqft|median (listing|sold|sale) price|list-side asking|median listing price|median sold price)\b/i,
    "slow_price",
  ],
  [
    /\b(inventory|homes sold|permits?|new[- ]listing count|active (rental )?listings?|listing count|new listings?)\b/i,
    "volatile_count",
  ],
  [/\b(days on market|dom)\b/i, "duration"],
  [
    /\b(ratio|share|score|months of supply|pending|sale-to-list|price-cut|heat|hotness|spread|sold-to-rent|list-to-sold)\b/i,
    "bounded_ratio",
  ],
  [
    /\b(household income|median age|population|poverty|owner[- ]occupied|household size)\b/i,
    "structural",
  ],
];

// A couple of labels match two buckets ("Save-Our-Homes Gap" hits ratio + structural);
// structural cadence dominates, so re-pin those explicitly ahead of the generic scan.
const STRUCTURAL_OVERRIDE = /\b(save-our-homes gap|median household income|annual flood loss)\b/i;

export function classifyFamily(label: string): MetricFamily {
  if (STRUCTURAL_OVERRIDE.test(label)) return "structural";
  for (const [re, fam] of FAMILY_KEYWORDS) if (re.test(label)) return fam;
  return "unknown";
}
