// lib/deliverable/recipes/market-pulse.ts
//
// R12 · MONTHLY MARKET PULSE — an AREA recipe. `ctx.facts` is NULL here; there is
// no house. Do NOT force the listing flyer on it (playbook Part 6).
//
// THE CAMPAIGN SEED, "The Ask", and "The Pulse Email" were three showcase entries
// carrying the SAME prompt. They are ONE recipe, and this is it — built once.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — an AREA, resolved ONCE from a real record before any layout:
//      the ZIP a door handed us (`ctx.zip`), else the place named in the prompt via
//      `zipFromPromptPlace` — the ONE place root (lib/email/place-from-prompt.ts),
//      a sourced crosswalk, never a model inference and never a second resolver.
//      A city is its ZIP SET: Cape Coral is SIX ZIPs, not one.
//   2. SKELETON — the committed `trend-snapshot` grid (SEED_DOCS). It already IS
//      this deliverable's shape: "chart leads, no hero — one trend chart up top,
//      supporting stats below, a short read, and your sign-off." Loaded, not
//      re-invented. Brand (globalStyle, header, agent card, footer) is STICKY and
//      lifted from whatever is on the canvas.
//   3. CELLS — three stats, every one a value copied VERBATIM out of one ZIP row of
//      the home-values brain (biggest monthly mover · highest home value · ZIPs
//      covered). Nothing is averaged, blended, or back-solved into a new statistic.
//      A cell we cannot source ships EMPTY — an open slot on the canvas, absent from
//      the sent email (StatsBlock drops an unfilled cell under `emailRender`). Never
//      a zero, never a naked label, never invented.
//   4. CHART — `zip-mom-move`, the declared policy on this key. This deliverable IS
//      about a number, so it charts: one ranked bar per ZIP (the ZIP's home value),
//      each carrying its OWN month-over-month chip. Built in CODE from the brain's
//      audited detail table; the model never touches a plotted figure.
//   5. PROSE — the `monthly-newsletter` voice, behind THE CLAIM GATE
//      (lib/deliverable/claims.ts). The narrator is handed SETTLED SENTENCES and
//      NOTHING ELSE — no ZIP rows, no value list, no set of any kind. Every count,
//      ranking and range in this email is computed in CODE. It writes the one honest
//      read. It does not choose cells, layout, figures, or relations.
//   6. FRAMING — the month's pulse for the named place: the chart is the lead, the
//      stats are the hook, the read closes. The source + as-of ride the chart
//      caption in MM/DD/YYYY — never the raw internal token.
//
// ── WHAT WE CAN ACTUALLY SOURCE (verified 07/13/2026, not assumed) ─────────────
// `brains/home-values-swfl.md` → detail_table `home_values_by_zip`, grain `zip`:
// 109 SWFL ZIP rows, and **all 109 carry a non-null `value_mom_pct`** alongside
// `home_value_zhvi` (USD) and `value_yoy_pct`, at a single uniform period
// (2026-04-30). Source: Zillow Home Value Index (ZHVI), ZIP-level all-homes.
// So a month-over-month move per ZIP is REAL and held — Cape Coral resolves 6 of 6
// ZIPs, Fort Myers 10 of 10. The showcase's "all ten ZIP deltas" is sourceable.
//
// ⚠️ THE ONE HONESTY LIMIT: the ranked-delta frame renders a MAXIMUM OF 8 ROWS
// (MAX_ROWS in ranked-delta-bind.ts; rankedDeltaSvg slices to 8). A place spanning
// more than 8 ZIPs therefore SHOWS 8 bars. We never let the copy claim "every ZIP"
// while shipping fewer: `chartTitleFor` says "top N by value" whenever the ZIP set
// is truncated, and the narrator is told exactly how many bars the reader can see.
//
// ⚠️ WHY THE CHART IS NOT `buildChartForQuestion`: it CANNOT emit this chart.
// `findRankedDeltaPair` (chart-from-metrics.mts) pairs a value column with the
// FIRST delta column sharing a token stem — and `value_yoy_pct` is declared before
// `value_mom_pct` on this table, so the shared producer always binds YEAR-over-year.
// Shipping a YoY chip under a "month-over-month" headline is exactly the class of
// lie this playbook exists to stop. So we hand `bindRankedDeltaSpec` — the SAME one
// binder, the SAME registry frame, the SAME SVG builder, the SAME PNG host — a
// table PROJECTED to the MoM delta column. No second binder, no second producer, no
// number the model ever sees before it is drawn. See the report: the clean fix is a
// delta-column preference on `bindRankedDeltaSpec`, which collapses this to one root.
//
// ── THE CLAIM GATE — WHY THE NARRATOR NO LONGER SEES THE ZIP ROWS ──────────────
//
// THE DEFECT (live, 07/13/2026): handed the six Cape Coral rows and told "do not
// count the ZIPs yourself", Sonnet wrote **"Five of those six ZIPs"** — and the true
// answer was FOUR. Every underlying figure was correctly sourced. What was invented
// was the CLAIM DRAWN BETWEEN them. A word-count carries no digits, so the number
// lint sailed straight past it, and the hand-rolled WORD_COUNT_RE that used to live
// in this file was reproducibly bypassed in the live build.
//
// You cannot enumerate your way out of natural language, and you cannot instruct a
// model out of a set it is holding. **A MODEL GIVEN A SET WILL COUNT IT.** So it is
// no longer given one:
//
//   1. CODE computes every relation — the counts (`settledCount`), the ranking, the
//      range, the coverage — in `settledPulseFacts` below.
//   2. The narrator receives those as SETTLED ENGLISH SENTENCES and NOTHING ELSE.
//      `pulseUserMessage` takes `SettledClaim[]`, not `ZipMove[]` — the SIGNATURE is
//      the gate. There is no row list, no value array, no `moves` in the prompt. It
//      cannot count six ZIPs it was never shown six of.
//   3. CODE ALSO WRITES EVERY FACTUAL SENTENCE. The model contributes only the closing
//      sentence, and that sentence may contain NO DIGIT AT ALL (`auditConnective` runs
//      `auditClaims` with an EMPTY settled set, so every claim shape fires and every
//      numeral is unanchored). The model cannot invert a comparison or miscount a set
//      because it does not write comparisons or counts.
//
//      This is not belt-and-braces, it is the measured fix. Told to copy the settled
//      sentences VERBATIM, Sonnet copied them and glued a clause on ("All 6 ZIPs
//      tracked here moved lower this month, and the moves were narrow throughout") —
//      three drafts out of three, every one of them TRUE, every one of them dropped,
//      because the extra clause breaks `auditClaims`' verbatim exemption and the gate
//      then flags CODE's own claim inside the model's sentence. A gate that eats true
//      prose is the failure claims.ts warns about in its own header. So the model
//      stopped retyping facts. Now the spine is verbatim BY CONSTRUCTION.
//   4. `CLAIM_PROHIBITION` is printed into the system prompt, so the model is told the
//      exact rule the lint enforces.
//   5. FAIL-CLOSED, WITH A CODE-AUTHORED FLOOR: a bad closing sentence is DROPPED and
//      the settled spine still ships (every sentence in it is code's). If the ASSEMBLED
//      paragraph somehow still fails `auditRead`, the whole read becomes an OPEN SLOT —
//      never shipped, never best-effort. A missing paragraph is honest; a confident
//      false one is not.
//
// The done-condition here is structural and greppable: **`pulseUserMessage` cannot
// receive a set — its parameter type is `SettledClaim[]`** (proved in the test, which
// asserts every numeral in the prompt is one CODE settled, and that the mid-pack rows
// are literally absent from it).

import { fetchBrain } from "@/lib/fetch-brain";
import { bindRankedDeltaSpec } from "@/lib/deliverable/ranked-delta-bind";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
} from "@/lib/deliverable/chart-coherence";
import { chartImageBlock, upsertChartBlock } from "@/lib/email/inject-chart";
import { seedById } from "@/lib/email/doc/default-docs";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
import {
  auditClaims,
  numeralsIn,
  settledCount,
  CLAIM_PROHIBITION,
  type ClaimViolation,
  type SettledClaim,
} from "@/lib/deliverable/claims";
import { formatDisplayDate } from "@/lib/format-date";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { clearNarrativeSlots, dropEmptyChartSlot, fillNarrative } from "./shared";
import type { RecipeBuildContext } from "./index";
import type { EmailDoc, EmailBlock, StatItem } from "@/lib/email/doc/types";
import type { BrainOutput, BrainOutputDetailTable } from "@/refinery/types/brain-output.mts";

/** The brain that holds the ZIP-grain home-value level AND its month-over-month
 *  move. One fetch returns EVERY covered ZIP in one table — so a multi-ZIP city
 *  needs no cross-ZIP merge and no second fetch per ZIP. */
const HOME_VALUES_BRAIN = "home-values-swfl";
const VALUE_COL = "home_value_zhvi";
const MOM_COL = "value_mom_pct";
const YOY_COL = "value_yoy_pct";
/** The ranked-delta frame draws at most 8 rows (ranked-delta-bind MAX_ROWS +
 *  rankedDeltaSvg's own slice). Anything above this is TRUNCATED, and the copy must
 *  say so rather than claim "every ZIP". */
const CHART_MAX_ROWS = 8;

/** One ZIP's month, exactly as the brain published it. Nothing derived. */
export interface ZipMove {
  zip: string;
  city: string | null;
  /** ZHVI home value, USD — verbatim from `home_value_zhvi`. */
  value: number;
  /** Month-over-month % — verbatim from `value_mom_pct`. */
  mom: number;
  /** The period the row is for (ISO) — the DATA's as-of, not the build's. */
  period: string | null;
}

/** The resolved AREA subject: the place name and every ZIP it spans. */
interface AreaSubject {
  place: string;
  zips: string[];
}

/** RESOLVE THE SUBJECT ONCE. A door that carried a ZIP wins (the map / report
 *  "email this" door); otherwise read the place the user named in the prompt, from
 *  the sourced crosswalk. NEVER a second resolver, NEVER a model inference. */
export function resolveArea(ctx: RecipeBuildContext): AreaSubject | null {
  if (ctx.zip) return { place: ctx.zip, zips: [ctx.zip] };
  const hit = zipFromPromptPlace(ctx.prompt);
  return hit ? { place: hit.place, zips: hit.zips } : null;
}

function cellNum(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function cellStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** The ZIP-grain table that carries BOTH a home value and its month-over-month
 *  move. Null when the brain doesn't hold that shape — we degrade, never fake it. */
function momTable(output: BrainOutput): BrainOutputDetailTable | null {
  for (const t of output.detail_tables ?? []) {
    if (t.grain !== "zip") continue;
    const ids = new Set(t.columns.map((c) => c.id));
    if (ids.has(VALUE_COL) && ids.has(MOM_COL)) return t;
  }
  return null;
}

/** Every held ZIP row for the resolved area, in the brain's own numbers.
 *  A ZIP the brain doesn't cover is simply ABSENT — never a zero, never a guess. */
export function movesForZips(table: BrainOutputDetailTable, zips: string[]): ZipMove[] {
  const want = new Set(zips);
  const out: ZipMove[] = [];
  for (const r of table.rows) {
    if (!want.has(r.key)) continue;
    const value = cellNum(r.cells[VALUE_COL]);
    const mom = cellNum(r.cells[MOM_COL]);
    // BOTH must parse. A row missing either one cannot be plotted or quoted, so it
    // is dropped rather than plotted at zero (a fake flat month is still a lie).
    if (value === null || mom === null) continue;
    out.push({
      zip: r.key,
      city: cellStr(r.cells.city),
      value,
      mom,
      period: cellStr(r.cells.latest_period),
    });
  }
  return out;
}

/** "-0.39" → "−0.39%" · "0.21" → "+0.21%". The sign is the whole point of the
 *  number, so it is never dropped. */
export function fmtMom(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** The ZIP that moved the most this month, in EITHER direction — a selection out of
 *  the held rows, not a computation over them. */
export function biggestMover(moves: ZipMove[]): ZipMove | null {
  if (!moves.length) return null;
  return moves.reduce((a, b) => (Math.abs(b.mom) > Math.abs(a.mom) ? b : a));
}

/**
 * The chart's title. It NEVER claims "every ZIP" when the reader is shown fewer.
 *
 * TWO different things can shrink the set, and the title tells the truth about both:
 *   • COVERAGE — the place spans 9 ZIPs but the brain publishes a value for 8 of them
 *     (Fort Myers: 33902 is a PO-box ZIP with no ZHVI row). → "8 of 9 ZIPs".
 *   • TRUNCATION — the ranked-delta frame draws at most 8 bars, and the binder keeps
 *     the 8 highest-valued. → "top 8 of 12 ZIPs by value".
 *
 * Kept SHORT on purpose: rankedDeltaSvg draws the title at x=150 in a 600px canvas,
 * so a title much past ~50 characters runs off the right edge of the PNG.
 */
export function chartTitleFor(
  place: string,
  shown: number,
  held: number,
  requested: number,
): string {
  if (shown >= requested) return `${place} · month-over-month move by ZIP`;
  if (shown < held) return `${place} · month-over-month move (top ${shown} of ${requested})`;
  return `${place} · month-over-month move (${shown} of ${requested} ZIPs)`;
}

/**
 * The customer-safe form of a source citation.
 *
 * The brain's citation ends with our own plumbing — "; Tier 2 cache:
 * data_lake.zhvi_swfl." — and that string is rendered TWICE at a recipient: once in
 * the email caption, and once BURNED INTO THE CHART PNG (rankedDeltaSvg draws
 * `source` inside the image). An internal table name is not a source; no internal
 * system noun reaches a reader. Cut at the cache boundary, keep the sentence that
 * actually names the source, and clamp — the citation is never REWRITTEN, only
 * scrubbed and trimmed at a boundary it already has.
 */
export function publicCitation(citation: string): string {
  const cut = citation.split(/;\s*Tier\s*\d\s*cache/i)[0].trim();
  const firstSentence = cut.split(/(?<=\.)\s+(?=[A-Z])/)[0].trim();
  return (firstSentence || cut).replace(/[;,]\s*$/, "");
}

/**
 * The source's NAME — for the caption drawn INSIDE the chart PNG.
 *
 * VERIFIED BY LOOKING AT THE SENT PNG (07/13/2026): `rankedDeltaSvg` draws its
 * source line at x=150 on a 600px canvas with NO wrapping and NO clamping, so the
 * full ZHVI descriptor ran off the right edge — and the "· as of 04/30/2026" was
 * clipped clean off the image. An as-of the reader cannot see is an as-of we did not
 * state. The full descriptor still rides in the email's caption line directly under
 * the image; the PNG gets the source's name, which is what a chart caption is for.
 */
export function shortCitation(citation: string): string {
  const pub = publicCitation(citation);
  const name = pub.split(",")[0].trim();
  return name.length >= 8 && name.length <= 60 ? name : pub.slice(0, 60).trim();
}

/** The line under the chart. The EmailDoc schema caps a caption at 200 characters —
 *  a longer one fails validation and the whole build silently falls through to the
 *  generic author. The title and the as-of are load-bearing, so they are never the
 *  thing that gets cut; the citation takes the trim. */
export function chartCaption(title: string, citation: string, asOfDisplay: string): string {
  const tail = asOfDisplay ? ` · as of ${asOfDisplay}` : "";
  const head = `${title} — `;
  const room = 200 - head.length - tail.length;
  if (room <= 0) return `${title}${tail}`.slice(0, 200);
  const cite =
    citation.length <= room ? citation : citation.slice(0, room).replace(/[\s,;.(]+\S*$/, "");
  return `${head}${cite}${tail}`;
}

/**
 * THE CHART — `zip-mom-move`, built in code from the audited brain rows.
 *
 * Bars = each ZIP's ZHVI home value. Chip = that ZIP's OWN month-over-month %,
 * rendered VERBATIM as the source published it (a % stays a %, never back-solved
 * into a dollar amount that exists in no source — data protocol rule 4).
 *
 * The projection: we hand the shared binder the table with the YoY column REMOVED,
 * because `findRankedDeltaPair` takes the FIRST delta column that shares a stem and
 * would otherwise bind YoY under a month-over-month headline. Same binder, same
 * frame, same SVG, same PNG host — only the delta COLUMN is chosen by us, which is
 * precisely what this recipe's declared chart policy names.
 */
export function momChartSpec(
  output: BrainOutput,
  table: BrainOutputDetailTable,
  moves: ZipMove[],
  place: string,
  requestedZips: number = moves.length,
): ReturnType<typeof bindRankedDeltaSpec> {
  if (!moves.length) return null;
  const keep = new Set(moves.map((m) => m.zip));
  const projected: BrainOutputDetailTable = {
    ...table,
    columns: table.columns.filter((c) => c.id !== YOY_COL),
    rows: table.rows.filter((r) => keep.has(r.key)),
  };
  const spec = bindRankedDeltaSpec(
    { ...output, detail_tables: [projected] },
    {
      title: chartTitleFor(
        place,
        Math.min(moves.length, CHART_MAX_ROWS),
        moves.length,
        requestedZips,
      ),
    },
  );
  if (!spec) return null;

  // AS-OF IS THE DATA'S PERIOD, NOT THE BUILD'S. `bindRankedDeltaSpec` stamps the
  // brain's `refined_at` (when we last rebuilt), but the reader is being told when
  // the MARKET was measured — the ZHVI period on the row (04/30/2026). Those are
  // different months, and the caption must carry the one that is true of the number.
  const period = moves.find((m) => m.period)?.period;
  return {
    ...spec,
    ...(period ? { asOf: period } : {}),
    // Scrub our own plumbing out of the citation BEFORE it is drawn into the PNG, and
    // keep it SHORT enough to actually fit inside the image (see shortCitation).
    ...(spec.source
      ? { source: { ...spec.source, citation: shortCitation(spec.source.citation ?? "") } }
      : {}),
  };
}

/** How the month actually broke down — COMPUTED IN CODE, handed to the narrator as a
 *  fact. The model is never left to count the rows itself: asked to, it wrote "five
 *  of the six ZIPs" over a set where the true answer was four (live, 07/13/2026).
 *  Numbers are computed in code; the model only selects from what it is given. */
export interface MonthTally {
  total: number;
  fell: number;
  rose: number;
  flat: number;
  uniform: boolean;
}

export function tally(moves: ZipMove[]): MonthTally {
  const fell = moves.filter((m) => m.mom < 0).length;
  const rose = moves.filter((m) => m.mom > 0).length;
  const flat = moves.filter((m) => m.mom === 0).length;
  const total = moves.length;
  return { total, fell, rose, flat, uniform: fell === total || rose === total };
}

/**
 * EVERY RELATION IN THIS EMAIL, DECIDED BY INTEGER COMPARISON — never by a model.
 *
 * This is the whole fix. The narrator used to be handed the ZIP ROWS and told not to
 * count them; it counted them, and it counted them WRONG ("five of those six ZIPs";
 * the answer was four). A model given a set will count the set. So the set stops here:
 * this function turns the rows into SETTLED ENGLISH SENTENCES, and those sentences —
 * not the rows — are the only thing `authorPulseRead` ever sends.
 *
 * Every sentence below is a claim CODE is making, and each is checkable by hand:
 *   • COVERAGE  — `settledCount(held, spans)` → "8 of 9 ZIPs in Fort Myers…", never
 *                 "every ZIP" while we hold fewer.
 *   • DIRECTION — `settledCount(fell|rose|flat, total)`. THE DEFECT'S DIRECT FIX.
 *   • THE MOVER + THE SPREAD — a ranking IS a comparison, so CODE ranks (max |move|)
 *                 and CODE takes the min/max. The HIGHEST-VALUE ZIP is deliberately not
 *                 a sentence: it is already a stat cell, and a read that recites the
 *                 stat row is this recipe's own definition of a failed read.
 *   • TRUNCATION — the frame draws 8 bars; if the place has more ZIPs, the copy says so.
 *   • AS-OF     — MM/DD/YYYY, stated once, never the raw internal token.
 *
 * The noun is "ZIPs tracked here" and not "tracked ZIPs" ON PURPOSE: `auditClaims`'
 * WORD_COUNT check keys on a quantifier sitting directly before the word "ZIPs", so a
 * paraphrase like "four of the six ZIPs tracked here" is still caught. Put a word
 * between the count and the noun and you open the exact hole this gate exists to close.
 */
export function settledPulseFacts(opts: {
  place: string;
  moves: ZipMove[];
  /** How many ZIPs the place actually spans (coverage denominator). */
  requested: number;
  /** How many bars the chart can actually draw (truncation). */
  shown: number;
  asOf: string;
}): SettledClaim[] {
  const { place, moves, requested, shown, asOf } = opts;
  const out: SettledClaim[] = [];
  if (!moves.length) return out;

  const settle = (sentence: string): SettledClaim => ({ sentence, anchors: numeralsIn(sentence) });
  const t = tally(moves);
  const NOUN = "ZIPs tracked here";

  // COVERAGE — the honest "8 of 9", and ONLY when there is a gap worth being honest
  // about. Full coverage needs no sentence; the direction count below already carries
  // the denominator. A single-ZIP subject has no coverage story at all.
  if (requested > 1 && t.total < requested) {
    out.push(
      settledCount(t.total, requested, {
        noun: `ZIPs in ${place}`,
        predicate: "carry a published home value this month",
      }),
    );
  }

  // DIRECTION — the count the model got wrong, now an integer filter. Zero-count
  // directions are OMITTED: "0 of 6 ZIPs rose" is noise, not a fact worth a sentence.
  if (t.total >= 2) {
    if (t.fell)
      out.push(settledCount(t.fell, t.total, { noun: NOUN, predicate: "moved lower this month" }));
    if (t.rose)
      out.push(settledCount(t.rose, t.total, { noun: NOUN, predicate: "moved higher this month" }));
    if (t.flat)
      out.push(settledCount(t.flat, t.total, { noun: NOUN, predicate: "held flat this month" }));
  } else {
    const only = moves[0];
    const dir = only.mom < 0 ? "moved lower" : only.mom > 0 ? "moved higher" : "held flat";
    out.push(settle(`ZIP ${only.zip} ${dir} this month, at ${fmtMom(only.mom)}.`));
  }

  // THE MOVER AND THE SPREAD — a ranking IS a comparison, so CODE ranks. Together these
  // are the read's actual job: whether the month was broad or concentrated.
  //
  // The HIGHEST-VALUE ZIP is deliberately NOT here. It is already a stat cell, and a
  // paragraph that restates the stat row is the recipe's own definition of a failed read.
  if (t.total >= 2) {
    const mover = biggestMover(moves)!;
    out.push(settle(`The largest monthly move was ZIP ${mover.zip}, at ${fmtMom(mover.mom)}.`));
    const lo = Math.min(...moves.map((m) => m.mom));
    const hi = Math.max(...moves.map((m) => m.mom));
    if (lo !== hi) out.push(settle(`The monthly moves span ${fmtMom(lo)} to ${fmtMom(hi)}.`));
  }

  // TRUNCATION — the reader sees 8 bars; the copy never implies they saw twelve.
  if (shown < t.total) {
    out.push(settle(`The chart shows ${shown} of the ${t.total} ${NOUN}, ranked by home value.`));
  }

  // THE AS-OF — MM/DD/YYYY, once. Its digits are also what anchor the date in the prose.
  if (asOf) out.push(settle(`These figures are as of ${asOf}.`));

  return out;
}

/**
 * Typographic variance is not a claim.
 *
 * `auditClaims` exempts a settled sentence the narrator restates VERBATIM by substring
 * match. Our sentences carry a U+2212 minus ("−0.39%"); a model that retypes it with an
 * ASCII hyphen has restated the SAME fact, but the substring match misses — and the
 * settled sentence then gets audited as if the model had derived it, and an honest
 * paragraph is dropped to an open slot for a glyph.
 *
 * So normalize BOTH sides identically before auditing. This changes no claim and
 * relaxes no check — every regex in claims.ts and every numeral it extracts is
 * indifferent to which dash character was typed.
 */
function normalizeGlyphs(s: string): string {
  return s
    .replace(/[−–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Run the fail-closed backstop over an assembled paragraph. Exported so the test can
 *  prove the gate catches the exact sentence that shipped on 07/13/2026. */
export function auditRead(read: string, settled: readonly SettledClaim[]): ClaimViolation[] {
  return auditClaims(
    normalizeGlyphs(read),
    settled.map((s) => ({ ...s, sentence: normalizeGlyphs(s.sentence) })),
  );
}

/**
 * THE CONNECTIVE'S GATE — `auditClaims` at FULL STRENGTH, with an EMPTY settled set.
 *
 * Passing `[]` means nothing is exempt and no numeral is anchored: every claim shape
 * fires, and ANY digit at all is an `unanchored-number`. That is exactly right. The
 * connective is the one part of the paragraph the model owns, and the model owns NO
 * QUANTITIES — not even a true one. Every number, count, ranking, range and date in this
 * read is written by `settledPulseFacts`. The model writes the sentence that has no facts
 * in it, and if it smuggles one in, its sentence is thrown away and the code-authored
 * spine ships alone.
 */
export function auditConnective(text: string): ClaimViolation[] {
  return auditClaims(normalizeGlyphs(text), []);
}

/**
 * THE READ = CODE'S SENTENCES + THE MODEL'S ONE NON-FACTUAL SENTENCE.
 *
 * WHY THE MODEL NO LONGER RETYPES A FACT (measured live, 07/13/2026, three of three
 * drafts): handed the settled sentences and told to copy them verbatim, Sonnet copied
 * them and then GLUED A CLAUSE ON — "All 6 ZIPs tracked here moved lower this month,
 * and the moves were narrow throughout." Every one of those drafts was TRUE. But the
 * added clause breaks `auditClaims`' verbatim-restatement exemption, so the gate then
 * flagged the code-authored claim sitting inside the model's sentence, and all three
 * honest paragraphs were dropped to an open slot. A gate that eats true prose is the
 * failure mode claims.ts warns about in its own header.
 *
 * So the model is no longer asked to retype a fact. CODE concatenates the settled
 * sentences — they are verbatim BY CONSTRUCTION, and therefore exempt by construction —
 * and the model contributes only the closing sentence, which is permitted no quantities
 * at all. The model cannot invert a comparison, miscount a set, or invent a range,
 * because it does not write any of them.
 */
export function composePulseRead(
  settled: readonly SettledClaim[],
  connective: string | null,
): string {
  const spine = settled.map((s) => s.sentence).join(" ");
  const tail = (connective ?? "").trim();
  return tail ? `${spine} ${tail}` : spine;
}

/** THE ENTIRE USER MESSAGE THE NARRATOR EVER SEES.
 *
 *  It takes `SettledClaim[]` — NOT `ZipMove[]`. That type signature IS the gate: there
 *  is no parameter here through which a row, a value list, or a set of any kind could
 *  reach the model. Exported so the test can assert it, rather than trusting a grep. */
export function pulseUserMessage(place: string, settled: readonly SettledClaim[]): string {
  return (
    `PLACE: ${place}\n\n` +
    `THE PARAGRAPH SO FAR — already written, in code. You are NOT rewriting these, and you ` +
    `are NOT restating them. They will appear above your sentence:\n` +
    settled.map((s) => `${s.sentence}`).join("\n") +
    `\n\nNow write the ONE closing sentence (two at the very most) that follows them. No ` +
    `numbers.`
  );
}

/** The narrator's system prompt. It PRINTS `CLAIM_PROHIBITION` verbatim, so the model is
 *  told the exact rule `auditClaims` enforces — a violation is then a refusal to follow
 *  an explicit instruction rather than a surprise. */
export function pulseSystemPrompt(shown: number): string {
  return (
    `You write the CLOSING SENTENCE of the honest read in a monthly market-pulse email for ` +
    `a real-estate agent's list.\n\n` +
    `WHAT THIS EMAIL IS: a monthly newsletter. Recurring, plain, and useful — the reader ` +
    `opens it to find out which way their area moved last month. Consistent and calm beats ` +
    `dramatic; this lands every month.\n\n` +
    `WHAT THE READER ALREADY SEES: a chart of ${shown} ZIP${shown === 1 ? "" : "s"} — each ` +
    `ZIP's home value as a bar, with its monthly move as a chip — a stat row, and the ` +
    `sentences printed below, which are ALREADY WRITTEN and will sit directly above yours.\n\n` +
    `YOUR JOB IS THE ONE SENTENCE THOSE FACTS DO NOT CONTAIN: what the month means, whether ` +
    `it is broad or concentrated, and what a single month does not tell anyone. One ` +
    `sentence. Two at the very most.\n\n` +
    `YOU HAVE NOT BEEN GIVEN THE ZIP ROWS, AND YOU WILL NOT BE. You cannot see the ` +
    `individual values or moves, so you cannot count, rank, or compare them — every count, ` +
    `ranking and range in this email was computed in code and is already written above.\n\n` +
    `**WRITE NO NUMBER. NOT ONE DIGIT.** Not a percentage, not a ZIP, not a dollar figure, ` +
    `not a date, not a count — not even one that appears in the sentences above. Those ` +
    `sentences already say them; your sentence is the part with no numbers in it. A digit ` +
    `in your sentence gets your sentence thrown away.\n\n` +
    `DO NOT RESTATE, SUMMARIZE, OR REFER BACK TO the sentences above ("as shown", "these ` +
    `moves"). Do not open with a connector that leans on them ("That said", "Still"). Write ` +
    `a sentence that stands on its own and adds the meaning.\n\n` +
    CLAIM_PROHIBITION +
    `\n\n` +
    `PHRASING (these get your sentence thrown away, so read them):\n` +
    `- Never write a word about movement over time — not "cooling", "rebounding", ` +
    `"rising", "falling", "widening", "trending", "momentum", "steady", "slowing" — not ` +
    `even to deny one. One month is a LEVEL, not a DIRECTION.\n` +
    `- Never write a count or a grouping — not "every ZIP", not "most of them", not "half".\n` +
    `- Never compare anything to anything — no "above", "below", "in line with", "the ` +
    `highest", "the largest".\n` +
    `- Do not forecast, and do not tell anyone to buy or sell. Never guess WHY values ` +
    `moved, and never label a ZIP "entry-level" or "luxury".\n` +
    `- No hype ("stunning", "red hot", "won't last"), no exclamation marks, no corporate ` +
    `filler ("in today's dynamic market"). Plain, confident, specific.\n\n` +
    `Return ONLY your closing sentence.`
  );
}

/**
 * The one honest read.
 *
 * THE NARRATOR RECEIVES NO ROWS — no values, no moves, no ZIP list, nothing it could draw
 * a relation from. And it now writes no fact either: CODE writes every factual sentence,
 * the model writes the closing sentence, and that sentence is permitted no quantities.
 *
 * FAIL-CLOSED, WITH A CODE-AUTHORED FLOOR. The model's sentence is audited against an
 * EMPTY settled set (nothing exempt, no digit anchored). Violate, and its sentence is
 * DROPPED — and the read still ships, because the spine underneath it is entirely code's
 * own settled sentences. Then the ASSEMBLED paragraph is audited once more; if even that
 * fails, the whole read becomes an OPEN SLOT. A paragraph we cannot trace never ships.
 */
async function authorPulseRead(opts: {
  place: string;
  settled: SettledClaim[];
  shown: number;
}): Promise<string | null> {
  const { place, settled, shown } = opts;
  if (!settled.length) return null;

  const system = pulseSystemPrompt(shown);
  const user = pulseUserMessage(place, settled);

  const ask = async (userMsg: string): Promise<string | null> => {
    try {
      const msg = await getAnthropic("email_build").messages.create({
        model: EMAIL_MODEL_SONNET,
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: userMsg }],
      });
      const txt = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      return txt || null;
    } catch {
      return null;
    }
  };

  let connective: string | null = null;
  const first = await ask(user);
  if (first) {
    const bad = auditConnective(first);
    if (!bad.length) connective = first;
    else {
      // ONE repair round, naming the offending shapes.
      const retry = await ask(
        `${user}\n\nYour previous sentence asserted things you were NOT given — each of ` +
          `these is a claim you invented or a number you may not write:\n` +
          bad.map((b) => `- ${b.kind}: "${b.match}"`).join("\n") +
          `\n\nWrite it again with NO number and NO claim — no count, no comparison, no ` +
          `direction of travel. Just the meaning. A shorter true sentence beats a longer ` +
          `one that guesses.`,
      );
      const stillBad = retry ? auditConnective(retry) : [{ kind: "motive", match: "no reply" }];
      if (retry && !stillBad.length) connective = retry;
      else {
        // The model's sentence is DROPPED. The read still ships — the spine below it is
        // code's own settled sentences, every one of them true by construction.
        console.warn(
          "[market-pulse] closing sentence rejected twice — shipping the settled spine alone:",
          stillBad.map((v) => `${v.kind}:"${v.match}"`).join(", "),
        );
      }
    }
  }

  const read = composePulseRead(settled, connective);

  // THE LAST GATE. The spine is exempt by construction; this catches anything that got
  // past the connective's own audit once the two are sitting in one paragraph. On a hit,
  // there is no "best effort" — the read becomes an OPEN SLOT.
  const bad = auditRead(read, settled);
  if (bad.length) {
    console.warn(
      "[market-pulse] assembled read failed the claim gate — leaving it an open slot:",
      bad.map((v) => `${v.kind}:"${v.match}"`).join(", "),
    );
    return null;
  }
  return read;
}

/** Carry the agent's brand through: globalStyle + the identity blocks (header,
 *  agent card, footer) are STICKY — lifted from the canvas, never authored here. */
function withStickyBrand(seed: EmailDoc, current: EmailDoc): EmailDoc {
  const STICKY: ReadonlySet<EmailBlock["type"]> = new Set(["header", "agent-card", "footer"]);
  return {
    ...seed,
    globalStyle: { ...current.globalStyle },
    blocks: seed.blocks.map((b) => {
      if (!STICKY.has(b.type)) return b;
      const mine = current.blocks.find((c) => c.type === b.type);
      // Keep the seed's id + grid layout; take the canvas's brand PROPS.
      return mine ? ({ ...b, props: { ...mine.props } } as EmailBlock) : b;
    }),
  };
}

/** Replace the first `stats` block's cells. A cell with an empty value is an OPEN
 *  SLOT: the canvas shows the label as an instruction to fill it, and the sent email
 *  drops it (BlockRenderer `emailRender`). Never a zero. */
function fillStats(doc: EmailDoc, stats: StatItem[]): EmailDoc {
  let done = false;
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (done || b.type !== "stats") return b;
      done = true;
      return { ...b, props: { ...b.props, stats } };
    }),
  };
}

/** Tag the seed's reserved image slot as the CHART slot, so `upsertChartBlock`
 *  replaces it IN PLACE (id + grid position preserved) instead of inserting a second
 *  image, and so `dropEmptyChartSlot` can remove it cleanly if no chart resolves.
 *  (upsertChartBlock matches on `kind === "chart"`; an untagged empty seed slot
 *  matches nothing, which is how you end up with an empty box AND a stray chart.) */
function markChartSlot(doc: EmailDoc): EmailDoc {
  let done = false;
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (done || b.type !== "image") return b;
      done = true;
      return { ...b, props: { ...b.props, kind: "chart" as const, url: b.props.url ?? "" } };
    }),
  };
}

export async function buildMarketPulse(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { currentDoc } = ctx;

  // 1 · SUBJECT — resolved once, from the sourced place crosswalk. No place named →
  //     fall through to the generic author (a degrade, never a refusal: RULE 0.7).
  const area = resolveArea(ctx);
  if (!area) return null;

  // 2 · THE HELD ROWS — one brain, one table, EVERY covered ZIP. A multi-ZIP city
  //     needs no merge: the table already carries all 109 SWFL ZIPs, so we simply
  //     take the rows for the ZIPs this place spans.
  const brain = await fetchBrain(HOME_VALUES_BRAIN, { tier: 2 }).catch(() => null);
  if (!brain) return null;
  const table = momTable(brain.output);
  if (!table) return null;
  const moves = movesForZips(table, area.zips);
  // We hold no month-over-month row for this place. There is nothing true to plot and
  // nothing true to say, so we hand the build to the generic author rather than ship
  // an empty pulse. (Never invent a delta. Never refuse the build.)
  if (!moves.length) return null;

  const mover = biggestMover(moves)!;
  const topByValue = [...moves].sort((a, b) => b.value - a.value)[0];
  const asOfIso = moves.find((m) => m.period)?.period ?? null;
  const asOf = asOfIso ? formatDisplayDate(asOfIso) : "";
  const shown = Math.min(moves.length, CHART_MAX_ROWS);

  // 3 · SKELETON — the committed grid, with the agent's brand carried through.
  const seed = seedById("trend-snapshot");
  if (!seed) return null;
  let doc = markChartSlot(withStickyBrand(seed.build(), currentDoc));

  // 4 · CELLS — three stats, each a value copied out of ONE ZIP row. Nothing blended.
  //     The mover's ZIP and the top ZIP are named in the label so the number is never
  //     an anonymous figure floating over six ZIPs.
  doc = fillStats(doc, [
    {
      value: fmtMom(mover.mom),
      label: `Biggest monthly move · ZIP ${mover.zip}`,
    },
    {
      value: fmtUsd(topByValue.value),
      label: `Highest home value · ZIP ${topByValue.zip}`,
    },
    {
      value: String(moves.length),
      label: moves.length === 1 ? "ZIP covered" : "ZIPs covered",
    },
  ]);

  // 5 · CHART — zip-mom-move. Real numbers only; the model never sees them first.
  const spec = momChartSpec(brain.output, table, moves, area.place, area.zips.length);
  let charted = false;
  if (spec) {
    const magnitude = chartMagnitudeFromSpec(spec);
    const coherence = assertHeroChartCoherence({
      hero: resolveHeadlineFigure(doc),
      chart: magnitude,
    });
    if (coherence.coherent) {
      const accent = doc.globalStyle.accentColor || "#3DC9C0";
      const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
      const key = `email-charts/zip-mom-move-${area.place.replace(/\W+/g, "-").toLowerCase()}-${spec.asOf ?? "x"}-${tint}.png`;
      const image = await chartSpecToEmailImage(spec, accent, key).catch(() => null);
      if (image) {
        // LANDMINE: upsertChartBlock's own comment says "id and position preserved",
        // but it rebuilds the block as { id, type, props } and DROPS `layout`. The
        // chart then has no grid position and the canvas stacks it out of place. Keep
        // the seed slot's layout and put it back. (Reported — the fix belongs in
        // inject-chart.ts, which I do not own.)
        const slotLayout = doc.blocks.find(
          (b) => b.type === "image" && b.props.kind === "chart",
        )?.layout;
        // Our own caption, not the bridge's: `chartImageCaption` composes
        // title + citation + as-of unclamped, which for this recipe overruns the
        // schema's 200-char cap — and a caption that fails EmailDocSchema doesn't
        // just lose the caption, it drops the ENTIRE build to the generic author.
        doc = upsertChartBlock(
          doc,
          chartImageBlock({
            url: image.url,
            alt: image.alt,
            // The PNG carries the source's NAME (it has ~450px); the caption line
            // under the image carries the FULL public descriptor (it has 200 chars).
            // Both name the same source, and both state the same as-of.
            caption: chartCaption(
              spec.title ?? image.alt,
              publicCitation(table.source.citation),
              asOf,
            ),
            linkUrl: brandWebsiteUrl(currentDoc),
          }),
        );
        if (slotLayout) {
          doc = {
            ...doc,
            blocks: doc.blocks.map((b) =>
              b.type === "image" && b.props.kind === "chart" && !b.layout
                ? { ...b, layout: slotLayout }
                : b,
            ),
          };
        }
        charted = true;
      }
    }
  }
  // An empty chart box is worse than no chart — a chart is a bonus, never a blocker.
  if (!charted) doc = dropEmptyChartSlot(doc);

  // 6 · PROSE — behind THE CLAIM GATE. Code settles every relation FIRST; the narrator
  //     is handed those sentences and NOTHING ELSE (no rows, no set, nothing to count).
  //     The seed prefills the text slot with its authoring instruction, and
  //     fillNarrative SKIPS a slot that already has content — so clear first, then
  //     author (the landmine that shipped 2,000 characters of raw copy on the flyer).
  const settled = settledPulseFacts({
    place: area.place,
    moves,
    requested: area.zips.length,
    shown,
    asOf,
  });
  const read = await authorPulseRead({ place: area.place, settled, shown });

  // CLEAR FIRST, ALWAYS — even when we have no read.
  //
  // The seed's text slot ships prefilled with its AUTHORING INSTRUCTION ("Read the
  // trend in plain language: what changed, why it matters..."). That sentence is
  // addressed to whoever fills the slot — it is NOT body copy. `fillNarrative` skips
  // a slot that already has content, so on the one build where the narrator was
  // rejected, that instruction sailed straight into the email body as if it were the
  // agent's own commentary (seen live, Fort Myers, 07/13/2026). Clearing
  // unconditionally makes the gap an EMPTY slot — an open slot on the canvas — rather
  // than a lie in the send.
  doc = clearNarrativeSlots(doc);
  if (read) doc = fillNarrative(doc, read);

  return doc;
}
