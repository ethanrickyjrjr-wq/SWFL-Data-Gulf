// lib/email/voice-presets.ts — VOICE presets for email prose. PURE — no I/O, no React.
//
// The successor to author-recipes.ts (deleted in the one-lane collapse, spec
// 2026-08-02-one-lane-email-recipes-design.md). That registry carried 11 advisory
// ids of two different kinds fused together: 8 TYPE-shaped recipes (what to build —
// "monthly-newsletter", "chart-digest") and 3 EDITORIAL voices (how to sound).
// Types belong to the structural registry (lib/deliverable/recipes.ts) as showcase
// grids — promoted one by one as follow-on builds. Voice is all that stays here.
//
// NO KEYWORD DETECTION, by design: the old detectRecipe() routed builds off prompt
// regexes, which is exactly the two-registry confusion the collapse killed. A voice
// is an EXPLICIT pick (the lab's picker / a saved `preferred_recipe`) or "plain".
//
// HARD CONSTRAINT (test-enforced): preset text contains ZERO digits, so it can
// never collide with the no-invention prose lint or smuggle a figure.

export const VOICE_PRESET_IDS = [
  "plain",
  "editorial-letter",
  "editorial-showcase",
  "editorial-magazine",
] as const;

export type VoicePresetId = (typeof VOICE_PRESET_IDS)[number];

/** Human labels for the lab's voice picker. Order mirrors VOICE_PRESET_IDS. */
export const VOICE_PRESET_LABELS: Record<VoicePresetId, string> = {
  plain: "Plain",
  "editorial-letter": "Editorial letter",
  "editorial-showcase": "Editorial showcase",
  "editorial-magazine": "Magazine issue",
};

const PRESET_ID_SET: ReadonlySet<string> = new Set(VOICE_PRESET_IDS);

/** True iff `id` names a voice preset. */
export function isVoicePresetId(id: string | null | undefined): id is VoicePresetId {
  return typeof id === "string" && PRESET_ID_SET.has(id);
}

/** Where each of the 11 legacy author-recipe ids lands. The 3 editorial ids ARE
 *  voices and map to themselves; the 8 type-shaped ids are structure, not voice —
 *  they degrade to "plain" until each is promoted to a showcase grid in the
 *  structural registry (the promotion queue, spec §E). A saved `preferred_recipe`
 *  holding any of these keeps working forever (FM4: degrade, never throw). */
export const LEGACY_RECIPE_ID_TO_VOICE: Record<string, VoicePresetId> = {
  "agent-intro": "plain",
  "showing-confirmation": "plain",
  "sphere-weekly": "plain",
  "year-in-review": "plain",
  "chart-digest": "plain",
  "chart-story": "plain",
  "infographic-snapshot": "plain",
  "monthly-newsletter": "plain",
  "editorial-letter": "editorial-letter",
  "editorial-showcase": "editorial-showcase",
  "editorial-magazine": "editorial-magazine",
};

/** Resolve a voice for a build: an explicit pick wins; a legacy stored id lands
 *  on its mapped preset; anything unknown/empty is "plain". Never throws — a
 *  stale saved value can never break a build (FM4). NO keyword detection. */
export function resolveVoice(explicit: string | null | undefined): VoicePresetId {
  if (isVoicePresetId(explicit)) return explicit;
  if (typeof explicit === "string" && explicit in LEGACY_RECIPE_ID_TO_VOICE) {
    return LEGACY_RECIPE_ID_TO_VOICE[explicit];
  }
  return "plain";
}

// The editorial family's prose guidance, moved VERBATIM from author-recipes.ts
// (digit-free by test there, and still by test here). "plain" is the empty string:
// no guidance section at all, byte-identical to a no-recipe build.
const SECTIONS: Record<VoicePresetId, string> = {
  plain: "",

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

/** The prose VOICE section for a build's system prompt. "" = no section. */
export function voiceSection(id: VoicePresetId): string {
  return SECTIONS[id];
}
