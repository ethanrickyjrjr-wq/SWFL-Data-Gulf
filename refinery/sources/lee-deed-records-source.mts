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
 * lee-deed-records source connector — Lee County Clerk of Courts recorded-DEED
 * feed (LandMarkWeb official records).
 *
 * Table read:
 *   data_lake.lee_deed_official_records — one row per recorded deed (merge on
 *   internal_doc_id). FETCH is manual (Akamai — see the pipeline README); the LOAD
 *   half merges committed raw/*.json daily.
 *
 * Returns ONE RawFragment carrying a pre-aggregated DeedRecordsSummary (all COUNTs
 * pushed to Postgres — aggregate at source, never haul rows). The pack
 * (lee-deed-records-swfl) has skipSynthesisAgent + skipTriageAgent = true, so one
 * summary fragment is sufficient.
 *
 * SCOPE NOTE: this reports RECORDING VELOCITY and the nominal-vs-arm's-length
 * consideration MIX — NOT a deed-grade median sale price. A median needs a Postgres
 * percentile_cont RPC/view (PostgREST count-head cannot do it) and is deferred
 * (check `lee_deed_median_consideration_metric`); the source connector never hauls
 * the consideration column into TS to fake it.
 *
 * Trust tier: 1 (the county Clerk of Courts is the primary recording authority).
 */

const SOURCE_ID = "lee_deed_official_records";
const SCHEMA = "data_lake";
const TABLE = "lee_deed_official_records";
const CITATION_URL =
  "https://or.leeclerk.org/LandMarkWeb/search/index?theme=.blue&section=searchCriteriaDocuments&quickSearchSelection=";

// A consideration at/under this floor is a nominal (non-arm's-length) transfer —
// quitclaim / family / trust / $10 deed. README idx 4. Above it = an arm's-length sale.
const NOMINAL_CONSIDERATION_CEIL = 100;
const VELOCITY_WINDOW_DAYS = 30;

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "lee-deed-records.sample.json",
);

// ── Types ──────────────────────────────────────────────────────────────────────

/** Pre-aggregated summary built from data_lake.lee_deed_official_records. */
export interface DeedRecordsSummary {
  kind: "lee-deed-records-summary";
  /** All recorded DEED rows loaded (every raw/*.json merged so far). */
  deed_records_total_lee: number;
  /** DEED rows recorded in the trailing 30d window. */
  deed_records_30d_lee: number;
  /** 30d DEED rows with consideration > $100 (arm's-length sales). */
  deed_arms_length_30d_lee: number;
  /** 30d DEED rows with consideration <= $100 (nominal / non-arm's-length transfers). */
  deed_nominal_30d_lee: number;
  /** MAX(record_date) — the freshest recorded deed in the table (ISO date or null). */
  latest_record_date_lee: string | null;
  /** MIN(record_date) — how far the backfill reaches (ISO date or null). */
  earliest_record_date_lee: string | null;
  fetched_at: string;
}

function windowStartIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Live fetch ─────────────────────────────────────────────────────────────────

async function fetchLiveSummary(): Promise<DeedRecordsSummary> {
  const fetched_at = isoTimestamp();
  const sb = getSupabase().schema(SCHEMA);
  const since = windowStartIso(VELOCITY_WINDOW_DAYS);

  function throwOnError(label: string, error: { message: string } | null): void {
    if (error) throw new Error(`lee-deed-records-source: ${label} failed — ${error.message}`);
  }

  const [rTotal, r30, rArms, rNominal] = await Promise.all([
    sb.from(TABLE).select("*", { count: "exact", head: true }).eq("doc_type", "DEED"),
    sb
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("doc_type", "DEED")
      .gte("record_date", since),
    sb
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("doc_type", "DEED")
      .gte("record_date", since)
      .gt("consideration_usd", NOMINAL_CONSIDERATION_CEIL),
    sb
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("doc_type", "DEED")
      .gte("record_date", since)
      .lte("consideration_usd", NOMINAL_CONSIDERATION_CEIL),
  ]);

  throwOnError("total count", rTotal.error);
  throwOnError("30d count", r30.error);
  throwOnError("arms-length 30d count", rArms.error);
  throwOnError("nominal 30d count", rNominal.error);

  // MAX / MIN record_date — two one-row selects (not a haul).
  const [latestRes, earliestRes] = await Promise.all([
    sb
      .from(TABLE)
      .select("record_date")
      .eq("doc_type", "DEED")
      .not("record_date", "is", null)
      .order("record_date", { ascending: false })
      .limit(1),
    sb
      .from(TABLE)
      .select("record_date")
      .eq("doc_type", "DEED")
      .not("record_date", "is", null)
      .order("record_date", { ascending: true })
      .limit(1),
  ]);
  throwOnError("latest record_date", latestRes.error);
  throwOnError("earliest record_date", earliestRes.error);

  return {
    kind: "lee-deed-records-summary",
    deed_records_total_lee: rTotal.count ?? 0,
    deed_records_30d_lee: r30.count ?? 0,
    deed_arms_length_30d_lee: rArms.count ?? 0,
    deed_nominal_30d_lee: rNominal.count ?? 0,
    latest_record_date_lee: (latestRes.data?.[0]?.record_date as string | undefined) ?? null,
    earliest_record_date_lee: (earliestRes.data?.[0]?.record_date as string | undefined) ?? null,
    fetched_at,
  };
}

// ── Fixture fetch ──────────────────────────────────────────────────────────────

interface FixtureRow {
  doc_type?: string;
  consideration_usd?: number | null;
  record_date?: string | null;
}

async function fetchFixtureSummary(): Promise<DeedRecordsSummary> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const rows = JSON.parse(raw) as FixtureRow[];
  const fetched_at = isoTimestamp();
  const since = windowStartIso(VELOCITY_WINDOW_DAYS);

  const deeds = rows.filter((r) => (r.doc_type ?? "DEED") === "DEED");
  const dated = deeds.filter((r) => typeof r.record_date === "string" && r.record_date);
  const in30 = dated.filter((r) => (r.record_date as string) >= since);
  const arms = in30.filter(
    (r) =>
      typeof r.consideration_usd === "number" && r.consideration_usd > NOMINAL_CONSIDERATION_CEIL,
  );
  const nominal = in30.filter(
    (r) =>
      typeof r.consideration_usd === "number" && r.consideration_usd <= NOMINAL_CONSIDERATION_CEIL,
  );
  const recordDates = dated.map((r) => r.record_date as string).sort();

  return {
    kind: "lee-deed-records-summary",
    deed_records_total_lee: deeds.length,
    deed_records_30d_lee: in30.length,
    deed_arms_length_30d_lee: arms.length,
    deed_nominal_30d_lee: nominal.length,
    latest_record_date_lee: recordDates.length ? recordDates[recordDates.length - 1] : null,
    earliest_record_date_lee: recordDates.length ? recordDates[0] : null,
    fetched_at,
  };
}

// ── Connector ──────────────────────────────────────────────────────────────────

export const leeDeedRecordsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,

  async fetch(): Promise<RawFragment[]> {
    const summary =
      env.source === "fixture" ? await fetchFixtureSummary() : await fetchLiveSummary();

    const receipt =
      env.source === "fixture"
        ? `fixture://refinery/__fixtures__/lee-deed-records.sample.json`
        : buildSourceCitationUrl(TABLE, {
            label: "Lee County Clerk of Courts — Official Records (recorded deeds)",
            source: "Lee County Clerk of Courts",
            brain: "lee-deed-records-swfl",
            date_col: "record_date",
            doc: CITATION_URL,
          });

    return [
      {
        fragment_id: fragmentId(SOURCE_ID, "summary"),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at: summary.fetched_at,
        raw: {
          kind: summary.kind,
          deed_records_total_lee: summary.deed_records_total_lee,
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
        ? `Lee County Clerk of Courts — Official Records Search (LandMarkWeb), recorded deeds; manual capture merged daily into data_lake.lee_deed_official_records`
        : `Lee County recorded deeds (fixture; lee-deed-records.sample.json)`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
