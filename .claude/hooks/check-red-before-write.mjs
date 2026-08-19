#!/usr/bin/env node
// check-red-before-write.mjs — WATCH IT FAIL, AT WRITE TIME (PreToolUse: Edit|Write).
// Spec: docs/superpowers/specs/2026-08-19-writ-guard-trio-design.md (writ-guard-trio B)
//
// check-proof-of-red-on-push.mjs judges the PUSH — after the code exists. This gate
// covers the moment the push gate cannot see: the session writes foo.test.mts, then
// immediately writes foo.mts without ever RUNNING the test. RULE 3.5's "failing test
// first, then green" happens between those two writes or it doesn't happen.
//
// Trigger (deliberately NARROW — RULE 11's habit-tax failure mode, named in the spec):
//   • this session Write-CREATED a test file (Edits to existing tests don't count), AND
//   • the file now being written is its basename-matched sibling implementation, AND
//   • no line in the transcript family shows that test's basename + a red marker.
// Everything else passes silently. Impl-before-test stays the push gate's job.
//
// Identity + red definitions are IMPORTED from the push gate (one root, no drift).
// Escape: operator types `approve tdd-write` → single-use token → session-wide bypass.
// Fail OPEN on every parse/IO/import error.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isTestFile, basenameKey, hasRedMarker } from "./check-proof-of-red-on-push.mjs";
import { collectCalls } from "./check-playbook-read-before-email-edit.mjs";
import { familyShowsLine } from "./read-evidence.mjs";
import { consumeToken } from "./lib/approval-token.mjs";

const BANNER = "=".repeat(72);
const STATE_DIR = ".claude/hooks/.state";

/** Only real code counts as an implementation target — docs/config never block. */
const CODE_EXT = /\.(m?[jt]sx?|mts|cts|py)$/i;

/** Test files this session CREATED via Write (the git-status-A analog, live). */
export function sessionTestWrites(calls) {
  return (calls || [])
    .filter((c) => String(c.name) === "Write" && isTestFile(c.input?.file_path))
    .map((c) => String(c.input.file_path).replace(/\\/g, "/"));
}

/**
 * If `implPath` is the basename-matched implementation of a session-written test,
 * return that test path; else null.
 */
export function pendingRedTarget(implPath, testWrites) {
  const path = String(implPath || "").replace(/\\/g, "/");
  if (!path || isTestFile(path) || !CODE_EXT.test(path)) return null;
  const key = basenameKey(path);
  if (!key) return null;
  return (testWrites || []).find((t) => basenameKey(t) === key) || null;
}

function sessionFlag(sessionId) {
  return join(STATE_DIR, `tdd-write-${String(sessionId || "unknown").slice(0, 64)}.ok`);
}

function main(raw) {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }
  const input = payload.tool_input || {};

  let target = null;
  try {
    if (existsSync(sessionFlag(payload.session_id))) process.exit(0);

    const tp = payload.transcript_path;
    if (!tp) process.exit(0);
    const calls = collectCalls(readFileSync(tp, "utf8").split("\n"));
    target = pendingRedTarget(input.file_path, sessionTestWrites(calls));
    if (!target) process.exit(0);

    const key = basenameKey(target).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyRe = new RegExp(key, "i");
    if (familyShowsLine(tp, (line) => keyRe.test(line) && hasRedMarker(line))) process.exit(0);
  } catch {
    process.exit(0); // fail open — a broken gate must never wedge a write
  }

  // Blocked. A consumed tdd-write token stands the gate down for the session.
  try {
    const r = consumeToken("tdd-write");
    if (r.ok) {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(sessionFlag(payload.session_id), new Date().toISOString());
      process.stderr.write(
        "⚠️  red-before-write: tdd-write token consumed — bypassed for this session\n",
      );
      process.exit(0);
    }
  } catch {
    /* token machinery broke — the block below still stands */
  }

  const msg =
    `\n${BANNER}\n` +
    `WRITE BLOCKED — the test was written but never RUN\n` +
    `${BANNER}\n` +
    `This session created ${target}\n` +
    `and is now writing ${input.file_path} without that test ever failing.\n\n` +
    `RULE 3.5: the failing test comes FIRST — and "first" means RUN, not written.\n` +
    `A test that has never been red proves only that it compiles. Run it now:\n` +
    `  node --test ${target}   (or bun test)\n` +
    `watch it FAIL, then write the implementation and watch it pass.\n\n` +
    `Genuinely not the TDD flow? The operator can type:  approve tdd-write\n` +
    `(single-use token; stands this gate down for the session)\n` +
    `${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
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
