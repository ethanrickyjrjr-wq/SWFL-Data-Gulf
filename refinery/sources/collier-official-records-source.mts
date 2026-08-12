import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";
import { buildSourceCitationUrl } from "../lib/citation-url.mts";

/**
 * collier-official-records source connector — Collier County Clerk of Courts
 * recorded-document feed (cor.collierclerk.com, "COR Access"), ALL 37 doc types.
 *
 * Table read: data_lake.collier_official_records — one row per recorded document
 * (merge on instrument_number). Unlike lee_deed_official_records (FETCH manual,
 * Akamai-blocked), this feed is FULLY AUTOMATED — no bot wall found (verified
 * live 08/12/2026, 7 back-to-back automated searches, zero blocks; see
 * _RESEARCH/data-and-ingest/2026-08-12-collier-clerk-liveness-probe.md).
 *
 * SCOPE NOTE: this table carries NO consideration/sale-price column — Collier's
 * search UI does not expose one (unlike Lee's), so this source cannot report an
 * arm's-length/nominal split or feed a sold-median. It reports recording
 * velocity + a doc-type breakdown only.
 *
 * Returns ONE RawFragment carrying a pre-aggregated CollierRecordsSummary (all
 * COUNTs pushed to Postgres — aggregate at source, never haul rows). The pack
 * has skipSynthesisAgent + skipTriageAgent = true.
 *
 * Trust tier: 1 (the county Clerk of Courts is the primary recording authority).
 */

const SOURCE_ID = "collier_official_records";
const SCHEMA = "data_lake";
const TABLE = "collier_official_records";
const CITATION_URL = "https://cor.collierclerk.com/search/document";

const VELOCITY_WINDOW_DAYS = 30;

const FIXTURE_PATH_SEGMENTS = ["refinery", "__fixtures__", "collier-official-records.sample.json"];

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CollierRecordsSummary {
  kind: "collier-official-records-summary";
  /** All recorded documents loaded so far, every doc type. */
  collier_records_total: number;
  /** Documents recorded in the trailing 30d window, every doc type. */
  collier_records_30d: number;
  /** 30d DEED-type documents (the Lee-comparable metric). */
  collier_deed_30d: number;
  /** 30d NC (Notice of Commencement) documents — the pre-permit construction signal. */
  collier_notice_of_commencement_30d: number;
  /** MAX(record_date) — the freshest recorded document (ISO date or null). */
  latest_record_date: string | null;
  /** MIN(record_date) — how far the backfill reaches (ISO date or null). */
  earliest_record_date: string | null;
  fetched_at: string;
}

function windowStartIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Live fetch ─────────────────────────────────────────────────────────────────

async function fetchLiveSummary(): Promise<CollierRecordsSummary> {
  const fetched_at = isoTimestamp();
  const sb = getSupabase().schema(SCHEMA);
  const since = windowStartIso(VELOCITY_WINDOW_DAYS);

  function throwOnError(label: string, error: { message: string } | null): void {
    if (error)
      throw new Error(`collier-official-records-source: ${label} failed — ${error.message}`);
  }

  const [rTotal, r30, rDeed30, rNc30] = await Promise.all([
    sb.from(TABLE).select("*", { count: "exact", head: true }),
    sb.from(TABLE).select("*", { count: "exact", head: true }).gte("record_date", since),
    sb
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("doc_type", "DEED")
      .gte("record_date", since),
    sb
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("doc_type", "NC")
      .gte("record_date", since),
  ]);

  throwOnError("total count", rTotal.error);
  throwOnError("30d count", r30.error);
  throwOnError("DEED 30d count", rDeed30.error);
  throwOnError("NC 30d count", rNc30.error);

  const [latestRes, earliestRes] = await Promise.all([
    sb
      .from(TABLE)
      .select("record_date")
      .not("record_date", "is", null)
      .order("record_date", { ascending: false })
      .limit(1),
    sb
      .from(TABLE)
      .select("record_date")
      .not("record_date", "is", null)
      .order("record_date", { ascending: true })
      .limit(1),
  ]);
  throwOnError("latest record_date", latestRes.error);
  throwOnError("earliest record_date", earliestRes.error);

  return {
    kind: "collier-official-records-summary",
    collier_records_total: rTotal.count ?? 0,
    collier_records_30d: r30.count ?? 0,
    collier_deed_30d: rDeed30.count ?? 0,
    collier_notice_of_commencement_30d: rNc30.count ?? 0,
    latest_record_date: (latestRes.data?.[0]?.record_date as string | undefined) ?? null,
    earliest_record_date: (earliestRes.data?.[0]?.record_date as string | undefined) ?? null,
    fetched_at,
  };
}

// ── Fixture fetch ──────────────────────────────────────────────────────────────

interface FixtureRow {
  doc_type?: string;
  record_date?: string | null;
}

async function fetchFixtureSummary(): Promise<CollierRecordsSummary> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const fixturePath = path.join(process.cwd(), ...FIXTURE_PATH_SEGMENTS);
  const raw = await readFile(fixturePath, "utf-8");
  const rows = JSON.parse(raw) as FixtureRow[];
  const fetched_at = isoTimestamp();
  const since = windowStartIso(VELOCITY_WINDOW_DAYS);

  const dated = rows.filter((r) => typeof r.record_date === "string" && r.record_date);
  const in30 = dated.filter((r) => (r.record_date as string) >= since);
  const deed30 = in30.filter((r) => r.doc_type === "DEED");
  const nc30 = in30.filter((r) => r.doc_type === "NC");
  const recordDates = dated.map((r) => r.record_date as string).sort();

  return {
    kind: "collier-official-records-summary",
    collier_records_total: rows.length,
    collier_records_30d: in30.length,
    collier_deed_30d: deed30.length,
    collier_notice_of_commencement_30d: nc30.length,
    latest_record_date: recordDates.length ? recordDates[recordDates.length - 1] : null,
    earliest_record_date: recordDates.length ? recordDates[0] : null,
    fetched_at,
  };
}

// ── Connector ──────────────────────────────────────────────────────────────────

export const collierOfficialRecordsSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,

  async fetch(): Promise<RawFragment[]> {
    const summary =
      env.source === "fixture" ? await fetchFixtureSummary() : await fetchLiveSummary();

    const receipt =
      env.source === "fixture"
        ? `fixture://refinery/__fixtures__/collier-official-records.sample.json`
        : buildSourceCitationUrl(TABLE, {
            label:
              "Collier County Clerk of the Circuit Court & Comptroller — Official Records Search",
            source: "Collier County Clerk of Courts",
            brain: "collier-official-records-swfl",
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
          collier_records_total: summary.collier_records_total,
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
        ? `Collier County Clerk of Courts — Official Records Search (COR Access), all recorded document types; automated daily crawl merged into data_lake.collier_official_records`
        : `Collier County recorded documents (fixture; collier-official-records.sample.json)`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
