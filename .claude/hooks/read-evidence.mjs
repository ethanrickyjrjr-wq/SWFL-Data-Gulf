// read-evidence.mjs — ONE root for "did this session actually read/see X" evidence.
//
// Shared by check-area-fence.mjs, check-playbook-read-before-email-edit.mjs and
// check-proof-of-red-on-push.mjs. Exists because of open check
// `playbook_hook_blind_to_subagents` (08/18/2026): a subagent's hook payload points at the
// SUBAGENT's own transcript, which never contains the controller's reads — so every
// transcript-evidence gate blocked delegated work. Evidence is therefore searched in the
// payload transcript FIRST, then in recent sibling transcripts (the session family).
//
// The sibling scan can over-credit a PARALLEL same-repo session's read. Accepted on the
// record (spec 2026-08-18-agent-guard-hooks-design.md): blocking every delegated build is
// the costlier error. All failure paths return false/[] — callers fail OPEN.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

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
 * Candidate transcript files for the session family: the payload transcript plus recent
 * `*.jsonl` siblings in its directory and one level of subdirectories (subagent
 * transcripts land in per-session subfolders on some harness versions).
 */
export function familyTranscriptFiles(transcriptPath, nowMs = Date.now()) {
  const out = [];
  if (!transcriptPath) return out;
  out.push(transcriptPath);
  let dir;
  try {
    dir = dirname(transcriptPath);
  } catch {
    return out;
  }
  const candidates = [];
  const scan = (d, depth) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (depth > 0) scan(p, depth - 1);
        continue;
      }
      if (!e.name.endsWith(".jsonl") || p === transcriptPath) continue;
      try {
        const st = statSync(p);
        if (nowMs - st.mtimeMs <= FAMILY_MAX_AGE_MS && st.size <= FAMILY_MAX_BYTES) {
          candidates.push({ p, mtime: st.mtimeMs });
        }
      } catch {
        /* unreadable sibling — skip */
      }
    }
  };
  scan(dir, 1);
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
