import type { MoversData, MoverRow } from "@/lib/desk/types";
import { WatchButton } from "./WatchButton";
import { ZipPressureScatter } from "./ZipPressureScatter";

function Board({ title, rows, color }: { title: string; rows: MoverRow[]; color: string }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.value), 0.001);
  return (
    <div className="min-w-0 flex-1">
      <h3 className="text-[11px] uppercase tracking-wider text-gray-500">{title}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.zip} className="grid grid-cols-[auto_64px_1fr_auto] items-center gap-2">
            <WatchButton zip={r.zip} />
            <span className="font-mono text-xs text-gray-300 tabular-nums">
              {r.zip}
              {r.county ? <span className="block text-[9px] text-gray-600">{r.county}</span> : null}
            </span>
            <div className="h-2 rounded-sm bg-white/5">
              <div
                className="h-2 rounded-sm"
                style={{ width: `${(r.value / max) * 100}%`, background: color }}
              />
            </div>
            <span className="text-right font-mono text-xs text-gray-300 tabular-nums">
              {r.display}
              {r.medianListDisplay ? (
                <span className="block text-[9px] text-gray-600">ask {r.medianListDisplay}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Movers — top core ZIPs by momentum share. Server-rendered. */
export function MoversBoard({ movers }: { movers: MoversData }) {
  return (
    <div>
      <div className="flex flex-col gap-8">
        <Board title="Highest share of price cuts" rows={movers.priceCutShare} color="#d4b370" />
        <Board
          title="Highest share of new listings"
          rows={movers.newListingShare}
          color="#5bc97a"
        />
      </div>
      {movers.pressure ? <ZipPressureScatter points={movers.pressure} /> : null}
      <p className="mt-3 text-xs text-gray-500">
        Share of that ZIP&apos;s active listings. ZIPs with fewer than {movers.minActive} active
        listings are excluded — a tiny sample would rank on noise.
      </p>
    </div>
  );
}
