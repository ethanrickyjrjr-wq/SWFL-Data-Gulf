// scripts/emit-campaign.mts — RENDER THE CAMPAIGN TO DISK.
//
// Operator, 07/14/2026: *"WHERE IN THE FUCK IS THE FUCKING CAMPAIGN WE ACTUALLY BUILT?"*
// Fair question: the seven builders were committed, the real 326 Shore Dr data was committed
// (inside the test files), and NOBODY EVER KEPT THE OUTPUT. This script keeps the output.
//
// Offline. No API call, no AI, no key. Same builders, same data, same bytes.
//   bun scripts/emit-campaign.mts            -> runs/campaign-out/*.html + index.html
//   bun scripts/emit-campaign.mts --out DIR

import { mkdir, writeFile } from "node:fs/promises";
import { RECIPES, type RecipeKey } from "@/lib/deliverable/recipes";
import { builderFor } from "@/lib/deliverable/recipes/index";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** The REAL vendor capture for 326 Shore Dr (07/13/2026) — the same fixture the campaign
 *  coherence test pins. Real address, real price, real specs. Nothing invented. */
const FACTS = {
  address: "326 Shore Dr, Fort Myers, FL 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  photos: [],
  sourceUrl: "https://example.com/listing",
} as ListingFacts;

/** The listing lifecycle, in the order a seller actually walks it. */
const ORDER: RecipeKey[] = [
  "coming-soon",
  "new-listing",
  "open-house",
  "market-comps",
  "price-reduced",
  "under-contract",
  "just-sold",
];

async function build(key: RecipeKey): Promise<EmailDoc | null> {
  const recipe = RECIPES[key];
  const seed = (recipe.skeleton ? seedById(recipe.skeleton) : SEED_DOCS[0])!.build();
  return (
    (await builderFor(key)?.({
      recipe,
      prompt: "",
      currentDoc: seed,
      facts: FACTS,
      resolved: true,
    })) ?? null
  );
}

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1]! : "runs/campaign-out";

await mkdir(OUT, { recursive: true });

const built: { key: RecipeKey; label: string; file: string; blocks: number }[] = [];

for (const [i, key] of ORDER.entries()) {
  const doc = await build(key);
  if (!doc) {
    console.log(`  ✗ ${key} — builder returned null`);
    continue;
  }
  const html = await renderEmailDocHtml(doc);
  const file = `${String(i + 1).padStart(2, "0")}-${key}.html`;
  await writeFile(`${OUT}/${file}`, html, "utf8");
  built.push({ key, label: RECIPES[key].label, file, blocks: doc.blocks.length });
  console.log(`  ✓ ${file}  (${doc.blocks.length} blocks, ${html.length.toLocaleString()} bytes)`);
}

// A contact sheet so the whole campaign is ONE click, not seven.
const index = `<!doctype html><meta charset="utf-8"><title>Listing campaign — 326 Shore Dr</title>
<style>
  body{margin:0;background:#f4f4f5;font:15px/1.5 -apple-system,system-ui,sans-serif;color:#18181b}
  header{padding:28px 32px;background:#fff;border-bottom:1px solid #e4e4e7}
  h1{margin:0 0 4px;font-size:20px}
  .sub{color:#71717a;font-size:13px}
  .grid{display:flex;gap:20px;padding:24px;overflow-x:auto}
  .card{flex:0 0 620px;background:#fff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden}
  .cap{padding:12px 16px;border-bottom:1px solid #e4e4e7;display:flex;justify-content:space-between;align-items:baseline}
  .cap b{font-size:14px}
  .cap span{color:#71717a;font-size:12px}
  iframe{width:100%;height:900px;border:0;display:block;background:#fff}
</style>
<header>
  <h1>Listing campaign — 326 Shore Dr, Fort Myers, FL 33905</h1>
  <div class="sub">${built.length} emails, one chrome · real vendor data (07/13/2026) · rendered offline, no AI</div>
</header>
<div class="grid">
${built
  .map(
    (b, i) => `  <div class="card">
    <div class="cap"><b>${i + 1}. ${b.label}</b><span>${b.blocks} blocks</span></div>
    <iframe src="./${b.file}" loading="lazy" title="${b.label}"></iframe>
  </div>`,
  )
  .join("\n")}
</div>
`;
await writeFile(`${OUT}/index.html`, index, "utf8");

console.log(`\n${built.length}/${ORDER.length} emails → ${OUT}/index.html`);
