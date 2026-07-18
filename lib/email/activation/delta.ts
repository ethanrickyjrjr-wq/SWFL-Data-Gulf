/**
 * lib/email/activation/delta.ts — the deterministic, no-invention delta engine.
 *
 * `computeReportDelta` diffs a STORED snapshot (what email #1 showed) against a
 * freshly-assembled one (now), reduced to the same `ActivationSnapshot` shape. It
 * is pure: same inputs → same output, no I/O, no Date.now(), no LLM. Every number
 * in the result is a comparison of two stored numbers — the system cannot invent a
 * change it can't prove (platform moat #1; Brain-Factory rule #2).
 *
 * "Real time-grain only": numeric metric moves are always honest (a stored number
 * differs from a current one). Qualitative SIGNAL changes are restricted to brains
 * with a genuine daily/weekly grain — a slow-moving brain's reworded line is not a
 * "what changed this week" signal and would be noise.
 */

import type {
  ActivationSnapshot,
  ReportDelta,
  MetricChange,
  SignalChange,
  SnapshotMetric,
} from "./types";

/**
 * The freshness token pattern (SWFL-7421-v{n}-{YYYYMMDD}) plus bare ISO/US dates.
 * Stripped before fingerprinting so the daily token advance does NOT read as a
 * substantive change — only the content does.
 */
const FRESHNESS_TOKEN_RE = /SWFL-\d+-v\d+-\d{8}/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;

/**
 * Reduce a dossier line's display text to its substantive content: drop freshness
 * tokens + dates, collapse whitespace, lowercase. Equal fingerprints ⇒ no
 * substantive change. Exported so `snapshot.ts` fingerprints lines the SAME way on
 * both the v1 capture and the v2 re-assembly (one implementation, no drift).
 */
export function fingerprintText(text: string): string {
  return text
    .replace(FRESHNESS_TOKEN_RE, "")
    .replace(DATE_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Brains with a real daily/weekly time-grain — the only ones whose qualitative line
 * change counts as a "what changed this week" SIGNAL. Numeric per-ZIP movement
 * (housing, flood) is reported as a metric change instead, so those brains are
 * deliberately NOT here (no double-counting).
 */
export const DELTABLE_SIGNAL_BRAINS: ReadonlySet<string> = new Set([
  "city-pulse-swfl", // daily
  "corridor-pulse-swfl", // weekly
  "permits-swfl", // weekly issuance
  "permits-commercial-swfl", // weekly issuance
  "news-swfl", // rolling enforcement actions
  "econ-dev-swfl", // announcements
]);

/** Human label for a signal brain — customer-clean, never the pack id. */
const SIGNAL_LABEL: Record<string, string> = {
  "city-pulse-swfl": "Local city pulse",
  "corridor-pulse-swfl": "Corridor pulse",
  "permits-swfl": "Building permits",
  "permits-commercial-swfl": "Commercial permits",
  "news-swfl": "Enforcement & code actions",
  "econ-dev-swfl": "Economic-development announcements",
};

function favorability(
  direction: SnapshotMetric["direction"],
  moved: "up" | "down",
): boolean | null {
  if (!direction || direction === "neutral") return null;
  if (direction === "higher_is_better") return moved === "up";
  return moved === "down"; // lower_is_better
}

function diffMetrics(prev: SnapshotMetric[], current: SnapshotMetric[]): MetricChange[] {
  const currentByKey = new Map(current.map((m) => [m.key, m]));
  const changes: MetricChange[] = [];

  for (const p of prev) {
    const c = currentByKey.get(p.key);
    if (!c) continue; // metric no longer assembled — not a claimable change
    const from = p.value;
    const to = c.value;
    if (from === to) continue;

    let direction: MetricChange["direction"];
    let delta: number | null = null;
    let favorable: boolean | null = null;

    if (from === null && to !== null) {
      direction = "appeared";
    } else if (from !== null && to === null) {
      direction = "disappeared";
    } else if (from !== null && to !== null) {
      delta = to - from;
      if (delta === 0) continue; // numerically identical — no change
      const moved = delta > 0 ? "up" : "down";
      direction = moved;
      favorable = favorability(c.direction ?? p.direction, moved);
    } else {
      continue; // both null — unreachable (from===to caught above)
    }

    changes.push({
      key: p.key,
      label: c.label || p.label,
      from,
      to,
      delta,
      direction,
      favorable,
      unit: c.unit ?? p.unit,
    });
  }
  return changes;
}

function diffSignals(prev: ActivationSnapshot, current: ActivationSnapshot): SignalChange[] {
  const currentByBrain = new Map(current.lines.map((l) => [l.brain_id, l]));
  const prevByBrain = new Map(prev.lines.map((l) => [l.brain_id, l]));
  const out: SignalChange[] = [];
  for (const p of prev.lines) {
    if (!DELTABLE_SIGNAL_BRAINS.has(p.brain_id)) continue;
    const c = currentByBrain.get(p.brain_id);
    if (!c) continue; // line no longer present — not a claimable change
    if (c.fingerprint === p.fingerprint) continue;
    out.push({
      brain_id: p.brain_id,
      label: SIGNAL_LABEL[p.brain_id] ?? p.label,
    });
  }
  // A DELTABLE brain that holds no prior line but has one now — the signal's
  // FIRST appearance (e.g. a ZIP going from zero permit/news/city-pulse
  // activity to a first real read this cycle). Without this, the loop above
  // (which only walks prev.lines) can never surface it as "new activity."
  for (const c of current.lines) {
    if (!DELTABLE_SIGNAL_BRAINS.has(c.brain_id)) continue;
    if (prevByBrain.has(c.brain_id)) continue; // already handled above
    out.push({
      brain_id: c.brain_id,
      label: SIGNAL_LABEL[c.brain_id] ?? c.label,
    });
  }
  return out;
}

/**
 * Diff a stored snapshot (email #1) against a current one (now). The result drives
 * email #2's delta block. `has_change=false` is first-class — the caller then leads
 * with the moved freshness token and a "re-verified" line, never a fabricated change.
 */
export function computeReportDelta(
  prev: ActivationSnapshot,
  current: ActivationSnapshot,
): ReportDelta {
  const metric_changes = diffMetrics(prev.metrics, current.metrics);
  const signal_changes = diffSignals(prev, current);
  const freshness_moved =
    prev.freshness_token !== current.freshness_token && current.freshness_token !== null;

  return {
    zip: current.zip,
    has_change: metric_changes.length > 0 || signal_changes.length > 0,
    freshness_moved,
    freshness_token_prev: prev.freshness_token,
    freshness_token_current: current.freshness_token,
    metric_changes,
    signal_changes,
  };
}
