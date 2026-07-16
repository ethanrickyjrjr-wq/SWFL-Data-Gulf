// lib/deliverable/recipes.ts
//
// THE ONE ROOT for what a deliverable recipe IS.
//
// Before this file, "recipe" meant four unrelated things and none of them were
// wired together (docs/standards/deliverable-playbook.md Part 2):
//
//   • lib/showcase/registry.ts     — a PROMPT STRING with a [[blank]]
//   • lib/email/author-recipes.ts  — advisory PROSE nudges (digit-free, unenforced)
//   • lib/email/doc/default-docs.ts— 27 positioned SKELETONS (real grids)
//   • lib/email/listing-flyer.ts   — one hard-coded grid in TypeScript
//
// Identity was the prompt string, so "the same button" only produced "the same
// thing" by string equality — and it already drifted: the agent-launch follow-up
// and the "Headlines vs Here" slide differ by a trailing sentence, so the builder
// treated one deliverable as two. Editing the [[blank]] could reroute a build.
//
// THE MODEL (operator ruling, 07/13/2026):
//
//   A RECIPE KEY is the identity. Every door carries the key. The builder
//   dispatches on the key. The skeleton is the ONE structural authority; the
//   author-recipe is the prose layer; the prompt is seed TEXT, not identity.
//
//       hero pill ─┐
//       campaign  ─┼─→ ?recipe=<key> ─→ authorDoc(key) ─→ ONE build
//       showcase  ─┤
//       lab pick  ─┘
//       seed card ─→ the SAME skeleton, unfilled
//
// This entry is deliberately THIN. It maps a key onto artifacts that already own
// their content — it must never restate a value the skeleton already holds (that
// is how the four-registry drift started). If you find yourself putting a cell
// label, a kicker, or a CTA string in here, it belongs in the skeleton instead.
//
// What legitimately lives here is what NO existing artifact owns:
//   • which skeleton    (structure)
//   • which prose recipe(voice)
//   • the subject spine (what gets resolved, from a real record, exactly once)
//   • the chart policy  (a chart ONLY when the deliverable is ABOUT a number)
//
// Parity is enforced by recipes.parity.test.ts: for any key, every surface that
// offers it must resolve to the SAME skeleton, subject, chart policy and framing.
// "The same thing" means the same STRUCTURE for a given resolved subject — never
// byte-identity, since the user's own address and brand ride through it.

import type { BrandNeed } from "@/lib/showcase/recipe";

/** Every deliverable we OFFER, by stable key. Adding a key here is what makes a
 *  recipe exist; a surface may only reference a key that lives in this list. */
export const RECIPE_KEYS = [
  // The listing lifecycle — ONE resolved house wearing different hats. These all
  // share the new-listing subject spine and its resolver. NEVER write a second
  // resolver; they differ only in framing, cells, chart, and prose source.
  "new-listing",
  "coming-soon",
  "market-comps",
  "under-contract",
  "just-sold",
  "open-house",
  "price-reduced",
  // The area / agent recipes — a different spine entirely. No listing subject; do
  // not force the flyer on them. Their subject is a ZIP, a city, or the agent.
  "agent-brand-intro",
  "agent-launch",
  "sphere-weekly",
  "review-reply",
  "market-pulse",
  // Social — a different renderer. Confirm which social system is live before
  // building; do not assume the email path applies.
  "social-pack",
  "social-cut",
] as const;

export type RecipeKey = (typeof RECIPE_KEYS)[number];

/**
 * What gets RESOLVED, once, from a real record, before any layout happens.
 * Never let a model infer the subject from prose (playbook Part 3, rule 1).
 *
 *   "address" — a specific house. Resolved by resolveSubjectListing(): geocode →
 *               Lee/Collier gate → vendor match. The address reaches the builder
 *               from the field OR the prompt; the BUILDER decides, never the door.
 *   "area"    — a ZIP or a city. The free-author lane is LEGITIMATE here — but it
 *               must load a real skeleton instead of improvising on a blank page.
 *   "agent"   — the agent themself (headshot, name, brokerage), plus an area.
 */
export type SubjectSpine = "address" | "area" | "agent";

/**
 * A chart ships ONLY when the deliverable is ABOUT a number, and it must be about
 * the SUBJECT (playbook Part 3, rule 3). A new-listing email is about a HOUSE —
 * its visual is the photo, so: no chart. An area index on a listing tells a buyer
 * nothing. A comps bar on a listing turns it into a comps email. Two bars
 * (was/now) is a fact wearing a chart costume — write the fact instead.
 *
 * An empty chart slot is worse than no slot: if the policy is "none", DROP the
 * slot, never ship an empty box.
 */
export type ChartPolicy =
  /** No chart. The deliverable is about a house, a person, or a moment. */
  | "none"
  /** The subject's price set among real nearby comps, as bars. HARD RULE: a comp
   *  must have beds AND sqft, or it is a vacant lot — charting bare land against a
   *  house makes the ask look like a bargain for a fake reason. */
  | "comps-bar"
  /** The subject's days-on-market against the area's typical days-on-market. */
  | "dom-vs-area"
  /** Live asking price per ZIP across the agent's farm area. */
  | "zip-by-zip-asking"
  /** Every ZIP's month-over-month home-value move. */
  | "zip-mom-move"
  /** One area's home-value level and trend over time. */
  | "area-value-trend"
  /** How scarce homes like the subject are — live inventory counts. */
  | "inventory-scarcity"
  /** The subject's NEW $/sq ft (post-reduction) plotted against the median $/sq ft of
   *  real nearby comparable homes — one value vs. one reference, via the `dot-plot`
   *  frame. Comps here are used ONLY to compute the chart; never handed to the
   *  narrator (price-reduced.ts's prose stays exactly as constrained as it always
   *  was — zero market data, so it can never invent a reason the price moved). */
  | "price-vs-area-dot";

export interface Recipe {
  key: RecipeKey;
  /** Which posture this recipe's prose defaults to. "sell-side" = pitches a specific
   *  property or the agent's own brand/track record; "story-side" = recurring
   *  relationship/informational content with no single sale or brand pitch riding on
   *  it. A required field so a new recipe cannot compile without declaring its lane —
   *  see docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md.
   *  NOTE: sell-side does not imply every sell-side recipe's PROMPT changes — see
   *  lib/deliverable/CLAUDE.md for which three narrators actually read
   *  FAVORABLE_FRAMING_POLICY. `social-pack`/`social-cut` ship "story-side" as an
   *  inert default: neither reads any prompt this field gates. */
  positioning: "sell-side" | "story-side";
  /** Human label. The button copy may differ per surface; this is the canonical name. */
  label: string;
  /** SEED_DOCS id — the ONE structural authority for this recipe's grid.
   *  `null` means the skeleton is UNASSIGNED and the recipe's worker must either
   *  (a) load an existing committed grid and justify it against the real blocks, or
   *  (b) propose a new one. It probably already exists — look before you build. */
  skeleton: string | null;
  /** author-recipes.ts RecipeId — the prose/voice layer. `null` = the generic
   *  author prompt, byte-identical to today. Advisory only; it never invents. */
  prose: string | null;
  subject: SubjectSpine;
  chart: ChartPolicy;
  /** The seed TEXT a door drops in the build box. Carries exactly one [[blank]].
   *  This is DISPLAY + SEED only — it is NOT the identity. Never route a build on it. */
  prompt: string;
  /** Brand fields the built artifact leans on; gaps open the add-info popup. */
  needs: readonly BrandNeed[];
  /** Which builder this recipe seeds. Omitted = email. */
  target?: "email" | "social";
}

export const RECIPES: Record<RecipeKey, Recipe> = {
  // ── The listing lifecycle ──────────────────────────────────────────────────
  "new-listing": {
    key: "new-listing",
    positioning: "sell-side",
    label: "New Listing",
    skeleton: "new-listing",
    prose: null,
    subject: "address",
    // Operator, 07/13/2026: NO CHART on a new listing. The visual IS the property.
    chart: "none",
    // The registry prompt used to promise "a chart of the ZIP's home-value trend".
    // That chart was killed; a prompt must never promise what the build won't ship.
    prompt:
      "Build a new-listing announcement email for my listing at [[your listing address]] — key specs, price per square foot, and one honest line about the home.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "coming-soon": {
    key: "coming-soon",
    positioning: "sell-side",
    label: "Coming Soon",
    skeleton: null,
    prose: null,
    // The SAME house — but the street address is SUPPRESSED. That is the whole
    // point of the teaser: do not leak it into the hero, the photo alt text, or
    // the subject line.
    subject: "address",
    chart: "inventory-scarcity",
    prompt:
      "Build a coming-soon teaser email for my listing at [[your listing address]] — hold the street address back, use real county inventory counts to show how scarce homes like it are, and one CTA to join a private preview list.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "market-comps": {
    key: "market-comps",
    positioning: "sell-side",
    label: "Market Comps",
    skeleton: null,
    prose: null,
    subject: "address",
    // THIS is the recipe the comps chart belongs to. Include the subject as its
    // own bar — we have its list price.
    chart: "comps-bar",
    // The prompt used to promise "six LIVE comparable LISTINGS". They are not that: the
    // set that comes back is a MIX — recorded sales plus current valuations. Promising
    // live listings and shipping valuations is a lie told by the spec, before the
    // builder writes a line. The email now states the mix on its face; this says so too.
    prompt:
      "Build a market-comps email for my listing at [[your listing address]] — six comparable homes nearby, each with its price and price per square foot, a price bar chart, and a straight case for my asking price.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "under-contract": {
    key: "under-contract",
    positioning: "sell-side",
    label: "Under Contract",
    skeleton: null,
    prose: null,
    subject: "address",
    // ⚠️ THIS PROMPT USED TO REQUEST A FABRICATION, AND IT GOT ONE.
    //
    // It read: "lead with how fast it went pending compared to the ZIP's typical days
    // on market." NO SOURCE WE HAVE CARRIES A DAYS-TO-CONTRACT INTERVAL — the vendor's
    // daysOnMarket is null on the fixture, and there is no contract date anywhere. The
    // builder did as it was told and invented one: "went under contract after 75 days
    // on market," plus a sequence ("the seller had reduced the price BEFORE a contract
    // was reached") that no source orders. A spec that asks for a number no lane holds
    // is not a spec — it is an instruction to lie, and the model complied.
    //
    // The honest version leads with WHEN IT WAS LISTED (which we do hold) against the
    // area's typical days on market (which we also hold), and never claims how long the
    // contract took. `chart` is "none" for the same reason: dom-vs-area needs this home's
    // days-to-contract as its subject bar, and that bar can never be honestly drawn.
    chart: "none",
    prompt:
      "Build an under-contract announcement email for my listing at [[your listing address]] — announce it's under contract, set its time on the market against the area's typical days on market, and invite backup offers.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "just-sold": {
    key: "just-sold",
    positioning: "sell-side",
    label: "Just Sold",
    skeleton: "just-sold",
    prose: null,
    subject: "address",
    // Uses the comps set as CONTEXT (the week's real sales), so the comps land
    // filter applies here too: beds AND sqft, or it's a vacant lot.
    chart: "comps-bar",
    prompt:
      "Build a just-sold email for my listing at [[your listing address]] — set the close among the week's real sales nearby, and end with a private home-valuation offer for my readers.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "open-house": {
    key: "open-house",
    positioning: "sell-side",
    label: "Open House",
    skeleton: "open-house",
    prose: null,
    subject: "address",
    // About a house and a MOMENT (a date and a time), not a number.
    chart: "none",
    prompt:
      "Build an open-house invitation email for my listing at [[your listing address]] — the date and time up front, the home's key specs, and one CTA to RSVP.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "price-reduced": {
    key: "price-reduced",
    positioning: "sell-side",
    label: "Price Improved",
    skeleton: "price-reduced",
    prose: null,
    subject: "address",
    // Operator, 07/13/2026: show the reduced amount ABOVE the price, in a
    // different color, in a smaller font. The vendor's `reduced_amount` is the
    // size of the CUT, not the old price: old = price + cut. That call stands.
    //
    // Operator, 07/15/2026: the was/now comparison is still a fact, not a chart
    // ("two bars is a fact wearing a chart costume" stands) — but the SAME 07/13
    // comment also said "no comps bar either: this is about a HOUSE, not a
    // market," and this line is a deliberate, acknowledged override of THAT
    // clause: the new price vs. real nearby comps is a genuine market argument
    // this recipe was leaving unshown. See price-reduced.ts's priceVsAreaDotSpec.
    chart: "price-vs-area-dot",
    prompt:
      "Build a price-improved email for my listing at [[your listing address]] — lead with the price cut, the home's key specs, and one honest line on what the new price means.",
    needs: ["agent_name", "brokerage", "business_address"],
  },

  // ── The area / agent recipes ───────────────────────────────────────────────
  "agent-brand-intro": {
    key: "agent-brand-intro",
    positioning: "sell-side",
    label: "Agent Brand Intro",
    skeleton: null,
    prose: "agent-intro",
    // TWO spines at once: a farm area AND the agent's newest listing as anchor.
    // Needs the agent's HEADSHOT — a photo we don't have → open slot + file picker.
    subject: "agent",
    chart: "zip-by-zip-asking",
    prompt:
      "Build an agent-introduction email for my farm area [[your city or ZIP]] — a ZIP-by-ZIP asking-price chart from live listings, my name and headshot up front, and my newest listing as the anchor.",
    needs: ["agent_name", "photo_url", "brokerage", "business_address"],
  },
  "agent-launch": {
    key: "agent-launch",
    positioning: "sell-side",
    label: "Agent Launch — The Letter",
    skeleton: null,
    prose: "agent-intro",
    subject: "agent",
    // A personal letter carries ONE hard number and NO chart (the agent-intro
    // prose recipe already enforces this, and authorDoc honors it explicitly).
    chart: "none",
    prompt:
      "Build my agent-launch announcement email introducing me to my sphere — open like a personal letter about why I got into real estate here, lead with one real market insight about [[your city or ZIP]], a short numbered what-happens-next of what I'll send each week, and one reply CTA. My photo sits beside the letter, not above it.",
    needs: ["agent_name", "photo_url", "brokerage", "business_address"],
  },
  "sphere-weekly": {
    key: "sphere-weekly",
    positioning: "story-side",
    label: "Weekly Sphere Update",
    skeleton: null,
    prose: "sphere-weekly",
    subject: "area",
    // The headline number is a LANE-3 fact (a named web source) — it is not in our
    // lake. Cite it or leave it an open slot. Never invent it.
    chart: "none",
    // THE DRIFT THAT PROVED THE POINT: the campaign follow-up carried this prompt
    // WITH a trailing "Schedule it every Tuesday morning."; the "Headlines vs Here"
    // slide carried it WITHOUT. Same deliverable, two strings — so a builder whose
    // identity IS the string treated them as two recipes. The schedule sentence is
    // load-bearing (the author emits `schedule_suggestion` from the prompt — see
    // build-doc.ts), and a weekly that sends itself is the entire pitch of this
    // campaign. So it stays, and now BOTH surfaces read this one string.
    prompt:
      "Build a weekly sphere market update for [[your city or ZIP]] — one national or Florida headline number set beside my own area's number, one honest read of the gap, and end by inviting readers to reply with their address and the word REVIEW for their home's snapshot. Schedule it every Tuesday morning.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "review-reply": {
    key: "review-reply",
    positioning: "story-side",
    label: "The REVIEW Reply",
    skeleton: null,
    prose: null,
    subject: "area",
    // Genuinely about numbers — pure lake data. A chart is right here.
    chart: "area-value-trend",
    prompt:
      "Build a one-area home-value snapshot email for [[your city or ZIP]] — the current home-value level and trend, days on market, and active inventory, each cited, with one honest read.",
    needs: ["agent_name", "brokerage", "business_address"],
  },
  "market-pulse": {
    key: "market-pulse",
    positioning: "story-side",
    label: "Monthly Market Pulse",
    skeleton: null,
    prose: "monthly-newsletter",
    subject: "area",
    chart: "zip-mom-move",
    prompt:
      "Build a monthly market-pulse email for [[your city or ZIP]] — every ZIP's month-over-month home-value move, one snapshot chart, and one honest read of the trend.",
    needs: ["agent_name", "brokerage", "business_address"],
  },

  // ── Social ────────────────────────────────────────────────────────────────
  "social-pack": {
    key: "social-pack",
    positioning: "story-side",
    label: "Social Pack — 4 Formats",
    skeleton: null,
    prose: null,
    subject: "area",
    chart: "none",
    prompt:
      "Build a social post for my farm area [[your city or ZIP]] — a data-hook caption from live listings and a local + broad hashtag mix.",
    needs: ["agent_name", "brokerage", "business_address"],
    target: "social",
  },
  "social-cut": {
    key: "social-cut",
    positioning: "story-side",
    label: "The Social Cut",
    skeleton: null,
    prose: null,
    subject: "area",
    chart: "none",
    prompt:
      "Build a social post for [[your city or ZIP]]'s monthly market pulse — the biggest ZIP move as the headline stat, values matching your email.",
    needs: ["agent_name", "brokerage", "business_address"],
    target: "social",
  },
};

const KEY_SET: ReadonlySet<string> = new Set(RECIPE_KEYS);

/** True iff `key` names a recipe we offer. */
export function isRecipeKey(key: string | null | undefined): key is RecipeKey {
  return typeof key === "string" && KEY_SET.has(key);
}

/** The recipe for a key — or null. Never throws: a stale key from an old URL must
 *  degrade to the generic author, never break a build. */
export function recipeByKey(key: string | null | undefined): Recipe | null {
  return isRecipeKey(key) ? RECIPES[key] : null;
}

/**
 * LEGACY BRIDGE — resolve a recipe from a raw prompt string.
 *
 * Every door now carries `?recipe=<key>`, but old links, saved drafts, and the
 * arc's stored `recipe_prompt` still carry prompt TEXT. Match those on the seed
 * prompt with the [[blank]] filled in (a user types their address over it, so an
 * exact-string match would miss). Prefix-match on the stable head of the prompt —
 * everything before the [[blank]] — which no user edit touches.
 *
 * This is a bridge, not the identity. A typed, organic prompt returns null and
 * falls through to the generic author, exactly as today.
 */
export function recipeFromPrompt(prompt: string | null | undefined): Recipe | null {
  const p = (prompt ?? "").trim();
  if (!p) return null;
  let best: Recipe | null = null;
  for (const key of RECIPE_KEYS) {
    const recipe = RECIPES[key];
    const blank = recipe.prompt.indexOf("[[");
    const head = (blank > 0 ? recipe.prompt.slice(0, blank) : recipe.prompt).trim();
    if (head.length < 12) continue; // too short to identify anything
    if (!p.startsWith(head)) continue;
    // Longest matching head wins — several lifecycle prompts share an opening.
    if (!best || head.length > (RECIPES[best.key].prompt.indexOf("[[") || 0)) best = recipe;
  }
  return best;
}
