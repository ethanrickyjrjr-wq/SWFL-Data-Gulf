// lib/brand/profile-ledger.test.ts
import { describe, expect, it } from "bun:test";
import {
  MUST_KEYS,
  PROFILE_FIELD_KEYS,
  completenessSummary,
  profileGaps,
  typableProfileGaps,
} from "./profile-ledger";

describe("profile-ledger", () => {
  it("must tier is exactly the CAN-SPAM three", () => {
    expect([...MUST_KEYS].sort()).toEqual(["agent_name", "brokerage", "business_address"].sort());
  });

  it("registry covers every account-profile key the brand API allowlists", () => {
    // Pinned copy of app/api/user/brand/route.ts allowlists. If the API grows a
    // field, this test forces the ledger (the one authority) to grow with it.
    const apiKeys = [
      "agent_name",
      "nickname",
      "agent_title",
      "photo_url",
      "license",
      "brokerage",
      "agent_bio",
      "primary_color",
      "accent_color",
      "text_color",
      "background_color",
      "surface_color",
      "surface_dark_color",
      "logo_url",
      "font_display",
      "font_body",
      "instagram_url",
      "facebook_url",
      "linkedin_url",
      "x_url",
      "tiktok_url",
      "youtube_url",
      "pinterest_url",
      "threads_url",
      "unsubscribe_url",
      "business_address",
      "contact_email",
      "contact_phone",
      "website_url",
      "preferred_recipe",
      "default_photo_ratio",
    ];
    expect([...PROFILE_FIELD_KEYS].sort()).toEqual([...apiKeys].sort());
  });

  it("profileGaps: blank, whitespace, and missing are gaps; filled is not", () => {
    const gaps = profileGaps(
      { agent_name: "Marisol Vega", brokerage: "  ", business_address: null },
      ["agent_name", "brokerage", "business_address"],
    );
    expect(gaps.map((g) => g.key)).toEqual(["brokerage", "business_address"]);
  });

  it("profileGaps with no needs returns every blank field, registry order", () => {
    const gaps = profileGaps({});
    expect(gaps.length).toBe(PROFILE_FIELD_KEYS.length);
    expect(gaps[0].key).toBe(PROFILE_FIELD_KEYS[0]);
  });

  it("typableProfileGaps drops photo_url (upload, not typable)", () => {
    const gaps = typableProfileGaps({}, ["agent_name", "photo_url"]);
    expect(gaps.map((g) => g.key)).toEqual(["agent_name"]);
  });

  it("unknown needs keys are ignored, never invented", () => {
    expect(profileGaps({}, ["not_a_field"])).toEqual([]);
  });

  it("completenessSummary counts and buckets gaps by tier", () => {
    const s = completenessSummary({ agent_name: "Marisol Vega" });
    expect(s.total).toBe(PROFILE_FIELD_KEYS.length);
    expect(s.filled).toBe(1);
    expect(s.must.map((g) => g.key).sort()).toEqual(["brokerage", "business_address"].sort());
    expect(s.must.every((g) => g.askCopy && g.askCopy.length > 0)).toBe(true);
  });

  it("completenessSummary: a full profile has zero gaps in every tier", () => {
    const full = Object.fromEntries(PROFILE_FIELD_KEYS.map((k) => [k, "x"]));
    const s = completenessSummary(full);
    expect(s.filled).toBe(s.total);
    expect(s.must).toEqual([]);
    expect(s.boost).toEqual([]);
    expect(s.nice).toEqual([]);
  });
});
