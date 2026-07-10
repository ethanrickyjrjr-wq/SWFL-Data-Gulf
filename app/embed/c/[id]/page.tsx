// app/embed/c/[id]/page.tsx
//
// Chromeless embed target for a saved chart (iframe snippet on /c/[id]).
// Under /embed/ on purpose — that prefix already carries the frame-ancestors-*
// headers in next.config.ts. The footer credit links back to the full page;
// attribution IS the growth loop, so it is not a prop and cannot be disabled.

import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { asOfFromToken } from "@/lib/project/as-of";
import { ChartBlockView } from "@/components/charts/ChartBlockView";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SavedChartRow {
  chart_block: ChartBlock;
  freshness_token: string | null;
}

export default async function EmbedSavedChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("saved_charts")
    .select("chart_block, freshness_token")
    .eq("id", id)
    .single<SavedChartRow>();
  if (error || !data) notFound();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://www.swfldatagulf.com";
  const asOf = asOfFromToken(data.freshness_token);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0A1419",
        color: "#F0EDE6",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          background: "#152832",
          border: "1px solid #22414F",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>
          {data.chart_block.title}
        </h1>
        <ChartBlockView block={data.chart_block} />
        <p
          style={{
            margin: "12px 0 0",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            color: "#807E76",
          }}
        >
          <span>{asOf ?? ""}</span>
          <a
            href={`${siteUrl}/c/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3DC9C0", textDecoration: "none" }}
          >
            Chart: SWFL Data Gulf ↗
          </a>
        </p>
      </div>
    </main>
  );
}
