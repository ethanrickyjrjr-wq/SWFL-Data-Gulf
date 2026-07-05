// lib/email/author-recipes.ts — deliverable-type recipes for the AUTHOR engine.
// PURE — no I/O, no React.
//
// A recipe is an ADVISORY prose section appended to authorSystem when the user's
// prompt names a deliverable type: an ordered target structure + tone, each move
// tagged with the researched reason it converts (evidence fetched in-session via
// crawl4ai, 07/02/2026 — see docs/superpowers/specs/2026-07-03-author-layout-
// recipes-design.md for the sourced findings: Mailchimp single-column + top hook,
// Klaviyo welcome benchmarks, Vero inverted pyramid, Campaign Monitor mobile
// share, Scalero image mechanics, Chase Dimond layout analysis, Techelix
// whitespace-as-luxury, Litmus typography). The model MAY deviate — nothing here
// is enforced (RULE C2: no new gate; the moat stays id-selection + prose lint).
//
// HARD CONSTRAINT (test-enforced): recipe text contains ZERO digits, so it can
// never collide with the no-invention prose lint or smuggle a figure.

export const RECIPE_IDS = [
  "agent-intro",
  "monthly-newsletter",
  "editorial-letter",
  "editorial-showcase",
  "editorial-magazine",
] as const;

export type RecipeId = (typeof RECIPE_IDS)[number];

// Detection order is fixed: welcome → monthly → editorial (so "a fancy welcome
// email" reads as a welcome, and "monthly letter" as a newsletter). Within the
// editorial family, letter/showcase pick sub-recipes; magazine-issue is the
// default. \bletter\b never fires inside "newsletter" (word boundary).
const WELCOME_RE = /\bwelcome\b|introduc|\bnew agent\b|\bmeet\b/i;
const MONTHLY_RE = /\bmonthly\b|\bnewsletter\b|\bdigest\b/i;
const EDITORIAL_RE = /\bfancy\b|\belegant\b|\beditorial\b|\bmagazine\b|\bluxury\b|\bletter\b/i;
const LETTER_RE = /\bletter\b/i;
const SHOWCASE_RE = /\bshowcase\b|\bspotlight\b/i;

/** Route a user prompt onto a recipe — or null, which leaves today's generic
 *  author prompt byte-identical. Deterministic; keywords only. */
export function detectRecipe(prompt: string): RecipeId | null {
  const p = prompt ?? "";
  if (WELCOME_RE.test(p)) return "agent-intro";
  if (MONTHLY_RE.test(p)) return "monthly-newsletter";
  if (EDITORIAL_RE.test(p)) {
    if (LETTER_RE.test(p)) return "editorial-letter";
    if (SHOWCASE_RE.test(p)) return "editorial-showcase";
    return "editorial-magazine";
  }
  return null;
}

const RECIPES: Record<RecipeId, string> = {
  "agent-intro":
    "RECIPE — AGENT LAUNCH / PROSPECT WELCOME (tuned for cold-open conversion; the " +
    "letter-plus-clipping look — a personal letter carrying one piece of hard evidence).\n" +
    "Target structure, top to bottom:\n" +
    "- Open with a side-by-side row: an `agent-hero` block spanning about five of the " +
    "twelve columns BESIDE a `text` block carrying the letter opening — never a " +
    "full-width photo banner on top. The agent-hero is the professional portrait " +
    "treated as a tall column (the system fills the photo and name; you write only " +
    "the tagline).\n" +
    "- The letter opening: the first sentence says plainly why the reader is receiving " +
    "this (you know each other, or they asked to hear from you); then a line or two of " +
    "first-person origin story. Written for one reader — warm, direct, short.\n" +
    "- One `hero` block with band light as the market moment: kicker names the place, " +
    "the headline value comes from the DATA MENU, label is one honest plain-language " +
    "line. Exactly one figure in the whole email — the letter carries one piece of hard " +
    "evidence, no more.\n" +
    "- A `list` block about what happens next: leads are words (First / Then / Every " +
    "week), every item phrased as what the reader gets, never as sender activity.\n" +
    "- An `agent-card` as the sign-off — the bio reads as a two-line signature, never a " +
    "resume.\n" +
    "- Exactly ONE `button`: the reply ask (reply with your address and a word like " +
    "REVIEW for your home's numbers). A short `text` P.S. inviting a forward to one " +
    "friend is the only second ask, and it is soft.\n" +
    "- The key message and the one ask land in the first readable lines. Copy is always " +
    "real text, never baked into an image. The footer with unsubscribe and postal " +
    "address always renders — never suggest removing it.",

  "monthly-newsletter":
    "RECIPE — MONTHLY NEWSLETTER (recurring market digest).\n" +
    "Target structure, top to bottom:\n" +
    "- Masthead header naming the month (write the month name as a word, never a " +
    "numeral — you never type digits).\n" +
    "- The lead story first, single column: a market-update hero with its headline " +
    "figure id-selected from the DATA MENU, stats as the hook — readers decide in the " +
    "first screen whether to keep going.\n" +
    "- After the lead, variety is welcome: a `multi-column` row for community events or " +
    "advice cards, a `list` for dates and tips, a featured listing when one is offered.\n" +
    "- One primary button for the whole email; per-section links stay secondary.\n" +
    "Keep imagery well under half of the email so it reads as substance, not a flyer — " +
    "heavy image ratios also wake spam filters. Consistent structure month over month " +
    "builds the open habit. The footer with unsubscribe and postal address always " +
    "renders.",

  "editorial-letter":
    "RECIPE — EDITORIAL LETTER (warm audience; the personal note).\n" +
    "A text-only personal letter from the agent — text-only BY DESIGN: plain personal " +
    "letters out-open designed emails for relationship building, because they read as " +
    "written for one person.\n" +
    "Target structure, top to bottom:\n" +
    "- A `text` block carrying the letter itself, pad airy — generous whitespace is the " +
    "premium signal. Write like a note to one reader, not a broadcast.\n" +
    "- Sign off with an agent-card (the bio line reads as a signature).\n" +
    "- Zero or one image at most; a single text link and NO buttons — a button would " +
    "break the letter's spell.\n" +
    "This is still a commercial email: the footer with unsubscribe and postal address " +
    "always renders — never suggest removing it.",

  "editorial-showcase":
    "RECIPE — EDITORIAL SHOWCASE (one story, luxury spotlight).\n" +
    "One story or one property. Nothing else competes.\n" +
    "Target structure, top to bottom:\n" +
    "- A button above, a hero image with overlay_title in the middle, a button below — " +
    "the reader can act at either moment.\n" +
    "- Copy is two or three sentences, no more: exclusivity comes from what is " +
    "intentionally left out.\n" +
    "- pad airy on every section — a whitespace share of roughly half the canvas is the " +
    "luxury-brand spotlight pattern.\n" +
    "Tone: restrained, confident, serif display feel. The footer with unsubscribe and " +
    "postal address always renders.",

  "editorial-magazine":
    "RECIPE — MAGAZINE ISSUE (warm audience; the designed edition).\n" +
    "Target structure, top to bottom:\n" +
    "- A full-bleed hero image with overlay_title as the masthead — the issue's title " +
    "moment.\n" +
    "- Feature cards in a `multi-column` row (a heading, a couple of lines, a link " +
    "label each) — aspirational context lifts time spent and follow-through.\n" +
    "- Separate sections with a `band` (dark or accent) — the system resolves the color " +
    "and flips text; you never write a color.\n" +
    "- Primary button in or just after the hero; per-card links stay secondary.\n" +
    "Typography discipline: at most two font styles, serif display with a clean sans " +
    "body; generous line height reads boutique. The footer with unsubscribe and postal " +
    "address always renders.",
};

/** The prose RECIPE section for authorSystem. */
export function recipeSection(id: RecipeId): string {
  return RECIPES[id];
}
