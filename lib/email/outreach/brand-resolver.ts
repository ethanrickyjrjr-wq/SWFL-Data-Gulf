// lib/email/outreach/brand-resolver.ts
//
// Fixture-first brand resolution for outreach. Wraps the CampaignDeps.enrich seam:
// curated fixture (>= fixtureTrust) → live scrape → weaker fixture → scrape as-is.
// composeCampaign is untouched; provenance rides BrandEnrichment.source as
// `fixture:<slug>` and surfaces in the run report's brandSource column.
import type { BrandEnrichment } from "@/lib/prospects/enrich-brand";
import type { BrandFixture } from "./brand-fixtures";
import { normalizeDomain } from "./targets";

export interface ResolverOpts {
  fixtures: BrandFixture[];
  liveEnrich: (domain: string) => Promise<BrandEnrichment>;
  /** Fixture confidence at/above which we trust it outright (no scrape). Default 0.75. */
  fixtureTrust?: number;
  /** Scrape confidence at/above which a scrape beats a weak fixture. Default 0.5. */
  scrapeTrust?: number;
}

function fixtureToEnrichment(f: BrandFixture): BrandEnrichment {
  return {
    primary: f.brand.palette.primaryColor,
    secondary: f.brand.palette.accentColor ?? null,
    logo_url: f.brand.logo_url ?? null,
    confidence: f.brand.confidence,
    source: `fixture:${f.slug}`,
    company_name: f.company_name,
  };
}

export function makeFixtureFirstEnrich(
  opts: ResolverOpts,
): (domain: string) => Promise<BrandEnrichment> {
  const fixtureTrust = opts.fixtureTrust ?? 0.75;
  const scrapeTrust = opts.scrapeTrust ?? 0.5;
  const byDomain = new Map<string, BrandFixture>();
  for (const f of opts.fixtures) {
    const key = f.domain ? normalizeDomain(f.domain) : undefined;
    if (key) byDomain.set(key, f);
  }

  return async (domain: string): Promise<BrandEnrichment> => {
    const key = normalizeDomain(domain);
    const fixture = key ? byDomain.get(key) : undefined;

    if (fixture && fixture.brand.confidence >= fixtureTrust) {
      return fixtureToEnrichment(fixture);
    }
    const live = await opts.liveEnrich(domain);
    if (live.confidence >= scrapeTrust && live.primary) return live;
    if (fixture && fixture.brand.confidence > live.confidence) {
      return fixtureToEnrichment(fixture);
    }
    return live;
  };
}
