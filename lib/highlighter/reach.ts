import { buildReportIdSet } from "@/app/api/mcp/inventory";

const ALLOWED = buildReportIdSet();

/** Topic → brain slug. Order = priority; first hits win when capping.
 *
 *  The residential block runs FIRST: the six original rules covered env / cre /
 *  permits / rentals / labor / tourism and left heat, listings, momentum, price
 *  distribution and seller stress unreachable — so every housing question fell
 *  through to an empty reach, and `buildChartForQuestion` rendered its
 *  `CHART_FALLBACKS[0]` median-price bar for all of them (found live 07/09/2026).
 *
 *  Two ordering constraints hold this table together:
 *    - "tightening" routes to `market-heat-swfl`, NOT `active-listings-swfl`.
 *      market-heat carries `Inventory Y/Y`; active-listings is levels-only and
 *      cannot express a direction at all.
 *    - Nothing above `cre-swfl` may claim `cap rate` / `vacancy` / `absorption`,
 *      or a commercial question silently reroutes to a residential brain.
 *
 *  `ALLOWED` fail-closes any slug missing from the live catalog, so a rule for an
 *  unpublished brain is inert, never a crash. `home-values-swfl` and
 *  `investor-zip-swfl` are deliberately absent: both are built but neither is in
 *  `BRAIN_CATALOG`, so a rule for them would be a no-op dressed as a fix
 *  (check `home_values_investor_zip_not_in_catalog`).
 */
const TOPIC_TO_SLUG: Array<{ keywords: RegExp; slug: string }> = [
  {
    keywords:
      /\b(heating up|cooling off|market ?heat|hotness|hottest|tighten(?:ing|ed)?|seller'?s'? market|buyer'?s'? market|pending ratio)\b/i,
    slug: "market-heat-swfl",
  },
  {
    keywords:
      /\b(days on market|dom|time on market|price cut|price reduction|price reductions|new listings?|momentum)\b/i,
    slug: "listing-momentum-swfl",
  },
  {
    keywords:
      /\b(median sale price|sale price|sold price|list price|sale-to-list|months of supply|inventory|supply)\b/i,
    slug: "housing-swfl",
  },
  {
    keywords: /\b(active listings?|listing count|how many listings)\b/i,
    slug: "active-listings-swfl",
  },
  {
    keywords: /\b(price distribution|price tier|affordability band)\b/i,
    slug: "price-distribution-swfl",
  },
  {
    keywords: /\b(seller stress|distressed|foreclosure)\b/i,
    slug: "seller-stress-swfl",
  },
  {
    keywords: /\b(flood|insurance|aal|nfip|storm|surge|hurricane)\b/i,
    slug: "env-swfl",
  },
  {
    keywords: /\b(commercial|office|retail|industrial|cap rate|cre|absorption|vacancy)\b/i,
    slug: "cre-swfl",
  },
  {
    // The bare verb `build` used to live in this alternation. It matched "build me a
    // chart of rents by ZIP" and, because this table is first-match-wins and permits
    // sits above rentals, the VERB beat the NOUN and every chart request became a
    // permit question. Keep `building` / `builds`; never the bare verb.
    keywords: /\b(permit|construction|building|builds|new homes?)\b/i,
    slug: "permits-swfl",
  },
  {
    // Plurals matter: `\brent\b` never matched "rents", so "a chart of rents by ZIP"
    // reached rentals-swfl only by ACCIDENT — via the bare `build` verb above, which
    // sent it to permits. Deleting the verb exposed the hole. `lib/route-chart.ts:33`
    // already used `\brent(s|al|als)?\b` for the same job; this table had drifted.
    keywords: /\b(rents?|rentals?|leases?|asking rent|zori)\b/i,
    slug: "rentals-swfl",
  },
  {
    keywords: /\b(job|jobs|wage|wages|employ|labor|workforce)\b/i,
    slug: "labor-demand-swfl",
  },
  {
    keywords: /\b(tourism|tourist|hotel|hospitality|tdt|visitor)\b/i,
    slug: "tourism-tdt",
  },
];

const SYNTHESIS =
  /\b(overall|big picture|whole market|everything|compare everything|outlook for the (whole|entire))\b/i;

const MAX_REACH = 3;

/**
 * Decide which OTHER reports to pull for a question asked on `currentSlug`.
 * Deterministic and allowlist-bounded (runs before the model). Same-vertical
 * cross-area comparison is intentionally NOT here — the current dossier's
 * detail_tables already hold every area (R0).
 */
export function resolveReachTargets(question: string, currentSlug: string): string[] {
  if (!question) return [];
  const out: string[] = [];
  for (const { keywords, slug } of TOPIC_TO_SLUG) {
    if (
      keywords.test(question) &&
      slug !== currentSlug &&
      ALLOWED.has(slug) &&
      !out.includes(slug)
    ) {
      out.push(slug);
    }
  }
  if (
    SYNTHESIS.test(question) &&
    currentSlug !== "master" &&
    ALLOWED.has("master") &&
    !out.includes("master")
  ) {
    out.push("master");
  }
  return out.slice(0, MAX_REACH);
}
