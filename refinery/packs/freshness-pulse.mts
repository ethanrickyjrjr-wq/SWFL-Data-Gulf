/**
 * freshness-pulse — Tier-1 reporter for the daily SWFL sourced-freshness layer.
 *
 * Consumes data_lake.daily_truth (one cited current number per metric+area,
 * written by ingest/pipelines/live_search) and emits a "Today's Snapshot":
 * county-grain cited facts as key_metrics, each carrying its real source URL.
 * Master reads these fresh numbers and forms the direction call — this pack
 * states FACTS ONLY (direction "neutral", magnitude 0; THE-GOAL Tier-1).
 *
 * MOAT / no-LLM-in-math (Brain Factory rule 2 + plan locked decision #5): a
 * daily_truth row becomes a key_metric ONLY if it is a real number, carries a
 * real source_url (never a model-memory number), and is NOT a held anomaly
 * (a big unconfirmed day-over-day move waits for human review on the board).
 * direction/magnitude are deterministic constants; no model output enters the
 * math path.
 *
 * ZIP grain — Baseline-Delta machine: every in-scope ZIP gets a pulse point by
 * applying today's county-level delta to that ZIP's real vendor baseline. These
 * are source_tag="approx", rendered [INFERENCE] with a falsifier, and SUPERSEDED
 * by a real same-period ZIP-grain vendor value (a measured ZIP beats an
 * approximated one — never a stale-vendor override). Empty-tolerant so the brain
 * ships in the SAME PR as the table, before any data accumulates (brain-first
 * gate). The runtime vendor-baseline join lights up with the ZIP machine (plan
 * files 08/09); Wave 1 reports county-grain facts and carries an empty ZIP table.
 *
 * Per-ZIP detail_tables exemplar: refinery/packs/housing-swfl.mts (id
 * "housing_by_zip", grain "zip"). Empty-tolerant Supabase reporter exemplar:
 * city-pulse-swfl.mts.
 */
import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputProducerResult,
  BrainOutputMetric,
  BrainOutputDetailRow,
  BrainOutputDetailTable,
} from "../types/brain-output.mts";
import { dailyTruthSource, type DailyTruthRow } from "../sources/daily-truth-source.mts";
import { isoTimestamp } from "../lib/dates.mts";

const BRAIN_ID = "freshness-pulse";

// Pack scope — DUPLICATED VERBATIM in refinery/packs/catalog.mts (Gate 5 checks
// catalog ⇆ PER_PACK_REGISTRY parity on id/domain/scope/ttl). Edit both together.
export const FRESHNESS_PULSE_SCOPE =
  "SWFL daily sourced freshness snapshot — today's cited median asking price (Cape Coral / Fort Myers / Naples, from live active-listing inventory) and 30-year fixed mortgage rate, each provenance-gated to a real source URL, with ZIP-grain Baseline-Delta projections ([INFERENCE]).";

const FRESHNESS_PULSE_TTL = 86400; // 1 day — daily pulse

/**
 * A ZIP's inputs to the Baseline-Delta projection. Built by the runtime join of
 * daily_truth county deltas with per-ZIP vendor baselines (ZHVI / Redfin); the
 * tests inject it directly. `vendorValue`, when present, is a real same-period
 * ZIP-grain measurement that WINS over the approx projection for that ZIP.
 */
export interface ZipBaseline {
  zip: string;
  /** the ZIP's own vendor baseline value (ZHVI / Redfin) the delta is applied to. */
  baseline?: number | null;
  /** today's fresh county-grain value (from daily_truth) for this ZIP's county. */
  countyToday: number;
  /** the vendor county baseline the fresh delta is measured against. */
  countyBaseline: number;
  /** a REAL same-period ZIP-grain vendor value — present ⇒ it supersedes the approx. */
  vendorValue?: number | null;
}

// ── Human-readable labels ─────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function humanArea(area: string): string {
  if (area === "swfl") return "SWFL";
  return titleCase(area);
}

const METRIC_LABELS: Record<string, string> = {
  // median_sale_price retired 07/12/2026 (web-search wrote 19 days of NULLs; no
  // daily sold source exists) — replaced by the lake-computed asking metric.
  median_asking_price: "median asking price",
  mortgage_30yr_fixed: "30-year fixed mortgage rate",
};

function humanMetric(metricKey: string): string {
  return METRIC_LABELS[metricKey] ?? metricKey.replace(/_/g, " ");
}

function unitLabel(unit: string): string {
  if (unit === "usd") return "USD";
  if (unit === "pct" || unit === "percent") return "percent";
  if (unit === "count") return "count";
  return unit || "raw";
}

// ── Slugging (county-grain cited facts) ───────────────────────────────────────
// mortgage_30yr_fixed is a single national rate (area always "swfl") → a stable,
// area-free slug. Everything else is templated `freshness_<metric>_<area>_<unit>`.
// Registered in refinery/vocab/brain-vocabulary.json (concepts + slug_index) in
// this same commit (ship-contract-together).
//
// ⚠ ORPHAN GUARD: this templates a slug for ANY (metric, area, unit) the registry
// produces. Today live_search_config holds exactly median_asking_price × {cape_coral,
// fort_myers, naples} (usd) + mortgage, all four registered. ADDING a new area or
// metric to ingest/cadence_registry.yaml WITHOUT registering its slug in the SAME
// commit orphans master's stage-2.5 normalize — and a template literal evades the
// pre-push Gate-2 double-quoted-`metric:` source scan, so it stays invisible to
// `--all` until live data lands (the conditional-metric-orphan landmine). Register
// the slug the day you add the area, not the day it breaks.

function metricSlug(r: DailyTruthRow): string {
  if (r.metric_key === "mortgage_30yr_fixed") return "freshness_mortgage_30yr_fixed_pct";
  return `freshness_${r.metric_key}_${r.area}_${r.unit}`;
}

// ── The three math-path gates (constraint 5 / the MOAT) ───────────────────────
// A row reaches scoring ONLY if it is a real number with a real source URL and is
// not a held anomaly. Pure code — no LLM, no model-memory number.

function isSourced(r: DailyTruthRow): boolean {
  return r.value != null && !!r.source_url && !r.anomaly_flag;
}

// ── Metric builder ────────────────────────────────────────────────────────────

function toMetric(r: DailyTruthRow, nowIso: string): BrainOutputMetric {
  const isRate = r.unit === "pct" || r.unit === "percent";
  return {
    metric: metricSlug(r),
    value: r.value as number,
    direction: "stable", // reporter: today's value carries no trend; master interprets
    label: `${humanArea(r.area)} ${humanMetric(r.metric_key)} (as of ${r.period})`,
    variable_type: isRate ? "intensive" : "extensive",
    units: unitLabel(r.unit),
    display_format: isRate ? "percent" : r.unit === "usd" ? "currency" : "raw",
    source: {
      url: r.source_url as string,
      fetched_at: r.retrieved_at || nowIso,
      tier: 2,
      citation: r.source_title
        ? `${r.source_title} — current ${humanMetric(r.metric_key)} for ${humanArea(r.area)}, sourced ${r.period}`
        : `Live grounded source — ${r.source_url}`,
    },
  };
}

// ── Baseline-Delta projection ─────────────────────────────────────────────────

/**
 * Project a ZIP-grain pulse point: apply today's county-level delta to the ZIP's
 * vendor baseline. The result is ALWAYS an [INFERENCE] — tagged source_tag
 * "approx", carrying the falsifier and the explicit basis (baseline × county
 * delta). Deterministic; no LLM. Exported for direct unit testing.
 */
export function projectZipPulse(a: {
  zip: string;
  zipBaseline: number;
  countyToday: number;
  countyBaseline: number;
}): {
  zip: string;
  value: number;
  source_tag: "approx";
  inference: true;
  falsifier: string;
  basis: string;
} {
  const countyDelta = a.countyBaseline > 0 ? a.countyToday / a.countyBaseline - 1 : 0;
  const value = Math.round(a.zipBaseline * (1 + countyDelta));
  return {
    zip: a.zip,
    value,
    source_tag: "approx",
    inference: true,
    falsifier: "Superseded when the next ZIP-grain vendor file (ZHVI / Redfin) lands for this ZIP.",
    basis: `ZIP vendor baseline ${a.zipBaseline.toLocaleString("en-US")} × (1 + county delta ${(countyDelta * 100).toFixed(1)}%)`,
  };
}

function toZipRow(z: ZipBaseline): BrainOutputDetailRow {
  // A real same-period vendor value WINS — a measured ZIP beats an approximated
  // one (not a stale-vendor override).
  if (z.vendorValue != null) {
    return {
      key: z.zip,
      label: z.zip,
      cells: {
        value: z.vendorValue,
        source_tag: "vendor",
        basis:
          "Same-period ZIP-grain vendor value (ZHVI / Redfin) — supersedes the approx projection.",
        inference: false,
      },
    };
  }
  const p = projectZipPulse({
    zip: z.zip,
    zipBaseline: z.baseline ?? 0,
    countyToday: z.countyToday,
    countyBaseline: z.countyBaseline,
  });
  return {
    key: z.zip,
    label: z.zip,
    cells: {
      value: p.value,
      source_tag: "approx",
      basis: p.basis,
      inference: true,
    },
  };
}

function zipDetailTable(rows: BrainOutputDetailRow[], nowIso: string): BrainOutputDetailTable {
  return {
    id: "freshness_by_zip",
    title: "Today's ZIP pulse — approx points are [INFERENCE]; vendor points are measured",
    grain: "zip",
    columns: [
      { id: "value", label: "Pulse value", display_format: "currency", units: "USD" },
      { id: "source_tag", label: "Source tag (vendor = measured, approx = projection)" },
      { id: "basis", label: "Basis" },
      { id: "inference", label: "Is [INFERENCE] (projection, not a cited ZIP fact)" },
    ],
    rows,
    source: {
      url: "https://www.swfldatagulf.com/api/b/freshness-pulse",
      fetched_at: nowIso,
      tier: 2,
      citation:
        "Baseline-Delta projection — today's county-grain delta from the daily freshness layer applied to each ZIP's vendor baseline (ZHVI / Redfin). approx rows are [INFERENCE], superseded by the next ZIP-grain vendor file; a same-period vendor value wins.",
    },
    note: "approx = the county-level fresh delta applied to the ZIP's vendor baseline (an [INFERENCE] projection, never a cited ZIP fact); vendor = a real same-period ZIP-grain value that supersedes the approx. We never label a county figure as a ZIP figure.",
  };
}

// ── Conclusion / caveats ──────────────────────────────────────────────────────

function formatValue(m: BrainOutputMetric): string {
  const v = typeof m.value === "number" ? m.value : Number(m.value);
  if (m.display_format === "currency") {
    return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (m.display_format === "percent") return `${v}%`;
  return String(m.value);
}

function snapshotSentence(metrics: BrainOutputMetric[], zipCount: number): string {
  if (metrics.length === 0) {
    return `Today's snapshot holds ${zipCount} ZIP pulse projection(s) ([INFERENCE]) but no county-grain sourced number yet. Cited current facts only; the cross-vertical read lives downstream in master.`;
  }
  const lead = metrics.slice(0, 4).map((m) => `${m.label} ${formatValue(m)}`);
  const more = metrics.length > 4 ? ` (+${metrics.length - 4} more)` : "";
  const zipClause =
    zipCount > 0
      ? ` ${zipCount} ZIP pulse projection(s) ([INFERENCE]) ride in the detail table.`
      : "";
  return `Today's sourced snapshot — ${lead.join("; ")}${more}.${zipClause} These are cited current facts only; the direction call lives downstream in master.`;
}

function buildCaveats(metricCount: number, zipCount: number): string[] {
  const c: string[] = [];
  if (zipCount > 0) {
    c.push(
      "approx ZIP points are projections (today's county delta on each ZIP's vendor baseline), not cited ZIP facts — they are [INFERENCE], superseded when the next ZIP-grain vendor file lands.",
    );
  }
  c.push(
    "Each county-grain number is a single grounded source's current figure, provenance-gated to a real source URL; held anomalies and unsourced (model-memory) numbers are excluded by design.",
  );
  if (metricCount === 0 && zipCount > 0) {
    c.push("No county-grain sourced number landed today — only ZIP projections are shown.");
  }
  return c;
}

function emptyResult(): BrainOutputProducerResult {
  return {
    conclusion:
      "No fresh sourced snapshot available yet — the daily freshness engine has not landed a verified, in-band number carrying a real source.",
    key_metrics: [],
    detail_tables: [],
    caveats: [
      "The sourced freshness layer is live but holds no verified rows yet (or every candidate was a held anomaly / unsourced number, both excluded by design).",
    ],
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

/**
 * Pure builder — the honest unit-test surface. The (sync) outputProducer reads
 * module state set by corpusSummary and delegates here.
 */
export function buildFreshnessPulse(input: {
  dailyTruth: DailyTruthRow[];
  zipBaselines: ZipBaseline[];
}): BrainOutputProducerResult {
  const nowIso = isoTimestamp();
  const dailyTruth = input.dailyTruth ?? [];
  const zipBaselines = (input.zipBaselines ?? []).filter(
    (z) => z.vendorValue != null || z.baseline != null,
  );

  const key_metrics: BrainOutputMetric[] = dailyTruth
    .filter(isSourced)
    .map((r) => toMetric(r, nowIso));

  const zipRows: BrainOutputDetailRow[] = zipBaselines.map(toZipRow);

  // Empty-tolerant: nothing sourced AND no ZIP projection ⇒ valid neutral brain.
  if (key_metrics.length === 0 && zipRows.length === 0) {
    return emptyResult();
  }

  const detail_tables: BrainOutputDetailTable[] = zipRows.length
    ? [zipDetailTable(zipRows, nowIso)]
    : [];

  return {
    conclusion: snapshotSentence(key_metrics, zipRows.length),
    key_metrics,
    detail_tables,
    caveats: buildCaveats(key_metrics.length, zipRows.length),
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

// ── Module state (corpusSummary → outputProducer handoff) ─────────────────────

let lastDailyTruth: DailyTruthRow[] = [];
let lastZipBaselines: ZipBaseline[] = [];

function freshnessPulseCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  const rows = allFragments
    .map((f) => f.normalized as unknown as DailyTruthRow)
    .filter((n): n is DailyTruthRow => !!n && n.kind === "daily-truth");
  lastDailyTruth = rows;
  // Wave 1: the Baseline-Delta machine (projectZipPulse + buildFreshnessPulse) is
  // built + tested, but its runtime vendor-baseline join lights up with the ZIP
  // machine (plan files 08/09). Until then the brain reports county-grain cited
  // facts and carries an empty ZIP table.
  lastZipBaselines = [];

  const sourced = rows.filter(isSourced);
  if (sourced.length === 0) return [];
  return sourced.map((r) => ({
    topic: `freshness :: ${r.metric_key} :: ${r.area}`,
    fact: `${humanArea(r.area)} ${humanMetric(r.metric_key)} (sourced ${r.period})`,
    value: `${r.value} ${r.unit} as of ${r.period}, source ${r.source_title ?? r.source_url} (${r.source_url}).`,
    source_fragment_ids: [],
  }));
}

function freshnessPulseOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  return buildFreshnessPulse({
    dailyTruth: lastDailyTruth,
    zipBaselines: lastZipBaselines,
  });
}

// ── PackDefinition ────────────────────────────────────────────────────────────

export const freshnessPulse: PackDefinition = {
  id: BRAIN_ID,
  brain_id: BRAIN_ID,
  public_label: "Daily Freshness",
  // No "market" domain exists in BrainDomain (closed set); median sale price +
  // mortgage are housing-market signals → "real-estate" (matches housing/rentals).
  domain: "real-estate",
  scope: FRESHNESS_PULSE_SCOPE,
  ttl_seconds: FRESHNESS_PULSE_TTL,
  sources: [dailyTruthSource],
  input_brains: [], // leaf — master names freshness-pulse, never the reverse (DAG cycle)
  fitScore: (): number => 8,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary: freshnessPulseCorpusSummary,
  outputProducer: freshnessPulseOutputProducer,
  synthesisStrategy: "deterministic",
  preferences: [
    "The user reads freshness-pulse as today's sourced snapshot — the fast 'what is the number right now' layer the slower monthly vendor brains lack.",
    "The user expects every surfaced number to be a cited current fact (real source URL), never a model-memory guess or an opinion.",
    "The user expects master to weigh these fresh numbers; the direction call and any speculation live downstream, not here.",
  ],
  activeProject:
    "freshness-pulse: daily SWFL sourced-freshness reporter over data_lake.daily_truth (cited, provenance-gated, anomaly-screened), feeding master a fresh county-grain snapshot.",
  prompts: {
    triageContext:
      "These fragments are data_lake.daily_truth rows — one cited current number per metric+area from the daily freshness engine. Decision-relevant by construction; the pack is pure deterministic selection.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). Facts come from freshnessPulseCorpusSummary; the BrainOutput is built by freshnessPulseOutputProducer. Reporter discipline: facts only, direction neutral — master forms the direction call.",
  },
};
