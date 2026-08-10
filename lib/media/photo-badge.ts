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

import { createHash } from "node:crypto";
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
 * The COMPLEMENT of a brand colour — hue rotated 180° in HSL, saturation and lightness
 * kept, so the flag is "a different colored complementary color" (operator decree
 * 08/09/2026) that is still DERIVED from the brand rather than invented per-send.
 * Unparseable input falls to a neutral deep slate — a UI fallback, never a data value.
 */
export function complementOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#334155";
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = (h + 0.5) % 1; // the rotation — everything else passes through
  const hue = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to255 = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(hue(h + 1 / 3))}${to255(hue(h))}${to255(hue(h - 1 / 3))}`;
}

/** The flag's height on the 1200×800 canvas — tall enough to read on a phone,
 *  never tall enough to eat the house. */
const FLAG_H = 120;

/**
 * THE FLAG, as an SVG over the photo.
 *
 * A FLAT, FULL-WIDTH BAND ACROSS THE BOTTOM of the picture, in the COMPLEMENT of the
 * agent's accent, with a slim accent keyline on its top edge tying it back to the brand.
 *
 * ── WHY NOT THE DIAGONAL CORNER RIBBON THIS REPLACED ────────────────────────────
 * Operator, 08/09/2026, looking at the render: *"I CAN SEE A BLACK LINE AND THE ANGLE
 * IS TERRIBLE. JUST MAKE IT A DIFFERENT COLORED COMPLEMENTARY COLOR FLAG AT THE BOTTOM
 * OF THE PICTURE."* The black line was the corner scrim — a black gradient rect laid
 * under the ribbon so it read on bright skies; the angle was the ribbon's −45° rotate.
 * Both are gone: a solid bottom band needs no scrim (it manufactures its own contrast)
 * and has no angle. Exported so a test can assert the geometry and the word without
 * rasterising anything (the same seam `composeListingCardSvg` uses).
 */
export function composeBadgeSvg(args: {
  photoPngBase64: string;
  word: string;
  accent: string;
}): string {
  const { photoPngBase64, word, accent } = args;
  const flag = complementOf(accent);
  const ink = isDark(flag) ? "#ffffff" : "#1a1a1a";
  const top = H - FLAG_H;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <image href="data:image/png;base64,${photoPngBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${top}" width="${W}" height="${FLAG_H}" fill="${flag}"/>
  <rect x="0" y="${top}" width="${W}" height="6" fill="${accent}"/>
  <text x="${W / 2}" y="${top + FLAG_H / 2 + 18}" text-anchor="middle"
    font-family="${CANVAS_DEFAULT_FAMILY}" font-size="52" font-weight="700"
    letter-spacing="6" fill="${ink}">${esc(word.toUpperCase())}</text>
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

    // The key is stamped with the RENDERED BYTES, not the inputs. An input stamp
    // (`photoUrl|word|accent`) could not see a change to the DRAWING — the diagonal-ribbon →
    // bottom-flag redesign (08/09/2026) would have served the old ribbon forever off the
    // immutable edge cache, the exact third-vector lesson the chart keys learned the same
    // week. Same pixels → same key (deterministic); any change that moves a pixel moves the
    // key. Egress hit 311% of plan once with no cache headers anywhere — long TTLs stay safe.
    const stamp = createHash("sha1").update(encoded).digest("hex").slice(0, 20);
    const slug = (opts.keyHint ?? "badge").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    return await put(`email-photos/${slug}-${stamp}.jpg`, encoded, "image/jpeg");
  } catch {
    return null;
  }
}
