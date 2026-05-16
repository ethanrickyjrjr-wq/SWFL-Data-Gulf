#!/usr/bin/env node
import { statSync } from "node:fs";
import { resolve } from "node:path";

const MAX_AGE_HOURS = 4;
const CONTEXT_PATH = resolve(process.cwd(), ".claude", "build-context.md");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let stat;
  try {
    stat = statSync(CONTEXT_PATH);
  } catch {
    fail(
      `MISSING: .claude/build-context.md does not exist.\n` +
        `  → Populate it with the intake for this session before doing work.\n` +
        `  → Template hint: goal, scope boundary, success test, files in play.`,
    );
    return;
  }

  const ageMs = Date.now() - stat.mtimeMs;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > MAX_AGE_HOURS) {
    fail(
      `STALE: .claude/build-context.md is ${ageHours.toFixed(1)}h old ` +
        `(max ${MAX_AGE_HOURS}h).\n` +
        `  → Refresh it for this session before doing work.\n` +
        `  → Stale intake = drift; rewrite, don't just touch.`,
    );
    return;
  }

  process.stdout.write(
    `[build-context] OK · .claude/build-context.md fresh ` +
      `(${ageHours.toFixed(1)}h old, limit ${MAX_AGE_HOURS}h).\n`,
  );
});

function fail(msg) {
  const banner = "=".repeat(72);
  const out =
    `\n${banner}\n` +
    `BUILD-CONTEXT GATE FAILED\n` +
    `${banner}\n` +
    `${msg}\n` +
    `${banner}\n`;
  process.stdout.write(out);
  process.stderr.write(out);
  process.exit(2);
}
