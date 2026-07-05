import { describe, it, expect } from "bun:test";
import { liveCampaigns, COMING_TILES, campaignFollowUpForPrompt } from "./campaigns";
import { CADENCE_COLORS, CADENCE_ORDER } from "./campaigns/cadence-colors";
import { SHOWCASES } from "./showcase/registry";
import { findPlaceholder, NEED_LABELS } from "./showcase/recipe";
import { LISTING_LAUNCH_ARC, DAY_THEMES } from "./email/social-calendar/themes";

/**
 * Quick-start campaigns ride the showcase registry — a live campaign that can't
 * resolve to a real showcase + recipe must be a red test here, never a broken
 * button in prod.
 */
describe("quick-start campaigns", () => {
  it("every live campaign resolves to its backing showcase", () => {
    for (const { showcase, campaign } of liveCampaigns("all")) {
      expect(showcase.campaign).toBe(campaign);
      expect(campaign.status).toBe("live");
      expect(campaign.label.length).toBeGreaterThan(0);
      expect(campaign.blurb.length).toBeGreaterThan(0);
    }
  });

  it("campaign keys are unique", () => {
    const keys = liveCampaigns("all").map((c) => c.campaign.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("surface filter keys off the campaign surface, not showcase.surfaces", () => {
    // market-pulse + launch-blitz are both email+social showcases, but each is
    // exactly ONE campaign button — the filter must not double-list them.
    const email = liveCampaigns("email");
    const social = liveCampaigns("social");
    expect(email.every((c) => c.campaign.surface === "email")).toBe(true);
    expect(social.every((c) => c.campaign.surface === "social")).toBe(true);
    expect(email.length + social.length).toBe(liveCampaigns("all").length);
    // The social campaign never leaks into the email row.
    expect(email.some((c) => c.campaign.key === "new-listing-socials")).toBe(false);
  });

  it("email campaigns carry a one-blank recipe; social campaigns carry none", () => {
    for (const { campaign } of liveCampaigns("all")) {
      if (campaign.surface === "email") {
        const r = campaign.seedRecipe;
        expect(r, `${campaign.key} needs a seedRecipe`).toBeDefined();
        const blanks = r!.prompt.match(/\[\[[^\]]+\]\]/g) ?? [];
        expect(blanks.length, `${campaign.key} blanks`).toBe(1);
        expect(findPlaceholder(r!.prompt)).not.toBeNull();
        expect(r!.needs.length).toBeGreaterThan(0);
        for (const need of r!.needs) expect(NEED_LABELS[need]).toBeDefined();
      } else {
        // Social campaigns create a project + buildWeek, not a recipe hand-off.
        expect(campaign.seedRecipe, `${campaign.key} must omit seedRecipe`).toBeUndefined();
      }
    }
  });

  it("coming tiles are well-formed and distinct from live campaigns", () => {
    const liveLabels = new Set(liveCampaigns("all").map((c) => c.campaign.label));
    for (const t of COMING_TILES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
      expect(liveLabels.has(t.label)).toBe(false);
    }
  });
});

describe("cadence colors + refresh legend", () => {
  it("covers every Cadence value", () => {
    for (const c of CADENCE_ORDER) {
      const color = CADENCE_COLORS[c];
      expect(color.bg.length).toBeGreaterThan(0);
      expect(color.fg.length).toBeGreaterThan(0);
      expect(color.label.length).toBeGreaterThan(0);
    }
    // CADENCE_ORDER and CADENCE_COLORS keys agree exactly.
    expect([...CADENCE_ORDER].sort()).toEqual(Object.keys(CADENCE_COLORS).sort());
  });

  it("every showcase cadenceRefresh key is a real Cadence", () => {
    const valid = new Set<string>(CADENCE_ORDER);
    for (const s of SHOWCASES) {
      if (!s.cadenceRefresh) continue;
      for (const k of Object.keys(s.cadenceRefresh)) {
        expect(valid.has(k), `${s.id} bad cadence key ${k}`).toBe(true);
        expect(s.cadenceRefresh[k as keyof typeof s.cadenceRefresh]!.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("listing-launch arc", () => {
  it("covers every weekday theme, once", () => {
    expect(LISTING_LAUNCH_ARC.length).toBe(DAY_THEMES.length);
    for (const a of LISTING_LAUNCH_ARC) {
      expect(a.stage.length).toBeGreaterThan(0);
      expect(a.addendum.length).toBeGreaterThan(0);
    }
    const stages = LISTING_LAUNCH_ARC.map((a) => a.stage);
    expect(new Set(stages).size).toBe(stages.length);
  });
});

describe("campaignFollowUpForPrompt", () => {
  it("returns null for a non-campaign prompt", () => {
    expect(campaignFollowUpForPrompt("build me anything")).toBe(null);
  });

  it("returns the followUp when the prompt IS a campaign seed carrying one", () => {
    // Guarded until the agent-launch entry lands (task 9) — helper must be total.
    const withFollowUp = SHOWCASES.find((s) => s.campaign?.followUp && s.campaign.seedRecipe);
    if (withFollowUp?.campaign?.seedRecipe && withFollowUp.campaign.followUp) {
      const r = campaignFollowUpForPrompt(withFollowUp.campaign.seedRecipe.prompt);
      expect(r?.label).toBe(withFollowUp.campaign.followUp.label);
      expect(r?.key).toBe(withFollowUp.campaign.key);
      expect(r?.recipe.prompt.length).toBeGreaterThan(0);
    }
  });

  it("a campaign seed WITHOUT a followUp returns null", () => {
    const noFollow = SHOWCASES.find((s) => s.campaign?.seedRecipe && !s.campaign.followUp);
    if (noFollow?.campaign?.seedRecipe) {
      expect(campaignFollowUpForPrompt(noFollow.campaign.seedRecipe.prompt)).toBe(null);
    }
  });
});
