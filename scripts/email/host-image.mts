/**
 * scripts/email/host-image.mts — fetch (or read) a PNG and host it on the public
 * `email-media` bucket. Companion to databrief-chart.mts for NON-chart email
 * imagery (e.g. a Mapbox Static Images aerial fetched server-side so no token
 * ever appears in a delivered email).
 *
 *   bun scripts/email/host-image.mts <http-url-or-local-path> <storage-key>
 *
 * Prints ONE JSON line: {"url": "...", "bytes": N}. Storage keys are immutable
 * for a year (max-age=31536000) — content-stamp the key, never reuse one.
 */
import { readFile } from "node:fs/promises";
import { hostEmailPng, svgToPng } from "@/lib/email/chart-image";

const [src, key] = process.argv.slice(2);
if (!src || !key) {
  console.error("usage: bun scripts/email/host-image.mts <url-or-path> <storage-key>");
  process.exit(1);
}

let png: Buffer;
if (/^https?:\/\//.test(src)) {
  // MAPBOX_TOKEN is URL-restricted; server-side fetches pass the allowed origin
  // as Referer (same pattern as lib/geo/geocode-address.ts).
  const res = await fetch(src, { headers: { Referer: "https://www.swfldatagulf.com/" } });
  if (!res.ok) {
    console.error(
      `fetch failed: HTTP ${res.status} for ${src.replace(/access_token=[^&]+/, "access_token=***")}`,
    );
    process.exit(1);
  }
  png = Buffer.from(await res.arrayBuffer());
} else if (src.endsWith(".svg")) {
  // Rasterize with a TRANSPARENT background (email logos sit on colored bands).
  png = svgToPng(await readFile(src, "utf8"), { background: "rgba(0,0,0,0)", scale: 0.5 });
} else {
  png = await readFile(src);
}
if (png.length === 0) {
  console.error("0-byte image — refusing to host");
  process.exit(1);
}

const url = await hostEmailPng(key, png);
console.log(JSON.stringify({ url, bytes: png.length }));
