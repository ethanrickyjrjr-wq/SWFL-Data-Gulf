// lib/share/cta.test.ts
// Guards: spec failure mode 6 (copy drift into system nouns) and the
// ref=share contract on the signup path.
import { describe, expect, test } from "bun:test";
import { SHARE_CTA_TEXT, SHARE_CTA_HREF } from "./cta";

describe("share CTA constants", () => {
  test("copy is the spec-fixed sentence", () => {
    expect(SHARE_CTA_TEXT).toBe("Built with SWFL Data Gulf — build your own market report, free");
  });
  test("copy carries no system nouns", () => {
    for (const noun of ["brain", "master", "pack", "tier", "lake"]) {
      expect(SHARE_CTA_TEXT.toLowerCase()).not.toContain(noun);
    }
  });
  test("href goes to login with ref=share", () => {
    expect(SHARE_CTA_HREF).toBe("/login?ref=share");
  });
});
