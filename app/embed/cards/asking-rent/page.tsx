import fs from "node:fs/promises";
import path from "node:path";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { HBarChart, type HBarCorridor } from "@/components/charts/HBarChart";
import type { CorridorEntry } from "@/types/viz";
import { medianOf } from "@/lib/stats";
import { tierFor } from "@/refinery/lib/chart-adapter.mts";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { collapseToSubmarkets } from "./collapse";

export const revalidate = 3600;

const TOP_N = 5;
const BOTTOM_N = 2;
const DETAIL_HREF = "/r/cre-swfl";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

/**
 * Raw (submarket, rent) rows. The rent figures in corridor_profiles are C&W
 * MarketBeat SUBMARKET figures stamped onto every corridor in the submarket —
 * so the card ranks SUBMARKETS (via collapseToSubmarkets), never raw corridor
 * rows (check corridor_grain_bug_is_live_on_embed_and_brain). The `submarket`
 * column is the 07/13 exact-join backfill; rows where it is null carry a
 * figure with no named source and drop out of every rendered figure.
 */
async function loadSubmarketRows(): Promise<{ submarket: string | null; value: number | null }[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("corridor_profiles")
      .select("submarket, asking_rent_psf")
      .not("asking_rent_psf", "is", null)
      .is("deleted_at", null)
      .eq("verification_status", "verified");
    if (error || !data || data.length === 0) throw new Error("supabase empty");
    return data.map((row) => ({
      submarket: (row.submarket as string | null) ?? null,
      value: row.asking_rent_psf as number | null,
    }));
  } catch {
    // fixture fallback — used when Supabase is unreachable or returns no rows
    const file = path.join(process.cwd(), "fixtures", "corridor-rents.json");
    const raw = await fs.readFile(file, "utf-8");
    return (JSON.parse(raw) as CorridorEntry[]).map((c) => ({
      submarket: c.submarket ?? null,
      value: c.nnn_asking_rent_per_sqft,
    }));
  }
}

export default async function AskingRentCardPage() {
  const ranked = collapseToSubmarkets(await loadSubmarketRows());

  const total = ranked.length;
  const corridorsMapped = ranked.reduce((s, r) => s + r.corridors, 0);
  const marketValues = ranked.map((r) => r.value);
  const marketMedian = medianOf(marketValues) ?? 0;
  const marketRange = {
    min: marketValues[marketValues.length - 1],
    max: marketValues[0],
  };

  // With few submarkets the top/bottom slices would overlap — show all instead.
  const sliced = total > TOP_N + BOTTOM_N;
  const shown = sliced ? [...ranked.slice(0, TOP_N), ...ranked.slice(-BOTTOM_N)] : ranked;

  const corridors: HBarCorridor[] = shown.map((r) => ({
    name: r.submarket,
    value: r.value,
    tier: tierFor(r.value, marketMedian),
  }));

  return (
    <main
      className={`${plexSans.variable} ${plexMono.variable}`}
      style={{
        background: "#0f1923",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <HBarChart
        title="Asking rent (NNN, $/sqft)"
        corridors={corridors}
        median={marketMedian}
        range={marketRange}
        eyebrow={`${corridors.length} of ${total} submarkets · ${corridorsMapped} corridors mapped`}
        separatorAfter={sliced ? TOP_N : undefined}
        separatorLabel={sliced ? `${BOTTOM_N} lowest of ${total}` : undefined}
        detailHref={DETAIL_HREF}
        detailLabel={`View all ${total} submarkets →`}
      />
    </main>
  );
}
