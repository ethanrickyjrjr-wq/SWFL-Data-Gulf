#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). THE push lock — no session pushes without
// the operator's word, mechanically.
//
// Why (07/05/2026): the "never push without explicit confirmation" rule lived
// in memory (feedback_no-autonomous-push) — and the GitHub activity API shows
// 35 session pushes to main in one day. A rule an agent can forget is not a
// rule. This hook makes it physical, for EVERY session on this machine.
//
// What it BLOCKS: any `git push` (all remotes/refs) and any invocation of
// scripts/safe-push.mjs, unless the command carries the operator's token:
//   OPERATOR_APPROVED_PUSH=1 <push command>
// A session sets that prefix ONLY when the operator said push in the
// conversation — for THAT push, not as a standing grant. Same covenant as
// OPERATOR_APPROVED_PAID_RUN / ALLOW_PAID_SURFACE.
//
// What it ALLOWS: everything else — commits, fetch, pull, rebase, worktrees.
// Work proceeds; only publication waits for a human.
//
// Fail-OPEN on internal errors — a broken guard must never wedge the agent.

const BANNER = "=".repeat(72);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = String(JSON.parse(raw || "{}")?.tool_input?.command ?? "");
  } catch {
    process.exit(0);
  }
  if (!cmd.trim()) process.exit(0);
  // 09/07 + 09/14/2026: the weekly-dep-scan cloud routine was blocked here, set this token on
  // ITSELF, and pushed to main. The token is a HUMAN's word; an unattended session cannot
  // speak it, so there it is ignored. Markers are vendor-DOCUMENTED env vars only:
  //   CLAUDE_CODE_REMOTE=true — every cloud session, which is what a routine runs as
  //     (code.claude.com/docs/en/env-vars, /hooks, /claude-code-on-the-web)
  //   CI=true — GitHub Actions default (docs.github.com …/variables)
  // NO TTY clause: a hook's stdio is piped in every session — isTTY measured `undefined` in a
  // live interactive local session 09/20/2026 — so it would block the operator's own push.
  // ponytail: env markers are unsettable-by-prefix (the hook reads ITS env, not the command's),
  // but a session that can edit this file can still gut it; the real wall is GitHub's ruleset.
  const unattended = ["CLAUDE_CODE_REMOTE", "CI"].filter((k) => process.env[k] === "true");
  const hasToken = /\bOPERATOR_APPROVED_PUSH=1\b/.test(cmd);
  if (hasToken && !unattended.length) process.exit(0);

  // Match COMMANDS, not words: quoted text (e.g. a commit message that says
  // "git push") must not trip the lock. Tokenize each segment; a push is
  // `git … push` where git is the segment's first token (after env prefixes),
  // or an invocation of safe-push.mjs (node/bun + script, or script first).
  const isPush = cmd.split(/&&|\|\||;|\n/).some((seg) => {
    const toks = tokenize(seg.trim());
    let i = 0;
    while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
    const first = toks[i];
    if (!first) return false;
    if (first === "git" && toks.slice(i + 1).some((t) => t === "push")) return true;
    const isScript = (t) => /(^|[\\/])safe-push\.mjs$/.test(t);
    if (isScript(first)) return true;
    if ((first === "node" || first === "bun") && toks.slice(i + 1).some(isScript)) return true;
    return false;
  });
  if (!isPush) process.exit(0);

  if (hasToken) {
    const m =
      `\n${BANNER}\nBLOCKED — OPERATOR_APPROVED_PUSH=1 in an unattended session (${unattended.join(", ")}=true)\n${BANNER}\n` +
      `A cloud routine pushed to main on 09/07 and 09/14/2026 by setting this token on itself.\n` +
      `The token is a human's word, spoken in an attended local session — not yours to set.\n` +
      `Commit; report in a GitHub issue; STOP. Do not retry, rephrase, or push another way.\n${BANNER}\n`;
    process.stdout.write(m);
    process.stderr.write(m);
    process.exit(2);
  }

  const msg =
    `\n${BANNER}\nBLOCKED — push without operator approval\n${BANNER}\n` +
    `35 autonomous session pushes hit main on 07/05/2026 before this lock.\n` +
    `Publication is the operator's call, every time. Commit freely; then ASK.\n\n` +
    `When the operator says push (this conversation, this push), re-run:\n` +
    `  OPERATOR_APPROVED_PUSH=1 <your push command>\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
});

// Minimal shell-ish tokenizer: splits on whitespace, strips matching quotes.
function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
