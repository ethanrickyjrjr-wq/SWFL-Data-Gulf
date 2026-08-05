// lib/brand/profile-ledger.test.ts
import { describe, expect, it } from "bun:test";
import {
  MUST_KEYS,
  PREFILL_KEYS,
  PROFILE_FIELDS,
  PROFILE_FIELD_KEYS,
  SCORED_KEYS,
  completenessSummary,
  profileGaps,
  typableProfileGaps,
} from "./profile-ledger";

// ── FM 9: `owner` gates SCORING, not just rendering ──────────────────────────
//
// The defect the first pass of the spec would have shipped. `company_name` is a
// TEXT column, so `valueType` — FM 1's entire guard — cannot exclude it. Without
// an owner gate, registering it moves every account's Brand panel strip from
// "n of 31" to "n of 32" and starts prefilling it into the lab grid mount.
//
// Spec: docs/superpowers/specs/2026-08-05-brand-field-registry-authority-design.md
describe("profile-ledger — owner gates scoring (FM 9)", () => {
  it("a non-brand-editor text field does not change completenessSummary().total", () => {
    // company_name is registered (owner: prospect-enrichment) and IS text — so
    // only the owner gate can keep it out of the denominator.
    const companyName = PROFILE_FIELDS.find((s) => s.key === "company_name");
    expect(companyName).toBeDefined();
    expect(companyName?.valueType).toBe("text");
    expect(companyName?.owner).toBe("prospect-enrichment");

    const total = completenessSummary({}).total;
    expect(total).toBe(PROFILE_FIELDS.filter((s) => s.owner === "brand-editor").length);
    expect(total).toBeLessThan(PROFILE_FIELDS.length);
  });

  it("a non-brand-editor field never enters PREFILL_KEYS", () => {
    expect(PREFILL_KEYS).not.toContain("company_name");
    for (const key of PREFILL_KEYS) {
      expect(PROFILE_FIELDS.find((s) => s.key === key)?.owner).toBe("brand-editor");
    }
  });

  it("a non-brand-editor field is never reported as a gap", () => {
    expect(profileGaps({}).map((s) => s.key)).not.toContain("company_name");
    expect(typableProfileGaps({}).map((s) => s.key)).not.toContain("company_name");
  });

  // THE BEHAVIOR-PRESERVATION PIN. Every other test in this build edits a
  // surface; this is the only one proving no live account's numbers moved. All
  // 31 fields registered before this build are brand-editor, so the correct
  // post-migration scored set is byte-identical to the pre-migration one.
  it("the 31 fields scored before this build score exactly the same after it", () => {
    const PRE_MIGRATION_SCORED = [
      "agent_name",
      "brokerage",
      "business_address",
      "photo_url",
      "agent_title",
      "license",
      "contact_phone",
      "contact_email",
      "website_url",
      "agent_bio",
      "nickname",
      "logo_url",
      "primary_color",
      "accent_color",
      "text_color",
      "background_color",
      "surface_color",
      "surface_dark_color",
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
      "preferred_recipe",
      "default_photo_ratio",
    ];
    expect(PRE_MIGRATION_SCORED.length).toBe(31);
    expect([...SCORED_KEYS].sort()).toEqual([...PRE_MIGRATION_SCORED].sort());
    expect(completenessSummary({}).total).toBe(31);

    // and a half-filled profile scores the same as it did before the facets
    const summary = completenessSummary({ agent_name: "Marisol Vega", brokerage: "Gulf Coast" });
    expect(summary.filled).toBe(2);
    expect(summary.total).toBe(31);
  });
});

describe("profile-ledger", () => {
  it("must tier is exactly the CAN-SPAM three", () => {
    expect([...MUST_KEYS].sort()).toEqual(["agent_name", "brokerage", "business_address"].sort());
  });

  it("registry covers every account-profile key the brand API allowlists", () => {
    // ⚠️ THIS ARRAY IS A THIRD COPY, NOT A GUARD. The comment that used to sit
    // here claimed "if the API grows a field, this test forces the ledger to
    // grow with it." It does not — it is a hand-copied list that only fires if
    // someone remembers to update it, and the route and registry are in sync
    // today by maintenance, not by construction. It is DELETED by §C of the
    // brand-field-registry spec once app/api/user/brand/route.ts derives its
    // allowlist from accountApiKeys(), at which point this asserts x === x.
    // Kept until then so the current sync is not left unpinned mid-migration.
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
    // SCORED_KEYS: the PATCH allowlist is the brand-editor set, which is what
    // this array was always really pinned against.
    expect([...SCORED_KEYS].sort()).toEqual([...apiKeys].sort());
    // ...and company_name is registered but deliberately NOT in the allowlist.
    expect(PROFILE_FIELD_KEYS).toContain("company_name");
    expect(apiKeys).not.toContain("company_name");
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
    // SCORED_KEYS, not PROFILE_FIELD_KEYS: the registry now also holds fields
    // other lanes own (company_name), which are registered but never scored.
    expect(gaps.length).toBe(SCORED_KEYS.length);
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
    expect(s.total).toBe(SCORED_KEYS.length);
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
