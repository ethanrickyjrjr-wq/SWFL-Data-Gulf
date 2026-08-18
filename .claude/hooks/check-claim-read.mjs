#!/usr/bin/env node
// check-claim-read.mjs — THE BAR, ENFORCED (Stop hook).
//
// Piece 3b of the plan approved 08/18/2026 ("THIS IS ALL A FUCKING LIE" session).
// Spec: docs/superpowers/specs/2026-08-18-agent-guard-hooks-design.md
//
// RULE 0.5, sharpened 08/12/2026: "before any sentence asserting how OUR system behaves,
// the file that owns that behavior must have been opened. Not a sibling, not a doc, not a
// code comment — the code." The strike registry carries three entries under
// `claimed-our-behavior-without-opening-the-file`, and the same day this shipped, an
// open-house "HOA figures below" claim was made off a STALE COMMENT — the comment lied,
// the code didn't, and only opening the file settled it.
//
// WHAT IT DOES. When the assistant ends its turn, the FINAL message is scanned for repo
// code paths named inside a sentence that asserts behavior. Every such file must have been
// OPENED in this session — Read/Edit/Write or a Serena symbol read, credited across the
// whole transcript. Grep does not count (skimming for a symbol is the failure shape — the
// same line the playbook hook draws). A named-but-never-opened file blocks the stop once.
//
// SESSION-WIDE CREDIT, DELIBERATELY. THE BAR says "in this turn"; the gate credits the
// whole transcript. RULE 11: a final recap that re-blocks on files genuinely read three
// turns ago is a habit tax, and a gate that cries wolf gets ignored on the claim that
// matters. What this catches is the real strike shape: a file claimed about and NEVER
// opened at all.
//
// Fail OPEN on every parse/IO error; `stop_hook_active` prevents loops.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** A repo code path — the surfaces THE BAR is about. Docs/config deliberately excluded. */
const CODE_PATH_RE =
  /\b(?:lib|app|refinery|scripts|ingest|components)\/[\w./[\]-]*\.(?:tsx?|mts|cts|mjs|cjs|jsx?|py)\b/g;

/** Verbs that make a sentence a BEHAVIOR claim rather than a mention. */
const CLAIM_VERB_RE =
  /\b(?:reads?|writes?|calls?|renders?|returns?|serves?|sweeps?|blocks?|gates?|computes?|filters?|validates?|emits?|handles?|owns?|enforces?|strips?|drops?|rejects?|accepts?|routes?|falls?\s+back|defaults?|guards?|checks?|runs?|fires?|skips?|honors?|parses?|bans?|exposes?|imports?|exports?|holds?|stores?|covers?|refuses?|caps?|throttles?|resolves?)\b/i;

/** Hedges that make the sentence honest without a read — or about FUTURE work. */
const HEDGE_RE =
  /\b(?:have\s?n[o']t (?:read|opened)|not (?:yet )?(?:read|opened)|will|would|should|could|plan(?:s|ned|ning)? to|next step|todo|to-do|later|going to|needs? to|I'll|unread|unverified|provisional)\b/i;

/** Normalize a path for suffix comparison. */
export function norm(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

/** Rough sentence split — good enough to scope a claim verb to its path. */
export function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Code paths named in CLAIM sentences of one message. A path only counts when its
 * sentence carries a claim verb and no hedge. Paths inside fenced code blocks are
 * dropped — those are commands and diffs, not prose claims.
 */
export function claimPaths(text) {
  const noFences = String(text || "").replace(/```[\s\S]*?```/g, " ");
  const out = new Set();
  for (const s of sentencesOf(noFences)) {
    // Judge verbs/hedges on the sentence WITHOUT its paths — `voice-guard.ts` must not
    // read as the verb "guards" (found red by this file's own test on build day).
    const prose = s.replace(CODE_PATH_RE, " ");
    if (!CLAIM_VERB_RE.test(prose) || HEDGE_RE.test(prose)) continue;
    for (const m of s.matchAll(CODE_PATH_RE)) out.add(norm(m[0]));
  }
  return [...out];
}

/** Tools whose call means the file was genuinely OPENED. */
export function openedPaths(calls) {
  const opened = [];
  for (const c of calls || []) {
    const n = String(c?.name || "");
    const i = c?.input || {};
    if (/^(Read|Edit|Write|NotebookEdit)$/.test(n)) opened.push(norm(i.file_path));
    else if (/^mcp__serena__(find_symbol|get_symbols_overview|find_referencing_symbols)$/.test(n))
      opened.push(norm(i.relative_path || i.file_path));
  }
  return opened.filter(Boolean);
}

/** Was `claimed` (a repo-relative path) opened? Suffix match tolerates absolute paths. */
export function wasOpened(claimed, opened) {
  return (opened || []).some((o) => o === claimed || o.endsWith(`/${claimed}`));
}

/** Every tool call + the final assistant text in a transcript. Tolerant parse. */
export function readTranscript(lines) {
  const calls = [];
  let finalText = "";
  for (const raw of lines) {
    if (!raw.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    const content = ev?.message?.content;
    if (!Array.isArray(content)) continue;
    let text = "";
    for (const part of content) {
      if (part?.type === "tool_use") calls.push({ name: part.name, input: part.input || {} });
      if (part?.type === "text" && typeof part.text === "string") text += part.text + "\n";
    }
    if (ev?.type === "assistant" && text.trim()) finalText = text;
  }
  return { calls, finalText };
}

/** Pure verdict: claim paths in the final message with no opening call behind them. */
export function unopenedClaims(finalText, calls) {
  const opened = openedPaths(calls);
  return claimPaths(finalText).filter((p) => !wasOpened(p, opened));
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // not our shape — fail open
  }
  if (payload.stop_hook_active) process.exit(0); // never loop

  const tp = payload.transcript_path;
  if (!tp) process.exit(0);

  let lines;
  try {
    lines = readFileSync(tp, "utf8").split("\n");
  } catch {
    process.exit(0); // can't read state — fail open
  }

  const { calls, finalText } = readTranscript(lines);
  if (!finalText.trim()) process.exit(0);

  const unopened = unopenedClaims(finalText, calls);
  if (unopened.length === 0) process.exit(0);

  process.stderr.write(
    `\n⛔ CLAIM-READ GATE — the final message asserts behavior of file(s) this session never opened:\n` +
      unopened.map((p) => `  ${p}`).join("\n") +
      `\n\nRULE 0.5, THE BAR (08/12/2026): before any sentence asserting how OUR system behaves,\n` +
      `the file that owns that behavior must have been opened. Not a sibling, not a doc, not\n` +
      `a code comment — the code. A stale comment lied about open-house's HOA cell the very\n` +
      `day this gate shipped; only the file settles it.\n\n` +
      `Read each file above (Grep does not count), re-verify the sentence, then finish. If a\n` +
      `sentence is about future work or an unread file, SAY SO ("I have not read X yet") and\n` +
      `this gate stays silent.\n`,
  );
  process.exit(2);
}

// Windows main-guard (the ce163255 defect): pathToFileURL normalizes both sides.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
