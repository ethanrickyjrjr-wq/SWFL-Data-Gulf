import Link from "next/link";
import { ReportShell, ReportHeader, ReportFooter } from "./_components/report-shell";
import { LocationSearchBox } from "./_components/location-ui";

export const dynamic = "force-static";

export const metadata = {
  title: "Search Southwest Florida — SWFL Data Gulf",
  description:
    "Type any Southwest Florida location — ZIP, city, address, corridor, or county — and see every dataset that covers it, at the grain we hold it.",
};

// The marquee report entry points — the search box above reaches everything, but a
// first-time visitor needs somewhere to CLICK. These three are the seller-facing
// front doors (nav Seller Tools + footer link here too; sitemap enumerates them).
const REPORTS: { label: string; blurb: string; href: string }[] = [
  {
    label: "Should I Sell?",
    blurb: "An honest seller's read for your ZIP — stress signals, snapshot, cost of waiting.",
    href: "/r/should-i-sell",
  },
  {
    label: "Offer Check",
    blurb: "Got an offer in hand? See where it lands against recent recorded sales near you.",
    href: "/r/offer-check",
  },
  {
    label: "Back on Market",
    blurb: "Deals that fell through and relisted — where they are and what happened.",
    href: "/r/back-on-market",
  },
  {
    label: "Housing Market",
    blurb: "The Southwest Florida housing picture — every number cited to its source.",
    href: "/r/housing-swfl",
  },
];

const EXAMPLES: { label: string; q: string }[] = [
  { label: "33931 — Fort Myers Beach", q: "33931" },
  { label: "Naples", q: "Naples" },
  { label: "Bonita Springs", q: "Bonita Springs" },
  { label: "Lee County", q: "Lee County" },
  { label: "North Naples", q: "North Naples" },
];

export default function ReportIndexPage() {
  return (
    <ReportShell width="2xl">
      <ReportHeader title="Search Southwest Florida">
        <p className="mt-3 max-w-xl text-base leading-7 text-gray-300">
          Type a ZIP, city, address, corridor, or county. We&rsquo;ll show every dataset that covers
          it — housing, flood risk, permits, traffic, jobs, and more — at the level we actually hold
          it, never finer.
        </p>
        <div className="mt-6">
          <LocationSearchBox autoFocus />
        </div>
      </ReportHeader>

      <section className="mt-8">
        <p className="text-xs uppercase tracking-wider text-gray-500">Try one</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <Link
              key={e.q}
              href={`/r/search?q=${encodeURIComponent(e.q)}`}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm text-gray-200 transition-colors hover:border-gulf-teal/50 hover:text-white"
            >
              {e.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <p className="text-xs uppercase tracking-wider text-gray-500">Or start from a report</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {REPORTS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 transition-colors hover:border-gulf-teal/50"
            >
              <span className="block text-sm font-semibold text-white">{r.label}</span>
              <span className="mt-1 block text-xs leading-5 text-gray-400">{r.blurb}</span>
            </Link>
          ))}
        </div>
      </section>

      <ReportFooter note="We cover Lee and Collier County in depth — and fill wider Southwest Florida asks from named sources." />
    </ReportShell>
  );
}
