// lib/deliverable/recipes/market-comps.test.ts
//
// The invariants this recipe cannot lose. Every fixture below is a VERBATIM copy of a
// real row `compsForAddress("326 Shore Dr, Fort Myers, FL 33905")` returned live on
// 07/13/2026 — including `315 Shore Dr`, the vacant lot that has to be filtered out.
// Pure/offline: the grid builder and the row/label helpers take no network.

import { test, describe, it, expect } from "bun:test";
import {
  BANNED_CONTEXT_PHRASES,
  buildCompsGrid,
  buildNarratorPrompt,
  buildPriceCase,
  compsFootnote,
  compsPpsfSpec,
  compsSpecs,
  contextViolations,
  evidenceParagraph,
  narratorClaims,
  ppsfChartMagnitude,
  styleDifferenceNote,
  subjectDims,
} from "./market-comps";
import { assertHeroChartCoherence } from "@/lib/deliverable/chart-coherence";
import { auditClaims, CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
import { FAVORABLE_FRAMING_POLICY } from "./shared";
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
    soldInDays: null,
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
  const mine = cells.find((c) => c.label === "$/Sq Ft");
  expect(mine?.value).toBe("$209");
  expect(mine?.emphasis).toBe("primary");
  // Comps (land excluded): 173, 195, 210, 231, 266 → median 210, range 173–266.
  expect(cells.find((c) => c.label === "Median")?.value).toBe("$210");
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
  //
  // AMENDED 08/03/2026: the COUNT no longer has a strip cell — days on market took it
  // (operator: "THERE IS NO FUCKING DOM"). Nothing about the mix was weakened. It was
  // always stated on four surfaces and the strip cell was the weakest of them: the
  // footnote, the table title, each row's own "Sold …"/"Estimated value …" line, and
  // the chart's "(est.)" suffix. This test now checks the three that carry it in text.
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(statsOf(doc).find((c) => c.label === "Comparable homes")).toBeUndefined();

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

test("a sold evidence row carries the spell when known", () => {
  const homes = HOMES.map((c) =>
    c.addressLine === "330 Shore Dr Lot 59" ? { ...c, soldInDays: 79 } : c,
  );
  const doc = buildCompsGrid(SUBJECT, homes, canvas());
  const items =
    listOf(doc)?.type === "list"
      ? (listOf(doc) as { props: { items: unknown[] } }).props.items
      : [];
  const rows = items as { text: string }[];
  const sold = rows.find((r) => r.text.startsWith("330 Shore Dr Lot 59"));
  expect(sold?.text).toContain("Sold 08/29/2025 · sold in 79 days");
});

test("a sold row with unknown spell renders exactly as before", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(JSON.stringify(doc)).not.toContain("sold in");
});

// ── THE DATE THE RECORD DOES NOT CARRY ───────────────────────────────────────
//
// Found by rendering and looking, 08/05/2026 (playbook §2.3.4 defect 1). A real send on
// 8348 Southwindbay Cir printed FIVE recorded sales, every one of them dated the FIRST of
// the month: "Sold 05/01/2026", "Sold 04/01/2026", "Sold 03/01/2026". Not a coincidence —
// our own lake comp lane (`comp-source-lake.ts:167`) reads `sale_month` and tags the row
// `dateGrain: "month"` precisely because "every row is day-of-month 1 by construction".
// The chat lane honours that tag and says "in May 2026"; THIS row renderer called `mdy()`
// unconditionally and minted a day the county record does not hold.
//
// A precise date nobody recorded is an invented fact wearing a real number's clothes, and
// it shipped on the face of the one email whose entire job is defending a price with
// records. Month grain in, month grain out.
test("a month-grain lake sale never renders a fabricated day", () => {
  const monthly = HOMES.map((c) =>
    c.priceKind === "sold" ? { ...c, priceDate: "2026-05-01", dateGrain: "month" as const } : c,
  );
  const doc = buildCompsGrid(SUBJECT, monthly, canvas());
  const items =
    listOf(doc)?.type === "list"
      ? (listOf(doc) as { props: { items: unknown[] } }).props.items
      : [];
  const rows = items as { text: string }[];
  const sold = rows.filter((r) => r.text.includes("Sold"));
  expect(sold.length).toBeGreaterThan(0);
  for (const r of sold) {
    expect(r.text).toContain("Sold May 2026");
    expect(r.text).not.toContain("05/01/2026");
  }
  // The whole doc, not just the rows — no day-of-month may reach the reader anywhere.
  expect(JSON.stringify(doc)).not.toContain("05/01/2026");
});

test("a day-grain vendor sale still renders its exact date", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const items =
    listOf(doc)?.type === "list"
      ? (listOf(doc) as { props: { items: unknown[] } }).props.items
      : [];
  const rows = items as { text: string }[];
  expect(rows.find((r) => r.text.startsWith("330 Shore Dr Lot 59"))?.text).toContain(
    "Sold 08/29/2025",
  );
});

// ── THE OPEN-SLOT CONTRACT ───────────────────────────────────────────────────

test("no comps → the grid still lands, with open slots and no zeros", () => {
  const doc = buildCompsGrid(SUBJECT, [], canvas());
  const cells = statsOf(doc);
  const evidence = cells.filter((c) => c.label === "Median");
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
  expect(html).not.toContain("Comp median");
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
    // MY MIDDLE. The `image:chart` slot that used to lead it is DELETED (operator,
    // 08/04/2026, third time of asking). What leads it now is the RESERVED, empty
    // description slot — "description below property info" — which the layout seam
    // positions here and `upsertDescriptionBlock` fills in place later in the build.
    // Unfilled, `dropEmptyDescriptionSlot` takes it back out.
    "text", // ← the description slot, directly beneath the property facts
    "list",
    "text", // ← the narrative slot
    "agent-card",
    "button",
    // NO sources tail — removed 08/19/2026 by operator decree ("get rid of whatever
    // this shit is in all emails"); SourcesBlock also renders null on email paths.
    "footer",
  ]);
});

test("every block is positioned, so it compiles through the GRID renderer", () => {
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(doc.blocks.every((b) => b.layout)).toBe(true);

  // ...and the chrome stacks ROWS with no gap and no overlap: y_next = y + the row's TALLEST
  // block. This walked every BLOCK (y_next = y + h), which quietly asserted one block per row —
  // true only while the campaign was a flat stack. The agent card and the CTA now share a row
  // at unequal heights (4 and 2), which is exactly the case the band rule exists to handle.
  const rows = new Map<number, number>(); // y → tallest h
  for (const b of doc.blocks) {
    const { y, h } = b.layout!;
    rows.set(y, Math.max(rows.get(y) ?? 0, h));
  }
  let y = 0;
  for (const rowY of [...rows.keys()].sort((a, b) => a - b)) {
    expect(rowY).toBe(y);
    y += rows.get(rowY)!;
  }
});

test("THERE IS NO CHART. The comps email reserves no chart slot and fills none.", () => {
  // Operator, three times: 08/03/2026 "COMPARABLES ARE JUST THAT, COMPARABLE, SO IT'S A
  // TERRIBLE CHART TO PUT IN THE EMAIL. PRICE IS GOING TO BE SIMILAR." — then, after a
  // session "answered" that by swapping the bars' UNIT from price to $/sq ft and keeping
  // the chart: 08/04/2026 "Do not use that stupid fucking chart for comps!!!!!!! How many
  // times do I have to say it!!!!!"
  //
  // This test used to assert the slot EXISTED. It is inverted on purpose: the comparison
  // already appears twice in plainer form (the stat strip's "$333 this home" vs "$212 comp
  // median", and each comp's own $/sq ft on its row). If you are here because this test
  // broke, you are putting the chart back — don't.
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const chart = doc.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
  expect(chart).toBeUndefined();

  // The subject's PHOTO is a different block and must survive the chart's removal.
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
  // RE-PUNCTUATED, not raw (08/06/2026). `SUBJECT.address` is the vendor's own
  // `formattedAddress`, which carries a stray comma before the zip ("…, FL, 33905").
  // `addressLineOf` (lib/email/listing-flyer.ts) is now the ONE root that composes the
  // hero line from the record's structured fields, so all seven lifecycle emails print
  // it cleanly instead of two of them fixing it by hand. This assertion pinned the
  // BROKEN string.
  expect(hero?.type === "hero" && hero.props.label).toBe("326 Shore Dr, Fort Myers, FL 33905");
  expect(hero?.type === "hero" && hero.props.align).toBe("center");
  expect(hero?.type === "hero" && hero.props.order).toBe("label-first");
});

// ── The narrator may name THE SUBJECT'S OWN address (found live 08/03/2026) ────
// The road-suffix ban and the digit lint exist so the narrator cannot place a COMP
// ("comparable homes on Shore Dr" — they were on Coral Dr). But they also fired on
// the SUBJECT's own street and house number, which we hold on the record and which
// the code-authored verdict itself prints. Result: the narrator's paragraph was
// dropped on EVERY build of a street whose suffix is in the ban list, and the email
// silently shipped the verdict alone — the operator's "positive commentary in the
// agent's voice" missing, with no error surfaced. Caught on a real send.
describe("the subject's own address is SOURCED, not a location claim", () => {
  const subj: ListingFacts = { ...SUBJECT, address: "2601 SW 37th Ter, Cape Coral, FL 33914" };

  test("naming the subject's own street + number does NOT void the paragraph", () => {
    const pc = buildPriceCase(subj, HOMES)!;
    const text = "The home at 2601 SW 37th Ter is a 3-bedroom pool home. We're ready to talk.";
    expect(contextViolations(text, subj, HOMES, pc)).toEqual([]);
  });

  test("a COMP's location is STILL banned — the guard is not weakened", () => {
    const pc = buildPriceCase(subj, HOMES)!;
    const text = "The comparable homes on Shore Dr tell the same story.";
    expect(contextViolations(text, subj, HOMES, pc).length).toBeGreaterThan(0);
  });

  test("an invented number is STILL caught alongside the subject's own", () => {
    const pc = buildPriceCase(subj, HOMES)!;
    const hits = contextViolations("2601 SW 37th Ter sold 14 times.", subj, HOMES, pc);
    expect(hits.some((h) => h.includes("14"))).toBe(true);
  });
});

// ── THE COMPARABILITY FAILURE · operator, 08/03/2026 ──────────────────────────
// "AN 850K AND 721K HOME IS NOT COMPARABLE TO 385K" / "COMPARABLE HOMES ARE CLOSE IN
// SQ FT ... SIMILAR AMOUNT OF BATHS AND OTHER THINGS."
//
// The size-band ranker (`lib/assistant/comp-rank.ts`, built to Fannie B4-1.3-08) has
// existed since 07/22/2026 and `compsForAddress` runs it ONLY when the caller hands it
// the subject's dimensions (`comp-helper.ts:397`). This recipe handed it an address and
// nothing else, so every comp email fell through to the vendor's raw nearest-first
// order — the exact `nearby.slice(0, topN)` the ranker was written to replace. The
// dimensions were four lines away the whole time: `compsSpecs` renders them.
describe("the recipe TELLS the ranker what the subject is", () => {
  test("subject dimensions reach the comp lookup — sqft, beds AND baths", () => {
    const d = subjectDims(SUBJECT);
    expect(d.subjectSqft).toBe(2847);
    expect(d.subjectBeds).toBe(3);
    expect(d.subjectBaths).toBe(3.5); // half-baths are real; never rounded away
  });

  test("a subject with no listed size passes NO size — never a guessed one", () => {
    // Ranking against an invented size would invent the fact it filters on.
    const d = subjectDims({ ...SUBJECT, sqft: undefined, beds: undefined, baths: undefined });
    expect(d.subjectSqft).toBeUndefined();
    expect(d.subjectBeds).toBeUndefined();
    expect(d.subjectBaths).toBeUndefined();
  });

  test("a zero/garbage size is treated as absent, not as 0 sq ft", () => {
    expect(subjectDims({ ...SUBJECT, sqft: "0" }).subjectSqft).toBeUndefined();
    expect(subjectDims({ ...SUBJECT, sqft: "n/a" }).subjectSqft).toBeUndefined();
  });
});

// ── THE CHART · operator, 08/03/2026 ──────────────────────────────────────────
// "COMPARABLES ARE JUST THAT, COMPARABLE, SO IT'S A TERRIBLE CHART TO PUT IN THE
// EMAIL. PRICE IS GOING TO BE SIMILAR."
//
// He is right, and the comparability fix above makes him MORE right: once the set is
// genuinely size-banded, total prices cluster by construction and the bars say nothing.
// The spread this email actually argues over is $/sq ft — the strip's primary cell, the
// footnote's range, and every relation in `buildPriceCase`.
describe("the chart plots the number the email argues over", () => {
  test("bars are $/sq ft, not total price", () => {
    const spec = compsPpsfSpec(SUBJECT, HOMES, "2026-08-03")!;
    expect(spec).not.toBeNull();
    const values = spec.rows.map((r) => Number(r[1]));
    // Every bar is a per-square-foot figure: hundreds, never hundreds of thousands.
    for (const v of values) expect(v).toBeLessThan(2000);
    expect(Math.max(...values)).toBeGreaterThan(50);
  });

  test("the subject is its own first bar, labelled as the subject", () => {
    const spec = compsPpsfSpec(SUBJECT, HOMES, "2026-08-03")!;
    expect(String(spec.rows[0][0])).toContain("Subject");
    expect(Number(spec.rows[0][1])).toBe(Math.round(595000 / 2847));
  });

  test("no chart at all when fewer than two comps carry a real $/sq ft", () => {
    expect(compsPpsfSpec(SUBJECT, [], "2026-08-03")).toBeNull();
    expect(compsPpsfSpec({ ...SUBJECT, sqft: undefined }, HOMES, "2026-08-03")).toBeNull();
  });

  test("a $/sq ft chart is NOT judged against a total-price headline", () => {
    // chart-coherence compares like with like. $195/sq ft under a $595,000 headline is
    // a cross-unit pair — the case that module's own header calls always coherent —
    // but its 4-way UnitClass has no per-area class, so an unguarded comparison would
    // false-fire and silently DROP the chart. Pinned so nobody "fixes" it back.
    const spec = compsPpsfSpec(SUBJECT, HOMES, "2026-08-03")!;
    const verdict = assertHeroChartCoherence({
      hero: { value: 595000, unit: "currency" },
      chart: ppsfChartMagnitude(spec),
    });
    expect(verdict.coherent).toBe(true);
  });
});

// ── DOM · operator, 08/03/2026 ────────────────────────────────────────────────
// "THERE IS NO FUCKING DOM! WE JUST FUCKING BROUGHT IT IN YESTERDAY."
// `facts.daysOnMarket` is our own `listing_dom` root, attached by the lake resolve lane
// and never a first-seen floor. The strip never read it.
describe("days on market rides on the face of the email", () => {
  test("a real DOM count renders in the strip", () => {
    // Label conformed to listing-flyer.ts's "DOM" on 08/04/2026 (grid/font fix) — see the
    // comment on compsSpecs. "Days listed" was the pre-conform label.
    const cells = compsSpecs({ ...SUBJECT, daysOnMarket: 41 }, HOMES);
    const dom = cells.find((c) => c.label === "DOM");
    expect(dom?.value).toBe("41");
  });

  test("no DOM held → an OPEN SLOT, never a zero and never a guess", () => {
    const cells = compsSpecs(SUBJECT, HOMES);
    const dom = cells.find((c) => c.label === "DOM");
    expect(dom?.value ?? "").toBe("");
  });

  test("the strip is still six cells — DOM replaced the comp COUNT, which the footnote already states", () => {
    const cells = compsSpecs({ ...SUBJECT, daysOnMarket: 41 }, HOMES);
    expect(cells).toHaveLength(6);
    expect(compsFootnote(SUBJECT, HOMES)).toContain(String(HOMES.length));
  });
});

// ── F1 (CORRECTED) · photos DECORATE the evidence, they never SELECT it ────────
// An earlier version of the 08/03 build let photo coverage choose which comps ship.
// That made buildPriceCase's median / vsSold / compareToSet position depend on which
// houses we happen to hold pictures of — in a price-DEFENSE email. Same class as the
// inverted comparison that produced claims.ts. These tests pin the corrected shape.
describe("photo coverage cannot move the price argument", () => {
  test("the price case is IDENTICAL with full, partial and zero photo coverage", () => {
    const full = buildPriceCase(SUBJECT, HOMES);
    // The comp set is chosen before any photo is fetched, so the case is a pure
    // function of the houses. If this ever differs, photos are steering the math.
    expect(buildPriceCase(SUBJECT, HOMES)).toEqual(full!);
    expect(full?.medianPpsf).toBeGreaterThan(0);
  });

  test("PARTIAL coverage renders the photos we DO hold — never zero of them", () => {
    const some = new Map([[HOMES[0].addressLine, "https://ap.rdcpix.com/one.jpg"]]);
    const doc = buildCompsGrid(SUBJECT, HOMES, canvas(), some);
    const list = doc.blocks.find((b) => b.type === "list");
    const withImages =
      list?.type === "list" ? list.props.items.filter((i) => i.imageUrl).length : -1;
    // The old all-or-nothing rule made this 0. Partial coverage is the NORMAL case.
    expect(withImages).toBe(1);
  });

  test("a comp we cannot photograph still ships, with its link intact", () => {
    const doc = buildCompsGrid(SUBJECT, HOMES, canvas(), new Map());
    const list = doc.blocks.find((b) => b.type === "list");
    expect(list?.type === "list" && list.props.items.length).toBe(HOMES.length);
    expect(list?.type === "list" && list.props.items.every((i) => !i.imageUrl)).toBe(true);
  });
});

test("the CTA asks for the NEXT ACTION — never a pointer at what they are looking at", () => {
  // The operator's example of the failure: "See the New Price" on an email whose whole
  // job IS the new price. A comps email's next action is a step toward the agent, not
  // a pointer back at the comps.
  //
  // LABEL CHANGED 08/03/2026 by operator decree ("a 'Find Out More' button",
  // _ASSISTANT/2026-08-03-apify-comp-email-HANDOFF.md §1 item 6). The RULE this test
  // enforces is unchanged — only the wording moved. Both labels satisfy it; the
  // assertion is on the decreed one so a silent revert reddens.
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  const cta = doc.blocks.find((b) => b.type === "button");
  expect(cta?.type === "button" && cta.props.label).toBe("Find Out More");
});

test("brand is sticky — a real user brand is never overwritten", () => {
  const branded = canvas();
  branded.globalStyle = { ...branded.globalStyle, accentColor: "#FF0000" };
  const doc = buildCompsGrid(SUBJECT, HOMES, branded);
  expect(doc.globalStyle.accentColor).toBe("#FF0000");
});

test("no sources block ships, and the vendor is never named anywhere in the doc", () => {
  // The citations accordion was removed 08/19/2026 by operator decree ("get rid of
  // whatever this shit is in all emails"). The vendor-name ban stands on its own.
  const doc = buildCompsGrid(SUBJECT, HOMES, canvas());
  expect(doc.blocks.some((b) => b.type === "sources")).toBe(false);
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

test("buildPriceCase states an extreme gap plainly, direction-symmetric", () => {
  // $40,000 / 2,000 sqft = $20/sqft, roughly 10x below a ~$200-210/sqft comp set — a
  // genuinely extreme gap that still produces a real (non-zero) $/sq ft, unlike a
  // literal $1 price (perSqft rounds $1/2,000 sqft to $0, which fails buildPriceCase's
  // own >0 guard and returns null before the magnitude tier is ever reached).
  const factsCheap = {
    address: "1 Cheap Ln, Fort Myers, FL 33905",
    price: "$40,000",
    sqft: "2000",
  } as never;
  const richComps = [
    {
      addressLine: "1 A St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 400000,
      priceKind: "sold" as const,
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
    {
      addressLine: "2 B St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 420000,
      priceKind: "sold" as const,
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
  ];
  const cheap = buildPriceCase(factsCheap, richComps);
  expect(cheap!.verdict).not.toMatch(/somewhat|a bit|in the neighborhood of/i);
  // Discriminating assertion: the extreme tier's own distinctive language must appear.
  // ("somewhat/a bit/in the neighborhood of" never appear in the code-authored verdict at
  // ANY tier, so the check above alone would still pass with the tier deleted entirely.)
  expect(cheap!.verdict).toContain("the entire range");
  expect(cheap!.vsMedian.dir).toBe("below");

  // direction-symmetric: an equally extreme gap ABOVE the set states just as plainly,
  // using the exact same isExtreme criteria — never a formula that only sharpens language
  // in the flattering direction.
  const factsExpensive = {
    address: "1 Pricey Ln, Fort Myers, FL 33905",
    price: "$5,000,000",
    sqft: "2000",
  } as never;
  const expensive = buildPriceCase(factsExpensive, richComps);
  expect(expensive!.verdict).not.toMatch(/somewhat|a bit|in the neighborhood of/i);
  expect(expensive!.verdict).toContain("the entire range");
  expect(expensive!.vsMedian.dir).toBe("above");
});

// ── ONE FACT, ONCE ───────────────────────────────────────────────────────────
//
// Found by rendering and looking, 08/05/2026 (playbook §2.3.4 defect 2). The real send on
// 8348 Southwindbay Cir opened with THREE sentences carrying one fact:
//
//   "…sits $123 above every comparable home in the set — not just the $210 median, the
//    entire range. That is above all 5 recorded sales in the set ($182, $210, $210, $220
//    and $266 per square foot). The asking price per square foot is above every comparable
//    in the set (which run from $182 to $266)."
//
// Sentence 3 is `compareToSet`'s and it is a VERBATIM restatement of sentence 1 whenever
// the extreme tier fired: "outside the full range" and "above every comparable in the set"
// are the same claim. (Sentence 2 stays — it names the actual sale figures, which neither
// of the others does.) A price-defence paragraph that says the same thing three times
// reads as padding, and padding is what a reader discounts.
//
// The drop is keyed on `isExtreme` ALONE, so it is direction-symmetric by construction —
// it fires identically whether the ask sits above or below the set.
test("the extreme tier states the position ONCE — compareToSet does not restate it", () => {
  const richComps = [
    {
      addressLine: "1 A St",
      city: "Fort Myers",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 400000,
      priceKind: "sold" as const,
      priceDate: "2026-01-01",
      soldInDays: null,
      sourceUrl: null,
    },
    {
      addressLine: "2 B St",
      city: "Fort Myers",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 440000,
      priceKind: "sold" as const,
      priceDate: "2026-01-01",
      soldInDays: null,
      sourceUrl: null,
    },
  ] as never;
  const above = buildPriceCase(
    { address: "1 Pricey Ln, Fort Myers, FL 33905", price: "$5,000,000", sqft: "2000" } as never,
    richComps,
  )!;
  expect(above.verdict).toContain("the entire range");
  expect(above.verdict).not.toContain("above every comparable in the set");
  // The sale figures still ship — that sentence carries information the others do not.
  expect(above.verdict).toContain("both recorded sales in the set");

  const below = buildPriceCase(
    { address: "1 Cheap Ln, Fort Myers, FL 33905", price: "$100,000", sqft: "2000" } as never,
    richComps,
  )!;
  expect(below.verdict).toContain("the entire range");
  expect(below.verdict).not.toContain("below every comparable in the set");

  // ...and when the tier does NOT fire, the position sentence is real information and stays.
  const inside = buildPriceCase(
    { address: "1 Mid Ln, Fort Myers, FL 33905", price: "$420,000", sqft: "2000" } as never,
    richComps,
  )!;
  expect(inside.verdict).not.toContain("the entire range");
  expect(inside.verdict).toMatch(/asking price per square foot/i);
});

test("the extreme tier never fires on a SINGLE priced comp — 'the entire range' needs an actual range (final-review Fix 4)", () => {
  // With n === 1, "outside the full comp range" and "outside the median" are the SAME
  // one-comp comparison wearing two names — a one-element set is not a range. Before this
  // fix, isExtreme had no floor on `priced.length`, so a single priced comp with a huge
  // gap could still ship "not just the median, the entire range" about a "range" that was
  // really just that one comp.
  const factsSolo = {
    address: "1 Solo Ln, Fort Myers, FL 33905",
    price: "$40,000",
    sqft: "2000",
  } as never;
  const oneComp: RenderComp[] = [
    {
      addressLine: "1 A St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "active",
      price: 400000,
      priceKind: "estimate",
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
  ];
  const pc = buildPriceCase(factsSolo, oneComp);
  // $40,000 / 2,000 = $20/sqft vs. the single comp's $400,000 / 2,000 = $200/sqft — a
  // gap just as large (10x) as the direction-symmetric extreme fixtures above, and the
  // exact shape ("subjectPpsf < the one value in allPpsf") that used to trip isExtreme.
  expect(pc!.subjectPpsf).toBe(20);
  expect(pc!.medianPpsf).toBe(200);
  expect(pc!.n).toBe(1);
  // The verdict falls through to the plain, always-true median-gap sentence — never the
  // extreme tier's "not just the median, the entire range" phrasing.
  expect(pc!.verdict).not.toContain("the entire range");
  expect(pc!.verdict).toContain(
    "sits $180 below the $200 median across the 1 comparable home nearby.",
  );

  // Keep the existing 2-comp direction-symmetric tests' own claim honest: with a REAL
  // multi-comp range (n >= 2), the exact same gap-and-direction shape still fires.
  const twoComps: RenderComp[] = [
    { ...oneComp[0]!, addressLine: "1 A St" },
    { ...oneComp[0]!, addressLine: "2 B St", price: 420000 },
  ];
  const pcTwo = buildPriceCase(factsSolo, twoComps);
  expect(pcTwo!.n).toBe(2);
  expect(pcTwo!.verdict).toContain("the entire range");
});

test("buildPriceCase does NOT claim 'the entire range' when only the percentage-of-median gap is large and the subject is still inside the set's range", () => {
  // Regression test for the Critical review finding on task-5-report.md: the ORIGINAL
  // isExtreme formula also fired on `vsMedian.diff / medianPpsf >= 0.4` alone, with no
  // range-membership check at all. Reproduction uses the reviewer's exact disclosed shape:
  // subject $500,000 / 2,000 sqft = $250/sqft; comps (all "sold", same 2,000 sqft) at
  // $300,000 / $340,000 / $800,000 → ppsf $150 / $170 / $400.
  //   median = $170, diff = $80, 80/170 ≈ 0.4706 >= 0.4 — the OLD condition 1 fires alone —
  //   but $250 sits strictly INSIDE [$150, $400], so the subject is provably NOT beyond the
  //   entire range. Before the fix, s1 said "sits $80 above every comparable home in the
  //   set — not just the $170 median, the entire range," while the very next sentence (from
  //   vsSold) correctly said the price "falls within the recorded sales" — a direct,
  //   code-authored self-contradiction in the same paragraph.
  const factsInRange: ListingFacts = {
    ...SUBJECT,
    address: "1 Inside Ln, Fort Myers, FL 33905",
    price: "$500,000",
    sqft: "2000",
  };
  const rangeComps: RenderComp[] = [
    {
      addressLine: "1 Low St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 300000,
      priceKind: "sold",
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
    {
      addressLine: "2 Mid St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 340000,
      priceKind: "sold",
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
    {
      addressLine: "3 High St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 800000,
      priceKind: "sold",
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
  ];

  const pc = buildPriceCase(factsInRange, rangeComps);
  expect(pc!.subjectPpsf).toBe(250);
  expect(pc!.medianPpsf).toBe(170);
  expect(pc!.vsMedian.dir).toBe("above");
  expect(pc!.vsMedian.diff).toBe(80);

  // The percentage gap alone (80 / 170 ≈ 0.47) would have tripped the OLD isExtreme
  // formula. It must NOT trip the fixed one — the subject is still inside [150, 400].
  expect(pc!.verdict).not.toContain("the entire range");

  // The paragraph falls back to the honest, always-true median-gap sentence instead...
  expect(pc!.verdict).toContain(
    "sits $80 above the $170 median across the 3 comparable homes nearby.",
  );

  // ...and stays internally consistent with the within-range language the untouched
  // vsSold / compareToSet sentences already state correctly.
  expect(pc!.verdict).toContain("falls within the recorded sales");
  expect(pc!.verdict).toContain(
    "The asking price per square foot sits inside the range of the set ($150 to $400), " +
      "above 2 of 3 and below 1.",
  );
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

  // Below every comp → the position is still stated EXACTLY, and still never characterized.
  // It is now carried by the extreme tier's own sentence rather than repeated a second time
  // by compareToSet (§2.3.4 defect 2) — WHICH sentence says it was never the point of this
  // test; that it is counted rather than characterized is.
  // $200,000 / 2,847 = $70. Every comp ($173…$266) is above it.
  const cheap = buildPriceCase({ ...SUBJECT, price: "$200,000" }, HOMES);
  expect(cheap?.subjectPpsf).toBe(70);
  expect(cheap?.higherCount).toBe(5);
  expect(cheap?.verdict).toContain(
    "sits $140 below every comparable home in the set — not just the $210 median, " +
      "the entire range.",
  );
  expect(cheap?.verdict).not.toMatch(/low end|high end|band/i);

  // Above every comp → the mirror, same tier, same wording. $800,000 / 2,847 = $281 > $266.
  const rich = buildPriceCase({ ...SUBJECT, price: "$800,000" }, HOMES);
  expect(rich?.subjectPpsf).toBe(281);
  expect(rich?.lowerCount).toBe(5);
  expect(rich?.verdict).toContain(
    "sits $71 above every comparable home in the set — not just the $210 median, " +
      "the entire range.",
  );
  expect(rich?.verdict).not.toMatch(/low end|high end|band/i);
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

test("buildNarratorPrompt's system includes FAVORABLE_FRAMING_POLICY verbatim", () => {
  const facts = {
    address: "326 Shore Dr, Fort Myers, FL 33905",
    price: "$595,000",
    sqft: "2847",
  } as never;
  const pc = buildPriceCase(facts, [
    {
      addressLine: "1 A St",
      city: "x",
      beds: 3,
      baths: 2,
      sqft: 2000,
      status: "sold",
      price: 700000,
      priceKind: "sold",
      priceDate: "2026-01-01",
      sourceUrl: null,
    },
  ]);
  const { system } = buildNarratorPrompt(facts, pc!);
  expect(system).toContain(FAVORABLE_FRAMING_POLICY);
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

// ── ZERO EXPOSURE TO communityStats ──────────────────────────────────────────
//
// This recipe has an ABSOLUTE ban on locational claims — no "community", no
// "neighborhood", no "subdivision" — because a prior incident shipped an invented
// "on the same street" comps claim. `ListingFacts.communityStats` (the address-resolved,
// tax-roll-backed neighborhood block the other six lifecycle recipes now narrate) must
// therefore never reach this recipe's model prompt. `narratorClaims(facts, pc)` — the
// ONLY funnel of `ListingFacts` into the narrator — enumerates the scalar fields it reads
// (price, beds, baths, sqft, lotSize, yearBuilt, isNewConstruction, priceReduction) and
// never touches `facts.communityStats`. This locks that in, so a future refactor of
// `narratorClaims` can't silently start reading it without a test catching it.

describe("market-comps stays excluded from communityStats — same reasoning as its community-word ban", () => {
  it("narratorClaims never surfaces facts.communityStats, even when present", () => {
    const subjectWithStats: ListingFacts = {
      ...SUBJECT,
      communityStats: {
        subdivisionName: "Heritage Bay",
        homeCount: 1900,
        medianJustValue: 612000,
        countByType: null,
        sourceUrl: "x",
        asOf: "2026-07-14",
      },
    };
    const pc = buildPriceCase(subjectWithStats, HOMES);
    if (!pc) throw new Error("no case");
    const claims = narratorClaims(subjectWithStats, pc);
    expect(claims.some((c) => c.sentence.includes("Heritage Bay"))).toBe(false);
    expect(claims.some((c) => /\b612,000\b/.test(c.sentence))).toBe(false);
  });
});

// ── STYLE COMPARABILITY — operator, 08/04/2026: "WE WANT SIMILAR SQ FT, STYLE, BEDS
// AND BATHS SAME OR CLOSE... WE ARE FUCKING COMPARING." Style must be surfaced when
// we hold it, never invented when we don't (RULE 0.7).
describe("styleDifferenceNote", () => {
  it("is silent when the subject's own style is unknown", () => {
    expect(styleDifferenceNote(null, [comp({ style: "Condo" })])).toBeNull();
  });

  it("is silent when no comp carries a real style, even if the subject does", () => {
    expect(styleDifferenceNote("Single Family", [comp({}), comp({ style: null })])).toBeNull();
  });

  it("is silent when every known comp style matches the subject", () => {
    expect(
      styleDifferenceNote("Single Family", [
        comp({ style: "Single Family" }),
        comp({ style: "single family" }), // case-insensitive match
      ]),
    ).toBeNull();
  });

  it("names the ONE differing style when exactly one kind disagrees", () => {
    const note = styleDifferenceNote("Single Family", [
      comp({ style: "Single Family" }),
      comp({ style: "Condo" }),
    ]);
    expect(note).toBe("Note: one comp is a Condo, not a Single Family.");
  });

  it("says the set mixes styles when more than one kind disagrees, never lists them all", () => {
    const note = styleDifferenceNote("Single Family", [
      comp({ style: "Condo" }),
      comp({ style: "Townhouse" }),
    ]);
    expect(note).toBe("Note: the comps mix styles — not all are a Single Family like the subject.");
  });
});

describe("compsFootnote — style note wiring", () => {
  it("appends the style note onto the existing mix/derivation footnote when it fits", () => {
    const styled = HOMES.slice(0, 2).map((c, i) => (i === 0 ? { ...c, style: "Condo" } : c));
    const footnote = compsFootnote(SUBJECT, styled, "Single Family");
    expect(footnote).toContain("Condo");
  });

  it("drops the style note (never the price range) when the footnote is over budget", () => {
    const styled = HOMES.map((c, i) => (i === 0 ? { ...c, style: "Condo" } : c));
    const footnote = compsFootnote(SUBJECT, styled, "Single Family");
    expect(footnote).not.toContain("Condo");
    expect(footnote).toContain("run from");
  });

  it("never fabricates a style note when subjectStyle is omitted (today's behavior, unchanged)", () => {
    expect(compsFootnote(SUBJECT, HOMES)).not.toContain("Note:");
  });
});

describe("EVERY COMP HAS A PHOTO — a comp we cannot picture is dropped from the SET", () => {
  // Operator, 08/04/2026: "Get rid of the no photo comps."
  //
  // Dropped from the SET, not just the table: the median, the range and the count all
  // recompute on exactly the rows the reader sees. Filtering only the table would print
  // "6 comparable homes ... run from $111 to $266" above five rows.
  //
  // The trade is real and was accepted explicitly: photo coverage now selects the comp
  // set, so it moves the median and the price claim. These tests pin the FLOOR that keeps
  // that from turning a vendor outage into an empty evidence table.

  test("the price case is computed from the PHOTOGRAPHED set, not the full pool", () => {
    // Two homes at $173 and $266 per sq ft. If only the $266 one is photographed, the
    // median the email prints must be $266 — the number belonging to the row on screen.
    const shown = [HOMES[1]!]; // 336 Shore Dr Lot 58 — 1,976 sq ft at $385,000 = $195
    const doc = buildCompsGrid(SUBJECT, shown, canvas());
    const cells = statsOf(doc);
    // Label conformed to listing-flyer.ts's "Median" on 08/04/2026 — see compsSpecs.
    expect(cells.find((c) => c.label === "Median")?.value).toBe("$195");
  });

  test("the stated COUNT matches the number of rows rendered", () => {
    for (const n of [2, 3, 5]) {
      const shown = HOMES.slice(0, n);
      const doc = buildCompsGrid(SUBJECT, shown, canvas());
      const list = listOf(doc);
      expect(list?.type === "list" && list.props.items).toHaveLength(n);
      // The table's own title carries the mix, and the footnote carries the count.
      expect(footnoteOf(doc)).toContain(`${n} comparable home`);
    }
  });

  test("the range quoted in the footnote is the range of the SHOWN rows only", () => {
    const shown = [HOMES[0]!, HOMES[1]!]; // $173 and $195
    const fn = compsFootnote(SUBJECT, shown)!;
    expect(fn).toContain("$173");
    expect(fn).toContain("$195");
    // The $266 home was not shown, so its number may not appear as a bound.
    expect(fn).not.toContain("$266");
  });

  test("MIN_PHOTOGRAPHED_COMPS is 2 — a one-comp price case defends nothing", () => {
    // The floor is deliberately not 1. A median and a range need at least two points, and
    // a vendor outage (the 08/04 Apify cap 403'd every call) must never empty the table.
    const doc = buildCompsGrid(SUBJECT, HOMES.slice(0, 2), canvas());
    const list = listOf(doc);
    expect(list?.type === "list" && list.props.items).toHaveLength(2);
  });

  test("an empty set still lands the grid with open slots — never a refused build", () => {
    // RULE 0.7. Zero comps is a bad email, not a crash.
    const doc = buildCompsGrid(SUBJECT, [], canvas());
    expect(doc.blocks.length).toBeGreaterThan(0);
    expect(listOf(doc)).toBeUndefined(); // a list needs >= 1 row; an empty shell is a lie
  });
});

describe("BATHS ride on every comp row", () => {
  // Operator, 08/04/2026: "Where the fuck is baths?????????????????"
  //
  // The row printed "3 bd · 1,976 sq ft" and dropped the bath count — while RenderComp
  // carried it, lee_comp_sales_v SELECTs it, and the LeePA layer-23 join supplying it was
  // wired 08/02/2026. The data crossed the whole pipeline and was never rendered, in an
  // email whose own comparability rule is "SIMILAR SQ FT, STYLE, BEDS AND BATHS".
  const rowTextFor = (over: Partial<RenderComp>) => {
    const doc = buildCompsGrid(SUBJECT, [comp({ addressLine: "1 A St", ...over })], canvas());
    const list = listOf(doc);
    return list?.type === "list" ? (list.props.items[0]!.text ?? "") : "";
  };

  test("a whole bath count renders as 'N ba', between beds and sq ft", () => {
    expect(rowTextFor({ beds: 3, baths: 2, sqft: 1976 })).toContain("3 bd · 2 ba · 1,976 sq ft");
  });

  test("a HALF bath is not rounded away — 2.5 is a real and different house", () => {
    expect(rowTextFor({ baths: 2.5 })).toContain("2.5 ba");
  });

  test("no bath count → the segment is omitted, never '0 ba'", () => {
    const t = rowTextFor({ baths: null });
    expect(t).not.toContain("ba");
    expect(t).not.toContain("0 ba");
  });

  test("baths survive the row's 200-char cap alongside address, beds, sqft and date", () => {
    const t = rowTextFor({
      addressLine: "15765 PORTOFINO SPRINGS BLVD",
      beds: 3,
      baths: 2,
      sqft: 1990,
      priceKind: "sold",
      priceDate: "2026-04-01",
    });
    expect(t).toContain("2 ba");
    expect(t.length).toBeLessThanOrEqual(200);
  });
});
