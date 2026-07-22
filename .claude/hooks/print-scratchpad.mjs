#!/usr/bin/env node
// SessionStart hook — prints the open scratchpad items.
//
// WHY THIS EXISTS. RULE 2.0 says "read _ASSISTANT/SCRATCHPAD.md at session start
// alongside TODAY.md." Until 07/22/2026 that was a rule with no mechanism: the five
// registered SessionStart printers were session-log, kickoff, desk-status,
// closeable-checks and tripwire — the scratchpad was not among them. SESSION_LOG.md
// had BOTH halves wired (this printer's sibling reads it, check-session-log-on-push
// blocks a push without it); the scratchpad, whose entire purpose is that Ricky never
// types an issue twice, had neither. Operator, 07/22: "are we reading session logs and
// writing them or just reading scratchpads???"
//
// Fails SOFT by construction. A missing or malformed scratchpad prints nothing and
// exits 0 — a session-start printer that throws breaks every session opening, which
// is worse than the gap it closes. The parse is in lib/scratchpad-parse.mjs and is
// covered by lib/scratchpad-parse.test.mjs (runs in CI).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderDigest } from "./lib/scratchpad-parse.mjs";

const PATH = resolve(process.cwd(), "_ASSISTANT/SCRATCHPAD.md");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let text = "";
  try {
    text = readFileSync(PATH, "utf8");
  } catch {
    process.exit(0); // no scratchpad in this repo/worktree — nothing to say
  }

  try {
    const digest = renderDigest(text);
    if (digest) process.stdout.write(digest);
  } catch {
    // Never let a parse bug wedge session start.
  }
  process.exit(0);
});
