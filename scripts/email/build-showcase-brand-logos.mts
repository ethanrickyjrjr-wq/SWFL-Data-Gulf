// scripts/email/build-showcase-brand-logos.mts
//
// THREE showcase wordmark logos, rasterized from inline SVG via sharp (already a
// dependency — no paid logo vendor, Logo.dev is killed by decree). Each is a simple
// letter-spaced wordmark + one thin rule, light-on-dark (every showcase HeaderBlock
// renders on a dark brand bg), rendered at 2x the HeaderBlock's display box
// (≤42px tall × ≤180px wide) so it downscales crisply instead of upscaling soft.
//
// Run once: `bun scripts/email/build-showcase-brand-logos.mts`. Output PNGs are
// committed artifacts (transparent background), then wired as the RELATIVE
// "assets/<file>.png" path into the brand token objects that build the showcase
// HTML (build-showcase-lifecycle-extras.mts) — HeaderBlock's `logoUrl` reads it.
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import sharp from "sharp";

const W = 360; // 2x the ≤180px display width
const H = 84; // 2x the ≤42px display height

interface LogoSpec {
  outFile: string;
  svg: string;
}

/** Latitude 26 Estates — serif wordmark, gold on transparent (Latitude palette). */
const LATITUDE_26: LogoSpec = {
  outFile: "public/showcase/listing-to-close/live/assets/latitude26-logo.png",
  svg: `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${W / 2}" y="40" text-anchor="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="32" font-weight="600"
            letter-spacing="2" fill="#C7A45C">LATITUDE 26</text>
      <rect x="${W / 2 - 60}" y="52" width="120" height="1" fill="#C7A45C" opacity="0.7"/>
      <text x="${W / 2}" y="70" text-anchor="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="13"
            letter-spacing="7" fill="#C7A45C">E S T A T E S</text>
    </svg>
  `,
};

/** Cast & Coast Realty — bold sans wordmark, light teal on transparent. */
const CAST_COAST: LogoSpec = {
  outFile: "public/showcase/back-on-market/live/assets/castcoast-logo.png",
  svg: `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${W / 2}" y="42" text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700"
            letter-spacing="1" fill="#BFE7EA">CAST &amp; COAST</text>
      <rect x="${W / 2 - 50}" y="52" width="100" height="1" fill="#BFE7EA" opacity="0.7"/>
      <text x="${W / 2}" y="70" text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700"
            letter-spacing="8" fill="#BFE7EA">R E A L T Y</text>
    </svg>
  `,
};

/** Meridian South Advisory — letter-spaced sans wordmark, warm off-white + a small
 *  burnt-orange accent rule. */
const MERIDIAN_SOUTH: LogoSpec = {
  outFile: "public/showcase/community-info/live/assets/meridian-logo.png",
  svg: `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${W / 2}" y="40" text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700"
            letter-spacing="3" fill="#F3E2D8">MERIDIAN SOUTH</text>
      <rect x="${W / 2 - 22}" y="51" width="44" height="2" fill="#C4551A"/>
      <text x="${W / 2}" y="70" text-anchor="middle"
            font-family="Arial, Helvetica, sans-serif" font-size="12"
            letter-spacing="7" fill="#F3E2D8">A D V I S O R Y</text>
    </svg>
  `,
};

async function render(spec: LogoSpec): Promise<void> {
  mkdirSync(dirname(spec.outFile), { recursive: true });
  const png = await sharp(Buffer.from(spec.svg)).png().toBuffer();
  writeFileSync(spec.outFile, png);
  const meta = await sharp(png).metadata();
  console.log(`wrote ${spec.outFile} (${meta.width}x${meta.height}, ${png.length} bytes)`);
}

for (const spec of [LATITUDE_26, CAST_COAST, MERIDIAN_SOUTH]) {
  await render(spec);
}

console.log("\ndone");
