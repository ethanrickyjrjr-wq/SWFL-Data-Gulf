#!/usr/bin/env node
// SessionStart: report how many OPEN checks are now machine-closeable.
//
// Operator decision 07/22/2026: the sweep REPORTS at session start, it does not
// auto-close. A silent scheduled close is how a bad signal buries unfinished
// work with nobody watching the run; a report makes the trip visible and leaves
// the write on an explicit `node scripts/check-sweep.mjs`.
//
// Read-only by construction: runs the sweeper with --dry-run, which never PATCHes.
// Never fails the session — a dead network at 8am must not block a kickoff.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

try {
  // The sweeper exits non-zero when a stored signal is BROKEN (unevaluable).
  // That is a real finding worth printing, not a reason to swallow the output —
  // so recover stdout from the rejection rather than losing it.
  const { stdout } = await run("node", ["scripts/check-sweep.mjs", "--dry-run"], {
    cwd: process.cwd(),
    timeout: 25_000,
  }).catch((e) => ({ stdout: e.stdout ?? "" }));

  const lines = String(stdout).trim().split("\n");
  const summary = lines.find((l) => l.includes("closed ·")) ?? "";
  const closeable = Number(summary.match(/(\d+) closed/)?.[1] ?? 0);
  const broken = Number(summary.match(/(\d+) signal-broken/)?.[1] ?? 0);

  if (!closeable && !broken) process.exit(0); // silent when there's nothing to say

  console.log("=".repeat(72));
  if (closeable) {
    console.log(
      `CHECKS — ${closeable} open check(s) are NOW CLOSEABLE: their stored signal passes live.`,
    );
    for (const l of lines.filter((l) => l.trimStart().startsWith("CLOSE"))) console.log(l);
    console.log(
      "  Close them: node scripts/check-sweep.mjs   (re-runs each signal, writes the proof)",
    );
  }
  if (broken) {
    console.log(
      `CHECKS — ${broken} stored signal(s) NEVER EVALUATED (bad params / unreachable / unimplemented).`,
    );
    for (const l of lines.filter((l) => l.trimStart().startsWith("BROKEN"))) console.log(l);
    console.log("  These verify nothing until the stored signal is fixed.");
  }
  console.log("=".repeat(72));
} catch {
  // Never block a session on this.
}
