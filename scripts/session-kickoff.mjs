#!/usr/bin/env node
// Called by the SessionStart hook (print-session-log.mjs) to print the
// KICKOFF BLOCK — last ship, open checks, build queue — as a ready-to-paste
// first message for a new Claude session. All data fetches are best-effort;
// any failure degrades gracefully rather than blocking session start.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chronicFlappers } from "../.github/scripts/lib/ledger-flap.mjs";
import { writeTodayMd } from "./assistant-lib.mjs";
import { briefKickoffLines, repoSlugFromRemoteUrl } from "./chief-of-staff-lib.mjs";

const ROOT = process.cwd();
const SPECS_DIR = resolve(ROOT, "docs/superpowers/specs");
const TODAY_PATH = resolve(ROOT, "_ASSISTANT/TODAY.md");
const QUEUE_PATH = resolve(ROOT, "_AUDIT_AND_ROADMAP/build-queue.md");
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");
const LOG_PATH = resolve(ROOT, "SESSION_LOG.md");
const LEDGER_PATH = resolve(ROOT, "docs/cron-rebuild-failures.md");

function specClutterLine() {
  try {
    const all = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    return `Spec clutter : ${all.length} specs · run \`node scripts/assistant-weekly.mjs\` to clean\n`;
  } catch {
    return "";
  }
}

function todayMdBlock(today) {
  try {
    if (!existsSync(TODAY_PATH)) return "";
    const content = readFileSync(TODAY_PATH, "utf8");
    if (!content.startsWith(`# ${today}`)) return ""; // stale
    return `\n--- TODAY.md ---\n${content}\n`;
  } catch {
    return "";
  }
}

function parseTomlStr(toml, key) {
  const m = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return m?.[1] ?? null;
}

function extractLastShip(logText) {
  const parts = logText.split(/\n(?=## \d{4}-\d{2}-\d{2})/);
  const first = parts.find((p) => /^## \d{4}-\d{2}-\d{2}/.test(p)) ?? "";
  return (first.match(/^## [^\n]+/)?.[0] ?? "").replace(/^## /, "");
}

function parseBuildQueue(text) {
  const building = [],
    next = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^-\s*\[~\]/.test(t)) building.push(t.replace(/^-\s*\[~\]\s*/, ""));
    else if (/^-\s*\[ \]/.test(t)) next.push(t.replace(/^-\s*\[ \]\s*/, ""));
  }
  return { building, next };
}

function fmtDate(iso) {
  if (!iso) return "?";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

async function getOpenChecks(sbUrl, sbKey) {
  const headers = { apikey: sbKey };
  headers["Authorization"] = "Bearer " + sbKey;
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/checks?state=eq.open&select=check_key,label,resolution,due_at&order=due_at.asc.nullslast&limit=200`,
      { headers },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getOpenRecordsRequests(sbUrl, sbKey) {
  const headers = { apikey: sbKey, Authorization: "Bearer " + sbKey };
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/records_requests?state=in.(filed,acknowledged,cost_quoted,cost_approved,fulfilled)&select=request_key,target_agency,state,follow_up_days,filed_at,last_contact_at&order=last_contact_at.asc.nullsfirst&limit=200`,
      { headers },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Requests past their follow_up_days with no contact — the "gone quiet" nudge.
function summariseQuietRequests(rows) {
  if (!rows) return "(could not reach Supabase)";
  const now = Date.now();
  const quiet = rows.filter((r) => {
    const since = r.last_contact_at ?? r.filed_at;
    if (!since) return false;
    return (now - new Date(since).getTime()) / 86400000 >= (r.follow_up_days ?? 14);
  });
  if (rows.length === 0) return "none open ✓";
  if (quiet.length === 0) return `${rows.length} open, none quiet ✓`;
  return (
    `${rows.length} open, ${quiet.length} gone quiet:\n    · ` +
    quiet
      .slice(0, 6)
      .map((r) => {
        const since = r.last_contact_at ?? r.filed_at;
        const days = Math.floor((now - new Date(since).getTime()) / 86400000);
        return `${r.request_key} — ${r.target_agency} (${r.state}, ${days}d quiet)`;
      })
      .join("\n    · ")
  );
}

// Newest open morning-brief issue -> top close-candidate lines. Best-effort:
// public-repo unauthenticated REST; ANY failure returns "" (never block start).
async function morningBriefBlock() {
  try {
    const remote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
    }).trim();
    const slug = repoSlugFromRemoteUrl(remote);
    if (!slug) return "";
    const res = await fetch(
      `https://api.github.com/repos/${slug}/issues?labels=morning-brief&state=open&per_page=1`,
      { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return "";
    const [issue] = await res.json();
    if (!issue?.body) return "";
    const lines = briefKickoffLines(issue.body, { max: 5 });
    if (!lines.length) return "";
    return (
      `Morning brief: ${issue.title} (#${issue.number}) — close candidates:\n` +
      lines.map((l) => `    ${l}`).join("\n") +
      `\n    ^ verify then \`node scripts/check.mjs close <key> --evidence "<sha>"\`\n`
    );
  } catch {
    return "";
  }
}

function summariseChecks(rows) {
  if (!rows || rows.length === 0) return "none open ✓";
  return rows
    .map((r) => {
      const due = r.due_at ? ` [${r.resolution}, due ${fmtDate(r.due_at)}]` : ` [${r.resolution}]`;
      return r.label + due;
    })
    .join("\n    · ");
}

async function main() {
  const banner = "=".repeat(72);
  const today = new Date().toISOString().slice(0, 10);

  // Last ship from SESSION_LOG
  let lastShip = "(none found)";
  try {
    lastShip = extractLastShip(readFileSync(LOG_PATH, "utf8"));
  } catch {
    /* skip */
  }

  // Open checks from Supabase REST
  let checksLine = "(secrets not found)";
  let allCheckRows = null;
  try {
    const secrets = readFileSync(SECRETS_PATH, "utf8");
    const sbUrl =
      parseTomlStr(secrets, "SUPABASE_URL") ?? parseTomlStr(secrets, "BRAINS_SUPABASE_URL");
    const sbKey =
      parseTomlStr(secrets, "SUPABASE_SERVICE_KEY") ??
      parseTomlStr(secrets, "BRAINS_SUPABASE_SERVICE_KEY");
    if (sbUrl && sbKey) {
      allCheckRows = await getOpenChecks(sbUrl, sbKey);
      checksLine =
        allCheckRows === null
          ? "(could not reach Supabase)"
          : `${allCheckRows.length} open\n    · ${summariseChecks(allCheckRows.slice(0, 8))}`;
    }
  } catch {
    checksLine = "(secrets read error)";
  }

  // Records requests gone quiet — surface so a filed request is never forgotten.
  let requestsLine = "(secrets not found)";
  try {
    const secrets = readFileSync(SECRETS_PATH, "utf8");
    const sbUrl =
      parseTomlStr(secrets, "SUPABASE_URL") ?? parseTomlStr(secrets, "BRAINS_SUPABASE_URL");
    const sbKey =
      parseTomlStr(secrets, "SUPABASE_SERVICE_KEY") ??
      parseTomlStr(secrets, "BRAINS_SUPABASE_SERVICE_KEY");
    if (sbUrl && sbKey)
      requestsLine = summariseQuietRequests(await getOpenRecordsRequests(sbUrl, sbKey));
  } catch {
    requestsLine = "(secrets read error)";
  }

  // Build queue from local markdown
  let queueLine = "(build-queue.md not found)";
  try {
    const { building, next } = parseBuildQueue(readFileSync(QUEUE_PATH, "utf8"));
    const parts = [];
    if (building.length) parts.push(`[~] ${building[0]}`);
    if (next.length) parts.push(`[ ] ${next[0]}`);
    queueLine =
      parts.length > 0
        ? parts.join("  ·  ")
        : "(nothing queued — all items done or queue is empty)";
  } catch {
    /* skip */
  }

  // Chronic flappers — workflows that keep auto-resolving while never diagnosed.
  let flappersLine = "";
  try {
    const flappers = chronicFlappers(readFileSync(LEDGER_PATH, "utf8"), { threshold: 3 });
    if (flappers.length) {
      flappersLine =
        `⚠ Flappers   : ` +
        flappers.map((f) => `${f.workflow} (${f.count}×)`).join(", ") +
        `\n               ^ keep auto-resolving UNTRIAGED — find the cause, don't trust the green\n`;
    }
  } catch {
    /* skip */
  }

  const clutterLine = specClutterLine();

  const briefBlock = await morningBriefBlock();

  // Write TODAY.md automatically on every session start
  try {
    const { building } = parseBuildQueue(
      existsSync(QUEUE_PATH) ? readFileSync(QUEUE_PATH, "utf8") : "",
    );
    const overdueChecks = allCheckRows
      ? allCheckRows
          .filter((r) => r.due_at && r.due_at.slice(0, 10) < today)
          .map((r) => `[${r.check_key}] ${r.label} (due ${r.due_at.slice(0, 10)})`)
      : [];
    const specCount = (() => {
      try {
        return readdirSync(SPECS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_")).length;
      } catch {
        return 0;
      }
    })();
    writeTodayMd({
      todayPath: TODAY_PATH,
      date: today,
      building,
      overdueChecks,
      lastShip,
      specCount,
      candidateCount: 0,
    });
  } catch {
    /* never block session start */
  }

  const todayBlock = todayMdBlock(today);

  process.stdout.write(
    `\n${banner}\n` +
      `KICKOFF — ${today} · brain-platform · main\n` +
      `Paste below as your first message, or just type "go" / describe the task.\n` +
      `${banner}\n\n` +
      `Last shipped : ${lastShip}\n` +
      `Open checks  : ${checksLine}\n` +
      `Records reqs : ${requestsLine}\n` +
      `Build queue  : ${queueLine}\n` +
      clutterLine +
      flappersLine +
      briefBlock +
      todayBlock +
      `\nWhat should we work on?\n` +
      `${banner}\n`,
  );
}

main().catch(() => {}); // never block session start
