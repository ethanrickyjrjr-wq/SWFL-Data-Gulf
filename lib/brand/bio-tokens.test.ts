// lib/brand/bio-tokens.test.ts
//
// The one test that matters: MOVING THE DATA CHANGES THE SENT BIO, WITH NO EDIT BY THE
// AGENT. Everything else here is the guard rail around that.

import { describe, expect, it, mock, beforeEach } from "bun:test";
import type { MarketFigure } from "@/lib/email/market-context";

let FIGURES: MarketFigure[] = [];
mock.module("@/lib/email/market-context", () => ({
  loadMarketFigures: async () => FIGURES,
}));

const { resolveBio, tokensIn, tokensAreKnown, TOKENS } = await import("./bio-tokens");

const CAPE = { kind: "zip", value: "33904" };
const BIO =
  "I farm Cape Coral — I bought my own first place on a canal here. " +
  "The typical home runs {{farm.home_value}}, {{farm.yoy}} over the past year. " +
  "I send my sphere the numbers, not the hype.";

const fig = (key: string, value: string, as_of?: string): MarketFigure => ({
  key,
  label: key,
  value,
  source: "Zillow Home Value Index",
  as_of,
});

beforeEach(() => {
  FIGURES = [
    fig("home_value", "$339,699", "05/31/2026"),
    fig("home_value_yoy", "−7.3%", "05/31/2026"),
  ];
});

describe("THE ACCEPTANCE TEST — the bio updates itself", () => {
  it("resolves today's figure into the sent bio", async () => {
    const out = await resolveBio(BIO, CAPE);
    expect(out.text).toContain("$339,699");
    expect(out.text).toContain("−7.3%");
    expect(out.text).toContain("bought my own first place on a canal"); // the agent's words
    expect(out.text).not.toContain("{{"); // a recipient NEVER sees a raw token
  });

  it("SIX MONTHS LATER: the data moved, the bio moved, the agent edited NOTHING", async () => {
    const before = await resolveBio(BIO, CAPE);
    expect(before.text).toContain("$339,699");

    // The lake refreshes. Nobody touched the saved bio.
    FIGURES = [
      fig("home_value", "$351,400", "11/30/2026"),
      fig("home_value_yoy", "+2.1%", "11/30/2026"),
    ];

    const after = await resolveBio(BIO, CAPE);
    expect(after.text).toContain("$351,400");
    expect(after.text).toContain("+2.1%");
    // The stale figure is GONE — this is the whole point. A frozen number would still
    // be sitting in the agent's signature, under their name, on every email.
    expect(after.text).not.toContain("$339,699");
    // And their own words are untouched.
    expect(after.text).toContain("I send my sphere the numbers, not the hype.");
  });

  it("carries the citation with the figure — a number without its source is the thing we don't ship", async () => {
    const out = await resolveBio(BIO, CAPE);
    expect(out.citations.map((c) => c.key).sort()).toEqual(["home_value", "home_value_yoy"]);
    expect(out.citations[0].source).toBe("Zillow Home Value Index");
    expect(out.citations[0].as_of).toBe("05/31/2026");
  });
});

describe("an unsourceable clause is DROPPED, never faked", () => {
  it("drops the whole sentence when its figure is missing — never a half-sentence", async () => {
    FIGURES = []; // the lake has nothing for this area
    const out = await resolveBio(BIO, CAPE);

    // The data sentence is gone ENTIRELY. Dropping only the token would leave
    // "The typical home runs , over the past year." — worse than saying nothing.
    expect(out.text).not.toContain("typical home runs");
    expect(out.text).not.toContain("{{");
    expect(out.text).not.toContain(",  over");

    // The agent's own words survive. A bio with no data is still a true bio.
    expect(out.text).toContain("I farm Cape Coral");
    expect(out.text).toContain("not the hype");
    expect(out.dropped).toContain("farm.home_value");
  });

  it("drops a sentence if even ONE of its tokens is unresolvable — half a sourced claim is not sourced", async () => {
    FIGURES = [fig("home_value", "$339,699")]; // yoy is missing
    const out = await resolveBio(BIO, CAPE);
    expect(out.text).not.toContain("$339,699"); // the sentence carrying it went with it
    expect(out.dropped).toContain("farm.yoy");
  });

  it("an INVENTED token can never become a number — its clause is dropped", async () => {
    const out = await resolveBio(
      "I have closed {{farm.homes_i_sold}} homes this year. I farm Cape Coral.",
      CAPE,
    );
    // There is no such token, and there is no such fact. It cannot resolve, so the
    // claim cannot ship. This is the structural guard against an invented credential.
    expect(out.text).not.toContain("homes this year");
    expect(out.text).not.toContain("{{");
    expect(out.text).toBe("I farm Cape Coral.");
  });
});

describe("the token set is CLOSED", () => {
  it("tokensAreKnown rejects a token we cannot resolve", () => {
    expect(tokensAreKnown("I farm {{farm.home_value}}.")).toBe(true);
    expect(tokensAreKnown("I closed {{farm.homes_i_sold}} homes.")).toBe(false);
    expect(tokensAreKnown("Just my own words.")).toBe(true);
  });

  it("every declared token maps to a figure key", () => {
    for (const [name, spec] of Object.entries(TOKENS)) {
      expect(spec.figureKey, `token ${name}`).toBeTruthy();
      expect(spec.what, `token ${name} needs a plain-words description`).toBeTruthy();
    }
  });

  it("tokensIn finds them regardless of spacing or case", () => {
    expect(tokensIn("a {{farm.home_value}} b {{ FARM.YOY }} c")).toEqual([
      "farm.home_value",
      "farm.yoy",
    ]);
  });
});

describe("degrades, never refuses", () => {
  it("an empty template is empty, not an error", async () => {
    expect((await resolveBio("", CAPE)).text).toBe("");
  });

  it("a bio with no tokens passes through untouched, with no lake call needed", async () => {
    const plain = "I farm Cape Coral. I send the numbers, not the hype.";
    const out = await resolveBio(plain, undefined);
    expect(out.text).toBe(plain);
    expect(out.citations).toEqual([]);
  });

  it("no area to scope to → the agent's own words survive, the data sentences go", async () => {
    FIGURES = [];
    const out = await resolveBio(BIO, undefined);
    expect(out.text).toContain("I farm Cape Coral");
    expect(out.text).not.toContain("{{");
  });
});
