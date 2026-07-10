import type { NearbyPulseItem } from "../../lib/pulse/nearby-rank";

/**
 * "What's happening near {ZIP}" — live pulse items ordered by grain
 * (point → neighborhood → city), bigger grains visibly labeled (spec: city
 * items are welcome but never masquerade as ZIP-local). Renders nothing when
 * there are no items: additive + empty-tolerant, the page degrades to today's
 * layout. Phone-first per the grid-lab standard: single-column stacked list,
 * no fixed widths, nothing hover-gated. Styling mirrors NarrativeSections
 * (the sibling narrative root) so the two read as one system.
 *
 * The OSM attribution line satisfies the ODbL display requirement for
 * Nominatim-resolved locations; it renders unconditionally — cheaper and more
 * honest than threading per-item provider state through the read path.
 */
export function PulseNearby({ zip, items }: { zip: string; items: NearbyPulseItem[] }) {
  if (items.length === 0) return null;

  const asOf = (iso: string) => {
    const d = new Date(iso);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${mm}/${dd}/${d.getUTCFullYear()}`;
  };

  const placeLabel = (it: NearbyPulseItem) =>
    it.geo_grain === "point" || it.geo_grain === "neighborhood"
      ? (it.location_anchor ?? it.city)
      : `${it.city} · city-wide`;

  const sourceLabel = (it: NearbyPulseItem) => {
    if (it.source_title) return it.source_title;
    try {
      return new URL(it.source_url).hostname.replace(/^www\./, "");
    } catch {
      return "source";
    }
  };

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-6 py-8 sm:px-10">
      <section aria-label={`What's happening near ${zip}`}>
        <h2 className="text-lg font-bold text-white">What&rsquo;s happening near {zip}</h2>
        <ul className="mt-3 space-y-3">
          {items.map((it, i) => (
            <li
              key={`${it.source_url}-${i}`}
              className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {placeLabel(it)}
              </p>
              <p className="mt-1 text-sm leading-6 text-gray-200">{it.fact}</p>
              <p className="mt-2 text-xs text-gray-500">
                <a
                  href={it.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-white/20 underline-offset-2 hover:text-gray-300"
                >
                  {sourceLabel(it)}
                </a>{" "}
                · {asOf(it.captured_at)}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          Location matching uses OpenStreetMap data © OpenStreetMap contributors.
        </p>
      </section>
    </div>
  );
}
