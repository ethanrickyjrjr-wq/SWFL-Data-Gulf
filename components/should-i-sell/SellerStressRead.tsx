// components/should-i-sell/SellerStressRead.tsx
//
// Section 1 — the seller's own area's honest stress read, faced to them. SERVER
// component (no interactivity, no count-up): every number renders as real server-side
// HTML so a crawler reads the truth, not a 0. Truth-first — we do not sand off
// "elevated pressure"; the honesty is the differentiator.
import Link from "next/link";
import type { SellerStressRead } from "@/lib/should-i-sell/load-stress-read";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";
import { type CondoShare, condoShareSentence } from "@/lib/should-i-sell/condo-share";
import { SectionTitle } from "@/app/r/_components/report-shell";

const pct = (n: number) => `${n.toFixed(1)}%`;

export interface NearbyArea {
  zip: string;
  place: string | null;
}

function vsMedianPhrase(v: "above" | "near" | "below"): string {
  if (v === "above") return "sits above the Southwest Florida middle";
  if (v === "below") return "sits below the Southwest Florida middle";
  return "sits near the Southwest Florida middle";
}

export default function SellerStressRead({
  data,
  nearby = [],
  condoShare = null,
}: {
  data: SellerStressRead;
  nearby?: NearbyArea[];
  /** Per-ZIP condo share — the concrete number under the SB 4-D / condo caveat. null
   *  outside the Lee/Collier parcel footprint (the line then omits, never invents). */
  condoShare?: CondoShare | null;
}) {
  const { place, region, area, scored, drivers, caveats } = data;
  const dataThroughLabel = monthYearLabel(data.dataThrough);

  return (
    <section className="mt-8">
      <SectionTitle>Where {place} stands for sellers right now</SectionTitle>

      {region && (
        <p className="mt-4 text-lg leading-8 text-gray-200">
          Across Southwest Florida, the market is{" "}
          <strong className="text-white">{region.stateLabel}</strong> — seller stress sits at{" "}
          <span className="font-mono text-white">{region.median.toFixed(1)}</span> out of 100.
        </p>
      )}

      {scored && area ? (
        <p className="mt-3 text-base leading-7 text-gray-300">
          For {place} specifically: it {vsMedianPhrase(area.vsMedian)}, ranking{" "}
          <span className="font-mono text-white">#{area.rank.position}</span> of {area.rank.total}{" "}
          areas we score for seller pressure (1 = the most pressure).
        </p>
      ) : (
        <>
          <p className="mt-3 text-base leading-7 text-gray-300">
            We don&rsquo;t yet hold enough recent history to score {place} on its own — so we
            won&rsquo;t put a number on your area that we can&rsquo;t stand behind. The region-wide
            read above is the honest frame until {place} has enough of its own history to score.
          </p>
          {nearby.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Nearby areas
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {nearby.map((n) => (
                  <Link
                    key={n.zip}
                    href={`/r/should-i-sell/${n.zip}`}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-gray-200 transition-colors hover:border-gulf-teal/40"
                  >
                    <span className="font-mono">{n.zip}</span>
                    {n.place && <span className="ml-2 text-gray-400">{n.place}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {drivers.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            What&rsquo;s moving it in {place}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {drivers.map((d) => (
              <div
                key={d.label}
                className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
              >
                <p className="font-mono text-lg font-semibold text-white">{pct(d.valuePct)}</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">{d.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Delistings — homes taken off the market without selling — are the leading signal.
          </p>
        </div>
      )}

      {(caveats.length > 0 || condoShare) && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gulf-teal">
            Reading this honestly
          </p>
          {caveats.length > 0 && (
            <ul className="mt-2 space-y-2">
              {caveats.map((c) => (
                <li key={c} className="text-sm leading-6 text-gray-300">
                  {c}
                </li>
              ))}
            </ul>
          )}
          {condoShare && (
            <p className="mt-2 border-t border-white/5 pt-2 text-sm leading-6 text-gray-300">
              {condoShareSentence(condoShare, place)}{" "}
              <span className="text-xs text-gray-500">
                ({condoShare.source.label}, county parcel records — as of {condoShare.asOf})
              </span>
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">Data through {dataThroughLabel || "—"}.</p>
      {data.lastChecked && (
        <p className="mt-0.5 text-xs text-gray-600">Last checked {data.lastChecked}.</p>
      )}
    </section>
  );
}
