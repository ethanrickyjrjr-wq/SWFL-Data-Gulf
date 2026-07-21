// Unit tests for egress-burner-scan.mjs's pure classifiers. No fs, no processes.
// Run: node --test scripts/egress-burner-scan.test.mjs
//
// Each test is named after the FAILURE MODE it prevents (RULE 3.5 — name the
// break before you build). The incident these guard against: 07/21/2026, the
// lake MCP server burned ~300 GB/day of Supabase Storage egress for days and
// was found from a BILL, not a monitor.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUARD_TOKEN,
  classifyCheckout,
  classifyOptIn,
  lakeEntriesIn,
  classifyScan,
  isBurnerProcess,
} from "./egress-burner-scan.mjs";

// --- FM6: THE DETECTOR CRIES WOLF AT ITSELF --------------------------------
// Caught on the FIRST live run, 07/21/2026: the scan reported two "LIVE BURNER"
// processes that were its OWN PowerShell probe — whose command line contains
// "lake-mcp-server" precisely because that is the string being searched for.
// A detector that fires every session on itself is a detector everyone learns
// to ignore, which is worse than no detector at all.

test("FM6 — the scan's own shell probe is NOT a burner (self-match)", () => {
  const probe = {
    name: "pwsh.exe",
    cmd: `pwsh.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*lake-mcp-server*' }"`,
  };
  assert.equal(isBurnerProcess(probe), false);
});

test("FM6 — a grep/ps pipeline searching for the burner is NOT a burner", () => {
  assert.equal(
    isBurnerProcess({ name: "sh", cmd: "sh -c ps -eo args | grep lake-mcp-server" }),
    false,
  );
});

test("FM6 — bun actually running the server IS a burner", () => {
  assert.equal(isBurnerProcess({ name: "bun.exe", cmd: "bun tools/lake-mcp-server.mts" }), true);
});

test("FM6 — node running the server IS a burner", () => {
  assert.equal(
    isBurnerProcess({ name: "node", cmd: "node /home/x/tools/lake-mcp-server.mts" }),
    true,
  );
});

test("FM6 — an unrelated bun process is NOT a burner", () => {
  assert.equal(isBurnerProcess({ name: "bun.exe", cmd: "bun run dev" }), false);
});

// --- FM1: an unguarded copy of the burner sits in another checkout ----------

test("FM1 — checkout holding the server WITHOUT the guard token is unguarded", () => {
  assert.equal(
    classifyCheckout({ hasServer: true, source: "export function startup() {}" }),
    "unguarded",
  );
});

test("FM1 — checkout holding the server WITH the guard token is guarded", () => {
  assert.equal(
    classifyCheckout({ hasServer: true, source: `export const X = "${GUARD_TOKEN}";` }),
    "guarded",
  );
});

test("FM1 — checkout with no server file at all is not applicable, never a finding", () => {
  assert.equal(classifyCheckout({ hasServer: false, source: null }), "absent");
});

// --- FM2: the guard is bypassed because the opt-in variable is set ----------

test("FM2 — opt-in is ONLY the exact string '1'", () => {
  assert.equal(classifyOptIn("1"), true);
});

test("FM2 — a stray empty string or '0' left in a profile is NOT consent", () => {
  assert.equal(classifyOptIn(""), false);
  assert.equal(classifyOptIn("0"), false);
  assert.equal(classifyOptIn(undefined), false);
  assert.equal(classifyOptIn("true"), false); // only "1" counts
});

// --- FM3: a stale MCP config re-spawns the burner every session ------------

test("FM3 — an mcp entry spawning the lake server is found REGARDLESS of its key name", () => {
  // The 07/21 first attempt renamed the key and changed nothing: in Claude Code
  // the mcpServers KEY is only a display name; the entry still ran the server.
  const cfg = JSON.stringify({
    mcpServers: {
      lake_DISABLED_EGRESS_BURN_20260721: { command: "bun", args: ["tools/lake-mcp-server.mts"] },
    },
  });
  assert.deepEqual(lakeEntriesIn(cfg), ["lake_DISABLED_EGRESS_BURN_20260721"]);
});

test("FM3 — a config with no lake entry yields nothing", () => {
  const cfg = JSON.stringify({ mcpServers: { serena: { command: "serena", args: ["start"] } } });
  assert.deepEqual(lakeEntriesIn(cfg), []);
});

test("FM3 — unparseable config must not throw (a crashed scan reads as green)", () => {
  assert.deepEqual(lakeEntriesIn("{ not json"), []);
});

// --- FM4: THE FALSE GREEN. The scan reports clean because it scanned nothing.

test("FM4 — scan that never found the canonical guarded copy is RED, never green", () => {
  const out = classifyScan({
    canonicalGuarded: false, // could not confirm our own guarded file
    liveProcesses: [],
    unguarded: [],
    optIn: false,
    staleConfigs: [],
  });
  assert.equal(out.level, "red");
  assert.match(out.findings.join(" "), /SCAN BROKEN/);
});

test("FM4 — all clear AND canonical copy confirmed guarded is the only way to green", () => {
  const out = classifyScan({
    canonicalGuarded: true,
    liveProcesses: [],
    unguarded: [],
    optIn: false,
    staleConfigs: [],
  });
  assert.equal(out.level, "green");
});

// --- FM5: the burner is running RIGHT NOW ----------------------------------

test("FM5 — a live burner process is RED even when everything else is clean", () => {
  const out = classifyScan({
    canonicalGuarded: true,
    liveProcesses: [{ pid: 54044 }],
    unguarded: [],
    optIn: false,
    staleConfigs: [],
  });
  assert.equal(out.level, "red");
  assert.match(out.findings.join(" "), /LIVE BURNER/);
});

test("FM5 — an unguarded checkout is RED and names the path", () => {
  const out = classifyScan({
    canonicalGuarded: true,
    liveProcesses: [],
    unguarded: ["C:/Users/ethan/dev/bp-stale"],
    optIn: false,
    staleConfigs: [],
  });
  assert.equal(out.level, "red");
  assert.match(out.findings.join(" "), /bp-stale/);
});

test("FM5 — opt-in set is RED (the guard is disarmed)", () => {
  const out = classifyScan({
    canonicalGuarded: true,
    liveProcesses: [],
    unguarded: [],
    optIn: true,
    staleConfigs: [],
  });
  assert.equal(out.level, "red");
  assert.match(out.findings.join(" "), new RegExp(GUARD_TOKEN));
});
