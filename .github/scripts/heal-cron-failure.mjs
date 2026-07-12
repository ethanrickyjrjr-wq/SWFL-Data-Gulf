#!/usr/bin/env node
// Leveled self-healing for cron failures. Reacts to a failed `workflow_run`.
//
// Modes:
//   --mode=triage    Classify the failed run; emit class/should_retry/needs_llm to $GITHUB_OUTPUT.
//   --mode=retry     L0: `gh run rerun --failed` ONCE (guarded: run_attempt === 1).
//   --mode=diagnose  L2: resolve pipeline source + Haiku narrative -> comment on the incident issue.
//
// The LLM never writes code. L0 retries at most once. Deterministic diagnosis
// (secret/dep/lockfile/action) lives in log-cron-incident.mjs, which owns the issue.
//
// Spec: docs/superpowers/specs/2026-06-08-leveled-cron-self-healing-design.md

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  appendFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import {
  classify,
  isFreshnessProbe,
  shouldRetry,
  needsLlm,
  classifyTermination,
} from "./classify-cron-failure.mjs";
import { deriveWorkflowName, fetchLogTail, manifestEntry, hasNewerRun } from "./lib/cron-run.mjs";
import { autoRetryAllowed } from "../../scripts/lib/watch-manifest.mjs";

const argv = process.argv.slice(2);
const mode = argv.find((a) => a.startsWith("--mode="))?.slice(7);
if (!["triage", "retry", "diagnose"].includes(mode)) {
  console.error("Usage: --mode=triage|retry|diagnose");
  process.exit(2);
}

// Two run sources: workflow_dispatch supplies a RUN_ID env; workflow_run reads the event file.
function loadRun() {
  if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    const id = process.env.RUN_ID;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!id || !repo) return null;
    return JSON.parse(
      execSync(`gh api /repos/${repo}/actions/runs/${id}`, { encoding: "utf8", env: process.env }),
    );
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  return JSON.parse(readFileSync(eventPath, "utf8")).workflow_run ?? null;
}

const run = loadRun();
if (!run) {
  console.error("Could not load workflow run (missing event payload or RUN_ID)");
  process.exit(2);
}

const { workflowName, workflowDisplayName } = deriveWorkflowName(run);
const INCIDENT_TAG = `[cron-failure:${workflowName}]`;

// Defense in depth — Daily Brain Rebuild owns master-freeze-watchdog; never auto-heal it.
const EXCLUDED = workflowName === "daily-rebuild";
const onMain = !run.head_branch || run.head_branch === "main";

if (mode === "triage") triage();
else if (mode === "retry") retry();
else diagnose();

// ---------------------------------------------------------------------------

function triage() {
  let klass = "UNKNOWN";
  let signal = "";
  let should = false;
  let llm = false;

  const wf = manifestEntry(run);
  const term = classifyTermination(
    run,
    wf,
    wf?.cancel_in_progress ? hasNewerRun(run) : false, // gh call ONLY if the workflow can self-cancel
  );

  if (term.klass === "FAILURE" && onMain && !EXCLUDED) {
    const c = classify(fetchLogTail(run.id));
    klass = c.klass;
    signal = c.signal;
    // MONEY GUARD, three ways: only TRANSIENT retries; only the first attempt; and
    // NEVER a paid workflow or a sender (a re-run re-spends / re-sends). The watched
    // set went from 27 to ~80 workflows in Phase 3a — this is what keeps that safe.
    should =
      shouldRetry(klass) &&
      run.run_attempt === 1 &&
      !isFreshnessProbe(workflowName) &&
      autoRetryAllowed(wf);
    // A "transient" that already retried and failed again clearly wasn't transient.
    llm = needsLlm(klass) || (klass === "TRANSIENT" && run.run_attempt > 1);
  } else if ((term.klass === "TIMEOUT" || term.klass === "UNKNOWN_CANCEL") && onMain && !EXCLUDED) {
    // MONEY GUARD: a run that hit its ceiling already spent its full budget. Never
    // re-run it (corridor-pulse burned 3 x 45 min of paid web_search and kept zero
    // rows). And no LLM: a cancelled run has no failed-log to read, and the
    // termination reason already carries its own evidence.
    klass = term.klass;
    signal = term.prescription;
    should = false;
    llm = false;
    log(term.reason);
  } else {
    log(
      `triage skipped: termination=${term.klass} conclusion=${run.conclusion} onMain=${onMain} excluded=${EXCLUDED}`,
    );
  }

  writeOutputs({
    class: klass,
    signal: String(signal)
      .replace(/[\r\n]+/g, " ")
      .slice(0, 120),
    should_retry: String(should),
    needs_llm: String(llm),
  });
  log(
    `triage: class=${klass} should_retry=${should} needs_llm=${llm} (attempt ${run.run_attempt})`,
  );
}

function retry() {
  if (run.run_attempt !== 1)
    return log(`skip retry: run_attempt=${run.run_attempt} (already retried)`);
  if (isFreshnessProbe(workflowName))
    return log("skip retry: freshness probe (a real stale-data signal)");
  // Defense in depth: a stale should_retry output can never re-run a killed or
  // paid job. autoRetryAllowed is the manifest money guard; the conclusion guard
  // makes "a cancelled/timed-out run is never re-run" structural.
  const wf = manifestEntry(run);
  if (!autoRetryAllowed(wf))
    return log(
      `skip retry: ${wf?.paid ? "PAID workflow — a re-run re-spends" : "send-side-effect or unknown workflow"}`,
    );
  if (run.conclusion !== "failure")
    return log(
      `skip retry: conclusion=${run.conclusion} — a cancelled/timed-out run is never re-run`,
    );
  try {
    sh(`gh run rerun ${run.id} --failed`);
    log(`L0: re-ran failed jobs of run ${run.id}`);
  } catch (e) {
    log(`L0 rerun failed (non-fatal): ${e.message}`);
  }
}

async function diagnose() {
  const logTail = fetchLogTail(run.id);
  const c = classify(logTail);
  const code = resolvePipelineSource();
  // Haiku narrative + (for DATA_EMPTY only) Firecrawl URL rediscovery run in
  // parallel; both degrade to null without their respective API key.
  const [llmText, rediscovery] = await Promise.all([
    haikuDiagnose(c, logTail, code).catch((e) => {
      log(`Haiku diagnosis failed (non-fatal): ${e.message}`);
      return null;
    }),
    rediscoverUrls(c, code).catch((e) => {
      log(`URL rediscovery failed (non-fatal): ${e.message}`);
      return null;
    }),
  ]);
  commentOnIssue(buildComment(c, llmText, code.path, rediscovery));
}

// ---------- L2: resolve the failing pipeline's source from the workflow YAML ----------

function resolvePipelineSource() {
  // Self-maintaining: parse the failing workflow's `run:` commands for an
  // ingest.pipelines.<x> / ingest/pipelines/<x> reference. Beats a hand-kept
  // slug->dir map that rots (ingest-fred-g17 -> fred_g17, zori-tier1/2 -> zori_swfl).
  const wf = resolve(process.cwd(), `.github/workflows/${workflowName}.yml`);
  let dir = null;
  if (existsSync(wf)) {
    const yaml = readFileSync(wf, "utf8");
    const m =
      yaml.match(/ingest[./]pipelines[./]([A-Za-z0-9_]+)/) ||
      yaml.match(/ingest\/pipelines\/([A-Za-z0-9_]+)/);
    if (m) dir = `ingest/pipelines/${m[1]}`;
  }
  if (!dir || !existsSync(resolve(process.cwd(), dir))) {
    return { path: dir, code: "" };
  }
  // Prefer the entrypoint-ish files, else the first .py.
  const root = resolve(process.cwd(), dir);
  const prefer = ["__main__.py", "pipeline.py", "fetcher.py", "__init__.py", "run.py"];
  const pys = readdirSync(root).filter((f) => f.endsWith(".py"));
  const pick = prefer.find((p) => pys.includes(p)) || pys[0];
  if (!pick) return { path: dir, code: "" };
  let code = "";
  try {
    code = readFileSync(resolve(root, pick), "utf8").slice(0, 6000);
  } catch {
    /* best-effort */
  }
  return { path: `${dir}/${pick}`, code };
}

// ---------- L2: Haiku narrative (deterministic-only if no API key) ----------

async function haikuDiagnose(c, logTail, code) {
  if (!process.env.ANTHROPIC_API_KEY) {
    log("no ANTHROPIC_API_KEY set — posting deterministic diagnosis only");
    return null;
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const system =
    "You are an SRE assistant. A scheduled data-ingest job failed. Given the failure log tail and the relevant pipeline source, produce a terse diagnosis. Output EXACTLY three sections, each one short line, with these literal headers and nothing else (no preamble, no markdown headers, no code fences):\n" +
    "DIAGNOSIS: <what failed, one sentence>\n" +
    "LIKELY CAUSE: <root cause, one sentence>\n" +
    "HUMAN ACTION: <one or two concrete steps a developer should take>";
  const user =
    `Workflow: ${workflowDisplayName} (${workflowName})\n` +
    `Deterministic classifier: ${c.klass}${c.signal ? ` (${c.signal})` : ""}\n\n` +
    `--- LOG TAIL ---\n${logTail.slice(-3000)}\n\n` +
    `--- PIPELINE SOURCE (${code.path || "not resolved"}) ---\n${code.code || "(could not resolve pipeline source)"}`;
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ---------- L2: DATA_EMPTY URL rediscovery (Firecrawl v2 map; advisory only) ----------

// A 0-row failure is usually a dead/moved source URL. Map the source's own domain
// and surface candidate replacement URLs on the incident issue. We NEVER re-point
// the source or write code — a human verifies and wires the swap. Degrades to null
// without FIRECRAWL_API_KEY (same pattern as the Haiku key).
async function rediscoverUrls(c, code) {
  if (c.klass !== "DATA_EMPTY") return null;
  if (!process.env.FIRECRAWL_API_KEY) {
    log("no FIRECRAWL_API_KEY set — skipping DATA_EMPTY URL rediscovery");
    return null;
  }
  const urlMatch = (code.code || "").match(/https?:\/\/[^\s"'`)]+/);
  if (!urlMatch) {
    log("DATA_EMPTY: no source URL found in pipeline code — skipping rediscovery");
    return null;
  }
  let origin;
  try {
    origin = new URL(urlMatch[0]).origin;
  } catch {
    return null;
  }
  const search =
    workflowDisplayName
      .replace(/[-_]+/g, " ")
      .replace(/\b(weekly|monthly|daily|annual|quarterly|tier ?\d+|fetch|load)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || undefined;
  // Firecrawl v2 map: POST /v2/map, Bearer auth, body { url, search?, limit?, sitemap? },
  // response { success, links: [{ url, title?, description? }] }. Verified live 2026-06-09.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: origin, search, limit: 20, sitemap: "include" }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      log(`Firecrawl map HTTP ${res.status} — rediscovery skipped`);
      return null;
    }
    const data = await res.json();
    const links = (Array.isArray(data.links) ? data.links : [])
      .filter((l) => l && l.url)
      .slice(0, 5);
    return links.length ? { origin, search, candidates: links } : null;
  } finally {
    clearTimeout(timer);
  }
}

function buildComment(c, llmText, sourcePath, rediscovery) {
  const lines = [
    `### 🩺 Auto-diagnosis — \`${c.klass}\``,
    "",
    c.signal ? `**Signal:** \`${c.signal}\`` : "",
    sourcePath ? `**Source inspected:** \`${sourcePath}\`` : "",
    "",
  ];
  if (llmText) {
    lines.push(llmText, "");
  } else {
    lines.push(`**Suggested action:** ${c.suggestedAction}`, "");
  }
  if (rediscovery && rediscovery.candidates.length) {
    lines.push(
      `**🔎 Candidate replacement URLs** — auto-discovered by mapping \`${rediscovery.origin}\`${rediscovery.search ? ` (ranked for "${rediscovery.search}")` : ""}. Verify before wiring; do not blind-swap:`,
      ...rediscovery.candidates.map((l) => `- ${l.url}${l.title ? ` — ${l.title}` : ""}`),
      "",
    );
  }
  lines.push(
    "_Auto-generated by heal-cron-failure (L2). The LLM does not write code; verify before acting._",
  );
  return lines.filter((l) => l !== null).join("\n");
}

// ---------- issue lookup (tolerant of the logger-vs-heal creation race) ----------

function findOpenIssue(retries = 6, delayMs = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      const out = execSync(
        `gh issue list --label "cron-failure" --state open --search "${INCIDENT_TAG} in:title" --json number --limit 1`,
        { encoding: "utf8", env: process.env },
      );
      const arr = JSON.parse(out.trim() || "[]");
      if (arr.length) return arr[0].number;
    } catch (e) {
      log(`issue search failed (attempt ${i + 1}): ${e.message}`);
    }
    if (i < retries - 1) sleep(delayMs);
  }
  return null;
}

function commentOnIssue(body) {
  const num = findOpenIssue();
  if (!num)
    return log(
      "no open incident issue found (logger race or logger disabled); diagnosis not posted",
    );
  const tmp = resolve(process.cwd(), `_heal-comment-${run.id}.md`);
  writeFileSync(tmp, body, "utf8");
  try {
    sh(`gh issue comment ${num} -F "${tmp}"`);
    log(`L2: posted diagnosis on issue #${num}`);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

// ---------- helpers ----------

function writeOutputs(obj) {
  const file = process.env.GITHUB_OUTPUT;
  const text = Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  if (file) appendFileSync(file, text + "\n", "utf8");
  else console.log(text);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sh(cmd) {
  execSync(cmd, { stdio: "inherit", env: process.env });
}

function log(msg) {
  console.log(`[heal-cron-failure] ${msg}`);
}
