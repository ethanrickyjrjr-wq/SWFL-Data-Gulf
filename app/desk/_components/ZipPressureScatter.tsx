import type { PressurePoint } from "@/lib/desk/types";
import { fmtPct } from "@/lib/desk/mappers";

/** Fixed county hues — dataviz-validated on the #0a1419 surface 07/16/2026
 *  (all six checks pass; worst CVD ΔE 14.3, normal-vision 18.8). Assignment
 *  follows the entity, never order-of-appearance; a null county renders the
 *  neutral mark — a county is stated data, never guessed from a ZIP. */
const COUNTY_COLORS: ReadonlyArray<{ county: string; color: string }> = [
  { county: "Lee", color: "#33a89f" },
  { county: "Collier", color: "#bd852a" },
];
const UNKNOWN_COLOR = "#807e76";
const SURFACE = "#0a1419";

const W = 340;
const H = 250;
const PAD = { top: 10, right: 12, bottom: 36, left: 42 };

function colorOf(county: string | null): string {
  return COUNTY_COLORS.find((c) => c.county === county)?.color ?? UNKNOWN_COLOR;
}

/** Round an axis max up to the next 5% so tick labels land on clean values. */
function niceMax(v: number): number {
  return Math.max(5, Math.ceil(v / 5) * 5);
}

/**
 * Pressure map — cut share (x) vs new-listing share (y), one dot per
 * qualifying core ZIP, dot area ∝ active-listing count. Server-rendered SVG,
 * no client JS: identity rides the legend + per-dot <title> tooltips, and the
 * quadrant caption is descriptive association, never a forecast. Re-plots
 * figures already on the page — it adds no new numbers.
 */
export function ZipPressureScatter({ points }: { points: PressurePoint[] }) {
  if (points.length < 3) return null;
  const xMax = niceMax(Math.max(...points.map((p) => p.cutShare)));
  const yMax = niceMax(Math.max(...points.map((p) => p.newShare)));
  const aMax = Math.max(...points.map((p) => p.activeCount), 1);
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + (v / xMax) * iw;
  const y = (v: number) => PAD.top + ih - (v / yMax) * ih;
  // sqrt-area sizing; 4px min radius keeps every mark >= 8px across.
  const r = (n: number) => 4 + 5 * Math.sqrt(n / aMax);
  const xTicks = [0, xMax / 2, xMax];
  const yTicks = [0, yMax / 2, yMax];
  const counties = COUNTY_COLORS.filter((c) => points.some((p) => p.county === c.county));
  // Big dots first so small ZIPs stay hoverable on top of them.
  const drawOrder = [...points].sort((a, b) => b.activeCount - a.activeCount);

  return (
    <div className="mt-8">
      <h3 className="text-[11px] uppercase tracking-wider text-gray-500">
        Pressure map — every qualifying ZIP
      </h3>
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-wider text-gray-500">
        {counties.map((c) => (
          <span key={c.county} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
            {c.county}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
          dot size = active listings
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label="Scatter chart: share of active listings with a price cut versus new-listing share, one dot per core ZIP, sized by active-listing count"
      >
        <line
          x1={PAD.left}
          y1={PAD.top + ih}
          x2={PAD.left + iw}
          y2={PAD.top + ih}
          stroke="rgba(255,255,255,0.12)"
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + ih}
          stroke="rgba(255,255,255,0.12)"
        />
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            x={x(t)}
            y={PAD.top + ih + 12}
            textAnchor="middle"
            className="font-mono"
            fontSize={8}
            fill="#6b7280"
          >
            {fmtPct(t, 0)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text
            key={`y${t}`}
            x={PAD.left - 5}
            y={y(t) + 2.5}
            textAnchor="end"
            className="font-mono"
            fontSize={8}
            fill="#6b7280"
          >
            {fmtPct(t, 0)}
          </text>
        ))}
        <text x={PAD.left + iw / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fill="#6b7280">
          share of actives with a price cut →
        </text>
        <text
          x={10}
          y={PAD.top + ih / 2}
          textAnchor="middle"
          fontSize={8.5}
          fill="#6b7280"
          transform={`rotate(-90 10 ${PAD.top + ih / 2})`}
        >
          new-listing share →
        </text>
        {drawOrder.map((p) => (
          <circle
            key={p.zip}
            cx={x(p.cutShare)}
            cy={y(p.newShare)}
            r={r(p.activeCount)}
            fill={colorOf(p.county)}
            fillOpacity={0.85}
            stroke={SURFACE}
            strokeWidth={2}
          >
            <title>{`${p.zip} — cuts ${fmtPct(p.cutShare)} · new ${fmtPct(p.newShare)} · ${p.activeCount.toLocaleString("en-US")} active`}</title>
          </circle>
        ))}
      </svg>
      <p className="mt-2 text-xs text-gray-500">
        Right = a bigger share of that ZIP&apos;s actives took a price cut; up = more fresh supply.
        Bottom-right ZIPs are cutting without new inventory, top-right are churning, top-left are
        adding supply without discounting — descriptive, not a forecast. Same ZIP set and noise
        guard as the boards above.
      </p>
    </div>
  );
}
