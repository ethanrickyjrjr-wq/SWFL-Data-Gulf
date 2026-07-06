import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { asOfFromIso } from "../../../../../lib/project/as-of";
import { fetchNeighborhoodBySlug, type NeighborhoodStat } from "../../communities";
import {
  ReportShell,
  ReportHeader,
  ReportFooter,
  SectionTitle,
  Meta,
  Chip,
} from "../../../_components/report-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SLUG = /^[a-z0-9-]+$/;

interface PageProps {
  params: Promise<{ neighborhood: string }>;
}

const TYPE_LABEL: Record<string, string> = {
  "single-family": "Single-family",
  condominium: "Condominium",
  mobile: "Mobile home",
  cooperative: "Cooperative",
  "duplex-small-multifamily": "Duplex / small multi-family",
  "misc-residential": "Misc. residential",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { neighborhood } = await params;
  const n = VALID_SLUG.test(neighborhood) ? await fetchNeighborhoodBySlug(neighborhood) : null;
  const name = n?.subdivision_name ?? neighborhood;
  return {
    title: `${name} — SWFL Neighborhood Stats`,
    description: n
      ? `Home count, mix by type and median value for ${name} in Southwest Florida.`
      : undefined,
  };
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export default async function NeighborhoodPage({ params }: PageProps) {
  const { neighborhood } = await params;
  if (!VALID_SLUG.test(neighborhood)) notFound();

  const n: NeighborhoodStat | null = await fetchNeighborhoodBySlug(neighborhood);
  if (!n) notFound();

  const byType = Object.entries(n.count_by_type ?? {})
    .filter(([, c]) => Number(c) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <ReportShell>
      <ReportHeader title={n.subdivision_name ?? neighborhood}>
        <div className="mt-3 flex flex-wrap gap-2">
          {n.county && <Chip>{n.county} County</Chip>}
          <Chip>Neighborhood</Chip>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {n.as_of && <Meta label="As of" value={asOfFromIso(n.as_of) ?? n.as_of} />}
        </dl>
      </ReportHeader>

      <section className="mt-10">
        <SectionTitle>The numbers</SectionTitle>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {n.home_count != null && (
            <Meta label="Homes" value={n.home_count.toLocaleString("en-US")} />
          )}
          {n.median_just_value != null && (
            <Meta label="Median just value" value={money(n.median_just_value)} />
          )}
        </dl>
      </section>

      {byType.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Homes by type</SectionTitle>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            {byType.map(([t, c]) => (
              <Meta key={t} label={TYPE_LABEL[t] ?? t} value={Number(c).toLocaleString("en-US")} />
            ))}
          </dl>
        </section>
      )}

      <p className="mt-8 text-xs text-gray-500">
        Home counts and median value are authoritative from our parcel name-join (Lee + Collier tax
        rolls). Each condo unit counts as one home.
      </p>

      <ReportFooter>
        <Link
          href="/r/communities-swfl"
          className="text-gulf-teal underline underline-offset-2 hover:text-gulf-teal/80"
        >
          All SWFL communities
        </Link>
      </ReportFooter>
    </ReportShell>
  );
}
