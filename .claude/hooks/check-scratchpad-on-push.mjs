#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks `git push` when _ASSISTANT/SCRATCHPAD.md
// is dirty in the working tree — modified or staged, but not committed.
//
// WHY THIS EXISTS, measured not assumed. At the start of the 07/22/2026 session the
// scratchpad had 68 UNCOMMITTED lines in it, written by the prior session and never
// pushed. The rule (RULE 2.0) says every operator gripe goes in the scratchpad the
// moment it is raised; nothing made those writes survive the session that made them.
// An entry that dies in the working tree is worse than no entry — the next session
// reads the committed file, sees nothing, and the operator types it a second time.
//
// This is the WRITE half. print-scratchpad.mjs is the READ half. Together they give
// the scratchpad the same two-sided wiring SESSION_LOG.md has had all along
// (print-session-log.mjs + check-session-log-on-push.mjs).
//
// DELIBERATELY A SEPARATE HOOK, not another gate inside check-prepush-gate.mjs:
// that file already carries an unpushed Gate 3 from a parallel session, and
// check-session-log-on-push.mjs sets the precedent that a single-file push lock
// lives on its own. Same exit contract as both: 0 = allow, 2 = block.
//
// Override: ALLOW_DIRTY_SCRATCHPAD=1 (logged). Escape hatches are mandatory here —
// a push lock with no override is how a broken hook wedges every push.

import { execSync } from "node:child_process";
import { resolvePushCwd } from "./push-context.mjs";

const TARGET = "_ASSISTANT/SCRATCHPAD.md";

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
  if (!isGitPush(cmd)) process.exit(0);

  if (process.env.ALLOW_DIRTY_SCRATCHPAD === "1") {
    process.stderr.write("[scratchpad gate] overridden via ALLOW_DIRTY_SCRATCHPAD=1\n");
    process.exit(0);
  }

  REPO_CWD = resolvePushCwd(payload);

  // SCOPE GUARD — same idiom as check-prepush-gate.mjs (added there 07/19/2026 after
  // this hook family crashed fail-CLOSED on ops-repo pushes and wedged them). A pure
  // tree lookup: succeeds for brain-platform and its RULE-1.5 worktrees, throws for
  // any other repo pushed from the same session.
  try {
    sh("git cat-file -e HEAD:refinery/packs/catalog.mts");
  } catch {
    process.exit(0); // foreign repo — this gate does not apply
  }

  // Dirty = modified, staged, or both. `--porcelain` prints nothing when clean.
  let dirty = "";
  try {
    dirty = sh(`git status --porcelain -- ${TARGET}`);
  } catch {
    process.exit(0); // git quirk — allow, never wedge a push on our own failure
  }
  if (!dirty.trim()) process.exit(0);

  const banner = "=".repeat(72);
  const msg =
    `\n${banner}\n` +
    `PUSH BLOCKED — ${TARGET} has uncommitted changes\n` +
    `${banner}\n` +
    `git status: ${dirty.trim()}\n\n` +
    `The scratchpad exists so the operator never types the same issue twice.\n` +
    `An entry left in the working tree does not survive this session — the next\n` +
    `one reads the committed file, sees nothing, and he retypes it. That already\n` +
    `happened: 68 uncommitted lines were found sitting there on 07/22/2026.\n\n` +
    `Commit it with this push:\n` +
    `  git add ${TARGET} && git commit -m "docs(scratchpad): <what was raised>"\n\n` +
    `Override (only if the change genuinely should not ship):\n` +
    `  ALLOW_DIRTY_SCRATCHPAD=1\n` +
    `${banner}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
});

function isGitPush(cmd) {
  // Mirrors check-session-log-on-push.mjs: match the token boundary, and match the
  // mandated safe-push wrapper too — it runs `git push` in a child process that a
  // Bash PreToolUse hook cannot intercept.
  return /(^|\s|&&|;|\|\|)\s*git\s+push(\s|$)/.test(cmd) || /safe-push(\.mjs)?\b/.test(cmd);
}

// Set from the push command itself — a worktree push checks THAT repo's scratchpad
// state, not the main checkout's (see push-context.mjs).
let REPO_CWD = process.cwd();

function sh(c) {
  return execSync(c, { stdio: ["ignore", "pipe", "ignore"], cwd: REPO_CWD })
    .toString()
    .trim();
}
