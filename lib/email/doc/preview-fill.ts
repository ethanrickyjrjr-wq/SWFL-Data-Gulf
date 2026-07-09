// lib/email/doc/preview-fill.ts
//
// PREVIEW-ONLY fill for the template gallery captures (spec:
// docs/superpowers/specs/2026-07-09-template-preview-gallery-design.md).
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
// FOUR-LANE HONEST: every figure below is real and named —
//   · SWFL Data Gulf listing feed (data_lake.listing_state), 07/09/2026
//   · Zillow Home Value Index, Lee County ZIPs, through 05/31/2026
//   · Realtor.com market hotness (market_heat_core_swfl), June 2026
//   · Freddie Mac Primary Mortgage Market Survey, 07/09/2026
// Listing rows are real active Lee County listings from the feed (cited as
// "SWFL Data Gulf", never vendor/MLS#). Photos are committed, licensed assets
// under public/showcase/seed-previews/ — never hotlinked externals.

import type { EmailDoc } from "./types";
import { DEFAULT_BLOCK_PROPS } from "./default-docs";

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
      photoUrl: "/showcase/seed-previews/assets/pexels-15334543.jpg",
      price: "$609,000",
      beds: "4",
      baths: "3",
      sqft: "2,010",
      address: "3306 SW 3rd Ter, Cape Coral",
    },
    {
      photoUrl: "/showcase/seed-previews/assets/pexels-15824733.jpg",
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
    url: "/showcase/agent-launch/live/assets/marisol-vega.jpg",
    alt: "Agent portrait",
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
      label: "Zillow Home Value Index, Lee County ZIPs · through 05/31/2026",
      url: "https://www.zillow.com/research/data/",
    },
    {
      label: "Realtor.com market hotness, Lee County ZIPs · June 2026",
      url: "https://www.realtor.com/research/data/",
    },
    {
      label: "Freddie Mac Primary Mortgage Market Survey · 07/09/2026",
      url: "https://www.freddiemac.com/pmms",
    },
  ],
  sourcesNote: "Live SWFL data · figures as of 07/09/2026",
};

/** Per-seed overrides where the template's job needs a different headline
 *  figure than the generic market set (rate templates get the rate, the annual
 *  template gets the 12-month move). Same real sources as the pool above. */
const SEED_OVERRIDES: Record<string, Partial<Pick<PreviewFillData, "hero" | "stats">>> = {
  "listing-feature": {
    hero: {
      value: "$955,000",
      label: "1430 SE 23rd St, Cape Coral · 4 bd · 3 ba · 2,350 sq ft",
      prose: "Listed at $406 per square foot against a county median of $223.",
    },
  },
  "new-listing": {
    hero: {
      value: "$955,000",
      label: "1430 SE 23rd St, Cape Coral · 4 bd · 3 ba · 2,350 sq ft",
      prose: "Listed at $406 per square foot against a county median of $223.",
    },
  },
  "price-reduced": {
    hero: {
      value: "−$25,000",
      label: "2121 SW 39th Ter, Cape Coral · now $605,000",
      prose: "One of the 16.3% of Lee County listings that has moved its asking price.",
    },
  },
  "just-sold": {
    hero: {
      value: "$330,000",
      label: "Median recorded sale · Lee County · April 2026",
      prose: "3,650 sales recorded county-wide in April — the sold market stays liquid.",
    },
  },
  "just-sold-grid": {
    hero: {
      value: "$330,000",
      label: "Median recorded sale · Lee County · April 2026",
      prose: "3,650 sales recorded county-wide in April — the sold market stays liquid.",
    },
  },
  "rate-watch": {
    hero: {
      value: "6.49%",
      label: "30-Year Fixed · U.S. Weekly Average",
      prose: "Up from 6.43% last week, still below last July's 6.72% — Freddie Mac PMMS.",
    },
    stats: [
      { value: "6.49%", label: "30-Yr Fixed" },
      { value: "5.82%", label: "15-Yr Fixed" },
      { value: "6.72%", label: "30-Yr, a Year Ago" },
    ],
  },
  "year-in-review": {
    hero: {
      value: "−8.1%",
      label: "Lee County home values · 12-month change",
      prose:
        "From $471,582 to $433,549 in twelve months — the year the market reset found its floor.",
    },
  },
};

/** Text that reads as an authoring instruction, not content — seed labels put
 *  the instruction in the copy slot (THE SLOT RULE), so previews replace it. */
const INSTRUCTION_RE =
  /^(write|say|name|tell|describe|add|swap|use|pick|lead|open|share|explain|give|list|note|call|invite|announce|introduce|summarize|highlight|the headline)\b|\[\[/i;

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
  const over = opts.seedId ? SEED_OVERRIDES[opts.seedId] : undefined;
  const out = structuredClone(doc);

  const nextListing = cycler(fill.listings);
  const nextPhoto = cycler(fill.photos);
  const nextComment = cycler(fill.commentary);
  const nextStat = cycler(over?.stats ?? fill.stats);
  const hero = over?.hero ?? fill.hero;

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
        if (fillable(p.title, D.signal.title)) {
          p.title = "Values drift lower while buyers regain leverage";
        }
        if (fillable(p.body, D.signal.body)) p.body = nextComment();
        break;
      }
      case "text": {
        const p = block.props;
        if (fillable(p.body, D.text.body)) p.body = nextComment();
        break;
      }
      case "image": {
        const p = block.props;
        if (isEmpty(p.url)) {
          const wantsChart =
            p.kind === "chart" || /chart|trend|graph/i.test(`${p.alt ?? ""} ${p.caption ?? ""}`);
          if (wantsChart && p.kind !== "photo") {
            p.url = fill.chart.url;
            p.alt = fill.chart.alt;
            p.caption = fill.chart.caption;
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
          p.photoUrl = fill.portrait.url;
          p.alt = fill.portrait.alt;
        }
        if (fillable(p.tagline, D["agent-hero"].tagline)) p.tagline = fill.agentBio;
        break;
      }
      case "agent-card": {
        const p = block.props;
        if (fillable(p.bio, D["agent-card"].bio)) p.bio = fill.agentBio;
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
