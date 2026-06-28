#!/usr/bin/env node
// Create a new build spec stub + open the corresponding check in one command.
// Usage: node scripts/new-build.mjs <slug> "<label>"
// Example: node scripts/new-build.mjs zip-report-rebuild "Rich /r/zip-report page"

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const [, , slug, ...rest] = process.argv;
const label = rest.join(" ").replace(/^"|"$/g, "");

if (!slug || !label) {
  console.error('Usage: node scripts/new-build.mjs <slug> "<label>"');
  console.error('Example: node scripts/new-build.mjs zip-report-rebuild "Rich /r/zip-report page"');
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("Slug must be lowercase letters, numbers, and hyphens only.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const specPath = resolve(ROOT, `docs/superpowers/specs/${today}-${slug}-design.md`);

if (existsSync(specPath)) {
  console.error(`Spec already exists: ${specPath}`);
  process.exit(1);
}

const stub = [
  `# ${label}`,
  "",
  `**Date:** ${today}`,
  "",
  "## Problem",
  "",
  "## Goal",
  "",
  "## What we're building",
  "",
].join("\n");

writeFileSync(specPath, stub);
console.log(`Created: ${specPath}`);

// Open check — uses the same check.mjs pattern already in the project
const checkKey = `${slug.replace(/-/g, "_")}_live_verify`;
try {
  execSync(`node scripts/check.mjs open brain-platform ${checkKey} "${label} live-verify"`, {
    cwd: ROOT,
    stdio: "inherit",
  });
} catch {
  console.error(`Warning: check '${checkKey}' may already exist or creds unavailable.`);
}
