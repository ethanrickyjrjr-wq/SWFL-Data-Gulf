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
