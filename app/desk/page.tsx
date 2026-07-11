import type { Metadata } from "next";
import Image from "next/image";
import { PageShell } from "@/components/PageShell";
import { MarketTemperatureGauge } from "@/components/charts";
import { AddChartToProject } from "@/app/charts/AddChartToProject";
import { deskJsonLd, type DeskJsonLdFigure } from "@/lib/jsonld";
import { loadDeskData } from "@/lib/desk/loaders";
import type { DeskDatum } from "@/lib/desk/types";
import { DeskZone } from "./_components/DeskZone";
import { WireTicker } from "./_components/WireTicker";
import { DeskHero } from "./_components/DeskHero";
import { DeskKpiRow, type KpiTile } from "./_components/DeskKpiRow";
import { DailyPulse } from "./_components/DailyPulse";
import { MoversBoard } from "./_components/MoversBoard";
import { FlashFeed } from "./_components/FlashFeed";
import { DeskGaugePanel } from "./_components/DeskGaugePanel";
import { DeskHighlightBridge } from "./_components/DeskHighlightBridge";
import { TurnIntoReportCta } from "./_components/TurnIntoReportCta";
import { PinToEmail } from "./_components/PinToEmail";

// Fully indexable on purpose (SPEC-B SEAM: the robots decision is a pure
// robots.ts edit later — nothing to undo here).
export const metadata: Metadata = {
  title: "SWFL Data Desk — Live Southwest Florida Market Terminal",
  description:
    "Daily-refreshed Southwest Florida housing figures: median asking price, active inventory, price cuts, mortgage rate, and daily listing flow across Lee and Collier County — every number sourced and dated.",
};

// 5 min, same rationale as /charts: pure Supabase reads, no external API cost.
export const revalidate = 300;

/** MM/DD/YYYY → sortable YYYYMMDD (page-freshest stamp for the ● LIVE dot). */
function sortKey(mdy: string | undefined): string {
  if (!mdy) return "";
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdy);
  return m ? `${m[3]}${m[1]}${m[2]}` : "";
}

export default async function DeskPage() {
  const desk = await loadDeskData();

  const allDatums: DeskDatum[] = [
    ...desk.kpis,
    ...desk.mix,
    ...(desk.gauges.priceReduced ? [desk.gauges.priceReduced] : []),
    ...(desk.hero ? desk.hero.cities.map((c) => c.latest) : []),
  ];
  const freshest = allDatums
    .map((d) => d.asOf)
    .filter((d): d is string => !!d)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .at(-1);

  // Minimal day-1 Dataset JSON-LD (Spec B enriches this same hook).
  const figures: DeskJsonLdFigure[] = allDatums.map((d) => ({
    label: d.label,
    value: d.value,
    unit: d.unit,
    sourceLabel: d.sourceLabel,
    asOf: d.asOf,
  }));
  const fk = sortKey(freshest);
  const heroPts = desk.hero?.cities.flatMap((c) => c.points.map((p) => p.date)) ?? [];
  const coverStart = heroPts.length ? [...heroPts].sort()[0] : undefined;
  const coverEnd = fk ? `${fk.slice(0, 4)}-${fk.slice(4, 6)}-${fk.slice(6, 8)}` : undefined;
  const temporalCoverage = coverStart && coverEnd ? `${coverStart}/${coverEnd}` : undefined;
  const ld = deskJsonLd(figures, coverEnd, temporalCoverage);

  // Which KPI tiles are brain-mirrored → live frame pins (re-bind at each send).
  const tiles: KpiTile[] = desk.kpis.map((datum) => {
    if (datum.label === "Active listings") {
      return {
        datum,
        pin: {
          brainId: "active-listings-swfl",
          metricKeys: ["active_listings_count_swfl"],
          title: "SWFL active listings (live)",
        },
      };
    }
    if (datum.label === "Median asking price") {
      return {
        datum,
        pin: {
          brainId: "active-listings-swfl",
          metricKeys: ["median_list_price_swfl"],
          title: "SWFL median asking price (live)",
        },
      };
    }
    return { datum };
  });

  return (
    <div className="min-h-dvh bg-navy-dark font-sans text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <DeskHighlightBridge data={allDatums} pageAsOf={freshest} />

      <PageShell width="wide">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="SWFL Data Gulf"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg"
            />
            <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-white sm:text-base">
              SWFL Data Desk
            </h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[#5bc97a]/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#5bc97a]"
              title={freshest ? `Freshest daily data — updated ${freshest}` : "Freshest daily data"}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#5bc97a] animate-pulse motion-reduce:animate-none" />
              Live
            </span>
          </div>
          <p className="font-mono text-xs text-gray-500">
            Every figure carries its own source and date.
          </p>
        </header>
      </PageShell>

      <WireTicker entries={desk.ticker} />

      <PageShell width="wide" className="pt-6">
        <div className="flex flex-col gap-6">
          {desk.hero ? (
            <DeskZone
              id="desk-hero"
              title="Home Price Trend"
              note={desk.hero.windowNote}
              asOf={desk.hero.asOf}
              sourceLabel={desk.hero.sourceLabel}
              actions={
                <>
                  <PinToEmail
                    pin={{
                      brainId: "home-values-swfl",
                      metricKeys: ["home_value_zhvi_regional_median"],
                      title: "SWFL typical home value (live)",
                    }}
                  />
                  <AddChartToProject rootId="desk-price-trend" title="Median Home Price Trend" />
                  <TurnIntoReportCta recipe="Build a branded client email around the Southwest Florida home price trend for Cape Coral, Fort Myers, and Naples." />
                </>
              }
            >
              <DeskHero hero={desk.hero} />
            </DeskZone>
          ) : null}

          <div>
            <DeskKpiRow tiles={tiles} />
            {desk.mix.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-gray-600">
                  Inventory mix
                </span>
                {desk.mix.map((m) => (
                  <span key={m.label} className="font-mono text-xs text-gray-400 tabular-nums">
                    {m.display}{" "}
                    <span className="text-gray-600">
                      {m.label.toLowerCase()}
                      {m.asOf ? ` · ${m.asOf}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {desk.pulse ? (
            <DeskZone
              id="desk-pulse"
              title="Daily Market Pulse"
              note="What moved on the wire each scan day — new listings, price cuts, departures, confirmed sales."
              asOf={desk.pulse.asOf}
              sourceLabel={desk.pulse.sourceLabel}
              actions={
                <>
                  <AddChartToProject rootId="desk-pulse" title="Daily Market Pulse" />
                  <TurnIntoReportCta recipe="Build a branded client email around today's Southwest Florida market pulse — new listings, price cuts, and confirmed sales." />
                </>
              }
            >
              <DailyPulse pulse={desk.pulse} />
            </DeskZone>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {desk.movers ? (
              <DeskZone
                id="desk-movers"
                title="Movers — Core ZIPs"
                asOf={desk.movers.asOf}
                sourceLabel={desk.movers.sourceLabel}
                actions={
                  <TurnIntoReportCta recipe="Build a branded client email around the Southwest Florida ZIP codes with the highest share of price cuts and new listings." />
                }
              >
                <MoversBoard movers={desk.movers} />
              </DeskZone>
            ) : null}

            {desk.flash.length > 0 ? (
              <DeskZone
                id="desk-flash"
                title="The Wire"
                note="Headlines and notable listing events. Closings shown are recent NOTABLE closings — our sold coverage samples the highest-priced listings first, so this is not a market median."
              >
                <FlashFeed items={desk.flash} />
              </DeskZone>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {desk.gauges.marketTemp ? (
              <MarketTemperatureGauge gauge={desk.gauges.marketTemp} />
            ) : null}
            {desk.gauges.priceReduced ? <DeskGaugePanel datum={desk.gauges.priceReduced} /> : null}
          </div>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 rounded" />
            <span>
              SWFL Data Gulf — every number above names its source and its own as-of date.
            </span>
          </div>
        </footer>
      </PageShell>
    </div>
  );
}
