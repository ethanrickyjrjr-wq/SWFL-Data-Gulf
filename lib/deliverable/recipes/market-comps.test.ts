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
  buildNarratorPrompt,
  buildPriceCase,
  compsFootnote,
  contextViolations,
  evidenceParagraph,
  narratorClaims,
} from "./market-comps";
import { auditClaims, CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
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
const footnoteOf = (doc: EmailDoc) =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? [b.props.footnote ?? ""] : [])).join(" ");

/** The chrome's block sequence, in document order (lib/email/lifecycle-chrome.ts). */
const spineOf = (doc: EmailDoc) =>
  [...doc.blocks]
    .sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0))
    .map((b) => {
      if (b.type === "hero") return b.props.ribbon ? "hero:ribbon" : "hero:subject";
      if (b.type === "stats") return b.props.variant === "strip" ? "stats:strip" : "stats:grid";
      if (b.type === "image") return `image:${String(b.props.kind ?? "?")}`;
      return b.type;
    });

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
  // Subject: $595,000 / 2,847 sq ft = $209. It is the cell that WINS THE ARGUMENT, so it
  // is the one the strip emphasises — it renders larger, in the brand's accent.
  const mine = cells.find((c) => c.label === "$/Sq Ft — this home");
  expect(mine?.value).toBe("$209");
  expect(mine?.emphasis).toBe("primary");
  // Comps (land excluded): 173, 195, 210, 231, 266 → median 210, range 173–266.
  expect(cells.find((c) => c.label === "$/Sq Ft — comp median")?.value).toBe("$210");
  // The SPREAD rides in the strip's footnote — a strip cell is a 9px caption in a sixth
  // of the email's width, and "$173–$266 across the set" wrapped to five ragged lines there.
  expect(footnoteOf(doc)).toContain("run from $173 to $266");
  // Had the $139,800 lot survived, the low bound would have collapsed the range.
});

test("every stat cell fits the schema caps (a 61-char label kills the build)", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(statsOf(doc).every((c) => c.label.length <= 60 && c.value.length <= 24)).toBe(true);
  // The footnote's cap is 120 — and it is never TRUNCATED to fit, because a sliced
  // "$173–$26" is a wrong number. The longest candidate that fits is chosen whole.
  for (const n of [1, 2, 3, 4, 5]) {
    const fn = compsFootnote(SUBJECT, HOMES.slice(0, n));
    expect(fn!.length).toBeLessThanOrEqual(120);
    expect(fn!.endsWith(".")).toBe(true);
  }
});

test("the price-kind mix is stated on the face of the email — footnote AND table title", () => {
  // The registry prompt used to promise "six LIVE comparable listings". The set is not
  // that: it is recorded sales plus current valuations. The email says so where the rows
  // are, and again directly under the strip — never only in a label a reader skims past.
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const count = statsOf(doc).find((c) => c.label === "Comparable homes");
  expect(count?.value).toBe("5");
  expect(count?.emphasis).toBe("muted"); // the SCALE of the evidence, not the evidence

  expect(footnoteOf(doc)).toContain("The 5 comparable homes (2 recorded sales, 3 valuations)");

  const table = listOf(doc);
  expect(table?.type === "list" && table.props.title).toBe(
    "The comparable homes (2 recorded sales, 3 valuations)",
  );
  // ...and the word "listings" is never used for this set anywhere in the doc.
  expect(JSON.stringify(doc)).not.toContain("listings");
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
  const evidence = cells.filter((c) => c.label === "$/Sq Ft — comp median");
  expect(evidence[0]?.value).toBe(""); // an OPEN SLOT — never "$0", never a naked label
  expect(cells.every((c) => c.value !== "0" && c.value !== "$0")).toBe(true);
  expect(listOf(doc)).toBeUndefined(); // no rows → no empty table shell
  // ...and the footnote never claims a mix over an empty set.
  expect(footnoteOf(doc)).not.toContain("comparable home");
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
  expect(html).not.toContain("$/Sq Ft — comp median");
  expect(html).not.toContain("Comparable homes");
  // ...and no zero snuck in where a number was missing.
  expect(html).not.toContain(">$0<");
});

// ── THE CAMPAIGN CHROME ──────────────────────────────────────────────────────
//
// Operator, 07/13/2026: *"EACH EMAIL WOULD HAVE THE SAME LOOK, JUST DIFFERENT
// INFORMATION."* This recipe used to own its own grid (hero-left · photo · stats[3] ·
// stats[2] · chart · list) — one of seven layouts across seven emails from one agent.
// The shape now comes from `buildLifecycleEmail`, and it is not this file's to change.
// campaign-coherence.test.ts is the cross-recipe oracle; these are the same rule, here.

test("it wears the campaign chrome — the SAME shape as every other lifecycle email", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(spineOf(doc)).toEqual([
    "header",
    "hero:ribbon", // ← the campaign's spine: same band, different word
    "image:photo",
    "hero:subject", // ← centred, ADDRESS over PRICE
    "stats:strip", // ← ONE hairline row, never a wall of stat grids
    "image:chart", // ┐ MY MIDDLE — the only place this email legitimately differs
    "list", // ┘
    "text",
    "sources", // ← MY TAIL
    "agent-card",
    "button",
    "footer",
  ]);
});

test("every block is positioned, so it compiles through the GRID renderer", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(doc.blocks.every((b) => b.layout)).toBe(true);
  // ...and the chrome stacks them with no gap and no overlap: y_next = y + h.
  const ordered = [...doc.blocks].sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0));
  let y = 0;
  for (const b of ordered) {
    expect(b.layout!.y).toBe(y);
    y += b.layout!.h;
  }
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

test("the RIBBON wears the Market Comps hat; the HERO carries the claim it defends", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const heroes = doc.blocks.filter((b) => b.type === "hero");

  // The ribbon is the ONE element that says which email in the campaign this is.
  const ribbon = heroes.find((b) => b.type === "hero" && b.props.ribbon);
  expect(ribbon?.type === "hero" && ribbon.props.kicker).toBe("Market Comps");

  // The subject hero is the CLAIM under examination: the ask, centred under the address.
  const hero = heroes.find((b) => b.type === "hero" && !b.props.ribbon);
  expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
  expect(hero?.type === "hero" && hero.props.label).toBe(SUBJECT.address);
  expect(hero?.type === "hero" && hero.props.align).toBe("center");
  expect(hero?.type === "hero" && hero.props.order).toBe("label-first");
});

test("the CTA asks for the NEXT ACTION — never a pointer at what they are looking at", () => {
  // The operator's example of the failure: "See the New Price" on an email whose whole
  // job IS the new price. A comps email's next action is the conversation, not the comps.
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const cta = doc.blocks.find((b) => b.type === "button");
  expect(cta?.type === "button" && cta.props.label).toBe("Talk Through These Numbers");
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

test("position in the set is COUNTED by compareToSet, never characterized as a 'low end'", () => {
  // The second false claim in the same paragraph: "the subject falls at the low end of
  // that band" when $209 sat BELOW a $210–$266 band entirely. The position sentence is
  // now authored by claims.ts `compareToSet` — an integer compare, no room for a model.
  const pc = buildPriceCase(SUBJECT, HOMES);
  // 209 is above 173 and 195 (2 comps); below 210, 231 and 266 (3 comps). Range 173–266.
  expect(pc?.verdict).toContain(
    "The asking price per square foot sits inside the range of the set ($173 to $266), " +
      "above 2 of 5 and below 3.",
  );
  expect(pc?.verdict).not.toMatch(/low end|high end|band/i);
  expect(pc?.lowerCount).toBe(2);
  expect(pc?.higherCount).toBe(3);

  // Below every comp → compareToSet says exactly that, not "at the low end".
  // $200,000 / 2,847 = $70. Every comp ($173…$266) is above it.
  const cheap = buildPriceCase({ ...SUBJECT, price: "$200,000" }, HOMES);
  expect(cheap?.subjectPpsf).toBe(70);
  expect(cheap?.higherCount).toBe(5);
  expect(cheap?.verdict).toContain(
    "The asking price per square foot is below every comparable in the set " +
      "(which run from $173 to $266).",
  );

  // Above every comp → the mirror. $800,000 / 2,847 = $281 > $266.
  const rich = buildPriceCase({ ...SUBJECT, price: "$800,000" }, HOMES);
  expect(rich?.subjectPpsf).toBe(281);
  expect(rich?.lowerCount).toBe(5);
  expect(rich?.verdict).toContain(
    "The asking price per square foot is above every comparable in the set " +
      "(which run from $173 to $266).",
  );
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

test("clean context passes BOTH gates — the guard costs colour only on misbehavior", () => {
  // Note what is NOT here: any count. The narrator used to write "Two of the five figures
  // are recorded sales" — a count it did itself. Counts are settled now (settledCount), so
  // a count in the narrator's own prose is a violation even when it happens to be right.
  const clean =
    "This is new construction on a 0.26 ac lot, and the ask has already come down by " +
    "$104,975 from the original. The figures here are not adjusted for condition. " +
    "Happy to walk you through the records.";
  expect(contextViolations(clean, SUBJECT, HOMES, PC)).toEqual([]);
  expect(auditClaims(clean, narratorClaims(SUBJECT, PC))).toEqual([]);
});

// ── THE CLAIM GATE — THE STRUCTURAL DONE-CONDITION ───────────────────────────
//
// The done-condition is not "a verifier didn't complain" (that recursion never
// terminates). It is STRUCTURAL and GREPPABLE: THE NARRATOR RECEIVES NO RAW COMP SET.
// It cannot compare two numbers it was never given two of.

test("THE NARRATOR RECEIVES NO RAW COMP SET — not one comp address, not one comp price", () => {
  const { system, user } = buildNarratorPrompt(SUBJECT, PC);
  const everything = `${system}\n${user}`;

  // Not one comparable's ADDRESS reaches the model. (It once wrote "comparable homes on
  // the same street" about 141 and 143 Coral Dr — because it had been handed them.)
  for (const c of HOMES) {
    expect(everything).not.toContain(c.addressLine);
  }
  // Not one comparable's PRICE reaches the model — the raw set is what a new comparison
  // gets drawn over.
  for (const p of [300000, 385000, 366400, 335437, 680900]) {
    expect(everything).not.toContain(p.toLocaleString("en-US"));
  }
  // Nor one comparable's SQ FT, nor a per-comp $/sq ft that no settled sentence states.
  // ($231 is 143 Coral Dr's; $173/$195/$210/$266 DO appear — inside settled sentences
  // that assert the relation over them, which is the sanctioned channel.)
  for (const s of [1736, 1976, 1744, 1452, 2557]) {
    expect(everything).not.toContain(s.toLocaleString("en-US"));
  }
  expect(everything).not.toContain("$231");
  // And no per-comp sale DATE — a date it never sees is a date it cannot order.
  expect(everything).not.toContain("08/29/2025");

  // The signature is the proof, and it is greppable: buildNarratorPrompt(facts, pc).
  // There is no RenderComp in it. There is no comp array to serialize. THAT is the fix —
  // the old version passed `compLines` and asked the model, politely, not to compare them.
  expect(buildNarratorPrompt.length).toBe(2);
});

test("CLAIM_PROHIBITION is printed into the narrator's system prompt, verbatim", () => {
  // The model is TOLD the exact rule the lint enforces, so a violation is a refusal to
  // follow an explicit instruction rather than a surprise.
  const { system } = buildNarratorPrompt(SUBJECT, PC);
  expect(system).toContain(CLAIM_PROHIBITION);
});

test("every fact the narrator gets is a SETTLED SENTENCE — the mix is a settled COUNT", () => {
  const settled = narratorClaims(SUBJECT, PC);
  const sentences = settled.map((s) => s.sentence);
  // The count is computed (settledCount) and PRINTED — never left to the model. 2 + 3 = 5.
  expect(sentences).toContain(
    "2 of 5 comparable homes are recorded sales; the rest are current valuations — " +
      "estimates, not sales.",
  );
  expect(sentences).toContain("None of it is adjusted for condition.");
  // The subject's own record — scalars, each a fact on its own, never a set.
  expect(sentences).toContain("The asking price is $595,000.");
  expect(sentences).toContain("The home is new construction, per the listing record.");
  expect(sentences).toContain("The asking price has already come down by $104,975.");
  // Every numeral the narrator is allowed to write comes from these sentences and only these.
  const anchors = new Set(settled.flatMap((s) => s.anchors));
  for (const n of ["209", "210", "173", "195", "266", "595000", "104975", "2847", "0.26"]) {
    expect(anchors.has(n)).toBe(true);
  }
  // A comp price it never saw is not an anchor — writing it is an invention by definition.
  expect(anchors.has("366,400")).toBe(false);
  expect(anchors.has("231")).toBe(false);
});

test("the code-authored paragraph passes its own gate — zero violations, by construction", () => {
  // If the paragraph we ALWAYS ship could not clear the lint, the lint would be wrong.
  expect(auditClaims(evidenceParagraph(PC), narratorClaims(SUBJECT, PC))).toEqual([]);
});

test("THE MIX IS PRINTED IN CODE, because stating it REQUIRES A COUNT", () => {
  // Caught live on the first run of this rebuild: handed the mix as a fact and asked what
  // the evidence IS, the narrator wrote "Four of the six figures… the two recorded sales…".
  // A word-count of its own — dropped by the gate, taking a TRUE paragraph with it. The
  // fault was the design: if a fact can only be said as a count, CODE says it.
  const para = evidenceParagraph(PC);
  expect(para).toContain(
    "2 of 5 comparable homes are recorded sales; the rest are current valuations — " +
      "estimates, not sales.",
  );
  expect(para).toContain("None of it is adjusted for condition.");
  // And the narrator's own word-count is a violation even when it happens to be right.
  const settled = narratorClaims(SUBJECT, PC);
  expect(
    auditClaims("Two of the five homes are recorded sales.", settled).some(
      (h) => h.kind === "word-count",
    ),
  ).toBe(true);

  // An all-sold set never says "the rest are valuations" — there is no rest.
  const allSold = buildPriceCase(
    SUBJECT,
    HOMES.map((c) => ({ ...c, priceKind: "sold" as const })),
  );
  expect(evidenceParagraph(allSold!)).toContain("All 5 comparable homes are recorded sales.");
  expect(evidenceParagraph(allSold!)).not.toContain("the rest");

  // An all-valuation set never implies a sale it does not hold.
  const allEst = buildPriceCase(
    SUBJECT,
    HOMES.map((c) => ({ ...c, priceKind: "estimate" as const })),
  );
  expect(evidenceParagraph(allEst!)).toContain(
    "All 5 comparable homes are current valuations — estimates, not sales.",
  );
  expect(evidenceParagraph(allEst!)).not.toMatch(/recorded sale/i);
});

test("auditClaims CATCHES THE SHIPPED LIE, and every claim shape that made it possible", () => {
  const settled = narratorClaims(SUBJECT, PC);

  // The exact sentence that shipped. $209 is ABOVE $173 and ABOVE $195.
  const shipped =
    "At $209 per square foot, the asking price for 326 Shore Dr sits just below the $213 " +
    "median — and below the two recorded sales on Shore Dr, which closed at $173 and $195 " +
    "per square foot.";
  const hits = auditClaims(shipped, settled);
  expect(hits.some((h) => h.kind === "comparative")).toBe(true);
  expect(hits.some((h) => h.kind === "spatial")).toBe(true); // "on Shore Dr"
  expect(hits.some((h) => h.kind === "unanchored-number" && h.match === "213")).toBe(true);

  // The siblings' falsehoods, in this recipe's own gate. Every one of them is a claim
  // drawn between correctly-sourced numbers; not one contains an invented number.
  expect(auditClaims("The gap is widening.", settled).some((h) => h.kind === "trajectory")).toBe(
    true,
  );
  expect(
    auditClaims("Five of those six homes are sales.", settled).some((h) => h.kind === "word-count"),
  ).toBe(true);
  expect(
    auditClaims("The price was cut before a contract was reached.", settled).some(
      (h) => h.kind === "sequence",
    ),
  ).toBe(true);
  expect(auditClaims("The seller is motivated.", settled).some((h) => h.kind === "motive")).toBe(
    true,
  );
  expect(
    auditClaims("The ask is in line with the comps.", settled).some(
      (h) => h.kind === "comparative",
    ),
  ).toBe(true);
});
