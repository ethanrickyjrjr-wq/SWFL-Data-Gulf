#!/usr/bin/env node
// tripwire-scan.mjs — "is anything fucked?" answered from evidence, for $0.
//
// Spec: docs/superpowers/specs/2026-07-05-spend-tripwire-design.md
// Check: spend_tripwire_live_verify
//
// Deterministic Phase-1 watchman: no LLM, no paid calls. Reads the spend
// ledger (public.api_usage_log via PostgREST), GitHub Actions state (gh CLI),
// and the repo's own guard files. Exit 0 = all green; exit 1 = at least one
// RED (so a Phase-2 cron can open an issue on failure).
//
// RED   = a rule is being violated right now, or evidence of unauthorized
//         activity — the operator must look.
// YELLOW= activity that is legitimate ONLY if the operator remembers
//         authorizing it — listed so they can recognize (or not) each item.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DAILY_CEILING_USD = 5.0; // locked decree 07/05/2026 (ingest/CLAUDE.md)
const DAY_MS = 24 * 60 * 60 * 1000;

const reds = [];
const yellows = [];
const greens = [];

// ---------- helpers ----------------------------------------------------------

function envLocal() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* handled by callers */
  }
  return out;
}

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
}

function paidWorkflows() {
  const dir = path.join(ROOT, ".github", "workflows");
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (/ANTHROPIC_API_KEY/.test(text)) {
      const nm = text.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      out.push({ file: f, name: nm ? nm[1].trim() : f });
    }
  }
  return out;
}

// ---------- check 1: today's spend vs the $5 ceiling -------------------------

async function checkSpend() {
  const env = envLocal();
  // .env.local locally; repo secrets via process.env in the hourly CI scan.
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    yellows.push("SPEND: no Supabase creds available — ledger unreadable from here");
    return;
  }
  const since = new Date().toISOString().slice(0, 10); // UTC day start
  const res = await fetch(
    `${url}/rest/v1/api_usage_log?select=call_type,cost_usd&created_at=gte.${since}T00:00:00Z`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    yellows.push(`SPEND: ledger query failed (HTTP ${res.status}) — check manually on /spend`);
    return;
  }
  const rows = await res.json();
  const byType = {};
  let total = 0;
  for (const r of rows) {
    const c = Number(r.cost_usd) || 0;
    total += c;
    byType[r.call_type] = (byType[r.call_type] || 0) + c;
  }
  const detail = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}=$${c.toFixed(2)}`)
    .join(" ");
  const line = `today (UTC) API spend $${total.toFixed(2)} across ${rows.length} calls ${detail ? `[${detail}]` : ""}`;
  if (total >= DAILY_CEILING_USD) reds.push(`SPEND ≥ $${DAILY_CEILING_USD} ceiling — ${line}`);
  else greens.push(`SPEND under ceiling — ${line}`);
}

// ---------- check 2: pulse workflows stay dark -------------------------------

function checkPulseDark() {
  let list = "";
  try {
    list = sh("gh workflow list --all");
  } catch {
    yellows.push("PULSE: gh unavailable — could not verify workflow states");
    return;
  }
  for (const wf of ["Corridor pulse weekly", "City pulse daily"]) {
    const row = list.split("\n").find((l) => l.startsWith(wf));
    if (!row) yellows.push(`PULSE: workflow '${wf}' not found in gh list`);
    else if (/disabled/.test(row)) greens.push(`PULSE DARK — '${wf}' disabled`);
    else reds.push(`PULSE ACTIVE — '${wf}' is ENABLED before the crawl4ai retrofit closed`);
  }
}

// ---------- check 3: manual dispatches of paid workflows, last 24h -----------

function checkPaidDispatches() {
  const paid = paidWorkflows();
  const names = new Set(paid.map((p) => p.name));
  let runs;
  try {
    runs = JSON.parse(
      sh("gh run list --limit 100 --json workflowName,event,conclusion,createdAt,url"),
    );
  } catch {
    yellows.push("DISPATCH: gh unavailable — could not scan recent runs");
    return;
  }
  const cutoff = Date.now() - DAY_MS;
  const hits = runs.filter(
    (r) =>
      names.has(r.workflowName) &&
      r.event === "workflow_dispatch" &&
      new Date(r.createdAt).getTime() >= cutoff,
  );
  if (hits.length === 0) greens.push("DISPATCH — zero manual runs of paid workflows in 24h");
  for (const h of hits)
    reds.push(
      `MANUAL PAID DISPATCH — '${h.workflowName}' ${h.createdAt} (${h.conclusion ?? "in progress"}) ${h.url}`,
    );

  const fails = runs.filter(
    (r) =>
      names.has(r.workflowName) &&
      r.conclusion === "failure" &&
      new Date(r.createdAt).getTime() >= cutoff,
  );
  for (const f of fails)
    yellows.push(`PAID-RUN FAILURE — '${f.workflowName}' ${f.createdAt} ${f.url}`);
}

// ---------- check 4: guard integrity -----------------------------------------

function checkGuards() {
  const hooks = [
    ".claude/hooks/check-no-paid-dispatch.mjs",
    ".claude/hooks/check-no-new-paid-surface.mjs",
    ".claude/hooks/check-no-unapproved-push.mjs",
  ];
  const valves = ["scripts/paid-run.mjs"];
  let settings = "";
  try {
    settings = fs.readFileSync(path.join(ROOT, ".claude", "settings.json"), "utf8");
  } catch {
    reds.push("GUARD: .claude/settings.json unreadable");
  }
  for (const h of hooks) {
    const onDisk = fs.existsSync(path.join(ROOT, h));
    const registered = settings.includes(path.basename(h));
    if (onDisk && registered) greens.push(`GUARD OK — ${path.basename(h)} present + registered`);
    else reds.push(`GUARD MISSING — ${h} (on disk: ${onDisk}, registered: ${registered})`);
  }
  for (const v of valves) {
    if (fs.existsSync(path.join(ROOT, v))) greens.push(`GUARD OK — ${v} present`);
    else reds.push(`GUARD MISSING — ${v}`);
  }
  // quarantine intact: no live paid key names in .env.local
  if (!fs.existsSync(path.join(ROOT, ".env.local"))) {
    yellows.push("QUARANTINE check n/a — no .env.local (CI context)");
  } else {
    const env = envLocal();
    const liveKeys = [
      "ANTHROPIC_API_KEY",
      "FIRECRAWL_API_KEY",
      "DATAFORSEO_LOGIN",
      "SPIDER_API_KEY",
      "RENTCAST_API_KEY",
      "VOYAGE_KEY",
    ].filter((k) => env[k]);
    if (liveKeys.length)
      reds.push(`QUARANTINE BROKEN — live in .env.local: ${liveKeys.join(", ")}`);
    else greens.push("QUARANTINE intact — no per-use paid key live in .env.local");
  }

  try {
    const commits = sh(
      'git log --since="24 hours ago" --oneline -- .claude/hooks scripts/paid-run.mjs scripts/safe-push.mjs ingest/lib/api_usage.py refinery/agents/anthropic.mts',
    ).trim();
    if (commits)
      yellows.push(
        `GUARD-FILE COMMITS (24h) — verify each was decreed:\n    ${commits.split("\n").join("\n    ")}`,
      );
  } catch {
    /* informational only */
  }
}

// ---------- check 5: paid-run valve audit trail ------------------------------

function checkValveAudit() {
  const audit = path.join(ROOT, "verification", "paid-runs.log");
  if (!fs.existsSync(audit)) {
    greens.push("VALVE — no paid-runs.log yet (valve never used)");
    return;
  }
  const cutoff = Date.now() - DAY_MS;
  const recent = fs
    .readFileSync(audit, "utf8")
    .split("\n")
    .filter((l) => l.trim() && new Date(l.split("\t")[0]).getTime() >= cutoff);
  if (recent.length === 0) greens.push("VALVE — zero unlocks in 24h");
  else
    yellows.push(
      `VALVE UNLOCKS (24h) — the operator should recognize each:\n    ${recent.join("\n    ")}`,
    );
}

// ---------- run ---------------------------------------------------------------

await checkSpend();
checkPulseDark();
checkPaidDispatches();
checkGuards();
checkValveAudit();

const B = "=".repeat(72);
console.log(`\n${B}\nTRIPWIRE SCAN ${new Date().toISOString()}\n${B}`);
for (const r of reds) console.log(`  RED    ${r}`);
for (const y of yellows) console.log(`  YELLOW ${y}`);
for (const g of greens) console.log(`  green  ${g}`);
console.log(
  `${B}\n${reds.length} RED · ${yellows.length} YELLOW · ${greens.length} green\n` +
    `Not visible here: Claude Code dev-session spend + console fees (console export only).\n${B}`,
);
process.exit(reds.length ? 1 : 0);
