import type { Metadata } from "next";
import { ReportShell, ReportHeader, ReportFooter, Meta } from "../_components/report-shell";

export const metadata: Metadata = {
  title: "Realtor.com Data Library — SWFL Data Gulf",
  description:
    "How SWFL Data Gulf uses the Realtor.com public listing database — the same source behind the FGCU RERI dashboard.",
};

const COLUMNS: { name: string; what: string; use: string }[] = [
  { name: "median_listing_price", what: "Median asking price", use: "Map pill, hero card" },
  { name: "median_listing_price_yy", what: "YoY % change in price", use: "Trend chip on card" },
  { name: "active_listing_count", what: "# active listings", use: "Map choropleth, hero card" },
  { name: "active_listing_count_yy", what: "YoY % change in inventory", use: "Trend chip" },
  { name: "median_days_on_market", what: "Median DOM", use: "Map pill, ZIP report" },
  { name: "median_days_on_market_yy", what: "YoY DOM change", use: "Trend chip" },
  { name: "new_listing_count", what: "New listings this month", use: "Fresh supply signal" },
  { name: "new_listing_count_yy", what: "YoY new listings", use: "Supply trend" },
  { name: "price_reduced_count", what: "# homes with price cuts", use: "Buyer opportunity signal" },
  {
    name: "price_reduced_share",
    what: "% of listings with cuts",
    use: "Market softness indicator",
  },
  { name: "price_increased_count", what: "# homes with price increases", use: "Seller strength" },
  { name: "pending_listing_count", what: "# pending", use: "Absorption" },
  { name: "pending_ratio", what: "Pending / active ratio", use: "Absorption speed" },
  { name: "pending_ratio_yy", what: "YoY pending ratio", use: "Market velocity trend" },
  {
    name: "median_listing_price_per_square_foot",
    what: "$/sqft",
    use: "Price quality by ZIP",
  },
  { name: "median_square_feet", what: "Median home size", use: "Comp context" },
  { name: "quality_flag", what: "1.0 = reliable data", use: "Filter — only ingest 1.0" },
];

export default function RealtorDataPage() {
  return (
    <ReportShell>
      <ReportHeader title="Realtor.com Listing Database">
        <p className="mt-2 text-sm text-gray-400">
          The public data source behind the FGCU RERI dashboard — and our next data layer.
        </p>
      </ReportHeader>

      {/* ── Origin ── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Where this data comes from</h2>
        <p className="mt-3 text-sm leading-7 text-gray-300">
          FGCU&apos;s Regional Economic Research Institute publishes a &ldquo;Residential Active
          Listings&rdquo; dashboard. The page footer reads:{" "}
          <em>
            &ldquo;Source: Realtor.com residential listings database. Southwest Florida includes
            Charlotte, Collier, Glades, Hendry and Lee counties.&rdquo;
          </em>
        </p>
        <p className="mt-3 text-sm leading-7 text-gray-300">
          That dashboard is a static county-level chart. No ZIP drill-down, no days on market, no
          price cuts, no deliverable. The same data is available publicly — and we can do far more
          with it.
        </p>
      </section>

      {/* ── Source details ── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">Source</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Meta label="License" value="Attribution-only (cite Realtor.com)" />
          <Meta label="Grain" value="ZIP code × month" />
          <Meta label="Update cadence" value="Monthly (~3rd week of following month)" />
          <Meta label="Coverage" value="All US ZIP codes with sufficient data" />
          <Meta label="File size" value="~100 MB (full national history)" />
          <Meta label="API key required" value="No" />
        </dl>
        <p className="mt-4 font-mono text-xs text-gray-500 break-all">
          econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Zip_History.csv
        </p>
      </section>

      {/* ── Columns ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Available columns</h2>
        <p className="mt-2 text-sm text-gray-400">
          These are the columns confirmed from the CSV header. _mm = month-over-month change, _yy =
          year-over-year change.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-3 font-mono text-[11px]">Column</th>
                <th className="px-4 py-3">What it is</th>
                <th className="px-4 py-3">Use</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {COLUMNS.map((c) => (
                <tr key={c.name}>
                  <td className="px-4 py-3 font-mono text-xs text-gulf-teal">{c.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-300">{c.what}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{c.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── What this unlocks ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">What this unlocks</h2>
        <ul className="mt-4 space-y-3 text-sm text-gray-300">
          <li className="flex gap-3">
            <span className="text-gulf-teal">→</span>
            <span>
              <strong className="text-white">Days on market per ZIP</strong> — the column that is
              currently NULL in our listing pipeline. Every ZIP report gets a real DOM number.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gulf-teal">→</span>
            <span>
              <strong className="text-white">Year-over-year chips</strong> — every hero card gets a
              trend direction (↑12% vs last year) from the _yy columns.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gulf-teal">→</span>
            <span>
              <strong className="text-white">Price cut rate</strong> — what percent of SWFL sellers
              cut their price this month. A buyer-opportunity signal that no local source publishes.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gulf-teal">→</span>
            <span>
              <strong className="text-white">Pending ratio per ZIP</strong> — how fast homes are
              absorbing. A real velocity number, not an estimate.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gulf-teal">→</span>
            <span>
              <strong className="text-white">New inventory signal</strong> — how many new listings
              came to market this month vs. the same month last year.
            </span>
          </li>
        </ul>
      </section>

      {/* ── Us vs FGCU ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Same data, different product</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-3">FGCU RERI</th>
                <th className="px-4 py-3">SWFL Data Gulf</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {[
                ["Static chart, county-level", "Interactive map, ZIP-level drill"],
                ["No deliverable", '"Build market report" → AI writes it'],
                [
                  "Monthly refresh, no automation",
                  "Daily listing overlay + monthly Realtor.com update",
                ],
                ["No DOM, no price cuts shown", "Full dashboard: DOM, cuts, pending ratio, YoY"],
                ["No user personalization", "Saved ZIPs, client reports, auto-send"],
              ].map(([fgcu, us], i) => (
                <tr key={i}>
                  <td className="px-4 py-3 text-xs text-gray-400">{fgcu}</td>
                  <td className="px-4 py-3 text-xs text-gray-300">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Ingest plan ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Ingest plan</h2>
        <ol className="mt-4 space-y-2 text-sm text-gray-300 list-decimal list-inside">
          <li>Stream-filter the ~100 MB CSV to SWFL ZIPs only (~5 MB) — no full download needed</li>
          <li>
            Load into{" "}
            <code className="font-mono text-xs text-gulf-teal">data_lake.realtor_zip_metrics</code>{" "}
            with a monthly UPSERT (idempotent; primary key: month + ZIP)
          </li>
          <li>
            Build a <code className="font-mono text-xs text-gulf-teal">realtor-market-swfl</code>{" "}
            brain pack — regional DOM, price cut %, pending ratio; ZIP detail tables
          </li>
          <li>Wire YoY chips to homepage hero cards and add a Days on Market map pill</li>
          <li>Monthly GHA cron (~3rd week of month, after Realtor.com drops new data)</li>
        </ol>
        <p className="mt-4 text-xs text-gray-500">
          Spec:{" "}
          <code className="font-mono">
            docs/superpowers/specs/2026-06-27-realtor-data-library-ingest-design.md
          </code>
        </p>
      </section>

      <ReportFooter note="Source: Realtor.com residential listings database. Attribution required on any public-facing display." />
    </ReportShell>
  );
}
