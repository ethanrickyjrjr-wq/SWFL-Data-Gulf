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
import type { Recipe, RecipeKey } from "@/lib/deliverable/recipes";
import { buildNewListing } from "./new-listing";
import { buildComingSoon } from "./coming-soon";
import { buildMarketComps } from "./market-comps";
import { buildUnderContract } from "./under-contract";
import { buildJustSold } from "./just-sold";
import { buildOpenHouse } from "./open-house";
import { buildPriceReduced } from "./price-reduced";
import { buildAgentBrandIntro } from "./agent-brand-intro";
import { buildAgentLaunch } from "./agent-launch";
import { buildSphereWeekly } from "./sphere-weekly";
import { buildReviewReply } from "./review-reply";
import { buildMarketPulse } from "./market-pulse";

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
  "under-contract": buildUnderContract, // time on market vs the area's typical
  "just-sold": buildJustSold, // the close among the week's real sales
  "open-house": buildOpenHouse, // a house and a MOMENT; no chart
  "price-reduced": buildPriceReduced, // the cut ABOVE the price, smaller, different color
  // ── The area / agent recipes — a different spine; the flyer is NOT forced ───
  "agent-brand-intro": buildAgentBrandIntro, // farm area + newest listing; headshot is an open slot
  "agent-launch": buildAgentLaunch, // the letter; ONE hard number, no chart
  "sphere-weekly": buildSphereWeekly, // headline number is a LANE-3 web fact, cited
  "review-reply": buildReviewReply, // pure lake data; genuinely about numbers, so it charts
  "market-pulse": buildMarketPulse, // every ZIP's month-over-month move
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

/** The builder for a key, or null if this recipe isn't built yet. */
export function builderFor(key: RecipeKey): RecipeBuilder | null {
  return RECIPE_BUILDERS[key] ?? null;
}

// ── Back on the Market — the "send it" deliverable for /r/back-on-market ────────────
// Registered as a direct export, NOT in RECIPE_BUILDERS above: `back-on-market` is not a
// `RecipeKey` (the closed key set lives in lib/deliverable/recipes.ts), and the "send it"
// flow originates from the read page, not the email-lab `authorDoc(key)` dispatch. To wire
// it into the lab dispatch, an operator must first add "back-on-market" to RECIPE_KEYS +
// RECIPES in recipes.ts (out of this build's scope) — then it can join the table above.
export { buildBackOnMarket } from "./back-on-market";
