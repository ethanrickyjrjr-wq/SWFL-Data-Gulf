import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "../../../../utils/supabase/service-role";

/**
 * Cached data layer for /r/source/[table] — same "cache the loads, not the
 * shell" lane as zip-report's page-data.ts. The shell stays force-dynamic
 * (it reads searchParams: label/source/brain/doc/date_col), but the count +
 * 12-row sample are identical for every visitor for an hour. This is also the
 * page whose UNcached crawler traffic ran an exact count over a 604k-row view
 * per request (07/21 incident, see page.tsx) — caching bounds that class of
 * cost to once per table per hour.
 *
 * Key shape: (table, dateCol). `table` is allowlist-validated by the page
 * before this is called; a junk user-supplied `date_col` makes the order()
 * fail → degraded result → NOT cached (degraded results are never stored, so
 * an outage or a junk key can't pin an empty page for an hour — the caller
 * falls back to a live read, which renders exactly the pre-cache behavior).
 */
export type SourceSampleResult =
  | { status: "no_creds" }
  | { status: "count_error" }
  | { status: "empty" }
  | { status: "sample_error"; rowCount: number }
  | { status: "ok"; rowCount: number; rows: Record<string, unknown>[] };

/** Degraded = an error shape we must never cache. "empty" (a real table with
 * zero rows) and "ok" are healthy, cacheable outcomes. */
export function isDegradedSourceSample(r: SourceSampleResult): boolean {
  return r.status === "no_creds" || r.status === "count_error" || r.status === "sample_error";
}

async function loadLive(table: string, dateCol: string | null): Promise<SourceSampleResult> {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch {
    return { status: "no_creds" };
  }

  // count="estimated", NOT "exact" — exact counts over the 604k-row parcel
  // views were the 07/21 tup_returned incident; see the note in page.tsx.
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "estimated", head: true });
  if (countError) return { status: "count_error" };

  const rowCount = count ?? 0;
  if (rowCount === 0) return { status: "empty" };

  let sampleQuery = supabase.from(table).select("*").limit(12);
  if (dateCol) {
    sampleQuery = sampleQuery.order(dateCol, { ascending: false });
  }
  const { data, error: sampleError } = await sampleQuery;
  if (sampleError || !data || data.length === 0) return { status: "sample_error", rowCount };

  return { status: "ok", rowCount, rows: data as Record<string, unknown>[] };
}

const cachedSample = unstable_cache(
  async (table: string, dateCol: string | null): Promise<SourceSampleResult> => {
    const r = await loadLive(table, dateCol);
    if (isDegradedSourceSample(r)) throw new Error("degraded-source-sample: not caching an outage");
    return r;
  },
  ["source-table-sample-v1"],
  { revalidate: 3600 },
);

export async function loadSourceTableSample(
  table: string,
  dateCol: string | null,
): Promise<SourceSampleResult> {
  try {
    return await cachedSample(table, dateCol);
  } catch {
    return loadLive(table, dateCol);
  }
}
