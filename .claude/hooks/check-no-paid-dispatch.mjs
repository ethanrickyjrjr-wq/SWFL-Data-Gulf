#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Money guard at the command edge — born from
// the 07/05/2026 credit drain: a session manually `gh workflow run`-dispatched
// the corridor-pulse workflow TWICE (13:08 + 13:40 UTC) "to verify", and the
// 13:08 run spent live Sonnet + paid web_search until the account balance hit
// literal $0. Nothing in the toolchain stood between a session's reflex and the
// operator's money. This hook is that thing.
//
// What it BLOCKS (agent-initiated spend on GitHub Actions):
//   • gh workflow run <wf>     — when <wf> resolves to a workflow whose file
//   • gh workflow enable <wf>    references ANTHROPIC_API_KEY (a paid workflow),
//                                OR when <wf> cannot be resolved at all
//                                (fail-CLOSED for dispatch: an unresolvable
//                                target is exactly the risk).
//   • gh run rerun …           — always (a rerun re-bills the whole run; the
//                                hook cannot cheaply resolve run-id → workflow).
//   • gh api …dispatches… / …actions/workflows/…/enable…  and
//     curl …api.github.com…dispatches…  — the raw-API smuggle paths.
//
// What it ALLOWS (protective / read-only, never a false positive):
//   • gh workflow disable / list / view
//   • gh run list / view / watch / cancel / download
//   • gh workflow run|enable on workflows with NO ANTHROPIC_API_KEY reference
//   • everything that is not gh/curl-to-actions
//
// ESCAPE HATCH — the OPERATOR (a human, in this conversation, explicitly) says
// run it → prefix the command with `OPERATOR_APPROVED_PAID_RUN=1`. A session
// may NOT set this on its own judgment; "I wanted to verify" is the exact
// failure this guard exists to stop (memory: feedback_no-live-paid-api-calls-
// without-approval — *_live_verify checks are operator-run).
//
// Scope note (CLAUDE.md RULE 3 C2): behavioral guardrail on the agent's Bash
// tool calls only — the operator's own terminal / `!` commands are untouched.
//
// Fail-OPEN on internal errors (fs unavailable etc.) — a broken guard must
// never wedge the agent. Fail-CLOSED only on unresolvable dispatch targets.

import fs from "node:fs";
import path from "node:path";

const BANNER = "=".repeat(72);
const WF_DIR = path.join(process.cwd(), ".github", "workflows");

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
  if (/\bOPERATOR_APPROVED_PAID_RUN=1\b/.test(cmd)) process.exit(0);

  let hit = null;
  try {
    hit = firstViolation(cmd);
  } catch {
    process.exit(0); // internal error → fail open
  }
  if (!hit) process.exit(0);
  block(hit.what, hit.detail);
});

function firstViolation(cmd) {
  const segments = cmd.split(/&&|\|\||;|\n/).map((s) => s.trim());
  for (const seg of segments) {
    const v = classify(seg);
    if (v) return v;
  }
  return null;
}

function classify(seg) {
  // Raw-API smuggle paths: gh api / curl straight at the Actions endpoints.
  if (
    /\b(gh\s+api|curl)\b/.test(seg) &&
    /dispatches|actions\/workflows\/[^\s]*\/enable/.test(seg)
  ) {
    return {
      what: "raw Actions API dispatch/enable",
      detail:
        "Direct `gh api`/`curl` calls to workflow dispatch/enable endpoints are\n" +
        "blocked for the same reason `gh workflow run` is — see below.",
    };
  }

  const m = seg.match(/(^|\b)gh\s+(.*)$/s);
  if (!m) return null;
  const args = tokenize(m[2]);
  if (args.length < 2) return null;

  // gh run rerun — always blocked (re-bills the failed run's whole spend).
  if (args[0] === "run" && args[1] === "rerun") {
    return {
      what: "run rerun (`gh run rerun`)",
      detail:
        "A rerun re-executes the run's API calls and RE-BILLS the whole spend.\n" +
        "The 07/05/2026 drain started exactly this way — a session re-firing a\n" +
        "failed paid run 'to verify'. If the OPERATOR explicitly approved this\n" +
        "rerun, re-run with:\n  OPERATOR_APPROVED_PAID_RUN=1 <your command>",
    };
  }

  // gh workflow run|enable <target>
  if (args[0] === "workflow" && (args[1] === "run" || args[1] === "enable")) {
    const verb = args[1];
    const target = firstPositional(args.slice(2));
    if (!target) return null; // interactive form won't work headless anyway
    const resolved = resolveWorkflowFile(target);
    if (resolved === null) {
      return {
        what: `workflow ${verb} on unresolvable target '${target}'`,
        detail:
          "Could not match this target to a file in .github/workflows/, so it\n" +
          "cannot be proven free of paid API calls. Dispatch is fail-CLOSED.\n" +
          "Use the workflow FILE name (e.g. daily-rebuild.yml), or if the\n" +
          "OPERATOR explicitly approved, re-run with:\n" +
          "  OPERATOR_APPROVED_PAID_RUN=1 <your command>",
      };
    }
    if (resolved.paid) {
      return {
        what: `PAID workflow ${verb} (\`${path.basename(resolved.file)}\` uses ANTHROPIC_API_KEY)`,
        detail:
          "This workflow spends real API credits. On 07/05/2026 a session\n" +
          "dispatched corridor-pulse-weekly 'to verify' and drained the account\n" +
          "to $0. Sessions NEVER start paid runs on their own judgment —\n" +
          "*_live_verify checks are operator-run (see memory:\n" +
          "feedback_no-live-paid-api-calls-without-approval).\n\n" +
          "If the OPERATOR explicitly approved this run in this conversation,\n" +
          "re-run with the opt-in:\n  OPERATOR_APPROVED_PAID_RUN=1 <your command>",
      };
    }
  }

  return null;
}

// Map a `gh workflow run/enable` target to a workflow file.
// Accepts: a filename (daily-rebuild.yml), a bare basename, or the workflow's
// display `name:`. Returns {file, paid} or null when unresolvable.
function resolveWorkflowFile(target) {
  let files;
  try {
    files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    return { file: "(no local .github/workflows)", paid: false }; // fail open on fs error
  }
  const base = path.basename(target);

  // 1. filename match
  const byName = files.find((f) => f === base || f === `${base}.yml` || f === `${base}.yaml`);
  if (byName) return withPaidFlag(byName);

  // 2. display-name match against each file's `name:` line
  const wanted = target.trim().toLowerCase();
  for (const f of files) {
    const text = read(path.join(WF_DIR, f));
    const nm = text.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    if (nm && nm[1].trim().toLowerCase() === wanted) return withPaidFlag(f);
  }
  // 3. numeric workflow IDs / anything else → unresolvable
  return null;
}

function withPaidFlag(file) {
  const full = path.join(WF_DIR, file);
  return { file: full, paid: /ANTHROPIC_API_KEY/.test(read(full)) };
}

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function firstPositional(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      // flags with values: skip the value token for known value-taking flags
      if (["-R", "--repo", "-r", "--ref", "-f", "--raw-field", "-F", "--field"].includes(a)) i++;
      continue;
    }
    return a;
  }
  return null;
}

function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function block(what, detail) {
  const msg = `\n${BANNER}\nBLOCKED — ${what}\n${BANNER}\n${detail}\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}
