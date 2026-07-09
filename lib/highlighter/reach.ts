import { buildReportIdSet } from "@/app/api/mcp/inventory";

const ALLOWED = buildReportIdSet();

/** Topic → brain slug. Order = priority; first hits win when capping.
 *
 *  The residential block runs FIRST: the six original rules covered env / cre /
 *  permits / rentals / labor / tourism and left heat, listings, momentum, price
 *  distribution and seller stress unreachable — so every housing question fell
 *  through to an empty reach, and `buildChartForQuestion` rendered its
 *  `CHART_FALLBACKS[0]` median-price bar for all of them (found live 07/09/2026).
 *  The 07/09 audit then found the same class 14 more times: 26 of 39 catalogued
 *  brains had no rule at all. Coverage is now GATED by `reach-coverage.test.ts` —
 *  every `BRAIN_CATALOG` id must either appear here or carry a written reason in
 *  `INTENTIONALLY_UNROUTED` below. Adding a brain to the catalog without deciding
 *  its routing is a test failure, not a silent dead zone.
 *
 *  Ordering constraints that hold this table together:
 *    - "tightening" routes to `market-heat-swfl`, NOT `active-listings-swfl`.
 *      market-heat carries `Inventory Y/Y`; active-listings is levels-only and
 *      cannot express a direction at all.
 *    - Nothing above `cre-swfl` may claim `cap rate` / `vacancy` / `absorption`,
 *      or a commercial question silently reroutes to a residential brain.
 *      (`market-temperature-swfl` sits BELOW cre for the same reason — yield
 *      phrasing must not steal cap-rate questions.)
 *    - `hurricane-tracks-fl` / `storm-history-swfl` sit ABOVE `env-swfl`: history
 *      phrasing ("landfall", "storm history") outranks modeled flood exposure
 *      under the cap; env still joins via bare `hurricane` / `storm`.
 *    - `active-rentals-swfl` sits ABOVE `rentals-swfl`: rental-INVENTORY phrasing
 *      outranks the ZORI rent index under the cap; both usually ride together.
 *    - Plurals are spelled out. `\brent\b` never matched "rents" and
 *      `\bprice cut\b` never matched "price cuts" — the word boundary silently
 *      eats the plural. Same bug class, found twice; write `cuts?`, not `cut`.
 *
 *  `ALLOWED` fail-closes any slug missing from the live catalog, so a rule for an
 *  unpublished brain is inert, never a crash — and `reach-coverage.test.ts` fails
 *  loud on any rule whose slug is not catalogued. Yield disambiguation (07/09/2026,
 *  when `home-values-swfl`/`investor-zip-swfl` were catalogued): generic yield
 *  phrasing (gross/rent yield, price-to-rent) routes to `market-temperature-swfl`
 *  (source-faithful realtor.com sold-to-rent read); investor/composite phrasing
 *  (investor, investment property, flood-adjusted) routes to `investor-zip-swfl`
 *  (COMPUTED ZHVI × ZORI composite). Two methodologies, two rules, no collision.
 */
export const TOPIC_TO_SLUG: Array<{ keywords: RegExp; slug: string }> = [
  {
    keywords:
      /\b(heating up|cooling off|market ?heat|hotness|hottest|tighten(?:ing|ed)?|seller'?s'? market|buyer'?s'? market|pending ratio)\b/i,
    slug: "market-heat-swfl",
  },
  {
    keywords:
      /\b(days on market|dom|time on market|price cuts?|price reductions?|price drops?|prices? dropping|new listings?|momentum)\b/i,
    slug: "listing-momentum-swfl",
  },
  {
    keywords:
      /\b(median sale price|sale price|sold price|list price|sale-to-list|months of supply|inventory|supply)\b/i,
    slug: "housing-swfl",
  },
  {
    // ZHVI value index — "home values" / appreciation phrasing. Distinct from
    // housing-swfl (Redfin closed-sale prices): value INDEX vs sale prices.
    keywords:
      /\b(home values?|property values?|zhvi|apprecia(?:te|ting|tion)|home[- ]value index)\b/i,
    slug: "home-values-swfl",
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
    // Above env-swfl on purpose: landfall/history phrasing gets the brain that
    // actually holds landfall counts; env still joins via bare hurricane/storm.
    keywords:
      /\b(landfalls?|hurricane histor(?:y|ies)|past hurricanes?|hurricanes? (?:hit|struck)|closest pass|cat(?:egory)? ?[3-5])\b/i,
    slug: "hurricane-tracks-fl",
  },
  {
    keywords: /\b(storm histor(?:y|ies)|storm events?|billion[- ]dollar)\b/i,
    slug: "storm-history-swfl",
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
    // Below cre-swfl on purpose: yield phrasing must never steal a cap-rate
    // question. Headline here is the SOURCE-FAITHFUL realtor.com sold-to-rent
    // gross-yield read — generic yield phrasing lands here.
    keywords: /\b(gross yields?|rent(?:al)? yields?|price[- ]to[- ]rent|cash ?flows?|roi)\b/i,
    slug: "market-temperature-swfl",
  },
  {
    // The COMPUTED ZHVI × ZORI investor composite (+ flood-adjusted cap rate).
    // Investor/composite phrasing lands here; generic yield stays on
    // market-temperature-swfl above (see the header's yield-disambiguation note).
    keywords: /\b(investors?|investment propert(?:y|ies)|investor composite|flood[- ]adjusted)\b/i,
    slug: "investor-zip-swfl",
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
    // Above rentals-swfl on purpose: inventory phrasing outranks the rent index.
    keywords:
      /\b(rental (?:inventory|listings?|availability)|available rentals?|rentals? (?:are )?available|rentals? on the market)\b/i,
    slug: "active-rentals-swfl",
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
    // `\bemploy\b` above never matches "employment"/"unemployment" — the word
    // boundary eats the suffix (same plural-bug class as rents/price cuts). Those
    // questions belong here anyway: LAUS unemployment + QCEW employment live in
    // macro-swfl; labor-demand-swfl is OEWS occupations/wages.
    keywords: /\b(unemployment|jobless(?:ness)?|employment|labor force)\b/i,
    slug: "macro-swfl",
  },
  {
    keywords: /\b(tourism|tourist|hotel|hospitality|tdt|visitor)\b/i,
    slug: "tourism-tdt",
  },
  {
    // Before traffic-swfl so "airport traffic" slots RSW first; both still ride.
    keywords:
      /\b(airports?|rsw|flights?|enplanements?|deplanements?|passenger (?:traffic|counts?|volumes?))\b/i,
    slug: "rsw-airport",
  },
  {
    keywords: /\b(traffic|aadt|congestion|commutes?|road volumes?)\b/i,
    slug: "traffic-swfl",
  },
  {
    keywords: /\b(crimes?|safety|safe|burglar(?:y|ies)|larceny|thefts?)\b/i,
    slug: "safety-swfl",
  },
  {
    keywords:
      /\b(hoa|gated communit(?:y|ies)|golf communit(?:y|ies)|master[- ]planned|amenities)\b|55\+/i,
    slug: "communities-swfl",
  },
  {
    keywords:
      /\b(sirs|structural integrity|reserve stud(?:y|ies)|milestone inspections?|condo associations?)\b/i,
    slug: "condo-sirs-swfl",
  },
  {
    keywords: /\b(contractor licens(?:e|es|ing|ure)|licensed contractors?|electricians?)\b/i,
    slug: "licenses-swfl",
  },
  {
    keywords:
      /\b(economic development|reloca(?:te|ting|tions?)|job announcements?|new employers?|expansions?)\b/i,
    slug: "econ-dev-swfl",
  },
  {
    keywords: /\bfranchis(?:e|es|ing|ee|ees|or|ors)\b/i,
    slug: "franchise-outcomes",
  },
  {
    keywords: /\b(freight|logistics|trucking|tonnage)\b/i,
    slug: "logistics-swfl-nowcast",
  },
  {
    keywords: /\b(mortgages?|30[- ]year fixed)\b/i,
    slug: "freshness-pulse",
  },
];

/**
 * Catalogued brains with NO topic rule — each on purpose, each with the reason
 * written down. `reach-coverage.test.ts` enforces that every `BRAIN_CATALOG` id
 * is either routed above or listed here; remove an entry the moment you add its
 * rule. This is the routing twin of `KNOWN_INCOMPLETE` in
 * `refinery/packs/catalog.test.mts`.
 */
export const INTENTIONALLY_UNROUTED: Record<string, string> = {
  master: "reached via the SYNTHESIS regex below, never a topic rule",
  "macro-us": "national denominator tier; macro-swfl is the customer-facing macro leaf",
  "macro-florida": "state denominator tier; macro-swfl is the customer-facing macro leaf",
  "properties-lee-value":
    "county-grain direction read; housing-swfl/market-heat-swfl own the customer phrasing — promote deliberately if county-value questions surface",
  "properties-collier-value":
    "county-grain direction read; housing-swfl/market-heat-swfl own the customer phrasing — promote deliberately if county-value questions surface",
  "fgcu-reri": "monthly indicator digest with no distinct question phrasing yet",
  "city-pulse-swfl":
    "current-events pulse; safe keywords ('news', 'openings') are too generic — routing needs deliberate design, not a regex guess",
  "corridor-pulse-swfl":
    "current-events pulse; safe keywords ('news', 'openings') are too generic — routing needs deliberate design, not a regex guess",
  "news-swfl": "DBPR enforcement pulse; 'news' keyword is too generic to route safely",
  "permits-commercial-swfl":
    "'commercial permits' phrasing already reaches cre-swfl + permits-swfl; annual databook grain — promote deliberately",
  "sector-credit-swfl":
    "SBA sector charge-offs; no natural chat phrasing observed yet — promote deliberately",
  "logistics-swfl":
    "historical FAF5 flows; logistics-swfl-nowcast is the current-state entry and carries FAF5 as context",
};

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
