// lib/deliverable/recipes/market-comps.ts
//
// R3 · MARKET COMPS — the EVIDENCE email. The one deliverable in the lifecycle that
// is genuinely ABOUT a number, so it is the one that earns the comps chart.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the same resolved house as New Listing. The dispatcher resolved it
//      (resolveSubject); we never resolve twice. What is DIFFERENT here is that the
//      subject's own list price is the CLAIM the email defends — so no price, no
//      argument (we still ship the grid; the case just becomes an open slot).
//   2. SKELETON — a coded grid in THIS file. `buildListingFlyer` is not reusable: it
//      hard-codes the "New Listing" kicker, a "View the Full Listing" CTA and a
//      ZIP-trend chart slot. Wrong hat, wrong chart, and it is shared with R1/R5/R7,
//      so it cannot be bent without breaking them. No committed SEED_DOCS grid holds
//      a comp-evidence shape either (the 27 were checked). Coded grid it is.
//   3. CELLS — the terms of the comparison, each from a real record:
//        row A (the subject): beds · sq ft · $/sq ft   (vendor row; $/sq ft = price÷sqft)
//        row B (the evidence): comp median $/sq ft · comp $/sq ft range · the mix
//      Every one is code-computed from the live comp set. Unsourced → open slot.
//   4. CHART — comps-bar, and the SUBJECT IS ITS OWN BAR (we hold its list price;
//      the chat comp lane omits a subject bar only because ITS subject has no price —
//      that reasoning does not transfer, so do not cargo-cult it here).
//   5. PROSE — the straight case for the asking price. This recipe deliberately does
//      NOT use `authorListingNarrative`: that narrator is told "THIS EMAIL IS ABOUT
//      THE HOUSE, not the market, not the comps… do not turn this into a market
//      analysis", which is exactly the email we are writing. It would refuse the job.
//      Ours permits the price argument and keeps every no-invention guardrail.
//   6. FRAMING — "Market Comps" kicker, the ASK + address as the hero (it is the claim
//      under examination), the comp table as the body, one honest read as the close.
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
// (AVM), or a `last_list`. On the live fixture only 2 of 6 are recorded sales; the
// rest are current valuations. Every number is sourced — so this constrains the
// PROSE, it never blocks the build. The price kind survives into all three surfaces
// the reader sees: the chart bar suffix "(est.)" (buildSoldCompsSpec), the row's own
// "Sold 08/29/2025" / "Estimated 06/08/2026" line, and the stat cell's label, which
// states the mix outright. The narrator is handed the kind on every comp and is
// forbidden, in the system prompt, from calling a valuation a sale.

import { compSources, compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { createBlock, DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import { heroPhotoBlock } from "@/lib/email/inject-photo";
import { buildSoldCompsSpec } from "@/lib/email/sold-comp-blocks";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
} from "@/lib/deliverable/chart-coherence";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
import { clearNarrativeSlots, dropEmptyChartSlot, fillNarrative } from "./shared";
import type { RecipeBuildContext } from "./index";
import type {
  BlockLayout,
  EmailBlock,
  EmailDoc,
  FontFamily,
  ListItem,
  StatItem,
} from "@/lib/email/doc/types";
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
 *  own vocabulary ("sold … on", "estimated value", "last listed"), kept honest. */
function priceKindPhrase(c: RenderComp): string {
  if (c.priceKind === "sold") {
    const d = mdy(c.priceDate);
    return d ? `Sold ${d}` : "Sold";
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

/** "2 recorded sales, 4 valuations" — the mix, stated on the face of the email so a
 *  reader can never mistake an AVM for a sale. Singular/plural handled; a zero side is
 *  simply not mentioned. */
function mixLabel(comps: RenderComp[]): string {
  const sold = comps.filter((c) => c.priceKind === "sold").length;
  const rest = comps.length - sold;
  const parts = [
    sold ? `${sold} recorded ${sold === 1 ? "sale" : "sales"}` : "",
    rest ? `${rest} ${rest === 1 ? "valuation" : "valuations"}` : "",
  ].filter(Boolean);
  return parts.length ? `Comparable homes (${parts.join(", ")})` : "Comparable homes";
}

/** Editorial fallback palette — applied ONLY when the incoming brand is still the house
 *  default. A real user brand carries through untouched. (Same rule as the flyer: brand
 *  is STICKY and is never authored.) */
const EDITORIAL_STYLE = {
  primaryColor: "#0A2A2C",
  accentColor: "#B98F45",
  fontFamily: "BOOK_SERIF" as FontFamily,
  displayFontFamily: "PLAYFAIR_SERIF" as FontFamily,
  textColor: "#23302F",
  backdropColor: "#EFE9DD",
};

/** Reuse the canvas's own block of a type (brand/identity is sticky), else a default. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

/** Attach the 12-col grid layout so the doc compiles through the POSITIONED renderer
 *  (compile-grid). A block with no `layout` silently falls to the free stacker — a
 *  DIFFERENT engine (playbook Part 1: "the canvas lies about the email"). */
function at<T extends EmailBlock>(block: T, y: number, h: number, opts?: Partial<BlockLayout>): T {
  return { ...block, layout: { x: 0, y, w: 12, h, ...opts } };
}

/** The coded evidence grid. Pure: no I/O, invents nothing — an unsourced cell is left
 *  EMPTY (an open slot on the canvas, absent from the sent email; never a zero). */
export function buildCompsGrid(
  facts: ListingFacts,
  comps: RenderComp[],
  current: EmailDoc,
): EmailDoc {
  const brandIsHouse = current.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse
    ? { ...current.globalStyle, ...EDITORIAL_STYLE }
    : { ...current.globalStyle };

  const addressLine =
    facts.address ?? ([facts.city, facts.state].filter(Boolean).join(", ") || undefined);
  const subjectPpsf = perSqft(num(facts.price), num(facts.sqft));
  const compPpsf = comps.map((c) => perSqft(c.price, c.sqft)).filter((v): v is number => v != null);
  const medianPpsf = median(compPpsf);
  const loPpsf = compPpsf.length ? Math.min(...compPpsf) : null;
  const hiPpsf = compPpsf.length ? Math.max(...compPpsf) : null;

  const blocks: EmailBlock[] = [];
  let y = 0;
  const push = (block: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push(at(block, y, h, opts));
    y += h;
  };

  // 1. Header — the agent's own branded header, kept.
  push(keepOrDefault(current, "header"), 2);

  // 2. Hero — the CLAIM this email defends: the ask, on this address.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Market Comps",
        value: facts.price ?? "",
        label: addressLine ?? "",
      },
    },
    3,
  );

  // 3. The subject's photo — it identifies the house whose price is on trial. No photo
  //    → an EMPTY image block, which the canvas renders as a file-picker dropzone and
  //    the email omits entirely (the open-slot contract, Part 4).
  push(
    facts.photos[0]
      ? heroPhotoBlock({
          url: facts.photos[0],
          alt: facts.address ?? "The subject property",
          linkUrl: facts.sourceUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: { url: "", kind: "photo", alt: facts.address ?? "The subject property" },
        },
    6,
  );

  // 4. Row A — the TERMS of the comparison, from the subject's vendor record. These are
  //    the three numbers a comp is judged on; the price itself is already the hero.
  // An unsourced value is "" — an OPEN SLOT on the canvas (the label is its instruction),
  // dropped from the sent email by StatsBlock's `emailRender`. Never a zero. The slices
  // are the schema's own caps (value 24, label 60): a cell that overruns them would fail
  // EmailDocSchema and take the whole build down with it.
  const cell = (value: string | undefined, label: string): StatItem => ({
    value: value && value.trim() ? value.trim().slice(0, 24) : "",
    label: label.slice(0, 60),
  });
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: [
          cell(facts.beds, "Beds"),
          cell(num(facts.sqft)?.toLocaleString("en-US"), "Sq Ft"),
          cell(subjectPpsf ? `${usd(subjectPpsf)}` : undefined, "$/Sq Ft — this home"),
        ],
      },
    },
    2,
  );

  // 5. Row B — the EVIDENCE, computed in code from the live comp set (deterministic
  //    math, never an LLM). Empty when no comp survived the land filter: an open slot,
  //    never a zero and never a made-up median.
  //
  //    THE RANGE LIVES IN THE LABEL, NOT IN A VALUE. A stat VALUE renders in the display
  //    serif at a third of the email's width, and "$173–$266" wraps mid-value there — I
  //    watched it break across two lines in the rendered PNG. Labels are small text and
  //    wrap gracefully (they already run to two lines), so the spread rides there, where
  //    it is just as visible and cannot break ugly.
  const spread =
    loPpsf && hiPpsf && loPpsf !== hiPpsf ? ` (${usd(loPpsf)}–${usd(hiPpsf)} across the set)` : "";
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: [
          cell(
            medianPpsf ? `${usd(medianPpsf)}` : undefined,
            `$/Sq Ft — median of the comps${spread}`,
          ),
          cell(comps.length ? String(comps.length) : undefined, mixLabel(comps)),
        ],
      },
    },
    2,
  );

  // 6. Chart slot — the comps bar, subject included. Filled in place by the builder
  //    below (preserving this layout), or DROPPED if it can't be built. An empty chart
  //    box is worse than no chart.
  push(
    {
      id: createBlock("image").id,
      type: "image",
      props: {
        url: "",
        kind: "chart",
        alt: `Asking price vs nearby comparable homes`,
        caption: "",
      },
    },
    6,
  );

  // 7. The evidence table. Omitted entirely when there is nothing real to list (a
  //    `list` needs >= 1 row — an empty shell is not a slot, it is a lie).
  if (comps.length) {
    push(
      {
        id: createBlock("list").id,
        type: "list",
        props: {
          title: "The comparable homes",
          items: comps.map(compRow),
        },
      },
      Math.max(4, comps.length + 2),
    );
  }

  // 8. Commentary — the straight case for the asking price. EMPTY here; the narrator
  //    fills it (fillNarrative). Unwritten → an open slot with an instruction on the
  //    canvas, absent from the email.
  push({ id: createBlock("text").id, type: "text", props: { body: "", align: "left" } }, 4);

  // 9. Sources — the collapsed accordion. Rules of engagement #1: sources ride in the
  //    collapsed list, never inline in the prose. Domain-level, never a vendor name,
  //    never an MLS id. Empty comp set → no citation to make, so no block.
  const sources = compSources({ comps, asOf: "", needs: [] });
  if (sources.length) {
    push(
      {
        id: createBlock("sources").id,
        type: "sources",
        props: {
          sources: sources.map((s) => ({ label: s.label, url: s.url })),
          note: "Comparable homes near the subject, pulled live. Not adjusted for condition.",
        },
      },
      3,
    );
  }

  // 10. Agent card — kept from the canvas.
  push(keepOrDefault(current, "agent-card"), 4);

  // 11. CTA. The ask of a comps email is a CONVERSATION about the number, not a tour.
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: { label: "Talk Through These Numbers", url: facts.sourceUrl },
    },
    2,
  );

  // 12. Footer — the agent's CAN-SPAM footer, kept.
  push(keepOrDefault(current, "footer"), 3, { static: true });

  return { globalStyle, blocks };
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
  subjectIsLargest: boolean;
  /** The comparative sentences, AUTHORED IN CODE. The only comparison this email makes. */
  verdict: string;
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

  // POSITION IN THE SET — the exact counts. This is what kills the "falls at the low end
  // of that band" class of error: we state the true position instead of characterizing it.
  const lowerCount = priced.filter((x) => x.ppsf < subjectPpsf).length;
  const higherCount = priced.filter((x) => x.ppsf > subjectPpsf).length;
  const levelCount = n - lowerCount - higherCount;

  const subjSqft = num(facts.sqft);
  const subjectIsLargest =
    subjSqft != null && priced.every((x) => x.c.sqft != null && x.c.sqft < subjSqft);

  // ── THE VERDICT. Composed here, from the relations above. Every clause is a
  //    deterministic read of two sourced numbers; none of it is a characterization.
  const homes = `${n} comparable ${n === 1 ? "home" : "homes"}`;
  const addr = facts.address?.split(",")[0]?.trim();
  const forAddr = addr ? ` for ${addr}` : "";

  const s1 =
    vsMedian.dir === "level"
      ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} is level with the ` +
        `${usd(medianPpsf)} median across the ${homes} nearby.`
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

  sentences.push(
    higherCount === n
      ? `Every one of the ${homes} carries a higher price per square foot.`
      : lowerCount === n
        ? `Every one of the ${homes} carries a lower price per square foot.`
        : `Of the ${homes}, ${lowerCount} ${lowerCount === 1 ? "carries" : "carry"} a lower ` +
          `price per square foot and ${higherCount} ${higherCount === 1 ? "carries" : "carry"} ` +
          `a higher one` +
          (levelCount ? `; ${levelCount} ${levelCount === 1 ? "matches" : "match"} it` : "") +
          `.`,
  );

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
    subjectIsLargest,
    verdict: sentences.join(" "),
  };
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
export async function authorCompsCase(
  facts: ListingFacts,
  comps: RenderComp[],
): Promise<string | null> {
  // No defensible comparison → no case → the slot stays open. (Old behavior returned
  // null on "no price or no comps"; this is that, plus the sqft the math needs.)
  const pc = buildPriceCase(facts, comps);
  if (!pc) return null;

  const compLines = comps.map((c) => {
    const ppsf = perSqft(c.price, c.sqft);
    return (
      `- ${c.addressLine}: ${usd(c.price as number)} — ${priceKindPhrase(c)}` +
      `${c.beds != null ? `, ${c.beds} beds` : ""}` +
      `${c.sqft != null ? `, ${c.sqft.toLocaleString("en-US")} sq ft` : ""}` +
      `${ppsf ? `, ${usd(ppsf)}/sq ft` : ""}`
    );
  });

  const soldCount = comps.filter((c) => c.priceKind === "sold").length;
  const estCount = comps.length - soldCount;

  const facts_ = [
    facts.address && `Subject address: ${facts.address}`,
    facts.price && `Subject ASKING price: ${facts.price}`,
    facts.beds && `Subject beds: ${facts.beds}`,
    facts.baths && `Subject baths: ${facts.baths}`,
    facts.sqft && `Subject square feet: ${facts.sqft}`,
    facts.lotSize && `Subject lot: ${facts.lotSize}`,
    facts.isNewConstruction && `The subject is NEW CONSTRUCTION (vendor-stated).`,
    facts.isPriceReduced &&
      facts.priceReduction &&
      `The subject's price was REDUCED by ${facts.priceReduction} from its original ask.`,
  ].filter(Boolean);

  const system =
    `You write the CONTEXT sentences of a real-estate MARKET COMPS email — the one an ` +
    `agent sends to make the case that the asking price is right. Two or three sentences. ` +
    `Plain, confident, specific.\n\n` +
    `*** THE COMPARISON IS ALREADY WRITTEN AND YOU DO NOT GET TO MAKE ANOTHER ONE. ***\n` +
    `A comparison is a factual claim, and it was computed from the records — not by you. ` +
    `It is quoted below as THE VERDICT and it will be printed IMMEDIATELY BEFORE your ` +
    `sentences, in the same paragraph. Do not restate it, do not re-derive it, do not ` +
    `soften it, do not contradict it, and do not draw a comparison of your own.\n\n` +
    `THESE WORDS ARE FORBIDDEN. Using any of them, in any form, voids your paragraph:\n` +
    BANNED_CONTEXT_PHRASES.map((p) => `"${p}"`).join(", ") +
    `.\nYes, that includes the bare word "than" — do not write "rather than", "more than" ` +
    `or anything else that uses it. Every one of these is a way of placing one number ` +
    `against another, and the code has already done that.\n\n` +
    `YOUR JOB is what the verdict cannot say: WHAT THIS HOME IS and WHAT THIS EVIDENCE IS. ` +
    `Draw only on the facts below — new construction, the lot, a price that has already ` +
    `come down, the square footage, and the makeup of the comp set. In this set there ` +
    `${soldCount === 1 ? "is" : "are"} ${soldCount} recorded ` +
    `${soldCount === 1 ? "sale" : "sales"} and ${estCount} current ` +
    `${estCount === 1 ? "valuation" : "valuations"}, and none of it is adjusted for ` +
    `condition — a reader is entitled to know that. Close by inviting the conversation.\n\n` +
    `THE HONEST DISTINCTION YOU MUST NOT BLUR: "Sold <date>" is a recorded sale. ` +
    `"Estimated value <date>" is a current valuation, NOT a sale. "Last listed" is an ` +
    `asking price, NOT a sale. You may NEVER write that a home "sold for" a figure that ` +
    `is a valuation.\n\n` +
    `HARD RULES. Every number you write must appear verbatim in the facts below — never ` +
    `compute a new one, never round differently, never estimate. A FACT ABOUT A HOME IS ` +
    `NOT ONLY A NUMBER: you may not assert a view, a waterfront, a pool, a renovation, a ` +
    `garage, a school, a finish, a builder, a condition, or a character for the subject OR ` +
    `for any comp unless the facts state it. You have never seen these houses, and you do ` +
    `not know where the comps are beyond "nearby" — never place one on a named street.\n\n` +
    `AND A MARKET RULE IS NOT A FACT EITHER. Do not prop the argument up on a general ` +
    `claim you were not given — "price per square foot compresses as size increases", ` +
    `"new construction commands a premium". Those are assertions about a market you were ` +
    `handed no evidence for, and they are inventions exactly like a made-up number. Never ` +
    `add a selling claim of your own either: "priced to move", "won't last", "a rare ` +
    `opportunity" are YOUR words, not facts. No hype, no exclamation marks.\n\n` +
    `Return ONLY your two or three sentences.`;

  const user =
    `THE VERDICT (already computed, already written, printed directly before your ` +
    `sentences — do not repeat it):\n${pc.verdict}\n\n` +
    `SUBJECT (the home whose asking price is being defended):\n${facts_.join("\n")}\n\n` +
    `THE COMPARABLE HOMES (every one has beds and square footage — vacant land was ` +
    `already excluded):\n${compLines.join("\n")}\n\nWrite the context sentences.`;

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

  // THE GATE. The verdict is true by construction and always ships. The narrator's
  // context ships ONLY if it made no comparison and invented no number.
  if (context) {
    const violations = contextViolations(context, facts, comps, pc);
    if (violations.length) {
      console.error(
        `[market-comps] narrator context DROPPED — ${violations.length} violation(s): ` +
          `${violations.join("; ")}\n  dropped text: ${context}`,
      );
      context = "";
    }
  }

  return context ? `${pc.verdict} ${context}` : pc.verdict;
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
