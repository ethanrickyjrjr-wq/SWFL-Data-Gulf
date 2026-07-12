// Subprocess dry-run assertions for log-cron-incident.mjs: the rewritten logger
// must record incidents via public.checks + GitHub issues and NEVER push to main.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runDryRun(mode, workflowRun) {
  const dir = mkdtempSync(join(tmpdir(), "cron-evt-"));
  const evt = join(dir, "event.json");
  writeFileSync(evt, JSON.stringify({ workflow_run: workflowRun }));
  return execFileSync("node", ["log-cron-incident.mjs", `--mode=${mode}`, "--dry-run"], {
    cwd: import.meta.dirname,
    env: { ...process.env, GITHUB_EVENT_PATH: evt },
    encoding: "utf8",
  });
}

const FRESHNESS_FAIL = {
  id: 123,
  html_url: "https://x/runs/123",
  conclusion: "failure",
  event: "schedule",
  head_branch: "main",
  name: "Pipeline freshness probe (daily)",
  path: ".github/workflows/freshness-probe-daily.yml",
};

const FRESHNESS_OK = {
  ...FRESHNESS_FAIL,
  id: 124,
  html_url: "https://x/runs/124",
  conclusion: "success",
};

test("record-failure dry-run opens a check and never pushes to main", () => {
  const out = runDryRun("record-failure", FRESHNESS_FAIL);
  assert.match(out, /would open check cron_incident_freshness_probe_daily/);
  assert.doesNotMatch(out, /git push|insert row/i);
});

test("maybe-resolve dry-run closes the check and never pushes to main", () => {
  const out = runDryRun("maybe-resolve", FRESHNESS_OK);
  assert.match(out, /would close check cron_incident_freshness_probe_daily/);
  assert.doesNotMatch(out, /git push|flip|OPEN row/i);
});

// --- Termination classes (Phase 3b). Fixtures are REAL runs; see
// --- .github/scripts/classify-termination.test.mjs for the provenance of each.

// leepa-parcels-annual run 27558172620 — the one SCHEDULED cancel of its 4.
// 30m 19s against a 90-min ceiling: not a timeout, no cancel-in-progress -> UNKNOWN_CANCEL.
const LEEPA_CANCELLED = {
  id: 27558172620,
  html_url: "https://x/runs/27558172620",
  conclusion: "cancelled",
  event: "schedule",
  head_branch: "main",
  run_started_at: "2026-06-15T15:44:55Z",
  updated_at: "2026-06-15T16:15:14Z",
  name: "LeePA parcels annual",
  path: ".github/workflows/leepa-parcels-annual.yml",
};

// A cancelled DISPATCH (leepa 26459301120) — a human pressing stop. Never an incident.
const LEEPA_CANCELLED_DISPATCH = {
  ...LEEPA_CANCELLED,
  id: 26459301120,
  event: "workflow_dispatch",
};

test("record-failure dry-run opens an incident for a cancelled SCHEDULED run (the blind spot)", () => {
  const out = runDryRun("record-failure", LEEPA_CANCELLED);
  assert.match(out, /would open check cron_incident_leepa_parcels_annual/);
  assert.match(out, /UNKNOWN_CANCEL/);
  assert.doesNotMatch(out, /git push/i);
});

test("record-failure dry-run SKIPS a cancelled dispatch run (a human pressed stop)", () => {
  const out = runDryRun("record-failure", LEEPA_CANCELLED_DISPATCH);
  assert.doesNotMatch(out, /would open check/);
  assert.match(out, /skip/i);
});

test("record-failure dry-run still opens an incident for a plain failure (no regression)", () => {
  const out = runDryRun("record-failure", FRESHNESS_FAIL);
  assert.match(out, /would open check cron_incident_freshness_probe_daily/);
});
