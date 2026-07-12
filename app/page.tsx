import type { Metadata } from "next";
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import Hero from "@/components/landing/Hero";
import HeroCampaign from "@/components/landing/HeroCampaign";
import GuidesStrip from "@/components/landing/GuidesStrip";
import PricingStrip from "@/components/landing/PricingStrip";
import ObjectionFaq from "@/components/landing/ObjectionFaq";
import { loadHomeMapData } from "@/lib/landing/load-home-map-data";
import "@/components/landing/home-explorer.css";

export const metadata: Metadata = {
  title: "SWFL Data Gulf — Your listing's marketing, built and sent for you",
  description:
    "Type your next listing's address and pick a campaign — new listing, just sold, coming to market, or a market update. We build the emails and socials from live Southwest Florida data, every number sourced, and send them on your schedule. Free to build, no credit card.",
};

// INTERIM state (operator review 07/11/2026, spec
// docs/superpowers/specs/2026-07-12-homepage-one-site-design.md §Post-review):
// the v1 "one-site" middle transplanted inner-page devices (Insiders wire ticker,
// desk-tile door, Insiders capture band) — rejected as collage. Stripped here;
// what SURVIVED review lives outside this file: one nav bar sitewide + real CTAs
// (SiteShell), FAQ scope fix, Ask AI pill rename + no auto-open on `/`. The
// homepage's OWN centerpiece (address → campaign transformation) ships as v2
// after operator sign-off. Parked (files kept, not imported): ProofStrip,
// Capabilities, DeliverableShowcase, WeeklyReadCapture, Waitlist,
// ComparisonSection, MCPInstall, Charts.
export const revalidate = 3600;

export default async function Home() {
  const payload = await loadHomeMapData();

  return (
    <main className="home-explorer relative">
      <HeroCampaign />
      <Hero payload={payload} />
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
