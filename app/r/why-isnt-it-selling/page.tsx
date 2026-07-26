// app/r/why-isnt-it-selling/page.tsx
//
// The Why Isn't It Selling route: /r/why-isnt-it-selling?q=<zip|address>. A free,
// complete seller diagnostic over our own lake — seven deterministic checks for a
// specific address, an area read for a bare ZIP, and a plain ask (never a dead end)
// for anything we can't honestly resolve. Every figure names its source and as-of.
//
// Report-family chrome (report-shell.tsx), reused not reinvented — same shell/header/
// footer + container as /r/back-on-market and /r/should-i-sell.
import { loadWinsReport } from "@/lib/why-not-selling/load-report";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import WinsRead from "@/components/why-not-selling/WinsRead";
import { ReportShell, ReportHeader, ReportFooter, Meta } from "../_components/report-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function AskForm({ q }: { q: string }) {
  return (
    <form method="get" className="mt-5 flex max-w-xl flex-wrap gap-2">
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder="Your address — e.g. 123 SE 10th Pl, Cape Coral — or a ZIP like 33904"
        aria-label="Address or ZIP"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
      />
      <button
        type="submit"
        className="btn-gradient inline-flex shrink-0 items-center rounded-lg px-5 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90"
      >
        Read the data
      </button>
    </form>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; watch?: string }>;
}) {
  const { q = "", watch = "" } = await searchParams;
  const report = q.trim() ? await loadWinsReport(q) : null;

  if (!report) {
    return (
      <ReportShell width="2xl">
        <ReportHeader title="Why Isn't It Selling">
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
            Why isn&rsquo;t it selling? Enter your address — we&rsquo;ll read the market&rsquo;s
            answer from the data. Free, complete, and every number names its source. Lee and Collier
            County.
          </p>
          <AskForm q={q} />
        </ReportHeader>
        <ReportFooter />
      </ReportShell>
    );
  }

  const county = resolveZip(report.zip).county_names?.[0];

  return (
    <ReportShell width="2xl">
      <ReportHeader title="Why Isn't It Selling">
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
          A data-first read on what&rsquo;s slowing a sale — this home against its own market. Every
          number names its source. What the data can&rsquo;t see, we say so.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Meta label="Area" value={`${report.place} · ${report.zip}`} />
          {county && <Meta label="County" value={`${county} County`} />}
        </dl>
        <AskForm q={q} />
      </ReportHeader>

      <WinsRead report={report} q={q} watchSaved={watch === "saved"} />

      <ReportFooter />
    </ReportShell>
  );
}
