// app/r/back-on-market/page.tsx
//
// The Back on the Market read route: /r/back-on-market?q=<zip|address>. Resolves the
// input to a Lee/Collier ZIP (bare 5-digit used directly; an address geocoded), loads
// that ZIP's Lane-1 rates, and renders the both-sides read. Empty-tolerant: no q, an
// out-of-scope place, or a ZIP with no row → a plain ask, never a fabricated rate.
//
// Report-family chrome (report-shell.tsx), reused not reinvented — same shell/header/
// footer + container as /r/should-i-sell (fix 07/18/2026: the page was rendering bare
// <main> with undefined bom-* classes, so content sat flush to the top-left).
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { cityForZip } from "@/lib/swfl-zip-city";
import { loadBackOnMarketZip } from "@/lib/back-on-market/load-zip";
import { resolveRelistFact } from "@/lib/back-on-market/relist-fact";
import BackOnMarketRead from "@/components/back-on-market/BackOnMarketRead";
import { ReportShell, ReportHeader, ReportFooter, Meta } from "../_components/report-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BARE_ZIP = /^\d{5}$/;

/** q → { zip, place } or null. Pure; the geocoder is injectable for tests. */
export async function resolveQToZip(
  q: string,
  deps: { geocode?: GeocodeFn } = {},
): Promise<{ zip: string; place?: string } | null> {
  const s = (q ?? "").trim();
  if (!s) return null;
  if (BARE_ZIP.test(s)) return { zip: s, place: undefined };
  const geo = await geocodeAddress(s, deps.geocode ? { geocode: deps.geocode } : {});
  if (!geo?.zip) return null;
  return { zip: geo.zip, place: undefined };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const resolved = await resolveQToZip(q);
  const inScope = resolved ? resolveZip(resolved.zip).in_scope : false;
  // Lane 2 is only meaningful for a specific ADDRESS (a bare ZIP has no per-home key), so
  // skip the geocode for a bare-ZIP query. resolveRelistFact is empty-tolerant on its own,
  // but a returned fact overlays only when Lane-1 ZIP context exists.
  const isAddress = q.trim() !== "" && !BARE_ZIP.test(q.trim());
  const [data, relist] = await Promise.all([
    resolved && inScope ? loadBackOnMarketZip(resolved.zip) : Promise.resolve(null),
    isAddress ? resolveRelistFact(q) : Promise.resolve(null),
  ]);

  if (!data) {
    return (
      <ReportShell width="2xl">
        <ReportHeader title="Back on the Market">
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
            How often deals fall through — and homes come back — in a Lee or Collier County area.
            Enter a ZIP or a full street address.
          </p>
          <form method="get" className="mt-5 flex max-w-xl flex-wrap gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Your ZIP or address — e.g. 33904, or 123 Main St, Cape Coral"
              aria-label="ZIP or address"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
            />
            <button
              type="submit"
              className="btn-gradient inline-flex shrink-0 items-center rounded-lg px-5 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90"
            >
              Look it up
            </button>
          </form>
        </ReportHeader>
        <ReportFooter />
      </ReportShell>
    );
  }

  const zip = resolved!.zip;
  const place = data.place ?? cityForZip(zip) ?? `ZIP ${zip}`;
  const county = resolveZip(zip).county_names?.[0];

  return (
    <ReportShell width="2xl">
      <ReportHeader title="Back on the Market">
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
          When a home falls out of contract and comes back, it&rsquo;s usually the deal, not the
          house. Here&rsquo;s how often it happens in {place} — and what it does and doesn&rsquo;t
          mean. Every number names its source.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Meta label="Area" value={`${place} · ${zip}`} />
          {county && <Meta label="County" value={`${county} County`} />}
        </dl>
      </ReportHeader>

      <BackOnMarketRead data={data} relist={relist} />

      <ReportFooter />
    </ReportShell>
  );
}
