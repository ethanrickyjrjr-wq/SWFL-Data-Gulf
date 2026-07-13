// lib/deliverable/recipes/agent-brand-intro.test.ts
//
// The invariants of R8 · AGENT BRAND INTRO. Pure units only — no vendor call, no lake
// read, no model call (the live end-to-end proof is a rendered artifact, playbook Part 7).
//
// Each test below is a defect that was REAL in this build, not a hypothetical.

import { describe, expect, test } from "bun:test";
import {
  anchorAddressFromPrompt,
  brandAgentCard,
  brandAgentName,
  brandHeadshot,
  buildZipAskingSpec,
  latestAsOfIso,
  mdyToIso,
  placesNamedIn,
  resolveFarmArea,
  settledAreaClaims,
  spelledCounts,
  splitAnchorFromArea,
  stripAnchorSpans,
  toZipAsks,
  unanchoredQuantities,
  violationsIn,
  type ZipAsk,
} from "./agent-brand-intro";
import { DEFAULT_BLOCK_PROPS, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { EmailDocSchema } from "@/lib/email/doc/schema";
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

    // ── THE ONE THAT ACTUALLY SHIPPED. Reproduced end-to-end through authorDoc on
    // 07/13/2026: hero "Fort Myers, Florida", chart "What homes are asking in Fort
    // Myers". THREE holes, each on its own sufficient:
    //   (a) "500 Bayfront" has no street suffix, no "FL", no ZIP — the address scrub
    //       matched NOTHING and cut NOTHING.
    //   (b) the farm cue selected a CLAUSE, and "with" is not a clause boundary, so the
    //       "cued" text still held Fort Myers.
    //   (c) "cape coral" and "fort myers" are BOTH ten characters, so the crosswalk's
    //       longest-needle-first sort TIED and gazetteer order picked the city. The farm
    //       area was decided by a stable sort.
    [
      "THE SHIPPED BUG — a suffix-less street, no comma, no state, no ZIP",
      "I farm Cape Coral with my newest listing at 500 Bayfront in Fort Myers.",
    ],
    [
      "the same, with the anchor named first",
      "My newest listing is 500 Bayfront in Fort Myers. I farm Cape Coral.",
    ],
    ["no cue on the anchor at all, one sentence", "I farm Cape Coral. 500 Bayfront, Fort Myers."],
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

// ── THE FALLBACK FAILS CLOSED ───────────────────────────────────────────────────
//
// The declared span (lane 2) is the anchor-proof lane. Lane 3 exists for a prompt with
// NO farm cue — and there, a place we cannot attribute must never be guessed at. The old
// code called the crosswalk on the whole surviving text, and the crosswalk ALWAYS returns
// something. Returning something is exactly the bug.
describe("with no farm cue, ambiguity is refused — never resolved", () => {
  test("two places and nothing saying which is the farm → null, never a coin flip", () => {
    // Both cities named, no cue, and the anchor is not in an address shape the scrub can
    // see. There is no honest answer here — so there is no answer.
    expect(
      resolveFarmArea("Agent intro email. Cape Coral. My newest place, 500 Bayfront, Fort Myers."),
    ).toBeNull();
  });

  test("the anchor's city alone is never promoted to the farm area", () => {
    // The suffix-less shape the address scrub cannot see. The ANCHOR-SPAN filter catches
    // it instead — two filters, neither of which has to fire for the other to hold.
    expect(
      resolveFarmArea("Build an agent intro. My newest listing at 500 Bayfront in Fort Myers."),
    ).toBeNull();
    expect(stripAnchorSpans("My newest listing at 500 Bayfront in Fort Myers.")).not.toContain(
      "Fort Myers",
    );
  });

  test("one unambiguous place, no cue → that IS the farm area", () => {
    expect(
      resolveFarmArea(`My newest listing is ${"326 Shore Dr, Fort Myers, FL 33905"}. Cape Coral.`)
        ?.place,
    ).toBe("Cape Coral");
  });
});

// ── THE SHADOWING TRAP ──────────────────────────────────────────────────────────
//
// `zipFromPromptPlace` scans needles LONGEST FIRST. Enumerating places over sliding
// windows without anchoring each hit to its start word makes a LONGER later needle EAT a
// shorter earlier one: "Estero and Fort Myers" reads as ["Fort Myers"] alone — one place,
// unanimous, confident, and WRONG. An Estero agent would get a Fort Myers email and the
// ambiguity gate would never fire, because it would never see the ambiguity.
describe("every place is enumerated — a longer needle never eats a shorter one", () => {
  test("a short place before a long one survives", () => {
    expect(placesNamedIn("Estero and Fort Myers")).toEqual(["Estero", "Fort Myers"]);
    expect(placesNamedIn("I farm Estero, my listing is in Fort Myers")).toContain("Estero");
  });

  test("a place is counted ONCE, at its longest form", () => {
    expect(placesNamedIn("Fort Myers Beach")).toEqual(["Fort Myers Beach"]);
    expect(placesNamedIn("Cape Coral")).toEqual(["Cape Coral"]);
  });

  test("both cities in the shipped bug are seen — which is why it is refused", () => {
    expect(
      placesNamedIn("I farm Cape Coral with my newest listing at 500 Bayfront in Fort Myers"),
    ).toEqual(["Cape Coral", "Fort Myers"]);
  });

  test("no SWFL place named → nothing", () => {
    expect(placesNamedIn("Build an agent-introduction email")).toEqual([]);
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

// ── THE CLAIM GATE (lib/deliverable/claims.ts) ──────────────────────────────────
//
// Invention is CLAIM-shaped, not number-shaped. Four of seven deliverables shipped a
// falsehood on 07/13 with every underlying figure correctly sourced — what was invented
// was the claim drawn BETWEEN correctly-sourced numbers.
//
// THE DONE-CONDITION IS STRUCTURAL, AND THIS IS THE TEST OF IT: the narrator receives no
// raw set. It cannot compare two ZIPs because it was never handed two.
describe("the narrator is never given anything to compare", () => {
  const ROWS: ZipAsk[] = [
    { zip: "33914", medianList: 525000 },
    { zip: "33991", medianList: 457500 },
    { zip: "33990", medianList: 412000 },
    { zip: "33909", medianList: 344100 },
  ];

  // THE STRUCTURAL DONE-CONDITION. The old facts list was one line PER ZIP — the raw set,
  // handed straight to a model, which is how market-pulse wrote "five of those six ZIPs"
  // over a set whose true count was four.
  test("NO RAW SET: the per-ZIP rows appear nowhere in what the model is handed", () => {
    const handed = settledAreaClaims(AREA, ROWS)
      .map((s) => s.sentence)
      .join("\n");
    // The middle of the distribution does not exist as far as the narrator is concerned.
    expect(handed).not.toContain("33991");
    expect(handed).not.toContain("457,500");
    expect(handed).not.toContain("33990");
    expect(handed).not.toContain("412,000");
  });

  // Every relation is decided by integer arithmetic, in code. Re-derived by hand:
  //   count   — 4 rows carry a median asking price; Cape Coral spans 6 ZIPs → "4 of 6".
  //   low     — min(525000, 457500, 412000, 344100) = 344,100 (33909).
  //   high    — max(...)                            = 525,000 (33914).
  //   spread  — 525000 − 344100                     = 180,900.
  test("the count, the ordering and the spread are all computed in CODE", () => {
    const handed = settledAreaClaims(AREA, ROWS)
      .map((s) => s.sentence)
      .join("\n");
    expect(handed).toContain("4 of 6 ZIP codes in Cape Coral");
    expect(handed).toContain("$344,100 in 33909");
    expect(handed).toContain("$525,000 in 33914");
    expect(handed).toContain("a spread of $180,900");
  });

  test("all-of is stated as ALL, never as a bare count", () => {
    const handed = settledAreaClaims({ place: "Estero", zips: ["33928", "34135"] }, [
      { zip: "33928", medianList: 700000 },
      { zip: "34135", medianList: 600000 },
    ])
      .map((s) => s.sentence)
      .join("\n");
    expect(handed).toContain("All 2 ZIP codes in Estero");
    expect(handed).toContain("a spread of $100,000"); // 700,000 − 600,000
  });

  // FAIL-CLOSED BACKSTOP. Structure is the defense; this is the net under it. Each of
  // these is a real 07/13 failure re-aimed at THIS recipe's data.
  describe("auditClaims drops the paragraph rather than ship the claim", () => {
    const settled = settledAreaClaims(AREA, ROWS);
    const bad = (prose: string) => violationsIn(prose, settled);

    test("a COMPARISON the model drew itself", () => {
      // market-comps' exact failure: a relation between two figures, asserted by a model.
      expect(bad("33991 sits above the median asking price.").length).toBeGreaterThan(0);
    });
    test("a TRAJECTORY, from levels that hold no trend at all", () => {
      // sphere-weekly: "the gap is widening", given ONE level and no time series.
      expect(bad("The gap between the ZIPs is widening.").length).toBeGreaterThan(0);
    });
    test("a COUNT the model did itself", () => {
      // market-pulse: "five of those six ZIPs". No digits in it — a digit lint sails past.
      expect(bad("Most of the ZIPs ask above the middle.").length).toBeGreaterThan(0);
    });
    test("a MOTIVE — we never know why anyone did anything", () => {
      expect(bad("Sellers here are motivated.").length).toBeGreaterThan(0);
    });
    test("a number that anchors to nothing we handed it", () => {
      expect(bad("Asking runs as high as $525,001.").length).toBeGreaterThan(0);
    });

    // AND IT DOES NOT EAT AN HONEST PARAGRAPH. A gate that fires on the truth costs a
    // deliverable its prose and teaches the next author to weaken it.
    test("the settled sentences themselves pass, restated verbatim", () => {
      const honest =
        `${settled[0].sentence} ${settled[1].sentence} ` +
        `These are asking prices on live listings, not what homes sold for.`;
      expect(bad(honest)).toEqual([]);
    });
  });

  // ── WHY AN ANCHOR GATE IS NOT ENOUGH, IN ONE TEST ─────────────────────────────
  //
  // "the four ZIPs in between" is a claim the model DERIVED (a count of the ZIPs strictly
  // between the top and the bottom). We never gave it that count.
  //
  // But the settled count sentence legitimately reads "4 of 6 ZIP codes…" — so the digit
  // "4" IS in the anchor set, and the ANCHOR GATE PASSES IT. A number-shaped lint cannot
  // tell a sourced 4 from a coincidentally-equal derived 4, because the invention is not
  // in the number. It is in the CLAIM.
  //
  // `auditClaims` catches it on SHAPE — a count, stated in words, that code did not make.
  // That is the whole thesis of the claim gate, and this is the test of it.
  test("a derived count slips the ANCHOR gate and is caught by the CLAIM gate", () => {
    const settled = settledAreaClaims(AREA, ROWS);
    const facts = settled.map((s) => s.sentence);

    expect(spelledCounts("the four ZIPs in between")).toEqual(["4"]);
    expect(spelledCounts("one of them is on the water")).toEqual([]); // pronominal, not a count

    // The digit lint is blind here: "4" is a legitimately sourced anchor.
    expect(unanchoredQuantities("the four ZIPs in between", facts)).toEqual([]);
    // The claim lint is not.
    expect(violationsIn("the four ZIPs in between", settled)).toContainEqual(
      expect.stringContaining("word-count"),
    );

    // And a genuinely unsourced FIGURE is still caught by the anchor gate.
    expect(unanchoredQuantities("asking runs to $525,001", facts)).toEqual(["$525,001"]);
  });
});

// ── THE OPEN SLOT MUST SURVIVE THE SCHEMA ───────────────────────────────────────
//
// THE CRUELEST BUG IN THIS BUILD, AND IT WAS MINE. The open-slot instruction I added to
// PREVENT the wrong-city email was 138 characters. `StatItem.label` is `z.string().max(60)`
// (doc/schema.ts:82). So the doc failed validation — and authorDoc's answer to an invalid
// builder doc is to DISCARD THE BUILDER AND RUN THE GENERIC AUTHOR, which scans the whole
// prompt for a place and shipped a FORT MYERS email to the Cape Coral agent, hero and all.
//
// Caught only by rendering it and counting the cities. A mechanism that fails the schema
// does not degrade — it hands the build to something with no guard at all.
describe("an open-slot label can never break the doc schema", () => {
  // The REAL gate — EmailDocSchema is exactly what authorDoc validates the builder's doc
  // against before deciding whether to keep it or fall back to the generic author.
  const docWithStatLabel = (label: string): EmailDoc => {
    const d = blank();
    return {
      ...d,
      blocks: [
        ...d.blocks,
        {
          id: "s1",
          type: "stats",
          props: { stats: [{ value: "", label }] },
        } as EmailDoc["blocks"][number],
      ],
    };
  };

  test("every open-slot label this builder can emit survives EmailDocSchema", () => {
    const labels = [
      'Which area do you farm? Add "I farm <city or ZIP>"', // the no-farm-area slot
      "Price",
      "Beds",
      "Baths",
      "Sq Ft",
      "$/Sq Ft",
      "Lot",
    ];
    for (const l of labels) {
      expect(EmailDocSchema.safeParse(docWithStatLabel(l)).success).toBe(true);
    }
  });

  test("and the schema really does reject the 138-char one that shipped (teeth)", () => {
    const tooLong =
      'which area do you farm? add "I farm Cape Coral" (or your ZIP) to the build box, ' +
      "and we'll chart what homes are asking there, ZIP by ZIP";
    expect(tooLong.length).toBeGreaterThan(60);
    expect(EmailDocSchema.safeParse(docWithStatLabel(tooLong)).success).toBe(false);
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
