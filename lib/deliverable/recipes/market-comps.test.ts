// lib/deliverable/recipes/market-comps.test.ts
//
// The invariants this recipe cannot lose. Every fixture below is a VERBATIM copy of a
// real row `compsForAddress("326 Shore Dr, Fort Myers, FL 33905")` returned live on
// 07/13/2026 — including `315 Shore Dr`, the vacant lot that has to be filtered out.
// Pure/offline: the grid builder and the row/label helpers take no network.

import { test, expect } from "bun:test";
import {
  BANNED_CONTEXT_PHRASES,
  buildCompsGrid,
  buildPriceCase,
  contextViolations,
} from "./market-comps";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** The known-good subject (live vendor record, 07/13/2026). */
const SUBJECT: ListingFacts = {
  address: "326 Shore Dr, Fort Myers, FL, 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  isNewConstruction: true,
  isPriceReduced: true,
  priceReduction: "$104,975",
  photos: ["https://ap.rdcpix.com/a947089bd7bb5c4ec2fc5334419ff3a0l-m389213793s-w480_h360_x2.webp"],
  sourceUrl: "https://www.swfldatagulf.com",
};

function comp(over: Partial<RenderComp>): RenderComp {
  return {
    addressLine: "",
    city: "Fort Myers",
    beds: 3,
    baths: 2,
    sqft: 1736,
    status: "sold",
    price: 300000,
    priceKind: "sold",
    priceDate: "2025-08-29",
    sourceUrl: "https://www.realtor.com/realestateandhomes-detail/x",
    ...over,
  };
}

/** The live nearby set, verbatim — 5 homes and ONE VACANT LOT. */
const NEARBY: RenderComp[] = [
  comp({ addressLine: "330 Shore Dr Lot 59", sqft: 1736, price: 300000, priceKind: "sold" }),
  comp({
    addressLine: "336 Shore Dr Lot 58",
    sqft: 1976,
    price: 385000,
    priceKind: "sold",
    priceDate: "2025-05-23",
  }),
  comp({
    addressLine: "141 Coral Dr",
    sqft: 1744,
    price: 366400,
    priceKind: "estimate",
    priceDate: "2026-06-08",
  }),
  // *** THE VACANT LOT. *** beds/baths/sqft all null, $139,800. It looks exactly like
  // its neighbors by NAME — the only thing that gives it away is the DATA.
  comp({
    addressLine: "315 Shore Dr",
    beds: null,
    baths: null,
    sqft: null,
    price: 139800,
    priceKind: "estimate",
    priceDate: "2026-06-08",
  }),
  comp({
    addressLine: "143 Coral Dr",
    beds: 2,
    sqft: 1452,
    price: 335437,
    priceKind: "estimate",
    priceDate: "2026-07-08",
  }),
  comp({
    addressLine: "335 Shore Dr",
    sqft: 2557,
    price: 680900,
    priceKind: "estimate",
    priceDate: "2026-06-08",
  }),
];

/** What buildMarketComps hands the grid: the land already filtered out. */
const HOMES = NEARBY.filter((c) => c.beds != null && c.sqft != null && c.price != null);

/** A real committed seed as "the doc on the canvas" — its brand + identity blocks
 *  (header, agent card, footer) are what must survive into the built comps email. */
function canvas(): EmailDoc {
  const seed = SEED_DOCS.find((d) => d.id === "new-listing");
  if (!seed) throw new Error("seed missing");
  return seed.build();
}

const statsOf = (doc: EmailDoc) =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));
const listOf = (doc: EmailDoc) => doc.blocks.find((b) => b.type === "list");

// ── THE LOAD-BEARING RULE ────────────────────────────────────────────────────

test("the vacant lot never reaches the chart, the table, or the math", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const html = JSON.stringify(doc);
  expect(HOMES).toHaveLength(5);
  expect(HOMES.some((c) => c.addressLine === "315 Shore Dr")).toBe(false);
  // The $139,800 lot must appear NOWHERE — not a row, not a range bound, not a median.
  expect(html).not.toContain("139,800");
  expect(html).not.toContain("315 Shore Dr");
});

test("the $/sq ft math is computed from real pairs only — never back-solved", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const cells = statsOf(doc);
  // Subject: $595,000 / 2,847 sq ft = $209.
  expect(cells.find((c) => c.label === "$/Sq Ft — this home")?.value).toBe("$209");
  // Comps (land excluded): 173, 195, 210, 231, 266 → median 210, range 173–266.
  const med = cells.find((c) => c.label.startsWith("$/Sq Ft — median"));
  expect(med?.value).toBe("$210");
  // The spread rides in the LABEL — a 9-character value wraps mid-value in a stat cell.
  expect(med?.label).toBe("$/Sq Ft — median of the comps ($173–$266 across the set)");
  // Had the $139,800 lot survived, the low bound would have collapsed the range.
});

test("every stat label fits the schema cap (a 61-char label kills the build)", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(statsOf(doc).every((c) => c.label.length <= 60 && c.value.length <= 24)).toBe(true);
});

test("the price-kind mix is stated on the face of the email", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const mix = statsOf(doc).find((c) => c.label.startsWith("Comparable homes"));
  expect(mix?.value).toBe("5");
  expect(mix?.label).toBe("Comparable homes (2 recorded sales, 3 valuations)");
});

test("a valuation is never dressed as a sale in a row", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const items =
    listOf(doc)?.type === "list"
      ? (listOf(doc) as { props: { items: unknown[] } }).props.items
      : [];
  const rows = items as { lead?: string; text: string; linkUrl?: string }[];
  expect(rows).toHaveLength(5);
  const sold = rows.find((r) => r.text.startsWith("330 Shore Dr Lot 59"));
  expect(sold?.lead).toBe("$300,000 · $173/sq ft");
  expect(sold?.text).toContain("Sold 08/29/2025");
  const est = rows.find((r) => r.text.startsWith("141 Coral Dr"));
  expect(est?.lead).toBe("$366,400 · $210/sq ft");
  expect(est?.text).toContain("Estimated value 06/08/2026");
  expect(est?.text).not.toContain("Sold");
  // Every row links out to its own captured page.
  expect(rows.every((r) => Boolean(r.linkUrl))).toBe(true);
});

// ── THE OPEN-SLOT CONTRACT ───────────────────────────────────────────────────

test("no comps → the grid still lands, with open slots and no zeros", () => {
  const doc = buildCompsGrid(SUBJECT, [], canvas());
  const cells = statsOf(doc);
  const evidence = cells.filter((c) => c.label.startsWith("$/Sq Ft — median"));
  expect(evidence[0]?.value).toBe(""); // an OPEN SLOT — never "$0", never a naked label
  expect(cells.every((c) => c.value !== "0" && c.value !== "$0")).toBe(true);
  expect(listOf(doc)).toBeUndefined(); // no rows → no empty table shell
  expect(doc.blocks.some((b) => b.type === "hero")).toBe(true); // the grid still lands
});

test("an unsourced cell is absent from the SENT email, present on the canvas", async () => {
  const bare: ListingFacts = {
    address: "1 Nowhere Ln, Fort Myers, FL",
    photos: [],
    sourceUrl: "x",
  };
  const doc = buildCompsGrid(bare, [], canvas());
  const html = await renderEmailDocHtml(doc);
  // The email carries no naked label whose cell we could not source.
  expect(html).not.toContain("$/Sq Ft — median of the comps");
  expect(html).not.toContain("Comparable homes (");
  // ...and no zero snuck in where a number was missing.
  expect(html).not.toContain(">$0<");
});

// ── THE STRUCTURE ────────────────────────────────────────────────────────────

test("every block is positioned, so it compiles through the GRID renderer", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(doc.blocks.every((b) => b.layout)).toBe(true);
});

test("the chart slot is reserved, empty, and its own kind", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const chart = doc.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
  expect(chart).toBeTruthy();
  expect(chart?.type === "image" && chart.props.url).toBe("");
  // The photo slot is a DIFFERENT block — the chart upsert must never eat the photo.
  const photo = doc.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
  expect(photo?.type === "image" && photo.props.url).toBe(SUBJECT.photos[0]);
});

test("the commentary slot is EMPTY so fillNarrative can write into it", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const text = doc.blocks.find((b) => b.type === "text");
  // fillNarrative SKIPS a text block that already has content — a prefilled slot is
  // how 2,000 characters of raw MLS copy shipped on 07/13.
  expect(text?.type === "text" && text.props.body).toBe("");
});

test("the hero wears the Market Comps hat, not the New Listing one", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const hero = doc.blocks.find((b) => b.type === "hero");
  expect(hero?.type === "hero" && hero.props.kicker).toBe("Market Comps");
  expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
});

test("brand is sticky — a real user brand is never overwritten", () => {
  const branded = canvas();
  branded.globalStyle = { ...branded.globalStyle, accentColor: "#FF0000" };
  const doc = buildCompsGrid(SUBJECT, HOMES, branded);
  expect(doc.globalStyle.accentColor).toBe("#FF0000");
});

test("citations ride in the collapsed accordion, never a vendor name inline", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const src = doc.blocks.find((b) => b.type === "sources");
  expect(src?.type === "sources" && src.props.sources.map((s) => s.label)).toEqual([
    "SWFL Data Gulf",
    "realtor.com",
  ]);
  // The vendor is never named anywhere in the doc.
  expect(JSON.stringify(doc)).not.toContain("SteadyAPI");
});

// ── THE DIRECTIONAL GUARD ────────────────────────────────────────────────────
//
// This recipe shipped an INVERTED comparative: "$209 … sits just below the $213 median —
// and below the two recorded sales … which closed at $173 and $195 per square foot."
// $209 is ABOVE both sales. Every test below exists because a comparison is a factual
// claim, and the narrator proved it cannot be trusted to make one.

test("THE REFUTED SENTENCE: the ask is ABOVE both recorded sales, and the code says so", () => {
  const pc = buildPriceCase(SUBJECT, HOMES);
  expect(pc).toBeTruthy();
  if (!pc) throw new Error("no case");

  // The arithmetic, restated independently of the implementation.
  // $595,000 / 2,847 = $209. Comps: 173, 195, 210, 231, 266 → median 210.
  expect(pc.subjectPpsf).toBe(209);
  expect(pc.medianPpsf).toBe(210);
  expect(pc.soldPpsf).toEqual([173, 195]); // 330 Shore Dr Lot 59, 336 Shore Dr Lot 58

  // 209 < 210 → below the median. 209 > 195 > 173 → ABOVE both recorded sales.
  expect(pc.vsMedian).toEqual({ dir: "below", diff: 1 });
  expect(pc.vsSold).toBe("above"); // ← the claim that shipped inverted
  expect(pc.lowerCount).toBe(2);
  expect(pc.higherCount).toBe(3);

  // And the sentence that ships says it out loud.
  expect(pc.verdict).toContain("above both recorded sales in the set ($173 and $195 per square");
  // The exact falsehood can never appear again.
  expect(pc.verdict).not.toContain("below both recorded sales");
  expect(pc.verdict).not.toMatch(/below the recorded sales/i);
});

test("the verdict's direction word always matches the arithmetic — above, below, level", () => {
  const cases: { price: string; sqft: string; dir: string; want: RegExp }[] = [
    // $595,000 / 2,847 = $209 vs median $210 → BELOW by $1.
    { price: "$595,000", sqft: "2847", dir: "below", want: /sits \$1 below the \$210 median/ },
    // $700,000 / 2,847 = $246 vs median $210 → ABOVE by $36.
    { price: "$700,000", sqft: "2847", dir: "above", want: /sits \$36 above the \$210 median/ },
    // $597,870 / 2,847 = $210 exactly → LEVEL. No diff sentence, no direction word.
    { price: "$597,870", sqft: "2847", dir: "level", want: /is level with the \$210 median/ },
  ];
  for (const c of cases) {
    const pc = buildPriceCase({ ...SUBJECT, price: c.price, sqft: c.sqft }, HOMES);
    if (!pc) throw new Error("no case for " + c.price);
    expect(pc.vsMedian.dir).toBe(c.dir);
    expect(pc.verdict).toMatch(c.want);
    // The relation and the prose can never disagree: the direction stated is the
    // direction computed, and the computed direction is a raw integer compare.
    const truth =
      pc.subjectPpsf === pc.medianPpsf
        ? "level"
        : pc.subjectPpsf > pc.medianPpsf
          ? "above"
          : "below";
    expect(pc.vsMedian.dir).toBe(truth);
  }
});

test("position in the set is COUNTED, never characterized as a 'low end of the band'", () => {
  // The second false claim in the same paragraph: "the subject falls at the low end of
  // that band" when $209 sat BELOW a $210–$266 band entirely. We state counts instead.
  const pc = buildPriceCase(SUBJECT, HOMES);
  expect(pc?.verdict).toContain(
    "Of the 5 comparable homes, 2 carry a lower price per square foot and 3 carry a higher one.",
  );
  expect(pc?.verdict).not.toMatch(/low end|high end|band/i);

  // Below every comp → we say exactly that, not "at the low end".
  const cheap = buildPriceCase({ ...SUBJECT, price: "$200,000" }, HOMES); // $70/sq ft
  expect(cheap?.higherCount).toBe(5);
  expect(cheap?.verdict).toContain("Every one of the 5 comparable homes carries a higher price");
});

test("a valuation is never counted as a recorded sale in the comparison", () => {
  const pc = buildPriceCase(SUBJECT, HOMES);
  // 5 comps, but only the 2 `priceKind: "sold"` rows are in the sales relation.
  expect(pc?.n).toBe(5);
  expect(pc?.soldPpsf).toHaveLength(2);
  // With no recorded sale in the set, there is no sales sentence at all — we do not
  // promote a valuation to fill it.
  const allEst = HOMES.map((c) => ({ ...c, priceKind: "estimate" as const }));
  const noSales = buildPriceCase(SUBJECT, allEst);
  expect(noSales?.vsSold).toBeNull();
  expect(noSales?.verdict).not.toMatch(/recorded sale/i);
});

test("no computable comparison → NO paragraph (an open slot), never a total-price guess", () => {
  // The refutation's rule: if you cannot compute a defensible comparison, it does not ship.
  expect(buildPriceCase(SUBJECT, [])).toBeNull(); // no comps
  expect(buildPriceCase({ ...SUBJECT, sqft: undefined }, HOMES)).toBeNull(); // no $/sq ft
  expect(buildPriceCase({ ...SUBJECT, price: undefined }, HOMES)).toBeNull(); // no ask
  // Comparing a $595,000 ask to comp TOTALS across different-sized homes is not
  // defensible, so it is not attempted.
});

// ── THE LINT ON THE NARRATOR ─────────────────────────────────────────────────

const PC = (() => {
  const pc = buildPriceCase(SUBJECT, HOMES);
  if (!pc) throw new Error("fixture case must build");
  return pc;
})();

test("THE LINT CATCHES THE EXACT SENTENCE THAT SHIPPED", () => {
  const shipped =
    "At $209 per square foot, the asking price for 326 Shore Dr sits just below the $213 " +
    "median — and below the two recorded sales on Shore Dr, which closed at $173 and $195 " +
    "per square foot.";
  const hits = contextViolations(shipped, SUBJECT, HOMES, PC);
  expect(hits.length).toBeGreaterThan(0);
  // Caught for the comparative it drew...
  expect(hits.join(" | ")).toContain('"below"');
  // ...for reaching for the median at all (the code owns that relation)...
  expect(hits.join(" | ")).toContain('"median"');
  // ...for putting the comps on a named road we were never given ("on Shore Dr" — the
  // word "street" is absent, which is exactly why the SUFFIX is banned)...
  expect(hits.join(" | ")).toContain('"dr"');
  // ...and for the $213, which is not a number this comp set produces.
  expect(hits.join(" | ")).toContain('unsourced number: "$213"');
});

test("the narrator may not name a road — the suffix ban, not just the word 'street'", () => {
  for (const line of [
    "The two sales on Shore Dr tell the story.",
    "Both are on Coral Dr.",
    "Values along McGregor Blvd have held.",
    "It sits on a quiet lane.",
  ]) {
    expect(contextViolations(line, SUBJECT, HOMES, PC).length).toBeGreaterThan(0);
  }
});

test("the lint rejects any comparative the narrator could reach for", () => {
  for (const phrase of BANNED_CONTEXT_PHRASES) {
    const hits = contextViolations(`The home is ${phrase} something.`, SUBJECT, HOMES, PC);
    expect(hits.some((h) => h.includes(`"${phrase}"`))).toBe(true);
  }
  // Word-boundary, not substring: "discover" is not "over", "blocked" is not "block".
  expect(contextViolations("Discover the blocked overture.", SUBJECT, HOMES, PC)).toEqual([]);
});

test("the lint rejects a number we did not source, and passes every number we did", () => {
  expect(contextViolations("The ask fell by $104,975.", SUBJECT, HOMES, PC)).toEqual([]);
  expect(contextViolations("It is 2,847 square feet on 0.26 acres.", SUBJECT, HOMES, PC)).toEqual(
    [],
  );
  // $450,000 appears in no record we hold.
  expect(contextViolations("Similar homes fetch $450,000.", SUBJECT, HOMES, PC)).toContain(
    'unsourced number: "$450,000"',
  );
});

test("a SOURCED sale date is one token, not three unsourced numbers", () => {
  // Caught on the live run: the narrator wrote "$300,000 closed 08/29/2025" — every part
  // of it sourced — and the scanner shredded the date into "08", "29", "2025" and dropped
  // the whole paragraph. Fail-closed kept the email honest; it also cost true prose.
  expect(
    contextViolations("Two are recorded sales: $300,000 closed 08/29/2025.", SUBJECT, HOMES, PC),
  ).toEqual([]);
  // A date we do NOT hold is still a violation.
  expect(contextViolations("One closed 01/02/2024.", SUBJECT, HOMES, PC)).toContain(
    'unsourced date: "01/02/2024"',
  );
});

test("clean context passes — the guard costs colour only when the narrator misbehaves", () => {
  const clean =
    "This is new construction on a 0.26-acre lot, and the ask has already come down by " +
    "$104,975 from where it started. Two of the five figures are recorded sales; the rest " +
    "are current valuations, and none of them are adjusted for condition. Happy to walk " +
    "through the records with you.";
  expect(contextViolations(clean, SUBJECT, HOMES, PC)).toEqual([]);
});
