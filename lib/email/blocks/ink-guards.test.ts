// lib/email/blocks/ink-guards.test.ts — Fence 6 Tier A render guards + the
// white-ink trio (email_contrast_ink_fence). Hostile palettes from the spec
// (2026-07-09-email-accent-ink-palette-gate-design.md): accent==primary navy;
// pale-gold family; plus the HOUSE default, whose accent (#3DC9C0) is the LIVE
// failure on light surfaces (2.04:1 on white, 1.95:1 on the #F9FAFB footer).
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { createElement } from "react";
import type { EmailGlobalStyle } from "../doc/types";
import { HeaderBlock } from "./HeaderBlock";
import { AgentHeroBlock } from "./AgentHeroBlock";

/** Regex for a standalone `color:` TEXT-INK declaration carrying `hex` —
 *  `[^-]` excludes `background-color:` / `border-*-color:` (fills and borders
 *  are exempt surfaces; only text ink is guarded). */
const inkDecl = (hex: string) => new RegExp(`[^-]color:${hex}`, "i");

const NAVY_ON_NAVY: EmailGlobalStyle = {
  primaryColor: "#1B3A5C",
  accentColor: "#1B3A5C",
  fontFamily: "MODERN_SANS",
  textColor: "#1F2937",
  backdropColor: "#F8FAFC",
};

const HOUSE: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#1F2937",
  backdropColor: "#F8FAFC",
};

describe("HeaderBlock tagline ink", () => {
  it("never renders accent-on-accent (navy==navy → readable neutral)", async () => {
    const out = await render(
      createElement(HeaderBlock, {
        props: { companyName: "Gulf Co", tagline: "Waterfront specialists" },
        globalStyle: NAVY_ON_NAVY,
      }),
    );
    expect(out).not.toMatch(inkDecl("#1B3A5C")); // 1.00:1 ink is unreachable
  });

  it("keeps the house accent on the dark house primary (8.44:1)", async () => {
    const out = await render(
      createElement(HeaderBlock, {
        props: { companyName: "Gulf Co", tagline: "Waterfront specialists" },
        globalStyle: HOUSE,
      }),
    );
    expect(out).toMatch(inkDecl("#3DC9C0"));
  });
});

describe("AgentHeroBlock designation ink", () => {
  it("never renders accent-on-accent on the name strip", async () => {
    const out = await render(
      createElement(AgentHeroBlock, {
        props: {
          photoUrl: "https://example.com/p.jpg",
          name: "R. Cooper",
          designation: "BROKER ASSOCIATE",
        },
        globalStyle: NAVY_ON_NAVY,
      }),
    );
    expect(out).not.toMatch(inkDecl("#1B3A5C"));
  });
});
