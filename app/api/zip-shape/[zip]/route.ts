// app/api/zip-shape/[zip]/route.ts
//
// The ZIP cutout as a PNG — the zip-report page's shape (extractZipShape, same
// contractor SVG) rendered as a branded card image that EMAIL CLIENTS can show
// (they strip inline <svg>; the seeded ZIP email's image block points here).
// Shape-only, no text → no font bundling needed. Rasterizer: @resvg/resvg-js —
// the house-proven path (lib/social/render-social-image.ts fork decision,
// vendor-verified 06/20/2026); already in serverExternalPackages.
//
// Cacheable hard: the geometry never changes day-to-day.

import { NextResponse } from "next/server";
import { extractZipShape } from "@/lib/map/extract-zip-shape";

export const runtime = "nodejs";

const W = 800;
const H = 520;

/** Card wrapper: dark gulf canvas, teal shape centered via nested-svg fit. */
function cardSvg(inner: string, viewBox: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" rx="24" fill="#0f1d24"/>` +
    `<svg x="60" y="50" width="${W - 120}" height="${H - 100}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">` +
    `<g fill="#3DC9C0" fill-opacity="0.92" stroke="#0a1419" stroke-width="1">${inner}</g>` +
    `</svg>` +
    `</svg>`
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ zip: string }> }) {
  const { zip } = await params;
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "invalid_zip" }, { status: 400 });
  }

  const { svgMarkup, found } = extractZipShape(zip);
  if (!found) return NextResponse.json({ error: "unknown_zip" }, { status: 404 });

  const vbMatch = svgMarkup.match(/viewBox="([^"]+)"/);
  const innerMatch = svgMarkup.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/);
  if (!vbMatch || !innerMatch) {
    return NextResponse.json({ error: "shape_parse_failed" }, { status: 500 });
  }

  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const png = new Resvg(cardSvg(innerMatch[1], vbMatch[1])).render().asPng();
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }
}
