// lib/email/blocks/listing-grid-render.test.tsx — the listing-grid block's render
// guards, each named for the failure mode it stops (design spec §6).
//
// F9 is the one that matters most here. `docs/standards/emails.md` §5 calls a block
// that renders in one engine and not the others this repo's recurring failure, and
// BOTH switches (BlockRenderer, email-doc-pdf) carry a `default:` arm — so a missing
// case produces NO compile error and NO runtime throw. It renders silently as
// nothing. Only an end-to-end assertion per engine catches it, which is what
// listing-grid-engine-parity.test.ts does.
import { describe, expect, test } from "bun:test";
import { render } from "@react-email/render";
import { ListingGridBlock } from "./ListingGridBlock";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";
import { BORDER } from "./styles";
import { ON_DARK_MUTED } from "./on-dark";
import { SECTION_SURFACE_BG, type ListingGridProps } from "../doc/types";

const card = (n: number) => ({
  photoUrl: `https://ap.rdcpix.com/photo${n}.jpg`,
  linkUrl: `https://www.realtor.com/realestateandhomes-detail/home-${n}`,
  price: `$${200 + n},000`,
  addressLine1: `${n} Byron Rd`,
  addressLine2: "Fort Myers, FL 33919",
});

const html = (props: ListingGridProps) =>
  render(<ListingGridBlock props={props} globalStyle={DEFAULT_GLOBAL_STYLE} />);

describe("ListingGridBlock", () => {
  test("renders every card's real photo and real link", async () => {
    const out = await html({ title: "Price drops", cards: [card(1), card(2), card(3), card(4)] });
    for (const n of [1, 2, 3, 4]) {
      expect(out).toContain(`photo${n}.jpg`);
      expect(out).toContain(`home-${n}`);
    }
  });

  test("renders the section title and subtitle", async () => {
    const out = await html({
      title: "New construction homes",
      subtitle: "Fort Myers",
      cards: [card(1), card(2)],
    });
    expect(out).toContain("New construction homes");
    expect(out).toContain("Fort Myers");
  });

  test("F11 — an EMPTY grid renders nothing, never a hollow card", async () => {
    const out = await html({ cards: [] });
    expect(out).not.toContain("<img");
  });

  test("F8 — omits the specs line entirely when absent, never a blank bath slot", async () => {
    const out = await html({ cards: [card(1), card(2)] });
    expect(out).not.toContain("bath");
  });

  test("F8 — renders a full three-field specs line when the builder supplies one", async () => {
    const out = await html({
      cards: [{ ...card(1), specs: "3 bed · 2 bath · 1,295 sqft" }, card(2)],
    });
    expect(out).toContain("1,295 sqft");
  });

  test("renders the price-cut badge only when a real cut exists", async () => {
    const withCut = await html({ cards: [{ ...card(1), priceCut: "$1,600" }, card(2)] });
    expect(withCut).toContain("$1,600");
    const noCut = await html({ cards: [card(1), card(2)] });
    expect(noCut).not.toContain("$1,600");
  });

  test("renders the CTA only when both label and url are present", async () => {
    const withCta = await html({
      cards: [card(1), card(2)],
      ctaLabel: "View price drops",
      ctaUrl: "https://example.com/x",
    });
    expect(withCta).toContain("View price drops");
    // Label alone is not a CTA — a button with no destination is a dead end.
    const labelOnly = await html({ cards: [card(1), card(2)], ctaLabel: "View price drops" });
    expect(labelOnly).not.toContain("View price drops");
  });
});

// ── The section surface (operator, 08/04/2026) ──────────────────────────────────
// "put a nice light color card behind each section. same color for each, but just to
// seperate the sections. make sure email lab can put boarder around or no color, as
// well. don't fuck up the original, i just want to see it with a card behind."
//
// Three states, and the DEFAULT IS THE ORIGINAL. "don't fuck up the original" is not
// a style note, it is a testable guarantee: every doc saved before today carries no
// `surface`, and its markup must not move by one byte. That is F15 below, and it is
// the reason `surface` defaults to "none" rather than to the new look.
describe("ListingGridBlock — section surface", () => {
  const two = [card(1), card(2)];

  test("F15 — no surface prop renders EXACTLY today's markup (the original is untouched)", async () => {
    expect(await html({ title: "Price drops", cards: two })).toBe(
      await html({ title: "Price drops", cards: two, surface: "none" }),
    );
  });

  test("surface:card paints the card colour behind the whole section", async () => {
    const out = await html({ title: "Price drops", cards: two, surface: "card" });
    expect(out.toLowerCase()).toContain(SECTION_SURFACE_BG.toLowerCase());
  });

  test("surface:card honours an explicit colour from the Lab", async () => {
    const out = await html({ title: "x", cards: two, surface: "card", surfaceBg: "#EAF2FF" });
    expect(out.toLowerCase()).toContain("#eaf2ff");
  });

  test("surface:outline draws a border and paints NO fill", async () => {
    const out = await html({ title: "x", cards: two, surface: "outline" });
    expect(out).toContain(`1px solid ${BORDER}`);
    expect(out.toLowerCase()).not.toContain(SECTION_SURFACE_BG.toLowerCase());
  });

  test("a card or an outline replaces the divider rule — never both at once", async () => {
    // The section's bottom rule exists to separate sections. A card already does that;
    // shipping the rule too reads as a mistake, not as emphasis.
    expect(await html({ cards: two, surface: "none" })).toContain(
      `border-bottom:1px solid ${BORDER}`,
    );
    for (const surface of ["card", "outline"] as const) {
      expect(await html({ cards: two, surface })).not.toContain(
        `border-bottom:1px solid ${BORDER}`,
      );
    }
  });

  // The silent one. Every ink colour in this block is computed against `bg`. Once the
  // text sits on the CARD instead of the section, a contrast base still pointing at
  // the section is wrong — and with two pale colours it stays invisible to any visual
  // check, which is exactly how it would ship.
  test("F16 — ink contrast is measured against the CARD colour, not the section colour", async () => {
    const out = await html({
      cards: [{ ...card(1), specs: "3 bed · 2 bath · 1,295 sqft" }, card(2)],
      surface: "card",
      surfaceBg: "#10233F", // a dark card on the default white section
    });
    expect(out).toContain(ON_DARK_MUTED);
  });
});
