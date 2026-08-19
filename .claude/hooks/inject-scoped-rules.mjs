#!/usr/bin/env node
// inject-scoped-rules.mjs — THE RULE ARRIVES AT THE MATCHING WRITE (PreToolUse:
// Edit|Write; writ-guard-trio C). Spec: docs/superpowers/specs/2026-08-19-writ-guard-trio-design.md
//
// Writ's strongest idea (evaluated 08/18/2026): "the search fires on what is happening,
// not what you typed." A rule about ZIP grain surfaces when the agent WRITES a file
// containing zip_code — whether or not anyone said "ZIP". This is step two of the 08/18
// rules diet: rules leave the always-loaded file and arrive scoped to the action.
//
// NOT the topic router inject-focus.mjs rejects — that misfire class keys on PROMPT
// words; this requires governed path AND written content to both match (lib/scoped-rules.mjs).
//
// CONTRACT: this hook NEVER blocks. Sole exit code is 0; stdout becomes hook context
// (the same plain-stdout channel the graphify guard uses). Once per rule per session,
// deduped through a state file keyed by session_id. Every failure path: exit 0.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { matchScopedRules } from "./lib/scoped-rules.mjs";

const STATE_DIR = ".claude/hooks/.state";

function statePath(sessionId) {
  return join(STATE_DIR, `scoped-rules-${String(sessionId || "unknown").slice(0, 64)}.json`);
}

function loadFired(sessionId) {
  try {
    return new Set(JSON.parse(readFileSync(statePath(sessionId), "utf8")));
  } catch {
    return new Set();
  }
}

function saveFired(sessionId, fired) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(statePath(sessionId), JSON.stringify([...fired]));
  } catch {
    /* state loss just means a repeat reminder — never worth failing over */
  }
}

function main(raw) {
  try {
    const payload = JSON.parse(raw || "{}");
    const input = payload.tool_input || {};
    const text = input.content ?? input.new_string ?? "";
    const fired = loadFired(payload.session_id);
    const matches = matchScopedRules(input.file_path, text, fired);
    if (matches.length === 0) process.exit(0);

    for (const r of matches) fired.add(r.id);
    saveFired(payload.session_id, fired);

    process.stdout.write(
      `[scoped-rules] Rules that govern this write (shown once per session):\n` +
        matches.map((r) => `  • ${r.text}`).join("\n") +
        `\n`,
    );
  } catch {
    /* fail open */
  }
  process.exit(0); // NEVER blocks — that is the injector contract
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => main(raw));
}
