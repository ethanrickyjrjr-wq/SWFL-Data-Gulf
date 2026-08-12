import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { BrainOutputProducerResult, BrainOutputMetric } from "../types/brain-output.mts";
import type { SynthesisFact } from "../types/event.mts";
import {
  collierOfficialRecordsSource,
  type CollierRecordsSummary,
} from "../sources/collier-official-records-source.mts";

const BRAIN_ID = "collier-official-records-swfl";
const SOURCE_ID = "collier_official_records";

// ── Closure state (corpusSummary -> outputProducer handoff) ─────────────────────

let lastSummary: CollierRecordsSummary | null = null;
let lastFetchedAt: string | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────────────

const fmtN = (n: number): string => n.toLocaleString("en-US");

function makeSource(citation: string, fetched_at: string): BrainOutputMetric["source"] {
  return {
    url: "https://cor.collierclerk.com/search/document",
    fetched_at,
    tier: 1,
    citation,
  };
}

// ── corpusSummary ─────────────────────────────────────────────────────────────

function collierOfficialRecordsCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  lastSummary = null;
  lastFetchedAt = null;

  const frag = allFragments.find((f) => f.source_id === SOURCE_ID);
  if (!frag) return [];

  const s = frag.normalized as unknown as CollierRecordsSummary;
  if (s?.kind !== "collier-official-records-summary") return [];

  lastSummary = s;
  lastFetchedAt = frag.fetched_at;

  return [
    {
      topic: "collier_official_records_snapshot",
      fact: "Collier County recorded-document corpus (Clerk of Courts official records, all doc types)",
      value:
        `${fmtN(s.collier_records_total)} documents loaded (through ${s.latest_record_date ?? "n/a"}). ` +
        `Trailing 30d: ${fmtN(s.collier_records_30d)} recorded — ` +
        `${fmtN(s.collier_deed_30d)} DEED, ${fmtN(s.collier_notice_of_commencement_30d)} Notice of Commencement.`,
      source_fragment_ids: [frag.fragment_id],
    },
  ];
}

// ── outputProducer ────────────────────────────────────────────────────────────

function collierOfficialRecordsOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const s = lastSummary;
  const fetchedAt = lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  if (!s || s.collier_records_total === 0) {
    return {
      conclusion:
        "collier-official-records-swfl: data_lake.collier_official_records returned 0 rows — the daily cron has not landed a load yet. Run: python -m ingest.pipelines.collier_official_records.pipeline",
      key_metrics: [],
      caveats: [
        "data_lake.collier_official_records is empty. Ingest is fully automated (ingest-collier-official-records.yml, daily) — an empty table means the cron has not run yet, not a source-side gap.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const caveats: string[] = [];
  if (s.earliest_record_date && s.latest_record_date) {
    const spanDays =
      (Date.parse(s.latest_record_date) - Date.parse(s.earliest_record_date)) / 86400_000;
    if (spanDays < 30) {
      caveats.push(
        `Recorded-document history spans only ${Math.round(spanDays)} day(s) (${s.earliest_record_date} -> ${s.latest_record_date}); backfill is early, so the 30-day velocity is indicative, not a stable trend.`,
      );
    }
  }
  caveats.push(
    "This feed carries NO consideration/sale-price column (unlike lee-deed-records-swfl) — it reports recording velocity and doc-type mix only, never a sale price or an arm's-length/nominal split.",
  );
  caveats.push(
    "Doc-type codes beyond DEED and NC (Notice of Commencement) are not yet broken out as separate metrics here — the full 37-code label map lives in ingest/pipelines/collier_official_records/constants.py.",
  );

  const key_metrics: BrainOutputMetric[] = [
    {
      metric: "collier_records_total",
      label: "Recorded Documents Loaded — Collier County",
      value: s.collier_records_total,
      direction: "stable",
      variable_type: "extensive",
      units: "documents",
      display_format: "count",
      source: makeSource(
        `Collier County Clerk of Courts official records — all recorded document types loaded so far: ${fmtN(s.collier_records_total)} (through ${s.latest_record_date ?? "n/a"}).`,
        fetchedAt,
      ),
    },
    {
      metric: "collier_records_30d",
      label: "Documents Recorded — Collier County (Trailing 30 Days)",
      value: s.collier_records_30d,
      direction: s.collier_records_30d > 0 ? "rising" : "stable",
      variable_type: "extensive",
      units: "documents",
      display_format: "count",
      source: makeSource(
        `Collier County recorded documents (all 37 doc types) with record_date in the trailing 30 days: ${fmtN(s.collier_records_30d)}.`,
        fetchedAt,
      ),
    },
    {
      metric: "collier_deed_30d",
      label: "Deeds Recorded — Collier County (Trailing 30 Days)",
      value: s.collier_deed_30d,
      direction: "stable",
      variable_type: "extensive",
      units: "deeds",
      display_format: "count",
      source: makeSource(
        `Collier County recorded DEED documents, trailing 30 days: ${fmtN(s.collier_deed_30d)}.`,
        fetchedAt,
      ),
    },
    {
      metric: "collier_notice_of_commencement_30d",
      label: "Notices of Commencement — Collier County (Trailing 30 Days)",
      value: s.collier_notice_of_commencement_30d,
      direction: "stable",
      variable_type: "extensive",
      units: "filings",
      display_format: "count",
      source: makeSource(
        `Collier County recorded Notice of Commencement filings, trailing 30 days: ${fmtN(s.collier_notice_of_commencement_30d)} — a pre-permit construction/renovation signal (F.S. 713.13).`,
        fetchedAt,
      ),
    },
  ];

  const conclusion =
    `Collier County recorded ${fmtN(s.collier_records_30d)} document(s) in the trailing 30 days ` +
    `(${fmtN(s.collier_records_total)} loaded through ${s.latest_record_date ?? "n/a"}), ` +
    `including ${fmtN(s.collier_deed_30d)} deeds and ${fmtN(s.collier_notice_of_commencement_30d)} Notice of Commencement filings. ` +
    `Recording velocity and doc-type mix are reported as fact; no market direction or sale price is inferred (this feed carries no consideration column).`;

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

export const collierOfficialRecordsSwfl: PackDefinition = {
  id: BRAIN_ID,
  brain_id: BRAIN_ID,
  public_label: "Recorded Documents",
  domain: "real-estate",
  scope:
    "Collier County recorded-document activity from the Clerk of Courts official records (COR Access) — ALL 37 document types, recording velocity, and the DEED / Notice of Commencement breakdown. No consideration/sale-price data is available from this source.",
  ttl_seconds: 24 * 60 * 60, // 1 day — fully automated daily cron

  sources: [collierOfficialRecordsSource],
  input_brains: [],

  fitScore: () => 8,

  skipSynthesisAgent: true,
  skipTriageAgent: true,

  corpusSummary: collierOfficialRecordsCorpusSummary,
  outputProducer: collierOfficialRecordsOutputProducer,

  preferences: [
    "Recorded-document velocity is a coincident recording-activity signal, not a leading price signal — the user reads it as volume/activity context.",
    "This feed has NO consideration/sale-price column — never imply a sale price, median, or arm's-length classification from it; that distinction is Lee-only (lee-deed-records-swfl).",
    "Notice of Commencement filings are a pre-permit construction/renovation signal (F.S. 713.13) — they fire before a building permit necessarily shows up in the permits pipeline.",
    "This source is brand-new (08/12/2026) — do not imply a long track record or a stable seasonal pattern.",
  ],
  activeProject:
    "collier-official-records-swfl: report Collier County recorded-document velocity and DEED/Notice-of-Commencement mix from the Clerk official-records feed (all 37 doc types).",
  prompts: {
    triageContext:
      "A recorded-document row is decision-relevant when it has a parseable record_date and doc_type.",
    synthesisContext:
      "Report recorded-document velocity (trailing 30d and total loaded) and the DEED / Notice of Commencement mix as cited facts. Never infer a sale price, market direction, or absorption — this feed carries no consideration column. Surface the thin-backfill caveat while history is short.",
  },
};
