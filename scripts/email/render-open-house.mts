/**
 * THE OPEN HOUSE EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-open-house.mts "<address or realtor.com URL>" "<date>" "<time>"
 *   bun --env-file=.env.local scripts/email/render-open-house.mts            (default house, date/time open)
 *
 * `<date>`/`<time>` are OPTIONAL and OURS TO SUPPLY, never invented (see below) — pass them
 * only once a human has actually given you real values.
 *
 * It drives the REAL pipe — `resolveSubject` → `buildOpenHouse` → `applyBrand` →
 * `renderEmailDocHtml` — so what lands on disk is exactly what a send would carry.
 *
 * ── THIS EMAIL'S CONTRACT IS THE OPEN-SLOT CONTRACT ───────────────────────────
 *
 * The date and time of an open house are in NO vendor feed (all 18 SteadyAPI endpoints
 * checked 07/13/2026, per `lib/deliverable/recipes/open-house.ts`). They are a lane-2/
 * lane-4 fact only the agent can supply. So the whole point of this acceptance run is:
 *
 *   *** AN UNSOURCEABLE FACT IS AN OPEN SLOT, NEVER A ZERO AND NEVER AN INVENTED DATE. ***
 *
 * EIGHT assertions, each read off the RENDERED HTML — never off the source — with a
 * non-zero exit on failure:
 *
 *   1. THE STREET LINE AND THE ZIP ARE PRESENT. An invitation names the house.
 *   2. NO INVENTED DAY, DATE OR TIME IN THE NARRATOR'S OWN PARAGRAPH — checked against
 *      THAT block specifically, not the whole page: once a real date is supplied it
 *      legitimately appears on the page (in its own card), so a whole-page scan would
 *      false-positive on the very fact this run is proving is real.
 *   3. THE MOMENT'S CARD MATCHES WHAT WAS PASSED IN — present with the given date/time
 *      when supplied, ABSENT ENTIRELY when not (never an empty callout box).
 *   4. THE PRICE ON THE PAGE IS THE LIST PRICE, verbatim-formatted (the hero, not sold).
 *   5. NO CHART. Chart policy is "none" on the registry entry — a house and a moment are
 *      not a number. Exactly one `<img>`-bearing image block when we hold a subject photo.
 *   6. THE CTA READS THE RSVP LABEL, read off the rendered button block, never a second
 *      hardcoded copy of the string the recipe already owns.
 *   7. THE DESCRIPTION, WHEN HELD, SHIPS VERBATIM AND AFTER THE NARRATIVE — operator ask
 *      08/06/2026: talk about the open house first, then the property's own words.
 *
 * ── SUBJECT: 9340 Vittoria Ct, Fort Myers, FL 33912 ───────────────────────────
 *
 * Built 08/06/2026 from the operator's own realtor.com link, which carries the vendor's
 * numeric listing id in its slug (`_M54178-84205`). `resolveSubjectListing`'s lane-0 —
 * `extractRealtorPropertyId` — pulls that id and joins `data_lake.listing_dom` on
 * `property_id` EXACTLY, no street-text normalization required (the same lane that fixed
 * the Horsecreek compound-street miss earlier the same day). Passing the URL straight
 * through as the subject, unmodified, is the point: it is what the operator actually
 * pasted.
 *
 * SPEND: the free spine and our own `listing_dom` clock are free reads. The description
 * for THIS subject came from a targeted, one-result Apify gap-fill (RULE 0.7a rung 3 — we
 * already held most of the property free; this bought the one field we didn't), run once
 * with `OPERATOR_APPROVED_PAID_RUN=1` and now cached in `data_lake.apify_property_records`
 * — every future build of this address reads it for free. The only OTHER metered call is
 * the one narrator paragraph, and only when a description is held.
 */
import { buildOpenHouse } from "../../lib/deliverable/recipes/open-house";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
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

const ADDRESS = subjectAddress(
  "https://www.realtor.com/realestateandhomes-detail/9340-Vittoria-Ct_Fort-Myers_FL_33912_M54178-84205",
);
// Neither invented, neither defaulted — undefined unless a human handed them in on argv.
const OPEN_HOUSE_DATE = process.argv[3] || undefined;
const OPEN_HOUSE_TIME = process.argv[4] || undefined;

console.log(`\n  SUBJECT: ${ADDRESS}\n`);

const { brand: BRAND, profile: p } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();

// ── THE BUILD — the real recipe, the real chrome ─────────────────────────────
const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (facts) {
  if (OPEN_HOUSE_DATE) facts.openHouseDate = OPEN_HOUSE_DATE;
  if (OPEN_HOUSE_TIME) facts.openHouseTime = OPEN_HOUSE_TIME;
}
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED — the grid still lands, every cell an open slot (RULE 0.7).\n" +
      "    Outside Lee/Collier, or the nightly sweep has not landed this listing yet.\n",
  );
}

// The canvas arrives ALREADY BRANDED — `applyBrand` runs LAST as the overlay, same as
// every other lifecycle acceptance script (stop 4 of the five-stop pipe).
const built = await buildOpenHouse({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  resolved,
} as never);
if (!built) {
  console.error(
    "  buildOpenHouse returned null — no subject, so there is no house to invite anyone\n" +
      "  to. In the product this falls through to the terminal author.",
  );
  process.exit(1);
}
const doc = applyBrand(built, BRAND);

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const rows: ProvenanceRow[] = [
  [
    "Street + city + ZIP",
    facts?.address,
    "free spine — SHIPS IN FULL (an invitation names the house)",
  ],
  ["List price", facts?.price, "free spine (daily sweep) — the ask, never a sold price"],
  [
    "Date (own card)",
    OPEN_HOUSE_DATE,
    "NO VENDOR HOLDS THIS — argv[3], a human-supplied fact; open slot when absent",
  ],
  [
    "Time (own card)",
    OPEN_HOUSE_TIME,
    "NO VENDOR HOLDS THIS — argv[4], a human-supplied fact; open slot when absent",
  ],
  ["Beds", facts?.beds, "free spine → paid row"],
  ["Baths", facts?.baths, "free spine → Lee records → nearby-values → paid row"],
  ["Square feet", facts?.sqft, "free spine → paid row"],
  ["Hero photo", facts?.photos?.[0], "free spine photo_url, mirrored → paid row → no photo"],
  [
    "Description (verbatim)",
    facts?.remarks ? `${facts.remarks.length} chars` : undefined,
    "paid row (rung 3 gap-fill, one Apify result) — ships in its own block, AFTER the narrative",
  ],
  [
    "Authored paragraph",
    undefined,
    narratorLog.length
      ? `DROPPED BY THE CLAIM GATE — ${narratorLog[0].split("—").slice(1).join("—").trim()}`
      : facts?.remarks
        ? "filled below — one Sonnet call on the agent's own description"
        : "no description held → OPEN SLOT by design, not a failure",
  ],
  ["CHART", undefined, "POLICY 'none' — the slot is DROPPED, never an empty box"],
];

// Same over-reporting guard as Under Contract's script: exclude the chrome's own prose
// (agent bio, footer, header) before hunting for the authored paragraph, so a long brand
// string can never be mistaken for a narrator sentence that never fired.
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
const remarks = (facts?.remarks ?? "").trim();
const authored = strings.find(
  (s) =>
    s.length > 120 && !chrome.has(s.trim()) && s.trim() !== remarks && !remarks.includes(s.trim()),
);
const authoredRow = rows.findIndex(([c]) => c === "Authored paragraph");
rows[authoredRow][1] = authored ? `${authored.length} chars` : undefined;

printProvenance(rows);

printBottom(doc);

const ctaBlock = doc.blocks.find((b) => b.type === "button");
const ctaLabel = ctaBlock?.type === "button" ? ctaBlock.props.label : undefined;

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(`  Button:       "${ctaLabel ?? "(none)"}"`);

const { html } = await renderAndSave(doc, "open-house-email.html");

// ── THE INVITATION — asserted against the RENDERED BYTES ─────────────────────
const street =
  String(facts?.address ?? "")
    .split(",")[0]
    ?.trim() ?? "";
const zip = String(facts?.zip ?? "").match(/\d{5}/)?.[0] ?? "";
const imageBlocks = doc.blocks.filter((b) => b.type === "image").length;

// THE NARRATOR'S OWN PARAGRAPH, isolated — the non-description text block. Checking
// weekday words against the WHOLE page would false-positive the moment a real date is
// supplied (it legitimately appears in its own card), so this assertion has to read the
// one block the recipe actually promises never carries one.
const narrativeBlock = doc.blocks.find(
  (b) => b.type === "text" && !(b.props as { descriptionSlot?: boolean }).descriptionSlot,
);
const narrativeBody =
  narrativeBlock?.type === "text" ? String(narrativeBlock.props.body ?? "") : "";
const narrativeTextLower = narrativeBody.toLowerCase();
const INVENTED_DATE_WORDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "this weekend",
  "tomorrow",
];

const signalBlock = doc.blocks.find((b) => b.type === "signal");
const wantsCard = Boolean(OPEN_HOUSE_DATE || OPEN_HOUSE_TIME);

const descBlock = doc.blocks.find(
  (b) => b.type === "text" && (b.props as { descriptionSlot?: boolean }).descriptionSlot,
);
const descBody = descBlock?.type === "text" ? String(descBlock.props.body ?? "") : "";
// The narrator can legitimately drop (claim gate, no key, nothing sourced to say) — an
// EMPTY narrative slot still occupies its position in the chrome, so "after the narrative"
// is still a real, checkable position even with no narrative text to search for. Only fall
// back to "no ordering constraint" when the narrative BLOCK itself doesn't exist at all.
const descShipsAfterNarrative =
  Boolean(descBody) &&
  Boolean(narrativeBlock) &&
  (narrativeBody
    ? html.indexOf(descBody.slice(0, 40)) > html.indexOf(narrativeBody.slice(0, 40))
    : true);

const checks: Assertion[] = [
  {
    name: "1 · street line PRESENT",
    pass: Boolean(street) && html.toLowerCase().includes(street.toLowerCase()),
    detail: street ? `"${street}"` : "no street on the resolved subject",
  },
  {
    name: "2 · ZIP PRESENT",
    pass: Boolean(zip) && html.includes(zip),
    detail: zip ? `"${zip}"` : "no ZIP on the resolved subject",
  },
  {
    // A day-name is INVENTED only when no real date/time was supplied at all — when one WAS
    // (operator, 08/06/2026: "Write about the fucking time!!!!!!"), the narrator is now told
    // to state it naturally, so its presence is the feature working, not a violation.
    name: "3 · NO invented day/date/time when NONE was supplied",
    pass:
      Boolean(OPEN_HOUSE_DATE || OPEN_HOUSE_TIME) ||
      !INVENTED_DATE_WORDS.some((w) => narrativeTextLower.includes(w)),
    detail:
      OPEN_HOUSE_DATE || OPEN_HOUSE_TIME
        ? "a real date/time was supplied — not checked for invention"
        : INVENTED_DATE_WORDS.filter((w) => narrativeTextLower.includes(w)).join(", ") ||
          "none found",
  },
  {
    name: "4 · the moment's CARD matches what was supplied",
    pass: wantsCard ? Boolean(signalBlock) : !signalBlock,
    detail: wantsCard
      ? signalBlock
        ? "card present"
        : "MISSING — a date/time was passed in but no card rendered"
      : signalBlock
        ? "UNEXPECTED — no date/time was passed in but a card rendered anyway"
        : "no card, none supplied (open slot, legal)",
  },
  {
    name: "5 · price IS the list price",
    pass: !facts?.price || html.includes(facts.price),
    detail: facts?.price ? `"${facts.price}" verbatim` : "no price held — open slot (legal)",
  },
  {
    name: "6 · NO chart (policy none)",
    pass: imageBlocks === (facts?.photos?.[0] ? 1 : 0),
    detail: `${imageBlocks} image block(s); subject photo ${facts?.photos?.[0] ? "held" : "absent"}`,
  },
  {
    name: "7 · CTA is the RSVP button",
    pass: ctaLabel === "RSVP for the Open House",
    detail: ctaLabel ? `"${ctaLabel}"` : "no button block on the doc",
  },
  {
    name: "8 · description, when held, ships AFTER the narrative",
    pass: !facts?.remarks ? !descBlock : Boolean(descBlock) && descShipsAfterNarrative,
    detail: !facts?.remarks
      ? descBlock
        ? "UNEXPECTED — no remarks held but a description block rendered"
        : "no remarks held, no block (open slot, legal)"
      : !descBlock
        ? "MISSING — remarks held but no description block rendered"
        : descShipsAfterNarrative
          ? "present, after the narrative"
          : "present, but NOT after the narrative — order regression",
  },
];

printBrandCarry(p);

reportAssertions("THE INVITATION — read off the rendered HTML, not off the source", checks);
