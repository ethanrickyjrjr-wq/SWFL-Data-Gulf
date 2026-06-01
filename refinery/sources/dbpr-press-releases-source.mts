import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * dbpr-press-releases source — FL Department of Business and Professional
 * Regulation press releases, weekly scrape of myfloridalicense.com.
 *
 * Table: public.dbpr_press_releases
 * (ingest/pipelines/dbpr_press_releases, weekly cron via dbpr-press-releases-weekly.yml)
 *
 * Columns read:
 *   source_url           text        — article URL on www2.myfloridalicense.com
 *   title                text        — press release headline
 *   published_date       date        — date of the release
 *   summary              text        — 1-2 sentence Sonnet summary (nullable until enriched)
 *   topics               text[]      — regulatory topic tags (nullable until enriched)
 *   affected_industries  text[]      — directly named industries (nullable until enriched)
 *   geographic_mentions  text[]      — FL counties/cities named (nullable until enriched)
 *   is_swfl_relevant     boolean     — Lee/Collier/Charlotte/Sarasota/Hendry mention
 *   scraped_at           timestamptz — when the row was scraped
 *
 * Window: last 365 days (DBPR releases ~4-5/month; 1y covers ~60 releases).
 */

const SOURCE_ID = "dbpr_press_releases";
const TABLE = "dbpr_press_releases";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "news-swfl.sample.json",
);

export interface DbprPressReleaseNormalized {
  kind: "dbpr-press-release";
  source_url: string;
  title: string;
  published_date: string | null;
  summary: string | null;
  topics: string[];
  affected_industries: string[];
  geographic_mentions: string[];
  is_swfl_relevant: boolean;
  scraped_at: string | null;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [];
}

function toDateStr(v: unknown): string | null {
  const s = str(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function normalize(
  row: Record<string, unknown>,
): DbprPressReleaseNormalized | null {
  const source_url = str(row.source_url);
  const title = str(row.title);
  if (!source_url || !title) return null;
  return {
    kind: "dbpr-press-release",
    source_url,
    title,
    published_date: toDateStr(row.published_date),
    summary: str(row.summary) || null,
    topics: toStrArray(row.topics),
    affected_industries: toStrArray(row.affected_industries),
    geographic_mentions: toStrArray(row.geographic_mentions),
    is_swfl_relevant: Boolean(row.is_swfl_relevant),
    scraped_at: str(row.scraped_at) || null,
  };
}

async function loadFixtureRows(): Promise<Record<string, unknown>[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as { rows?: unknown[] } | unknown[];
  const rows: unknown[] = Array.isArray(data)
    ? data
    : ((data as { rows?: unknown[] }).rows ?? []);
  return rows as Record<string, unknown>[];
}

async function fetchRows(): Promise<Record<string, unknown>[]> {
  if (env.source === "fixture") return loadFixtureRows();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(
      "source_url, title, published_date, summary, topics, affected_industries, geographic_mentions, is_swfl_relevant, scraped_at",
    )
    .gte("published_date", cutoffDate)
    .order("published_date", { ascending: false });
  if (error) {
    throw new Error(
      `dbpr-press-releases-source: ${TABLE} query failed — ${error.message}`,
    );
  }
  return (data ?? []) as Record<string, unknown>[];
}

export const dbprPressReleasesSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 2,
  async fetch(): Promise<RawFragment[]> {
    const rows = await fetchRows();
    const fetched_at = isoTimestamp();
    return rows
      .map((row): RawFragment<DbprPressReleaseNormalized> | null => {
        const normalized = normalize(row);
        if (!normalized) return null;
        return {
          fragment_id: fragmentId(SOURCE_ID, normalized.source_url),
          source_id: SOURCE_ID,
          source_trust_tier: 2,
          fetched_at,
          raw: row,
          normalized,
        };
      })
      .filter((f): f is RawFragment<DbprPressReleaseNormalized> => f !== null);
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        env.source === "fixture"
          ? "FL DBPR Press Releases — myfloridalicense.com (fixture; dbpr_press_releases)"
          : "FL DBPR Press Releases — Florida Department of Business and Professional Regulation (Supabase dbpr_press_releases: title, published_date, topics, geographic_mentions; weekly scrape of www2.myfloridalicense.com/press-releases/)",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
