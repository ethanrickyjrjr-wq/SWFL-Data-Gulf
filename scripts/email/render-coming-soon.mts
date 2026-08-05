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
 * DEFAULT HOUSE: 16209 Asheboro Ct, Fort Myers 33908 — and the choice cost something,
 * which is worth stating rather than hiding. Two constraints pull against each other:
 *
 *   • THE FUNNEL wants a subject whose comparable set is genuinely small. Probed live
 *     08/05/2026 across Lee's 14,643 active homes: 5121 Muddy Ln gives 799 → 87 and
 *     13630 Brynwood Ln gives 321 → 20, both strong. New Listing's own default house
 *     (12554 Kellysands Way) gives 2,747 → 2,575 — a funnel that barely moves, which
 *     would make the scarcity claim read as filler.
 *   • THE HERO PHOTO must not be an aerial (locked operator rule: the listing's own
 *     photo or nothing, and never a drone view). **Both strong-funnel candidates have
 *     drone shots as their primary photo** — the vendor's feed is full of them.
 *
 * The photo rule is the locked one, so it wins. Asheboro Ct has a real front-elevation
 * photo and a weaker but honest funnel (834 in band → 518 matching). Nothing in the pipe
 * today can tell an aerial from an elevation; see the open check.
 *
 * SPEND: zero new vendor spend. The free spine and the already-bought paid row cover it.
 * The ONLY metered call is the one narrator paragraph, and Coming Soon's narrator runs
 * ONLY when a description exists — run without ANTHROPIC_API_KEY and it becomes an open
 * slot, which is the designed state.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildComingSoon,
  countyForZip,
  loadScarcity,
} from "../../lib/deliverable/recipes/coming-soon";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { PROJECT_CARRY_KEYS } from "../../lib/brand/profile-ledger";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import { brandingToTokens } from "../../lib/email/brand/branding-to-tokens";
import { renderEmailDocHtml } from "../../lib/email/render-email-doc";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";

const ADDRESS = process.argv[2] ?? "16209 Asheboro Ct, Fort Myers, FL 33908";
const UID = process.env.DEMO_BRAND_USER_ID ?? "37cc6c49-4759-4e07-9686-0a8dcce1f8ff";

console.log(`\n  SUBJECT (never printed in the email): ${ADDRESS}\n`);

// ── THE BRAND, OFF THE REAL ACCOUNT ──────────────────────────────────────────
// The account table spells the page background `background_color`; the email token
// bridge reads `backdrop_color`. That rename is a real seam, not a typo here — see the
// LOST-FIELD report at the bottom of this run.
const db = createServiceRoleClientUntyped();
const { data: profile, error: profileErr } = await db
  .from("user_brand_profiles")
  .select("*")
  .eq("user_id", UID)
  .maybeSingle();
if (profileErr || !profile) {
  console.error(`  no brand profile for ${UID}: ${profileErr?.message ?? "no row"}`);
  process.exit(1);
}
const p = profile as Record<string, string | null>;
const brandingBlob: Record<string, string> = {};
for (const [k, v] of Object.entries(p)) {
  if (typeof v === "string" && v.trim())
    brandingBlob[k === "background_color" ? "backdrop_color" : k] = v;
}
const BRAND = brandingToTokens(brandingBlob);

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

const rows: [string, string | undefined, string][] = [
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
// THE ACCEPTANCE TABLE ITSELF HAD A FALSE NEGATIVE. This first looked only at blocks of
// `type === "text"` and reported "— OPEN SLOT" for the authored paragraph on a run where
// the paragraph had in fact shipped and was plainly visible in the render. A provenance
// table that under-reports is worse than none: it would have sent someone hunting a
// narrator bug that did not exist, and on the next run it would have hidden a real one.
// Read the same slot the recipe writes, whatever block type carries it.
// Walk EVERY string in the built blocks rather than guessing a prop name — the narrative
// does not live on `props.text`, which is exactly why the first two versions of this line
// reported an open slot while the paragraph was visible on screen.
const strings: string[] = [];
(function walk(v: unknown) {
  if (typeof v === "string") strings.push(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
})(doc.blocks);
const remarks = (facts.remarks ?? "").trim();
const authored = strings.find(
  (s) => s.length > 120 && s.trim() !== remarks && !remarks.includes(s.trim()),
);
rows[14][1] = authored ? `${authored.length} chars` : undefined;

console.log("  CELL                        VALUE                          SOURCE");
console.log("  " + "─".repeat(108));
for (const [cell, value, source] of rows) {
  console.log(
    `  ${cell.padEnd(27)} ${(value ? String(value).slice(0, 29) : "— OPEN SLOT").padEnd(30)} ${source}`,
  );
}
const sourced = rows.filter(([, v]) => v).length;
console.log(
  `\n  ${sourced} of ${rows.length} cells sourced · ${rows.length - sourced} open/suppressed`,
);

// ── THE BOTTOM — identity, contact, socials, all off the ACCOUNT ─────────────
const agent = doc.blocks.find((b) => b.type === "agent-card");
const footer = doc.blocks.find((b) => b.type === "footer");
const ap = (agent?.props ?? {}) as Record<string, unknown>;
const fp = (footer?.props ?? {}) as Record<string, unknown>;
console.log("\n  THE BOTTOM — every value below came from the ACCOUNT's brand profile");
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
  ["X", fp.xUrl],
  ["Unsubscribe", fp.unsubscribeUrl],
] as [string, unknown][]) {
  console.log(
    `  ${label.padEnd(29)} ${v ? String(v).slice(0, 52) : "— OPEN SLOT (fill in Branding)"}`,
  );
}

console.log(`\n  Subject line: "${doc.subjectVariants?.[0] ?? "(none)"}"`);

// ── RENDER THROUGH THE ONE DOOR ──────────────────────────────────────────────
const html = await renderEmailDocHtml(doc);
const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
console.log(
  `  HTML: ${kb}KB ${kb > 102 ? "⚠ OVER Gmail's ~102KB clip point" : "(inside Gmail's ~102KB clip)"}`,
);

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

// ── WHAT THE PROJECT PATH CARRIES, AND WHAT IT STILL DROPS ──────────────────
//
// FIXED 08/05/2026. This block used to hold its OWN hardcoded 14-key copy of
// applyUserBrandToProject's carry list — a 20th hand-written key list, in the
// very script whose job is to catch brand fields going missing. When the carry
// set was widened from 14 to 32 that same day, this diagnostic kept printing
// "copied to a project: 0" against a defect that was already closed. A stale
// alarm is worse than no alarm: the next session reads it and re-opens fixed
// work. It now derives from the registry, so it can never disagree again.
const COPIED = new Set<string>(PROJECT_CARRY_KEYS);
const SKIP = new Set([
  "id",
  "user_id",
  "created_at",
  "updated_at",
  "source",
  "color_palettes",
  "sender_name",
  "sender_address",
  "sender_domain_verified",
  "preferred_recipe",
  "default_photo_ratio",
]);
const lost = Object.entries(p)
  .filter(([k, v]) => typeof v === "string" && v.trim() && !COPIED.has(k) && !SKIP.has(k))
  .map(([k]) => k);
const carried = Object.entries(p).filter(
  ([k, v]) => typeof v === "string" && v.trim() && COPIED.has(k),
).length;
console.log(
  `\n  BRAND FIELDS ACROSS applyUserBrandToProject — ${carried} filled and carried, ${lost.length} filled and DROPPED`,
);
console.log(`  ${lost.length ? lost.join(", ") : "nothing filled is dropped ✓"}`);

const outDir = join(homedir(), "Downloads");
try {
  mkdirSync(outDir, { recursive: true });
} catch {
  /* EEXIST on Windows */
}
const file = join(outDir, "coming-soon-email.html");
writeFileSync(file, html, "utf8");
console.log(`\n  SAVED → ${file}\n`);

if (leaked) {
  console.error(
    `  ✗ SUPPRESSION FAILED — ${leaked} address fragment(s) reached the rendered email.\n`,
  );
  process.exit(1);
}
