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

// PostToolUse's tool_input.file_path is NOT guaranteed repo-relative — Claude
// Code's own docs example shows an absolute file_path, and check-odd-surface.mjs
// / annotate-plan.mjs already defensively path.resolve() for the same reason.
// A raw `^`-anchored regex against the unresolved string would go silently
// dead on an absolute payload. So: resolve to an absolute, forward-slashed
// path first, then find the marker segment by substring search (mirroring
// check-odd-surface.mjs's onOddSurface), and slice out whatever comes after
// it. On Windows the marker SEARCH is done case-insensitively (matching
// check-odd-surface.mjs's WIN-lowercase convention — Windows paths are
// case-insensitive) but the slice comes out of the ORIGINAL (non-lowercased)
// string, because the extracted substring is used downstream as a real lookup
// key (extractSourceScope's `dir`, RECIPE_KEYS membership, a constructed
// ledger path) and must keep its real casing.
const WIN = process.platform === "win32";
const PIPELINE_MARKER = "/ingest/pipelines/";
const RECIPE_MARKER = "/lib/deliverable/recipes/";
const RECIPE_FILENAME_RE = /^([a-z-]+)\.(?:ts|ledger\.md)$/;

/** Resolve `filePath` (relative or absolute, either slash style) to an
 *  absolute, forward-slashed path. `null` on non-string input or a resolve
 *  failure — callers treat that as "no match" (fail-open, never throw). */
function absForwardSlashed(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  try {
    // Normalize backslashes to "/" UNCONDITIONALLY — never via the OS-specific
    // `sep`. A git hook can receive a Windows-style path on a Linux runner (and
    // vice versa); splitting on `sep` only touches the runtime OS's separator, so
    // the other style's backslashes survive and the forward-slashed markers below
    // never match. That passed on Windows dev boxes but failed on Linux CI —
    // matchPipelineDir/matchRecipeUnit returned null for Windows-style inputs
    // (07/17/2026).
    return resolve(process.cwd(), filePath).replace(/\\/g, "/");
  } catch {
    return null;
  }
}

/** Find `marker` in `norm` (case-insensitively on Windows) and return
 *  everything after it, sliced from the ORIGINAL (case-preserved) string.
 *  `null` if the marker isn't present. */
function afterMarker(norm, marker) {
  const cmp = WIN ? norm.toLowerCase() : norm;
  const idx = cmp.indexOf(marker);
  return idx === -1 ? null : norm.slice(idx + marker.length);
}

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
/** Recipe key if `filePath` is that recipe's own source or its own ledger —
 *  NOT shared.ts/index.ts/*.test.ts (those aren't a single unit's identity).
 *  Matched on the resolved ABSOLUTE path — see the note above WIN/afterMarker. */
export function matchRecipeUnit(filePath) {
  const norm = absForwardSlashed(filePath);
  if (norm === null) return null;
  const rest = afterMarker(norm, RECIPE_MARKER);
  if (rest === null) return null;
  // Anchored to the END of `rest`: this must be the recipe's own file
  // directly under recipes/, not something nested deeper (rest containing a
  // "/" can never match [a-z-]+, so a nested path is correctly rejected).
  const m = RECIPE_FILENAME_RE.exec(rest);
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

/** dir name if `filePath` is under ingest/pipelines/<dir>/, else null. Matched
 *  on the resolved ABSOLUTE path — see the note above WIN/afterMarker. */
export function matchPipelineDir(filePath) {
  const norm = absForwardSlashed(filePath);
  if (norm === null) return null;
  const rest = afterMarker(norm, PIPELINE_MARKER);
  if (rest === null) return null;
  // Require a file segment after the dir (a real Edit/Write touch always
  // targets a file, never the bare directory) — matches the old regex's own
  // trailing `\/` requirement.
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;
  const dir = rest.slice(0, slashIdx);
  return dir.length > 0 ? dir : null;
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
