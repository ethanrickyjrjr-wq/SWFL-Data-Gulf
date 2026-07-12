import type { Metadata } from "next";
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import HeroBar from "@/components/landing/HeroBar";
import Hero from "@/components/landing/Hero";
import SiteDoors from "@/components/landing/SiteDoors";
import GuidesStrip from "@/components/landing/GuidesStrip";
import PricingStrip from "@/components/landing/PricingStrip";
import ObjectionFaq from "@/components/landing/ObjectionFaq";
import { loadHomeMapData } from "@/lib/landing/load-home-map-data";
import "@/components/landing/home-explorer.css";

export const metadata: Metadata = {
  title: "SWFL Data Gulf — Campaigns, market reports, and answers from live SWFL data",
  description:
    "Type a place. Get a ready-to-send listing campaign, the full market report, or a cited answer — built from live Southwest Florida data, every number named to its source. Free to build, no credit card.",
};

// One-bar spine (spec docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md,
// operator-approved 07/12/2026): ONE input on the whole page (HeroBar — three
// labeled modes wired to existing tools), the map as the trust section (its own
// search bar deleted), two doors, the Guides cards restored. No demos, no
// decorative controls — every element works or is honestly a link.
export const revalidate = 3600;

export default async function Home() {
  const payload = await loadHomeMapData();

  return (
    <main className="home-explorer relative">
      <HeroBar />
      <Hero payload={payload} />
      <SiteDoors />
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
