/**
 * Stage 5 CLI — render role-targeted views of one or more brains.
 *
 * Reads `brains/{id}.md`, parses the `--- OUTPUT ---` JSON block, and emits
 * role-targeted markdown next to the canonical brain:
 *
 *   brains/{id}.md                 (canonical — untouched)
 *   brains/{id}--operator.md       (operator briefing)
 *   brains/{id}--cre-broker.md     (CRE broker briefing)
 *   brains/{id}--franchise-consultant.md
 *   brains/{id}--cpa.md
 *
 * Decoupled from the refinery pipeline so a role view can regenerate
 * against any previously-rendered brain without re-running Stages 1-4.
 *
 * Usage:
 *
 *   bun refinery/tools/render-roles.mts <brain_id|all> [--role=<role>]
 *
 *   bun refinery/tools/render-roles.mts master
 *   bun refinery/tools/render-roles.mts master --role=cre-broker
 *   bun refinery/tools/render-roles.mts all
 *
 * No side effects beyond writes to brains/. Pure read against the
 * canonical brain output → pure write of derived views.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderForRole, type RoleId } from "../render/role-renderer.mts";
import type { BrainOutput } from "../types/brain-output.mts";
import { loadVocabularySync } from "../vocab/loader.mts";

/**
 * Build a SKOS-aware category lookup from the loaded vocab. Returns the
 * concept's `category` for a raw slug, or null when the slug is unmapped
 * (the renderer falls back to prefix matching in that case). Cached at
 * module-init through `loadVocabularySync`.
 */
function buildCategoryLookup(): (slug: string) => string | null {
  const vocab = loadVocabularySync();
  return (slug: string): string | null => {
    // slug_index entries can be either a concept id (string) or a
    // path-ambiguity marker (`{ _note: string }`). Only string entries
    // resolve to a concept; markers indicate the slug needs path-aware
    // resolution which the renderer does not perform.
    const entry = vocab.slug_index?.[slug];
    if (typeof entry !== "string") return null;
    const concept = vocab.concepts?.[entry];
    return concept?.category ?? null;
  };
}

const BRAINS_DIR = path.join(process.cwd(), "brains");
const ALL_ROLES: RoleId[] = [
  "operator",
  "cre-broker",
  "franchise-consultant",
  "cpa",
];

function parseOutputBlock(markdown: string, brainId: string): BrainOutput {
  const m = markdown.match(/--- OUTPUT ---\s*([\s\S]*?)(?:\n--- |\n```|$)/);
  if (!m) {
    throw new Error(
      `Could not locate '--- OUTPUT ---' block in brain '${brainId}'.`,
    );
  }
  const raw = m[1].trim();
  try {
    return JSON.parse(raw) as BrainOutput;
  } catch (err) {
    throw new Error(
      `Failed to parse OUTPUT JSON for brain '${brainId}': ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function listCanonicalBrains(): string[] {
  const files = readdirSync(BRAINS_DIR);
  return files
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !f.includes("--")) // skip already-rendered role views
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

function renderOneBrain(
  brainId: string,
  roleFilter: RoleId | null,
  categoryLookup: (slug: string) => string | null,
): string[] {
  const canonicalPath = path.join(BRAINS_DIR, `${brainId}.md`);
  let markdown: string;
  try {
    markdown = readFileSync(canonicalPath, "utf-8");
  } catch {
    throw new Error(`Canonical brain not found: ${canonicalPath}`);
  }
  const output = parseOutputBlock(markdown, brainId);

  const written: string[] = [];
  const rolesToRender: RoleId[] = roleFilter ? [roleFilter] : ALL_ROLES;
  for (const role of rolesToRender) {
    const md = renderForRole(output, {
      role,
      category_lookup: categoryLookup,
    });
    const outPath = path.join(BRAINS_DIR, `${brainId}--${role}.md`);
    writeFileSync(outPath, md, "utf-8");
    written.push(outPath);
  }
  return written;
}

function parseArgs(argv: string[]): { target: string; role: RoleId | null } {
  let target = "";
  let role: RoleId | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--role=")) {
      const value = arg.slice("--role=".length);
      if (!ALL_ROLES.includes(value as RoleId)) {
        throw new Error(
          `Unknown role '${value}'. Valid: ${ALL_ROLES.join(", ")}`,
        );
      }
      role = value as RoleId;
    } else if (!target) {
      target = arg;
    }
  }
  if (!target) {
    throw new Error(
      "Usage: render-roles <brain_id|all> [--role=<role>]\n" +
        `Roles: ${ALL_ROLES.join(", ")}`,
    );
  }
  return { target, role };
}

function main(): void {
  const argv = process.argv.slice(2);
  const { target, role } = parseArgs(argv);

  const brainIds = target === "all" ? listCanonicalBrains() : [target];
  if (brainIds.length === 0) {
    console.warn("[render-roles] No canonical brains found in brains/.");
    return;
  }

  const categoryLookup = buildCategoryLookup();
  let totalWritten = 0;
  for (const brainId of brainIds) {
    try {
      const written = renderOneBrain(brainId, role, categoryLookup);
      totalWritten += written.length;
      for (const p of written) {
        const bytes = readFileSync(p, "utf-8").length;
        console.log(`[render-roles] wrote ${p} (${bytes} bytes)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // test-alpha and other frontmatter fixtures have no OUTPUT block by
      // design (spec v1.1 lock #9). Warn but do not fail the run.
      if (msg.includes("Could not locate '--- OUTPUT ---' block")) {
        console.warn(`[render-roles] skipped '${brainId}': ${msg}`);
      } else {
        console.error(`[render-roles] FAILED for '${brainId}': ${msg}`);
        process.exitCode = 1;
      }
    }
  }

  console.log(
    `[render-roles] done — ${totalWritten} file${totalWritten === 1 ? "" : "s"} written across ${brainIds.length} brain${brainIds.length === 1 ? "" : "s"}.`,
  );
}

main();
