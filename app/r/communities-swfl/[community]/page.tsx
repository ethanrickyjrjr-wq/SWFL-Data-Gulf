import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { asOfFromToken, asOfFromIso } from "../../../../lib/project/as-of";
import { parseBrainMarkdown } from "../../../../refinery/render/speaker.mts";
import { communityJsonLd } from "../../../../lib/jsonld.ts";
import { fetchCommunityBySlug, type CommunityProfile } from "../communities";
import {
  ReportShell,
  ReportHeader,
  ReportFooter,
  SectionTitle,
  Meta,
  Chip,
} from "../../_components/report-shell";
import { SourceLink } from "../../_components/metrics-table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAINS_DIR = path.join(process.cwd(), "brains");
const VALID_SLUG = /^[a-z0-9-]+$/;

interface PageProps {
  params: Promise<{ community: string }>;
}

const GOLF_LABEL: Record<string, string> = {
  bundled: "Golf bundled into membership",
  equity: "Equity golf (buy-in)",
  optional: "Optional golf membership",
  none: "No golf",
};

async function freshnessToken(): Promise<string> {
  try {
    const md = await readFile(path.join(BRAINS_DIR, "communities-swfl.md"), "utf-8");
    return parseBrainMarkdown(md).freshness_token;
  } catch {
    return "";
  }
}

async function loadData(
  slug: string,
): Promise<{ community: CommunityProfile; token: string } | null> {
  if (!VALID_SLUG.test(slug)) return null;
  const community = await fetchCommunityBySlug(slug);
  if (!community) return null;
  return { community, token: await freshnessToken() };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { community } = await params;
  const d = await loadData(community);
  const name = d?.community.label ?? community;
  return {
    title: `${name} — SWFL Community Profile`,
    description: d
      ? `Golf, HOA fees, amenities, home count and drive-times for ${name} in Southwest Florida.`
      : undefined,
  };
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function amenityList(c: CommunityProfile): string[] {
  const out: { on: boolean | null; label: string }[] = [
    { on: c.pool, label: "Pool" },
    { on: c.tennis, label: "Tennis" },
    { on: c.pickleball, label: "Pickleball" },
    { on: c.fitness, label: "Fitness center" },
    { on: c.clubhouse, label: "Clubhouse" },
    { on: c.on_site_dining, label: "On-site dining" },
    { on: c.boating, label: "Boating / marina" },
  ];
  return out.filter((a) => a.on === true).map((a) => a.label);
}

export default async function CommunityPage({ params }: PageProps) {
  const { community } = await params;
  if (!VALID_SLUG.test(community)) notFound();

  const d = await loadData(community);
  if (!d) notFound();

  const { community: c, token } = d;
  const ld = communityJsonLd(
    {
      label: c.label ?? community,
      county: c.county,
      gated: c.gated,
      golf_holes: c.golf_holes,
      hoa_fee_min: c.hoa_fee_min,
      hoa_fee_max: c.hoa_fee_max,
      home_count: c.home_count,
      source_url: c.source_url,
    },
    asOfFromToken(token) ?? c.as_of ?? "",
  );

  const amenities = amenityList(c);
  const drives: { label: string; min: number | null }[] = [
    { label: "RSW airport", min: c.drive_min_rsw },
    { label: "Nearest Gulf beach", min: c.drive_min_beach },
    { label: "Downtown", min: c.drive_min_downtown },
    { label: "Nearest hospital", min: c.drive_min_hospital },
  ].filter((x) => x.min != null);

  return (
    <ReportShell>
      <ReportHeader title={c.label ?? community}>
        <div className="mt-3 flex flex-wrap gap-2">
          {c.county && <Chip>{c.county} County</Chip>}
          {c.gated === true && <Chip>Gated</Chip>}
          {c.golf_structure && GOLF_LABEL[c.golf_structure] && (
            <Chip>{GOLF_LABEL[c.golf_structure]}</Chip>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {token && (
            <Meta
              label="Freshness"
              value={<code className="text-xs text-gulf-teal">{asOfFromToken(token)}</code>}
            />
          )}
          {c.as_of && asOfFromIso(c.as_of) && <Meta label="As of" value={asOfFromIso(c.as_of)} />}
          {c.source_url && <Meta label="Source" value={<SourceLink url={c.source_url} />} />}
        </dl>
      </ReportHeader>

      <section className="mt-10">
        <SectionTitle>The essentials</SectionTitle>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {c.golf_structure && GOLF_LABEL[c.golf_structure] && (
            <Meta
              label="Golf"
              value={`${GOLF_LABEL[c.golf_structure]}${c.golf_holes != null ? ` · ${c.golf_holes} holes` : ""}`}
            />
          )}
          {c.hoa_fee_min != null && c.hoa_fee_max != null && (
            <Meta label="HOA fees" value={`${money(c.hoa_fee_min)}–${money(c.hoa_fee_max)}`} />
          )}
          {c.home_count != null && (
            <Meta label="Homes" value={c.home_count.toLocaleString("en-US")} />
          )}
          {c.cdd_flag != null && <Meta label="CDD" value={c.cdd_flag ? "Yes" : "No"} />}
          {c.nearby_dining_count != null && (
            <Meta label="Nearby dining" value={`${c.nearby_dining_count} places`} />
          )}
        </dl>
      </section>

      {amenities.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Inside the gates</SectionTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {amenities.map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>
        </section>
      )}

      {drives.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Getting around</SectionTitle>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {drives.map((x) => (
              <Meta key={x.label} label={x.label} value={`${x.min} min`} />
            ))}
          </dl>
          <p className="mt-3 text-xs text-gray-500">Drive-times computed by Mapbox.</p>
        </section>
      )}

      <ReportFooter freshnessToken={token || undefined}>
        <Link
          href="/r/communities-swfl"
          className="text-gulf-teal underline underline-offset-2 hover:text-gulf-teal/80"
        >
          All SWFL communities
        </Link>
      </ReportFooter>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </ReportShell>
  );
}
