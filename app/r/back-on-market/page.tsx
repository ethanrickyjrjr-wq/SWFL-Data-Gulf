// app/r/back-on-market/page.tsx
//
// The Back on the Market read route: /r/back-on-market?q=<zip|address>. Resolves the
// input to a Lee/Collier ZIP (bare 5-digit used directly; an address geocoded), loads
// that ZIP's Lane-1 rates, and renders the both-sides read. Empty-tolerant: no q, an
// out-of-scope place, or a ZIP with no row → a plain ask, never a fabricated rate.
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { loadBackOnMarketZip } from "@/lib/back-on-market/load-zip";
import { resolveRelistFact } from "@/lib/back-on-market/relist-fact";
import BackOnMarketRead from "@/components/back-on-market/BackOnMarketRead";

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
      <main className="bom-empty">
        <h1>Back on the Market</h1>
        <p>
          Enter a Lee or Collier County ZIP or address to see how often deals fall through and homes
          come back there.
        </p>
      </main>
    );
  }
  return (
    <main>
      <BackOnMarketRead data={data} relist={relist} />
    </main>
  );
}
