#!/usr/bin/env node
// check-proof-of-red-on-push.mjs — TDD's PROOF-OF-RED, ENFORCED (PreToolUse: Bash).
//
// Piece 3a of the plan approved 08/18/2026 ("THIS IS ALL A FUCKING LIE" session).
// Spec: docs/superpowers/specs/2026-08-18-agent-guard-hooks-design.md
//
// RULE 3.5 has demanded "the failing test named for its failure mode first, then green"
// since 07/20/2026 — and nothing has ever MEASURED it. A test born green proves only that
// it compiles: the cell-policy fleet test earned trust the honest way (chrome edit stashed
// → 2 fail → restored → 0 fail), and this gate makes that the floor for every new test.
//
// Trigger:  a push whose commits ahead of upstream ADD a new test file.
// Require:  somewhere in this session's transcript family (parent + recent siblings —
//           subagent-driven TDD runs its suites in subagent transcripts), a tool-result
//           line carries that test file's basename AND a red marker (`N fail` with N>=1,
//           `not ok`, ✗/✖, AssertionError, pytest FAILED).
// Block:    exit 2 when any new test file has no red evidence.
// Escape:   ALLOW_NO_RED_PROOF=1 — for tests genuinely proven red in a PRIOR session
//           (transcripts rotate). Hoisted from the push command prefix: a PreToolUse hook
//           runs in the harness env, so an `ALLOW_X=1 git push` prefix is invisible to
//           process.env — the 5f628bbc lesson, mirrored here.
//
// Fail OPEN on every parse/IO/git error — a broken hook must never wedge a push.

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolvePushCwd } from "./push-context.mjs";
import { familyShowsLine } from "./read-evidence.mjs";

const BANNER = "=".repeat(72);

export function isGitPush(cmd) {
  return /(^|\s|&&|;|\|\|)\s*git\s+push(\s|$)/.test(cmd) || /safe-push(\.mjs)?\b/.test(cmd);
}

/** A path that IS a test file. */
export function isTestFile(p) {
  const path = String(p || "").replace(/\\/g, "/");
  return (
    /\.(test|spec)\.[a-z]+$/i.test(path) ||
    /(^|\/)__tests__\//i.test(path) ||
    /(^|\/)test_[^/]+\.py$/i.test(path)
  );
}

/**
 * A RED marker in test output. "0 fail" is bun's routine green summary — only a count
 * >= 1 is red. Markers cover bun (`N fail`, ✗), node:test (`not ok`, ✖, AssertionError),
 * and pytest (`FAILED path::test`).
 */
export function hasRedMarker(text) {
  const t = String(text || "");
  if (/\b[1-9]\d*\s+fail(ed|ing|ures?)?\b/i.test(t)) return true;
  if (/\bnot ok\b/.test(t)) return true;
  if (/[✗✖]/.test(t)) return true;
  if (/\bAssertionError\b/.test(t)) return true;
  if (/\bFAILED\s+\S+::/.test(t)) return true;
  return false;
}

/**
 * The identity a red line must carry: the test file's basename without extensions
 * (`cell-policy` from `lib/deliverable/cell-policy.test.ts`). Suite output prints file
 * names next to failures in bun/node:test/pytest, so basename+red on one transcript line
 * ties the red to THIS file rather than to any failure anywhere.
 */
export function basenameKey(p) {
  const path = String(p || "").replace(/\\/g, "/");
  const base = path.split("/").pop() || "";
  return base.replace(/\.(test|spec)\.[a-z]+$/i, "").replace(/\.[a-z]+$/i, "");
}

/** Pure verdict: which of the new test files have NO red evidence line? */
export function unprovenFiles(newTestFiles, lineHasEvidence) {
  return (newTestFiles || []).filter((f) => {
    const key = basenameKey(f);
    if (!key) return false; // no usable identity — never block on it
    return !lineHasEvidence(key);
  });
}

let REPO_CWD = process.cwd();
function sh(c) {
  return execSync(c, { stdio: ["ignore", "pipe", "ignore"], cwd: REPO_CWD })
    .toString()
    .trim();
}

function main(raw) {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // not our shape
  }
  const cmd = String(payload?.tool_input?.command ?? "");
  if (!isGitPush(cmd)) process.exit(0);

  // ESCAPE-PREFIX HOIST (see header). Leading env-assignment position only.
  for (const m of cmd.matchAll(/(?:^|\s)((?:ALLOW_[A-Z_]+|OPERATOR_[A-Z_]+))=(\S+)/g)) {
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
  if (process.env.ALLOW_NO_RED_PROOF === "1") {
    process.stderr.write("⚠️  proof-of-red gate OVERRIDDEN (ALLOW_NO_RED_PROOF=1)\n");
    process.exit(0);
  }

  REPO_CWD = resolvePushCwd(payload);

  let base = "";
  try {
    base = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
  } catch {
    try {
      sh("git rev-parse --verify origin/main");
      base = "origin/main";
    } catch {
      process.exit(0); // can't enforce — allow
    }
  }

  let newTests = [];
  try {
    if (sh(`git rev-list --count ${base}..HEAD`) === "0") process.exit(0);
    newTests = sh(`git diff --name-status ${base}..HEAD`)
      .split("\n")
      .map((l) => l.split("\t"))
      .filter((parts) => parts[0] === "A" && isTestFile(parts[1]))
      .map((parts) => parts[1]);
  } catch {
    process.exit(0); // can't read git state — fail open
  }
  if (newTests.length === 0) process.exit(0);

  const tp = payload.transcript_path;
  if (!tp) process.exit(0); // no transcript to judge against — fail open

  // One family pass per file identity: a line is evidence when it carries the basename
  // AND a red marker. Tool-result lines are where suite output lives; requiring both on
  // one line keeps narration ("I will make it fail") from counting.
  const lineHasEvidence = (key) => {
    const keyRe = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    let found = false;
    try {
      found = familyShowsLine(tp, (line) => keyRe.test(line) && hasRedMarker(line));
    } catch {
      return true; // evidence machinery broke — fail open for this file
    }
    return found;
  };

  const unproven = unprovenFiles(newTests, lineHasEvidence);
  if (unproven.length === 0) {
    process.stderr.write(
      `✅ proof-of-red: ${newTests.length} new test file(s) seen red this session\n`,
    );
    process.exit(0);
  }

  const msg =
    `\n${BANNER}\n` +
    `PUSH BLOCKED — new test file(s) never seen RED\n` +
    `${BANNER}\n` +
    `This push adds test files with no red run anywhere in this session:\n` +
    unproven.map((f) => `  ${f}`).join("\n") +
    `\n\nRULE 3.5 (locked 07/20/2026): the failing test comes FIRST. A test born green\n` +
    `proves only that it compiles. Prove each one the way the cell-policy fleet test\n` +
    `was proven: stash/disable the code under test, run the suite, watch it FAIL,\n` +
    `restore, watch it pass — the red output must appear in this session's transcript.\n\n` +
    `Proven red in a PRIOR session (transcripts rotate)? Escape, on the record:\n` +
    `  ALLOW_NO_RED_PROOF=1 <your push command>\n` +
    `${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

// Windows: argv[1] is `C:\…` while import.meta.url is `file:///C:/…` — raw comparison
// never matches and the gate ships as a silent no-op (the ce163255 defect).
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
