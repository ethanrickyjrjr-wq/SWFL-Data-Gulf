"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import type { TickerEntry } from "@/lib/desk/types";

const UP = "#5bc97a"; // mangrove
const DOWN = "#e08158"; // sunset-coral

/**
 * The desk wire — a CSS marquee of daily figures. Honest motion only: the
 * scroll is presentational, the values are SSR'd and refresh with the page
 * revalidate, never a synthetic tick. `prefers-reduced-motion` stops the
 * scroll entirely (the strip becomes a static row), and a pause control is
 * always offered. Direction is never color-alone: every delta pairs an arrow.
 */
export function WireTicker({ entries }: { entries: TickerEntry[] }) {
  const [paused, setPaused] = useState(false);
  if (entries.length === 0) return null;

  const chip = (e: TickerEntry, dup: boolean) => (
    <span
      key={`${e.id}${dup ? "-dup" : ""}`}
      className="inline-flex items-baseline gap-1.5 whitespace-nowrap px-4 font-mono text-xs"
      aria-hidden={dup}
    >
      <span className="uppercase tracking-wider text-gray-500">{e.label}</span>
      <span className="text-sm font-semibold text-[#f0ede6] tabular-nums">{e.display}</span>
      {e.direction && e.direction !== "flat" ? (
        <span
          style={{ color: e.direction === "up" ? UP : DOWN }}
          className="tabular-nums"
          aria-label={e.direction === "up" ? "up" : "down"}
        >
          {e.direction === "up" ? "▲" : "▼"}
          {e.deltaDisplay ? ` ${e.deltaDisplay}` : ""}
        </span>
      ) : null}
      {e.asOf ? <span className="text-[10px] text-gray-600">{e.asOf}</span> : null}
    </span>
  );

  return (
    <div className="relative overflow-hidden border-y border-[#22414f] bg-[#0a1419] py-2">
      <style>{`
        @keyframes desk-wire-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .desk-wire-track {
          display: inline-flex;
          animation: desk-wire-scroll 45s linear infinite;
        }
        .desk-wire-track[data-paused="true"] { animation-play-state: paused; }
        .desk-wire-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .desk-wire-track { animation: none; }
        }
      `}</style>
      <div className="desk-wire-track" data-paused={paused}>
        {entries.map((e) => chip(e, false))}
        {entries.map((e) => chip(e, true))}
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Resume ticker" : "Pause ticker"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-[#22414f] bg-[#0a1419]/90 p-1 text-gray-400 hover:text-gray-200"
      >
        {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
      </button>
    </div>
  );
}
