// lib/deliverable/recipes/back-on-market.ts
//
// R · BACK ON THE MARKET — the "send it" deliverable for the /r/back-on-market read.
// TWO MODES, one file, one boundary:
//
//   AREA mode  (ctx.facts is null)  — reads ctx.zip. Hands a seller/buyer the LOCAL
//     fallthrough/relist/delist rates set against the national frame, plus the neutral
//     both-sides truth.
//   PROPERTY mode (ctx.facts is set, added 08/03/2026) — a SPECIFIC listing that has
//     come back on the market. Same neutral-truth boundary, wearing the campaign's
//     address/photo/price chrome instead of an area hero.
//
// ── THE BOUNDARY IS THE INTEGRITY (modeled on price-reduced.ts) ──────────────────────
//
// price-reduced.ts proved the pattern: the recipe's real work is the PROHIBITION LIST —
// the place a lie would ship. This recipe reuses that discipline with the three deltas
// the design spec names (docs/superpowers/specs/2026-07-17-back-on-market-read-design.md):
//
//   1. We DO hold a legitimate market source here — the ZIP fallthrough/relist rate is
//      sourced (seller-stress-swfl, Redfin) — so the copy MAY cite the LOCAL RATE. It
//      still may NEVER state why any SPECIFIC contract fell through.
//   2. NEVER the word "stigmatized" in any user-facing string — a legal term of art
//      (death/crime/haunting; FL Statute 689.25). A relist is nowhere near it.
//   3. NEVER tie a cause to a protected class (fair housing). Causes are market mechanics
//      only, and never attributed to the subject.
//
// These bind BOTH modes — BACK_ON_MARKET_PROHIBITIONS is one list, not one per mode.
//
// ── WHY THE NARRATIVE IS DETERMINISTIC (no LLM) ──────────────────────────────────────
//
// price-reduced authors its paragraph from the agent's pasted MLS remarks (a real lane-2
// description of a specific house). This deliverable has NO such source in EITHER mode:
// area mode is about an area's rates, and property mode holds no MLS remarks about WHY a
// specific contract fell through. Handed the rates and told to write prose, a model has
// nothing to say but the numbers read back — or, worse, an invented REASON a deal died
// (the exact trap open-house.ts / price-reduced.ts documented). So the paragraph is
// COMPOSED from the sourced rates + the fixed neutral-truth framing, in code. That IS the
// no-invention framing — enforced structurally, not via a prompt. The rendered strings
// are asserted against the prohibition list in the test.
//
// ── NUMBER-ONCE (fixed 08/03/2026 — operator: "how many times are you going to write
//    14.82") ────────────────────────────────────────────────────────────────────────
//
// The local cancellation rate used to render FOUR times in area mode: the hero, the
// strip's "Fall out of contract" cell, the local-vs-national middle table, AND (when the
// rate was sourced) the narrative's lead sentence. Same number, four boxes. Now:
//   AREA mode     — the hero is the ONLY place the cancellation rate appears. The strip
//                    drops that cell (Relisted/Delisted only); the middle table is gone
//                    entirely; the narrative never restates it.
//   PROPERTY mode — the cancellation rate appears exactly once, in the ONE stats grid
//                    (local vs. national) — the property's hero/strip carry the LISTING's
//                    own numbers (price, days off market, beds/baths/sqft/lot), not the
//                    area's rate, and the narrative carries no numbers at all.
import { withCommas } from "@/lib/format-number";
import { buildLifecycleEmail, type ChromeBlock } from "@/lib/email/lifecycle-chrome";
import { spec } from "@/lib/email/listing-flyer";
import { createBlock } from "@/lib/email/doc/default-docs";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import { loadBackOnMarketZip, type BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

/**
 * THE PROHIBITIONS — what the user-facing copy must NEVER assert. Not fed to a model
 * (there is none); this is the checklist the deterministic copy is written against and
 * the test enforces on the RENDERED bytes. Kept as a named constant so the rule is
 * greppable and the next reader sees the boundary, not just the copy.
 */
export const BACK_ON_MARKET_PROHIBITIONS = [
  "a REASON a specific contract fell through (the record is reason-unknown by design)",
  "any claim about THE SELLER (motivated, anxious, distressed, relocating)",
  'the word "stigmatized" (a legal term of art; a relist is nowhere near it)',
  "a value judgment (deal / bargain / won't last / priced to move)",
  "a cause tied to a protected class (fair housing)",
  "a comparison of one home to another",
] as const;

/** A percent for display, or "" (an OPEN SLOT) when the rate is unsourced — never a zero,
 *  never a guess. A suppressed ZIP carries null rates and simply shows open cells. */
const pct = (n: number | null): string => (n == null ? "" : `${n}%`);

/** The place label — the resolved place, else the bare ZIP digits.
 *
 * NEVER the word "ZIP" (fixed 08/03/2026 — operator: "why do we write ZIP????? Everyone
 * knows what a fucking ZIP is when there are 5 numbers"). Five digits already read as a
 * ZIP to anyone; prefixing the word was a developer narrating the format, the same class
 * of over-explaining as the deleted $/sq ft footnote (lib/email/CLAUDE.md). */
function placeOf(data: BackOnMarketZip): string {
  return data.place && data.place !== data.zip ? data.place : data.zip;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// AREA MODE — ctx.facts is null, ctx.zip drives the build.
// ═══════════════════════════════════════════════════════════════════════════════════

/** THE TWO LOCAL RATES the strip carries — Relisted (the headline of the two) then
 *  Delisted. Cancellation does NOT repeat here (fixed 08/03/2026, NUMBER-ONCE): the hero
 *  directly above already IS the cancellation rate, so a third cell restating it was the
 *  same number rendering twice in two consecutive blocks. An unsourced rate is an open
 *  slot, dropped from the sent email. */
function ratesStrip(data: BackOnMarketZip): StatItem[] {
  return [
    spec(pct(data.relistRatePct), "Relisted", "primary"),
    spec(pct(data.delistRatePct), "Delisted"),
  ];
}

/** Provenance under the strip — the as-of dates + sources, stated plainly. SHARED by both
 *  modes (also used by `buildBackOnMarketProperty` for its ONE stats grid — a cited rate
 *  carries its as-of date in either mode). Kept concise: StatsProps.footnote is capped at
 *  120 chars (over it fails schema → the generic author), and the user-facing local
 *  citation is our platform, never the data vendor (listing-citation policy). The
 *  national frame names its Lane-3 web source (Redfin), cited. */
function provenanceFootnote(data: BackOnMarketZip): string {
  const local = data.asOf ? `SWFL Data Gulf, as of ${data.asOf}` : "SWFL Data Gulf";
  return `*Local: ${local}. National: ${NATIONAL_FALLTHROUGH.source.label}, as of ${NATIONAL_FALLTHROUGH.asOf}.`;
}

/**
 * THE NEUTRAL TRUTH (area mode) — composed, in code, from the fixed both-sides framing.
 * NEVER restates the local rate (fixed 08/03/2026, NUMBER-ONCE) — the hero above is
 * already the one place that number lives. It still cites the NATIONAL frame (13.6%),
 * a real Lane-3 web source, once. It never states why a specific deal ended, never names
 * the seller, never a value judgment, never a protected class, never "stigmatized".
 */
function neutralTruth(): string {
  return (
    `A home back on the market has usually fallen out of contract for buyer-side reasons — ` +
    `financing, cold feet, an appraisal or inspection gap, and in Southwest Florida often ` +
    `insurance. That is no fault of the seller. Nationally ${NATIONAL_FALLTHROUGH.ratePct}% of ` +
    `home-sale agreements fall through, so a home returning to the market is common here, not ` +
    `a red flag. What the record does not tell you is why any one contract ended — and neither ` +
    `will we. For a seller, the numbers above are the context to hand a buyer up front; for a ` +
    `buyer, a returned listing often means leverage, and its history is public.`
  );
}

/**
 * Build the AREA variant — reads `ctx.zip`, loads that ZIP's Lane-1 rates. Returns null
 * (fall through to the generic author) when there is no ZIP or no sourced rates to stand on.
 */
async function buildBackOnMarketArea(
  ctx: RecipeBuildContext,
  loadZip: (zip: string) => Promise<BackOnMarketZip | null>,
): Promise<EmailDoc | null> {
  const zip = ctx.zip?.trim();
  if (!zip) return null;

  const data = await loadZip(zip).catch(() => null);
  // No sourced rates at all → nothing honest to send; fall through to the generic author.
  if (!data) return null;

  const place = placeOf(data);

  return buildLifecycleEmail(ctx.currentDoc, {
    ribbon: "Back on the Market",

    // An area deliverable has no per-home photo — an OPEN SLOT (a canvas dropzone, absent
    // from the sent email), never a stock image.
    photo: null,

    // The hero: the place over its headline rate — the ONE place the cancellation rate
    // appears in area mode. A suppressed ZIP → an empty value (open slot), never a
    // fabricated rate.
    heroValue: pct(data.cancellationRatePct),
    heroLabel: `How often deals fall through in ${place}`,

    specs: ratesStrip(data),
    specFootnote: provenanceFootnote(data),

    // NO MIDDLE (fixed 08/03/2026, NUMBER-ONCE): the local-vs-national comparison table
    // used to sit here and restate the SAME cancellation rate the hero already shows —
    // a third repetition of one number. Deleted, not replaced.

    // The neutral truth — never restates the local rate; cites the national frame once.
    narrative: neutralTruth(),

    // The next action: the full, interactive read for this ZIP (buyer/seller toggle,
    // provenance panel) on our own site.
    ctaLabel: "See the full read",
    ctaUrl: `https://www.swfldatagulf.com/r/back-on-market?q=${encodeURIComponent(zip)}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// PROPERTY MODE — ctx.facts is set: a SPECIFIC listing back on the market. (added
// 08/03/2026 — operator: "usually back on market is a fucking property.")
// ═══════════════════════════════════════════════════════════════════════════════════

/** The address, composed from the record's own STRUCTURED fields (mirrors
 *  price-reduced.ts's `addressLine` — the vendor's `formattedAddress` carries a stray
 *  comma before the ZIP; city/state/zip are the same record's own fields and compose
 *  cleanly). Nothing invented — only re-punctuated. */
function addressLine(facts: ListingFacts): string {
  const full = (facts.address ?? "").trim();
  const comma = full.indexOf(",");
  const street = comma > 0 ? full.slice(0, comma).trim() : full;
  const locality = [facts.city, [facts.state, facts.zip].filter(Boolean).join(" ").trim()]
    .filter(Boolean)
    .join(", ");
  if (!street) return locality;
  return locality ? `${street}, ${locality}` : full;
}

/** THE PROPERTY'S OWN SPEC STRIP — days off market leads (the fact this email is about),
 *  then the listing's own beds/baths/sqft/lot. Days off market is sourced ONLY from an
 *  injected relist reading (NO vendor feed carries "how long since this specific listing
 *  came back off the market" — it is a lane-4 fact the caller supplies); absent → an open
 *  slot, never a zero.
 *
 *  LABEL IS "Days Off", NOT "Days off market" (fixed 08/03/2026, same session as FIX 1).
 *  Five cells at the 600px canvas ÷ (32px strip padding) leaves ~113px per cell, ~97px of
 *  single-line text budget after the cell's own 8px padding — the SAME width class that
 *  just wrapped "OPEN HOUSE DATE" over three lines. Measured empirically at the real spec
 *  (14px, uppercase, +0.06em tracking, Arial): "DAYS OFF MARKET" renders 141px wide —
 *  effectively identical to "OPEN HOUSE DATE"'s 144px, the exact string FIX 1 just
 *  shortened. "Days Off" renders 73px — comfortably one line. Mirrors the repo's own
 *  precedent for this exact failure class: `listingSpecs`' "DOM" (lib/email/listing-flyer.ts,
 *  operator ruling 07/14/2026 — "'Days on Market' wrapped to three lines… Short label,
 *  whole number, no wrap"). The ribbon above already reads "Back on the Market", so a
 *  reader is never left to guess what "off" the days are counted from. */
function propertySpecs(facts: ListingFacts, relist?: { daysOffMarket: number | null }): StatItem[] {
  const days = relist?.daysOffMarket;
  return [
    spec(days != null ? String(days) : undefined, "Days Off", "primary"),
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(facts.lotSize, "Lot"),
  ];
}

/** THE ONE STATS GRID property mode carries — the listing's own ZIP set against the
 *  national frame. This is the ONLY place a rate appears in property mode (the hero and
 *  strip above carry the LISTING's own numbers, not a rate). No local rate (suppressed
 *  ZIP, no ZIP data at all, or the listing carries no ZIP) → no comparison table — never
 *  one-sided. Takes the ALREADY-LOADED reading (loaded ONCE in `buildBackOnMarketProperty`
 *  so the same read also drives the strip's provenance footnote below — two consumers,
 *  one lake call). */
function fallthroughVsNationalBlock(data: BackOnMarketZip | null): ChromeBlock[] {
  if (!data) return [];
  const local = pct(data.cancellationRatePct);
  if (!local) return [];
  return [
    {
      block: {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [
            spec(local, `${placeOf(data)} — deals that fall through`, "primary"),
            spec(`${NATIONAL_FALLTHROUGH.ratePct}%`, "United States"),
          ],
          variant: "grid",
        },
      },
      height: 3,
    },
  ];
}

/**
 * THE NEUTRAL TRUTH (property mode) — the same both-sides boundary as area mode, but
 * about THIS listing and carrying NO NUMBERS AT ALL: the rate already lives in the one
 * stats grid above, once. Never states why THIS contract ended, never names the seller,
 * never a value judgment, never a protected class, never "stigmatized".
 */
function propertyNeutralTruth(): string {
  return (
    `A home back on the market has usually fallen out of contract for buyer-side reasons — ` +
    `financing, cold feet, an appraisal or inspection gap, and in Southwest Florida often ` +
    `insurance. That is no fault of the seller. A home returning to the market is common, ` +
    `not a red flag. What the record does not tell you is why this contract ended — and ` +
    `neither will we. Its history is public, and for a buyer that can mean leverage.`
  );
}

/** Build the PROPERTY variant — a specific listing back on the market. `ctx.facts` is
 *  the resolved house; the ZIP-level rate (if any) is loaded ONCE from `facts.zip` and
 *  feeds BOTH the one stats grid AND that grid's provenance (a cited rate carries its
 *  as-of date — same rule area mode's `provenanceFootnote` already follows; property
 *  mode previously shipped 13%/13.6% with no as-of and no source anywhere in the email).
 *  Never refuses: an unsourced cell is an open slot, a missing rate drops the grid (and
 *  its footnote with it — never an orphaned citation for a number that isn't shown), a
 *  missing photo is a dropzone. */
async function buildBackOnMarketProperty(
  ctx: RecipeBuildContext,
  loadZip: (zip: string) => Promise<BackOnMarketZip | null>,
  relist?: { daysOffMarket: number | null },
): Promise<EmailDoc> {
  const facts = ctx.facts as ListingFacts;
  const zip = facts.zip?.trim();
  const zipData = zip ? await loadZip(zip).catch(() => null) : null;
  const middle = fallthroughVsNationalBlock(zipData);

  return buildLifecycleEmail(ctx.currentDoc, {
    ribbon: "Back on the Market",

    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: addressLine(facts) || "Featured property",
          linkUrl: facts.sourceUrl,
        }
      : null, // no photo → a canvas dropzone, absent from the email. Never a stock image.

    heroValue: facts.price ?? "",
    heroLabel: addressLine(facts),

    specs: propertySpecs(facts, relist),
    // Only when the grid actually ships a rate — never an orphaned citation.
    specFootnote: middle.length && zipData ? provenanceFootnote(zipData) : undefined,

    // THE ONE STATS GRID — the listing's own ZIP vs. the national frame. The only rate
    // in this email.
    middle,

    // The neutral truth — no numbers, the rate already lives in the grid above.
    narrative: propertyNeutralTruth(),

    ctaLabel: "Schedule a Showing",
    ctaUrl: facts.sourceUrl,
  });
}

/**
 * Build the Back on the Market deliverable — AREA mode (`ctx.zip`) or PROPERTY mode
 * (`ctx.facts`, added 08/03/2026: "usually back on market is a fucking property").
 * `ctx.facts` wins when both are present — a resolved house is a stronger subject than
 * a bare ZIP scope. Returns null (fall through to the generic author — a documented
 * degrade, never a refusal) when neither mode has enough to stand on.
 *
 * `loadZip` is injectable so the test never touches the lake / the brain fetch. `relist`
 * is injectable too (property mode's days-off-market reading has no vendor feed) —
 * BOTH are ADDITIVE to the existing `deps` shape; the /r/back-on-market "send it" flow
 * (lib/deliverable/recipes/index.ts) calls this with only `loadZip` and is unaffected.
 */
export async function buildBackOnMarket(
  ctx: RecipeBuildContext,
  deps: {
    loadZip?: (zip: string) => Promise<BackOnMarketZip | null>;
    relist?: { daysOffMarket: number | null };
  } = {},
): Promise<EmailDoc | null> {
  const loadZip = deps.loadZip ?? ((z: string) => loadBackOnMarketZip(z));

  if (ctx.facts) return buildBackOnMarketProperty(ctx, loadZip, deps.relist);

  return buildBackOnMarketArea(ctx, loadZip);
}
