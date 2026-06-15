import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * daily-truth source connector — reads the sourced daily-freshness layer
 * (`data_lake.daily_truth`, written by ingest/pipelines/live_search). Each row
 * is ONE cited current number for a (metric_key, area), carrying its real
 * source URL (the cascade's grounded/scraped URL — never a model-memory number)
 * plus the engine's anomaly verdict. The freshness-pulse pack turns the latest
 * verified row per key into a cited "Today's Snapshot" key_metric.
 *
 * EMPTY-TOLERANT BY DESIGN (brain-first gate). The freshness-pulse brain ships
 * in the SAME PR as the table and must render before any data accumulates, so
 * this connector returns [] on an empty table AND on any read failure (missing
 * creds in a local build, transient DB error) — a missing daily pulse is a
 * non-critical `modifier` upstream that must never abort the master rebuild.
 * A warning is logged so a real outage is still visible in the cron logs.
 *
 * THIS IS THE ONLY FILE THAT KNOWS THE data_lake.daily_truth READ SHAPE.
 * Columns read (table defined by ingest/scripts/migrate_daily_truth.py, plan
 * 2026-06-15-daily-freshness-system §3a):
 *   metric_key, area, period, value, unit, source_url, source_title,
 *   source_tag, verified_on_page, agreement_n, anomaly_flag, retrieved_at.
 * Not selected (engine internals / board-only): engine, query_text,
 * status_reason, anomaly_delta_pct, metric_config.
 *
 * Trust tier: 2 — verified editorial. The value is gated at write time by the
 * engine's provenance check (real source URL present, LittleBird denylisted);
 * it is a grounded web/agency number, the same authority class as city-pulse.
 */

const SOURCE_ID = "daily-truth";
const SCHEMA = "data_lake";
const TABLE = "daily_truth";

/** Normalized daily-truth row — what the freshness-pulse producer reasons over. */
export interface DailyTruthRow {
  kind: "daily-truth";
  /** e.g. "median_sale_price", "mortgage_30yr_fixed". */
  metric_key: string;
  /** "cape_coral" / "fort_myers" / "naples" / "swfl" / a county / a ZIP. */
  area: string;
  /** period the value refers to (period_end), ISO date string. */
  period: string;
  /** the verified number, or null when every cascade leg failed. */
  value: number | null;
  /** "usd" / "pct" / "count". */
  unit: string;
  /** resolved publisher URL (never the vertex redirect); null on a NULL row. */
  source_url: string | null;
  /** page/source title, null when absent. */
  source_title: string | null;
  /** "live_search" / "approx" / "estimate" / "vendor". */
  source_tag: string;
  /** an optional re-scrape confirmed the number on the page (not required to load). */
  verified_on_page: boolean;
  /** sources that confirmed this value (1 normal day; 2–3 at bootstrap / anomaly re-run). */
  agreement_n: number;
  /** day-over-day move beyond the band AND the second source did NOT confirm → HELD for review. */
  anomaly_flag: boolean;
  /** freshness column — ISO timestamp of the write that produced this row. */
  retrieved_at: string;
}

// ── Defensive coercion (PostgREST returns numerics/text loosely) ──────────────

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeRow(row: Record<string, unknown>): DailyTruthRow {
  return {
    kind: "daily-truth",
    metric_key: str(row.metric_key),
    area: str(row.area),
    period: str(row.period),
    value: numOrNull(row.value),
    unit: str(row.unit),
    source_url: strOrNull(row.source_url),
    source_title: strOrNull(row.source_title),
    source_tag: str(row.source_tag) || "live_search",
    verified_on_page: row.verified_on_page === true,
    agreement_n: numOrNull(row.agreement_n) ?? 0,
    anomaly_flag: row.anomaly_flag === true,
    retrieved_at: str(row.retrieved_at),
  };
}

/**
 * Collapse to the newest row per (metric_key, area). Input is assumed ordered
 * by `retrieved_at` DESC (the live query orders it; a defensive re-sort keeps
 * the helper correct on any input). Pure — unit-tested directly.
 */
export function latestPerKey(rows: DailyTruthRow[]): DailyTruthRow[] {
  const sorted = [...rows].sort((a, b) => b.retrieved_at.localeCompare(a.retrieved_at));
  const seen = new Set<string>();
  const out: DailyTruthRow[] = [];
  for (const r of sorted) {
    const key = `${r.metric_key} ${r.area}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// ── Live fetch (empty-tolerant) ───────────────────────────────────────────────

async function fetchRows(): Promise<DailyTruthRow[]> {
  try {
    const { data, error } = await getSupabase()
      .schema(SCHEMA)
      .from(TABLE)
      .select(
        "metric_key, area, period, value, unit, source_url, source_title, source_tag, verified_on_page, agreement_n, anomaly_flag, retrieved_at",
      )
      .order("retrieved_at", { ascending: false });
    if (error) {
      // EMPTY-TOLERANT: the brain ships before data accumulates; a read error
      // (table absent on a fresh clone, transient PostgREST hiccup) degrades to
      // an empty snapshot rather than aborting the rebuild. Visible, not silent.
      console.warn(
        `daily-truth-source: ${SCHEMA}.${TABLE} read failed — ${error.message} (rendering empty snapshot)`,
      );
      return [];
    }
    return latestPerKey((data ?? []).map((r) => normalizeRow(r as Record<string, unknown>)));
  } catch (e) {
    // requireEnv throws when Supabase creds are absent (e.g. a local
    // --target-only build): still render an empty-tolerant brain.
    console.warn(
      `daily-truth-source: could not reach ${SCHEMA}.${TABLE} — ${(e as Error).message} (rendering empty snapshot)`,
    );
    return [];
  }
}

// ── Connector export ──────────────────────────────────────────────────────────

export const dailyTruthSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,

  async fetch(): Promise<RawFragment[]> {
    const rows = await fetchRows();
    const fetched_at = isoTimestamp();
    return rows.map(
      (normalized): RawFragment<DailyTruthRow> => ({
        fragment_id: fragmentId(SOURCE_ID, `${normalized.metric_key}:${normalized.area}`),
        source_id: SOURCE_ID,
        source_trust_tier: 2,
        fetched_at,
        // `raw` is the verbatim-row slot (Record<string, unknown>); the normalized
        // row is a faithful 1:1 coercion of the daily_truth row, cast to fit.
        raw: normalized as unknown as Record<string, unknown>,
        normalized,
      }),
    );
  },

  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        "SWFL daily freshness layer — one cited current number per (metric, area) from a grounded live search (Gemini grounded → Firecrawl failsafe), provenance-gated to a real source URL, via Supabase data_lake.daily_truth (metric_key, area, period, value, unit, source_url, source_title, source_tag, verified_on_page, agreement_n, anomaly_flag, retrieved_at).",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
