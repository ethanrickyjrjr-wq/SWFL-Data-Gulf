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
import { pathToFileURL } from "node:url";
import { MANIFEST_PATH, SHOULD_BE_DARK, zombieCrons, darkDrift } from "./lib/watch-manifest.mjs";
import { scanMachine } from "./egress-burner-scan.mjs";
import { canReadEgress, TOKEN_ENV as EGRESS_TOKEN_ENV } from "./supabase-egress-read.mjs";

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

// The manifest is ONE truth with three consumers: the two watcher YAMLs (codegen),
// this scan, and (Phase 3c) doctor. Regenerate: node scripts/build-watch-lists.mjs --write --with-state
function watchManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), "utf8"));
  } catch {
    yellows.push(
      `MANIFEST: ${MANIFEST_PATH} unreadable — run \`node scripts/build-watch-lists.mjs --write --with-state\``,
    );
    return [];
  }
}

// Live workflow state beats the committed snapshot: `gh workflow enable` changes it
// out-of-band with no commit. Falls back to the manifest's last observed value.
function withLiveState(entries) {
  let raw;
  try {
    raw = sh(
      'gh api "repos/:owner/:repo/actions/workflows?per_page=100" --paginate --jq ".workflows[] | [.path, .state] | @tsv"',
    );
  } catch {
    yellows.push("STATE: gh unavailable — using the manifest's last observed workflow states");
    return entries;
  }
  const states = {};
  for (const line of raw.trim().split("\n").filter(Boolean)) {
    const [p, state] = line.split("\t");
    states[p] = state;
  }
  return entries.map((e) => {
    const s = states[`.github/workflows/${e.file}`];
    return s === undefined ? e : { ...e, disabled: s !== "active" };
  });
}

// PAID = the workflow passes secrets.ANTHROPIC_API_KEY into a step env. The old bare
// /ANTHROPIC_API_KEY/ substring test flagged tripwire-hourly.yml:9 and weekly-read.yml:8
// — the two files whose comments say "No ANTHROPIC_API_KEY here" — so a manual dispatch
// of either raised a spurious MANUAL PAID DISPATCH red. One authority now: the manifest.
function paidWorkflows() {
  return watchManifest()
    .filter((e) => e.paid)
    .map((e) => ({ file: e.file, name: e.name }));
}

// ---------- decreed-dispatch recognition --------------------------------------
// Spec check 3's RED had two arms: "the operator did it (they'll recognize it)
// or a bypass". RULE 1's locked targeted-rebuild procedure (pack_id=<brain-id>)
// made session dispatches routine, so the recognition arm needs a
// machine-checkable channel or the tripwire is red all day on decreed work
// (10 dispatches on 07/12/2026 = 24h of hourly RED + issue #106 spam). Same
// covenant as accepted_live_keys: a committed, reviewable acceptance in
// verification/tripwire-accepted.json silences the RED and grants NOTHING —
// an unlisted dispatch is still the bypass arm, RED.
function acceptedDispatchRuns() {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(ROOT, "verification", "tripwire-accepted.json"), "utf8"))
        .accepted_dispatch_runs ?? []
    );
  } catch {
    return [];
  }
}

// Pure — exported for the unit test, like classifyWorktree.
export function classifyDispatch({ url, acceptedUrls }) {
  return acceptedUrls.includes(url) ? "yellow" : "red";
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

// Was a hardcoded ["Corridor pulse weekly"] literal, which is exactly how "City pulse
// daily" — legitimately re-enabled — produced a 6-day false RED (07/11/2026). The
// declaration now lives in ONE place: SHOULD_BE_DARK in scripts/lib/watch-manifest.mjs.
function checkPulseDark() {
  const entries = withLiveState(watchManifest());
  const declared = entries.filter((e) => e.should_be_dark);
  if (declared.length === 0) {
    yellows.push(
      "PULSE: no workflow is declared dark — check SHOULD_BE_DARK in scripts/lib/watch-manifest.mjs",
    );
    return;
  }
  for (const e of darkDrift(entries)) {
    reds.push(`PULSE ACTIVE — '${e.name}' (${e.file}) is ENABLED. ${SHOULD_BE_DARK[e.file]}`);
  }
  for (const e of declared.filter((e) => e.disabled === true)) {
    greens.push(`PULSE DARK — '${e.name}' disabled at the API`);
  }
  for (const e of declared.filter((e) => e.disabled === null)) {
    yellows.push(`PULSE: state unknown for '${e.name}' — manifest has no observed state`);
  }
}

// ---------- check 2b: zombie crons (the class NOTHING else can see) -----------
// Disabled at the GitHub API while an uncommented `cron:` still sits in source. Both
// the registry and the YAML claim these are scheduled, the freshness probe expects
// fresh rows from them, and `gh workflow enable` resumes them instantly with no
// code-level guard. Phase 2 CANNOT see this class (--static reads files, --live reads
// data_lake; neither reads workflow state). Live 07/11/2026: 4, orphaning 6 registry
// entries. YELLOW, not RED: a deliberately-disabled workflow is precisely tripwire's
// definition of yellow — "legitimate only if the operator remembers authorizing it".
function checkZombieCrons() {
  const zombies = zombieCrons(withLiveState(watchManifest()));
  if (zombies.length === 0) {
    greens.push("ZOMBIE CRON — none: every disabled workflow also has its cron commented out");
    return;
  }
  for (const z of zombies) {
    yellows.push(
      `ZOMBIE CRON — '${z.name}' (${z.file}) is disabled at the API but its cron is LIVE in source. ` +
        `Comment the cron out, or re-enable the workflow. Until then the registry expects rows it will never get.`,
    );
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
  const accepted = acceptedDispatchRuns();
  const acceptedUrls = accepted.map((a) => a.run_url);
  for (const h of hits) {
    const line = `'${h.workflowName}' ${h.createdAt} (${h.conclusion ?? "in progress"}) ${h.url}`;
    if (classifyDispatch({ url: h.url, acceptedUrls }) === "yellow") {
      const note = accepted.find((a) => a.run_url === h.url)?.note;
      yellows.push(
        `DECREED DISPATCH (accepted in tripwire-accepted.json) — ${line}${note ? ` — ${note}` : ""}`,
      );
    } else {
      reds.push(`MANUAL PAID DISPATCH — ${line}`);
    }
  }

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
    // Operator can accept a key as deliberately live (committed, reviewable):
    let accepted = [];
    try {
      accepted =
        JSON.parse(
          fs.readFileSync(path.join(ROOT, "verification", "tripwire-accepted.json"), "utf8"),
        ).accepted_live_keys ?? [];
    } catch {
      /* no acceptance file → nothing accepted */
    }
    const liveKeys = [
      "ANTHROPIC_API_KEY",
      "FIRECRAWL_API_KEY",
      "DATAFORSEO_LOGIN",
      "SPIDER_API_KEY",
      "RENTCAST_API_KEY",
      "VOYAGE_KEY",
    ].filter((k) => env[k]);
    const unexpected = liveKeys.filter((k) => !accepted.includes(k));
    const ok = liveKeys.filter((k) => accepted.includes(k));
    if (unexpected.length)
      reds.push(`QUARANTINE BROKEN — live in .env.local: ${unexpected.join(", ")}`);
    if (ok.length)
      yellows.push(
        `LIVE BY OPERATOR ACCEPTANCE (tripwire-accepted.json) — ${ok.join(", ")}; valve covenant still applies`,
      );
    if (!unexpected.length && !ok.length)
      greens.push("QUARANTINE intact — no per-use paid key live in .env.local");
    else if (!unexpected.length)
      greens.push("QUARANTINE — no UNACCEPTED paid key live in .env.local");
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

// ---------- check 6: dangling git worktrees ------------------------------

const WORKTREE_STALE_HOURS = 6; // a `land`ed-but-unpushed worktree past this age is a RED

// Pure — given ahead-count and age, what color is this worktree? Exported for
// the unit test; the git-shelling caller below is integration-only like its
// siblings in this file.
export function classifyWorktree({ aheadCount, ageHours, staleHoursThreshold }) {
  if (aheadCount === 0) return "green"; // fully landed — safe to `git worktree remove`
  return ageHours >= staleHoursThreshold ? "red" : "yellow";
}

function checkWorktrees() {
  let raw = "";
  try {
    raw = sh("git worktree list --porcelain");
  } catch {
    yellows.push("WORKTREES: `git worktree list` failed — could not scan");
    return;
  }
  const entries = raw.trim().split(/\n\n+/).filter(Boolean);
  let sawNonMain = false;

  for (const entry of entries) {
    const lines = entry.split("\n");
    const worktreeLine = lines.find((l) => l.startsWith("worktree "));
    if (!worktreeLine) continue;
    const dir = worktreeLine.slice("worktree ".length).trim();
    if (path.resolve(dir) === ROOT) continue; // skip the main checkout itself
    sawNonMain = true;

    const branchLine = lines.find((l) => l.startsWith("branch "));
    const branch = branchLine ? branchLine.slice("branch ".length).trim() : null;
    const detached = lines.some((l) => l === "detached");
    const branchLabel = branch ?? (detached ? "detached HEAD" : "unknown");

    let headSha = "";
    try {
      headSha = sh(`git -C "${dir}" rev-parse HEAD`).trim();
    } catch {
      yellows.push(`WORKTREE: ${dir} — could not read HEAD`);
      continue;
    }

    let aheadCount = 0;
    try {
      const ahead = sh(`git log --oneline origin/main..${headSha}`).trim();
      aheadCount = ahead ? ahead.split("\n").length : 0;
    } catch {
      yellows.push(`WORKTREE: ${dir} (${branchLabel}) — could not diff against origin/main`);
      continue;
    }

    let ageHours = 0;
    try {
      const epochSec = Number(sh(`git -C "${dir}" log -1 --format=%ct`).trim());
      ageHours = (Date.now() - epochSec * 1000) / (60 * 60 * 1000);
    } catch {
      yellows.push(`WORKTREE: ${dir} (${branchLabel}) — could not read last commit time`);
      continue;
    }

    const color = classifyWorktree({
      aheadCount,
      ageHours,
      staleHoursThreshold: WORKTREE_STALE_HOURS,
    });
    const label = `${dir} (${branchLabel}) — ${aheadCount} commit(s) ahead of origin/main, last commit ${ageHours.toFixed(1)}h ago`;
    if (color === "green") greens.push(`WORKTREE — ${label} — fully landed, safe to remove`);
    else if (color === "yellow") yellows.push(`WORKTREE ACTIVE — ${label} — likely a live session`);
    else reds.push(`WORKTREE STALE — ${label} — land it or abandon it`);
  }

  if (!sawNonMain) greens.push("WORKTREES — none besides the main checkout");
}

// The 07/21/2026 egress incident: the lake MCP server burned ~300 GB/day for
// DAYS and was caught by a BILL, not a monitor. Nothing on this machine watched
// for it. This folds that detector into the scan the operator already reads at
// every session start — presence-based (live process / unguarded copy /
// spawning config / disarmed guard), because egress is a cumulative counter
// that cannot fall mid-cycle, so the bill can never be the proof.
function checkEgressBurner() {
  const result = scanMachine(ROOT);
  if (result.level === "green") {
    greens.push(
      "EGRESS BURNER — none: no live process, no unguarded copy, no spawning config, guard armed",
    );
    return;
  }
  for (const f of result.findings) reds.push(`EGRESS — ${f}`);
}

// Every "egress" number spoken on this platform to date — ~300 GB/day of Storage
// snapshot re-downloads, ~241 kB per page render of PostgREST payload — has been
// payload arithmetic, not a bill. Two sessions produced two honest, verified,
// mutually-irrelevant figures on 07/21/2026 and it read as days of contradiction.
// Vendor-verified same day: the Management API has NO egress endpoint (the words
// "egress" and "bandwidth" appear zero times in its OpenAPI spec); served bytes
// are reachable only via the log-query endpoint, which needs a token nobody has
// minted. Surfaced as YELLOW so the gap is VISIBLE every session instead of
// quietly persisting — unknown egress is not zero egress.
function checkEgressReadable() {
  if (canReadEgress(process.env)) {
    greens.push("EGRESS READABLE — Management token present; served bytes can be measured");
    return;
  }
  yellows.push(
    `EGRESS UNKNOWN — no ${EGRESS_TOKEN_ENV}, so the real served-bytes number has NEVER been ` +
      `read. Every egress figure quoted so far is payload arithmetic. Mint a token with the ` +
      `analytics_usage_read scope, then: node scripts/supabase-egress-read.mjs --ref <ref> --sql "..."`,
  );
}

// ---------- run ---------------------------------------------------------------

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  await checkSpend();
  checkPulseDark();
  checkZombieCrons();
  checkPaidDispatches();
  checkGuards();
  checkValveAudit();
  checkWorktrees();
  checkEgressBurner();
  checkEgressReadable();

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
}
