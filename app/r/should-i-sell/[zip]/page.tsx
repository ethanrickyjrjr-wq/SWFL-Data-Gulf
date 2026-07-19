// app/r/should-i-sell/[zip]/page.tsx
//
// The Should I Sell read permalink: /r/should-i-sell/<zip>[?address=…].
//   • Section 1 (seller-stress facing read) + Section 2 (market snapshot) render for any
//     in-scope ZIP — zero new data, real server-side numbers (crawler-honest).
//   • Section 3 (sell-now-vs-wait spread) is ADDRESS-gated: it renders only once the
//     seller adds their address (a plain GET form), which resolves a V0 estimate off the
//     comp helper. Every figure sourced, [INFERENCE]-tagged, or user-entered — never invented.
// Report-family chrome, reused not reinvented. Public, indexable.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { resolveZip } from "../../../../refinery/lib/zip-resolver.mts";
import { cityForZip } from "@/lib/swfl-zip-city";
import { nearestZips } from "@/lib/geo/nearest-zips";
import { loadSellerStressRead } from "@/lib/should-i-sell/load-stress-read";
import { condoShareForZip } from "@/lib/should-i-sell/condo-share";
import { loadMarketSnapshot, loadZipYoyFraction } from "@/lib/should-i-sell/load-market-snapshot";
import { compsForAddress } from "@/lib/assistant/comp-helper";
import { deriveV0FromComps } from "@/lib/should-i-sell/derive-v0";
import { fetchPropertyTaxAnnual } from "@/lib/should-i-sell/property-tax";
import { loadZipSoh } from "@/lib/should-i-sell/load-zip-soh";
import { loadParcelSoh, type ParcelSohRow } from "@/lib/should-i-sell/load-parcel-soh";
import { SOH_SOURCES } from "@/lib/should-i-sell/soh-portability";
import { verifyUnlock, UNLOCK_COOKIE } from "@/lib/billing/report-unlock";
import { SELLER_REPORT } from "@/lib/billing/tiers";
import UnlockSpread from "@/components/should-i-sell/UnlockSpread";
import SellerStressRead from "@/components/should-i-sell/SellerStressRead";
import MarketSnapshot from "@/components/should-i-sell/MarketSnapshot";
import SellNowVsWait from "@/components/should-i-sell/SellNowVsWait";
import SohPortability from "@/components/should-i-sell/SohPortability";
import {
  ReportShell,
  ReportHeader,
  ReportFooter,
  SectionTitle,
  Meta,
} from "../../_components/report-shell";
import { OutOfScopePanel } from "../../_components/location-ui";
import { CitationList, type SourceEntry } from "@/components/CitationList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ZIP = /^\d{5}$/;

// County Tax Collector bill-lookup portals (URLs verified in-session 07/19/2026).
// No fetchable per-parcel bill exists (see lib/should-i-sell/property-tax.ts STATUS) —
// the user looks up their real bill and types it in; we never estimate one.
const TAX_LOOKUP: Record<string, { label: string; url: string }> = {
  Lee: { label: "Lee County Tax Collector", url: "https://county-taxes.net/fl-lee/property-tax" },
  Collier: {
    label: "Collier County Tax Collector",
    url: "https://collier.county-taxes.com/public",
  },
};

interface PageProps {
  params: Promise<{ zip: string }>;
  searchParams: Promise<{ address?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { zip } = await params;
  const place = cityForZip(zip) ?? `ZIP ${zip}`;
  return {
    title: `Should I sell in ${place}? — SWFL Data Gulf`,
    description: `A seller's honest read for ${place}: your area's stress level, the market snapshot, and what waiting 6–12 months could cost or gain you.`,
  };
}

export default async function ShouldISellPage({ params, searchParams }: PageProps) {
  const { zip } = await params;
  if (!VALID_ZIP.test(zip)) notFound();
  const { address } = await searchParams;

  const res = resolveZip(zip);
  if (!res.in_scope) {
    return (
      <ReportShell width="2xl">
        <ReportHeader title="Should I Sell?" />
        <OutOfScopePanel query={zip} />
        <ReportFooter />
      </ReportShell>
    );
  }

  const place = cityForZip(zip) ?? `ZIP ${zip}`;
  // Concrete number under the always-shown condo caveat — sourced parcel share, or null
  // outside the Lee/Collier footprint (line omits, never invents). Synchronous fixture read.
  const condoShare = condoShareForZip(zip);

  const [stress, snapshot, zipSoh] = await Promise.all([
    loadSellerStressRead(zip, { place }),
    loadMarketSnapshot(zip, { place }),
    loadZipSoh(zip, res.county_names),
  ]);

  // ── Section 3 (address- AND payment-gated) ────────────────────────────────
  // Unpaid + address → lock panel only: no comp lookup, no vendor spend.
  const addr = (address ?? "").trim();
  const unlocked = verifyUnlock((await cookies()).get(UNLOCK_COOKIE)?.value);
  let spread: ReactNode = null;
  let parcelSoh: ParcelSohRow | null = null;
  let yoyFraction: number | null = null;
  const compSources: SourceEntry[] = [];
  if (addr && unlocked) {
    const [comps, yoy, parcel] = await Promise.all([
      compsForAddress(addr),
      loadZipYoyFraction(zip),
      loadParcelSoh(zip, addr, res.county_names),
    ]);
    yoyFraction = yoy;
    parcelSoh = parcel;
    const v0Estimate = deriveV0FromComps(comps);
    // Named-source, cited, re-fetched county tax (stubbed until a confirmed live
    // per-parcel endpoint lands — returns null, never an invented number).
    const tax = await fetchPropertyTaxAnnual({ address: addr, zip, countyFips: "" });
    if (v0Estimate || comps.needs.length > 0 || comps.comps.length > 0) {
      spread = (
        <SellNowVsWait
          place={place}
          v0Estimate={v0Estimate}
          yoyFraction={yoyFraction}
          yoyAsOf={snapshot?.housing?.source.asOf ?? stress?.dataThrough ?? ""}
          defaultTaxAnnual={tax?.annual ?? null}
          taxSource={tax?.source ?? null}
          taxLookup={TAX_LOOKUP[res.county_names[0] ?? ""] ?? null}
        />
      );
      if (v0Estimate) {
        compSources.push({ label: "SWFL Data Gulf", url: "https://www.swfldatagulf.com" });
        compSources.push({ label: "realtor.com", url: "https://www.realtor.com" });
      }
    }
  }

  // ── Citations ─────────────────────────────────────────────────────────────
  const sources: SourceEntry[] = [];
  if (stress?.source.url) sources.push({ label: stress.source.label, url: stress.source.url });
  if (snapshot?.housing?.source.url)
    sources.push({ label: snapshot.housing.source.label, url: snapshot.housing.source.url });
  if (snapshot?.momentum?.source.url)
    sources.push({ label: snapshot.momentum.source.label, url: snapshot.momentum.source.url });
  if (zipSoh) sources.push({ label: zipSoh.source.label, url: zipSoh.source.url });
  if (parcelSoh?.homesteaded) {
    sources.push({ label: SOH_SOURCES.dorGuide.label, url: SOH_SOURCES.dorGuide.url });
    sources.push({ label: SOH_SOURCES.statute.label, url: SOH_SOURCES.statute.url });
  }
  sources.push(...compSources);

  const nothing = !stress && !snapshot;

  return (
    <ReportShell>
      <ReportHeader title={`Should I sell in ${place}?`}>
        <p className="mt-3 max-w-3xl text-base leading-7 text-gray-300">
          The seller&rsquo;s honest read for {place}: where your area stands, what the market is
          doing, and what waiting could cost or gain you. Every number names its source; nothing is
          invented.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Meta label="Area" value={`${place} · ${zip}`} />
          {res.county_names[0] && <Meta label="County" value={`${res.county_names[0]} County`} />}
        </dl>
      </ReportHeader>

      {nothing ? (
        <p className="mt-8 text-sm text-gray-400">
          We don&rsquo;t hold a seller read for {place} right now. Try a nearby Lee or Collier ZIP.
        </p>
      ) : (
        <>
          {stress && (
            <SellerStressRead
              data={stress}
              condoShare={condoShare}
              nearby={
                stress.scored
                  ? []
                  : nearestZips(zip, 5).map((n) => ({ zip: n.zip, place: n.place }))
              }
            />
          )}
          {snapshot && <MarketSnapshot data={snapshot} />}

          {/* ── Save Our Homes: ZIP line always; per-parcel calc address-gated ── */}
          <SohPortability
            place={place}
            zipLine={zipSoh}
            parcel={parcelSoh}
            yoyFraction={yoyFraction}
            yoyAsOf={snapshot?.housing?.source.asOf ?? stress?.dataThrough ?? ""}
          />

          {/* ── Section 3: address-gated spread; unpaid address → unlock panel ── */}
          {addr && !unlocked ? (
            <UnlockSpread zip={zip} address={addr} priceUsd={SELLER_REPORT.priceUsd} />
          ) : (
            (spread ?? (
              <section className="mt-10">
                <SectionTitle>What waiting 6–12 months could cost or gain you</SectionTitle>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-400">
                  Add your address and we&rsquo;ll estimate your home&rsquo;s value from nearby
                  sales, then lay out — line by line — what holding it 6 or 12 months could cost or
                  gain, using {place}&rsquo;s own price trend. Your insurance is the one figure we
                  never guess.
                </p>
                <form method="get" className="mt-4 flex max-w-xl flex-wrap gap-2">
                  <input
                    type="text"
                    name="address"
                    defaultValue={addr}
                    placeholder="Your full street address, Lee or Collier County"
                    aria-label="Your property address"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
                  />
                  <button
                    type="submit"
                    className="btn-gradient inline-flex shrink-0 items-center rounded-lg px-5 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90"
                  >
                    Run my spread
                  </button>
                </form>
                {addr && (
                  <p className="mt-3 text-sm text-[#e08158]">
                    We couldn&rsquo;t pull nearby sales for that address yet — check it&rsquo;s a
                    full Lee or Collier County street address, or enter your own value once it
                    resolves.
                  </p>
                )}
              </section>
            ))
          )}
        </>
      )}

      <div className="mt-10">
        <CitationList sources={sources} />
      </div>

      <ReportFooter freshnessToken={stress?.lastChecked ?? undefined} />
    </ReportShell>
  );
}
