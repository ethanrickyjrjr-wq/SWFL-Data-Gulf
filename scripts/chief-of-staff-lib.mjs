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
    commits,
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
