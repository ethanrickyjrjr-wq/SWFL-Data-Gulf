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
  "sphere-weekly",
  "year-in-review",
  "chart-digest",
  "chart-story",
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
// The weekly contrast brief ("weekly … market update" / "sphere market update").
// Checked AFTER welcome (an intro mentioning a weekly update stays a welcome)
// and BEFORE monthly (a "weekly" ask must never read as the monthly digest).
const SPHERE_WEEKLY_RE = /\bweekly\b[^.!?]*\bmarket update\b|\bsphere market update\b/i;
// The personalized annual recap ("year in review" / "annual recap" / "year-end
// newsletter"). Checked AFTER welcome and sphere-weekly (an intro or weekly ask
// that mentions the year stays what it is) and BEFORE monthly — "year-end
// newsletter" and "annual newsletter" must read as the recap, never the digest.
const YEAR_REVIEW_RE =
  /\byear[- ]in[- ]review\b|\bannual\b[^.!?]*\b(recap|review|letter|update|newsletter)\b|\byear[- ]end\b[^.!?]*\b(recap|review|update|newsletter|email)\b|\byour year\b/i;
// The chart-led roundup ("week in charts" / "chartbook" / "chart digest").
// Checked AFTER year-review (an annual-recap ask stays the recap even if it
// mentions charts) and BEFORE chart-story (a roundup naming a lead chart keeps
// the digest shape) and BEFORE monthly — "chart digest" contains "digest", so
// monthly would swallow it if checked first.
const CHART_DIGEST_RE =
  /\bchartbook\b|\bcharts? (roundup|digest|pack|briefs?)\b|\b(week|month|year|market) in charts\b/i;
// The single-chart story ("chart of the day/week/month" / "one chart" / "chart
// breakdown"). Checked AFTER chart-digest (multi-chart asks keep the digest
// shape) and BEFORE monthly — "chart of the month newsletter" must read as the
// story, never the generic digest. A bare "chart" never fires (compound
// phrases only), so "newsletter with a chart" stays monthly.
const CHART_STORY_RE =
  /\bchart of the (day|week|month)\b|\bone[- ]chart\b|\bchart (story|breakdown|deep[- ]dive|walkthrough)\b/i;
const MONTHLY_RE = /\bmonthly\b|\bnewsletter\b|\bdigest\b/i;
const EDITORIAL_RE = /\bfancy\b|\belegant\b|\beditorial\b|\bmagazine\b|\bluxury\b|\bletter\b/i;
const LETTER_RE = /\bletter\b/i;
const SHOWCASE_RE = /\bshowcase\b|\bspotlight\b/i;

/** Route a user prompt onto a recipe — or null, which leaves today's generic
 *  author prompt byte-identical. Deterministic; keywords only. */
export function detectRecipe(prompt: string): RecipeId | null {
  const p = prompt ?? "";
  if (WELCOME_RE.test(p)) return "agent-intro";
  if (SPHERE_WEEKLY_RE.test(p)) return "sphere-weekly";
  if (YEAR_REVIEW_RE.test(p)) return "year-in-review";
  if (CHART_DIGEST_RE.test(p)) return "chart-digest";
  if (CHART_STORY_RE.test(p)) return "chart-story";
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
    "- The letter opening: write it in the text block's `body` field (the long field — " +
    "`prose` gets cut short) as a few short paragraphs that END on a complete thought. " +
    "The first sentence says plainly why the reader is receiving this (you know each " +
    "other, or they asked to hear from you); then a line or two of first-person origin " +
    "story. Written for one reader — warm, direct, short.\n" +
    "- One `hero` block with band light as the market moment: kicker names the place, " +
    "the headline value comes from the DATA MENU, label is one SHORT honest line — a " +
    "handful of words that fit whole, never a sentence that risks being cut mid-word. " +
    "Exactly one figure in the whole email — the letter carries one piece of hard " +
    "evidence, no more, and no chart.\n" +
    "- A `list` block about what happens next: leads are words (First / Then / Every " +
    "week), every item phrased as what the reader gets, never as sender activity.\n" +
    "- An `agent-card` as the sign-off — the bio reads as a two-line signature, never a " +
    "resume.\n" +
    "- Exactly ONE `button`, and you MUST write its `button_label` field yourself as " +
    "the reply ask, in a few short words that fit a button (reply with your address " +
    "— the details live in the email body, not the label); leaving it empty ships a " +
    "generic label, and never a view, read, or learn-more label. A short " +
    "`text` P.S. inviting a forward to one friend is the only second ask, and it is " +
    "soft.\n" +
    "- The key message and the one ask land in the first readable lines. Copy is always " +
    "real text, never baked into an image. The footer with unsubscribe and postal " +
    "address always renders — never suggest removing it.",

  "sphere-weekly":
    "RECIPE — WEEKLY SPHERE MARKET UPDATE (the headlines-versus-here contrast).\n" +
    "Target structure, top to bottom:\n" +
    "- Open with the contrast pair: TWO `hero` blocks side by side in ONE row, each " +
    "spanning six of the twelve columns, each with band light, each value from the " +
    "DATA MENU. The system prints each figure's own factual label under its value " +
    "automatically — so the kickers must NOT repeat it: the first hero's kicker reads " +
    "like a headline pointer for the broad market (the county says, the headlines " +
    "say), the second points at the reader's side (here in your neighborhood). These " +
    "two are the headline figures — the whole email hangs on this pair.\n" +
    "- One honest read of the gap in a `signal` block: plain language, a few sentences " +
    "that END on a complete thought, what the difference actually means for someone " +
    "who owns or wants a home there, and one sentence naming what would change this " +
    "read. Never hedge it into mush.\n" +
    "- Optionally one supporting `stats` row (values only from the DATA MENU) or the " +
    "offered chart — nothing else competes with the pair.\n" +
    "- Exactly ONE `button`, and you MUST write its `button_label` field yourself as " +
    "the reply ask in a few short words that fit a button (reply with REVIEW — the " +
    "address instruction lives in the email body, not the label); leaving it empty " +
    "ships a generic label, and never a view, read, or learn-more label.\n" +
    "- Keep it short: this arrives every week, and consistency of shape builds the " +
    "open habit. The footer with unsubscribe and postal address always renders.",

  // PROVENANCE: distilled 07/05/2026 from Resy's year-in-review email via
  // reallygoodemails.com (public gallery; screenshot lane — content stripped,
  // layout system only). Why-tag evidence: en.wikipedia.org/wiki/Spotify_Wrapped
  // (fetched in-session 07/05/2026 — wrapped recaps are a series of sequential
  // single-stat screens, organized visually to boost engagement; the personalized
  // recap format drives sharing and advocacy), plus the in-file base (Vero
  // inverted pyramid — the hook lands in the first screen).
  "year-in-review":
    "RECIPE — YEAR IN REVIEW (the personalized annual recap; one number at a time, " +
    "zooming home).\n" +
    "Target structure, top to bottom:\n" +
    "- Open with a personal masthead: a `hero` with band light whose kicker names " +
    "the reader's area and whose headline frames the recap — the reader's own year, " +
    "by the numbers (name the year in words like this past year — you never type " +
    "digits). The reader is the subject of the story: a personal recap reads as a " +
    "gift, not a pitch, and that is what earns the open and the forward.\n" +
    "- A short `text` note written to one reader: what this recap is and why they " +
    "are getting it — a couple of warm sentences, no selling.\n" +
    "- The cascade: a small handful of figures, EACH in its own row — one " +
    "`metric-card` per figure, its value id-selected from the DATA MENU, its label " +
    "one short line — never one crowded grid. Sequential single-number moments are " +
    "the wrapped-style mechanic: each figure lands alone, so each one registers.\n" +
    "- Order the cascade as a zoom: the broad market first (state or county), the " +
    "reader's own area last — the story tightens toward home, and the most personal " +
    "figure is the payoff.\n" +
    "- One `signal` block as the year's honest read: what the year actually meant " +
    "for someone who owns or wants a home there, plus one sentence naming what " +
    "would change this read next year. Never hedge it into mush.\n" +
    "- Close warm and forward-looking in a `text` block: thank the reader and ask " +
    "the question that points at next year. Sign off with an `agent-card` — the " +
    "bio reads as a signature.\n" +
    "- Exactly ONE `button`, and you MUST write its `button_label` field yourself " +
    "as the reply ask in a few short words that fit a button (reply with your " +
    "address for your home's own year recap — the details live in the email body, " +
    "not the label); leaving it empty ships a generic label, and never a view, " +
    "read, or learn-more label. The recap ask converts because it extends the " +
    "personal story to the reader's own home.\n" +
    "- This is an annual moment — let it breathe: pad airy on the cascade rows. The " +
    "footer with unsubscribe and postal address always renders.",

  // PROVENANCE: distilled from https://www.dailychartbook.com/ (DC Lite issue,
  // public archive), found 07/05/2026. Layout system only — no source copy,
  // figures, or images. Adapted to this engine's one-chart contract: the source
  // runs many charts; here the single offered chart anchors the lead brief and
  // every other brief carries one DATA MENU figure. The source's literal
  // numbered ordinals are dropped (a bare ordinal digit would trip the prose
  // lint) — word-led topic labels keep the same scan mechanic.
  // Why-tag evidence (fetched in-session 07/05/2026):
  // nngroup.com/articles/how-users-read-on-the-web — readers scan rather than
  // read (email newsletters even more abruptly); one idea per paragraph caught
  // by the first few words; naming outside sources builds credibility; readers
  // detest marketese. storytellingwithdata.com/blog/2017/8/9/my-guiding-principles
  // — an explanatory graph states a point of view; make it clear where to look;
  // every graph needs a title and a source note.
  "chart-digest":
    "RECIPE — CHART DIGEST (the market in charts; a roundup of short evidence " +
    "briefs, each one figure, one takeaway).\n" +
    "Target structure, top to bottom:\n" +
    "- Masthead header naming the edition's cadence and place (week, month — " +
    "written as words; you never type digits).\n" +
    "- The lead brief carries the offered chart: a short `text` block FIRST whose " +
    "opening few words are the brief's topic label, then one plain-language " +
    "takeaway sentence that states what the chart shows — the point of view lands " +
    "before the picture, because readers scan and a brief's first words decide " +
    "whether it registers. Then the chart image, its caption quoting only the " +
    "chart's real figures.\n" +
    "- After the lead, a small handful of further briefs — each ONE idea only: a " +
    "topic label in the first few words, one takeaway sentence, and one " +
    "`metric-card` whose value is id-selected from the DATA MENU. One figure per " +
    "brief, each in its own row — a crowded grid kills the scan rhythm that makes " +
    "a digest work.\n" +
    "- Takeaways are flat statements of what the number says, never sales language " +
    "— readers detest marketese, and a digest's authority comes from reading like " +
    "reporting. When a figure comes from a named outside source, say the name " +
    "plainly the way the menu labels it: naming sources builds credibility.\n" +
    "- Close with the more-where-this-came-from turn: one short `text` line noting " +
    "the reader's own area has its own numbers, then exactly ONE `button` — you " +
    "MUST write its `button_label` field yourself as the reply ask in a few short " +
    "words that fit a button (reply with your address — details live in the email " +
    "body, not the label); leaving it empty ships a generic label, and never a " +
    "view, read, or learn-more label.\n" +
    "- Keep the shape identical edition to edition — the fixed cadence builds the " +
    "open habit. The footer with unsubscribe and postal address always renders.",

  // PROVENANCE: distilled from https://www.thechartreport.com/ (The Morning
  // Print issue, public archive), found 07/05/2026. Layout system only — no
  // source copy, figures, or images.
  // Why-tag evidence (fetched in-session 07/05/2026):
  // storytellingwithdata.com/blog/2017/8/9/my-guiding-principles — the right
  // graph creates one aha moment; make it clear where to look (one emphasized
  // thing, everything else recedes); an explanatory chart states a point of
  // view. nngroup.com/articles/how-users-read-on-the-web — one idea per
  // paragraph; inverted pyramid, conclusion first; half the word count.
  "chart-story":
    "RECIPE — CHART STORY (one chart, one claim; the deep read).\n" +
    "The whole email hangs on ONE chart and the claim it proves. Nothing else " +
    "competes — a single emphasized exhibit is what makes the reader's eye land, " +
    "and one aha beats five maybes.\n" +
    "Target structure, top to bottom:\n" +
    "- Open with the claim as the headline moment: a `hero` with band light whose " +
    "kicker names the place and whose headline value is id-selected from the DATA " +
    "MENU — the conclusion lands first, inverted-pyramid style, so the reader who " +
    "stops after one screen still gets the story.\n" +
    "- A short `text` setup written like a note: a sentence or two on why this " +
    "matters right now, ending on a pivot line that hands the reader to the " +
    "evidence (a plain here is the picture turn).\n" +
    "- THE chart — the offered chart image, large, alone in its own row, its " +
    "caption quoting only the chart's real figures. This is the exhibit; give it " +
    "room.\n" +
    "- The walkthrough: a `text` block of a few SHORT paragraphs — one idea each, " +
    "each anchored to what is visible in the chart or to a DATA MENU value, " +
    "walking the reader through what the picture shows and what usually follows " +
    "a picture like this. Half the words you think you need.\n" +
    "- One `signal` block as the honest stake: what this means for someone who " +
    "owns or wants a home there, plus one sentence naming what would change the " +
    "read. Never hedge it into mush.\n" +
    "- Exactly ONE `button`, and you MUST write its `button_label` field yourself " +
    "as the reply ask in a few short words that fit a button (reply for your " +
    "street's version of this chart — details live in the email body, not the " +
    "label); leaving it empty ships a generic label, and never a view, read, or " +
    "learn-more label. Sign off with an `agent-card` — the bio reads as a " +
    "signature.\n" +
    "- The footer with unsubscribe and postal address always renders.",

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
