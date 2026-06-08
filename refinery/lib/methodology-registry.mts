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
  /** Explicit derivation of the quantity a user means when they "break this down".
   *  Plain language, no exact constants, e.g.
   *  "all-in occupancy cost = base rent + property taxes + insurance + CAM". */
  equation?: string;
  /** The parts of `equation`. role:"have" = we hold an input for it; role:"need" =
   *  we don't (yet). This list is the ONLY set of components an answer may name —
   *  the structural anti-invention allowlist for the never-dead-end doctrine
   *  (docs/superpowers/plans/2026-06-08-never-dead-end-doctrine.md). A published
   *  figure stays HELD: `need` parts belong to a broader derived quantity (e.g. a
   *  tenant's all-in occupancy cost), never imply the published number is partial. */
  components?: {
    name: string;
    role: "have" | "need";
    /** Slug/source we hold it from, when role==="have". */
    heldFrom?: string;
    /** Where to get it, when role==="need". */
    candidateSource?: string;
  }[];
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

  // --- CRE corridor medians (cre-swfl). The published figure is HELD; the
  // `need` components belong to a tenant's broader all-in occupancy cost. ---
  asking_rent_psf_median: {
    label: "Median asking rent (NNN)",
    measures:
      "The median quoted triple-net asking rent across SWFL CRE corridors reporting this period. This published figure is the base asking rate — held, not estimated.",
    formula: "Median of each corridor's quoted NNN asking rent for the period.",
    denominator: "per sqft (PSF), across reporting corridors",
    brain: "cre-swfl",
    equation: "all-in occupancy cost = base (NNN asking rent) + property taxes + insurance + CAM",
    components: [
      { name: "Base (NNN asking rent)", role: "have", heldFrom: "asking_rent_psf_median" },
      {
        name: "Property taxes",
        role: "need",
        candidateSource: "county property appraiser / broker comps",
      },
      { name: "Insurance", role: "need", candidateSource: "broker comps / carrier quotes" },
      {
        name: "CAM (common-area maintenance)",
        role: "need",
        candidateSource: "landlord CAM reconciliation / broker comps",
      },
    ],
  },
  vacancy_rate_median: {
    label: "Median vacancy rate",
    measures:
      "The median vacancy rate across SWFL CRE corridors reporting this period. The published rate is held; the underlying GLA counts are not.",
    formula: "Median of each corridor's reported vacancy rate for the period.",
    denominator: "percent, across reporting corridors",
    brain: "cre-swfl",
    equation: "vacancy rate = vacant GLA ÷ total GLA",
    components: [
      { name: "Reported vacancy rate", role: "have", heldFrom: "vacancy_rate_median" },
      { name: "Vacant GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
      { name: "Total GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
    ],
  },
  absorption_sqft_median: {
    label: "Median net absorption",
    measures:
      "The median net absorption across SWFL CRE corridors reporting this period. The published flow is held; the period-end GLA snapshots are not.",
    formula: "Median of each corridor's reported net absorption for the period.",
    denominator: "sqft, across reporting corridors",
    brain: "cre-swfl",
    equation: "net absorption = occupied GLA (period end) − occupied GLA (period start)",
    components: [
      { name: "Reported net absorption", role: "have", heldFrom: "absorption_sqft_median" },
      {
        name: "Occupied GLA (period start)",
        role: "need",
        candidateSource: "broker survey detail / CoStar",
      },
      {
        name: "Occupied GLA (period end)",
        role: "need",
        candidateSource: "broker survey detail / CoStar",
      },
    ],
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
  {
    // Per-submarket broker metrics from cre-swfl, e.g.
    // `asking_rent_nnn_marketbeat_marco_island`. One pattern covers the whole
    // submarket family. EXCLUDES the `_swfl` SWFL-wide median and `_area`
    // parent rollups — those are medians-of-submarkets, not a single submarket,
    // so they fall through to the converse floor rather than be mislabelled.
    test: /^(vacancy_rate|asking_rent_nnn|absorption_sqft)_marketbeat_(?!swfl$)(?!.*_area$)[a-z0-9_]+$/,
    build: (slug) => {
      const m = slug.match(/^(vacancy_rate|asking_rent_nnn|absorption_sqft)_marketbeat_(.+)$/)!;
      const field = m[1];
      const place = m[2].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (field === "asking_rent_nnn") {
        return {
          label: `${place} asking rent (NNN)`,
          measures: `The quoted triple-net asking rent reported for the ${place} submarket. This published figure is the base asking rate — held, not estimated.`,
          formula: `Quoted NNN asking rent for the ${place} submarket from the latest verified broker report.`,
          denominator: "per sqft (PSF)",
          brain: "cre-swfl",
          equation:
            "all-in occupancy cost = base (NNN asking rent) + property taxes + insurance + CAM",
          components: [
            { name: "Base (NNN asking rent)", role: "have", heldFrom: slug },
            {
              name: "Property taxes",
              role: "need",
              candidateSource: "county property appraiser / broker comps",
            },
            { name: "Insurance", role: "need", candidateSource: "broker comps / carrier quotes" },
            {
              name: "CAM (common-area maintenance)",
              role: "need",
              candidateSource: "landlord CAM reconciliation / broker comps",
            },
          ],
        };
      }
      const isVac = field === "vacancy_rate";
      return {
        label: `${place} ${isVac ? "vacancy rate" : "net absorption"}`,
        measures: `The ${isVac ? "vacancy rate" : "net absorption"} reported for the ${place} submarket. The published ${isVac ? "rate" : "flow"} is held; the underlying GLA detail is not.`,
        formula: `${isVac ? "Reported vacancy rate" : "Reported net absorption"} for the ${place} submarket from the latest verified broker report.`,
        denominator: isVac ? "percent" : "sqft",
        brain: "cre-swfl",
        equation: isVac
          ? "vacancy rate = vacant GLA ÷ total GLA"
          : "net absorption = occupied GLA (period end) − occupied GLA (period start)",
        components: isVac
          ? [
              { name: "Reported vacancy rate", role: "have", heldFrom: slug },
              {
                name: "Vacant GLA",
                role: "need",
                candidateSource: "broker survey detail / CoStar",
              },
              { name: "Total GLA", role: "need", candidateSource: "broker survey detail / CoStar" },
            ]
          : [
              { name: "Reported net absorption", role: "have", heldFrom: slug },
              {
                name: "Occupied GLA (period start)",
                role: "need",
                candidateSource: "broker survey detail / CoStar",
              },
              {
                name: "Occupied GLA (period end)",
                role: "need",
                candidateSource: "broker survey detail / CoStar",
              },
            ],
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
