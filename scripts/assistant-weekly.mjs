#!/usr/bin/env node
// Weekly maintenance: archive any newly-dead specs/handoffs, write _ASSISTANT/TODAY.md.
// Re-runnable at any time. Safe to run without --dry-run.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  isDeadSpec,
  isDeadHandoff,
  archiveFile,
  appendCleaned,
  writeTodayMd,
} from "./assistant-lib.mjs";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const SPECS_DIR = resolve(ROOT, "docs/superpowers/specs");
const SPECS_ARCHIVE = resolve(ROOT, "docs/superpowers/specs/_archive");
const HANDOFF_DIR = resolve(ROOT, "docs/handoff");
const HANDOFF_ARCHIVE = resolve(ROOT, "docs/handoff/_archive");
const QUEUE_PATH = resolve(ROOT, "_AUDIT_AND_ROADMAP/build-queue.md");
const CLEANED_PATH = resolve(ROOT, "_ASSISTANT/CLEANED.md");
const TODAY_PATH = resolve(ROOT, "_ASSISTANT/TODAY.md");
const LOG_PATH = resolve(ROOT, "SESSION_LOG.md");
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");

function parseTomlStr(toml, key) {
  const m = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, "m"));
  return m?.[1] ?? null;
}

async function getOpenChecks() {
  try {
    const secrets = readFileSync(SECRETS_PATH, "utf8");
    const sbUrl =
      parseTomlStr(secrets, "SUPABASE_URL") ?? parseTomlStr(secrets, "BRAINS_SUPABASE_URL");
    const sbKey =
      parseTomlStr(secrets, "SUPABASE_SERVICE_KEY") ??
      parseTomlStr(secrets, "BRAINS_SUPABASE_SERVICE_KEY");
    if (!sbUrl || !sbKey) return { keys: [], overdue: [] };
    const res = await fetch(
      `${sbUrl}/rest/v1/checks?state=eq.open&select=check_key,label,due_at&order=due_at.asc.nullslast&limit=200`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    );
    if (!res.ok) return { keys: [], overdue: [] };
    const rows = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    return {
      keys: rows.map((r) => r.check_key),
      overdue: rows
        .filter((r) => r.due_at && r.due_at < today)
        .map((r) => `[${r.check_key}] ${r.label} (due ${r.due_at})`),
    };
  } catch {
    return { keys: [], overdue: [] };
  }
}

function extractLastShip(logText) {
  const parts = logText.split(/\n(?=## \d{4}-\d{2}-\d{2})/);
  const first = parts.find((p) => /^## \d{4}-\d{2}-\d{2}/.test(p)) ?? "";
  return (first.match(/^## [^\n]+/)?.[0] ?? "").replace(/^## /, "");
}

function parseBuildingItems(queueText) {
  const items = [];
  for (const line of queueText.split("\n")) {
    if (/^\s*-\s*\[~\]/.test(line)) {
      const m = line.match(/\*\*([^*]+)\*\*/);
      items.push(m ? m[1] : line.replace(/^\s*-\s*\[~\]\s*/, "").slice(0, 80));
    }
  }
  return items;
}

async function main() {
  if (DRY_RUN) console.log("[DRY RUN] No files will be moved.\n");

  const queueText = existsSync(QUEUE_PATH) ? readFileSync(QUEUE_PATH, "utf8") : "";
  const { keys: openCheckKeys, overdue: overdueChecks } = await getOpenChecks();
  const lastShip = existsSync(LOG_PATH)
    ? extractLastShip(readFileSync(LOG_PATH, "utf8"))
    : "(none)";
  const today = new Date().toISOString().slice(0, 10);

  const entries = [];

  // Scan specs (skip _archive/ and files starting with _)
  const specs = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  let specCandidates = 0;
  for (const f of specs) {
    const filepath = resolve(SPECS_DIR, f);
    const { dead, reason } = isDeadSpec(filepath, queueText, openCheckKeys);
    if (!dead) continue;
    specCandidates++;
    console.log(`ARCHIVE spec: ${f} — ${reason}`);
    if (!DRY_RUN) {
      const dest = archiveFile(filepath, SPECS_ARCHIVE);
      entries.push({ src: filepath, dest, reason });
    }
  }

  // Scan handoffs (skip _archive/ and files starting with _)
  const handoffs = readdirSync(HANDOFF_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  for (const f of handoffs) {
    const filepath = resolve(HANDOFF_DIR, f);
    const { dead, reason } = isDeadHandoff(filepath, openCheckKeys);
    if (!dead) continue;
    console.log(`ARCHIVE handoff: ${f} — ${reason}`);
    if (!DRY_RUN) {
      const dest = archiveFile(filepath, HANDOFF_ARCHIVE);
      entries.push({ src: filepath, dest, reason });
    }
  }

  if (!DRY_RUN && entries.length) {
    appendCleaned(CLEANED_PATH, entries);
  }

  // Recount live specs after potential moves
  const liveSpecs = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));

  // Write TODAY.md (skipped in dry-run)
  if (!DRY_RUN) {
    writeTodayMd({
      todayPath: TODAY_PATH,
      date: today,
      building: parseBuildingItems(queueText),
      overdueChecks,
      lastShip,
      specCount: liveSpecs.length,
      candidateCount: specCandidates,
    });
    console.log(`\nTODAY.md written to _ASSISTANT/TODAY.md`);
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] Would archive" : "Archived"} ${entries.length} files.`);
  if (!DRY_RUN && entries.length) {
    console.log(
      'Commit archive moves:\n  git add docs/superpowers/specs/_archive/ docs/handoff/_archive/ _ASSISTANT/CLEANED.md\n  git commit -m "chore(assistant): weekly archive pass"',
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
