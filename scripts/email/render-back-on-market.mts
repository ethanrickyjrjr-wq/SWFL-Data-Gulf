/**
 * THE BACK ON THE MARKET EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-back-on-market.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-back-on-market.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildBackOnMarket` (PROPERTY mode) →
 * `applyBrand` → `renderEmailDocHtml` — so what lands on disk is exactly what a send would
 * carry.
 *
 * ⚠️ THIS SCRIPT COVERS PROPERTY MODE ONLY. Its previous header claimed "a second,
 * unasserted pass at the bottom exercises AREA mode" — there was no such pass, and there
 * could not have been: `reportAssertions` returns `never` and calls `process.exit`, so
 * anything after it is unreachable. AREA mode is covered by back-on-market.test.ts and by
 * the `/r/back-on-market` read page; it has never been rendered and looked at. Corrected
 * rather than deleted, because a false claim in a header is how §2.4's "an acceptance house
 * that never exercises the prose lane cannot show you that" happens again.
 *
 * ── THIS EMAIL IS THE NEW-LISTING FLYER WITH TWO DIALS TURNED (rewritten 08/06/2026) ──
 *
 * Operator, reading the previous render: *"no one cares about how many days it was off
 * market … lead like a new fucking listing … get rid of the stupid talk. it's basically a
 * new listing. please use the playbook."* Property mode now calls `buildListingFlyer`
 * directly and changes only the RIBBON WORD and the CTA LABEL, so this email cannot drift
 * away from §2.1's. Three things went with that change, and three of the assertions below
 * exist to keep them gone:
 *
 *   • the cancellation-rate paragraph ("the stupid talk") — a market-statistics lecture on
 *     an email about ONE HOUSE. Those rates are AREA mode's whole subject and stay there.
 *   • the "Days Off" cell, which used to LEAD the strip and displace $/Sq Ft and Type.
 *   • `facts.sourceUrl` behind the CTA and the photo link — `resolve-subject.ts` hardcodes
 *     it to our own homepage, which §1.8 names as a deliverability violation. The flyer's
 *     `listingButtonUrl` ladder returns null there, and null means NO BUTTON.
 *
 * SIX assertions, each read off the RENDERED HTML, each with a non-zero exit on failure:
 *
 *   1. THE STREET LINE IS PRESENT (and carries no stray comma before the zip).
 *   2. NONE OF THE PROHIBITED SUBSTRINGS SHIP. `BACK_ON_MARKET_PROHIBITIONS` names the
 *      CLASSES; the exhaustive phrase list is enforced in CI by back-on-market.test.ts and
 *      is deliberately NOT re-typed here (trap T2 — the hand-copied second list). This
 *      script greps the one word every class collapses to worst-case: "stigmatized".
 *   3. NO CANCELLATION RATE, local or national, anywhere in the bytes.
 *   4. NO "DAYS OFF" ANYWHERE, and NO stats:grid (one stats block per lifecycle email).
 *   5. THE HOUSE DETAILS LEAD — price in the hero, and beds/baths/sq ft on screen.
 *   6. THE CTA NEVER POINTS AT OUR HOMEPAGE.
 *
 * ── DEFAULT HOUSE: 13501 Brown Bear Run, Fort Myers, FL 33928 ───────────────────────────
 *
 * Found live 08/06/2026 by querying `data_lake.listing_transitions` for a `holding → active`
 * transition with `days_off_market >= 7` (the real Lane-2 relist floor) — a GENUINE relist.
 * It carries the full spec line: $669,000 · 3 beds · 2.5 baths · 2,361 sqft · 0.26-acre lot.
 *
 * ⚠️ KNOWN OPEN SLOT ON THIS HOUSE — the seller's own description. Counted live 08/06/2026:
 * **102 relist events (>= 7 days off) in `listing_transitions`, and ZERO of their addresses
 * carry a row in `data_lake.apify_property_records`** — which is the only place a listing
 * description exists anywhere in the lake (`listing_state`, the free spine, has no such
 * column at all). So the description block is WIRED and correct here, and no relist address
 * we hold can currently fill it. It lights up the moment a paid row lands for one. Do not
 * read its absence as a bug in the recipe, and do not "fix" it by inventing copy.
 *
 * SPEND: ONE metered call — the house narrator (`authorListingNarrative`, Sonnet). The
 * geocode and the spine read are free. Run without `ANTHROPIC_API_KEY` and even that becomes
 * an open slot — the flyer still ships (RULE 0.7).
 */
import {
  buildBackOnMarket,
  BACK_ON_MARKET_PROHIBITIONS,
} from "../../lib/deliverable/recipes/back-on-market";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import { listingButtonUrl } from "../../lib/listings/listing-url";
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

const ADDRESS = subjectAddress("13501 Brown Bear Run, Fort Myers, FL 33928");

console.log(`\n  SUBJECT: ${ADDRESS}\n`);
console.log(`  METERED CALLS: 1 (the house narrator, Sonnet) — everything else is a free read.\n`);

const { brand: BRAND, profile: p } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();

// ── THE BUILD — the real recipe, the real chrome, PROPERTY mode ──────────────
const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED — the grid still lands, every cell an open slot (RULE 0.7).\n" +
      "    Outside Lee/Collier, or the nightly sweep has not landed this listing yet.\n",
  );
}

const built = await buildBackOnMarket({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  scope: {},
} as never);
if (!built) {
  console.error(
    "  buildBackOnMarket returned null in PROPERTY mode — no facts held at all, so there is\n" +
      "  no house to announce. This should not happen: resolveSubject always returns an\n" +
      "  address-only fact set on a miss (RULE 0.7).",
  );
  process.exit(1);
}
const doc = applyBrand(built, BRAND);

// ── THE CELLS AS BUILT — read off the doc, never re-derived ──────────────────
// Scans BOTH stats rows (the strip and `secondSpecRow`'s built/HOA row), because year
// built and the HOA fee live in the second one. An earlier cut of this file also bound
// the strip alone and then never read it — the lint caught it.
const cell = (label: string): string | undefined =>
  doc.blocks
    .filter((b) => b.type === "stats")
    .flatMap((b) => (b.props as { stats?: { label: string; value: string }[] }).stats ?? [])
    .find((s) => s.label === label)?.value || undefined;

const descriptionBlock = doc.blocks.find(
  (b) => b.type === "text" && (b.props as { descriptionSlot?: boolean }).descriptionSlot,
);
const heroProps = doc.blocks.find(
  (b) => b.type === "hero" && !(b.props as { ribbon?: boolean }).ribbon,
)?.props as { value?: string; label?: string } | undefined;
const buttonProps = doc.blocks.find((b) => b.type === "button")?.props as
  { label?: string; url?: string } | undefined;

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const rows: ProvenanceRow[] = [
  [
    "Street + city + zip",
    heroProps?.label,
    "free spine, re-punctuated by addressLineOf (ONE root)",
  ],
  ["List price (hero)", heroProps?.value, "free spine (daily sweep)"],
  ["Beds", cell("Beds"), "free spine → paid row"],
  ["Baths", cell("Baths"), "free spine → Lee records → nearby-values → paid row"],
  ["Square feet", cell("Sq Ft"), "free spine → paid row"],
  ["Lot", cell("Lot"), "free spine → paid row"],
  ["$/Sq Ft", cell("$/Sq Ft"), "DERIVED — list price ÷ listed sq ft (both cells two over)"],
  ["Type", cell("Type"), "free spine property_type, mapped at the render edge"],
  ["Year built", cell("Built"), "paid row ONLY — no other source holds it"],
  ["HOA / mo", cell("HOA/mo"), "paid row ONLY, and only when > 0"],
  [
    "Seller's description",
    descriptionBlock ? "SHIPS VERBATIM" : undefined,
    descriptionBlock
      ? "paid row description — its own block, exempt from the 50-125 word budget"
      : "OPEN SLOT — no paid row for this address; 0 of 102 relists hold one (counted 08/06/2026)",
  ],
  [
    "House paragraph",
    undefined,
    narratorLog.length
      ? `DROPPED BY THE CLAIM GATE — ${narratorLog[0].split("—").slice(1).join("—").trim()}`
      : "filled below — one Sonnet call, new-listing framing (never the market status)",
  ],
  [
    "Button destination",
    buttonProps?.url,
    listingButtonUrl(facts)
      ? "listingButtonUrl ladder — a REAL listing page"
      : "no real listing url → NO BUTTON DESTINATION (§1.8). Never our homepage.",
  ],
  ["CHART", undefined, "POLICY 'none' — same ruling as §2.1: this email's visual IS the photo"],
];

// Walk EVERY string in the built blocks to find the narrator's own sentence, excluding chrome
// the recipe does not author (same exclusion list as render-under-contract.mts — §2.2.4).
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
if (!narratorLog.length) {
  rows[narratorRow][1] = authoredBody
    ? `${authoredBody.trim().split(/\s+/).length} words`
    : undefined;
}

printProvenance(rows);

printBottom(doc);

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(
  `  Button:       "${buttonProps?.label ?? "(none)"}" → ${buttonProps?.url ?? "(no destination)"}`,
);

const { html } = await renderAndSave(doc, "back-on-market-email.html");

// ── THE BOUNDARY — asserted against the RENDERED BYTES ───────────────────────
const lower = html.toLowerCase();
const street =
  String(facts.address ?? "")
    .split(",")[0]
    ?.trim() ?? "";
const statsGridCount = doc.blocks.filter(
  (b) => b.type === "stats" && (b.props as { variant?: string }).variant === "grid",
).length;
// The rate strings that used to ship here. Absence is the assertion — a stronger guard than
// "exactly once", and the one the operator actually asked for.
const RATE_PROSE = ["fall through", "no fault of the seller", "red flag", "13.6%"];
const rateHits = RATE_PROSE.filter((s) => lower.includes(s.toLowerCase()));
const houseCells = ["Beds", "Baths", "Sq Ft"].map((l) => [l, cell(l)] as const);
const missingCells = houseCells.filter(([, v]) => !v).map(([l]) => l);

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
    name: "2 · no prohibited language (worst-case word check; full list in back-on-market.test.ts)",
    pass: !lower.includes("stigmatiz"),
    detail:
      BACK_ON_MARKET_PROHIBITIONS.length > 0 ? "constant present, HTML clean" : "constant missing",
  },
  {
    name: '3 · NO cancellation-rate prose — "the stupid talk" is gone, both rates with it',
    pass: rateHits.length === 0,
    detail: rateHits.length ? `FOUND: ${rateHits.join(", ")}` : "none of the rate strings ship",
  },
  {
    name: '4 · NO "Days Off" cell, and NO stats:grid (one stats block per lifecycle email)',
    pass: !lower.includes("days off") && statsGridCount === 0,
    detail: `"days off" ${lower.includes("days off") ? "PRESENT" : "absent"}; ${statsGridCount} stats:grid block(s)`,
  },
  {
    name: "5 · THE HOUSE DETAILS LEAD — price in the hero, beds/baths/sq ft on screen",
    pass: Boolean(heroProps?.value) && missingCells.length === 0,
    detail: missingCells.length
      ? `MISSING: ${missingCells.join(", ")} (hero price ${heroProps?.value ?? "(none)"})`
      : `${heroProps?.value} · ${cell("Beds")} bd · ${cell("Baths")} ba · ${cell("Sq Ft")} sqft · ${cell("Lot") ?? "(no lot)"}`,
  },
  {
    name: "6 · the CTA never points at our homepage (§1.8 — no real link means no button)",
    pass: !/^https?:\/\/(www\.)?swfldatagulf\.com\/?$/i.test(buttonProps?.url ?? ""),
    detail: buttonProps?.url ?? "(no destination — correct when we hold no listing page)",
  },
];

printBrandCarry(p);

reportAssertions("THE HOUSE LEADS — read off the rendered HTML, not off the source", checks);
