"use client";
//
// The Back on the Market read. One engine, a buyer/seller toggle. Shows the LOCAL
// contract-cancellation / relist rate (our data) against the national frame (cited),
// then the neutral truth: a returned listing is usually buyer-side, no fault of the
// seller, and often means leverage. NEVER the word "stigmatized"; NEVER a per-home
// reason (this is ZIP-grain context). Every number carries its source + as-of.
//
// Styling: the shared /r/ report family (report-shell.tsx) — Tailwind on the gulf-dark
// canvas, teal section heads. No page-local class names (the old bom-* classes were
// never defined in any stylesheet, so the page rendered unstyled — see fix 07/18/2026).
import { useState } from "react";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import type { RelistFact } from "@/lib/back-on-market/relist-fact";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

export default function BackOnMarketRead({
  data,
  relist,
}: {
  data: BackOnMarketZip;
  /** Lane 2 — the specific home's clean relist event, when an address resolved one.
   *  null/absent → Lane 1 only. It states WHEN the home returned and HOW LONG it was
   *  gone; it NEVER states WHY (the record doesn't say, and neither do we). */
  relist?: RelistFact | null;
}) {
  const [side, setSide] = useState<"buyer" | "seller">("buyer");
  const hasLocal = data.cancellationRatePct != null;
  // seller-stress-swfl's asOf is a rolling-monthly Redfin figure — a bare day
  // over-states its precision (operator ruling 07/17/2026, format-period.ts).
  const asOfLabel = monthYearLabel(data.asOf) || data.asOf;

  return (
    <section className="mt-8 space-y-5">
      <h2 className="text-xl font-semibold tracking-tight text-gulf-teal">
        {hasLocal
          ? `How often deals fall through in ${data.place}`
          : `Deals falling through in ${data.place}`}
      </h2>

      {hasLocal ? (
        <>
          <p className="text-base leading-7 text-gray-200">
            About{" "}
            <strong className="font-semibold text-white">{pct(data.cancellationRatePct)}</strong> of
            pending deals in {data.place} fall out of contract.
          </p>
          <p className="text-sm leading-6 text-gray-400">
            Relists <span className="text-gray-200">{pct(data.relistRatePct)}</span> · delistings{" "}
            <span className="text-gray-200">{pct(data.delistRatePct)}</span> — as of {asOfLabel}.
          </p>
        </>
      ) : (
        <p className="text-base leading-7 text-gray-300">
          We don&rsquo;t hold a fall-through rate for {data.place} right now — but the read below
          still holds.
        </p>
      )}

      {relist && (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-gray-200">
          This home came{" "}
          <strong className="font-semibold text-white">back on the market {relist.date}</strong>{" "}
          after {relist.daysOffMarket} days off-market — the record doesn&rsquo;t state why.
        </p>
      )}

      <div className="flex gap-2 pt-1" role="tablist" aria-label="Point of view">
        <button
          type="button"
          role="tab"
          aria-selected={side === "buyer"}
          className={`filter-pill${side === "buyer" ? " active" : ""}`}
          onClick={() => setSide("buyer")}
        >
          Buying
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === "seller"}
          className={`filter-pill${side === "seller" ? " active" : ""}`}
          onClick={() => setSide("seller")}
        >
          Selling
        </button>
      </div>

      <p className="max-w-2xl text-sm leading-7 text-gray-300">
        A home back on the market has usually fallen out of contract for buyer-side reasons —
        financing, cold feet, an appraisal or inspection gap, and in Southwest Florida often
        insurance — <strong className="font-semibold text-white">no fault of the seller</strong>.
        Nationally {NATIONAL_FALLTHROUGH.ratePct}% of deals fall through (
        {NATIONAL_FALLTHROUGH.note}; {NATIONAL_FALLTHROUGH.leaders}), so a return to market is
        common, not a red flag.
      </p>

      <p className="max-w-2xl text-sm leading-7 text-gray-400">
        {side === "buyer"
          ? "For a buyer: a returned listing is often leverage, not damaged goods, and the deal history is public. What it does not tell you is why this specific contract ended; the record does not say, and neither will we."
          : "For a seller: a relist is common here — the numbers above are the context to hand a buyer up front. Leverage cuts both ways; the story is the market, not your home."}
      </p>

      <details className="text-sm text-gray-500">
        <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
          Where these numbers come from
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Local rates: SWFL Data Gulf, from {data.source.label} — as of {asOfLabel}.
          </li>
          <li>
            National: {NATIONAL_FALLTHROUGH.source.label}, as of {NATIONAL_FALLTHROUGH.asOf} —{" "}
            {NATIONAL_FALLTHROUGH.source.url}.
          </li>
        </ul>
      </details>
    </section>
  );
}
