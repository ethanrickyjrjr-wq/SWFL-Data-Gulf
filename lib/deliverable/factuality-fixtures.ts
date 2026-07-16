// Golden set for the factuality CI gate (spec 2026-07-16-factuality-ci-gate-design.md
// D3/D4). Five classes: a=accurate numeric, b=right number wrong direction (MUST fail),
// c=qualitative contradiction (MUST fail), d=boring accurate qualitative,
// e=accurate beyond-reference addition. Classes d/e are the false-positive alarm.
//
// THE IMPROVEMENT LOOP (spec D4): when a real bad narrative is caught anywhere,
// distill it here in the same session — frozen facts → reference, the bad sentence
// → completion, expectPass:false, origin in note. Good answers get frozen as
// pass-fixtures the same way. One array entry each.
//
// Values below are synthetic test data — each reference is the source of truth
// for its own case; nothing here is published anywhere.

export interface FactualityFixture {
  id: string; // stable slug
  cls: "a" | "b" | "c" | "d" | "e";
  reference: string; // the facts, stated plainly (source of truth for this case)
  completion: string; // the narrative sentence under judgment
  expectPass: boolean;
  note: string; // why this case exists (real-world origin if distilled from one)
}

export const FACTUALITY_FIXTURES: FactualityFixture[] = [
  // ── class a: accurate numeric sentences ─────────────────────────────────
  {
    id: "a-median-price-accurate",
    cls: "a",
    reference:
      "The median single-family sale price in the area was $410,000 in the month ending 05/31/2026, down from $432,000 the prior month.",
    completion: "The median sale price came in at $410,000, down from $432,000 a month earlier.",
    expectPass: true,
    note: "Baseline: number and direction both correct must pass.",
  },
  {
    id: "a-inventory-accurate",
    cls: "a",
    reference: "Active listings stood at 4,812 in June, up 9% from a year earlier.",
    completion: "Inventory expanded to 4,812 active listings, a 9% increase from a year ago.",
    expectPass: true,
    note: "Accurate count + accurate YoY direction must pass.",
  },
  {
    id: "a-rent-flat-accurate",
    cls: "a",
    reference: "Median asking rent was $2,150 per month, unchanged from the prior quarter.",
    completion: "Asking rents held flat at $2,150.",
    expectPass: true,
    note: "Accurate 'unchanged' claim must pass.",
  },
  // ── class b: right number, reversed direction (the founding failure) ────
  {
    id: "b-reversed-direction-median-price",
    cls: "b",
    reference:
      "The median single-family sale price in the area was $410,000 in the month ending 05/31/2026, down from $432,000 the prior month.",
    completion: "Prices rose to $410,000 this month.",
    expectPass: false,
    note: "THE founding case: the digit is anchored and real, the direction is a lie. Regex lints structurally cannot catch this.",
  },
  {
    id: "b-reversed-yoy-inventory",
    cls: "b",
    reference: "Active listings stood at 4,812 in June, down 9% from a year earlier.",
    completion: "Listings grew 9% from last year, reaching 4,812.",
    expectPass: false,
    note: "Both numbers real; the year-over-year direction is inverted.",
  },
  {
    id: "b-reversed-rank",
    cls: "b",
    reference:
      "Cape Coral recorded the slowest price growth of the five cities tracked this quarter.",
    completion: "Cape Coral led the five tracked cities in price growth this quarter.",
    expectPass: false,
    note: "Rank reversal with no numeral at all — nothing for exact-number anchoring to check.",
  },
  // ── class c: qualitative claims contradicted by the facts ───────────────
  {
    id: "c-demand-surging-vs-falling-sales",
    cls: "c",
    reference:
      "Closed sales fell for the fourth consecutive month, and pending contracts are at a three-year low.",
    completion: "Buyer demand is surging across the market.",
    expectPass: false,
    note: "Pure vibes contradicted by the facts; no number to anchor.",
  },
  {
    id: "c-tight-market-vs-rising-supply",
    cls: "c",
    reference: "Months of supply climbed from 4.1 to 7.3 over the past year.",
    completion: "The market remains extremely tight, with buyers facing scarce options.",
    expectPass: false,
    note: "'Tight' asserted over near-doubled supply.",
  },
  {
    id: "c-seller-leverage-vs-price-cuts",
    cls: "c",
    reference:
      "Price cuts outnumbered price increases roughly nine to one among active listings over the last 90 days.",
    completion: "Sellers hold all the leverage in today's market.",
    expectPass: false,
    note: "Leverage claim contradicted by the cut/raise ratio.",
  },
  // ── class d: boring accurate qualitative (false-positive alarm) ─────────
  {
    id: "d-supply-loosened",
    cls: "d",
    reference: "Months of supply climbed from 4.1 to 7.3 over the past year.",
    completion: "Supply conditions have loosened considerably over the past year.",
    expectPass: true,
    note: "Fair qualitative restatement of a numeric fact must pass — if this fails, the judge is noise.",
  },
  {
    id: "d-sellers-trimming",
    cls: "d",
    reference:
      "Price cuts outnumbered price increases roughly nine to one among active listings over the last 90 days.",
    completion: "Sellers are trimming asking prices far more often than they are raising them.",
    expectPass: true,
    note: "Faithful qualitative reading of the ratio must pass.",
  },
  {
    id: "d-sales-sliding",
    cls: "d",
    reference:
      "Closed sales fell for the fourth consecutive month, and pending contracts are at a three-year low.",
    completion: "Closed sales continued to slide, and forward-looking contract activity is weak.",
    expectPass: true,
    note: "Accurate paraphrase with mild interpretation must pass.",
  },
  // ── class e: accurate additions beyond the reference ────────────────────
  {
    id: "e-derived-percentage",
    cls: "e",
    reference:
      "The median sale price was $410,000 in the latest month, down from $432,000 the prior month.",
    completion:
      "The median sale price fell to $410,000 from $432,000 — a roughly 5% one-month decline.",
    expectPass: true,
    note: "The ~5% is straightforward arithmetic on reference values (superset, category B). The most judge-sensitive pass-fixture; if it flakes, document in the handoff before touching thresholds.",
  },
  {
    id: "e-restated-order",
    cls: "e",
    reference: "Median asking rent was $2,150 per month, unchanged from the prior quarter.",
    completion: "At $2,150 per month, the median asking rent was unchanged from the prior quarter.",
    expectPass: true,
    note: "Same facts, reordered phrasing — full-overlap (category C) must pass.",
  },
];
