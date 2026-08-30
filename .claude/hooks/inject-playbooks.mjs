#!/usr/bin/env node
// inject-playbooks.mjs — UserPromptSubmit: the per-task-type playbook index.
// Spec: docs/superpowers/specs/2026-08-30-playbooks-per-task-type-design.md
// Logic + contract live in lib/playbooks.mjs (tested there). This file is the pipe.
//
// CONTRACT (same as inject-focus.mjs): exit 0 always; stdout JSON with
// hookSpecificOutput.additionalContext; static per prompt (safe for resume replay);
// no network, no DB; fail-open — a broken hook never wedges a prompt.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHookOutput } from "./lib/playbooks.mjs";

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      process.stdout.write(JSON.stringify(buildHookOutput()));
    } catch {
      /* fail-open */
    }
    process.exit(0);
  });
  process.stdin.on("error", () => process.exit(0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
