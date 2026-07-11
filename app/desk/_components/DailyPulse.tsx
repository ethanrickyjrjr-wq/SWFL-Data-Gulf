import type { PulseData } from "@/lib/desk/types";

const SEGMENTS = [
  { key: "newListings", label: "New", color: "#5bc97a" }, // mangrove
  { key: "priceCuts", label: "Price cuts", color: "#d4b370" }, // neutral-gold
  { key: "departures", label: "Departures", color: "#807e76" }, // text-tertiary
  { key: "sold", label: "Sold", color: "#3DC9C0" }, // gulf-teal
] as const;

/**
 * Daily Market Pulse — one row per scan day, stacked by transition class.
 * Two honesty rules are load-bearing here:
 *  - a low-coverage day is labeled "partial scan" (an incomplete sweep is not
 *    a market lull — e.g. 07/07/2026 logged 31 events vs. a ~1,200 median);
 *  - "departures" means a listing LEFT active — the state machine never
 *    asserts why, so this zone never says "sold" or "delisted" for them.
 * Server-rendered: every count is in the SSR HTML.
 */
export function DailyPulse({ pulse }: { pulse: PulseData }) {
  const days = [...pulse.days].reverse(); // newest first
  const maxTotal = Math.max(1, ...pulse.days.map((d) => d.total));

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-gray-500">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {days.map((d) => (
          <li
            key={d.day}
            className="grid grid-cols-[52px_1fr] items-center gap-3 sm:grid-cols-[52px_1fr_auto]"
          >
            <span className="font-mono text-xs text-gray-400 tabular-nums">{d.label}</span>
            <div>
              <div
                className="flex h-3 overflow-hidden rounded-sm bg-white/5"
                style={{
                  width: `${Math.max(2, (d.total / maxTotal) * 100)}%`,
                  opacity: d.partial ? 0.55 : 1,
                }}
              >
                {SEGMENTS.map((s) => {
                  const v = d[s.key];
                  if (!v || d.total === 0) return null;
                  return (
                    <span
                      key={s.key}
                      style={{ width: `${(v / d.total) * 100}%`, background: s.color }}
                      title={`${s.label}: ${v.toLocaleString("en-US")}`}
                    />
                  );
                })}
              </div>
              {d.partial ? (
                <span className="mt-0.5 inline-block rounded border border-amber-400/40 px-1 font-mono text-[9px] uppercase tracking-wider text-amber-400/90">
                  partial scan — incomplete sweep, not a lull
                </span>
              ) : d.carryoverAfterPartial ? (
                <span className="mt-0.5 inline-block rounded border border-gray-500/40 px-1 font-mono text-[9px] uppercase tracking-wider text-gray-400">
                  may include activity missed by the prior partial scan
                </span>
              ) : null}
            </div>
            <span className="hidden font-mono text-[11px] text-gray-500 tabular-nums sm:block">
              {d.newListings.toLocaleString("en-US")} new · {d.priceCuts.toLocaleString("en-US")}{" "}
              cuts · {d.departures.toLocaleString("en-US")} dep · {d.sold.toLocaleString("en-US")}{" "}
              sold
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-500">
        Departures are listings that left active status — the reason is not asserted; some return
        (yesterday&apos;s returns are counted in that day&apos;s events).
      </p>
    </div>
  );
}
