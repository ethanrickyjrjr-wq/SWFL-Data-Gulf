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

const TIER_WORD = { HIGH: "confident", MEDIUM: "likely" };

function labelFor(key, checks) {
  return checks?.find((c) => c.check_key === key)?.label ?? key;
}

// Matches a humanizeBrief-rewritten candidate line, to pull the ledger key
// back out for operators/future sessions (see briefKickoffLines below).
const HUMANIZED_CANDIDATE_RE =
  /^- \*\*(.+?)\*\* — (.+) _\((confident|likely); commits? ([0-9a-f]{7,40}(?:, ?[0-9a-f]{7,40})*); ledger key: (\S+)\)_$/;

/**
 * Rewrite a linted, SHA-expanded brief into plain English for a human reader —
 * swaps snake_case check_key for the check's own label, moves commit SHAs and
 * the ledger key into a trailing parenthetical, and prepends a one-line
 * plain-terms summary computed from the section contents (deterministic, no
 * model involved). Runs last, after expandBriefRefs — never touches lint or
 * the ref->SHA expansion, purely a cosmetic final pass on an already-validated
 * brief. Addresses check morning_brief_no_consumer.
 */
export function humanizeBrief(briefText, pack) {
  const candidateLineRe =
    /^- (\S+) — ([0-9a-f]{7,40}(?:, ?[0-9a-f]{7,40})*) — (.+) — (HIGH|MEDIUM)$/;
  const neverStartedLineRe = /^- (\S+)(?: — (.+))?$/;
  const staleLineRe = /^- (\S+) \((\d+)d\)(?: — (.+))?$/;
  const noEvidenceLineRe = /^(\d+) open checks had no matching work in the window\.$/;

  let section = null;
  let candidateCount = 0;
  let neverStartedCount = 0;
  let staleCount = 0;

  const body = String(briefText)
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) {
        section = line.trim();
        return line;
      }
      if (section === "## Close candidates") {
        const m = line.match(candidateLineRe);
        if (!m) return line;
        candidateCount++;
        const [, key, shas, why, tier] = m;
        const shaWord = shas.includes(",") ? "commits" : "commit";
        return `- **${labelFor(key, pack.checks)}** — ${why} _(${TIER_WORD[tier]}; ${shaWord} ${shas}; ledger key: ${key})_`;
      }
      if (section === "## Never started") {
        const m = line.match(neverStartedLineRe);
        if (!m || !m[1].endsWith("_live_verify")) return line;
        neverStartedCount++;
        const [, key, why] = m;
        return why
          ? `- **${labelFor(key, pack.checks)}** — ${why} _(ledger key: ${key})_`
          : `- **${labelFor(key, pack.checks)}** _(ledger key: ${key})_`;
      }
      if (section === "## Stale top 3") {
        const m = line.match(staleLineRe);
        if (!m) return line;
        staleCount++;
        const [, key, days, labelOverride] = m;
        const label = labelOverride ?? labelFor(key, pack.checks);
        return `- **${label}** — untouched ${days} days _(ledger key: ${key})_`;
      }
      if (section === "## No evidence") {
        const m = line.match(noEvidenceLineRe);
        if (!m) return line;
        return `${m[1]} items on the to-do list had no matching work in the last 48 hours — normal for a backlog this size on its own, not a red flag by itself.`;
      }
      return line;
    })
    .join("\n");

  const tldr =
    candidateCount > 0
      ? `${candidateCount} item${candidateCount === 1 ? "" : "s"} look${candidateCount === 1 ? "s" : ""} finished and ready to check off`
      : "nothing looked finished enough to check off";
  const extras = [];
  if (neverStartedCount > 0)
    extras.push(`${neverStartedCount} flagged as untouched since they were opened`);
  if (staleCount > 0) extras.push(`${staleCount} of the oldest items on the list shown below`);

  const summary = `**In plain terms:** ${[tldr, ...extras].join(", ")}.`;

  return `${summary}\n\n${body}`;
}

/** Top candidate lines for the session kickoff block. Reads the POSTED issue
 * body (post-humanizeBrief) and reconstructs the terse key/sha form the
 * kickoff script and `check.mjs close` need — the issue itself stays plain
 * English for a human, this is the technical read-back for the next session. */
export function briefKickoffLines(briefText, { max = 5 } = {}) {
  const section = candidateSection(briefText);
  if (!section) return [];
  const lines = [];
  for (const line of section.split("\n")) {
    const m = line.match(HUMANIZED_CANDIDATE_RE);
    if (!m) continue;
    const [, , why, , shas, key] = m;
    lines.push(`- ${key} — ${shas} — ${why}`);
    if (lines.length >= max) break;
  }
  return lines;
}

/** "owner/repo" from a git remote URL (https or ssh), else null. */
export function repoSlugFromRemoteUrl(url) {
  const m = String(url).match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
