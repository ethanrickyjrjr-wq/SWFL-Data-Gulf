import { MapCanvas } from "@/components/charts/MapCanvas";
import "@/components/landing/home-explorer.css";
import { PageShell } from "@/components/PageShell";
import { loadMapFlood } from "@/lib/landing/load-map-flood";

// Repointed to the LIVE env-swfl flood root (docs/standards/data-roots.md:238).
// All three maps used to render with no `override`, so all three painted the
// import-quarantined mock fixture and served invented flood dollars as real.
// `loadMapFlood()` is empty-tolerant: on a miss it returns null, `override`
// goes undefined, and MapCanvas renders its "Sample data — not live" badge
// rather than passing mock numbers off as live.
export const revalidate = 3600;

export default async function MapPage() {
  const flood = await loadMapFlood();
  const override = flood ?? undefined;
  // FEMA is a NAMED FEDERAL SOURCE — cite it as OpenFEMA FimaNfipClaims, never as
  // "SWFL Data Gulf" (docs/handoff/2026-07-14-fema-flood-data-usage-handoff.md).
  // The SWFL Data Gulf attribution is for our own derived numbers, not a federal feed.
  const source = flood
    ? "Realized NFIP flood loss per insured property · OpenFEMA FimaNfipClaims"
    : "Sample data — live flood loss is temporarily unavailable.";

  return (
    <PageShell width="wide" className="space-y-12 py-12">
      <section>
        <h1 className="text-2xl font-semibold">Lee + Collier Counties</h1>
        <p className="mt-1 text-sm text-gray-400">
          Flood loss by ZIP — hover to explore, click to open report.
        </p>
        <p className="mt-1 text-xs text-gray-500">{source}</p>
        <MapCanvas
          county="both"
          metric="flood"
          override={override}
          className="mt-6 h-[560px] rounded-xl"
        />
      </section>

      <section className="space-y-10">
        <h2 className="text-xl font-semibold">County Breakdown</h2>
        <div>
          <h3 className="text-base font-medium mb-1">Lee County</h3>
          <p className="text-sm text-gray-400 mb-4">Fort Myers, Cape Coral, Lehigh Acres</p>
          <MapCanvas
            county="Lee"
            metric="flood"
            override={override}
            className="h-[560px] rounded-xl"
          />
        </div>
        <div>
          <h3 className="text-base font-medium mb-1">Collier County</h3>
          <p className="text-sm text-gray-400 mb-4">Naples, Marco Island, Immokalee</p>
          <MapCanvas
            county="Collier"
            metric="flood"
            override={override}
            className="h-[560px] rounded-xl"
          />
        </div>
      </section>
    </PageShell>
  );
}
