import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { selectAllPaged, type PagedQuery } from "../lib/paginate.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

const SOURCE_ID = "zhvi_swfl";

// Zillow Research publishes ZHVI monthly (~3rd week, for the prior month).
// Setting the source-level TTL to 35 days gives one publish cycle of slack —
// Stage 4 computes confidence freshness against this same value.
const TTL_SECONDS = 86400 * 35;

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "__fixtures__",
  "zhvi-swfl.sample.json",
);

const PORTAL_URL = "https://www.zillow.com/research/data/";
const LIVE_CITATION =
  "Zillow Home Value Index (ZHVI), ZIP-level all-homes (SFR + Condo) middle-tier " +
  "(0.33-0.67) seasonally-adjusted, monthly, from data_lake.zhvi_swfl. " +
  "Source: Zillow Research, files.zillowstatic.com.";

export interface ZhviZipRow {
  zip_code: string;
  /** ISO 8601 date string, e.g. "2026-04-30" */
  period_end: string;
  home_value: number;
  metro: string | null;
  county_name: string | null;
  city: string | null;
}

async function fetchFromSupabase(): Promise<ZhviZipRow[]> {
  // Trailing 24 months covers the YoY/MoM window the pack needs plus a small
  // buffer for backfill checks. The pack itself computes deltas in TS.
  const monthsBack = 24;
  const sinceDate = new Date();
  sinceDate.setUTCMonth(sinceDate.getUTCMonth() - monthsBack);
  const sinceIso = sinceDate.toISOString().slice(0, 10);

  // PostgREST caps any single response at db-max-rows=1000, which `.limit(N)`
  // cannot exceed. Trailing 24mo × ~109 SWFL ZIPs is ~2,600 rows, so page by the
  // unique (zip_code, period_end) — the dlt primary key.
  return selectAllPaged<ZhviZipRow>(
    () =>
      getSupabase()
        .schema("data_lake")
        .from("zhvi_swfl")
        .select("zip_code, period_end, home_value, metro, county_name, city")
        .gte("period_end", sinceIso) as unknown as PagedQuery<ZhviZipRow>,
    ["zip_code", "period_end"],
    { minRows: 1_500 }, // ~2.6k rows (24mo × ~109 SWFL ZIPs); floor above 1000 cap (issue #61)
  );
}

async function fetchFromFixture(): Promise<ZhviZipRow[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw) as ZhviZipRow[];
}

export const zhviSource: SourceConnector = {
  source_id: SOURCE_ID,
  // Tier 3 = private-sector industry aggregator (Zillow Research). Maps to a
  // trust_tier_score of 0.6 in the confidence formula — honest read of a
  // single-vendor methodology-driven index.
  trust_tier: 3,
  async fetch(): Promise<RawFragment[]> {
    const fetched_at = isoTimestamp();
    const rows = env.source === "fixture" ? await fetchFromFixture() : await fetchFromSupabase();

    return rows.map(
      (r): RawFragment<ZhviZipRow> => ({
        fragment_id: fragmentId(SOURCE_ID, `${r.zip_code}_${r.period_end}`),
        source_id: SOURCE_ID,
        source_trust_tier: 3,
        fetched_at,
        raw: {
          zip_code: r.zip_code,
          period_end: r.period_end,
          home_value: r.home_value,
        },
        normalized: r,
      }),
    );
  },
  citationMeta(verifiedDate: string, ttlSeconds: number): Omit<CitationRow, "id"> {
    return {
      source:
        env.source === "fixture"
          ? `Zillow Home Value Index — ZHVI (fixture)`
          : `${LIVE_CITATION} Portal: ${PORTAL_URL}.`,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};

export { TTL_SECONDS as ZHVI_TTL_SECONDS };
