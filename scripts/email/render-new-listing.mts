/**
 * THE NEW LISTING EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-new-listing.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-new-listing.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildNewListing` → `renderEmailDocHtml` —
 * so what lands on disk is exactly what a send would carry. Nothing is hand-written.
 *
 * DEFAULT HOUSE: 12554 Kellysands Way, Fort Myers 33908. Chosen off a live join
 * 08/05/2026 because it is the one address that exercises EVERY lane with ZERO new spend:
 * the free spine holds its price/beds/baths/sqft/lot/type/photo, our own listing clock holds
 * a REAL (non-floored) day count, and the paid row already on disk holds its year built,
 * HOA, description, 43-photo gallery and the realtor.com link.
 *
 * SPEND: reading the paid row costs nothing (it is on disk). The ONLY metered call is the
 * one narrator paragraph. Run without ANTHROPIC_API_KEY to skip even that — the paragraph
 * then stays an open slot, which is the designed state, and everything else renders.
 *
 * It also prints a PER-CELL PROVENANCE TABLE, because "where did this number come from" is
 * the question this whole email exists to answer.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildNewListing } from "../../lib/deliverable/recipes/new-listing";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { listingButtonUrl } from "../../lib/listings/listing-url";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import { brandingToTokens } from "../../lib/email/brand/branding-to-tokens";

import { renderEmailDocHtml } from "../../lib/email/render-email-doc";

const ADDRESS = process.argv[2] ?? "12554 Kellysands Way, Fort Myers, FL 33908";

console.log(`\n  SUBJECT: ${ADDRESS}\n`);

const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED — the grid still lands, every cell an open slot (RULE 0.7).\n" +
      "    Outside Lee/Collier, or the nightly sweep has not landed this listing yet.\n",
  );
}

// THE BOTTOM OF THE EMAIL — agent identity, contact, social links, and the brand.
//
// THE DEMO AGENT IS **DANI VERO / CAST & COAST REALTY**, and she is not invented here: she is
// the fictional Cape Coral agent this repo already uses for every showcase email, defined in
// `scripts/email/build-showcase-lifecycle-extras.mts` with a committed logo and an
// AI-generated portrait, both disclosed as fictional in `lib/showcase/registry.ts`. Reusing
// her is the point — a second made-up agent would be a second root for one concept.
//
// Two corrections this encodes, both from 08/05/2026:
//   1. The first preview rendered on a BLANK canvas and the bottom came out bare. Nothing was
//      missing from the email; I simply never gave it a brand.
//   2. Fonts: MONTSERRAT_SANS + LATO_SANS, not the geometric/modern pair. Those two carry no
//      webfont URL (`lib/brand/fonts.ts`), so every render silently fell back to Trebuchet or
//      Arial — the 08/03 "why does the font suck" finding, already fixed for the showcase and
//      worth inheriting rather than rediscovering.
//
// The brand travels the SAME path a real send uses — `brandingToTokens` → `applyBrand` — so
// this preview is not a preview-only approximation. Anything the profile does not carry (a
// phone, social handles) stays an honest open slot rather than being invented.
const DEMO_BRAND = brandingToTokens({
  agent_name: "Dani Vero",
  agent_title: "Cast & Coast Realty · Cape Coral",
  brokerage: "Cast & Coast Realty",
  business_address: "1520 SE 46th St, Cape Coral, FL 33904",
  contact_email: "dani@castandcoast.example",
  contact_phone: "(239) 555-0142",
  photo_url: "https://www.swfldatagulf.com/showcase/launch-blitz/live/assets/dani-vero.jpg",
  // NO logo_url. `public/showcase/launch-blitz/live/assets/` holds ONLY `dani-vero.jpg` — no
  // logo file was ever added there. The old value here (`castcoast-logo.png`) 404s, which
  // rendered as a broken-image icon captioned "Dani Vero" (companyName is the alt text) sitting
  // directly above the real "Dani Vero" name line — the doubled-name screenshot, 08/05/2026.
  // The header already degrades to a text-only masthead when `logoUrl` is absent — that is the
  // real fix, not a guessed-at filename that might also 404.
  instagram_url: "https://instagram.com/castandcoast",
  facebook_url: "https://facebook.com/castandcoast",
  linkedin_url: "https://linkedin.com/company/castandcoast",
  unsubscribe_url: "https://www.swfldatagulf.com/unsubscribe",
  primary_color: "#12343B",
  accent_color: "#0E7C86",
  text_color: "#2E4A50",
  backdrop_color: "#F2FAFB",
  font_display: "MONTSERRAT_SANS",
  font_body: "LATO_SANS",
});

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
const rows: [string, string | undefined, string][] = [
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

console.log("  CELL                 VALUE                                     SOURCE");
console.log("  " + "─".repeat(100));
for (const [cell, value, source] of rows) {
  const v = value ? String(value).slice(0, 40) : "— OPEN SLOT";
  console.log(`  ${cell.padEnd(20)} ${v.padEnd(41)} ${source}`);
}

const openSlots = rows.filter(([, v]) => !v).length;
console.log(
  `\n  ${rows.length - openSlots} of ${rows.length} cells sourced · ${openSlots} open slot(s)`,
);
// What the BOTTOM of the email is carrying — the operator's "whole look".
const agent = doc.blocks.find((b) => b.type === "agent-card");
const footer = doc.blocks.find((b) => b.type === "footer");
const ap = (agent?.props ?? {}) as Record<string, unknown>;
const fp = (footer?.props ?? {}) as Record<string, unknown>;
console.log(
  "\n  THE BOTTOM — identity, contact, links (all from the BRAND PROFILE, not the listing)",
);
for (const [label, v] of [
  ["Agent name", ap.name],
  ["Agent title", ap.title],
  ["Agent headshot", ap.photoUrl],
  ["Agent phone", ap.phone],
  ["Business address (CAN-SPAM)", fp.address],
  ["Email", fp.email],
  ["Website", fp.websiteUrl],
  ["Instagram", fp.instagramUrl],
  ["Facebook", fp.facebookUrl],
  ["LinkedIn", fp.linkedinUrl],
] as [string, unknown][]) {
  console.log(
    `  ${label.padEnd(30)} ${v ? String(v).slice(0, 44) : "— OPEN SLOT (fill in Branding)"}`,
  );
}

console.log(`
  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);
console.log(`  Button: ${url ? `→ ${url}` : "NONE (no real link — never a homepage)"}`);

// ── RENDER THROUGH THE ONE DOOR ──────────────────────────────────────────────
const html = await renderEmailDocHtml(doc);
const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
console.log(
  `  HTML: ${kb}KB ${kb > 102 ? "⚠ OVER Gmail's ~102KB clip point" : "(inside Gmail's ~102KB clip)"}`,
);

const outDir = join(homedir(), "Downloads");
try {
  mkdirSync(outDir, { recursive: true });
} catch {
  /* already there — Windows still throws EEXIST on a recursive mkdir of an existing dir */
}
const file = join(outDir, "new-listing-email.html");
writeFileSync(file, html, "utf8");
console.log(`\n  SAVED → ${file}\n`);
