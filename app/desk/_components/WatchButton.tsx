"use client";

import { Star } from "lucide-react";
import { useWatchlist } from "./use-watchlist";

/** Star toggle on a movers-board row — adds the ZIP to the device-local
 *  watchlist rail. Renders un-starred until the client hydrates. */
export function WatchButton({ zip }: { zip: string }) {
  const { zips, toggle } = useWatchlist();
  const on = zips.includes(zip);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle(zip)}
      title={on ? `Remove ${zip} from your watchlist` : `Watch ${zip}`}
      className={`shrink-0 rounded p-0.5 transition-colors ${
        on ? "text-[#d4b370]" : "text-gray-700 hover:text-gray-400"
      }`}
    >
      <Star className="h-3 w-3" fill={on ? "currentColor" : "none"} />
    </button>
  );
}
