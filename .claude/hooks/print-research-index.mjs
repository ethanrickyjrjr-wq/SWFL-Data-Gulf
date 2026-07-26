#!/usr/bin/env node
// SessionStart hook — prints the _RESEARCH index so the research is DISCOVERABLE.
//
// WHY THIS EXISTS — the mechanism, proven 07/25/2026, not a behavior complaint.
// `_RESEARCH/` is gitignored (.gitignore:163). The Grep tool is built on ripgrep,
// and ripgrep honors .gitignore by default, so a repo-wide CONTENT search cannot
// see anything in `_RESEARCH/`. Measured, both directions:
//   rg -l "first stop for any outside-answer question"             -> _RESEARCH MISS
//   rg -l --no-ignore "first stop for any outside-answer question" -> _RESEARCH HIT
// Control, ruling out "it's the underscore prefix": a repo-wide Grep for a string
// in `_ASSISTANT/SCRATCHPAD.md` (also underscore-prefixed, but TRACKED) FINDS it.
// The only variable is gitignore.
//
// Consequence: you can only Read `_RESEARCH/` if you already know a file is there.
// Concept-level discovery — "what did we conclude about caching?" — returns nothing.
// That is why five separate read-first rules (CLAUDE.md RULE 0.4, RULES.md #7, and
// three more) never fixed "WE FUCKING RESEARCH AND NO ONE LOOKS AT IT": the rule
// layer cannot repair a discovery failure. Second half, worse: gitignored files are
// in no other clone, worktree, or CI checkout, so no hook and no CI job can ever
// enforce reading them, and a worktree session starts with zero research, silently.
//
// This is the fix that costs nothing and leaks nothing: inject the INDEX (categories
// and one-line conclusions, already written) at SessionStart, which per the live hook
// contract (code.claude.com/docs/en/hooks, crawled 07/25/2026) is one of only three
// events whose stdout Claude actually sees. The research BODIES stay gitignored, so
// the 07/17/2026 decree covering competitor names and strategic analysis is intact.
// Nothing new ships to GitHub.
//
// Fails SOFT by construction, same as its print-scratchpad sibling: a missing index
// (e.g. a fresh worktree, which by definition has no _RESEARCH) prints nothing and
// exits 0. A session-start printer that throws breaks every session opening, which is
// worse than the gap it closes.
//
// Full write-up: docs/standards/new-project-playbook.md §2.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PATH = resolve(process.cwd(), "_RESEARCH/INDEX.md");

// Keep the injection small and static. The index is ~100 lines; we print the
// category/file lines and drop the prose preamble, which is instructions to a human
// that RULE 0.4 already carries into every prompt.
export function renderIndex(text) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let inCategories = false;

  for (const line of lines) {
    if (/^##\s+Categories/i.test(line)) {
      inCategories = true;
      continue;
    }
    if (inCategories && /^##\s/.test(line)) break;
    if (!inCategories) continue;
    if (line.trim() === "" || line.trim() === "---") continue;
    kept.push(line.replace(/\s+$/, ""));
  }

  if (kept.length === 0) return "";

  const bar = "=".repeat(72);
  return [
    bar,
    "_RESEARCH — already paid for, and INVISIBLE to repo-wide Grep (gitignored).",
    bar,
    "Read these with the Read tool by path. Content search CANNOT find them; a",
    "Grep that returns nothing is NOT evidence the research is absent. To search",
    "inside them, pass path=_RESEARCH explicitly, or use rg --no-ignore.",
    bar,
    ...kept,
    bar,
    "RULE 0.4: read ours FIRST, then crawl4ai the live source. Never from memory.",
    bar,
    "",
  ].join("\n");
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    let text = "";
    try {
      text = readFileSync(PATH, "utf8");
    } catch {
      process.exit(0); // no _RESEARCH here (fresh worktree/clone) — nothing to say
    }
    try {
      const out = renderIndex(text);
      if (out) process.stdout.write(out);
    } catch {
      // Never let a parse bug wedge session start.
    }
    process.exit(0);
  });
  process.stdin.on("error", () => process.exit(0));
}
