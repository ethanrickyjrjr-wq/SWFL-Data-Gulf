import fs from "node:fs/promises";
import path from "node:path";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { HBarChart, type HBarCorridor } from "@/components/charts/HBarChart";
import type { CorridorEntry } from "@/types/viz";
import { medianOf } from "@/lib/stats";
import { tierFor } from "@/refinery/lib/chart-adapter.mts";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

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

async function loadCorridors(): Promise<CorridorEntry[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("corridor_profiles")
      .select(
        "corridor_name, asking_rent_psf, vacancy_rate_pct, absorption_sqft, city",
      )
      .not("asking_rent_psf", "is", null)
      .is("deleted_at", null)
      .eq("verification_status", "verified");
    if (error || !data || data.length === 0) throw new Error("supabase empty");
    return data.map((row) => ({
      // corridor_name is the canonical slug/join key; use as both id and name
      id: row.corridor_name as string,
      name: row.corridor_name as string,
      submarket: (row.city as string | null) ?? "Unknown",
      nnn_asking_rent_per_sqft: row.asking_rent_psf as number,
      vacancy_pct: (row.vacancy_rate_pct as number | null) ?? null,
      absorption_sqft: (row.absorption_sqft as number | null) ?? null,
    }));
  } catch {
    // fixture fallback — used when Supabase is unreachable or returns no rows
    const file = path.join(process.cwd(), "fixtures", "corridor-rents.json");
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as CorridorEntry[];
  }
}

export default async function AskingRentCardPage() {
  const all = await loadCorridors();

  const ranked = all
    .filter(
      (c): c is CorridorEntry & { nnn_asking_rent_per_sqft: number } =>
        typeof c.nnn_asking_rent_per_sqft === "number",
    )
    .sort((a, b) => b.nnn_asking_rent_per_sqft - a.nnn_asking_rent_per_sqft);

  const total = ranked.length;
  const marketValues = ranked.map((c) => c.nnn_asking_rent_per_sqft);
  const marketMedian = medianOf(marketValues) ?? 0;
  const marketRange = {
    min: marketValues[marketValues.length - 1],
    max: marketValues[0],
  };

  const top = ranked.slice(0, TOP_N);
  const bottom = ranked.slice(-BOTTOM_N);
  const shown = [...top, ...bottom];

  const corridors: HBarCorridor[] = shown.map((c) => ({
    name: c.name,
    value: c.nnn_asking_rent_per_sqft,
    tier: tierFor(c.nnn_asking_rent_per_sqft, marketMedian),
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
        fontFamily:
          "var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <HBarChart
        title="Asking rent (NNN, $/sqft)"
        corridors={corridors}
        median={marketMedian}
        range={marketRange}
        eyebrow={`${corridors.length} of ${total} corridors`}
        separatorAfter={TOP_N}
        separatorLabel={`${BOTTOM_N} lowest of ${total}`}
        detailHref={DETAIL_HREF}
        detailLabel={`View all ${total} corridors →`}
      />
    </main>
  );
}
