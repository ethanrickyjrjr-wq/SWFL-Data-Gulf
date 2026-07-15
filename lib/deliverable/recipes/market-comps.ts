// lib/deliverable/recipes/market-comps.ts
//
// R3 · MARKET COMPS — the EVIDENCE email. The one deliverable in the lifecycle that
// is genuinely ABOUT a number, so it is the one that earns the comps chart.
//
// ── THE LAYOUT IS NOT MINE. IT IS THE CAMPAIGN'S. ─────────────────────────────
//
// Operator, 07/13/2026: *"EACH EMAIL WOULD HAVE THE SAME LOOK, JUST DIFFERENT
// INFORMATION."* It was not the case. This file used to own its own grid — hero-left,
// photo, stats[3], stats[2], chart, list — and so did the other six, each invented by a
// different worker because there was nothing to build ONTO. Seven emails from one agent
// that looked like seven different companies.
//
// The shape now comes from ONE place: `buildLifecycleEmail` (lib/email/lifecycle-chrome.ts).
//
//   header · RIBBON · photo · hero(centred: address over price) · spec strip
//          · [MY MIDDLE: the comps chart + the evidence table] · narrative
//          · [MY TAIL: the sources] · agent card · CTA · footer
//
// What is MINE is the ribbon word ("Market Comps"), which cells ride the strip, the
// chart, the table, the sources and the CTA. THE SHAPE IS NOT MINE TO CHANGE. Enforced
// by campaign-coherence.test.ts.
//
// The five answers that ARE still mine (playbook Part 6):
//
//   1. SUBJECT — the same resolved house as New Listing. The dispatcher resolved it
//      (resolveSubject); we never resolve twice. What is DIFFERENT here is that the
//      subject's own list price is the CLAIM the email defends — so no price, no
//      argument (we still ship the grid; the case just becomes an open slot).
//   2. CELLS — the strip carries the TERMS OF THE COMPARISON, not a wall of stat rows:
//        beds · baths · sq ft · $/sq ft THIS HOME (primary — it wins the argument)
//        · $/sq ft COMP MEDIAN · the comp count (muted)
//      The footnote under the strip states the derivation, the MIX and the spread.
//      Every value is code-computed from the live comp set. Unsourced → open slot.
//   3. CHART — comps-bar, and the SUBJECT IS ITS OWN BAR (we hold its list price;
//      the chat comp lane omits a subject bar only because ITS subject has no price —
//      that reasoning does not transfer, so do not cargo-cult it here).
//   4. PROSE — the straight case for the asking price. This recipe deliberately does
//      NOT use `authorListingNarrative`: that narrator is told "THIS EMAIL IS ABOUT
//      THE HOUSE, not the market, not the comps… do not turn this into a market
//      analysis", which is exactly the email we are writing. It would refuse the job.
//      Ours permits the price argument and keeps every no-invention guardrail.
//   5. CTA — "Talk Through These Numbers". The next action, never a pointer back at the
//      comps the reader is already looking at.
//
// ── THE HARD RULE, LEARNED THE HARD WAY ──────────────────────────────────────
// *** A COMP MUST HAVE beds AND sqft, OR IT IS A VACANT LOT. ***
// The nearby set mixes bare land in with homes. Verified live 07/13/2026: `315 Shore
// Dr` comes back with beds:null, baths:null, sqft:null and a $139,800 valuation.
// Charting a $139.8k lot against a 2,847 sq ft house makes the ask look like a bargain
// for a fake reason — and the narrator, reading its own chart, then wrote a sentence
// on that misreading. FILTER BY DATA, NEVER BY GUESSING AT THE NAME (the lot's name is
// "315 Shore Dr" — it looks exactly like its neighbors).
//
// ── THE OTHER HONESTY PROBLEM: NOT EVERY COMP IS A SALE ───────────────────────
// `compsForAddress` tags each price: a recorded `sold`, a realtor.com `estimate`
// (AVM), or a `last_list`. On the live fixture only 2 of 5 real homes are recorded
// sales; the rest are current valuations. Every number is sourced — so this constrains
// the PROSE, it never blocks the build. The registry prompt no longer promises "six
// LIVE comparable listings" (it never had six live listings to give), and the MIX is
// now stated on FOUR surfaces the reader cannot miss: the chart bar suffix "(est.)"
// (buildSoldCompsSpec), the evidence table's TITLE, each row's own "Sold 08/29/2025" /
// "Estimated value 06/08/2026" line, and the stat cell's label. The narrator is handed
// the mix as a SETTLED COUNT — it never counts anything itself.
//
// ── THE CLAIM GATE (lib/deliverable/claims.ts) — WIRED HERE ───────────────────
// This recipe is the reason claims.ts exists. It shipped, to a rendered artifact, a
// comparison that was INVERTED (see the guard block above `buildPriceCase`). The fix is
// structural and it is greppable:
//
//   `buildNarratorPrompt(facts, pc)` DOES NOT TAKE THE COMP ARRAY. It cannot. There is
//   no `RenderComp` in its signature, so there is no raw comp set for it to serialize,
//   so the model is never handed two comp numbers to draw a third claim between. The old
//   version passed `compLines` — every comp's address, price, sq ft and $/sq ft — and
//   then asked the model, politely, not to compare them. It compared them.
//
// Every relation is computed in code (`compareToSet`, `settledCount`, `buildPriceCase`)
// and handed over as a SETTLED ENGLISH SENTENCE. `auditClaims` is the fail-closed
// backstop underneath: any violation and the narrator's paragraph is DROPPED to an open
// slot — the code-authored verdict still ships, because it is true by construction.

import { compSources, compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { formatSoldSpell } from "@/lib/listings/dom";
import {
  auditClaims,
  CLAIM_PROHIBITION,
  compareToSet,
  numeralsIn,
  settledCount,
  type SettledClaim,
} from "@/lib/deliverable/claims";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { createBlock } from "@/lib/email/doc/default-docs";
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import { addressLineOf, pricePerSqft, spec } from "@/lib/email/listing-flyer";
import { buildSoldCompsSpec } from "@/lib/email/sold-comp-blocks";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
} from "@/lib/deliverable/chart-coherence";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
import {
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
  FAVORABLE_FRAMING_POLICY,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { EmailBlock, EmailDoc, ListItem, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** How many comparable HOMES the email shows. The registry prompt says six; if the
 *  block only yields five real homes we ship five — a count is sourced like any other
 *  fact, and manufacturing a sixth to satisfy a sentence is invention. */
const MAX_COMPS = 6;

/** Pull more than we show, because the land filter below will eat some of them. The
 *  nearby fetch is ONE vendor call whose page we already paid for (limit 25), and the
 *  sold-event enrichment is capped at 2 regardless of topN — so this widens the net
 *  for free. Verified live 07/13/2026: 12 nearby → 11 homes + 1 vacant lot. */
const COMP_POOL = 12;

/** A comp is a HOME iff the vendor gave us beds AND sqft AND a price. Anything else is
 *  bare land (or unpriced) and can never sit on a chart beside a house. THIS FILTER IS
 *  THE RECIPE'S LOAD-BEARING RULE — see the header. */
function isComparableHome(c: RenderComp): boolean {
  return c.beds != null && c.sqft != null && c.sqft > 0 && c.price != null && c.price > 0;
}

/** Price ÷ square feet, rounded. Null unless BOTH parts are real (never back-solved). */
function perSqft(price: number | null, sqft: number | null): number | null {
  if (price == null || sqft == null || sqft <= 0) return null;
  const v = Math.round(price / sqft);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Parse a verbatim vendor string ("$595,000", "2847") to a number. 0 → null. */
function num(s?: string): number | null {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** "2026-06-08" → "06/08/2026" (house rule: MM/DD/YYYY, never the raw token). */
function mdy(iso: string | null): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

/** The median of a numeric set. Even count → the mean of the two middle values. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** What the price actually IS — never dressed as a sale it was not. The chat lane's
 *  own vocabulary ("sold … on", "estimated value", "last listed"), kept honest.
 *  A recorded sale with a known spell adds "· sold in N days" (code-computed off the
 *  same vendor response — spec 2026-07-16-listing-dom-design.md §4). */
function priceKindPhrase(c: RenderComp): string {
  if (c.priceKind === "sold") {
    const d = mdy(c.priceDate);
    const spell = formatSoldSpell(c.soldInDays);
    const base = d ? `Sold ${d}` : "Sold";
    return spell ? `${base} · ${spell}` : base;
  }
  if (c.priceKind === "estimate") {
    const d = mdy(c.priceDate);
    return d ? `Estimated value ${d}` : "Estimated value";
  }
  return "Last listed";
}

/** One evidence row: "$385,000 · $195/sq ft" over "336 Shore Dr Lot 58 · 3 bd ·
 *  1,976 sq ft · Sold 05/23/2025", click-through to the comp's captured page.
 *
 *  NOTE (copy #2 watch): `soldCompsListBlock` (sold-comp-blocks.ts) builds the OTHER
 *  comp row — price + date, no $/sq ft — for the "Recent sales nearby" context list.
 *  This one is the evidence table: $/sq ft is the whole argument, so it must be on the
 *  row. Two different rows for two different jobs. If R5 (Just Sold) ends up needing
 *  THIS row too, that is copy #2 and it should be extracted into sold-comp-blocks.ts. */
function compRow(c: RenderComp): ListItem {
  const ppsf = perSqft(c.price, c.sqft);
  const lead = [usd(c.price as number), ppsf ? `${usd(ppsf)}/sq ft` : ""]
    .filter(Boolean)
    .join(" · ");
  const text = [
    c.addressLine,
    c.beds != null ? `${c.beds} bd` : "",
    c.sqft != null ? `${c.sqft.toLocaleString("en-US")} sq ft` : "",
    priceKindPhrase(c),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    lead: lead.slice(0, 40),
    text: text.slice(0, 200),
    ...(c.sourceUrl ? { linkUrl: c.sourceUrl } : {}),
  };
}

/** "(2 recorded sales, 3 valuations)" — THE MIX. The registry prompt used to promise
 *  "six LIVE comparable listings" and the set is nothing of the kind: it is recorded
 *  sales plus current valuations. So the mix is stated on the FACE of the email, in the
 *  stat cell AND on the evidence table's own title, and a reader can never mistake an
 *  AVM for a sale. Singular/plural handled; a zero side is simply not mentioned. */
function mixParen(comps: RenderComp[]): string {
  const sold = comps.filter((c) => c.priceKind === "sold").length;
  const rest = comps.length - sold;
  const parts = [
    sold ? `${sold} recorded ${sold === 1 ? "sale" : "sales"}` : "",
    rest ? `${rest} ${rest === 1 ? "valuation" : "valuations"}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** The evidence table's title — the mix again, where the rows actually are. */
function mixTitle(comps: RenderComp[]): string {
  return `The comparable homes${mixParen(comps)}`;
}

/** Every comp's $/sq ft, ascending. The set this whole email argues over. */
function compPpsfs(comps: RenderComp[]): number[] {
  return comps
    .map((c) => perSqft(c.price, c.sqft))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
}

/**
 * THE SPEC STRIP — the campaign's one hairline row, carrying THE TERMS OF THE COMPARISON.
 *
 * This used to be TWO chunky stat grids stacked on each other (row A: the subject; row B:
 * the evidence) — a wall, and a shape no other email in the campaign wore. The strip is
 * the campaign's, so the comps email says the same things in the same row: the subject's
 * spec line, then the ONE number that wins the argument, then the set it is judged against.
 *
 *   $/Sq Ft — this home  is `primary`: it IS the claim, and it renders in the accent.
 *   Comparable homes     is `muted`: it is the scale of the evidence, not the evidence.
 *
 * An unsourced value is "" — an OPEN SLOT on the canvas (the label is the instruction)
 * and ABSENT from the sent email. Never a zero, never a made-up median.
 */
export function compsSpecs(facts: ListingFacts, comps: RenderComp[]): StatItem[] {
  const medianPpsf = median(compPpsfs(comps));
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(num(facts.sqft)?.toLocaleString("en-US"), "Sq Ft"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft — this home", "primary"),
    spec(medianPpsf ? usd(medianPpsf) : undefined, "$/Sq Ft — comp median"),
    spec(comps.length ? String(comps.length) : undefined, "Comparable homes", "muted"),
  ];
}

/**
 * THE FOOTNOTE UNDER THE STRIP — the derivation, THE MIX, and the spread.
 *
 * The mix used to ride in a stat LABEL ("Comparable homes (2 recorded sales, 3
 * valuations)"). A grid cell could carry 48 characters; a STRIP cell is a 9px uppercase
 * caption in a sixth of the email's width, and that label would have wrapped to five
 * ragged lines and dragged the whole strip out of shape. The footnote is the element the
 * strip already has for exactly this — full width, centred, under the row.
 *
 * So the mix is STILL on the face of the email, on four surfaces a reader cannot miss:
 * here, the evidence table's own title, each row's "Sold 08/29/2025" / "Estimated value
 * 06/08/2026" line, and the chart's "(est.)" bar suffix.
 *
 * Never truncated mid-number: the schema caps a footnote at 120 characters, so we pick
 * the longest CANDIDATE that fits rather than slicing a "$173–$266" in half.
 */
export function compsFootnote(facts: ListingFacts, comps: RenderComp[]): string | undefined {
  const derived = pricePerSqft(facts.price, facts.sqft) ? "*$/Sq Ft = price ÷ listed sq ft." : "";

  const ppsf = compPpsfs(comps);
  const lo = ppsf[0];
  const hi = ppsf[ppsf.length - 1];
  const range = !ppsf.length
    ? ""
    : lo === hi
      ? ` run at ${usd(lo)}`
      : ` run from ${usd(lo)} to ${usd(hi)}`;
  const homes = comps.length === 1 ? "home" : "homes";
  const mix = comps.length
    ? `The ${comps.length} comparable ${homes}${mixParen(comps)}${range}.`
    : "";

  const full = [derived, mix].filter(Boolean).join(" ");
  // Longest-that-fits, in order of what a reader loses least by losing.
  for (const candidate of [full, mix, derived]) {
    if (candidate && candidate.length <= 120) return candidate;
  }
  return undefined;
}

/** A block and the row height it wants. WHERE it lands is the seam's call, never ours. */
function sized(block: Omit<EmailBlock, "layout">, h: number): ChromeBlock {
  return { block, height: h };
}

/**
 * MY MIDDLE — the comps bar chart and the evidence table. This is the ONE place the
 * campaign's emails legitimately differ, and it is the whole reason this email exists.
 *
 * The chart slot is reserved EMPTY and filled in place below (or dropped — an empty chart
 * box is worse than no chart). The table is omitted entirely when there is nothing real to
 * list: a `list` needs >= 1 row, and an empty shell is not a slot, it is a lie.
 */
function compsMiddle(comps: RenderComp[]): ChromeBlock[] {
  const blocks: ChromeBlock[] = [
    sized(
      {
        id: createBlock("image").id,
        type: "image",
        props: {
          url: "",
          kind: "chart",
          alt: "Asking price vs nearby comparable homes",
          caption: "",
        },
      },
      6,
    ),
  ];
  if (comps.length) {
    blocks.push(
      sized(
        {
          id: createBlock("list").id,
          type: "list",
          props: { title: mixTitle(comps), items: comps.map(compRow) },
        },
        Math.max(4, comps.length + 2),
      ),
    );
  }
  return blocks;
}

/** MY TAIL — the collapsed sources accordion. Rules of engagement #1: sources ride in the
 *  collapsed list, never inline in the prose. Domain-level, never a vendor name, never an
 *  MLS id. Empty comp set → no citation to make, so no block. */
function compsTail(comps: RenderComp[]): ChromeBlock[] {
  const sources = compSources({ comps, asOf: "", needs: [] });
  if (!sources.length) return [];
  return [
    sized(
      {
        id: createBlock("sources").id,
        type: "sources",
        props: {
          sources: sources.map((s) => ({ label: s.label, url: s.url })),
          note: "Comparable homes near the subject, pulled live. Not adjusted for condition.",
        },
      },
      3,
    ),
  ];
}

/**
 * THE COMPS EMAIL, WEARING THE CAMPAIGN'S CHROME.
 *
 * Pure: no I/O, invents nothing. The SHAPE comes from `buildLifecycleEmail` and is not
 * mine; the ribbon word, the cells, the middle, the tail and the CTA are. Brand is STICKY
 * — the chrome lifts the agent's header, agent card, footer and colours off the canvas,
 * so a comps email arriving three weeks after the New Listing is visibly the same sender.
 */
export function buildCompsGrid(
  facts: ListingFacts,
  comps: RenderComp[],
  current: EmailDoc,
): EmailDoc {
  return buildLifecycleEmail(current, {
    ribbon: "Market Comps",
    // The subject's photo — it identifies the house whose price is on trial. No photo →
    // a canvas dropzone, absent from the sent email (the open-slot contract).
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: facts.address ?? "The subject property",
          linkUrl: facts.sourceUrl,
        }
      : null,
    // The hero is the CLAIM this email defends: the ask, on this address.
    heroValue: facts.price ?? "",
    heroLabel: addressLineOf(facts),
    specs: compsSpecs(facts, comps),
    specFootnote: compsFootnote(facts, comps),
    middle: compsMiddle(comps),
    // EMPTY — the narrator fills it (fillNarrative). Unwritten → an open slot.
    narrative: "",
    tail: compsTail(comps),
    // The ask of a comps email is a CONVERSATION about the number, not a tour — and never
    // a pointer back at the comps the reader is already looking at.
    ctaLabel: "Talk Through These Numbers",
    ctaUrl: facts.sourceUrl,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DIRECTIONAL GUARD — why every line below this exists.
//
// This recipe SHIPPED, to the rendered artifact, the sentence:
//
//   "At $209 per square foot, the asking price for 326 Shore Dr sits just below the
//    $213 median … — and below the two recorded sales on Shore Dr, which closed at
//    $173 and $195 per square foot."
//
// $209 is ABOVE $195 and ABOVE $173. The central argument of a price-defense email
// was INVERTED — it told the recipient the ask was under the recorded sales when it
// was 7% and 21% OVER them. Same paragraph: "the subject falls at the low end of that
// band" when $209 sits BELOW a $210–$266 band entirely. Every underlying number was
// correctly sourced. The FALSEHOOD was the comparison drawn between them.
//
// *** A COMPARISON IS A FACTUAL CLAIM, AND THE NARRATOR DOES NOT GET TO MAKE ONE. ***
//
// A stronger prompt is not the fix — the old prompt already said "if the ask sits above
// the set, do not hide it", and the model hid it by asserting the opposite. The fix is
// structural, in three parts:
//
//   1. COMPUTE  — `buildPriceCase` derives every relation (vs the median, vs the
//      recorded sales, position in the set, largest-home) in deterministic code and
//      composes the comparative sentences ITSELF. That text is the `verdict`.
//   2. HAND OVER THE RESULT — the narrator is given the verdict as a settled fact and
//      writes only the CONTEXT around it. It never sees a comparison to make.
//   3. LINT — `contextViolations` rejects the narrator's paragraph if it contains any
//      comparative token at all (they are enumerated, and the model is handed the same
//      list) or any number we did not source. A violation DROPS the context and ships
//      the code-authored verdict alone: fail-closed, so the guard can cost prose but it
//      can never cost truth.
//
// If the comparison cannot be computed (no ask, no square footage, no comps), the
// paragraph does not ship at all — the slot stays OPEN. The refutation's rule: "If you
// cannot compute a defensible comparison, the sentence does not ship."
// ─────────────────────────────────────────────────────────────────────────────

/** Where the subject sits against a referent. Exact integer compare on the two rounded
 *  $/sq ft figures — no invented tolerance band, because a tolerance is a judgment and
 *  judgment is where a false comparison hides. */
export type Direction = "above" | "below" | "level";

export interface PriceCase {
  subjectPpsf: number;
  medianPpsf: number;
  /** How many comps carry a real $/sq ft (the set the math is over). */
  n: number;
  vsMedian: { dir: Direction; diff: number };
  /** The recorded sales' $/sq ft, ascending. Valuations are NOT in here. */
  soldPpsf: number[];
  /** null when the set holds no recorded sale. "within" = strictly inside their spread. */
  vsSold: Direction | "within" | null;
  lowerCount: number;
  higherCount: number;
  levelCount: number;
  /** THE MIX, counted in code. The narrator never counts — it is handed the count. */
  soldCount: number;
  estCount: number;
  subjectIsLargest: boolean;
  /** The comparative sentences, AUTHORED IN CODE. The only comparison this email makes. */
  verdict: string;
  /** The verdict, sentence by sentence, as SETTLED CLAIMS (claims.ts). This is the ONLY
   *  channel by which a relation reaches the narrator: as a finished English sentence
   *  with its numerals as the anchor allow-set. `auditClaims` checks the narrator's
   *  prose against exactly these. */
  claims: SettledClaim[];
}

/** "$173 and $195" · "$173, $195 and $210" */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * THE COMPARISON, COMPUTED. Pure, offline, no LLM anywhere near it.
 *
 * Returns null when there is no defensible comparison to make — no ask, no square
 * footage on the subject, or no comp with a real $/sq ft. Null → the prose slot stays
 * an OPEN SLOT. We do not fall back to comparing total prices across different-sized
 * houses; that comparison is not defensible, so it is not made.
 */
export function buildPriceCase(facts: ListingFacts, comps: RenderComp[]): PriceCase | null {
  const subjectPpsf = perSqft(num(facts.price), num(facts.sqft));
  const priced = comps
    .map((c) => ({ c, ppsf: perSqft(c.price, c.sqft) }))
    .filter((x): x is { c: RenderComp; ppsf: number } => x.ppsf != null);
  const medianPpsf = median(priced.map((x) => x.ppsf));
  if (subjectPpsf == null || medianPpsf == null || priced.length === 0) return null;

  const n = priced.length;
  const dirOf = (a: number, b: number): Direction =>
    a === b ? "level" : a > b ? "above" : "below";

  const vsMedian = {
    dir: dirOf(subjectPpsf, medianPpsf),
    diff: Math.abs(subjectPpsf - medianPpsf),
  };

  // THE SALES ARE THEIR OWN QUESTION. A recorded sale is evidence; a valuation is an
  // opinion. The sentence that got this backwards was about the SALES, so they get
  // their own computed relation rather than being folded into the set.
  const soldPpsf = priced
    .filter((x) => x.c.priceKind === "sold")
    .map((x) => x.ppsf)
    .sort((a, b) => a - b);
  let vsSold: PriceCase["vsSold"] = null;
  if (soldPpsf.length) {
    const lo = soldPpsf[0];
    const hi = soldPpsf[soldPpsf.length - 1];
    vsSold =
      subjectPpsf > hi
        ? "above"
        : subjectPpsf < lo
          ? "below"
          : soldPpsf.every((v) => v === subjectPpsf)
            ? "level"
            : "within";
  }

  // POSITION IN THE SET — `compareToSet` (claims.ts) OWNS this relation. It takes the
  // subject and the set of integers and returns the settled English sentence; there is no
  // model anywhere near it and no room for one. This is what kills the "falls at the low
  // end of that band" class of error — the shipped lie said exactly that while $209 sat
  // BELOW a $210–$266 band entirely. We state the true position instead of characterizing it.
  const setClaim = compareToSet(
    subjectPpsf,
    priced.map((x) => x.ppsf),
    { unit: "usd", noun: "asking price per square foot" },
  );
  const lowerCount = priced.filter((x) => x.ppsf < subjectPpsf).length;
  const higherCount = priced.filter((x) => x.ppsf > subjectPpsf).length;
  const levelCount = n - lowerCount - higherCount;

  const soldCount = priced.filter((x) => x.c.priceKind === "sold").length;
  const estCount = n - soldCount;

  const subjSqft = num(facts.sqft);
  const subjectIsLargest =
    subjSqft != null && priced.every((x) => x.c.sqft != null && x.c.sqft < subjSqft);

  // ── THE VERDICT. Composed here, from the relations above. Every clause is a
  //    deterministic read of two sourced numbers; none of it is a characterization.
  const homes = `${n} comparable ${n === 1 ? "home" : "homes"}`;
  const addr = facts.address?.split(",")[0]?.trim();
  const forAddr = addr ? ` for ${addr}` : "";

  // MAGNITUDE TIER — direction-symmetric. An extreme gap (the subject sits strictly beyond
  // the full spread of the set — genuinely below every comp, or genuinely above every comp)
  // states its size plainly and directly rather than the same flat "sits $X above/below"
  // wording used for a marginal gap. Fires IDENTICALLY whichever way the number points —
  // this recipe exists to defend a price that can legitimately sit on either side of the
  // comps, and a tier that only sharpens language in the flattering direction is spin, not
  // honesty. See docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md §4a.
  //
  // FIX (task-5 review, Critical finding): an earlier version of this formula ALSO fired on
  // `diff / medianPpsf >= 0.4` (a percentage-of-median gap), independent of range membership.
  // That's not a range check — it can be (and was, in a reproduced case) true while the
  // subject sits strictly INSIDE [min(allPpsf), max(allPpsf)], which made the "entire range"
  // sentence below assert a falsehood that directly contradicted the very next sentence
  // (vsSold/compareToSet correctly saying the subject falls WITHIN the range). Removed —
  // isExtreme must be true ONLY when subjectPpsf is provably outside
  // [min(allPpsf), max(allPpsf)]; a large percentage gap that's still inside the range falls
  // through to the plain, always-true "sits $X above/below the median" sentence in the
  // `else` branch below, which is honest either way.
  const allPpsf = priced.map((x) => x.ppsf);
  const isExtreme =
    (vsMedian.dir === "below" && subjectPpsf < Math.min(...allPpsf)) ||
    (vsMedian.dir === "above" && subjectPpsf > Math.max(...allPpsf));
  const s1 =
    vsMedian.dir === "level"
      ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} is level with the ` +
        `${usd(medianPpsf)} median across the ${homes} nearby.`
      : isExtreme
        ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
          `${usd(vsMedian.diff)} ${vsMedian.dir} every comparable home in the set — not just ` +
          `the ${usd(medianPpsf)} median, the entire range.`
        : `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
          `${usd(vsMedian.diff)} ${vsMedian.dir} the ${usd(medianPpsf)} median across the ` +
          `${homes} nearby.`;

  const sentences = [s1];

  if (vsSold && soldPpsf.length) {
    const list = `${joinAnd(soldPpsf.map((v) => usd(v)))} per square foot`;
    const noun =
      soldPpsf.length === 1
        ? "the one recorded sale in the set"
        : soldPpsf.length === 2
          ? "both recorded sales in the set"
          : `all ${soldPpsf.length} recorded sales in the set`;
    sentences.push(
      vsSold === "within"
        ? `That falls within the recorded sales in the set (${list}).`
        : vsSold === "level"
          ? `That matches ${noun} (${list}).`
          : `That is ${vsSold} ${noun} (${list}).`,
    );
  }

  // The position sentence is compareToSet's, verbatim — a shared, tested, code-owned
  // comparison. It never comes from here and it never comes from the model.
  if (setClaim) sentences.push(setClaim.sentence);

  if (subjectIsLargest && subjSqft != null) {
    sentences.push(
      `At ${subjSqft.toLocaleString("en-US")} square feet, it is the largest home in the set.`,
    );
  }

  return {
    subjectPpsf,
    medianPpsf,
    n,
    vsMedian,
    soldPpsf,
    vsSold,
    lowerCount,
    higherCount,
    levelCount,
    soldCount,
    estCount,
    subjectIsLargest,
    verdict: sentences.join(" "),
    // EVERY verdict sentence is a settled claim. `auditClaims` skips a sentence the
    // narrator restates verbatim from here, and allows exactly the numerals these carry.
    claims: sentences.map((s) => ({ sentence: s, anchors: numeralsIn(s) })),
  };
}

/**
 * EVERYTHING THE NARRATOR IS ALLOWED TO KNOW — as settled sentences, and nothing else.
 *
 * NOTE THE SIGNATURE: it takes the PriceCase, NOT the comps. There is no `RenderComp`
 * here, so there is no raw comp set to serialize, so the model is never handed two comp
 * numbers to draw a third claim between. That is the whole defense. The old version
 * passed every comp's address, price, sq ft and $/sq ft and then asked the model not to
 * compare them — and it compared them, backwards, into a shipped artifact.
 *
 * The returned list is BOTH the model's fact sheet AND the audit's allow-set: a numeral
 * the narrator writes that appears in none of these sentences was invented, full stop.
 */
/**
 * THE MIX AND THE CAVEAT — counted in code (`settledCount`), and PRINTED. Not handed to
 * the narrator to say, because saying it REQUIRES A COUNT and a count is exactly what the
 * narrator may not do. market-pulse's narrator wrote "five of those six ZIPs" over a set
 * whose true answer was four; a word-count carries no digits, so a digit lint sails
 * straight past it.
 *
 * Caught live on the first run of this rebuild: handed the mix as a fact and asked what
 * the evidence IS, the model wrote "Four of the six figures… the two recorded sales…" — a
 * word-count of its own, dropped by the gate, taking a true paragraph down with it. The
 * fault was the DESIGN, not the model: the mix belonged in the printed sentence all along.
 * If a fact can only be stated as a count, CODE STATES IT.
 */
export function mixClaims(pc: PriceCase): SettledClaim[] {
  const noun = "comparable homes";
  const mix =
    pc.estCount === 0
      ? settledCount(pc.soldCount, pc.n, { noun, predicate: "are recorded sales" })
      : pc.soldCount === 0
        ? settledCount(pc.estCount, pc.n, {
            noun,
            predicate: "are current valuations — estimates, not sales",
          })
        : settledCount(pc.soldCount, pc.n, {
            noun,
            predicate: "are recorded sales; the rest are current valuations — estimates, not sales",
          });
  return [mix, { sentence: `None of it is adjusted for condition.`, anchors: [] }];
}

/** The COMPLETE code-authored paragraph: every comparison, the mix, the caveat. True by
 *  construction, and it ships whether or not the narrator's sentences survive the gate. */
export function evidenceParagraph(pc: PriceCase): string {
  return [pc.verdict, ...mixClaims(pc).map((c) => c.sentence)].join(" ");
}

export function narratorClaims(facts: ListingFacts, pc: PriceCase): SettledClaim[] {
  const claim = (sentence: string): SettledClaim => ({ sentence, anchors: numeralsIn(sentence) });
  const out: SettledClaim[] = [...pc.claims, ...mixClaims(pc)];

  // The SUBJECT's own record — scalars, each one a fact on its own, none of them a set.
  if (facts.price) out.push(claim(`The asking price is ${facts.price}.`));
  const spec = [
    facts.beds && `${facts.beds} bedrooms`,
    facts.baths && `${facts.baths} bathrooms`,
    num(facts.sqft) && `${num(facts.sqft)!.toLocaleString("en-US")} square feet`,
    facts.lotSize && `a ${facts.lotSize} lot`,
  ].filter(Boolean);
  if (spec.length) out.push(claim(`The home has ${joinAnd(spec as string[])}.`));
  if (facts.yearBuilt) out.push(claim(`The home was built in ${facts.yearBuilt}.`));
  if (facts.isNewConstruction) {
    out.push(claim(`The home is new construction, per the listing record.`));
  }
  if (facts.isPriceReduced && facts.priceReduction) {
    out.push(
      // ⚠️ NOT "from the original". `reduced_amount` is the MOST RECENT cut — the vendor's
      // price history for the fixture runs $765,000 → $699,975 → $595,000, so $104,975 is the
      // LAST cut, and the cut from the ORIGINAL ask is $170,000. Saying "from the original"
      // understates it by $65,025 and implies an original ask the house never had at listing.
      // A real number wearing the name of a quantity we do not hold is still invented.
      // (Playbook Part 8.5. The true original IS sourceable — /property-tax-history.)
      claim(`The asking price has already come down by ${facts.priceReduction}.`),
    );
  }
  return out;
}

/**
 * THE BANNED VOCABULARY. Every word here is a way to place one magnitude against
 * another, or to claim a location we were never given. The code has already made every
 * comparison this email makes — so the narrator has no legitimate use for any of them,
 * and a hit means it drew a comparison of its own.
 *
 * The SAME list is printed into the system prompt, so the model is told exactly what it
 * may not say. Bare "than" is deliberate: it is the catch-all that closes every
 * "<anything>-er than" construction I could not enumerate. It costs the model "rather
 * than", and that is a trade I will make every time.
 *
 * Locational terms are here for the third, smaller lie in the same paragraph: the model
 * called 141 and 143 Coral Dr "comparable homes on the same street" as 326 Shore Dr.
 * We are handed no location for a comp beyond "nearby". So "nearby" is all it may say.
 */
export const BANNED_CONTEXT_PHRASES: readonly string[] = [
  // Comparatives + superlatives.
  "than",
  "above",
  "below",
  "under",
  "over",
  "beneath",
  "higher",
  "lower",
  "highest",
  "lowest",
  "larger",
  "largest",
  "bigger",
  "biggest",
  "smaller",
  "smallest",
  "cheaper",
  "cheapest",
  "pricier",
  "priciest",
  "exceeds",
  "exceed",
  "outpaces",
  "outstrips",
  "surpasses",
  "eclipses",
  "dwarfs",
  "trails",
  "undercuts",
  "tops",
  "beats",
  "in line with",
  "on par",
  "low end",
  "high end",
  "midpoint",
  "median",
  "range",
  "premium",
  "discount",
  "bargain",
  "steal",
  "underpriced",
  "overpriced",
  "competitive",
  "aligns",
  "consistent with",
  "compares",
  "compared",
  "versus",
  "relative to",
  "matches",
  // Locational claims — we hold no comp's location beyond "nearby".
  "neighborhood",
  "community",
  "subdivision",
  "block",
  "next door",
  // ...and NO STREET NAME, EVER. The shipped lie said the comps were "on Shore Dr" and
  // "on the same street" — 141 and 143 Coral Dr are neither. The word "street" alone
  // does not catch "Shore Dr", so the SUFFIXES are banned outright: the narrator may
  // not name a road at all. (The code-authored verdict names the subject's street and
  // is never linted — it reads the address off the record.)
  "dr",
  "drive",
  "st",
  "street",
  "ave",
  "avenue",
  "blvd",
  "boulevard",
  "ln",
  "lane",
  "ct",
  "court",
  "rd",
  "road",
  "pkwy",
  "parkway",
  "cir",
  "circle",
  "ter",
  "terrace",
];

/** Every number we actually hold, as bare digit strings. A numeric token in the
 *  narrator's context that is not in here was invented, full stop. */
function sourcedDigits(facts: ListingFacts, comps: RenderComp[], pc: PriceCase): Set<string> {
  const out = new Set<string>();
  const add = (v: string | number | null | undefined) => {
    const d = String(v ?? "").replace(/\D/g, "");
    if (d) out.add(d);
  };
  add(facts.price);
  add(facts.sqft);
  add(facts.beds);
  add(facts.baths);
  add(facts.lotSize);
  add(facts.priceReduction);
  add(facts.yearBuilt);
  add(facts.zip);
  for (const c of comps) {
    add(c.price);
    add(c.sqft);
    add(c.beds);
    add(c.baths);
    add(perSqft(c.price, c.sqft));
    add(mdy(c.priceDate));
  }
  add(pc.subjectPpsf);
  add(pc.medianPpsf);
  add(pc.vsMedian.diff);
  add(pc.n);
  add(pc.lowerCount);
  add(pc.higherCount);
  add(pc.levelCount);
  for (const v of pc.soldPpsf) add(v);
  return out;
}

/**
 * THE LINT. Runs on the NARRATOR'S CONTEXT ONLY — never on the code-authored verdict,
 * which legitimately says "above" and "below" because it computed them.
 *
 * Returns the violations. A non-empty result DROPS the context: the email then ships the
 * verdict alone, which is a complete and provably-true paragraph. Fail-closed by design —
 * an over-strict lint costs a sentence of colour; an under-strict one ships a lie.
 */
export function contextViolations(
  text: string,
  facts: ListingFacts,
  comps: RenderComp[],
  pc: PriceCase,
): string[] {
  const hits: string[] = [];
  const lower = text.toLowerCase();

  for (const phrase of BANNED_CONTEXT_PHRASES) {
    // Word-boundary match, so "over" does not fire on "discover" and "block" does not
    // fire on "blocked".
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) hits.push(`comparative/location term: "${phrase}"`);
  }

  // A DATE IS ONE TOKEN, NOT THREE. Caught live: the narrator correctly wrote "$300,000
  // closed 08/29/2025" — a real, sourced sale date — and the number scanner shredded it
  // into "08", "29" and "2025" and rejected all three. So dates are checked WHOLE against
  // the dates we actually hold (house format MM/DD/YYYY), then lifted out of the text
  // before the number scan.
  const sourcedDates = new Set(
    comps.map((c) => mdy(c.priceDate)).filter((d): d is string => Boolean(d)),
  );
  const DATE = /\b\d{2}\/\d{2}\/\d{4}\b/g;
  for (const d of text.match(DATE) ?? []) {
    if (!sourcedDates.has(d)) hits.push(`unsourced date: "${d}"`);
  }

  // A numeric token is `$595,000` / `2,847` / `0.26` — a trailing sentence period is NOT
  // part of it (`[\d,.]*` greedily ate the full stop and reported `"$450,000."`).
  const allowed = sourcedDigits(facts, comps, pc);
  for (const tok of text.replace(DATE, " ").match(/\$?\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const digits = tok.replace(/\D/g, "");
    if (digits && !allowed.has(digits)) hits.push(`unsourced number: "${tok}"`);
  }

  return hits;
}

/**
 * The price case — the code-authored comparison, plus ONE constrained call for the
 * context around it.
 *
 * NOT `authorListingNarrative`. That narrator's system prompt says "THIS EMAIL IS ABOUT
 * THE HOUSE. Not the market, not the comps… do not turn this into a market analysis",
 * and it takes comps as "Background context (NOT the subject of this email)". Pointed at
 * a comps email it would refuse the only job there is. So this recipe carries its own —
 * with the comparison ALREADY MADE and the model forbidden from making another.
 *
 * Never invents. No computable comparison → null, and the slot stays an OPEN SLOT.
 */
export function buildNarratorPrompt(
  facts: ListingFacts,
  pc: PriceCase,
): { system: string; user: string; settled: SettledClaim[] } {
  const settled = narratorClaims(facts, pc);

  const system =
    `You write the CONTEXT sentences of a real-estate MARKET COMPS email — the one an ` +
    `agent sends to make the case that the asking price is right. Two or three sentences. ` +
    `Plain, confident, specific.\n\n` +
    // THE PROHIBITION, VERBATIM FROM THE GATE. The model is told the exact rule the lint
    // enforces, so a violation is a refusal to follow an explicit instruction rather than
    // a surprise. Keep this line — it is the contract between the prompt and auditClaims.
    `${CLAIM_PROHIBITION}\n\n` +
    `*** THE COMPARISON IS ALREADY WRITTEN AND YOU DO NOT GET TO MAKE ANOTHER ONE. ***\n` +
    `It was computed from the records — not by you — and it is printed IMMEDIATELY BEFORE ` +
    `your sentences, in the same paragraph. Do not restate it, do not re-derive it, do not ` +
    `soften it, do not contradict it.\n\n` +
    `THESE WORDS ARE FORBIDDEN. Using any of them, in any form, voids your paragraph:\n` +
    BANNED_CONTEXT_PHRASES.map((p) => `"${p}"`).join(", ") +
    `.\nThat list includes the bare word "than", and it means EVERY use of it — "rather ` +
    `than" and "other than" void the paragraph exactly like "higher than" does. If a ` +
    `sentence wants "than", rewrite the sentence without it: "estimates rather than sales" ` +
    `becomes "estimates, not sales". Every one of these words is a way of placing one thing ` +
    `against another, and the code has already done that.\n\n` +
    `YOUR JOB IS NARROW, AND IT IS THE ONE THING THE PRINTED SENTENCES CANNOT DO: say WHAT ` +
    `THIS HOME IS. New construction. The lot. A price that has already come down. Then ` +
    `close by inviting the reader to talk it through.\n\n` +
    `WHAT IS ALREADY PRINTED, AND WHICH YOU MUST NOT REPEAT: every comparison, the make-up ` +
    `of the evidence (how many are recorded sales, how many are current valuations), and ` +
    `the fact that none of it is adjusted for condition. All of that is stated for you, ` +
    `directly above your sentences. Do not restate it and do not count anything — a count ` +
    `is a factual claim, it is already made, and if you make one of your own your paragraph ` +
    `is voided even when it happens to be right.\n\n` +
    `DO NOT RECITE THE SPEC EITHER. The grid directly above your paragraph already prints ` +
    `the price, the beds, the baths, the square feet and the lot. A paragraph that reads ` +
    `them back is a wasted paragraph.\n\n` +
    `HARD RULES. Every number you write must appear VERBATIM in the settled facts — same ` +
    `digits, same commas. Never compute a new one, never round differently, never estimate. ` +
    `A FACT ABOUT A HOME IS NOT ONLY A NUMBER: you may not assert a view, a waterfront, a ` +
    `pool, a renovation, a garage, a school, a finish, a builder, a condition, or a ` +
    `character for the subject OR for any comparable unless the facts state it. You have ` +
    `never seen these houses, and you do not know where the comparables are beyond ` +
    `"nearby" — never name a road, not even the subject's own.\n\n` +
    `AND A MARKET RULE IS NOT A FACT EITHER. Do not prop the argument up on a general ` +
    `claim you were not given — "price per square foot compresses as size increases", ` +
    `"new construction commands a premium". Those are assertions about a market you were ` +
    `handed no evidence for, and they are inventions exactly like a made-up number. Never ` +
    `add a selling claim of your own either: "priced to move", "won't last", "a rare ` +
    `opportunity" are YOUR words, not facts. No hype, no exclamation marks.\n\n` +
    `Return ONLY your two or three sentences.\n\n` +
    FAVORABLE_FRAMING_POLICY;

  // THE ENTIRE FACT SHEET. Settled sentences, nothing else — no comp rows, no comp
  // prices, no comp addresses, no set of anything. There is nothing here to compare.
  const user =
    `THE SETTLED FACTS. This is EVERYTHING you know. Each line was computed from the ` +
    `records and is already true:\n` +
    settled.map((s) => `- ${s.sentence}`).join("\n") +
    `\n\nALREADY PRINTED, IMMEDIATELY BEFORE YOUR SENTENCES — DO NOT REPEAT ANY OF IT:\n` +
    `${evidenceParagraph(pc)}\n\n` +
    `Write your two or three sentences: what this home is, and the invitation.`;

  return { system, user, settled };
}

export async function authorCompsCase(
  facts: ListingFacts,
  comps: RenderComp[],
): Promise<string | null> {
  // No defensible comparison → no case → the slot stays open. (Old behavior returned
  // null on "no price or no comps"; this is that, plus the sqft the math needs.)
  const pc = buildPriceCase(facts, comps);
  if (!pc) return null;

  // The comps are used to COMPUTE the case (above) and to LINT the output (below). They
  // are never used to PROMPT — buildNarratorPrompt cannot even see them.
  const { system, user, settled } = buildNarratorPrompt(facts, pc);

  let context = "";
  try {
    const msg = await getAnthropic("email_build").messages.create({
      model: EMAIL_MODEL_SONNET,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: user }],
    });
    context = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  } catch {
    context = "";
  }

  // THE GATE — FAIL-CLOSED. The verdict is true by construction and always ships. The
  // narrator's context ships ONLY if it drew no claim of its own and invented no number.
  //
  // TWO LINTS, both fail-closed, and they check different things:
  //   • auditClaims (claims.ts) — the SHAPES a source cannot support: a comparison, a
  //     trajectory, a count, a sequence, a location relation, a motive, and any numeral
  //     that appears in no settled sentence. The shared gate, and the primary one.
  //   • contextViolations (below) — this recipe's own extra: the banned comparative
  //     vocabulary, and the ROAD-SUFFIX ban that catches "on Shore Dr" (a ban on the word
  //     "street" did not — the model just wrote the road's actual name).
  if (context) {
    const violations = [
      ...auditClaims(context, settled).map((v) => `${v.kind}: "${v.match}"`),
      ...contextViolations(context, facts, comps, pc),
    ];
    if (violations.length) {
      console.error(
        `[market-comps] narrator context DROPPED — ${violations.length} violation(s): ` +
          `${violations.join("; ")}\n  dropped text: ${context}`,
      );
      context = "";
    }
  }

  // The code-authored evidence ALWAYS ships — comparisons, mix, caveat. The narrator's
  // colour ships only if it cleared both gates. A missing sentence is honest; a confident
  // false one is not.
  const evidence = evidenceParagraph(pc);
  return context ? `${evidence} ${context}` : evidence;
}

/** Fill the chart slot IN PLACE (preserving its grid position), like upsertChartBlock
 *  does, but keyed on our own reserved slot rather than appending. */
function fillChartSlot(doc: EmailDoc, url: string, alt: string, caption: string): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.type === "image" && b.props.kind === "chart" && !b.props.url
        ? { ...b, props: { ...b.props, url, alt, caption } }
        : b,
    ),
  };
}

export async function buildMarketComps(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → there is no asking price to defend. Fall through to the generic
  // author rather than shipping a comp table about no house.
  if (!facts?.address) return null;

  // THE ONE comp source (lib/assistant/comp-helper.ts) — geocode → Lee/Collier gate →
  // ONE /nearby-home-values call → <=2 exact-sale enrichments. Never throws; a miss is
  // an empty set, and the grid still lands with open slots (RULE 0.7: never refuse).
  const result = await compsForAddress(facts.address, { topN: COMP_POOL }).catch(() => null);

  // *** THE LAND FILTER. *** By DATA, never by name. Nearest-first order is the
  // vendor's own; we keep it and take the first MAX_COMPS real homes.
  const comps = (result?.comps ?? []).filter(isComparableHome).slice(0, MAX_COMPS);

  let doc = buildCompsGrid(facts, comps, currentDoc);

  // ── THE CHART. This deliverable IS about a number, so it earns one — and the
  // SUBJECT IS ITS OWN BAR (we hold its list price). buildSoldCompsSpec already puts
  // the subject first and suffixes "(est.)"/"(list)" on any comp whose price is not a
  // recorded sale, so an AVM can never masquerade as a sale on the chart.
  const subjectPrice = num(facts.price);
  const street = facts.address.split(",")[0]?.trim() || "This home";
  const built = buildSoldCompsSpec(
    comps,
    { street, listPrice: subjectPrice },
    new Date().toISOString().slice(0, 10),
  );

  // TWO FIXES TO THE SHARED SPEC, both of which I SAW in the rendered PNG:
  //
  // 1. RETITLE. buildSoldCompsSpec is written for the "recent sales nearby" CONTEXT
  //    list, so it titles itself "Recent sales near X" — and on the live fixture only 2
  //    of the 6 comps are recorded sales; the other 4 are valuations. That title printed
  //    a lie across the top of the chart AND into its caption (chartImageCaption reads
  //    the title). The bar suffixes already say "(est.)"; the title must agree with them.
  //
  // 2. RELABEL THE SUBJECT BAR. Its "(Subject — asking)" suffix makes a 31-character
  //    label that OVERFLOWS the chart's label gutter — the rendered PNG clipped the
  //    leading digit and printed "26 Shore Dr (Subject — a…" for 326 Shore Dr. "(Subject)"
  //    fits, and the title now carries the word "asking" anyway.
  //
  // Both are done HERE, not in sold-comp-blocks.ts, because that module is shared with
  // R5 and the pasted-URL flyer. Reported to the operator as a shared-file fix instead.
  const spec = built
    ? {
        ...built,
        title: "Asking price vs nearby comparable homes",
        rows: built.rows.map((r, i) => (i === 0 ? [`${street} (Subject)`, r[1]] : r)),
      }
    : null;

  if (spec) {
    // House rule (lib/email/CLAUDE.md): a chart-bearing deliverable's chart magnitude
    // must cohere with its headline. Soft — an incoherent chart is DROPPED, never a
    // blocked build.
    const coherence = assertHeroChartCoherence({
      hero: resolveHeadlineFigure(doc),
      chart: chartMagnitudeFromSpec(spec),
    });
    if (coherence.coherent) {
      const accent = doc.globalStyle.accentColor || "#B98F45";
      const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
      const key = `email-charts/market-comps-${facts.zip ?? "swfl"}-${spec.asOf ?? "x"}-${tint}.png`;
      const image = await chartSpecToEmailImage(spec, accent, key).catch(() => null);
      // NO block caption. The PNG already prints the title AND "SWFL Data Gulf ·
      // realtor.com · as of MM/DD/YYYY" beneath the bars — the caption reprinted both
      // verbatim under the image (seen in the render). The `alt` still carries the title
      // for a client that blocks images.
      if (image) doc = fillChartSlot(doc, image.url, image.alt, "");
    }
  }
  // Nothing resolved → drop the slot. An empty chart box is worse than no chart.
  doc = dropEmptyChartSlot(doc);

  // ── THE PROSE. The model does not write prose and nothing else — it writes LESS than
  // that. The COMPARISON is computed in code (buildPriceCase) and the model only writes
  // the context around it, linted. See the guard block above authorCompsCase: this
  // recipe shipped an inverted comparative once, and it will not do it twice.
  //
  // Clear first — fillNarrative SKIPS a text block that already has content (the landmine
  // that shipped 2,000 characters of raw MLS copy on 07/13).
  const narrative = await authorCompsCase(facts, comps);
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}
