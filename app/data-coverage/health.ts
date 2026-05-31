/**
 * Pure helpers for the /data-coverage page. NO I/O — every function is a pure
 * transform of already-fetched data, so `health.test.mts` can pin them without
 * a database. The page (page.tsx) does the Supabase reads, then hands the raw
 * numbers here for classification, tiering, severity, and the work-order brief.
 *
 * Status semantics MIRROR the freshness probe (ingest/scripts/check_freshness.py)
 * for the four shared statuses; `EMPTY` is a documented page-only extension.
 */

import type { RegistryLane } from "./_registry.generated";

/** First year the coverage window cares about. Pre-2020 gaps are out of scope. */
export const COVERAGE_START = 2020;

/**
 * FRESH / STALE / MISSING / LOW_VOLUME mirror `check_freshness.py` EXACTLY.
 *
 * `EMPTY` is a PAGE-ONLY status with NO probe equivalent: "a freshness signal
 * exists (the pipeline ran) but the table holds 0 rows" (e.g. a truncated
 * table). The probe never emits EMPTY — it would report FRESH (recent load) and
 * a separate LOW_VOLUME if a floor is set. We surface EMPTY because a 0-row
 * table is a louder "something broke" signal than the probe's freshness lens.
 */
export type HealthStatus =
  | "FRESH"
  | "STALE"
  | "MISSING"
  | "LOW_VOLUME"
  | "EMPTY"
  | "RECENT_GAP";

/** Freshness sub-verdict — the three the probe emits from a load timestamp. */
export type Freshness = "FRESH" | "STALE" | "MISSING";

/** A = act now (ranked). C = parked/blocked (listed). D = healthy (collapsed). */
export type Tier = "A" | "C" | "D";

export type WorkVerb = "GRAB" | "FIX" | "FIND" | "ROUTE";

export type DateKind = "year" | "date";

// ── year math ──────────────────────────────────────────────────────────────

/** A year-int column is already the year; a date column is parsed for its year. */
export function toYear(val: string | number, kind: DateKind): number {
  if (kind === "year") return Math.trunc(Number(val));
  return new Date(val).getUTCFullYear();
}

/** Inclusive window [COVERAGE_START .. currentYear]. */
export function yearWindow(currentYear: number): number[] {
  const out: number[] = [];
  for (let y = COVERAGE_START; y <= currentYear; y++) out.push(y);
  return out;
}

/**
 * Years in the window NOT covered by the contiguous span [minYear..maxYear].
 * v1 trusts the span (internal holes are invisible — a documented limitation;
 * GROUP-BY hole detection is the follow-up). Null bounds → the whole window.
 */
export function missingYears(
  minYear: number | null,
  maxYear: number | null,
  currentYear: number,
): number[] {
  const window = yearWindow(currentYear);
  if (minYear === null || maxYear === null) return window;
  return window.filter((y) => y < minYear || y > maxYear);
}

/** Missing years that are still chaseable: the current or prior year. */
export function recentMissing(
  missing: number[],
  currentYear: number,
): number[] {
  return missing.filter((y) => y >= currentYear - 1);
}

/** [2020,2021,2023,2024,2025] → "2020–2021, 2023–2025". */
export function formatSpans(years: number[]): string {
  if (years.length === 0) return "";
  const sorted = [...years].sort((a, b) => a - b);
  const spans: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    spans.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = sorted[i];
    prev = sorted[i];
  }
  spans.push(start === prev ? `${start}` : `${start}–${prev}`);
  return spans.join(", ");
}

// ── freshness (probe-identical) ──────────────────────────────────────────────

/** threshold_days = int(cadence_days * tolerance_multiplier) — matches the probe. */
export function thresholdDays(
  cadenceDays: number,
  toleranceMultiplier: number,
): number {
  return Math.trunc(cadenceDays * toleranceMultiplier);
}

/**
 * STALE iff age_days > threshold; MISSING when there is no load signal.
 * Identical to `check_freshness.py`'s tier-1/tier-2 status decision.
 */
export function freshnessStatus(
  ageDays: number | null,
  threshold: number,
): Freshness {
  if (ageDays === null) return "MISSING";
  return ageDays > threshold ? "STALE" : "FRESH";
}

// ── classification ───────────────────────────────────────────────────────────

/**
 * Everything the page fetches/derives for one source, before classification.
 * `rowCount === null` only when the count query itself failed (rendered as
 * "query failed"); a healthy 0-row table is `rowCount === 0`.
 */
export interface SourceProbe {
  name: string;
  label: string;
  brainId: string | null;
  brainIsLive: boolean;
  lane: RegistryLane;
  schema: string | null;
  table: string | null;
  notYetRunning: boolean;
  note: string | null;
  cadenceDays: number;
  toleranceMultiplier: number;
  expectedRowsMin: number | null;
  // fetched at render time:
  rowCount: number | null;
  queryFailed: boolean;
  /** ISO date of the latest load (MAX inserted_at / inventory updated_at). */
  lastLoad: string | null;
  ageDays: number | null;
  minYear: number | null;
  maxYear: number | null;
  /** True when no display supplement exists for this active pipeline (defensive). */
  untracked: boolean;
}

export interface ClassifiedRow {
  probe: SourceProbe;
  freshness: Freshness;
  /** The single headline status (worst-first precedence). */
  status: HealthStatus;
  belowFloor: boolean;
  missing: number[];
  recentMissing: number[];
  tier: Tier;
  severity: number;
  verb: WorkVerb | null;
}

/**
 * INTERNAL TRIAGE CONSTANTS — calibrated to rank urgency WITHIN Tier A. They are
 * NOT grounded in external data (no SOURCED.md entry) and must not be read as
 * research-backed. Tune freely; they only order the chase list.
 */
const SEVERITY_BASE: Record<Exclude<HealthStatus, "FRESH">, number> = {
  EMPTY: 1000,
  MISSING: 800,
  STALE: 600,
  LOW_VOLUME: 400,
  RECENT_GAP: 200,
};
const LIVE_BRAIN_AMPLIFIER = 1.5;

function blocked(note: string | null): boolean {
  return note !== null && note.toUpperCase().includes("BLOCKED");
}

/** Worst-first headline status from the fetched numbers. */
function headlineStatus(
  p: SourceProbe,
  freshness: Freshness,
  belowFloor: boolean,
  recent: number[],
): HealthStatus {
  // A count query that errored is treated as EMPTY for triage (needs a look),
  // while the cell still renders "query failed".
  const empty = p.rowCount === 0 || p.queryFailed;
  if (empty && freshness !== "MISSING") return "EMPTY";
  if (freshness === "MISSING") return "MISSING";
  if (freshness === "STALE") return "STALE";
  if (belowFloor) return "LOW_VOLUME";
  if (recent.length > 0) return "RECENT_GAP";
  return "FRESH";
}

function severityFor(
  status: HealthStatus,
  p: SourceProbe,
  threshold: number,
  recent: number[],
): number {
  if (status === "FRESH") return 0;
  let score = SEVERITY_BASE[status];
  if (status === "STALE" && p.ageDays !== null && threshold > 0) {
    score += Math.min(300, Math.round(100 * (p.ageDays / threshold - 1)));
  }
  if (
    status === "LOW_VOLUME" &&
    p.expectedRowsMin &&
    p.rowCount !== null &&
    p.expectedRowsMin > 0
  ) {
    score += Math.round(200 * (1 - p.rowCount / p.expectedRowsMin));
  }
  if (status === "RECENT_GAP") {
    score += 50 * recent.length;
  }
  return Math.round(score * (p.brainIsLive ? LIVE_BRAIN_AMPLIFIER : 1));
}

/** Map a classified row to its work-order verb, or null if it's not actionable. */
function verbFor(
  status: HealthStatus,
  tier: Tier,
  note: string | null,
): WorkVerb | null {
  if (tier === "C") return blocked(note) ? "FIND" : null; // parked-not-blocked → no action yet
  if (tier === "D") return null;
  switch (status) {
    case "STALE":
    case "RECENT_GAP":
      return "GRAB";
    case "EMPTY":
    case "LOW_VOLUME":
      return "FIX";
    case "MISSING":
      return "ROUTE";
    default:
      return null;
  }
}

export function classify(p: SourceProbe, currentYear: number): ClassifiedRow {
  const threshold = thresholdDays(p.cadenceDays, p.toleranceMultiplier);
  const freshness = freshnessStatus(p.ageDays, threshold);
  // Volume floor: tier-2 only, and only when both the floor and a count exist.
  const belowFloor =
    p.lane === "tier-2" &&
    p.expectedRowsMin !== null &&
    p.rowCount !== null &&
    !p.queryFailed &&
    p.rowCount < p.expectedRowsMin;
  const missing =
    p.minYear !== null || p.maxYear !== null
      ? missingYears(p.minYear, p.maxYear, currentYear)
      : [];
  const recent = recentMissing(missing, currentYear);

  const status = headlineStatus(p, freshness, belowFloor, recent);

  // Tier: parked/blocked → C; healthy → D; everything else actionable → A.
  let tier: Tier;
  if (p.notYetRunning || blocked(p.note)) {
    tier = "C";
  } else if (status === "FRESH") {
    tier = "D";
  } else {
    tier = "A";
  }

  const severity = tier === "A" ? severityFor(status, p, threshold, recent) : 0;
  const verb = verbFor(status, tier, p.note);

  return {
    probe: p,
    freshness,
    status,
    belowFloor,
    missing,
    recentMissing: recent,
    tier,
    severity,
    verb,
  };
}

// ── work-order brief (GRAB / FIX / FIND / ROUTE) ─────────────────────────────

const VERB_ORDER: WorkVerb[] = ["FIX", "GRAB", "ROUTE", "FIND"];
const VERB_BLURB: Record<WorkVerb, string> = {
  FIX: "Pipeline ran but the table is broken/short — investigate and re-load.",
  GRAB: "A working route exists; the lake is just behind — re-run or backfill.",
  ROUTE:
    "Cron is registered but the first dispatch hasn't fired — dispatch it.",
  FIND: "No working route — the source is blocked; find a replacement.",
};

function targetLabel(p: SourceProbe): string {
  if (p.schema && p.table) return `${p.schema}.${p.table}`;
  return p.lane;
}

/** One markdown line for an actionable row. Pure — exercised by the tests. */
export function workOrderLine(row: ClassifiedRow): string {
  const p = row.probe;
  const tag = row.status;
  const feeds = p.brainId ? ` Feeds ${p.brainId}.` : " No consuming brain yet.";
  let gap: string;
  let cause: string;
  let act: string;
  const threshold = thresholdDays(p.cadenceDays, p.toleranceMultiplier);
  switch (row.status) {
    case "STALE":
      gap = `last load ${p.ageDays}d ago (cadence ${p.cadenceDays}d, stale past ${threshold}d)`;
      cause = "pipeline overdue / cron not firing";
      act = `re-run the \`${p.name}\` ingest and check its GHA cron`;
      break;
    case "RECENT_GAP":
      gap = `missing ${formatSpans(row.recentMissing)}`;
      cause = "the most recent period never loaded";
      act = `backfill ${formatSpans(row.recentMissing)} for \`${p.name}\``;
      break;
    case "EMPTY":
      gap = p.queryFailed
        ? `count query failed on ${targetLabel(p)}`
        : `0 rows in ${targetLabel(p)} despite a recent load`;
      cause = p.queryFailed
        ? "table/grant problem"
        : "table truncated or the load wrote nothing";
      act = `inspect the last \`${p.name}\` run and re-load`;
      break;
    case "LOW_VOLUME":
      gap = `${p.rowCount?.toLocaleString("en-US")} rows < floor ${p.expectedRowsMin?.toLocaleString("en-US")}`;
      cause = "partial load";
      act = `re-run \`${p.name}\` and verify the source was complete`;
      break;
    case "MISSING":
      gap = "no rows loaded yet (cron registered)";
      cause = "first dispatch hasn't fired";
      act = `dispatch \`${p.name}\` (manual GHA run + any pending SQL migration)`;
      break;
    default: {
      // FIND / blocked
      const noteShort = (p.note ?? "blocked at source")
        .split(/[.\n]/)[0]
        .trim();
      gap = noteShort;
      cause = "source blocked / unfit";
      act = `find a replacement route for \`${p.name}\``;
    }
  }
  return `- [${tag}] ${p.label} (${targetLabel(p)}) — ${gap}. Cause: ${cause}. Do: ${act}.${feeds} Ref: cadence_registry:${p.name}.`;
}

export interface WorkOrderOpts {
  generatedDate: string; // pass in — no Date.now() in pure code paths
  totalSources: number;
}

/**
 * Deterministic markdown brief, grouped by verb (FIX → GRAB → ROUTE → FIND),
 * each group ranked by severity. Returns a "nothing to chase" note when empty.
 */
export function buildWorkOrder(
  rows: ClassifiedRow[],
  opts: WorkOrderOpts,
): string {
  const actionable = rows
    .filter((r) => r.verb !== null)
    .sort((a, b) => b.severity - a.severity);

  const header =
    `# SWFL Data Gulf — data chase list\n` +
    `_Generated ${opts.generatedDate} from /data-coverage · ${opts.totalSources} sources tracked · ` +
    `${actionable.length} need attention._\n`;

  if (actionable.length === 0) {
    return `${header}\n✅ Nothing to chase — every active pipeline is fresh, above its volume floor, and covers the recent window.\n`;
  }

  const sections: string[] = [header];
  for (const verb of VERB_ORDER) {
    const group = actionable.filter((r) => r.verb === verb);
    if (group.length === 0) continue;
    sections.push(`\n## ${verb} (${group.length})\n_${VERB_BLURB[verb]}_\n`);
    sections.push(group.map(workOrderLine).join("\n"));
  }
  return `${sections.join("\n")}\n`;
}
