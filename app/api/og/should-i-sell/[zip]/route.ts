// app/api/og/should-i-sell/[zip]/route.ts
//
// GET → the 1200×630 share card for /r/should-i-sell/<zip>. Referenced by that
// page's generateMetadata (og:image + twitter:image) so every posted link unfurls
// into the seller-stress read instead of a bare grey link.
//
// Thin route over the ONE social rasterizer (lib/social/render-social-image.ts —
// resvg, brand tokens, burned-in provenance watermark) and the ONE per-ZIP stress
// authority (lib/back-on-market/load-zip.ts). A scraper NEVER gets a 5xx here:
// any load failure degrades to the branded generic card.
import { NextResponse } from "next/server";
import { resolveZip } from "../../../../../refinery/lib/zip-resolver.mts";
import { cityForZip } from "@/lib/swfl-zip-city";
import { loadBackOnMarketZip } from "@/lib/back-on-market/load-zip";
import { buildShouldISellOgModel } from "@/lib/should-i-sell/og-card";
import { renderSocialImage } from "@/lib/social/render-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ZIP = /^\d{5}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ zip: string }> },
): Promise<Response> {
  const { zip } = await params;

  let model = buildShouldISellOgModel(null);
  if (VALID_ZIP.test(zip) && resolveZip(zip).in_scope) {
    try {
      // Same place resolution the page uses — without it the loader's fallback
      // place is the bare ZIP and the headline reads "Should I sell in 33904?".
      const place = cityForZip(zip) ?? undefined;
      model = buildShouldISellOgModel(await loadBackOnMarketZip(zip, { place }));
    } catch {
      // Loader hiccup → generic branded card; the share must still unfurl.
    }
  }

  const png = await renderSocialImage({ model, format: "landscape" });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Scrapers cache aggressively anyway; a day of CDN cache per ZIP is right
      // for a rolling-monthly figure, and SWR keeps refreshes off the hot path.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
