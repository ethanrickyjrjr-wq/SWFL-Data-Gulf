#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks `git push` when a commit ahead of
// upstream adds defer-language to SESSION_LOG.md (e.g. "deferred", "parked",
// "CONFIRM-DEFER") without also naming a checks-ledger key in the same text.
//
// CLAUDE.md RULE 2.4 (locked 07/07/2026): a deferred finding must become a
// `checks` entry the same session it's found — a SESSION_LOG sentence alone
// is not deferral, it's forgetting on a delay. This hook enforces the shape
// of that rule (does the entry name a check?), the same way
// check-session-log-on-push.mjs enforces "was SESSION_LOG touched at all" —
// neither hook verifies the check actually exists live; that's what
// `node scripts/check.mjs list` and check-close evidence are for.
//
// Escape hatch: ALLOW_DEFER_WITHOUT_CHECK=1 (matches the ALLOW_* pattern used
// by the other pre-push gates in this repo).

import { execSync } from "node:child_process";

const DEFER_RE =
  /\bdefer(?:red|ral)?\b|\bparked\b|CONFIRM-DEFER|graduation-time work|not (?:fixed|resolved|addressed) here|leaving? for later|\bpunted?\b/i;
const CHECK_WORD_RE = /\bchecks?\b/i;
const CHECK_KEY_RE = /`[a-z][a-z0-9_]{3,}`/;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // not our shape, don't interfere
  }
  const cmd = String(payload?.tool_input?.command ?? "");
  if (!isGitPush(cmd)) {
    process.exit(0);
  }
  if (process.env.ALLOW_DEFER_WITHOUT_CHECK === "1") {
    process.exit(0);
  }

  let base = "";
  try {
    base = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
  } catch {
    try {
      sh("git rev-parse --verify origin/main");
      base = "origin/main";
    } catch {
      process.exit(0); // no upstream and no origin/main — can't enforce
    }
  }

  let ahead = "";
  try {
    ahead = sh(`git rev-list --count ${base}..HEAD`);
  } catch {
    process.exit(0);
  }
  if (ahead === "0") {
    process.exit(0);
  }

  // Only the ADDED lines of SESSION_LOG.md across the commits being pushed —
  // context/unchanged lines shouldn't trip this (a prior entry's old defer
  // language isn't this push's problem).
  let diff = "";
  try {
    diff = sh(`git diff ${base}..HEAD -- SESSION_LOG.md`);
  } catch {
    process.exit(0);
  }
  const addedLines = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
  const addedText = addedLines.join("\n");

  if (!addedText.trim()) {
    process.exit(0); // SESSION_LOG.md not touched — check-session-log-on-push.mjs owns that gate
  }

  const deferMatch = addedText.match(DEFER_RE);
  if (!deferMatch) {
    process.exit(0); // no defer-language in what's being added — nothing to enforce
  }

  const hasCheckReference = CHECK_WORD_RE.test(addedText) && CHECK_KEY_RE.test(addedText);
  if (hasCheckReference) {
    process.exit(0); // defer-language present, but a check key is named alongside it — good
  }

  // Block.
  const contextLine = addedLines.find((l) => DEFER_RE.test(l)) ?? deferMatch[0];
  const banner = "=".repeat(72);
  const msg =
    `\n${banner}\n` +
    `PUSH BLOCKED — deferral in SESSION_LOG.md with no checks-ledger entry\n` +
    `${banner}\n` +
    `The SESSION_LOG text you're pushing contains defer-language:\n\n` +
    `  "${contextLine.trim().slice(0, 200)}"\n\n` +
    `RULE 2.4: a deferred/parked finding must become a \`checks\` entry the\n` +
    `same session it's found — a SESSION_LOG sentence alone is not deferral,\n` +
    `it's forgetting on a delay (see the 07/07/2026 condo-grain postmortem).\n\n` +
    `Fix: run \`node scripts/check.mjs open <project> <key> "<label>"\` for the\n` +
    `finding, then mention the check key (in backticks) in the SESSION_LOG\n` +
    `entry so this gate can see it — e.g. "opened check \\\`some_key\\\`".\n\n` +
    `If this really isn't a deferral (false positive on the wording), rerun\n` +
    `with ALLOW_DEFER_WITHOUT_CHECK=1 set.\n` +
    `${banner}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
});

function isGitPush(cmd) {
  return /(^|\s|&&|;|\|\|)\s*git\s+push(\s|$)/.test(cmd) || /safe-push(\.mjs)?\b/.test(cmd);
}

function sh(c) {
  return execSync(c, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}
