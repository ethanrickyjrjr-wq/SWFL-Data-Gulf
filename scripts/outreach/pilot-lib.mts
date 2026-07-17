// scripts/outreach/pilot-lib.mts
//
// Mapping from Brandfetch Brand API v2 payloads to candidate BrandFixture files.
// The Brandfetch request shape + low-level response mapping (endpoint, auth,
// logo/color/font extraction) now live in lib/brand/brandfetch.ts (Task 11,
// ONE Brandfetch root — verified there via crawl4ai 07/16/2026 against
// docs.brandfetch.com/reference/brand-api-domain). This module delegates to
// that mapper and adds the outreach-pilot-specific layer on top:
// qualityScore → confidence, and "no colors → null candidate" (a candidate
// fixture with zero colors is useless as a brand identity here, even though
// the shared BrandKit tolerates a colorless partial result for other
// consumers, like the account brand-fill in app/api/switch/apply-forward).
//   confidence = qualityScore clamped to [0.3, 0.7] — "api" NEVER exceeds 0.7 (spec cap)
// No colors → null. We never invent a palette.
import type { BrandFixture } from "@/lib/email/outreach/brand-fixtures";
import { mapBrandfetchResponse, type BrandfetchBrand } from "@/lib/brand/brandfetch";

export type { BrandfetchBrand };

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

export function mapToCandidateFixture(
  raw: BrandfetchBrand,
  opts: { slug: string; dbprName?: string },
): BrandFixture | null {
  const kit = mapBrandfetchResponse(raw);
  if (kit.colors.length === 0) return null;
  const primary = kit.colors[0]!;
  const accent = kit.colors[1];

  // qualityScore is CONFIRMED "a score between 0-1" per the live reference
  // page (crawl4ai pass 07/16/2026) — kept defensive for a >1 value anyway,
  // cheap insurance against that documented range being wrong in practice.
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
        primaryColor: primary,
        ...(accent ? { accentColor: accent } : {}),
      },
      confidence,
      logo_url: kit.logoUrl,
      source_url: `https://api.brandfetch.io/v2/brands/domain/${raw.domain ?? opts.slug} (fetched ${new Date().toISOString().slice(0, 10)})`,
      ...(raw.fonts?.length ? { fonts: kit.fonts } : {}),
      notes: "Brandfetch Brand API candidate — crawl4ai-verify before emailing this brokerage.",
    },
  };
}
