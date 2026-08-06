// lib/showcase/campaign-order.ts
//
// THE FLATTENED, SEND-ORDERED "CAMPAIGNS" SECTION — operator ruling 08/06/2026:
// *"Campaigns-flat-at top with new emails-full pop up explainer last card-left to
// right scroll like Netflix each section (listing lifecycle on top)."* Before this,
// the new recipe-built emails only appeared nested inside a multi-step story
// overlay (`CampaignExamples.tsx`, now retired) — a visitor never saw "Coming
// Soon," "New Listing," "Open House"... as individual, click-to-build cards; they
// had to open "Listing → Close" and click through seven steps to find one.
//
// This file is display metadata ONLY (client-safe, no server imports) — it POINTS
// at real `RECIPES` entries and real committed `/showcase/**/*.webp` captures. It
// never redefines a recipe or re-hosts an image.
//
// Each category is one horizontal-scroll row. Every row ends with a `story` field
// naming the multi-step `SHOWCASES` entry that becomes the row's LAST card — the
// "full pop-up explainer, just like it is now" (operator, verbatim) — reusing
// `ShowcaseCard` + `ShowcaseOverlay` UNCHANGED, so the walkthrough interaction a
// visitor already knows from this page carries over exactly.
//
// `image: null` means the recipe is REAL and BUILDS (it is not a "not built yet"
// placeholder — operator's placeholder rule is for a lifecycle step with no
// working recipe at all, and every entry below has one) but has no committed
// screenshot capture yet — `scripts/capture-showcase.mjs` has never run against
// it. The card renders a plain labelled tile instead of fabricating an image.

import { RECIPES, type RecipeKey } from "@/lib/deliverable/recipes";

export interface CampaignRowEmail {
  key: RecipeKey;
  title: string;
  blurb: string;
  /** Root-relative committed capture, or null → no capture yet (see file header). */
  image: string | null;
}

export interface CampaignCategory {
  id: string;
  title: string;
  pitch: string;
  emails: CampaignRowEmail[];
  /** Which `SHOWCASES` id anchors this row's last card — the full multi-step
   *  story pop-up. Must exist in `lib/showcase/registry.ts` (guarded by
   *  campaign-order.test.ts, mirroring registry.test.ts's own asset guard). */
  story: string;
}

export interface SeedRecipeOverride {
  recipeKey: RecipeKey;
  /** A newer capture to show instead of the old seed's own preview, when the
   *  rebuilt recipe already has one. null = keep the seed's existing image —
   *  no capture exists yet for the new recipe (listings-showcase/-digest). */
  image: string | null;
}

/**
 * SEED_DOCS ids (`lib/email/doc/default-docs.ts` → `lib/email/doc/seed-previews.ts`,
 * rendered by the "Start-from Layouts" gallery) whose JOB has been rebuilt as a real
 * `RECIPES` entry — the old blank-canvas seed is superseded, not a second, equal
 * option. Operator, 08/06/2026, verbatim: *"If an email doesn't exist anymore
 * because we built it new by changing its code, replace it"* + *"Make sure all
 * buttons build the new emails, not the old ones."*
 *
 * Every SEED_DOCS id NOT listed here (Welcome, Minimal, Agent Spotlight, the
 * weekly/monthly/annual report styles, the blank canvases…) has no rebuilt
 * counterpart — genuinely old, stays old, on purpose ("old emails stay for now
 * so I can go through still").
 */
export const SEED_SUPERSEDED_BY: Record<string, SeedRecipeOverride> = {
  "new-listing": { recipeKey: "new-listing", image: "/showcase/listing-to-close/step-2.webp" },
  "open-house": { recipeKey: "open-house", image: "/showcase/listing-to-close/step-6.webp" },
  "price-reduced": { recipeKey: "price-reduced", image: "/showcase/listing-to-close/step-7.webp" },
  "just-sold": { recipeKey: "just-sold", image: "/showcase/listing-to-close/step-5.webp" },
  "just-sold-grid": { recipeKey: "just-sold", image: "/showcase/listing-to-close/step-5.webp" },
  // No capture yet for either — the recipe is real and builds; see the header note.
  "listing-feature": { recipeKey: "listings-showcase", image: null },
  "listing-digest": { recipeKey: "listings-digest", image: null },
};

export const CAMPAIGN_CATEGORIES: CampaignCategory[] = [
  {
    id: "listing-lifecycle",
    title: "Listing Lifecycle",
    pitch: "Every stage a listing goes through, in send order — real data at every step.",
    emails: [
      {
        key: "coming-soon",
        title: RECIPES["coming-soon"].label,
        blurb: "The private-preview teaser before the sign goes up.",
        image: "/showcase/listing-to-close/step-1.webp",
      },
      {
        key: "new-listing",
        title: RECIPES["new-listing"].label,
        blurb: "The full reveal — specs, price per square foot, the market read.",
        image: "/showcase/listing-to-close/step-2.webp",
      },
      {
        key: "open-house",
        title: RECIPES["open-house"].label,
        blurb: "The in-person invite — date, time, specs, one RSVP ask.",
        image: "/showcase/listing-to-close/step-6.webp",
      },
      {
        key: "market-comps",
        title: RECIPES["market-comps"].label,
        blurb: "The evidence email — real comparable sales, priced and charted.",
        image: "/showcase/listing-to-close/step-3.webp",
      },
      {
        key: "price-reduced",
        title: RECIPES["price-reduced"].label,
        blurb: "The reset, stated honestly — the cut and the new price, sourced.",
        image: "/showcase/listing-to-close/step-7.webp",
      },
      {
        key: "under-contract",
        title: RECIPES["under-contract"].label,
        blurb: "Momentum made public — pending, with the area's own pace beside it.",
        image: "/showcase/listing-to-close/step-4.webp",
      },
      {
        key: "just-sold",
        title: RECIPES["just-sold"].label,
        blurb: "The closing announcement, set against the week's real sale wave.",
        image: "/showcase/listing-to-close/step-5.webp",
      },
      {
        key: "back-on-market",
        title: RECIPES["back-on-market"].label,
        blurb: "A relisted home, its time off stated plainly — no spin.",
        image: "/showcase/back-on-market/step-1.webp",
      },
    ],
    story: "listing-to-close",
  },
  {
    id: "agent-community",
    title: "Agent & Community",
    pitch: "Introductions, a farm area's own numbers, and a named neighborhood, sourced.",
    emails: [
      {
        key: "agent-brand-intro",
        title: RECIPES["agent-brand-intro"].label,
        blurb: "A farm area's live asking prices, under the agent's own introduction.",
        image: "/showcase/launch-blitz/step-1.webp",
      },
      {
        key: "agent-launch",
        title: RECIPES["agent-launch"].label,
        blurb: "Day one to her own sphere — one real number, a personal letter.",
        image: "/showcase/agent-launch/step-1.webp",
      },
      {
        key: "sphere-weekly",
        title: RECIPES["sphere-weekly"].label,
        blurb: "The weekly that sends itself — county versus the reader's own area.",
        image: "/showcase/agent-launch/step-2.webp",
      },
      {
        key: "review-reply",
        title: RECIPES["review-reply"].label,
        blurb: "A reader replies REVIEW — their address's value, trend, and inventory.",
        image: "/showcase/agent-launch/step-3.webp",
      },
      {
        key: "community-info",
        title: RECIPES["community-info"].label,
        blurb: "One named neighborhood — scores, what's nearby, typical values.",
        image: "/showcase/community-info/step-1.webp",
      },
      {
        key: "listings-showcase",
        title: RECIPES["listings-showcase"].label,
        blurb: "A few real homes for sale nearby, each with a photo and one honest reason.",
        image: null,
      },
      {
        key: "listings-digest",
        title: RECIPES["listings-digest"].label,
        blurb: "Several categories of real homes for sale right now, in one send.",
        image: null,
      },
    ],
    story: "agent-launch",
  },
  {
    id: "recurring",
    title: "Recurring",
    pitch: "Set it up once — it rebuilds itself from fresh data every send.",
    emails: [
      {
        key: "market-pulse",
        title: RECIPES["market-pulse"].label,
        blurb: "Every ZIP's month-over-month move, one snapshot chart, one honest read.",
        image: "/showcase/market-pulse/step-2.webp",
      },
    ],
    story: "market-pulse",
  },
];
