// lib/email/voice-presets.test.ts
//
// The surviving invariants of the killed advisory registry (author-recipes.ts),
// carried onto the voice presets that replaced it (one-lane collapse, spec
// 2026-08-02): digit-free guidance (can never collide with the no-invention
// lint), explicit-pick-wins with graceful degradation for stale stored ids
// (FM4), and — the point of the fold — NO keyword detection anywhere.

import { describe, expect, test } from "bun:test";
import {
  VOICE_PRESET_IDS,
  VOICE_PRESET_LABELS,
  voiceSection,
  resolveVoice,
  LEGACY_RECIPE_ID_TO_VOICE,
} from "./voice-presets";

describe("voice presets — the surviving invariants of author-recipes", () => {
  test("every preset's guidance contains ZERO digits", () => {
    for (const id of VOICE_PRESET_IDS) expect(voiceSection(id)).not.toMatch(/\d/);
  });

  test("plain is the empty preset — byte-identical to a no-recipe build", () => {
    expect(voiceSection("plain")).toBe("");
  });

  test("every preset has a label for the picker", () => {
    for (const id of VOICE_PRESET_IDS) {
      expect(typeof VOICE_PRESET_LABELS[id]).toBe("string");
      expect(VOICE_PRESET_LABELS[id].length).toBeGreaterThan(0);
    }
  });

  test("explicit pick wins; unknown/stale ids degrade to plain, never throw (FM4)", () => {
    expect(resolveVoice("neighborhood-agent")).toBe("neighborhood-agent");
    expect(resolveVoice("luxury-specialist")).toBe("luxury-specialist");
    expect(resolveVoice("straight-talk-advisor")).toBe("straight-talk-advisor");
    expect(resolveVoice("monthly-newsletter")).toBe("plain"); // type-shaped: promoted later
    expect(resolveVoice("chart-digest")).toBe("plain");
    expect(resolveVoice("not-a-recipe")).toBe("plain");
    expect(resolveVoice(null)).toBe("plain");
    expect(resolveVoice(undefined)).toBe("plain");
    expect(resolveVoice("")).toBe("plain");
  });

  test("retired editorial ids saved in brand blobs land on the nearest agent voice (FM2)", () => {
    // The editorial presets were refactor survivors, replaced 08/10/2026 by
    // operator decree with real-estate agent voices. A user who saved one keeps
    // the closest agent voice — never a throw, never a silent vanish.
    expect(resolveVoice("editorial-letter")).toBe("neighborhood-agent"); // warm personal note
    expect(resolveVoice("editorial-showcase")).toBe("luxury-specialist"); // luxury spotlight
    expect(resolveVoice("editorial-magazine")).toBe("plain"); // structure, not voice
  });

  test("voice is SOUND, never structure — no layout nouns in any preset (FM3)", () => {
    // The killed editorial presets described heroes, buttons, and columns —
    // structure, which the one-lane collapse says belongs to the recipe key
    // alone. An agent voice may only speak about tone and wording.
    // "hero" alone is allowed — the Voice Card's "the reader is the hero" is
    // voice, not layout; the layout noun is the two-word "hero image".
    const structural =
      /\b(blocks?|buttons?|hero image|images?|columns?|bands?|footers?|unsubscribe|cards?|mastheads?|overlay|sections?|whitespace|canvas|layout)\b/i;
    for (const id of VOICE_PRESET_IDS) {
      expect(voiceSection(id)).not.toMatch(structural);
    }
  });

  test("every non-plain preset opens with its VOICE header", () => {
    for (const id of VOICE_PRESET_IDS) {
      if (id === "plain") continue;
      expect(voiceSection(id).startsWith("VOICE — ")).toBe(true);
    }
  });

  test("every one of the 11 legacy advisory ids has an explicit landing spot", () => {
    const legacy = [
      "agent-intro",
      "showing-confirmation",
      "sphere-weekly",
      "year-in-review",
      "chart-digest",
      "chart-story",
      "infographic-snapshot",
      "monthly-newsletter",
      "editorial-letter",
      "editorial-showcase",
      "editorial-magazine",
    ];
    for (const id of legacy) {
      expect(
        LEGACY_RECIPE_ID_TO_VOICE[id],
        `legacy id "${id}" has no mapped voice preset`,
      ).toBeDefined();
    }
  });

  test("there is NO keyword detection export", async () => {
    const mod = await import("./voice-presets");
    expect("detectRecipe" in mod).toBe(false);
    expect("resolveRecipe" in mod).toBe(false);
  });
});
