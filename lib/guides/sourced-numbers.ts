import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import type { GuideDef } from "./types";

/**
 * Guide 1 — the sourcing methodology in plain English (spec §5, strand 1).
 * Figure provenance is copied verbatim from
 * public/showcase/seed-previews/assets/README.md — change a figure, re-copy
 * its source + vintage from there.
 */
export const SOURCED_NUMBERS: GuideDef = {
  slug: "sourced-numbers",
  title: "Where every number comes from",
  kind: "guide",
  description:
    "The four places a figure in your email can come from — and why an invented one can't happen.",
  cardImage: "/showcase/seed-previews/weekly-pulse.webp",
  hook: "One made-up number in a client email can cost the relationship. So the whole system is built around a single rule: every figure names a real source, or it doesn't ship.",
  expect: [
    "The four places a number can come from, and the order we try them",
    "Why the math is computed in code — the AI only writes the words",
    "What happens when we don't hold a number (the gap gets filled, never faked)",
    "How sources and as-of dates travel with every send",
  ],
  sections: [
    {
      id: "four-sources",
      heading: "The four places a number can come from",
      bestFor: "understanding what “sourced” actually means here",
      body: [
        "Every figure in an email we build for you comes from one of four places, tried in this order: our own Southwest Florida dataset, a document you upload, a named public source on the web, or a figure you hand us directly.",
        "When the first source doesn't hold the number you need, we move to the next one — your upload, then a cited public source, then you. The order protects quality; the fallbacks protect coverage. What never happens is a fifth option where the AI just writes a plausible-sounding number.",
      ],
      figure: {
        src: "/showcase/seed-previews/assets/chart-lee-median-asking.svg",
        alt: "Line chart of Lee County median asking price by month, June 2025 through June 2026",
        caption:
          "Median asking price in Lee County, monthly, 06/2025 through 06/2026 — the kind of figure that comes from the first source: data we hold and refresh ourselves.",
        provenance: "Realtor.com residential listing data via FRED",
        asOf: "07/09/2026",
      },
    },
    {
      id: "computed-not-written",
      heading: "The math is computed, the words are written",
      bestFor: "anyone worried the AI will make up their market stats",
      body: [
        "The AI never does arithmetic. Every median, count, and percent change is computed in code from source rows before the AI sees anything. By the time words are being written, the numbers are already fixed.",
        "That division of labor is the whole trick: code is good at math and bad at prose; the AI is good at prose and untrusted with math. Each side only does the part it's reliable at.",
      ],
      figure: {
        src: "/showcase/seed-previews/assets/chart-lee-sales-by-month.svg",
        alt: "Bar chart of recorded sales per month in Lee County, May 2025 through April 2026",
        caption:
          "Recorded sales per month in Lee County, 05/2025 through 04/2026, computed from county records — arm's-length sales of $10,000 and up.",
        provenance: "Lee County Property Appraiser recorded sales",
        asOf: "05/30/2026",
      },
    },
    {
      id: "gaps-fill",
      heading: "A gap gets filled, never invented",
      bestFor: "hyper-local sends where public data thins out",
      body: [
        "Ask for a figure we don't hold at that level of detail, and the system doesn't refuse the email — and doesn't guess. It moves down the list: a document you've uploaded, then a named public source we cite, then a figure you give us.",
        "Tell the builder “our team's average days on market is 12” and that 12 gets used — attributed to you, not dressed up as an official statistic. Provenance stays honest at every step.",
      ],
      proTips: [
        "You can hand the builder a figure mid-conversation. It gets used immediately and attributed as yours.",
      ],
    },
    {
      id: "citations-ride",
      heading: "Sources and dates ride with the send",
      bestFor: "brokers who get asked “where did that stat come from?”",
      body: [
        "Every email carries its list of sources, and every figure carries the date it was true — written out as a date (07/09/2026), never “recent” or “the latest”.",
        "When a reader questions a number, you have the receipt: which source, as of when.",
      ],
      figure: {
        src: "/showcase/seed-previews/assets/chart-pmms-rate.svg",
        alt: "Line chart of the 30-year fixed mortgage rate, weekly, July 2025 through July 2026",
        caption:
          "30-year fixed mortgage rate, weekly, 07/03/2025 through 07/09/2026 — a public-source figure that ships with its citation attached.",
        provenance: "Freddie Mac Primary Mortgage Market Survey (freddiemac.com/pmms)",
        asOf: "07/09/2026",
      },
    },
  ],
  tryIt: { label: "Build one free and open its sources list", href: EMAIL_LAB_LANDING },
};
