/**
 * THE JUST SOLD EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-just-sold.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-just-sold.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildJustSold` → `applyBrand` →
 * `renderEmailDocHtml` — so what lands on disk is exactly what a send would carry.
 *
 * ── WHAT THIS EMAIL'S CONTRACT IS ────────────────────────────────────────────
 *
 * Coming Soon's script proves something is ABSENT. Under Contract's proves a STATUS.
 * Ours proves a SOURCING LADDER — the operator decree of 08/06/2026:
 *
 *   *** THE HERO CELL IS PREFILLED AND EDITABLE, AND THE PREFILL NEVER LEAVES IT. ***
 *
 * A recorded sale fills the hero when we hold one; otherwise it prefills from the last
 * list price we hold (`listing_state.list_price` → `facts.price`) and the agent types
 * over it. What the run has to prove is the SECOND half of that: a prefill is a starting
 * value in an editable cell, so it may never reach a cell that is DERIVED, CHARTED,
 * FOOTNOTED or WRITTEN INTO PROSE — none of which the agent can correct.
 *
 * EIGHT assertions, all but one read off the RENDERED BYTES, each exiting non-zero:
 *
 *   1. THE STREET LINE IS PRESENT. A sold email celebrates the address; nothing is teased.
 *   2. THE ZIP IS PRESENT.
 *   3. THE HERO CARRIES THE CLOSE CELL VERBATIM — the exact string `heroPrice` returned.
 *      A prefill that gets reformatted on the way to the page is a number the agent no
 *      longer recognizes as their own.
 *   4. A PREFILL DOES NOT DERIVE. `List-to-Sale`, `List Price` and `$/Sq Ft` are ABSENT
 *      from the rendered HTML on a prefilled run (StatsBlock drops empty cells in
 *      `emailRender`, so an open cell is a missing cell). `List-to-Sale` is the sharpest
 *      one: from a prefill it would compute 100.0% and render in the accent as the strip's
 *      PRIMARY cell — a fabricated market outcome wearing the most authoritative styling
 *      on the page.
 *   5. NO SOLD-DATE KICKER OVER A PREFILL. `Sold MM/DD/YYYY` is a claim about a recorded
 *      event and it is not editable. (Matched by regex — a bare `Sold` substring test would
 *      fire on the "Just Sold" ribbon itself.)
 *   6. NO CHART WITHOUT A RECORDED CLOSE. A baked PNG bar carries no label, no provenance
 *      row and no editability — it is the one number on the page the agent cannot reach.
 *      Counted as image BLOCKS against the subject photo, so this one reads the doc, not
 *      the bytes, and is weaker for it (the same caveat Under Contract's assertion 6 carries).
 *   7. THE SELLER'S FOR-SALE DESCRIPTION DOES NOT SHIP. The one suppression assertion here.
 *      Every sibling on this chrome ships it; a sold email must not, because a for-sale
 *      pitch is stale the moment the house closes ("don't miss this opportunity" under a
 *      JUST SOLD ribbon — measured, by rendering it). It looks like a bug in the provenance
 *      table, which is exactly why it is asserted rather than commented.
 *   8. THE PROSE NEVER RESTATES A PREFILL. Prose is baked and uneditable, so the number the
 *      agent is about to correct in the hero would survive inside the paragraph.
 *
 * ── DEFAULT HOUSE: 330 Shore Dr, Fort Myers, FL 33905 ────────────────────────
 *
 * Picked deliberately per §2.5.2: it is the one address measured to carry a REAL recorded
 * sale in its own comp set (closed $300,000 on 08/29/2025, probed live 07/13/2026), so the
 * RECORDED rung is exercised rather than only the prefill. **Run it a second time against a
 * live listing — `12554 Kellysands Way, Fort Myers, FL 33908` — to exercise the PREFILL
 * rung, which under the decree is the common case.** One address cannot prove both.
 *
 * SPEND: no Apify, no paid sold pull. Decree 08/06/2026 — *"APIFY IS FALL BACK FOR SOLD
 * PRICE. WE WILL NOT USE IT UNTIL WE SEE THERE IS AN ACTUAL DIFFERENCE. I WILL DECIDE."*
 * The build issues one `compsForAddress` call (geocode → nearby SOLD → ≤2 exact-sale
 * enrichments, on the SteadyAPI subscription) and one narrator paragraph.
 */
import {
  buildJustSold,
  chartAnchor,
  closeFrom,
  heroPrice,
  realSaleComps,
  soldSpecs,
  subjectRow,
  withSubjectRowFacts,
} from "../../lib/deliverable/recipes/just-sold";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { compsForAddress } from "../../lib/assistant/comp-helper";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
// THE ONE ACCEPTANCE HARNESS (§1.17). Import it; never copy it.
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

const ADDRESS = subjectAddress("330 Shore Dr, Fort Myers, FL 33905");

console.log(`\n  SUBJECT: ${ADDRESS}\n`);

const { brand: BRAND, profile: p } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();

// ── THE BUILD — the real recipe, the real chrome ─────────────────────────────
const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED by the for-sale spine — EXPECTED for a genuinely sold house.\n" +
      "    The subject's own row in its own nearby-SOLD set fills the gaps (withSubjectRowFacts).\n",
  );
}

const built = await buildJustSold({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  scope: {},
} as never);
if (!built) {
  console.error(
    "  buildJustSold returned null — no subject at all, so there is nothing to announce.",
  );
  process.exit(1);
}
const doc = applyBrand(built, BRAND);

// ── WHICH RUNG FILLED THE CLOSE ──────────────────────────────────────────────
// The same two calls the builder makes, re-run here so the provenance table can NAME the
// rung. `compsForAddress` is memoised per address inside the helper's own cache; if it is
// not, this costs one extra vendor call on an acceptance run only — never in the product.
const street =
  String(facts.address ?? "")
    .split(",")[0]
    ?.trim() ?? "";
const allComps = facts.address
  ? ((await compsForAddress(facts.address).catch(() => null))?.comps ?? [])
  : [];
const self = subjectRow(allComps, street);
const close = closeFrom(self);
const filled = withSubjectRowFacts(facts, self);
const hero = heroPrice(filled, close);
const strip = soldSpecs(filled, close);
const cellOf = (label: string) => strip.find((c) => c.label === label)?.value || undefined;

const RUNG_SOURCE: Record<string, string> = {
  recorded: "RUNG 1 — a REAL recorded sale of this house (priceKind 'sold')",
  prefill: "RUNG 3 — PREFILL from listing_state.list_price · EDITABLE, the agent types over it",
  open: "OPEN SLOT — no recorded sale and no list price held. Never a zero.",
};

const rows: ProvenanceRow[] = [
  ["Street + city + ZIP", facts.address, "free spine — SHIPS IN FULL"],
  ["THE CLOSE (hero)", hero.value, RUNG_SOURCE[hero.rung]],
  [
    "Sold date (kicker)",
    hero.kicker,
    "RECORDED sales only — a date line is not editable, so a prefill gets none",
  ],
  ["Beds", filled.beds, "free spine → the subject's own row in its own sold set"],
  ["Baths", filled.baths, "free spine → Lee records → nearby-values → subject row"],
  ["Square feet", filled.sqft, "free spine → subject row"],
  ["$/Sq Ft", cellOf("$/Sq Ft"), "DERIVED from the RECORDED close ÷ sq ft — never from a prefill"],
  ["List Price", cellOf("List Price"), "the PAIRING RULE — only ever alongside a recorded close"],
  ["List-to-Sale", cellOf("List-to-Sale"), "DERIVED — a prefill would compute a fake 100.0%"],
  ["Hero photo", filled.photos[0], "free spine photo_url → paid row already on disk → no photo"],
  [
    "Comps chart",
    chartAnchor(close) != null ? "anchored on the recorded close" : undefined,
    `${realSaleComps(allComps, street).length} real recorded sales nearby; a PREFILL IS NEVER A BAR`,
  ],
  [
    "Sold-comps list",
    realSaleComps(allComps, street).length
      ? `${realSaleComps(allComps, street).length} rows`
      : undefined,
    "recorded sales only — beds AND sqft required, AVM estimates dropped, subject excluded",
  ],
  [
    "Description (verbatim)",
    undefined,
    filled.remarks
      ? `HELD (${filled.remarks.length} chars) and DELIBERATELY NOT SHIPPED — a for-sale pitch is stale once it closes`
      : "none held",
  ],
  [
    "Authored paragraph",
    undefined,
    narratorLog.length
      ? `DROPPED BY THE CLAIM GATE — ${narratorLog[0].split("—").slice(1).join("—").trim()}`
      : close
        ? "one Sonnet call; the recorded close rides in the FRAMING so prose may state it"
        : "one Sonnet call; NO price may be named — the prefill is not in the framing",
  ],
  [
    "PAID SOLD PULL",
    undefined,
    "SUSPENDED by decree 08/06/2026 — the operator decides, not the build",
  ],
];

// The authored paragraph, found the §2.2.4 way — walk every string, EXCLUDE the chrome's own
// prose (an agent bio is long too, and a length heuristic cannot tell them apart).
const collect = (v: unknown, into: string[]): void => {
  if (typeof v === "string") into.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collect(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, into));
};
const NOT_AUTHORED = new Set(["agent-card", "footer", "header", "sources", "button", "stats"]);
const strings: string[] = [];
const chromeStrings: string[] = [];
for (const b of doc.blocks) collect(b.props, NOT_AUTHORED.has(b.type) ? chromeStrings : strings);
const chrome = new Set(chromeStrings.map((s) => s.trim()));
const remarks = (filled.remarks ?? "").trim();
const authored = strings.find(
  (s) =>
    s.length > 120 && !chrome.has(s.trim()) && s.trim() !== remarks && !remarks.includes(s.trim()),
);
rows[rows.findIndex(([c]) => c === "Authored paragraph")][1] = authored
  ? `${authored.length} chars`
  : undefined;

printProvenance(rows);
printBottom(doc);

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(`  CLOSE RUNG:   ${hero.rung.toUpperCase()} — "${hero.value || "(open slot)"}"`);

const { html } = await renderAndSave(doc, "just-sold-email.html");

// ── THE SOURCING LADDER — asserted against the RENDERED BYTES ────────────────
const lower = html.toLowerCase();
// A GENUINELY SOLD HOUSE IS NOT IN THE FOR-SALE SPINE, so `facts.zip` is empty on exactly
// the run this email exists for — the assertion fired on its first live run against a real
// sold house and the defect was the ASSERTION, not the email (the ZIP was on the page, inside
// the address line). Read the ZIP the way the reader does: off the address that ships.
const zip = String(filled.zip || filled.address || "").match(/\b\d{5}\b/)?.[0] ?? "";
const imageBlocks = doc.blocks.filter((b) => b.type === "image").length;
const prefilled = hero.rung === "prefill";
const DERIVED_LABELS = ["List-to-Sale", "List Price", "$/Sq Ft"];
const leaked = prefilled ? DERIVED_LABELS.filter((l) => html.includes(l)) : [];
const priceInProse = /\$\s?[\d,]{3,}/.exec(authored ?? "")?.[0];

const checks: Assertion[] = [
  {
    name: "1 · street line PRESENT",
    pass: Boolean(street) && lower.includes(street.toLowerCase()),
    detail: street ? `"${street}"` : "no street on the resolved subject",
  },
  {
    name: "2 · ZIP PRESENT",
    pass: Boolean(zip) && html.includes(zip),
    detail: zip ? `"${zip}"` : "no ZIP held",
  },
  {
    name: "3 · hero carries the close VERBATIM",
    // An open slot is a legal state (nothing recorded AND no list price held). A hero value
    // that was reformatted on the way to the page is not.
    pass: !hero.value || html.includes(hero.value),
    detail: hero.value ? `"${hero.value}" (${hero.rung})` : "open slot — nothing held (legal)",
  },
  {
    name: "4 · a PREFILL does not derive",
    pass: leaked.length === 0,
    detail: prefilled
      ? leaked.length
        ? `LEAKED: ${leaked.join(", ")}`
        : "List-to-Sale / List Price / $/Sq Ft all absent ✓"
      : "n/a — this run holds a RECORDED close, so the derived cells are legitimate",
  },
  {
    name: "5 · no sold-date kicker on a prefill",
    // A bare "sold" test would fire on the ribbon. The kicker is a DATE claim.
    pass: !prefilled || !/Sold \d{2}\/\d{2}\/\d{4}/.test(html),
    detail: prefilled
      ? (/Sold \d{2}\/\d{2}\/\d{4}/.exec(html)?.[0] ?? "absent ✓")
      : `n/a — recorded close, kicker "${hero.kicker ?? "(no date on the record)"}"`,
  },
  {
    name: "6 · no chart without a recorded close",
    pass: close ? true : imageBlocks === (filled.photos[0] ? 1 : 0),
    detail: `${imageBlocks} image block(s); photo ${filled.photos[0] ? "held" : "absent"}; anchor ${
      chartAnchor(close) ?? "none"
    }`,
  },
  {
    // THE SELLER'S FOR-SALE PITCH DOES NOT SHIP ON A SOLD EMAIL. Found by rendering and
    // looking, 08/06/2026: wired up, it put "don't miss this opportunity" under a JUST SOLD
    // ribbon. This is a SUPPRESSION assertion — the only one on this email — and it is here
    // because the omission looks exactly like a bug to anyone reading the provenance table.
    name: "7 · seller's description does NOT ship",
    pass: !filled.remarks || !html.includes(filled.remarks.slice(0, 60)),
    detail: filled.remarks
      ? html.includes(filled.remarks.slice(0, 60))
        ? "THE FOR-SALE PITCH REACHED A SOLD EMAIL"
        : `${filled.remarks.length} chars held, absent from the render ✓`
      : "no description held on this subject",
  },
  {
    // THE PROSE MAY NEVER RESTATE A PREFILL. Prose is baked and uneditable, so the one
    // number the agent is about to correct in the hero would survive, uncorrected, inside
    // the paragraph — and under a JUST SOLD ribbon it reads as the close.
    //
    // FIRST VERSION OF THIS ASSERTION WAS TOO BROAD AND WENT RED ON A HEALTHY RUN: it
    // banned ANY dollar figure, and the narrator wrote the monthly HOA fee ($1,326) — a
    // sourced, clearly-labelled cost that is not a price for this home at all. An assertion
    // that fires on correct output is a stale-alarm generator (T5); narrow it to the thing
    // that is actually wrong.
    name: "8 · prose never restates a PREFILL",
    pass: !prefilled || !(authored ?? "").includes(hero.value.replace(/^\$/, "")),
    detail: prefilled
      ? (authored ?? "").includes(hero.value.replace(/^\$/, ""))
        ? `PROSE RESTATED THE PREFILL "${hero.value}"`
        : `prefill "${hero.value}" absent from the paragraph${priceInProse ? ` (it does name ${priceInProse} — sourced, and labelled as what it is)` : ""} ✓`
      : "n/a — a recorded close may be stated in prose",
  },
];

printBrandCarry(p);

reportAssertions("THE SOURCING LADDER — read off the rendered HTML, not off the source", checks);
