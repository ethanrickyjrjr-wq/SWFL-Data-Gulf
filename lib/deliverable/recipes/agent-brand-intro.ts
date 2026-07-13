// lib/deliverable/recipes/agent-brand-intro.ts
//
// R8 · AGENT BRAND INTRO — a DIFFERENT SPINE. This is not a listing flyer and it
// must never be forced into one.
//
// The six answers (playbook Part 6):
//
//  1. SUBJECT — TWO spines at once, IN THE SAME STRING AND USUALLY IN DIFFERENT CITIES.
//     (a) THE FARM AREA (the real one): `ctx.zip` when the ZIP door set a scope, else
//         the place named in the prompt — read ONLY from the clauses that hold no
//         street address (`splitAnchorFromArea`). This is the recipe's central hazard:
//         the crosswalk reads a bare ZIP before a place name, so with the anchor's
//         address left in the text a Cape Coral agent ships a FORT MYERS email — real
//         numbers, wrong place. Resolved through the TWO EXISTING roots —
//         `parseReplyIntent` (bare ZIP or place name → crosswalk entry) and
//         `zipFromPromptPlace` (place → EVERY ZIP it spans). No third crosswalk scan.
//         No farm area outside the anchor's address → NULL, loudly. We never infer that
//         an agent farms where their listing happens to sit; that is a claim about THEM
//         with no source. No email beats a wrong-city email.
//     (b) THE ANCHOR LISTING: the agent's own newest listing. WE CANNOT SOURCE THIS
//         FROM OUR DATA — `data_lake.listing_state.brokerage` is 100% NULL and
//         `listed_date` is 100% NULL (probed live 07/13/2026 over Cape Coral's 5,912
//         active for-sale rows), so we hold NO agent↔listing link and NO "newest"
//         ordering. Anchoring on the farm area's newest live listing would put a
//         STRANGER'S HOUSE under this agent's name — invented provenance, which is
//         worse than a gap. So the anchor is LANE 2: the agent names it in the build
//         box ("…my newest listing at 326 Shore Dr, Fort Myers, FL 33905"), and
//         `resolveSubject` — THE one shared resolver, never a second one — pulls the
//         real record. No address → an OPEN SLOT with the instruction.
//  2. SKELETON — a coded grid, here (the `buildListingFlyer` precedent). No committed
//     SEED_DOC fits: `skeleton-agent-feature` leads with `agent-hero`, whose empty-photo
//     branch ships a 300px dark "Agent photo" box to real recipients (it does not honor
//     `emailRender`), and it carries neither a chart slot nor a listing anchor.
//     `agent-spotlight` has the same two holes plus a "Homes Sold / Avg Sale Price /
//     List-to-Sale" stat row we cannot source for any agent. See the report.
//  3. CELLS — the chart's per-ZIP figures (lake), and the anchor's price/beds/baths/
//     sqft/$-per-sqft (vendor record). Every unsourced one is an OPEN SLOT: `image`,
//     `stats` and `text` are the ONLY blocks that honor `emailRender`, so those are the
//     only blocks a gap is allowed to live in. Never a zero, never a naked label.
//  4. CHART — YES. `zip-by-zip-asking`: the median LIST price per ZIP across the farm
//     area (`data_lake.listing_active_stats`, read through the one cited-figure root).
//     This deliverable IS about a number. It is NOT routed through
//     `buildChartForQuestion`: `routeChart` sees the word "price" and returns the ZHVI
//     home-value TREND — a modelled Zillow index of every home, not live asking prices.
//     Wrong chart. A hand-built `bar-table` ChartSpec is the precedent
//     (`buildSoldCompsSpec`). Too few priced ZIPs → drop the slot, never an empty box.
//  5. PROSE — ONE authored paragraph, and IT NEVER SEES THE ZIP-BY-ZIP SET. The
//     relations over that set (the count, the top, the bottom, the spread) are computed
//     in CODE and handed over as settled English sentences (lib/deliverable/claims.ts).
//     The narrator cannot compare two ZIPs because it was never given two. We know
//     NOTHING about this agent, so the model writes NOTHING about them: the personal
//     introduction is an open TEXT slot in the agent's own words.
//     (`authorListingNarrative` is house-specific and is deliberately not used here.)
//  6. FRAMING — headshot + name up front, the farm area's asking-price spread as the
//     evidence, the agent's newest listing as the anchor, one CTA.

import { createBlock, DEFAULT_BLOCK_PROPS } from "@/lib/email/doc/default-docs";
import { brandWebsiteUrl, heroPhotoBlock } from "@/lib/email/inject-photo";
import { chartImageBlock } from "@/lib/email/inject-chart";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import { parseReplyIntent } from "@/lib/email/parse-intent";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { subjectAddressFromPrompt } from "@/lib/email/listing-intent";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
} from "@/lib/deliverable/chart-coherence";
import { anchorsExactly, extractNumbers, normalizeNumber } from "@/lib/deliverable/narrative-lint";
import {
  auditClaims,
  numeralsIn,
  settledCount,
  CLAIM_PROHIBITION,
  type SettledClaim,
} from "@/lib/deliverable/claims";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
import { loadMarketFigures, type MarketFigure } from "@/lib/email/market-context";
import { resolveSubject, dropEmptyChartSlot } from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { BlockLayout, EmailBlock, EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com";

/** A bar chart of two ZIPs is a fact wearing a chart costume — write the fact instead.
 *  Below this floor the chart slot is DROPPED (never an empty box). */
const MIN_ZIPS_FOR_CHART = 3;

// ── The farm area (spine A) ──────────────────────────────────────────────────
//
// THE WHOLE POINT OF THIS SECTION: the farm area and the anchor listing live in the
// SAME string, and they are usually in DIFFERENT CITIES. Every rendered value in this
// deliverable (chart, hero, CTA, sources, prose) hangs off this one resolution — so a
// wrong resolution is a perfectly-faithful email about the wrong city, and no narrator
// gate can see it. The prose is TRUE. The SUBJECT is wrong.
//
// ── TWO FIXES BEFORE THIS ONE FAILED OPEN, AND SHIPPED THE BUG ───────────────
//
// FIX 1 cut out the address `subjectAddressFromPrompt` returns. That matcher is
// /(listing|property|home|house)\s+at\s+…/ — NULL for "my newest listing IS 326 Shore
// Dr", for "Anchor: 326 Shore Dr". A guard that fires only when a narrow matcher fires
// is not a guard.
//
// FIX 2 (the code this replaces) scrubbed street addresses structurally and then read
// the farm area from "the clauses that are left". It STILL shipped Fort Myers to a Cape
// Coral agent. Reproduced end-to-end 07/13/2026:
//
//   "I farm Cape Coral with my newest listing at 500 Bayfront in Fort Myers."
//     → resolveFarmArea() === "Fort Myers"       ← the agent farms CAPE CORAL
//
// THREE independent holes, each individually sufficient:
//   (a) The address detector demanded a street SUFFIX, or "FL", or a 5-digit ZIP.
//       "500 Bayfront" has NONE of the three. Nothing was excised at all.
//   (b) The farm cue selected a CLAUSE, and "with" is not a clause boundary — so the
//       "cued" text still held the anchor's city.
//   (c) `parseReplyIntent` sorts its needles longest-first. "cape coral" and
//       "fort myers" are BOTH ten characters. The tie is broken by gazetteer order.
//       The farm area was decided by a stable sort. That is not a resolution.
//
// ── WHY THIS ONE CANNOT FAIL OPEN ───────────────────────────────────────────
//
// STOP SCRUBBING THE ANCHOR OUT AND HOPING. Read the farm area from a span the anchor
// CANNOT OCCUPY. A place name earns the farm role from the CUE THAT INTRODUCES IT, and
// the two roles read DISJOINT text:
//
//   FARM SPAN   — the text after "I farm" / "my farm area is" / "my market is", ending
//                 at the first HARD STOP. The anchor listing is ALWAYS introduced by its
//                 own cue ("my newest listing…", "Anchor:") or by punctuation, and every
//                 one of those IS a hard stop. The anchor's city cannot get in.
//   ANCHOR SPAN — the text after a listing cue, to the end of that sentence.
//   NEUTRAL     — everything else, with addresses AND anchor spans removed.
//
// And the fallback DEMANDS UNANIMITY. With no farm cue we enumerate EVERY SWFL place
// left in the neutral text: exactly one → that is the farm area; zero or two-or-more →
// NULL, LOUDLY. So an under-excision no longer costs a wrong city — it costs an OPEN
// SLOT that asks which area to feature. Both failure directions now land on honest.
//
// The old `splitAnchorFromArea` scrub is KEPT — as the second of two filters, not as
// the guard. It no longer has to fire for the resolution to hold.

export interface FarmArea {
  place: string;
  /** EVERY ZIP the place spans — a multi-ZIP city is six ZIPs, not one. */
  zips: string[];
}

/** The street suffix is what makes a house-number-led span an ADDRESS and not a count
 *  ("42 homes"). Longest alternatives first so `street` wins over `st`. */
const STREET_SUFFIX =
  "street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|court|ct|terrace|ter|" +
  "parkway|pkwy|circle|cir|place|pl|highway|hwy|trail|trl|square|sq|plaza|plz|" +
  "crossing|xing|point|pt|cove|cv|bend|bnd|loop|walk|row|way|path|run|isle|key";

/** A house number: 1–6 digits (+ an optional letter, "326A"), NOT a fragment of a
 *  larger number — the lookbehind keeps "2,551 listings" from reading as "551 …". */
const HOUSE_NUMBER = String.raw`(?<![\d.,])\d{1,6}[A-Za-z]?\s+`;

/**
 * A clause that OPENS a street address. Three shapes, all house-number-led:
 *   • a street suffix within five words   — "326 Shore Dr", "1234 SW 47th Ter"
 *   • Florida within the same breath      — "500 Bayfront, Naples, FL"
 *   • a 5-digit ZIP within the same breath — "326 Shore Dr Fort Myers 33905"
 * A number with none of those is a number, not an address.
 */
const ADDRESS_HEAD = new RegExp(
  HOUSE_NUMBER +
    "(?:" +
    String.raw`(?:[A-Za-z0-9'’.#\-]+\s+){0,5}(?:${STREET_SUFFIX})\b` +
    "|" +
    String.raw`[A-Za-z][^\n]{0,50}?\b(?:FL|Fla|Florida)\b` +
    "|" +
    String.raw`[A-Za-z][^\n]{0,50}?\b\d{5}\b` +
    ")",
  "i",
);

/** Words that prove a clause is a SENTENCE, not an address's city tail. ", Fort Myers"
 *  is a tail; ", and I farm Cape Coral" is not. */
const TAIL_STOP_WORDS = new Set(
  (
    "a an the and but or plus so then also i we my our your it its this that these those " +
    "is are was were be been am do does did have has had will would can could should " +
    "in on at to of for with from by about where which who when what why how here there " +
    "listing listings home homes house houses property properties price prices sale sales " +
    "market markets area areas farm farming neighborhood city cities town zip zips chart " +
    "email name headshot photo anchor build write make create draft newest new my"
  ).split(" "),
);

const STATE_ONLY = /^(?:fl|fla\.?|florida)$/i;
const ZIP_ONLY = /^\d{5}(?:-\d{4})?$/;
const STATE_ZIP = /^(?:fl|fla\.?|florida)\s*,?\s*(\d{5}(?:-\d{4})?)$/i;
/** 1–3 plain words (a city), optionally trailed by the state and/or the ZIP. */
const CITY_TAIL =
  /^([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,2})(?:\s*,?\s*(?:FL|Fla\.?|Florida)\b\.?)?(?:\s*,?\s*(\d{5}(?:-\d{4})?))?$/i;

interface Tail {
  city: boolean;
  state: boolean;
  zip: boolean;
}

/** Is this clause part of the PRECEDING address — its city, its state, its ZIP?
 *  Null = it is prose, and the address ended before it. */
function classifyTail(clause: string): Tail | null {
  const t = clause.trim().replace(/[.\s]+$/, "");
  if (!t) return { city: false, state: false, zip: false }; // an empty fragment
  if (STATE_ONLY.test(t)) return { city: false, state: true, zip: false };
  if (ZIP_ONLY.test(t)) return { city: false, state: false, zip: true };
  if (STATE_ZIP.test(t)) return { city: false, state: true, zip: true };
  const m = CITY_TAIL.exec(t);
  if (!m) return null;
  const words = m[1].toLowerCase().split(/\s+/);
  if (words.some((w) => TAIL_STOP_WORDS.has(w))) return null;
  return { city: true, state: /\b(?:FL|Fla|Florida)\b/i.test(t), zip: Boolean(m[2]) };
}

/** Clause boundaries. Commas and sentence marks, the em-dash the recipe's own seed
 *  uses, AND the bare conjunctions — "…, Fort Myers and I farm Cape Coral" has no
 *  punctuation between the address's city and the farm area. */
const CLAUSE_SPLIT = /[.,;:!?\n]|—|–|\s+-\s+|\band\b|\bbut\b|\bplus\b/i;

export interface AnchorSplit {
  /** The clauses NO street address can reach — the only text the farm area is read from. */
  areaClauses: string[];
  /** Each street address we cut out, rejoined — the anchor-listing candidates. */
  addresses: string[];
}

/**
 * Cut every street address (and its own city/state/ZIP tail) out of the prompt.
 *
 * This is the ONE address detector in this recipe, and it serves BOTH spines: what it
 * removes is exactly what spine B (the anchor listing) is, and what it leaves is
 * exactly what spine A (the farm area) may be read from. There is no way for the two
 * to disagree, and no matcher that has to fire for the guard to hold.
 */
export function splitAnchorFromArea(prompt: string): AnchorSplit {
  const clauses = String(prompt ?? "").split(CLAUSE_SPLIT);
  const areaClauses: string[] = [];
  const addresses: string[] = [];

  // The address tail state machine: after the street line we may take a city, then a
  // state, then a ZIP — each at most once, and the ZIP ends the address. Anything else
  // ends it too. This is what stops "…, FL 33905. Cape Coral." from eating Cape Coral.
  let inAddress = false;
  let took: Tail = { city: false, state: false, zip: false };

  for (const clause of clauses) {
    const head = ADDRESS_HEAD.exec(clause);
    if (head) {
      inAddress = true;
      took = { city: false, state: false, zip: false };
      // The address STARTS at the house number — "My newest listing IS 326 Shore Dr"
      // is dropped from the area text whole, but only "326 Shore Dr" is the address we
      // hand the resolver (a geocoder fed the prose returns nothing).
      addresses.push(clause.slice(head.index).trim());
      continue;
    }
    if (inAddress) {
      const tail = classifyTail(clause);
      const allowed =
        tail !== null &&
        !(tail.city && took.city) &&
        !(tail.state && took.state) &&
        !took.zip &&
        !(tail.city && (took.state || took.zip));
      if (allowed) {
        took = {
          city: took.city || tail.city,
          state: took.state || tail.state,
          zip: took.zip || tail.zip,
        };
        const t = clause.trim();
        if (t) addresses[addresses.length - 1] += `, ${t}`;
        if (took.zip) inAddress = false; // the ZIP ends the address
        continue;
      }
      inAddress = false;
    }
    areaClauses.push(clause);
  }
  return { areaClauses, addresses };
}

/** The two EXISTING crosswalk roots, composed — no third scan of the gazetteer appears
 *  in the repo. `parseReplyIntent` turns a bare ZIP *or* a place name into an entry;
 *  `zipFromPromptPlace` expands that place into ALL its ZIPs. Never invents a place.
 *
 *  CALL THIS ON A SPAN, NEVER ON THE WHOLE PROMPT. Handed two places it returns ONE,
 *  and which one is decided by needle length and then by gazetteer order — "cape coral"
 *  and "fort myers" are both ten characters, and the tie-break shipped the wrong city.
 *  It is a resolver for text we have already proven holds ONE role. */
function crosswalkArea(text: string): FarmArea | null {
  const intent = parseReplyIntent(text);
  if (!intent.place) return null;
  const spread = zipFromPromptPlace(intent.place);
  return spread ? { place: spread.place, zips: spread.zips } : null;
}

/**
 * EVERY distinct SWFL place named in a span — not the first one, ALL of them.
 *
 * This is what makes the fallback fail CLOSED: `crosswalkArea` cannot tell you that a
 * span is AMBIGUOUS, it just picks. This can, so the caller can refuse.
 *
 * Composed from the EXISTING `zipFromPromptPlace` root — a windowed scan over it, not a
 * third copy of the gazetteer needle table (there are already two; a third is how the
 * crosswalk drifts).
 *
 * ANCHORED, longest-first. Two traps, both real:
 *   • Longest window first, so "Fort Myers Beach" yields ONE place, not also "Fort Myers".
 *   • The hit must START at word `i` — proven by re-running the window MINUS its first
 *     word and requiring the place to change. Without it, "Estero and Fort Myers" reads
 *     as ["Fort Myers"] alone (the longer needle shadows Estero from index 0) and an
 *     ESTERO agent gets a unanimous, confident, wrong Fort Myers email.
 */
export function placesNamedIn(text: string): string[] {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(4, words.length - i); n >= 1; n--) {
      const hit = zipFromPromptPlace(words.slice(i, i + n).join(" "));
      if (!hit) continue;
      // Does the same place still match without word `i`? Then it does not START here,
      // and recording it now would consume — and lose — whatever place DOES start here.
      const shifted = zipFromPromptPlace(words.slice(i + 1, i + n).join(" "));
      if (shifted && shifted.place === hit.place) continue;
      if (!out.includes(hit.place)) out.push(hit.place);
      break;
    }
  }
  return out;
}

/** THE AGENT SAYING WHERE THEY FARM. The recipe's own seed is "…for my farm area
 *  [[your city or ZIP]] —", so this is the prompt's normal shape. A trailing "is"/"in"
 *  is eaten so the span starts on the place itself. */
const FARM_CUE =
  /\b(?:i\s+(?:farm|work|sell)|farm(?:ing)?\s+area|my\s+(?:farm\s+area|farm|area|market|town|city|neighborhood))\b(?:\s+(?:is|in|are))?\s*[:,-]?\s*/i;

/** WHERE THE FARM SPAN ENDS. Everything that could introduce the OTHER spine is here:
 *  clause punctuation, the em-dash the seed itself uses, and every word that opens a new
 *  role. "I farm Cape Coral WITH my newest listing at…" — "with" is the whole ballgame.
 *
 *  No SWFL place name contains any of these as a WHOLE word (checked against the
 *  gazetteer: "Fort Myers" is not "for", "Sanibel" is not "and", "Pine Island" is not
 *  "i"), so a stop word can never truncate a real place. */
const FARM_SPAN_STOP =
  /[.,;:!?\n]|—|–|\s+-\s+|\b(?:with|and|but|plus|where|while|when|because|listing|listings|property|properties|home|homes|house|houses|anchor|newest|featuring|including|my|our|we|i)\b/i;

/** THE LISTING CUE. What follows it, to the end of that sentence, is the ANCHOR — its
 *  street, its city, its ZIP. None of it may ever be read as the farm area. */
const ANCHOR_CUE = /\b(?:listing|property|home|house|anchor|address)\s*(?:at|is|:)\s*/i;

/**
 * Cut every anchor span — a listing cue and the rest of ITS SENTENCE — out of the text.
 *
 * To the END OF THE SENTENCE, deliberately: an address's city, state and ZIP are
 * COMMA-separated ("326 Shore Dr, Fort Myers, FL 33905"), so a comma cannot end it.
 *
 * This is the second of the two filters that keep a listing's city out of the fallback
 * (the first is the street-address scrub). It catches exactly what that one misses — a
 * suffix-less street with no state and no ZIP, "500 Bayfront in Fort Myers" — because it
 * keys on the CUE the agent wrote, not on the shape of the address.
 *
 * It NEVER runs before the farm cue is read. "…listing is 326 Shore Dr, Fort Myers, FL
 * 33905 and I farm Cape Coral" runs to the end of the sentence and would eat the farm
 * area too — which is exactly why the agent's own DECLARATION is resolved first, off the
 * untouched prompt, and this only ever guards the fallback.
 */
function splitAnchorCues(prompt: string): { rest: string; spans: string[] } {
  let text = String(prompt ?? "");
  const spans: string[] = [];
  const cue = new RegExp(ANCHOR_CUE.source, "i");
  for (let guard = 0; guard < 8; guard++) {
    const m = cue.exec(text);
    if (!m) break;
    const from = m.index;
    const after = text.slice(from + m[0].length);
    const end = after.search(/[.!?\n]|—|–/);
    spans.push((end === -1 ? after : after.slice(0, end)).trim());
    text = text.slice(0, from) + " " + (end === -1 ? "" : after.slice(end));
  }
  return { rest: text, spans };
}

export function stripAnchorSpans(prompt: string): string {
  return splitAnchorCues(prompt).rest;
}

/**
 * THE FARM AREA. Four lanes, and NOT ONE of them can be reached by the anchor listing.
 *
 *   1. `zip` — the ZIP door's own scope. A FIELD, not free text. Uncontaminatable.
 *   2. THE DECLARED SPAN — the text after the agent's own farm cue, ending at the first
 *      hard stop. The anchor is introduced by its own cue or by punctuation, and both
 *      are hard stops, so no phrasing of the anchor can enter this span.
 *   3. THE NEUTRAL TEXT, AND ONLY IF IT IS UNANIMOUS — every SWFL place left after the
 *      street addresses AND the anchor spans are cut. Exactly one → that is the farm
 *      area. Two or more → we CANNOT TELL, so we do not guess.
 *   4. NULL, LOUDLY. Zero places, or a genuine conflict. We never infer that an agent
 *      farms where their listing happens to sit — that is a claim about THEM with no
 *      source. The caller does NOT refuse the build (RULE 0.7): it ships the deliverable
 *      with the area slots OPEN and an instruction. A hole is honest. A wrong city is not.
 */
export function resolveFarmArea(prompt: string, zip?: string): FarmArea | null {
  if (zip) {
    const scoped = crosswalkArea(zip);
    if (scoped) return scoped;
  }
  const text = String(prompt ?? "");

  // LANE 2 — THE DECLARATION. Read off the UNTOUCHED prompt: the agent said it, and no
  // filter may be allowed to eat it. The span itself is what makes this safe.
  const cue = FARM_CUE.exec(text);
  if (cue) {
    const after = text.slice(cue.index + cue[0].length);
    const stop = after.search(FARM_SPAN_STOP);
    const declared = crosswalkArea(stop === -1 ? after : after.slice(0, stop));
    if (declared) return declared;
  }

  // LANE 3 — THE NEUTRAL TEXT, AND IT MUST BE UNANIMOUS. Both filters run; neither has
  // to fire for the other to hold.
  const { areaClauses } = splitAnchorFromArea(stripAnchorSpans(text));
  const named = placesNamedIn(areaClauses.join(" , "));
  if (named.length === 1) {
    const only = crosswalkArea(named[0]);
    if (only) return only;
  }
  if (named.length > 1) {
    console.error(
      `[agent-brand-intro] AMBIGUOUS FARM AREA — the prompt names ${named.join(" and ")} ` +
        `and no farm cue says which one the agent farms. Refusing to guess; the area slots ` +
        `stay OPEN. Add "I farm <city or ZIP>" to the build box.`,
    );
  }
  return null;
}

/**
 * The anchor listing's address — spine B, LANE 2 (the agent's own words).
 *
 * THE SAME MACHINERY, READ THE OTHER WAY. Every filter that keeps a listing's city OUT
 * of the farm area is, by construction, a detector OF the listing — so the anchor is
 * resolved from exactly the text the farm area refuses to read. The two spines can never
 * disagree about which words belong to which, because one definition produces both.
 *
 * Three lanes, widest-known first:
 *   1. `subjectAddressFromPrompt` — the shared root and the recipe grammar's own matcher.
 *      It only knows "…listing AT <ADDRESS>".
 *   2. The street-address scrub's own span — catches "listing IS 326 Shore Dr, Fort
 *      Myers, FL 33905" and "Anchor: …", which lane 1 returns null for.
 *   3. THE ANCHOR SPAN — what follows a listing cue, to the end of its sentence. This is
 *      the only lane that sees a SUFFIX-LESS street with no state and no ZIP ("500
 *      Bayfront in Fort Myers"), which is the shape that shipped the bug.
 *
 * A span with no digit in it is not an address (an agent writing "my newest listing as
 * the anchor" has named nothing) → null → an OPEN SLOT. Never a guessed house.
 */
export function anchorAddressFromPrompt(prompt: string): string | null {
  const isAddress = (s: string): boolean => /\d/.test(s) && s.trim().length >= 6;
  // The address is RENDERED (it is the anchor hero's label), so a trailing sentence mark
  // ships: "500 Bayfront in Fort Myers." was in the rendered email. `subjectAddressFromPrompt`
  // strips a trailing comma but not a period — trim here rather than reach into a shared file.
  const clean = (s: string): string =>
    s
      .trim()
      .replace(/^(?:at|in|is|located\s+at)\s+/i, "")
      .replace(/[.,;\s]+$/, "");

  const declared = subjectAddressFromPrompt(prompt);
  if (declared) return clean(declared);

  const cut = splitAnchorFromArea(prompt).addresses[0]?.trim() ?? "";
  if (isAddress(cut)) return clean(cut);

  const span = splitAnchorCues(prompt).spans.find(isAddress) ?? "";
  return span ? clean(span) : null;
}

// ── The asking-price chart (live listings, per ZIP) ──────────────────────────

export interface ZipAsk {
  zip: string;
  medianList: number;
  /** MM/DD/YYYY — the figure's own as-of, straight from the lake. */
  asOf?: string;
}

/** One ZIP's cited figures, as `loadMarketFigures` hands them back. */
export interface ZipFigures {
  zip: string;
  figures: MarketFigure[];
}

/** "$525,000" → 525000. No digits → null (an unpriced ZIP is DROPPED, never a zero bar). */
function usdToNumber(v: string | undefined): number | null {
  const n = Number((v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Pure: the per-ZIP figure sets → the chart's rows, priced-only, richest first.
 *
 * The figure we plot is `median_list` — the ZIP's median LIST price from
 * `data_lake.listing_active_stats`, i.e. what homes are ASKING on live listings right
 * now. NOT `home_value` (Zillow's ZHVI index, a modelled value of every home, sold or
 * not) and NOT a sale price. Exported for the test.
 */
export function toZipAsks(perZip: ZipFigures[]): ZipAsk[] {
  const out: ZipAsk[] = [];
  for (const { zip, figures } of perZip) {
    const f = figures.find((x) => x.key === "median_list");
    const medianList = usdToNumber(f?.value);
    if (!medianList) continue; // no asking price → no bar. NEVER a zero.
    out.push({ zip, medianList, ...(f?.as_of ? { asOf: f.as_of } : {}) });
  }
  return out.sort((a, b) => b.medianList - a.medianList);
}

/** MM/DD/YYYY → YYYY-MM-DD. `ChartBlock.asOf` is ISO by contract (the caption renders
 *  it back to MM/DD/YYYY via the ONE date root). Unparseable → null. */
export function mdyToIso(mdy: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((mdy ?? "").trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** The single as-of every plotted number shares: the LATEST across the ZIPs. */
export function latestAsOfIso(rows: ZipAsk[]): string | null {
  const isos = rows.map((r) => mdyToIso(r.asOf)).filter((s): s is string => Boolean(s));
  return isos.length ? isos.sort().slice(-1)[0] : null;
}

/**
 * Live asking prices per ZIP across the farm area.
 *
 * Read through `loadMarketFigures` — the ONE cited-figure root the whole email builder
 * already uses (`fetchLakeParts` → `market-context.ts`) — so this recipe adds no second
 * reader of `data_lake.listing_active_stats` and no new untyped-lake exception. It is
 * one scoped read per ZIP, exactly the pattern `authorDoc` already runs for a multi-ZIP
 * city (build-doc.ts). Empty-tolerant by contract (four-lane / ODD): no creds, no rows,
 * any error → `[]`, NEVER a throw and never an invented number.
 */
async function loadAskingByZip(zips: string[]): Promise<{ rows: ZipAsk[]; asOf: string | null }> {
  if (!zips.length) return { rows: [], asOf: null };
  const perZip = await Promise.all(
    zips.map(async (zip) => ({
      zip,
      figures: await loadMarketFigures({ kind: "zip", value: zip }).catch(() => []),
    })),
  );
  const rows = toZipAsks(perZip);
  return { rows, asOf: latestAsOfIso(rows) };
}

/** The bar spec. Null below the 3-ZIP floor — the caller then drops the slot. */
export function buildZipAskingSpec(
  area: FarmArea,
  rows: ZipAsk[],
  asOfIso: string | null,
): ChartSpec | null {
  if (rows.length < MIN_ZIPS_FOR_CHART || !asOfIso) return null;
  return {
    frameId: "bar-table",
    title: `What homes are asking in ${area.place}, by ZIP`,
    columns: ["ZIP", "Median asking price"],
    rows: rows.map((r) => [r.zip, r.medianList] as (string | number | null)[]),
    value_format: "usd",
    chart_type: "bar",
    asOf: asOfIso,
    source: { citation: "SWFL Data Gulf", url: BASE_URL },
  } as ChartSpec;
}

// ── The one authored paragraph — the chart's own figures, and nothing else ────

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * THE CLAIM GATE, WIRED (lib/deliverable/claims.ts).
 *
 * THE OLD VERSION OF THIS FUNCTION HANDED THE NARRATOR THE RAW SET — one line per ZIP,
 * `Median asking price in 33914: $525,000`, six of them. Every figure correctly sourced,
 * and a model holding six numbers WILL draw a relation between them: "four of the six sit
 * above $400,000", "the spread is widening", "33991 outpaces its neighbors". Not one of
 * those contains an invented NUMBER, and every one of them is an invented CLAIM. That is
 * precisely how market-pulse shipped "five of those six ZIPs" over a set whose true count
 * was four, and how market-comps inverted a price defense.
 *
 * SO THE NARRATOR IS NOT GIVEN THE SET. It is given two sentences that CODE wrote:
 *
 *   1. THE COUNT — `settledCount`, integer arithmetic. The exact function market-pulse
 *      needed. `rows.length` is the ZIPs that actually carry a median asking price;
 *      `area.zips.length` is every ZIP the city spans. The predicate says only what we
 *      can prove ("show a median asking price in this chart") — NOT "have homes for sale",
 *      which would be a claim about the ZIPs we hold nothing for.
 *   2. THE SPREAD — the top, the bottom and the difference, ordered and subtracted in
 *      code. The model kept deriving this itself ("a spread of about $180,900"), and
 *      arithmetic on two cited numbers is still an UNSOURCED number.
 *
 * THE PER-ZIP ROWS APPEAR NOWHERE IN THE RETURN VALUE. That is the structural
 * done-condition and it is greppable: the narrator cannot compare two ZIPs because it was
 * never handed two. The chart still plots all of them — the chart is drawn by code.
 *
 * (No `compareToSet` here: there is no honest SUBJECT to compare against this set. The
 * anchor listing is, by the whole premise of this recipe, usually in a DIFFERENT CITY, so
 * pricing it against the farm area's ZIPs would be a comparison across unlike things —
 * a true sentence about nothing. The gate's job here is to PREVENT a comparison over the
 * set, not to manufacture one.)
 */
export function settledAreaClaims(area: FarmArea, rows: ZipAsk[]): SettledClaim[] {
  const hi = rows[0];
  const lo = rows[rows.length - 1];
  const spread = `Asking prices run from ${usd(lo.medianList)} in ${lo.zip} to ${usd(hi.medianList)} in ${hi.zip}, a spread of ${usd(hi.medianList - lo.medianList)}.`;
  return [
    settledCount(rows.length, area.zips.length, {
      noun: `ZIP codes in ${area.place}`,
      predicate: "show a median asking price in this chart",
    }),
    { sentence: spread, anchors: numeralsIn(spread) },
  ];
}

/** Every number the narrator is allowed to write, normalized for exact comparison. */
function anchorsFor(facts: string[]): Set<string> {
  const set = new Set<string>();
  for (const f of facts) {
    for (const tok of extractNumbers(f)) {
      const n = normalizeNumber(tok);
      if (n) set.add(n);
    }
  }
  return set;
}

/** A COUNT WRITTEN IN WORDS IS STILL A COUNT. `extractNumbers` is digit-based, so
 *  "the four ZIPs in between" walked straight through the anchor gate — and 6 − 2 = 4
 *  is arithmetic the model did, which is an unsourced number under our own lint.
 *  Spelled cardinals that COUNT something are normalized to digits and gated with the
 *  rest. Pronominal "one of them" carries no count noun and is left alone. */
const SPELLED: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  dozen: "12",
};
const SPELLED_COUNT = new RegExp(
  String.raw`\b(${Object.keys(SPELLED).join("|")})\b\s+(?:[a-z-]+\s+){0,2}` +
    String.raw`(?:zips?|codes?|listings?|homes?|houses?|properties|neighborhoods?|cities|markets?)\b`,
  "gi",
);

/** The spelled counts in the prose, as digit strings ("four ZIPs" → "4"). */
export function spelledCounts(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SPELLED_COUNT)) {
    const d = SPELLED[m[1].toLowerCase()];
    if (d) out.push(d);
  }
  return out;
}

/**
 * The market read under the chart. THE MODEL WRITES PROSE, NOTHING ELSE: it is handed
 * the code-computed figures and forbidden every other fact — most of all, any claim about
 * the agent (we know nothing about them, so "fifteen years working these canals" is as
 * much an invention as a number).
 *
 * HARD GATE: every numeric token it writes must anchor EXACTLY to a figure we handed it
 * (the same `extractNumbers`/`anchorsExactly` root the deliverable no-invention lint uses)
 * — AND every count it spells out in words, which the digit-based tokenizer cannot see.
 * One unanchored quantity → we throw the whole paragraph away and the slot stays OPEN.
 * Best-effort by contract: any failure → null, never a blocked build, never a fake number.
 */
export function unanchoredQuantities(text: string, facts: string[]): string[] {
  const anchors = anchorsFor(facts);
  return [
    ...extractNumbers(text).filter((t) => !anchorsExactly(t, anchors)),
    ...spelledCounts(text).filter((d) => !anchors.has(d)),
  ];
}

/** Every violation in a draft: the claim gate's shapes, plus the digit/spelled-count
 *  anchor check. Both fail-closed to the SAME place — an open slot. */
export function violationsIn(text: string, settled: readonly SettledClaim[]): string[] {
  return [
    ...auditClaims(text, settled).map((v) => `${v.kind}: "${v.match}"`),
    ...unanchoredQuantities(
      text,
      settled.map((s) => s.sentence),
    ).map((q) => `unsourced quantity: "${q}"`),
  ];
}

export async function authorAreaRead(area: FarmArea, rows: ZipAsk[]): Promise<string | null> {
  if (rows.length < 2) return null;
  const settled = settledAreaClaims(area, rows);
  const facts = settled.map((s) => s.sentence);

  // CLAIM_PROHIBITION is printed VERBATIM into the system prompt, so the model is told the
  // exact rule `auditClaims` enforces — a violation is then a refusal to follow an explicit
  // instruction, not a surprise. Prompt and lint stay in lockstep by construction.
  // THE SHAPE IS DICTATED, NOT SUGGESTED. `auditClaims` exempts a sentence only when it is
  // a settled fact restated (it substring-matches against the settled text) — so a model
  // that MERGES two settled sentences, or adds a clause to one, or re-words it, produces a
  // sentence code never authored, and the gate correctly kills the whole paragraph.
  // Asked to "say them naturally" it re-worded every time and the slot went open on EVERY
  // build: an honest hole, but a hole. Told to reproduce each fact VERBATIM as its own
  // sentence and given a worked example, it complies (3/3 live). Constrain the shape and
  // the model succeeds; leave it open and a fail-closed gate silently eats the deliverable.
  const system =
    `You write ONE short paragraph introducing a real-estate agent's farm area to their ` +
    `neighbors. It sits directly under a bar chart of the asking prices in that area.\n\n` +
    `${CLAIM_PROHIBITION}\n\n` +
    `HOW TO WRITE IT. You are given SETTLED FACTS — computed in code from real listing data, ` +
    `already true. Reproduce each one as its OWN complete sentence, WORD FOR WORD, in the ` +
    `order given. Do not merge them, do not add a clause to them, do not re-word them: a ` +
    `re-worded comparison is a NEW comparison, and it will be rejected.\n` +
    `You may add ONE sentence before them and ONE after. Those sentences must assert NO fact ` +
    `of any kind — no number, no comparison, no count, no quality of the area.\n\n` +
    `EXAMPLE of the required shape:\n` +
    `"Here is what homes are asking across the area right now. <SETTLED FACT 1, VERBATIM> ` +
    `<SETTLED FACT 2, VERBATIM> These are asking prices on live listings, not what homes ` +
    `sold for."\n\n` +
    `ALSO FORBIDDEN HERE.\n` +
    `- You know NOTHING about the agent — not their name, their record, their years in the ` +
    `business, their specialty. Write NOTHING about them.\n` +
    `- You know nothing about these ZIPs beyond the settled facts: no neighborhoods, no ` +
    `canals, no waterfront, no schools, no new construction, no "up-and-coming". A quality ` +
    `is as much an invention as a number.\n` +
    `- These are ASKING prices on live listings, not sale prices. Never call them what homes ` +
    `sold for.\n` +
    `- No hype, no exclamation marks, no jargon. Plain and specific. Return ONLY the paragraph.`;
  const ask = (extra?: string): string =>
    `SETTLED FACTS (reproduce each one verbatim; derive nothing else):\n` +
    `${facts.map((f) => `- ${f}`).join("\n")}\n\n` +
    (extra ? `${extra}\n\n` : "") +
    `Write the paragraph.`;

  try {
    const client = getAnthropic("email_build");
    // ONE retry with the violation NAMED. Then FAIL CLOSED: the paragraph is thrown away
    // and the slot stays OPEN. Never "best-effort" it — a missing paragraph is honest, a
    // confident false one is not.
    let retryNote: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = await client.messages.create({
        model: EMAIL_MODEL_SONNET,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: ask(retryNote) }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      if (!text) return null;
      const bad = violationsIn(text, settled);
      if (!bad.length) return text;
      console.log(
        `[agent-brand-intro] CLAIM GATE rejected draft ${attempt + 1}: ${bad.join(" · ")}`,
      );
      retryNote =
        `YOUR LAST DRAFT WAS REJECTED. It contained — ${bad.join("; ")} — none of which you ` +
        `were given. You DREW those yourself, and drawing a conclusion is the one thing you ` +
        `may not do. Rewrite using ONLY the settled facts, in their own words.`;
    }
    console.log("[agent-brand-intro] CLAIM GATE: dropped the paragraph — the slot stays OPEN");
    return null;
  } catch {
    return null;
  }
}

// ── Grid helpers (the buildListingFlyer precedent) ───────────────────────────

/** Reuse the current doc's block of a type — brand/identity is STICKY, never authored. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

/**
 * The agent card — the brand's landing pad (applyBrand writes AGENT_NAME / AGENT_TITLE /
 * AGENT_BIO / AGENT_PHOTO_URL onto it AFTER the build, EmailLabGridShell:470), and the
 * canvas's edit surface for the same fields. It always exists so both have a target.
 *
 * BUT ITS DEFAULT PROPS ARE INSTRUCTIONS, NOT CONTENT. `DEFAULT_BLOCK_PROPS["agent-card"]`
 * carries "A short bio that builds trust with your readers." and the HOUSE name — and
 * `AgentCardBlock` does NOT honor `emailRender`, so a `createBlock("agent-card")` ships
 * that sentence to a real recipient. (The New Listing reference does exactly this today —
 * rendered and confirmed 07/13/2026. Reported, not patched here: it's a shared file.)
 * So: keep every REAL brand value, and blank anything still sitting at its placeholder.
 */
export function brandAgentCard(current: EmailDoc): EmailBlock {
  const house = DEFAULT_BLOCK_PROPS["agent-card"] as Record<string, string | undefined>;
  const found = current.blocks.find((b) => b.type === "agent-card");
  const src = (found?.props ?? {}) as Record<string, string | undefined>;
  const real = (k: string): string => {
    const v = (src[k] ?? "").trim();
    return v && v !== (house[k] ?? "").trim() ? v : "";
  };
  return {
    id: found?.id ?? createBlock("agent-card").id,
    type: "agent-card",
    props: {
      photoUrl: real("photoUrl"),
      name: real("name"),
      title: real("title"),
      bio: real("bio"),
      phone: real("phone"),
      ctaUrl: real("ctaUrl"),
      // A CTA label with no url renders nothing (AgentCardBlock needs both) — but the
      // brand's CTA_URL lands here after the build, so the label must already be set.
      ctaLabel: src.ctaLabel?.trim() || "Get in touch",
    },
  };
}

/** The agent's headshot, if the brand profile already carries one. `applyBrand` writes
 *  `AGENT_PHOTO_URL` onto the canvas doc's agent-card / agent-hero, so THAT is where a
 *  real headshot lives by the time a build runs. Absent → null → an open slot with a
 *  file picker. NEVER a stock photo. */
export function brandHeadshot(current: EmailDoc): string | null {
  for (const b of current.blocks) {
    if (b.type === "agent-card" && b.props.photoUrl) return b.props.photoUrl;
    if (b.type === "agent-hero" && b.props.photoUrl) return b.props.photoUrl;
  }
  return null;
}

/** The agent's name from the sticky brand — but NOT the house brand's own name, which
 *  is what an un-branded canvas carries by default (`HOUSE_BRAND.companyName`). */
export function brandAgentName(current: EmailDoc): string | null {
  const house = DEFAULT_BLOCK_PROPS["agent-card"].name;
  for (const b of current.blocks) {
    if (b.type === "agent-card" && b.props.name && b.props.name !== house) return b.props.name;
    if (b.type === "agent-hero" && b.props.name && b.props.name !== house) return b.props.name;
  }
  return null;
}

/** "7453" → "7,453". Undefined in → undefined (an open slot, never a fabricated 0). */
function withCommas(n?: string): string | undefined {
  const digits = (n ?? "").replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}

/** Price ÷ sqft. Both must parse, or the cell stays an OPEN SLOT. */
function pricePerSqft(price?: string, sqft?: string): string | undefined {
  const p = Number((price ?? "").replace(/[^\d.]/g, ""));
  const s = Number((sqft ?? "").replace(/[^\d.]/g, ""));
  if (!p || !s || !Number.isFinite(p) || !Number.isFinite(s)) return undefined;
  return "$" + Math.round(p / s).toLocaleString("en-US");
}

function at<T extends EmailBlock>(block: T, y: number, h: number, opts?: Partial<BlockLayout>): T {
  return { ...block, layout: { x: 0, y, w: 12, h, ...opts } };
}

/** A stat cell: sourced → the value; unsourced → an EMPTY cell, which is an editable
 *  open slot on the canvas (its LABEL is the instruction) and does not exist in the
 *  sent email (StatsBlock drops it under `emailRender`, and drops the whole row when
 *  none survive). Never a zero.
 *
 *  THE LABEL IS CLAMPED TO 60 BECAUSE THE SCHEMA IS: `StatItem.label` is
 *  `z.string().max(60)` (doc/schema.ts:82). A 138-character open-slot instruction failed
 *  validation, and authorDoc's response to an invalid doc is to DISCARD THE BUILDER AND
 *  FALL BACK TO THE GENERIC AUTHOR — which resolved the place by scanning the whole
 *  prompt and shipped a FORT MYERS email to the Cape Coral agent. The open-slot mechanism
 *  I added to PREVENT the wrong city was, for one build, the thing that CAUSED it (seen in
 *  the render, 07/13/2026). A cell can no longer break the schema. */
const cell = (value: string | undefined, label: string): StatItem => ({
  value: value && value.trim() ? value.trim().slice(0, 24) : "",
  label: label.slice(0, 60),
});

// ── The builder ──────────────────────────────────────────────────────────────

export async function buildAgentBrandIntro(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { prompt, currentDoc, zip } = ctx;

  // SPINE A — THE FARM AREA. Read from the agent's own DECLARED SPAN, or from a
  // UNANIMOUS neutral text. There is no phrasing of the anchor listing that can move it.
  //
  // NULL IS A LEGITIMATE, SHIPPABLE OUTCOME — and it must NOT `return null`. Returning
  // null falls through to the generic author, which resolves a place by scanning the
  // WHOLE prompt through the same tie-broken crosswalk that caused this bug — so the
  // wrong-city email would ship anyway, just from a different builder. Instead we build
  // the deliverable with every area-dependent slot OPEN and an instruction in its label.
  // Never refuse the build (RULE 0.7); never invent the subject.
  const area = resolveFarmArea(prompt, zip);
  if (!area) {
    console.error(
      "[agent-brand-intro] NO FARM AREA — the prompt declares no farm area we can trust. " +
        "Refusing to infer it from the anchor listing's city (that is a claim about the " +
        "AGENT with no source). Building with the area slots OPEN.",
    );
  }

  // SPINE B — THE ANCHOR LISTING, LANE 2: the agent's own words. `ctx.facts` is null for
  // an "agent"-spine recipe by design (the dispatcher only resolves an address for the
  // "address" spine), so the address — if the agent gave one — lives nowhere but the
  // prompt. `resolveSubject` is THE resolver; we call it, we never write a second one.
  // A resolve MISS still keeps the address (the agent stated it): the hero names the
  // home, every spec cell stays an open slot, and nothing is invented.
  const anchorAddress = anchorAddressFromPrompt(prompt);
  const anchor: ListingFacts | null = anchorAddress
    ? await resolveSubject(anchorAddress, prompt)
        .then((r) => r.facts)
        .catch(() => null)
    : null;

  // THE CHART — live asking prices per ZIP. A chart is a bonus, never a blocker. No farm
  // area → no ZIPs → no chart. We never chart a city the agent did not name.
  const { rows, asOf } = await loadAskingByZip(area?.zips ?? []);
  const spec = area ? buildZipAskingSpec(area, rows, asOf) : null;
  const accent = currentDoc.globalStyle.accentColor || "#3DC9C0";
  const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
  const slug = (area?.place ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const chart =
    spec && area
      ? await chartSpecToEmailImage(
          spec,
          accent,
          `email-charts/zip-asking-${slug}-${asOf}-${tint}.png`,
        ).catch(() => null)
      : null;

  // THE ONE PARAGRAPH — the chart's own figures, nothing else. No chart → no read.
  const areaRead = chart && area ? await authorAreaRead(area, rows) : null;

  const headshot = brandHeadshot(currentDoc);
  const agentName = brandAgentName(currentDoc);
  const siteUrl = brandWebsiteUrl(currentDoc) || BASE_URL;

  const blocks: EmailBlock[] = [];
  let y = 0;
  const push = (block: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push(at(block, y, h, opts));
    y += h;
  };

  // 1. Header — the agent's branded header (company, logo, colors). Sticky.
  push(keepOrDefault(currentDoc, "header"), 2);

  // 2. HEADSHOT — up front, as the recipe asks. The brand's photo when it carries one;
  //    otherwise an OPEN SLOT with a file picker + paste-a-link (ImageBlock → ImageSlot),
  //    which does not exist in the sent email. NEVER a stock photo of a stranger.
  //    NOT an `agent-hero`: that block ignores `emailRender` and ships a 300px dark
  //    "Agent photo" box to real recipients when its photo is missing.
  push(
    headshot
      ? heroPhotoBlock({
          url: headshot,
          alt: agentName ?? "Your agent",
          linkUrl: siteUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: {
            url: "",
            kind: "photo",
            // The LABEL IS THE INSTRUCTION (open-slot contract, playbook Part 4).
            alt: "your headshot — a photo of you, not your logo",
          },
        },
    6,
  );

  // 3. The name, up front. The value is the agent's REAL name from the brand or nothing
  //    at all — never a placeholder. With no name the hero is still honest copy (a kicker
  //    and the place); with one it is the 48px display line the recipe asks for.
  //    NO FARM AREA → NO PLACE LINE. A hero that names a city we could not resolve is the
  //    exact lie this recipe exists to stop; an empty label simply renders nothing.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Meet your agent",
        value: agentName ?? "",
        label: area ? `${area.place}, Florida` : "",
      },
    },
    3,
  );

  // 4. The agent card — name, title, bio, phone. Brand-owned and sticky; we never author
  //    a word of it, and we never let its default INSTRUCTION text ship as content.
  push(brandAgentCard(currentDoc), 4);

  // 5. The personal introduction — the agent's OWN words. We know nothing about this
  //    person, so the model may not write it and we do not fake it: an empty text block
  //    is an open slot on the canvas and does not exist in the sent email.
  push({ id: createBlock("text").id, type: "text", props: { body: "", align: "left" } }, 4);

  // 6. THE CHART — asking prices by ZIP across the farm area. This deliverable IS about
  //    a number, so it earns one. Unresolved → the slot is dropped below, never an empty
  //    box.
  if (chart) {
    // caption: "" ON PURPOSE. The rasterized chart already draws its own title and its
    // "SWFL Data Gulf · as of MM/DD/YYYY" provenance line INSIDE the PNG, so the block
    // caption printed the identical sentence a second time under the image (seen in the
    // render, 07/13/2026). One citation, one place.
    push(chartImageBlock({ url: chart.url, alt: chart.alt, caption: "", linkUrl: siteUrl }), 5);
  } else if (area) {
    push(
      {
        id: createBlock("image").id,
        type: "image",
        props: {
          url: "",
          kind: "chart",
          alt: `Median asking price by ZIP — ${area.place}`,
          caption: "",
        },
      },
      5,
    );
  } else {
    // NO FARM AREA — THE LOUD FAILURE, MADE VISIBLE. A `stats` cell is the one open-slot
    // mechanism that is PROVABLY both: StatsBlock renders an empty cell's LABEL on the
    // canvas (the label IS the instruction — playbook Part 4) and returns null for it
    // under `emailRender`, dropping the whole row when no cell survives. So the agent is
    // asked which area to feature, and the recipient sees nothing at all.
    //
    // Not an empty `image` block: `dropEmptyChartSlot` removes those entirely, and the
    // question would vanish with them.
    //
    // AND THE LABEL MUST FIT IN 60 CHARS (schema.ts:82). Over that, the doc is invalid,
    // authorDoc throws the builder away, and the GENERIC author ships the wrong-city
    // email this whole recipe exists to prevent. `cell()` clamps; keep it short anyway.
    push(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: { stats: [cell(undefined, 'Which area do you farm? Add "I farm <city or ZIP>"')] },
      },
      2,
    );
  }

  // 7. The one authored paragraph — the chart's figures read back honestly, or an open
  //    slot. Written straight into the block: this grid has TWO text slots, and
  //    `fillNarrative` fills the FIRST empty one, which is the personal intro above.
  push(
    {
      id: createBlock("text").id,
      type: "text",
      props: { body: areaRead ?? "", align: "left" },
    },
    4,
  );

  // 8. THE ANCHOR LISTING — the agent's newest listing.
  //    Resolved (they named it) → the real photo, price, address and specs.
  //    Not named → open slots that tell them exactly how to fill it, and that a
  //    recipient never sees. We do NOT substitute the area's newest live listing: we
  //    hold no agent↔listing link (brokerage is 100% null), so that would be a stranger's
  //    house sold under this agent's name.
  push(
    anchor?.photos[0]
      ? heroPhotoBlock({
          url: anchor.photos[0],
          alt: anchor.address ?? "My newest listing",
          linkUrl: anchor.sourceUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: {
            url: "",
            kind: "photo",
            alt: 'your newest listing — name it in the build box ("…my newest listing at 123 Main St, Cape Coral, FL 33914") and we\'ll pull its photo, price and specs',
          },
        },
    6,
  );

  if (anchor?.price || anchor?.address) {
    push(
      {
        id: createBlock("hero").id,
        type: "hero",
        props: {
          kicker: "My newest listing",
          value: anchor.price ?? "",
          label: anchor.address ?? "",
        },
      },
      3,
    );
  }

  const specs: StatItem[] = [
    cell(anchor?.price, "Price"),
    cell(anchor?.beds, "Beds"),
    cell(anchor?.baths, "Baths"),
    cell(withCommas(anchor?.sqft), "Sq Ft"),
    cell(pricePerSqft(anchor?.price, anchor?.sqft), "$/Sq Ft"),
    cell(anchor?.lotSize, "Lot"),
  ];
  for (let i = 0; i < specs.length; i += 3) {
    push(
      { id: createBlock("stats").id, type: "stats", props: { stats: specs.slice(i, i + 3) } },
      2,
    );
  }

  // 9. Sources — the collapsed citation list. Seeded from the ONE figure set this email
  //    actually plots; empty (no chart) → SourcesBlock renders nothing.
  push(
    {
      id: createBlock("sources").id,
      type: "sources",
      props: {
        sources:
          chart && area
            ? [
                {
                  label: `Active for-sale listings — median asking price by ZIP, ${area.place}`,
                  url: BASE_URL,
                },
              ]
            : [],
      },
    },
    2,
  );

  // 10. One CTA. Its label NAMES THE PLACE — so with no farm area it must not name one.
  //     "See what's for sale in Fort Myers" under a Cape Coral agent's headshot is the
  //     same lie as the hero. Buttons do not honor `emailRender`, so this one degrades to
  //     honest copy instead of vanishing.
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: {
        label: area ? `See what's for sale in ${area.place}` : "See what's for sale",
        url: siteUrl,
      },
    },
    2,
  );

  // 11. Footer — the agent's CAN-SPAM footer (address, socials, unsubscribe). Sticky.
  push(keepOrDefault(currentDoc, "footer"), 3, { static: true });

  let doc: EmailDoc = { globalStyle: { ...currentDoc.globalStyle }, blocks };

  // AN EMPTY CHART BOX IS WORSE THAN NO CHART. Also the house coherence rule
  // (lib/email/CLAUDE.md): a headline that sits an order of magnitude outside the
  // chart's plotted range drops the chart rather than shipping the contradiction.
  if (chart && spec) {
    const coherence = assertHeroChartCoherence({
      hero: resolveHeadlineFigure(doc),
      chart: chartMagnitudeFromSpec(spec),
    });
    if (!coherence.coherent) {
      console.log("[agent-brand-intro] dropped incoherent chart:", coherence.reason);
      doc = {
        ...doc,
        blocks: doc.blocks.map((b) =>
          b.type === "image" && b.props.kind === "chart"
            ? { ...b, props: { ...b.props, url: "", caption: "" } }
            : b,
        ),
      };
    }
  }
  return dropEmptyChartSlot(doc);
}
