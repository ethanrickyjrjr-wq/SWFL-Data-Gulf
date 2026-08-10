import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
  title: "SWFL Data Gulf — Real estate emails built from live, cited SWFL data",
  description:
    "Emails your competition can't send: type an address and get a ready-to-send campaign built from live Southwest Florida data the MLS doesn't carry — every number named to its source. Free to build, no credit card.",
};

// One-bar spine (spec docs/superpowers/specs/2026-07-12-homepage-one-bar-design.md,
// operator-approved 07/12/2026), EVOLVED 08/10/2026 by operator decree: the page
// leads with the PRODUCT (email captures + stick-out headline) because the
// input-first hero read as a search site. Still ONE input (HeroBar), the map keeps
// its designed trust-section role but rides below the product beats. No demos, no
// decorative controls — every element works or is honestly a link.
export const revalidate = 3600;

export default async function Home() {
  const payload = await loadHomeMapData();

  return (
    <main className="home-explorer relative">
      <HeroBar />
      <section className="email-proof" aria-label="Real emails built by the engine">
        <div className="email-proof-row">
          {[
            { img: "/showcase/seed-previews/new-listing.webp", label: "New Listing" },
            { img: "/showcase/seed-previews/just-sold.webp", label: "Just Sold" },
            { img: "/showcase/seed-previews/weekly-pulse.webp", label: "Weekly Pulse" },
          ].map((p) => (
            <Link key={p.label} href="/showcase" className="email-proof-card">
              <Image
                src={p.img}
                alt={`${p.label} email built by the engine from live SWFL data`}
                width={440}
                height={560}
              />
              <span className="email-proof-label">{p.label}</span>
            </Link>
          ))}
        </div>
        <p className="email-proof-hint">
          <Link href="/showcase">Real sends, real data — see every email we build →</Link>
        </p>
      </section>
      <SiteDoors />
      <GuidesStrip />
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
