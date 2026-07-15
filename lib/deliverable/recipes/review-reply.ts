// lib/deliverable/recipes/review-reply.ts
//
// R11 · THE REVIEW REPLY — a reader replied REVIEW with their address; this is the
// email that goes back. One area, four numbers, one honest read.
//
// The six answers (playbook Part 6) — the ONLY things that differ between recipes:
//
//   1. SUBJECT — an AREA, not a house. `ctx.facts` is NULL here and staying that way
//      is the point: do not force the listing flyer on an area spine. The dispatcher
//      only hands us `ctx.zip` when a door passed `scope.kind === "zip"` — and the
//      Lab door passes NO scope at all, so the area lives only in the prompt text.
//      That is the same disease that sent every in-lab listing build to the free
//      author, one spine over. We read the area from the field OR the prompt, through
//      the ONE existing place root (`zipFromPromptPlace` → the sourced gazetteer) —
//      never a second crosswalk, never a bare regex.
//   2. SKELETON — the committed `neighborhood-report` grid (SEED_DOCS). It already IS
//      this email: "Area headline + KPIs, market chart …, agent commentary, CTA."
//      Its `signal` block is dropped and the chart widened to fill the row (see
//      buildGrid); everything else is the seed's own structure and order.
//   3. CELLS — the level (hero) + three KPIs: the value trend, days on market, active
//      inventory. Every one is a real lake figure carrying its own source and as-of.
//      An unsourced cell keeps its INSTRUCTION LABEL and an empty value: on the canvas
//      that is an open slot the user fills; on the sendable-HTML paths StatsBlock drops
//      it (and drops the row when none survive). Never a zero, never a naked label.
//   4. CHART — YES. This deliverable is genuinely ABOUT a number, and the chart is
//      about the SUBJECT: THIS area's own monthly home-value trend, read from
//      `data_lake.zhvi_zip_yoy_monthly`. NOT the 3-metro `zhvi-area` chart every other
//      caller reaches for — that one plots Cape Coral / Fort Myers / Naples no matter
//      which area you asked about, which is the "area index on a listing" mistake one
//      level up. The registry's `area-value-trend` policy had NO per-area producer
//      before this file; it does now (reported for extraction to a shared root).
//   5. PROSE — one paragraph, handed ONLY the four figures and the chart's own
//      endpoints, forbidden everything else — including a CAUSE it was not given.
//      When values are falling it says so.
//   6. FRAMING — "Your Home-Value Review" kicker, the level as the hero, the trend
//      chart, one read, one CTA. No pitch, no urgency, no "now is the time".
//
// LIVE PROOF: see the build report — every rendered field traced to `data_lake`.

import { createBlock, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { loadMarketFigures, type MarketFigure } from "@/lib/email/market-context";
import { figureCitations } from "@/lib/email/author-doc";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { PLACE_ZIP_CROSSWALK } from "@/refinery/lib/geography-gazetteer.mts";
// KNOWN-DEBT(data_lake: the per-ZIP monthly ZHVI view lives in the data_lake schema,
// which the generated types don't cover — same reason lib/email/market-context.ts and
// lib/charts/load-metro-trend.ts hold this hatch). Registered in
// verification/supabase-untyped-allowlist.json.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { chartSpecToEmailImage, type EmailChartImage } from "@/lib/email/spec-to-png";
import { chartImageBlock } from "@/lib/email/inject-chart";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
  parseHeroFigure,
} from "@/lib/deliverable/chart-coherence";
import { anchorsExactly, extractNumbers, normalizeNumber } from "@/lib/deliverable/narrative-lint";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { clearNarrativeSlots, fillNarrative } from "./shared";
import { finalizeDoc } from "@/lib/email/doc/finalize-doc";
import type { PlanEntry } from "@/lib/email/doc/finalize-doc";
import { GRID_COLS } from "@/lib/email/grid-schema";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { EmailBlock, EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";

/** The committed grid this recipe wears (lib/email/doc/default-docs.ts). */
const SKELETON_ID = "neighborhood-report";

// ── 1. THE SUBJECT: one area, resolved once, from the sourced crosswalk ───────

/** Every ZIP the sourced place↔ZIP crosswalk covers — built from the SAME gazetteer
 *  `zipFromPromptPlace` reads, so a ZIP we accept is always a ZIP we can name. Never
 *  a bare 5-digit regex on its own: a street number sails straight through that. */
const CROSSWALK_ZIPS: ReadonlySet<string> = new Set(
  PLACE_ZIP_CROSSWALK.entries.flatMap((e) => [e.zip, ...e.alt_zips]),
);

export interface ReviewArea {
  zip: string;
  /** What a reader is shown: "Cape Coral (33904)", or the bare ZIP if unnamed. */
  label: string;
}

/**
 * The area this REVIEW covers.
 *
 * A reader replies "REVIEW — 326 Shore Dr, Fort Myers 33905"; an agent types "Cape
 * Coral" over the [[blank]]. Both are the PROMPT; neither is a scope. So: an explicit
 * `scope.kind === "zip"` wins, then a crosswalk-known ZIP written anywhere in the
 * prompt (the finest grain we were handed), then the named place's primary ZIP.
 *
 * Nothing resolvable → null, and the build falls through to the generic author.
 * Degrade, never refuse (RULE 0.7). PURE; exported for the test.
 */
export function resolveArea(prompt: string, scopeZip?: string): ReviewArea | null {
  const place = zipFromPromptPlace(prompt);
  const named = (zip: string): ReviewArea => ({
    zip,
    label: place ? `${place.place} (${zip})` : zip,
  });
  if (scopeZip && CROSSWALK_ZIPS.has(scopeZip)) return named(scopeZip);
  for (const m of prompt.matchAll(/\b\d{5}\b/g)) {
    if (CROSSWALK_ZIPS.has(m[0])) return named(m[0]);
  }
  return place ? named(place.zip) : null;
}

// ── 2. THE FIGURES: pure lake data, each carrying its own source + as-of ──────

/** The five figures this email is made of. Each is a `MarketFigure` straight from
 *  `loadMarketFigures` — the producer `fetchLakeParts` wraps, imported directly
 *  because build-doc dispatches INTO this file and importing it back would cycle.
 *  A figure we do not hold is `null`, and its cell becomes an OPEN SLOT.
 *
 *  `level` (ZHVI) and `askingNow` (the live listing feed) are TWO DIFFERENT
 *  METRICS — a modelled monthly value index vs. what sellers are asking on live
 *  listings right now — and they are never blended into one number. A number
 *  derived from two correctly-sourced figures is still an unsourced one (the
 *  same rule `unanchoredNumbers` enforces on the narrator). What closes the gap
 *  between "the index's real vintage" and "today" is a SECOND, honestly-dated
 *  figure sitting beside the first — never a fabricated hybrid. */
export interface ReviewFigures {
  level: MarketFigure | null; // Zillow ZHVI — the headline
  trend: MarketFigure | null; // Zillow ZHVI — year over year
  dom: MarketFigure | null; // SWFL Data Gulf (ZIP), else Redfin (county median)
  active: MarketFigure | null; // SWFL Data Gulf — active inventory
  askingNow: MarketFigure | null; // SWFL Data Gulf — live median asking price, scraped daily
}

/**
 * Select this recipe's five figures out of the ZIP's full feed, by KEY — never by
 * label (a label is display copy and drifts).
 *
 * DAYS ON MARKET, FINER THEN COARSER: per-ZIP when the active-listing feed carries
 * it, else the COUNTY median (Redfin). That is a different GRAIN, and it travels
 * under the source's own label ("Lee County median days on market") — never silently
 * passed off as this ZIP's. A gap fills from the next real source; it never becomes
 * a guess. PURE; exported for the test.
 */
export function selectFigures(figures: readonly MarketFigure[]): ReviewFigures {
  const byKey = (key: string) => figures.find((f) => f.key === key) ?? null;
  return {
    level: byKey("home_value"),
    trend: byKey("home_value_yoy"),
    dom: byKey("dom") ?? byKey("county_dom"),
    active: byKey("active"),
    // `median_list` carries `as_of: latestScrapedAt` (market-context.ts) — the actual
    // scrape timestamp off the daily listing sweep, not a monthly cadence. It is the
    // freshest real figure this email can show; ZHVI's own vintage stays exactly as
    // dated as it really is.
    askingNow: byKey("median_list"),
  };
}

/** Every figure we actually rendered, in reading order. */
function rendered(f: ReviewFigures): MarketFigure[] {
  return [f.level, f.trend, f.dom, f.active, f.askingNow].filter(
    (x): x is MarketFigure => x !== null,
  );
}

/** A stat cell. Sourced → the figure's own label + its value, restated VERBATIM (rule:
 *  read a rate as written; never recompute one). Unsourced → an EMPTY value whose
 *  LABEL IS THE INSTRUCTION (the open-slot contract, playbook Part 4): the canvas
 *  offers it to the user, and StatsBlock's `emailRender` drops it from the sent email.
 *  Never a zero. PURE; exported for the test. */
export function cell(figure: MarketFigure | null, instruction: string): StatItem {
  return figure ? { value: figure.value, label: figure.label } : { value: "", label: instruction };
}

// ── 3. THE CHART: THIS area's own home-value trend ───────────────────────────

/** One month of one ZIP's ZHVI. */
export interface TrendPoint {
  month: string;
  home_value: number;
}

/** "2026-05" → "2026-05-31" (UTC-safe) — the honest "data through" vintage for a
 *  monthly series. Same convention as lib/build-chart-for-intent.mts. */
function monthEndIso(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * The last `months` of THIS ZIP's monthly ZHVI, oldest first.
 *
 * `data_lake.zhvi_zip_yoy_monthly` (migrations/20260710_zhvi_zip_yoy_monthly.sql —
 * `grant select … to service_role`) is the per-ZIP monthly series. The 3-metro
 * `zhvi-area` chart the rest of the codebase reaches for plots Cape Coral / Fort
 * Myers / Naples regardless of the area asked about; it is not this subject.
 *
 * Empty-tolerant by contract (four-lane / ODD): no creds, no rows, any query error →
 * [] and no chart. A chart is a bonus, never a blocker.
 */
async function loadZipTrend(zip: string, months = 24): Promise<TrendPoint[]> {
  try {
    // KNOWN-DEBT (07/13/2026): `data_lake.zhvi_zip_yoy_monthly` is a VIEW and is not in
    // the generated Supabase types, so the typed client cannot type it — the untyped
    // hatch is the only way to read it today. This is the exact deferral the lint's
    // allowlist exists for, and the file is registered there rather than silently
    // suppressed. It is real debt: an untyped read means a renamed column becomes a
    // RUNTIME null (an empty chart) instead of a compile error.
    // Tracked as `review_reply_untyped_zhvi_view_read`.
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("zhvi_zip_yoy_monthly")
      .select("period_end, home_value")
      .eq("zip_code", zip)
      .order("period_end", { ascending: false })
      .limit(months);
    if (!Array.isArray(data)) return [];
    return (data as Array<{ period_end?: string | null; home_value?: unknown }>)
      .map((r) => ({
        month: String(r.period_end ?? "").slice(0, 7),
        home_value: Number(r.home_value),
      }))
      .filter((p) => /^\d{4}-\d{2}$/.test(p.month) && Number.isFinite(p.home_value))
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Trend points → the area-value-trend ChartSpec. Under 3 months → null: two points
 * is a fact wearing a chart costume, and this recipe would rather write the fact.
 *
 * FRAME: `line-band`, NOT `zhvi-area`. This is not a style preference — I LOOKED at
 * both PNGs. `chart_type: "area"` routes to `bklitTrendSvg`, whose own header says it
 * draws the title and caption "as plain <text> OUTSIDE the bklit subtree rather than
 * through bklit's own axis/legend text (… a follow-up, not this pass)" — so the
 * emailed area chart ships a bare line over a gradient with NO y-axis values and NO
 * month labels. It greps fine and it tells a reader nothing. (This is the known
 * still-open defect in playbook Part 9, "the emailed area chart still ships without
 * axes" — the REAL fix belongs in the shared SVG bridge; reported.)
 *
 * `lineBandSvg` is the same shape drawn properly: gridlines, unit-formatted y-ticks,
 * four formatted month labels, an end-of-line value label. Its `lo`/`hi` confidence
 * bounds are optional and documented as "omit on observed (non-projected) points" —
 * we have no projection, so we omit them and no band draws. `rows` stays populated so
 * `chartMagnitudeFromSpec` can read the chart's magnitude for the coherence check.
 *
 * PURE; exported for the test.
 */
export function trendChartSpec(points: TrendPoint[], areaLabel: string): ChartSpec | null {
  if (points.length < 3) return null;
  return {
    title: `Home value trend — ${areaLabel}`,
    columns: ["month", "home_value"],
    rows: points.map((p): [string, number] => [p.month, p.home_value]),
    chart_type: "area",
    value_format: "usd",
    asOf: monthEndIso(points[points.length - 1].month),
    source: { citation: "Zillow Home Value Index (ZHVI)" },
    frameId: "line-band",
    options: { data: points.map((p) => ({ label: p.month, value: p.home_value })) },
  };
}

// ── 4. THE PROSE: one honest read, from the figures and nothing else ─────────

/** The facts the narrator is allowed to know, as lines. Each one names its own
 *  GEOGRAPHY (the figure's label) — that is what stops a COUNTY median being
 *  re-attributed to the ZIP. PURE; exported for the test. */
export function factLines(figures: ReviewFigures, points: TrendPoint[]): string[] {
  const lines = rendered(figures).map(
    (f) => `- ${f.label}: ${f.value} (${f.source}${f.as_of ? `, as of ${f.as_of}` : ""})`,
  );
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last) {
    const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
    lines.push(
      `- The chart on the page plots this area's monthly home value from ${first.month} ` +
        `(${usd(first.home_value)}) to ${last.month} (${usd(last.home_value)}).`,
    );
  }
  return lines;
}

/**
 * THE NUMBER GATE. Every numeric token in the paragraph must appear VERBATIM in the
 * facts we handed the narrator. A bare year is a calendar reference, not a figure.
 *
 * This is not belt-and-braces over a good prompt — the FIRST live draft wrote "a drop
 * of roughly $46,000", a number that exists nowhere: it back-solved it from two figures
 * it WAS given. A derived number is still an invented one (it carries an authority it
 * never earned, and no source can be named for it). The prompt now forbids arithmetic;
 * this gate is what makes the prohibition true.
 *
 * Reuses the ONE tokenizer/anchor root (lib/deliverable/narrative-lint) — never a
 * second regex. PURE; exported for the test.
 */
export function unanchoredNumbers(paragraph: string, facts: readonly string[]): string[] {
  const anchors = new Set<string>();
  for (const line of facts) {
    for (const tok of extractNumbers(line)) {
      const n = normalizeNumber(tok);
      if (!n) continue;
      anchors.add(n);
      // THE SIGN LIVES IN THE WORD. Our held figure is "−6.8%"; the only natural English
      // for it is "values are DOWN 6.8%". Anchoring the signed token alone rejects that
      // sentence as an invention — and SWFL home values are negative year-over-year right
      // now, so a strict-sign gate silently deletes the true sentence out of every honest
      // read and leaves the email with no read at all. (I watched it happen: the whole
      // paragraph was dropped.) The MAGNITUDE is what must be verbatim; the direction is
      // carried by the prose, and it is checked by a human reading "down" next to "−6.8%".
      // A fabricated number still cannot anchor, so nothing is let through.
      //
      // The shared gate has the same false positive (narrative-lint's buildAnchorSet, used
      // by lintAuthoredProse on the free-author path) — reported, not patched from here.
      if (n.startsWith("-")) anchors.add(n.slice(1));
    }
  }
  // A YEAR IS A CALENDAR REFERENCE, NOT A FIGURE — including a HYPHENATED one. The
  // tokenizer reads the hyphen in "mid-2024" as a minus sign and hands back "-2024",
  // which then fails a `^(19|20)\d{2}$` test and gets flagged as a fabricated number.
  // It is not: it is the year. I watched this drop a true, fully-sourced paragraph on
  // ~40% of runs (the read is THE deliverable, so a coin-flip gate is not a gate — it
  // is a bug), and the shared `isBareYear` in narrative-lint has the identical defect.
  // Test the DIGITS, not the sign: no real unitless data figure is ±2024.
  const bareYear = (t: string) =>
    !/[$%]/.test(t) && /^(?:19|20)\d{2}$/.test(normalizeNumber(t).replace(/^-/, ""));
  return extractNumbers(paragraph).filter((t) => !bareYear(t) && !anchorsExactly(t, anchors));
}

const READ_SYSTEM =
  `You write ONE paragraph — the "honest read" under a home-value snapshot an agent ` +
  `sends to a reader who asked for a review of their area. Two to four sentences.\n\n` +
  `WHAT THIS EMAIL IS: a reader replied with their address and the word REVIEW. This is ` +
  `the reply. It is a SNAPSHOT OF THEIR AREA — not a pitch, not a listing. The numbers are ` +
  `already on the page, in a grid and a chart directly above your paragraph.\n\n` +
  `DO NOT READ THE GRID BACK. A paragraph that recites the figures printed above it is a ` +
  `failure. Say what they MEAN TOGETHER — the level against the direction, the pace of sales ` +
  `against how many homes are for sale. One connected thought.\n\n` +
  `BE HONEST ABOUT THE DIRECTION. If values are down, say they are down, plainly, in the ` +
  `first sentence. Do not soften it, do not reframe a decline as an opportunity, and never ` +
  `add a selling claim of your own — "now is the time", "a great moment to list", "won't ` +
  `last" are YOUR words, not facts about this market.\n\n` +
  `NEVER DO ARITHMETIC. You may not compute, derive, subtract, total, or estimate a number, ` +
  `and you may not write an approximation of one ("a drop of roughly $46,000", "about ` +
  `$40k off"). If a number is not written VERBATIM in the facts below, you may not write ` +
  `it — a number you worked out yourself has no source, and a reader cannot tell the ` +
  `difference. Same rounding, same units, or leave it out.\n\n` +
  `EVERY FACT NAMES ITS OWN PLACE. Each line below says exactly which geography it measures. ` +
  `A COUNTY figure is a COUNTY figure: if a fact says "Lee County", you must say Lee County — ` +
  `you may not quietly hand it to the ZIP. Attribute each number to the place its label ` +
  `names, and to no other.\n\n` +
  `A FACT IS NOT ONLY A NUMBER. You may not name a CAUSE you were not given: interest rates, ` +
  `insurance costs, hurricanes, new construction, snowbirds, migration, the national market. ` +
  `You were told NONE of these, so you may not assert any of them, not even as a possibility. ` +
  `You know this area's home value, its year-over-year change, how long homes take to sell, ` +
  `how many are for sale, and NOTHING ELSE. If a sentence needs something you were not given, ` +
  `cut the sentence.\n\n` +
  `No hype, no exclamation marks, no jargon, no headings. Plain and specific. Return ONLY the ` +
  `paragraph.`;

/**
 * The single paragraph. THE MODEL WRITES PROSE. NOTHING ELSE (playbook Part 3, rule 4)
 * — not layout, not which cells exist, not numbers.
 *
 * One call, then ONE repair round naming the offending numbers (the same shape as the
 * author path's own regenerate-once loop). A draft that still won't anchor is DROPPED,
 * not shipped and not stripped into a fragment: the text block stays an OPEN SLOT the
 * agent can write themselves, and an open slot never reaches a recipient.
 *
 * Best-effort throughout: nothing real to say, or any failure → null. Never invents.
 */
async function authorAreaRead(
  figures: ReviewFigures,
  areaLabel: string,
  points: TrendPoint[],
): Promise<string | null> {
  if (rendered(figures).length === 0) return null; // never improvise an area
  const facts = factLines(figures, points);
  const user = `AREA: ${areaLabel}\n\nFACTS (the only things you know):\n${facts.join("\n")}\n\nWrite the read.`;

  const ask = async (content: string): Promise<string | null> => {
    try {
      const msg = await getAnthropic("email_build").messages.create({
        // Prose quality is the whole job here; Haiku writes the robot sentence.
        model: EMAIL_MODEL_SONNET,
        max_tokens: 400,
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
  if (!first) return null;
  const bad = unanchoredNumbers(first, facts);
  if (bad.length === 0) return first;

  const retry = await ask(
    `${user}\n\nYour previous draft wrote ${bad.map((b) => `"${b}"`).join(", ")} — ` +
      `${bad.length === 1 ? "that number is" : "those numbers are"} not in the facts above. ` +
      `You worked ${bad.length === 1 ? "it" : "them"} out yourself, which means no source can ` +
      `be named for ${bad.length === 1 ? "it" : "them"}. Rewrite the paragraph using only ` +
      `numbers written verbatim above, or with no number there at all.`,
  );
  if (retry && unanchoredNumbers(retry, facts).length === 0) return retry;
  return null; // two strikes → an open slot, never an invented figure
}

// ── 5. THE GRID: the committed skeleton, bound to this area ──────────────────

/** Reuse the canvas's own block of a type — brand (header, footer) is STICKY and is
 *  never authored. Falls back to a fresh default block. */
function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

/**
 * Load the committed `neighborhood-report` grid and bind it to this area.
 *
 * WHAT CHANGES FROM THE SEED, and why:
 *  • the `signal` block is DROPPED and the chart widened from w:7 to w:12. The seed
 *    carries TWO prose slots — a `signal` callout beside the chart AND a `text`
 *    commentary below it. This recipe has exactly ONE honest read. Filling both means
 *    handing the narrator the same four figures twice and printing the answer twice;
 *    leaving one empty ships a labeled empty box to the canvas. One read, one slot.
 *  • a `sources` block is APPENDED — the seed has none, and every figure on this page
 *    is cited. Citations ride in the collapsed accordion, never inline.
 *
 * The block types, their order, and the seed's own button label are the skeleton's.
 * A committed `review-reply` skeleton would say all of this structurally — reported.
 *
 * NOT `upsertChartBlock`: that helper rebuilds the block as `{id, type, props}` and
 * DROPS its `layout`, which on a grid doc sorts the chart below the footer
 * (row-grouping.ts: a layout-less block falls back to y = 1_000_000 + i). The chart is
 * resolved BEFORE the grid and placed here, in position, with its layout intact.
 *
 * PURE.
 */
function buildGrid(
  seed: EmailDoc,
  current: EmailDoc,
  area: ReviewArea,
  figures: ReviewFigures & { level: MarketFigure },
  chart: EmailChartImage | null,
): EmailDoc {
  const level = figures.level;
  const entries: PlanEntry[] = [];
  // Full-bleed row — every block here is one, which is exactly what the seam's zone
  // fence expects: it sorts the CLOSE-zone `sources` block to sit just above the
  // footer regardless of push order (the lifecycle chrome does the same thing).
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

  // Header — the agent's branded header, lifted off the canvas.
  push(keepOrDefault(current, "header"), 2);

  // Hero — the LEVEL. NO inline citation under it (operator correction, 07/14/2026):
  // an older draft of this file put the source + as-of directly under the hero on the
  // theory that "a reader shouldn't have to open an accordion" — that is backwards from
  // rule 1 (sources ride in the collapsed list, never inline) and it actively worked
  // against the whole point of adding `askingNow` above: a reader hits "Zillow ZHVI · as
  // of 05/31/2026" in the first two lines and reads the WHOLE page as six-week-old,
  // never noticing the live figure sitting in the strip. The citation is already correct
  // and complete in the closed Sources accordion below (`figureCitations`) — same as
  // every other recipe. Never both places.
  //
  // `level` is NON-NULL by the time we get here — buildReviewReply refuses to build
  // without it, and that is deliberate. THE HERO CANNOT SELF-SUPPRESS: unlike `stats`,
  // `text` and `image`, BlockRenderer passes NO `emailRender` to HeroBlock, so an empty
  // hero has no open-slot behavior — its label ships to the recipient as a naked label,
  // which is the one hard block in this product. An earlier draft of this file put an
  // "— add the figure" instruction in that label and asserted it would be dropped from
  // the email. It would not have been. It would have been mailed.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Your Home-Value Review",
        value: level.value,
        label: level.label,
      },
    },
    4,
  );

  // KPI strip — the other four the recipe names. `askingNow` leads: it is the
  // freshest real figure on the page (a daily scrape, not a monthly index), and it
  // sits beside the hero's OWN honest as-of rather than pretending to update it.
  // Unsourced → open slot.
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: [
          cell(figures.askingNow, "Current median asking price — type it in"),
          cell(figures.trend, "Home value, year over year — type it in"),
          cell(figures.dom, "Days on market — type it in"),
          cell(figures.active, `Active listings in ${area.zip} — type it in`),
        ],
      },
    },
    3,
  );

  // The chart — full width (the seed put a signal beside it; we dropped the signal).
  // No chart resolved → NO BLOCK. An empty chart box is worse than no chart.
  if (chart) push(chartImageBlock({ ...chart, linkUrl: brandWebsiteUrl(current) }), 6);

  // The one honest read. EMPTY on purpose: fillNarrative writes into it, and if the
  // narrator has nothing real to say it STAYS empty — an open slot on the canvas,
  // absent from the sent email (TextBlock honors `emailRender`).
  push({ id: createBlock("text").id, type: "text", props: { body: "", align: "left" } }, 3);

  // Citations — the collapsed accordion, seeded from the figures this page actually
  // rendered. `figureCitations` is the ONE citation root (house style, one entry per
  // source, carrying its as-of).
  push(
    {
      id: createBlock("sources").id,
      type: "sources",
      props: { sources: figureCitations(rendered(figures)) },
    },
    2,
  );

  // CTA — the seed's own button, pointed at the agent's site when they have one.
  const seedButton = seed.blocks.find((b) => b.type === "button");
  const site = brandWebsiteUrl(current);
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: {
        label: seedButton?.props.label ?? "Search Homes in This Area",
        ...(site ? { url: site } : {}),
      },
    },
    2,
  );

  // Footer — the agent's CAN-SPAM footer (address, socials, unsubscribe).
  push(keepOrDefault(current, "footer"), 3, true);

  return finalizeDoc({ globalStyle: { ...current.globalStyle }, entries });
}

// ── THE BUILDER ──────────────────────────────────────────────────────────────

export async function buildReviewReply(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { prompt, currentDoc, zip } = ctx;

  // The subject is an AREA. `ctx.facts` is null and MUST stay null — do not force the
  // listing flyer here (playbook Part 6: "a different spine entirely").
  const area = resolveArea(prompt, zip);
  if (!area) return null; // no area named → the generic author. Degrade, never refuse.

  const seedDef = SEED_DOCS.find((d) => d.id === SKELETON_ID);
  if (!seedDef) return null; // the committed skeleton IS the structure — no fake grid.
  const seed = seedDef.build();

  // PURE LAKE DATA — the same producer the whole builder feeds on.
  const figures = selectFigures(await loadMarketFigures({ kind: "zip", value: area.zip }));

  // NO HOME VALUE → NO HOME-VALUE REVIEW. Fall through to the generic author (degrade,
  // never refuse) rather than ship a hollow one.
  //
  // This is a HARD guard, not a preference, because the hero is the ONE block with no
  // open-slot escape: BlockRenderer hands `emailRender` to `stats`, `text` and `image`,
  // and NOT to `hero`. An empty hero therefore cannot vanish from a send the way an
  // unsourced stat cell does — its label would go out as a naked label over no number,
  // which is the one thing this product hard-blocks. And it IS reachable: 33979 carries
  // an active-listing row and no ZHVI row, so a real reader's ZIP hits this branch.
  if (!figures.level) return null;
  const withLevel = { ...figures, level: figures.level };

  // THE CHART — THIS area's own monthly trend. Resolved BEFORE the grid so it lands in
  // position WITH its layout (see buildGrid's note on upsertChartBlock). Coherence is
  // structural here — the hero and the chart are literally the same series — but the
  // check is cheap and it is the house rule for every chart-bearing deliverable, so it
  // runs, and an incoherent chart is dropped rather than shipped.
  const points = await loadZipTrend(area.zip);
  const spec = trendChartSpec(points, area.label);
  const hero = parseHeroFigure(figures.level.value);
  const accent = currentDoc.globalStyle.accentColor || "#3DC9C0";
  const coherent =
    !!spec && assertHeroChartCoherence({ hero, chart: chartMagnitudeFromSpec(spec) }).coherent;
  const image =
    spec && coherent
      ? await chartSpecToEmailImage(
          spec,
          accent,
          // The accent rides in the key: a brand-color change must mint a NEW url, or the
          // browser serves the stale (old-color) PNG from the same address.
          `email-charts/review-reply-${area.zip}-${spec.asOf ?? "x"}-${
            accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x"
          }.png`,
        ).catch(() => null)
      : null;

  // NO CAPTION. `chartSpecToEmailImage` defaults it to "{title} — {source} · as of
  // {date}" — but `lineBandSvg` draws its OWN title and its OWN "{source} · as of
  // {date}" line inside the PNG, so the default printed the title twice and the source
  // twice under one chart. I looked at it; it reads as a mistake, because it is one.
  // The chart's provenance is carried INSIDE the image and again in the collapsed
  // Sources accordion — the one citation root, real HTML text, which is what a reader
  // with images turned off still sees. A third copy is noise. (ImageBlock renders no
  // caption element for an empty string, so this leaves nothing behind.)
  const chart = image ? { ...image, caption: "" } : null;

  let doc = buildGrid(seed, currentDoc, area, withLevel, chart);

  // THE READ. LANDMINE: `fillNarrative` SKIPS a text block that already has content, so
  // clear first — always, even though our own grid seeds it empty. A future skeleton
  // change must never silently ship its instruction copy to a recipient.
  const read = await authorAreaRead(figures, area.label, chart ? points : []);
  if (read) doc = fillNarrative(clearNarrativeSlots(doc), read);

  return doc;
}
