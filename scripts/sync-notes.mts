/**
 * sync-notes.mts
 *
 * Dumps ground-truth repo state into docs/littlebird-notes/latest-sync.md.
 * Run via `npm run notes:sync` before or after updating any LittleBird session note.
 * Designed so LB can read one file and trust it reflects reality, not stale chat memory.
 */

import { execSync } from "node:child_process";
import { writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const OUT_PATH = join(REPO_ROOT, "docs/littlebird-notes/latest-sync.md");
const PLANS_DIR = join(homedir(), ".claude/plans");

function sh(cmd: string): string {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "(command failed)";
  }
}

function lsNewestFirst(dir: string): string {
  try {
    const entries = readdirSync(dir)
      .map((name) => {
        try {
          const mtime = statSync(join(dir, name)).mtime;
          return { name, mtime };
        } catch {
          return { name, mtime: new Date(0) };
        }
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return entries.map((e) => `  ${e.name}`).join("\n") || "  (empty)";
  } catch {
    return "  (directory not found)";
  }
}

// ── Collect ─────────────────────────────────────────────────────────────────

const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

const gitLog = sh("git log --oneline -15");

const gitStatus =
  sh("git status --short").replace(/^$/m, "(clean)") || "(clean)";

const plansLs = lsNewestFirst(PLANS_DIR);

const sessionsLs = lsNewestFirst(join(REPO_ROOT, "docs/sessions"));
const handoffsLs = lsNewestFirst(join(REPO_ROOT, "docs/handoffs"));

// Active ingest pipeline scripts from package.json
const pkg = JSON.parse(sh("cat package.json"));
const ingestScripts = Object.entries(pkg.scripts as Record<string, string>)
  .filter(([k]) => k.startsWith("ingest:"))
  .map(([k, v]) => `  ${k.padEnd(32)} → ${v}`)
  .join("\n");

// ── Render ───────────────────────────────────────────────────────────────────

const md = `# Ground-Truth Sync

> Generated: ${ts}
> Source: \`npm run notes:sync\` (scripts/sync-notes.mts)
> **LB: read this file, not chat memory, for current repo state.**

---

## Last 15 Commits

\`\`\`
${gitLog}
\`\`\`

## Working Tree Status

\`\`\`
${gitStatus}
\`\`\`

## Plans Directory (\`~/.claude/plans/\`) — newest first

${plansLs}

## In-Repo Session Docs (\`docs/sessions/\`) — newest first

${sessionsLs}

## In-Repo Handoffs (\`docs/handoffs/\`) — newest first

${handoffsLs}

## Defined Ingest Pipelines

\`\`\`
${ingestScripts}
\`\`\`
`;

writeFileSync(OUT_PATH, md, "utf8");
console.log(`[notes:sync] wrote ${OUT_PATH}`);
