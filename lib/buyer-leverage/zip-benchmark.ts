// lib/buyer-leverage/zip-benchmark.ts
import type { ZipBenchmark } from "./types";
// KNOWN-DEBT(data_lake): listing_dom / listing_momentum_stats live in the data_lake schema,
// outside the typed client — same untyped service-role read as relist-fact.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface BenchmarkDeps {
  fetchMedian?: (zip: string) => Promise<{ median_dom: number | null; sample_size: number }>;
  fetchShare?: (zip: string) => Promise<number | null>;
}

async function defaultFetchMedian(
  zip: string,
): Promise<{ median_dom: number | null; sample_size: number }> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db.schema("data_lake").rpc("zip_active_dom_median", { p_zip: zip });
    const row = Array.isArray(data) ? data[0] : data;
    return {
      median_dom: row?.median_dom != null ? Number(row.median_dom) : null,
      sample_size: row?.sample_size != null ? Number(row.sample_size) : 0,
    };
  } catch {
    return { median_dom: null, sample_size: 0 };
  }
}

async function defaultFetchShare(zip: string): Promise<number | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_momentum_stats")
      .select("price_reduced_share")
      .eq("zip_code", zip)
      .limit(1)
      .maybeSingle();
    const v = (data as { price_reduced_share: number | null } | null)?.price_reduced_share;
    return v != null ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * The ZIP's own-data leverage context: live median dom_days (active for-sale, floored
 * excluded) + the reused own-inventory price-reduced share. null when there is nothing
 * real (no median AND no share). Never throws.
 */
export async function fetchZipBenchmark(
  zip: string,
  deps: BenchmarkDeps = {},
): Promise<ZipBenchmark | null> {
  const fetchMedian = deps.fetchMedian ?? defaultFetchMedian;
  const fetchShare = deps.fetchShare ?? defaultFetchShare;
  let median: { median_dom: number | null; sample_size: number };
  let share: number | null;
  try {
    median = await fetchMedian(zip);
  } catch {
    median = { median_dom: null, sample_size: 0 };
  }
  try {
    share = await fetchShare(zip);
  } catch {
    share = null;
  }
  if (median.median_dom == null && share == null) return null;
  return {
    medianDomDays: median.median_dom,
    priceReducedShare: share,
    sampleSize: median.sample_size,
  };
}
