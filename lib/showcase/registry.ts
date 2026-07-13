/**
 * Client-safe showcase registry for the pill panel (and, later, the homepage).
 * Display metadata + committed asset paths ONLY — no server imports, no fs, so
 * it's safe in the browser bundle (mirrors the old example-cards.ts contract).
 * Asset existence is guarded by registry.test.ts; slide order mirrors
 * scripts/capture-showcase.mjs. The tier/CTA slide is NOT listed here — the
 * overlay appends it as the final step.
 */

import type { ShowcaseRecipe } from "./recipe";
import type { Cadence } from "@/lib/email/schedule-cadence";
// THE RECIPES THEMSELVES LIVE IN ONE PLACE (lib/deliverable/recipes.ts). This file
// owns only the STORYTELLING around them — the card art, the step titles, the
// what-happened/how-the-AI-did-it captions. It used to own the prompts too, which is
// how the same deliverable ended up with two different prompt strings on two
// surfaces. A slide now POINTS at a recipe; it never redefines one.
import { RECIPES } from "@/lib/deliverable/recipes";

/** Quick-start campaign metadata — a Showcase that is ALSO a one-click campaign
 *  gets this. `surface` is the BUTTON placement lane (which quick-start row it
 *  appears in), deliberately separate from `Showcase.surfaces` (which lab's
 *  Examples accordion lists the showcase) — market-pulse/launch-blitz are both
 *  email+social showcases but each is ONE campaign button. See lib/campaigns.ts. */
export interface ShowcaseCampaign {
  /** Stable campaign key — also the ?campaign= deep-link value for social. */
  key: "new-listing" | "newsletter" | "new-listing-socials" | "agent-launch";
  /** Button label, e.g. "New Listing Campaign". */
  label: string;
  /** One-line description under the label. */
  blurb: string;
  status: "live";
  /** Which quick-start row this button belongs in. */
  surface: "email" | "social";
  /** Email campaigns hand this recipe to the builder; social campaigns create a
   *  listing project + deep-link instead, so they omit it. */
  seedRecipe?: ShowcaseRecipe;
  /** Present when this campaign has a second step: after the seeded build
   *  completes, the lab offers this recipe as a one-click follow-up chip
   *  (matched by seed prompt — lib/campaigns.ts campaignFollowUpForPrompt). */
  followUp?: { label: string; recipe: ShowcaseRecipe };
}

export interface ShowcaseSlide {
  /** Root-relative committed capture, e.g. "/showcase/<id>/step-1.webp". */
  image: string;
  title: string;
  /** What this piece does in the campaign. */
  whatsHappening: string;
  /** The concrete mechanics of how the AI built it. */
  howAiHandled: string;
  /** Committed live-HTML artifact (root-relative, under public/). Kept for the
   *  capture scripts + asset tests; NOT rendered as a link anymore — the
   *  overlay's action is the Make-this recipe (operator ruling 07/03/2026). */
  liveHref?: string;
  /** Optional named-source practice receipt, rendered as a footnote. */
  receipt?: string;
  /** "Make this →" — rebuilds this artifact for the user's own listing/farm.
   *  Buildable email slides carry one; social-surface slides are wired in a
   *  follow-up (exempt list in registry.test.ts). */
  recipe?: ShowcaseRecipe;
  /** Social-format slides render LIVE, responsive cards (SocialBoard) instead of
   *  the flat `image` — one wide capture can't be big on both desktop and phone,
   *  so the cards reflow (side-by-side → stacked) and stay crisp at any width.
   *  `image` stays as the JS-off / asset-test fallback. Renderer: SocialBoard. */
  socialBoard?: "market-pulse" | "launch-blitz";
}

export interface Showcase {
  id: string;
  company: string;
  title: string;
  hook: string;
  /** Brand accent color for the card border + step rail highlight. */
  accent: string;
  thumb: string;
  disclosure: string;
  /** Which lab surfaces this example belongs to — the labs' collapsed Examples
   *  section filters on it (email examples in Email, social in Social). */
  surfaces: ("email" | "social")[];
  slides: ShowcaseSlide[];
  /** Present when this showcase is ALSO a one-click quick-start campaign. */
  campaign?: ShowcaseCampaign;
  /** Data-freshness explainer for the cadence legend — plain-language list of
   *  which figures the AI refreshes at each cadence. NOT a send schedule; see
   *  lib/campaigns/cadence-colors.ts. Rendered in the overlay caption column. */
  cadenceRefresh?: Partial<Record<Cadence, string[]>>;
}

/** The showcases for one lab surface. */
export function showcasesFor(surface: "email" | "social"): Showcase[] {
  return SHOWCASES.filter((s) => s.surfaces.includes(surface));
}

export const SHOWCASES: Showcase[] = [
  {
    id: "listing-to-close",
    company: "Latitude 26 Estates · Naples",
    title: "Listing → Close: The Auto Email Plan",
    hook: "Five emails carry one $14.8M listing from teaser to sold — every number sourced.",
    campaign: {
      key: "new-listing",
      label: "New Listing Campaign",
      blurb: "Announce a new listing with cited specs, a price chart, and an honest market read.",
      status: "live",
      surface: "email",
      seedRecipe: RECIPES["new-listing"],
    },
    cadenceRefresh: {
      daily: ["the live active-listing count and asking prices nearby"],
      weekly: ["the comparable-sale set behind the price case"],
      monthly: ["the neighborhood's home-value trend line"],
    },
    accent: "#B98F45",
    thumb: "/showcase/listing-to-close/thumb.webp",
    surfaces: ["email"],
    disclosure:
      "Demonstration campaign — Latitude 26 Estates and its agent are fictional. The property, comp, and market data are real — SWFL Data Gulf (07/01/2026).",
    slides: [
      {
        image: "/showcase/listing-to-close/step-1.webp",
        title: "Coming Soon",
        whatsHappening:
          "The teaser builds a private-preview list before the sign goes up — scarcity first, address held back.",
        howAiHandled:
          "Counted the live for-sale inventory and found the angle itself: only 156 of Collier's 8,067 active homes sit at $10M+.",
        liveHref: "/showcase/listing-to-close/live/01-coming-soon.html",
        recipe: RECIPES["coming-soon"],
      },
      {
        image: "/showcase/listing-to-close/step-2.webp",
        title: "New Listing",
        whatsHappening:
          "The full reveal: specs, price per square foot, and the neighborhood's home-value trend line.",
        howAiHandled:
          "Charted the ZIP's value index and wrote the honest read — the reset has stopped resetting — instead of a hype line.",
        liveHref: "/showcase/listing-to-close/live/02-new-listing.html",
        recipe: RECIPES["new-listing"],
      },
      {
        image: "/showcase/listing-to-close/step-3.webp",
        title: "Market Comps",
        whatsHappening:
          "Six live comparable estates with photos, links, and a price bar chart — the evidence email.",
        howAiHandled:
          "Picked six live comps in the same ZIP and computed each $/sq ft in code, then argued the premium straight: the case is the land.",
        liveHref: "/showcase/listing-to-close/live/03-comps.html",
        receipt: "Numbers, not adjectives — every figure traces to the listing feed snapshot.",
        recipe: RECIPES["market-comps"],
      },
      {
        image: "/showcase/listing-to-close/step-4.webp",
        title: "Under Contract",
        whatsHappening:
          "Momentum, made public: pending in 90 days while rival estates sit at 238 and 279 days.",
        howAiHandled:
          "Corroborated the story with the ZIP's own numbers — 85 pendings, 31 of them at $2M+ — to convert losing bidders into backup offers.",
        liveHref: "/showcase/listing-to-close/live/04-pending.html",
        recipe: RECIPES["under-contract"],
      },
      {
        image: "/showcase/listing-to-close/step-5.webp",
        title: "Sold",
        whatsHappening:
          "The closing announcement, set against that week's real wave of Naples estate sales — and it ends on a private-valuation ask.",
        howAiHandled:
          "Placed the close inside the actual sale wave it belonged to, then turned proof into the next lead.",
        liveHref: "/showcase/listing-to-close/live/05-sold.html",
        recipe: RECIPES["just-sold"],
      },
    ],
  },
  {
    id: "launch-blitz",
    company: "Cast & Coast Realty · Cape Coral",
    title: "Launch Weekend: Listing + Social Blitz",
    hook: "One mid-market listing launches with an agent-brand email and four social formats — same real numbers everywhere.",
    campaign: {
      key: "new-listing-socials",
      label: "New Listing Socials Campaign",
      blurb:
        "A week of launch posts for one listing — Just Listed through Price & CTA, across platforms.",
      status: "live",
      surface: "social",
      // No seedRecipe — social campaigns create a listing project and generate a
      // launch week via buildWeek, not a builder recipe (see lib/campaigns.ts).
    },
    accent: "#0E7C86",
    thumb: "/showcase/launch-blitz/thumb.webp",
    surfaces: ["email", "social"],
    disclosure:
      "Demonstration campaign — Cast & Coast Realty and Dani Vero are fictional (her portrait is AI-generated). The property, ZIP, and market data are real — SWFL Data Gulf listing feed (07/01/2026) and the linked listing detail page (07/02/2026).",
    slides: [
      {
        image: "/showcase/launch-blitz/step-1.webp",
        title: "Agent Brand Intro",
        whatsHappening:
          "A completely different brand and voice: the data-first Cape agent, introduced over the ZIP-by-ZIP asking-price chart and this weekend's launch.",
        howAiHandled:
          "Pulled the six Cape ZIP medians from 2,551 live listings, built the chart in the brand's own palette, and anchored it to a real $620,000 launch.",
        liveHref: "/showcase/launch-blitz/live/agent-intro.html",
        receipt:
          "One CTA per email — “give readers three things to click and they often click nothing” (Luxury Presence, 2026).",
        recipe: RECIPES["agent-brand-intro"],
      },
      {
        image: "/showcase/launch-blitz/step-2.webp",
        title: "Social Pack — 4 Formats",
        whatsHappening:
          "The same launch, cut for social: square feed, landscape link post, portrait feed, and 9:16 story — generated together with the email.",
        howAiHandled:
          "Led every caption with a data hook and mixed local + broad hashtags; the market chart travels into the link post unchanged.",
        liveHref: "/showcase/launch-blitz/live/social-pack.html",
        socialBoard: "launch-blitz",
        receipt:
          "Data-hook first lines and a local + broad hashtag mix are the current lead-generating pattern for agent social (The Close, 2026).",
        recipe: RECIPES["social-pack"],
      },
    ],
  },
  {
    id: "agent-launch",
    company: "Gulfline Realty · Bonita Springs",
    title: "Agent Launch: Day One, With Receipts",
    hook: "A brand-new agent introduces herself with one real market number — then the weekly update sends itself.",
    campaign: {
      key: "agent-launch",
      label: "Agent Launch Campaign",
      blurb:
        "Introduce yourself to your sphere with a real market insight — then a weekly update that sends itself.",
      status: "live",
      surface: "email",
      seedRecipe: RECIPES["agent-launch"],
      followUp: {
        label: "schedule your weekly sphere update",
        // THE DRIFT: this used to be its own prompt literal, and it differed from the
        // "Headlines vs Here" slide's literal by one trailing sentence — so the same
        // deliverable built two different ways depending on which button you pressed.
        // Both now point at the one recipe.
        recipe: RECIPES["sphere-weekly"],
      },
    },
    cadenceRefresh: {
      daily: ["the live listing counts and asking prices near the reader"],
      weekly: ["the broad-market versus your-area contrast figures"],
      monthly: ["the area's home-value trend line"],
    },
    accent: "#1F4D3A",
    thumb: "/showcase/agent-launch/thumb.webp",
    surfaces: ["email"],
    disclosure:
      "Demonstration campaign — Gulfline Realty and Marisol Vega are fictional (her portrait is a licensed stock photo: Luan Albarracin / Pexels). Every number is real — SWFL Data Gulf listing feed and Zillow Home Value Index (07/05/2026).",
    slides: [
      {
        image: "/showcase/agent-launch/step-1.webp",
        title: "The Letter",
        whatsHappening:
          "Day-one announcement to her own sphere: a personal letter beside her portrait, opening with why the reader is getting it — and carrying exactly one hard number.",
        howAiHandled:
          "Wrote the letter for one reader, pinned the area's real home-value figure as an accent-bordered clipping with its source, and ended on a single reply ask — no chart, no pitch.",
        liveHref: "/showcase/agent-launch/live/01-letter.html",
        receipt:
          "Personal welcome emails outperform generic ones 2–3x; the founder-note pattern (real photo, origin line, reply prompt) is the person-brand play (Sequenzy / Omnisend, 2026).",
        recipe: RECIPES["agent-launch"],
      },
      {
        image: "/showcase/agent-launch/step-2.webp",
        title: "Headlines vs Here",
        whatsHappening:
          "The weekly that sends itself: the county's number and the reader's own area side by side, one honest read of the gap, and the REVIEW reply ask.",
        howAiHandled:
          "Set the county median beside the area's own figure — each carrying its true source label — read the gap honestly (a paper premium sellers can't assume holds), and named what would change that read.",
        liveHref: "/showcase/agent-launch/live/02-headlines-vs-here.html",
        receipt:
          "Replies are among the strongest sender-trust signals mailbox providers count — a reply-first CTA builds deliverability, not just conversation (Validity, 2026).",
        recipe: RECIPES["sphere-weekly"],
      },
      {
        image: "/showcase/agent-launch/step-3.webp",
        title: "The REVIEW Reply",
        whatsHappening:
          "A reader replied REVIEW with their address — this is what Marisol sends back: their area's value level and trend, days on market, and live inventory, each cited.",
        howAiHandled:
          "Built the snapshot from held data only — the year-over-year move, months of supply, and the honest read that buyers currently hold the negotiating room — with every source and date listed.",
        liveHref: "/showcase/agent-launch/live/03-review-snapshot.html",
        receipt:
          "A home-value ask is the highest-click hook in agent marketing; answering it with cited data is the trust play (practitioner consensus, r/realtors, 2026).",
        recipe: RECIPES["review-reply"],
      },
    ],
  },
  {
    id: "market-pulse",
    company: "Meridian South Advisory · Fort Myers",
    title: "The Market Pulse: Set It Once",
    hook: "Type the ask once — the monthly brief and its socials rebuild themselves from fresh data.",
    campaign: {
      key: "newsletter",
      label: "Newsletter Campaign",
      blurb: "A recurring monthly market brief that rebuilds itself from fresh data — set it once.",
      status: "live",
      surface: "email",
      // The campaign seed, "The Ask", and "The Pulse Email" were three copies of one
      // prompt. Three entries, ONE recipe — they all point here now.
      seedRecipe: RECIPES["market-pulse"],
    },
    cadenceRefresh: {
      daily: ["the live active-listing counts and prices"],
      weekly: ["newly recorded comparable sales"],
      monthly: ["every ZIP's month-over-month home-value move and the trend read"],
    },
    accent: "#C4551A",
    thumb: "/showcase/market-pulse/thumb.webp",
    surfaces: ["email", "social"],
    disclosure:
      "Demonstration campaign — Meridian South Advisory is fictional. Every number is real — Zillow Home Value Index (through 05/31/2026) and SWFL Data Gulf listing feed (07/01/2026).",
    slides: [
      {
        image: "/showcase/market-pulse/step-1.webp",
        title: "The Ask",
        whatsHappening:
          "The entire setup is one typed sentence and a schedule — no template picking, no data wrangling.",
        howAiHandled:
          "Reads the ask, locks the schedule, and takes over sourcing, charting, and writing from here.",
        liveHref: "/showcase/market-pulse/live/ask.html",
        recipe: RECIPES["market-pulse"],
      },
      {
        image: "/showcase/market-pulse/step-2.webp",
        title: "The Pulse Email",
        whatsHappening:
          "The monthly brief lands: every Fort Myers ZIP's April-to-May move, the market snapshot, and one honest read.",
        howAiHandled:
          "Computed all ten ZIP deltas in code, named the largest mover, and kept the voice factual — drifting, not dropping.",
        liveHref: "/showcase/market-pulse/live/pulse-email.html",
        receipt:
          "Market-update newsletters are the top-performing real-estate email type; single column, one CTA, subject under 40 characters (Luxury Presence, 2026).",
        recipe: RECIPES["market-pulse"],
      },
      {
        image: "/showcase/market-pulse/step-3.webp",
        title: "The Social Cut",
        whatsHappening:
          "The same pulse, cut for feeds — the headline stat as a square card, the three-ZIP comparison as a link post.",
        howAiHandled:
          "Chose the single most clickable fact (the biggest ZIP move) for the square and kept every value identical to the email's.",
        liveHref: "/showcase/market-pulse/live/socials.html",
        socialBoard: "market-pulse",
        receipt:
          "Serialized, recurring content keeps audiences returning — 57% of consumers want original series (Sprout Social, 2026).",
        recipe: RECIPES["social-cut"],
      },
      {
        image: "/showcase/market-pulse/step-4.webp",
        title: "Proof It Updates",
        whatsHappening:
          "April's edition next to May's: the highlighted values changed by themselves when the new month landed.",
        howAiHandled:
          "Rebuilt the brief from the fresh vintage — prose, chart, and source list — with zero keystrokes from the agent.",
        liveHref: "/showcase/market-pulse/live/vintages.html",
      },
    ],
  },
];
