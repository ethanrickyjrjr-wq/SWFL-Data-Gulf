// chart-coherence.ts — the ONE structural check that a deliverable's headline
// number and its chart do not contradict each other by magnitude.
//
// WHY THIS EXISTS: a headline and a chart are produced on independent paths (the
// AI writes the number; buildChartForQuestion picks the chart) — and in a
// hand-authored template sample, a human types both. Nothing forces them to
// agree, so a $3.17M "$2M+ luxury" headline shipped over a $802K→$746K
// top-third chart. Judgment did not catch it; a rule does.
//
// HONEST SCOPE: this catches the mechanically safe, visually-absurd class only —
// same unit, headline sitting far outside the chart's displayed range. It does
// NOT understand subject ("top tier" vs "$2M+"); a same-magnitude wrong-subject
// chart passes. We do not pretend otherwise (a heuristic semantic check would
// false-positive on every legitimate $-headline-over-%-chart deliverable).
//
// Two callers share this one function (spec: deliverable-coherence-gate):
//   • author-time — a test over EVERY chart-bearing template (strict, red CI).
//   • runtime — lib/email/build-doc.ts buildPromptChart (soft: drop the chart).

/** How a number reads. Only same-class currency/count magnitudes are compared;
 *  percent is excluded (ratios are meaningless near zero) and cross-class pairs
 *  ($ headline / % chart) are always coherent. */
export type UnitClass = "currency" | "percent" | "count" | "other";

export interface HeroFigure {
  value: number;
  unit: UnitClass;
}

export interface ChartMagnitude {
  /** Every number the chart DISPLAYS as a primary magnitude. For a bar/line
   *  that is the plotted points; for a donut/share it MUST include the center
   *  total (the whole the headline counts), else an honest donut false-flags. */
  values: number[];
  unit: UnitClass;
}

export interface CoherenceInput {
  hero: HeroFigure | null;
  chart: ChartMagnitude | null;
}

export type CoherenceResult = { coherent: true } | { coherent: false; reason: string };

/** Headline must sit within this factor of the chart's displayed range. A floor,
 *  not a hair-trigger: 3× lets normal variation pass and fires only on the
 *  order-of-magnitude mismatch that reads as broken. */
const FACTOR = 3;

const COMPARABLE: ReadonlySet<UnitClass> = new Set(["currency", "count"]);

function fmt(unit: UnitClass, n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString("en-US");
  return unit === "currency" ? `$${n < 0 ? "-" : ""}${abs}` : abs;
}

/**
 * Compare a deliverable's headline figure against its chart's magnitude.
 * Returns `{ coherent: true }` whenever there is nothing safe to compare
 * (missing side, differing units, percent, or `other`). Returns
 * `{ coherent: false, reason }` only when both are the same comparable unit and
 * the headline lies more than `FACTOR`× outside the chart's displayed range.
 */
export function assertHeroChartCoherence(input: CoherenceInput): CoherenceResult {
  const { hero, chart } = input;
  if (!hero || !chart) return { coherent: true };

  const values = chart.values.filter((v) => Number.isFinite(v));
  if (values.length === 0) return { coherent: true };
  if (!Number.isFinite(hero.value)) return { coherent: true };

  // Only compare like-with-like, and only where a ratio is meaningful.
  if (hero.unit !== chart.unit) return { coherent: true };
  if (!COMPARABLE.has(hero.unit)) return { coherent: true };

  const min = Math.min(...values);
  const max = Math.max(...values);

  // Compare on magnitude — a headline's sign (a −7% style figure) never reaches
  // here (percent is excluded), and currency/count headlines are positive.
  const h = Math.abs(hero.value);
  const hiBound = Math.abs(max) * FACTOR;
  const loBound = Math.abs(min) / FACTOR;

  if (h > hiBound) {
    const mult = (h / Math.max(Math.abs(max), 1)).toFixed(1);
    return {
      coherent: false,
      reason: `headline ${fmt(hero.unit, hero.value)} is ${mult}× above the chart's top displayed value ${fmt(chart.unit, max)}`,
    };
  }
  if (h < loBound) {
    const mult = (Math.max(Math.abs(min), 1) / Math.max(h, 1)).toFixed(1);
    return {
      coherent: false,
      reason: `headline ${fmt(hero.unit, hero.value)} is ${mult}× below the chart's smallest displayed value ${fmt(chart.unit, min)}`,
    };
  }
  return { coherent: true };
}

const CURRENCY_SUFFIX: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };

/**
 * Parse a headline string as authored in a template (e.g. "$3,168,000", "−7.0%",
 * "1,226", "$1.4M") into a { value, unit }. Currency when `$` is present, percent
 * when `%` is present, else a bare count. Returns null when no number is found.
 * Unicode minus (−) is normalized. Used by the author-time test to read a
 * template's `hero.value`.
 */
export function parseHeroFigure(raw: string): HeroFigure | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.replace(/−/g, "-").trim();
  const m = s.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  let value = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;

  const isCurrency = s.includes("$");
  const isPercent = s.includes("%");
  const suffix = s
    .slice(m.index! + m[0].length)
    .trim()
    .charAt(0)
    .toUpperCase();
  if ((isCurrency || !isPercent) && CURRENCY_SUFFIX[suffix]) {
    value *= CURRENCY_SUFFIX[suffix];
  }

  const unit: UnitClass = isCurrency ? "currency" : isPercent ? "percent" : "count";
  return { value, unit };
}
