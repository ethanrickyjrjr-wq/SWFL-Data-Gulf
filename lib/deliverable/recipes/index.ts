// lib/deliverable/recipes/index.ts
//
// THE DISPATCH TABLE. `authorDoc` resolves a recipe KEY and looks up its builder
// here. One key → one builder → one deliverable, no matter which door was clicked.
//
// ── HOW A RECIPE BUILDER WORKS ───────────────────────────────────────────────
//
// The dispatcher (build-doc.ts) does the SHARED work before calling you:
//   • resolves the recipe from the key (never from the prompt text)
//   • for an "address" spine: resolves the subject house ONCE (resolveSubject) —
//     vendor record, bath count, hero photo mirrored into our storage, and the
//     agent's pasted description taken as lane-2 truth
//   • for an "area"/"agent" spine: resolves the ZIP/city scope
//
// You receive that, and you own exactly four decisions — the ONLY things that
// differ between recipes (playbook Part 6):
//   1. SKELETON — which committed grid. IT PROBABLY ALREADY EXISTS. Load it.
//   2. CELLS    — which facts, each with a real source. Unsourced → an OPEN SLOT
//                 (canvas affordance, absent from the sent email). NEVER a zero.
//   3. CHART    — only if the deliverable is ABOUT a number, and about the SUBJECT.
//                 Your policy is declared on your key; honor it. No chart → drop the
//                 slot (dropEmptyChartSlot). An empty chart box is worse than none.
//   4. PROSE    — hand the narrator SOURCES and forbid the rest. It writes prose and
//                 nothing else: not layout, not which cells exist, not numbers.
//
// Return `null` to fall through to the generic author. NEVER REFUSE A BUILD
// (RULE 0.7): a gap is filled from the next lane (our data → the user's own text →
// a named web source → a figure the user states), or it becomes an open slot. The
// ONLY hard block in this product is an INVENTED number.
//
// ── FILE OWNERSHIP ───────────────────────────────────────────────────────────
// One builder per file, one owner per builder. A worker edits ONLY its own file.
// Anything shared (this table, shared.ts, the skeletons, build-doc) is reported,
// not edited — that is what keeps a 13-way parallel build from clobbering itself.

import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import { RECIPES } from "@/lib/deliverable/recipes";
import { buildFromConfig } from "./config-builder";
import type { Recipe, RecipeKey } from "@/lib/deliverable/recipes";
import type { VoicePresetId } from "@/lib/email/voice-presets";
import { buildNewListing } from "./new-listing";
import { buildComingSoon } from "./coming-soon";
import { buildMarketComps } from "./market-comps";
import { buildJustSold } from "./just-sold";
import { buildOpenHouse } from "./open-house";
import { buildPriceReduced } from "./price-reduced";
import { buildAgentBrandIntro } from "./agent-brand-intro";
import { buildAgentLaunch } from "./agent-launch";
import { buildSphereWeekly } from "./sphere-weekly";
import { buildReviewReply } from "./review-reply";
import { buildMarketPulse } from "./market-pulse";
import { buildBackOnMarket } from "./back-on-market";
import { buildCommunityInfo } from "./community-info";
import { buildListingsShowcase } from "./listings-showcase";
import { buildListingsDigest } from "./listings-digest";
import { buildDefaultGrid } from "./default-grid";

/** What every builder is handed. The subject is ALREADY resolved — do not re-resolve. */
export interface RecipeBuildContext {
  /** Your registry entry: skeleton, prose, subject spine, chart policy. */
  recipe: Recipe;
  /** The user's build-box text, [[blank]] filled. Read it for their OWN words
   *  (a pasted listing description is lane-2 truth) — never for identity. */
  prompt: string;
  /** The doc currently on the canvas. Its brand (globalStyle, header, footer,
   *  agent card) is STICKY — carry it through, never author it. */
  currentDoc: EmailDoc;
  /** subject === "address": the resolved house. Null for area/agent spines. */
  facts: ListingFacts | null;
  /** False = the vendor did not match. The grid STILL lands, with open slots. */
  resolved: boolean;
  /** subject === "area" | "agent": the ZIP the build is scoped to, when known. */
  zip?: string;
  /** The build's resolved voice pick (lib/email/voice-presets.ts) — how prose
   *  should SOUND. Consumed by the sourced-fill lane (default-grid); coded
   *  builders with their own narrative prompts (framing policy, no-numbers
   *  letters) deliberately ignore it. Absent = "plain". */
  voice?: VoicePresetId;
}

export type RecipeBuilder = (ctx: RecipeBuildContext) => Promise<EmailDoc | null>;

/**
 * key → builder. A key with no builder yet falls through to the generic author —
 * exactly today's behavior, so an unbuilt recipe degrades instead of breaking.
 *
 * Fill your slot; do not touch anyone else's line.
 */
export const RECIPE_BUILDERS: Partial<Record<RecipeKey, RecipeBuilder>> = {
  // ── The listing lifecycle — ONE resolved house, different hats ──────────────
  "new-listing": buildNewListing, // the reference implementation
  "coming-soon": buildComingSoon, // address SUPPRESSED; scarcity from live county inventory
  "market-comps": buildMarketComps, // the comps bar lives HERE; a comp needs beds AND sqft
  // "under-contract" — MIGRATED to recipes-as-config (config on its registry
  // entry; builderFor dispatches to buildFromConfig). First of the lifecycle wave.
  "just-sold": buildJustSold, // the close among the week's real sales
  "open-house": buildOpenHouse, // a house and a MOMENT; no chart
  "price-reduced": buildPriceReduced, // the cut ABOVE the price, smaller, different color
  // ── The area / agent recipes — a different spine; the flyer is NOT forced ───
  "agent-brand-intro": buildAgentBrandIntro, // farm area + newest listing; headshot is an open slot
  "agent-launch": buildAgentLaunch, // the letter; ONE hard number, no chart
  "sphere-weekly": buildSphereWeekly, // headline number is a LANE-3 web fact, cited
  "review-reply": buildReviewReply, // pure lake data; genuinely about numbers, so it charts
  "market-pulse": buildMarketPulse, // every ZIP's month-over-month move
  // Closure supplies the deps default — the second parameter's signature is untouched,
  // so the /r/back-on-market "send it" flow (which calls buildBackOnMarket directly with
  // its own deps) is unaffected by this registration.
  "back-on-market": (ctx) => buildBackOnMarket(ctx), // ZIP fallthrough/relist rates vs the national frame
  // Closure supplies the injectable-deps default (same shape as back-on-market above).
  "community-info": (ctx) => buildCommunityInfo(ctx), // named vendor neighborhood: scores, nearby, values
  "listings-showcase": (ctx) => buildListingsShowcase(ctx), // photo -> one real reason -> CTA, ×3; no spec sheet
  "listings-digest": (ctx) => buildListingsDigest(ctx), // one grid block per category, 4-6 real homes each, no home twice
  "default-grid": buildDefaultGrid, // the terminal fallback — open-slot grid over the fill seam
  // ── Social — a DIFFERENT renderer, and a DIFFERENT contract ────────────────
  // NOT RecipeBuilder-shaped, and deliberately not registered here. Recon (07/13/2026)
  // found TWO live social systems: the "Make this →" button on a social slide lands in
  // the Konva composer (authorSocialPost → SocialDesign), while the "New Listing Socials"
  // campaign lands in buildWeek (→ EmailDoc cards). Neither touches this table.
  // ⚠️ AND THE SOCIAL PATH HAS NO NO-INVENTION GATE AT ALL: its four-lane rules are prose
  // in a prompt, and `stat.value` is a free-text field the model writes. Same sourced lake
  // feed as email, ungated on the way out. Tracked as `social_path_has_no_no_invention_gate`.
  // lib/deliverable/claims.ts was built to be liftable onto it.
  // "social-pack" / "social-cut" — see the check before wiring either.
};

/** The builder for a key, or null if this recipe isn't built yet.
 *
 *  RECIPES-AS-CONFIG (spec 2026-08-18): a MIGRATED recipe carries a `config` on its
 *  registry entry and builds through the ONE config builder; its hand-coded entry in
 *  RECIPE_BUILDERS is deleted in the same commit. FENCE (spec migration rule 3):
 *  never add a feature to a legacy hand-coded builder — migrate it first, then add
 *  the feature to its config/derivations. */
export function builderFor(key: RecipeKey): RecipeBuilder | null {
  const config = RECIPES[key]?.config;
  if (config) {
    return (ctx) => buildFromConfig(ctx, config);
  }
  return RECIPE_BUILDERS[key] ?? null;
}

// ── Back on the Market — PROMOTED into the key set 08/03/2026 ───────────────────────
// Now a real `RecipeKey` (RECIPE_KEYS + RECIPES in recipes.ts) registered in the table
// above via a closure. The direct export stays: the /r/back-on-market "send it" flow
// calls buildBackOnMarket(ctx, deps) with its own injected loader and must keep doing so.
export { buildBackOnMarket } from "./back-on-market";
