// lib/media/photo-badge.ts — THE one root for burning a status badge INTO a listing photo.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Operator, 08/06/2026: *"don't change the just sold bar so it's different from every other
// email. just put a graphic somewhere on the picture."*
//
// Both halves of that are corrections of mine. The first attempt made Just Sold's campaign
// ribbon BIGGER than the other six lifecycle emails — which breaks the one element whose
// entire job is being identical across the campaign (`lifecycle-chrome.ts`: seven emails that
// looked like seven different companies). Reverted. The variation belongs in the email's OWN
// elements, and the photo is one of those.
//
// ── WHY IT IS BAKED IN AND NOT AN HTML OVERLAY ──────────────────────────────
//
// `ImageProps.overlayTitle` already exists and would put text on the picture — but it renders
// the photo as a CSS `background-image`, and **Outlook desktop drops background images
// entirely**, so those recipients get a coloured panel where the house should be. Absolute
// positioning is not available in email either. The only technique that survives every client
// is to composite the badge into the JPEG the `<img>` points at. That is this file.
//
// ── IT INVENTS NO MACHINERY ─────────────────────────────────────────────────
//
// `lib/social/listing-card-render.ts` already runs exactly this pipeline for social cards:
// sharp decodes the vendor photo (rdcpix serves WEBP) and cover-crops it, resvg composites an
// SVG over the encoded PNG, sharp re-encodes to JPEG. Both libraries are already production
// dependencies. We import its `fetchPhoto` rather than writing a second fetcher, take fonts
// from `lib/brand/fonts.ts` (the one canvas-font root), and upload through `hostEmailMedia`
// (the one email-media uploader, which sets the cache header that keeps egress off origin).
//
// ── BEST-EFFORT, ALWAYS ─────────────────────────────────────────────────────
//
// Every failure path returns null and the caller ships the ORIGINAL photo. An undecodable
// vendor image, a dead URL, a storage hiccup — none of them may cost the reader the picture,
// and none of them may block a build (RULE 0.7).

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { fetchPhoto } from "@/lib/social/listing-card-render";
import { CANVAS_FONT_FILES, CANVAS_DEFAULT_FAMILY } from "@/lib/brand/fonts";
import { hostEmailMedia } from "@/lib/email/chart-image";

/** 3:2 — the MLS standard, and the ratio `ImageProps.ratio` defaults to, so the badge is
 *  composed against the same crop the email will display and can never be cropped off. */
const W = 1200;
const H = 800;

/** JPEG quality ladder — first size that clears the ceiling wins. A hero photo rides in the
 *  email body, and Gmail clips the whole message at ~102KB of HTML; the image is fetched
 *  separately so it does not count against that, but a 2MB hero is still a slow open. */
const QUALITY_LADDER = [82, 74, 66] as const;
const MAX_BYTES = 400_000;

/** XML-escape — the word is ours today, but it is a string and this is an SVG. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** #rrggbb → true when the colour is dark enough to need white text on it. */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // Rec. 601 luma, the same test `on-dark.ts` uses for text over a filled band.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6;
}

/**
 * THE BADGE, as an SVG over the photo.
 *
 * A DIAGONAL CORNER RIBBON in the agent's accent colour, top-left, plus a soft top-corner
 * scrim so the ribbon never lands on a bright sky and disappear. Exported so a test can assert
 * the burned-in word without rasterising anything (the same seam
 * `composeListingCardSvg` uses).
 */
export function composeBadgeSvg(args: {
  photoPngBase64: string;
  word: string;
  accent: string;
}): string {
  const { photoPngBase64, word, accent } = args;
  const ink = isDark(accent) ? "#ffffff" : "#1a1a1a";
  // The ribbon runs corner to corner across the top-left. These are the band's two ends on
  // the top and left edges; the label sits on its midpoint, rotated to match.
  const reach = 520; // px along each edge — big enough to read at a phone's render width
  const band = 116; // the band's thickness
  const mid = reach / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image href="data:image/png;base64,${photoPngBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <defs>
    <linearGradient id="cornerScrim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${reach + band}" height="${reach + band}" fill="url(#cornerScrim)"/>
  <g transform="rotate(-45 ${mid} ${mid})">
    <rect x="${mid - reach}" y="${mid - band / 2}" width="${reach * 2}" height="${band}" fill="${accent}"/>
    <text x="${mid}" y="${mid + 18}" text-anchor="middle"
      font-family="${CANVAS_DEFAULT_FAMILY}" font-size="52" font-weight="700"
      letter-spacing="6" fill="${ink}">${esc(word.toUpperCase())}</text>
  </g>
</svg>`;
}

export interface StampDeps {
  fetch?: typeof fetchPhoto;
  upload?: (key: string, buf: Buffer, contentType: string) => Promise<string>;
}

/**
 * Burn `word` into `photoUrl` as a corner ribbon and return the hosted URL of the result.
 *
 * Returns null on ANY failure — the caller ships the original photo. `keyHint` only shapes the
 * storage key; it never appears in the image.
 */
export async function stampPhotoBadge(
  photoUrl: string,
  opts: { word: string; accent: string; keyHint?: string },
  deps: StampDeps = {},
): Promise<string | null> {
  const get = deps.fetch ?? fetchPhoto;
  const put = deps.upload ?? hostEmailMedia;
  try {
    const raw = await get(photoUrl);
    if (!raw) return null;

    let photoPng: Buffer;
    try {
      // "attention" keeps the house in frame rather than blind-centring — the same crop the
      // social card uses on the same class of vendor photo.
      photoPng = await sharp(raw)
        .resize(W, H, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
    } catch {
      return null; // undecodable vendor image — ship the original, never a placeholder.
    }

    const svg = composeBadgeSvg({
      photoPngBase64: photoPng.toString("base64"),
      word: opts.word,
      accent: opts.accent,
    });

    const png = new Resvg(svg, {
      font: {
        fontFiles: CANVAS_FONT_FILES,
        loadSystemFonts: false,
        defaultFontFamily: CANVAS_DEFAULT_FAMILY,
      },
    })
      .render()
      .asPng();

    let encoded: Buffer | null = null;
    for (const quality of QUALITY_LADDER) {
      encoded = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
      if (encoded.length <= MAX_BYTES) break;
    }
    if (!encoded) return null;

    // The key is content-stamped so a long cache TTL is safe: a different photo, word or
    // accent lands on a NEW key and can never serve a stale hit. Same discipline as the chart
    // keys — egress hit 311% of plan once with no cache headers anywhere.
    const stamp = Buffer.from(`${photoUrl}|${opts.word}|${opts.accent}`)
      .toString("base64url")
      .slice(0, 24);
    const slug = (opts.keyHint ?? "badge").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    return await put(`email-photos/${slug}-${stamp}.jpg`, encoded, "image/jpeg");
  } catch {
    return null;
  }
}
