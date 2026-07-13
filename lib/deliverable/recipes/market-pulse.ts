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
//   5. PROSE — the `monthly-newsletter` voice. The narrator is handed the per-ZIP
//      rows and NOTHING else, and may not write a number that isn't in them. It
//      writes the one honest read. It does not choose cells, layout, or figures.
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
import { anchorsExactly, extractNumbers, normalizeNumber } from "@/lib/deliverable/narrative-lint";
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
interface ZipMove {
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

/** A word-count the model invented ("five of the six ZIPs"). It carries NO DIGITS,
 *  so the number gate cannot see it — and it was wrong the first time we looked. */
const WORD_COUNT_RE =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+of\s+(?:the\s+)?(?:\w+\s+)?zips?\b/i;
/** Unsourced grouping — a claim about "how many" that we never handed it. */
const VAGUE_GROUP_RE = /\b(most|majority|half|a few|several|a handful)\b/i;
/** A universal claim is only allowed when the month ACTUALLY was universal. */
const UNIVERSAL_RE = /\b(every|all|each)\s+(?:\w+\s+){0,2}zips?\b/i;

/** Every number in the read must be one we handed it, and every COUNT must be one we
 *  computed. Returns the offending tokens — empty means the paragraph is clean. */
export function readViolations(
  read: string,
  allowed: ReadonlySet<string>,
  t: MonthTally,
): string[] {
  const bad: string[] = [];
  for (const tok of extractNumbers(read)) {
    if (!anchorsExactly(tok, allowed)) bad.push(tok);
  }
  const wc = read.match(WORD_COUNT_RE);
  if (wc) bad.push(wc[0]);
  const vg = read.match(VAGUE_GROUP_RE);
  if (vg) bad.push(vg[0]);
  const uni = read.match(UNIVERSAL_RE);
  // "every ZIP fell" is a FACT when every ZIP did fall, and a fabrication when it
  // didn't. The tally — not the model — decides which.
  if (uni && !t.uniform) bad.push(uni[0]);
  return bad;
}

/** The numbers the narrator is allowed to write: the held row figures, the ZIPs, the
 *  computed counts, and the as-of date. Nothing else exists for it. */
export function allowedNumbers(moves: ZipMove[], t: MonthTally, asOf: string): Set<string> {
  const set = new Set<string>();
  const add = (s: string) => {
    const n = normalizeNumber(s);
    if (n) set.add(n);
  };
  for (const m of moves) {
    add(m.zip);
    add(String(m.value));
    add(String(m.mom));
    add(String(Math.abs(m.mom))); // the sign may ride in the words ("down 0.39%")
  }
  for (const c of [t.total, t.fell, t.rose, t.flat]) add(String(c));
  for (const part of asOf.split("/")) add(part);
  add(asOf.replace(/\//g, ""));
  return set;
}

/** The one honest read. The narrator gets the rows and NOTHING else, and may not
 *  write a number that is not among them. Prose only — never a cell, never a figure,
 *  never the layout. It is linted, retried ONCE on a violation, and if it still
 *  can't stay inside the facts the slot is left an OPEN SLOT — a paragraph we cannot
 *  verify never ships. */
async function authorPulseRead(opts: {
  place: string;
  moves: ZipMove[];
  mover: ZipMove;
  asOf: string;
  citation: string;
  shown: number;
  requested: number;
}): Promise<string | null> {
  const { place, moves, mover, asOf, citation, shown, requested } = opts;
  const t = tally(moves);
  const allowed = allowedNumbers(moves, t, asOf);
  const rows = moves
    .map(
      (m) =>
        `- ZIP ${m.zip}${m.city ? ` (${m.city})` : ""}: ${fmtUsd(m.value)}, ${fmtMom(m.mom)} month over month`,
    )
    .join("\n");

  const system =
    `You write the one honest read under a monthly market-pulse email for a real-estate ` +
    `agent's list. Three to five sentences, one paragraph.\n\n` +
    `WHAT THIS EMAIL IS: a monthly newsletter. Recurring, plain, and useful — the reader ` +
    `opens it to find out which way their area moved last month. Consistent and calm beats ` +
    `dramatic; this lands every month.\n\n` +
    `WHAT THE READER ALREADY SEES: a chart of ${shown} ZIP${shown === 1 ? "" : "s"} — each ` +
    `ZIP's home value as a bar, with its month-over-month move as a chip — and a stat row. ` +
    `Do NOT read the chart back to them ZIP by ZIP. Your job is the READ: what the pattern ` +
    `means, whether it is broad or concentrated, and what it does not tell us.\n\n` +
    `HARD RULES.\n` +
    `- Every number you write must appear VERBATIM in the ZIP ROWS or the TALLY below. ` +
    `You may not average them, total them, round them into a new figure, or describe a ` +
    `number you were not given. If a sentence needs a number you don't have, cut it.\n` +
    `- DO NOT COUNT THE ZIPS YOURSELF. The TALLY below already says how many rose, fell, ` +
    `and held flat — those are the only counts that exist. Never write "five of the six", ` +
    `"most ZIPs", "half of them", or any grouping you were not handed. (Asked to count, ` +
    `you will get it wrong, and a wrong count is a fabricated fact.)\n` +
    `- A month-over-month move is ONE MONTH. Never call it a year, a trend of years, a ` +
    `crash, or a recovery. Do not forecast, and do not tell anyone to buy or sell.\n` +
    `- Never add a claim of your own about the homes, the schools, the water, the weather, ` +
    `the "tier" or "segment" a ZIP belongs to, or WHY values moved — you were given values ` +
    `and their moves, and NOTHING else. Do not label a ZIP "entry-level" or "luxury".\n` +
    `- No hype ("stunning", "red hot", "won't last"), no exclamation marks, no corporate ` +
    `filler ("in today's dynamic market"). Plain, confident, specific.\n` +
    `- State the as-of date once, as ${asOf}. Do not invent a different date.\n\n` +
    `Return ONLY the paragraph.`;

  const tallyLine =
    `TALLY (computed in code — the ONLY counts that exist): of ${t.total} ZIPs, ` +
    `${t.fell} fell, ${t.rose} rose, ${t.flat} were flat.`;

  // COVERAGE HONESTY: we hold a value for the ZIPs below, not necessarily for every
  // ZIP the place spans (Fort Myers spans 9; the index publishes 8). "Every ZIP in
  // Fort Myers" would be an overclaim, so the qualifier is mandatory, not optional.
  const coverageLine =
    t.total < requested
      ? `COVERAGE: this place spans ${requested} ZIPs and we hold a value for ${t.total} of them. ` +
        `You may NOT say "every ZIP in ${place}" — say "every ZIP tracked here" or name the count.`
      : `COVERAGE: we hold a value for all ${t.total} ZIPs this place spans.`;

  const user =
    `PLACE: ${place}\n` +
    `AS OF: ${asOf}\n` +
    `SOURCE: ${citation}\n` +
    `${coverageLine}\n` +
    `${tallyLine}\n` +
    `THE BIGGEST MOVER (computed in code, not by you): ZIP ${mover.zip}, ${fmtMom(mover.mom)}\n\n` +
    `ZIP ROWS (the ONLY numbers you may use):\n${rows}\n\n` +
    `Write the read.`;

  const ask = async (userMsg: string): Promise<string | null> => {
    try {
      const msg = await getAnthropic("email_build").messages.create({
        model: EMAIL_MODEL_SONNET,
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: userMsg }],
      });
      const txt = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      return txt || null;
    } catch {
      return null;
    }
  };

  const first = await ask(user);
  if (!first) return null;
  const bad = readViolations(first, allowed, t);
  if (!bad.length) return first;

  // ONE repair round, naming the offenders. Then: if it still can't stay inside the
  // facts, the slot stays OPEN. An unverifiable paragraph never ships.
  const retry = await ask(
    `${user}\n\nYour previous draft asserted things you were NOT given:\n` +
      bad.map((b) => `- "${b}"`).join("\n") +
      `\n\nRewrite it using ONLY the ZIP ROWS and the TALLY. Do not count anything yourself, ` +
      `and do not round a figure into a new one — quote them exactly as written.`,
  );
  if (!retry) return null;
  const stillBad = readViolations(retry, allowed, t);
  if (!stillBad.length) return retry;
  // Operator-facing: the read is an OPEN SLOT, and we say why rather than shipping a
  // sentence we cannot trace. Never reaches the recipient.
  console.warn("[market-pulse] read rejected twice — leaving it an open slot:", stillBad);
  return null;
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

  // 6 · PROSE — the model writes the read. Nothing else. The seed prefills the text
  //     slot with its authoring instruction, and fillNarrative SKIPS a slot that
  //     already has content — so clear first, then author (the landmine that shipped
  //     2,000 characters of raw copy on the listing flyer).
  const read = await authorPulseRead({
    place: area.place,
    moves,
    mover,
    asOf,
    citation: publicCitation(table.source.citation),
    shown,
    requested: area.zips.length,
  });

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
