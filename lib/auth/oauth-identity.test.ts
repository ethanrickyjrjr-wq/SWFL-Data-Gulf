import { describe, expect, it } from "bun:test";
import { oauthIdentityToBrandPatch } from "./oauth-identity";

describe("oauthIdentityToBrandPatch", () => {
  it("maps a Google-shaped identity to name + email (not photo)", () => {
    const patch = oauthIdentityToBrandPatch({
      name: "Marisol Vega",
      email: "marisol@vegarealty.com",
      picture: "https://lh3.googleusercontent.com/a/thumb=s96",
    });
    expect(patch).toEqual({
      agent_name: "Marisol Vega",
      contact_email: "marisol@vegarealty.com",
    });
    expect(patch).not.toHaveProperty("photo_url");
  });

  it("falls back to full_name when name is absent", () => {
    expect(oauthIdentityToBrandPatch({ full_name: "Dana Cho" })).toEqual({
      agent_name: "Dana Cho",
    });
  });

  it("prefers name over full_name when both exist", () => {
    expect(oauthIdentityToBrandPatch({ name: "Real Name", full_name: "Legal Name" })).toMatchObject(
      { agent_name: "Real Name" },
    );
  });

  it("trims whitespace and ignores blank / non-string claims", () => {
    expect(
      oauthIdentityToBrandPatch({ name: "  Kip Ryan  ", email: "   ", full_name: 42 }),
    ).toEqual({ agent_name: "Kip Ryan" });
  });

  it("returns {} for an email-code sign-in (no usable metadata)", () => {
    expect(oauthIdentityToBrandPatch({})).toEqual({});
    expect(oauthIdentityToBrandPatch(null)).toEqual({});
    expect(oauthIdentityToBrandPatch(undefined)).toEqual({});
  });
});
