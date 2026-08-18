// lib/deliverable/recipes/back-on-market.ts
//
// R · BACK ON THE MARKET — TWO MODES, one file, one boundary:
//
//   PROPERTY mode (ctx.facts is set — the PRIMARY door since 08/06/2026, operator:
//     "usually back on market is a fucking property") — a SPECIFIC listing that has
//     come back on the market. Wears the campaign's address/photo/price chrome (the
//     same `buildLifecycleEmail` new-listing/coming-soon/etc. wear) and is now a member
//     of the address-spined lifecycle campaign (`campaign-coherence.test.ts`).
//   AREA mode  (ctx.facts is null, ctx.zip drives the build) — the graceful degrade for
//     a bare ZIP/city ask with no specific address: the LOCAL fallthrough/relist/delist
//     rates set against the national frame, plus the neutral both-sides truth.
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
// ── PROPERTY MODE *IS* THE NEW-LISTING FLYER (rewritten 08/06/2026) ──────────────────
//
// Operator, reading a real render, twice: *"WHERE THE FUCK IS THE HOUSE INFORMATION?
// PRICE, SQ FT. IT'S JUST LIKE A NEW FUCKING LISTING, HOW CAN YOU FUCK IT UP? ADD THE
// EXTRA STUFF, BUT FOR CHRIST'S SAKE, GET THE DETAILS FIRST"* — then, on the next
// render: *"no one cares about how many days it was off market … lead like a new
// listing … get rid of the stupid talk. it's basically a new listing."*
//
// He is right, and the correction is structural, not editorial. A relisted house is a
// house for sale. The reader wants the photo, the price, the specs, the seller's own
// words, and one paragraph — the SAME five things a new listing gives them. So property
// mode no longer assembles its own field set: it calls `buildListingFlyer` (the
// reference implementation, `lib/email/listing-flyer.ts`) and turns exactly two dials,
// the RIBBON WORD and the CTA LABEL. Every other decision — which spec cells, the
// $/Sq Ft emphasis ruling, the description block, the photo/link ladder — is inherited,
// so the two emails cannot drift apart the way seven hand-built layouts once did.
//
// THREE THINGS THIS DELETED, each one the operator's own words:
//
//   1. THE CANCELLATION-RATE PARAGRAPH ("the stupid talk"). It read: *"In 33928, about
//      8.66% of pending deals fall through, and nationally 13.6% of home-sale agreements
//      fall through…"* — a market-statistics lecture on an email about ONE HOUSE. Those
//      rates were written for AREA mode (a bare zip/city ask with no house to describe),
//      and that is the ONLY place they still live. **The ribbon and the subject line
//      ("Back on the market: 13501 Brown Bear Run") already carry the status, twice.
//      Those two ARE the status budget on a single-address email; prose that re-explains
//      the status is prose the reader did not ask for.**
//   2. THE "DAYS OFF" CELL, which LED the spec strip. Nobody cares how long it sat, and
//      it was displacing $/Sq Ft and Type from the standard six-cell line. The strip is
//      now the campaign's shared strip, unmodified. `resolveRelist` went with it — that
//      injected dep existed ONLY to fill this cell. (`lib/back-on-market/relist-fact.ts`
//      itself stays: the `/r/back-on-market` read page is its real consumer.)
//   3. A PRIVATE COPY OF `addressLine`. Lifted into `addressLineOf` (the shared root) in
//      the same pass, which also fixes the stray comma for the other six emails.
//
// WHAT SURVIVES, AND WHY: `BACK_ON_MARKET_PROHIBITIONS` still binds both modes. Deleting
// the status paragraph did not soften the boundary — it removed the only place in
// property mode that ever discussed the relist at all, which makes a violation harder to
// write, not easier. The narrator is still told to describe the house and nothing else.
//
// AREA mode is UNCHANGED. It keeps its fully-deterministic prose, its hero rate, and its
// NUMBER-ONCE discipline (the local rate appears in the hero and nowhere else) — there is
// no house to describe there, so the rates are the whole subject rather than an aside.
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { buildListingFlyer, spec } from "@/lib/email/listing-flyer";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import { loadBackOnMarketZip, type BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import { authorListingNarrative, clearNarrativeSlots, fillNarrative } from "./shared";
import { secondSpecRow } from "./new-listing";
import { backOnMarketSubject } from "./subject-lines";
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
 *  same number rendering twice in two consecutive blocks. `data === null` is a full DATA
 *  MISS (found 08/04/2026 by registry-seam.test.ts — check
 *  email_back_on_market_refuses_on_data_miss) — every cell is simply an open slot, same
 *  as a SUPPRESSED ZIP (a row with null rates); the two cases now render identically. */
function ratesStrip(data: BackOnMarketZip | null): StatItem[] {
  return [
    spec(pct(data?.relistRatePct ?? null), "Relisted", "primary"),
    spec(pct(data?.delistRatePct ?? null), "Delisted"),
  ];
}

/** Provenance under the strip — the LOCAL as-of date + source, stated plainly. `null` on
 *  a full data miss — never cite a source we hold nothing from. Kept concise:
 *  StatsProps.footnote is capped at 120 chars (over it fails schema → the generic
 *  author), and the user-facing citation is our platform, never the data vendor
 *  (listing-citation policy).
 *
 *  MONTH LABEL, NOT A BARE DAY (fixed 08/06/2026 — check
 *  sa0718_back_on_market_surface_shows_the_raw_day_p...). `data.asOf` is a
 *  seller-stress-swfl ROLLING-MONTHLY Redfin figure (load-zip.ts's own doc comment says
 *  so); printing it as "03/01/2026" over-states the precision of a rolling window — the
 *  exact operator ruling already applied to the sibling /r/back-on-market read page
 *  (`components/back-on-market/BackOnMarketRead.tsx`) and to `/r/should-i-sell`
 *  (`lib/should-i-sell/format-period.ts`), imported here rather than re-derived (T1/T2).
 *  `NATIONAL_FALLTHROUGH.asOf` is a single calendar-month PRINT, not a rolling window —
 *  the read page already leaves it as a bare MM/DD/YYYY, so this does too. */
function provenanceFootnote(data: BackOnMarketZip | null): string | undefined {
  if (!data) return undefined;
  const dateLabel = data.asOf ? monthYearLabel(data.asOf) || data.asOf : "";
  const local = dateLabel ? `SWFL Data Gulf, as of ${dateLabel}` : "SWFL Data Gulf";
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
 * only when there is no ZIP at all (nothing to scope the build to). A ZIP with NO sourced
 * row (`data === null` — never tracked, or the brain has not run) is a DATA MISS, not a
 * refusal (RULE 0.7): the grid still lands, every rate an open slot, the hero reads the
 * bare ZIP digits. Found 08/04/2026 by registry-seam.test.ts's SEAM_BYPASS_KNOWN guard
 * (check email_back_on_market_refuses_on_data_miss) — a SUPPRESSED ZIP (a row that
 * exists with null rates) already degraded correctly; only the full-miss case bailed.
 */
async function buildBackOnMarketArea(
  ctx: RecipeBuildContext,
  loadZip: (zip: string) => Promise<BackOnMarketZip | null>,
): Promise<EmailDoc | null> {
  const zip = ctx.zip?.trim();
  if (!zip) return null;

  const data = await loadZip(zip).catch(() => null);
  const place = data ? placeOf(data) : zip;

  return buildLifecycleEmail(ctx.currentDoc, {
    ribbon: "Back on the Market",

    // An area deliverable has no per-home photo — an OPEN SLOT (a canvas dropzone, absent
    // from the sent email), never a stock image.
    photo: null,

    // The hero: the place over its headline rate — the ONE place the cancellation rate
    // appears in area mode. A suppressed ZIP or a full data miss → an empty value (open
    // slot), never a fabricated rate.
    heroValue: data ? pct(data.cancellationRatePct) : "",
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

/** STRIP A LEAKED REASONING PREAMBLE — found live 08/06/2026 on 13501 Brown Bear Run (a
 *  sparse-community address, no "THE COMMUNITY"/"THE NEIGHBORHOOD" line): the shared
 *  narrator (`authorListingNarrative`, `shared.ts`) narrated its OWN compliance with its
 *  system prompt before writing the paragraph — *"THE COMMUNITY fact line is absent, so I
 *  will say nothing about community amenities... The listing description is absent, so I
 *  will describe the home itself..."* — followed by a literal "---" separator, then the
 *  real paragraph. Not a claim-gate violation (no invented fact), so `auditClaims` never
 *  caught it; it shipped raw into the rendered email. Operator, on seeing it: unprintable.
 *
 *  THIS IS A LOCAL BACKSTOP, NOT THE FIX. The real fix belongs in `shared.ts` (every
 *  listing-lifecycle recipe calls the same function and can hit the same failure) — parked
 *  as check `shared_narrator_leaks_reasoning_preamble` because `shared.ts` is claimed by
 *  another live session right now (file-ownership rule: shared files are reported, not
 *  force-edited out from under a parallel session). This function is scoped to THIS
 *  recipe's own file so it never touches the contested one. Delete it once the shared fix
 *  lands and both fixes would double-strip harmlessly in the meantime. */
/** A paragraph that TALKS ABOUT THE WRITING rather than describing the house.
 *
 *  FIRST PERSON IS THE TELL, and the test is deliberately just `\bI\b`. A third-person
 *  property description has no use for the word at all, and every leak measured so far has
 *  been a different conjugation of it — *"so I will describe…"*, *"so I am describing…"*,
 *  and (08/06/2026, live) *"I was not given a year built … let me know and I can trim
 *  further."* Enumerating verbs is how this guard kept missing the next variant. */
function isReasoningNoise(paragraph: string): boolean {
  return (
    /\bI\b/.test(paragraph) ||
    /\b(fact line|is absent|is present|not given|not provided)\b/i.test(paragraph)
  );
}

/** A sentence carrying a BRACKETED PLACEHOLDER — *"Built in [year not provided], this
 *  0.26-acre lot…"* (live, 08/06/2026). The model reached for a fact it does not hold and
 *  left the scaffolding visible instead of just not mentioning it. A real description never
 *  contains a square bracket.
 *
 *  DROP THE SENTENCE, NOT THE PARAGRAPH (fixed 08/06/2026). The first cut of this guard
 *  returned null for the whole paragraph on any bracket, which on the live acceptance house
 *  threw away two perfectly good sentences and shipped an email with NO PROSE AT ALL. One
 *  bad clause is a bad clause. Splitting on sentence boundaries is safe here because we only
 *  ever DELETE — nothing is rewritten, so nothing can be invented. */
function dropBracketedSentences(paragraph: string): string {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/[[\]]/.test(s))
    .join(" ")
    .trim();
}

/**
 * KEEP THE REAL PARAGRAPHS, DROP THE NARRATION — wherever each one sits.
 *
 * The first cut assumed the narration came FIRST and took the LAST segment after a
 * `---`/`***`/`___` rule. On the very next live render the model did the opposite: the real
 * description led, and an italic apology (*"I was not given a year built…"*) trailed after
 * the rule. Taking the last segment kept the apology and threw away the description — the
 * exact inverse of the bug it was written for.
 *
 * So position is not the signal; SHAPE is. Flatten the separators, then judge every
 * paragraph on its own. If nothing survives, return "" — the caller treats that as "nothing
 * real to say" and leaves the slot open rather than shipping visible scaffolding.
 */
function stripReasoningPreamble(text: string): string {
  return (
    text
      .split(/\n\s*(?:-{3,}|\*{3,}|_{3,})\s*\n/)
      .flatMap((segment) => segment.split(/\n{2,}/))
      .map((p) => p.trim())
      // BRACKETS FIRST, THEN THE NOISE TEST — and the order is load-bearing, caught by
      // back-on-market.test.ts. A bracketed placeholder usually READS like narration
      // ("[year not provided]" contains the literal phrase "not provided"), so testing for
      // noise first classified the whole paragraph as narration and threw away the good
      // sentences alongside the bad clause. Cut the clause, THEN judge what is left.
      .map(dropBracketedSentences)
      .filter((p) => p && !isReasoningNoise(p))
      .join("\n\n")
      .trim()
  );
}

/** THE HOUSE PARAGRAPH — the shared listing narrator, told to describe the property and
 *  say NOTHING about its market status. Same call every other listing-lifecycle recipe
 *  makes (new-listing.ts); inherits the claim gate and FAVORABLE_FRAMING_POLICY for free.
 *  Best-effort: nothing real to describe, or any failure → null, and the narrative slot
 *  simply stays OPEN (a canvas instruction, absent from the sent email) — never a blank
 *  box, never visible scaffolding (RULE 0.7). */
/** How many times we ask. TWO, and the second one is earned, not hopeful.
 *
 *  Measured live on 13501 Brown Bear Run 08/06/2026 — a fact-POOR house (no seller
 *  description, no year built, no community line). Across consecutive runs the claim gate
 *  dropped the paragraph roughly half the time, each drop for a genuinely invented detail
 *  ("office", "2400", "under 2 [miles]"), and the leak guard ate a third. Both are the
 *  guards working. But the outcome was an email with ZERO words of prose, and §1.9 puts the
 *  body floor at 50 words — "a 25-word email performs about as badly as a 2000-word one."
 *
 *  So: ask again ONCE, and stop. The cost ceiling is one extra Sonnet call and only on a
 *  failure; a loop would turn a fact-poor house into an open-ended spend. If both attempts
 *  fail, the slot stays OPEN — we do not lower the gate to fill it. */
const NARRATOR_ATTEMPTS = 2;

async function houseNarrative(facts: ListingFacts): Promise<string | null> {
  for (let attempt = 0; attempt < NARRATOR_ATTEMPTS; attempt++) {
    const paragraph = await attemptHouseNarrative(facts).catch(() => null);
    if (paragraph) return paragraph;
  }
  return null;
}

async function attemptHouseNarrative(facts: ListingFacts): Promise<string | null> {
  const t = await authorListingNarrative(facts, {
    // NEW-LISTING FRAMING, DELIBERATELY (rewritten 08/06/2026). This used to say "a
    // separate, fixed paragraph elsewhere in this email covers that status" — true until
    // that paragraph was deleted, after which it was pointing the model at something that
    // does not exist and inviting it to gesture at it. The ribbon and the subject line
    // carry the status; the ONE paragraph on this email introduces the HOUSE, exactly as
    // new-listing's does.
    framing:
      "This home has just come back on the market and is available again. Introduce it " +
      "the way you would a brand-new listing. Do not mention the market status, a " +
      "previous contract, an offer, a buyer, how long it was off the market, or any " +
      "reason the home returned — describe the property itself only.",
  });
  if (!t) return null;
  // `stripReasoningPreamble` drops narration paragraphs and bracketed sentences. The extra
  // bracket check is a belt-and-braces assertion, not a second policy: if one somehow
  // survives sentence-splitting (a bracket with no sentence boundary anywhere), the
  // paragraph does not ship. Scaffolding is never printed.
  const stripped = stripReasoningPreamble(t);
  return stripped && !/[[\]]/.test(stripped) ? stripped : null;
}

/**
 * Build the PROPERTY variant — a specific listing back on the market.
 *
 * **It is the new-listing flyer with two dials turned.** `buildListingFlyer` owns the
 * photo, the hero, the six-cell spec strip, the seller's own description block, and the
 * link ladder (`listingButtonUrl` — which is why the CTA and the photo link can no longer
 * degrade to our homepage the way `facts.sourceUrl` did here until 08/06/2026; §1.8 calls
 * that a deliverability violation, and this recipe never inherited the 08/05 fix).
 *
 * NO `daysOnMarket` IS PASSED, and that is a correctness call, not an omission. That cell
 * is `today − list_date` on an ACTIVE listing, and a relisted home's vendor `list_date` may
 * belong to the ORIGINAL listing run — printing that as "DOM" would state a number that
 * quietly means something else. Omitted → Type keeps the slot (`listingSpecs`), so the
 * strip is still six full cells.
 *
 * `secondSpecRow(facts, false)` — on THIS email the row is now always empty and the call
 * is kept for the day a second peer cell exists: HOA was banned from every buyer-facing
 * cell (operator decree 08/18/2026, see secondSpecRow's ⛔ block), and with no DOM here
 * Type sits in the first strip, leaving Built alone — a one-cell orphan the row rule
 * drops. **`false` is load-bearing**: with no DOM cell the first strip's sixth slot
 * already IS Type, and passing `true` would print Type twice.
 *
 * Never refuses (RULE 0.7): an unsourced cell is an open slot, no description held → no
 * description block, no photo → a dropzone, no listing url → no button, and a failed
 * narrator leaves the paragraph slot open rather than blocking the build.
 */
async function buildBackOnMarketProperty(ctx: RecipeBuildContext): Promise<EmailDoc> {
  const facts = ctx.facts as ListingFacts;

  let doc = buildListingFlyer(facts, ctx.currentDoc, null, secondSpecRow(facts, false), {
    ribbon: "Back on the Market",
    // The next action on a house a reader can walk through today. NOT "See the full read"
    // (that is AREA mode's ask — a data page for a zip code, not a showing).
    ctaLabel: "Schedule a Showing",
  });

  // THE SUBJECT LINE — deterministic, never model-authored (subject-lines.ts), same
  // discipline as every other address-spine recipe. With the status paragraph gone, this
  // and the ribbon are the whole status budget — which is the point.
  doc = { ...doc, subjectVariants: [backOnMarketSubject(facts.address)] };

  // THE ONE PARAGRAPH. `clearNarrativeSlots` blanks every text block EXCEPT the marked
  // description slot, so the seller's own words survive and the authored paragraph lands
  // beside them (the same pairing new-listing makes). A null narrative — no API key, a
  // claim-gate drop, or a stripped reasoning leak — leaves the slot OPEN rather than
  // shipping scaffolding; the description block, when held, still carries real copy.
  const narrative = await houseNarrative(facts).catch(() => null);
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}

/**
 * Build the Back on the Market deliverable — PROPERTY mode (`ctx.facts`, the primary
 * door since 08/06/2026) or AREA mode (`ctx.zip`, the graceful degrade for a bare
 * ZIP/city ask). `ctx.facts` wins when both are present — a resolved house is a
 * stronger subject than a bare ZIP scope. Returns null only when neither mode has
 * anything to stand on (no facts and no zip) — a documented degrade to the generic
 * author, never a refusal for a data miss (RULE 0.7).
 *
 * `loadZip` is injectable so the AREA test never touches the lake. PROPERTY mode takes no
 * deps at all any more: it reads only the resolved house on `ctx.facts` plus the shared
 * narrator. (`resolveRelist` was removed 08/06/2026 along with the "Days Off" cell it
 * existed to fill — `lib/back-on-market/relist-fact.ts` itself stays, because the
 * `/r/back-on-market` read page is its real consumer.)
 */
export async function buildBackOnMarket(
  ctx: RecipeBuildContext,
  deps: {
    loadZip?: (zip: string) => Promise<BackOnMarketZip | null>;
  } = {},
): Promise<EmailDoc | null> {
  if (ctx.facts) return buildBackOnMarketProperty(ctx);

  return buildBackOnMarketArea(ctx, deps.loadZip ?? ((z: string) => loadBackOnMarketZip(z)));
}
