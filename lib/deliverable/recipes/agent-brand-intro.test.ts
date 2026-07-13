// lib/deliverable/recipes/agent-brand-intro.test.ts
//
// The invariants of R8 · AGENT BRAND INTRO. Pure units only — no vendor call, no lake
// read, no model call (the live end-to-end proof is a rendered artifact, playbook Part 7).
//
// Each test below is a defect that was REAL in this build, not a hypothetical.

import { describe, expect, test } from "bun:test";
import {
  anchorAddressFromPrompt,
  areaReadFacts,
  brandAgentCard,
  brandAgentName,
  brandHeadshot,
  buildZipAskingSpec,
  latestAsOfIso,
  mdyToIso,
  resolveFarmArea,
  spelledCounts,
  splitAnchorFromArea,
  toZipAsks,
  unanchoredQuantities,
  type ZipAsk,
} from "./agent-brand-intro";
import { DEFAULT_BLOCK_PROPS, SEED_DOCS } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

const SEED =
  "Build an agent-introduction email for my farm area Cape Coral — a ZIP-by-ZIP asking-price chart from live listings, my name and headshot up front, and my newest listing as the anchor.";

const blank = (): EmailDoc => SEED_DOCS.find((s) => s.id === "skeleton-clean-white")!.build();

const AREA = { place: "Cape Coral", zips: ["33904", "33909", "33914", "33990", "33991", "33993"] };

describe("the farm area (spine A)", () => {
  test("a named city resolves to EVERY ZIP it spans, not just one", () => {
    const area = resolveFarmArea(SEED);
    expect(area?.place).toBe("Cape Coral");
    expect(area?.zips.length).toBeGreaterThan(1);
    expect(area?.zips).toContain("33914");
  });

  test("a bare ZIP in the [[blank]] resolves to its city's whole ZIP set", () => {
    const area = resolveFarmArea(SEED.replace("Cape Coral", "33914"));
    expect(area?.place).toBe("Cape Coral");
    expect(area?.zips).toContain("33904");
  });

  test("the ZIP door's scope resolves the area", () => {
    expect(resolveFarmArea("Build an agent-introduction email", "33914")?.place).toBe("Cape Coral");
  });

  test("no SWFL place named → null (never invent a farm area)", () => {
    expect(resolveFarmArea("Build an agent-introduction email for my farm area")).toBeNull();
  });

  test("the ZIP door's scope beats the prompt (a field, not free text)", () => {
    expect(
      resolveFarmArea(`${SEED} My newest listing IS 326 Shore Dr, Fort Myers, FL 33905.`, "34102")
        ?.place,
    ).toBe("Naples");
  });
});

// ── THE HIJACK. THIS IS THE REFUTED DEFECT. ─────────────────────────────────────
//
// The prompt carries BOTH spines, and they are in DIFFERENT CITIES. The crosswalk reads
// a bare ZIP before a place name, so with the anchor's address left in the text, a Cape
// Coral agent shipped an email that said Fort Myers five times and Cape Coral zero.
//
// The FIRST fix cut out only the address `subjectAddressFromPrompt` returns — a matcher
// that is /(listing|property|home|house)\s+at\s+…/ and returns NULL for nearly every
// natural phrasing. It FAILED OPEN on three of the four phrasings below, and the test
// that "locked" it hardcoded the cut string instead of calling the builder's own path.
// These call the resolver the builder actually calls.
describe("the anchor listing can never hijack the farm area", () => {
  const ANCHOR = "326 Shore Dr, Fort Myers, FL 33905";
  const phrasings: [string, string][] = [
    [
      "listing AT (the only shape the old matcher caught)",
      `${SEED} My newest listing at ${ANCHOR}.`,
    ],
    ["listing IS", `${SEED} My newest listing IS ${ANCHOR}.`],
    ["address first", `${ANCHOR} is my newest listing. ${SEED}`],
    ["a bare label", `${SEED} Anchor: ${ANCHOR}.`],
    [
      "no punctuation before the farm area",
      `My newest listing is ${ANCHOR} and I farm Cape Coral.`,
    ],
    [
      "same clause, comma-joined",
      `My farm area is Cape Coral, and my newest listing is ${ANCHOR}.`,
    ],
    ["a new sentence after the ZIP", `My newest listing is ${ANCHOR}. Cape Coral is where I work.`],
    ["no state, no ZIP", `${SEED} My newest listing is 326 Shore Dr, Fort Myers.`],
    ["an unknown street suffix", `${SEED} My newest listing is 500 Bayfront, Naples, FL 34102.`],
    [
      "a unit number and a post-directional",
      `${SEED} Newest listing: 1234 Gulf Shore Blvd N #501, Naples, FL 34102.`,
    ],
  ];

  for (const [name, prompt] of phrasings) {
    test(`${name} → Cape Coral, never the listing's city`, () => {
      const area = resolveFarmArea(prompt);
      expect(area?.place).toBe("Cape Coral");
      expect(area?.zips).toContain("33914");
      expect(area?.zips).not.toContain("33905"); // Fort Myers
      expect(area?.zips).not.toContain("34102"); // Naples
    });
  }

  // FAIL CLOSED. If the ONLY SWFL place in the prompt sits inside the agent's own listing
  // address, we do not assume they farm where their listing sits — that is a claim about
  // the AGENT with no source. Null → the builder logs and falls through. No email beats a
  // wrong-city email.
  test("an address and nothing else → null, never the address's own city", () => {
    expect(
      resolveFarmArea(
        "Build me an agent-introduction email. My newest listing is 326 Shore Dr, Fort Myers, FL 33905.",
      ),
    ).toBeNull();
  });

  // A NUMBER IS NOT AN ADDRESS. The scrub must not eat a clause just because it counts.
  test("a house-number-shaped count does not scrub the farm area away", () => {
    expect(resolveFarmArea("I closed 42 homes last year. My farm area is Cape Coral.")?.place).toBe(
      "Cape Coral",
    );
    expect(
      resolveFarmArea("Cape Coral agent, 2,551 live listings across my farm area.")?.place,
    ).toBe("Cape Coral");
  });

  // The scrub and the anchor are the SAME span — what we refuse to read the area from IS
  // the listing. So the anchor now resolves on the phrasings the old matcher missed, which
  // is why the spec cells fill instead of sitting open.
  test("the address the scrub cuts out is the address the anchor resolves", () => {
    expect(anchorAddressFromPrompt(`${SEED} My newest listing at ${ANCHOR}.`)).toContain(
      "326 Shore Dr",
    );
    expect(anchorAddressFromPrompt(`${SEED} My newest listing IS ${ANCHOR}.`)).toBe(ANCHOR);
    expect(anchorAddressFromPrompt(`${SEED} Anchor: ${ANCHOR}.`)).toBe(ANCHOR);
    expect(anchorAddressFromPrompt(SEED)).toBeNull(); // no address named → an OPEN SLOT
  });

  test("the address's own city and ZIP are cut, and the farm area's clauses survive", () => {
    const { areaClauses, addresses } = splitAnchorFromArea(
      `${SEED} My newest listing IS ${ANCHOR}.`,
    );
    const area = areaClauses.join(" ");
    expect(area).toContain("Cape Coral");
    expect(area).not.toContain("Fort Myers");
    expect(area).not.toContain("33905");
    expect(addresses[0]).toBe(ANCHOR);
  });
});

describe("asking prices by ZIP (the chart's data)", () => {
  // The exact shape loadMarketFigures returns for a zip scope (market-context.ts).
  const fig = (zip: string, listPrice: string | null, asOf = "07/13/2026") => ({
    zip,
    figures: [
      // home_value is ZHVI — a MODELLED index of every home. It must never be the bar.
      {
        key: "home_value",
        label: `Median home value (${zip})`,
        value: "$412,000",
        source: "Zillow ZHVI",
        as_of: asOf,
      },
      ...(listPrice
        ? [
            {
              key: "median_list",
              label: "Median list price",
              value: listPrice,
              source: "SWFL Data Gulf",
              as_of: asOf,
            },
          ]
        : []),
    ],
  });

  test("plots the median LIST price (asking), never the ZHVI home-value index", () => {
    const asks = toZipAsks([fig("33914", "$525,000"), fig("33909", "$344,100")]);
    expect(asks.map((r) => r.medianList)).toEqual([525000, 344100]);
    expect(asks.map((r) => r.medianList)).not.toContain(412000);
  });

  test("richest ZIP first", () => {
    const asks = toZipAsks([
      fig("33909", "$344,100"),
      fig("33914", "$525,000"),
      fig("33991", "$457,500"),
    ]);
    expect(asks.map((r) => r.zip)).toEqual(["33914", "33991", "33909"]);
  });

  // NEVER A ZERO. A ZIP with no median asking price is DROPPED, not plotted at 0 —
  // a zero bar is an invented number wearing a chart costume.
  test("a ZIP with no asking price is dropped, never charted as zero", () => {
    const asks = toZipAsks([fig("33914", "$525,000"), fig("33903", null), fig("33902", "$0")]);
    expect(asks.map((r) => r.zip)).toEqual(["33914"]);
    expect(asks.every((r) => r.medianList > 0)).toBe(true);
  });

  test("as-of: MM/DD/YYYY figures → the LATEST, as the ISO date ChartBlock requires", () => {
    expect(mdyToIso("07/13/2026")).toBe("2026-07-13");
    expect(mdyToIso(undefined)).toBeNull();
    const asks = toZipAsks([
      fig("33914", "$525,000", "07/13/2026"),
      fig("33909", "$344,100", "07/09/2026"),
    ]);
    expect(latestAsOfIso(asks)).toBe("2026-07-13");
    expect(latestAsOfIso([])).toBeNull();
  });
});

describe("the chart spec", () => {
  const asks: ZipAsk[] = [
    { zip: "33914", medianList: 525000 },
    { zip: "33991", medianList: 457500 },
    { zip: "33909", medianList: 344100 },
  ];

  test("plots real dollars per ZIP, cited and dated", () => {
    const spec = buildZipAskingSpec(AREA, asks, "2026-07-13")!;
    expect(spec.chart_type).toBe("bar");
    expect(spec.value_format).toBe("usd");
    expect(spec.rows).toEqual([
      ["33914", 525000],
      ["33991", 457500],
      ["33909", 344100],
    ]);
    expect(spec.asOf).toBe("2026-07-13");
    expect(spec.source?.citation).toBe("SWFL Data Gulf");
    expect(spec.title).toContain("Cape Coral");
  });

  // Two bars is a fact wearing a chart costume — and an empty chart box is worse than no
  // chart. Below the floor the spec is null and the caller drops the slot.
  test("no spec below the 3-ZIP floor, and none without an as-of", () => {
    expect(buildZipAskingSpec(AREA, asks.slice(0, 2), "2026-07-13")).toBeNull();
    expect(buildZipAskingSpec(AREA, asks, null)).toBeNull();
  });
});

describe("the narrator's figures are computed in CODE", () => {
  // DETERMINISTIC MATH, NARRATIVE PROSE. The model kept deriving the high-to-low spread
  // itself ("a spread of about $180,900") — arithmetic on two cited numbers is still an
  // UNSOURCED number under our own no-invention lint. So the spread is handed to it.
  test("the high, the low, and the GAP are all given as facts", () => {
    const facts = areaReadFacts(AREA, [
      { zip: "33914", medianList: 525000 },
      { zip: "33909", medianList: 344100 },
    ]);
    const joined = facts.join("\n");
    expect(joined).toContain("Highest median asking price: $525,000 (33914)");
    expect(joined).toContain("Lowest median asking price: $344,100 (33909)");
    expect(joined).toContain("Gap between the highest and lowest ZIP: $180,900");
    expect(joined).toContain("ZIPs with live for-sale listings in this chart: 2");
  });

  // A COUNT SPELLED IN WORDS IS STILL A COUNT. `extractNumbers` is digit-based, so
  // "the four ZIPs in between" (6 − 2 = 4, arithmetic the MODEL did) walked straight
  // through the anchor gate. It is normalized to digits and gated with the rest.
  test("a spelled-out count is gated exactly like a digit", () => {
    const facts = areaReadFacts(AREA, [
      { zip: "33914", medianList: 525000 },
      { zip: "33991", medianList: 457500 },
      { zip: "33909", medianList: 344100 },
    ]);
    expect(spelledCounts("the four ZIPs in between")).toEqual(["4"]);
    expect(spelledCounts("one of them is on the water")).toEqual([]); // pronominal, not a count
    expect(unanchoredQuantities("the four ZIPs in between", facts)).toEqual(["4"]);
    expect(
      unanchoredQuantities("across the 3 ZIP codes, asking runs $525,000 to $344,100", facts),
    ).toEqual([]);
    expect(unanchoredQuantities("asking runs to $525,001", facts)).toEqual(["$525,001"]);
  });
});

describe("the agent's identity comes from the brand, never from us", () => {
  const branded = (props: Record<string, string>): EmailDoc => {
    const d = blank();
    return {
      ...d,
      blocks: [...d.blocks, { id: "ac", type: "agent-card", props } as EmailDoc["blocks"][number]],
    };
  };

  test("no brand headshot → null → an OPEN SLOT, never a stock photo", () => {
    expect(brandHeadshot(blank())).toBeNull();
    expect(brandHeadshot(branded({ photoUrl: "https://cdn.example/m.jpg" }))).toBe(
      "https://cdn.example/m.jpg",
    );
  });

  test("the HOUSE brand's own name is not the agent's name", () => {
    const house = DEFAULT_BLOCK_PROPS["agent-card"].name!;
    expect(brandAgentName(branded({ name: house }))).toBeNull();
    expect(brandAgentName(branded({ name: "Marisol Vega" }))).toBe("Marisol Vega");
  });

  // THE LEAK: DEFAULT_BLOCK_PROPS["agent-card"].bio is an INSTRUCTION ("A short bio that
  // builds trust with your readers.") and AgentCardBlock does not honor `emailRender` —
  // so a default agent-card ships that sentence to a real recipient. Blank it.
  test("a default agent card never ships its placeholder bio as content", () => {
    const card = brandAgentCard(blank());
    expect(card.type).toBe("agent-card");
    const props = card.props as Record<string, string>;
    expect(props.bio).toBe("");
    expect(props.name).toBe("");
    expect(props.title).toBe("");
    expect(props.bio).not.toContain("builds trust");
  });

  test("a real brand card carries through untouched", () => {
    const props = brandAgentCard(
      branded({ name: "Marisol Vega", title: "Gulfline Realty", bio: "Fifteen years here." }),
    ).props as Record<string, string>;
    expect(props.name).toBe("Marisol Vega");
    expect(props.bio).toBe("Fifteen years here.");
  });
});
