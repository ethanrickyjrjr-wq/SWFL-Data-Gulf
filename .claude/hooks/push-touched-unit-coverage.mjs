#!/usr/bin/env node
// push-touched-unit-coverage.mjs — PostToolUse hook (matcher: Edit|Write).
//
// WHY THIS HOOK AND NOT inject-focus.mjs: the original spec proposed extending
// inject-focus.mjs (a UserPromptSubmit hook). Verified live against
// code.claude.com/docs/en/hooks before building: UserPromptSubmit's own stdin
// contract carries no touched-file list, and inject-focus.mjs's header
// explicitly rejects content-based routing ("a topic router misfires
// constantly"). PostToolUse DOES carry tool_input.file_path (same field
// check-odd-surface.mjs and annotate-plan.mjs already key on) and its
// additionalContext is documented to land "next to the tool result" — the
// exact push-not-pull behavior the spec wants. This is a corrected mechanism,
// same intent as the spec's §5/§8.
//
// Two independent detectors, silent unless matched (mirrors onOddSurface's
// contract in check-odd-surface.mjs): a pipeline touch pushes cadence_registry
// source_scope (spec Rollout Step 1); a ledger-unit touch pushes its
// Enforced/Unenforced summary (spec Rollout Step 2, added in Task 4).
//
// Fail-OPEN: any internal error → silent exit 0. A broken nudge must never
// interfere with a legitimate edit.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSourceScope } from "./lib/pipeline-scope.mjs";
import { parseLedger } from "./lib/ledger-parse.mjs";

const PIPELINE_RE = /^ingest\/pipelines\/([^/]+)\//;

// Hardcoded because this hook runs under plain `node` (can't import a .ts
// module) — kept honest by the drift-guard test in
// push-touched-unit-coverage.test.mjs, which reads lib/deliverable/recipes.ts
// as text and asserts these match exactly.
export const RECIPE_KEYS = [
  "new-listing",
  "coming-soon",
  "market-comps",
  "under-contract",
  "just-sold",
  "open-house",
  "price-reduced",
  "agent-brand-intro",
  "agent-launch",
  "sphere-weekly",
  "review-reply",
  "market-pulse",
];
const RECIPE_FILE_RE = /^lib\/deliverable\/recipes\/([a-z-]+)\.(?:ts|ledger\.md)$/;

/** Recipe key if `filePath` is that recipe's own source or its own ledger —
 *  NOT shared.ts/index.ts/*.test.ts (those aren't a single unit's identity). */
export function matchRecipeUnit(filePath) {
  const m = RECIPE_FILE_RE.exec(String(filePath ?? "").replace(/\\/g, "/"));
  if (!m) return null;
  return RECIPE_KEYS.includes(m[1]) ? m[1] : null;
}

export function formatLedgerSummary(name, { enforced, unenforced }) {
  const lines = [`[ledger] ${name} — Enforced (${enforced.length})`];
  for (const e of enforced) lines.push(`  - ${e.claim}`);
  if (unenforced.length === 0) {
    lines.push(`  Unenforced: none — no unenforced claims on record.`);
  } else {
    lines.push(`  Unenforced (${unenforced.length}):`);
    for (const u of unenforced) lines.push(`  - ${u}`);
  }
  return lines.join("\n");
}

export function coldStartNudge(name, ledgerPath) {
  return `No coverage ledger yet for \`${name}\`. If you learn something surprising here, it goes in \`${ledgerPath}\`.`;
}

/** dir name if `filePath` is under ingest/pipelines/<dir>/, else null. */
export function matchPipelineDir(filePath) {
  const m = PIPELINE_RE.exec(String(filePath ?? "").replace(/\\/g, "/"));
  return m ? m[1] : null;
}

export function formatPipelineScope(dir, scope) {
  if (!scope.confirmedTotal && !scope.sourceCeiling) {
    return `[pipeline scope] ${dir} — source_scope not yet researched (see /ops/census).`;
  }
  const lines = [`[pipeline scope] ${dir}`];
  if (scope.confirmedTotal) {
    lines.push(
      `  PULLED: ${scope.confirmedTotal.summary}${scope.confirmedTotal.source ? ` (${scope.confirmedTotal.source})` : ""}`,
    );
  }
  if (scope.sourceCeiling) {
    const cite = [
      scope.sourceCeiling.sourceLabel,
      scope.sourceCeiling.asOf ? `as of ${scope.sourceCeiling.asOf}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(`  AVAILABLE: ${scope.sourceCeiling.summary}${cite ? ` (${cite})` : ""}`);
  } else {
    lines.push(`  AVAILABLE: not yet researched.`);
  }
  return lines.join("\n");
}

/** The whole detect-and-format pipeline. `null` = stay silent (no match, or
 *  matched a dir the registry doesn't know at all). Injectable `registryYaml`,
 *  `ledgerExists`, `readLedger` for testing; the real hook reads the files. */
export function buildAdditionalContext(payload, { registryYaml, ledgerExists, readLedger }) {
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== "string") return null;

  const dir = matchPipelineDir(filePath);
  if (dir) {
    const scope = extractSourceScope(registryYaml, dir);
    if (scope === null) return null; // dir not registered at all — stay silent
    return formatPipelineScope(dir, scope);
  }

  const recipe = matchRecipeUnit(filePath);
  if (recipe) {
    const ledgerPath = `lib/deliverable/recipes/${recipe}.ledger.md`;
    if (!ledgerExists) return coldStartNudge(recipe, ledgerPath);
    return formatLedgerSummary(recipe, parseLedger(readLedger()));
  }

  return null;
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const root = process.cwd();
      const registryPath = resolve(root, "ingest", "cadence_registry.yaml");
      const registryYaml = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : "";
      const recipe = matchRecipeUnit(payload?.tool_input?.file_path);
      let ledgerExists = false;
      let ledgerText = "";
      if (recipe) {
        const ledgerPath = resolve(root, "lib", "deliverable", "recipes", `${recipe}.ledger.md`);
        ledgerExists = existsSync(ledgerPath);
        if (ledgerExists) ledgerText = readFileSync(ledgerPath, "utf8");
      }
      const additionalContext = buildAdditionalContext(payload, {
        registryYaml,
        ledgerExists,
        readLedger: () => ledgerText,
      });
      if (additionalContext) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
          }),
        );
      }
    } catch {
      // fail-open: never wedge on an internal error
    }
    process.exit(0);
  });
  process.stdin.on("error", () => process.exit(0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
