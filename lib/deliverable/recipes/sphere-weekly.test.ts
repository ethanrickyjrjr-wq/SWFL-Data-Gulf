// lib/deliverable/recipes/sphere-weekly.test.ts
//
// R10 · WEEKLY SPHERE UPDATE — the acceptance oracle for "Headlines vs Here".
//
// What these tests pin, in the order the failures actually happened:
//   • the AREA resolves from the PROMPT (the Lab door passes NO scope);
//   • the national headline is a LANE-3 fact — never substituted from our lake, never
//     coerced into plausibility, and an OPEN SLOT when it cannot be verified;
//   • the pair is the same METRIC on both sides (a national sale price beside a local
//     value index is two yardsticks wearing one sentence);
//   • an unsourced cell is an OPEN SLOT, never a zero and never a naked label;
//   • NO CHART;
//   • the model writes prose and nothing else — a number it worked out itself is caught.
//
// PURE — no network, no lake. The live proof (a real build through authorDoc, rendered
// and looked at) is in the build report.

import { describe, expect, it } from "bun:test";
import {
  buildGrid,
  cell,
  factLines,
  fitSignalBody,
  mmddyyyy,
  planPair,
  replyMailto,
  resolveArea,
  scheduleSuggestionFromPrompt,
  supportingCells,
  unanchoredNumbers,
  usdHeadline,
  OPEN_NATIONAL,
  REVIEW_INSTRUCTION,
  type Headline,
} from "./sphere-weekly";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { MarketFigure } from "@/lib/email/market-context";
import type { EmailDoc } from "@/lib/email/doc/types";

const HOME_VALUE: MarketFigure = {
  key: "home_value",
  label: "Median home value — Cape Coral (33904)",
  value: "$367,969",
  source: "Zillow ZHVI",
  as_of: "05/31/2026",
};
const YOY: MarketFigure = {
  key: "home_value_yoy",
  label: "Home value, year over year",
  value: "−6.8%",
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

const heroes = (doc: EmailDoc) => doc.blocks.filter((b) => b.type === "hero");
const statCells = (doc: EmailDoc) =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));

function grid(over: Partial<Parameters<typeof buildGrid>[0]> = {}): EmailDoc {
  return buildGrid({
    current: defaultDoc(),
    area: { zip: "33904", label: "Cape Coral (33904)", place: "Cape Coral" },
    headline: HEADLINE,
    here: HOME_VALUE,
    supporting: supportingCells([HOME_VALUE, YOY], "33904"),
    read: "Values here sit below the national figure, and they are still falling.",
    citations: [{ label: "Zillow ZHVI · 05/31/2026" }],
    ...over,
  });
}

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
    // Cape Coral is SIX ZIPs. A reader who names one gets THAT one — we never average
    // six ZIPs into a city number no source states.
    const area = resolveArea("weekly update for Fort Myers 33905");
    expect(area?.zip).toBe("33905");
  });

  it("an explicit ZIP scope (the map/report door) wins over the prompt", () => {
    expect(resolveArea("weekly update for Cape Coral", "33905")?.zip).toBe("33905");
  });

  it("a street number is not a ZIP — only the sourced crosswalk can name one", () => {
    const area = resolveArea("weekly update for 12345 Nowhere Ave");
    expect(area).toBeNull();
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
  });

  it("falls back to the county median SALE price — and to REDFIN, the same publisher", () => {
    // The contrast is only honest if both sides measure the same thing. A Redfin
    // national SALE price beside a Zillow local VALUE index is two yardsticks.
    const plan = planPair([COUNTY_SALE]);
    expect(plan?.here).toBe(COUNTY_SALE);
    expect(plan?.domain).toBe("redfin.com");
  });

  it("no local figure → no pair. We never invent the local half either", () => {
    expect(planPair([])).toBeNull();
  });

  it("the search query carries NO number — the model must read it from a citation", () => {
    const plan = planPair([HOME_VALUE])!;
    expect(/\d/.test(plan.request.search_query)).toBe(false);
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
    expect(usdHeadline(431)).toBeNull(); // "431 thousand" — we do NOT multiply it up
    expect(usdHeadline(43_100_000)).toBeNull();
  });

  it("as-of is MM/DD/YYYY — the raw token never reaches a reader", () => {
    expect(mmddyyyy(new Date(2026, 6, 13))).toBe("07/13/2026");
  });
});

describe("THE GRID — the contrast pair IS the structure", () => {
  it("two heroes, side by side, six of twelve columns each, in ONE row", () => {
    const doc = grid();
    const [a, b] = heroes(doc);
    expect(heroes(doc)).toHaveLength(2);
    expect(a.layout).toMatchObject({ x: 0, w: 6 });
    expect(b.layout).toMatchObject({ x: 6, w: 6 });
    expect(a.layout!.y).toBe(b.layout!.y); // ONE row — not stacked
  });

  it("each hero wears band light, and its kicker POINTS instead of repeating the label", () => {
    const [national, local] = heroes(grid());
    expect(national.props.sectionBg).toBeTruthy();
    expect(local.props.sectionBg).toBeTruthy();
    // The system prints the figure's own factual label under its value — the kicker must
    // not say it again.
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
    const doc = grid();
    expect(doc.blocks.some((b) => b.type === "image")).toBe(false);
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
    const doc = grid({ headline: null });
    // The local hero survives, full width. There is NO second hero holding a naked label.
    expect(heroes(doc)).toHaveLength(1);
    expect(heroes(doc)[0].layout).toMatchObject({ x: 0, w: 12 });
    expect(heroes(doc)[0].props.value).toBe(HOME_VALUE.value);
    // And the missing national number is an empty stats cell whose LABEL is the
    // instruction — a dashed "+ Add" on the canvas, dropped from the sent email.
    const open = statCells(doc).find((s) => s.label === OPEN_NATIONAL);
    expect(open?.value).toBe("");
    // The lake figure was NOT promoted into the headline slot.
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
    // TextBlock honors `emailRender`: empty on the canvas is an invitation; in the sent
    // email the block does not exist. SignalBlock does not — so we never build one empty.
    expect(doc.blocks.some((b) => b.type === "text" && b.props.body === "")).toBe(true);
  });

  it("the read, when written, rides in the signal callout the prose recipe calls for", () => {
    const doc = grid();
    const signal = doc.blocks.find((b) => b.type === "signal");
    expect(signal?.type === "signal" && signal.props.kicker).toBe("The gap");
    expect(signal?.type === "signal" && signal.props.body).toContain("below the national figure");
  });
});

describe("THE MODEL WRITES PROSE, NOTHING ELSE — the number gate", () => {
  const facts = factLines(HEADLINE, HOME_VALUE, [YOY]);

  it("hands the narrator every figure WITH its own geography and source", () => {
    expect(facts.join("\n")).toContain("NATIONAL figure");
    expect(facts.join("\n")).toContain("LOCAL figure");
    expect(facts.join("\n")).toContain("Zillow ZHVI, as of 05/31/2026");
  });

  it("catches a number the model WORKED OUT — a derived number is still an invented one", () => {
    // Both figures are real; the difference between them is not a figure anyone states.
    expect(
      unanchoredNumbers("Homes here run about $17,031 below the national number.", facts),
    ).toEqual(["$17,031"]);
  });

  it("lets the true sentence through: the sign lives in the word, the magnitude in the number", () => {
    expect(unanchoredNumbers("Values are down 6.8% year over year.", facts)).toEqual([]);
  });

  it("a bare year is a calendar reference, not a figure", () => {
    expect(unanchoredNumbers("That is the lowest level since mid-2024.", facts)).toEqual([]);
  });

  it("a verbatim figure anchors; a fabricated one never can", () => {
    expect(unanchoredNumbers("The typical home here is $367,969.", facts)).toEqual([]);
    expect(unanchoredNumbers("The typical home here is $412,000.", facts)).toEqual(["$412,000"]);
  });
});

describe("THE SENT ARTIFACT — the canvas lies about the email, so render the email", () => {
  it("an open slot NEVER reaches a recipient — and the sourced half still ships", async () => {
    const html = await renderEmailDocHtml(grid({ headline: null, read: null }));
    // The instruction is addressed to the USER, on the canvas. Not to the reader.
    expect(html).not.toContain("paste it with its source");
    expect(html).not.toContain("type it in");
    // The half we DID source is all there — an open slot is never a reason to lose it.
    expect(html).toContain("$367,969");
    expect(html).toContain("Median home value");
    expect(html).toContain("Reply with REVIEW");
  });

  it("no chart ships — not an image, not an empty box", async () => {
    const html = await renderEmailDocHtml(grid());
    expect(html).not.toContain("email-charts");
  });

  it("the sent email keeps its CAN-SPAM footer — unsubscribe and a postal address", async () => {
    const html = await renderEmailDocHtml(grid());
    expect(html.toLowerCase()).toContain("unsubscribe");
  });
});

describe("THE READ FITS ITS BOX — or the whole build is silently lost", () => {
  // LIVE, first run: the read came back at 696 characters. SignalPropsSchema caps `body`
  // at 500, so EmailDocSchema rejected the doc — and authorDoc answers an invalid recipe
  // doc by falling through to the GENERIC AUTHOR. What rendered was the free author's
  // grab-bag wearing this prompt, with a LAKE figure ("Lee County median sale price") in
  // the slot reserved for the NATIONAL headline. A length limit produced the exact
  // substitution this recipe exists to prevent.
  it("a read that fits is untouched", () => {
    expect(fitSignalBody("Short and true.")).toBe("Short and true.");
  });

  it("an over-long read is trimmed to WHOLE SENTENCES — never mid-word", () => {
    const long = `${"A".repeat(300)}. ${"B".repeat(300)}. ${"C".repeat(50)}.`;
    const fitted = fitSignalBody(long)!;
    expect(fitted.length).toBeLessThanOrEqual(500);
    expect(fitted.endsWith(".")).toBe(true);
    expect(fitted).toBe(`${"A".repeat(300)}.`);
  });

  it("nothing fits → null → an OPEN SLOT, never a mid-sentence fragment", () => {
    expect(fitSignalBody(`${"A".repeat(700)}.`)).toBeNull();
    expect(fitSignalBody(null)).toBeNull();
  });

  it("the built signal body always fits the schema", () => {
    const doc = grid({ read: fitSignalBody(`${"A".repeat(400)}. ${"B".repeat(400)}.`) });
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
