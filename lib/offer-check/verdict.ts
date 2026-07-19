// lib/offer-check/verdict.ts
//
// Pure position math for the Offer Check: where a seller's in-hand offer lands
// against the comp set. Every relation is computed HERE, in code — the page
// renders these numbers verbatim and no model ever sees the raw comp array
// (the same discipline as buildPriceCase in recipes/market-comps).
//
// Honesty rules carried from the comp lane:
//   • Recorded sales and AVM estimates are NEVER blended into one band — a
//     sold price is a fact, an estimate is a model's opinion; each gets its
//     own group and label.
//   • $/sqft appears only where sqft is actually known: comps need their own
//     sqft; the subject's sqft is the OWNER'S figure (lane 4), never a guess.
//   • An empty group renders as absent, never as zero.
import type { RenderComp } from "@/lib/assistant/comp-helper";

export interface PriceBand {
  min: number;
  median: number;
  max: number;
  count: number;
}

export interface OfferPosition {
  /** The offer amount the owner typed (lane-4 user figure). */
  offer: number;
  /** Recorded sales with a price, sorted ascending by price. */
  sold: RenderComp[];
  /** AVM estimates with a price, sorted ascending by price. */
  estimates: RenderComp[];
  /** How many recorded sale prices sit strictly below / above the offer. */
  belowSold: number;
  aboveSold: number;
  /** Absolute price band over recorded sales (null when none). */
  soldBand: PriceBand | null;
  /** Same bands for the estimate group (kept separate, never blended). */
  estimateBand: PriceBand | null;
  /** $/sqft band over recorded sales that carry sqft (null when none). */
  soldPsf: PriceBand | null;
  /** The offer as $/sqft of the OWNER-SUPPLIED sqft (null when not given). */
  offerPsf: number | null;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function band(values: number[]): PriceBand | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: median(sorted),
    max: sorted[sorted.length - 1],
    count: sorted.length,
  };
}

function priced(comps: RenderComp[]): (RenderComp & { price: number })[] {
  return comps.filter((c): c is RenderComp & { price: number } => c.price != null && c.price > 0);
}

/**
 * Compute the offer's position against the comp set. `subjectSqft` is the
 * owner's own figure (or null) — it only ever affects `offerPsf`.
 */
export function buildOfferPosition(
  comps: RenderComp[],
  offer: number,
  subjectSqft: number | null,
): OfferPosition {
  const sold = priced(comps.filter((c) => c.priceKind === "sold")).sort(
    (a, b) => a.price - b.price,
  );
  const estimates = priced(comps.filter((c) => c.priceKind === "estimate")).sort(
    (a, b) => a.price - b.price,
  );

  const soldPrices = sold.map((c) => c.price);
  const psfValues = sold
    .filter((c) => c.sqft != null && c.sqft > 0)
    .map((c) => c.price / (c.sqft as number));

  return {
    offer,
    sold,
    estimates,
    belowSold: soldPrices.filter((p) => p < offer).length,
    aboveSold: soldPrices.filter((p) => p > offer).length,
    soldBand: band(soldPrices),
    estimateBand: band(estimates.map((c) => c.price)),
    soldPsf: band(psfValues),
    offerPsf: subjectSqft != null && subjectSqft > 0 ? offer / subjectSqft : null,
  };
}

/** "$412,000" — the one money formatter this surface uses. */
export function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Parse the owner's typed offer ("$385,000", "385000", "385,000") → number or null. */
export function parseOffer(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 10_000 && n <= 100_000_000 ? Math.round(n) : null;
}

/** Parse the owner's typed sqft → integer or null (sanity band 200–20,000). */
export function parseSqft(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n >= 200 && n <= 20_000 ? Math.round(n) : null;
}
