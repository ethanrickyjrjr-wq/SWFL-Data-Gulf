// lib/landing/campaign-demo.ts
//
// Pure builder for the homepage centerpiece (spec 2026-07-12-homepage-one-site-design.md
// §v2): the "watch it build" sequence assembles a Market Update for a REAL place from
// the SAME live rows the map renders — no second data path, no invented figure, no
// fabricated street address (the legacy fake-address demo was purged 07/09/2026; a
// place name from static geography + live per-ZIP rows is the only honest subject).
//
// Subject pick: the busiest live market right now (top active-listings ZIP) so the
// demo self-updates with the lake; falls back to the top-value ZIP. Returns null when
// the value metric is missing or riding the sample fixture — the caller renders no
// centerpiece at all rather than demo sample numbers as the product.

export interface DemoMetricIn {
  data: Record<string, number>;
  asOf?: string;
  sample?: boolean;
}

export interface CampaignDemoFigure {
  label: string;
  value: string;
  /** e.g. "Zillow ZHVI · 05/01/2026" — each figure carries its own stamp. */
  source: string;
}

export interface CampaignDemo {
  zip: string;
  place: string;
  /** What the demo bar "types" — a real place, never a minted address. */
  typed: string;
  subject: string;
  figures: CampaignDemoFigure[];
}

const usdFull = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function topZip(metric: DemoMetricIn | undefined): string | null {
  if (!metric || metric.sample) return null;
  let best: string | null = null;
  let bestVal = -Infinity;
  for (const [zip, val] of Object.entries(metric.data)) {
    if (val > bestVal) {
      best = zip;
      bestVal = val;
    }
  }
  return best;
}

const stamp = (source: string, asOf?: string) => (asOf ? `${source} · ${asOf}` : source);

export function buildCampaignDemo(inputs: {
  value?: DemoMetricIn;
  activity?: DemoMetricIn;
  dom?: DemoMetricIn;
  placeNames: Record<string, string>;
}): CampaignDemo | null {
  const { value, activity, dom, placeNames } = inputs;
  if (!value || value.sample || Object.keys(value.data).length === 0) return null;

  // Busiest live market first; it must also hold a value figure (the anchor row).
  const busiest = topZip(activity);
  const zip = busiest && value.data[busiest] !== undefined ? busiest : topZip(value);
  if (!zip) return null;

  const place = placeNames[zip] ?? zip;
  const figures: CampaignDemoFigure[] = [
    {
      label: "Median home value",
      value: usdFull(value.data[zip]),
      source: stamp("Zillow ZHVI", value.asOf),
    },
  ];
  const listings = activity && !activity.sample ? activity.data[zip] : undefined;
  if (listings !== undefined) {
    figures.push({
      label: "Active listings",
      value: listings.toLocaleString("en-US"),
      source: stamp("SWFL Data Gulf", activity?.asOf),
    });
  }
  const domDays = dom && !dom.sample ? dom.data[zip] : undefined;
  if (domDays !== undefined) {
    figures.push({
      label: "Days on market",
      value: `${Math.round(domDays)} days`,
      source: stamp("realtor.com", dom?.asOf),
    });
  }

  return {
    zip,
    place,
    typed: place === zip ? zip : `${place}, FL`,
    subject: place === zip ? `This week in ${zip}` : `This week in ${place} (${zip})`,
    figures,
  };
}
