// components/brand/PaletteContrastStrip.tsx — Fence 6 Tier B warn strip. PURE
// derived render: no state, no effects (react-hooks/set-state-in-effect is a
// hard error in this repo). It WARNS about low-contrast brand pairs and states
// what the render guards will do — it never blocks a save and never rewrites a
// color. Mounted in BrandingBlock (the ONE brand form) under the color slots.
import { evaluateSchemeContrast } from "@/lib/brand/palette-contrast";

const SHOW = 3;

export function PaletteContrastStrip({ scheme }: { scheme: [string, string, string, string] }) {
  const warnings = evaluateSchemeContrast(scheme);
  if (warnings.length === 0) return null;
  const shown = warnings.slice(0, SHOW);
  const rest = warnings.length - shown.length;
  return (
    <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
      {shown.map((w) => (
        <p key={w.surface} className="text-[10px] leading-4 text-amber-200">
          ⚠ Hard to read: {w.surface} ({w.ratio.toFixed(1)}:1 — comfortable is {w.floor}:1). Sent
          emails adjust automatically: {w.consequence}.
        </p>
      ))}
      {rest > 0 ? <p className="text-[10px] text-amber-200/70">+{rest} more</p> : null}
    </div>
  );
}
