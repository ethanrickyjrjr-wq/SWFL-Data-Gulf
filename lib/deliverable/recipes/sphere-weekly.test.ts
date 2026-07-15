// lib/deliverable/recipes/sphere-weekly.test.ts
//
// R10 · WEEKLY SPHERE UPDATE — the acceptance oracle for "Headlines vs Here".
//
// THE ORACLE IS NOT HYPOTHETICAL. Three of six live runs of this recipe shipped
//
//     "the gap is widening"
//
// off ONE national figure and NO national trend. Every number underneath it was real.
// If these tests cannot catch that sentence, they are theatre.
//
// What they pin, in the order the failures actually happened:
//   • the AREA resolves from the PROMPT (the Lab door passes NO scope);
//   • the national headline is a LANE-3 fact — never substituted from our lake, never
//     coerced into plausibility, and an OPEN SLOT when it cannot be verified;
//   • the pair is the same METRIC on both sides;
//   • THE RELATION IS COMPUTED IN CODE, and the arithmetic is re-derived here by hand;
//   • THE NARRATOR IS HANDED NO RAW FIGURE — the structural done-condition, asserted
//     directly against the exact string the model receives;
//   • the claim gate is FAIL-CLOSED: a trajectory, a comparison, a count, an inverted
//     direction → the model's sentences are DROPPED and the code spine ships alone;
//   • an unsourced cell is an OPEN SLOT, never a zero and never a naked label;
//   • NO CHART.
//
// PURE — no network, no lake. The live proof (a real build through authorDoc, rendered
// and looked at) is in the build report.

import { describe, expect, it, mock, afterAll } from "bun:test";
import {
  auditRead,
  buildGrid,
  cell,
  contradictsDirection,
  fitSignalBody,
  mechanismClaims,
  mmddyyyy,
  narratorFacts,
  parsePct,
  parseUsd,
  planPair,
  replyMailto,
  resolveArea,
  scheduleSuggestionFromPrompt,
  settledGap,
  settledLocalTrend,
  subjectFromLabel,
  supportingCells,
  usdHeadline,
  OPEN_NATIONAL,
  REVIEW_INSTRUCTION,
  type GapRead,
  type Headline,
} from "./sphere-weekly";
import { auditClaims } from "@/lib/deliverable/claims";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { MarketFigure } from "@/lib/email/market-context";
import type { EmailDoc } from "@/lib/email/doc/types";

// $283,486 is BELOW $367,969. Re-derived by hand, and every direction assertion in this
// file is checked against that arithmetic — not against what a sentence happens to say.
const HOME_VALUE: MarketFigure = {
  key: "home_value",
  label: "Median home value — Cape Coral (33904)",
  value: "$283,486",
  source: "Zillow ZHVI",
  as_of: "05/31/2026",
};
const YOY: MarketFigure = {
  key: "home_value_yoy",
  label: "Home value, year over year",
  value: "−6.8%", // U+2212 MINUS, exactly as market-context's pct() emits it
  source: "Zillow ZHVI",
  as_of: "05/31/2026",
};
const COUNTY_SALE: MarketFigure = {
  key: "county_sale",
  label: "Lee County median sale price",
  value: "$385,000",
  source: "Redfin",
  as_of: "05/31/2026",
};
const HEADLINE: Headline = {
  value: "$367,969",
  label: "Typical home value — United States",
  host: "zillow.com",
  url: "https://www.zillow.com/home-values/",
  readOn: "07/13/2026",
};

const AREA = { zip: "33904", label: "Cape Coral (33904)", place: "Cape Coral" };
const PLAN = planPair([HOME_VALUE, YOY])!;
const GAP = settledGap(PLAN, HEADLINE)!;
const TREND = settledLocalTrend([HOME_VALUE, YOY], PLAN)!;
const SETTLED = [GAP, TREND];

const heroes = (doc: EmailDoc) => doc.blocks.filter((b) => b.type === "hero");
const statCells = (doc: EmailDoc) =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));

const READ: GapRead = {
  body: `${GAP.sentence} ${TREND.sentence} For an owner, that is the shape of this market. Watch next month's reading of the same two numbers.`,
  proseDropped: false,
};

function grid(over: Partial<Parameters<typeof buildGrid>[0]> = {}): EmailDoc {
  return buildGrid({
    current: defaultDoc(),
    area: AREA,
    headline: HEADLINE,
    here: HOME_VALUE,
    supporting: supportingCells([HOME_VALUE, YOY], "33904"),
    read: READ,
    citations: [{ label: "Zillow ZHVI · 05/31/2026" }],
    ...over,
  });
}

// ── Task 6: authorGapRead's own narrator never carries FAVORABLE_FRAMING_POLICY ──
//
// mock.module is process-global (no per-file isolation) — snapshot + restore, the same
// pattern already used in shared.test.ts / agent-launch.test.ts / under-contract.test.ts.
// This file otherwise drives PURE functions only (see the file header, "no network, no
// lake") — this mock exists ONLY for the one test below that reaches the model call
// inside authorGapRead.
const realAnthropicSW = await import("@/refinery/agents/anthropic.mts");
const anthropicOrigSW = { ...realAnthropicSW };
afterAll(() => {
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrigSW);
});

let swSystemSeen = "";
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...anthropicOrigSW,
  getAnthropic: () => ({
    messages: {
      create: async (args: { system: string }) => {
        swSystemSeen = args.system;
        return {
          content: [
            {
              type: "text",
              // The exact honest-paragraph shape already proven clean by this file's own
              // "lets the honest paragraph through" test below.
              text: "For an owner, that is the number a buyer will start from. Watch next month's reading of the same two numbers.",
            },
          ],
        };
      },
    },
  }),
}));

describe("Task 6 — authorGapRead's own narrator never carries FAVORABLE_FRAMING_POLICY", () => {
  // READ_SYSTEM (sphere-weekly.ts) carries an ABSOLUTE no-trend / no-comparison / no-number
  // constraint over the NATIONAL side ("YOU HAVE NO TREND... WRITE NO NUMBER AND NO YEAR").
  // FAVORABLE_FRAMING_POLICY presumes real numbers are on the page to order/emphasize —
  // pasting it in here would contradict the rule this narrator depends on. Dynamic import
  // AFTER the mock above (same pattern as under-contract.test.ts), so authorGapRead's own
  // `getAnthropic` binding resolves through it, then called with this file's own top-level
  // fixtures — the real narrator path, not a stand-in.
  it("READ_SYSTEM never contains the framing block", async () => {
    const { FAVORABLE_FRAMING_POLICY } = await import("./shared");
    const { authorGapRead } = await import("./sphere-weekly");
    await authorGapRead(AREA, GAP, SETTLED);
    expect(swSystemSeen.length).toBeGreaterThan(0); // the model call really fired
    expect(swSystemSeen).not.toContain(FAVORABLE_FRAMING_POLICY);
  });
});

describe("THE SUBJECT — an area, from the field OR the prompt", () => {
  it("resolves the place the user typed over the [[blank]] — the Lab door passes NO scope", () => {
    const area = resolveArea(
      "Build a weekly sphere market update for Cape Coral — one national or Florida headline number…",
    );
    expect(area?.place).toBe("Cape Coral");
    expect(area?.zip).toMatch(/^\d{5}$/);
    expect(area?.label).toContain("Cape Coral");
  });

  it("a crosswalk-known ZIP written in the prompt wins over the place's primary ZIP", () => {
    const area = resolveArea("weekly update for Fort Myers 33905");
    expect(area?.zip).toBe("33905");
  });

  it("an explicit ZIP scope (the map/report door) wins over the prompt", () => {
    expect(resolveArea("weekly update for Cape Coral", "33905")?.zip).toBe("33905");
  });

  it("a street number is not a ZIP — only the sourced crosswalk can name one", () => {
    expect(resolveArea("weekly update for 12345 Nowhere Ave")).toBeNull();
  });

  it("no area named → null → the generic author. Degrade, never refuse", () => {
    expect(resolveArea("write me something nice")).toBeNull();
  });
});

describe("THE PAIR — one metric, two geographies", () => {
  it("prefers the ZIP's own home-value index, and aims the web lookup at ITS publisher", () => {
    const plan = planPair([HOME_VALUE, YOY, COUNTY_SALE]);
    expect(plan?.here).toBe(HOME_VALUE);
    expect(plan?.domain).toBe("zillow.com");
    expect(plan?.nationalLabel).toContain("United States");
    // The trend key must belong to the metric ON THE PAGE — a county YoY under a ZIP
    // value would be a settled sentence about a different number than the one above it.
    expect(plan?.yoyKey).toBe("home_value_yoy");
  });

  it("falls back to the county median SALE price — and to REDFIN, the same publisher", () => {
    const plan = planPair([COUNTY_SALE]);
    expect(plan?.here).toBe(COUNTY_SALE);
    expect(plan?.domain).toBe("redfin.com");
    expect(plan?.yoyKey).toBe("county_sale_yoy");
  });

  it("no local figure → no pair. We never invent the local half either", () => {
    expect(planPair([])).toBeNull();
  });

  it("the search query carries NO number — the model must read it from a citation", () => {
    expect(/\d/.test(planPair([HOME_VALUE])!.request.search_query)).toBe(false);
  });

  it("the gap sentence's subject keeps the geography the figure ACTUALLY measures", () => {
    // A county figure is never quietly handed to a ZIP.
    expect(subjectFromLabel("Median home value — Cape Coral (33904)")).toBe(
      "The median home value in Cape Coral (33904)",
    );
    expect(subjectFromLabel("Lee County median sale price")).toBe(
      "The Lee County median sale price",
    );
  });
});

describe("THE HEADLINE — a lane-3 fact, or an open slot. Never an invention", () => {
  it("prints the verified value digit-for-digit", () => {
    expect(usdHeadline(367969)).toBe("$367,969");
  });

  it("rejects a RATE answered to a PRICE ask (6.75 is not a home price)", () => {
    expect(usdHeadline(6.75)).toBeNull();
  });

  it("rejects a unit error rather than scaling it into plausibility", () => {
    expect(usdHeadline(431)).toBeNull();
    expect(usdHeadline(43_100_000)).toBeNull();
  });

  it("as-of is MM/DD/YYYY — the raw token never reaches a reader", () => {
    expect(mmddyyyy(new Date(2026, 6, 13))).toBe("07/13/2026");
  });
});

// ═══ THE CLAIM GATE ═══════════════════════════════════════════════════════════

describe("CODE COMPUTES THE RELATION — the model never gets to point it", () => {
  it("parses the formatter's own output back, and nothing else", () => {
    expect(parseUsd("$283,486")).toBe(283_486);
    expect(parseUsd("$367,969")).toBe(367_969);
    expect(parseUsd("6.8%")).toBeNull();
    expect(parseUsd("about $300k")).toBeNull();
  });

  it("reads a UNICODE MINUS — or every decline would read as a rise", () => {
    expect(parsePct("−6.8%")).toBe(-6.8); // U+2212, what pct() actually emits
    expect(parsePct("-6.8%")).toBe(-6.8); // ASCII hyphen
    expect(parsePct("+4.2%")).toBe(4.2);
    expect(parsePct("$283,486")).toBeNull();
  });

  it("BELOW: 283,486 < 367,969 — and the sentence says below", () => {
    expect(283_486).toBeLessThan(367_969); // the arithmetic, re-derived by hand
    const gap = settledGap(PLAN, HEADLINE)!;
    expect(gap.direction).toBe("below");
    expect(gap.sentence).toBe(
      "The median home value in Cape Coral (33904) sits below the national figure beside it.",
    );
    expect(gap.sentence).not.toContain("above");
  });

  it("ABOVE: 412,000 > 367,969 — and the sentence FLIPS. It is not decoration", () => {
    // This is the market-comps failure in miniature: the same prose, the wrong direction.
    // The only defense is that a function, not a model, chooses the word.
    expect(412_000).toBeGreaterThan(367_969);
    const rich: MarketFigure = { ...HOME_VALUE, value: "$412,000" };
    const gap = settledGap(planPair([rich])!, HEADLINE)!;
    expect(gap.direction).toBe("above");
    expect(gap.sentence).toContain("sits above the national figure");
    expect(gap.sentence).not.toContain("below");
  });

  it("EQUAL: the same number is not a gap in either direction", () => {
    const same: MarketFigure = { ...HOME_VALUE, value: "$367,969" };
    const gap = settledGap(planPair([same])!, HEADLINE)!;
    expect(gap.direction).toBe("level");
    expect(gap.sentence).toContain("is the same as the national figure");
  });

  it("the gap sentence carries NEITHER figure — they are already printed above it", () => {
    expect(GAP.sentence).not.toContain("283,486");
    expect(GAP.sentence).not.toContain("367,969");
    // Its only numeral is the ZIP in the figure's own label — that is what lets the
    // narrator name the area without inventing one.
    expect(GAP.anchors).toEqual(["33904"]);
  });

  it("an unparseable side yields NO relation — never a guessed one", () => {
    const junk: MarketFigure = { ...HOME_VALUE, value: "roughly $280k" };
    expect(settledGap(planPair([junk])!, HEADLINE)).toBeNull();
    expect(settledGap(PLAN, { ...HEADLINE, value: "about $368k" })).toBeNull();
  });

  it("the ONE trend we hold is LOCAL, and its direction comes from the SIGN", () => {
    expect(TREND.sentence).toBe("It is down 6.8% from a year ago.");
    const up = settledLocalTrend([HOME_VALUE, { ...YOY, value: "+4.2%" }], PLAN)!;
    expect(up.sentence).toBe("It is up 4.2% from a year ago.");
    const flat = settledLocalTrend([HOME_VALUE, { ...YOY, value: "0.0%" }], PLAN)!;
    expect(flat.sentence).toBe("It is unchanged from a year ago.");
  });

  it("no year-over-year held → NO trend sentence. We never manufacture one", () => {
    expect(settledLocalTrend([HOME_VALUE], PLAN)).toBeNull();
  });
});

describe("THE NARRATOR RECEIVES NO RAW SET — the structural done-condition", () => {
  // Not "a verifier didn't complain". THIS: the exact string the model is handed,
  // asserted to contain no figure it could draw a new relation between.
  const facts = narratorFacts(AREA, SETTLED);

  it("the national figure NEVER reaches the model", () => {
    expect(facts).not.toContain("367,969");
    expect(facts).not.toContain(HEADLINE.value);
    expect(facts).not.toContain("United States");
    expect(facts).not.toContain("zillow.com");
  });

  it("the local figure NEVER reaches the model", () => {
    expect(facts).not.toContain("283,486");
    expect(facts).not.toContain(HOME_VALUE.value);
  });

  it("the supporting row NEVER reaches the model", () => {
    // Days on market, active listings — real, sourced, printed on the page, and utterly
    // absent from the model's context. It cannot compare what it was not given.
    expect(facts).not.toContain("Active listings");
    expect(facts).not.toContain("days on market");
  });

  it("it receives the settled SENTENCES and the area name — and that is all", () => {
    expect(facts).toContain(GAP.sentence);
    expect(facts).toContain(TREND.sentence);
    expect(facts).toContain("Cape Coral (33904)");
    // The only numerals in the whole context are the ZIP and the sourced YoY magnitude.
    expect(facts.match(/\d[\d,.]*/g)?.sort()).toEqual(["33904", "33904", "6.8"]);
  });
});

describe("THE GATE IS FAIL-CLOSED — the sentences that actually shipped", () => {
  it("CATCHES THE TRAJECTORY. This exact sentence went out three times", () => {
    const v = auditRead("The gap is widening, and that matters here.", SETTLED, GAP.direction);
    expect(v.some((x) => x.kind === "trajectory")).toBe(true);
  });

  it("catches every dressed-up version of it — a level is still not a direction", () => {
    for (const bad of [
      "The gap between here and the country keeps growing.",
      "Local values are cooling faster than the headline.",
      "Momentum is picking up in this area.",
      "The market here is stabilizing.",
    ]) {
      expect(auditRead(bad, SETTLED, GAP.direction).length).toBeGreaterThan(0);
    }
  });

  it("CATCHES THE BARE VERB — the inflection that beat the -ing list in live run 5", () => {
    // claims.ts's TRAJECTORY matches "widening" but not "widen". Same invented direction,
    // different ending — exactly how a ban on "street" was beaten by "Shore Dr".
    for (const bad of [
      "The gap will widen next month.", // an invented PREDICTION — the hard block
      "Expect it to narrow through the summer.",
      "Watch whether the two readings hold, narrow, or move further apart.", // live run 5
    ]) {
      expect(auditRead(bad, SETTLED, GAP.direction).some((v) => v.kind === "trajectory")).toBe(
        true,
      );
    }
    // And the shared gate, on its own, is blind to every one of them.
    expect(auditClaims("The gap will widen next month.", SETTLED)).toEqual([]);
  });

  it("CATCHES THE INVERSION the shared regex is blind to", () => {
    // auditClaims' COMPARATIVE_QUANT needs a QUANTITY token ($ · digit · % · median ·
    // average · comparable · ask · price · sales · listings · market) within 40 chars of
    // the positional word. "sits above the national figure" has NONE of them — so the
    // shared gate lets it through, and this recipe's own sentence is exactly that shape.
    const inverted = "Homes here sit above the national figure, which is unusual.";
    expect(contradictsDirection(inverted, "below")).toEqual(["above"]);
    expect(
      auditRead(inverted, SETTLED, GAP.direction).some((v) => v.kind.includes("contradicts")),
    ).toBe(true);
  });

  it("a direction that AGREES with the arithmetic costs nothing", () => {
    // Asymmetric on purpose: agreeing with code is harmless; negating it is the lie.
    expect(contradictsDirection("Prices here are lower, and that is the point.", "below")).toEqual(
      [],
    );
    expect(contradictsDirection("Prices here are lower, and that is the point.", "above")).toEqual([
      "lower",
    ]);
  });

  it("CATCHES THE INVENTED DEFINITION — caught in this rewrite's own second live run", () => {
    // The model was handed the words "median home value" and invented what they mean.
    // The figure is Zillow's ZHVI: a MODELLED INDEX. It is not a record of any sale, and
    // nobody "accepted" it. The sentence carries no number, no comparison, no trajectory
    // and no count — every shape the gate hunts — so it shipped clean. A new claim shape
    // needs a new gate; that is the whole lesson of claims.ts, applied to itself.
    const live =
      "For a buyer, the local median reflects what sellers have actually accepted in this " +
      "zip code over the past year.";
    expect(mechanismClaims(live).length).toBeGreaterThan(0);
    expect(auditRead(live, SETTLED, GAP.direction).some((v) => v.kind === "mechanism")).toBe(true);
    // And the shared gate alone would have let it straight through.
    expect(auditClaims(live, SETTLED)).toEqual([]);
  });

  it("CATCHES THE INVENTED THIRD PARTY — caught in the FOURTH live run", () => {
    // "a lender or assessor will see" — no lender looks at Zillow's index. We hold no fact
    // about any lender, appraiser or bank. There are exactly two people in this email: a
    // buyer and an owner.
    const live =
      "For an owner, that is the number a lender or assessor will see when valuing the " +
      "asset today.";
    expect(auditRead(live, SETTLED, GAP.direction).some((v) => v.kind === "mechanism")).toBe(true);
    expect(auditClaims(live, SETTLED)).toEqual([]); // the shared gate is blind to it
  });

  it("catches every other way of explaining a number it was never shown", () => {
    for (const bad of [
      "The figure represents the price homes changed hands at.",
      "That number measures what buyers paid.",
      "It is based on closed transactions.",
      "Your bank will read it the same way.",
    ]) {
      expect(auditRead(bad, SETTLED, GAP.direction).some((v) => v.kind === "mechanism")).toBe(true);
    }
  });

  it("CATCHES THE COMPARATIVE TRAJECTORY — live run 7, my defect in a fourth coat", () => {
    // "not keeping pace with what the broader market is doing": asserts the NATIONAL market
    // is moving (we hold one point) and that the local side is losing against it. No
    // number, no gerund, no bare verb — every lint above it, claims.ts included, sails past.
    const live =
      "For an owner, local equity is not keeping pace with what the broader market is doing.";
    expect(auditClaims(live, SETTLED)).toEqual([]); // the shared gate: blind
    expect(
      auditRead(live, SETTLED, GAP.direction).some((v) => v.kind === "beyond-the-settled"),
    ).toBe(true);
  });

  it("THE BOUNDARY closes the class, not one member of it", () => {
    // A word list would be beaten by the next synonym. The rule is about WHAT MAY BE
    // WRITTEN ABOUT: the national side belongs to code, and the model does not touch it.
    for (const bad of [
      "Values here are falling behind the country.",
      "The U.S. market tells a different story.",
      "Owners here are losing ground.",
      "That is unusual across most markets nationally.",
    ]) {
      expect(auditRead(bad, SETTLED, GAP.direction).length).toBeGreaterThan(0);
    }
  });

  it("but code's OWN spine says 'national figure' — and is never condemned for it", () => {
    // The settled sentences are skipped, exactly as auditClaims skips them. Restating a
    // claim CODE authored is the narrator's job; it must not kill the paragraph it is in.
    expect(auditRead(`${GAP.sentence} ${TREND.sentence}`, SETTLED, GAP.direction)).toEqual([]);
    expect(GAP.sentence).toContain("national figure");
  });

  it("catches a COUNT, a SEQUENCE, a MOTIVE and a number nothing anchors", () => {
    const kinds = (s: string) => auditRead(s, SETTLED, GAP.direction).map((v) => v.kind);
    expect(kinds("Five of those six homes tell the same story.")).toContain("word-count");
    expect(kinds("The price was cut before a contract was reached.")).toContain("sequence");
    expect(kinds("The seller is motivated.")).toContain("motive");
    expect(kinds("Values fell 3.8% across the county.")).toContain("unanchored-number");
  });

  it("lets the honest paragraph through — the gate must not eat the deliverable", () => {
    const honest =
      "For an owner, that is the number a buyer will start from. For a buyer, it is the " +
      "whole reason to shop here rather than read a headline. Watch next month's reading " +
      "of the same two numbers.";
    expect(auditRead(honest, SETTLED, GAP.direction)).toEqual([]);
  });

  it("the settled sentences themselves are always clean — code authored them", () => {
    expect(auditRead(`${GAP.sentence} ${TREND.sentence}`, SETTLED, GAP.direction)).toEqual([]);
  });
});

describe("THE GRID — the contrast pair IS the structure", () => {
  it("two heroes, side by side, six of twelve columns each, in ONE row", () => {
    const doc = grid();
    const [a, b] = heroes(doc);
    expect(heroes(doc)).toHaveLength(2);
    expect(a.layout).toMatchObject({ x: 0, w: 6 });
    expect(b.layout).toMatchObject({ x: 6, w: 6 });
    expect(a.layout!.y).toBe(b.layout!.y);
  });

  it("each hero wears band light, and its kicker POINTS instead of repeating the label", () => {
    const [national, local] = heroes(grid());
    expect(national.props.sectionBg).toBeTruthy();
    expect(local.props.sectionBg).toBeTruthy();
    expect(national.props.kicker).toBe("What the headlines say");
    expect(national.props.label).toBe(HEADLINE.label);
    expect(local.props.kicker).toBe("Here at home");
    expect(local.props.label).toBe(HOME_VALUE.label);
  });

  it("every figure carries its real source and an as-of in MM/DD/YYYY", () => {
    const [national, local] = heroes(grid());
    expect(local.props.prose).toBe("Zillow ZHVI · as of 05/31/2026");
    expect(national.props.prose).toBe("zillow.com · read 07/13/2026");
  });

  it("NO CHART — not an empty slot, not a filler chart. None", () => {
    expect(grid().blocks.some((b) => b.type === "image")).toBe(false);
  });

  it("the CTA instruction lives in the BODY; the button label is short and has no address", () => {
    const doc = grid();
    expect(doc.blocks.some((b) => b.type === "text" && b.props.body === REVIEW_INSTRUCTION)).toBe(
      true,
    );
    const button = doc.blocks.find((b) => b.type === "button");
    expect(button?.type === "button" && button.props.label).toBe("Reply with REVIEW");
  });

  it("the reply button is wired to the brand's own address — the engine owns the URL", () => {
    const branded = defaultDoc();
    const doc = grid({
      current: {
        ...branded,
        blocks: branded.blocks.map((b) =>
          b.type === "footer" ? { ...b, props: { ...b.props, email: "agent@example.com" } } : b,
        ),
      },
    });
    const button = doc.blocks.find((b) => b.type === "button");
    expect(button?.type === "button" && button.props.url).toBe(
      "mailto:agent@example.com?subject=REVIEW",
    );
  });

  it("no brand address → no href, and the instruction line still tells the reader what to do", () => {
    expect(replyMailto(defaultDoc())).toBeUndefined();
  });

  it("the brand (header, footer, palette) is STICKY — lifted off the canvas, never authored", () => {
    const doc = grid();
    expect(doc.blocks.some((b) => b.type === "header")).toBe(true);
    expect(doc.blocks.some((b) => b.type === "footer")).toBe(true);
    expect(doc.globalStyle).toEqual(defaultDoc().globalStyle);
  });

  it("the grid validates as a real EmailDoc", () => {
    expect(EmailDocSchema.safeParse(grid()).success).toBe(true);
  });
});

describe("THE OPEN-SLOT CONTRACT — a gap is an invitation, never a lie", () => {
  it("an unsourced cell keeps its INSTRUCTION label and an EMPTY value — never a zero", () => {
    const c = cell(null, "Days on market — type it in");
    expect(c.value).toBe("");
    expect(c.label).toBe("Days on market — type it in");
  });

  it("an unverifiable headline becomes an OPEN SLOT — we never substitute a lake figure", () => {
    const doc = grid({ headline: null, read: null });
    expect(heroes(doc)).toHaveLength(1);
    expect(heroes(doc)[0].layout).toMatchObject({ x: 0, w: 12 });
    expect(heroes(doc)[0].props.value).toBe(HOME_VALUE.value);
    const open = statCells(doc).find((s) => s.label === OPEN_NATIONAL);
    expect(open?.value).toBe("");
    expect(statCells(doc).some((s) => s.value === HOME_VALUE.value)).toBe(false);
  });

  it("neither side sourced → the build STILL lands, with two open slots. Never a refusal", () => {
    const doc = grid({
      headline: null,
      here: null,
      supporting: supportingCells([], "33904"),
      read: null,
    });
    expect(heroes(doc)).toHaveLength(0);
    expect(statCells(doc).every((s) => s.value === "")).toBe(true);
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });

  it("no read → a TEXT open slot, never an empty branded signal box", () => {
    const doc = grid({ read: null });
    expect(doc.blocks.some((b) => b.type === "signal")).toBe(false);
    expect(doc.blocks.some((b) => b.type === "text" && b.props.body === "")).toBe(true);
  });

  it("the read rides in the signal callout, and it OPENS with the code-computed spine", () => {
    const doc = grid();
    const signal = doc.blocks.find((b) => b.type === "signal");
    expect(signal?.type === "signal" && signal.props.kicker).toBe("The gap");
    expect(signal?.type === "signal" && signal.props.body.startsWith(GAP.sentence)).toBe(true);
    // No open slot when the model's sentences survived the gate.
    expect(doc.blocks.some((b) => b.type === "text" && b.props.body === "")).toBe(false);
  });

  it("PROSE DROPPED → the true spine still ships, and the agent gets an open slot", () => {
    // Two strikes at the claim gate. Not one word the model wrote reaches a recipient —
    // but the relation, which CODE computed, is not lost with it.
    const doc = grid({ read: { body: GAP.sentence, proseDropped: true } });
    const signal = doc.blocks.find((b) => b.type === "signal");
    expect(signal?.type === "signal" && signal.props.body).toBe(GAP.sentence);
    expect(doc.blocks.some((b) => b.type === "text" && b.props.body === "")).toBe(true);
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("THE SENT ARTIFACT — the canvas lies about the email, so render the email", () => {
  it("an open slot NEVER reaches a recipient — and the sourced half still ships", async () => {
    const html = await renderEmailDocHtml(grid({ headline: null, read: null }));
    expect(html).not.toContain("paste it with its source");
    expect(html).not.toContain("type it in");
    expect(html).toContain("$283,486");
    expect(html).toContain("Median home value");
    expect(html).toContain("Reply with REVIEW");
  });

  it("a dropped paragraph leaves NO empty box in the sent email — just the true spine", async () => {
    const html = await renderEmailDocHtml(
      grid({ read: { body: GAP.sentence, proseDropped: true } }),
    );
    expect(html).toContain("sits below the national figure");
    expect(html).not.toContain("widening");
  });

  it("no chart ships — not an image, not an empty box", async () => {
    expect(await renderEmailDocHtml(grid())).not.toContain("email-charts");
  });

  it("the sent email keeps its CAN-SPAM footer — unsubscribe and a postal address", async () => {
    expect((await renderEmailDocHtml(grid())).toLowerCase()).toContain("unsubscribe");
  });
});

describe("THE READ FITS ITS BOX — or the whole build is silently lost", () => {
  // LIVE, first run: the read came back at 696 characters. SignalPropsSchema caps `body`
  // at 500, so EmailDocSchema rejected the doc — and authorDoc answers an invalid recipe
  // doc by falling through to the GENERIC AUTHOR, which seated a LAKE figure in the slot
  // reserved for the NATIONAL headline. A length limit produced the exact substitution
  // this recipe exists to prevent.
  it("a read that fits is untouched", () => {
    expect(fitSignalBody("Short and true.")).toBe("Short and true.");
  });

  it("an over-long read is trimmed to WHOLE SENTENCES — never mid-word", () => {
    const long = `${"A".repeat(300)}. ${"B".repeat(300)}. ${"C".repeat(50)}.`;
    const fitted = fitSignalBody(long)!;
    expect(fitted.length).toBeLessThanOrEqual(500);
    expect(fitted).toBe(`${"A".repeat(300)}.`);
  });

  it("nothing fits → null → an OPEN SLOT, never a mid-sentence fragment", () => {
    expect(fitSignalBody(`${"A".repeat(700)}.`)).toBeNull();
    expect(fitSignalBody(null)).toBeNull();
  });

  it("the built signal body always fits the schema", () => {
    const doc = grid({
      read: { body: `${"A".repeat(400)}. ${"B".repeat(400)}.`, proseDropped: false },
    });
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("THE LOAD-BEARING SENTENCE — a weekly that sends itself", () => {
  it('reads "Schedule it every Tuesday morning." as a WEEKLY cadence', () => {
    const s = scheduleSuggestionFromPrompt(
      "Build a weekly sphere market update for Cape Coral — … Schedule it every Tuesday morning.",
    );
    expect(s?.cadence).toBe("weekly");
    expect(s?.reason.length).toBeLessThanOrEqual(200);
  });

  it("a one-off ask suggests no schedule at all", () => {
    expect(
      scheduleSuggestionFromPrompt("Build me a new-listing email for 326 Shore Dr"),
    ).toBeNull();
  });
});
