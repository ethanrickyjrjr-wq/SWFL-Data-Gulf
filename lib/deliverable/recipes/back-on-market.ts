// lib/deliverable/recipes/back-on-market.ts
//
// R · BACK ON THE MARKET — the "send it" deliverable for the /r/back-on-market read.
// An AREA/ZIP deliverable (not a per-home flyer): it hands a seller (or a buyer) the
// LOCAL fallthrough / relist / delist rates set against the national frame, plus the
// neutral both-sides truth — a returned listing is usually buyer-side, no fault of the
// seller, and common here, not a red flag.
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
// ── WHY THE NARRATIVE IS DETERMINISTIC (no LLM) ──────────────────────────────────────
//
// price-reduced authors its paragraph from the agent's pasted MLS remarks (a real lane-2
// description of a specific house). This deliverable has NO such source: it is about an
// AREA's rates, and the only facts it holds are the sourced rates themselves. Handed those
// and told to write prose, a model has nothing to say but the numbers read back — or,
// worse, an invented REASON a deal died (the exact trap open-house.ts / price-reduced.ts
// documented). So the paragraph is COMPOSED from the sourced rates + the fixed neutral-
// truth framing, in code. That IS the no-invention framing — enforced structurally, not
// via a prompt. The rendered strings are asserted against the prohibition list in the test.
import { buildLifecycleEmail, type ChromeBlock } from "@/lib/email/lifecycle-chrome";
import { spec } from "@/lib/email/listing-flyer";
import { createBlock } from "@/lib/email/doc/default-docs";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import { loadBackOnMarketZip, type BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import type { RecipeBuildContext } from "./index";
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

/** The place label — the resolved place, else the bare ZIP. */
function placeOf(data: BackOnMarketZip): string {
  return data.place && data.place !== data.zip ? data.place : `ZIP ${data.zip}`;
}

/** The three LOCAL rates as the hairline spec strip — the ZIP's own fallthrough/relist/
 *  delist breakdown, each sourced. Cancellation wins the strip (it is the headline). An
 *  unsourced rate is an open slot, dropped from the sent email. */
function ratesStrip(data: BackOnMarketZip): StatItem[] {
  return [
    spec(pct(data.cancellationRatePct), "Fall out of contract", "primary"),
    spec(pct(data.relistRatePct), "Relisted"),
    spec(pct(data.delistRatePct), "Delisted"),
  ];
}

/** THE MIDDLE — the local rate set against the national frame, a real sourced comparison
 *  table (the seller-stress ZIP rate vs the cited U.S. rate). Both are contract-cancellation
 *  percentages (same unit), so the comparison is honest and magnitude-coherent. */
function localVsNationalBlock(data: BackOnMarketZip): ChromeBlock[] {
  const local = pct(data.cancellationRatePct);
  // No local rate (suppressed ZIP) → no comparison table (never a one-sided "vs nothing").
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

/** Provenance under the strip — the as-of dates + sources, stated plainly. Kept concise:
 *  StatsProps.footnote is capped at 120 chars (over it fails schema → the generic author),
 *  and the user-facing local citation is our platform, never the data vendor (listing-
 *  citation policy). The national frame names its Lane-3 web source (Redfin), cited. */
function provenanceFootnote(data: BackOnMarketZip): string {
  const local = data.asOf ? `SWFL Data Gulf, as of ${data.asOf}` : "SWFL Data Gulf";
  return `*Local: ${local}. National: ${NATIONAL_FALLTHROUGH.source.label}, as of ${NATIONAL_FALLTHROUGH.asOf}.`;
}

/**
 * THE NEUTRAL TRUTH — composed, in code, from the sourced rates + the fixed both-sides
 * framing. It MAY cite the local rate (the design's explicit delta). It NEVER states why
 * a specific deal ended, never names the seller, never a value judgment, never a protected
 * class, never "stigmatized". This is the same honest lens the read page renders — here as
 * a static paragraph, because a "send it" deliverable has no toggle.
 */
function neutralTruth(data: BackOnMarketZip): string {
  const local = pct(data.cancellationRatePct);
  // "usually ... buyer-side" matches Phase 1's Lane-1 copy exactly: the buyer-side
  // attribution is a general causes-frame (sourced nationally), never coupled as a hard
  // claim to the local %.
  const lead = local
    ? `About ${local} of pending deals in ${placeOf(data)} fall out of contract, and a home ` +
      `back on the market has usually fallen out for buyer-side reasons — financing, cold ` +
      `feet, an appraisal or inspection gap, and in Southwest Florida often insurance.`
    : `A home back on the market has usually fallen out of contract for buyer-side reasons — ` +
      `financing, cold feet, an appraisal or inspection gap, and in Southwest Florida often ` +
      `insurance.`;
  return (
    `${lead} That is no fault of the seller. Nationally ${NATIONAL_FALLTHROUGH.ratePct}% of ` +
    `home-sale agreements fall through, so a home returning to the market is common here, not ` +
    `a red flag. What the record does not tell you is why any one contract ended — and neither ` +
    `will we. For a seller, the numbers above are the context to hand a buyer up front; for a ` +
    `buyer, a returned listing often means leverage, and its history is public.`
  );
}

/**
 * Build the Back on the Market deliverable. Area-spined: it reads `ctx.zip` and loads that
 * ZIP's Lane-1 rates. Returns null (fall through to the generic author — a documented
 * degrade, never a refusal) when there is no ZIP or no sourced rates to stand on.
 *
 * `loadZip` is injectable so the test never touches the lake / the brain fetch.
 */
export async function buildBackOnMarket(
  ctx: RecipeBuildContext,
  deps: { loadZip?: (zip: string) => Promise<BackOnMarketZip | null> } = {},
): Promise<EmailDoc | null> {
  const zip = ctx.zip?.trim();
  if (!zip) return null;

  const loadZip = deps.loadZip ?? ((z: string) => loadBackOnMarketZip(z));
  const data = await loadZip(zip).catch(() => null);
  // No sourced rates at all → nothing honest to send; fall through to the generic author.
  if (!data) return null;

  const place = placeOf(data);

  return buildLifecycleEmail(ctx.currentDoc, {
    ribbon: "Back on the Market",

    // An area deliverable has no per-home photo — an OPEN SLOT (a canvas dropzone, absent
    // from the sent email), never a stock image.
    photo: null,

    // The hero: the place over its headline rate. A suppressed ZIP → an empty value (open
    // slot), never a fabricated rate.
    heroValue: pct(data.cancellationRatePct),
    heroLabel: `How often deals fall through in ${place}`,

    specs: ratesStrip(data),
    specFootnote: provenanceFootnote(data),

    // THE MIDDLE — the local rate against the national frame (a real sourced table).
    middle: localVsNationalBlock(data),

    // The neutral truth, composed from sourced facts. Never a per-home reason.
    narrative: neutralTruth(data),

    // The next action: the full, interactive read for this ZIP (buyer/seller toggle,
    // provenance panel) on our own site.
    ctaLabel: "See the full read",
    ctaUrl: `https://www.swfldatagulf.com/r/back-on-market?q=${encodeURIComponent(zip)}`,
  });
}
