// Pure ledger helpers for docs/cron-rebuild-failures.md, shared by the cron
// incident logger (.github/scripts/log-cron-incident.mjs) and the SessionStart
// kickoff (scripts/session-kickoff.mjs). Kept pure + dependency-free so they are
// unit-testable (the logger itself is a top-level-executing CLI and cannot be
// imported). See docs/superpowers/specs/2026-06-14-auto-resolve-mask-fix-design.md.

export const START = "<!-- INCIDENT_TABLE_START -->";
export const END = "<!-- INCIDENT_TABLE_END -->";

// The Root Cause an incident carries until a human diagnoses it. An auto-resolve
// that lands on a row still wearing this marker is a SELF-HEAL, not a fix.
const UNTRIAGED_RX = /pending triage/i;

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Flip the most-recent OPEN incident row for `name` to a RESOLVED status.
 *
 * The label depends on triage state, so a self-healed-but-undiagnosed resolution
 * reads differently from a human-confirmed one:
 *   - Root Cause still "pending triage" → "RESOLVED (auto — self-healed, untriaged)"
 *   - Root Cause diagnosed              → "RESOLVED (auto)"
 *
 * Returns the updated ledger string, or null when there is no OPEN row to flip.
 */
export function flipMostRecentOpenRow(ledger, name) {
  const s = ledger.indexOf(START);
  const e = ledger.indexOf(END);
  if (s < 0 || e < 0 || e < s) return null;
  const lines = ledger.slice(s, e).split("\n");
  const nameRx = new RegExp("\\`" + escapeForRegex(name) + "\\`");
  // Newest-first order: the first OPEN match from the top is the most recent.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    if (!nameRx.test(line)) continue;
    if (!/\|\s+OPEN\s+\|/.test(line)) continue;
    const label = UNTRIAGED_RX.test(line)
      ? "RESOLVED (auto — self-healed, untriaged)"
      : "RESOLVED (auto)";
    lines[i] = line.replace(/\|\s+OPEN\s+\|/, `| ${label} |`);
    return ledger.slice(0, s) + lines.join("\n") + ledger.slice(e);
  }
  return null;
}

/**
 * Workflows that have auto-resolved while still UNTRIAGED at least `threshold`
 * times — i.e. they keep "self-healing" without anyone ever finding the cause.
 *
 * Counts incident rows whose Root Cause is still "pending triage" AND whose
 * status is a "RESOLVED (auto…)" variant. Matching on the Root Cause (not only
 * the new label) means pre-existing `RESOLVED (auto)` rows count too, so chronic
 * flappers surface immediately rather than only after the relabel rolls forward.
 *
 * Returns [{ workflow, count }] sorted by count desc; [] when none qualify.
 */
export function chronicFlappers(ledger, { threshold = 3 } = {}) {
  const s = ledger.indexOf(START);
  const e = ledger.indexOf(END);
  if (s < 0 || e < 0 || e < s) return [];
  const counts = new Map();
  for (const line of ledger.slice(s, e).split("\n")) {
    if (!line.startsWith("|")) continue;
    if (!UNTRIAGED_RX.test(line)) continue;
    if (!/\|\s*RESOLVED \(auto/i.test(line)) continue;
    // The workflow name is the first backtick-wrapped cell (column 2; the date
    // in column 1 carries no backticks).
    const m = line.match(/\|\s*`([^`]+)`/);
    if (!m) continue;
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([workflow, count]) => ({ workflow, count }));
}
