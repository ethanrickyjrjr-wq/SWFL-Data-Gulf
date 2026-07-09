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
import { AgentCardBlock } from "./AgentCardBlock";
import { FooterBlock } from "./FooterBlock";
import { SourcesBlock } from "./SourcesBlock";
import { ListingBlock } from "./ListingBlock";
import { SocialIconsBlock } from "./SocialIconsBlock";

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

// The house default on light surfaces is the LIVE failure: #3DC9C0 on #ffffff
// = 2.04:1, on the footer's #F9FAFB = 1.95:1 — all must resolve to dark ink.
describe("accent links on light surfaces", () => {
  it("AgentHeroBlock CTA on the white card never ships 2.04:1 teal", async () => {
    const out = await render(
      createElement(AgentHeroBlock, {
        props: {
          photoUrl: "https://example.com/p.jpg",
          name: "R. Cooper",
          ctaLabel: "Book a call",
          ctaUrl: "https://example.com",
        },
        globalStyle: HOUSE,
      }),
    );
    expect(out).toMatch(inkDecl("#111827"));
    expect(out).not.toMatch(inkDecl("#3DC9C0"));
  });

  it("AgentCardBlock CTA guards the same pair", async () => {
    const out = await render(
      createElement(AgentCardBlock, {
        props: { name: "R. Cooper", ctaLabel: "Book a call", ctaUrl: "https://example.com" },
        globalStyle: HOUSE,
      }),
    );
    expect(out).not.toMatch(inkDecl("#3DC9C0"));
  });

  it("FooterBlock social links guard accent on #F9FAFB", async () => {
    const out = await render(
      createElement(FooterBlock, {
        props: { instagramUrl: "https://instagram.com/gulfco" },
        globalStyle: HOUSE,
      }),
    );
    expect(out).not.toMatch(inkDecl("#3DC9C0"));
  });

  it("SourcesBlock citation links guard accent on the card bg", async () => {
    const out = await render(
      createElement(SourcesBlock, {
        props: { sources: [{ label: "SWFL Data Gulf", url: "https://www.swfldatagulf.com" }] },
        globalStyle: HOUSE,
      }),
    );
    expect(out).not.toMatch(inkDecl("#3DC9C0"));
  });
});

// Pale-primary / dark-accent brand: price ink (1.2:1 on white) and the badge
// chip's hardcoded #06231f on a dark accent fill are the failure pair here.
const PALE: EmailGlobalStyle = {
  primaryColor: "#F5E6C4",
  accentColor: "#0b3d4c",
  fontFamily: "MODERN_SANS",
  textColor: "#1F2937",
  backdropColor: "#F8FAFC",
};

describe("ListingBlock ink guards", () => {
  it("price never renders a pale primary on the white card", async () => {
    const out = await render(
      createElement(ListingBlock, { props: { price: "$485,000" }, globalStyle: PALE }),
    );
    expect(out).not.toMatch(inkDecl("#F5E6C4"));
  });

  it("badge chip ink adapts to a DARK accent fill (hardcoded #06231f would vanish)", async () => {
    const out = await render(
      createElement(ListingBlock, { props: { badge: "JUST LISTED" }, globalStyle: PALE }),
    );
    expect(out).not.toMatch(inkDecl("#06231f"));
  });

  it("'View listing' link guards accent on the card", async () => {
    const out = await render(
      createElement(ListingBlock, {
        props: { linkUrl: "https://example.com" },
        globalStyle: HOUSE, // teal on white = 2.04
      }),
    );
    expect(out).not.toMatch(inkDecl("#3DC9C0"));
  });
});

describe("SocialIconsBlock custom icon color", () => {
  it("guards the accent used for custom entries on the white card (non-text floor 3)", async () => {
    // Custom entry with no logoUrl → GlobeIcon tinted with the accent (SVG fill,
    // not a css `color:` decl) — assert the raw hex is absent entirely: in this
    // fixture the accent has no other legitimate way into the output.
    const out = await render(
      createElement(SocialIconsBlock, {
        props: {
          platforms: [{ type: "custom", url: "https://example.com", label: "My site" }],
        },
        globalStyle: HOUSE, // teal on white = 2.04 < 3
      }),
    );
    expect(out).not.toContain("#3DC9C0");
  });
});
