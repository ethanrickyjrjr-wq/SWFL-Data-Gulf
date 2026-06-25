import type { SupabaseClient } from "@supabase/supabase-js";
import { ResoClient } from "./client";
import type { BoardSlug } from "./boards";

interface ResoStat {
  ClosePrice?: number;
  DaysOnMarket?: number;
  PostalCode?: string;
  LivingArea?: number;
  CloseDate?: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function pullZipStats(
  supabase: SupabaseClient,
  slug: BoardSlug,
  userId: string,
  zips: string[],
): Promise<void> {
  if (zips.length === 0) return;

  const client = new ResoClient(slug);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  const zipFilter = zips.map((z) => `PostalCode eq '${z}'`).join(" or ");
  const properties = await client.get<ResoStat>("Property", {
    $filter: `(${zipFilter}) and CloseDate ge ${cutoffDate}`,
    $select: "ClosePrice,DaysOnMarket,PostalCode,LivingArea,CloseDate",
  });

  // Group by ZIP
  const byZip = new Map<string, ResoStat[]>();
  for (const p of properties) {
    if (!p.PostalCode) continue;
    const bucket = byZip.get(p.PostalCode) ?? [];
    bucket.push(p);
    byZip.set(p.PostalCode, bucket);
  }

  const rows = [];
  for (const [zip, listings] of byZip) {
    const closePrices = listings.flatMap((l) => (l.ClosePrice != null ? [l.ClosePrice] : []));
    const doms = listings.flatMap((l) => (l.DaysOnMarket != null ? [l.DaysOnMarket] : []));
    const ppsf = listings.flatMap((l) =>
      l.ClosePrice && l.LivingArea && l.LivingArea > 0 ? [l.ClosePrice / l.LivingArea] : [],
    );

    // Active count: agent's own actives in this ZIP (from already-synced user_mls_listings)
    const { count: activeCount } = await supabase
      .schema("data_lake")
      .from("user_mls_listings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("board_slug", slug)
      .eq("postal_code", zip)
      .eq("standard_status", "Active");

    rows.push({
      user_id: userId,
      board_slug: slug,
      postal_code: zip,
      period_months: 24,
      median_close_price: median(closePrices),
      avg_days_on_market: avg(doms),
      active_count: activeCount ?? 0,
      close_count: closePrices.length,
      avg_price_per_sqft: avg(ppsf),
      computed_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .schema("data_lake")
    .from("user_mls_stats")
    .upsert(rows, { onConflict: "user_id,board_slug,postal_code" });
  if (error) throw new Error(`upsert stats: ${error.message}`);
}
