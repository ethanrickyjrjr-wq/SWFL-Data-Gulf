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
    expect(resolveVoice("editorial-letter")).toBe("editorial-letter");
    expect(resolveVoice("editorial-showcase")).toBe("editorial-showcase");
    expect(resolveVoice("editorial-magazine")).toBe("editorial-magazine");
    expect(resolveVoice("monthly-newsletter")).toBe("plain"); // type-shaped: promoted later
    expect(resolveVoice("chart-digest")).toBe("plain");
    expect(resolveVoice("not-a-recipe")).toBe("plain");
    expect(resolveVoice(null)).toBe("plain");
    expect(resolveVoice(undefined)).toBe("plain");
    expect(resolveVoice("")).toBe("plain");
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
