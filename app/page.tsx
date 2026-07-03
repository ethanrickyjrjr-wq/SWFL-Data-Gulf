import type { Metadata } from "next";
import Hero from "@/components/landing/Hero";
import ProofStrip, { type ProofItem } from "@/components/landing/ProofStrip";
import Capabilities from "@/components/landing/Capabilities";
import DeliverableShowcase, {
  type ShowcaseFigures,
} from "@/components/landing/DeliverableShowcase";
import PricingStrip from "@/components/landing/PricingStrip";
import WeeklyReadCapture from "@/components/landing/WeeklyReadCapture";
import ObjectionFaq from "@/components/landing/ObjectionFaq";
import { loadHomeMapData } from "@/lib/landing/load-home-map-data";
import "@/components/landing/home-explorer.css";

export const metadata: Metadata = {
  title: "SWFL Data Gulf — Southwest Florida market intelligence, cited to the source",
  description:
    "Ask about any Southwest Florida ZIP, address, or corridor and get an answer with every number sourced — home values, flood risk, listings, market direction. Build branded client reports that send themselves. Free to build, no credit card.",
};

// Lane B Phase 1 (spec: docs/superpowers/specs/2026-07-03-homepage-rebuild-design.md).
// Server component: the hero map + stats render from live lake rows loaded here
// (hourly revalidate; per-metric fixture fallback keeps the page alive when the
// lake isn't reachable). Section order per spec: hero → proof → personas →
// showcase → pricing → weekly-read capture → FAQ → repeat CTA.
// Parked (files kept, not imported): Waitlist (replaced by WeeklyReadCapture),
// ComparisonSection, MCPInstall, Charts.
export const revalidate = 3600;

export default async function Home() {
  const payload = await loadHomeMapData();
  const { data, anySample } = payload;

  const proofItems: ProofItem[] = anySample
    ? []
    : [
        { name: "Zillow ZHVI", asOf: data.metrics.value?.asOf },
        { name: "SWFL Data Gulf listings", asOf: data.metrics.activity?.asOf },
        { name: "FEMA NFIP", asOf: data.metrics.flood?.asOf },
        { name: "U.S. Census TIGER" },
      ];

  // Showcase preview figures: the highest-value mapped ZIP, live rows only.
  let showcase: ShowcaseFigures | null = null;
  const valueMetric = data.metrics.value;
  if (valueMetric && !valueMetric.sample) {
    const top = Object.entries(valueMetric.data).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [zip, val] = top;
      const usd = (n: number) =>
        n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}K`;
      const listings = data.metrics.activity?.sample ? undefined : data.metrics.activity?.data[zip];
      const flood = data.metrics.flood?.sample ? undefined : data.metrics.flood?.data[zip];
      showcase = {
        zip,
        place: data.placeNames[zip] ?? zip,
        value: usd(val),
        listings: listings !== undefined ? listings.toLocaleString("en-US") : undefined,
        flood:
          flood !== undefined
            ? flood >= 1_000_000
              ? `$${(flood / 1_000_000).toFixed(1)}M`
              : `$${Math.round(flood / 1000)}K`
            : undefined,
        asOf: valueMetric.asOf,
      };
    }
  }

  return (
    <main className="home-explorer relative">
      <Hero payload={payload} />
      <ProofStrip items={proofItems} zipCount={Object.keys(data.placeNames).length} />
      <Capabilities />
      <DeliverableShowcase figures={showcase} />
      <PricingStrip />
      <WeeklyReadCapture />
      <ObjectionFaq />
      <section className="final-cta">
        <h2 className="final-cta-headline">Every number sourced. Every send automatic.</h2>
        <div className="cap-cta-row">
          <a className="cap-btn" href="/email-lab">
            Build one free
          </a>
          <p>
            or{" "}
            <a className="final-cta-ask" href="/ask">
              ask the data a question
            </a>{" "}
            — no account needed.
          </p>
        </div>
      </section>
    </main>
  );
}
