// The auto-resolve trigger allowlist is written twice: once as a job-level `if:`
// in .github/workflows/log-cron-incident.yml (cheap — skips the runner entirely)
// and once as RESOLVING_EVENTS in log-cron-incident.mjs (authoritative). Two
// copies of one rule drift, and this pair already had: the yml admitted `push`,
// the script rejected everything that was not `schedule`, so a push success span
// up a runner and then no-op'd. This test fails the build when they disagree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const script = readFileSync(join(here, "log-cron-incident.mjs"), "utf8");
const workflow = readFileSync(join(here, "..", "workflows", "log-cron-incident.yml"), "utf8");

function scriptEvents() {
  const m = script.match(/const RESOLVING_EVENTS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, "RESOLVING_EVENTS not found in log-cron-incident.mjs");
  return new Set([...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
}

function workflowEvents() {
  // Isolate the maybe_auto_resolve job's `if:` block, then pull every
  // `workflow_run.event == '<x>'` comparison out of it. Anchored on the job key
  // so record_failure's own event checks can never leak in.
  const job = workflow.split(/^  maybe_auto_resolve:$/m)[1];
  assert.ok(job, "maybe_auto_resolve job not found in log-cron-incident.yml");
  const cond = job.split(/^    runs-on:/m)[0];
  return new Set([...cond.matchAll(/workflow_run\.event\s*==\s*'([a-z_]+)'/g)].map((x) => x[1]));
}

test("auto-resolve trigger allowlist matches between the workflow yml and the script", () => {
  const fromScript = scriptEvents();
  const fromWorkflow = workflowEvents();
  assert.deepEqual(
    [...fromWorkflow].sort(),
    [...fromScript].sort(),
    "log-cron-incident.yml maybe_auto_resolve `if:` and RESOLVING_EVENTS disagree — " +
      "an event allowed by one and rejected by the other is a silent no-op",
  );
});

test("workflow_dispatch is in the allowlist (a dispatch failure can open an incident)", () => {
  // record_failure has no event filter, so a dispatch failure opens an incident.
  // Dropping dispatch from the resolve side makes the ledger a one-way ratchet.
  assert.ok(scriptEvents().has("workflow_dispatch"));
  assert.ok(workflowEvents().has("workflow_dispatch"));
});
