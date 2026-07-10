// scripts/outreach/pilot-lib.mts
//
// Pure mapping from Brandfetch Brand API v2 payloads to candidate BrandFixture files.
// Endpoint verified live 07/10/2026 (docs.brandfetch.com/brand-api/overview):
//   GET https://api.brandfetch.io/v2/brands/domain/{domain} · Bearer auth
//   response skeleton: { name, domain, logos:[{formats:[{src,background,…}]}],
//                        colors:[{hex,…}], fonts:[{name}], qualityScore }
// The reference page ELIDES enum/tag fields (logo/color `type` discriminators) —
// mapping rules below prefer type:"brand"/"accent" when present and fall back to
// array order. PIN these against scripts/outreach/__fixtures__/brandfetch-sample.json
// (a real quota-free probe of brandfetch.com's own brand) once brandfetch_key lands.
//   primary  = color marked type:"brand" if the field exists, else colors[0]
//   accent   = next distinct color (type:"accent" preferred when present)
//   logo_url = first logos[] format src, preferring SVG/PNG with transparent background
//   confidence = qualityScore clamped to [0.3, 0.7] — "api" NEVER exceeds 0.7 (spec cap)
// No colors → null. We never invent a palette.
import type { BrandFixture } from "@/lib/email/outreach/brand-fixtures";

export interface BrandfetchBrand {
  name?: string;
  domain?: string;
  logos?: {
    type?: string;
    theme?: string;
    formats?: { src?: string; format?: string; background?: string }[];
  }[];
  colors?: { hex?: string; type?: string; brightness?: number }[];
  fonts?: { name?: string }[];
  qualityScore?: number;
}

export function slugFromDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]!
    .split(".")
    .slice(0, -1)
    .join("-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function mapToCandidateFixture(
  raw: BrandfetchBrand,
  opts: { slug: string; dbprName?: string },
): BrandFixture | null {
  const colors = (raw.colors ?? []).filter((c) => typeof c.hex === "string" && HEX6.test(c.hex));
  if (colors.length === 0) return null;
  const primary = colors.find((c) => c.type === "brand") ?? colors[0]!;
  const accent =
    colors.find((c) => c !== primary && c.type === "accent") ?? colors.find((c) => c !== primary);

  let logoUrl: string | null = null;
  for (const logo of raw.logos ?? []) {
    for (const f of logo.formats ?? []) {
      if (!f.src) continue;
      if (!logoUrl) logoUrl = f.src;
      if (f.background === "transparent" && (f.src.endsWith(".svg") || f.src.endsWith(".png"))) {
        logoUrl = f.src;
        break;
      }
    }
  }

  // qualityScore range unconfirmed (reference shows a bare number placeholder) —
  // treat values > 1 as a 0..100 scale. Re-pin from the probe fixture when it lands.
  const rawQuality = typeof raw.qualityScore === "number" ? raw.qualityScore : 0.5;
  const quality = rawQuality > 1 ? rawQuality / 100 : rawQuality;
  const confidence = Math.min(0.7, Math.max(0.3, Math.round(quality * 100) / 100));

  return {
    slug: opts.slug,
    company_name: raw.name ?? opts.slug,
    ...(raw.domain ? { domain: raw.domain } : {}),
    ...(opts.dbprName ? { dbpr_name: opts.dbprName } : {}),
    brand: {
      status: "api",
      palette: {
        primaryColor: primary.hex!,
        ...(accent?.hex ? { accentColor: accent.hex } : {}),
      },
      confidence,
      logo_url: logoUrl,
      source_url: `https://api.brandfetch.io/v2/brands/domain/${raw.domain ?? opts.slug} (fetched ${new Date().toISOString().slice(0, 10)})`,
      ...(raw.fonts?.length
        ? { fonts: raw.fonts.map((f) => f.name).filter((n): n is string => !!n) }
        : {}),
      notes: "Brandfetch Brand API candidate — crawl4ai-verify before emailing this brokerage.",
    },
  };
}
