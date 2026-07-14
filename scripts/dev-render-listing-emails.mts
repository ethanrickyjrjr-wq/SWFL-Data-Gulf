/**
 * DEV-ONLY. Renders the 7 listing-lifecycle emails to static HTML so the operator
 * can look at what actually gets built — the real numbers from the 07/13/2026
 * capture of 326 Shore Dr, Fort Myers.
 *
 * WHY THIS EXISTS: the Email Lab persists a built doc ONLY on an explicit Save
 * (verified 07/13 — zero rows in projects/deliverables/email_schedules since
 * 07/12). Seven emails were built that day and none survive. This script rebuilds
 * them from the committed fixture instead of from memory.
 *
 * NO SPEND, BY CONSTRUCTION: run it with NO ANTHROPIC_API_KEY in the environment.
 * Every narrator in these recipes is a try/catch around one model call that falls
 * through to a DETERMINISTIC note (under-contract's `fallbackNote` joins the settled
 * sentences). That fallback is exactly what the operator's 07/13 screenshot shows —
 * so the model was never load-bearing here, and its absence changes nothing.
 *
 *   bun scripts/dev-render-listing-emails.mts        (do NOT pass --env-file)
 *
 * Output: public/dev-emails/<recipe-key>.html  (gitignored — a scratch surface)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { builderFor } from "../lib/deliverable/recipes/index";
import { RECIPES, type RecipeKey } from "../lib/deliverable/recipes";
import { SHORE_DR_FACTS } from "../lib/deliverable/recipes/__fixtures__/shore-dr";
import { resolveSubject } from "../lib/deliverable/recipes/shared";
import { defaultDoc } from "../lib/email/doc/default-docs";
import { renderEmailDocHtml } from "../lib/email/render-email-doc";

if (process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[warn] ANTHROPIC_API_KEY is set — a narrator call may fire and cost money.\n" +
      "       Re-run WITHOUT --env-file to force the deterministic path.",
  );
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "dev-emails");
mkdirSync(OUT, { recursive: true });

/** The listing lifecycle — one resolved house, seven hats. */
const LIFECYCLE: RecipeKey[] = [
  "coming-soon",
  "new-listing",
  "open-house",
  "price-reduced",
  "market-comps",
  "under-contract",
  "just-sold",
];

// --live: resolve 326 Shore Dr against the listing vendor ONCE, so the hero photo
// is real (resolveSubject also MIRRORS it into our storage, which is precisely the
// step whose output the Lab threw away). Without the flag, the committed fixture is
// used and the photo renders as an empty box. One address, one lookup, no model.
const LIVE = process.argv.includes("--live");
let FACTS = SHORE_DR_FACTS;
if (LIVE) {
  const { facts, resolved } = await resolveSubject(SHORE_DR_FACTS.address!, "");
  console.log(
    `resolve: ${resolved ? "HIT" : "MISS"} · photo=${facts.photos[0] ?? "(none)"} · price=${facts.price ?? "-"}`,
  );
  if (resolved) FACTS = facts;
  else console.log("       falling back to the committed fixture — nothing invented.");
}

for (const key of LIFECYCLE) {
  const recipe = RECIPES[key];
  const build = builderFor(key);
  if (!build) {
    console.log(`SKIP ${key} — no builder registered`);
    continue;
  }
  try {
    const doc = await build({
      recipe,
      prompt: recipe.prompt.replace(/\[\[[^\]]*\]\]/g, FACTS.address ?? ""),
      currentDoc: defaultDoc(),
      facts: FACTS,
      resolved: true,
      zip: FACTS.zip,
    });
    if (!doc) {
      console.log(`NULL ${key} — builder fell through to the generic author`);
      continue;
    }
    const html = await renderEmailDocHtml(doc);
    writeFileSync(join(OUT, `${key}.html`), html, "utf-8");
    console.log(`ok   ${key}  (${html.length.toLocaleString()} bytes)`);
  } catch (e) {
    console.log(`FAIL ${key} — ${(e as Error).message}`);
  }
}
