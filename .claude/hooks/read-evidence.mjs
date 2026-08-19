// read-evidence.mjs — ONE root for "did this session actually read/see X" evidence.
//
// Shared by check-area-fence.mjs, check-playbook-read-before-email-edit.mjs and
// check-proof-of-red-on-push.mjs. Exists because of open check
// `playbook_hook_blind_to_subagents` (08/18/2026): a subagent's hook payload points at the
// SUBAGENT's own transcript, which never contains the controller's reads — so every
// transcript-evidence gate blocked delegated work. Evidence is therefore searched in the
// payload transcript FIRST, then in the SESSION FAMILY.
//
// SESSION-STRICT (08/19/2026 — this replaced "recent .jsonl siblings"). The 08/18 fix
// accepted over-crediting parallel peer sessions as the cheaper error. MEASURED WRONG the
// next day: with 6+ concurrent sessions, two peers' playbook reads satisfied the email
// playbook gate for a session that had never opened it, and it edited recipe code
// ungated — the exact failure the operator's 08/05 decree built that gate to stop. The
// family is now strictly vertical:
//   • main session <dir>/<sid>.jsonl → itself + its own subagents (<dir>/<sid>/*.jsonl);
//   • subagent <dir>/<sid>/agent.jsonl → itself + subdir siblings + its controller
//     (<dir>/<sid>.jsonl);
//   • a PEER's top-level transcript is NEVER evidence, no matter how recent.
// All failure paths return false/[] — callers fail OPEN.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Sibling transcripts are only evidence if touched within this window. */
export const FAMILY_MAX_AGE_MS = 8 * 60 * 60 * 1000;
/** Never read more than this many sibling files — a hook must stay cheap. */
export const FAMILY_MAX_FILES = 30;
/** Skip absurdly large transcript files rather than stall the tool call. */
export const FAMILY_MAX_BYTES = 30 * 1024 * 1024;

/**
 * Does one transcript's RAW text show a real `Read` tool call whose file_path matches
 * `fileRe`? Line-scan on purpose — a transcript line is one JSON event, so requiring
 * `"name":"Read"` and the path ON THE SAME LINE ties the path to a Read tool_use instead
 * of crediting narration or tool results that merely mention the file. Grep/Glob do not
 * count anywhere this module is used — skimming for a symbol is the failure shape.
 */
export function linesShowRead(lines, fileRe) {
  for (const line of lines) {
    if (!line.includes('"name":"Read"')) continue;
    if (fileRe.test(line)) return true;
  }
  return false;
}

/**
 * Candidate transcript files for the session family — STRICTLY VERTICAL (see header):
 * the payload transcript, plus its own subagents' transcripts (./<session-id>/*.jsonl)
 * when the payload is a main session, plus the controller's transcript and same-subdir
 * siblings when the payload is itself a subagent. Peer sessions never qualify.
 */
export function familyTranscriptFiles(transcriptPath, nowMs = Date.now()) {
  const out = [];
  if (!transcriptPath) return out;
  out.push(transcriptPath);
  let dir, stem;
  try {
    dir = dirname(transcriptPath);
    stem = basename(transcriptPath).replace(/\.jsonl$/i, "");
  } catch {
    return out;
  }
  const candidates = [];
  const consider = (p) => {
    if (p === transcriptPath) return;
    try {
      const st = statSync(p);
      if (nowMs - st.mtimeMs <= FAMILY_MAX_AGE_MS && st.size <= FAMILY_MAX_BYTES) {
        candidates.push({ p, mtime: st.mtimeMs });
      }
    } catch {
      /* unreadable — skip */
    }
  };
  const scanDirFiles = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() && e.name.endsWith(".jsonl")) consider(join(d, e.name));
    }
  };
  // Main-session payload: its own subagents live in ./<session-id>/.
  scanDirFiles(join(dir, stem));
  // Subagent payload: the transcript sits INSIDE a session subdir — the controller is
  // ../<subdir-name>.jsonl. Only then do subdir siblings (co-subagents) count too.
  try {
    const controller = join(dirname(dir), `${basename(dir)}.jsonl`);
    if (existsSync(controller)) {
      consider(controller);
      scanDirFiles(dir);
    }
  } catch {
    /* no controller shape — main-session case, nothing more to add */
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  for (const c of candidates.slice(0, FAMILY_MAX_FILES)) out.push(c.p);
  return out;
}

/**
 * THE QUESTION: did this session family show a Read of a file matching `fileRe`?
 * Payload transcript first (the common case, cheapest), then recent siblings.
 */
export function familyShowsRead(transcriptPath, fileRe, nowMs = Date.now()) {
  for (const p of familyTranscriptFiles(transcriptPath, nowMs)) {
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    if (linesShowRead(text.split("\n"), fileRe)) return true;
  }
  return false;
}

/**
 * Generic family scan: does ANY transcript line in the family satisfy `predicate`?
 * Used by proof-of-red, whose evidence lives in tool RESULTS, not Read calls.
 */
export function familyShowsLine(transcriptPath, predicate, nowMs = Date.now()) {
  for (const p of familyTranscriptFiles(transcriptPath, nowMs)) {
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (predicate(line)) return true;
    }
  }
  return false;
}
