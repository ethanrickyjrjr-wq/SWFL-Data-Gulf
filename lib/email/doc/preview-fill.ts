// lib/email/doc/preview-fill.ts
//
// PREVIEW-ONLY fill for the template gallery captures (spec:
// docs/superpowers/specs/2026-07-09-template-preview-gallery-design.md;
// variety pass: docs/handoff/2026-07-09-seed-preview-presentability-handoff.md).
//
// THE PRINCIPLE: the preview promises, the canvas is honest. This function
// fills a built SEED_DOCS skeleton with REAL, sourced display content so a
// visitor can SEE what a template produces — but it is called ONLY by
// scripts/capture-seed-previews.mts (and its tests). `pickSeed`/`openSeed`
// keep committing `seed.build()` untouched: demo data must never re-enter the
// canvas (that is the exact class Track A purged —
// `seed_static_figures_bypass_invention_gate`). preview-fill.test.ts fails the
// suite if any lab entry path imports this module.
//
// THE VARIETY RULE (operator escalation 07/09/2026 — the same ZHVI chart
// rendered 3× inside one preview): every template gets content matched to ITS
// job via SEED_ASSIGNMENTS. Chart slots consume a per-seed chart list in
// order — never one chart cycled through the whole gallery; photos, listings,
// signals, and prose are per-seed too. Guards live in preview-fill.test.ts
// (no duplicate chart within a doc, hero variety within a gallery group, a
// global chart repeat cap).
//
// FOUR-LANE HONEST: every figure below is real and named —
//   · SWFL Data Gulf listing feed (data_lake.listing_state), 07/09/2026
//   · Lee County Property Appraiser recorded sales, through 05/30/2026
//   · Zillow Home Value Index (incl. top/bottom tier) + Observed Rent Index,
//     through 05/31/2026
//   · Realtor.com listing metrics (per-ZIP hotness + county series via FRED),
//     June 2026
//   · Freddie Mac Primary Mortgage Market Survey, 07/09/2026
// Ratios/payments are deterministic math on two cited figures and say so in
// their labels. Listing rows are real active listings from the feed (cited as
// "SWFL Data Gulf", never vendor/MLS#); their photos are committed, licensed
// illustrative assets under public/showcase/seed-previews/assets/ — never
// hotlinked externals, never a photo whose visible house number contradicts
// the cited address. Chart SVGs are generated from these same series by
// scripts/generate-seed-preview-charts.mts through the production bklit email
// render path.

import type { EmailDoc } from "./types";
import { DEFAULT_BLOCK_PROPS } from "./default-docs";
import { parseHeroFigure, type HeroFigure } from "@/lib/deliverable/chart-coherence";

/**
 * The doc's headline figure for coherence-checking: a `hero` block's value if
 * the template renders one, else the first `metric-card` block's metricValue
 * (trend-snapshot has no hero block -- its real headline is the metric-card).
 * Null when neither block type is present. Shared by the author-time gate
 * (preview-fill.test.ts) and the live runtime hook (build-doc.ts) -- ONE
 * definition of "this doc's headline," never two.
 */
export function resolveHeadlineFigure(doc: EmailDoc): HeroFigure | null {
  for (const b of doc.blocks) {
    if (b.type === "hero" && b.props.value) return parseHeroFigure(b.props.value);
  }
  for (const b of doc.blocks) {
    if (b.type === "metric-card" && b.props.metricValue) {
      return parseHeroFigure(String(b.props.metricValue));
    }
  }
  return null;
}

export interface PreviewFillData {
  /** Stamped by the gallery overlay caption ("Live SWFL data · MM/DD/YYYY"). */
  asOf: string;
  hero: { value: string; label: string; prose: string };
  stats: { value: string; label: string }[];
  metricCard: {
    metricValue: string;
    metricLabel: string;
    sub: string;
    rankText: string;
    movementText: string;
    barPct: number;
  };
  listings: {
    photoUrl: string;
    price: string;
    beds: string;
    baths: string;
    sqft: string;
    address: string;
  }[];
  photos: { url: string; alt: string }[];
  portrait: { url: string; alt: string };
  agentBio: string;
  commentary: string[];
  listItems: { lead: string; text: string }[];
  chart: { url: string; alt: string; caption: string };
  sources: { label: string; url: string }[];
  sourcesNote: string;
}

type Chart = PreviewFillData["chart"];
type Listing = PreviewFillData["listings"][number];
type Photo = PreviewFillData["photos"][number];

/** Real figures pulled from the lake + named web sources on 07/09/2026 —
 *  re-audit this block whenever previews are re-captured. */
export const SEED_PREVIEW_FILL: PreviewFillData = {
  asOf: "07/09/2026",
  hero: {
    value: "$290,000",
    label: "Median asking price · Lee County",
    prose:
      "Asking prices have settled while inventory builds — buyers have more choice than they've had in years.",
  },
  stats: [
    { value: "$223", label: "Median $ / Sq Ft" },
    { value: "83 days", label: "Median Days on Market" },
    { value: "−8.1%", label: "Home Values YoY" },
    { value: "21,934", label: "Homes for Sale" },
    { value: "16.3%", label: "Listings With a Price Cut" },
    { value: "25.5%", label: "Pending Ratio" },
  ],
  metricCard: {
    metricValue: "$433,549",
    metricLabel: "Average ZIP Home Value · Lee County",
    sub: "Zillow Home Value Index, through 05/31/2026",
    rankText: "Across 31 Lee County ZIPs",
    movementText: "↓ 8.1% YoY",
    barPct: 55,
  },
  listings: [
    {
      photoUrl: "/showcase/seed-previews/assets/pexels-15334543.jpg",
      price: "$955,000",
      beds: "4",
      baths: "3",
      sqft: "2,350",
      address: "1430 SE 23rd St, Cape Coral",
    },
    {
      photoUrl: "/showcase/seed-previews/assets/pexels-15824733.jpg",
      price: "$469,900",
      beds: "3",
      baths: "2",
      sqft: "1,920",
      address: "238 SW 45th Ter, Cape Coral",
    },
    {
      photoUrl: "/showcase/seed-previews/assets/pexels-10682504.jpg",
      price: "$339,000",
      beds: "3",
      baths: "2.5",
      sqft: "2,033",
      address: "4078 Wilmont Pl, Fort Myers",
    },
    {
      photoUrl: "/showcase/seed-previews/assets/pexels-15351930.jpg",
      price: "$609,000",
      beds: "4",
      baths: "3",
      sqft: "2,010",
      address: "3306 SW 3rd Ter, Cape Coral",
    },
    {
      photoUrl: "/showcase/seed-previews/assets/pexels-15368388.jpg",
      price: "$329,000",
      beds: "3",
      baths: "2",
      sqft: "1,659",
      address: "246 SW 37th St, Cape Coral",
    },
  ],
  photos: [
    {
      url: "/showcase/seed-previews/assets/pexels-15334543.jpg",
      alt: "Waterfront Gulf-coast home with palms",
    },
    {
      url: "/showcase/seed-previews/assets/pexels-15824733.jpg",
      alt: "White villa with royal palms",
    },
    {
      url: "/showcase/seed-previews/assets/pexels-10682504.jpg",
      alt: "Neighborhood homes on a pond at dusk",
    },
  ],
  portrait: {
    // Professional 2:1 banner crop (agent-hero renders 600×300; a pre-cropped
    // 2:1 keeps Outlook honest — it ignores object-fit). Pexels license, same
    // lane as every pexels-*.jpg here. Replaced the marisol-vega banner
    // (busy-wallpaper crop, operator ruling 07/10/2026).
    url: "/showcase/seed-previews/assets/pexels-7414903-banner.jpg",
    alt: "Agent in a navy suit at a home showing",
  },
  agentBio:
    "I work Lee County every day — my updates carry the real numbers behind the market, sourced and dated.",
  commentary: [
    "The median asking price in Lee County sits at $290,000 across 21,934 active listings — buyers have real choice again.",
    "Home values across Lee County ZIPs are down 8.1% from a year ago — the reset that began in 2025 is still working through.",
    "About one in six listings has taken a price cut, and the typical home now waits 83 days for a buyer.",
    "The 30-year fixed rate averaged 6.49% this week — below last July's 6.72%, and every quarter point moves a payment.",
    "A quarter of Lee County's listings are pending — well-priced homes still move.",
  ],
  listItems: [
    { lead: "PRICE ·", text: "Median asking price holds at $290,000 county-wide." },
    { lead: "PACE ·", text: "Typical listing waits 83 days for its buyer." },
    { lead: "SUPPLY ·", text: "21,934 homes for sale — 1,734 of them newly listed." },
    { lead: "CUTS ·", text: "16.3% of listings have reduced their asking price." },
  ],
  chart: {
    url: "/showcase/seed-previews/assets/chart-lee-home-values.svg",
    alt: "Lee County average ZIP home value, May 2025 to May 2026",
    caption: "Lee County home values, 12-month trend — Zillow Home Value Index",
  },
  sources: [
    { label: "SWFL Data Gulf listing feed · 07/09/2026", url: "https://www.swfldatagulf.com" },
    {
      label: "Lee County recorded sales · through 05/30/2026",
      url: "https://www.swfldatagulf.com/r/source/leepa",
    },
    {
      label: "Zillow Home Value Index (incl. price tiers), Lee County ZIPs · through 05/31/2026",
      url: "https://www.zillow.com/research/data/",
    },
    {
      label: "Zillow Observed Rent Index, Fort Myers ZIPs · through 05/31/2026",
      url: "https://www.zillow.com/research/data/",
    },
    {
      label: "Realtor.com listing metrics, per-ZIP and county · June 2026",
      url: "https://www.realtor.com/research/data/",
    },
    {
      label: "Freddie Mac Primary Mortgage Market Survey · 07/09/2026",
      url: "https://www.freddiemac.com/pmms",
    },
  ],
  sourcesNote: "Live SWFL data · figures as of 07/09/2026",
};

// ── committed chart assets (scripts/generate-seed-preview-charts.mts) ────────

const A = "/showcase/seed-previews/assets";

const CHART_ZIP_BARS: Chart = {
  url: `${A}/chart-zip-asking-bars.svg`,
  alt: "Median asking price across the six biggest Lee County ZIPs, June 2026",
  caption: "Median asking across Lee County's six biggest ZIPs — Realtor.com",
};
const CHART_LEE_ASKING: Chart = {
  url: `${A}/chart-lee-median-asking.svg`,
  alt: "Lee County median asking price, June 2025 to June 2026",
  caption: "12-month median asking price · Lee County — Realtor.com via FRED",
};
const CHART_LEE_INVENTORY: Chart = {
  url: `${A}/chart-lee-active-inventory.svg`,
  alt: "Homes for sale in Lee County, June 2025 to June 2026",
  caption: "Homes for sale, same window · Lee County — Realtor.com via FRED",
};
const CHART_LUXURY: Chart = {
  url: `${A}/chart-luxury-naples-ring.svg`,
  alt: "Luxury listings by price tier, Naples / Collier County",
  caption: "1,226 luxury listings priced above $2M · Naples / Collier — SWFL Data Gulf",
};
const CHART_33914: Chart = {
  url: `${A}/chart-zip33914-asking.svg`,
  alt: "ZIP 33914 median asking price, November 2025 to June 2026",
  caption: "Median asking price · ZIP 33914, Cape Coral — Realtor.com",
};
const CHART_FM_RENT: Chart = {
  url: `${A}/chart-fm-rent.svg`,
  alt: "Typical Fort Myers asking rent, April 2025 to May 2026",
  caption: "Typical asking rent · Fort Myers — Zillow Observed Rent Index",
};
const CHART_PMMS: Chart = {
  url: `${A}/chart-pmms-rate.svg`,
  alt: "30-year fixed mortgage rate, weekly, July 2025 to July 2026",
  caption: "30-year fixed rate, weekly — Freddie Mac PMMS",
};
const CHART_SALES_BY_MONTH: Chart = {
  url: `${A}/chart-lee-sales-by-month.svg`,
  alt: "Lee County homes sold by month, May 2025 to April 2026",
  caption: "Homes sold by month · Lee County — recorded sales, Property Appraiser",
};
const CHART_SALE_PRICE_YEAR: Chart = {
  url: `${A}/chart-lee-sale-price-year.svg`,
  alt: "Lee County median recorded sale price by month, May 2025 to April 2026",
  caption: "Median recorded sale price, month by month — Lee County Property Appraiser",
};
const CHART_ZHVI: Chart = SEED_PREVIEW_FILL.chart;

/** Per-seed fill assignment — the variety pass. Charts/photos/listings are
 *  consumed by slot order within the doc; anything not set falls back to the
 *  generic pool above. */
interface SeedAssignment {
  hero?: PreviewFillData["hero"];
  stats?: { value: string; label: string }[];
  charts?: Chart[];
  photos?: Photo[];
  listings?: Listing[];
  commentary?: string[];
  signals?: { title: string; body: string }[];
  /** Per-seed agent portrait — so no two agent templates preview the same face. */
  portrait?: PreviewFillData["portrait"];
  /** Editorial seeds whose baked-in body copy is an authoring instruction the
   *  slot-rule regex can't catch — replace every text body from commentary. */
  replaceTextBodies?: boolean;
}

export const SEED_ASSIGNMENTS: Record<string, SeedAssignment> = {
  // ── weekly ──────────────────────────────────────────────────────────────
  "market-spotlight": {
    hero: SEED_PREVIEW_FILL.hero,
    stats: [
      { value: "83 days", label: "Median DOM" },
      { value: "21,934", label: "Homes for Sale" },
      { value: "−8.1%", label: "Home Values YoY" },
    ],
    charts: [CHART_LEE_ASKING],
    signals: [
      {
        title: "One in six listings has cut its price",
        body: "16.3% of Lee County's 21,934 active listings have reduced asking — the widest selection and deepest discounting in years.",
      },
    ],
  },
  "weekly-pulse": {
    stats: [
      { value: "$396,850", label: "Median Asking · June" },
      { value: "83 days", label: "Median DOM" },
      { value: "10,575", label: "Homes for Sale · June" },
    ],
    charts: [CHART_ZIP_BARS, CHART_LEE_ASKING, CHART_LEE_INVENTORY],
    signals: [
      {
        title: "Cape Coral 33914 vs the county",
        body: "33914's median asking sits at $550,000 against $396,850 county-wide — canal-front stock holds its premium even in a buyer's market.",
      },
    ],
  },
  "trend-snapshot": {
    stats: [
      { value: "$433,549", label: "Average ZIP Home Value" },
      { value: "−8.1%", label: "Change Over 12 Months" },
      { value: "$471,582", label: "Where Values Stood Last May" },
    ],
    charts: [CHART_ZHVI],
    commentary: [
      "Lee County's average ZIP home value slid 8.1% in twelve months, from $471,582 to $433,549 — but the pace of decline has flattened since winter. Watch whether June's $396,850 median asking holds.",
    ],
  },
  "rate-watch": {
    hero: {
      value: "6.49%",
      label: "30-Year Fixed · U.S. Weekly Average",
      prose: "Up from 6.43% last week, still below last July's 6.72% — Freddie Mac PMMS.",
    },
    stats: [
      { value: "$2,526", label: "Payment on $400K · computed" },
      { value: "5.82%", label: "15-Yr Fixed" },
      { value: "6.72%", label: "30-Yr, a Year Ago" },
    ],
    charts: [CHART_PMMS],
    signals: [
      {
        title: "A quarter point is real money",
        body: "At 6.49%, the payment on a $400,000 loan runs about $2,526 a month — computed straight from this week's average rate.",
      },
    ],
    commentary: [
      "Rates spent the spring climbing back from 5.98% in late February to 6.49% this week. If a payment works at today's rate, it only gets better from any dip — that's the case for shopping now and refinancing later.",
    ],
  },

  // ── monthly ─────────────────────────────────────────────────────────────
  "market-letter": {
    hero: {
      value: "16.3%",
      label: "Lee County listings with a price cut",
      prose: "",
    },
    commentary: [
      "Sixteen percent of Lee County listings have taken a price cut, and the typical home waits 83 days. That's not a crash — it's a negotiation, and buyers finally hold the pen.",
    ],
    signals: [
      {
        title: "Price cuts are doing the negotiating",
        body: "With 21,934 homes for sale and a quarter of them pending, the market clears — just at the buyer's pace, not the seller's.",
      },
    ],
  },
  "luxury-market-report": {
    hero: {
      value: "1,226",
      label: "Luxury Listings · Naples / Collier",
      prose:
        "1,226 listings are priced above $2M in Naples/Collier, top-heavy toward the very top: 152 above $10M.",
    },
    stats: [
      { value: "1,226", label: "Luxury Listings · Naples/Collier" },
      { value: "152", label: "Listed Above $10M" },
    ],
    charts: [CHART_LUXURY],
    photos: [
      {
        url: `${A}/swfl-sunset-estate-boats.jpg`,
        alt: "Waterfront estate at sunset with boat docks",
      },
    ],
    listings: [
      {
        photoUrl: `${A}/pexels-15334539.jpg`,
        price: "$1,399,000",
        beds: "5",
        baths: "4",
        sqft: "3,359",
        address: "4347 Aurora St, Naples",
      },
      {
        photoUrl: `${A}/pexels-15368388.jpg`,
        price: "$1,360,000",
        beds: "3",
        baths: "3",
        sqft: "2,307",
        address: "9630 Campanile Cir, Naples",
      },
    ],
  },
  "neighborhood-report": {
    hero: {
      value: "$550,000",
      label: "Median asking price · ZIP 33914 · Cape Coral",
      prose: "",
    },
    stats: [
      { value: "$550,000", label: "Median Asking · June" },
      { value: "92 days", label: "Median DOM · 33914" },
      { value: "124", label: "New Listings · June" },
    ],
    charts: [CHART_33914],
    signals: [
      {
        title: "Prices in 33914 are finally moving",
        body: "Median asking stepped down from $599,000 in January to $550,000 in June — sellers are meeting the market.",
      },
    ],
    commentary: [
      "Asking prices in 33914 are down $49,000 since January. Sellers: price to the trend, not the peak. Buyers: a 92-day median wait means room to negotiate.",
    ],
  },
  "investment-brief": {
    hero: {
      value: "$1,807",
      label: "Typical asking rent · Fort Myers · monthly",
      prose: "",
    },
    stats: [
      { value: "$1,807", label: "Typical Rent · Fort Myers" },
      { value: "−2.0%", label: "Rent YoY" },
      { value: "18.3×", label: "Price ÷ Annual Rent · computed" },
    ],
    charts: [CHART_FM_RENT],
    photos: [
      { url: `${A}/swfl-naples-bayfront.jpg`, alt: "Waterfront condo buildings and marina" },
    ],
    signals: [
      {
        // NO TRAJECTORY WORD. $1,787 → $1,807 is a $20 move; "stabilized" and "bottomed"
        // were asserting a direction that a move this small cannot establish (the same
        // claim trendVerdict was built to stop — see lib/charts/series-fit.ts).
        title: "Rents flat while prices soften",
        body: "Fort Myers typical rent was $1,787 in March and is $1,807 now — a $20 move. Flat rents against softer prices move the math toward buyers.",
      },
    ],
  },
  "monthly-digest": {
    hero: {
      value: "$330,500",
      label: "Median recorded sale · Lee County · April 2026",
      prose: "",
    },
    stats: [
      { value: "$330,500", label: "Median Sale · April" },
      { value: "83 days", label: "Median Days on Market" },
      { value: "11,347", label: "Homes for Sale · May" },
    ],
    charts: [CHART_SALES_BY_MONTH, CHART_LEE_INVENTORY],
    signals: [
      {
        title: "Spring closed strong",
        body: "3,636 sales recorded in April after March's 3,849 — the two busiest months of the past year, even with values down 8.1% from last summer.",
      },
    ],
    commentary: [
      "Buyers closed 3,636 Lee County homes in April at a median of $330,500. Inventory is easing off its February peak — 11,347 homes for sale in May, down from 12,676.",
    ],
  },
  "editorial-letter": {
    replaceTextBodies: true,
    commentary: [
      "Dear reader,\n\nThe market didn't crash this year — it exhaled. Values across Lee County ZIPs sit 8.1% below last May, the typical listing waits 83 days, and one in six sellers has already cut price. If you've been waiting for leverage, this is what it looks like.\n\nWarmly,",
    ],
  },
  "magazine-issue": {
    photos: [
      {
        url: `${A}/swfl-fmb-pier-aerial.jpg`,
        alt: "Fort Myers Beach shoreline and pier from above",
      },
      // Feature-card image slots (columns declaring imageUrl: "") consume next.
      { url: `${A}/swfl-naples-bayfront.jpg`, alt: "Waterfront condo buildings and marina" },
      { url: `${A}/swfl-coastal-great-room.jpg`, alt: "Open coastal great room" },
    ],
    commentary: [
      "Home values reset 8.1% in a year — inside the ZIPs that held firm and the ones that led the slide.",
      "21,934 homes are on the market county-wide. We picked where the money is actually moving.",
    ],
    // The dark section band carries a real desk note — its seed copy is now
    // slot-honest instructions, so an unfilled signal would leak them.
    signals: [
      {
        // "found its floor" asserted the decline had ENDED. An 8.1% fall says values went
        // down; it says nothing about where they settle. Trajectory word removed.
        title: "Values closed the year down 8.1%",
        body: "Values across Lee County ZIPs closed the year down 8.1%, while April recorded 3,636 sales. Whether the decline has run its course is not something these figures show.",
      },
    ],
  },

  // ── annual ──────────────────────────────────────────────────────────────
  "year-in-review": {
    hero: {
      value: "−8.1%",
      label: "Lee County home values · 12-month change",
      // Was: "…the year the market reset found its floor." The two figures support the
      // 8.1% decline and nothing beyond it. State the move; do not name its future.
      prose: "From $471,582 to $433,549 in twelve months — an 8.1% decline.",
    },
    stats: [
      { value: "$433,549", label: "Average ZIP Home Value" },
      { value: "−8.1%", label: "Annual Value Change" },
      { value: "37,040", label: "Sales Recorded · 12 Months" },
    ],
    charts: [CHART_SALE_PRICE_YEAR, CHART_SALES_BY_MONTH],
    // Three-up card row: titles one short line, bodies near-equal length —
    // uneven copy renders as ragged card heights in the 3×4-column layout.
    signals: [
      {
        title: "Sales led",
        body: "March was the year's busiest month — 3,849 recorded sales — and April held nearly all of it at 3,636.",
      },
      {
        title: "Prices gave",
        body: "The median sale drifted from $349,999 last May to $330,500 in April; the top tier gave back 7%.",
      },
      {
        title: "Watch rates",
        body: "If the 30-year rate holds near 6.49%, expect spring's pattern again — volume first, prices second.",
      },
    ],
    commentary: [
      "Twelve months, 37,040 recorded sales, and a market that repriced without freezing — that was the year. I'll keep sending the real numbers as they land.",
    ],
  },

  // ── listing & event ─────────────────────────────────────────────────────
  "just-sold": {
    hero: {
      value: "$330,500",
      label: "Median recorded sale · Lee County · April 2026",
      prose: "3,636 sales recorded county-wide in April — the sold market stays liquid.",
    },
    stats: [
      { value: "$330,500", label: "Median Sale · April" },
      { value: "3,636", label: "Sales Recorded · April" },
      { value: "83 days", label: "County Median DOM" },
    ],
    photos: [{ url: `${A}/pexels-15824733.jpg`, alt: "White villa with royal palms" }],
  },
  "just-sold-grid": {
    hero: {
      value: "$320,000",
      label: "Median recorded sale · Lee County · March 2026",
      prose: "",
    },
    stats: [
      { value: "$320,000", label: "Median Sale · March" },
      { value: "3,849", label: "Sales Recorded · March" },
      { value: "25.5%", label: "Pending Ratio Today" },
    ],
    photos: [{ url: `${A}/swfl-beach-house-dusk.jpg`, alt: "Coastal home at dusk with pool cage" }],
    commentary: [
      "March was the busiest month of the year county-wide — 3,849 recorded sales — and well-priced homes led the pack.",
    ],
  },
  // Listing-lane copy SELLS (operator ruling 07/10/2026): never quote a market
  // figure that reads cheaper than the subject property — the earlier
  // "$406/sqft against a county median of $223" told every reader the home was
  // overpriced. Comparisons appear only when they favor the home; county pace
  // stats build urgency instead. Skipping a figure is selection, not invention.
  "listing-feature": {
    hero: {
      value: "$955,000",
      label: "1430 SE 23rd St, Cape Coral · 4 bd · 3 ba · 2,350 sq ft",
      prose: "Four bedrooms, three baths, and 2,350 square feet in southeast Cape Coral.",
    },
    photos: [{ url: `${A}/swfl-stilt-beach-house.jpg`, alt: "Elevated coastal home at dusk" }],
    commentary: [
      "Room to spread out and the indoor-outdoor living Cape Coral is known for — with 25.5% of Lee County listings already pending, homes that show this well are the ones that draw the early offers. Private showings this week.",
    ],
  },
  "new-listing": {
    hero: {
      value: "$609,000",
      label: "3306 SW 3rd Ter, Cape Coral",
      prose: "",
    },
    stats: [
      { value: "4", label: "Beds" },
      { value: "3", label: "Baths" },
      { value: "2,010", label: "Sq Ft" },
    ],
    photos: [{ url: `${A}/pexels-15334543.jpg`, alt: "Gulf-coast home with palms" }],
    commentary: [
      "Four bedrooms, three baths, and 2,010 square feet in southwest Cape Coral — fresh to market at $609,000. With 25.5% of Lee County listings already pending, the homes priced right don't linger. Schedule your showing early.",
    ],
  },
  "open-house": {
    hero: {
      value: "Saturday · 11–2",
      label: "13585 Bluebay Cir, Fort Myers",
      prose: "",
    },
    stats: [
      { value: "$898,000", label: "Asking Price" },
      { value: "4 bd · 3 ba", label: "Beds / Baths" },
      { value: "2,247", label: "Sq Ft" },
    ],
    photos: [
      { url: `${A}/swfl-front-porch-entry.jpg`, alt: "Front porch entry with swings and flowers" },
    ],
    commentary: [
      "Come see it in person — Saturday morning, coffee on. In a market where the typical listing waits 83 days, the right home at the right price still draws a crowd.",
    ],
  },
  "price-reduced": {
    hero: {
      value: "−$25,000",
      label: "2121 SW 39th Ter, Cape Coral · now $605,000",
      prose: "One of the 16.3% of Lee County listings that has moved its asking price.",
    },
    stats: [
      { value: "$630,000", label: "Original Price" },
      { value: "−$25,000", label: "Price Drop" },
      { value: "83 days", label: "County Median DOM" },
    ],
    photos: [{ url: `${A}/swfl-blue-ranch-home.jpg`, alt: "Blue single-family home with palms" }],
    commentary: [
      "A $25,000 move on asking says the seller is serious — in a county where 16.3% of listings have cut price, the ones that reprice decisively are the ones that close.",
    ],
  },
  "listing-digest": {
    hero: {
      value: "1,734",
      label: "New listings this month · Lee County — four picks below",
      prose: "",
    },
    listings: [
      {
        photoUrl: `${A}/swfl-coach-homes.jpg`,
        price: "$599,000",
        beds: "4",
        baths: "3",
        sqft: "2,046",
        address: "1801 SW 15th Pl, Cape Coral",
      },
      {
        photoUrl: `${A}/swfl-canal-to-gulf-aerial.jpg`,
        price: "$1,395,000",
        beds: "3",
        baths: "2",
        sqft: "1,649",
        address: "785 Willow Ct, Marco Island",
      },
      {
        photoUrl: `${A}/swfl-beachfront-pool-sunset.jpg`,
        price: "$650,000",
        beds: "3",
        baths: "2",
        sqft: "2,037",
        address: "2378 Riverreach Dr, Naples",
      },
      {
        photoUrl: `${A}/pexels-15351930.jpg`,
        price: "$1,850,000",
        beds: "4",
        baths: "3",
        sqft: "2,514",
        address: "667 Parkshore Dr, Naples",
      },
    ],
  },

  // ── relationship ────────────────────────────────────────────────────────
  welcome: {
    hero: {
      value: "$290,000",
      label: "Median asking price · Lee County — the kind of number every send is built on",
      prose:
        "I'm glad you're here. Expect a short, honest read on the market — every figure sourced and dated, never a guess.",
    },
  },
  minimal: {
    hero: {
      value: "$223",
      label: "Median price per square foot · Lee County",
      prose: "One number worth knowing this week, straight from the county's listing feed.",
    },
  },
  "agent-spotlight": {
    hero: {
      value: "25.5%",
      label: "Share of Lee County listings already pending",
      prose: "I work this market every day — here's what I'm seeing, in real numbers.",
    },
    stats: [
      { value: "3,636", label: "Lee County Sales · April" },
      { value: "$330,500", label: "Median Sale Price" },
      { value: "83 days", label: "Median Days on Market" },
    ],
  },
  "stay-in-touch": {
    // Different face from skeleton-agent-feature — no two agent templates
    // preview the same portrait.
    portrait: {
      url: `${A}/pexels-36733296-banner.jpg`,
      alt: "Agent in a gray suit in a bright lobby",
    },
    hero: {
      value: "$433,549",
      label: "Average Lee County ZIP home value today",
      prose:
        "Halfway through the year — thought you'd appreciate a quick look at where things stand in your market.",
    },
    signals: [
      {
        title: "Your equity context",
        body: "The average Lee County ZIP home value stands at $433,549, down 8.1% on the year — worth knowing before any move, in either direction.",
      },
    ],
  },

  // ── blank canvases — the preview shows the kind of content a user would put
  // there (operator ruling 07/10/2026: no meta "your story goes here" copy; a
  // blank canvas previews best with a real, sourced example filling its shape).
  "skeleton-clean-white": {
    hero: { value: "$290,000", label: "Median asking price · Lee County", prose: "" },
    stats: [
      { value: "$290,000", label: "Median Asking Price" },
      { value: "83 days", label: "Days on Market" },
      { value: "21,934", label: "Homes for Sale" },
    ],
    photos: [{ url: `${A}/swfl-coastal-great-room.jpg`, alt: "Open coastal great room" }],
    commentary: [
      "Lee County handed buyers real choice this month — 21,934 homes for sale and a median ask of $290,000. If you've been waiting for leverage, this is what it looks like.",
    ],
  },
  "skeleton-dark-pro": {
    hero: { value: "83 days", label: "Median days on market · Lee County", prose: "" },
    stats: [
      { value: "$223", label: "Price per Sq Ft" },
      { value: "25.5%", label: "Pending Ratio" },
      { value: "16.3%", label: "With a Price Cut" },
    ],
    photos: [{ url: `${A}/swfl-canal-night.jpg`, alt: "Canal homes at night" }],
    commentary: [
      "Buyers are negotiating again and sellers are adjusting: 16.3% of Lee County listings have cut asking, yet 25.5% sit pending. The homes that move are priced to the market from day one.",
    ],
  },
  "skeleton-agent-feature": {
    portrait: {
      url: `${A}/pexels-7414903-banner.jpg`,
      alt: "Agent in a navy suit at a home showing",
    },
    stats: [
      { value: "3,636", label: "April Sales · Lee County" },
      { value: "$330,500", label: "Median Sale Price" },
      { value: "83 days", label: "Median DOM" },
    ],
    commentary: [
      "I watch this county's numbers every morning — 3,636 closings last April alone — so my clients never price on a guess. When you're ready, we'll start from the real figures.",
    ],
  },
  "skeleton-listing-showcase": {
    hero: {
      value: "$339,000",
      label: "3 bd · 2.5 ba · 2,033 sq ft · Fort Myers",
      prose: "",
    },
    stats: [
      { value: "3", label: "Beds" },
      { value: "2.5", label: "Baths" },
      { value: "2,033", label: "Sq Ft" },
    ],
    photos: [{ url: `${A}/swfl-coastal-living-room.jpg`, alt: "Coastal living room and kitchen" }],
    commentary: [
      // A favorable comparison is the ONE kind that belongs in listing copy:
      // $339,000 sits under the county's $396,850 June median ask.
      "Three bedrooms and 2,033 square feet in Fort Myers at $339,000 — under the county's $396,850 median ask this June. Move-in ready, and priced like it wants to go pending.",
    ],
  },
};

/** Text that reads as an authoring instruction, not content — seed labels put
 *  the instruction in the copy slot (THE SLOT RULE), so previews replace it.
 *  Second-person "Your title and brokerage"-style slots count too — one shipped
 *  verbatim into the agent-spotlight capture (07/10/2026). */
const INSTRUCTION_RE =
  /^(write|say|name|tell|describe|add|swap|use|pick|lead|open|share|explain|give|list|note|call|invite|announce|introduce|summarize|highlight|read|pull|ground|welcome|your|a short bio|the headline)\b|\[\[/i;

function isInstruction(s: string | undefined): boolean {
  return !!s && INSTRUCTION_RE.test(s.trim());
}

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

// Legacy seeds predate THE SLOT RULE and still carry finished EXAMPLE values
// (the $485K / 4521 Surfside class — `email_palette_demo_figures`). A preview
// must never show an invented demo number, so "equals the type's default
// placeholder" counts as fillable exactly like "empty."
const D = DEFAULT_BLOCK_PROPS;
const DEMO_STAT_VALUES = new Set(D.stats.stats.map((s) => s.value));

function isDemo(s: string | undefined, dflt: string | undefined): boolean {
  return !!s && !!dflt && s === dflt;
}

/** Empty, an authoring instruction, or the type's demo placeholder → fill it. */
function fillable(s: string | undefined, dflt?: string): boolean {
  return isEmpty(s) || isInstruction(s) || isDemo(s, dflt);
}

function cycler<T>(pool: T[]): () => T {
  let i = 0;
  return () => pool[i++ % pool.length];
}

/** Consume a per-seed list in slot order, falling back once exhausted. */
function consumer<T>(assigned: T[] | undefined, fallback: () => T): () => T {
  let i = 0;
  return () => (assigned && i < assigned.length ? assigned[i++] : fallback());
}

/**
 * Fill a built seed's EMPTY/instruction slots with real, sourced display
 * content. Pure: deep-clones the input, never mutates it. Brand blocks
 * (header/footer), buttons, dividers, layout, and globalStyle are untouched —
 * the template's own design IS the thing being previewed.
 */
export function previewFill(
  doc: EmailDoc,
  opts: { seedId?: string; fill?: PreviewFillData } = {},
): EmailDoc {
  const fill = opts.fill ?? SEED_PREVIEW_FILL;
  const assign = opts.seedId ? SEED_ASSIGNMENTS[opts.seedId] : undefined;
  const out = structuredClone(doc);

  const nextListing = consumer(assign?.listings, cycler(fill.listings));
  const nextPhoto = consumer(assign?.photos, cycler(fill.photos));
  const nextComment = consumer(assign?.commentary, cycler(fill.commentary));
  // THE DUPLICATE-ROW BUG. This was `cycler(assign?.stats ?? fill.stats)` — a cycler
  // WRAPS (pool[i++ % len]), so a seed carrying 3 stats against a 6-cell strip printed
  // 1,2,3,1,2,3 and shipped the same three figures twice in one row (market-spotlight,
  // new-listing, open-house, price-reduced, just-sold). The templates were widened from
  // 3 cells to 5-6; the per-seed fill lists were not.
  //
  // Now it matches every other filler in this file: consume the seed's own list, then
  // fall through to the GLOBAL pool — six real, distinct, sourced figures — instead of
  // repeating. A repeat is not a slot; it is the same fact printed twice.
  //
  // AND IT DEDUPES. A plain fallback still collided: just-sold and price-reduced each
  // carry "83 days" themselves, and the global pool's second entry is "83 days" too — so
  // the row printed it twice anyway. The invariant is not "don't wrap", it is: A FIGURE
  // APPEARS AT MOST ONCE IN A STAT ROW. Enforced here, pinned by preview-fill.test.ts.
  const usedStats = new Set<string>();
  const poolStat = cycler(fill.stats);
  const takeAssigned = consumer(assign?.stats, () => poolStat());
  const nextStat = () => {
    for (
      let attempt = 0;
      attempt < fill.stats.length + (assign?.stats?.length ?? 0) + 1;
      attempt++
    ) {
      const s = attempt === 0 ? takeAssigned() : poolStat();
      if (!usedStats.has(s.value)) {
        usedStats.add(s.value);
        return s;
      }
    }
    // Pool exhausted with no unused figure left. The slot rule says an unsourced cell is
    // an OPEN SLOT, not a filler — better an empty cell than the same number twice.
    return { value: "", label: "" };
  };
  const nextChart = consumer(assign?.charts, () => fill.chart);
  const nextSignal = consumer(assign?.signals, () => ({
    title: "Values drift lower while buyers regain leverage",
    body: cycler(fill.commentary)(),
  }));
  const hero = assign?.hero ?? fill.hero;

  for (const block of out.blocks) {
    switch (block.type) {
      case "hero": {
        const p = block.props;
        if (fillable(p.value, D.hero.value)) {
          p.value = hero.value;
          p.label = hero.label;
        }
        if (fillable(p.prose, D.hero.prose)) p.prose = hero.prose;
        if (isInstruction(p.label)) p.label = hero.label;
        break;
      }
      case "stats": {
        for (const s of block.props.stats) {
          if (isEmpty(s.value) || DEMO_STAT_VALUES.has(s.value)) {
            const st = nextStat();
            s.value = st.value;
            s.label = st.label;
          }
        }
        break;
      }
      case "metric-card": {
        const p = block.props;
        if (fillable(p.metricValue, D["metric-card"].metricValue)) {
          Object.assign(p, fill.metricCard);
        }
        break;
      }
      case "signal": {
        const p = block.props;
        if (assign?.signals) {
          // Assigned signals are coherent title+body pairs — replace both, or
          // a preset instruction body survives under a filled title (the
          // "Waterfront, luxury, a price band — say which and why" leak,
          // caught in set-level QA 07/09/2026).
          const sig = nextSignal();
          p.title = sig.title;
          p.body = sig.body;
        } else if (fillable(p.title, D.signal.title) || fillable(p.body, D.signal.body)) {
          const sig = nextSignal();
          if (fillable(p.title, D.signal.title)) p.title = sig.title;
          if (fillable(p.body, D.signal.body)) p.body = sig.body;
        }
        break;
      }
      case "text": {
        const p = block.props;
        if (fillable(p.body, D.text.body) || assign?.replaceTextBodies) {
          p.body = nextComment();
        }
        break;
      }
      case "image": {
        const p = block.props;
        if (isEmpty(p.url)) {
          const wantsChart =
            p.kind === "chart" || /chart|trend|graph/i.test(`${p.alt ?? ""} ${p.caption ?? ""}`);
          if (wantsChart && p.kind !== "photo") {
            const c = nextChart();
            p.url = c.url;
            p.alt = c.alt;
            p.caption = c.caption;
          } else {
            const ph = nextPhoto();
            p.url = ph.url;
            p.alt = ph.alt;
            if (isInstruction(p.caption)) p.caption = "";
          }
        }
        break;
      }
      case "listing": {
        const p = block.props;
        if (fillable(p.address, D.listing.address) || fillable(p.price, D.listing.price)) {
          const l = nextListing();
          p.photoUrl = isEmpty(p.photoUrl) ? l.photoUrl : p.photoUrl;
          p.price = l.price;
          p.beds = l.beds;
          p.baths = l.baths;
          p.sqft = l.sqft;
          p.address = l.address;
        } else if (isEmpty(p.photoUrl)) {
          p.photoUrl = nextPhoto().url;
        }
        break;
      }
      case "multi-column": {
        const dfltBodies = new Set(D["multi-column"].columns.map((c) => c.body));
        for (const col of block.props.columns) {
          if (isEmpty(col.body) || isInstruction(col.body) || dfltBodies.has(col.body)) {
            col.body = nextComment();
          }
          // A feature card that DECLARES an image slot (imageUrl: "") gets a real
          // photo — a column without the key stays image-less (template-owned).
          if ("imageUrl" in col && isEmpty(col.imageUrl)) {
            col.imageUrl = nextPhoto().url;
          }
        }
        break;
      }
      case "list": {
        const dfltTexts = new Set(D.list.items.map((i) => i.text));
        const items = block.props.items;
        for (let i = 0; i < items.length; i++) {
          if (
            isEmpty(items[i].text) ||
            isInstruction(items[i].text) ||
            dfltTexts.has(items[i].text)
          ) {
            const it = fill.listItems[i % fill.listItems.length];
            items[i].lead = it.lead;
            items[i].text = it.text;
          }
        }
        break;
      }
      case "agent-hero": {
        const p = block.props;
        if (isEmpty(p.photoUrl)) {
          const portrait = assign?.portrait ?? fill.portrait;
          p.photoUrl = portrait.url;
          p.alt = portrait.alt;
        }
        if (fillable(p.tagline, D["agent-hero"].tagline)) p.tagline = fill.agentBio;
        break;
      }
      case "agent-card": {
        const p = block.props;
        if (fillable(p.bio, D["agent-card"].bio)) p.bio = fill.agentBio;
        // "Your title and brokerage"-class slots — show an example designation,
        // never the instruction (applyBrand owns this in real sends).
        if (isInstruction(p.title)) p.title = "Realtor® · Southwest Florida";
        break;
      }
      case "sources": {
        if (block.props.sources.length === 0) {
          block.props.sources = fill.sources.map((s) => ({ ...s }));
          block.props.note = fill.sourcesNote;
        }
        break;
      }
      // header/footer/button/divider/social-icons: brand + structure, untouched.
    }
  }
  return out;
}
