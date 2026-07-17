// app/r/should-i-sell/page.tsx
//
// The thin Should I Sell landing: /r/should-i-sell?q=<zip|place|address>. Resolves the
// query and REDIRECTS to the ZIP permalink (the canonical, shareable URL). A place/
// address that carries a full street address is forwarded to the permalink as ?address=
// so the seller lands straight on their spread. Out-of-scope → a friendly panel, never
// a 404. County/region (no single ZIP) → a plain "narrow to a ZIP/address" ask.
import { redirect } from "next/navigation";
import { resolveLocation } from "../../../refinery/lib/location-resolver.mts";
import { searchRoute } from "../../../lib/location-surface";
import { ReportShell, ReportHeader, ReportFooter } from "../_components/report-shell";
import { LocationSearchBox, OutOfScopePanel } from "../_components/location-ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** A house-number-led query is a full street address → carry it to the permalink so the
 *  spread renders immediately (the ZIP page's own address flow takes over). */
const ADDRESS_HINT = /\b\d{1,6}\s+\S/;

export default async function ShouldISellLanding({ searchParams }: PageProps) {
  const q = firstParam((await searchParams).q).trim();

  if (!q) {
    return (
      <ReportShell width="2xl">
        <ReportHeader title="Should I Sell?">
          <p className="mt-3 text-base leading-7 text-gray-300">
            A seller&rsquo;s honest read for your area — the stress the scoring industry hides, the
            market snapshot, and what waiting 6–12 months could cost or gain you.
          </p>
          <div className="mt-5">
            <LocationSearchBox
              defaultValue=""
              placeholder="Your ZIP or address — e.g. 33904, or 123 Main St, Cape Coral"
            />
          </div>
        </ReportHeader>
        <ReportFooter />
      </ReportShell>
    );
  }

  const loc = await resolveLocation(q);
  const route = searchRoute(loc);

  if (route.kind === "redirect") {
    const carry = ADDRESS_HINT.test(q) ? `?address=${encodeURIComponent(q)}` : "";
    redirect(`/r/should-i-sell/${route.zip}${carry}`);
  }

  // County / corridor / region resolve, but a seller read needs a single area — ask for one.
  if (route.kind === "render") {
    return (
      <ReportShell width="2xl">
        <ReportHeader title="Should I Sell?">
          <div className="mt-5">
            <LocationSearchBox
              defaultValue={q}
              placeholder="Narrow to a ZIP or a full street address"
            />
          </div>
        </ReportHeader>
        <section className="mt-8 rounded-xl glass-card-modern border border-white/10 px-6 py-8 text-center">
          <h2 className="text-xl font-semibold text-white">Pick a single area</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-400">
            A seller read is for one home&rsquo;s market. Enter a ZIP (like 33904) or your full
            street address and we&rsquo;ll take it from there.
          </p>
        </section>
        <ReportFooter />
      </ReportShell>
    );
  }

  // Out of the Southwest Florida footprint — a friendly page, never a 404.
  return (
    <ReportShell width="2xl">
      <ReportHeader title="Should I Sell?">
        <div className="mt-5">
          <LocationSearchBox defaultValue={q} />
        </div>
      </ReportHeader>
      <OutOfScopePanel query={q} />
      <ReportFooter />
    </ReportShell>
  );
}
