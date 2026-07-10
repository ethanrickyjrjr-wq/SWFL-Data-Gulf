import { medianOf } from "@/lib/stats";

export interface MarketTempRow {
  local_hotness_score: number | null;
  captured_date: string | null;
}

export interface MarketTempGaugeData {
  medianHotness: number;
  zipCount: number;
  asOf?: string; // "YYYY-MM-DD"
}

/**
 * Median realtor.com hotness (0–100) across scored SWFL ZIPs — the market-
 * temperature dial's one number, computed here deterministically (the component
 * only draws it). Null (hide the panel) below 10 scored ZIPs: a 3-ZIP median
 * stamped as "SWFL" would mislead.
 */
export function mapMarketTemperature(
  rows: MarketTempRow[] | null | undefined,
): MarketTempGaugeData | null {
  const scores = (rows ?? [])
    .map((r) => r.local_hotness_score)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (scores.length < 10) return null;
  const median = medianOf(scores);
  if (median == null) return null;
  const asOf =
    (rows ?? [])
      .map((r) => r.captured_date)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1)
      ?.slice(0, 10) ?? undefined;
  return {
    medianHotness: Math.round(median * 10) / 10,
    zipCount: scores.length,
    asOf,
  };
}
