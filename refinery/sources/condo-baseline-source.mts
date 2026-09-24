import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";
import { buildSourceCitationUrl } from "../lib/citation-url.mts";

/**
 * condo-baseline-source — the SWFL 3+-story condo building BASELINE and its
 * cross-reference to DBPR SIRS filings. The denominator the condo-sirs-swfl pack
 * said it could never have.
 *
 * Tables read (writer: ingest/pipelines/condo_baseline_swfl):
 *   data_lake.condo_buildings_swfl     — one row per building (Lee footprints /
 *                                        Collier milestone list)
 *   data_lake.condo_association_xref   — one row per SWFL SIRS filing → association
 *   data_lake.condo_compliance_swfl_v  — buildings ⟕ accepted SIRS match
 *
 * Returns ONE RawFragment holding a pre-aggregated CondoBaselineSummary. The pack
 * has skipSynthesisAgent + skipTriageAgent = true.
 *
 * Trust tier: 1 (county property appraiser / county building department records).
 */

const SOURCE_ID = "condo_baseline_swfl";
const SCHEMA = "data_lake";
const BUILDINGS_TABLE = "condo_buildings_swfl";
const XREF_TABLE = "condo_association_xref";
const COMPLIANCE_VIEW = "condo_compliance_swfl_v";
export const LEE_DOC_URL =
  "https://gismapserver.leegov.com/gisserver910/rest/services/DataExplorer/LandRecords/MapServer";
export const COLLIER_DOC_URL =
  "https://www.collier.gov/government/growth-management-community-development/divisions/building-plan-review-and-inspection/milestone-inspections";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "condo-baseline.sample.json",
);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CondoBaselineSummary {
  kind: "condo-baseline-summary";
  /** 3+-story condo buildings in the Lee footprints layer (physical baseline) */
  buildings_lee: number;
  /** Buildings on the Collier milestone program list (program-registered baseline) */
  buildings_collier: number;
  /** Buildings whose association has an ACCEPTED SIRS match (lower bound on filing) */
  buildings_with_sirs_lee: number;
  buildings_with_sirs_collier: number;
  /** Collier ApplicationStatus counts */
  collier_delinquent: number;
  collier_cycle_completed: number;
  collier_not_due: number;
  /** Cross-reference outcome counts over all SWFL SIRS filings */
  xref_total: number;
  xref_accepted: number;
  xref_llm_tiebreak: number;
  xref_needs_review: number;
  xref_unmatched: number;
  latest_scraped_at: string | null;
  fetched_at: string;
}

// ── Live fetch ─────────────────────────────────────────────────────────────────

async function fetchLiveSummary(): Promise<CondoBaselineSummary> {
  const fetched_at = isoTimestamp();
  const sb = getSupabase().schema(SCHEMA);
  const head = { count: "exact" as const, head: true };

  const q = [
    sb.from(BUILDINGS_TABLE).select("*", head).eq("county", "LEE"),
    sb.from(BUILDINGS_TABLE).select("*", head).eq("county", "COLLIER"),
    sb.from(COMPLIANCE_VIEW).select("*", head).eq("county", "LEE").eq("has_sirs_filing", true),
    sb.from(COMPLIANCE_VIEW).select("*", head).eq("county", "COLLIER").eq("has_sirs_filing", true),
    sb
      .from(BUILDINGS_TABLE)
      .select("*", head)
      .eq("county", "COLLIER")
      .eq("milestone_status", "Delinquent"),
    sb
      .from(BUILDINGS_TABLE)
      .select("*", head)
      .eq("county", "COLLIER")
      .eq("milestone_status", "Cycle Completed"),
    sb
      .from(BUILDINGS_TABLE)
      .select("*", head)
      .eq("county", "COLLIER")
      .eq("milestone_status", "Not Due"),
    sb.from(XREF_TABLE).select("*", head),
    sb
      .from(XREF_TABLE)
      .select("*", head)
      .in("match_method", ["exact", "token_overlap", "llm_tiebreak"]),
    sb.from(XREF_TABLE).select("*", head).eq("match_method", "llm_tiebreak"),
    sb.from(XREF_TABLE).select("*", head).eq("match_method", "needs_review"),
    sb.from(XREF_TABLE).select("*", head).eq("match_method", "unmatched"),
  ] as const;
  const labels = [
    "buildingsLee",
    "buildingsCollier",
    "withSirsLee",
    "withSirsCollier",
    "collierDelinquent",
    "collierCycleCompleted",
    "collierNotDue",
    "xrefTotal",
    "xrefAccepted",
    "xrefLlm",
    "xrefReview",
    "xrefUnmatched",
  ];
  const results = await Promise.all(q);
  results.forEach((r, i) => {
    if (r.error) throw new Error(`condo-baseline-source: ${labels[i]} — ${r.error.message}`);
  });
  const n = (i: number): number => results[i].count ?? 0;

  const { data: latestRows, error: latestErr } = await getSupabase()
    .schema(SCHEMA)
    .from(BUILDINGS_TABLE)
    .select("scraped_at")
    .order("scraped_at", { ascending: false })
    .limit(1);
  if (latestErr) throw new Error(`condo-baseline-source: latestRows — ${latestErr.message}`);

  return {
    kind: "condo-baseline-summary",
    buildings_lee: n(0),
    buildings_collier: n(1),
    buildings_with_sirs_lee: n(2),
    buildings_with_sirs_collier: n(3),
    collier_delinquent: n(4),
    collier_cycle_completed: n(5),
    collier_not_due: n(6),
    xref_total: n(7),
    xref_accepted: n(8),
    xref_llm_tiebreak: n(9),
    xref_needs_review: n(10),
    xref_unmatched: n(11),
    latest_scraped_at: (latestRows ?? [])[0]?.scraped_at ?? null,
    fetched_at,
  };
}

// ── Fixture fetch ──────────────────────────────────────────────────────────────

interface FixtureShape {
  summary?: Partial<CondoBaselineSummary>;
}

async function fetchFixtureSummary(): Promise<CondoBaselineSummary> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const s = (JSON.parse(raw) as FixtureShape).summary ?? {};
  return {
    kind: "condo-baseline-summary",
    buildings_lee: s.buildings_lee ?? 1426,
    buildings_collier: s.buildings_collier ?? 926,
    buildings_with_sirs_lee: s.buildings_with_sirs_lee ?? 900,
    buildings_with_sirs_collier: s.buildings_with_sirs_collier ?? 700,
    collier_delinquent: s.collier_delinquent ?? 18,
    collier_cycle_completed: s.collier_cycle_completed ?? 553,
    collier_not_due: s.collier_not_due ?? 353,
    xref_total: s.xref_total ?? 1366,
    xref_accepted: s.xref_accepted ?? 1000,
    xref_llm_tiebreak: s.xref_llm_tiebreak ?? 120,
    xref_needs_review: s.xref_needs_review ?? 60,
    xref_unmatched: s.xref_unmatched ?? 306,
    latest_scraped_at: s.latest_scraped_at ?? new Date().toISOString(),
    fetched_at: isoTimestamp(),
  };
}

// ── Connector ──────────────────────────────────────────────────────────────────

export const condoBaselineSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,

  async fetch(): Promise<RawFragment[]> {
    const summary =
      env.source === "fixture" ? await fetchFixtureSummary() : await fetchLiveSummary();

    const receipt =
      env.source === "fixture"
        ? `fixture://refinery/__fixtures__/condo-baseline.sample.json`
        : buildSourceCitationUrl(BUILDINGS_TABLE, {
            label:
              "SWFL 3+-story condo building baseline — Lee footprints + Collier milestone list",
            source: "Lee County GIS / Collier County Building Plan Review",
            brain: "condo-sirs-swfl",
            date_col: "scraped_at",
            doc: LEE_DOC_URL,
          });

    return [
      {
        fragment_id: fragmentId(SOURCE_ID, "summary"),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at: summary.fetched_at,
        raw: {
          kind: summary.kind,
          buildings_lee: summary.buildings_lee,
          buildings_collier: summary.buildings_collier,
          source_url: receipt,
        },
        normalized: summary,
      },
    ];
  },

  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const isLive = env.source !== "fixture";
    return {
      source: isLive
        ? `SWFL condo building baseline — Lee County building footprints (${LEE_DOC_URL}, layer 8, MaxStories>=3, BldgUseType=CONDOMINIUM) + Collier County Milestone Inspection list (${COLLIER_DOC_URL}); DBPR SIRS filings cross-referenced by association name (deterministic ladder + local-model tiebreak, two-model agreement); data_lake.condo_buildings_swfl / condo_association_xref / condo_compliance_swfl_v`
        : `SWFL condo building baseline (fixture; condo-baseline.sample.json)`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
