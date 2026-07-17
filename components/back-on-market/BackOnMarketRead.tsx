"use client";
//
// The Back on the Market read. One engine, a buyer/seller toggle. Shows the LOCAL
// contract-cancellation / relist rate (our data) against the national frame (cited),
// then the neutral truth: a returned listing is usually buyer-side, no fault of the
// seller, and often means leverage. NEVER the word "stigmatized"; NEVER a per-home
// reason (this is ZIP-grain context). Every number carries its source + as-of.
import { useState } from "react";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import type { RelistFact } from "@/lib/back-on-market/relist-fact";

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

  return (
    <section className="bom-read">
      <div className="bom-toggle" role="tablist" aria-label="Point of view">
        <button
          role="tab"
          aria-selected={side === "buyer"}
          className={`filter-pill${side === "buyer" ? " active" : ""}`}
          onClick={() => setSide("buyer")}
        >
          Buying
        </button>
        <button
          role="tab"
          aria-selected={side === "seller"}
          className={`filter-pill${side === "seller" ? " active" : ""}`}
          onClick={() => setSide("seller")}
        >
          Selling
        </button>
      </div>

      <h1 className="bom-hero">
        {hasLocal ? (
          <>
            About <strong>{pct(data.cancellationRatePct)}</strong> of pending deals in {data.place}{" "}
            fall out of contract
          </>
        ) : (
          <>How often deals fall through in {data.place}</>
        )}
      </h1>
      {hasLocal && (
        <p className="bom-sub">
          Relists {pct(data.relistRatePct)} · delistings {pct(data.delistRatePct)} — as of{" "}
          {data.asOf}.
        </p>
      )}

      {relist && (
        <p className="bom-relist">
          This home came <strong>back on the market {relist.date}</strong> after{" "}
          {relist.daysOffMarket} days off-market — the record doesn&rsquo;t state why.
        </p>
      )}

      <p className="bom-truth">
        A home back on the market has usually fallen out of contract for buyer-side reasons —
        financing, cold feet, an appraisal or inspection gap, and in Southwest Florida often
        insurance — <strong>no fault of the seller</strong>. Nationally{" "}
        {NATIONAL_FALLTHROUGH.ratePct}% of deals fall through ({NATIONAL_FALLTHROUGH.note};{" "}
        {NATIONAL_FALLTHROUGH.leaders}), so a return to market is common, not a red flag.
      </p>

      <p className="bom-side">
        {side === "buyer"
          ? "For a buyer: a returned listing is often leverage, not damaged goods, and the deal history is public. What it does not tell you is why this specific contract ended; the record does not say, and neither will we."
          : "For a seller: a relist is common here — the numbers above are the context to hand a buyer up front. Leverage cuts both ways; the story is the market, not your home."}
      </p>

      <details className="bom-sources">
        <summary>Where these numbers come from</summary>
        <ul>
          <li>
            Local rates: SWFL Data Gulf, from {data.source.label} — as of {data.asOf}.
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
