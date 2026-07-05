// lib/deliverable/band-guard.ts
//
// Sourced movement-band guard for deliverable numbers. Baseline = the previous
// deliverable's printed value (operator decree 2026-07-05). Bands are sourced
// (spec docs/superpowers/specs/2026-07-05-sourced-band-number-guard-design.md §4):
// Census construction ± CI for counts, Zillow YoY for slow prices, absolute
// point-delta for bounded ratios/scores. Pure — no I/O, no model.

import type { SnapshotItem } from "./templates";

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
  structural: { monthlyBand: 0.5, kind: "pct", confirmMultiple: 2.5 }, // annual cadence — a >1.25% monthly move confirms (ACS updates yearly; tolerate rounding)
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

export type BandStatus = "ok" | "confirm_outlier" | "uncheckable";

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** Parse a display value to a magnitude. Understands $, commas, %, and a K/M/B
 *  suffix so "$1.2M" vs "$485K" compare correctly. Returns null when there is no
 *  parseable number (an em-dash, "n/a", empty). */
export function parseMagnitude(value: string): number | null {
  const raw = String(value).trim().toLowerCase();
  const m = raw.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const suffix = raw.slice(raw.indexOf(m[0]) + m[0].length).trimStart()[0];
  return suffix && SUFFIX[suffix] ? n * SUFFIX[suffix] : n;
}

/** Decide whether `nowValue` moved implausibly from `priorValue` for its family,
 *  scaling the normal band to the number of days between the two sends. Pure. */
export function checkBand(args: {
  nowValue: string;
  priorValue: string;
  family: MetricFamily;
  gapDays: number;
}): { status: BandStatus; movePct: number | null; allowed: number } {
  const band = FAMILY_BANDS[args.family] ?? FAMILY_BANDS.unknown;
  const now = parseMagnitude(args.nowValue);
  const prior = parseMagnitude(args.priorValue);
  // Scale the monthly band to the actual gap (min 1 day so a same-day rebuild
  // doesn't divide the band to zero and false-flag everything).
  const scale = Math.max(1, args.gapDays) / 30;
  const allowed = band.monthlyBand * scale * band.confirmMultiple;
  if (now === null || prior === null || prior === 0) {
    return { status: "uncheckable", movePct: null, allowed };
  }
  if (band.kind === "abs") {
    const moveAbs = Math.abs(now - prior);
    return { status: moveAbs > allowed ? "confirm_outlier" : "ok", movePct: null, allowed };
  }
  const movePct = Math.abs((now - prior) / prior) * 100;
  return { status: movePct > allowed ? "confirm_outlier" : "ok", movePct, allowed };
}

// ---------------------------------------------------------------------------
// Outlier detection across two deliverable snapshots + web-confirm note resolution
// ---------------------------------------------------------------------------

/** One metric that moved implausibly vs the previous deliverable's printed value. */
export interface Outlier {
  label: string;
  nowValue: string;
  priorValue: string;
  family: MetricFamily;
  movePct: number | null;
}

/** The subset of the data-readiness `VerificationResult` the note resolver needs.
 *  A grounded verify (real `source_urls`) is what lets an outlier ship clean or as
 *  a discrepancy; an ungrounded/omitted result is treated as "could not confirm". */
export interface WebConfirm {
  within_tolerance: boolean;
  value_used: string | null;
  source_urls: string[];
}

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

type MetricItem = Extract<SnapshotItem, { kind: "metric" }>;

/** Every `metric` in the new snapshot that label-matches a `metric` in the prior
 *  snapshot and moved beyond its sourced band. Pure — the caller decides what to
 *  do with each (web-confirm, then note). */
export function bandOutliers(
  nowItems: SnapshotItem[],
  priorItems: SnapshotItem[],
  gapDays: number,
): Outlier[] {
  const priorByLabel = new Map<string, MetricItem>();
  for (const it of priorItems) {
    if (it.kind === "metric") priorByLabel.set(normLabel(it.label), it);
  }
  const out: Outlier[] = [];
  for (const it of nowItems) {
    if (it.kind !== "metric") continue;
    const prior = priorByLabel.get(normLabel(it.label));
    if (!prior) continue;
    const family = classifyFamily(it.label);
    const verdict = checkBand({
      nowValue: it.value,
      priorValue: prior.value,
      family,
      gapDays,
    });
    if (verdict.status !== "confirm_outlier") continue;
    out.push({
      label: it.label,
      nowValue: it.value,
      priorValue: prior.value,
      family,
      movePct: verdict.movePct,
    });
  }
  return out;
}

/** Map an outlier + its web-confirm result to the note that should ride in the
 *  deliverable's `inference_notes`. Returns "" when the number should ship clean
 *  (a grounded source agreed the move is real). Every non-empty note carries a
 *  `falsifier:` clause and cites the CURRENT value (which anchors to a filed item),
 *  so it survives the deliverable note gate. Additive — the number always ships.
 *
 *  - grounded + within tolerance  → "" (real move, verified — no scary note)
 *  - grounded + out of tolerance  → discrepancy note (our value vs the source's)
 *  - no grounded confirm          → please-confirm note */
export function resolveOutlierNote(o: Outlier, web: WebConfirm | null): string {
  const grounded = web != null && web.source_urls.length > 0 && web.value_used != null;
  if (grounded && web!.within_tolerance) return "";
  if (grounded && !web!.within_tolerance) {
    const src = web!.source_urls[0];
    return (
      `${o.label} reads ${o.nowValue} in this update, versus ${o.priorValue} in the last one — ` +
      `a named source (${src}) shows ${web!.value_used} for this period. Please confirm ${o.nowValue} before this sends. ` +
      `falsifier: this holds if a named source shows ${o.nowValue} for this period.`
    );
  }
  return (
    `${o.label} reads ${o.nowValue} in this update, versus ${o.priorValue} in the last one — ` +
    `a larger shift than this figure usually makes over this period, and we could not confirm it against a live source. ` +
    `We can make mistakes; please confirm ${o.nowValue} before this sends. ` +
    `falsifier: this holds if a named source shows ${o.nowValue} for this period.`
  );
}
