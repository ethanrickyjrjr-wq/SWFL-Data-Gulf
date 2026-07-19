// app/r/offer-check/page.tsx
//
// OFFER CHECK — "you got an offer on your house; is it fair?" The consumer-side
// check no product sells (07/17 landscape research: sellers holding live cash
// offers get free-forum shrugs; the data industry sells their stress score to
// everyone EXCEPT them). Free: the seller's own area read, straight off the
// published brains — zero metered calls. Paid ($19 one-time, the SAME pass as
// the Should I Sell spread): live comparable lookup near the address, the
// offer's exact position against recorded sales — sales never blended with
// model estimates, every figure code-computed (lib/offer-check/verdict.ts).
//
// Spend discipline: the comp lookup (metered vendor calls, ≤4 per run) happens
// ONLY behind verifyUnlock — a visitor who never pays never triggers a call.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ReportShell, ReportHeader, ReportFooter, SectionTitle } from "../_components/report-shell";
import MarketSnapshot from "@/components/should-i-sell/MarketSnapshot";
import OfferUnlock from "@/components/offer-check/OfferUnlock";
import { loadMarketSnapshot } from "@/lib/should-i-sell/load-market-snapshot";
import { UNLOCK_COOKIE, verifyUnlock } from "@/lib/billing/report-unlock";
import { SELLER_REPORT } from "@/lib/billing/tiers";
import { compsForAddress, fmtMDY, type CompResult } from "@/lib/assistant/comp-helper";
import { buildOfferPosition, money, parseOffer, parseSqft } from "@/lib/offer-check/verdict";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offer Check — is that offer on your SWFL home fair? | SWFL Data Gulf",
  description:
    "Got an offer on your Southwest Florida home? Before you sign, see where it lands against recent recorded sales of comparable homes near you. Your area's read is free.",
};

interface Params {
  address?: string;
  zip?: string;
  offer?: string;
  sqft?: string;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** ZIP from the explicit field, else the last 5-digit run in the address. */
function resolveZip(zipRaw: string | undefined, address: string): string | null {
  if (zipRaw && /^\d{5}$/.test(zipRaw)) return zipRaw;
  const m = address.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
  return m ? m[1] : null;
}

function InputRow({ params }: { params: Params }) {
  return (
    <form method="GET" className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
      <input
        type="text"
        name="address"
        defaultValue={params.address ?? ""}
        required
        placeholder="Your address — 2006 SW 15th Ave, Cape Coral"
        className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-gulf-teal/60 focus:outline-none sm:col-span-2"
      />
      <input
        type="text"
        name="offer"
        defaultValue={params.offer ?? ""}
        required
        inputMode="numeric"
        placeholder="The offer — $385,000"
        className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-gulf-teal/60 focus:outline-none"
      />
      <input
        type="text"
        name="sqft"
        defaultValue={params.sqft ?? ""}
        inputMode="numeric"
        placeholder="Living sq ft (optional — your figure)"
        className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-gulf-teal/60 focus:outline-none"
      />
      <button
        type="submit"
        className="btn-gradient rounded-lg px-6 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90 sm:col-span-2 sm:justify-self-start"
      >
        Check this offer
      </button>
    </form>
  );
}

function CompRow({
  addressLine,
  city,
  beds,
  baths,
  sqft,
  price,
  priceKind,
  priceDate,
  soldInDays,
}: CompResult["comps"][number]) {
  const spec = [
    beds != null ? `${beds} bd` : null,
    baths != null ? `${baths} ba` : null,
    sqft != null ? `${sqft.toLocaleString("en-US")} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const kindLabel =
    priceKind === "sold" ? "Sold" : priceKind === "estimate" ? "Estimated value" : "Last list";
  const dated = priceDate ? ` ${fmtMDY(new Date(priceDate))}` : "";
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">
          {addressLine}
          <span className="text-gray-400">, {city}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {spec}
          {soldInDays != null ? ` · sold in ${soldInDays} days` : ""}
        </p>
      </div>
      <p className="font-mono text-sm text-white">
        {price != null ? money(price) : "—"}
        <span className="ml-2 text-xs font-sans text-gray-400">
          {kindLabel}
          {dated}
        </span>
      </p>
    </li>
  );
}

async function PaidResult({
  address,
  offer,
  sqft,
}: {
  address: string;
  offer: number;
  sqft: number | null;
}) {
  let result: CompResult;
  try {
    result = await compsForAddress(address);
  } catch {
    result = {
      comps: [],
      asOf: "",
      needs: [
        "The comp lookup is briefly unavailable — reload in a minute; your unlock is not consumed.",
      ],
    };
  }

  if (result.comps.length === 0) {
    return (
      <section className="mt-10">
        <SectionTitle>Your offer check</SectionTitle>
        <div className="mt-4 max-w-2xl rounded-xl border border-white/10 bg-white/[0.04] px-6 py-6">
          {result.needs.map((n) => (
            <p key={n} className="text-sm leading-7 text-gray-300">
              {n}
            </p>
          ))}
        </div>
      </section>
    );
  }

  const pos = buildOfferPosition(result.comps, offer, sqft);
  const s = pos.soldBand;

  return (
    <section className="mt-10">
      <SectionTitle>Where {money(offer)} lands</SectionTitle>

      {s ? (
        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-3">
          <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
            <p className="font-mono text-lg font-semibold text-white">
              {pos.belowSold} of {s.count}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-gray-400">
              recorded sales closed below your offer
            </p>
          </div>
          <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
            <p className="font-mono text-lg font-semibold text-white">
              {money(s.min)} – {money(s.max)}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-gray-400">
              recorded-sale range · median {money(s.median)}
            </p>
          </div>
          <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
            <p className="font-mono text-lg font-semibold text-white">
              {pos.offerPsf != null ? `$${Math.round(pos.offerPsf)}/sqft` : "—"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-gray-400">
              {pos.offerPsf != null
                ? `your offer per your ${sqft?.toLocaleString("en-US")} sqft`
                : "add your sqft above for $/sqft"}
              {pos.soldPsf
                ? ` · sold comps $${Math.round(pos.soldPsf.min)}–$${Math.round(pos.soldPsf.max)}/sqft`
                : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-300">
          No recorded sales came back in this comp set — the rows below are model estimates and a
          position verdict against estimates alone would be an opinion, not a fact. Treat them as
          context only.
        </p>
      )}

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wider text-gray-500">
          The comps · as of {result.asOf}
        </p>
        <ul className="mt-3 max-w-2xl space-y-2">
          {result.comps.map((c) => (
            <CompRow key={`${c.addressLine}-${c.priceDate ?? c.status}`} {...c} />
          ))}
        </ul>
      </div>

      <p className="mt-6 max-w-2xl text-xs leading-6 text-gray-500">
        Comparable data: SWFL Data Gulf · realtor.com. Recorded sales are shown separately from
        model estimates and the two are never averaged together. This is a data read of nearby
        comparables — not an appraisal, and not advice to accept or refuse any offer.
      </p>
    </section>
  );
}

export default async function OfferCheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params: Params = {
    address: first(sp.address)?.trim().slice(0, 200),
    zip: first(sp.zip)?.trim(),
    offer: first(sp.offer),
    sqft: first(sp.sqft),
  };
  const address = params.address ?? "";
  const offer = parseOffer(params.offer);
  const sqft = parseSqft(params.sqft);
  const zip = resolveZip(params.zip, address);

  const unlocked = verifyUnlock((await cookies()).get(UNLOCK_COOKIE)?.value);
  const snapshot = zip ? await loadMarketSnapshot(zip) : null;
  const ready = address.length > 0 && offer != null;

  return (
    <ReportShell width="2xl">
      <ReportHeader title="Offer Check">
        <p className="mt-3 max-w-xl text-base leading-7 text-gray-300">
          You have an offer on your Southwest Florida home. Everyone around the deal has an opinion
          — here is where it lands against recent recorded sales of comparable homes near you, every
          figure cited.
        </p>
        <InputRow params={params} />
        {address && offer == null && params.offer && (
          <p className="mt-3 text-sm text-[#e08158]">
            Couldn&rsquo;t read that offer amount — try digits, like 385000.
          </p>
        )}
      </ReportHeader>

      {snapshot && (
        <section className="mt-10">
          <SectionTitle>Your area right now — free</SectionTitle>
          <div className="mt-4">
            <MarketSnapshot data={snapshot} />
          </div>
        </section>
      )}

      {ready && !unlocked && (
        <OfferUnlock
          zip={zip ?? ""}
          address={address}
          offer={offer}
          sqft={sqft}
          priceUsd={SELLER_REPORT.priceUsd}
        />
      )}

      {ready && unlocked && <PaidResult address={address} offer={offer} sqft={sqft} />}

      <ReportFooter />
    </ReportShell>
  );
}
