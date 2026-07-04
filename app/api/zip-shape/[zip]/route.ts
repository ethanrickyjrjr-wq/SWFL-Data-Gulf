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
// Fill is a caller-supplied `?fill=` param, not hardcoded — this route is a
// skeleton renderer. The webpage colors the shape from computeZipGradient
// (lib/map/zip-color.ts, flood-AAL driven — same gradient as the homepage
// map); the email passes that same computed value through so a ZIP shows the
// identical color in the email as it does on the homepage/webpage (operator
// 07/03/2026: "the zip color stays the same color as clicked when on
// homepage"). No caller-supplied fill → FALLBACK_COLOR, the map's own
// neutral no-data slate — never a hardcoded brand color.
//
// Cacheable hard per (zip, fill) — the geometry and a given fill never change
// day-to-day; a different `?fill=` is a different cached URL.

import { NextResponse } from "next/server";
import { extractZipShape } from "@/lib/map/extract-zip-shape";

export const runtime = "nodejs";

const W = 800;
const H = 520;
const FALLBACK_FILL = "#2a3942"; // lib/map/zip-color.ts FALLBACK_COLOR — neutral, not a brand color

/** `#rgb`/`#rrggbb` or `rgb(r,g,b)` only — this string is spliced straight
 *  into an SVG `fill` attribute, so anything else (e.g. `url(...)`, quotes,
 *  markup) is rejected rather than sanitized. */
export function safeFill(raw: string | null): string {
  if (!raw) return FALLBACK_FILL;
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return raw;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(raw)) return raw;
  return FALLBACK_FILL;
}

/** Transparent canvas, flat shape centered via nested-svg fit — no background
 *  rect, no stroke. The webpage's stroke is a real CSS 0.6px that nearly
 *  disappears against its own dark background; the same stroke-width in this
 *  SVG's raw (unscaled) geometry coordinates rendered as a thick, visible
 *  dark border once rasterized — operator flagged it 07/03/2026 as not
 *  matching the site. Flat fill, no stroke, avoids the mismatch entirely. */
function cardSvg(inner: string, viewBox: string, fill: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<svg x="40" y="30" width="${W - 80}" height="${H - 60}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">` +
    `<g fill="${fill}">${inner}</g>` +
    `</svg>` +
    `</svg>`
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ zip: string }> }) {
  const { zip } = await params;
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: "invalid_zip" }, { status: 400 });
  }
  const fill = safeFill(new URL(req.url).searchParams.get("fill"));

  const { svgMarkup, found } = extractZipShape(zip);
  if (!found) return NextResponse.json({ error: "unknown_zip" }, { status: 404 });

  const vbMatch = svgMarkup.match(/viewBox="([^"]+)"/);
  const innerMatch = svgMarkup.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/);
  if (!vbMatch || !innerMatch) {
    return NextResponse.json({ error: "shape_parse_failed" }, { status: 500 });
  }

  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const png = new Resvg(cardSvg(innerMatch[1], vbMatch[1], fill)).render().asPng();
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
