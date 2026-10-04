import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { BrainOutputProducerResult, BrainOutputMetric } from "../types/brain-output.mts";
import type { SynthesisFact } from "../types/event.mts";
import { dbprSirsSource, type DbprSirsSummary } from "../sources/dbpr-sirs-source.mts";
import {
  condoBaselineSource,
  COLLIER_DOC_URL,
  LEE_DOC_URL,
  type CondoBaselineSummary,
} from "../sources/condo-baseline-source.mts";

const SOURCE_ID = "dbpr_sirs_submissions";
const BASELINE_SOURCE_ID = "condo_baseline_swfl";

// Sanity floor: 280 SWFL rows. Originally a probe estimate from the DOM-scrape era;
// the QIX websocket pull now returns the complete hypercube deterministically (1,358
// SWFL rows as of 2026-06-22), so magnitude is effectively always capped at 1.0 and
// this value now serves only as a low-count tripwire (pairs with the <50 caveat below).
// Not a compliance denominator — a data-volume signal only.
const SIRS_SWFL_EXPECTED_FLOOR = 280;

// ── Closure state ─────────────────────────────────────────────────────────────

let lastSummary: DbprSirsSummary | null = null;
let lastFetchedAt: string | null = null;
let lastBaseline: CondoBaselineSummary | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtN = (n: number): string => n.toLocaleString("en-US");
const fmtPct = (n: number): string => (n * 100).toFixed(1) + "%";
const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

function makeSource(citation: string, fetched_at: string): BrainOutputMetric["source"] {
  return {
    url: "https://dbpr-publicrecords.myfloridalicense.com/qpr/single/",
    fetched_at,
    tier: 1,
    citation,
  };
}

function makeBaselineSource(
  url: string,
  citation: string,
  fetched_at: string,
): BrainOutputMetric["source"] {
  return { url, fetched_at, tier: 1, citation };
}

/** True when the baseline pipeline has landed rows — the pack only claims a
 *  denominator it actually has. */
function hasBaseline(b: CondoBaselineSummary | null): b is CondoBaselineSummary {
  return !!b && b.buildings_lee + b.buildings_collier > 0;
}

// ── corpusSummary ─────────────────────────────────────────────────────────────

function sirsCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  lastSummary = null;
  lastFetchedAt = null;
  lastBaseline = null;

  const facts: SynthesisFact[] = [];

  const baseFrag = allFragments.find((f) => f.source_id === BASELINE_SOURCE_ID);
  const b = baseFrag?.normalized as unknown as CondoBaselineSummary | undefined;
  if (baseFrag && b?.kind === "condo-baseline-summary" && hasBaseline(b)) {
    lastBaseline = b;
    facts.push({
      topic: "condo_baseline_snapshot",
      fact: "SWFL 3+-story condo building baseline — Lee footprints + Collier milestone list",
      value:
        `Lee: ${fmtN(b.buildings_lee)} buildings (${fmtN(b.buildings_with_sirs_lee)} with a matched SIRS filing). ` +
        `Collier: ${fmtN(b.buildings_collier)} program-registered buildings (${fmtN(b.buildings_with_sirs_collier)} matched; ` +
        `${fmtN(b.collier_delinquent)} milestone-delinquent). ` +
        `Cross-reference: ${fmtN(b.xref_accepted)}/${fmtN(b.xref_total)} filings matched, ` +
        `${fmtN(b.xref_needs_review)} need review.`,
      source_fragment_ids: [baseFrag.fragment_id],
    });
  }

  const frag = allFragments.find((f) => f.source_id === SOURCE_ID);
  if (!frag) return facts;

  const s = frag.normalized as unknown as DbprSirsSummary;
  if (s?.kind !== "dbpr-sirs-summary") return facts;

  lastSummary = s;
  lastFetchedAt = frag.fetched_at;

  facts.unshift({
    topic: "dbpr_sirs_snapshot",
    fact: "DBPR SIRS confirmed filings — Lee + Collier (positive signal only)",
    value:
      `Total SWFL confirmed: ${fmtN(s.sirs_confirmed_swfl)} ` +
      `(Lee: ${fmtN(s.sirs_lee_count)}, Collier: ${fmtN(s.sirs_collier_count)}). ` +
      `July 2025+ (HB 913 era): ${fmtN(s.sirs_july2025_plus_count)}. ` +
      `Coverage flag: ${s.result_truncated_any ? "floor estimate" : "complete"}. ` +
      `Latest scrape: ${s.latest_scraped_at ?? "unknown"}.`,
    source_fragment_ids: [frag.fragment_id],
  });
  return facts;
}

// ── outputProducer ────────────────────────────────────────────────────────────

function sirsOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const s = lastSummary;
  const fetchedAt = lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // Empty-data path: pipeline has not run yet
  if (!s || s.sirs_confirmed_swfl === 0) {
    return {
      conclusion:
        "condo-sirs-swfl: DBPR SIRS table returned 0 SWFL rows — the dbpr_sirs pipeline has not run yet or produced no Lee/Collier rows. Dispatch dbpr-sirs-monthly.yml to populate.",
      key_metrics: [],
      caveats: [
        "data_lake.dbpr_sirs_submissions has 0 Lee/Collier rows. Run: python -m ingest.pipelines.dbpr_sirs.pipeline",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  // Direction: neutral — positive-signal-only regulatory dataset with no denominator
  // for a compliance rate. There is no polarity to evaluate.
  const direction = "neutral" as const;

  // Magnitude: how close to or above the sanity floor (280)?
  // The QIX pull returns the complete hypercube, so this caps at 1.0 in practice;
  // it only drops below 1.0 if a pull comes back short — a tripwire, not a trend.
  const magnitude = Math.min(s.sirs_confirmed_swfl / SIRS_SWFL_EXPECTED_FLOOR, 1.0);

  const coverageValue = s.result_truncated_any ? "floor estimate (Qlik limit fired)" : "complete";

  const b = lastBaseline;
  const baselineCaveats: string[] = hasBaseline(b)
    ? [
        `Matched-SIRS share is a LOWER BOUND on filing, not a compliance rate: a building's association is counted only when its DBPR filing resolved to it by name (deterministic ladder, or two local models agreeing on a closed-set tiebreak). ${fmtN(b.xref_needs_review)} filing(s) are parked as needs_review and ${fmtN(b.xref_unmatched)} matched nothing — those associations may well have filed.`,
        `Baselines differ by county. Lee (${fmtN(b.buildings_lee)}) is a physical baseline — every 3+-story CONDOMINIUM-use building in the county footprints layer. Collier (${fmtN(b.buildings_collier)}) is PROGRAM-REGISTERED only — buildings that have entered the county's milestone inspection program; a Collier building not on that list is invisible here.`,
      ]
    : [
        "Compliance rate cannot be derived — no baseline registry of all SWFL 3-story+ condominium associations exists in this dataset. Presence = confirmed SIRS filing; absence has no meaning.",
      ];

  const caveats: string[] = [
    s.result_truncated_any
      ? `Qlik hypercube limit fired on both SIRS apps — ${fmtN(s.sirs_confirmed_swfl)} SWFL associations is a floor estimate, not a complete count. The true filing universe exceeds this number.`
      : "Qlik data coverage: complete (hypercube limit did not fire).",
    ...baselineCaveats,
    "Pre-July 2025 and July 2025+ are two separate DBPR databases — the pre-July set holds older filings and the July 2025+ set holds post-HB 913 mandate filings; they are distinct registers, not one continuous time series.",
  ];

  if (s.sirs_confirmed_swfl < 50) {
    caveats.push(
      `Confirmed count is very low (${fmtN(s.sirs_confirmed_swfl)}) — likely first run or pipeline error; interpret with caution.`,
    );
  }

  const key_metrics: BrainOutputMetric[] = [
    {
      metric: "sirs_confirmed_swfl",
      label: "SIRS-Confirmed Associations — SWFL (Lee + Collier)",
      value: s.sirs_confirmed_swfl,
      direction: "stable",
      variable_type: "extensive",
      units: "associations",
      display_format: "count",
      source: makeSource(
        `DBPR SIRS Reporting Database — pre-July 2025 app (14f1ed21) + July 2025+ app (d217126f); Lee + Collier county_normalized; confirmed SIRS filings: ${fmtN(s.sirs_confirmed_swfl)}`,
        fetchedAt,
      ),
    },
    {
      metric: "sirs_lee_count",
      label: "SIRS-Confirmed Associations — Lee County",
      value: s.sirs_lee_count,
      direction: "stable",
      variable_type: "extensive",
      units: "associations",
      display_format: "count",
      source: makeSource(
        `DBPR SIRS Reporting Database — county_normalized=LEE rows: ${fmtN(s.sirs_lee_count)}`,
        fetchedAt,
      ),
    },
    {
      metric: "sirs_collier_count",
      label: "SIRS-Confirmed Associations — Collier County",
      value: s.sirs_collier_count,
      direction: "stable",
      variable_type: "extensive",
      units: "associations",
      display_format: "count",
      source: makeSource(
        `DBPR SIRS Reporting Database — county_normalized=COLLIER rows: ${fmtN(s.sirs_collier_count)}`,
        fetchedAt,
      ),
    },
    {
      metric: "sirs_july2025_plus_count",
      label: "SIRS Filings — HB 913 Era (July 2025+)",
      value: s.sirs_july2025_plus_count,
      direction: "stable",
      variable_type: "extensive",
      units: "associations",
      display_format: "count",
      source: makeSource(
        `DBPR SIRS Reporting Database — July 2025+ app (d217126f); database_period=july_2025_plus; Lee + Collier: ${fmtN(s.sirs_july2025_plus_count)}. Represents post-HB 913 compliance push.`,
        fetchedAt,
      ),
    },
    {
      metric: "sirs_result_truncated",
      label: "Qlik Data Coverage — SIRS Registry",
      value: coverageValue,
      direction: "stable",
      variable_type: "categorical",
      source: makeSource(
        `DBPR SIRS Qlik apps — coverage flag set when 'Load more' visible at scrape end (Qlik hypercube limit). Current: "${coverageValue}".`,
        fetchedAt,
      ),
    },
  ];

  if (hasBaseline(b)) {
    const leeShare = ratio(b.buildings_with_sirs_lee, b.buildings_lee);
    const collierShare = ratio(b.buildings_with_sirs_collier, b.buildings_collier);
    key_metrics.push(
      {
        metric: "condo_buildings_lee",
        label: "3+-Story Condo Buildings — Lee County (Physical Baseline)",
        value: b.buildings_lee,
        direction: "stable",
        variable_type: "extensive",
        units: "buildings",
        display_format: "count",
        source: makeBaselineSource(
          LEE_DOC_URL,
          `Lee County building footprints layer 8 — MaxStories>=3 AND BldgUseType='CONDOMINIUM': ${fmtN(b.buildings_lee)} buildings.`,
          fetchedAt,
        ),
      },
      {
        metric: "condo_buildings_collier",
        label: "Milestone-Program Buildings — Collier County (Program-Registered Baseline)",
        value: b.buildings_collier,
        direction: "stable",
        variable_type: "extensive",
        units: "buildings",
        display_format: "count",
        source: makeBaselineSource(
          COLLIER_DOC_URL,
          `Collier County Milestone Inspection feature service (MilestoneMap/FeatureServer/2): ${fmtN(b.buildings_collier)} buildings; ${fmtN(b.collier_cycle_completed)} cycle completed, ${fmtN(b.collier_not_due)} not due, ${fmtN(b.collier_delinquent)} delinquent.`,
          fetchedAt,
        ),
      },
      {
        metric: "sirs_matched_share_lee",
        label: "Buildings With a Matched SIRS Filing — Lee County (Lower Bound)",
        value: leeShare !== null ? Math.round(leeShare * 10000) / 10000 : 0,
        direction: "stable",
        variable_type: "intensive",
        units: "ratio",
        display_format: "ratio",
        source: makeBaselineSource(
          LEE_DOC_URL,
          `data_lake.condo_compliance_swfl_v — Lee buildings whose association resolved to a DBPR SIRS filing: ${fmtN(b.buildings_with_sirs_lee)} of ${fmtN(b.buildings_lee)} (${leeShare !== null ? fmtPct(leeShare) : "n/a"}). Lower bound — see caveats.`,
          fetchedAt,
        ),
      },
      {
        metric: "sirs_matched_share_collier",
        label: "Buildings With a Matched SIRS Filing — Collier County (Lower Bound)",
        value: collierShare !== null ? Math.round(collierShare * 10000) / 10000 : 0,
        direction: "stable",
        variable_type: "intensive",
        units: "ratio",
        display_format: "ratio",
        source: makeBaselineSource(
          COLLIER_DOC_URL,
          `data_lake.condo_compliance_swfl_v — Collier program-registered buildings whose association resolved to a DBPR SIRS filing: ${fmtN(b.buildings_with_sirs_collier)} of ${fmtN(b.buildings_collier)} (${collierShare !== null ? fmtPct(collierShare) : "n/a"}). Lower bound — see caveats.`,
          fetchedAt,
        ),
      },
      {
        metric: "collier_milestone_delinquent",
        label: "Milestone-Delinquent Buildings — Collier County",
        value: b.collier_delinquent,
        direction: b.collier_delinquent > 0 ? "rising" : "stable",
        variable_type: "extensive",
        units: "buildings",
        display_format: "count",
        source: makeBaselineSource(
          COLLIER_DOC_URL,
          `Collier Milestone feature service ApplicationStatus='Delinquent': ${fmtN(b.collier_delinquent)} buildings (county program status, F.S. 553.899).`,
          fetchedAt,
        ),
      },
      {
        metric: "sirs_xref_needs_review",
        label: "SIRS Filings Awaiting Manual Match Review — SWFL",
        value: b.xref_needs_review,
        direction: "stable",
        variable_type: "extensive",
        units: "filings",
        display_format: "count",
        source: makeBaselineSource(
          LEE_DOC_URL,
          `data_lake.condo_association_xref — match_method='needs_review' (the two local models disagreed, or the LLM band was off): ${fmtN(b.xref_needs_review)} of ${fmtN(b.xref_total)} filings; ${fmtN(b.xref_accepted)} accepted (${fmtN(b.xref_llm_tiebreak)} via tiebreak), ${fmtN(b.xref_unmatched)} unmatched.`,
          fetchedAt,
        ),
      },
    );
  }

  const scrapeDate = s.latest_scraped_at ? s.latest_scraped_at.slice(0, 10) : "unknown";

  const baselineSentence = hasBaseline(b)
    ? (() => {
        const lee = ratio(b.buildings_with_sirs_lee, b.buildings_lee);
        const col = ratio(b.buildings_with_sirs_collier, b.buildings_collier);
        return (
          ` Against the county building baseline, ${fmtN(b.buildings_with_sirs_lee)} of ${fmtN(b.buildings_lee)} Lee 3+-story condo buildings (${lee !== null ? fmtPct(lee) : "n/a"}) and ` +
          `${fmtN(b.buildings_with_sirs_collier)} of ${fmtN(b.buildings_collier)} Collier program-registered buildings (${col !== null ? fmtPct(col) : "n/a"}) have an association with a matched SIRS filing — a lower bound, not a compliance rate. ` +
          `Collier's own program lists ${fmtN(b.collier_delinquent)} building(s) as milestone-delinquent.`
        );
      })()
    : " This is a positive-signal-only registry: presence confirms SIRS filing; absence cannot be interpreted without a baseline count of all SWFL 3-story+ condominiums.";

  const conclusion =
    `DBPR confirms ${fmtN(s.sirs_confirmed_swfl)} SWFL condominium and cooperative associations have submitted their Structural Integrity Reserve Study as of ${scrapeDate}. ` +
    `Lee County: ${fmtN(s.sirs_lee_count)}, Collier County: ${fmtN(s.sirs_collier_count)}. ` +
    `Of these, ${fmtN(s.sirs_july2025_plus_count)} filed under the HB 913 compliance push (July 2025+ database). ` +
    `${s.result_truncated_any ? "These counts are floor estimates — the Qlik hypercube limit fires before the full statewide registry renders. " : ""}` +
    baselineSentence.trimStart();

  return {
    conclusion,
    key_metrics,
    caveats,
    direction,
    magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

// ── PackDefinition ────────────────────────────────────────────────────────────

export const condoSirsSwfl: PackDefinition = {
  id: "condo-sirs-swfl",
  brain_id: "condo-sirs-swfl",
  public_label: "Condo Milestones",
  domain: "regulatory",
  scope:
    "SWFL condominium and cooperative associations that have confirmed Structural Integrity Reserve Study (SIRS) submission to DBPR, set against a county building baseline. Lee + Collier counties. Sources: DBPR SIRS Reporting Database (two Qlik apps: pre-July 2025 and July 2025+ submissions, monthly); Lee County building footprints (3+-story CONDOMINIUM-use buildings) and the Collier County Milestone Inspection program list, cross-referenced to filings by association name. Matched share is a lower bound on filing, never a compliance rate.",
  ttl_seconds: 30 * 24 * 60 * 60,

  sources: [dbprSirsSource, condoBaselineSource],
  input_brains: [],

  fitScore: () => 6,
  compositeCutoff: 0,

  skipSynthesisAgent: true,
  skipTriageAgent: true,

  corpusSummary: sirsCorpusSummary,
  outputProducer: sirsOutputProducer,

  preferences: [
    "The SIRS count is an informational register, not a market-direction signal. Do not infer 'enough' or 'too few' from the count alone — the total required filer universe is unknown.",
    "The July 2025+ count (HB 913 era) is the more meaningful number: it reflects post-Surfside legislation compliance. The pre-July 2025 rows are a small visible slice of older filings.",
    "Coverage flag 'floor estimate' means the QIX engine returned fewer rows than it reported (a partial pull) — counts would then understate the true filing universe. With the full hypercube pull this is NOT expected; 'complete' is the normal state.",
    "Absence of an association in this dataset does NOT mean non-compliance — this is a positive register of confirmed filings. With the building baseline loaded, the matched share is a LOWER BOUND on filing (name resolution can fail), never a compliance rate.",
    "Lee's baseline is physical (county footprints, 3+-story condominium-use buildings); Collier's is program-registered (buildings that entered the county milestone program). Never compare the two shares as if the denominators were the same kind of thing.",
  ],
  activeProject:
    "condo-sirs-swfl: track SWFL HOA/condo SIRS filing confirmation counts as a structural-safety transparency signal for the Lee + Collier condo market.",
  prompts: {
    triageContext:
      "A DBPR SIRS row is decision-relevant when county_normalized is LEE or COLLIER. All rows in this dataset are confirmed complete filings.",
    synthesisContext:
      "Surface the total SWFL count and the July 2025+ subset as the headline numbers. Note the coverage flag — 'complete' on a full pull; only call out 'floor estimate' if the engine returned a partial hypercube. When baseline metrics are present, report the matched-SIRS share per county as a lower bound and name the Lee (physical) vs Collier (program-registered) baseline difference; never call it a compliance rate. Distinguish pre-July vs post-HB 913 eras when relevant.",
  },
};
