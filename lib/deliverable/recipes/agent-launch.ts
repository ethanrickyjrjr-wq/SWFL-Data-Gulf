// lib/deliverable/recipes/agent-launch.ts
//
// R9 · AGENT LAUNCH — "THE LETTER".
//
// A personal letter, not a flyer. There is NO listing subject here: the spine is
// the AGENT plus their farm area. The five listing recipes are one resolved house
// wearing different hats; this one is not a hat on that house at all, and forcing
// the flyer on it is the mistake this file exists to avoid.
//
// ── WHY THIS LETTER IS ONE COLUMN, TOP TO BOTTOM (READ BEFORE YOU "RESTORE" THE
//    PORTRAIT BESIDE THE LETTER) ─────────────────────────────────────────────
//
// A SCREENSHOT IS NOT PROOF FOR AN EMAIL. Chromium renders markup Outlook cannot,
// so this recipe's proof was a picture of a defect nobody could see. Twice.
//
// Defect 1 (07/13, in the SENT html): the two branches had different letter
// HEIGHTS but shared the blocks' absolute y's, so the no-headshot letter's band
// (7..14) SWALLOWED the stats (y:9) and the list (y:12) — `groupRows` bands by
// OVERLAP, not equal y. `compileGrid` emitted `<table width="1800">` with three
// `<td width="600">` into the Outlook ghost table: a three-column strip 3× past the
// 600px canvas. Chromium strips mso conditional comments (they ARE comments), so the
// screenshot was STRUCTURALLY INCAPABLE of showing it.
//
// Defect 2 (found by running the real compiler and reading the bytes): the
// WITH-headshot branch shipped THE SAME FACE TWICE — identical `src`, once in the
// letterhead `image` block and once in the signature `agent-card`. And the letterhead
// copy carried NO `width` attribute: inside a ghost `<td width="250">` it was held to
// 250px by `max-width`, `aspect-ratio` and `object-fit` — ALL THREE of which Outlook's
// Word engine ignores. `AgentCardBlock` is the ONE component here that renders a
// portrait Outlook-safely, and its own source comment says why: `width={96}` (the HTML
// attribute Word actually obeys) inside a real `<Row>`/`<Column>` table, natural
// aspect, no object-fit. The face already had a correct home; the letterhead copy was
// a duplicate whose only other effect was to CREATE the ghost table.
//
// So: EVERY BLOCK IS w=12 AND SITS IN ITS OWN BAND. There is no `columns()` helper in
// this file any more, and no second branch. That makes the entire class of defect
// unreachable rather than fixed:
//   • one block per band  → `groupRows` can never band two blocks together
//   • never a multi-block row → `compileGrid` NEVER emits a ghost table or a ghost
//     `<td>` (it only builds one for a row of 2+; a lone block renders full-bleed)
//   • no branch → the two-height y-drift that caused defect 1 cannot recur
//   • w=12 everywhere → the canvas shows the width the email actually sends (a LONE
//     w=5 block renders FULL-BLEED in `compileGrid` — the canvas would show a 250px
//     portrait and the recipient would get a 600px one)
// The test runs the REAL grouper and the REAL `compileGrid` over BOTH branches and
// asserts zero ghost tables, zero ghost `<td>`s, and Σw ≤ 12 on every row. Layout is
// now MECHANICALLY verified, never eyeballed.
//
// ⚠️ REPORTED, NOT EDITED (shared file): `recipes.ts`'s seed prompt still ends "My
// photo sits beside the letter, not above it." Honoring that sentence LITERALLY is
// what produced the ghost table and the duplicate face. The letter honors its INTENT —
// the portrait is never a banner ABOVE the letter; it sits beside the agent's name in
// the signature. That prompt line should be retired or re-worded by its owner.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the agent (brand: photo, name, brokerage) + their AREA. `ctx.facts`
//      is null by contract for an "agent" spine, and `ctx.zip` is only ever set when
//      a door happened to pass `scope.kind === "zip"` — the Lab door passes NOTHING,
//      so the area lives only in the prompt text. We read it from `ctx.zip` first,
//      then from the prompt (a typed 5-digit SWFL ZIP, then the sourced place→ZIP
//      crosswalk `zipFromPromptPlace` — the SAME root authorDoc's free lane uses).
//      This is not a second subject resolver; the dispatcher never resolves an area.
//   2. SKELETON — a CODED single-column grid, built here, the way `buildListingFlyer`
//      is coded. No committed SEED_DOC fits: the closest, `stay-in-touch`, opens with a
//      FULL-WIDTH `agent-hero` banner (a 300px near-black "Agent photo" placeholder box
//      that SHIPS to recipients when the photo is missing — a naked placeholder, the one
//      thing the open-slot contract forbids). `editorial-letter` has the right voice but
//      carries no `layout` at all.
//   3. CELLS — exactly ONE: the single market figure, written in CODE from a real
//      lake figure (value · source · as-of). Unsourced → an open stat cell whose
//      LABEL is the instruction (canvas affordance; StatsBlock drops it, and the
//      whole row, on `emailRender`). Never a zero.
//   4. CHART — NONE. Declared on the key; a personal letter carrying a cross-SWFL
//      ranking chart shipped live on 07/05/2026. We never CREATE a chart block, so
//      there is nothing for a later pass to fill: authorDoc's `resolvedRecipe !==
//      "agent-intro"` chart suppression is upstream of us and we do not undo it.
//   5. PROSE — the model writes the letter, three "what happens next" lines, and one
//      subject line. See THE CLAIM GATE below.
//   6. FRAMING — the letter · one cited number · a short numbered what-happens-next ·
//      ONE reply CTA (a real `mailto:`) · a signature card carrying the agent's face.
//
// ── THE CLAIM GATE (lib/deliverable/claims.ts) ──────────────────────────────
//
// On 07/13/2026 four of seven deliverables shipped a FALSEHOOD, and not one of them
// contained an invented NUMBER. What was invented was the CLAIM DRAWN BETWEEN
// correctly-sourced numbers: a comparison ("$209 sits below the $213 median" — it was
// above), a trajectory ("the gap is widening" — from one level and no trend), a count
// ("five of those six ZIPs" — it was four), an ordering, a street. A digit lint cannot
// see any of those: invention is CLAIM-shaped, not number-shaped.
//
// The defense is STRUCTURAL, not lexical (a banned-word list already lost: ban
// "street" and the model writes "on Shore Dr"):
//
//   1. THE NARRATOR IS HANDED NO NUMBER AT ALL. Not the figure, not a set, not a row
//      list, not a pair — `authorLetter` receives the place NAME, the user's own words,
//      and a BOOLEAN saying whether a figure exists. IT CANNOT COMPARE TWO NUMBERS IT
//      WAS NEVER GIVEN TWO OF, and it cannot restate, round, or trend one it never saw.
//      The one hard number is written in CODE, into the stats cell, downstream of it.
//   2. The only fact it gets is a SETTLED SENTENCE naming the area (`settledFacts`) —
//      whose numerals become the anchor allow-set, so a bare-ZIP farm area can be named
//      while every OTHER numeral is unanchored by construction.
//   3. `CLAIM_PROHIBITION` is printed verbatim into its system prompt, so the model is
//      TOLD the exact rule the lint enforces.
//   4. `auditClaims` is the FAIL-CLOSED BACKSTOP: a paragraph carrying ANY unsupported
//      claim shape is DROPPED WHOLE — never trimmed, never best-effort. Lose every
//      paragraph and the letter is an OPEN SLOT (an empty text block: a canvas
//      placeholder that does not exist in the sent email). A missing paragraph is
//      honest; a confident false one is not. The build is NEVER refused (RULE 0.7).

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { loadMarketFigures, type MarketFigure } from "@/lib/email/market-context";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { createBlock, DEFAULT_BLOCK_PROPS } from "@/lib/email/doc/default-docs";
import { auditClaims, numeralsIn, CLAIM_PROHIBITION, type SettledClaim } from "../claims";
import type { RecipeBuildContext } from "./index";
import type { BlockLayout, EmailBlock, EmailDoc, ListItem } from "@/lib/email/doc/types";

// ── The area (the letter's one market number is scoped to it) ────────────────

/** A SWFL ZIP typed straight into the [[your city or ZIP]] blank. Lee/Collier ZIPs
 *  are 33xxx/34xxx; the `(?!\d)` guards keep a street number out (326 is 3 digits;
 *  a 5-digit run inside a longer number is not a ZIP). Never invents one. */
const SWFL_ZIP_RE = /(?<!\d)(3[34]\d{3})(?!\d)/;

export interface LetterArea {
  /** What the reader is told this is about — a city name, else the bare ZIP. */
  place: string;
  /** The ZIP the figure is pulled for. */
  zip: string;
}

/** The area, resolved ONCE, from a real source — the door's scope, else the user's
 *  own prompt text (a typed ZIP, then the sourced place→ZIP crosswalk). Null when
 *  the user named no place we hold: the letter still ships, with an OPEN SLOT where
 *  the number would go. NEVER invents a place. */
export function areaFor(ctx: RecipeBuildContext): LetterArea | null {
  if (ctx.zip) return { place: ctx.zip, zip: ctx.zip };
  const typed = SWFL_ZIP_RE.exec(ctx.prompt);
  if (typed) return { place: typed[1], zip: typed[1] };
  const named = zipFromPromptPlace(ctx.prompt);
  return named ? { place: named.place, zip: named.zip } : null;
}

/**
 * THE ONE HARD NUMBER — and it is the only one in the whole email.
 *
 * Priority is what an agent's sphere actually cares about: what a home here is
 * worth, then what homes are being asked for, then what the county closed at. The
 * FIRST one the lake really holds wins; we never stack a second (a "one number"
 * letter that prints two is not this recipe).
 */
const FIGURE_PRIORITY = ["home_value", "median_list", "county_sale"] as const;

export function pickOneFigure(figures: MarketFigure[]): MarketFigure | null {
  for (const key of FIGURE_PRIORITY) {
    const hit = figures.find((f) => f.key === key && (f.value ?? "").trim());
    if (hit) return hit;
  }
  return null;
}

// ── The claim gate ───────────────────────────────────────────────────────────

/**
 * EVERYTHING THE NARRATOR IS ALLOWED TO KNOW, as settled sentences.
 *
 * There is exactly one: the area's NAME. It is not a quantity, it cannot be compared
 * to anything, and it is the only thing `authorLetter` is told. Its numerals become
 * the anchor allow-set (`auditClaims`), so a farm area that IS a bare ZIP ("33904")
 * can be named in the letter — while every other numeral the model produces is, BY
 * CONSTRUCTION, a number it was never given, i.e. invented, and its paragraph dies.
 *
 * The figure is deliberately absent. A letter that never sees a number cannot invert
 * a comparison about one (market-comps), cannot call a level a trend (sphere-weekly),
 * and cannot miscount a set (market-pulse) — those are the three shapes that shipped.
 */
export function settledFacts(place: string | null): SettledClaim[] {
  if (!place) return [];
  const sentence = `The agent's farm area is ${place}, in Southwest Florida.`;
  return [{ sentence, anchors: numeralsIn(sentence) }];
}

/**
 * FAIL-CLOSED, per paragraph. A paragraph carrying ANY unsupported claim shape — a
 * comparison, a trajectory, a count, an ordering, a location relation, a motive, or a
 * numeral no settled fact holds — is DROPPED WHOLE. Not trimmed. Not repaired.
 *
 * The paragraph is the unit because a claim is a whole thought: cutting the offending
 * clause out of "I work here because prices are climbing" leaves a sentence that means
 * something the model didn't say. Losing every paragraph leaves an empty string, and an
 * empty text block is an OPEN SLOT — a canvas placeholder that does not exist in the
 * sent email. Never a refusal, never a "best-effort" paragraph.
 */
export function gateLetterProse(body: string, settled: readonly SettledClaim[]): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && auditClaims(p, settled).length === 0)
    .join("\n\n")
    .trim();
}

// ── The prose (the model writes THIS and nothing else) ───────────────────────

export interface LetterProse {
  subject: string;
  letter: string;
  next: string[];
}

const LETTER_SYSTEM =
  `You write a real-estate agent's LAUNCH LETTER — the note they send their own ` +
  `sphere (people who already know them) when they start sending market updates. ` +
  `It is a LETTER, not a flyer and not a newsletter.\n\n` +
  `YOU WRITE THREE THINGS AND NOTHING ELSE:\n` +
  `1. "subject" — one subject line. Plain, human, under 60 characters. No emoji, ` +
  `no colon-clickbait, no exclamation marks.\n` +
  `2. "letter" — two or three SHORT paragraphs, first person, written to ONE reader. ` +
  `Open by saying plainly why they are getting this (you know each other). Then say ` +
  `why you do this work HERE, in this place. Close by pointing at the one number this ` +
  `note carries and inviting a reply. End on a complete thought. No sign-off name.\n` +
  `3. "next" — exactly three lines saying what the READER gets from now on. Each is ` +
  `phrased as what THEY receive, never as what you will do. Under 140 characters each.\n\n` +
  CLAIM_PROHIBITION +
  `\n\nTHAT PROHIBITION IS ENFORCED BY A LINT, NOT BY GOODWILL. A paragraph that breaks ` +
  `it is DELETED from the letter before it is sent — you do not get a second draft, and ` +
  `the reader simply never sees that paragraph. Four of these rules break on phrasings ` +
  `that feel harmless in a warm letter, so they get named here:\n` +
  `• NEVER "the number below" / "above" / "beside" / "attached" / "in the chart". You do ` +
  `not know how this renders or what sits next to what — and a positional word next to a ` +
  `market word reads as a COMPARISON to the lint. Say "the one number in this note".\n` +
  `• NEVER "I want to", "I'm hoping to", "I'm looking to", "I'm committed to". Those are ` +
  `MOTIVES. Say what you DO, in the present tense: "I read every reply."\n` +
  `• NEVER "before", "after", "since", "once", "which led to" anywhere near a market ` +
  `word (price, sale, listing, contract, the market). That is a SEQUENCE, and we almost ` +
  `never know the order things happened in.\n` +
  `• NEVER "prices are rising / cooling / climbing / steady", "the market is picking up". ` +
  `Those are TRAJECTORIES. You have been given no trend and cannot see one.\n\n` +
  `ABSOLUTE RULES.\n` +
  `NO NUMBERS. Not one digit, anywhere — no prices, no percentages, no years, no ` +
  `counts, no dates. You have not been given a single figure and you may not produce ` +
  `one. The email carries exactly ONE number and the system already placed it; your ` +
  `job is to point at it in words ("the one number in this note", "what a home here is ` +
  `actually worth right now"), never to state it.\n` +
  `NO BIOGRAPHY YOU WERE NOT GIVEN. A fact about the agent is not only a number: you ` +
  `may not assert where they grew up, how long they have done this, what they did ` +
  `before, their family, their brokerage, their sales record, their specialty, or any ` +
  `award. If the agent said something about themselves in their own request, that IS ` +
  `true and you may use it. Otherwise write the motivation without inventing a life: ` +
  `the work itself, and what you owe this reader.\n` +
  `WHERE THEY LIVE IS A LIFE FACT, NOT A MOTIVATION. This is the one that leaks, so it ` +
  `gets its own rule. You may say they WORK here. You may NOT say they live here, moved ` +
  `here, grew up here, "chose" this place, "put down roots", raised a family here, "call ` +
  `it home", or that it is "where I'm from" — you were told the agent's FARM AREA, which ` +
  `is where they sell, and nothing whatsoever about where they sleep. An agent who ` +
  `commutes in and gets a letter saying they put down roots here has been made to lie to ` +
  `people who know them. Write why the work is worth doing, not a residency you invented.\n` +
  `NAME THE PLACE, DO NOT DESCRIBE IT. You may say where you work. You may NOT assert ` +
  `anything about it — no canals, no beaches, no growth, no history, no landmarks, no ` +
  `"fastest-growing", no character of any kind — unless the agent's own request said ` +
  `it. You have never been there. A place fact you were not given is an invention ` +
  `exactly like a price you were not given.\n` +
  `NO SELLING CLAIMS. "Now is the time", "don't wait", "a rare window" are your words, ` +
  `not facts. Do not pitch. Do not name a person. Do not mention a specific property.\n` +
  `No hype, no exclamation marks, no em-dash-heavy corporate voice. Plain and warm.\n\n` +
  `Return ONLY a JSON object: {"subject": "...", "letter": "...", "next": ["...", "...", "..."]}. ` +
  `Use \\n\\n between the letter's paragraphs. No markdown fences.`;

/** One constrained call → the letter, the three lines, the subject. Best-effort:
 *  any failure returns null and every slot it would have filled stays an OPEN SLOT
 *  (an empty text block is a canvas placeholder and does not exist in the email).
 *
 *  IT IS HANDED NO FIGURE — only the settled sentence naming the area, the user's own
 *  words, and a BOOLEAN. Everything it writes is then run through `auditClaims`
 *  (fail-closed, paragraph-granular). It cannot compare, trend, count, order, or place
 *  a number, because it was never given one to compare, trend, count, order or place. */
export async function authorLetter(opts: {
  place: string | null;
  prompt: string;
  /** False when the lake held no figure for this area — the stat is then an OPEN SLOT
   *  and does not exist in the sent email. A letter that still says "the one number in
   *  this note" points at nothing. Element coherence: the prose ships with the element,
   *  or not at all. (This fires IN scope, not just off it — a SWFL ZIP whose row carries
   *  none of the three priority figures lands here too.) */
  hasNumber: boolean;
}): Promise<LetterProse | null> {
  const settled = settledFacts(opts.place);
  const user =
    (settled.length > 0
      ? `THE ONLY FACT YOU HAVE. You may restate this sentence and nothing beyond it:\n` +
        `"${settled[0].sentence}"\nName that place in the letter.\n\n`
      : `The agent did not name an area. Do not name one.\n\n`) +
    (opts.hasNumber
      ? `A single real market figure IS printed in this email, under your letter. You ` +
        `have NOT been told it and you may not state it, round it, describe it, or say ` +
        `anything about how it compares to anything. Point at it in your closing as "the ` +
        `one number in this note" and invite a reply.\n\n`
      : `THERE IS NO NUMBER IN THIS EMAIL. Do not refer to one, do not promise a figure ` +
        `in this letter. Close on the reply invitation alone.\n\n`) +
    `The agent's own request, verbatim — anything they say about THEMSELVES in it is ` +
    `true and is your only source for who they are:\n"""\n${opts.prompt.slice(0, 1200)}\n"""\n\n` +
    `Write the subject, the letter, and the three lines.`;

  try {
    const msg = await getAnthropic("email_build").messages.create({
      // Prose quality IS the job here — this email is almost entirely voice.
      model: EMAIL_MODEL_SONNET,
      max_tokens: 900,
      system: LETTER_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as Partial<LetterProse>;

    // FAIL-CLOSED on all three surfaces. A violating paragraph / line / subject is
    // DROPPED, never shipped — the slot it leaves is an open slot, not a guess.
    const letter = gateLetterProse(String(parsed.letter ?? ""), settled).slice(0, 2000);
    // 90 is the SCHEMA's cap on a subjectVariants entry (doc/schema.ts) — not a style
    // preference. One character over and EmailDocSchema.safeParse REJECTS the whole
    // built doc in authorDoc, which silently dumps the letter into the free author.
    const subjectRaw = String(parsed.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 90);
    const subject = auditClaims(subjectRaw, settled).length === 0 ? subjectRaw : "";
    const next = (Array.isArray(parsed.next) ? parsed.next : [])
      .map((s) => String(s ?? "").trim())
      .filter((s) => s.length > 0 && auditClaims(s, settled).length === 0)
      .slice(0, 3)
      .map((s) => s.slice(0, 200));

    if (!letter && next.length === 0) return null;
    return { subject, letter, next };
  } catch {
    return null;
  }
}

// ── The coded grid ───────────────────────────────────────────────────────────

/** Reuse the current doc's block of a type — identity/brand is STICKY and lifted
 *  from whatever is on the canvas. We never author a brand. */
function keep(current: EmailDoc, type: EmailBlock["type"]): EmailBlock | null {
  return current.blocks.find((b) => b.type === type) ?? null;
}

/** The agent's portrait, from whichever brand block the canvas happens to carry
 *  (`applyBrand` lands the account's saved `photo_url` on an `agent-card` OR an
 *  `agent-hero`). Absent → "" → the signature simply renders no photo column, and
 *  NOTHING is drawn in its place. We never substitute a stock face. */
export function headshotFrom(current: EmailDoc): string {
  for (const b of current.blocks) {
    if (b.type === "agent-card" || b.type === "agent-hero") {
      const url = (b.props.photoUrl ?? "").trim();
      if (url) return url;
    }
  }
  return "";
}

/**
 * The SIGNATURE card — AND THE LETTER'S ONE AND ONLY PORTRAIT.
 *
 * `AgentCardBlock` is the only component in this codebase that renders a headshot in a
 * way Outlook survives: `width={96}` — the HTML ATTRIBUTE Word's engine actually obeys —
 * inside a real `<Row>`/`<Column>` table, at natural aspect. (Its own comment: "Outlook
 * ignores object-fit, so a fixed height would distort — natural aspect is the only
 * email-safe crop.") The letterhead `image` block this recipe used to carry had no width
 * attribute at all and leaned on `max-width` + `aspect-ratio` + `object-fit`, none of
 * which Outlook implements — and it shipped the SAME face a second time. It is gone.
 *
 * No photo on the canvas → no photo column, and NO placeholder: `AgentCardBlock` renders
 * the column only when it holds a url. That is the open-slot contract at the component
 * level (never a naked box in a sent email), which is exactly why this recipe must not
 * use `agent-hero` — `AgentHeroBlock` does NOT honor `emailRender` and ships a 300px
 * near-black "Agent photo" box to real recipients.
 *
 * A seed's `agent-card` ships INSTRUCTION COPY meant for an empty canvas, and lifting
 * the block wholesale SENDS it to a real recipient (caught in the 07/13 render of this
 * recipe: the sign-off shipped "A short bio that builds trust with your readers.").
 *
 * TITLE AND BIO ARE ACCOUNT-ONLY, AND WE ALWAYS EMIT THEM EMPTY. A factory-default
 * comparison is NOT enough and this is why: `DEFAULT_BLOCK_PROPS["agent-card"].bio` is
 * now `""`, but the `minimal` SEED still carries `title: "Your title and brokerage"` and
 * a placeholder bio of its own — different strings, so a factory check waves them
 * through. Enumerating every seed's placeholder is the banned-word-list mistake in
 * another costume. So: emit both EMPTY. `applyBrand` overwrites them with the account's
 * real AGENT_TITLE / AGENT_BIO whenever the account HAS one (apply-brand.ts:41-42), so
 * nothing real is lost — and when the account has none, `AgentCardBlock` renders nothing
 * at all. A gap stays a gap; it never becomes a template's instruction to a recipient.
 *
 * NAME and PHONE are carried, factory-guarded: a seed sets them to "" or to the HOUSE
 * brand ("SWFL Data Gulf" — never an agent), while a canvas the shell already branded
 * holds the account's REAL name. Neither field is ever prose, so neither can carry an
 * instruction.
 *
 * The CTA is always cleared: this letter has exactly ONE ask, and it is the reply
 * button. A "Get in touch →" link on the signature is a second one.
 */
export function signatureCard(current: EmailDoc): EmailBlock {
  const src = keep(current, "agent-card");
  const prior = src && src.type === "agent-card" ? src.props : {};
  const factory = DEFAULT_BLOCK_PROPS["agent-card"] as Record<string, unknown>;
  const own = (k: "name" | "phone"): string => {
    const v = (prior[k] ?? "").trim();
    return v && v !== factory[k] ? v : "";
  };
  return block("agent-card", {
    photoUrl: headshotFrom(current),
    name: own("name"),
    title: "",
    bio: "",
    phone: own("phone"),
    ctaLabel: "",
    ctaUrl: "",
  });
}

/** The ONE reply destination, from the brand footer already on the canvas
 *  (applyBrand fills it from the account's contact email). A `mailto:` SURVIVES the
 *  post-build brand overlay (apply-brand.ts: an engine-set mailto is never replaced
 *  by the website URL). No address → no button at all: a labelled button with no url
 *  renders as a FAKE button (a styled <Text>), which is a naked CTA. */
export function replyMailtoFrom(current: EmailDoc): string {
  const footer = current.blocks.find((b) => b.type === "footer");
  const email = footer && footer.type === "footer" ? (footer.props.email ?? "").trim() : "";
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? `mailto:${email}` : "";
}

const at = <T extends EmailBlock>(b: T, l: BlockLayout): T => ({ ...b, layout: l });

const block = <K extends EmailBlock["type"]>(
  type: K,
  props: Extract<EmailBlock, { type: K }>["props"],
): EmailBlock => ({ id: createBlock(type).id, type, props }) as EmailBlock;

export async function buildAgentLaunch(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { currentDoc, prompt } = ctx;

  // The area, once, from the door OR the prompt. Null is survivable: the letter
  // still ships and the number becomes an open slot (RULE 0.7 — never refuse).
  const area = areaFor(ctx);

  // The ONE number. Real lake figure or nothing — `loadMarketFigures` is
  // empty-tolerant by contract (no creds / no rows → []), so this degrades to an
  // open slot instead of throwing, and it can never hand back an invented value.
  const figures = area ? await loadMarketFigures({ kind: "zip", value: area.zip }) : [];
  const figure = pickOneFigure(figures);

  // The prose. The narrator sees the place NAME (as a settled sentence), the user's own
  // words, and WHETHER a number exists — never the number itself, so it cannot restate,
  // round, compare, trend or invent it. Its output is then audited fail-closed.
  const prose = await authorLetter({
    place: area?.place ?? null,
    prompt,
    hasNumber: Boolean(figure),
  });

  // ── THE Y CURSOR — ONE COLUMN, ONE BLOCK PER BAND, NO EXCEPTIONS ────────────
  //
  // `groupRows` (lib/email/doc/row-grouping.ts) bands blocks by BAND OVERLAP, not by
  // equal y: a block joins the running row while `y < curBottom`. Lay every block AT
  // the previous block's bottom and no two bands can ever overlap — `groupRows` starts
  // a new row when `y === curBottom` (the test is a strict `<`). One block per row means
  // `compileGrid` NEVER takes its multi-column path, so it never emits an Outlook ghost
  // table or a ghost `<td>` — the markup that broke this recipe twice and that a
  // Chromium screenshot is structurally incapable of showing (see the header).
  //
  // There is deliberately NO `columns()` helper here. Adding one back means adding back
  // the ghost table, and the test will fail the moment you do.
  const blocks: EmailBlock[] = [];
  let y = 0;
  /** Lay a full-width block at the cursor and advance past it. `w` is ALWAYS 12: a lone
   *  block narrower than 12 renders FULL-BLEED in compileGrid anyway, so a w<12 block
   *  makes the canvas lie about what the email sends. */
  const row = (b: EmailBlock, h: number, extra?: Partial<BlockLayout>) => {
    blocks.push(at(b, { x: 0, y, w: 12, h, ...extra }));
    y += h;
  };

  // 1. Header — the agent's own branded header, sticky.
  row(keep(currentDoc, "header") ?? createBlock("header"), 2);

  // 2. THE LETTER. Full width, no portrait beside it and no banner above it: the
  //    agent's face is in the signature (see signatureCard — the one Outlook-safe
  //    portrait renderer we have, and the letter already carried a duplicate of it).
  row(block("text", { body: prose?.letter ?? "", align: "left", paddingY: "lg" }), 7);

  // 3. THE ONE HARD NUMBER — written in CODE from the lake figure, never by the
  //    model, and never a second one beside it. Unsourced → an empty cell: on the
  //    canvas an editable open slot whose label tells the user what to type; in the
  //    sent email StatsBlock drops the cell AND the row (`emailRender`). Never a zero.
  row(
    block("stats", {
      stats: [
        {
          value: (figure?.value ?? "").slice(0, 24),
          label: (figure?.label ?? "The one market number to lead with").slice(0, 60),
        },
      ],
    }),
    3,
  );

  // 4. What happens next — the reader's side of the deal. Leads are WORDS, not a
  //    ranking. Model prose, claim-gated. `items` is min(1) in the schema, so a
  //    letter whose narrator missed simply has no list (never an empty-titled band).
  const LEADS = ["First", "Then", "Every week"];
  const items: ListItem[] = (prose?.next ?? []).map((text, i) => ({
    lead: LEADS[i] ?? "Then",
    text,
  }));
  if (items.length > 0) {
    row(block("list", { title: "What you'll get from me", items }), 4);
  }

  // 5. ONE reply CTA — the whole ask of this letter. Only when we hold a real
  //    address to reply TO (never a naked button).
  const mailto = replyMailtoFrom(currentDoc);
  if (mailto) {
    row(block("button", { label: "Reply and tell me what you're thinking", url: mailto }), 2);
  }

  // 6. The signature — the agent's face, their own values only; the seed's house-brand
  //    placeholder copy never ships (see signatureCard). No CTA on it: ONE ask per letter.
  row(signatureCard(currentDoc), 4);

  // 7. The citation for the one number — collapsed, never inline (the house rule for
  //    every citation surface). Data-seeded: there is no author path into it, so a
  //    send can never show an invented source. No figure → no accordion.
  if (figure) {
    row(
      block("sources", {
        sources: [{ label: `${figure.label} — ${figure.value} (${figure.source})` }],
        note: figure.as_of ? `As of ${figure.as_of}.` : undefined,
      }),
      2,
    );
  }

  // 8. Footer — the agent's CAN-SPAM footer (postal address, socials, unsubscribe).
  row(keep(currentDoc, "footer") ?? createBlock("footer"), 3, { static: true });

  // NO CHART BLOCK IS EVER CREATED. A personal letter is not about a number in the
  // way a chart is — it carries ONE piece of hard evidence and points at it. A
  // cross-SWFL ranking chart landed in exactly this letter, live, on 07/05/2026.

  return {
    // Brand is canonical and sticky — we carry the canvas's style through untouched.
    globalStyle: currentDoc.globalStyle,
    blocks,
    ...(prose?.subject ? { subjectVariants: [prose.subject] } : {}),
  };
}
