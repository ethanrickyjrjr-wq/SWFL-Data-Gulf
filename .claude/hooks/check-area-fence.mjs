#!/usr/bin/env node
// check-area-fence.mjs — AREA CONVENTIONS, ENFORCED (PreToolUse: Edit|Write).
//
// Piece 4 of the plan approved 08/18/2026 ("THIS IS ALL A FUCKING LIE" session).
// Spec: docs/superpowers/specs/2026-08-18-agent-guard-hooks-design.md
//
// Operator, same session, verbatim: "BRING ME A PLAN FOR MORE HOOKS AND SEPERATING AREAS
// OF WORK AND WHAT CLAUDE READS WHEN I SEND A MESSAGE" — and the standing gripe: "We can't
// have rules that load every time that claude doesn't read or are for different sections."
//
// The FOCUS block has said for weeks: "Area conventions load by location — when editing
// one of these, read its CLAUDE.md" — eight area docs. Exactly ONE area had a mechanism
// (lib/email's playbook hook, 08/05/2026); the other seven were wishes. This is the
// mechanism: editing CODE under an area requires that area's CLAUDE.md read first, in this
// session's transcript family. Same evidence standard as the playbook hook — a real Read,
// never narration, never Grep.
//
// Satisfied ONCE per area per session: the moment the Read exists in the family, the fence
// never speaks for that area again (RULE 11 — no per-edit habit tax).
//
// Fail OPEN on every parse/IO error, and when the area doc itself is missing on disk.
// Escape: ALLOW_AREA_EDIT_WITHOUT_CLAUDE_MD=1.

import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { familyShowsRead } from "./read-evidence.mjs";

const BANNER = "=".repeat(72);

/**
 * The area registry — ONE root, longest prefix wins. Mirrors the FOCUS list verbatim;
 * adding an area = one line here plus the CLAUDE.md itself.
 */
export const AREAS = [
  { prefix: "refinery/packs/", doc: "refinery/packs/CLAUDE.md" },
  { prefix: "lib/email/", doc: "lib/email/CLAUDE.md" },
  { prefix: "lib/assistant/", doc: "lib/assistant/CLAUDE.md" },
  { prefix: "lib/social/", doc: "lib/social/CLAUDE.md" },
  { prefix: "lib/deliverable/", doc: "lib/deliverable/CLAUDE.md" },
  { prefix: "app/api/", doc: "app/api/CLAUDE.md" },
  { prefix: "ingest/", doc: "ingest/CLAUDE.md" },
  { prefix: "scripts/", doc: "scripts/CLAUDE.md" },
];

/** Docs, config and tests are exempt — the same line the playbook hook draws. */
export function isExemptPath(p) {
  const path = String(p || "").replace(/\\/g, "/");
  if (!path) return true;
  if (/\.(md|json|ya?ml|txt|css|svg|html)$/i.test(path)) return true;
  if (/\.test\.|\.spec\.|__tests__/i.test(path)) return true;
  return false;
}

/** Which area governs this path? Longest matching prefix, or null. */
export function areaFor(p) {
  const path = String(p || "").replace(/\\/g, "/");
  // Tolerate absolute paths: match the prefix anywhere a repo-relative segment starts.
  let best = null;
  for (const a of AREAS) {
    const idx = path.indexOf(a.prefix);
    const anchored = idx === 0 || (idx > 0 && path[idx - 1] === "/");
    if (!anchored || idx < 0) continue;
    if (!best || a.prefix.length > best.prefix.length) best = a;
  }
  return best;
}

/** The regex a transcript Read line must match for a given area doc. */
export function docReadRe(doc) {
  return new RegExp(doc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[/\\\\]{1,2}"), "i");
}

function main() {
  if (process.env.ALLOW_AREA_EDIT_WITHOUT_CLAUDE_MD === "1") process.exit(0);

  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // fail open
  }

  const input = payload.tool_input || {};
  const filePath = String(input.file_path || "");
  if (isExemptPath(filePath)) process.exit(0);

  const area = areaFor(filePath);
  if (!area) process.exit(0);

  // Never demand an unreadable doc — an area whose CLAUDE.md is gone fails open.
  const cwd = String(payload.cwd || process.cwd());
  try {
    if (!existsSync(join(cwd, area.doc))) process.exit(0);
  } catch {
    process.exit(0);
  }

  const tp = payload.transcript_path;
  if (!tp) process.exit(0);

  let satisfied = false;
  try {
    satisfied = familyShowsRead(tp, docReadRe(area.doc));
  } catch {
    process.exit(0); // evidence machinery broke — fail open
  }
  if (satisfied) process.exit(0);

  const msg =
    `\n${BANNER}\n` +
    `BLOCKED — ${area.prefix} code edited without reading ${area.doc}\n` +
    `${BANNER}\n` +
    `You are editing ${filePath}\n` +
    `and this session has never opened ${area.doc}.\n\n` +
    `Area conventions are location-loaded (FOCUS rule, standing): each area's CLAUDE.md\n` +
    `carries the seams, one-roots and landmines for that area — the things a fresh\n` +
    `context invents duplicates of. Operator, 08/18/2026: "We can't have rules that\n` +
    `claude doesn't read or are for different sections."\n\n` +
    `Read ${area.doc} first (a real Read — Grep does not count), then edit.\n` +
    `This fence is satisfied once per session per area.\n` +
    `Genuine emergency: ALLOW_AREA_EDIT_WITHOUT_CLAUDE_MD=1\n` +
    `${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

// Windows main-guard (the ce163255 defect): pathToFileURL normalizes both sides.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
