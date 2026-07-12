#!/usr/bin/env node
// Decreed dispatch, one move: fire the RULE 1 targeted rebuild AND append the
// tripwire acceptance entry the hourly scan demands (check
// tripwire_dispatch_acceptance_ergonomics, decided 07/12/2026).
//
// Why this exists: checkPaidDispatches (scripts/tripwire-scan.mjs) lists an
// operator-recognized run as YELLOW via accepted_dispatch_runs[] in
// verification/tripwire-accepted.json — and forgetting that manual entry cost
// 24h of hourly RED + issue #106 spam on 07/12. This wrapper makes the entry
// impossible to forget. A RAW `gh workflow run` stays RED (the bypass arm of
// the tripwire is untouched — unlisted is still unrecognized).
//
// Money covenant: this fires a PAID run (daily-rebuild spends Sonnet). The same
// operator opt-in the check-no-paid-dispatch hook demands is required HERE too,
// so wrapping the dispatch never weakens the guard:
//   OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs <pack> --reason "<decree>"
// A session may NOT set that on its own judgment — operator, in conversation.
//
// RULE 1 lock encoded: pack_id=master with force rebuilds all 32 brains — the
// wrapper refuses it (use --no-force for the plain master cascade).

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = "ethanrickyjrjr-wq/SWFL-Data-Gulf";
const WORKFLOW = "daily-rebuild.yml";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTED_PATH = path.join(ROOT, "verification", "tripwire-accepted.json");
const POLL_TRIES = 10;
const POLL_DELAY_MS = 5_000;

// ---------- pure core (unit-tested in scripts/lib/dispatch-rebuild.test.mjs) --

export function fmtDateMDY(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("month")}/${get("day")}/${get("year")}`;
}

export function parseArgs(argv) {
  const out = { pack: null, reason: null, force: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reason") out.reason = argv[++i] ?? null;
    else if (a === "--no-force") out.force = false;
    else if (!a.startsWith("-") && !out.pack) out.pack = a;
  }
  return out;
}

export function buildAcceptanceEntry({ pack, runUrl, reason, now }) {
  return {
    run_url: runUrl,
    pack,
    accepted_on: fmtDateMDY(now),
    note: `${reason} (decreed dispatch via scripts/dispatch-rebuild.mjs)`,
  };
}

// Idempotent on run_url — re-running acceptance for the same run is a no-op.
export function appendAcceptance(doc, entry) {
  const runs = Array.isArray(doc?.accepted_dispatch_runs) ? doc.accepted_dispatch_runs : [];
  if (runs.some((r) => r?.run_url === entry.run_url)) return doc;
  return { ...doc, accepted_dispatch_runs: [...runs, entry] };
}

// Newest workflow_dispatch run created at/after our dispatch (30s clock skew).
export function pickDispatchedRun(runs, sinceMs) {
  const SKEW_MS = 30_000;
  return (
    (runs ?? [])
      .filter(
        (r) => r?.event === "workflow_dispatch" && Date.parse(r?.createdAt) >= sinceMs - SKEW_MS,
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
  );
}

// ---------- CLI ----------------------------------------------------------------

function sh(c) {
  return execSync(c, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", cwd: ROOT }).trim();
}

function die(msg) {
  process.stderr.write(`\n${msg}\n`);
  process.exit(1);
}

async function main() {
  const { pack, reason, force } = parseArgs(process.argv.slice(2));

  if (!pack || !reason) {
    die(
      'usage: OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs <pack_id> --reason "<decree>" [--no-force]\n' +
        "Fires the RULE 1 targeted rebuild AND appends the tripwire acceptance entry.",
    );
  }
  if (process.env.OPERATOR_APPROVED_PAID_RUN !== "1") {
    die(
      "REFUSED — this dispatches a PAID run (daily-rebuild spends Sonnet).\n" +
        "Same covenant as the check-no-paid-dispatch hook: the OPERATOR (a human,\n" +
        "in this conversation, explicitly) approves, then re-run with:\n" +
        `  OPERATOR_APPROVED_PAID_RUN=1 node scripts/dispatch-rebuild.mjs ${pack} --reason "..."`,
    );
  }
  if (pack === "master" && force) {
    die(
      "REFUSED — pack_id=master with force rebuilds all 32 brains (32 Sonnet calls).\n" +
        "RULE 1 lock (2026-06-29): never do this to debug one brain. Target the brain,\n" +
        "or use --no-force for the TTL-respecting master cascade.",
    );
  }

  const sinceMs = Date.now();
  const forceArg = force ? " -f force=true" : "";
  process.stdout.write(`Dispatching ${WORKFLOW} pack_id=${pack}${force ? " force=true" : ""}…\n`);
  sh(`gh workflow run ${WORKFLOW} --repo ${REPO} -f pack_id=${pack}${forceArg}`);

  let run = null;
  for (let i = 0; i < POLL_TRIES && !run; i++) {
    await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
    try {
      const rows = JSON.parse(
        sh(
          `gh run list --workflow=${WORKFLOW} --repo ${REPO} --limit 5 --json url,createdAt,event`,
        ),
      );
      run = pickDispatchedRun(rows, sinceMs);
    } catch {
      /* transient gh/api hiccup — keep polling */
    }
  }

  const entry = buildAcceptanceEntry({
    pack,
    runUrl: run?.url ?? "FILL-ME — run URL not resolved, look it up with `gh run list`",
    reason,
    now: new Date(),
  });

  if (!run) {
    die(
      "Dispatch FIRED but the run URL could not be resolved — the acceptance entry\n" +
        "was NOT written. Complete it by hand in verification/tripwire-accepted.json\n" +
        "(accepted_dispatch_runs[]), or the hourly tripwire re-reds for 24h:\n" +
        JSON.stringify(entry, null, 2),
    );
  }

  const doc = JSON.parse(fs.readFileSync(ACCEPTED_PATH, "utf8"));
  fs.writeFileSync(ACCEPTED_PATH, JSON.stringify(appendAcceptance(doc, entry), null, 2) + "\n");
  process.stdout.write(
    `Run: ${run.url}\n` +
      `Acceptance entry appended to verification/tripwire-accepted.json.\n` +
      `NEXT (same session): commit + push that file — the hourly tripwire reads ORIGIN,\n` +
      `an uncommitted entry silences nothing.\n`,
  );
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => die(String(e?.message ?? e)));
}
