import type { DisplayBrain } from "../refinery/render/speaker.mts";
import type { CorridorNormalized } from "../refinery/sources/cre-source.mts";

const SITE = "https://www.swfldatagulf.com";
const PUBLISHER = {
  "@type": "Organization",
  name: "SWFL Data Gulf",
  url: SITE,
};
const SPATIAL = {
  "@type": "Place",
  name: "Southwest Florida",
  containedInPlace: {
    "@type": "State",
    name: "Florida",
    containedInPlace: { "@type": "Country", name: "United States" },
  },
};

// Same brand entity as PUBLISHER — LLMs use consistent creator/publisher naming
// as an entity-clarity signal, so this string must never fork.
const CREATOR = { "@type": "Organization", name: "SWFL Data Gulf", url: SITE };

// Emit `license` ONLY if this resolves to a real page — asserting a license we
// don't publish is an invented fact. Set by Task 1 Step 1: /terms resolves
// (app/terms/page.tsx publishes usage terms), so point at it.
const LICENSE_URL = `${SITE}/terms`;

// Spatial detail for the two core counties — Dataset Search reads spatialCoverage
// to place the dataset; naming Lee + Collier is the geo-precision edge.
const SPATIAL_LEE_COLLIER = {
  ...SPATIAL,
  containsPlace: [
    { "@type": "AdministrativeArea", name: "Lee County, Florida" },
    { "@type": "AdministrativeArea", name: "Collier County, Florida" },
  ],
};

function question(name: string, text: string) {
  return {
    "@type": "Question",
    name,
    acceptedAnswer: { "@type": "Answer", text },
  };
}

export function brainJsonLd(display: DisplayBrain, slug: string): object[] {
  const dataset = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: display.title,
    description: display.scope,
    url: `${SITE}/r/${slug}`,
    dateModified: display.refinedAt,
    publisher: PUBLISHER,
    creator: CREATOR,
    isAccessibleForFree: true,
    ...(LICENSE_URL ? { license: LICENSE_URL } : {}),
    ...(display.refinedAt ? { temporalCoverage: display.refinedAt } : {}),
    spatialCoverage: SPATIAL,
    variableMeasured: display.metrics.map((m) => ({
      "@type": "PropertyValue",
      name: m.label,
      value: m.value,
      ...(m.sourceUrl ? { url: m.sourceUrl } : {}),
    })),
  };

  // `conclusion` is typed `string` but `sanitizeProse` can return "" for a
  // brand-new/empty brain. An empty acceptedAnswer.text invalidates the whole
  // FAQPage — so skip the intro Q when falsy and let metrics fill all 8 slots.
  const introQ = display.conclusion
    ? [question(`What is the ${display.title} outlook for Southwest Florida?`, display.conclusion)]
    : [];
  const faqEntries = [
    ...introQ,
    ...display.metrics
      .slice(0, introQ.length ? 7 : 8)
      .map((m) =>
        question(
          `What is ${m.label} in Southwest Florida?`,
          `${m.value} (${m.direction}). Source: ${m.sourceLabel}${m.sourceUrl ? ` (${m.sourceUrl})` : ""}. As of ${display.freshnessToken}.`,
        ),
      ),
  ].slice(0, 8);

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries,
  };

  return [dataset, faq];
}

/** Minimal figure shape the desk Dataset needs — mirrors the /desk zone
 *  contract ({label,value,unit?,sourceLabel,asOf}) without importing it. */
export interface DeskJsonLdFigure {
  label: string;
  value: number;
  unit?: string;
  sourceLabel: string;
  asOf?: string;
}

/**
 * Dataset JSON-LD for the /desk live terminal — deliberately MINIMAL (name,
 * publisher, spatial coverage, one PropertyValue per SSR'd figure). Spec B
 * (discovery flywheel) enriches this same hook with temporalCoverage /
 * license / distribution; wiring it from day 1 is the seam.
 */
export function deskJsonLd(
  figures: DeskJsonLdFigure[],
  dateModified?: string,
  temporalCoverage?: string,
): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "SWFL Data Desk — daily Southwest Florida housing market figures",
      description:
        "Daily-refreshed Southwest Florida market terminal: median asking price, active inventory, price-cut share, mortgage rate, and daily listing-flow counts for Lee and Collier County.",
      url: `${SITE}/desk`,
      ...(dateModified ? { dateModified } : {}),
      ...(temporalCoverage ? { temporalCoverage } : {}),
      isAccessibleForFree: true,
      publisher: PUBLISHER,
      creator: CREATOR,
      ...(LICENSE_URL ? { license: LICENSE_URL } : {}),
      spatialCoverage: SPATIAL_LEE_COLLIER,
      variableMeasured: figures.map((f) => ({
        "@type": "PropertyValue",
        name: f.label,
        value: f.value,
        ...(f.unit ? { unitText: f.unit } : {}),
      })),
    },
  ];
}

export function corridorJsonLd(
  corridor: CorridorNormalized,
  freshnessToken: string,
  displayName: string,
): object[] {
  // `corridor.name` is the DB join key — NEVER user-facing. The page already
  // computes the safe label via `displayNameFor`; require it as an arg so this
  // helper can never leak the raw slug into public JSON-LD.
  const displayN = displayName;

  // Per-metric provenance: each metric carries its own `*_source_url`, falling
  // back to the corridor-wide `source_url`. Embed it into the answer text only
  // when one actually exists (most corridors are pre-sourcing → no suffix).
  const sourceSuffix = (url: string | null) => (url ? ` Source: ${url}.` : "");

  const place = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: displayN,
    ...(corridor.character ? { description: corridor.character } : {}),
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: `${corridor.county} County, Florida`,
      containedInPlace: SPATIAL,
    },
  };

  const faqEntries: object[] = [];

  if (corridor.character) {
    faqEntries.push(
      question(
        `What is the commercial real estate market like on ${displayN}?`,
        corridor.character,
      ),
    );
  }

  if (corridor.cap_rate_pct !== null) {
    faqEntries.push(
      question(
        `What is the cap rate on ${displayN} in Southwest Florida?`,
        `${corridor.cap_rate_pct}%${corridor.cap_rate_direction ? ` (${corridor.cap_rate_direction})` : ""}. As of ${freshnessToken}.${sourceSuffix(corridor.cap_rate_source_url ?? corridor.source_url)}`,
      ),
    );
  }

  if (corridor.vacancy_rate_pct !== null) {
    faqEntries.push(
      question(
        `What is the vacancy rate on ${displayN} in Southwest Florida?`,
        `${corridor.vacancy_rate_pct}%${corridor.vacancy_rate_direction ? ` (${corridor.vacancy_rate_direction})` : ""}. As of ${freshnessToken}.${sourceSuffix(corridor.vacancy_rate_source_url ?? corridor.source_url)}`,
      ),
    );
  }

  if (corridor.asking_rent_psf !== null) {
    faqEntries.push(
      question(
        `What is the asking rent per square foot on ${displayN}?`,
        `$${corridor.asking_rent_psf} PSF (triple-net)${corridor.asking_rent_psf_direction ? ` (${corridor.asking_rent_psf_direction})` : ""}. As of ${freshnessToken}.${sourceSuffix(corridor.asking_rent_psf_source_url ?? corridor.source_url)}`,
      ),
    );
  }

  if (corridor.absorption_sqft !== null) {
    faqEntries.push(
      question(
        `What is the net absorption on ${displayN}?`,
        `${corridor.absorption_sqft.toLocaleString()} sqft${corridor.absorption_sqft_direction ? ` (${corridor.absorption_sqft_direction})` : ""}. As of ${freshnessToken}.${sourceSuffix(corridor.absorption_sqft_source_url ?? corridor.source_url)}`,
      ),
    );
  }

  // A FAQPage with zero questions is invalid Schema.org — most corridors are
  // pre-sourcing (no character, all metrics null), so emit Place-only then.
  if (faqEntries.length === 0) {
    return [place];
  }

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries,
  };

  return [place, faq];
}

/** Minimal shape the community JSON-LD needs — decoupled from the page's data
 *  module so this file stays import-light. `slug`/`label` are user-safe. */
export interface CommunityJsonLdInput {
  label: string;
  county: string | null;
  gated: boolean | null;
  golf_holes: number | null;
  hoa_fee_min: number | null;
  hoa_fee_max: number | null;
  home_count: number | null;
  source_url: string | null;
}

/**
 * `GatedResidenceCommunity` structured data for a marketed community page
 * (schema.org/GatedResidenceCommunity). Same Place + containedInPlace shape as
 * `corridorJsonLd`, plus an FAQ of the buy/no-buy headline facts (golf, fees,
 * home count) — each emitted only when the fact is actually present so an
 * empty seed never ships a hollow answer.
 */
export function communityJsonLd(community: CommunityJsonLdInput, freshnessToken: string): object[] {
  const sourceSuffix = (url: string | null) => (url ? ` Source: ${url}.` : "");
  const countyName = community.county ? `${community.county} County, Florida` : null;

  const place = {
    "@context": "https://schema.org",
    "@type": "GatedResidenceCommunity",
    name: community.label,
    ...(community.home_count != null ? { numberOfAccommodationUnits: community.home_count } : {}),
    containedInPlace: countyName
      ? {
          "@type": "AdministrativeArea",
          name: countyName,
          containedInPlace: SPATIAL,
        }
      : SPATIAL,
  };

  const faqEntries: object[] = [];
  if (community.golf_holes != null) {
    faqEntries.push(
      question(
        `Does ${community.label} have golf?`,
        `${community.label} has a ${community.golf_holes}-hole golf course. As of ${freshnessToken}.${sourceSuffix(community.source_url)}`,
      ),
    );
  }
  if (community.hoa_fee_min != null && community.hoa_fee_max != null) {
    faqEntries.push(
      question(
        `What are the HOA fees at ${community.label}?`,
        `HOA fees at ${community.label} range from $${community.hoa_fee_min.toLocaleString()} to $${community.hoa_fee_max.toLocaleString()}. As of ${freshnessToken}.${sourceSuffix(community.source_url)}`,
      ),
    );
  }
  if (community.home_count != null) {
    faqEntries.push(
      question(
        `How many homes are in ${community.label}?`,
        `${community.label} has ${community.home_count.toLocaleString()} homes. As of ${freshnessToken}.${sourceSuffix(community.source_url)}`,
      ),
    );
  }

  if (faqEntries.length === 0) return [place];

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries,
  };
  return [place, faq];
}
