#!/usr/bin/env node
// paid-run.mjs — the ONE valve for operator-approved local paid runs.
//
// After the 07/05/2026 credit drain, every per-use paid key in .env.local is
// quarantined under *_LOCKED_BY_OPERATOR names, so no script or session can
// spend by default. When the OPERATOR says "run it" in the conversation, the
// session runs the command THROUGH this valve — the operator never edits a
// file, never renames a line, never taps a dashboard:
//
//   OPERATOR_APPROVED_PAID_RUN=1 node scripts/paid-run.mjs <command> [args...]
//
// What it does: reads the *_LOCKED_BY_OPERATOR values from .env.local, maps
// them back to their real names IN THE CHILD PROCESS ONLY (never written to
// disk, never exported to the session shell), prints a loud audit banner,
// appends a line to verification/paid-runs.log, and execs the command.
//
// Without OPERATOR_APPROVED_PAID_RUN=1 it refuses. A session may set that
// flag ONLY when the operator approved the run in the conversation — same
// covenant as the paid-dispatch hook's escape hatch. Even through the valve,
// spend stays bounded: metered clients + RunBudget ($1/run) + daily ceiling.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const AUDIT = path.join(ROOT, "verification", "paid-runs.log");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "usage: OPERATOR_APPROVED_PAID_RUN=1 node scripts/paid-run.mjs <command> [args...]",
  );
  process.exit(1);
}

if (process.env.OPERATOR_APPROVED_PAID_RUN !== "1") {
  console.error(
    "\nREFUSED — paid-run valve requires OPERATOR_APPROVED_PAID_RUN=1.\n" +
      "A session sets it ONLY when the operator approved this run in the\n" +
      "conversation. Paid keys stay locked otherwise (07/05/2026 decree).\n",
  );
  process.exit(2);
}

// Unlock the quarantined keys into the CHILD env only.
const childEnv = { ...process.env };
let unlocked = [];
try {
  const text = fs.readFileSync(ENV_FILE, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)_LOCKED_BY_OPERATOR=(.*)$/);
    if (m && m[2]) {
      childEnv[m[1]] = m[2];
      unlocked.push(m[1]);
    }
  }
} catch (e) {
  console.error(`paid-run: cannot read .env.local: ${e.message}`);
  process.exit(1);
}
if (unlocked.length === 0) {
  console.error("paid-run: no *_LOCKED_BY_OPERATOR keys found in .env.local — nothing to unlock.");
  process.exit(1);
}

const stamp = new Date().toISOString();
const cmdline = args.join(" ");
const banner =
  `\n${"=".repeat(72)}\nPAID RUN (operator-approved) ${stamp}\n` +
  `keys unlocked for this process only: ${unlocked.join(", ")}\n` +
  `command: ${cmdline}\n${"=".repeat(72)}\n`;
process.stdout.write(banner);
try {
  fs.mkdirSync(path.dirname(AUDIT), { recursive: true });
  fs.appendFileSync(AUDIT, `${stamp}\t${unlocked.join(",")}\t${cmdline}\n`);
} catch {
  /* audit is best-effort; the run itself still proceeds */
}

// Windows needs shell:true to resolve bun/python shims, but spawnSync joins
// array args naively there — quote anything with whitespace ourselves.
const useShell = process.platform === "win32";
const r = useShell
  ? spawnSync(args.map(quoteArg).join(" "), { stdio: "inherit", env: childEnv, shell: true })
  : spawnSync(args[0], args.slice(1), { stdio: "inherit", env: childEnv });
process.exit(r.status ?? 1);

function quoteArg(a) {
  return /[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}
