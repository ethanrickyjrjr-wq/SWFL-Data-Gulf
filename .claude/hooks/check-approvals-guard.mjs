#!/usr/bin/env node
// check-approvals-guard.mjs — THE TOKEN VAULT DOOR (PreToolUse: Edit|Write|Bash).
// Spec: docs/superpowers/specs/2026-08-19-writ-guard-trio-design.md (writ-guard-trio A)
//
// The approval-token mechanism is only human-only if the agent cannot reach in and mint,
// edit, or read tokens through the ordinary tool surface. This hook refuses:
//   • Edit/Write into .claude/approvals/ or to the three mechanism files
//     (minter, token lib, this guard) — weakening the lock IS the attack.
//   • Bash that touches the approvals dir or executes the minter/lib directly.
// Their .test.mjs files stay editable and runnable — the suite is not the hazard.
//
// Escape (maintenance IS legitimate): the operator types `approve guard-edit` — the
// consumed token flips a session-scoped flag and this guard stands down for the session.
//
// HONEST LIMIT (same as Writ's): cooperative-agent protection. eval / var-assembled
// paths / heredoc smuggling are not caught; they are documented, not glossed.
// Fail OPEN on every parse/IO error — a broken guard must never wedge the session.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { consumeToken } from "./lib/approval-token.mjs";

const BANNER = "=".repeat(72);
const STATE_DIR = ".claude/hooks/.state";

/** Paths the agent may not Edit/Write: the token store + the mechanism, tests exempt. */
export function isProtectedWritePath(p) {
  const path = String(p || "").replace(/\\/g, "/");
  if (!path) return false;
  if (/\.test\.mjs$/i.test(path)) return false;
  if (/(^|\/)\.claude\/approvals(\/|$)/i.test(path)) return true;
  return /(mint-approval-on-prompt|approval-token|check-approvals-guard)\.mjs$/i.test(path);
}

/** Bash that reaches the token store or executes the mechanism directly. */
export function bashTouchesApprovals(cmd) {
  const c = String(cmd || "");
  if (/\.claude[\/\\]approvals/i.test(c)) return true;
  return /(mint-approval-on-prompt|approval-token)\.mjs\b/i.test(c);
}

function sessionFlag(sessionId) {
  return join(STATE_DIR, `guard-edit-${String(sessionId || "unknown").slice(0, 64)}.ok`);
}

function main(raw) {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // not our shape — fail open
  }

  const tool = String(payload.tool_name || "");
  const input = payload.tool_input || {};
  let hit = false;
  let what = "";
  try {
    if (tool === "Bash") {
      hit = bashTouchesApprovals(input.command);
      what = "Bash command touching the approval-token mechanism";
    } else {
      hit = isProtectedWritePath(input.file_path);
      what = `write to protected path ${input.file_path}`;
    }
  } catch {
    process.exit(0);
  }
  if (!hit) process.exit(0);

  // Session already unlocked by a consumed guard-edit token?
  try {
    if (existsSync(sessionFlag(payload.session_id))) process.exit(0);
    const r = consumeToken("guard-edit");
    if (r.ok) {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(sessionFlag(payload.session_id), new Date().toISOString());
      process.stderr.write(
        "⚠️  approvals-guard: guard-edit token consumed — unlocked for this session\n",
      );
      process.exit(0);
    }
  } catch {
    /* token machinery broke — fall through to the block; the vault stays shut */
  }

  const msg =
    `\n${BANNER}\n` +
    `BLOCKED — ${what}\n` +
    `${BANNER}\n` +
    `Approval tokens are HUMAN-ONLY (writ-guard-trio, 08/19/2026). They are minted\n` +
    `exclusively by the operator typing \`approve <gate>\` as a chat message; the agent\n` +
    `never mints, reads, or edits them, and never modifies the minting mechanism.\n\n` +
    `Legitimate maintenance on these files? Ask the operator to type:\n` +
    `  approve ge\n` +
    `(single-use token; unlocks this guard for the rest of the session)\n` +
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
