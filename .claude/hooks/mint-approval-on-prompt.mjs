#!/usr/bin/env node
// mint-approval-on-prompt.mjs — THE ONLY MINTER (UserPromptSubmit; writ-guard-trio A).
// Spec: docs/superpowers/specs/2026-08-19-writ-guard-trio-design.md
//
// A token exists ONLY because the operator's typed message was exactly an approval
// phrase. UserPromptSubmit fires on genuine human input; the agent cannot fabricate the
// event, and check-approvals-guard.mjs refuses the agent's ordinary tool paths to this
// file and the approvals dir.
//
// Grammar — STRICT, the whole prompt, nothing else:
//     approve <gate>
// e.g. `approve paid-dispatch`, `approve tdd-write`, `approve guard-edit`.
// "please approve X", "I approve X", or an approval buried in a longer message mints
// NOTHING — loose matching is the accidental-approval failure mode, named in the spec.
//
// Contract notes (mirrors inject-focus.mjs, verified against code.claude.com/docs/hooks):
//   - stdin JSON carries `prompt` (+ session_id, cwd).
//   - exit 0 + hookSpecificOutput.additionalContext → confirmation lands in context.
//   - NEVER exit 2 (that blocks and erases the prompt). Fail OPEN, always.

import { pathToFileURL } from "node:url";
import { mintToken, DEFAULT_TTL_MS } from "./lib/approval-token.mjs";

/** The strict whole-prompt approval grammar. Returns the normalized gate or null. */
export function parseApprovalPhrase(prompt) {
  const m = String(prompt ?? "").match(
    /^\s*approve\s+([A-Za-z0-9][A-Za-z0-9_-]{0,40})\s*[.!]?\s*$/i,
  );
  return m ? m[1].toLowerCase() : null;
}

function main(raw) {
  try {
    const payload = JSON.parse(raw || "{}");
    const gate = parseApprovalPhrase(payload.prompt);
    if (!gate) process.exit(0);
    mintToken(gate, { meta: { session: payload.session_id || null } });
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext:
            `[approval-token] Operator approval received: single-use token minted for gate ` +
            `'${gate}' (TTL ${Math.round(DEFAULT_TTL_MS / 60_000)} min). The next blocked ` +
            `action guarded by '${gate}' will consume it. Tokens are minted only from the ` +
            `operator's own typed \`approve <gate>\` message — never mint one yourself.`,
        },
      }),
    );
  } catch {
    /* fail open — a broken minter must never wedge a prompt */
  }
  process.exit(0);
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
