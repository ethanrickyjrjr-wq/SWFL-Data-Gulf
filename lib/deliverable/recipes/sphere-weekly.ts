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
//   5. PROSE — ONE paragraph whose FACTUAL SPINE IS WRITTEN IN CODE (see THE CLAIM
//      GATE below). The model writes only what the gap MEANS, is handed no figure it
//      could relate to another, and is audited fail-closed. Two strikes → the model's
//      sentences are DROPPED and the code-computed spine ships alone beside an open
//      slot. Never a stripped fragment, never an invented figure, never an invented
//      relation.
//   6. FRAMING — "What the headlines say" / "Here at home" kickers on the pair, one
//      "The gap" signal, and a reply-with-REVIEW CTA. Same shape every Tuesday: a
//      weekly earns its open habit by looking identical week to week.
//
// ── THE CLAIM GATE — WHY THIS FILE WAS REWRITTEN (07/13/2026) ────────────────
//
// THREE OF SIX LIVE RUNS OF THIS RECIPE ASSERTED THAT THE GAP WAS MOVING.
//
//     "the gap is widening"
//
// We had handed the narrator exactly ONE national figure — one reading, one moment —
// and NO national trend of any kind. **A LEVEL IS NOT A DIRECTION. You cannot see
// motion in a single point in time.** The claim was false, and it was false without
// containing a single invented number: the national figure was correctly web-sourced
// and cited, the local figure was correctly read from the lake. What was invented was
// the CLAIM DRAWN BETWEEN two correctly-sourced numbers.
//
// The old gate here (`unanchoredNumbers`, now deleted) tokenized DIGITS. "The gap is
// widening" carries no digits, so it sailed straight through — and it always would
// have. Invention is CLAIM-shaped, not number-shaped.
//
// The fix is structural, not lexical (a banned-word list was tried on a sibling recipe
// and LOST — it banned "street" and the model wrote "on Shore Dr"):
//
//   1. CODE computes the relation. `settledGap` compares the two dollar figures with
//      integer arithmetic and returns the direction as a settled English sentence.
//      `settledLocalTrend` reads the SIGN of the one real trend we hold (the ZIP's
//      year-over-year) and states it. Both are true by construction.
//   2. Those settled sentences ARE the opening of the shipped paragraph. Code owns the
//      relation; the model never states it, so it can never invert it.
//   3. THE NARRATOR IS HANDED THE SETTLED SENTENCES AND NOTHING ELSE. It never sees the
//      national figure, never sees the local figure, never sees the supporting row.
//      `narratorFacts` is built from `SettledClaim.sentence` strings — grep it: no
//      `MarketFigure` and no `Headline` reaches the model. **IT CANNOT COMPARE TWO
//      NUMBERS IT WAS NEVER GIVEN TWO OF, AND IT CANNOT TREND ONE POINT.**
//   4. `auditClaims` (lib/deliverable/claims.ts) runs FAIL-CLOSED over the model's
//      sentences — comparison, trajectory, count, sequence, spatial, motive, and any
//      numeral no settled fact anchors. One repair round naming the exact offending
//      phrase; still dirty → the model's prose is DROPPED ENTIRELY. Never patched,
//      never stripped, never best-effort.
//   5. `CLAIM_PROHIBITION` is printed verbatim into the narrator's system prompt, so
//      the model is told the exact rule the lint enforces.
//   6. `contradictsDirection` is a recipe-local backstop on top of the shared audit,
//      and it is here because I traced the shared regex against THIS recipe's own
//      phrasing and found the hole: `COMPARATIVE_QUANT` only fires when a positional
//      word sits within 40 characters of a QUANTITY token, and "sits above the national
//      figure" contains none of them ($ · digit · % · median · average · comparable ·
//      comps · the set · ask · price · sales · listings · market). So the shared gate
//      would NOT catch an inverted gap sentence written the way this email writes it.
//      This check is not a banned-word list: code already computed the truth, and this
//      only looks for its NEGATION — an "above" word when the arithmetic said below.
//      REPORTED as a claims.ts hardening (add "figure"/"number"/"national" to QUANTITY).
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
import { auditClaims, numeralsIn, CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
import type { SettledClaim } from "@/lib/deliverable/claims";
import { dropEmptyChartSlot } from "./shared";
import { finalizeDoc } from "@/lib/email/doc/finalize-doc";
import type { PlanEntry } from "@/lib/email/doc/finalize-doc";
import { GRID_COLS } from "@/lib/email/grid-schema";
import type { EmailBlock, EmailDoc, SourceCitation, StatItem } from "@/lib/email/doc/types";
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
  /** The SUBJECT of the code-computed gap sentence, carrying the geography the `here`
   *  figure actually measures ("The median home value in Cape Coral (33904)", "The Lee
   *  County median sale price"). A county figure never gets quietly handed to a ZIP. */
  hereSubject: string;
  /** The lake key of the year-over-year figure for THIS SAME metric. The only trend we
   *  hold — and it must belong to the metric on the page, or the settled trend sentence
   *  would be about a different number than the one it follows. */
  yoyKey: string;
}

/**
 * The gap sentence's subject, built from the figure's OWN label so the geography can
 * never drift off the number.
 *
 *   "Median home value — Cape Coral (33904)"  → "The median home value in Cape Coral (33904)"
 *   "Lee County median sale price"            → "The Lee County median sale price"
 *
 * The em-dash form is market-context.ts's "<metric> — <place>" label; anything else is
 * already a full noun phrase and is used as written. PURE; exported for the test.
 */
export function subjectFromLabel(label: string): string {
  const [metric, where] = label.split(/\s+—\s+/);
  const m = metric.trim();
  return where ? `The ${m.toLowerCase()} in ${where.trim()}` : `The ${m}`;
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
      hereSubject: subjectFromLabel(homeValue.label),
      yoyKey: "home_value_yoy",
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
      hereSubject: subjectFromLabel(countySale.label),
      yoyKey: "county_sale_yoy",
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

// ── 4. THE CLAIM GATE: the relation is computed in CODE ──────────────────────

/** A formatted whole-dollar figure back to its integer. `usd()` (market-context) and
 *  `usdHeadline` (above) both emit exactly "$367,969", so the parse is the inverse of
 *  the formatter and nothing else is accepted. Anything unparseable → null → NO gap
 *  sentence → no read at all. We never guess a relation we could not compute.
 *  PURE; exported for the test. */
export function parseUsd(value: string): number | null {
  const m = /^\$([\d,]+)$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A formatted percent back to its signed number. `pct()` (market-context) emits a
 *  UNICODE MINUS (U+2212), not a hyphen — parse both, or every decline reads as a rise.
 *  PURE; exported for the test. */
export function parsePct(value: string): number | null {
  const m = /^([+\-−])?(\d+(?:\.\d+)?)\s*%$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" || m[1] === "−" ? -n : n;
}

/** Which side of the national figure the local one is on. Decided by integer comparison.
 *  There is no room for a model here. */
export type GapDirection = "below" | "above" | "level";

/** The gap, settled. `direction` is the arithmetic; `sentence` is the English a reader
 *  sees and the narrator is allowed to know. */
export interface SettledGap extends SettledClaim {
  direction: GapDirection;
}

/**
 * THE FUNCTION THIS RECIPE NEEDED. Compare the local figure to the national one IN CODE
 * and return the result as a settled sentence.
 *
 * The sentence carries NEITHER NUMBER. It does not need to: the two figures are printed
 * large, side by side, directly above this paragraph. What the reader is missing is the
 * RELATION between them — so that is the only thing this sentence adds, and code, not a
 * language model, decides which way it points.
 *
 * Its only numeral is the ZIP inside the figure's own label, which is what lets the
 * narrator name the area without inventing one.
 *
 * Unparseable either side → null → there is no honest relation to state, so there is no
 * read. PURE; exported for the test.
 */
export function settledGap(plan: PairPlan, headline: Headline): SettledGap | null {
  const local = parseUsd(plan.here.value);
  const national = parseUsd(headline.value);
  if (local === null || national === null) return null;

  const direction: GapDirection = local < national ? "below" : local > national ? "above" : "level";
  const sentence =
    direction === "level"
      ? `${plan.hereSubject} is the same as the national figure beside it.`
      : `${plan.hereSubject} sits ${direction} the national figure beside it.`;
  return { direction, sentence, anchors: numeralsIn(sentence) };
}

/**
 * THE ONLY TREND WE HOLD, and it is LOCAL. Our lake carries this ZIP's year-over-year
 * change; NO SOURCE IN THIS PIPELINE CARRIES A NATIONAL TREND, and one national reading
 * at one moment can never become one. So the direction of the LOCAL number over the last
 * year is stated here, in code, from the SIGN of a real figure — and the direction of the
 * GAP is stated NOWHERE, because nothing we hold knows it.
 *
 * That is the whole defect this rewrite exists to close: three of six live runs said the
 * gap was "widening". A level is not a direction.
 *
 * PURE; exported for the test.
 */
export function settledLocalTrend(
  figures: readonly MarketFigure[],
  plan: PairPlan,
): SettledClaim | null {
  const yoy = figures.find((f) => f.key === plan.yoyKey);
  if (!yoy) return null;
  const p = parsePct(yoy.value);
  if (p === null) return null;

  const magnitude = Math.abs(p).toFixed(1);
  const sentence =
    p === 0
      ? `It is unchanged from a year ago.`
      : `It is ${p < 0 ? "down" : "up"} ${magnitude}% from a year ago.`;
  return { sentence, anchors: numeralsIn(sentence) };
}

/**
 * THE NEGATION CHECK — a recipe-local backstop under the shared audit.
 *
 * `auditClaims`'s COMPARATIVE_QUANT only fires when a positional word sits within 40
 * characters of a QUANTITY token ($ · digit · % · median · average · comparable · comps ·
 * the set · ask · price · sales · listings · market). THIS EMAIL'S OWN SENTENCE — "sits
 * above the national figure" — contains not one of them, so the shared gate would let an
 * INVERTED gap through. That is the exact class of failure (market-comps) the gate exists
 * for, and I am not shipping into a hole I can see.
 *
 * This is not a banned-word list. Code has already computed the truth; this looks only for
 * its NEGATION — an "above" word when the arithmetic said BELOW. A narrator that AGREES
 * with code costs nothing; a narrator that contradicts it loses its paragraph.
 *
 * PURE; exported for the test.
 */
const ABOVE_WORDS =
  /\b(above|higher|pricier|costlier|dearer|steeper|richer|exceeds?|exceeding|outpaces?|outpacing|premium)\b/i;
const BELOW_WORDS =
  /\b(below|beneath|lower|cheaper|less expensive|trails?|trailing|lags?|discount)\b/i;

export function contradictsDirection(prose: string, direction: GapDirection): string[] {
  const wrong =
    direction === "below"
      ? [ABOVE_WORDS]
      : direction === "above"
        ? [BELOW_WORDS]
        : [ABOVE_WORDS, BELOW_WORDS];
  return wrong.map((re) => re.exec(prose)?.[0]).filter((m): m is string => Boolean(m));
}

/**
 * A DEFINITION CLAIM — a statement about what the figure MEASURES, or about what buyers
 * and sellers actually DID.
 *
 * CAUGHT IN MY OWN SECOND LIVE RUN OF THIS REWRITE, and it is the reason this check
 * exists rather than a paragraph I waved through:
 *
 *   "the local median reflects what sellers have actually accepted in this zip code
 *    over the past year"
 *
 * That is FALSE. The figure is Zillow's ZHVI — a modelled home-VALUE INDEX. It is not a
 * record of accepted offers, not a sale price, and not a transaction of any kind. The
 * model was handed the words "median home value" and invented a definition for them.
 *
 * It carries no number, no comparison, no trajectory, no count — every shape the claim
 * gate hunts — so it sailed through clean. The lesson is the same one that produced
 * claims.ts: invention is CLAIM-shaped, and a new claim shape needs a new gate. The
 * narrator knows the figure's NAME and nothing about its construction; it therefore may
 * not say what it means, what it reflects, or what anybody paid.
 *
 * THE FOURTH LIVE RUN then produced the same shape wearing a different coat:
 *
 *   "a reading that is down from a year ago is the number a lender or assessor will see
 *    when valuing the asset today"
 *
 * A lender does not look at Zillow's index; an assessor does not either. That is a claim
 * about how the WORLD works, asserted with total confidence, and we were given no fact
 * about any lender, appraiser, assessor or bank. So the third parties are named here too:
 * the narrator has license to talk about A BUYER and AN OWNER — the two people the email
 * is for — and about NOBODY ELSE.
 *
 * REPORTED as a claims.ts lift — every recipe that hands a metric's label to a narrator
 * has this hole.
 *
 * PURE; exported for the test.
 */
const MECHANISM =
  /\b(reflects?|represents?|measures?|captures?|is based on|amounts? to|boils down to|tells you what|means that)\b|\b(sellers?|buyers?|owners?|homes?)\b[^.!?]{0,30}?\b(accepted|paid|sold for|sold at|listed at|closed at|agreed|received|changed hands|walked away with)\b|\b(lenders?|appraisers?|assessors?|underwriters?|banks?|insurers?|realtors?)\b/i;

export function mechanismClaims(prose: string): string[] {
  const m = MECHANISM.exec(prose);
  return m ? [m[0]] : [];
}

/**
 * THE TRAJECTORY HOLE — closed here because it is MY defect and I found it in MY OWN
 * FIFTH LIVE RUN of the fix that was supposed to close it.
 *
 * claims.ts's TRAJECTORY matches GERUNDS — widening, narrowing, shrinking, growing,
 * rising, falling — but not the BARE VERBS they come from. So:
 *
 *   "the gap is widening"     → CAUGHT (the sentence that shipped three times)
 *   "the gap will widen"      → SAILS THROUGH
 *   "watch whether it narrows" → SAILS THROUGH   ← my run 5 wrote exactly this
 *
 * Same invented direction, different inflection. A model told not to say "widening" says
 * "widen", exactly as the one told not to say "street" said "Shore Dr".
 *
 * Run 5's sentence was, in fairness, INTERROGATIVE and therefore honest — it named that
 * we cannot tell. I am killing it anyway, because I cannot separate "watch whether it
 * narrows" from "it will narrow" with a word test, and of the two errors available —
 * losing an honest falsifier sentence, or shipping an invented prediction — only one is
 * a hard block. The repair round then produces the falsifier that does survive ("Watch
 * next month's reading of the same two numbers."), which three other live runs wrote
 * unprompted. The cost is close to zero and the hole is shut.
 *
 * REPORTED as the claims.ts fix: TRAJECTORY should match the verb stems, not the -ing.
 *
 * PURE; exported for the test.
 */
const TRAJECTORY_VERB =
  /\b(widen|narrow|shrink|grow|rise|fall|climb|drop|cool|heat|rebound|recover|accelerate|decelerate|stabiliz\w*|stabilis\w*|flatten|tighten|loosen|reverse|converge|diverge)(s|ed)?\b/i;

export function trajectoryVerbs(prose: string): string[] {
  const m = TRAJECTORY_VERB.exec(prose);
  return m ? [m[0]] : [];
}

/**
 * THE BOUNDARY — and the one gate here that is not a word-hunt.
 *
 * By live run 7 I had closed "widening", then "widen", then "reflects what sellers
 * accepted", then "a lender will see" — and the model wrote:
 *
 *   "local equity is NOT KEEPING PACE with WHAT THE BROADER MARKET IS DOING"
 *
 * That is my original defect in a fourth coat. It asserts the national market is DOING
 * something (we hold ONE national number, at ONE moment) and that the local side is
 * losing ground against it (a comparative TRAJECTORY between two levels, one of which has
 * no trend at all). It carries no number, no gerund, no bare verb, no "-ing" — so every
 * lint above it, including claims.ts's, sailed past.
 *
 * I could add "keeping pace" to a list. I would then be beaten by "falling behind", and
 * after that by "the country is pulling away". THAT IS THE RECURSION THE BANNED-WORD LIST
 * ALWAYS LOSES, and I am not going to keep playing it.
 *
 * SO DRAW THE BOUNDARY INSTEAD. Every falsehood this rewrite produced — runs 2, 4, 5 and
 * 7 — came from the model ELABORATING ON THE NATIONAL SIDE, on the metric's construction,
 * or on third parties. It has legitimate business with exactly ONE thing: what the LOCAL
 * number's POSITION means to a buyer or an owner. The relation between the two figures is
 * already stated, in code, in the sentence directly above its own.
 *
 * *** THE NATIONAL SIDE BELONGS TO CODE. THE MODEL DOES NOT GET TO TOUCH IT. ***
 *
 * This is a rule about WHAT MAY BE WRITTEN ABOUT, not about which synonyms are spelled
 * how — so it closes the class rather than one member of it. Three of the four clean runs
 * never mentioned the national side at all; the cost is near zero and the surface is gone.
 *
 * PURE; exported for the test.
 */
const BEYOND_THE_LOCAL =
  /\b(national\w*|nationwide|countrywide|the country|the u\.?s\.?a?\b|america\w*|the (broader|wider|overall|rest of the) market|other markets|most markets|elsewhere|keep(ing|s)? pace|catch(ing|es)? up|fall(ing|s)? behind|pull(ing|s)? away|los(e|ing) ground|gain(ing|s)? ground|in step)\b/i;

export function beyondTheLocal(prose: string): string[] {
  const m = BEYOND_THE_LOCAL.exec(prose);
  return m ? [m[0]] : [];
}

export interface ReadViolation {
  kind: string;
  match: string;
}

/**
 * FAIL-CLOSED. Every unsupported claim shape in the model's sentences.
 *
 * `auditClaims` (the shared gate) + `contradictsDirection` (the hole above it). A
 * non-empty result means DO NOT SHIP THESE SENTENCES — one repair round, then they are
 * dropped and the code-computed spine ships alone. PURE; exported for the test.
 */
export function auditRead(
  prose: string,
  settled: readonly SettledClaim[],
  direction: GapDirection,
): ReadViolation[] {
  const out: ReadViolation[] = [...auditClaims(prose, settled)];

  // Sentence by sentence, and a SETTLED sentence is skipped — exactly as `auditClaims`
  // does it. Code's own spine says "sits below the national figure"; restating a claim
  // code authored is the narrator's job, and it must not condemn the paragraph it is in.
  const settledText = settled.map((s) => s.sentence.toLowerCase()).join("   ");
  for (const raw of prose.split(/(?<=[.!?])\s+/)) {
    const s = raw.trim();
    if (!s) continue;
    if (settledText.includes(s.toLowerCase().replace(/[.!?]+$/, ""))) continue;

    out.push(
      ...contradictsDirection(s, direction).map((match) => ({
        kind: "contradicts-the-computed-gap",
        match,
      })),
      ...mechanismClaims(s).map((match) => ({ kind: "mechanism", match })),
      ...trajectoryVerbs(s).map((match) => ({ kind: "trajectory", match })),
      ...beyondTheLocal(s).map((match) => ({ kind: "beyond-the-settled", match })),
    );
  }
  return out;
}

/**
 * EVERYTHING THE NARRATOR IS ALLOWED TO KNOW — and it is ONLY settled sentences.
 *
 * *** GREP THIS. *** The model's user message is built from `SettledClaim.sentence`
 * strings and the area's name. No `MarketFigure`, no `Headline`, no figure list, no
 * supporting row reaches it. It never sees the national number. It never sees the local
 * number. It is given ONE side of nothing and a relation that is already decided.
 *
 * IT CANNOT COMPARE TWO NUMBERS IT WAS NEVER GIVEN TWO OF, AND IT CANNOT TREND ONE POINT.
 *
 * PURE; exported for the test.
 */
export function narratorFacts(area: SphereArea, settled: readonly SettledClaim[]): string {
  return (
    `AREA: ${area.label}\n\n` +
    `WHAT IS ALREADY WRITTEN. These sentences were computed in code from real figures, ` +
    `and they are ALREADY PRINTED as the opening of the paragraph you are continuing:\n` +
    settled.map((s) => `- ${s.sentence}`).join("\n") +
    `\n\nThat is everything you know. You have been given NO figure, NO national number, ` +
    `NO second reading of anything, and NO trend in the gap. There is nothing here for ` +
    `you to compare, count, order, or extend. Write what it MEANS.`
  );
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

/** The system prompt. `CLAIM_PROHIBITION` is printed into it VERBATIM so the model is
 *  told the exact rule `auditClaims` enforces — a violation is then a refusal to follow
 *  an explicit instruction, not a surprise.
 *
 *  The extra clauses below are not decoration. Each one names a shape the shared lint
 *  catches whose most natural English wording a model reaches for by reflex — "every
 *  home" (a COUNT), "someone looking to buy" (a MOTIVE), "into 2027" (an unanchored
 *  numeral). The gate is fail-closed, so an honest paragraph phrased that way is LOST.
 *  Telling the model the phrasing that survives is how you get a paragraph at all. */
const READ_SYSTEM =
  `You write the SECOND HALF of one short paragraph in a weekly market email an agent ` +
  `sends to their own sphere (past clients, friends, neighbours).\n\n` +
  `THE FIRST SENTENCES ARE ALREADY WRITTEN — in code, from real figures — and they are ` +
  `shown to you. They state the gap between a NATIONAL headline number and this area's ` +
  `own number for the same measure. Both numbers are printed large, side by side, ` +
  `directly above the paragraph. YOU DO NOT STATE THE GAP AND YOU DO NOT REPEAT THOSE ` +
  `SENTENCES. You write what the gap MEANS — TWO OR THREE sentences, and nothing else.\n\n` +
  `${CLAIM_PROHIBITION}\n\n` +
  `DO NOT WRITE ABOUT THE NATIONAL SIDE AT ALL. How the two figures relate is ALREADY ` +
  `STATED, in the sentence directly above yours. You know ONE national number and NOTHING ` +
  `ELSE about the country — not what its market is doing, not whether it is moving, not how ` +
  `anywhere else compares. So never write "national", "nationwide", "the U.S.", "the ` +
  `broader market", "keeping pace", "catching up", "falling behind". (A live draft wrote ` +
  `"local equity is not keeping pace with what the broader market is doing" — a claim about ` +
  `a national trend that does not exist.) YOUR SUBJECT IS THE LOCAL NUMBER'S POSITION AND ` +
  `WHAT IT MEANS TO A BUYER OR AN OWNER. Nothing else is yours to write.\n\n` +
  `YOU HAVE NO TREND. You were given ONE national reading, for ONE moment in time. So you ` +
  `cannot say the gap is widening, narrowing, closing, growing, holding, or moving in any ` +
  `direction at all. A LEVEL IS NOT A DIRECTION — you cannot see motion in a single point ` +
  `in time. (A live draft of THIS EXACT EMAIL wrote "the gap is widening" off one national ` +
  `number. That sentence is the reason this rule exists, and it is the one sentence that ` +
  `will get your entire paragraph deleted.)\n\n` +
  `WRITE NO NUMBER AND NO YEAR. Not a figure, not a percentage, not a date, not "2027". ` +
  `Every number is already on the page.\n\n` +
  `YOU DO NOT KNOW WHAT THE NUMBER IS. You were given its NAME and nothing about how it is ` +
  `built. You do not know what it includes, how it is calculated, or what any buyer or ` +
  `seller actually paid, accepted, listed at, or closed at. So you may not say what the ` +
  `figure "reflects", "represents", "measures" or "means" — and you may never say what ` +
  `sellers accepted or buyers paid. (A live draft wrote "the local median reflects what ` +
  `sellers have actually accepted". It does not; it is a modelled index, not a record of ` +
  `any sale. That is an invented fact and it deletes your paragraph.) Write about what the ` +
  `number's POSITION means for a person — never about what the number is.\n\n` +
  `THERE ARE ONLY TWO PEOPLE IN THIS EMAIL: a buyer and an owner. You may not mention a ` +
  `lender, an appraiser, an assessor, a bank, an underwriter, an insurer or a realtor, and ` +
  `you may not say what any of them would do, see, or think. You were given no fact about ` +
  `any of them. (A live draft wrote "the number a lender or assessor will see when valuing ` +
  `the asset". No lender looks at this figure. That is an invented fact about the world.)\n\n` +
  `SAY IT THE WAY THAT SURVIVES:\n` +
  `- Call the reader "a buyer" or "an owner". NEVER "someone looking to buy", "anyone ` +
  `hoping to sell", "a motivated seller" — those are motives, and you know nobody's.\n` +
  `- Never put a quantity word in front of a noun: not "every home", not "most owners", ` +
  `not "all of them", not "half the market". You counted nothing.\n` +
  `- Never rank, never say "in line with", "on par with", "at the low end".\n\n` +
  `A FACT IS NOT ONLY A NUMBER. You may not name a CAUSE you were not given: interest ` +
  `rates, insurance costs, hurricanes, new construction, snowbirds, migration, inventory, ` +
  `a national policy. You were told NONE of these, so you may not assert any of them, not ` +
  `even as a possibility.\n\n` +
  `END BY NAMING WHAT YOU WOULD WATCH — one sentence, a thing to CHECK, not a prediction. ` +
  `"Watch next month's reading of the same two numbers." IS THE SHAPE; write that sentence ` +
  `or one just like it. Do NOT list what the gap might do — not "hold, narrow, or widen", ` +
  `not "see whether it closes". Naming the options is still naming a direction, and you ` +
  `have no direction to name. Never hedge the whole read into mush, and never add a selling ` +
  `claim ("now is the time", "a great moment to list") — those are your words, not facts ` +
  `about this market.\n\n` +
  `No hype, no exclamation marks, no jargon, no headings, no greeting, no sign-off. Plain ` +
  `and specific. Return ONLY your two or three sentences.`;

/** What the narrator is told when it breaks a rule — named by SHAPE, so the repair is
 *  the model deleting a claim rather than guessing at what offended us. */
const REPAIR: Record<string, string> = {
  trajectory:
    `That is a TRAJECTORY — a claim that something is MOVING. You were given ONE reading, ` +
    `for ONE moment. Nothing you know can tell you which way anything is moving. Delete it.`,
  comparative:
    `That is a COMPARISON, and you were not given two numbers to compare. The only relation ` +
    `that exists is the one already written for you. Delete it.`,
  "contradicts-the-computed-gap":
    `That word points the WRONG WAY. The direction of the gap was computed in code and is ` +
    `stated in the sentences above yours; you have just contradicted it. Delete it.`,
  mechanism:
    `That says what the figure IS, what somebody paid or accepted, or what a lender or ` +
    `assessor would do. You were given the number's NAME and nothing else — not how it is ` +
    `built, not one transaction, not one fact about any institution. Delete it.`,
  "beyond-the-settled":
    `That is about the NATIONAL side, or about one side keeping up with the other. Neither ` +
    `is yours. You hold ONE national number and nothing else about the country — no trend, ` +
    `no market, no motion. How the two figures relate is already written above your ` +
    `sentences. Write only about the LOCAL number's position and what it means to a buyer ` +
    `or an owner. Delete it.`,
  "word-count": `That is a COUNT. You counted nothing and were given no set. Delete it.`,
  sequence: `That is an ORDER OF EVENTS. You were given no dates. Delete it.`,
  spatial: `That is a LOCATION claim. You were given no streets. Delete it.`,
  motive: `That is a MOTIVE. You never know why anyone did anything. Delete it.`,
  "unanchored-number":
    `That number is in nothing you were given. Write no numbers at all — they are already ` +
    `printed on the page.`,
};

/** The read that ships in the "The gap" callout. */
export interface GapRead {
  /** The signal body: the code-computed spine, plus the model's meaning when it passed. */
  body: string;
  /** True when the model's sentences were DROPPED. The spine still ships (code wrote it,
   *  it is true by arithmetic) and the agent gets an open slot to write the meaning
   *  themselves — but not one word the model wrote reaches a recipient. */
  proseDropped: boolean;
}

/**
 * The read. CODE WRITES THE FACTS; THE MODEL WRITES ONLY WHAT THEY MEAN.
 *
 * The spine (`settled`) is already true — `settledGap` compared the two figures with
 * integer arithmetic and `settledLocalTrend` read the sign of a real percentage. The
 * model is handed those SENTENCES and nothing else (`narratorFacts`), so there is no
 * pair in its context to invert and no series to extend.
 *
 * `auditRead` then runs FAIL-CLOSED over what it wrote. One repair round naming the exact
 * offending phrase and the shape it belongs to; a second failure and THE MODEL'S PROSE IS
 * DROPPED — not stripped, not patched, not best-effort. The spine ships alone and the
 * agent is handed an open slot.
 *
 * Never throws; never returns an unaudited sentence.
 */
export async function authorGapRead(
  area: SphereArea,
  gap: SettledGap,
  settled: readonly SettledClaim[],
): Promise<GapRead> {
  const spine = settled.map((s) => s.sentence).join(" ");
  const dropped: GapRead = { body: spine, proseDropped: true };

  // What is left of the callout after the code-written spine. A model paragraph that
  // cannot fit is one `fitSignalBody` would trim anyway — tell it the real budget.
  const budget = MAX_READ - spine.length - 1;
  if (budget < 80) return dropped; // no room for prose → the spine is the read.

  const user =
    `${narratorFacts(area, settled)}\n\n` +
    `Write your two or three sentences — what this MEANS. Under ${budget} characters.`;

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

  const first = await ask(user);
  if (!first) return dropped;

  const clean = (t: string): boolean =>
    auditRead(t, settled, gap.direction).length === 0 && t.length <= budget;
  if (clean(first)) return { body: `${spine} ${first}`, proseDropped: false };

  // ONE repair round. Name the exact phrase AND the shape it belongs to — the same
  // regenerate-once loop the author path runs, but over CLAIMS, not digits.
  const problems: string[] = auditRead(first, settled, gap.direction).map(
    (v) => `You wrote "${v.match}". ${REPAIR[v.kind] ?? "You were not given that. Delete it."}`,
  );
  if (first.length > budget)
    problems.push(
      `Your draft ran ${first.length} characters. The hard limit is ${budget}. Cut it to two ` +
        `short sentences and keep the one that names what you would watch.`,
    );

  const retry = await ask(
    `${user}\n\nYour previous draft was REJECTED.\n\n${problems.join("\n\n")}\n\n` +
      `Rewrite. If a sentence needs something you were not given, CUT THE SENTENCE — a ` +
      `shorter true paragraph beats a longer one that guesses.`,
  );
  if (retry && clean(retry)) return { body: `${spine} ${retry}`, proseDropped: false };

  // Two strikes. The model's sentences do not ship — not one of them, not trimmed, not
  // patched. The spine is code-written and true; the meaning becomes an open slot.
  return dropped;
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
  /** The gap callout. `body` always starts with the code-computed spine; `proseDropped`
   *  says the model's sentences were gated out and the agent gets an open slot instead. */
  read: GapRead | null;
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

  const entries: PlanEntry[] = [];
  // Full-bleed row — the seam's zone fence sorts CLOSE-zone blocks (sources, footer)
  // below everything else regardless of push order, same as the lifecycle chrome.
  const push = (block: Omit<EmailBlock, "layout">, h: number, isStatic?: true) => {
    entries.push({
      id: block.id,
      type: block.type,
      props: block.props as Record<string, unknown>,
      span: GRID_COLS,
      newRow: true,
      height: h,
      ...(isStatic ? { isStatic: true } : {}),
    });
  };
  // THE PAIR's row — two `hero` cards, six columns each. `{6,6}` is a blessed
  // multiset (BLESSED_ROW_SPANS[2]), so the seam honours it exactly.
  const pairCell = (block: Omit<EmailBlock, "layout">, h: number, newRow: boolean) => {
    entries.push({
      id: block.id,
      type: block.type,
      props: block.props as Record<string, unknown>,
      span: 6,
      newRow,
      height: h,
    });
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
    pairCell(nationalHero, 6, true);
    pairCell(localHero, 6, false);
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

  // THE READ. The `signal` callout the prose recipe calls for, and its body ALWAYS opens
  // with the code-computed spine — the relation, decided by arithmetic, never by a model.
  // `fitSignalBody` is the last belt against SignalPropsSchema's 500-char cap (see
  // MAX_READ: an over-long body fails EmailDocSchema and the whole recipe silently falls
  // through to the generic author).
  //
  // AND WHEN THE MODEL'S SENTENCES WERE GATED OUT (`proseDropped`), a `text` OPEN SLOT
  // rides under the callout: on the canvas a dashed, editable placeholder inviting the
  // agent to write the meaning themselves; on the sendable paths TextBlock drops it
  // entirely (`emailRender`), so the recipient gets the true spine and no lie. SignalBlock
  // does NOT honor emailRender, so an empty signal is never built.
  const body = read ? fitSignalBody(read.body) : null;
  if (body) {
    push(
      {
        id: createBlock("signal").id,
        type: "signal",
        props: { kicker: "The gap", body },
      },
      5,
    );
  }
  if (!read || read.proseDropped) {
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
  push(keepOrDefault(current, "footer"), 3, true);

  return finalizeDoc({ globalStyle, entries });
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

  // ── THE CLAIM GATE ──────────────────────────────────────────────────────────
  // The RELATION between the two figures is computed HERE, in code, by integer
  // comparison — and so is the direction of the one real trend we hold. The narrator is
  // then handed those SETTLED SENTENCES and NOTHING ELSE: not the national figure, not
  // the local figure, not the supporting row. It has no pair to invert and no series to
  // extend. `authorGapRead` audits what it writes fail-closed and drops it on a second
  // violation. (`supportingFigures` renders in the stats row; it NEVER reaches the model.)
  const gap = plan && headline ? settledGap(plan, headline) : null;
  const settled: SettledClaim[] = gap
    ? [gap, ...(plan ? [settledLocalTrend(figures, plan)] : [])].filter(
        (s): s is SettledClaim => s !== null,
      )
    : [];
  const spine = settled.map((s) => s.sentence).join(" ");
  const read: GapRead | null = gap
    ? await authorGapRead(area, gap, settled).catch(() => ({ body: spine, proseDropped: true }))
    : null;

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
