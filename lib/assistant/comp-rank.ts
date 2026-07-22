// lib/assistant/comp-rank.ts
//
// THE COMP DISTANCE FUNCTION — pure, deterministic, source-agnostic.
// Spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md
//
// Replaces `nearby.slice(0, 6)` in compsForAddress, which was the entire prior
// selection logic — "comparable" meant the vendor listed it and it wasn't bare land.
//
// This is NOT machine learning. Nothing is trained, there are no labels and no model.
// "KNN" names the SHAPE (scale the features, filter to a band, order by weighted
// distance); the implementation is a better ORDER BY whose every output is explainable.
//
// Built to Fannie Mae Selling Guide B4-1.3-08 (06/04/2025), fetched live 07/22/2026:
// minimum three closed comps; same market area preferred, and going outside it requires
// commentary; never mix vacant-land sales into a home comp set.
//
// PHASE 1 = the vendor feed, which carries NO property type, NO lat/lon and NO year
// built (field audit in the spec). So class match, straight-line miles and age are
// PHASE 2, when parcel fields exist. Phase 1 must never print a distance or a
// direction — we do not hold the coordinates, and stating one would be invented.

/** The home being compared against. */
export interface CompSubject {
  sqft: number;
  beds: number | null;
  baths: number | null;
  zip: string | null;
}

/** A candidate comp, in the shape both feeds can produce. */
export interface CompCandidate {
  addressLine: string;
  city: string;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  /** ISO date of the sale behind `price`. No date => cannot satisfy the window. */
  priceDate: string | null;
}

export interface RankedComp extends CompCandidate {
  /** The reader-facing reason this is comparable — real facts only, never a score. */
  why: string;
}

export interface RankConfig {
  /** Fannie B4-1.3-08 reports a minimum of three closed comps. */
  minComps?: number;
  maxComps?: number;
  /** OPERATOR DECREE 07/22/2026: six months. Stricter than Fannie's twelve. */
  windowMonths?: number;
  /** Size band, tiers 1-2. OURS, not a cited standard — Fannie publishes no percentage. */
  bandPct?: number;
  /** Size band at the widest tier only. */
  tier3BandPct?: number;
}

export interface RankResult {
  comps: RankedComp[];
  /** True only when we met Fannie's three-comp minimum. */
  standardMet: boolean;
  /** Which tier produced the set: 1 same-ZIP, 2 any-ZIP, 3 widened band. */
  tier: 1 | 2 | 3;
  /** Commentary — required by Fannie when the search leaves the market area, and
   *  required by us whenever the standard was not met. Null when tier 1 and met. */
  note: string | null;
}

const DEFAULTS = {
  minComps: 3,
  maxComps: 6,
  windowMonths: 6,
  bandPct: 0.25,
  tier3BandPct: 0.35,
} as const;

// ── Weights ───────────────────────────────────────────────────────────────────
// Hand-chosen constants, NOT fitted — there are no labels, and inventing fitted
// weights is the seller-stress mistake this platform is already undoing. They live
// here, named, so tuning is one edit in one place.
//
// SQFT dominates deliberately (it is the strongest value signal) but is measured on
// |ln(ratio)| so it CANNOT drown the others the way a raw difference would: a 28 sq ft
// gap scores 0.014, while a 3-bedroom mismatch scores 1.5. That asymmetry is failure
// mode F1, and it is what the scaling exists to prevent.
const W_SQFT = 3.0;
const W_BEDS = 0.5;
const W_BATHS = 0.3;
const W_ZIP = 0.4;
const W_RECENCY = 0.2;

/** ISO -> MM/DD/YYYY (rule 2: never the raw token). Null-safe. */
function mdY(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** A comp must be a HOME with a size and a dated sale to be rankable at all. */
function isRankable(c: CompCandidate): boolean {
  return c.beds != null && c.sqft != null && c.sqft > 0 && c.priceDate != null;
}

function withinWindow(c: CompCandidate, cutoff: Date): boolean {
  if (!c.priceDate) return false;
  const t = Date.parse(c.priceDate);
  return Number.isFinite(t) && t >= cutoff.getTime();
}

function withinBand(c: CompCandidate, subjectSqft: number, pct: number): boolean {
  if (c.sqft == null) return false;
  return c.sqft >= subjectSqft * (1 - pct) && c.sqft <= subjectSqft * (1 + pct);
}

/** The distance. Every term is scaled before it is weighted (failure mode F1). */
function score(subject: CompSubject, c: CompCandidate, now: Date, windowMonths: number): number {
  let s = 0;

  // Log-ratio so half-size and double-size are penalized symmetrically.
  if (c.sqft != null && c.sqft > 0) s += W_SQFT * Math.abs(Math.log(c.sqft / subject.sqft));

  if (subject.beds != null && c.beds != null) s += W_BEDS * Math.abs(c.beds - subject.beds);
  if (subject.baths != null && c.baths != null) s += W_BATHS * Math.abs(c.baths - subject.baths);

  // Phase 1's ONLY geographic signal — the vendor feed has no coordinates.
  if (subject.zip && c.zip && subject.zip !== c.zip) s += W_ZIP;

  // Fresher sale scores better, normalized across the window so it can never
  // outweigh a genuine size or shape mismatch.
  if (c.priceDate) {
    const ageDays = (now.getTime() - Date.parse(c.priceDate)) / 86_400_000;
    const windowDays = windowMonths * 30.44;
    if (Number.isFinite(ageDays) && windowDays > 0) {
      s += W_RECENCY * Math.min(Math.max(ageDays / windowDays, 0), 1);
    }
  }

  return s;
}

/** The reader-facing why. Real facts only — the raw score is NEVER displayed, and
 *  Phase 1 never prints miles or a direction (we hold no coordinates). */
function whyLine(subject: CompSubject, c: CompCandidate): string {
  const parts: string[] = [];

  if (c.sqft != null) {
    parts.push(
      `${c.sqft.toLocaleString("en-US")} sq ft vs your ${subject.sqft.toLocaleString("en-US")}`,
    );
  }

  const shape = [
    c.beds != null ? `${c.beds} bed` : "",
    c.baths != null ? `${c.baths} bath` : "",
  ].filter(Boolean);
  if (shape.length) parts.push(shape.join(" / "));

  if (subject.zip && c.zip) parts.push(c.zip === subject.zip ? "same ZIP" : `ZIP ${c.zip}`);

  const sold = mdY(c.priceDate);
  if (sold) parts.push(`sold ${sold}`);

  return parts.join(" · ");
}

/**
 * Select and order comps for a subject home.
 *
 * The recency window is HARD at every tier — escalation widens GEOGRAPHY and the SIZE
 * BAND, never time, so an operator decree cannot silently drift back to Fannie's twelve
 * months in a thin market (failure mode F2).
 *
 * Returns fewer than `minComps` rather than padding, and says so (failure mode F3).
 */
export function rankComps(
  subject: CompSubject,
  candidates: CompCandidate[],
  now: Date,
  config: RankConfig = {},
): RankResult {
  const cfg = { ...DEFAULTS, ...config };
  const cutoff = monthsBefore(now, cfg.windowMonths);

  // The window and the home-ness test apply identically at every tier.
  const eligible = candidates.filter((c) => isRankable(c) && withinWindow(c, cutoff));

  const tiers: { tier: 1 | 2 | 3; pick: (c: CompCandidate) => boolean }[] = [
    {
      tier: 1,
      pick: (c) =>
        withinBand(c, subject.sqft, cfg.bandPct) &&
        !!subject.zip &&
        !!c.zip &&
        c.zip === subject.zip,
    },
    { tier: 2, pick: (c) => withinBand(c, subject.sqft, cfg.bandPct) },
    { tier: 3, pick: (c) => withinBand(c, subject.sqft, cfg.tier3BandPct) },
  ];

  let chosen: CompCandidate[] = [];
  let usedTier: 1 | 2 | 3 = 1;

  for (const { tier, pick } of tiers) {
    const hit = eligible.filter(pick);
    usedTier = tier;
    chosen = hit;
    if (hit.length >= cfg.minComps) break;
  }

  const ranked = [...chosen]
    .sort((a, b) => {
      const d = score(subject, a, now, cfg.windowMonths) - score(subject, b, now, cfg.windowMonths);
      if (d !== 0) return d;
      return a.addressLine < b.addressLine ? -1 : a.addressLine > b.addressLine ? 1 : 0;
    })
    .slice(0, cfg.maxComps)
    .map((c) => ({ ...c, why: whyLine(subject, c) }));

  const standardMet = ranked.length >= cfg.minComps;

  let note: string | null = null;
  if (!standardMet) {
    note =
      ranked.length === 0
        ? `No sales in the last ${cfg.windowMonths} months matched this home closely enough to compare.`
        : `Only ${ranked.length} comparable ${ranked.length === 1 ? "sale" : "sales"} in the last ${cfg.windowMonths} months met the standard — fewer than the three a lender expects.`;
  } else if (usedTier > 1) {
    note =
      usedTier === 2
        ? "Widened beyond this ZIP code to find enough comparable sales."
        : "Widened the search area and the size range to find enough comparable sales.";
  }

  return { comps: ranked, standardMet, tier: usedTier, note };
}
