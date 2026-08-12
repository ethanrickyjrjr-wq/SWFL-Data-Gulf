/**
 * THE LISTINGS DIGEST EMAIL, BUILT FROM ONE ZIP, END TO END — the acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-listings-digest.mts "<zip>"
 *   bun --env-file=.env.local scripts/email/render-listings-digest.mts            (default ZIP)
 *
 * listings-digest never had a render script (`_GO/HANDOFF.md`, 08/11/2026: "listings-digest
 * has no render script... never proven from a real entry point"). This is that script,
 * driving the REAL pipe directly — `buildListingsDigest` → `applyBrand` → `renderEmailDocHtml`.
 *
 * ── WHY THIS BYPASSES /go INSTEAD OF DRIVING THE UI ──────────────────────────
 * The live /go → Listings Digest door is confirmed BROKEN as of 08/12/2026
 * (check: listings_digest_recipekey_dropped_on_area_arrival) — the arrival planner drops
 * recipeKey for this one area-keyed door and the build silently falls to the generic
 * default-grid author. This script calls the recipe builder directly so a reference
 * capture can exist without depending on that fix landing first.
 *
 * `buildListingsDigest` also needs a real ZIP (`ctx.zip`), not free text — the /go bar
 * only ever captures a typed city/area string, so even once the recipeKey bug is fixed,
 * something still has to resolve "Fort Myers" -> "33901" before this builder can run.
 * That resolution gap is not addressed here; it rides on the same open check.
 *
 * ── SPEND ─────────────────────────────────────────────────────────────────────
 * Free by default (SteadyAPI photo listings + the free lake baths lane). The ONLY paid
 * call is a per-home Apify baths gap-fill for whatever the free lane misses
 * (`lib/listings/apify-baths.ts`), off unless `OPERATOR_APPROVED_PAID_RUN=1`.
 */
import { buildListingsDigest } from "../../lib/deliverable/recipes/listings-digest";
import { defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import { loadAccountBrand, renderAndSave } from "./_harness.mts";

// 33901 — Fort Myers proper, real Lee County ZIP, already used in this session's live
// verification (matches the /go test that surfaced the recipeKey bug).
const ZIP = process.argv[2]?.trim() || "33901";

console.log(`\n  AREA ZIP: ${ZIP}\n`);

const { brand: BRAND } = await loadAccountBrand();

const built = await buildListingsDigest({
  zip: ZIP,
  currentDoc: applyBrand(defaultDoc(), BRAND),
  prompt: "",
  facts: null,
  resolved: false,
} as never);

if (!built) {
  console.error("  buildListingsDigest returned null — no area named, so nothing to build.");
  process.exit(1);
}

const doc = applyBrand(built, BRAND);
type Block = { type: string; props?: Record<string, unknown> };
const blocks = doc.blocks as unknown as Block[];
const imageBlocks = blocks.filter((b) => b.type === "image");
console.log(`  Blocks: ${blocks.length} total, ${imageBlocks.length} photo/image blocks\n`);

await renderAndSave(doc, `listings-digest-email-${ZIP}.html`);
