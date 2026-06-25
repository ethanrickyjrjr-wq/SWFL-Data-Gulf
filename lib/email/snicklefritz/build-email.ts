// lib/email/snicklefritz/build-email.ts
//
// Deterministic EmailDoc builder for the SNICKLEFRITZ preview send. It brand-injects
// the scraped colors + favicon logo + company, surfaces the real agent NAME, and
// fills ONLY real, cited market figures (no-invention — every number is passed in
// from a sourced MarketData; nothing is generated here). Pure: no I/O, no AI.
//
// This is the fast, safe first path to a visible branded email. The richer AI route
// (forced-tool template pick + structured fill from the live data-context) supersedes
// the fill later; the brand-inject + no-number-invention discipline carries over.

import { mintBlockId } from "../doc/schema";
import type { EmailBlock, EmailDoc, EmailGlobalStyle } from "../doc/types";
import type { ProspectFolder } from "./targets";

/** A real, cited figure. `source` is the publisher; it rides in the email's source line. */
export interface MarketFigure {
  value: string; // pre-formatted: "$399,000", "11,347", "87 days", "6.47%"
  label: string;
  source: string; // e.g. "realtor.com (May 2026)"
}

export interface MarketData {
  asOf: string; // human as-of, e.g. "May 2026"
  headline: MarketFigure; // hero number (median list price)
  stats: MarketFigure[]; // 2-3 KPI cells (all real)
  ctaUrl: string;
  ctaLabel: string;
}

/** SWFL house brand — used only when a scrape failed (status !== "scraped"). */
const HOUSE = {
  primary: "#0f1d24",
  accent: "#3DC9C0",
  text: "#242424",
  backdrop: "#F8F8F8",
} as const;

function uniqueSources(figs: MarketFigure[]): string[] {
  return [...new Set(figs.map((f) => f.source))];
}

/** Build the branded, real-data EmailDoc for one prospect. */
export function buildEmailDoc(folder: ProspectFolder, data: MarketData, logoUrl: string): EmailDoc {
  const b = folder.brand;
  const scraped = b.status === "scraped";
  const primary = scraped && b.primary ? b.primary : HOUSE.primary;
  const accent = scraped && b.secondary ? b.secondary : HOUSE.accent;
  const company = (b.company_name && b.company_name.trim()) || folder.company;
  const city = folder.market.city;
  const title = (folder.contacts?.title as string) || "Realtor®";
  const address = (folder.contacts?.office_address as string) || `${city}, FL ${folder.market.zip}`;
  const sources = uniqueSources([data.headline, ...data.stats]);

  const globalStyle: EmailGlobalStyle = {
    primaryColor: primary,
    accentColor: accent,
    fontFamily: "MODERN_SANS",
    textColor: HOUSE.text,
    backdropColor: HOUSE.backdrop,
  };

  // Every text/number below is real: identity from the folder, figures from MarketData
  // (sourced). No KPI is fabricated — unfilled cells simply aren't emitted.
  const blocks: EmailBlock[] = [
    {
      id: mintBlockId(),
      type: "header",
      props: { companyName: company, logoUrl, bgColor: primary },
    },
    {
      id: mintBlockId(),
      type: "hero",
      props: {
        kicker: `${city}, FL · Market Snapshot`,
        value: data.headline.value,
        label: data.headline.label,
        prose: `A quick, data-backed read on the ${city}-area market — prepared for you by ${folder.name}.`,
      },
    },
    {
      id: mintBlockId(),
      type: "stats",
      props: { stats: data.stats.map((s) => ({ value: s.value, label: s.label })) },
    },
    {
      id: mintBlockId(),
      type: "agent-card",
      props: {
        name: folder.name,
        title: `${title} · ${company}`,
        bio: `Your ${city}-area real estate contact. Questions on these numbers? Reach out anytime.`,
        ctaUrl: data.ctaUrl,
        ctaLabel: data.ctaLabel,
      },
    },
    { id: mintBlockId(), type: "button", props: { label: data.ctaLabel, url: data.ctaUrl } },
    {
      id: mintBlockId(),
      type: "text",
      props: {
        body: `Sources: ${sources.join(" · ")}. Figures as of ${data.asOf}. Delivered by SWFL Data Gulf.`,
        align: "center",
      },
    },
    {
      id: mintBlockId(),
      type: "footer",
      props: {
        companyName: company,
        address,
        websiteUrl: "https://www.swfldatagulf.com",
        unsubscribeUrl: "https://www.swfldatagulf.com/unsubscribe?token=preview",
      },
    },
  ];

  return { globalStyle, blocks };
}
