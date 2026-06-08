/**
 * Curated methodology registry — the allowlist + content for the public
 * `/r/method/[metric]` surface. Mirrors `app/r/source/_tables.ts`
 * (SOURCE_PROVENANCE_TABLES): a hand-authored map, small on purpose, that
 * decides which metric slugs get a public "how it is computed" page.
 *
 * FORMULA + PROVENANCE ONLY. Never a skill/lift/accuracy number — a
 * retrodicted figure is not a public accuracy claim (Glass guardrail 3,
 * docs/sql/20260608_data_targets.sql). Forward outcomes get their own surface
 * later; this page explains the math, not the track record.
 *
 * Imported by BOTH the refinery (refinery/render/speaker.mts, to gate the
 * per-metric methodHref) and the Next app (the route). Keep it free of React
 * and DB access so both sides can import it cheaply.
 *
 * DO NOT register `cap_rate_median` — it is the display-leak.test.mts canary.
 * An UNregistered slug must yield no methodHref; registering it would defeat
 * the guard that proves internal slugs never leak onto a customer surface.
 */

export interface MethodologyEntry {
  /** Human metric name shown as the page title. */
  label: string;
  /** 1-2 sentences: what the number means. */
  measures: string;
  /** Plain-language recipe — the formula/method, no exact constants. */
  formula: string;
  /** Grain / denominator, e.g. "per ZIP", "Lee County", "over resolved loans". */
  denominator?: string;
  /** Source table; links to /r/source/<table> ONLY when on the source allowlist. */
  sourceTable?: string;
  /** Consuming brain id; links to /r/<brain>. */
  brain?: string;
  /** Optional external methodology doc/PDF. */
  doc?: string;
}

/** Literal slug -> entry. Add the headline metrics you want explained. */
export const METHODOLOGY_LITERALS: Record<string, MethodologyEntry> = {
  latest_monthly_collections_usd: {
    label: "Latest monthly TDT collections (SWFL)",
    measures:
      "Tourist Development Tax (the county 'bed tax' on short-term lodging) collected across Lee + Collier in the most recent reported month.",
    formula:
      "Sum of the two counties' Florida DOR TDT remittances for the latest month both have reported.",
    denominator: "Lee + Collier combined, single month",
    sourceTable: "fl_dor_tdt_collections",
    brain: "tourism-tdt",
  },
  trailing_12mo_collections_usd: {
    label: "Trailing 12-month TDT collections (SWFL)",
    measures:
      "Total Tourist Development Tax collected across Lee + Collier over the most recent 12 reported months — a seasonally-complete view of tourism revenue.",
    formula: "Rolling sum of the latest 12 monthly DOR TDT remittances, Lee + Collier combined.",
    denominator: "Lee + Collier combined, trailing 12 months",
    sourceTable: "fl_dor_tdt_collections",
    brain: "tourism-tdt",
  },
  post_ian_recovery_ratio: {
    label: "Post-Hurricane-Ian recovery ratio",
    measures:
      "How current tourism revenue compares to its strongest pre-Ian run — 1.0 means fully recovered, below 1.0 means still under the prior peak.",
    formula:
      "Trailing-12-month TDT collections divided by the best pre-Ian trailing-12-month total.",
    denominator: "ratio (unitless), Lee + Collier combined",
    sourceTable: "fl_dor_tdt_collections",
    brain: "tourism-tdt",
  },
  seasonal_position_vs_history: {
    label: "Seasonal position vs history",
    measures:
      "Whether the latest month ran above or below what that same calendar month has historically averaged — strips out seasonality to show the real trend.",
    formula:
      "Latest month's collections divided by the historical mean for that same calendar month, Lee + Collier combined.",
    denominator: "ratio (unitless) vs same-month historical mean",
    sourceTable: "fl_dor_tdt_collections",
    brain: "tourism-tdt",
  },
};

/**
 * Pattern slugs — families that share one recipe (per-county, per-ZIP). The
 * first matching pattern wins; literals always take precedence over patterns.
 */
export const METHODOLOGY_PATTERNS: Array<{
  test: RegExp;
  build: (slug: string) => MethodologyEntry;
}> = [
  {
    // Per-county TDT collections, e.g. lee_trailing_12mo_collections_usd.
    test: /^(lee|collier)_(latest_monthly|trailing_12mo)_collections_usd$/,
    build: (slug) => {
      const county = slug.startsWith("lee") ? "Lee" : "Collier";
      const monthly = slug.includes("latest_monthly");
      const window = monthly ? "the latest reported month" : "the trailing 12 months";
      return {
        label: `${county} County TDT collections (${monthly ? "monthly" : "12-month"})`,
        measures: `Tourist Development Tax collected in ${county} County over ${window}.`,
        formula: `Sum of ${county} County's Florida DOR TDT remittances over ${window}.`,
        denominator: `${county} County`,
        sourceTable: "fl_dor_tdt_collections",
        brain: "tourism-tdt",
      };
    },
  },
];

/** Resolve a metric slug to its methodology entry, or null if undocumented. */
export function resolveMethod(slug: string): MethodologyEntry | null {
  const literal = METHODOLOGY_LITERALS[slug];
  if (literal) return literal;
  for (const p of METHODOLOGY_PATTERNS) {
    if (p.test.test(slug)) return p.build(slug);
  }
  return null;
}

/**
 * The allowlist gate. Returns the public `/r/method/<slug>` URL ONLY for a
 * documented slug, else undefined. This is the single point that decides
 * whether a metric is "explained" — and the only way a slug becomes a URL on
 * the customer surface.
 */
export function methodHrefForSlug(slug: string): string | undefined {
  return resolveMethod(slug) ? `/r/method/${slug}` : undefined;
}
