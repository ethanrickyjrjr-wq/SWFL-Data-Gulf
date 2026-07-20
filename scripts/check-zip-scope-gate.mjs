#!/usr/bin/env node
// scripts/check-zip-scope-gate.mjs
//
// ONE SCOPE ROOT, ENFORCED. Coverage is Lee + Collier — 57 ZIPs (isCoreScope,
// refinery/lib/core-scope.mts). That rule has existed since 07/11/2026 and the leak
// STILL reopened, because nothing forced a new surface to call it:
//
//   · The narrative bake enumerated ZIPs straight off the housing table (124 keys,
//     a Gulf-coast-wide feed). It listed 91 ZIPs and was one Monday away from PAYING
//     a model to write market narration for Bradenton, Sarasota, Punta Gorda and
//     Port Charlotte. No test, no lint, no build error. (Fixed 07/13/2026.)
//   · The homepage map filtered through its OWN hand-kept 57-ZIP list — a second
//     scope authority that agreed only because a human kept it in sync. (Killed
//     07/13/2026; it reads the root now.)
//
// The lake genuinely holds out-of-scope rows: home values carries 109 ZIPs, 56 of
// them Sarasota / Charlotte / mailing junk; momentum carries 12 strays. So an
// ungated read is not hypothetical — it WILL surface a county we don't cover.
//
// THE RULE: a file that reads a ZIP-grain lake table must reference the scope root
// (isCoreScope / CORE_SCOPE_ZIPS) — or carry an explicit, reasoned waiver. Fails
// CLOSED on a touched file; never scans the whole tree (a pre-existing debt list
// does not block an unrelated push).
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

/** ZIP-grain lake tables — reading one of these at ZIP grain requires the gate. */
const ZIP_GRAIN_TABLES = [
  "listing_active_stats",
  "listing_momentum_stats",
  "market_details_swfl_latest",
  "zhvi_zip_latest",
  "zori_zip_latest",
  "zhvi_zip_yoy_monthly",
  "listing_transitions_recent_zip_stats",
  "census_acs_zcta",
  "tier_divergence_zip_latest",
  "rental_listing_stats",
  "housing_by_zip",
];

/** The scope root, in any of its import shapes. */
const SCOPE_TOKENS = ["isCoreScope", "CORE_SCOPE_ZIPS", "coreScopeZips"];

/**
 * Waivers — a surface that reads a ZIP-grain table but is CORRECT to be ungated.
 * Each needs a reason. This is the only escape hatch, and it is deliberately loud.
 */
const WAIVERS = {
  "app/r/zip-report/[zip]/page.tsx":
    "reads housing_by_zip off the BRAIN payload (a.registryBrains housing-swfl detail_tables), never the lake — brain output is already scope-filtered; the page's lake-grain reads all route through assembleZipReport/candidates.ts, which is isCoreScope-gated",
  "lib/geo/nearest-zips.ts":
    "cross-county BY DESIGN — 'nearby' for a buyer ignores county lines; it is a navigation rail, never a data merge",
  "refinery/lib/core-scope.mts": "is the root",
  "lib/zip-summary/load.ts":
    "names census_acs_zcta only in its provenance doc-comment — the actual read routes through lib/zip-report/census-acs-rows.ts (loadCensusAcsZctaRows), which filters via isCoreScope at the shared root",
  "lib/deliverable/recipes/agent-brand-intro.ts":
    "the farm-area ZIP driving the listing_active_stats chart resolves through PLACE_ZIP_CROSSWALK (parseReplyIntent/zipFromPromptPlace), whose PlaceZipEntry.county type is lee|collier only — a single .eq(zip_code) lookup against an in-scope-guaranteed ZIP, never a bulk scan",
  "lib/deliverable/recipes/review-reply.ts":
    "zip comes from resolveArea's CROSSWALK_ZIPS, built from the same PLACE_ZIP_CROSSWALK (lee|collier only by type) — a single .eq(zip_code) lookup, never a bulk scan",
};

function changedFiles() {
  try {
    const range = process.env.GATE_RANGE || "@{upstream}..HEAD";
    const out = execSync(`git diff --name-only ${range}`, { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    // No upstream (fresh branch) — fall back to staged + last commit.
    try {
      const out = execSync("git diff --name-only HEAD~1..HEAD", { encoding: "utf8" });
      return out.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}

const offenders = [];
for (const file of changedFiles()) {
  if (!/\.(ts|mts|tsx)$/.test(file)) continue;
  if (/\.test\.|__tests__|__fixtures__/.test(file)) continue;
  if (WAIVERS[file]) continue;
  if (!existsSync(file)) continue;

  const src = readFileSync(file, "utf8");
  const tables = ZIP_GRAIN_TABLES.filter((t) => src.includes(t));
  if (tables.length === 0) continue;

  // NO `zip_code` PRECONDITION. The first cut of this gate only fired when the file
  // also mentioned `zip_code` — and the very leak it was written for walked straight
  // through, because the bake enumerates ZIPs off `r.key`, not a `zip_code` column.
  // A precondition that assumes how a surface names its ZIPs is the same mistake as
  // the bug. Touch a ZIP-grain table → go through the root, or waive it out loud.
  const gated = SCOPE_TOKENS.some((t) => src.includes(t));
  if (!gated) offenders.push({ file, tables });
}

if (offenders.length > 0) {
  const lines = offenders.map((o) => `  ${o.file}\n      reads: ${o.tables.join(", ")}`).join("\n");
  console.error(
    `\n[pre-push gate] BLOCKED (Gate 8 — ZIP scope root)\n\n` +
      `These files read a ZIP-grain lake table but never go through the scope root:\n\n` +
      `${lines}\n\n` +
      `Coverage is Lee + Collier — 57 ZIPs. The lake DOES hold out-of-scope rows\n` +
      `(home values: 109 ZIPs, 56 of them Sarasota/Charlotte/Bradenton/mailing), so an\n` +
      `ungated read WILL surface a county we do not cover. This exact leak shipped twice:\n` +
      `the narrative bake nearly paid a model to write about Bradenton, and the homepage\n` +
      `map kept a second private scope list that only agreed by hand.\n\n` +
      `Fix (pick one, in THIS commit):\n` +
      `  1. import { isCoreScope } from "@/refinery/lib/core-scope.mts" and filter the rows.\n` +
      `  2. If the surface is CORRECTLY cross-scope, add it to WAIVERS in\n` +
      `     scripts/check-zip-scope-gate.mjs with a one-line reason.\n`,
  );
  process.exit(1);
}

console.log("[pre-push gate] Gate 8 (ZIP scope root) — OK");
