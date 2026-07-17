// scripts/chief-of-staff-lib.mjs
// Pure functions for the chief-of-staff nightly cron. NO I/O here — the
// collect/lint CLIs own filesystem, git, and network. Spec:
// docs/superpowers/specs/2026-07-10-chief-of-staff-nightly-design.md

const DAY_MS = 86_400_000;

/** Parse `git log --pretty=format:%H%x09%s --name-only` output. */
export function parseGitLogNameOnly(text) {
  const commits = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]{7,40})\t(.*)$/);
    if (m) {
      cur = { sha: m[1], subject: m[2], files: [] };
      commits.push(cur);
    } else if (cur) {
      cur.files.push(line.trim());
    }
  }
  return commits;
}

function daysUntouched(row, now) {
  const t = Date.parse(row.updated_at ?? "");
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

/** Open checks untouched >= minDays, oldest first. */
export function staleChecks(rows, { minDays = 14, now = new Date() } = {}) {
  return rows
    .map((r) => ({ check_key: r.check_key, label: r.label, days_untouched: daysUntouched(r, now) }))
    .filter((r) => r.days_untouched != null && r.days_untouched >= minDays)
    .sort((a, b) => b.days_untouched - a.days_untouched);
}

/** live_verify checks whose slug (underscore or hyphen form) never appears in full history. */
export function neverStartedLiveVerifies(rows, fullLogText) {
  const hay = String(fullLogText).toLowerCase();
  return rows
    .filter((r) => r.check_key.endsWith("_live_verify"))
    .filter((r) => {
      const slug = r.check_key.replace(/_live_verify$/, "").toLowerCase();
      return !hay.includes(slug) && !hay.includes(slug.replace(/_/g, "-"));
    })
    .map((r) => ({ check_key: r.check_key, label: r.label }));
}

export function buildEvidencePack({ commits, checks, fullLogText, now = new Date() }) {
  return {
    generated_at: now.toISOString(),
    window_hours: 48,
    // `ref` is a short deterministic handle (c1, c2, ...) the reconciler agent
    // cites INSTEAD OF a SHA — hand-typed hex drifts after enough tool calls
    // (confirmed 07/16 + 07/17: real commits, 1-2 transposed hex chars). A ref
    // is expanded back to the real SHA by expandBriefRefs() after the lint
    // gate passes, so the posted brief still shows real SHAs to a human.
    commits: commits.map((c, i) => ({ ...c, ref: `c${i + 1}` })),
    checks: checks.map((r) => ({
      check_key: r.check_key,
      label: r.label,
      project: r.project ?? null,
      detail: r.detail ?? null,
      due_at: r.due_at ?? null,
      days_untouched: daysUntouched(r, now),
    })),
    live_verify_never_started: neverStartedLiveVerifies(checks, fullLogText),
    stale: staleChecks(checks, { now }),
  };
}

const REQUIRED_SECTIONS = [
  "## Close candidates",
  "## Never started",
  "## Stale top 3",
  "## No evidence",
];
// Raw brief (pre-expansion): candidates cite `ref` tokens (c1, c2, ...) — never hex.
const CANDIDATE_REF_RE = /^- (\S+) — (c\d+(?:, ?c\d+)*) — (.+) — (HIGH|MEDIUM)$/;
// Posted brief (post-expansion): candidates carry real SHAs — what briefKickoffLines reads back.
const CANDIDATE_SHA_RE = /^- (\S+) — ([0-9a-f]{7,40}(?:, ?[0-9a-f]{7,40})*) — .+ — (HIGH|MEDIUM)$/;
const MAX_CANDIDATES = 15;

function candidateSection(briefText) {
  const m = String(briefText).match(/## Close candidates\n([\s\S]*?)(?:\n## |$)/);
  return m ? m[1].trim() : null;
}

/** Validate a drafted (ref-based) brief against the evidence pack. Deterministic, $0. */
export function lintBrief(briefText, pack) {
  const errors = [];
  for (const s of REQUIRED_SECTIONS) {
    if (!String(briefText).includes(s)) errors.push(`missing section: ${s}`);
  }
  const section = candidateSection(briefText);
  if (section != null && section !== "(none)") {
    // Every non-blank line must match the candidate format — filtering to only
    // "- "-prefixed lines here would silently DROP malformed lines from
    // validation instead of rejecting them (07/17 manual-dispatch: the model
    // wrote candidates without the leading dash; the old filter reduced them
    // to zero lines, so the loop below never ran and lint reported OK on an
    // unvalidated, unexpanded brief).
    const lines = section.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > MAX_CANDIDATES)
      errors.push(`too many candidates: ${lines.length} > ${MAX_CANDIDATES}`);
    const validRefs = new Set(pack.commits.map((c) => c.ref));
    for (const line of lines) {
      const m = line.match(CANDIDATE_REF_RE);
      if (!m) {
        errors.push(`malformed candidate line: ${line}`);
        continue;
      }
      for (const ref of m[2].split(",").map((s) => s.trim())) {
        if (!validRefs.has(ref)) errors.push(`cited ref not in evidence pack: ${ref}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Replace ref tokens (c1, c2, ...) with the real sha7 they point to. Runs only after lintBrief passes. */
export function expandBriefRefs(briefText, pack) {
  const sha7ByRef = new Map(pack.commits.map((c) => [c.ref, c.sha.slice(0, 7)]));
  return String(briefText)
    .split("\n")
    .map((line) => {
      const m = line.match(CANDIDATE_REF_RE);
      if (!m) return line;
      const [, key, refs, why, tier] = m;
      const shas = refs
        .split(",")
        .map((r) => sha7ByRef.get(r.trim()) ?? r.trim())
        .join(", ");
      return `- ${key} — ${shas} — ${why} — ${tier}`;
    })
    .join("\n");
}

/** Top candidate lines for the session kickoff block (reads the POSTED, SHA-expanded issue body). */
export function briefKickoffLines(briefText, { max = 5 } = {}) {
  const section = candidateSection(briefText);
  if (!section) return [];
  return section
    .split("\n")
    .filter((l) => CANDIDATE_SHA_RE.test(l))
    .slice(0, max);
}

/** "owner/repo" from a git remote URL (https or ssh), else null. */
export function repoSlugFromRemoteUrl(url) {
  const m = String(url).match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
