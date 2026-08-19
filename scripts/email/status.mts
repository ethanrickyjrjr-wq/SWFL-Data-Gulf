// scripts/email/status.mts — THE ONE GENERATED STATUS PAGE for the email fleet.
//
// Operator decree 08/18/2026: "how do we not have this documented where we find it in one
// place before we talk about it incorrectly?????" A hand-kept table is how a session came
// to state a wrong commentary status the same night — so this page is DERIVED from the
// code and the filesystem, never typed. Regenerate: `bun scripts/email/status.mts`.
// Verify without writing: `bun scripts/email/status.mts --check` (exit 1 when the
// committed page is stale). The bun test beside this file runs the same comparison, so a
// registry/bank/script change without a regen goes red in the full suite.
//
// DETERMINISTIC ON PURPOSE — no timestamps, no counts of anything outside the probes
// below. Every cell is an existence/registry read a reader can re-run.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RECIPES, RECIPE_KEYS, type RecipeKey } from "../../lib/deliverable/recipes";
import { bankFor } from "../../lib/deliverable/language-banks";

export const OUT_PATH = "docs/standards/email-status.md";
const PLAYBOOK = "docs/standards/email-build-playbook.md";

function yn(v: boolean): string {
  return v ? "yes" : "—";
}

/** One row of derived truth for a recipe key. Pure over the probes it is handed. */
export function rowFor(key: RecipeKey, playbookText: string): string {
  const r = RECIPES[key];
  const builder = `lib/deliverable/recipes/${key}.ts`;
  const test = `lib/deliverable/recipes/${key}.test.ts`;
  const accept = `scripts/email/render-${key}.mts`;
  const banked = bankFor(key) !== null;
  const inPlaybook = playbookText.includes(`tag \`${key}\``);
  const configured = r.config != null;
  return [
    key,
    r.target === "social" ? "social" : "email",
    r.positioning,
    yn(existsSync(builder)),
    yn(existsSync(test)),
    yn(existsSync(accept)),
    yn(banked),
    yn(inPlaybook),
    yn(configured),
  ].join(" · ");
}

export function buildStatusDoc(): string {
  const playbookText = readFileSync(PLAYBOOK, "utf8");
  const lines: string[] = [];
  lines.push("# EMAIL FLEET STATUS — GENERATED. DO NOT HAND-EDIT.");
  lines.push("");
  lines.push("Regenerate: `bun scripts/email/status.mts` · verify: `--check` (also enforced by");
  lines.push("`scripts/email/status.test.mts` — a registry/bank/script change without a regen");
  lines.push("goes red). Every cell is derived from the code: the recipe registry");
  lines.push("(`lib/deliverable/recipes.ts`), the sentence-bank registry");
  lines.push("(`lib/deliverable/language-banks.ts`), and file existence on disk.");
  lines.push("");
  lines.push("Column order per row:");
  lines.push("key · target · positioning · builder file · unit test · acceptance script ·");
  lines.push("sentence bank · playbook section · config");
  lines.push("");
  lines.push("A `—` is a true absence TODAY, not a judgment. The sentence-bank column is the");
  lines.push("commentary mechanism (approved words in code; model limited to digit-free");
  lines.push("connective). Cost-cell bans (HOA family) are fleet-wide via the cell-policy");
  lines.push("registry + the chrome sweep and are not per-recipe. The config column =");
  lines.push("recipes-as-config MIGRATED (spec 2026-08-18): the recipe is a config literal on");
  lines.push("its registry entry, built by the ONE config builder; `—` = still hand-coded.");
  lines.push("");
  for (const key of RECIPE_KEYS) {
    lines.push(`- ${rowFor(key, playbookText)}`);
  }
  lines.push("");
  return lines.join("\n");
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/email/status.mts");
if (isMain) {
  const doc = buildStatusDoc();
  if (process.argv.includes("--check")) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
    if (current !== doc) {
      console.error(
        `STALE: ${OUT_PATH} does not match the code. Run: bun scripts/email/status.mts`,
      );
      process.exit(1);
    }
    console.log(`fresh: ${OUT_PATH}`);
  } else {
    writeFileSync(OUT_PATH, doc);
    console.log(`wrote ${OUT_PATH} (${RECIPE_KEYS.length} recipes)`);
  }
}
