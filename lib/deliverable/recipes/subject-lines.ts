// lib/deliverable/recipes/subject-lines.ts
//
// DETERMINISTIC SUBJECT LINES — no LLM, ever. A subject line is structure, not prose:
// it is written the same way `coming-soon.ts` writes its own (`subjectVariants: [...]`
// as a plain template string) — a model never touches it, so it can never smuggle an
// unsourced claim into the one line every recipient reads before anything else.
//
// Distilled from `_RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-
// concepts-structure.md` (Part B, 14-source crawl4ai pass on real-estate subject-line
// craft — Luxury Presence, Placester, The Close, HousingWire, Inman). Three findings
// that survive as HARD rules here, each independently confirmed by 2+ sources:
//
//   1. 30-40 CHARACTERS. Three independent sources converge (Luxury Presence,
//      Placester, HousingWire) — past that, mobile clients truncate mid-word.
//      `clampSubject` enforces a hard ceiling; every composer below targets the range.
//   2. NEVER THE WORD "NEWSLETTER". Placester, citing an Adestra study: subject
//      lines using that literal word correlate with WORSE open rates than words like
//      "Update"/"Special"/"Bulletin". None of the composers below use it.
//   3. LOCAL SPECIFICITY BEATS GENERIC COPY. Every source that named a real winning
//      subject line named a place or address in it ("Just sold in {neighborhood}",
//      "{First name}, your neighbor just sold"). Every composer takes the resolved
//      street/place as a required argument — there is no generic fallback that omits it.
//
// Two findings from the research were EXPLICITLY NOT adopted, and that is deliberate:
//   - Emoji in subject lines: HousingWire (citing Campaign Monitor) claims +5-15% open
//     rate; The Close (citing Nielsen Norman Group) claims emoji INCREASE negative
//     sentiment and do not lift opens. Two sources, directly opposed, neither a primary
//     study we ran ourselves — so no composer here uses one. A/B test in-house before
//     ever adding one; do not resolve someone else's unresolved contradiction for them.
//   - Comparative/superlative language ("best", "hottest", "won't last"): market-comps.ts
//     already bans this whole vocabulary class from its narrator prose
//     (`BANNED_CONTEXT_PHRASES`) because a comparison is a factual claim code has not
//     computed for the subject line. Same rule applies here even though nothing here
//     is model-authored — a subject line asserting "best price in the ZIP" is exactly
//     the invented-comparison shape the claim gate exists to stop everywhere else.

const MAX_SUBJECT_CHARS = 60;

/** Hard ceiling — `deriveEmailDocSubject` (emaildoc-subject.ts) already clamps to 90
 *  with an ellipsis, but that is the LAST-RESORT safety net, not a target. Every
 *  composer below is written to land inside the researched 30-40 char zone for a
 *  short street name; this only bites on an unusually long address. */
function clampSubject(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX_SUBJECT_CHARS ? t.slice(0, MAX_SUBJECT_CHARS - 1).trimEnd() + "…" : t;
}

/** The street line only — "326 Shore Dr, Fort Myers, FL 33905" → "326 Shore Dr".
 *  Same split the recipes already use inline (market-comps.ts, price-reduced.ts);
 *  centralized here so every subject composer reads it identically. */
export function streetOf(address: string | undefined): string {
  return address?.split(",")[0]?.trim() || "";
}

/**
 * NEW LISTING — the "listing alert" type (Part A cross-platform finding: the
 * single most universal automated real-estate email, present at Zillow, Sierra,
 * Real Geeks, BoldTrail, Follow Up Boss). Informational + local (Luxury Presence
 * taxonomy types 3 + 11) — the announcement itself is the hook, no invented urgency.
 */
export function newListingSubject(address: string | undefined): string {
  const street = streetOf(address);
  return clampSubject(street ? `Just listed: ${street}` : "Just listed — take a look");
}

/**
 * MARKET COMPS — the "evidence" email. Curiosity type (Luxury Presence taxonomy
 * type 10: "This home has a secret. Find out what it is.") applied honestly: the
 * question IS the email's actual content (a price defended by real comps), not a
 * bait-and-switch. Never states a verdict ("priced right") the subject can't back —
 * that judgment is the narrator's code-computed case inside the email, not the subject.
 */
export function marketCompsSubject(address: string | undefined): string {
  const street = streetOf(address);
  return clampSubject(street ? `${street} — is the price right?` : "Is this price right?");
}

/**
 * PRICE REDUCED — sales-driven/urgency type (Luxury Presence taxonomy type 2).
 * `newPrice` is the SOURCED verbatim price string (facts.price) — never derived,
 * never rounded differently than the record. Falls back to a plain announcement
 * when no new price is held rather than inventing one.
 */
export function priceReducedSubject(address: string | undefined, newPrice?: string): string {
  const street = streetOf(address);
  if (street && newPrice) return clampSubject(`${street}: now ${newPrice}`);
  if (street) return clampSubject(`${street}: price just reduced`);
  return "Price just reduced";
}

/**
 * JUST SOLD — the "social proof" type, and the one subject line the research names a
 * literal winner for: *"Just sold in {neighborhood}"* and *"{First name}, your neighbor
 * just sold"* are both quoted as real winning lines in the Part B pass. Finding 3 (local
 * specificity beats generic copy) is the whole design here.
 *
 * THE STREET, NOT THE PRICE. Never put a figure in this subject: under the 08/06/2026
 * decree the hero may be carrying a PREFILLED list price the agent is about to type over,
 * and a subject line is baked into the send — the one place a number can never be corrected.
 * The street is sourced, stable, and is what a neighbour actually recognizes.
 */
export function justSoldSubject(address: string | undefined, city?: string): string {
  const street = streetOf(address);
  if (street) return clampSubject(`Just sold: ${street}`);
  return clampSubject(city ? `Just sold in ${city}` : "Just sold nearby");
}

/**
 * BACK ON THE MARKET — informational + local, same taxonomy family as `newListingSubject`
 * (announcement itself is the hook, no invented urgency: "won't last" is a banned phrase
 * on this recipe specifically — BACK_ON_MARKET_PROHIBITIONS, back-on-market.ts). Property
 * mode only; area mode has no street to name and keeps its own `ctaLabel`-adjacent copy.
 */
export function backOnMarketSubject(address: string | undefined): string {
  const street = streetOf(address);
  return clampSubject(street ? `Back on the market: ${street}` : "Back on the market");
}

/**
 * MARKET PULSE — the monthly "market-report" type (Part A cross-platform finding:
 * the OTHER universal email type, present at Zillow, Compass, Sierra, Luxury
 * Presence, Real Geeks, Wise Agent). Informational + local, and deliberately never
 * the word "Newsletter" (Adestra finding, Placester) — "home values" names the
 * actual content instead of the format.
 */
export function marketPulseSubject(place: string): string {
  return clampSubject(
    place ? `${place} home values — this month's move` : "This month's home values",
  );
}
