/**
 * THE PRICE IMPROVED EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-price-reduced.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-price-reduced.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildPriceReduced` → `applyBrand` →
 * `renderEmailDocHtml` — so what lands on disk is exactly what a send would carry.
 *
 * ── DEFAULT HOUSE: 3113 SW 18th Ave, Cape Coral, FL 33914 ────────────────────────────────
 *
 * Found live 08/09/2026 by querying `data_lake.listing_state` for `flag_price_reduced = true`
 * with a stated `reduced_amount`, full spec line, and a photo — a GENUINE cut on the vendor's
 * own record: $800,000 asking, cut $65,000 (so the derived previous price is $865,000, and a
 * reader can check it: previous − cut = current). 4 beds · 3 baths · 2,123 sqft · 0.26-acre
 * lot, single family, status for_sale. If this house sells or the flag drops, re-run the same
 * query (the script header IS the query recipe) and swap the default.
 *
 * ── WHAT THIS EMAIL GUARANTEES (asserted below, off the RENDERED BYTES) ──────────────────
 *
 *   1. THE STREET LINE IS PRESENT, with no stray comma before the zip (addressLine).
 *   2. THE KICKER STATES THE CUT — "Price cut $65,000" above the address, and the number is
 *      the vendor's own reduced_amount, never a derivation.
 *   3. THE ARITHMETIC HOLDS ON SCREEN: Previous cell = hero price + the kicker's cut.
 *      All three numbers ship, and previous − cut = current is checkable in the reader's head.
 *   4. NO TYPE CELL — the recipe's own ruling: the anchor (Previous Price) takes its slot,
 *      and a seventh cell would FAIL EmailDocSchema and fall through to the generic author.
 *   5. NO INVENTED REASON FOR THE CUT. The narrator ban list, grepped worst-case: motivated,
 *      bargain, steal, priced to move, won't last, reflects the market, room to negotiate.
 *      (This build has no paid-row description → no narrator call at all → the paragraph
 *      slot is OPEN, which is the recipe's documented honest state, not a defect.)
 *   6. THE CTA NEVER POINTS AT OUR HOMEPAGE (§1.8, fixed in the recipe 08/09/2026 — it used
 *      to pass `facts.sourceUrl`, which resolve-subject hardcodes to swfldatagulf.com; it
 *      now rides the `listingButtonUrl` ladder, and no real link means NO destination).
 *
 * SPEND: ONE metered call — the house narrator (`authorListingNarrative`, the walked
 * siblings' shared lane, rebuilt onto this recipe 08/09/2026: the July draft shipped a
 * ZERO-word body without a paid-row description, below the playbook's 50-word floor).
 * The claim gate may legitimately drop the paragraph — then the slot is OPEN and the drop
 * is ON RECORD (assertion 7). The comp fetch is a free lake read; the PNG upload is storage.
 */
import { buildPriceReduced } from "../../lib/deliverable/recipes/price-reduced";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
// THE ONE ACCEPTANCE HARNESS (§1.17 / T1-T2) — everything below that is not this email's own
// provenance rows or its own assertions comes from here.
import {
  captureNarratorDrops,
  loadAccountBrand,
  printBottom,
  printBrandCarry,
  printProvenance,
  renderAndSave,
  reportAssertions,
  subjectAddress,
  type Assertion,
  type ProvenanceRow,
} from "./_harness.mts";

const ADDRESS = subjectAddress("3113 SW 18th Ave, Cape Coral, FL 33914");

console.log(`\n  SUBJECT: ${ADDRESS}\n`);
console.log(
  `  METERED CALLS: 1-2 (the house narrator; a clean second ask only after a gate drop).\n`,
);

const { brand: BRAND, profile: p } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();

// ── THE BUILD — the real recipe, the real chrome ─────────────────────────────
const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED — the grid still lands, every cell an open slot (RULE 0.7).\n" +
      "    Outside Lee/Collier, or the nightly sweep has not landed this listing yet.\n",
  );
}

const built = await buildPriceReduced({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  scope: {},
} as never);
if (!built) {
  console.error(
    "  buildPriceReduced returned null — no facts held at all. This should not happen:\n" +
      "  resolveSubject always returns an address-only fact set on a miss (RULE 0.7).",
  );
  process.exit(1);
}
const doc = applyBrand(built, BRAND);

// ── THE CELLS AS BUILT — read off the doc, never re-derived ──────────────────
const cell = (label: string): string | undefined =>
  doc.blocks
    .filter((b) => b.type === "stats")
    .flatMap((b) => (b.props as { stats?: { label: string; value: string }[] }).stats ?? [])
    .find((s) => s.label === label)?.value || undefined;

const heroProps = doc.blocks.find(
  (b) => b.type === "hero" && !(b.props as { ribbon?: boolean }).ribbon,
)?.props as { value?: string; label?: string; kicker?: string } | undefined;
const buttonProps = doc.blocks.find((b) => b.type === "button")?.props as
  { label?: string; url?: string } | undefined;
const chartBlock = doc.blocks.find(
  (b) => b.type === "image" && (b.props as { kind?: string }).kind === "chart",
)?.props as { url?: string } | undefined;

// The digits of a money string → a number ("$104,975" → 104975); NaN-safe.
const digits = (s?: string): number => Number((s ?? "").replace(/[^\d.]/g, ""));

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const rows: ProvenanceRow[] = [
  ["Street + city + zip", heroProps?.label, "free spine, re-punctuated by addressLine"],
  ["New price (hero)", heroProps?.value, "free spine list_price (daily sweep)"],
  [
    "Price cut (kicker)",
    heroProps?.kicker,
    "free spine reduced_amount — the vendor's own stated cut, verbatim",
  ],
  [
    "Previous Price",
    cell("Previous"),
    "DERIVED — hero price + the cut (both operands two cells away; footnoted)",
  ],
  ["Beds", cell("Beds"), "free spine → paid row"],
  ["Baths", cell("Baths"), "free spine → Lee records → nearby-values → paid row"],
  ["Square feet", cell("Sq Ft"), "free spine → paid row"],
  ["Lot", cell("Lot"), "free spine → paid row"],
  ["$/Sq Ft", cell("$/Sq Ft"), "DERIVED — list price ÷ listed sq ft (both cells on screen)"],
  [
    "Type",
    cell("Type"),
    cell("Type")
      ? "⚠ SHOULD BE ABSENT — the anchor takes its slot"
      : "DROPPED BY DESIGN — the Previous Price anchor takes its slot",
  ],
  [
    "CHART — new price vs. comps",
    chartBlock?.url ? "bklit composed PNG" : undefined,
    chartBlock?.url
      ? "priceVsAreaDotSpec — subject $/sqft vs median of real nearby comps (free lake read)"
      : "slot dropped — fewer than 2 comps with usable $/sqft (never an empty box)",
  ],
  [
    "House paragraph",
    undefined,
    narratorLog.length
      ? `DROPPED BY THE CLAIM GATE — ${narratorLog[0].split("—").slice(1).join("—").trim()}`
      : "filled below — one Sonnet call, record + amenity lanes, the no-reason-for-the-cut framing",
  ],
  [
    "Button destination",
    buttonProps?.url,
    buttonProps?.url
      ? "listingButtonUrl ladder — a REAL listing page"
      : "no real listing url → NO destination (§1.8). Never our homepage.",
  ],
];

// Walk the built blocks for the narrator's own paragraph (never the description block).
const authoredBody =
  (
    doc.blocks.find(
      (b) =>
        b.type === "text" &&
        !(b.props as { descriptionSlot?: boolean }).descriptionSlot &&
        ((b.props as { body?: string }).body ?? "").trim().length > 0,
    )?.props as { body?: string } | undefined
  )?.body ?? "";
const narratorRow = rows.findIndex(([c]) => c === "House paragraph");
// SENTENCE BANK (spec 2026-08-10): the bank's code-owned sentences ship even when the
// claim gate drops the model's connective — so the row shows what actually landed, and
// a gate drop annotates it instead of masking it as an open slot.
if (authoredBody) {
  rows[narratorRow][1] = `${authoredBody.trim().split(/\s+/).length} words`;
  if (narratorLog.length) {
    rows[narratorRow][2] =
      `bank sentences only — connective DROPPED BY THE CLAIM GATE: ${narratorLog[0].split("—").slice(1).join("—").trim()}`;
  }
} else if (!narratorLog.length) {
  rows[narratorRow][1] = undefined;
}

printProvenance(rows);
printBottom(doc);

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(
  `  Button:       "${buttonProps?.label ?? "(none)"}" → ${buttonProps?.url ?? "(no destination)"}`,
);

const { html } = await renderAndSave(doc, "price-reduced-email.html");

// ── THE BOUNDARY — asserted against the RENDERED BYTES ───────────────────────
const lower = html.toLowerCase();
const street =
  String(facts.address ?? "")
    .split(",")[0]
    ?.trim() ?? "";

// The narrator ban list, worst-case substrings (the framing forbids each by name).
const REASON_PROSE = [
  "motivated",
  "bargain",
  "steal",
  "priced to move",
  "won't last",
  "reflects the market",
  "room to negotiate",
];
const reasonHits = REASON_PROSE.filter((s) => lower.includes(s));

const cut = digits(heroProps?.kicker);
const current = digits(heroProps?.value);
const previous = digits(cell("Previous"));
const arithmeticHolds = cut > 0 && current > 0 && previous === current + cut;

const checks: Assertion[] = [
  {
    name: "1 · street line PRESENT, and no stray comma before the zip",
    pass:
      Boolean(street) &&
      lower.includes(street.toLowerCase()) &&
      !/,\s*[A-Z]{2},\s*\d{5}/.test(heroProps?.label ?? ""),
    detail: heroProps?.label ? `"${heroProps.label}"` : "no street on the resolved subject",
  },
  {
    name: '2 · the kicker states the cut ("Price cut $…"), in the rendered bytes',
    pass: /price cut \$[\d,]+/.test(lower) && cut > 0,
    detail: heroProps?.kicker ?? "(no kicker — vendor flag absent?)",
  },
  {
    name: "3 · the arithmetic holds on screen: Previous = hero price + the cut",
    pass: arithmeticHolds,
    detail: `${cell("Previous") ?? "(none)"} = ${heroProps?.value ?? "(none)"} + ${heroProps?.kicker?.replace(/price cut /i, "") ?? "(none)"} ${arithmeticHolds ? "✓" : "✗"}`,
  },
  {
    name: "4 · NO Type cell — the Previous Price anchor takes its slot (EmailDocSchema caps at 6)",
    pass: cell("Type") === undefined,
    detail: cell("Type") ? `Type cell PRESENT: "${cell("Type")}"` : "absent, as designed",
  },
  {
    name: "5 · no invented reason for the cut (narrator ban list, worst-case grep)",
    pass: reasonHits.length === 0,
    detail: reasonHits.length ? `FOUND: ${reasonHits.join(", ")}` : "none of the ban list ships",
  },
  {
    name: "6 · the CTA never points at our homepage (§1.8 — no real link means no destination)",
    pass: !/^https?:\/\/(www\.)?swfldatagulf\.com\/?$/i.test(buttonProps?.url ?? ""),
    detail: buttonProps?.url ?? "(no destination — correct when we hold no listing page)",
  },
];

checks.push({
  name: "7 · the body is never SILENTLY empty — prose ships, or the claim gate's drop is on record",
  pass: Boolean(authoredBody) || narratorLog.length > 0,
  detail: authoredBody
    ? `${authoredBody.trim().split(/\s+/).length} words shipped`
    : narratorLog.length
      ? `gate drop on record: ${narratorLog[0]}`
      : "NO paragraph and NO recorded drop — the July zero-word hard return is back",
});

// ── SENTENCE BANK (spec 2026-08-10-sentence-banks-design.md) ─────────────────
// The bank's cut sentence with the real street, character-for-character. Predicated on
// the KICKER IN THE RENDERED BYTES, not on bankValues' own condition (second-order
// audit 4.2: an assertion that mirrors the producer's predicate can never catch the
// producer diverging) — the invariant here is "cut sentence ships IFF a kicker states
// a cut on screen".
const kickerStatesCut = /price cut \$[\d,]+/.test(lower);
const bankCutSentence = kickerStatesCut && street ? `The price on ${street} just came down.` : "";
checks.push({
  name: "8 · BANK VERBATIM — the code-owned cut sentence ships character-for-character",
  pass: !bankCutSentence || html.includes(bankCutSentence),
  detail: bankCutSentence
    ? html.includes(bankCutSentence)
      ? `"${bankCutSentence}" ✓`
      : `MISSING: "${bankCutSentence}"`
    : "no vendor cut flag — bank sentence correctly absent",
});

// The move is stated at most ONCE in the body prose — the bank's mention plus zero
// model restatements (the framing forbids the model the move in any words).
const moveMentions = (
  authoredBody.match(
    // Widened 08/09/2026 (second-order audit 4.3): "come down" (the served pre-bank
    // capture's own phrasing), dropped/repriced/trimmed — restatement synonyms the
    // first list missed.
    /(came down|come down|reduced|price cut|lowered|improved|adjusted|dropped|repriced|trimmed)/gi,
  ) ?? []
).length;
checks.push({
  name: "9 · the move is stated at most once in the body — the bank's mention, never the model's",
  pass: moveMentions <= 1,
  detail: `${moveMentions} mention(s) in the ${authoredBody ? authoredBody.trim().split(/\s+/).length : 0}-word body`,
});

// A literal {{token}} in the rendered bytes is a template that leaked — instant FAIL.
// (Floor visibility: the word count already prints in assertion 7 and the builder logs
// any sub-50 body loudly; the floor never fails the run — a leak always does.)
checks.push({
  name: "10 · no template residue — a literal {{ in the rendered bytes is a leak",
  pass: !html.includes("{{"),
  detail: html.includes("{{") ? "FOUND literal {{ in rendered HTML" : "clean",
});

printBrandCarry(p);

reportAssertions("THE CUT IS THE NEWS — read off the rendered HTML, not off the source", checks);
