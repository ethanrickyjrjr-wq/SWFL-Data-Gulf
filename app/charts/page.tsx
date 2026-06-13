import { MetroAreaChart } from "@/components/charts";
import { mapPivotedCityRows, type PivotedSeries } from "@/lib/charts/pivoted-series";
import type { PivotedCityMonth } from "@/types/viz";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const revalidate = 3600;

// ── Add a chart = add a row here ──────────────────────────────────────────────
// Every data_lake.*_pivoted view is wide { month, cape_coral, fort_myers, naples },
// so a new panel only needs its view name + how to label/format it. The page maps
// over PANELS, so nothing else changes when you add one.
interface ChartPanel {
  /** data_lake view name (must expose month/cape_coral/fort_myers/naples). */
  view: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Customer-facing provenance — no internal table names on this public page. */
  source: string;
  formatValue: (value: number) => string;
}

const usd = (value: number) =>
  value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(2)}M`
    : `$${Math.round(value).toLocaleString()}`;
const usdPerMonth = (value: number) => `$${Math.round(value).toLocaleString()}`;

const PANELS: ChartPanel[] = [
  {
    view: "zhvi_pivoted",
    eyebrow: "Zillow Home Value Index (ZHVI)",
    title: "Home values across SWFL",
    subtitle: "Typical home value · Cape Coral · Fort Myers · Naples",
    source: "Zillow Research · ZHVI",
    formatValue: usd,
  },
  {
    view: "zori_pivoted",
    eyebrow: "Zillow Observed Rent Index (ZORI)",
    title: "Asking rents across SWFL",
    subtitle: "Typical asking rent / month · Cape Coral · Fort Myers · Naples",
    source: "Zillow Research · ZORI",
    formatValue: usdPerMonth,
  },
];

type LoadedPanel = PivotedSeries & { error: string | null };

async function loadSeries(
  supabase: ReturnType<typeof createServiceRoleClient>,
  view: string,
): Promise<LoadedPanel> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from(view)
      .select("month, cape_coral, fort_myers, naples")
      .order("month", { ascending: true });

    if (error) {
      return { entries: [], asOf: undefined, rowCount: 0, error: error.message };
    }
    // ~24–136 rows per view → a single .select() is safe (well under the 1000-row
    // PostgREST cap). If a panel is ever pointed at a long ZIP×month view, switch
    // to selectAllPaged from refinery/lib/paginate.mts instead.
    return { ...mapPivotedCityRows(data as PivotedCityMonth[] | null), error: null };
  } catch (err) {
    return {
      entries: [],
      asOf: undefined,
      rowCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function ChartsPage() {
  const supabase = createServiceRoleClient();
  const panels = await Promise.all(
    PANELS.map(async (panel) => ({ panel, series: await loadSeries(supabase, panel.view) })),
  );

  return (
    <main
      style={{
        background: "#0A1419",
        color: "#F0EDE6",
        minHeight: "100dvh",
        padding: "32px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <header>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#F0EDE6" }}>
            SWFL Market Charts
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#807E76",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            Home values and asking rents across Southwest Florida — Zillow ZHVI &amp; ZORI.
          </p>
        </header>

        {panels.map(({ panel, series }) => (
          <MetroAreaChart
            key={panel.view}
            data={series.entries}
            asOf={series.asOf}
            eyebrow={panel.eyebrow}
            title={panel.title}
            subtitle={panel.subtitle}
            formatValue={panel.formatValue}
            asOfNote={panel.source}
            rootId={`${panel.view}-chart`}
            emptyTitle={series.error ? "Data unavailable" : "No data loaded yet"}
            emptyHint={
              series.error
                ? series.error
                : `No ${panel.title.toLowerCase()} to graph yet — check back after the next refresh.`
            }
          />
        ))}
      </div>
    </main>
  );
}
