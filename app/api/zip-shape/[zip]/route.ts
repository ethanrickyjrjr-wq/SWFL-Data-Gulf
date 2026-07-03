// app/api/zip-shape/[zip]/route.ts
//
// The ZIP cutout as a PNG — the zip-report page's shape (extractZipShape, same
// contractor SVG) rendered as a branded image that EMAIL CLIENTS can show
// (they strip inline <svg>; the seeded ZIP email's image block points here).
// Shape-only, no text → no font bundling needed. Rasterizer: @resvg/resvg-js —
// the house-proven path (lib/social/render-social-image.ts fork decision,
// vendor-verified 06/20/2026); already in serverExternalPackages.
//
// Transparent canvas — mirrors the zip-report page's .zp-shape-wrap, where the
// shape floats directly on the section background with no card behind it.
// A solid dark rect here used to read as an opaque black box once dropped into
// a white email section (operator flagged 07/03/2026).
//
// Cacheable hard: the geometry never changes day-to-day.

import { NextResponse } from "next/server";
import { extractZipShape } from "@/lib/map/extract-zip-shape";

export const runtime = "nodejs";

const W = 800;
const H = 520;

/** Transparent canvas, teal shape centered via nested-svg fit — no background rect. */
function cardSvg(inner: string, viewBox: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<svg x="40" y="30" width="${W - 80}" height="${H - 60}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">` +
    `<g fill="#3DC9C0" fill-opacity="0.92" stroke="#0f1d24" stroke-width="1">${inner}</g>` +
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
