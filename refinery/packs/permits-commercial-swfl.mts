import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputDetailTable,
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import { mhsPermitsSource, type MhsPermitNormalized } from "../sources/mhs-permits-source.mts";
import { env } from "../config/env.mts";
import { isCoreScope } from "../lib/core-scope.mts";

/**
 * permits-commercial-swfl — SWFL commercial building permits (Maxwell, Hendry &
 * Simmons annual Data Book, calendar year 2025).
 *
 * Branches: mhs_permits_swfl (data_lake), an ODD (Operation Dumbo Drop) manual
 * PDF source — annual cadence (~March). source_name='mhs_databook' on every row.
 *
 * Leaf brain (no upstream brains). Pure deterministic pack — every fact is
 * computed in code. Aggregates by submarket_slug (jurisdiction crosswalk) into
 * count / value / square-footage, with a per-submarket and per-ZIP detail table.
 *
 * Distinct from `permits-swfl` (residential Accela permits, Lee + Collier) — a
 * different source at a different grain. Never blend the two.
 *
 * Key metrics (SWFL-wide totals):
 *   commercial_permits_count, commercial_permits_value_usd, commercial_permits_sf
 */

// ---------------------------------------------------------------------
// Closure state — populated by corpusSummary, read by outputProducer.
// ---------------------------------------------------------------------
let lastSnapshot: MhsSnapshot | null = null;
let lastFetchedAt: string | null = null;

/** One submarket's aggregated permit totals. */
export interface SubmarketAgg {
  submarket_slug: string;
  count: number;
  value_usd: number;
  building_sf: number;
}

/** One ZIP's aggregated permit totals. */
export interface ZipAgg {
  zip_code: string;
  count: number;
  value_usd: number;
  building_sf: number;
}

export interface MhsSnapshot {
  rows: MhsPermitNormalized[];
  /** The single calendar year these rows cover (null if rows empty / mixed). */
  year: number | null;
  totalCount: number;
  totalValueUsd: number;
  totalSf: number;
  /** Per-submarket aggregates, sorted by value_usd desc. */
  bySubmarket: SubmarketAgg[];
  /** Per-ZIP aggregates (core-scope ZIPs only — Lee + Collier), sorted by count desc. */
  byZip: ZipAgg[];
  /** Rows whose jurisdiction had no crosswalk mapping (submarket_slug null). */
  unmappedCount: number;
  /** Rows with a resolved (in-scope) site ZIP. */
  withZipCount: number;
  /** Rows that have passed manual spot-check (verified=true). */
  verifiedCount: number;
  /** Distinct prior calendar years present (for direction comparison). */
  priorYears: number[];
  /**
   * The single largest permit by declared value (value > 0), with the fields a
   * concentration caveat needs. null when no row carries a positive value. Used
   * to flag when one megaproject dominates the SWFL headline — honest context,
   * not smoothing.
   */
  topPermit: {
    project_name: string | null;
    asset_class: string | null;
    submarket_slug: string | null;
    value_usd: number;
  } | null;
  /** topPermit.value_usd / totalValueUsd (0 when no value). */
  topPermitShare: number;
  source_url: string;
}

function mhsRowsFrom(fragments: RawFragment[]): MhsPermitNormalized[] {
  return fragments
    .map((f) => f.normalized as unknown as MhsPermitNormalized)
    .filter((n) => n?.kind === "mhs-permit");
}

export function buildSnapshot(rows: MhsPermitNormalized[]): MhsSnapshot {
  const source_url = rows[0]?.source_url ?? "";
  const empty: MhsSnapshot = {
    rows,
    year: null,
    totalCount: 0,
    totalValueUsd: 0,
    totalSf: 0,
    bySubmarket: [],
    byZip: [],
    unmappedCount: 0,
    withZipCount: 0,
    verifiedCount: 0,
    priorYears: [],
    topPermit: null,
    topPermitShare: 0,
    source_url,
  };
  if (rows.length === 0) return empty;

  const years = Array.from(
    new Set(rows.map((r) => r.calendar_year).filter((y): y is number => y !== null)),
  ).sort((a, b) => b - a);
  const year = years.length > 0 ? years[0] : null;
  const priorYears = years.filter((y) => year !== null && y < year);

  // SWFL-wide totals
  const totalCount = rows.length;
  const totalValueUsd = rows.reduce((s, r) => s + (r.permit_value_usd ?? 0), 0);
  const totalSf = rows.reduce((s, r) => s + (r.building_sf ?? 0), 0);
  const unmappedCount = rows.filter((r) => r.submarket_slug === null).length;
  const withZipCount = rows.filter((r) => r.zip_code !== null).length;
  const verifiedCount = rows.filter((r) => r.verified).length;

  // By submarket
  const submarketMap = new Map<string, SubmarketAgg>();
  for (const r of rows) {
    if (r.submarket_slug === null) continue;
    const a = submarketMap.get(r.submarket_slug) ?? {
      submarket_slug: r.submarket_slug,
      count: 0,
      value_usd: 0,
      building_sf: 0,
    };
    a.count += 1;
    a.value_usd += r.permit_value_usd ?? 0;
    a.building_sf += r.building_sf ?? 0;
    submarketMap.set(r.submarket_slug, a);
  }
  const bySubmarket = Array.from(submarketMap.values()).sort((a, b) => b.value_usd - a.value_usd);

  // By ZIP — core scope only (Lee 12071 + Collier 12021 = 57). The source scope-gates
  // to the 6-county footprint (resolveZip().in_scope), so a non-core SWFL ZIP
  // (Charlotte/Sarasota/Glades/Hendry) can still reach here and inflate the ranked ZIP-grain
  // table's "of N SWFL ZIPs" denominator. One filter at this ZIP-entry point keeps the
  // commercial_permits_by_zip detail rows core-only (Stage-4 zip-scope-lint enforces it).
  const zipMap = new Map<string, ZipAgg>();
  for (const r of rows) {
    if (r.zip_code === null || !isCoreScope(r.zip_code)) continue;
    const a = zipMap.get(r.zip_code) ?? {
      zip_code: r.zip_code,
      count: 0,
      value_usd: 0,
      building_sf: 0,
    };
    a.count += 1;
    a.value_usd += r.permit_value_usd ?? 0;
    a.building_sf += r.building_sf ?? 0;
    zipMap.set(r.zip_code, a);
  }
  const byZip = Array.from(zipMap.values()).sort((a, b) => b.count - a.count);

  // Largest single permit by declared value (> 0). Drives the concentration
  // caveat: one megaproject (e.g. an Amazon fulfillment center) can dominate the
  // SWFL headline, and the honest read names it rather than letting the
  // aggregate imply a broad-based boom.
  let topRow: MhsPermitNormalized | null = null;
  for (const r of rows) {
    const v = r.permit_value_usd ?? 0;
    if (v > 0 && (topRow === null || v > (topRow.permit_value_usd ?? 0))) topRow = r;
  }
  const topPermit =
    topRow !== null
      ? {
          project_name: topRow.project_name,
          asset_class: topRow.asset_class,
          submarket_slug: topRow.submarket_slug,
          value_usd: topRow.permit_value_usd ?? 0,
        }
      : null;
  const topPermitShare =
    topPermit !== null && totalValueUsd > 0 ? topPermit.value_usd / totalValueUsd : 0;

  return {
    rows,
    year,
    totalCount,
    totalValueUsd,
    totalSf,
    bySubmarket,
    byZip,
    unmappedCount,
    withZipCount,
    verifiedCount,
    priorYears,
    topPermit,
    topPermitShare,
    source_url,
  };
}

// ---------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------

function fmtUsd(n: number): string {
  // Switch to billions above $1B so the headline reads the way it's spoken
  // ("$2.31B"), not "$2313.3M".
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

function fmtSf(n: number): string {
  return `${(n / 1_000_000).toFixed(2)}M sf`;
}

// ---------------------------------------------------------------------
// Metric key constants
// ---------------------------------------------------------------------

const METRIC_COUNT = "commercial_permits_count";
const METRIC_VALUE = "commercial_permits_value_usd";
const METRIC_SF = "commercial_permits_sf";

/**
 * When the single largest permit is at least this share of total declared
 * value, the output names it so the headline can't read as a broad-based boom
 * when one megaproject drives it. Deterministic, no smoothing.
 */
const TOP_PERMIT_CONCENTRATION_THRESHOLD = 0.15;

/** "fort-myers" → "Fort Myers" for human-facing caveat prose. */
function humanizeSubmarket(slug: string | null): string {
  if (!slug) return "an unmapped jurisdiction";
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------
// Stage 3 — deterministic corpus facts.
// ---------------------------------------------------------------------

function corpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  const rows = mhsRowsFrom(allFragments);
  const snapshot = buildSnapshot(rows);
  lastSnapshot = snapshot;
  const sourceFragment = allFragments.find(
    (f) => (f.normalized as unknown as MhsPermitNormalized)?.kind === "mhs-permit",
  );
  lastFetchedAt = sourceFragment?.fetched_at ?? null;

  if (snapshot.totalCount === 0) return [];

  const facts: SynthesisFact[] = [];
  const yr = snapshot.year ?? "?";
  const topSub = snapshot.bySubmarket[0];

  facts.push({
    topic: "mhs_commercial_snapshot",
    fact: `SWFL commercial permits — ${yr} (MHS Data Book)`,
    value:
      `SWFL issued commercial building permits, calendar year ${yr} (Maxwell, Hendry & Simmons Data Book): ` +
      `${snapshot.totalCount} permits totaling ${fmtUsd(snapshot.totalValueUsd)} and ${fmtSf(snapshot.totalSf)} of building area ` +
      `across ${snapshot.bySubmarket.length} submarkets` +
      (topSub
        ? `; ${topSub.submarket_slug} leads on permit value (${fmtUsd(topSub.value_usd)} across ${topSub.count} permits).`
        : "."),
    source_fragment_ids: [],
  });

  facts.push({
    topic: `metric:${METRIC_COUNT}`,
    fact: `SWFL commercial permit count (${yr})`,
    value: `${snapshot.totalCount} commercial building permits issued across SWFL in ${yr}.`,
    source_fragment_ids: [],
  });

  facts.push({
    topic: `metric:${METRIC_VALUE}`,
    fact: `SWFL commercial permit value (${yr})`,
    value: `SWFL commercial permits carry ${fmtUsd(snapshot.totalValueUsd)} in declared permit value for ${yr}.`,
    source_fragment_ids: [],
  });

  facts.push({
    topic: `metric:${METRIC_SF}`,
    fact: `SWFL commercial permit building area (${yr})`,
    value: `SWFL commercial permits total ${fmtSf(snapshot.totalSf)} of building area for ${yr}.`,
    source_fragment_ids: [],
  });

  return facts;
}

// ---------------------------------------------------------------------
// Stage 4 — BrainOutput producer.
// ---------------------------------------------------------------------

function buildSource(
  detail: string,
  snapshot: MhsSnapshot,
  fetched_at: string,
): BrainOutputMetricSource {
  const base =
    `Maxwell, Hendry & Simmons SWFL Data Book — issued commercial permits ` +
    `(${snapshot.totalCount} rows, calendar year ${snapshot.year ?? "?"}, via Brains Supabase data_lake.mhs_permits_swfl, source_name='mhs_databook')`;
  return {
    url: snapshot.source_url,
    fetched_at,
    tier: 1,
    citation: `${base}${detail}.`,
  };
}

function buildDetailTables(snapshot: MhsSnapshot, fetched_at: string): BrainOutputDetailTable[] {
  const tables: BrainOutputDetailTable[] = [];

  if (snapshot.bySubmarket.length > 0) {
    tables.push({
      id: "commercial_permits_by_submarket",
      title: `SWFL commercial permits by submarket — ${snapshot.year ?? "?"}`,
      grain: "submarket",
      columns: [
        { id: "count", label: "Permits", display_format: "count", units: "permits" },
        { id: "value_usd", label: "Permit value", display_format: "currency", units: "USD" },
        { id: "building_sf", label: "Building area", display_format: "count", units: "sf" },
      ],
      rows: snapshot.bySubmarket.map((s) => ({
        key: s.submarket_slug,
        label: s.submarket_slug,
        cells: {
          count: s.count,
          value_usd: Math.round(s.value_usd),
          building_sf: s.building_sf,
        },
      })),
      source: buildSource(" — grouped by submarket_slug", snapshot, fetched_at),
      note: "Submarket = jurisdiction mapped via data_lake.mhs_jurisdiction_xwalk.",
    });
  }

  if (snapshot.byZip.length > 0) {
    tables.push({
      id: "commercial_permits_by_zip",
      title: `SWFL commercial permits by ZIP — ${snapshot.year ?? "?"}`,
      grain: "zip",
      columns: [
        { id: "count", label: "Permits", display_format: "count", units: "permits" },
        { id: "value_usd", label: "Permit value", display_format: "currency", units: "USD" },
        { id: "building_sf", label: "Building area", display_format: "count", units: "sf" },
      ],
      rows: snapshot.byZip.map((z) => ({
        key: z.zip_code,
        label: z.zip_code,
        cells: {
          count: z.count,
          value_usd: Math.round(z.value_usd),
          building_sf: z.building_sf,
        },
      })),
      source: buildSource(
        " — site ZIP from project_address, ranked against the Lee + Collier core ZIP universe",
        snapshot,
        fetched_at,
      ),
      note: `Ranked against the Lee + Collier core ZIP universe. ${snapshot.withZipCount} of ${snapshot.totalCount} permits resolved a site ZIP; permits in non-core counties or without a geocodable address are absent here (still counted in the submarket totals).`,
    });
  }

  return tables;
}

function outputProducer(_out: PackOutput): BrainOutputProducerResult {
  const snapshot = lastSnapshot;
  if (!snapshot || snapshot.totalCount === 0) {
    return {
      conclusion:
        "permits-commercial-swfl: no MHS commercial-permit rows in this build window — pack rendered with no metrics.",
      key_metrics: [],
      caveats: [
        "No mhs_permits_swfl rows survived normalization. Check REFINERY_SOURCE and the data_lake.mhs_permits_swfl table before treating this output as a real read.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const fetched_at = lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const yr = snapshot.year ?? "?";

  const key_metrics: BrainOutputMetric[] = [
    {
      metric: METRIC_COUNT,
      value: snapshot.totalCount,
      direction: "stable",
      label: `SWFL commercial permits issued (${yr})`,
      variable_type: "extensive",
      units: "permits",
      display_format: "count",
      source: buildSource(" — count of all rows", snapshot, fetched_at),
    },
    {
      metric: METRIC_VALUE,
      value: Math.round(snapshot.totalValueUsd),
      direction: "stable",
      label: `SWFL commercial permit value (${yr})`,
      variable_type: "extensive",
      units: "USD",
      display_format: "currency",
      source: buildSource(" — sum(permit_value_usd)", snapshot, fetched_at),
    },
    {
      metric: METRIC_SF,
      value: snapshot.totalSf,
      direction: "stable",
      label: `SWFL commercial permit building area (${yr})`,
      variable_type: "extensive",
      units: "sf",
      display_format: "count",
      source: buildSource(" — sum(building_sf)", snapshot, fetched_at),
    },
  ];

  // Direction: a single calendar year is on file (no prior year to compare),
  // so the headline read is stable by construction — no momentum claim is
  // defensible until a second annual book lands.
  const conclusionParts: string[] = [
    `SWFL issued ${snapshot.totalCount} commercial building permits in ${yr} (Maxwell, Hendry & Simmons Data Book), ` +
      `totaling ${fmtUsd(snapshot.totalValueUsd)} in declared value and ${fmtSf(snapshot.totalSf)} of building area across ${snapshot.bySubmarket.length} submarkets.`,
  ];
  const topThree = snapshot.bySubmarket.slice(0, 3);
  if (topThree.length > 0) {
    conclusionParts.push(
      `Top submarkets by permit value: ${topThree
        .map((s) => `${s.submarket_slug} (${fmtUsd(s.value_usd)}, ${s.count} permits)`)
        .join("; ")}.`,
    );
  }
  conclusionParts.push(
    `Single-year snapshot — direction is stable until a second annual book enables a year-over-year read; master synthesizes the cross-vertical CRE context downstream.`,
  );

  const caveats: string[] = [];
  if (env.source === "fixture") {
    caveats.push(
      "Commercial permits in this build are a SYNTHETIC fixture sample — unset REFINERY_SOURCE or set it to `live` to read the real data_lake.mhs_permits_swfl table.",
    );
  }
  // Concentration context — when one megaproject dominates the headline, name it
  // so the aggregate can't read as a broad-based boom. Deterministic, no smoothing.
  if (
    snapshot.topPermit !== null &&
    snapshot.totalValueUsd > 0 &&
    snapshot.topPermitShare >= TOP_PERMIT_CONCENTRATION_THRESHOLD
  ) {
    const tp = snapshot.topPermit;
    const pct = Math.round(snapshot.topPermitShare * 100);
    const remainingValue = snapshot.totalValueUsd - tp.value_usd;
    const remainingCount = snapshot.totalCount - 1;
    const name = tp.project_name ?? "one permit";
    const assetClause = tp.asset_class ? `${tp.asset_class.toLowerCase()}, ` : "";
    caveats.push(
      `Concentration: one permit (${name}, ${fmtUsd(tp.value_usd)} ${assetClause}${humanizeSubmarket(tp.submarket_slug)}) is ${pct}% of the ${fmtUsd(snapshot.totalValueUsd)} SWFL total; the remaining ${remainingCount} permits sum to ${fmtUsd(remainingValue)}. Read the headline value as one megaproject plus a broader base, not a uniform surge.`,
    );
  }
  if (snapshot.verifiedCount < snapshot.totalCount) {
    caveats.push(
      `Rows are extracted from the MHS Data Book PDF and ${snapshot.verifiedCount === 0 ? "are not yet spot-checked" : `only ${snapshot.verifiedCount} of ${snapshot.totalCount} are spot-checked`} (verified flag). Treat values as directional pending manual review.`,
    );
  }
  if (snapshot.withZipCount < snapshot.totalCount) {
    caveats.push(
      `Site ZIP resolved for ${snapshot.withZipCount} of ${snapshot.totalCount} permits — the remainder had no geocodable street address and carry no ZIP (still counted in submarket and SWFL totals). ZIP-grain reads cover only the resolved subset.`,
    );
  }
  if (snapshot.unmappedCount > 0) {
    caveats.push(
      `${snapshot.unmappedCount} permits have a jurisdiction with no submarket crosswalk entry and are excluded from the by-submarket table (still in SWFL totals).`,
    );
  }
  if (snapshot.priorYears.length === 0) {
    caveats.push(
      "Only one calendar year is on file; no year-over-year comparison is possible yet. Do not infer a trend from a single annual snapshot.",
    );
  }

  return {
    conclusion: conclusionParts.join(" "),
    key_metrics,
    detail_tables: buildDetailTables(snapshot, fetched_at),
    caveats,
    // Brain-level direction enum is bullish|bearish|neutral|mixed. A single
    // calendar year with no prior-year comparable supports no momentum call,
    // so the honest read is neutral (the per-metric direction stays "stable").
    direction: "neutral",
    magnitude: 0.3,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

export const permitsCommercialSwfl: PackDefinition = {
  id: "permits-commercial-swfl",
  brain_id: "permits-commercial-swfl",
  public_label: "Commercial Construction Permits",
  domain: "real-estate",
  scope:
    "SWFL commercial building permits — annual issued-permit dataset from the Maxwell, Hendry & Simmons Data Book (calendar year 2025), aggregated by submarket and site ZIP into permit count, declared value, and building square footage for commercial-real-estate operators.",
  ttl_seconds: 31536000, // 1 year — MHS publishes the Data Book annually (~March)
  sources: [mhsPermitsSource],
  input_brains: [],
  fitScore: (): number => 8,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary,
  outputProducer,
  synthesisStrategy: "deterministic",
  preferences: [
    "The user is an SWFL commercial-real-estate operator who reads issued commercial permits as the forward pipeline of construction by submarket and asset class.",
    "The user weights permit value and building square footage by submarket, and expects a single-year snapshot to be framed as stable — never as a trend — until a second annual book lands.",
    "The user expects ZIP-grain reads only where a site address resolved; a jurisdiction is never used to invent a ZIP.",
  ],
  activeProject:
    "permits-commercial-swfl: SWFL commercial building-permit pipeline (MHS Data Book, annual) — count / value / building-SF by submarket and site ZIP, with master synthesizing the CRE context downstream.",
  prompts: {
    triageContext:
      "These fragments are SWFL commercial building-permit rows from the MHS Data Book (data_lake.mhs_permits_swfl). They are all decision-relevant by construction; the pack is pure deterministic aggregation.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). Every fact is produced deterministically by corpusSummary and the BrainOutput is built by outputProducer.",
  },
};
