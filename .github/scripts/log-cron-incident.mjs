#!/usr/bin/env node
// Auto-captures GHA workflow_run events into GitHub issues + a public.checks row.
// Incident state lives OFF `main`: the old auto-commit to
// docs/cron-rebuild-failures.md was GH013-rejected by the main ruleset (the bot
// has no bypass), which silently killed the whole handler. See:
// docs/superpowers/specs/2026-06-28-self-healing-automation-design.md
//
// Modes:
//   --mode=record-failure   On workflow_run.conclusion === 'failure'
//   --mode=maybe-resolve    On workflow_run.conclusion === 'success'
//                           AND workflow_run.event === 'schedule'
//
// Flags:
//   --dry-run               Print intended actions; open no issue, no check, no side effects.

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { classify, isLocalModule, classifyTermination } from "./classify-cron-failure.mjs";
import { deriveWorkflowName, fetchLogTail, manifestEntry, hasNewerRun } from "./lib/cron-run.mjs";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const mode = argv.find((a) => a.startsWith("--mode="))?.slice(7);
if (mode !== "record-failure" && mode !== "maybe-resolve") {
  console.error("Usage: --mode=record-failure|maybe-resolve [--dry-run]");
  process.exit(2);
}

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  console.error("GITHUB_EVENT_PATH not set");
  process.exit(2);
}
const run = JSON.parse(readFileSync(eventPath, "utf8")).workflow_run;
if (!run) {
  console.error("Event payload missing workflow_run");
  process.exit(2);
}

// Canonical slug: kebab-case workflow filename (matches existing convention).
// Human-readable name (run.name) is kept for issue-comment display.
const { workflowName, workflowDisplayName } = deriveWorkflowName(run);
const runId = run.id;
const runUrl = run.html_url;
const conclusion = run.conclusion;
const triggerEvent = run.event;
const headBranch = run.head_branch;
const today = new Date().toISOString().slice(0, 10);
const issueNumber = process.env.CRON_INCIDENT_ISSUE_NUMBER || "";
// Machine-readable tag embedded in every discrete incident issue title so
// closeIncidentIssue() can find it without ambiguity.
const INCIDENT_TAG = `[cron-failure:${workflowName}]`;
// Off-main incident state: one public.checks row per failing workflow.
const CHECK_PROJECT = "brain-platform";
const checkKey = cronIncidentCheckKey(workflowName);
function cronIncidentCheckKey(name) {
  return `cron_incident_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
}

if (mode === "record-failure") recordFailure();
else maybeResolve();

// ---------------------------------------------------------------------------

function recordFailure() {
  if (headBranch && headBranch !== "main")
    return log(`skip: head_branch is ${headBranch}, not main`);

  // A `timeout-minutes` kill lands as conclusion `cancelled` (corridor-pulse: 3
  // scheduled 45-minute kills, full API spend, zero rows kept, zero incidents). The
  // old `conclusion !== 'failure'` guard was blind to the whole class.
  const wf = manifestEntry(run);
  const term = classifyTermination(
    run,
    wf,
    wf?.cancel_in_progress ? hasNewerRun(run) : false, // gh call ONLY if the workflow can self-cancel
  );
  if (term.klass === "OTHER") return log(`skip: ${term.reason || `conclusion is ${conclusion}`}`);
  if (term.klass === "SUPERSEDED") return log(`skip: ${term.reason}`);

  let cls;
  let suggestedAction;
  let logTail = "";
  if (term.klass === "FAILURE") {
    logTail = fetchLogTail(runId);
    cls = classify(logTail);
    suggestedAction = cls.suggestedAction;
    if (cls.klass === "MISSING_DEP" && isLocalModule(cls.signal)) {
      suggestedAction = `\`${cls.signal}\` matches a local module in this repo — this is an import-path bug, NOT a missing PyPI package. Do not add it to requirements.txt; fix the import.`;
    }
  } else {
    // TIMEOUT / UNKNOWN_CANCEL. `gh run view --log-failed` returns nothing for a
    // cancelled run, so there is no log tail to classify — the termination reason IS
    // the diagnosis, and it carries its own evidence.
    cls = { klass: term.klass, signal: term.prescription };
    suggestedAction = term.reason;
    logTail = term.reason;
  }
  const detail = `${cls.klass}${cls.signal ? ` — ${cls.signal}` : ""} · ${runUrl}`;

  if (dryRun) {
    log(`DRY-RUN: would open check ${checkKey} (detail: ${detail})`);
    if (issueNumber) log(`DRY-RUN: would comment on issue #${issueNumber}`);
    log(
      `DRY-RUN: would open discrete issue "${INCIDENT_TAG} ${cls.klass} · ${workflowDisplayName} — ${today}"`,
    );
    return;
  }

  // The check is the durable, off-main record. The issue feed is cosmetic
  // relative to it — a GitHub API 5xx on the comment/issue calls must NOT abort
  // before the check is opened.
  openIncidentCheck(detail);
  if (issueNumber) {
    try {
      postComment(buildFailureBody(logTail));
    } catch (e) {
      log(`WARN: postComment failed (non-fatal): ${e.message}`);
    }
  }
  try {
    openIncidentIssue(logTail, cls, suggestedAction);
  } catch (e) {
    log(`WARN: openIncidentIssue failed (non-fatal): ${e.message}`);
  }
}

function maybeResolve() {
  if (conclusion !== "success") return log(`skip: conclusion is ${conclusion}`);
  if (triggerEvent !== "schedule") return log(`skip: trigger is ${triggerEvent}, not schedule`);

  if (dryRun) {
    log(`DRY-RUN: would close check ${checkKey}`);
    if (issueNumber) log(`DRY-RUN: would comment ✅ on issue #${issueNumber}`);
    log(`DRY-RUN: would close open incident issue tagged ${INCIDENT_TAG}`);
    return;
  }

  closeIncidentCheck();
  if (issueNumber)
    postComment(
      `✅ **${workflowName}** auto-resolved — ${today}\n\nNext scheduled run succeeded: ${runUrl}`,
    );
  closeIncidentIssue();
}

// ---------- public.checks (off-main incident state) ----------

function openIncidentCheck(detail) {
  // `reopen` (NOT `open`): a recurring flapper must re-open its incident check
  // after a prior success closed it. `open` is create-only and would fail on the
  // existing `done` row — silently leaving the recurrence uncaptured.
  try {
    sh(
      `node scripts/check.mjs reopen ${CHECK_PROJECT} ${checkKey} "cron failure: ${workflowName}" --detail "${detail.replace(/"/g, "'")}"`,
    );
    log(`opened/reopened check ${checkKey}`);
  } catch (e) {
    log(`could not open check ${checkKey} (non-fatal): ${e.message}`);
  }
}

function closeIncidentCheck() {
  // close patches 0 rows when the key is absent/already closed; sh throws only on
  // a real error — swallow either way so a resolve never reddens the listener.
  // The incident check is signal-less (manual tier), so the proof gate needs
  // --evidence: the succeeding scheduled-run URL is exactly that recorded pointer.
  // (When workflow_success graduates from recognized-but-next, this can become a
  // stored signal that check.mjs re-verifies at close instead.)
  try {
    sh(
      `node scripts/check.mjs close ${checkKey} --evidence "next scheduled run succeeded ${runUrl}"`,
    );
    log(`closed check ${checkKey}`);
  } catch (e) {
    log(`could not close check ${checkKey} (non-fatal): ${e.message}`);
  }
}

// ---------- issue comments ----------

function buildFailureBody(logTail) {
  const repo = process.env.GITHUB_REPOSITORY || "";
  const ledgerUrl = repo
    ? `https://github.com/${repo}/blob/main/docs/cron-rebuild-failures.md`
    : "docs/cron-rebuild-failures.md";
  return [
    `**${workflowDisplayName}** (\`${workflowName}\`) failed — ${today}`,
    ``,
    `- Run: ${runUrl}`,
    `- Status: \`OPEN\` (auto-captured; check \`${checkKey}\`)`,
    `- Ledger (historical): ${ledgerUrl}`,
    ``,
    `<details><summary>log tail (last 200 lines)</summary>`,
    ``,
    "```",
    logTail.slice(-4000),
    "```",
    `</details>`,
  ].join("\n");
}

function postComment(body) {
  const tmp = resolve(process.cwd(), `_incident-comment-${Date.now()}.md`);
  writeFileSync(tmp, body, "utf8");
  try {
    sh(`gh issue comment ${issueNumber} -F "${tmp}"`);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

// ---------- discrete incident issues (GitHub Projects) ----------

function openIncidentIssue(logTail, cls, suggestedAction) {
  // Idempotent: one OPEN incident issue per workflow. A flapper failing repeatedly
  // refreshes the check + sticky comment; it must not stack duplicate issues
  // (this path now runs on every failure — it was dead code while the push threw).
  try {
    const found = execSync(
      `gh issue list --label "cron-failure" --state open --search "${INCIDENT_TAG} in:title" --json number --limit 1`,
      { encoding: "utf8", env: process.env },
    );
    if (JSON.parse(found.trim() || "[]").length) {
      return log(`incident issue already open for ${workflowName}; not duplicating`);
    }
  } catch (e) {
    log(`incident-issue dedup check failed (proceeding to create): ${e.message}`);
  }
  const title = `${INCIDENT_TAG} ${cls.klass} · ${workflowDisplayName} — ${today}`;
  const body = [
    `**${workflowDisplayName}** failed on \`${today}\`.`,
    ``,
    `- Run: ${runUrl}`,
    `- Workflow: \`${workflowName}\``,
    `- Class: \`${cls.klass}\`${cls.signal ? ` (${cls.signal})` : ""}`,
    `- Check: \`${checkKey}\` (open in public.checks)`,
    ``,
    `**Suggested action:** ${suggestedAction}`,
    ``,
    `<details><summary>log tail (last 200 lines)</summary>`,
    ``,
    "```",
    logTail.slice(-4000),
    "```",
    `</details>`,
    ``,
    `_Auto-opened by log-cron-incident. Will auto-close when the next scheduled run succeeds._`,
  ].join("\n");
  const tmp = resolve(process.cwd(), `_incident-issue-body.md`);
  writeFileSync(tmp, body, "utf8");
  try {
    const out = execSync(
      `gh issue create --title "${title.replace(/"/g, '\\"')}" --label "cron-failure" --body-file "${tmp}"`,
      { encoding: "utf8", env: process.env },
    );
    const issueUrl = out.trim();
    log(`opened incident issue: ${issueUrl}`);
    // Add directly to the Ops Incidents project (project 3, owner ethanrickyjrjr-wq)
    try {
      const repo = process.env.GITHUB_REPOSITORY || "";
      const owner = repo.split("/")[0] || "ethanrickyjrjr-wq";
      execSync(`gh project item-add 3 --owner ${owner} --url "${issueUrl}"`, {
        encoding: "utf8",
        env: process.env,
      });
      log(`added to Ops Incidents project`);
    } catch (e) {
      log(`could not add to project: ${e.message}`);
    }
  } catch (e) {
    log(`could not open incident issue: ${e.message}`);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

function closeIncidentIssue() {
  try {
    const out = execSync(
      `gh issue list --label "cron-failure" --state open --search "${INCIDENT_TAG} in:title" --json number --limit 1`,
      { encoding: "utf8", env: process.env },
    );
    const issues = JSON.parse(out.trim() || "[]");
    if (!issues.length) return log(`no open incident issue for ${workflowName}`);
    const num = issues[0].number;
    sh(`gh issue close ${num} --comment "Auto-resolved: next scheduled run succeeded ${runUrl}"`);
    log(`closed incident issue #${num}`);
  } catch (e) {
    log(`could not close incident issue: ${e.message}`);
  }
}

// ---------- shell ----------

function sh(cmd) {
  execSync(cmd, { stdio: "inherit", env: process.env });
}

function log(msg) {
  console.log(`[log-cron-incident] ${msg}`);
}
