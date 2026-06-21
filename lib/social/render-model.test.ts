import { describe, expect, it } from "bun:test";
import { composedPostToSocialModel } from "./render-model";
import type { ComposedPost, SocialTarget } from "./types";

function makePost(over: Partial<ComposedPost> = {}): ComposedPost {
  return {
    caption: "Fort Myers Beach stays a high-value market.\n\nMedian home value: $482K",
    hashtags: ["#FortMyersBeach", "#SWFLRealEstate"],
    media: [],
    freshness: "SWFL-7421-v5-20260620",
    ...over,
  };
}

function makeTarget(over: Partial<SocialTarget> = {}): SocialTarget {
  return {
    scheduleId: 1,
    userId: "user-abc",
    platform: "linkedin",
    accountId: "acct-1",
    scopeKind: "zip",
    scopeValue: "33931",
    topic: null,
    cadence: "weekly",
    hashtags: ["#FortMyersBeach"],
    contentTemplate: "stat_card",
    freshnessGate: true,
    lastFreshnessToken: null,
    ...over,
  };
}

const NOW = new Date("2026-06-20T14:30:00.000Z");

describe("composedPostToSocialModel", () => {
  it("uses the first double-newline paragraph of the caption as the headline", () => {
    const model = composedPostToSocialModel(makePost(), makeTarget(), NOW);
    expect(model.headline).toBe("Fort Myers Beach stays a high-value market.");
  });

  it("falls back to the whole caption as headline when there is no paragraph break", () => {
    const post = makePost({ caption: "One single line, no break" });
    const model = composedPostToSocialModel(post, makeTarget(), NOW);
    expect(model.headline).toBe("One single line, no break");
  });

  it("emits a stat (label=scopeValue, value=freshness) when the target has a scopeValue", () => {
    const model = composedPostToSocialModel(makePost(), makeTarget(), NOW);
    expect(model.stat).toEqual({ label: "33931", value: "SWFL-7421-v5-20260620" });
  });

  it("omits the stat when the target has no scopeValue (whole region)", () => {
    const target = makeTarget({ scopeKind: null, scopeValue: null });
    const model = composedPostToSocialModel(makePost(), target, NOW);
    expect(model.stat).toBeUndefined();
  });

  it("carries the post freshness as freshness_token", () => {
    const model = composedPostToSocialModel(makePost(), makeTarget(), NOW);
    expect(model.freshness_token).toBe("SWFL-7421-v5-20260620");
  });

  it("builds source as scopeKind:scopeValue when both are present", () => {
    const model = composedPostToSocialModel(makePost(), makeTarget(), NOW);
    expect(model.source).toBe("zip:33931");
  });

  it("builds source as region:swfl when scope is the whole region", () => {
    const target = makeTarget({ scopeKind: null, scopeValue: null });
    const model = composedPostToSocialModel(makePost(), target, NOW);
    expect(model.source).toBe("region:swfl");
  });

  it("falls back source to region:<value> when scopeKind is null but scopeValue is present", () => {
    const target = makeTarget({ scopeKind: null, scopeValue: "naples" });
    const model = composedPostToSocialModel(makePost(), target, NOW);
    expect(model.source).toBe("region:naples");
    expect(model.stat).toEqual({ label: "naples", value: "SWFL-7421-v5-20260620" });
  });

  it("sets as_of to the YYYY-MM-DD slice of now", () => {
    const model = composedPostToSocialModel(makePost(), makeTarget(), NOW);
    expect(model.as_of).toBe("2026-06-20");
  });
});
