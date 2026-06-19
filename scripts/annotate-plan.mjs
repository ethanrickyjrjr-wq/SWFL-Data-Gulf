#!/usr/bin/env node
/**
 * Retroactive plan annotator — adds conflict-group color badges + model
 * recommendation to existing plan files.
 *
 * Usage:
 *   node scripts/annotate-plan.mjs docs/superpowers/plans/YYYY-MM-DD-foo.md
 *   node scripts/annotate-plan.mjs docs/superpowers/plans/   # annotate all (recurses)
 *   node scripts/annotate-plan.mjs                           # annotate all known plan dirs
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const hookPath = fileURLToPath(new URL("../.claude/hooks/annotate-plan.mjs", import.meta.url));

const PLAN_ROOTS = ["docs/superpowers/plans", "FINAL BOSS"];

function collectMdFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "_FINISHED") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectMdFiles(full));
    else if (entry.name.endsWith(".md")) results.push(full);
  }
  return results;
}

const target = process.argv[2];
let files;

if (!target) {
  // No arg — annotate all known plan roots
  files = PLAN_ROOTS.flatMap((r) => {
    const abs = path.resolve(process.cwd(), r);
    return fs.existsSync(abs) ? collectMdFiles(abs) : [];
  });
} else {
  const abs = path.resolve(process.cwd(), target);
  const stat = fs.statSync(abs, { throwIfNoEntry: false });
  if (!stat) {
    process.stderr.write(`Not found: ${target}\n`);
    process.exit(1);
  }
  files = stat.isDirectory() ? collectMdFiles(abs) : [abs];
}

let annotated = 0;
let skipped = 0;
for (const f of files) {
  const result = execFileSync(process.execPath, [hookPath, f], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.startsWith("✓")) {
    process.stdout.write(result);
    annotated++;
  } else skipped++;
}
process.stdout.write(`\nDone — ${annotated} annotated, ${skipped} unchanged.\n`);
