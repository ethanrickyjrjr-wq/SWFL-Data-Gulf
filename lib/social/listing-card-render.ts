/**
 * lib/social/listing-card-render.ts
 *
 * CarouselCard + photo bytes → a Bluesky-ready JPEG of that photo with the
 * address and specs burned onto it.
 *
 * ── THE PIPELINE, AND WHY EACH STAGE EXISTS ─────────────────────────────────
 *   1. sharp  — decode the vendor photo (rdcpix serves WEBP) and cover-crop it
 *      to the target canvas, re-encoded as PNG. resvg embeds raster reliably
 *      (the `fetchLogo` path in render-social-image.ts already does exactly
 *      this); it is *SVG* inside `<image>` that is unreliable, not PNG.
 *   2. resvg  — composite the scrim + text over it. Uses the SAME bundled
 *      Liberation faces as every other card (`loadSystemFonts:false`), so the
 *      render is deterministic local === Vercel.
 *   3. sharp  — PNG → JPEG. resvg only emits PNG, and a 1080² photo as PNG is
 *      several MB; the lexicon caps an image at 1,000,000 bytes
 *      (docs.bsky.app, verified 08/03/2026). Quality steps DOWN until it fits.
 *
 * ── WHY THE SCRIM IS STRUCTURAL, NOT DECORATION ─────────────────────────────
 * `design/system.ts` resolves text color by measuring contrast against a known
 * surface. A PHOTO is not a known surface — the next listing's kitchen could be
 * any luminance. So the text never sits on the photo: it sits on an opaque
 * BRAND.deep scrim, and `ink()`/`accent()` are asked for their color against
 * THAT. Contrast becomes a property of the scrim, which we control.
 *
 * Type comes from `type(role, format)` — NOT from render-social-image.ts's
 * private multipliers, which are the known off-system engine (open check
 * `social_render_engine_off_system`). Copying them would be the "extract on
 * copy #2 / a second brand" failure lib/social/CLAUDE.md exists to stop.
 */

import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { BRAND } from "@/lib/brand/tokens";
import { CANVAS_FONT_FILES, CANVAS_DEFAULT_FAMILY } from "@/lib/brand/fonts";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";
import { type as typeStyle, ink, accent, decor, margin } from "@/lib/social/design/system";
import { esc, clip } from "@/lib/social/chart-svg";
import type { CarouselCard } from "@/lib/social/listing-carousel";

const CANVAS_FONT = `${CANVAS_DEFAULT_FAMILY}, Arial, Helvetica, sans-serif`;

/** Stay clear of the lexicon's 1,000,000-byte ceiling. The margin absorbs the
 *  handful of bytes JPEG encoding varies by between sharp/libjpeg versions. */
export const MAX_BLOB_BYTES = 950_000;

/** Quality ladder, walked top-down until an encode fits MAX_BLOB_BYTES. */
const QUALITY_LADDER = [86, 78, 70, 60, 50];

export interface RenderedCard {
  bytes: Uint8Array;
  mime: "image/jpeg";
  alt: string;
  aspectRatio: { width: number; height: number };
}

/**
 * Fetch a listing photo. ANY failure resolves to null so the caller can abort
 * the whole post rather than publish a carousel with a hole in it — never a
 * placeholder image (handoff §5, "Empty Apify run").
 */
export async function fetchPhoto(url: string, timeoutMs = 10_000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Compose the card's SVG over an already-encoded PNG photo (base64). Exported
 * so a test can assert the burned-in text without rasterizing.
 *
 * Layout, bottom-anchored: a scrim band carrying the address, the locality, and
 * the spec chips, plus — on the cover only — the price. A slide counter ("2/4")
 * sits top-right so the four cards read as one set.
 */
export function composeListingCardSvg(args: {
  card: CarouselCard;
  photoPngBase64: string;
  format: SocialFormat;
}): string {
  const { card, format } = args;
  const { width, height } = SOCIAL_FORMATS[format];
  const pad = margin(format);
  const scrimOn = BRAND.deep;

  const addr = typeStyle("title", format);
  const meta = typeStyle("body", format);
  const chip = typeStyle("label", format);

  const specLine = card.specs.join("  ·  ");
  const hasPrice = card.role === "cover" && !!card.price;

  // Scrim height = what the text stack actually needs, not a guessed fraction.
  const stack =
    addr.lineHeight + (card.locality ? meta.lineHeight : 0) + (specLine ? chip.lineHeight + 14 : 0);
  const scrimH = stack + pad * 2;
  const scrimY = height - scrimH;

  const layers: string[] = [];

  // 1. The photo, full-bleed. `slice` == CSS object-fit: cover.
  layers.push(
    `<image x="0" y="0" width="${width}" height="${height}" ` +
      `preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${args.photoPngBase64}"/>`,
  );

  // 2. The scrim. A soft gradient fades the photo into an opaque band so the
  //    band never looks pasted on; the text sits on the opaque part only.
  layers.push(
    `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${esc(scrimOn)}" stop-opacity="0"/>` +
      `<stop offset="0.55" stop-color="${esc(scrimOn)}" stop-opacity="0.88"/>` +
      `<stop offset="1" stop-color="${esc(scrimOn)}" stop-opacity="0.97"/>` +
      `</linearGradient></defs>`,
  );
  const fadeH = Math.round(height * 0.22);
  layers.push(
    `<rect x="0" y="${scrimY - fadeH}" width="${width}" height="${fadeH + scrimH}" fill="url(#scrim)"/>`,
  );

  // 3. Accent rule — the brand marker every card in the system carries.
  layers.push(
    `<rect x="${pad}" y="${scrimY + Math.round(pad * 0.35)}" width="${Math.round(width * 0.11)}" ` +
      `height="8" rx="4" fill="${esc(decor("dark"))}"/>`,
  );

  let y = scrimY + pad + addr.fontSize;

  // 4. Address — the operator asked for it ON the card.
  layers.push(
    `<text x="${pad}" y="${y}" font-size="${addr.fontSize}" font-weight="${addr.fontWeight}" ` +
      `fill="${esc(ink("title", "dark", scrimOn))}" font-family="${CANVAS_FONT}">${esc(clip(card.address, 30))}</text>`,
  );

  // 4b. Price, right-aligned on the address line — cover slide only.
  if (hasPrice) {
    layers.push(
      `<text x="${width - pad}" y="${y}" text-anchor="end" font-size="${addr.fontSize}" ` +
        `font-weight="${addr.fontWeight}" fill="${esc(accent("title", "dark", scrimOn))}" ` +
        `font-family="${CANVAS_FONT}">${esc(card.price!)}</text>`,
    );
  }

  // 5. Locality.
  if (card.locality) {
    y += meta.lineHeight;
    layers.push(
      `<text x="${pad}" y="${y}" font-size="${meta.fontSize}" font-weight="${meta.fontWeight}" ` +
        `fill="${esc(ink("body", "dark", scrimOn))}" font-family="${CANVAS_FONT}">${esc(clip(card.locality, 42))}</text>`,
    );
  }

  // 6. Spec chips — deterministic, and absent entirely when the record had none.
  if (specLine) {
    y += chip.lineHeight + 14;
    layers.push(
      `<text x="${pad}" y="${y}" font-size="${chip.fontSize}" font-weight="${chip.fontWeight}" ` +
        `fill="${esc(ink("label", "dark", scrimOn))}" font-family="${CANVAS_FONT}">${esc(clip(specLine, 56))}</text>`,
    );
  }

  // 7. Slide counter, top-right — makes the four cards read as one carousel.
  const counterW = 116;
  const pillH = chip.lineHeight + 16;
  layers.push(
    `<rect x="${width - pad - counterW}" y="${pad - 6}" width="${counterW}" height="${pillH}" ` +
      `rx="${Math.round(pillH / 2)}" fill="${esc(scrimOn)}" fill-opacity="0.72"/>`,
  );
  layers.push(
    `<text x="${width - pad - counterW / 2}" y="${pad + chip.fontSize + 2}" text-anchor="middle" ` +
      `font-size="${chip.fontSize}" font-weight="${chip.fontWeight}" ` +
      `fill="${esc(ink("label", "dark", scrimOn))}" font-family="${CANVAS_FONT}">${card.index}/${card.total}</text>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${layers.join("")}</svg>`
  );
}

/**
 * Render one carousel slide to Bluesky-ready JPEG bytes.
 *
 * Returns null when the photo cannot be fetched, decoded, or squeezed under the
 * blob ceiling — the caller aborts the post. It never substitutes a placeholder.
 */
export async function renderListingCard(
  card: CarouselCard,
  opts: { format?: SocialFormat; photoBytes?: Buffer } = {},
): Promise<RenderedCard | null> {
  const format = opts.format ?? "square";
  const { width, height } = SOCIAL_FORMATS[format];

  const raw = opts.photoBytes ?? (await fetchPhoto(card.photoUrl));
  if (!raw) return null;

  let photoPng: Buffer;
  try {
    photoPng = await sharp(raw)
      .resize(width, height, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
  } catch {
    return null; // undecodable vendor image — abort, never a placeholder.
  }

  const svg = composeListingCardSvg({
    card,
    photoPngBase64: photoPng.toString("base64"),
    format,
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

  // PNG → JPEG, stepping quality down until it clears the blob ceiling.
  let encoded: Buffer | null = null;
  for (const quality of QUALITY_LADDER) {
    encoded = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (encoded.length <= MAX_BLOB_BYTES) break;
  }
  if (!encoded || encoded.length > MAX_BLOB_BYTES) return null;

  return {
    bytes: new Uint8Array(encoded),
    mime: "image/jpeg",
    alt: card.alt,
    aspectRatio: { width, height },
  };
}
