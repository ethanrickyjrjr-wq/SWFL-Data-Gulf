/**
 * THE NEW LISTING EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-new-listing.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-new-listing.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildNewListing` → `renderEmailDocHtml` —
 * so what lands on disk is exactly what a send would carry. Nothing is hand-written.
 *
 * DEFAULT HOUSE: 12281 McGregor Palms Dr, Fort Myers 33908 (operator-designated 08/06/2026 —
 * the real subject for the New Listing email, off the realtor.com listing
 * realtor.com/realestateandhomes-detail/12281-McGregor-Palms-Dr_Fort-Myers_FL_33908_M64209-95517).
 * The free spine resolves price/beds/baths/sqft/lot/type/photo with ZERO spend. The paid Apify
 * row for this address WAS BOUGHT 08/09/2026 (operator decree — the leaked "DESCRIPTION IS
 * ABSENT" showcase bake) and now fills year built (2003), HOA ($225), the 1,064-char MLS
 * description, the 43-photo gallery, and the listing button link as a free READ on every build.
 * (`lib/listings/apify-comps.ts` stays the ONE vendor call root; never fetch realtor.com
 * directly.)
 *
 * SPEND: the free-spine render above costs nothing. The paid row, if bought, is a one-time few-cent
 * subject-record pull, gated by `lib/listings/apify-spend-guard.ts`. The ONLY OTHER metered call is
 * the narrator paragraph. Run without ANTHROPIC_API_KEY to skip even that.
 *
 * It also prints a PER-CELL PROVENANCE TABLE, because "where did this number come from" is
 * the question this whole email exists to answer.
 */
import { buildNewListing } from "../../lib/deliverable/recipes/new-listing";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { listingButtonUrl } from "../../lib/listings/listing-url";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
// THE ONE ACCEPTANCE HARNESS — see `_harness.mts`.
import {
  captureNarratorDrops,
  loadAccountBrand,
  printBottom,
  printBrandCarry,
  printProvenance,
  renderAndSave,
  subjectAddress,
  type ProvenanceRow,
} from "./_harness.mts";

const DEFAULT_HOUSE = "12281 McGregor Palms Dr, Fort Myers, FL 33908";
// The operator's own realtor.com link for the default house (RULE 0.7 lane 4 — a value
// handed to us directly, never fetched/scraped — see `feedback_never-fetch-listing-portals`).
// `apify-comps.ts`'s vendor actor cannot do an exact-address lookup (it treats `location` as
// a search-area centre, not a listing lookup — documented 08/04/2026 in the market-comps
// photo/CTA defect), so this is the ONLY correct source for this cell until that changes.
const DEFAULT_LISTING_URL =
  "https://www.realtor.com/realestateandhomes-detail/12281-McGregor-Palms-Dr_Fort-Myers_FL_33908_M64209-95517";
const ADDRESS = subjectAddress(DEFAULT_HOUSE);

console.log(`\n  SUBJECT: ${ADDRESS}\n`);

const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED — the grid still lands, every cell an open slot (RULE 0.7).\n" +
      "    Outside Lee/Collier, or the nightly sweep has not landed this listing yet.\n",
  );
}
if (ADDRESS === DEFAULT_HOUSE && !facts.listingUrl) {
  facts.listingUrl = DEFAULT_LISTING_URL;
}

// THE BRAND, OFF THE REAL ACCOUNT ROW — never a hardcoded literal.
//
// THIS SCRIPT USED TO HAND-WRITE A `DEMO_BRAND` FIXTURE and it was the only one of the four
// that did. A fixture proves the RENDERER and proves nothing about whether an agent who fills
// in their brand actually gets it — hardcoding one is what hid the 17-field account->project
// drop for a whole session (playbook 2.2.4 defect 1). The other three scripts already read the
// account row; this one now does too, so all four measure the same real thing.
const { brand: DEMO_BRAND, profile: p } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();

// BRAND RUNS **LAST**, as an overlay — stop 4 of the five-stop pipe, after the recipe and the
// layout seam, never before them. The first cut here branded the canvas and THEN built, which
// is the exact ordering the playbook's PART 0 calls out as wrong ("It put branding FIRST...
// building it first re-creates the 07/19/2026 clobber"). It also silently did nothing to the
// agent card: `defaultDoc()` carries no agent-card block, so there was nothing to brand, and
// the chrome then minted a fresh unbranded one — which is why the bottom kept reading
// "SWFL Data Gulf / Market Intelligence" no matter what brand was passed in.
const built = await buildNewListing({
  facts,
  currentDoc: defaultDoc(),
  prompt: "",
  scope: {},
} as never);

if (!built) {
  console.error("  buildNewListing returned null — no subject to announce.");
  process.exit(1);
}
const doc = applyBrand(built, DEMO_BRAND);

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const url = listingButtonUrl(facts);
const rows: ProvenanceRow[] = [
  ["Asking price", facts.price, "free spine (daily sweep)"],
  ["Address", facts.address, "free spine"],
  ["Beds", facts.beds, "free spine → paid row"],
  ["Baths", facts.baths, "free spine → Lee records → nearby-values → paid row"],
  ["Square feet", facts.sqft, "free spine → paid row"],
  ["Lot", facts.lotSize, "free spine (acres) → paid row (sq ft ÷ 43,560)"],
  ["Property type", facts.propertyType, "free spine"],
  ["Days on market", facts.daysOnMarket?.toString(), "our own listing clock (real, not a floor)"],
  ["Year built", facts.yearBuilt, "paid row ONLY — the free spine has no such column"],
  ["HOA / month", facts.hoaFee ? `$${facts.hoaFee}` : undefined, "paid row, > 0 only"],
  ["Hero photo", facts.photos[0] ? "yes" : undefined, "free spine, mirrored into our storage"],
  ["Gallery", facts.photos.length > 1 ? `${facts.photos.length - 1} more` : undefined, "paid row"],
  [
    "Description",
    facts.remarks ? `${facts.remarks.length} chars` : undefined,
    "agent's paste → paid row",
  ],
  ["Subdivision", facts.communityStats?.subdivisionName, "our own tax roll (universal)"],
  ["Inside the gate", facts.insideTheGate?.label, "our own community profiles (81 rows)"],
  ["Nearby", facts.neighborhood ? "resolved" : undefined, "vendor amenity sweep (~5 miles)"],
  ["Listing link", url ?? undefined, "paid row property_url — no link means NO BUTTON"],
];

// A CLIPPED VALUE MUST LOOK CLIPPED. 08/05/2026: this table printed the agent headshot as
// `https://www.swfldatagulf.com/showcase/launch` — a page URL where an image URL belongs — and it
// was written into a handoff as a live defect. It was not. The real value is
// `…/showcase/launch-blitz/live/assets/dani-vero.jpg`, it is in the rendered bytes, and it 200s as
// image/jpeg. The column just cut it at 44 chars with no marker, and a plain prefix of a URL is
// itself a plausible URL. That is the stale-alarm class this script exists to prevent, produced BY
// this script. The ellipsis is the whole fix: it makes "there is more" unmissable.

printProvenance(rows);
printBottom(doc);

console.log(`
  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(`  Button: ${url ? `→ ${url}` : "NONE (no real link — never a homepage)"}`);

await renderAndSave(doc, "new-listing-email.html");
printBrandCarry(p);
if (narratorLog.length) console.log(`  NARRATOR: ${narratorLog.join(" | ")}`);
