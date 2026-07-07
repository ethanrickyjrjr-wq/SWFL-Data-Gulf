// lib/project/watch-delta.ts
//
// Pure comparative-delta core for Property Watch (spec 2026-07-07-property-watch-design.md).
// Mirrors lib/project/lifecycle-nudge.ts's discipline exactly: NO DB, NO disk, NO Date.now() —
// every input is injected. The adapter (scripts/project-feed/watch-scan.mts) supplies the real
// subject spec + comp values and does the write.
//
// GOVERNING CONSTRAINT (operator, verbatim): "we don't analyze it, we just send updates on
// movement." Every field here is either a raw held number or a DIRECT SUBTRACTION of two held
// numbers — never a modeled estimate, never inserted commentary. A missing input yields null
// (no invention), never a guessed value. RULED OUT for v1: any pool-premium / amenity-premium
// term — no source column exists and no citable general figure was found (spec §Architecture).

/** The tracked property's own spec — auto-filled from the lake or user-stated (four-lane). */
export interface SubjectSpec {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  /** Whole dollars (matches listing_state.list_price / projects.watch_price). */
  price: number | null;
}

/** A nearby comp's spec, read from data_lake.listing_state / listing_transitions. */
export interface CompSpec {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
}

export interface WatchDelta {
  /** comp.price − subject.price (whole dollars). Null if either price is absent. */
  price_delta: number | null;
  /** comp.beds − subject.beds. Null if either is absent. */
  beds_delta: number | null;
  /** comp.baths − subject.baths. Null if either is absent. */
  baths_delta: number | null;
  /** subject.price / subject.sqft ($/sqft). Null unless both present and sqft > 0. */
  subject_ppsf: number | null;
  /** comp.price / comp.sqft ($/sqft). Null unless both present and sqft > 0. */
  comp_ppsf: number | null;
  /** comp_ppsf − subject_ppsf. Null if either $/sqft is absent. */
  ppsf_delta: number | null;
}

/** Subtract two held numbers, or null if either is missing. Never invents a zero. */
function diffOrNull(a: number | null | undefined, b: number | null | undefined): number | null {
  return a != null && b != null ? a - b : null;
}

/** Price per square foot, or null when either input is missing or sqft is non-positive. */
export function pricePerSqft(
  price: number | null | undefined,
  sqft: number | null | undefined,
): number | null {
  if (price == null || sqft == null || sqft <= 0) return null;
  return price / sqft;
}

/**
 * The full comparative delta between the tracked property and one comp. Pure subtraction — the
 * consuming digest/feed renders these as raw facts ("comp is $3/sqft cheaper, +1 bed"), never as
 * analysis. Any absent input propagates as null rather than a fabricated 0 or estimate.
 */
export function computeWatchDelta(subject: SubjectSpec, comp: CompSpec): WatchDelta {
  const subject_ppsf = pricePerSqft(subject.price, subject.sqft);
  const comp_ppsf = pricePerSqft(comp.price, comp.sqft);
  return {
    price_delta: diffOrNull(comp.price, subject.price),
    beds_delta: diffOrNull(comp.beds, subject.beds),
    baths_delta: diffOrNull(comp.baths, subject.baths),
    subject_ppsf,
    comp_ppsf,
    ppsf_delta: diffOrNull(comp_ppsf, subject_ppsf),
  };
}

/**
 * Does a price cut clear the user's notify threshold? `currentPrice` is the post-cut price and
 * `priceDelta` is the (negative) change vs the prior state, exactly as data_lake.listing_transitions
 * records them — so the prior price is `currentPrice − priceDelta`. Returns false (fail closed) for a
 * non-cut (priceDelta >= 0), a missing input, or a non-positive prior price (can't compute a percent
 * without inventing one). thresholdPct is a percentage, e.g. 2 for "2%+".
 */
export function priceCutExceedsThreshold(
  currentPrice: number | null | undefined,
  priceDelta: number | null | undefined,
  thresholdPct: number,
): boolean {
  if (currentPrice == null || priceDelta == null || priceDelta >= 0) return false;
  const priorPrice = currentPrice - priceDelta; // priceDelta < 0 → prior is larger
  if (priorPrice <= 0) return false;
  const cutPct = (Math.abs(priceDelta) / priorPrice) * 100;
  return cutPct >= thresholdPct;
}

// ── Deterministic raw-fact copy (the ONE source of truth for a watch line) ─────────────────
// Both watch-scan.mts (project_events.ai_summary) and watch-digest.mts (email body) render
// through this. Despite the column name "ai_summary", NOTHING here is model-written — it is a
// direct assembly of held numbers + subtractions, honoring "we don't analyze it, we just send
// updates on movement." Any absent number is simply omitted; nothing is invented to fill a gap.

export type WatchEventType = "nearby_new_listing" | "nearby_price_cut" | "nearby_sale";

export interface WatchEventFacts {
  event_type: WatchEventType;
  distance_miles: number;
  comp: CompSpec;
  delta: WatchDelta;
  /** Sale-only: confirmed close date (MM/DD/YYYY-ready ISO) + price from the lake. */
  sold_date?: string | null;
  sold_price?: number | null;
  /** Price-cut-only: the (negative) change recorded on the transition. */
  price_cut_amount?: number | null;
}

function usd(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function signed(n: number, suffix: string): string {
  const s = n > 0 ? "+" : n < 0 ? "−" : "±"; // U+2212 minus for a clean read
  return `${s}${Math.abs(n)}${suffix}`;
}

/** MM/DD/YYYY from a YYYY-MM-DD lake date (contract rule 5: never the raw token). */
function mmddyyyy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/** Comma-list of the comp's held specs, skipping any absent field (never a fabricated 0). */
function compSpecPhrase(comp: CompSpec): string | null {
  const parts: string[] = [];
  if (comp.beds != null) parts.push(`${comp.beds} bd`);
  if (comp.baths != null) parts.push(`${comp.baths} ba`);
  if (comp.sqft != null) parts.push(`${comp.sqft.toLocaleString("en-US")} sqft`);
  return parts.length ? parts.join(" / ") : null;
}

/** "vs yours" clause — only the deltas we can actually compute. Empty string if none. */
function vsYoursPhrase(delta: WatchDelta): string {
  const bits: string[] = [];
  if (delta.beds_delta != null && delta.beds_delta !== 0)
    bits.push(signed(delta.beds_delta, " bd"));
  if (delta.ppsf_delta != null && Math.round(delta.ppsf_delta) !== 0) {
    bits.push(signed(Math.round(delta.ppsf_delta), "/sqft"));
  }
  return bits.length ? ` — vs yours: ${bits.join(", ")}` : "";
}

/**
 * One plain-text line for a nearby event. No blockquotes, no tables, no jargon (contract rules 5-6).
 * Deterministic and null-safe: the same facts always yield the same line.
 */
export function describeWatchEvent(f: WatchEventFacts): string {
  const dist = `${f.distance_miles.toFixed(1)} mi away`;
  const compPpsf = usd(f.delta.comp_ppsf);
  const specs = compSpecPhrase(f.comp);

  if (f.event_type === "nearby_sale") {
    const when = mmddyyyy(f.sold_date);
    const price = usd(f.sold_price ?? f.comp.price);
    const head = `Nearby sale ${dist}`;
    const tail = [when ? `sold on ${when}` : null, price ? `for ${price}` : null, specs]
      .filter(Boolean)
      .join(", ");
    return tail ? `${head}: ${tail}${vsYoursPhrase(f.delta)}` : `${head}${vsYoursPhrase(f.delta)}`;
  }

  if (f.event_type === "nearby_price_cut") {
    const cut = usd(f.price_cut_amount != null ? Math.abs(f.price_cut_amount) : null);
    const now = usd(f.comp.price);
    const head = `Price cut ${dist}`;
    const tail = [
      cut ? `−${cut}` : null,
      now ? `now ${now}` : null,
      compPpsf ? `(${compPpsf}/sqft)` : null,
      specs,
    ]
      .filter(Boolean)
      .join(", ");
    return tail ? `${head}: ${tail}${vsYoursPhrase(f.delta)}` : `${head}${vsYoursPhrase(f.delta)}`;
  }

  // nearby_new_listing
  const price = usd(f.comp.price);
  const head = `New listing ${dist}`;
  const tail = [specs, price, compPpsf ? `(${compPpsf}/sqft)` : null].filter(Boolean).join(", ");
  return tail ? `${head}: ${tail}${vsYoursPhrase(f.delta)}` : `${head}${vsYoursPhrase(f.delta)}`;
}
