import type { Metadata } from "next";
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import Hero from "@/components/landing/Hero";
import HeroCampaign from "@/components/landing/HeroCampaign";
import CampaignReveal from "@/components/landing/CampaignReveal";
import SiteDoors from "@/components/landing/SiteDoors";
import PricingStrip from "@/components/landing/PricingStrip";
import ObjectionFaq from "@/components/landing/ObjectionFaq";
import { buildCampaignDemo } from "@/lib/landing/campaign-demo";
import { loadHomeMapData } from "@/lib/landing/load-home-map-data";
import "@/components/landing/home-explorer.css";

export const metadata: Metadata = {
  title: "SWFL Data Gulf — Your listing's marketing, built and sent for you",
  description:
    "Type your next listing's address and pick a campaign — new listing, just sold, coming to market, or a market update. We build the emails and socials from live Southwest Florida data, every number sourced, and send them on your schedule. Free to build, no credit card.",
};

// v2 spine (spec docs/superpowers/specs/2026-07-12-homepage-one-site-design.md §v2,
// operator-approved 07/11/2026): the homepage's OWN centerpiece — a place goes in, a
// campaign comes out, performed once on screen from the SAME live rows the map draws
// (buildCampaignDemo returns null on sample data → no centerpiece, never demo'd
// fixtures). Nothing borrowed from inner pages (memory
// feedback_homepage-grammar-not-collage): the doors are one-line links, not previews.
// Section order: hero → campaign reveal → doors → map proof → pricing → FAQ → CTA.
// Parked (files kept, not imported): ProofStrip, Capabilities, DeliverableShowcase,
// WeeklyReadCapture, GuidesStrip, Waitlist, ComparisonSection, MCPInstall, Charts.
export const revalidate = 3600;

export default async function Home() {
  const payload = await loadHomeMapData();
  const demo = buildCampaignDemo({
    value: payload.data.metrics.value,
    activity: payload.data.metrics.activity,
    dom: payload.data.metrics.dom,
    placeNames: payload.data.placeNames,
  });

  return (
    <main className="home-explorer relative">
      <HeroCampaign />
      {demo && <CampaignReveal demo={demo} />}
      <SiteDoors />
      <Hero payload={payload} />
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
