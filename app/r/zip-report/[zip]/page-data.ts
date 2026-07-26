import { unstable_cache } from "next/cache";
import { loadMetroTrend, type MetroTrendPanel } from "../../../../lib/charts/load-metro-trend";
import { getSourcedFigures, type SourcedFigure } from "../../../../lib/figures/sourced";
import { loadNarrative } from "../../../../lib/narratives/store";
import type { NarrativeRow } from "../../../../lib/narratives/types";
import { loadPulseNearby } from "../../../../lib/pulse/nearby";
import type { NearbyPulseItem } from "../../../../lib/pulse/nearby-rank";
import { buildZipSeedDoc } from "../../../../lib/email/zip-seed";
import { renderEmailDocHtml } from "../../../../lib/email/render-email-doc";

/**
 * Cached data layer for the ZIP report page — the "cache the loads, not the
 * shell" lane from the 07/21 caching research. The page stays force-dynamic
 * (it reads searchParams for the search box; the 07/23 static-shell attempt
 * 500'd every request — see the note in page.tsx), but these per-ZIP Supabase
 * reads are identical for every visitor for an hour, so they ride Next's data
 * cache instead of hitting the lake per view.
 *
 * NOT cached here, deliberately:
 * - `assembleZipReport` — returns Maps (registryBrains, railContext,
 *   permitsCountMap), which do not survive the cache's JSON round-trip, and
 *   is shared with the narrative bake which runs outside the Next server.
 *   Its brain reads are disk + in-process-memoized already.
 * - Degraded results — every loader here degrades to empty on error rather
 *   than throwing; caching an empty tuple would pin a transient outage for a
 *   full hour. `isDegradedZipModules` detects the env-wide-outage shape and
 *   the cached wrapper throws instead of storing it, falling back to a live
 *   (uncached) load so the page renders exactly as it would have pre-cache.
 */
export interface ZipPageModules {
  metroTrend: MetroTrendPanel;
  sourcedFigures: SourcedFigure[];
  narrative: NarrativeRow | null;
  pulseNearby: NearbyPulseItem[];
  seedEmailHtml: string | null;
}

/** True when every lake-backed module came back empty — the shape of missing
 * creds or a lake outage, not of a real ZIP (seedEmailHtml is legitimately
 * null and excluded). Never cache this shape. */
export function isDegradedZipModules(m: ZipPageModules): boolean {
  return (
    m.metroTrend.data.length === 0 &&
    m.sourcedFigures.length === 0 &&
    m.narrative === null &&
    m.pulseNearby.length === 0
  );
}

async function loadLive(zip: string): Promise<ZipPageModules> {
  const [metroTrend, sourcedFigures, narrative, pulseNearby, seedEmailHtml] = await Promise.all([
    loadMetroTrend("redfin_metro_sold_pivoted"),
    getSourcedFigures({ kind: "zip", key: zip }),
    loadNarrative("zip", zip),
    loadPulseNearby(zip),
    // Funnel miniature (Phase D): the SAME doc a lab visitor lands in, rendered
    // through the ONE EmailDoc→HTML root. Additive — any failure = no module.
    buildZipSeedDoc(zip)
      .then((doc) => (doc ? renderEmailDocHtml(doc) : null))
      .catch(() => null),
  ]);
  return { metroTrend, sourcedFigures, narrative, pulseNearby, seedEmailHtml };
}

const cachedZipModules = unstable_cache(
  async (zip: string): Promise<ZipPageModules> => {
    const m = await loadLive(zip);
    if (isDegradedZipModules(m)) throw new Error("degraded-zip-modules: not caching an outage");
    return m;
  },
  ["zip-report-modules-v1"],
  { revalidate: 3600 },
);

export async function loadZipPageModules(zip: string): Promise<ZipPageModules> {
  try {
    return await cachedZipModules(zip);
  } catch {
    return loadLive(zip);
  }
}
