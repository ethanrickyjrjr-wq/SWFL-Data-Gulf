/**
 * THE COMING SOON EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-coming-soon.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-coming-soon.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildComingSoon` → `applyBrand` →
 * `renderEmailDocHtml` — so what lands on disk is exactly what a send would carry.
 *
 * ── THREE THINGS THIS SCRIPT DOES THAT `render-new-listing.mts` DOES NOT ─────
 *
 * 1. **THE BRAND IS READ OFF A REAL ACCOUNT, NOT HARDCODED.** New Listing's script
 *    hand-writes a `DEMO_BRAND` literal, which proves the RENDERER and proves nothing
 *    about whether an agent who fills in their brand actually gets it. This one loads
 *    `user_brand_profiles` for a real user id and maps it the way the app does — so a
 *    field that does not travel shows up here as an open slot instead of hiding behind
 *    a literal. Operator, 08/05/2026: "USE THE ethanrickyjrjr@gmail.com account."
 *
 * 2. **IT ASSERTS THE SUPPRESSION CONTRACT AGAINST THE RENDERED BYTES.** Coming Soon's
 *    whole reason to exist is that the street address does not ship. The handoff was
 *    explicit that reading the code and trusting its comments is not verification, so
 *    this greps the final HTML for the house number, the street core, the full street
 *    line and the ZIP. **Any hit fails the run with a non-zero exit.**
 *
 * 3. **IT PRINTS WHAT THE PROJECT PATH WOULD HAVE DROPPED.** `applyUserBrandToProject`
 *    (lib/project/apply-brand.ts) copies only 14 of the account's brand columns onto a
 *    new project. The rest — the fonts, most of the palette, all nine socials, the
 *    CAN-SPAM unsubscribe URL — never travel. That is the actual root of the 08/05
 *    "the bottom was bare" defect, and it is invisible unless something counts it.
 *
 * DEFAULT HOUSE: 2287 Somerset Pl, Naples 34120 — AND THE DEFAULT IS THE SHOWCASE
 * SUBJECT, which is the load-bearing fact. A bare run of this script is what
 * regenerates `public/new-emails/coming-soon-email.html`, so whatever address sits
 * here is what /showcase ships to prospects.
 *
 * POSTMORTEM (08/09/2026): the default used to be 16209 Asheboro Ct, Fort Myers —
 * a manufactured home picked 08/05 as a throwaway ACCEPTANCE subject (it beat the
 * stronger-funnel Lee candidates only because their primary photos were drone shots,
 * which the locked no-aerial rule forbids). The showcase capture was then built
 * separately from THIS Naples address — but when the backlit-chart session re-ran the
 * script bare to refresh the chart, the acceptance default silently swapped the demo
 * back to the trailer. Operator: "HOW IS THE COMING SOON EMAIL BACK TO THE TRAILER?"
 * The fix is structural: the default IS the demo house. Never point it at a subject
 * you would not put in front of a prospect; pass a throwaway address as argv[2] when
 * you need one.
 *
 * Why this house: real front-elevation photo (no aerial), and an honest funnel that
 * actually moves — 6,105 Collier active → 280 in the ±10% band → 84 matching beds+size
 * (probed live 08/09/2026).
 *
 * SPEND: zero new vendor spend. The free spine and the already-bought paid row cover it.
 * The ONLY metered call is the one narrator paragraph, and Coming Soon's narrator runs
 * ONLY when a description exists — run without ANTHROPIC_API_KEY and it becomes an open
 * slot, which is the designed state.
 */
import { countyForZip, loadScarcity } from "../../lib/deliverable/recipes/coming-soon";
// MIGRATED (recipes-as-config): the build flows through the registry dispatch —
// config present → the ONE config builder + the teaser-narrator finisher. This
// script now drives the exact seam every production caller uses.
import { builderFor } from "../../lib/deliverable/recipes/index";
const buildComingSoon = builderFor("coming-soon")!;
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
// THE ONE ACCEPTANCE HARNESS — see `_harness.mts`. Everything below that is not this email's
// own provenance rows or its own assertions comes from there.
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

const ADDRESS = subjectAddress("2287 Somerset Pl, Naples, FL 34120");

console.log(`\n  SUBJECT (never printed in the email): ${ADDRESS}\n`);

// ── THE BRAND, OFF THE REAL ACCOUNT ──────────────────────────────────────────
// The account table spells the page background `background_color`; the email token
// bridge reads `backdrop_color`. That rename is a real seam, not a typo here — see the
// LOST-FIELD report at the bottom of this run.
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

// THE CANVAS ARRIVES ALREADY BRANDED — and that is not the "branding first" mistake §2.1
// warns about, it is the opposite. `buildComingSoon` tints its funnel PNG with
// `buildLifecycleEmail(currentDoc, chrome).globalStyle.accentColor`, i.e. with whatever
// accent THE CANVAS IT WAS HANDED already carries. Hand it `defaultDoc()` and the chart is
// tinted with the campaign default while the email around it wears the agent's brand — the
// first render of this email, 08/05/2026, put TEAL bars inside a TERRACOTTA email, which is
// precisely the drift the recipe's own comment says it is asking the chrome in order to
// avoid ("the picture is a different brand from the email around it"). In the product the
// canvas is a live, already-branded doc, so seeding it here is what makes this run FAITHFUL,
// not what makes it a shortcut. `applyBrand` still runs LAST as the overlay.
const built = await buildComingSoon({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  scope: {},
} as never);
if (!built) {
  console.error("  buildComingSoon returned null — no subject to tease.");
  process.exit(1);
}
// BRAND RUNS LAST, as an overlay — stop 4 of the five-stop pipe, never before the build.
const doc = applyBrand(built, BRAND);

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const county = countyForZip(facts.zip);
const n = (s?: string) => Number(String(s ?? "").replace(/[^\d.]/g, "")) || 0;
const scarcity = await loadScarcity({
  zip: facts.zip,
  county,
  price: n(facts.price),
  beds: n(facts.beds),
  sqft: n(facts.sqft),
});

const rows: ProvenanceRow[] = [
  ["Asking price", facts.price, "free spine (daily sweep)"],
  ["City (hero label)", facts.city, "free spine — the ONLY geography in the hero"],
  ["Beds", facts.beds, "free spine → paid row"],
  ["Baths", facts.baths, "free spine → Lee records → nearby-values → paid row"],
  ["Square feet", facts.sqft, "free spine → paid row"],
  ["$/sq ft", facts.price && facts.sqft ? "computed" : undefined, "computed, price ÷ sq ft"],
  ["Property type", facts.propertyType, "free spine"],
  ["County", county ?? undefined, "committed Census ZIP↔county crosswalk"],
  [
    "Scarcity scope",
    scarcity?.scopeLabel,
    scarcity ? `ladder rung ${scarcity.rung} (${scarcity.grain} grain)` : "all rungs missed",
  ],
  [
    "Active homes in scope",
    scarcity ? scarcity.activeHomes.toLocaleString() : undefined,
    "live listing_state count, land excluded",
  ],
  [
    "…in this price band",
    scarcity ? scarcity.inBand.toLocaleString() : undefined,
    "same query, ±10% band",
  ],
  [
    "…beds + size match too",
    scarcity ? scarcity.comparable.toLocaleString() : undefined,
    "same query, beds + 80% sqft floor",
  ],
  ["Funnel chart", scarcity ? "rendered" : undefined, "built ONLY from the three real counts"],
  ["Community (may ship)", facts.community, "our own tax roll / community profiles"],
  [
    "Description (narrator fuel)",
    facts.remarks ? `${facts.remarks.length} chars` : undefined,
    "agent's paste → paid row",
  ],
  ["Authored paragraph", undefined, "filled below — de-identified fact sheet only"],
  ["LOT SIZE", undefined, "DELIBERATELY OMITTED — lot + city narrows a parcel search"],
  ["STREET ADDRESS", undefined, "DELIBERATELY SUPPRESSED — the point of this email"],
];
// THE ACCEPTANCE TABLE ITSELF HAS LIED IN BOTH DIRECTIONS — this detector's history is
// two opposite failures, so read both before "improving" it again.
// UNDER-REPORT (07/xx): an early version read `props.text` of text blocks — the wrong
// prop name — and printed "OPEN SLOT" while the paragraph was visibly on screen.
// OVER-REPORT (08/09/2026): the walk-every-string rewrite matched the ~155-char AGENT
// BIO (which lives in the agent card, so no brand-derived exclusion list can ever be
// complete) and patched its length into `rows[14]` — the DESCRIPTION row, off by one.
// The table printed "Description (narrator fuel) 155 chars" for a night while the real
// description sat at 2,263 chars: both columns wrong at once, and three layers got
// hunted for a narrator bug that did not exist.
// THE RULE: read exactly the slot `fillNarrative` writes — `props.body` of a text
// block that is not the description slot — and address the row BY LABEL so an
// inserted row can never shift the patch onto a neighbor.
const remarks = (facts.remarks ?? "").trim();
const authored = doc.blocks
  .filter((b) => b.type === "text")
  .map((b) => (b.props as { body?: string; descriptionSlot?: boolean }) ?? {})
  .filter((p) => p.descriptionSlot !== true)
  .map((p) => (p.body ?? "").trim())
  .find((body) => body.length > 120 && body !== remarks && !remarks.includes(body));
const authoredRow = rows.find(([label]) => label === "Authored paragraph");
if (authoredRow) authoredRow[1] = authored ? `${authored.length} chars` : undefined;

printProvenance(rows);
if (narratorLog.length)
  console.log(`
  NARRATOR DROPPED: ${narratorLog.join(" | ")}`);

printBottom(doc);

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);

const { html } = await renderAndSave(doc, "coming-soon-email.html");

// ── THE SUPPRESSION ASSERTION — against the rendered bytes, not the source ───
// The handoff: "not by reading the code and trusting the comments — render a real house
// and grep the output HTML for the street number and ZIP. Zero tolerance."
const street =
  String(facts.address ?? "")
    .split(",")[0]
    ?.trim() ?? "";
const tokens = street.split(/\s+/).filter(Boolean);
const houseNo = /^\d+[A-Za-z]?$/.test(tokens[0] ?? "") ? tokens[0]! : "";
const core = (tokens.length > 2 ? tokens.slice(1, -1) : tokens.slice(1)).join(" ");
const probes: [string, string][] = [
  ["full street line", street],
  ["house number", houseNo],
  ["street core", core],
  ["ZIP", String(facts.zip ?? "")],
];
console.log("\n  SUPPRESSION CONTRACT — grepped against the RENDERED HTML");
let leaked = 0;
for (const [label, needle] of probes) {
  if (!needle) {
    console.log(`  ${label.padEnd(20)} (n/a)`);
    continue;
  }
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const hits = html.match(re)?.length ?? 0;
  if (hits) leaked += hits;
  console.log(
    `  ${label.padEnd(20)} "${needle}" → ${hits === 0 ? "ABSENT ✓" : `${hits} HIT(S) ✗ LEAK`}`,
  );
}

printBrandCarry(p);

if (leaked) {
  console.error(
    `  ✗ SUPPRESSION FAILED — ${leaked} address fragment(s) reached the rendered email.\n`,
  );
  process.exit(1);
}
