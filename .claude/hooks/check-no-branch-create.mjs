#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Enforces CLAUDE.md RULE 1 at the command edge:
// work happens ON `main` directly (commit + safe-push). The agent must NEVER spin
// up a feature branch or open a PR on its own — that is what littered the board
// with stale `claude/*` branches the operator then had to sweep by hand.
//
// What it BLOCKS (agent-initiated branch / PR creation):
//   • git checkout -b / -B <name>
//   • git switch -c / -C / --create <name>
//   • git branch <name>            (the bare "create a branch" form, no flags)
//   • gh pr create / gh pr new
//
// What it ALLOWS (never a false positive on normal work):
//   • git checkout <existing>, git switch <existing>
//   • git branch              (list)        git branch -vv / -r / -a / --merged …
//   • git branch -d/-D/-m/-M  (delete / rename — cleanup, not creation)
//   • every non-branch git command, and everything that is not git/gh
//
// ESCAPE HATCH — when the OPERATOR explicitly wants a branch (e.g. a backup ref),
// prefix the command with `ALLOW_BRANCH_CREATE=1`. The guard is for the agent's
// *default* reflex, not an absolute wall; an explicit, deliberate opt-in passes.
//
// Scope note (CLAUDE.md RULE 3 C2): this is a *behavioral* guardrail on the
// agent, exactly like check-project-path.mjs — NOT a data-pipeline gate. It only
// sees the agent's Bash tool calls; the operator's own terminal / `!` commands and
// the harness's own worktree machinery are untouched.
//
// Fail-OPEN on any internal error — a broken guard must never wedge the agent.

const BANNER = "=".repeat(72);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = String(JSON.parse(raw || "{}")?.tool_input?.command ?? "");
  } catch {
    process.exit(0); // not our shape — allow
  }
  if (!cmd.trim()) process.exit(0);

  // Deliberate operator opt-in anywhere in the command → allow.
  if (/\bALLOW_BRANCH_CREATE=1\b/.test(cmd)) process.exit(0);

  const hit = firstViolation(cmd);
  if (!hit) process.exit(0);

  block(hit.what, hit.detail);
});

// Inspect each &&/;/|| -separated segment so a guard can't be smuggled behind a
// harmless prefix (`ls && git checkout -b x`).
function firstViolation(cmd) {
  const segments = cmd.split(/&&|\|\||;|\n/).map((s) => s.trim());
  for (const seg of segments) {
    const v = classify(seg);
    if (v) return v;
  }
  return null;
}

function classify(seg) {
  // gh pr create / gh pr new
  if (/\bgh\s+pr\s+(create|new)\b/.test(seg)) {
    return {
      what: "PR creation (`gh pr create`)",
      detail:
        "The agent does not open PRs. Push the branch (if one exists) and let\n" +
        "the operator open the PR — see feedback_no-autonomous-pr in memory.",
    };
  }

  // Tokenize a git command.
  const m = seg.match(/(^|\b)git\s+(.*)$/s);
  if (!m) return null;
  const args = tokenize(m[2]);
  if (args.length === 0) return null;
  const sub = args[0];
  const rest = args.slice(1);

  // git checkout -b / -B <name>   |   git switch -c / -C / --create <name>
  if (sub === "checkout" && rest.some((a) => a === "-b" || a === "-B")) {
    return branchViolation("git checkout -b");
  }
  if (sub === "switch" && rest.some((a) => a === "-c" || a === "-C" || a === "--create")) {
    return branchViolation("git switch -c");
  }

  // git branch <name>  — creation form ONLY: no flags present, ≥1 positional arg.
  // `git branch` (list), `git branch -vv/-r/-a/--merged`, `git branch -d x`
  // (delete), `git branch -m a b` (rename) all carry a flag → allowed.
  if (sub === "branch") {
    const hasFlag = rest.some((a) => a.startsWith("-"));
    const positional = rest.filter((a) => !a.startsWith("-"));
    if (!hasFlag && positional.length >= 1) {
      return branchViolation("git branch <name>");
    }
  }

  return null;
}

function branchViolation(form) {
  return {
    what: `branch creation (\`${form}\`)`,
    detail:
      "CLAUDE.md RULE 1: work happens ON `main` directly — commit + " +
      "`node scripts/safe-push.mjs`.\nThe agent does not start feature branches; " +
      "stale `claude/*` branches are exactly\nwhat the operator had to sweep off " +
      "the board by hand.\n\nIf the OPERATOR explicitly asked for this branch, " +
      "re-run with the opt-in:\n  ALLOW_BRANCH_CREATE=1 <your command>",
  };
}

// Minimal shell-ish tokenizer: splits on whitespace, strips matching quotes.
function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

function block(what, detail) {
  const msg = `\n${BANNER}\nBLOCKED — ${what}\n${BANNER}\n${detail}\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}
