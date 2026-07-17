// components/should-i-sell/MarketSnapshot.tsx
//
// Section 2 — the market snapshot for the seller's own area. SERVER component; every
// figure a real server-side number. Each card is an ABSOLUTE sourced figure (no
// ranking). A null value → its card is simply omitted (never guessed). The two halves
// carry their own as-of dates, shown per group.
import type { ReactNode } from "react";
import type { MarketSnapshot } from "@/lib/should-i-sell/load-market-snapshot";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";
import { SectionTitle } from "@/app/r/_components/report-shell";

function Card({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
      <p className="font-mono text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      {sub && <p className="mt-1 text-xs leading-5 text-gray-500">{sub}</p>}
    </div>
  );
}

export default function MarketSnapshot({ data }: { data: MarketSnapshot }) {
  const h = data.housing;
  const m = data.momentum;

  const housingCards: ReactNode[] = [];
  if (h) {
    if (h.monthsOfSupply != null)
      housingCards.push(
        <Card
          key="mos"
          value={`${h.monthsOfSupply.toFixed(1)} mo`}
          label="Months of supply"
          sub={
            h.monthsOfSupply < 3
              ? "under 3 = seller's market"
              : h.monthsOfSupply > 6
                ? "over 6 = buyer's market"
                : "balanced"
          }
        />,
      );
    if (h.medianDom != null)
      housingCards.push(
        <Card key="dom" value={`${Math.round(h.medianDom)} days`} label="Typical days on market" />,
      );
    if (h.saleToListPct != null)
      housingCards.push(
        <Card
          key="stl"
          value={`${h.saleToListPct.toFixed(1)}%`}
          label="Sale-to-list ratio"
          sub={h.saleToListPct >= 100 ? "homes closing at or above ask" : "homes closing below ask"}
        />,
      );
  }

  const momentumCards: ReactNode[] = [];
  if (m && m.priceCutSharePct != null) {
    momentumCards.push(
      <Card
        key="cut"
        value={`${m.priceCutSharePct.toFixed(1)}%`}
        label="Listings with a price cut"
        sub="share of active for-sale homes"
      />,
    );
  }

  if (housingCards.length === 0 && momentumCards.length === 0) return null;

  return (
    <section className="mt-10">
      <SectionTitle>Your market at a glance — {data.place}</SectionTitle>

      {housingCards.length > 0 && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{housingCards}</div>
          {h?.source.asOf && (
            <p className="mt-2 text-xs text-gray-500">
              Sale pace, days on market and sale-to-list — data through{" "}
              {monthYearLabel(h.source.asOf) || h.source.asOf}.
            </p>
          )}
        </>
      )}

      {momentumCards.length > 0 && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{momentumCards}</div>
          {m?.source.asOf && (
            <p className="mt-2 text-xs text-gray-500">Price-cut share — as of {m.source.asOf}.</p>
          )}
        </>
      )}
    </section>
  );
}
