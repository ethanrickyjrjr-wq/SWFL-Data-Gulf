// lib/email/voice-presets.ts — VOICE presets for email prose. PURE — no I/O, no React.
//
// The successor to author-recipes.ts (deleted in the one-lane collapse, spec
// 2026-08-02-one-lane-email-recipes-design.md). That registry carried 11 advisory
// ids of two different kinds fused together: 8 TYPE-shaped recipes (what to build —
// "monthly-newsletter", "chart-digest") and 3 EDITORIAL voices (how to sound).
// Types belong to the structural registry (lib/deliverable/recipes.ts) as showcase
// grids — promoted one by one as follow-on builds. Voice is all that stays here.
//
// 08/10/2026 — the editorial trio (letter / showcase / magazine) RETIRED by
// operator decree ("WE WRITE REAL ESTATE EMAILS"). They were refactor survivors,
// carried verbatim through the collapse, and they described STRUCTURE (heroes,
// buttons, columns) — which the one-lane rule says voice must never do. The
// presets are now real-estate AGENT voices, pure sound (test-enforced: no layout
// nouns), each built on the Voice Card (playbook §1.20): the READER is the hero —
// never the agent, never the house. Saved editorial ids degrade to the nearest
// agent voice via the legacy map — never a throw, never a silent vanish.
//
// NO KEYWORD DETECTION, by design: the old detectRecipe() routed builds off prompt
// regexes, which is exactly the two-registry confusion the collapse killed. A voice
// is an EXPLICIT pick (the lab's picker / a saved `preferred_recipe`) or "plain".
//
// HARD CONSTRAINT (test-enforced): preset text contains ZERO digits, so it can
// never collide with the no-invention prose lint or smuggle a figure.

export const VOICE_PRESET_IDS = [
  "plain",
  "neighborhood-agent",
  "luxury-specialist",
  "straight-talk-advisor",
] as const;

export type VoicePresetId = (typeof VOICE_PRESET_IDS)[number];

/** Human labels for the lab's voice picker. Order mirrors VOICE_PRESET_IDS. */
export const VOICE_PRESET_LABELS: Record<VoicePresetId, string> = {
  plain: "Plain",
  "neighborhood-agent": "Neighborhood agent",
  "luxury-specialist": "Luxury specialist",
  "straight-talk-advisor": "Straight-talk advisor",
};

const PRESET_ID_SET: ReadonlySet<string> = new Set(VOICE_PRESET_IDS);

/** True iff `id` names a voice preset. */
export function isVoicePresetId(id: string | null | undefined): id is VoicePresetId {
  return typeof id === "string" && PRESET_ID_SET.has(id);
}

/** Where each of the 11 legacy author-recipe ids lands. The 8 type-shaped ids are
 *  structure, not voice — they degrade to "plain" until each is promoted to a
 *  showcase grid in the structural registry (the promotion queue, spec §E). The 3
 *  retired editorial ids (pre-08/10/2026 saved picks) land on the nearest agent
 *  voice: the personal letter was the warm-local sound, the luxury spotlight was
 *  the luxury sound, and the magazine was structure with no voice of its own. A
 *  saved `preferred_recipe` holding any of these keeps working forever (FM4:
 *  degrade, never throw). */
export const LEGACY_RECIPE_ID_TO_VOICE: Record<string, VoicePresetId> = {
  "agent-intro": "plain",
  "showing-confirmation": "plain",
  "sphere-weekly": "plain",
  "year-in-review": "plain",
  "chart-digest": "plain",
  "chart-story": "plain",
  "infographic-snapshot": "plain",
  "monthly-newsletter": "plain",
  "editorial-letter": "neighborhood-agent",
  "editorial-showcase": "luxury-specialist",
  "editorial-magazine": "plain",
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

// The agent voices — SOUND ONLY (tone, diction, stance). Structure belongs to the
// recipe key and the coded grid; a preset that names a layout element fails the
// no-layout-nouns test. All three obey the Voice Card (§1.20): reader is the
// hero, direct asks, no pressure. "plain" is the empty string: no guidance
// section at all, byte-identical to a no-recipe build. Digit-free by test.
const SECTIONS: Record<VoicePresetId, string> = {
  plain: "",

  "neighborhood-agent":
    "VOICE — NEIGHBORHOOD AGENT (the warm local).\n" +
    "Sound like the agent who actually lives here: first person, plain words, the " +
    "way you'd talk to a neighbor across the fence. Short sentences, first-name " +
    "warmth. Say the neighborhood or community by name where it fits naturally. " +
    "The reader is the hero — what this means for them and their home, never a " +
    "brag about the agent. No hard sell, no pressure; the confidence is quiet and " +
    "familiar. Write to one reader, not a broadcast — it should read like a " +
    "personal note. Close warm, with a single easy question the reader can answer " +
    "by hitting reply.",

  "luxury-specialist":
    "VOICE — LUXURY SPECIALIST (restraint sells).\n" +
    "Understated, assured, unhurried. Say less: exclusivity comes from what is " +
    "intentionally left unsaid. No exclamation points, no hype adjectives, no " +
    "urgency tricks — the property or the fact carries the weight on its own. " +
    "Sentences are composed and even; the tone is a private invitation extended " +
    "to this one reader, not a pitch. Let one telling detail do the work of ten, " +
    "and let the reader feel they were chosen to hear it.",

  "straight-talk-advisor":
    "VOICE — STRAIGHT-TALK ADVISOR (facts first, no fluff).\n" +
    "Plain-spoken and direct. Lead with the fact, then say what it means for the " +
    "reader in the next breath — what they gain, never what the agent can do. Cut " +
    "filler openers, hedges, and hype adjectives; say it once, clearly, fast to " +
    "absorb. Confidence comes from the evidence in front of the reader, never from " +
    "adjectives. The figures already there are the story: talk about what they " +
    "mean, and never pad around them. Ask directly — end with the one thing the " +
    "reader should do or reply with next, no pressure attached.",
};

/** The prose VOICE section for a build's system prompt. "" = no section. */
export function voiceSection(id: VoicePresetId): string {
  return SECTIONS[id];
}
