// lib/deliverable/recipes/agent-launch.ts
//
// R9 · AGENT LAUNCH — "THE LETTER".
//
// A personal letter, not a flyer. There is NO listing subject here: the spine is
// the AGENT plus their farm area. The five listing recipes are one resolved house
// wearing different hats; this one is not a hat on that house at all, and forcing
// the flyer on it is the mistake this file exists to avoid.
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
//   2. SKELETON — a CODED grid, built here, the way `buildListingFlyer` is coded.
//      No committed SEED_DOC fits: the closest, `stay-in-touch`, opens with a
//      FULL-WIDTH `agent-hero` banner — the photo ABOVE the letter, which is the
//      exact failure this recipe names. `editorial-letter` has the right voice but
//      is linear (no `layout`), so it can never put the photo BESIDE anything.
//   3. CELLS — exactly ONE: the single market figure, written in CODE from a real
//      lake figure (value · source · as-of). Unsourced → an open stat cell whose
//      LABEL is the instruction (canvas affordance; StatsBlock drops it, and the
//      whole row, on `emailRender`). Never a zero.
//   4. CHART — NONE. Declared on the key; a personal letter carrying a cross-SWFL
//      ranking chart shipped live on 07/05/2026. We never CREATE a chart block, so
//      there is nothing for a later pass to fill: authorDoc's `resolvedRecipe !==
//      "agent-intro"` chart suppression is upstream of us and we do not undo it.
//   5. PROSE — the model writes the letter, three "what happens next" lines, and one
//      subject line. It is handed NO figures (so it cannot restate one) and is
//      forbidden any specific biography it was not given. Its output is then
//      DIGIT-LINTED: any sentence carrying a digit is dropped, because a number in
//      the letter is by construction a number we never gave it.
//   6. FRAMING — letterhead portrait beside the letter · one cited number · a short
//      numbered what-happens-next · ONE reply CTA (a real `mailto:`) · signature card.
//
// THE HEADSHOT IS AN OPEN SLOT. `typableGaps` (lib/showcase/recipe.ts) deliberately
// filters `photo_url` out of the ask-before-build popup — a headshot cannot be typed
// into a text field — so the brand popup NEVER collects it. The portrait is therefore
// an `image` block: filled when the canvas doc already carries an agent photo, and
// otherwise an OPEN SLOT (ImageBlock renders the file-picker on the canvas and
// returns null on `emailRender`, so it never reaches a recipient).
//
// NOT `agent-hero`, which the agent-intro prose recipe suggests: AgentHeroBlock does
// NOT honor `emailRender` and ships a 300px near-black "Agent photo" placeholder box
// to real recipients when the photo is missing. That is a naked placeholder in a sent
// email — the one thing the open-slot contract forbids.

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { loadMarketFigures, type MarketFigure } from "@/lib/email/market-context";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { createBlock, DEFAULT_BLOCK_PROPS } from "@/lib/email/doc/default-docs";
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

// ── The prose (the model writes THIS and nothing else) ───────────────────────

export interface LetterProse {
  subject: string;
  letter: string;
  next: string[];
}

/** Strip every sentence carrying a digit.
 *
 *  The narrator is handed ZERO figures, so a digit in its output is, by
 *  construction, a number it was never given — i.e. invented. This is the
 *  `gateNarrative` philosophy applied at the one place it can bite: the letter.
 *  Paragraph breaks survive; a paragraph that loses every sentence disappears. */
export function dropDigitSentences(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split(/(?<=[.!?])\s+/)
        .filter((s) => !/\d/.test(s))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
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
  `why you do this work HERE, in this place. Close by pointing at the number below ` +
  `and inviting a reply. End on a complete thought. No sign-off name.\n` +
  `3. "next" — exactly three lines saying what the READER gets from now on. Each is ` +
  `phrased as what THEY receive, never as what you will do. Under 140 characters each.\n\n` +
  `ABSOLUTE RULES.\n` +
  `NO NUMBERS. Not one digit, anywhere — no prices, no percentages, no years, no ` +
  `counts, no dates. You have not been given a single figure and you may not produce ` +
  `one. The email carries exactly ONE number and the system already placed it; your ` +
  `job is to point at it in words ("the number below", "what a home here is actually ` +
  `worth right now"), never to state it.\n` +
  `NEVER DESCRIBE THE EMAIL'S LAYOUT. You do not know how it renders, what sits next ` +
  `to what, or whether a photo is even there — say "below", never "beside my photo", ` +
  `"above", "to the left", "attached", or "in the chart". You write prose; the system ` +
  `owns the page.\n` +
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
 *  Never invents — it is handed no figures at all, and digit-linted after. */
export async function authorLetter(opts: {
  place: string | null;
  prompt: string;
  /** False when the lake held no figure for this area — the stat is then an OPEN SLOT
   *  and does not exist in the sent email. A letter that still says "the number below"
   *  points at nothing. Element coherence: the prose ships with the element, or not at
   *  all. (This fires IN scope, not just off it — a SWFL ZIP whose row carries none of
   *  the three priority figures lands here too.) */
  hasNumber: boolean;
}): Promise<LetterProse | null> {
  const user =
    (opts.place
      ? `The agent's farm area is ${opts.place}, in Southwest Florida. Name it in the letter.\n\n`
      : `The agent did not name an area. Do not name one.\n\n`) +
    (opts.hasNumber
      ? `A single real market figure IS printed below your letter. Point at it ("the ` +
        `number below") in your closing. Never state it — you have not been told it.\n\n`
      : `THERE IS NO NUMBER IN THIS EMAIL. Do not refer to one, do not say "the number ` +
        `below", do not promise a figure in this letter. Close on the reply invitation ` +
        `alone.\n\n`) +
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

    const letter = dropDigitSentences(String(parsed.letter ?? "")).slice(0, 2000);
    // 90 is the SCHEMA's cap on a subjectVariants entry (doc/schema.ts) — not a style
    // preference. One character over and EmailDocSchema.safeParse REJECTS the whole
    // built doc in authorDoc, which silently dumps the letter into the free author.
    const subject = String(parsed.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 90);
    const next = (Array.isArray(parsed.next) ? parsed.next : [])
      .map((s) => String(s ?? "").trim())
      .filter((s) => s && !/\d/.test(s))
      .slice(0, 3)
      .map((s) => s.slice(0, 200));

    if (!letter && next.length === 0) return null;
    return { subject: /\d/.test(subject) ? "" : subject, letter, next };
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

/**
 * The SIGNATURE card.
 *
 * A seed's `agent-card` ships the HOUSE-BRAND default props ("SWFL Data Gulf", "A
 * short bio that builds trust with your readers.", "Get in touch") — instruction copy
 * meant for an empty canvas. Lifting the block wholesale SENDS that placeholder bio to
 * a real recipient (caught in the 07/13 render of this recipe: the sign-off shipped
 * "A short bio that builds trust with your readers."). So we carry only values that
 * are the USER'S, and drop any that are still the factory default — an empty field is
 * an open slot `applyBrand` fills from the account (AGENT_NAME / AGENT_TITLE /
 * AGENT_BIO) and that AgentCardBlock simply does not render.
 *
 * The CTA is always cleared: this letter has exactly ONE ask, and it is the reply
 * button. A "Get in touch →" link on the signature is a second one.
 */
export function signatureCard(current: EmailDoc): EmailBlock {
  const src = keep(current, "agent-card");
  const prior = src && src.type === "agent-card" ? src.props : {};
  const factory = DEFAULT_BLOCK_PROPS["agent-card"] as Record<string, unknown>;
  const own = (k: "name" | "title" | "bio" | "phone"): string => {
    const v = (prior[k] ?? "").trim();
    return v && v !== factory[k] ? v : "";
  };
  return block("agent-card", {
    photoUrl: (prior.photoUrl ?? "").trim(),
    name: own("name"),
    title: own("title"),
    bio: own("bio"),
    phone: own("phone"),
    ctaLabel: "",
    ctaUrl: "",
  });
}

/** The agent's portrait, if the canvas doc already carries one (applyBrand lands
 *  the account's saved `photo_url` on an `agent-card` / `agent-hero`). Absent →
 *  "" → an OPEN SLOT with a file picker. We never substitute a stock face. */
export function headshotFrom(current: EmailDoc): string {
  for (const b of current.blocks) {
    if (b.type === "agent-card" || b.type === "agent-hero") {
      const url = (b.props.photoUrl ?? "").trim();
      if (url) return url;
    }
  }
  return "";
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

  // The prose. The narrator sees the place NAME, the user's own words, and WHETHER a
  // number exists — never the number itself, so it cannot restate, round, or invent it.
  const prose = await authorLetter({
    place: area?.place ?? null,
    prompt,
    hasNumber: Boolean(figure),
  });

  // ── THE Y CURSOR — why this recipe does not hardcode a single y ─────────────
  //
  // `groupRows` (lib/email/doc/row-grouping.ts) bands blocks by BAND OVERLAP, not by
  // equal y: a block joins the running row while `y < curBottom`. So a row is not
  // "the blocks with the same y" — it is "the blocks whose bands touch". Hardcoded
  // absolute y's therefore only stay correct while every block above them keeps its
  // exact height, and this recipe has TWO branches with different letter heights.
  //
  // THE BUG THIS REPLACES (refuted 07/13, real, in the SENT html): the no-headshot
  // branch put the letter at {y:7,h:7} = band 7..14 but left the constants below it
  // at their WITH-headshot values — stats {y:9}, list {y:12}. Both fall INSIDE 7..14,
  // so the letter swallowed them: one row of [text(w12) | stats(w12) | list(w12)],
  // w summing to 36 in a 12-column grid. compileGrid dutifully emitted
  // `<table width="1800">` with three `<td width="600">` into the Outlook ghost
  // table — a 1800px three-column strip, 3x past the 600px container. Chromium
  // strips mso conditional comments (they are HTML comments), so the screenshot that
  // "passed" was STRUCTURALLY INCAPABLE of showing it. Outlook obeys the ghost table.
  //
  // A cursor makes the whole class of defect unreachable: each row is laid at the
  // previous row's bottom, so no band can ever overlap the next. `groupRows` starts a
  // new row when `y === curBottom` (the test is strict `<`), which is exactly what a
  // cursor produces. Conditional blocks (button, list, sources) now cost nothing when
  // absent instead of leaving a hole, and the next person to change a height cannot
  // reintroduce this. Enforced in the test by running the REAL grouper over the built
  // doc and asserting every row's widths sum to <= 12 (GRID_COLS).
  const blocks: EmailBlock[] = [];
  let y = 0;
  /** Lay a block at the cursor and advance past it — the ONLY way a full-width band
   *  is added. `w` stays 12 unless a genuine column row says otherwise. */
  const row = (b: EmailBlock, h: number, extra?: Partial<BlockLayout>) => {
    blocks.push(at(b, { x: 0, y, w: 12, h, ...extra }));
    y += h;
  };
  /** A TRUE side-by-side row: two blocks in ONE band, x's tiled, w's summing to 12. */
  const columns = (left: EmailBlock, lw: number, right: EmailBlock, h: number) => {
    blocks.push(at(left, { x: 0, y, w: lw, h }));
    blocks.push(at(right, { x: lw, y, w: 12 - lw, h }));
    y += h;
  };

  // 1. Header — the agent's own branded header, sticky.
  row(keep(currentDoc, "header") ?? createBlock("header"), 2);

  // 2. THE LETTERHEAD ROW — the portrait sits BESIDE the letter, never above it.
  //    Same y-band, so `groupRows` compiles them as true side-by-side columns in the
  //    email HTML (Cerberus hybrid ghost table) and as a flex row in the PDF.
  //
  //    ...but ONLY when we actually hold a portrait. THE CANVAS AND THE EMAIL DISAGREE
  //    ABOUT AN OPEN SLOT, and the layout has to answer to both. An empty `image`
  //    correctly renders as nothing in the email (ImageBlock → null on `emailRender`)
  //    — but compile-grid still emits its 250px ghost column, so the letter shipped
  //    squeezed into the right half beside a dead white void (SEEN in the 07/13
  //    render; it reads as broken). So: no portrait → no two-column row. The slot
  //    stands alone (a canvas dropzone; a single-block row that renders to nothing in
  //    the email) and the letter takes the full width.
  //
  //    The label IS the instruction (lib/email/CLAUDE.md, THE SLOT RULE): ImageBlock
  //    renders an empty slot as "Add the photo — your headshot" over a file picker.
  //    `typableGaps` (lib/showcase/recipe.ts) deliberately filters `photo_url` out of
  //    the ask-before-build popup — a headshot cannot be typed into a text field — so
  //    THIS SLOT IS THE ONLY PLACE the user is ever asked for it.
  const headshot = headshotFrom(currentDoc);
  const photo = block("image", {
    url: headshot,
    alt: headshot ? "Your agent" : "your headshot",
    kind: "photo",
    ratio: "4:5",
  });
  const letter = block("text", { body: prose?.letter ?? "", align: "left", paddingY: "lg" });
  if (headshot) {
    // ONE band, two columns: 5 + 7 = 12. The ghost table gets td 250 + 350 = 600px.
    columns(photo, 5, letter, 7);
  } else {
    // TWO bands, each its own row. The empty slot is a canvas dropzone that renders to
    // nothing in the email; the letter then takes the full width beneath it.
    row(photo, 5, { w: 5 });
    row(letter, 7);
  }

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
  //    ranking. Model prose, digit-linted. `items` is min(1) in the schema, so a
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

  // 6. The signature — the user's own values only; the seed's house-brand placeholder
  //    copy never ships (see signatureCard). No CTA on it: ONE ask per letter.
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
