#!/usr/bin/env node
// Create a new build spec stub + open the corresponding check in one command.
// Usage: node scripts/new-build.mjs <slug> "<label>" [--signal '<json>']
// Example: node scripts/new-build.mjs zip-report-rebuild "Rich /r/zip-report page" \
//            --signal '{"type":"http_ok","url":"https://www.swfldatagulf.com/r/zip-report/33904"}'
//
// WHY --signal EXISTS HERE (added 08/06/2026). This script is the single largest
// producer of `verify`-class checks: RULE 3.5 mandates running it before every build, so
// every build mints a `<slug>_live_verify` row. Measured that morning: 125 verify-class
// checks open, 251 `*_live_verify` rows created ever, and NOT ONE of them carries a
// signal — because this file never offered a way to attach one. A signal-less check is
// closeable only by a human typing `check.mjs close <key>`, which is why
// `scripts/check-sweep.mjs` (the automatic closer) can act on 0 of 879 open rows and the
// ledger has never had a net-negative day.
//
// A live-verify check is the MOST signal-able class there is — the build has a surface,
// and the surface either serves the thing or it doesn't. Passing --signal at open time
// makes the row machine-closeable forever, for free, and `reverify-signals.mjs` reopens
// it if the surface regresses.
//
// DELIBERATELY NOT DEFAULTED. This script cannot guess a discriminating assertion, and a
// too-loose signal that also matches a fallback/soft-404 body closes a BROKEN thing and
// never self-heals (reverify only reopens on FAIL). Read
// `.claude/skills/check-signal/SKILL.md` before writing one. No signal is an honest
// outcome — you just get told, loudly, what it costs.

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const [, , slug, ...rest] = process.argv;

// Pull --signal '<json>' out before the remainder becomes the label, so a signal can
// never be silently swallowed into the human-readable text.
let signal = null;
const labelParts = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--signal") {
    signal = rest[++i];
    if (!signal) {
      console.error("--signal needs a JSON value");
      process.exit(1);
    }
    continue;
  }
  labelParts.push(rest[i]);
}
const label = labelParts.join(" ").replace(/^"|"$/g, "");

// Fail at THIS boundary, before a spec file is written, rather than letting check.mjs
// reject the signal after the stub already exists on disk.
if (signal !== null) {
  let parsed;
  try {
    parsed = JSON.parse(signal);
  } catch (e) {
    console.error(`--signal is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.type) {
    console.error("--signal JSON must be an object with a `type`");
    process.exit(1);
  }
}

if (!slug || !label) {
  console.error("Usage: node scripts/new-build.mjs <slug> \"<label>\" [--signal '<json>']");
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
const signalArg = signal ? ` --signal ${JSON.stringify(signal)}` : "";
try {
  execSync(
    `node scripts/check.mjs open brain-platform ${checkKey} "${label} live-verify"${signalArg}`,
    { cwd: ROOT, stdio: "inherit" },
  );
} catch {
  console.error(`Warning: check '${checkKey}' may already exist or creds unavailable.`);
}

// Say the cost out loud. Silence here is what produced 251 signal-less live-verify rows.
if (!signal) {
  console.log("");
  console.log(`NOTE: ${checkKey} has NO signal — it can only ever be closed by a human`);
  console.log("      typing `node scripts/check.mjs close`. The daily auto-closer");
  console.log("      (scripts/check-sweep.mjs) cannot touch it. Attach one when the");
  console.log("      surface is live and you know what proves it:");
  console.log("");
  console.log(
    `      node scripts/check.mjs update ${checkKey} --signal '{"type":"http_body","url":"<url>","contains":"<phrase only the working surface emits>"}'`,
  );
  console.log("");
  console.log("      Signal types + the false-pass traps: .claude/skills/check-signal/SKILL.md");
}
