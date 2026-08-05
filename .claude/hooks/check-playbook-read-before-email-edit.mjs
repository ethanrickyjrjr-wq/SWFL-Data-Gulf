#!/usr/bin/env node
// check-playbook-read-before-email-edit.mjs — THE READ-FIRST GATE FOR EMAIL CODE (PreToolUse).
//
// OPERATOR DECREE 08/05/2026, verbatim:
//   "Why are you not fucking building to all the research!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
//   "We have a full email fucking file you dumbass. A whole playbook. I fucking told you"
//   "Use the god damn playbook you fuck"
//   "Fix why you don't fucking listen!!!!!!!! NOW!!!!!!!!!"
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Building the Coming Soon email on 08/05/2026, I wrote the recipe, an acceptance
// script, a playbook section and five checks WITHOUT EVER OPENING the playbook's own
// universal rules or `_RESEARCH/`. Every defect the operator then had to shout about was
// already written down before I started:
//
//   1. The scarcity funnel shipped on `bar-table`. `taskC-charttype-verification.md`
//      (07/01/2026) verified our chart ladder against live Atlassian + FT crawls and
//      labels `bar-table` THE FALLBACK; a part-to-whole shape has its own rung.
//   2. The email rendered in Playfair. The playbook's own finish pass had DELETED the
//      serif pair as defect #1 four hours earlier, and its guard denies Playfair BY NAME.
//      I reintroduced it by restoring a stale account row instead of reading the file.
//   3. Two stat rows shipped with one `primary` cell and one `muted` cell. That is the
//      playbook's defect #4 and #5, verbatim: "Never mark ONE cell in a three-cell row
//      muted. All three carry the same weight or the row reads broken."
//
// Three defects, three documents, zero reads. `lib/email/CLAUDE.md` already opens with a
// ⛔ STEP ZERO block naming five research files BY PATH, and `docs/standards/emails.md`
// §0.0 already carries the postmortem of the LAST session that did this (08/04/2026).
// **A rule that has been written three times and skipped anyway is not a rule — it is a
// wish.** RULE 0.8: announcing a behavior change is not a behavior change; only a
// mechanism is. This is the mechanism.
//
// ── WHAT IT DOES ────────────────────────────────────────────────────────────
//
// Blocks Edit/Write to email + recipe CODE until this session's transcript shows a real
// Read of the build playbook. Detected from actual tool calls, never from narration —
// the same evidence standard as the four-lane gate.
//
// ── FAILURE MODES, NAMED BEFORE BUILDING (RULE 3.5) ─────────────────────────
//
//   • A per-edit habit tax gets ignored on the edit that matters (RULE 11). Guard: it
//     fires at most ONCE per session — the moment a qualifying Read appears in the
//     transcript the gate is satisfied and never speaks again.
//   • Blocking on a parse/IO error would wedge the session over a hook bug. Guard:
//     every failure path is `process.exit(0)` — FAIL OPEN, always.
//   • A grep of the playbook's headings is not reading it. Guard: only `Read` counts;
//     Grep/Glob do not.
//   • Docs and tests are not the hazard. Guard: `.md`, `.test.*` and `__tests__` paths
//     pass straight through, so writing the playbook itself is never blocked.
//   • A genuine emergency needs an exit. Guard: `ALLOW_EMAIL_EDIT_WITHOUT_PLAYBOOK=1`.
//   • Windows path shape silently no-op'd a prior hook (see check-four-searches.mjs's
//     footer). Guard: same `pathToFileURL` normalization, and a unit test that runs the
//     pure helpers.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The file that must have been read. The ONE build file, by operator decree 08/04/2026. */
export const PLAYBOOK = "docs/standards/email-build-playbook.md";

const BANNER = "=".repeat(72);

/**
 * Is this edit touching email/deliverable CODE that the playbook governs?
 * Docs and tests are exempt — the playbook is edited as part of doing this right.
 */
export function isGovernedPath(p) {
  const path = String(p || "").replace(/\\/g, "/");
  if (!path) return false;
  if (/\.(md|json|ya?ml|txt)$/i.test(path)) return false;
  if (/\.test\.|\.spec\.|__tests__/i.test(path)) return false;
  return /(^|\/)lib\/(email|deliverable)\//i.test(path);
}

/**
 * Did this session actually READ the playbook? Grep does not count — the whole failure
 * shape is skimming for a symbol instead of reading the rules.
 */
export function playbookWasRead(calls) {
  return calls.some(
    (c) =>
      String(c.name) === "Read" &&
      /email-build-playbook\.md/i.test(String(c.input?.file_path || "")),
  );
}

/** Collect every tool call in the transcript. Tolerant of unknown line shapes. */
export function collectCalls(lines) {
  const calls = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const content = ev?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "tool_use") calls.push({ name: part.name, input: part.input || {} });
    }
  }
  return calls;
}

function main() {
  if (process.env.ALLOW_EMAIL_EDIT_WITHOUT_PLAYBOOK === "1") process.exit(0);

  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // fail open
  }

  const input = payload.tool_input || {};
  if (!isGovernedPath(input.file_path)) process.exit(0);

  const tp = payload.transcript_path;
  if (!tp) process.exit(0);

  let lines;
  try {
    lines = readFileSync(tp, "utf8").split("\n");
  } catch {
    process.exit(0); // fail open — never wedge a session on a hook's own IO
  }

  if (playbookWasRead(collectCalls(lines))) process.exit(0);

  const msg =
    `\n${BANNER}\n` +
    `BLOCKED — email code edited without reading the playbook\n` +
    `${BANNER}\n` +
    `You are editing ${input.file_path}\n` +
    `and this session has never opened ${PLAYBOOK}.\n\n` +
    `Operator, 08/05/2026: "We have a full email fucking file. A whole playbook.\n` +
    `I fucking told you." — then, after three defects: "Use the god damn playbook."\n\n` +
    `Every defect of that build was already written down before it started:\n` +
    `  • the chart shipped on the FALLBACK rung — the chart-type research names it as such\n` +
    `  • the email shipped in a serif the playbook had DELETED hours earlier, by name\n` +
    `  • two stat rows mixed primary + muted cells — playbook defects #4 and #5, verbatim\n\n` +
    `Read the playbook first — PART 1 (universal) and YOUR email's section in PART 2.\n` +
    `Then open the gitignored rules BY PATH (Grep cannot see them):\n` +
    `  _RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md\n` +
    `  _RESEARCH/email-and-social/2026-08-03-strongest-real-estate-email-concepts-structure.md\n\n` +
    `Genuine emergency: ALLOW_EMAIL_EDIT_WITHOUT_PLAYBOOK=1\n` +
    `${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

// Windows: argv[1] is `C:\…` while import.meta.url is `file:///C:/…` — they never match
// raw, which is how a prior hook shipped as a silent no-op. pathToFileURL normalizes both.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
