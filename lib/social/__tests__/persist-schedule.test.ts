import { describe, it, expect } from "bun:test";
import { buildSocialScheduleInsert, freezePost } from "../persist-schedule";
import type { SocialDraft } from "@/lib/email/social-calendar/types";

const draft = {
  day: "mon",
  theme: "Market pulse",
  caption: "Cape Coral median sale price held at $412K.\n\nWhat it means for sellers.",
  hashtags: ["capecoral", "swflrealestate"],
  card: { blocks: [] },
} as unknown as SocialDraft;

describe("freezePost", () => {
  it("captures caption + hashtags + media + freshness verbatim, no invention", () => {
    const f = freezePost(draft, "2026-06-29T12:00:00.000Z", {
      mediaUrl: "https://x/y.png",
      freshnessToken: "SWFL-LEE-20260628",
    });
    expect(f.caption).toBe(draft.caption);
    expect(f.hashtags).toEqual(["capecoral", "swflrealestate"]);
    expect(f.media_url).toBe("https://x/y.png");
    expect(f.freshness_token).toBe("SWFL-LEE-20260628");
    expect(f.composed_at).toBe("2026-06-29T12:00:00.000Z");
  });

  it("media_url is null (never empty string) when no asset", () => {
    const f = freezePost(draft, "2026-06-29T12:00:00.000Z", {});
    expect(f.media_url).toBeNull();
  });
});

describe("buildSocialScheduleInsert", () => {
  it("maps a weekly recipe to the social_schedules column shape, status active", () => {
    const row = buildSocialScheduleInsert({
      userId: "u1",
      projectId: "p1",
      socialAccountId: "acc1",
      platform: "instagram",
      cadence: { cadence: "weekly", day_of_week: 1, day_of_month: null, send_hour_et: 9 },
      scopeKind: "zip",
      scopeValue: "33904",
      hashtags: ["capecoral"],
      mediaKind: "image",
      frozenPost: freezePost(draft, "2026-06-29T12:00:00.000Z", {}),
      signature: "sig-abc",
      nextRunAtIso: "2026-06-30T13:00:00.000Z",
    });
    expect(row.status).toBe("active");
    expect(row.platform).toBe("instagram");
    expect(row.cadence).toBe("weekly");
    expect(row.day_of_week).toBe(1);
    expect(row.day_of_month).toBeNull();
    expect(row.send_hour_et).toBe(9);
    expect(row.scope_value).toBe("33904");
    expect(row.next_run_at).toBe("2026-06-30T13:00:00.000Z");
    expect(row.freshness_gate).toBe(true);
  });
});
