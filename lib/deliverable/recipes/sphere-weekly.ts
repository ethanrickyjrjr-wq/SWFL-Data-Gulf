// lib/deliverable/recipes/sphere-weekly.ts
//
// R10 · WEEKLY SPHERE UPDATE — "Headlines vs Here".
//
// One NATIONAL headline number set beside the reader's OWN area's number, one honest
// read of the gap, and a reply-with-REVIEW CTA. It arrives every Tuesday.
//
// The six answers (playbook Part 6) — the ONLY things that differ between recipes:
//
//   1. SUBJECT — an AREA. `ctx.facts` is NULL here and must stay null: this is not a
//      house, and the listing flyer must not be forced onto it. The dispatcher hands
//      us `ctx.zip` only when a door passed `scope.kind === "zip"`, and the LAB DOOR
//      PASSES NO SCOPE — the area lives only in the prompt text ("…for Cape Coral").
//      So we read the area from the field OR the prompt, through the ONE existing
//      place root (`zipFromPromptPlace` → the sourced gazetteer). Never a second
//      crosswalk, never a bare regex. (Gating a lane on how a door happens to pass
//      something is exactly what sent every in-lab listing build to the free author.)
//   2. SKELETON — a coded grid, built here (`buildGrid`), the same way New Listing's
//      flyer grid is code (`lib/email/listing-flyer.ts`). The registry's `skeleton` is
//      null for this key and NO committed SEED_DOC carries this recipe's defining
//      shape: the prose recipe (`lib/email/author-recipes.ts` → "sphere-weekly")
//      specifies TWO `hero` blocks SIDE BY SIDE IN ONE ROW, six of twelve columns
//      each, band light. `weekly-pulse` is the closest committed grid and it is two
//      CHART images side by side under a header graphic — a different email. Proposed
//      as a new SEED_DOC in the report; until it exists, the structure is here.
//   3. CELLS — exactly two headline figures (the PAIR) + one supporting KPI row.
//      Every one carries its real source label and an as-of in MM/DD/YYYY. Unsourced →
//      an OPEN SLOT: an empty `stats` cell whose LABEL IS THE INSTRUCTION (canvas: a
//      dashed "+ Add"; sent email: StatsBlock drops the cell, and the row with it).
//      Never a zero, never a naked label, never invented.
//   4. CHART — NONE (declared on the key). THE CONTRAST PAIR IS THE VISUAL. Two big
//      numbers side by side ARE the picture; a chart under them would be a third thing
//      competing with the one idea. `dropEmptyChartSlot` runs anyway as the guard: an
//      empty chart box is worse than no chart.
//   5. PROSE — ONE paragraph: the honest read of the gap, handed ONLY the figures on
//      the page (each naming its own geography), forbidden arithmetic and forbidden
//      any CAUSE it was not given. Two strikes at the number gate → an OPEN SLOT,
//      never a stripped fragment and never an invented figure.
//   6. FRAMING — "What the headlines say" / "Here at home" kickers on the pair, one
//      "The gap" signal, and a reply-with-REVIEW CTA. Same shape every Tuesday: a
//      weekly earns its open habit by looking identical week to week.
//
// *** THE HEADLINE NUMBER IS A LANE-3 FACT — A NAMED WEB SOURCE. IT IS NOT IN OUR
//     LAKE. *** We do not hold a national figure and we never will from this pipeline.
// It is fetched LIVE through the SAME moat-preserving primitive the chart path uses
// (`fillExternalPoint`, lib/assistant/gap-fill.ts → Anthropic's `web_search_20250305`):
// a value is accepted ONLY when its digits appear VERBATIM in a cited span the tool
// actually returned from a real publisher URL. The publisher is pinned per metric
// (zillow.com for the home-value index; redfin.com for the median sale price) so the
// figure's label and its attribution cannot drift apart. A miss is NOT a substitution:
// we never quietly promote one of our own lake figures into the "national headline"
// slot — the slot becomes an OPEN SLOT with an instruction, and the email ships with
// the honest half.
//
// LOAD-BEARING SENTENCE: the registry prompt ends "Schedule it every Tuesday morning."
// That sentence is why this recipe exists as a WEEKLY, and the author path emits
// `schedule_suggestion` from it (build-doc.ts → payload.scheduleSuggestion). A recipe
// builder returns an EmailDoc, so it has no channel for that field — the parse lives
// here (`scheduleSuggestionFromPrompt`) and the two-line wiring in build-doc.ts's
// recipe lane is REPORTED, not edited (file ownership).

import { createBlock, HOUSE_BRAND } from "@/lib/email/doc/default-docs";
import { loadMarketFigures, type MarketFigure } from "@/lib/email/market-context";
import { figureCitations, resolveBand } from "@/lib/email/author-doc";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { hostOf } from "@/lib/assistant/web-fallback";
import {
  fillExternalPoint,
  makeDomainSearch,
  type ExternalPoint,
  type ExternalRequest,
} from "@/lib/assistant/gap-fill";
import { PLACE_ZIP_CROSSWALK } from "@/refinery/lib/geography-gazetteer.mts";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { anchorsExactly, extractNumbers, normalizeNumber } from "@/lib/deliverable/narrative-lint";
import { dropEmptyChartSlot } from "./shared";
import type {
  BlockLayout,
  EmailBlock,
  EmailDoc,
  SourceCitation,
  StatItem,
} from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";

// ── 1. THE SUBJECT: one area, resolved once, from the sourced crosswalk ───────

/** Every ZIP the sourced place↔ZIP crosswalk covers — built from the SAME gazetteer
 *  `zipFromPromptPlace` reads, so a ZIP we accept is always a ZIP we can name. A bare
 *  5-digit regex on its own would swallow a street number. */
const CROSSWALK_ZIPS: ReadonlySet<string> = new Set(
  PLACE_ZIP_CROSSWALK.entries.flatMap((e) => [e.zip, ...e.alt_zips]),
);

export interface SphereArea {
  /** The ZIP the "here" figures are read at. */
  zip: string;
  /** What a reader is shown: "Cape Coral (33904)", or the bare ZIP if unnamed. */
  label: string;
  /** The place as the user named it: "Cape Coral". */
  place: string;
}

/**
 * The area this weekly covers.
 *
 * An agent types "Cape Coral" over the [[blank]]; the ZIP door passes `33905`. Both
 * are legitimate. An explicit `scope.kind === "zip"` wins, then a crosswalk-known ZIP
 * written anywhere in the prompt (the finest grain we were handed), then the named
 * place's primary ZIP.
 *
 * CAPE CORAL IS SIX ZIPS, NOT ONE. We do NOT average them: a mean of six ZIP figures
 * is a number no source states, and a derived number is still an unsourced one. The
 * "here" figure is ONE real figure and it travels under its own label, which names the
 * ZIP it measures ("Median home value — Cape Coral (33904)"). Honest at the grain we
 * hold, never a city-wide number we cannot cite.
 *
 * Nothing resolvable → null, and the build falls through to the generic author.
 * Degrade, never refuse (RULE 0.7). PURE; exported for the test.
 */
export function resolveArea(prompt: string, scopeZip?: string): SphereArea | null {
  const place = zipFromPromptPlace(prompt);
  const at = (zip: string): SphereArea => ({
    zip,
    label: place ? `${place.place} (${zip})` : zip,
    place: place?.place ?? zip,
  });
  if (scopeZip && CROSSWALK_ZIPS.has(scopeZip)) return at(scopeZip);
  for (const m of prompt.matchAll(/\b\d{5}\b/g)) {
    if (CROSSWALK_ZIPS.has(m[0])) return at(m[0]);
  }
  return place ? at(place.zip) : null;
}

// ── 2. THE PAIR: one metric, two geographies ─────────────────────────────────
//
// The contrast is only honest if BOTH sides measure THE SAME THING. A national median
// SALE price beside a ZIP's home-VALUE index is two different metrics wearing one
// sentence — the "gap" it produces is an artifact of the mismatch, and the read
// written on top of it would be false. So the metric is chosen ONCE, from what our
// lake actually holds for this area, and the web lookup is then aimed at that metric's
// own national publisher.

/** Which metric this week's pair is drawn on. */
export interface PairPlan {
  /** The lake figure that is the "here" side. */
  here: MarketFigure;
  /** The label the national side is printed under. */
  nationalLabel: string;
  /** The publisher we pin the web lookup to — the same one that publishes `here`. */
  domain: string;
  /** The lookup itself. */
  request: ExternalRequest;
}

/**
 * Pick the pair's metric from the figures we hold, in order of preference:
 *
 *  1. TYPICAL HOME VALUE (Zillow ZHVI, per ZIP) — the reader's own neighborhood, and
 *     Zillow publishes the identical index for the United States. Same publisher, same
 *     index, two geographies. This is the strongest, most-often-present lake figure.
 *  2. MEDIAN SALE PRICE (Redfin, per county) — the fallback when the ZIP carries no
 *     ZHVI row. Redfin publishes the U.S. median sale price. Same publisher, same
 *     metric. It is a COUNTY figure and it travels under Redfin's own county label —
 *     never quietly handed to the ZIP.
 *
 * Neither held → null: there is no honest "here" to set a headline beside, and both
 * heroes become open slots.
 *
 * PURE; exported for the test.
 */
export function planPair(figures: readonly MarketFigure[]): PairPlan | null {
  const byKey = (key: string) => figures.find((f) => f.key === key);

  const homeValue = byKey("home_value");
  if (homeValue) {
    return {
      here: homeValue,
      nationalLabel: "Typical home value — United States",
      domain: "zillow.com",
      request: {
        label: "United States typical home value (Zillow Home Value Index)",
        search_query:
          "Zillow Home Value Index United States average home value latest month home values page",
      },
    };
  }

  const countySale = byKey("county_sale");
  if (countySale) {
    return {
      here: countySale,
      nationalLabel: "Median home sale price — United States",
      domain: "redfin.com",
      request: {
        label: "United States median home sale price",
        search_query: "Redfin United States housing market median sale price latest month",
      },
    };
  }

  return null;
}

/**
 * The verified national figure, formatted for the hero.
 *
 * `fillExternalPoint` returns a bare NUMBER whose digits are proven to appear verbatim
 * in a real citation span — it does not return the unit. Both metrics we ask for are
 * whole US dollars, so the formatting is a re-print of digits we already verified, and
 * the guards below make that true rather than assumed:
 *
 *   • a price is an INTEGER (a "6.75" answer means the model returned a RATE, not a
 *     price — reject);
 *   • a U.S. median/typical home price lives between $50k and $5M (a "431" answer, or a
 *     "43100000" answer, is a unit error — reject);
 *   • the formatted string's digits must equal the verified value's digits — the moat
 *     check runs on digits, so the thing we print must carry exactly those.
 *
 * Any rejection → null → the headline is an OPEN SLOT. We do NOT coerce, round, or
 * scale a number into plausibility: that would manufacture a figure no source states.
 *
 * PURE; exported for the test.
 */
export function usdHeadline(value: number): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value < 50_000 || value > 5_000_000) return null;
  const formatted = `$${value.toLocaleString("en-US")}`;
  const digits = (s: string) => s.replace(/[^0-9]/g, "");
  return digits(formatted) === digits(String(value)) ? formatted : null;
}

/** MM/DD/YYYY — the house as-of format. The raw ISO token is INTERNAL and never shown. */
export function mmddyyyy(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

/** The national headline, once it is real. */
export interface Headline {
  /** "$367,969" — digit-identical to the verified value. */
  value: string;
  /** "Typical home value — United States". */
  label: string;
  /** "zillow.com" — the host of the citation the value was verified against. */
  host: string;
  /** The publisher URL. Rides in the collapsed Sources accordion, never inline. */
  url: string;
  /** MM/DD/YYYY — the day WE read it. See the note in `fetchHeadline`. */
  readOn: string;
}

/**
 * Fetch the national headline LIVE from its named publisher, or return null.
 *
 * Pinned-domain first (`makeDomainSearch([plan.domain])` — the publisher that also
 * publishes our "here" figure, so the pair cannot drift onto two different yardsticks),
 * then ONE retry across the default authoritative allowlist. Two lookups, worst case.
 *
 * THE AS-OF WE CAN HONESTLY STATE IS THE DAY WE READ IT. `fillExternalPoint` verifies
 * the VALUE against a cited span; it does not return the source's own reporting period,
 * and inferring one from the citation text would be a number-shaped guess. So the hero
 * says "zillow.com · read 07/13/2026" — true, checkable, and never a period we made up.
 * (Carrying the publisher's stated period is a real improvement and is REPORTED as a
 * follow-up on `fillExternalPoint`, not faked here.)
 *
 * Never throws — a headline is a lane, not a blocker.
 */
export async function fetchHeadline(plan: PairPlan, today: Date): Promise<Headline | null> {
  const accept = (point: ExternalPoint | null): Headline | null => {
    if (!point) return null;
    const value = usdHeadline(point.value);
    if (!value) return null;
    return {
      value,
      label: plan.nationalLabel,
      host: hostOf(point.url),
      url: point.url,
      readOn: mmddyyyy(today),
    };
  };

  const pinned = await fillExternalPoint(plan.request, {
    search: makeDomainSearch([plan.domain]),
  }).catch(() => null);
  const first = accept(pinned);
  if (first) return first;

  // The publisher's own page didn't yield a citable figure — widen to the default
  // authoritative allowlist. The attribution is read off the citation we actually got
  // (`hostOf`), never assumed, so a figure from FRED or Census is still named correctly.
  return accept(await fillExternalPoint(plan.request).catch(() => null));
}

// ── 3. CELLS ─────────────────────────────────────────────────────────────────

/** A stat cell. Sourced → the figure's own label + its value, restated VERBATIM (read a
 *  rate as written; never recompute one). Unsourced → an EMPTY value whose LABEL IS THE
 *  INSTRUCTION (the open-slot contract, playbook Part 4): the canvas offers it to the
 *  user, StatsBlock's `emailRender` drops it from the sent email, and a row where no
 *  cell survived does not exist at all. Never a zero.
 *
 *  The clamps are the SCHEMA's, not a style choice (`StatItemSchema`: value ≤ 24, label
 *  ≤ 60). An over-long cell fails `EmailDocSchema` and the whole build falls through to
 *  the generic author — a truncated label is a far smaller harm than a lost deliverable.
 *  PURE; exported for the test. */
export function cell(figure: MarketFigure | null | undefined, instruction: string): StatItem {
  return figure
    ? { value: figure.value.slice(0, 24), label: figure.label.slice(0, 60) }
    : { value: "", label: instruction.slice(0, 60) };
}

/** The open-slot instructions. THE LABEL IS THE INSTRUCTION (lib/email/CLAUDE.md, "THE
 *  SLOT RULE") — it tells the user what to paste, and it never reaches a recipient. */
export const OPEN_NATIONAL = "National headline number — paste it with its source";
export const openLocalSlot = (place: string) =>
  `The same number for ${place} — paste it with its source`;

/** The supporting row — never the point of the email, so at most three, and each one
 *  about the READER'S side (the pair already carries the contrast). PURE. */
export function supportingCells(figures: readonly MarketFigure[], zip: string): StatItem[] {
  const byKey = (key: string) => figures.find((f) => f.key === key);
  return [
    cell(byKey("home_value_yoy") ?? byKey("county_sale_yoy"), "Year over year — type it in"),
    cell(byKey("dom") ?? byKey("county_dom"), "Days on market — type it in"),
    cell(byKey("active"), `Active listings in ${zip} — type it in`),
  ];
}

// ── 4. THE PROSE: one honest read of the gap ─────────────────────────────────

/**
 * THE NUMBER GATE. Every numeric token in the paragraph must appear VERBATIM in the
 * facts we handed the narrator. A number the model worked out itself (a difference, a
 * percentage gap, "about $80k cheaper") has no source and a reader cannot tell — a
 * derived number is still an invented one.
 *
 * Reuses the ONE tokenizer/anchor root (lib/deliverable/narrative-lint) — never a second
 * regex. Two carve-outs, both learned in live runs on this pipeline:
 *   • THE SIGN LIVES IN THE WORD. Our held YoY figure is "−6.8%"; the only natural
 *     English for it is "values are DOWN 6.8%". Anchoring only the signed token rejects
 *     the true sentence. The MAGNITUDE must be verbatim; the direction is carried by the
 *     prose. A fabricated number still cannot anchor.
 *   • A YEAR IS A CALENDAR REFERENCE, NOT A FIGURE — including a hyphenated one
 *     ("mid-2024" tokenizes as "-2024").
 *
 * PURE; exported for the test.
 */
export function unanchoredNumbers(paragraph: string, facts: readonly string[]): string[] {
  const anchors = new Set<string>();
  for (const line of facts) {
    for (const tok of extractNumbers(line)) {
      const n = normalizeNumber(tok);
      if (!n) continue;
      anchors.add(n);
      if (n.startsWith("-")) anchors.add(n.slice(1));
    }
  }
  const bareYear = (t: string) =>
    !/[$%]/.test(t) && /^(?:19|20)\d{2}$/.test(normalizeNumber(t).replace(/^-/, ""));
  return extractNumbers(paragraph).filter((t) => !bareYear(t) && !anchorsExactly(t, anchors));
}

/** Every fact the narrator is allowed to know, each one naming its OWN geography and
 *  its OWN source — that is what stops a national figure being re-attributed to the ZIP,
 *  or a county figure to a neighborhood. PURE; exported for the test. */
export function factLines(
  headline: Headline | null,
  here: MarketFigure | null,
  supporting: readonly MarketFigure[],
): string[] {
  const lines: string[] = [];
  if (headline)
    lines.push(
      `- ${headline.label}: ${headline.value} (${headline.host}, read ${headline.readOn}) — ` +
        `this is the NATIONAL figure.`,
    );
  if (here)
    lines.push(
      `- ${here.label}: ${here.value} (${here.source}${here.as_of ? `, as of ${here.as_of}` : ""}) — ` +
        `this is the LOCAL figure.`,
    );
  for (const f of supporting) {
    lines.push(`- ${f.label}: ${f.value} (${f.source}${f.as_of ? `, as of ${f.as_of}` : ""})`);
  }
  return lines;
}

/** The `signal` block's body is capped at 500 characters by `SignalPropsSchema`.
 *
 *  THIS IS NOT A STYLE RULE — IT IS LOAD-BEARING. An over-long body fails
 *  `EmailDocSchema`, and `authorDoc` responds to an invalid recipe doc by silently
 *  falling through to the GENERIC AUTHOR. Live, first run: the read came back at 696
 *  characters, the doc was rejected, and what rendered was the free author's grab-bag
 *  wearing my prompt — with a LAKE figure ("Lee County median sale price") sitting in
 *  the slot reserved for the NATIONAL headline. The exact substitution this recipe
 *  exists to prevent, produced by a length limit. */
const MAX_READ = 500;

/** Trim an over-long read to WHOLE SENTENCES. Never mid-word and never mid-sentence: an
 *  amputated clause reads as a bug, and it can strand a number away from the qualifier
 *  that made it true. Nothing fits → null → an OPEN SLOT. PURE; exported for the test. */
export function fitSignalBody(read: string | null, max: number = MAX_READ): string | null {
  if (!read) return null;
  const t = read.trim();
  if (t.length <= max) return t;
  let out = "";
  for (const s of t.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? []) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  out = out.trim();
  return out.length > 0 ? out : null;
}

const READ_SYSTEM =
  `You write ONE paragraph — the "honest read of the gap" in a weekly market email an ` +
  `agent sends to their own sphere (past clients, friends, neighbours). THREE OR FOUR ` +
  `sentences, and UNDER 450 CHARACTERS IN TOTAL — it lands in a small callout box, and a ` +
  `longer paragraph does not fit. Count as you write; brevity here is a hard constraint, ` +
  `not a preference.\n\n` +
  `WHAT THIS EMAIL IS: two numbers, side by side, directly above your paragraph — a ` +
  `NATIONAL headline figure and the reader's OWN area's figure for the same measure. ` +
  `Your job is the gap between them.\n\n` +
  `DO NOT READ THE PAIR BACK. The two numbers are already printed, large, right above ` +
  `you. A paragraph that restates them is a failure. Say what the difference MEANS for ` +
  `someone who owns a home there, or wants one. One connected thought.\n\n` +
  `BE HONEST ABOUT THE DIRECTION. If the local number is below the national one, say so ` +
  `plainly. If local values are falling, say they are falling. Do not reframe a decline ` +
  `as an opportunity, and never add a selling claim of your own — "now is the time", "a ` +
  `great moment to list", "won't last" are YOUR words, not facts about this market.\n\n` +
  `END BY NAMING WHAT WOULD CHANGE THIS READ — one sentence, the thing you would watch ` +
  `that would flip it. Never hedge the whole read into mush.\n\n` +
  `NEVER DO ARITHMETIC. You may not compute, derive, subtract, total, or estimate a ` +
  `number, and you may not write an approximation of one ("about $80,000 below", "roughly ` +
  `a fifth cheaper", "a 20% gap"). If a number is not written VERBATIM in the facts ` +
  `below, you may not write it — a number you worked out yourself has no source, and a ` +
  `reader cannot tell the difference. Same rounding, same units, or leave it out. You may ` +
  `always say "below", "above", "cheaper", "faster" without a number.\n\n` +
  `EVERY FACT NAMES ITS OWN PLACE. One of the facts below is NATIONAL and one is LOCAL, ` +
  `and each says exactly which geography it measures. A county figure is a county figure: ` +
  `you may not quietly hand it to a neighbourhood. Attribute each number to the place its ` +
  `label names, and to no other.\n\n` +
  `ONE NATIONAL FIGURE IS ONE FIGURE, NOT A DISTRIBUTION. You were given a single ` +
  `national number. You may compare this area to THAT NUMBER and to nothing else — never ` +
  `to "most U.S. markets", "other states", "the rest of Florida", "similar areas", or any ` +
  `spread, ranking, or typical case you were not shown. (A live draft wrote "sellers here ` +
  `are working harder for less than owners in most U.S. markets" off a single national ` +
  `average. That is a claim about a distribution nobody gave you.)\n\n` +
  `A FACT IS NOT ONLY A NUMBER. You may not name a CAUSE you were not given: interest ` +
  `rates, insurance costs, hurricanes, new construction, snowbirds, migration, inventory ` +
  `you were not shown, a national policy. You were told NONE of these, so you may not ` +
  `assert any of them, not even as a possibility. If a sentence needs something you were ` +
  `not given, cut the sentence.\n\n` +
  `No hype, no exclamation marks, no jargon, no headings, no greeting, no sign-off. Plain ` +
  `and specific. Return ONLY the paragraph.`;

/**
 * The read. THE MODEL WRITES PROSE. NOTHING ELSE (playbook Part 3, rule 4) — not
 * layout, not which cells exist, not numbers.
 *
 * One call, then ONE repair round naming the offending numbers (the same shape as the
 * author path's own regenerate-once loop). A draft that still won't anchor is DROPPED,
 * not shipped and not stripped into a fragment: the read becomes an OPEN SLOT the agent
 * writes themselves, and an open slot never reaches a recipient.
 *
 * With only ONE side of the pair there is no gap to read — we say nothing rather than
 * improvise half a contrast. Best-effort throughout; never invents.
 */
export async function authorGapRead(
  headline: Headline | null,
  here: MarketFigure | null,
  supporting: readonly MarketFigure[],
  areaLabel: string,
): Promise<string | null> {
  if (!headline || !here) return null; // no pair → no gap → no read. Never improvise one.
  const facts = factLines(headline, here, supporting);
  const user =
    `AREA: ${areaLabel}\n\nFACTS (the only things you know):\n${facts.join("\n")}\n\n` +
    `Write the read of the gap.`;

  const ask = async (content: string): Promise<string | null> => {
    try {
      const msg = await getAnthropic("email_build").messages.create({
        // Prose quality IS the job here; Haiku writes the robot sentence.
        model: EMAIL_MODEL_SONNET,
        max_tokens: 500,
        system: READ_SYSTEM,
        messages: [{ role: "user", content }],
      });
      const t = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      return t || null;
    } catch {
      return null;
    }
  };

  /** A draft is usable only if EVERY number in it anchors verbatim to the facts. */
  const anchored = (t: string) => unanchoredNumbers(t, facts).length === 0;

  const first = await ask(user);
  if (!first) return null;
  if (anchored(first) && first.length <= MAX_READ) return first;

  // ONE repair round, naming BOTH problems (the same shape as the author path's own
  // regenerate-once loop): the numbers it invented, and the length that would sink the
  // whole build. Length is not cosmetic here — see MAX_READ.
  const bad = unanchoredNumbers(first, facts);
  const problems: string[] = [];
  if (bad.length > 0)
    problems.push(
      `Your previous draft wrote ${bad.map((b) => `"${b}"`).join(", ")} — ` +
        `${bad.length === 1 ? "that number is" : "those numbers are"} not in the facts above. ` +
        `You worked ${bad.length === 1 ? "it" : "them"} out yourself, which means no source ` +
        `can be named for ${bad.length === 1 ? "it" : "them"}. Use only numbers written ` +
        `verbatim above, or none at all.`,
    );
  if (first.length > MAX_READ)
    problems.push(
      `Your previous draft ran ${first.length} characters. The hard limit is 450. Cut it to ` +
        `three or four short sentences and keep the sentence that names what would change ` +
        `this read.`,
    );

  const retry = await ask(`${user}\n\n${problems.join("\n\n")}`);
  if (retry && anchored(retry)) return fitSignalBody(retry);
  // The retry invented a number or never came back. Fall back to the FIRST draft only if
  // ITS numbers were all real — trimmed to whole sentences. Never ship an unanchored one.
  if (anchored(first)) return fitSignalBody(first);
  return null; // two strikes → an open slot, never an invented figure
}

// ── 5. SCHEDULING (the load-bearing sentence) ────────────────────────────────

export interface ScheduleSuggestion {
  cadence: "weekly" | "monthly";
  reason: string;
}

/**
 * The recipe prompt ends "Schedule it every Tuesday morning." — the sentence whose
 * absence on one of the two old surfaces forked this deliverable into two. It is the
 * whole pitch of the campaign: a weekly that sends itself.
 *
 * On the free-author path the MODEL emits `schedule_suggestion` from that sentence
 * (author-doc.ts's SCHEDULING line → build-doc.ts's `payload.scheduleSuggestion`). A
 * recipe builder returns an EmailDoc and has no channel for it — so the parse is here,
 * deterministic (a cadence is not a judgement call), and the wiring in build-doc.ts's
 * recipe lane is REPORTED. Same shape as `ScheduleSuggestionSchema` (doc/schema.ts).
 *
 * PURE; exported for the test.
 */
export function scheduleSuggestionFromPrompt(prompt: string): ScheduleSuggestion | null {
  const p = prompt ?? "";
  if (!/\bschedul/i.test(p)) return null;
  if (/\bmonthly\b|\bevery month\b|\bmonth\b/i.test(p) && !/\bweek/i.test(p)) {
    return { cadence: "monthly", reason: "The request asks for this to go out every month." };
  }
  if (/\bweekly\b|\bevery week\b|\bevery (mon|tues|wednes|thurs|fri|satur|sun)day\b/i.test(p)) {
    return {
      cadence: "weekly",
      reason: "The request asks for this to go out every week, on the same morning.",
    };
  }
  return null;
}

// ── 6. THE GRID ──────────────────────────────────────────────────────────────

/** Reuse the canvas's own block of a type — brand (header, footer) is STICKY and is
 *  never authored. Falls back to a fresh default block. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

/** The reply address for the CTA, read off the brand the user already set (the footer's
 *  own `email` — a user-owned brand field, never authored). The ENGINE owns the URL; the
 *  label is the only part copy touches.
 *
 *  THE HOUSE DEFAULT IS NOT THE AGENT. An unbranded canvas still carries HOUSE_BRAND's
 *  `hello@swfldatagulf.com` in its footer — pointing the reply CTA there would send the
 *  agent's sphere's replies to US. A house address is therefore treated as NO address:
 *  the button ships as a styled label with no link (ButtonBlock), and the instruction
 *  line above it still tells the reader exactly what to do — hit reply, which lands in
 *  the sender's own inbox regardless. (The build route already knows the caller's account
 *  email — `BuildArgs.replyEmail` — but `RecipeBuildContext` does not carry it; REPORTED.)
 */
export function replyMailto(current: EmailDoc): string | undefined {
  const footer = current.blocks.find((b) => b.type === "footer");
  const email = footer?.type === "footer" ? footer.props.email : undefined;
  if (!email || email === HOUSE_BRAND.email) return undefined;
  return `mailto:${email}?subject=REVIEW`;
}

/** The one line that tells the reader how to trigger the REVIEW reply. It is the
 *  campaign's MECHANIC, not a claim about the market — fixed copy, identical every
 *  Tuesday, carrying no figure. Code owns it; the model never touches it. */
export const REVIEW_INSTRUCTION =
  "Want this for your own street? Reply to this email with your address and the word " +
  "REVIEW, and I'll send back a snapshot for your home — no call, no pitch.";

export interface GridInput {
  current: EmailDoc;
  area: SphereArea;
  headline: Headline | null;
  here: MarketFigure | null;
  supporting: StatItem[];
  read: string | null;
  citations: SourceCitation[];
}

/**
 * The coded grid — THE CONTRAST PAIR IS THE STRUCTURE.
 *
 * The pair is TWO `hero` blocks in ONE row, six of twelve columns each, band light
 * (`resolveBand("light", …)` — the ONE band root; HeroBlock then draws the accent left
 * border that makes a banded, valued hero read as a "clipping", and reserves two kicker
 * lines so a wrapped kicker on one card cannot stagger its partner).
 *
 * THE KICKERS DO NOT REPEAT THE FIGURE'S LABEL — the system prints each figure's own
 * factual label under its value automatically, so the kicker is a POINTER ("what the
 * headlines say" / "here at home"), exactly as the prose recipe specifies.
 *
 * WHEN THE NATIONAL HEADLINE COULD NOT BE SOURCED, THE PAIR DOES NOT PRETEND. An empty
 * hero is NOT an option: `HeroBlock` is one of the components that does NOT yet honor
 * `emailRender` (only `stats`, `image`, `text` and `social-icons` do — BlockRenderer.tsx),
 * so an empty hero with an instruction in its label would ship that naked label to the
 * recipient — the exact thing rule 2 forbids. Instead the local hero widens to the full
 * twelve columns and the missing headline becomes a `stats` OPEN SLOT: on the canvas a
 * dashed "+ Add" carrying the instruction; in the sent email the cell is dropped and,
 * being the only cell, the row is dropped with it. (Teaching `HeroBlock` to honor
 * `emailRender` would let the slot hold its place in the pair — REPORTED.)
 *
 * PURE.
 */
export function buildGrid(input: GridInput): EmailDoc {
  const { current, area, headline, here, supporting, read, citations } = input;
  const globalStyle = { ...current.globalStyle };
  const band = resolveBand("light", globalStyle);

  const blocks: EmailBlock[] = [];
  let y = 0;
  const push = (block: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push({ ...block, layout: { x: 0, y, w: 12, h, ...opts } });
    y += h;
  };

  // Header — the agent's own branded header, lifted off the canvas.
  push(keepOrDefault(current, "header"), 2);

  // THE PAIR. Both cards ride the same row (same y), six columns each.
  const hero = (kicker: string, value: string, label: string, prose: string): EmailBlock => ({
    id: createBlock("hero").id,
    type: "hero",
    props: { kicker, value, label, prose, sectionBg: band },
  });

  const localHero = here
    ? hero(
        "Here at home",
        here.value,
        here.label,
        `${here.source}${here.as_of ? ` · as of ${here.as_of}` : ""}`,
      )
    : null;

  if (headline && localHero) {
    const nationalHero = hero(
      "What the headlines say",
      headline.value,
      headline.label,
      `${headline.host} · read ${headline.readOn}`,
    );
    const rowY = y;
    blocks.push({ ...nationalHero, layout: { x: 0, y: rowY, w: 6, h: 6 } });
    blocks.push({ ...localHero, layout: { x: 6, y: rowY, w: 6, h: 6 } });
    y += 6;
  } else if (localHero) {
    // Half the pair. The local number still leads, full width — and the headline slot
    // becomes an open slot the agent can fill from any source they trust.
    push(localHero, 6);
    push(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [cell(null, OPEN_NATIONAL)],
        },
      },
      3,
    );
  } else {
    // Neither side sourced (an area outside our lake, or a lake miss). The build still
    // lands — branded, structured, and empty where it must be. Never a refusal, never a
    // number we cannot name.
    push(
      {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: [cell(null, OPEN_NATIONAL), cell(null, openLocalSlot(area.place))],
        },
      },
      3,
    );
  }

  // THE READ. Sourced → the `signal` callout the prose recipe calls for. Unsourced →
  // a `text` OPEN SLOT: on the canvas a dashed, editable placeholder; on the sendable
  // paths TextBlock drops it entirely (`emailRender`). SignalBlock does NOT honor
  // emailRender, so an empty signal would ship an empty branded box — it is never built.
  if (read) {
    push(
      {
        id: createBlock("signal").id,
        type: "signal",
        props: { kicker: "The gap", body: read },
      },
      5,
    );
  } else {
    push({ id: createBlock("text").id, type: "text", props: { body: "", align: "left" } }, 4);
  }

  // The supporting row — the reader's own side, three cells at most. Every unsourced
  // cell is an open slot; a row where none survive does not exist in the email.
  push({ id: createBlock("stats").id, type: "stats", props: { stats: supporting } }, 3);

  // The CTA mechanic, then the one button. The address instruction lives in the BODY,
  // never in the label (a button label that carries an instruction fits nowhere).
  push(
    {
      id: createBlock("text").id,
      type: "text",
      props: { body: REVIEW_INSTRUCTION, align: "left" },
    },
    3,
  );
  const mailto = replyMailto(current);
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: { label: "Reply with REVIEW", ...(mailto ? { url: mailto } : {}) },
    },
    2,
  );

  // Citations — the collapsed accordion. Sources ride here, never inline (rule 1 of the
  // rules of engagement). `figureCitations` is the ONE citation root for held figures;
  // the web-verified headline carries its real publisher URL beside them.
  if (citations.length > 0) {
    push(
      {
        id: createBlock("sources").id,
        type: "sources",
        props: { sources: citations },
      },
      2,
    );
  }

  // Footer — the agent's CAN-SPAM footer (postal address, socials, unsubscribe).
  push(keepOrDefault(current, "footer"), 3, { static: true });

  return { globalStyle, blocks };
}

// ── THE BUILDER ──────────────────────────────────────────────────────────────

export async function buildSphereWeekly(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { prompt, currentDoc, zip } = ctx;

  // The subject is an AREA. `ctx.facts` is null and MUST stay null — the listing flyer
  // has no business here (playbook Part 6: "a different spine entirely").
  const area = resolveArea(prompt, zip);
  if (!area) return null; // no area named → the generic author. Degrade, never refuse.

  // LANE 1 — our lake. The same producer the whole builder feeds on, imported directly
  // (build-doc dispatches INTO this file; importing it back would cycle).
  const figures = await loadMarketFigures({ kind: "zip", value: area.zip }).catch(
    () => [] as MarketFigure[],
  );

  // The pair's metric, chosen from what we actually hold — then the national side of
  // THAT SAME metric, fetched live from its own publisher (LANE 3).
  const plan = planPair(figures);
  const headline = plan ? await fetchHeadline(plan, new Date()).catch(() => null) : null;
  const here = plan?.here ?? null;

  const supporting = supportingCells(figures, area.zip);
  const supportingFigures = figures.filter((f) =>
    supporting.some((s) => s.value && s.label === f.label),
  );

  // The read — handed the pair and the supporting figures, and NOTHING else.
  const read = await authorGapRead(headline, here, supportingFigures, area.label).catch(() => null);

  // Citations: every HELD figure the page renders (house style, one entry per source,
  // carrying its as-of) plus the web-verified headline WITH its publisher URL.
  const citations: SourceCitation[] = [
    ...figureCitations([...(here ? [here] : []), ...supportingFigures]),
    ...(headline
      ? [{ label: `${headline.label} — read ${headline.readOn}`, url: headline.url }]
      : []),
  ];

  let doc = buildGrid({ current: currentDoc, area, headline, here, supporting, read, citations });

  // NO CHART ON A WEEKLY SPHERE UPDATE (chart policy "none" on the key). The contrast
  // PAIR is the visual — a chart under it would be a third thing competing with the one
  // idea the email exists to land. This grid never reserves a chart slot; the guard runs
  // anyway, because an empty chart box is worse than no chart and a future edit must not
  // be able to leave one behind.
  doc = dropEmptyChartSlot(doc);

  return doc;
}
