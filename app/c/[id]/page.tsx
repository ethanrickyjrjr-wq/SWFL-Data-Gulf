import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import type { Metadata } from "next";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { asOfFromToken } from "@/lib/project/as-of";
import { ChartBlockView } from "@/components/charts/ChartBlockView";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import { AddToProject } from "./AddToProject";
import { PrintButton } from "@/components/PrintButton";
import { ShareRow } from "./ShareRow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SavedChartRow {
  id: string;
  chart_block: ChartBlock;
  source_meta: { report_id?: string; label?: string } | null;
  freshness_token: string | null;
  created_at: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data } = await db.from("saved_charts").select("chart_block").eq("id", id).single();
  const title = (data?.chart_block as ChartBlock | null)?.title ?? "Saved Chart";
  const citation = (data?.chart_block as ChartBlock | null)?.source?.citation;
  // OG contract per ogp.me (crawled 07/10/2026): og:title/type/url/image required;
  // width/height/type/alt structured props on the image. Next's Metadata API emits them.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.swfldatagulf.com";
  const pageTitle = `${title} — SWFL Data Gulf`;
  return {
    title: pageTitle,
    description: citation ? `Chart · ${citation}` : "A sourced chart from SWFL Data Gulf.",
    metadataBase: new URL(base),
    alternates: { canonical: `/c/${id}` },
    openGraph: {
      title: pageTitle,
      type: "website",
      url: `/c/${id}`,
      images: [
        {
          url: `/c/${id}/card`,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: `${title} — chart by SWFL Data Gulf`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      images: [`/c/${id}/card`],
    },
  };
}

export default async function SavedChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("saved_charts")
    .select("*")
    .eq("id", id)
    .single<SavedChartRow>();

  if (error || !data) notFound();

  const { chart_block, source_meta, freshness_token } = data;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.swfldatagulf.com";

  return (
    <PageShell width="narrow">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">{chart_block.title}</h1>
        {source_meta?.label && <p className="mt-1 text-sm text-gray-400">{source_meta.label}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1e2b]/80">
        <ChartBlockView block={chart_block} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="freshness-token text-[11px] font-mono text-gray-500">
          {asOfFromToken(freshness_token) ?? ""}
        </div>
        <div className="flex items-center gap-3">
          <AddToProject chartId={id} title={chart_block.title} />
          <PrintButton reportId={id} />
        </div>
      </div>

      <ShareRow id={id} title={chart_block.title} siteUrl={siteUrl} />

      {source_meta?.report_id && (
        <p className="mt-6 text-xs text-gray-500">
          Source:{" "}
          <a
            href={`/r/${source_meta.report_id}`}
            className="text-gulf-teal underline underline-offset-2"
          >
            {source_meta.report_id}
          </a>
        </p>
      )}
    </PageShell>
  );
}
