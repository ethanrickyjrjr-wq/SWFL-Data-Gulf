"use client";
// The Brand panel's have/need readout (fill-once spec 2026-07-16 §F): what you
// have, what's missing, and WHY each missing thing matters — driven by the one
// ledger root so it can never disagree with what the build popups ask. Pure
// view: no fetching, no state.
import { completenessSummary } from "@/lib/brand/profile-ledger";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function BrandCompletenessStrip({ branding }: { branding: Record<string, string> }) {
  const s = completenessSummary(branding);
  if (s.filled === s.total) {
    return (
      <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
        Your brand is complete — every email signs with it automatically.
      </p>
    );
  }
  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[11px] font-semibold text-white/80">
        Your brand: {s.filled} of {s.total} filled
      </p>
      {s.must.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {s.must.map((g) => (
            <li key={g.key} className="text-[11px] leading-4 text-amber-300/90">
              {cap(g.label)} — {g.askCopy}
            </li>
          ))}
        </ul>
      )}
      {s.boost.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {s.boost.map((g) => (
            <li key={g.key} className="text-[11px] leading-4 text-white/50">
              {cap(g.label)}
              {g.askCopy ? ` — ${g.askCopy}` : ""}
            </li>
          ))}
        </ul>
      )}
      {s.nice.length > 0 && (
        <p className="mt-1.5 text-[10px] text-white/30">
          +{s.nice.length} optional (colors, fonts, social links)
        </p>
      )}
    </div>
  );
}
