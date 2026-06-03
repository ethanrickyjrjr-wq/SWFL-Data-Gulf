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
    ? [
        question(
          `What is the ${display.title} outlook for Southwest Florida?`,
          display.conclusion,
        ),
      ]
    : [];
  const faqEntries = [
    ...introQ,
    ...display.metrics
      .slice(0, introQ.length ? 7 : 8)
      .map((m) =>
        question(
          `What is ${m.label} in Southwest Florida?`,
          `${m.value} (${m.direction}). Source: ${m.sourceLabel}. As of ${display.freshnessToken}.`,
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

export function corridorJsonLd(
  corridor: CorridorNormalized,
  freshnessToken: string,
  displayName: string,
): object[] {
  // `corridor.name` is the DB join key — NEVER user-facing. The page already
  // computes the safe label via `displayNameFor`; require it as an arg so this
  // helper can never leak the raw slug into public JSON-LD.
  const displayN = displayName;

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
        `${corridor.cap_rate_pct}%${corridor.cap_rate_direction ? ` (${corridor.cap_rate_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  if (corridor.vacancy_rate_pct !== null) {
    faqEntries.push(
      question(
        `What is the vacancy rate on ${displayN} in Southwest Florida?`,
        `${corridor.vacancy_rate_pct}%${corridor.vacancy_rate_direction ? ` (${corridor.vacancy_rate_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  if (corridor.asking_rent_psf !== null) {
    faqEntries.push(
      question(
        `What is the asking rent per square foot on ${displayN}?`,
        `$${corridor.asking_rent_psf} PSF (triple-net)${corridor.asking_rent_psf_direction ? ` (${corridor.asking_rent_psf_direction})` : ""}. As of ${freshnessToken}.`,
      ),
    );
  }

  if (corridor.absorption_sqft !== null) {
    faqEntries.push(
      question(
        `What is the net absorption on ${displayN}?`,
        `${corridor.absorption_sqft.toLocaleString()} sqft${corridor.absorption_sqft_direction ? ` (${corridor.absorption_sqft_direction})` : ""}. As of ${freshnessToken}.`,
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
