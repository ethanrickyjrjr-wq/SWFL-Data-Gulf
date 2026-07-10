// app/c/[id]/card/route.ts
//
// GET /c/<id>/card — the saved chart's social card as a PNG. Extension-free on
// purpose (og:image:type declares the MIME; platforms follow Content-Type).
// Public like /c/[id] itself. Saved charts are immutable → long CDN cache.
// FONTS: this route rasterizes via svgToPng, so next.config.ts MUST trace
// ./assets/fonts/*.ttf for it (blank-text PNGs on Vercel otherwise).

import { type NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { chartBlockToCardPng } from "@/lib/charts/social-card";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createServiceRoleClient();
  const { data, error } = await db.from("saved_charts").select("chart_block").eq("id", id).single();
  if (error || !data) return new NextResponse("not found", { status: 404 });

  let png: Buffer;
  try {
    png = chartBlockToCardPng(data.chart_block as ChartBlock);
  } catch {
    // A legacy/malformed persisted block degrades to "no card" (platforms fall
    // back to a text-only unfurl — same as today), never a half-drawn 500.
    return new NextResponse("not renderable", { status: 404 });
  }

  const headers = new Headers({
    "content-type": "image/png",
    "cache-control": "public, max-age=3600, s-maxage=86400",
  });
  if (new URL(req.url).searchParams.get("download") === "1") {
    headers.set("content-disposition", `attachment; filename="swfl-${id}.png"`);
  }
  return new NextResponse(new Uint8Array(png), { headers });
}
