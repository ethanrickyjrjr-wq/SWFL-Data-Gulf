#!/usr/bin/env node
// egress-burner-scan.mjs — can the lake MCP egress burner come back? Answered
// from the machine, at every session start, for $0.
//
// THE INCIDENT (07/21/2026): tools/lake-mcp-server.mts burned ~300 GB/day of
// Supabase Storage egress. Every request in the log carried
// `duckdb/v1.5.4(windows_amd64) node-neo-api` — a local DuckDB, four copies
// alive at once. It ran for DAYS and was caught by a BILL, not a monitor.
//
// WHY THIS FILE EXISTS: a boot guard now lives in the server itself, but a
// guard only protects the checkout that HAS it. Two checkouts on this machine
// held pre-guard copies, found by hand on 07/21. Nothing would have told us.
// This is the detector: it does not prevent a burn, it makes one IMPOSSIBLE TO
// NOT NOTICE.
//
// Egress is a cumulative period-to-date counter that cannot fall mid-cycle, so
// "the bill went down" can never be the proof. The proof is: no live process,
// no unguarded copy, no spawning config, guard not disarmed. That is what this
// checks, and it is why every signal here is PRESENCE-based, not byte-based.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** The exported const name the boot guard defines. A checkout whose server
 *  source lacks this string predates the guard and WILL burn if it can reach
 *  credentials. Keyed on the token, not a line number, so refactors don't
 *  silently blind the scan — see FM4 (the scan must prove it can still find
 *  the canonical guarded copy). */
export const GUARD_TOKEN = "LAKE_MCP_ALLOW_EGRESS";

/** Path fragment identifying the burner. */
export const SERVER_REL = path.join("tools", "lake-mcp-server.mts");

// ---------- pure classifiers (unit-tested) -----------------------------------

/** "guarded" | "unguarded" | "absent" for one checkout. */
export function classifyCheckout({ hasServer, source }) {
  if (!hasServer) return "absent";
  return source && source.includes(GUARD_TOKEN) ? "guarded" : "unguarded";
}

/** Only the exact string "1" is consent. A stray "" or "0" in a shell profile
 *  must never read as an opt-in. Mirrors assertEgressOptIn in the server. */
export function classifyOptIn(value) {
  return value === "1";
}

/** Every mcpServers entry that would SPAWN the burner, by key.
 *  The key is only a display name — renaming it disables nothing. That was the
 *  failed first fix on 07/21, so this matches on args/command, never the key.
 *  Never throws: a scan that crashes reads as green, which is the worst
 *  possible failure for a detector. */
export function lakeEntriesIn(jsonText) {
  let cfg;
  try {
    cfg = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const servers = cfg?.mcpServers;
  if (!servers || typeof servers !== "object") return [];
  return Object.entries(servers)
    .filter(([, v]) => {
      const parts = [v?.command, ...(Array.isArray(v?.args) ? v.args : [])];
      return parts.some(
        (p) => typeof p === "string" && p.toLowerCase().includes("lake-mcp-server"),
      );
    })
    .map(([k]) => k);
}

/** Fold the gathered evidence into a level + findings.
 *
 *  FM4 — THE FALSE GREEN: if the scan could not confirm the canonical guarded
 *  copy in this very repo, it did not prove anything. A detector that scanned
 *  the wrong root, or hit a permission error, or lost the token to a refactor,
 *  would otherwise report "all clear" while blind. That case is RED. */
export function classifyScan({ canonicalGuarded, liveProcesses, unguarded, optIn, staleConfigs }) {
  const findings = [];

  if (!canonicalGuarded) {
    findings.push(
      `SCAN BROKEN — could not confirm the guard token ${GUARD_TOKEN} in this repo's own ` +
        `${SERVER_REL}. The scan proves NOTHING in this state. Either the guard was removed ` +
        `(re-add it) or the scan's root/token is wrong (fix this file). Do not read as clean.`,
    );
  }
  for (const p of liveProcesses) {
    findings.push(
      `LIVE BURNER — pid ${p.pid} is running the lake MCP server RIGHT NOW. It bills Storage ` +
        `egress on every query. Kill it, then find what spawned it.`,
    );
  }
  for (const dir of unguarded) {
    findings.push(
      `UNGUARDED COPY — ${dir} holds ${SERVER_REL} WITHOUT the boot guard. A guard that isn't ` +
        `there cannot fire. Remove the checkout or bring it up to date.`,
    );
  }
  for (const { file, keys } of staleConfigs) {
    findings.push(
      `SPAWNING CONFIG — ${file} would start the burner (entries: ${keys.join(", ")}). The key ` +
        `name is cosmetic; delete the entry.`,
    );
  }
  if (optIn) {
    findings.push(
      `GUARD DISARMED — ${GUARD_TOKEN}=1 is set. The boot guard will pass and the burn is live ` +
        `on the next query. Unset it unless the cold .csv.gz read path was actually fixed.`,
    );
  }

  return { level: findings.length ? "red" : "green", findings };
}

// ---------- machine probes (impure; wrapped so they can never throw) ---------

/** Sibling checkouts to sweep: every directory beside this repo. Bounded to one
 *  level — this is a dev box, not a filesystem crawl (RULE 11: our volume). */
function siblingDirs(root) {
  try {
    const parent = path.dirname(root);
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(parent, d.name))
      .filter((d) => path.resolve(d) !== path.resolve(root));
  } catch {
    return [];
  }
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Runtimes that can actually EXECUTE the server. A shell searching for the
 *  string is not one of them. */
const RUNTIMES = /^(bun|node|deno)(\.exe)?$/i;

/** True only for a process that is genuinely RUNNING the burner.
 *
 *  FM6 — SELF-MATCH: the scan's own probe command contains "lake-mcp-server"
 *  because that is what it searches for, so a naive command-line match reports
 *  the detector as the burner. Caught on the first live run, 07/21/2026. Two
 *  conditions must BOTH hold: the executable is a JS runtime, and its command
 *  line references the server file. Shells (pwsh/sh/cmd) are excluded by the
 *  first condition even when their text matches. */
export function isBurnerProcess({ name, cmd }) {
  if (typeof name !== "string" || typeof cmd !== "string") return false;
  const exe = name.split(/[\\/]/).pop() ?? "";
  if (!RUNTIMES.test(exe)) return false;
  return /lake-mcp-server/i.test(cmd);
}

/** Live burner processes. Windows-first (this is where the incident happened);
 *  falls back to ps on POSIX. Never throws. Emits name+cmd so isBurnerProcess
 *  can reject self-matches — see FM6. */
export function findLiveBurners() {
  const out = [];
  try {
    const isWin = process.platform === "win32";
    const SEP = "|::|";
    const cmd = isWin
      ? `powershell -NoProfile -Command "Get-CimInstance Win32_Process | ForEach-Object { $_.ProcessId.ToString() + '${SEP}' + $_.Name + '${SEP}' + $_.CommandLine }"`
      : `ps -eo pid=,comm=,args= | awk '{ printf \"%s${SEP}%s${SEP}\", $1, $2; $1=\"\"; $2=\"\"; print }'`;
    const raw = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
    for (const line of raw.split(/\r?\n/)) {
      const [pidRaw, name, ...rest] = line.split(SEP);
      const pid = Number((pidRaw ?? "").trim());
      if (!Number.isInteger(pid) || pid <= 0) continue;
      if (pid === process.pid) continue; // never flag ourselves
      if (isBurnerProcess({ name: (name ?? "").trim(), cmd: rest.join(SEP) })) out.push({ pid });
    }
  } catch {
    /* a failed probe is not evidence of absence, but it must not crash the scan */
  }
  return out;
}

/** Gather all evidence for one machine. Exported so the tripwire can fold the
 *  result into its own report. */
export function scanMachine(root) {
  const canonicalSource = readIfExists(path.join(root, SERVER_REL));
  const canonicalGuarded =
    classifyCheckout({ hasServer: canonicalSource !== null, source: canonicalSource }) ===
    "guarded";

  const unguarded = [];
  const staleConfigs = [];

  const noteConfig = (dir) => {
    const cfgText = readIfExists(path.join(dir, ".mcp.json"));
    if (!cfgText) return;
    const keys = lakeEntriesIn(cfgText);
    if (keys.length) {
      staleConfigs.push({ file: path.join(dir, ".mcp.json").replace(/\\/g, "/"), keys });
    }
  };

  for (const dir of siblingDirs(root)) {
    const src = readIfExists(path.join(dir, SERVER_REL));
    if (classifyCheckout({ hasServer: src !== null, source: src }) === "unguarded") {
      unguarded.push(dir.replace(/\\/g, "/"));
    }
    noteConfig(dir);
  }
  noteConfig(root); // this repo's own config counts too

  // Opt-in: ambient environment, plus the repo's local env file. Reads ONE
  // variable by name and never any other value — full-file exposure is what
  // caused the 07/18 secrets incident.
  let optIn = classifyOptIn(process.env[GUARD_TOKEN]);
  if (!optIn) {
    const envText = readIfExists(path.join(root, ".env.local"));
    if (envText) {
      const line = envText.split(/\r?\n/).find((l) => l.startsWith(`${GUARD_TOKEN}=`));
      if (line) optIn = classifyOptIn(line.slice(GUARD_TOKEN.length + 1).trim());
    }
  }

  return classifyScan({
    canonicalGuarded,
    liveProcesses: findLiveBurners(),
    unguarded,
    optIn,
    staleConfigs,
  });
}

// ---------- run --------------------------------------------------------------

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const result = scanMachine(path.resolve(import.meta.dirname, ".."));
  const B = "=".repeat(72);
  console.log(`\n${B}\nEGRESS BURNER SCAN ${new Date().toISOString()}\n${B}`);
  if (result.level === "green") {
    console.log("  green  NO BURNER — no live process, no unguarded copy, no spawning config,");
    console.log("         guard armed and confirmed present in this repo.");
  } else {
    for (const f of result.findings) console.log(`  RED    ${f}`);
  }
  console.log(B);
  process.exit(result.level === "red" ? 1 : 0);
}
