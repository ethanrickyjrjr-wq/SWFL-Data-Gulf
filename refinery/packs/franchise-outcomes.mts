import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputDirection,
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
  BrainOutputDetailTable,
} from "../types/brain-output.mts";
import { franchiseSource, type FranchiseNormalized } from "../sources/franchise-source.mts";

/**
 * franchise-outcomes — SBA 7(a) named-brand franchise loan outcomes, Lee & Collier FL.
 *
 * Source: SBA FOIA county-grain Parquet (ingest/duckdb_pipelines/franchise_outcomes).
 *   REFINERY_FRANCHISE_SOURCE=fixture (default): committed 15-brand curated sample.
 *   REFINERY_FRANCHISE_SOURCE=live: full county-grain Parquet (s3://lake-tier1/...).
 *
 * Tier-1 Reporter: cited facts only, no opinions.
 *
 * Direction polarity: higher corpus survival rate → bullish (franchise borrowers
 *   repaying successfully in Lee & Collier → stronger small-business credit environment).
 *   overall_survival_rate ≥ BULLISH_THRESHOLD → bullish
 *   overall_survival_rate < BEARISH_THRESHOLD → bearish
 *   between → neutral
 *
 * Key metrics:
 *   overall_survival_rate — n_resolved-weighted across assessable brands (≥ 3 resolved loans)
 *
 * Detail table:
 *   franchise_survival — per-brand sorted survival_rate desc; powers sector-credit-swfl
 *     named-brand underwriting cross-validation.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** Brands need at least this many resolved loans to contribute to the direction signal. */
const N_MIN_RESOLVED = 3;

/** Corpus survival rate ≥ this → bullish. National SBA franchise median is ~82-84%. */
const BULLISH_THRESHOLD = 80;

/** Corpus survival rate < this → bearish. Below 65% signals systemic franchise credit stress. */
const BEARISH_THRESHOLD = 65;

/** Distance from the midpoint that saturates magnitude to 1.0. */
const MAGNITUDE_DIVISOR = 20;

// ── Closure state ─────────────────────────────────────────────────────────────

let lastRows: FranchiseNormalized[] = [];
let lastFetchedAt: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowsFromFragments(fragments: RawFragment[]): FranchiseNormalized[] {
  return fragments
    .map((f) => f.normalized as unknown as FranchiseNormalized)
    .filter(
      (r): r is FranchiseNormalized =>
        r != null && typeof r.franchise_name === "string" && typeof r.n_loans === "number",
    );
}

function assessable(rows: FranchiseNormalized[]): FranchiseNormalized[] {
  return rows.filter(
    (r) => r.survival_rate != null && r.n_paid_in_full + r.n_charged_off >= N_MIN_RESOLVED,
  );
}

/**
 * n_resolved-weighted corpus survival rate over assessable brands.
 * Returns null when no brand has enough resolved loans.
 */
function corpusSurvivalRate(rows: FranchiseNormalized[]): number | null {
  const a = assessable(rows);
  if (a.length === 0) return null;
  let totalResolved = 0;
  let totalPaid = 0;
  for (const r of a) {
    const resolved = r.n_paid_in_full + r.n_charged_off;
    totalResolved += resolved;
    totalPaid += r.n_paid_in_full;
  }
  if (totalResolved === 0) return null;
  return Number(((totalPaid / totalResolved) * 100).toFixed(1));
}

function survivalDirection(rate: number | null): BrainOutputDirection {
  if (rate == null) return "neutral";
  if (rate >= BULLISH_THRESHOLD) return "bullish";
  if (rate < BEARISH_THRESHOLD) return "bearish";
  return "neutral";
}

function survivalMagnitude(rate: number | null): number {
  if (rate == null) return 0;
  const mid = (BULLISH_THRESHOLD + BEARISH_THRESHOLD) / 2; // 72.5
  return Math.min(1, Math.abs(rate - mid) / MAGNITUDE_DIVISOR);
}

function makeSource(fetchedAt: string): BrainOutputMetricSource {
  return {
    url: "https://data.sba.gov/dataset/7-a-504-foia",
    fetched_at: fetchedAt,
    tier: 1,
    citation:
      `SBA 7(a) FOIA loan-level data — franchise outcomes, Lee & Collier FL. ` +
      `Resolved-loan denominator (paid-in-full + charged-off); brands with < ${N_MIN_RESOLVED} resolved loans excluded.`,
  };
}

// ── corpusSummary ─────────────────────────────────────────────────────────────

function franchiseCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  lastRows = [];
  lastFetchedAt = null;

  const rows = rowsFromFragments(allFragments);
  if (rows.length === 0) return [];

  lastRows = rows;
  lastFetchedAt = new Date().toISOString();

  const rate = corpusSurvivalRate(rows);

  return [
    {
      topic: "corpus_overview",
      fact: "SBA FOIA franchise outcomes corpus (Lee + Collier)",
      value:
        `${rows.length} franchise brand(s) total, ${assessable(rows).length} assessable ` +
        `(≥ ${N_MIN_RESOLVED} resolved loans). Corpus survival rate: ` +
        (rate != null ? `${rate}%` : "not yet assessable") +
        ".",
      source_fragment_ids: [],
    },
  ];
}

// ── outputProducer ────────────────────────────────────────────────────────────

function franchiseOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const fetched_at = lastFetchedAt ?? new Date().toISOString();

  if (lastRows.length === 0) {
    return {
      conclusion:
        "franchise-outcomes: no SBA FOIA rows this build. Run " +
        "ingest/duckdb_pipelines/franchise_outcomes/pipeline.py or verify the fixture at " +
        "refinery/__fixtures__/franchise-outcomes.sample.json.",
      key_metrics: [],
      caveats: [
        "Zero rows from franchise source. Set REFINERY_FRANCHISE_SOURCE=fixture to use the committed sample " +
          "or REFINERY_FRANCHISE_SOURCE=live to read the Tier-1 Parquet.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const rate = corpusSurvivalRate(lastRows);
  const direction = survivalDirection(rate);
  const magnitude = survivalMagnitude(rate);
  const src = makeSource(fetched_at);
  const assessableBrands = assessable(lastRows);
  const totalResolved = assessableBrands.reduce(
    (s, r) => s + r.n_paid_in_full + r.n_charged_off,
    0,
  );

  const key_metrics: BrainOutputMetric[] = [];
  if (rate != null) {
    key_metrics.push({
      metric: "overall_survival_rate",
      label: "SBA Franchise Survival Rate (SWFL)",
      value: rate,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      // Snapshot metric — no prior-period comparison; trend direction not derivable
      direction: "stable",
      source: src,
    });
  }

  // Per-brand detail table — consumed by sector-credit-swfl for named-brand underwriting.
  const sortedRows = [...lastRows].sort((a, b) => {
    if (a.survival_rate == null && b.survival_rate == null) return 0;
    if (a.survival_rate == null) return 1;
    if (b.survival_rate == null) return -1;
    return b.survival_rate - a.survival_rate;
  });

  const detail_tables: BrainOutputDetailTable[] = [
    {
      id: "franchise_survival",
      title: "SBA Franchise Survival by Brand — Lee & Collier FL",
      grain: "brand",
      columns: [
        { id: "franchise_name", label: "Franchise Brand" },
        {
          id: "survival_rate",
          label: "Survival Rate",
          units: "percent",
          display_format: "percent",
        },
        { id: "n_loans", label: "Total Loans", units: "count", display_format: "count" },
        { id: "n_paid_in_full", label: "Paid in Full", units: "count", display_format: "count" },
        { id: "n_charged_off", label: "Charged Off", units: "count", display_format: "count" },
        {
          id: "total_gross_approval",
          label: "Total Approved",
          units: "USD",
          display_format: "currency",
        },
      ],
      rows: sortedRows.map((r) => ({
        key: r.franchise_code || r.franchise_name,
        label: r.franchise_name,
        cells: {
          franchise_name: r.franchise_name,
          survival_rate: r.survival_rate,
          n_loans: r.n_loans,
          n_paid_in_full: r.n_paid_in_full,
          n_charged_off: r.n_charged_off,
          total_gross_approval: r.total_gross_approval,
        },
      })),
      source: src,
      note:
        `Survival rate = paid-in-full ÷ (paid-in-full + charged-off). ` +
        `Brands with < ${N_MIN_RESOLVED} resolved loans show null — insufficient to assess.`,
    },
  ];

  const caveats: string[] = [];
  if (assessableBrands.length < lastRows.length) {
    caveats.push(
      `${lastRows.length - assessableBrands.length} brand(s) ineligible for survival rate — ` +
        `fewer than ${N_MIN_RESOLVED} resolved loans in Lee & Collier.`,
    );
  }
  if (rate == null) {
    caveats.push(
      "No assessable brands this build — survival rate undetermined. May be running on fixture data.",
    );
  }

  const rateStr = rate != null ? `${rate}%` : "undetermined";
  const conclusion =
    `SBA FOIA franchise data: ${lastRows.length} brand(s) tracked in Lee & Collier FL, ` +
    `${assessableBrands.length} assessable (${totalResolved} resolved loans). ` +
    `Corpus survival rate ${rateStr} → ${direction}. ` +
    `Detail table 'franchise_survival' carries per-brand rates for named-brand underwriting cross-validation.`;

  return {
    conclusion,
    key_metrics,
    caveats,
    detail_tables,
    direction,
    magnitude,
    drivers: [], // leaf brain — no upstream brain inputs
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

export const franchiseOutcomes: PackDefinition = {
  id: "franchise-outcomes",
  brain_id: "franchise-outcomes",
  public_label: "Franchise Outcomes",
  domain: "finance",
  scope:
    "SBA 7(a) FOIA named-brand franchise loan outcomes — Lee & Collier counties, FL. " +
    "Per-brand survival rates over resolved loans; corpus-level direction signal for the SWFL franchise credit environment.",
  ttl_seconds: 7776000, // 90 days — quarterly SBA FOIA cadence
  sources: [franchiseSource],
  input_brains: [], // leaf brain — no upstream brain inputs
  fitScore: () => 8,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary: franchiseCorpusSummary,
  outputProducer: franchiseOutputProducer,
  synthesisStrategy: "deterministic",
  preferences: [
    "The user treats franchise survival rates as named-brand credit signals for underwriting, not aggregate market sentiment.",
    "The user always cross-validates sector-level charge-off rates against per-brand SBA outcomes before underwriting a specific franchise borrower.",
  ],
  activeProject:
    "swfl-intelligence-lake: SBA FOIA franchise credit outcomes reporter for Lee & Collier FL.",
  prompts: {
    triageContext:
      "These fragments are SBA FOIA county-grain franchise loan outcome rows. Each row is one franchise brand in Lee & Collier FL with resolved-loan survival and charge-off rates.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). All synthesis lives in franchiseOutputProducer — deterministic survival rate computation over SBA FOIA rows.",
  },
};
