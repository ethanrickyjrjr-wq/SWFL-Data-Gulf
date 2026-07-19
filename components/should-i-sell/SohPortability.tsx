"use client";
// components/should-i-sell/SohPortability.tsx
//
// "Your tax break, and what moving does to it" — the Save-Our-Homes section.
//   • ZIP line: sourced median gap for the area (published county tax-roll table).
//   • Per-parcel (address-gated by the page): the seller's OWN gap, what ports
//     under the $500k statute cap, the 3-year clock, and an [INFERENCE]-tagged
//     cost-of-waiting projection. One optional user input (next-home price) —
//     blank shows the buy-equal-or-up maximum, never an assumed price.
// Every figure: county roll, cited trend, statute constant, or user-entered.
import { useMemo, useState, type ReactNode } from "react";
import {
  SOH_PORT_CAP,
  SOH_PROJECTION_TAG,
  SOH_PROJECTION_BASIS,
  SOH_PROJECTION_FALSIFIER,
  SOH_SOURCES,
  sohBenefit,
  portableAmount,
  portForNextHome,
  projectSoh,
} from "@/lib/should-i-sell/soh-portability";
import type { ZipSohLine } from "@/lib/should-i-sell/load-zip-soh";
import type { ParcelSohRow } from "@/lib/should-i-sell/load-parcel-soh";
import { monthYearLabel } from "@/lib/should-i-sell/format-period";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight text-gulf-teal">{children}</h2>;
}

const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface SohPortabilityProps {
  place: string;
  zipLine: ZipSohLine | null;
  parcel: ParcelSohRow | null;
  yoyFraction: number | null;
  yoyAsOf: string;
}

export default function SohPortability(props: SohPortabilityProps) {
  const { place, zipLine, parcel, yoyFraction, yoyAsOf } = props;
  const [months, setMonths] = useState<6 | 12>(12);
  const [nextPrice, setNextPrice] = useState("");

  const benefit = parcel && parcel.homesteaded ? sohBenefit(parcel.jvHmstd, parcel.avHmstd) : null;
  const nextHomePrice = parseMoney(nextPrice);
  const port = useMemo(() => {
    if (!parcel || !parcel.homesteaded || nextHomePrice == null) return null;
    return portForNextHome({ oldJv: parcel.jvHmstd, oldAv: parcel.avHmstd, nextHomePrice });
  }, [parcel, nextHomePrice]);
  const projection = useMemo(() => {
    if (!parcel || !parcel.homesteaded || yoyFraction == null) return null;
    return projectSoh({ jv: parcel.jvHmstd, av: parcel.avHmstd, yoyFraction, months });
  }, [parcel, yoyFraction, months]);

  if (!zipLine && !parcel) return null;

  return (
    <section className="mt-10">
      <SectionTitle>Your tax break, and what moving does to it</SectionTitle>

      {zipLine && (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-300">
          Homesteaded owners in {place} typically have{" "}
          <span className="font-mono text-white">{zipLine.sohGapMedianPct.toFixed(1)}%</span> of
          their homestead&rsquo;s market value shielded from taxable assessment by Florida&rsquo;s
          Save Our Homes cap
          {zipLine.homesteadedCount != null
            ? ` (across ${fmtInt(zipLine.homesteadedCount)} homesteaded parcels)`
            : ""}
          {zipLine.source.asOf ? `, as of ${zipLine.source.asOf}` : ""}. That shield does not
          transfer with a sale — a buyer restarts at market value the following January 1. What can
          move is yours: sell, and up to {usd(SOH_PORT_CAP)} of that gap can port to your next
          Florida homestead.
        </p>
      )}

      {parcel && !parcel.homesteaded && (
        <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-400">
          The county roll shows no homestead on this parcel, so Save Our Homes portability
          doesn&rsquo;t apply to it. Recently bought or filed? The roll lags — check with the county
          property appraiser.
        </p>
      )}

      {parcel && parcel.homesteaded && benefit != null && (
        <div className="mt-5 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
          <p className="text-sm text-gray-300">
            Your Save Our Homes gap today:{" "}
            <span className="font-mono text-lg font-bold text-white">{usd(benefit)}</span>{" "}
            <span className="text-gray-500">
              — homestead market value {usd(parcel.jvHmstd)} minus assessed {usd(parcel.avHmstd)}
              {parcel.assessmentYear != null ? ` (county roll, ${parcel.assessmentYear})` : ""}.
            </span>
          </p>

          <p className="mt-3 text-sm text-gray-300">
            If you sell and buy at or above {usd(parcel.jvHmstd)}, up to{" "}
            <span className="font-mono text-white">{usd(portableAmount(benefit))}</span> ports to
            your next Florida homestead
            {benefit > SOH_PORT_CAP ? (
              <span className="text-[#e08158]">
                {" "}
                — {usd(benefit - SOH_PORT_CAP)} of your gap is above the {usd(SOH_PORT_CAP)} cap and
                does not transfer
              </span>
            ) : (
              ""
            )}
            . Buy for less and the ported share shrinks proportionally.
          </p>

          <div className="mt-3 max-w-xs">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Price of the home you&rsquo;d buy next (optional)
            </span>
            <input
              inputMode="decimal"
              value={nextPrice}
              placeholder="e.g. 550,000"
              onChange={(e) => setNextPrice(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
            />
          </div>
          {port && nextHomePrice != null && (
            <p className="mt-3 text-sm text-gray-300">
              At {usd(nextHomePrice)}:{" "}
              <span className="font-mono text-white">{usd(port.portedReduction)}</span> ports
              {port.downsized ? " (downsizing is proportional)" : ""}, so your next home starts
              assessed at <span className="font-mono text-white">{usd(port.newAssessed)}</span>{" "}
              instead of {usd(nextHomePrice)}.
            </p>
          )}

          <p className="mt-3 text-xs leading-5 text-gray-500">
            The clock: establish your next Florida homestead within 3 years of January 1 of the year
            you leave this one, and file the transfer form (DR-501T) with your homestead application
            by March 1 — miss it and the ported amount is $0. Sources:{" "}
            <a
              href={SOH_SOURCES.dorGuide.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-300"
            >
              {SOH_SOURCES.dorGuide.label}
            </a>
            {" · "}
            <a
              href={SOH_SOURCES.statute.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-300"
            >
              {SOH_SOURCES.statute.label}
            </a>
            .
          </p>
        </div>
      )}

      {parcel && parcel.homesteaded && projection && (
        <div className="mt-4 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
          <div className="inline-flex overflow-hidden rounded-lg border border-white/10">
            {[6, 12].map((mo) => (
              <button
                key={mo}
                type="button"
                onClick={() => setMonths(mo as 6 | 12)}
                className={`px-4 py-1.5 text-sm ${
                  months === mo ? "bg-gulf-teal/20 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {mo} months
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            <span className="font-mono text-gulf-teal">{SOH_PROJECTION_TAG}</span>{" "}
            {SOH_PROJECTION_BASIS} {SOH_PROJECTION_FALSIFIER}
            {yoyAsOf ? ` (trend through ${monthYearLabel(yoyAsOf) || yoyAsOf}.)` : ""}
          </p>
          <p className="mt-2 text-sm text-gray-300">
            Waiting {months} months, your gap is projected at{" "}
            <span className="font-mono text-white">{usd(projection.projectedBenefit)}</span>, of
            which <span className="font-mono text-white">{usd(projection.projectedPortable)}</span>{" "}
            could port.
            {projection.excessOverCap > 0 && (
              <span className="text-[#e08158]">
                {" "}
                {usd(projection.excessOverCap)} would sit above the cap, unportable.
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
