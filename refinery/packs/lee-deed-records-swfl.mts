import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { BrainOutputProducerResult, BrainOutputMetric } from "../types/brain-output.mts";
import type { SynthesisFact } from "../types/event.mts";
import {
  leeDeedRecordsSource,
  type DeedRecordsSummary,
} from "../sources/lee-deed-records-source.mts";

const BRAIN_ID = "lee-deed-records-swfl";
const SOURCE_ID = "lee_deed_official_records";

// ── Closure state (corpusSummary -> outputProducer handoff) ─────────────────────

let lastSummary: DeedRecordsSummary | null = null;
let lastFetchedAt: string | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────────

const fmtN = (n: number): string => n.toLocaleString("en-US");
const fmtPct = (n: number): string => (n * 100).toFixed(1) + "%";

function nominalShare(s: DeedRecordsSummary): number | null {
  const denom = s.deed_arms_length_30d_lee + s.deed_nominal_30d_lee;
  return denom > 0 ? s.deed_nominal_30d_lee / denom : null;
}

function makeSource(citation: string, fetched_at: string): BrainOutputMetric["source"] {
  return {
    url: "https://or.leeclerk.org/LandMarkWeb/search/index?theme=.blue&section=searchCriteriaDocuments&quickSearchSelection=",
    fetched_at,
    tier: 1,
    citation,
  };
}

// ── corpusSummary ─────────────────────────────────────────────────────────────

function leeDeedRecordsCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  lastSummary = null;
  lastFetchedAt = null;

  const frag = allFragments.find((f) => f.source_id === SOURCE_ID);
  if (!frag) return [];

  const s = frag.normalized as unknown as DeedRecordsSummary;
  if (s?.kind !== "lee-deed-records-summary") return [];

  lastSummary = s;
  lastFetchedAt = frag.fetched_at;

  const share = nominalShare(s);
  return [
    {
      topic: "lee_deed_records_snapshot",
      fact: "Lee County recorded-deed corpus (Clerk of Courts official records)",
      value:
        `${fmtN(s.deed_records_total_lee)} deeds loaded (through ${s.latest_record_date_lee ?? "n/a"}). ` +
        `Trailing 30d: ${fmtN(s.deed_records_30d_lee)} recorded — ` +
        `${fmtN(s.deed_arms_length_30d_lee)} arm's-length, ${fmtN(s.deed_nominal_30d_lee)} nominal ` +
        `(nominal share ${share !== null ? fmtPct(share) : "n/a"}).`,
      source_fragment_ids: [frag.fragment_id],
    },
  ];
}

// ── outputProducer ────────────────────────────────────────────────────────────

function leeDeedRecordsOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const s = lastSummary;
  const fetchedAt = lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  if (!s || s.deed_records_total_lee === 0) {
    return {
      conclusion:
        "lee-deed-records-swfl: data_lake.lee_deed_official_records returned 0 rows — the load has not run yet. " +
        "Capture a day via the manual browser flow (README) and run: python -m ingest.pipelines.lee_deed_official_records.pipeline",
      key_metrics: [],
      caveats: [
        "data_lake.lee_deed_official_records is empty. FETCH is manual (Akamai blocks unattended access); the LOAD merges committed raw/*.json.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const share = nominalShare(s);

  const caveats: string[] = [];
  // Backfill span — with a thin history the 30d velocity is dominated by a few days.
  if (s.earliest_record_date_lee && s.latest_record_date_lee) {
    const spanDays =
      (Date.parse(s.latest_record_date_lee) - Date.parse(s.earliest_record_date_lee)) / 86400_000;
    if (spanDays < 30) {
      caveats.push(
        `Recorded-deed history spans only ${Math.round(spanDays)} day(s) (${s.earliest_record_date_lee} -> ${s.latest_record_date_lee}); backfill is early, so the 30-day velocity is indicative, not a stable trend.`,
      );
    }
  }
  // Source-side completeness gap carried forward (README): party lists truncate.
  caveats.push(
    "Grantor/grantee lists are truncated at the SOURCE past ~3 parties (a literal '...' marker), so multi-party deeds are not represented completely — this is a Lee Clerk feed limit, not a pipeline omission.",
  );
  // Deferred metric — no silent omission of the sale-price signal.
  caveats.push(
    "Deed-grade median sale price is not yet emitted (needs a Postgres percentile view/RPC; PostgREST count queries cannot compute a median). Tracked by check lee_deed_median_consideration_metric.",
  );

  const key_metrics: BrainOutputMetric[] = [
    {
      metric: "deed_records_total_lee",
      label: "Recorded Deeds Loaded — Lee County",
      value: s.deed_records_total_lee,
      direction: "stable",
      variable_type: "extensive",
      units: "deeds",
      display_format: "count",
      source: makeSource(
        `Lee County Clerk of Courts official records — all recorded DEED rows loaded so far: ${fmtN(s.deed_records_total_lee)} (through ${s.latest_record_date_lee ?? "n/a"}).`,
        fetchedAt,
      ),
    },
    {
      metric: "deed_records_30d_lee",
      label: "Deeds Recorded — Lee County (Trailing 30 Days)",
      value: s.deed_records_30d_lee,
      direction: s.deed_records_30d_lee > 0 ? "rising" : "stable",
      variable_type: "extensive",
      units: "deeds",
      display_format: "count",
      source: makeSource(
        `Lee County recorded DEED documents with record_date in the trailing 30 days: ${fmtN(s.deed_records_30d_lee)}.`,
        fetchedAt,
      ),
    },
    {
      metric: "deed_arms_length_30d_lee",
      label: "Arm's-Length Deeds — Lee County (Trailing 30 Days)",
      value: s.deed_arms_length_30d_lee,
      direction: "stable",
      variable_type: "extensive",
      units: "deeds",
      display_format: "count",
      source: makeSource(
        `Lee County recorded DEEDs (trailing 30d) with consideration > $100 — arm's-length sales: ${fmtN(s.deed_arms_length_30d_lee)}. (<= $100 = nominal / quitclaim / family / trust transfer, README.)`,
        fetchedAt,
      ),
    },
    {
      metric: "deed_nominal_transfer_share_lee",
      label: "Nominal-Transfer Share of Recorded Deeds — Lee County (Trailing 30 Days)",
      value: share !== null ? Math.round(share * 10000) / 10000 : 0,
      direction: "stable",
      variable_type: "intensive",
      units: "ratio",
      display_format: "ratio",
      source: makeSource(
        `Share of trailing-30d Lee deeds recorded at <= $100 consideration (nominal / non-arm's-length): ${share !== null ? fmtPct(share) : "n/a"} (${fmtN(s.deed_nominal_30d_lee)} nominal / ${fmtN(s.deed_arms_length_30d_lee + s.deed_nominal_30d_lee)} classifiable).`,
        fetchedAt,
      ),
    },
  ];

  const conclusion =
    `Lee County recorded ${fmtN(s.deed_records_30d_lee)} deed(s) in the trailing 30 days ` +
    `(${fmtN(s.deed_records_total_lee)} loaded through ${s.latest_record_date_lee ?? "n/a"}). ` +
    `Of the classifiable trailing-30d deeds, ${fmtN(s.deed_arms_length_30d_lee)} are arm's-length sales and ` +
    `${fmtN(s.deed_nominal_30d_lee)} are nominal transfers` +
    `${share !== null ? ` (${fmtPct(share)} nominal)` : ""}. ` +
    `Recording velocity and the arm's-length/nominal mix are reported as fact; no market direction is inferred from deed counts.`;

  return {
    conclusion,
    key_metrics,
    caveats,
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

// ── PackDefinition ────────────────────────────────────────────────────────────

export const leeDeedRecordsSwfl: PackDefinition = {
  id: BRAIN_ID,
  brain_id: BRAIN_ID,
  public_label: "Recorded Deeds",
  domain: "real-estate",
  scope:
    "Lee County recorded-deed activity from the Clerk of Courts official records (LandMarkWeb) — deed recording velocity and the arm's-length vs nominal-transfer mix. Reports counts as fact; does not infer market direction or a sale-price median from deed counts.",
  ttl_seconds: 24 * 60 * 60, // 1 day — the LOAD is daily (manual FETCH sets true cadence)

  sources: [leeDeedRecordsSource],
  input_brains: [],

  fitScore: () => 8,

  skipSynthesisAgent: true,
  skipTriageAgent: true,

  corpusSummary: leeDeedRecordsCorpusSummary,
  outputProducer: leeDeedRecordsOutputProducer,

  preferences: [
    "Deed recording velocity is a coincident recording-activity signal, not a leading price signal — the user reads it as volume context.",
    "The nominal-transfer share (<= $100 consideration) separates real arm's-length sales from quitclaim/family/trust transfers; a high nominal share means headline deed counts overstate market sales.",
    "Deed-grade sale price (a median of arm's-length considerations) is the eventual headline but is not emitted yet — do not imply a price read the brain does not compute.",
    "Grantor/grantee party lists are truncated at the source past ~3 parties; never claim a complete party list.",
  ],
  activeProject:
    "lee-deed-records-swfl: report Lee County recorded-deed velocity and arm's-length/nominal mix from the Clerk official-records feed.",
  prompts: {
    triageContext:
      "A recorded-deed row is decision-relevant when it is a DEED document in Lee County with a parseable record_date and consideration.",
    synthesisContext:
      "Report recorded-deed velocity (trailing 30d and total loaded) and the arm's-length vs nominal-transfer mix as cited facts. Never infer market direction, absorption, or a sale-price median from deed counts. Surface the manual-fetch / thin-backfill caveats when history is short.",
  },
};
