/**
 * THE MARKET COMPS EMAIL, BUILT FROM ONE ADDRESS, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-market-comps.mts "<address>"
 *   bun --env-file=.env.local scripts/email/render-market-comps.mts            (default house)
 *
 * It drives the REAL pipe — `resolveSubject` → `buildMarketComps` → `applyBrand` →
 * `renderEmailDocHtml` — so what lands on disk is exactly what a send would carry, and
 * the brand is read off a REAL ACCOUNT the way `render-coming-soon.mts` does (a field
 * that does not travel shows up as an open slot instead of hiding behind a literal).
 *
 * ── WHAT THIS SCRIPT ASSERTS THAT THE OTHER TWO DO NOT ──────────────────────
 *
 * Coming Soon's contract is a SUPPRESSION contract — one grep, four probes. This email
 * prints the address on purpose, so its contract is about the EVIDENCE instead. Five
 * assertions, every one read off the built doc / rendered bytes, never off the source:
 *
 *   1. **NO CHART.** The operator has killed the comps chart three times (08/03, 08/04)
 *      and the first "fix" swapped its unit and kept it. `compsMiddle` carries a large
 *      comment saying no chart is reserved — a comment is not a guard. This counts
 *      `image` blocks: exactly ONE is legal (the subject's own photo). A second image
 *      block means a chart came back.
 *   2. **EVERY COMP ROW CARRIES BEDS AND SQ FT.** `isComparableHome` filters vacant lots
 *      by DATA, and a lot on the chart once made a $595k ask look like a bargain for a
 *      fake reason. Read back off the rendered rows.
 *   3. **NO RECORDED SALE OLDER THAN 365 DAYS.** Operator decree 08/03/2026. Parsed from
 *      each row's own "Sold MM/DD/YYYY" line — the thing the reader actually sees.
 *   4. **THE SUBJECT IS NOT ITS OWN COMP.** 16447 Rainbow Meadows Ct shipped as a
 *      "comparable" of itself, citing its own 2017 sale.
 *   5. **THE BUTTON AND THE HERO PHOTO DO NOT POINT AT US.** `resolve-subject.ts` fills
 *      `sourceUrl` with our own homepage; a reader clicking "Find Out More" on a specific
 *      house expects that house. Reported, not fatal — no listing page is a legitimate
 *      state (`isListingUrl`), an unnoticed one is not.
 *
 * ── AND THE ONE THING NOTHING SURFACED BEFORE: DID THE CLAIM GATE FIRE? ──────
 * `authorCompsCase` drops the narrator's paragraph on any violation and logs a single
 * `console.error`. A dropped context ships the code-authored verdict ALONE — which reads
 * like a thin email, not like a gate doing its job. This run captures that line and puts
 * it in the provenance table, so "the prose is short today" is never a mystery.
 *
 * ── SPEND — THIS RUN IS FREE BY DEFAULT, AND THAT IS THE POINT ──────────────
 * **The paid Apify lane is OFF unless you set `OPERATOR_APPROVED_PAID_RUN=1` for this
 * run** (`lib/listings/apify-spend-guard.ts`). Run it plain and it costs nothing at the
 * vendor: comps ship with whatever photos our own lake holds, the no-photo floor logs
 * loudly, and every structural assertion below still runs. That is deliberate — the
 * acceptance script is the thing that gets re-run seven times in an afternoon, so it is
 * the thing that must not spend by default.
 *
 * The old header promised "new rows = houses we bought on this run" and that was FALSE:
 * re-buying the same 200 houses upserts to zero new rows, so the receipt printed 0 while
 * $2.00 was charged. The receipt now counts RESULTS REQUESTED — the unit the vendor
 * bills — and the row delta is kept only as a cache statistic, labelled as one.
 *
 * DEFAULT HOUSE: `8348 Southwindbay Cir, Fort Myers, FL 33908` — the 08/04/2026 live-probe
 * subject, so its comparable set is already sitting in the record store and a re-run costs
 * close to nothing. The ONE reliably metered call is the narrator paragraph; run without
 * `ANTHROPIC_API_KEY` and the prose becomes the code-authored verdict alone, which is the
 * designed fail-closed state, not a break.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildMarketComps, isListingUrl } from "../../lib/deliverable/recipes/market-comps";
import { resolveSubject } from "../../lib/deliverable/recipes/shared";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import { brandingToTokens } from "../../lib/email/brand/branding-to-tokens";
import { renderEmailDocHtml } from "../../lib/email/render-email-doc";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
import { spendLedger, paidLaneEnabled, USD_PER_RESULT } from "../../lib/listings/apify-spend-guard";

const ADDRESS = process.argv[2] ?? "8348 Southwindbay Cir, Fort Myers, FL 33908";
const UID = process.env.DEMO_BRAND_USER_ID ?? "37cc6c49-4759-4e07-9686-0a8dcce1f8ff";

console.log(`\n  SUBJECT: ${ADDRESS}\n`);

const db = createServiceRoleClientUntyped();

/** The paid-record receipt. Counted before and after — the delta IS the spend. */
async function paidRecordCount(): Promise<number | null> {
  const { count } = await db
    .schema("data_lake")
    .from("apify_property_records")
    .select("*", { count: "exact", head: true });
  return count ?? null;
}
const paidBefore = await paidRecordCount();

// ── THE BRAND, OFF THE REAL ACCOUNT ──────────────────────────────────────────
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

// ── CAPTURE THE CLAIM GATE. It speaks exactly once, on stderr, and then the email
//    quietly ships shorter. Wrap before the build; restore after.
const realError = console.error;
let narratorDrop = "";
console.error = (...args: unknown[]) => {
  const line = args.map(String).join(" ");
  if (line.includes("[market-comps] narrator context DROPPED")) narratorDrop = line;
  realError(...args);
};

// ── THE BUILD — the real recipe, the real chrome ─────────────────────────────
const { facts, resolved } = await resolveSubject(ADDRESS, "");
if (!resolved) {
  console.warn(
    "  ⚠ NOT RESOLVED — the grid still lands, every cell an open slot (RULE 0.7).\n" +
      "    Outside Lee/Collier, or the nightly sweep has not landed this listing yet.\n",
  );
}

// The canvas arrives ALREADY BRANDED — same reasoning as render-coming-soon.mts: in the
// product the canvas is a live, already-branded doc, so seeding it here is what makes the
// run faithful. `applyBrand` still runs LAST as the overlay.
const built = await buildMarketComps({
  facts,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  scope: {},
} as never);
console.error = realError;
if (!built) {
  console.error("  buildMarketComps returned null — no address, so no asking price to defend.");
  process.exit(1);
}
const doc = applyBrand(built, BRAND);
const paidAfter = await paidRecordCount();

// ── READ THE ARTIFACT BACK ───────────────────────────────────────────────────
type Block = { type: string; props?: Record<string, unknown> };
const blocks = doc.blocks as unknown as Block[];
const statsBlock = blocks.find((b) => b.type === "stats");
const stats = ((statsBlock?.props?.stats ?? []) as { value?: string; label?: string }[]) ?? [];
const statOf = (label: string) => stats.find((s) => s.label === label)?.value || undefined;
const footnote = (statsBlock?.props?.footnote as string | undefined) || undefined;

const listBlock = blocks.find((b) => b.type === "list");
const listTitle = (listBlock?.props?.title as string | undefined) ?? "";
type Row = { lead?: string; text?: string; linkUrl?: string; imageUrl?: string };
const rowsOut = ((listBlock?.props?.items ?? []) as Row[]) ?? [];

const imageBlocks = blocks.filter((b) => b.type === "image");
const sourcesBlock = blocks.find((b) => b.type === "sources");
const sourceCount = ((sourcesBlock?.props?.sources ?? []) as unknown[]).length;
const buttonBlock = blocks.find((b) => b.type === "button");
const ctaUrl = (buttonBlock?.props?.url as string | undefined) ?? undefined;
const heroLinkUrl = (imageBlocks[0]?.props?.linkUrl as string | undefined) ?? undefined;

// The description block and the narrative are both `text`; the description carries the
// listing agent's own copy verbatim, so it is the one that MATCHES facts.remarks.
const texts: string[] = [];
(function walk(v: unknown) {
  if (typeof v === "string") texts.push(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
})(blocks);
const remarks = (facts.remarks ?? "").trim();
const descriptionShipped = remarks ? texts.some((t) => t.trim() === remarks) : false;
// The verdict is code-authored and always starts with the $/sq ft sentence.
const verdictish = texts.find((t) => /per square foot, the asking price/i.test(t));

// ── THE PROVENANCE TABLE — every cell, and which lane filled it ──────────────
const rows: [string, string | undefined, string][] = [
  ["Asking price (hero)", facts.price, "free spine (daily sweep) — the CLAIM this email defends"],
  ["Address (hero label)", facts.address, "free spine — printed, unlike Coming Soon"],
  ["Beds", statOf("Beds"), "free spine → paid row"],
  ["Baths", statOf("Baths"), "free spine → Lee records → nearby-values → paid row"],
  ["Sq ft", statOf("Sq Ft"), "free spine → paid row"],
  ["$/Sq Ft (primary)", statOf("$/Sq Ft"), "computed, price ÷ listed sq ft"],
  ["Median $/Sq Ft", statOf("Median"), "computed over the comp set's own $/sq ft"],
  ["DOM", statOf("DOM"), "our own listing_dom root — never a first-seen floor"],
  ["Spec footnote", footnote, "derivation + the MIX + the spread (+ style note if sourced)"],
  ["Hero photo", facts.photos[0] ? "yes" : undefined, "the listing's own photo or nothing"],
  ["Evidence table title", listTitle || undefined, "the MIX, restated where the rows are"],
  [
    "Comparable homes",
    rowsOut.length ? String(rowsOut.length) : undefined,
    "SteadyAPI nearby → land filter → not-self → fresh-sale → photographed",
  ],
  [
    "…with a photo",
    rowsOut.length ? `${rowsOut.filter((r) => r.imageUrl).length} of ${rowsOut.length}` : undefined,
    "our lake first, then the already-bought paid record",
  ],
  [
    "…with a link",
    rowsOut.length ? `${rowsOut.filter((r) => r.linkUrl).length} of ${rowsOut.length}` : undefined,
    "comp sourceUrl → paid record's property_url",
  ],
  [
    "Description (verbatim)",
    remarks ? `${remarks.length} chars${descriptionShipped ? "" : " — NOT SHIPPED"}` : undefined,
    "the listing agent's own copy → paid row · never rewritten",
  ],
  [
    "Verdict (code-authored)",
    verdictish ? `${verdictish.length} chars` : undefined,
    "buildPriceCase — every comparison computed, never modelled",
  ],
  [
    "Narrator context",
    narratorDrop ? "DROPPED by the claim gate" : verdictish ? "shipped" : undefined,
    narratorDrop ? "fail-closed: the verdict alone still ships" : "linted by auditClaims",
  ],
  ["Sources", sourceCount ? String(sourceCount) : undefined, "collapsed accordion, domain-level"],
  ["CTA", ctaUrl, "the subject's real listing page → our site only as last resort"],
];

console.log("  CELL                        VALUE                          SOURCE");
console.log("  " + "─".repeat(112));
for (const [cell, value, source] of rows) {
  console.log(
    `  ${cell.padEnd(27)} ${(value ? String(value).slice(0, 29) : "— OPEN SLOT").padEnd(30)} ${source}`,
  );
}
const sourced = rows.filter(([, v]) => v).length;
console.log(`\n  ${sourced} of ${rows.length} cells sourced · ${rows.length - sourced} open`);

// ── THE EVIDENCE ROWS, PRINTED — this is what the reader sees ────────────────
console.log("\n  THE EVIDENCE TABLE, ROW BY ROW");
for (const r of rowsOut) {
  console.log(
    `  ${r.imageUrl ? "📷" : "  "} ${r.linkUrl ? "🔗" : "  "} ${(r.lead ?? "").padEnd(26)} ${r.text ?? ""}`,
  );
}

// ── THE BOTTOM — identity, contact, socials, all off the ACCOUNT ─────────────
const agent = blocks.find((b) => b.type === "agent-card");
const footer = blocks.find((b) => b.type === "footer");
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

// ── THE EVIDENCE CONTRACT — asserted against the BUILT ARTIFACT ──────────────
const fail: string[] = [];
const warn: string[] = [];

// 1 · NO CHART, AND THE PHOTO IS STILL THERE. Exactly one image block is legal when we
// hold a subject photo: that photo. A `> 1` test alone would pass a build with ZERO image
// blocks — a chart that REPLACED the photo, or a photo that silently stopped rendering,
// both slip through a ceiling with no floor.
//
// PROVEN RED 08/05/2026 before being trusted: a chart-shaped image block pushed into
// `compsMiddle` made this run exit 1 with "A CHART CAME BACK — 2 image blocks". An
// assertion that has never gone red is a comment with a process.exit(1) attached.
const expectImages = facts.photos[0] ? 1 : 0;
if (imageBlocks.length !== expectImages) {
  fail.push(
    imageBlocks.length > expectImages
      ? `A CHART CAME BACK — ${imageBlocks.length} image blocks, only the subject photo is legal. ` +
          `The operator has killed this chart three times; re-read compsMiddle before adding one.`
      : `THE SUBJECT PHOTO IS GONE — ${imageBlocks.length} image blocks, expected ${expectImages}. ` +
          `We hold a photo for this house and the email is not showing it.`,
  );
}

// 2 · EVERY COMP ROW CARRIES BEDS AND SQ FT (the land filter, read off the render).
for (const r of rowsOut) {
  const t = r.text ?? "";
  if (!/\d+\s*bd/.test(t) || !/[\d,]+\s*sq ft/.test(t))
    fail.push(`VACANT-LOT SHAPE reached the evidence table: "${t}"`);
}

// 3 · NO RECORDED SALE OLDER THAN 365 DAYS.
const today = new Date();
for (const r of rowsOut) {
  const m = /Sold (\d{2})\/(\d{2})\/(\d{4})/.exec(r.text ?? "");
  if (!m) continue;
  const age = (today.getTime() - Date.parse(`${m[3]}-${m[1]}-${m[2]}`)) / 86_400_000;
  if (age > 365)
    fail.push(`STALE SALE — ${Math.round(age)} days old, past the 365-day ceiling: "${r.text}"`);
}

// 4 · THE SUBJECT IS NOT ITS OWN COMP.
const subjStreet = (facts.address ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
if (subjStreet)
  for (const r of rowsOut)
    if ((r.text ?? "").toLowerCase().startsWith(subjStreet))
      fail.push(`THE SUBJECT IS IN ITS OWN COMP SET: "${r.text}"`);

// 5 · DESTINATIONS. Reported, never fatal — no listing page is a legitimate state.
if (!isListingUrl(ctaUrl)) warn.push(`CTA points at us, not at a listing page: ${ctaUrl}`);
if (!isListingUrl(heroLinkUrl))
  warn.push(`Hero photo links at us, not at a listing page: ${heroLinkUrl}`);
if (rowsOut.length && rowsOut.some((r) => !r.imageUrl))
  warn.push(
    `${rowsOut.filter((r) => !r.imageUrl).length} comp row(s) ship without a photo — ` +
      `check the vendor cap before reading it as a thin market.`,
  );

console.log("\n  THE EVIDENCE CONTRACT — asserted against the built doc");
console.log(
  `  image blocks         ${imageBlocks.length} ${imageBlocks.length <= 1 ? "(subject photo only) ✓" : "✗ A CHART CAME BACK"}`,
);
console.log(`  comp rows            ${rowsOut.length}`);
console.log(
  `  land filter          ${rowsOut.length && !fail.some((f) => f.startsWith("VACANT")) ? "every row has beds + sq ft ✓" : rowsOut.length ? "✗" : "(no rows)"}`,
);
console.log(
  `  sale freshness       ${fail.some((f) => f.startsWith("STALE")) ? "✗" : "no recorded sale past 365 days ✓"}`,
);
console.log(
  `  subject exclusion    ${fail.some((f) => f.startsWith("THE SUBJECT")) ? "✗" : "the subject is not its own comp ✓"}`,
);

// ── SPEND, IN THE UNIT THE VENDOR ACTUALLY BILLS ────────────────────────────
//
// *** THE RECEIPT THAT USED TO PRINT HERE WAS A FALSE-PASS INSTRUMENT AND ITS ANSWER
//     WAS REPORTED TO THE OPERATOR AS FACT. ***
//
// It counted ROWS ADDED to `data_lake.apify_property_records` before/after and called
// the delta "NEW HOUSES BOUGHT THIS RUN". Re-buying the SAME 200 houses upserts to ZERO
// new rows — so it printed "0 bought" while the vendor charged $2.00. On 08/05/2026 that
// number was used to tell him "the second build cost zero." The real figure, pulled from
// Apify's own `/v2/actor-runs`: **$14.08 across 21 runs on that walk.**
//
// A receipt must read what we were CHARGED, never what our own cache happened to keep.
// The ledger below counts RESULTS REQUESTED — the unit the vendor bills ($0.01/result,
// verified against the real charges: $1.9501 = 195 x $0.01 + the actor start) — and it
// is charged BEFORE each call, so it cannot under-report a call that already happened.
const spent = spendLedger();
console.log("\n  SPEND RECEIPT — charged, not inferred");
console.log(
  `  paid lane           ${paidLaneEnabled() ? "ON (OPERATOR_APPROVED_PAID_RUN=1)" : "OFF — no vendor call was made, nothing was billed"}`,
);
console.log(
  `  results committed   ${spent.results} (~$${spent.estimatedUsd.toFixed(2)} at $${USD_PER_RESULT}/result)`,
);
console.log(
  `  refusals            ${spent.refusals}${spent.refused ? "  ← empty photo/link slots below are THIS, not an empty market" : ""}`,
);
// The row delta is still worth SEEING — it says how much of what we bought was new to us
// — but it is labelled for what it is and can never again be read as a cost.
console.log(
  `  cache rows          ${paidBefore ?? "?"} → ${paidAfter ?? "?"} ` +
    `(rows NEW TO THE CACHE — NOT a spend figure: re-buying the same houses adds 0 rows)`,
);

const outDir = join(homedir(), "Downloads");
try {
  mkdirSync(outDir, { recursive: true });
} catch {
  /* EEXIST on Windows */
}
const file = join(outDir, "market-comps-email.html");
writeFileSync(file, html, "utf8");
console.log(`\n  SAVED → ${file}`);

if (warn.length) {
  console.log("\n  ⚠ REPORTED, NOT FATAL");
  for (const w of warn) console.log(`    · ${w}`);
}
if (fail.length) {
  console.error("\n  ✗ THE EVIDENCE CONTRACT FAILED");
  for (const f of fail) console.error(`    · ${f}`);
  console.error("");
  process.exit(1);
}
console.log("");
