import { CorridorRentChart, ZHVIAreaChart } from "@/components/charts";
import { resolveOrigin } from "@/lib/fetch-brain";
import {
  loadDemoBrainSummary,
  loadDemoCorridorRents,
  loadDemoZhviTrend,
  loadDemoStats,
  metricDirectionToTone,
} from "@/lib/demo/live-loaders";
import type { JoinedCorridorRow } from "@/types/viz";

// Reads live brain output + Supabase tables at request time (see
// lib/demo/live-loaders.ts). Demo page renders the rent chart only;
// permits / centroid join is the embed page's job.
export const revalidate = 300;

export default async function DemoPage() {
  const origin = resolveOrigin();
  const [brainSummary, corridorRents, zhviTrend, stats] = await Promise.all([
    loadDemoBrainSummary(origin),
    loadDemoCorridorRents(),
    loadDemoZhviTrend(),
    loadDemoStats(),
  ]);

  const corridorData: JoinedCorridorRow[] = corridorRents.map((row) => ({
    ...row,
    permits: null,
    centroid: null,
  }));

  return (
    <main className="min-h-dvh bg-[#0A1419] text-[#F0EDE6]">
      {/* SECTION 1 — Hero (DataStreamBg + headline) */}
      <section className="flex min-h-dvh flex-col items-center justify-center px-6">
        <p className="mb-4 font-mono text-xs uppercase tracking-widest text-gulf-teal">
          Intelligence · {brainSummary.dataSources} verified sources
        </p>
        <h1 className="max-w-3xl text-center text-5xl font-semibold leading-tight tracking-tight">
          Real data makes AI real.
        </h1>
        <p className="mt-6 max-w-xl text-center text-lg text-[#B8B4A8]">
          {corridorRents.length} corridors. {stats.swflZips} ZIP codes.{" "}
          {stats.floodRecords.toLocaleString()} flood records. One verified answer.
        </p>
        <p className="mt-4 font-mono text-xs text-[#807E76]">
          Confidence: {brainSummary.confidencePct}% · {brainSummary.freshnessAsOf}
        </p>
      </section>

      {/* SECTION 2 — Brain output conclusion */}
      <section className="border-t border-[#22414F] px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-[#807E76]">
            Current conclusion
          </p>
          <p className="text-xl leading-relaxed text-[#F0EDE6]">{brainSummary.conclusion}</p>
          <div className="mt-4 flex gap-6">
            {brainSummary.caveats.map((c, i) => (
              <p key={i} className="text-xs text-[#807E76]">
                ⚠ {c}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 — NNN Corridor Chart */}
      <section className="border-t border-[#22414F] px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[#807E76]">
            Commercial corridors
          </p>
          <h2 className="mb-8 text-2xl font-semibold">NNN Asking Rent by Corridor</h2>
          <CorridorRentChart data={corridorData} />
          <p className="mt-3 font-mono text-xs text-[#807E76]">
            Source: SWFL corridor_profiles · Supabase
          </p>
        </div>
      </section>

      {/* SECTION 4 — ZHVI Trend Chart */}
      <section className="border-t border-[#22414F] px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[#807E76]">
            Home values
          </p>
          <h2 className="mb-8 text-2xl font-semibold">
            36-Month ZHVI Trend — Cape Coral · Fort Myers · Naples
          </h2>
          <ZHVIAreaChart data={zhviTrend.entries} asOf={zhviTrend.asOf} />
          <p className="mt-3 font-mono text-xs text-[#807E76]">
            Source: Zillow ZHVI (index) · data_lake.zhvi_pivoted
          </p>
        </div>
      </section>

      {/* SECTION 5 — Key Metrics Grid */}
      <section className="border-t border-[#22414F] px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[#807E76]">
            Key metrics
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {brainSummary.metrics.map((m) => (
              <div key={m.label} className="rounded border border-[#22414F] bg-[#152832] p-5">
                <p className="text-xs uppercase tracking-wider text-[#807E76]">{m.label}</p>
                <p className="mt-2 font-variant-numeric text-2xl font-semibold tabular-nums">
                  {m.value}
                </p>
                <p
                  className="mt-1 text-xs capitalize"
                  data-direction={metricDirectionToTone(m.direction)}
                >
                  {m.direction}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — forward path off the demo page */}
      <section className="border-t border-[#22414F] px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-6 text-lg text-[#B8B4A8]">
            Ready to put this data to work for your clients?
          </p>
          <a
            href="/welcome"
            className="inline-block rounded-full bg-gulf-teal px-8 py-3 text-sm font-semibold text-[#0a1419] transition-colors hover:bg-gulf-teal/80"
          >
            Start a project →
          </a>
        </div>
      </section>
    </main>
  );
}
