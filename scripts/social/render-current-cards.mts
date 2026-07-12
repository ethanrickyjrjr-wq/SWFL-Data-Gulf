// scripts/social/render-current-cards.mts
//
// HANDOFF ARTIFACT GENERATOR (not a product path). Renders the CURRENT social
// card visual language to real PNGs so Claude Design can see the baseline it's
// elevating from. Uses the live engine renderer (`renderSocialImage`, resvg) —
// no new renderer, no browser. Sample stats are REAL, sourced lake figures
// (Zillow ZHVI, ~05/2026) — never invented (RULE 1).
//
// Run:  bun scripts/social/render-current-cards.mts
// Out:  docs/handoff/assets/2026-07-11-socials/current-cards/*.png
import { promises as fs } from "node:fs";
import path from "node:path";
import { renderSocialImage } from "@/lib/social/render-social-image";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";
import type { SocialModel } from "@/lib/social/render-social-image";

const OUT = path.join(process.cwd(), "docs/handoff/assets/2026-07-11-socials/current-cards");

// SWFL house theme (matches resolveTheme's default). accent #3DC9C0 is the ENGINE
// house accent — the lab templates.ts default is #0ea5b7; this divergence is
// flagged in the brief. logo passed as local bytes so it always shows (no network).
const HOUSE = { primary: "#0f1d24", accent: "#3DC9C0", logoUrl: null as string | null };

// Real, sourced sample models (Zillow Home Value Index, latest period ~05/31/2026).
const MODELS: { name: string; model: SocialModel }[] = [
  {
    name: "naples-value",
    model: {
      headline: "What a typical home costs in Naples right now",
      stat: {
        label: "typical home value",
        value: "$1.31M",
        caption: "34102 · down 4.0% year over year",
      },
      source: "Zillow Home Value Index",
      as_of: "2026-05-31",
    },
  },
  {
    name: "fmb-oneyear",
    model: {
      headline: "Fort Myers Beach, one year later",
      stat: {
        label: "typical home value",
        value: "$494K",
        caption: "33931 · down 7.3% year over year",
      },
      source: "Zillow Home Value Index",
      as_of: "2026-05-31",
    },
  },
  {
    name: "headline-only",
    model: {
      headline: "The Fort Myers market in one number — coming this week",
      source: "SWFL Data Gulf",
      as_of: "2026-05-31",
    },
  },
];

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const logoBuffer = await fs
    .readFile(path.join(process.cwd(), "public/logo-mark.png"))
    .catch(() => null);
  const formats = Object.keys(SOCIAL_FORMATS) as SocialFormat[];
  let n = 0;
  for (const { name, model } of MODELS) {
    for (const format of formats) {
      const png = await renderSocialImage({
        model,
        theme: HOUSE,
        format,
        logoBuffer,
        now: new Date("2026-07-11"),
      });
      const file = path.join(OUT, `${name}--${format}.png`);
      await fs.writeFile(file, png);
      n++;
      console.log(
        `  ${path.relative(process.cwd(), file)}  (${SOCIAL_FORMATS[format].width}x${SOCIAL_FORMATS[format].height})`,
      );
    }
  }
  console.log(`\n${n} cards → ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
