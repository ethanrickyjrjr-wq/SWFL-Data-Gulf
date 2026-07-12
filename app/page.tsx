import type { Metadata } from "next";
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import Hero from "@/components/landing/Hero";
import HeroCampaign from "@/components/landing/HeroCampaign";
import ProductDoors from "@/components/landing/ProductDoors";
import InsidersBand from "@/components/landing/InsidersBand";
import GuidesStrip from "@/components/landing/GuidesStrip";
import PricingStrip from "@/components/landing/PricingStrip";
import ObjectionFaq from "@/components/landing/ObjectionFaq";
import { WireTicker } from "@/app/insiders/_components/wire-ticker";
import { loadDeskStats } from "@/app/insiders/_lib/desk-stats";
import { loadMetroTrend } from "@/lib/charts/load-metro-trend";
import { buildHomeWire } from "@/lib/landing/home-wire";
import { loadHomeMapData } from "@/lib/landing/load-home-map-data";
import "@/components/landing/home-explorer.css";
import "@/app/insiders/insiders.css";

export const metadata: Metadata = {
  title: "SWFL Data Gulf — Your listing's marketing, built and sent for you",
  description:
    "Type your next listing's address and pick a campaign — new listing, just sold, coming to market, or a market update. We build the emails and socials from live Southwest Florida data, every number sourced, and send them on your schedule. Free to build, no credit card.",
};

// One-site spine (spec: docs/superpowers/specs/2026-07-12-homepage-one-site-design.md).
// Server component: the wire + doors + map render from live lake rows loaded here
// (hourly revalidate; each loader is empty-tolerant, so a degraded lake hides items
// instead of inventing them). Section order: hero → live wire → map proof → two doors
// (data / deliverables) → Insiders capture → guides → pricing → FAQ → repeat CTA.
// Parked (files kept, not imported): ProofStrip + Capabilities + DeliverableShowcase +
// WeeklyReadCapture (this page's capture is the Insiders band — operator pick
// 07/12/2026), plus the older Waitlist, ComparisonSection, MCPInstall, Charts.
export const revalidate = 3600;

export default async function Home() {
  const [payload, desk, zhvi, zori] = await Promise.all([
    loadHomeMapData(),
    loadDeskStats(),
    loadMetroTrend("zhvi_pivoted"),
    loadMetroTrend("zori_pivoted"),
  ]);

  // The wire carries the metro indices + news desk; the data door carries the desk
  // headline stats — deliberately disjoint sets (see lib/landing/home-wire.ts).
  const wire = buildHomeWire({ desk, zhvi, zori });

  return (
    <main className="home-explorer relative">
      <HeroCampaign />
      <WireTicker items={wire.items} note={wire.note} />
      <Hero payload={payload} />
      <ProductDoors stats={payload.stats} />
      <InsidersBand />
      <GuidesStrip />
      <PricingStrip />
      <ObjectionFaq />
      <section className="final-cta">
        <h2 className="final-cta-headline">Every number sourced. Every send automatic.</h2>
        <div className="cap-cta-row">
          <a className="cap-btn" href={EMAIL_LAB_LANDING}>
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
