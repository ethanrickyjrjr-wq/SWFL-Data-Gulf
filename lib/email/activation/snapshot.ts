/**
 * lib/email/activation/snapshot.ts — assemble a grounded ZIP report + its snapshot.
 *
 * The scope→grounded-content path (verified against `app/r/zip-report/[zip]/page.tsx`,
 * RULE 3 C1): `resolveZip` is the 6-county MOAT gate; `assembleLocationDossier` emits
 * per-brain cited, speaker-scrubbed lines; the per-ZIP housing/flood facts come from
 * the `housing-swfl` / `env-swfl` brains exactly as the page reads them.
 *
 * `assembleActivationReport` returns BOTH the display content (for the email body)
 * and the reduced `ActivationSnapshot` (the delta's left operand). Email #1 stores
 * the snapshot; email #2 re-assembles and diffs against it — "what we showed you
 * Tuesday vs. now" is true by construction. We diff the DISTILLED brain output via
 * the dossier, never raw `data_lake` rows, so the email layer inherits the brains'
 * already-distilled live head (no `city_pulse` supersession logic re-implemented).
 */

import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import type { ZipResolution, Grain } from "@/refinery/lib/zip-resolver.mts";
import type { LocationInput } from "@/refinery/lib/location-resolver.mts";
import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import { loadParsedBrain } from "@/lib/fetch-brain";
import {
  assembleLocationDossier,
  selectDossierLines,
  type LocationDossier,
} from "@/lib/zip-dossier";
import { fingerprintText } from "./delta";
import type { ActivationScope, ActivationSnapshot, SnapshotMetric, SnapshotLine } from "./types";

/** A numeric fact plus its display string (the snapshot keeps only the numeric part). */
export interface ReportMetric extends SnapshotMetric {
  /** Render-ready value, e.g. "$412,000", "45", "94.3%". */
  display: string;
}

/** A per-brain dossier line, display-ready (already speaker-scrubbed + cited). */
export interface ReportLine {
  brain_id: string;
  grain: string;
  is_true_zip: boolean;
  label: string;
  text: string;
  source_url: string;
  source_citation: string;
}

/** The full assembled report — display content + the reduced delta snapshot. */
export interface AssembledReport {
  in_scope: boolean;
  zip: string;
  primaryPlace: string | null;
  countyName: string | null;
  freshness_token: string | null;
  metrics: ReportMetric[];
  lines: ReportLine[];
  coverage_caveats: string[];
  snapshot: ActivationSnapshot;
}

/** Injectable brain loader (tests pass fixtures); defaults to disk. */
export interface AssembleReportOptions {
  loadBrain?: (slug: string) => Promise<ParsedBrain | null>;
  /** Stamped onto the snapshot; defaults to now. Injected so tests are deterministic. */
  now?: Date;
}

// --- per-ZIP housing cells we surface (mirrors the report page's headline set) ---
// `direction` drives only the delta arrow's favorability; left neutral where a move
// is genuinely ambiguous (price is good for a seller, bad for a buyer).
const HOUSING_CELLS: Array<{
  cell: string;
  key: string;
  label: string;
  unit: string;
  direction: SnapshotMetric["direction"];
  format: "currency" | "int" | "percent";
}> = [
  {
    cell: "median_sale_price",
    key: "housing.median_sale_price",
    label: "Median sale price",
    unit: "",
    direction: "neutral",
    format: "currency",
  },
  {
    cell: "median_dom",
    key: "housing.median_dom",
    label: "Days on market",
    unit: " days",
    direction: "lower_is_better",
    format: "int",
  },
  {
    cell: "avg_sale_to_list_pct",
    key: "housing.sale_to_list",
    label: "Sale-to-list ratio",
    unit: "%",
    direction: "neutral",
    format: "percent",
  },
  {
    cell: "months_of_supply",
    key: "housing.months_of_supply",
    label: "Months of supply",
    unit: "",
    direction: "neutral",
    format: "int",
  },
  {
    cell: "homes_sold",
    key: "housing.homes_sold",
    label: "Homes sold (90d)",
    unit: "",
    direction: "neutral",
    format: "int",
  },
  {
    cell: "inventory",
    key: "housing.inventory",
    label: "Active inventory",
    unit: "",
    direction: "neutral",
    format: "int",
  },
];

/**
 * THE currency classification for raw-value rendering downstream. Delta rows work on
 * raw numbers (SnapshotMetric carries no format field), so the "$" prefix must be
 * re-applied by key — derived here from HOUSING_CELLS' `format:"currency"` plus the
 * flood AAL metric (whose $-display lives in `floodMetrics` below), so currency-ness
 * has ONE authority file: add a currency cell above and it is automatically a
 * currency delta everywhere.
 */
export const CURRENCY_METRIC_KEYS: ReadonlySet<string> = new Set([
  ...HOUSING_CELLS.filter((c) => c.format === "currency").map((c) => c.key),
  "env.flood_aal_usd",
]);

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function formatMetric(
  value: number | null,
  fmt: "currency" | "int" | "percent",
  unit: string,
): string {
  if (value === null) return "—";
  if (fmt === "currency") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (fmt === "percent") return `${value}%`;
  return `${value.toLocaleString("en-US")}${unit}`;
}

function resolvedAsZip(resolution: ZipResolution): LocationInput {
  return { kind: "zip", resolution };
}

/** Pull the per-ZIP housing metrics from the housing-swfl brain (if held). */
function housingMetrics(brain: ParsedBrain | null, zip: string): ReportMetric[] {
  const table = brain?.output.detail_tables?.find((t) => t.id === "housing_by_zip");
  const row = table?.rows.find((r) => r.key === zip);
  if (!row) return [];
  const out: ReportMetric[] = [];
  for (const def of HOUSING_CELLS) {
    const value = asNumber(row.cells[def.cell]);
    if (value === null) continue;
    out.push({
      key: def.key,
      label: def.label,
      value,
      unit: def.unit,
      direction: def.direction,
      display: formatMetric(value, def.format, def.unit),
    });
  }
  return out;
}

/** Pull the per-ZIP flood AAL + percentile rank from the env-swfl brain (if held). */
function floodMetrics(brain: ParsedBrain | null, zip: string): ReportMetric[] {
  const km = brain?.output.key_metrics ?? [];
  const aal = km.find((m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`);
  const rank = km.find((m) => m.metric === `swfl_zip_${zip}_flood_aal_pct_swfl_rank`);
  const out: ReportMetric[] = [];
  const aalVal = asNumber(aal?.value);
  if (aalVal !== null) {
    out.push({
      key: "env.flood_aal_usd",
      label: "Flood avg annual loss",
      value: aalVal,
      unit: "",
      direction: "lower_is_better",
      display: `$${aalVal.toLocaleString("en-US", { maximumFractionDigits: 0 })} / yr`,
    });
  }
  const rankVal = asNumber(rank?.value);
  if (rankVal !== null) {
    out.push({
      key: "env.flood_pct_rank",
      label: "SWFL flood-risk percentile",
      value: Math.round(rankVal),
      unit: "th",
      direction: "lower_is_better",
      display: `${Math.round(rankVal)}th`,
    });
  }
  return out;
}

function dossierToLines(dossier: LocationDossier): ReportLine[] {
  // Tier 2 selection: true-ZIP lines first, then up to 8 ranked headline lines.
  return selectDossierLines(dossier.lines, 2).map((l) => ({
    brain_id: l.brain_id,
    grain: l.grain as Grain,
    is_true_zip: l.is_true_zip,
    label: l.coverage_label || l.domain,
    text: l.text,
    source_url: l.source_url,
    source_citation: l.source_citation,
  }));
}

function toSnapshot(
  zip: string,
  freshnessToken: string | null,
  capturedAt: string,
  metrics: ReportMetric[],
  lines: ReportLine[],
): ActivationSnapshot {
  const snapMetrics: SnapshotMetric[] = metrics.map(({ key, label, value, unit, direction }) => ({
    key,
    label,
    value,
    unit,
    direction,
  }));
  const snapLines: SnapshotLine[] = lines.map((l) => ({
    brain_id: l.brain_id,
    grain: l.grain,
    is_true_zip: l.is_true_zip,
    label: l.label,
    fingerprint: fingerprintText(l.text),
  }));
  return {
    zip,
    freshness_token: freshnessToken,
    captured_at: capturedAt,
    metrics: snapMetrics,
    lines: snapLines,
  };
}

/**
 * Assemble the grounded report for a scope and reduce it to a delta snapshot.
 * Out-of-scope ZIPs return `in_scope:false` with an empty snapshot — the caller
 * MUST park/clarify the enrollment, never invent a sub-grain number.
 */
export async function assembleActivationReport(
  scope: ActivationScope,
  opts: AssembleReportOptions = {},
): Promise<AssembledReport> {
  const loadBrain = opts.loadBrain ?? loadParsedBrain;
  const capturedAt = (opts.now ?? new Date()).toISOString();
  const zip = scope.zip;

  // 6-county MOAT gate — the one hard guard.
  const resolution = resolveZip(zip);
  if (!resolution.in_scope) {
    return {
      in_scope: false,
      zip,
      primaryPlace: null,
      countyName: null,
      freshness_token: null,
      metrics: [],
      lines: [],
      coverage_caveats: [],
      snapshot: toSnapshot(zip, null, capturedAt, [], []),
    };
  }

  const loc = resolvedAsZip(resolution);
  const [dossier, housing, env] = await Promise.all([
    assembleLocationDossier(loc, { loadBrain }),
    loadBrain("housing-swfl"),
    loadBrain("env-swfl"),
  ]);

  const metrics = [...housingMetrics(housing, zip), ...floodMetrics(env, zip)];
  const lines = dossierToLines(dossier);

  // Freshness token — prefer the housing/env brains (the per-ZIP source), else any dossier line.
  const freshness_token =
    housing?.freshness_token ??
    env?.freshness_token ??
    Object.values(dossier.freshness_tokens)[0] ??
    null;

  const primaryPlace =
    (resolution.places.find((p) => p.match === "primary") ?? resolution.places[0])?.place ?? null;
  const countyName = resolution.county_names[0] ?? null;

  return {
    in_scope: true,
    zip,
    primaryPlace,
    countyName,
    freshness_token,
    metrics,
    lines,
    coverage_caveats: dossier.coverage_caveats,
    snapshot: toSnapshot(zip, freshness_token, capturedAt, metrics, lines),
  };
}
