"use client";

import Link from "next/link";
import { Star, X } from "lucide-react";
import type { WatchZipRow } from "@/lib/desk/types";
import { useWatchlist } from "./use-watchlist";

/**
 * The watchlist rail — device-local personalization of figures the server
 * already rendered (`rows` is the full core-ZIP stat list from the page
 * payload; this component only FILTERS it — nothing hydrates from a client
 * fetch, so the Spec-B SSR-numbers seam holds). Empty watchlist → renders
 * nothing at all.
 */
export function DeskWatchlist({
  rows,
  asOf,
  sourceLabel,
}: {
  rows: WatchZipRow[];
  asOf?: string;
  sourceLabel: string;
}) {
  const { zips, toggle } = useWatchlist();
  if (zips.length === 0) return null;
  const byZip = new Map(rows.map((r) => [r.zip, r]));
  const pinned = zips.map((z) => byZip.get(z)).filter((r): r is WatchZipRow => !!r);
  if (pinned.length === 0) return null;

  return (
    <section
      id="desk-watchlist"
      className="rounded-2xl border border-[#d4b370]/30 bg-[#0f1d24] p-4 text-[#f0ede6] sm:p-6"
    >
      <header className="mb-3 flex items-center gap-2">
        <Star className="h-3.5 w-3.5 text-[#d4b370]" fill="currentColor" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">
          Your watchlist
        </h2>
        <span className="text-[10px] text-gray-600">saved on this device</span>
      </header>
      <ul className="flex flex-wrap gap-2">
        {pinned.map((r) => (
          <li
            key={r.zip}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
          >
            <Link
              href={`/r/zip-report/${r.zip}`}
              className="font-mono text-xs text-gray-200 tabular-nums hover:text-gulf-teal hover:underline"
              title={`Open the ${r.zip} report`}
            >
              {r.zip}
            </Link>
            <span className="font-mono text-[10px] text-gray-500">
              {r.medianListDisplay ? `ask ${r.medianListDisplay}` : ""}
              {r.medianListDisplay ? " · " : ""}
              {r.activeCount} active
              {r.priceCutShareDisplay ? ` · cuts ${r.priceCutShareDisplay}` : ""}
              {r.newListingShareDisplay ? ` · new ${r.newListingShareDisplay}` : ""}
            </span>
            <button
              type="button"
              onClick={() => toggle(r.zip)}
              title={`Remove ${r.zip}`}
              className="text-gray-600 hover:text-gray-300"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[11px] text-gray-500">
        {asOf ? `as of ${asOf}` : ""}
        {asOf ? " · " : ""}
        {sourceLabel}
      </p>
    </section>
  );
}
