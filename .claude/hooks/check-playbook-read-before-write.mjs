#!/usr/bin/env node
// check-playbook-read-before-write.mjs — THE READ GATE FOR TASK PLAYBOOKS (PreToolUse: Edit|Write|Bash).
// Spec: docs/superpowers/specs/2026-08-30-playbook-read-gate-design.md
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// 08/30/2026: the task-type playbooks (.claude/playbooks/, inject-playbooks.mjs) landed as
// the carrier that lets rule bodies leave CLAUDE.md. The second-order audit's inversion,
// same day: "this change causes harm by licensing the removal of rule text from CLAUDE.md
// in exchange for a pointer whose read nothing verifies." A rule in CLAUDE.md is loaded
// whether or not it is read; a rule moved into a playbook fires only if the model opens
// the file. Without this gate, deleting the bodies converts hard rules into voluntary ones
// under a green suite. This is the mechanism the deletion pass was blocked on.
//
// ── WHAT IT DOES ────────────────────────────────────────────────────────────
//
// Blocks a CODE write until this session's transcript family shows a real `Read` of a task
// playbook THAT EXISTS ON DISK (.claude/playbooks/<name>.md, README excluded). Evidence = a
// Read tool_use with the path on the same transcript line (read-evidence.mjs, the ONE root
// shared with the email playbook gate and the area fence) AND the named file present in
// the real directory — the tool_use line is matched, never the tool result, so without the
// existence check a typo'd path unlocked the session (second-order finding 1, 08/30/2026).
// Grep/Glob/narration never count.
//
// Writes are seen through Edit/Write (`file_path`) AND through Bash (`cat > x.ts <<EOF`,
// `>>`, `tee`, `sed -i`) — the Bash lane was the bypass named in finding 4. Governed =
// code (the area fence's exemption line) plus `ingest/cadence_registry.yaml`, the one yaml
// file FULL-SCOPE-FIRST exists to produce (finding 5).
//
// THE HONEST CEILING: transcript evidence proves *a* playbook was opened before the first
// code write, not the *right* one; and the session family is vertical in BOTH directions,
// so a subagent's Read also satisfies its controller (finding 6 — the shared family root's
// deliberate shape, not changed here). What this gate removes is the zero-read session.
//
// ── FAILURE MODES, NAMED BEFORE BUILDING (RULE 3.5) ─────────────────────────
//
//   • Habit tax (RULE 11): it costs ONE Read per session; the moment a qualifying Read is
//     in the family the gate is satisfied and never speaks again.
//   • Wedging a session on a hook bug: every failure path exits 0 — FAIL OPEN.
//   • Docs, config, tests, and the playbooks themselves are not the hazard: exempt (the
//     same line check-area-fence.mjs draws), so editing CLAUDE.md or a playbook never blocks.
//   • A Read of a non-existent playbook counts: existence-checked against the real dir.
//   • Bash bypass: redirect/tee/sed -i targets are extracted and judged like file_path.
//   • Subagent blindness (check playbook_hook_blind_to_subagents): the controller's Read
//     counts through the strictly-vertical session family; peers never do.
//   • Emergency exit: ALLOW_WRITE_WITHOUT_PLAYBOOK=1 (same shape as the email gate; the
//     human-only approval-token upgrade is the operator's to make — writ-guard-trio).
//   • Windows argv/import.meta.url mismatch silently no-ops a hook: pathToFileURL guard.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { familyShowsLine } from "./read-evidence.mjs";
import { isExemptPath } from "./check-area-fence.mjs";
import { PLAYBOOK_DIR } from "./lib/playbooks.mjs";

/** A task playbook path; group 1 = its name. README is the contract, not a playbook. */
export const PLAYBOOK_READ_RE = /\.claude[\\/]+playbooks[\\/]+(?!README\.md)([a-z0-9-]+)\.md/i;

/** The one non-code file that is governed anyway: FULL-SCOPE-FIRST's artifact. */
const ALWAYS_GOVERNED = /(^|\/)ingest\/cadence_registry\.yaml$/i;

const BANNER = "=".repeat(72);

/** Does a playbook of this name exist in the real directory? Injectable for tests. */
export function realPlaybookExists(name) {
  try {
    return existsSync(resolve(process.cwd(), PLAYBOOK_DIR, `${name}.md`));
  } catch {
    return false;
  }
}

/** Code only — plus the registry. Docs/config/tests/playbooks pass straight through. */
export function isGovernedPath(p) {
  const path = String(p || "").replace(/\\/g, "/");
  if (!path) return false;
  if (ALWAYS_GOVERNED.test(path)) return true;
  return !isExemptPath(path);
}

/**
 * One transcript line: a Read tool_use of a playbook that exists. `exists` is injectable;
 * the default checks the real directory.
 */
export function lineIsRealPlaybookRead(line, exists = realPlaybookExists) {
  if (!line.includes('"name":"Read"')) return false;
  const m = PLAYBOOK_READ_RE.exec(line);
  return !!m && exists(m[1]);
}

/**
 * Paths a Bash command WRITES: `> f`, `>> f`, `tee [-a] f`, `sed -i[.bak] EXPR f`.
 * Deliberately narrow — reads, git, and pipes are not writes. Fail-open shape: an
 * unrecognized write form simply is not seen.
 */
export function bashWriteTargets(command) {
  const cmd = String(command || "");
  const out = [];
  const take = (s) => {
    if (s && !out.includes(s)) out.push(s);
  };
  const unq = (s) => s.replace(/^["']|["']$/g, "");
  for (const m of cmd.matchAll(/(?:^|[^<>\d])>>?\s*("[^"]+"|'[^']+'|[^\s;|&<>]+)/g))
    take(unq(m[1]));
  for (const m of cmd.matchAll(/\btee\b(?:\s+-a)?\s+("[^"]+"|'[^']+'|[^\s;|&<>]+)/g))
    take(unq(m[1]));
  for (const m of cmd.matchAll(
    /\bsed\s+-i\S*\s+(?:"[^"]*"|'[^']*'|\S+)\s+("[^"]+"|'[^']+'|[^\s;|&<>]+)/g,
  ))
    take(unq(m[1]));
  return out;
}

/** The governed write targets of a tool call, whatever the tool. */
export function governedTargets(payload) {
  const name = String(payload?.tool_name || "");
  const input = payload?.tool_input || {};
  const candidates = name === "Bash" ? bashWriteTargets(input.command) : [input.file_path];
  return candidates.filter((p) => isGovernedPath(p));
}

/**
 * The decision, pure. `familyRead()` answers "did the session family Read a real playbook?";
 * any throw from it fails OPEN. `filePath` (singular) kept for the Edit/Write shape.
 */
export function decide({ filePath, filePaths, familyRead }) {
  const targets = filePaths ?? (isGovernedPath(filePath) ? [filePath] : []);
  if (targets.length === 0) return "pass";
  try {
    return familyRead() ? "pass" : "block";
  } catch {
    return "pass";
  }
}

function main() {
  if (process.env.ALLOW_WRITE_WITHOUT_PLAYBOOK === "1") process.exit(0);

  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0);
  }
  const tp = payload.transcript_path;
  if (!tp) process.exit(0);

  const targets = governedTargets(payload);
  const verdict = decide({
    filePaths: targets,
    familyRead: () => familyShowsLine(tp, (line) => lineIsRealPlaybookRead(line)),
  });
  if (verdict === "pass") process.exit(0);

  const msg =
    `\n${BANNER}\n` +
    `BLOCKED — code written before any task playbook was read\n` +
    `${BANNER}\n` +
    `You are writing ${targets.join(", ")}\n` +
    `and this session has not opened a single file under .claude/playbooks/.\n\n` +
    `The index arrives on every prompt: match the task to ONE playbook, Read it (Grep does\n` +
    `not count; the file must exist), copy its steps verbatim as the first todo items, then\n` +
    `write. Rule bodies left CLAUDE.md on the strength of that read — a session that skips\n` +
    `it runs with no rules at all (second-order inversion, 08/30/2026).\n\n` +
    `Genuine emergency: ALLOW_WRITE_WITHOUT_PLAYBOOK=1\n` +
    `${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
