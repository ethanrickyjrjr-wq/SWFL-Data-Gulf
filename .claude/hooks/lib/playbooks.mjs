// playbooks.mjs — THE PLAYBOOK INDEX for per-task-type scoped injection (NORTH STAR #3).
// Spec: docs/superpowers/specs/2026-08-30-playbooks-per-task-type-design.md
//
// One file per TASK TYPE under .claude/playbooks/. The matched playbook's steps are
// copied VERBATIM as the first todo items (RULE 0.8's count), before any task-specific
// todo and before reasoning about the task; a step not done stays listed with
// `skip: <reason>`. Shape stolen from cursor/plugins pstack (08/30/2026 evaluation).
//
// The MODEL is the classifier. This module emits the SAME static index on every prompt
// — name, one-line `for`, and a pointer to the file. NEVER a keyword router (the
// misfire class inject-focus.mjs rejects), NEVER pasted steps (pointers keep the
// per-prompt cost flat and resume-replay static). Fail-open, but LOUDLY: a dir that
// cannot be listed emits a DEGRADED banner instead of silently vanishing (the 07/25/2026
// inject-focus lesson).
//
// Adding a playbook: a new .md with `name:` (== filename) and `for:` frontmatter, a
// `### ` heading, `1.`-numbered steps, a `**Rules carried:**` line naming the CLAUDE.md
// rules it now delivers (the deletion map), and a `**Reply:**` line. playbooks.test.mjs
// lints the real directory.

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PLAYBOOK_DIR = ".claude/playbooks";

export const CONTRACT =
  "PLAYBOOKS — before reasoning about the task, match it to ONE playbook below, open the " +
  "file, and copy its steps VERBATIM as the first todo items (this is RULE 0.8's count). " +
  "A step not done stays listed with `skip: <reason>` — silent skipping is the defect. " +
  "A typo, a doc line, a yes/no, or anything revertable in under a minute takes no playbook.";

/** Parse `name:` + `for:` out of a playbook's frontmatter. null when either is absent. */
export function parsePlaybook(text, file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ""));
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z]+):\s*(.+?)\s*$/.exec(line);
    if (kv) fm[kv[1]] = kv[2];
  }
  if (!fm.name || !fm.for) return null;
  return { name: fm.name, for: fm.for, file };
}

/**
 * The index text. `list` returns filenames in the playbook dir; `read` returns one
 * file's text. Both injectable for the test; defaults read the real dir.
 */
export function buildPlaybookIndex({ list, read } = {}) {
  const dir = resolve(process.cwd(), PLAYBOOK_DIR);
  const ls = list || (() => readdirSync(dir));
  const rd = read || ((f) => readFileSync(resolve(dir, f), "utf8"));
  let files;
  try {
    files = ls()
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .sort();
  } catch {
    return (
      `⚠️ PLAYBOOKS DEGRADED — could not list \`${PLAYBOOK_DIR}\`; no task playbooks in this ` +
      "prompt. Say so, then open the directory directly before starting non-trivial work."
    );
  }
  const entries = [];
  const dropped = [];
  for (const f of files) {
    let p = null;
    try {
      p = parsePlaybook(rd(f), f);
    } catch {
      /* unreadable → dropped, named below */
    }
    if (p) entries.push(`  ${p.name} — ${p.for} → ${PLAYBOOK_DIR}/${p.file}`);
    else dropped.push(f);
  }
  const lines = [CONTRACT, ...entries];
  if (dropped.length) lines.push(`  dropped (no name/for frontmatter): ${dropped.join(", ")}`);
  return lines.join("\n");
}

/** Exact UserPromptSubmit JSON. No `decision` → the prompt always proceeds. */
export function buildHookOutput(io = {}) {
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: buildPlaybookIndex(io),
    },
  };
}
