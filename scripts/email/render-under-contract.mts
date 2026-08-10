/**
 * THE UNDER CONTRACT EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-under-contract.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-under-contract.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildUnderContract` → `applyBrand` →
 * `renderEmailDocHtml` — so what lands on disk is exactly what a send would carry.
 *
 * ── THIS EMAIL'S CONTRACT IS AN ASSERTION CONTRACT, NOT A SUPPRESSION ONE ────
 *
 * Coming Soon's script greps the rendered bytes to prove something is ABSENT. Market
 * Comps' proves its evidence table holds up. Ours proves a STATUS:
 *
 *   *** THE EMAIL STATES A PENDING FACT AND NEVER A SOLD ONE. ***
 *
 * SIX assertions — five read off the RENDERED HTML rather than off the source, the sixth
 * off the built doc — each with a non-zero exit on failure:
 *
 *   1. THE STREET LINE AND THE ZIP ARE PRESENT. This is a public, celebrated status —
 *      nothing is teased or withheld — so a missing address is a defect here exactly as a
 *      present one is a defect on Coming Soon.
 *   2. NO SOLD LANGUAGE. The banned phrases are imported from the recipe
 *      (`SOLD_LANGUAGE`), never re-typed here. A hand-copied second list is how a guard
 *      silently stops guarding when someone edits one of the two copies.
 *   3. THE PRICE ON THE PAGE IS THE LIST PRICE, verbatim-formatted. A pending home has
 *      not sold and we do not hold a sold price.
 *   4. NO "DAYS ON MARKET" PHRASING. Trap 1 of the build handoff, and the reason the July
 *      recipe was refuted: `days_in_state` ages only while `state` is unchanged and
 *      `flag_pending` is not part of `state`, so it is days-in-ACTIVE. The MLS clock on
 *      this home stopped. If a speed number ships it ships as a CLOSED interval, labelled
 *      "Days to contract".
 *   5. NO CHART. Chart policy is "none", and "none" means DROP the slot. Exactly one
 *      `<img>`-bearing image block when we hold a subject photo — that photo. More means
 *      a chart came back; fewer means the photo vanished. (A ceiling with no floor would
 *      pass a chart that REPLACED the photo — the §2.3.0 lesson.)
 *
 * **ASSERTIONS 1-5 WERE PROVEN RED BEFORE THEY WERE TRUSTED** (08/06/2026, by mutating the
 * rendered HTML in a scratch harness — redact the street, zero the ZIP, splice in "sold for",
 * change the price, splice in "days on market" — and confirming each one flips to FAIL).
 * An assertion that has never gone red is a comment with a `process.exit(1)` attached.
 * **Assertion 6 is NOT proven that way and is weaker for it:** it counts image BLOCKS on the
 * built doc rather than reading the rendered bytes, so an HTML mutation cannot exercise it.
 *
 * ── DEFAULT HOUSE: 4140 Horsecreek Blvd, Fort Myers, FL 33905 ────────────────
 *
 * CHANGED AGAIN 08/10/2026, by operator decree: the showcase keeps ONE house per email and
 * under-contract's is Horsecreek ("I DON'T WANT FUCKING KELLYSANDS WAY"). Its description
 * was bought onto the paid row the same day (dated-area pull, §3.3.1 — there is NO address
 * lookup on the actor; the 08/07 capture shipped description-less because no lane held it).
 * The history below records why Kellysands briefly held the seat — lane coverage:
 *
 * CHANGED 08/06/2026, after the first acceptance run. It was Market Comps' house
 * (8348 Southwindbay Cir) because that subject was already measured to carry a real,
 * non-floored listing clock — which is the one input the headline number needs. It does,
 * and the speed pair rendered 19 against a ZIP median of 127.
 *
 * **But it holds no description, so the email shipped with ZERO words of body copy** —
 * every cell a number, against §1.9's 50–125-word floor ("the FLOOR bites harder than the
 * ceiling; a 25-word email performs about as badly as a 2000-word one"). The narrator had
 * correctly declined to run, the open-slot contract had correctly held, and the artifact
 * was still a wall of figures. An acceptance house that never exercises the prose lane
 * cannot show you that.
 *
 * Kellysands Way is New Listing's own acceptance subject and it carries BOTH: a real
 * non-floored clock (DOM 11, measured 08/05/2026) **and** a 549-character seller
 * description. So this run exercises the speed pair, the verbatim description slot and the
 * narrator in one pass. Pass any address as argv[2] to check a different one.
 *
 * SPEND: **ZERO new vendor spend.** The free spine, our own `listing_dom` clock and the
 * `data_lake.zip_active_dom_median` RPC are all free reads. This recipe issues no paid
 * call at all — unlike Market Comps, it never buys a comp set. The ONLY metered call in
 * the build is the one narrator paragraph, and it fires only when a description exists;
 * run without ANTHROPIC_API_KEY and even that becomes an open slot.
 */
import {
  buildUnderContract,
  daysToContract,
  loadSpeed,
  SOLD_LANGUAGE,
  UNDER_CONTRACT_FIELDS,
} from "../../lib/deliverable/recipes/under-contract";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
// THE ONE ACCEPTANCE HARNESS. Everything below that is not this email's own provenance rows
// or its own assertions comes from here — see `_harness.mts` for why (four scripts, 1,330
// lines, and a clip() fix that never reached the two scripts nobody went back to).
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

// OPERATOR DECREE 08/10/2026: the under-contract showcase house is 4140 Horsecreek Blvd —
// "I DON'T WANT FUCKING KELLYSANDS WAY" (each showcase email keeps its OWN house; Kellysands
// is New Listing's). Its description lives on the paid row bought 08/10/2026 (vendor spells
// it "Horse Creek" — the loose key bridges the drift), so this house now exercises the
// description slot, the community layers AND the speed pair.
const ADDRESS = subjectAddress("4140 Horsecreek Blvd, Fort Myers, FL 33905");

console.log(`\n  SUBJECT: ${ADDRESS}\n`);

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

// The canvas arrives ALREADY BRANDED — the same faithfulness point Coming Soon's script
// makes. In the product the canvas is a live, already-branded doc; `applyBrand` still runs
// LAST as the overlay (stop 4 of the five-stop pipe).
const built = await buildUnderContract({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  scope: {},
} as never);
if (!built) {
  console.error(
    "  buildUnderContract returned null — no street and no city, so there is no house to\n" +
      "  announce. In the product this falls through to the terminal author and stamps\n" +
      "  recipe_key = default-grid, which is the signal to go look.",
  );
  process.exit(1);
}
const doc = applyBrand(built, BRAND);

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const days = daysToContract(facts);
const speed = await loadSpeed(facts).catch(() => null);
const medianShipped =
  speed?.medianDom != null && speed.sampleSize >= UNDER_CONTRACT_FIELDS.minMedianSample;

const rows: ProvenanceRow[] = [
  ["Street + city + ZIP", facts.address, "free spine — SHIPS IN FULL (the invariant)"],
  ["List price", facts.price, "free spine (daily sweep) — NEVER a sold price"],
  ["Beds", facts.beds, "free spine → paid row"],
  ["Baths", facts.baths, "free spine → Lee records → nearby-values → paid row"],
  ["Square feet", facts.sqft, "free spine → paid row"],
  ["$/sq ft", facts.price && facts.sqft ? "computed" : undefined, "computed, price ÷ sq ft"],
  ["Lot", facts.lotSize, "free spine — SHIPS here (Coming Soon drops it)"],
  ["Property type", facts.propertyType, "free spine"],
  ["Hero photo", facts.photos[0], "free spine photo_url, mirrored → paid row → no photo"],
  [
    "DAYS TO CONTRACT",
    days != null ? String(days) : undefined,
    "our own listing_dom clock; contract date = build date (decree). Floored → OPEN",
  ],
  [
    "Median days listed",
    medianShipped ? String(speed!.medianDom) : undefined,
    medianShipped
      ? `zip_active_dom_median, ${speed!.sampleSize} listings (floor ${UNDER_CONTRACT_FIELDS.minMedianSample})`
      : speed?.medianDom != null
        ? `DROPPED — sample ${speed.sampleSize} below floor ${UNDER_CONTRACT_FIELDS.minMedianSample}`
        : "no ZIP median — comparison dropped, this home's number ships alone",
  ],
  [
    "Comparand scope",
    medianShipped ? speed!.scopeLabel : undefined,
    speed ? `ladder rung ${speed.rung}` : "no speed at all",
  ],
  [
    "Description (verbatim)",
    facts.remarks ? `${facts.remarks.length} chars` : undefined,
    "agent's paste → paid row — ships in its own reserved slot",
  ],
  [
    "Authored paragraph",
    undefined,
    narratorLog.length
      ? `DROPPED BY THE CLAIM GATE — ${narratorLog[0].split("—").slice(1).join("—").trim()}`
      : facts.remarks
        ? "filled below — one Sonnet call on the agent's own description"
        : "no description held → OPEN SLOT by design, not a failure",
  ],
  ["CHART", undefined, "POLICY 'none' — the slot is DROPPED, never an empty box"],
];

// Walk EVERY string in the built blocks rather than guessing a prop name — the §2.2.4
// lesson: a provenance table that under-reports is worse than none. The first two versions
// of Coming Soon's equivalent line reported an open slot while the paragraph was on screen.
//
// AND IT MUST EXCLUDE THE CHROME'S OWN PROSE. Caught by rendering, 08/06/2026: the first
// version of this line reported "Authored paragraph — 574 chars" on a run where the
// narrator had CORRECTLY not fired (the subject holds no remarks). The 574 characters were
// **the agent's bio** off the agent card. A length heuristic over every string in the doc
// cannot tell an authored paragraph from any other long sentence the brand supplies — so it
// manufactured a green cell for a lane that never ran, which is the §2.2.4 sixth defect
// pointing the other way: an OVER-reporting provenance table hides a missing paragraph
// instead of a present one. Both are the same sin. Exclude the blocks the recipe does not
// author, then look.
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
const remarks = (facts.remarks ?? "").trim();
const authored = strings.find(
  (s) =>
    s.length > 120 && !chrome.has(s.trim()) && s.trim() !== remarks && !remarks.includes(s.trim()),
);
const authoredRow = rows.findIndex(([c]) => c === "Authored paragraph");
rows[authoredRow][1] = authored ? `${authored.length} chars` : undefined;

printProvenance(rows);

printBottom(doc);

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(`  Button:       "${UNDER_CONTRACT_FIELDS.ctaLabel}"`);

const { html } = await renderAndSave(doc, "under-contract-email.html");

// ── THE PENDING CONTRACT — asserted against the RENDERED BYTES ───────────────
const lower = html.toLowerCase();
const street =
  String(facts.address ?? "")
    .split(",")[0]
    ?.trim() ?? "";
const zip = String(facts.zip ?? "").match(/\d{5}/)?.[0] ?? "";
const imageBlocks = doc.blocks.filter((b) => b.type === "image").length;

const checks: Assertion[] = [
  {
    name: "1 · street line PRESENT",
    pass: Boolean(street) && lower.includes(street.toLowerCase()),
    detail: street ? `"${street}"` : "no street on the resolved subject",
  },
  {
    name: "2 · ZIP PRESENT",
    pass: Boolean(zip) && html.includes(zip),
    detail: zip ? `"${zip}"` : "no ZIP on the resolved subject",
  },
  {
    name: "3 · NO sold language",
    pass: !SOLD_LANGUAGE.some((phrase) => lower.includes(phrase)),
    detail: SOLD_LANGUAGE.filter((phrase) => lower.includes(phrase)).join(", ") || "none of 5",
  },
  {
    name: "4 · price IS the list price",
    // The hero must carry `facts.price` verbatim. If we hold no price the cell is an open
    // slot, which is a legitimate state — but a price on the page that is NOT the list
    // price is the failure this assertion exists for.
    pass: !facts.price || html.includes(facts.price),
    detail: facts.price ? `"${facts.price}" verbatim` : "no price held — open slot (legal)",
  },
  {
    name: "5 · NO days-on-market phrasing",
    // TRAP 1. `days_in_state` is days-in-ACTIVE, not time under contract. The MLS clock
    // stopped; the only interval that may ship is the CLOSED one, labelled "Days to
    // contract". `listing-flyer.ts` forbids the DOM cell on this email in as many words.
    //
    // THE SECOND CLAUSE WAS `!lower.includes("dom")` AND IT WAS A LATENT FALSE ALARM.
    // Caught in review before it ever fired: `lower` is the whole lowercased HTML, and
    // **"condominium" contains "dom"** — as do "freedom" and "kingdom", both of which name
    // real SWFL streets and communities. The lake holds **6,489 condos**, so the first run
    // against a condo whose description says "condominium" would have exited 1 on a
    // phantom defect. That is exactly the stale-alarm class §2.4 warns about, shipped
    // inside the alarm itself. It passed on the acceptance house only because that one
    // description happens to avoid the substring.
    //
    // The DOM cell renders its label as the uppercase token `DOM`, so a case-SENSITIVE
    // word-boundary test discriminates it from any English word containing those letters.
    pass: !lower.includes("days on market") && !/\bDOM\b/.test(html),
    detail: lower.includes("days on market")
      ? '"days on market" present'
      : /\bDOM\b/.test(html)
        ? "a DOM cell reached the render"
        : "absent",
  },
  {
    name: "6 · NO chart (policy none)",
    pass: imageBlocks === (facts.photos[0] ? 1 : 0),
    detail: `${imageBlocks} image block(s); subject photo ${facts.photos[0] ? "held" : "absent"}`,
  },
];

printBrandCarry(p);

reportAssertions("THE PENDING CONTRACT — read off the rendered HTML, not off the source", checks);
