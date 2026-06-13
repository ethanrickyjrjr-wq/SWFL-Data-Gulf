import type { WelcomeAnswer, WelcomeFrame } from "@/lib/welcome/frames";

/**
 * Demo grounded answer — replayed through the REAL typed frame contract behind
 * `?demo=1` so the welcome UI ships and browser-smokes before the grounding
 * fan-out emits {type:"data"}. Values are real SWFL reads (Fort Myers Beach 33931
 * carries a $30,074/yr FEMA flood AAL), so even the demo honors no-invention, and
 * every metric carries its honest `coverage_label` — permits is modeled as a Lee
 * county aggregate to show the MOAT guard on a card (a county figure never reads
 * as a ZIP fact). The parallel backend swaps this fixture for dossier-derived
 * frames using this same shape (prettySource-cleaned sources + propagated labels).
 */

const ANSWER_33931: WelcomeAnswer = {
  freshness_token: "SWFL-7421-v5-20260522",
  place: { zip: "33931", name: "Fort Myers Beach, FL" },
  metrics: [
    {
      key: "home_value",
      label: "Median Value",
      value: 815000,
      display_format: "currency",
      direction: "rising",
      is_true_zip: true,
      coverage_label: "ZIP 33931",
      source: {
        domain: "redfin.com",
        url: "https://www.redfin.com/zipcode/33931/housing-market",
        as_of: "2026-05",
        citation: "Redfin Data Center — ZIP median sale price (All Residential)",
      },
    },
    {
      key: "rent",
      label: "Median Rent",
      value: 2850,
      display_format: "currency",
      units: "mo",
      direction: "rising",
      is_true_zip: true,
      coverage_label: "ZIP 33931",
      source: {
        domain: "zillow.com",
        url: "https://www.zillow.com/rental-manager/market-trends/33931/",
        as_of: "2026-05",
        citation: "Zillow Observed Rent Index (ZORI), ZIP 33931",
      },
    },
    {
      key: "flood_aal",
      label: "Flood AAL",
      value: 30074,
      display_format: "currency",
      units: "yr",
      direction: "rising",
      is_true_zip: true,
      coverage_label: "ZIP 33931",
      source: {
        domain: "fema.gov",
        url: "https://hazards.fema.gov/nri/expected-annual-loss",
        as_of: "2026-05",
        citation: "FEMA National Risk Index — expected annual flood loss, ZIP 33931",
      },
    },
    {
      key: "permits",
      label: "Permits (90d)",
      value: 1284,
      display_format: "count",
      units: "90d",
      direction: "stable",
      // Lee permits carry MAILING-grade ZIPs, so this is an honest county aggregate
      // that COVERS 33931 — never a per-ZIP claim. Its coverage_label says so.
      is_true_zip: false,
      coverage_label: "Lee county-wide — covers 33931",
      source: {
        domain: "leegov.com",
        url: "https://accela.leegov.com/",
        as_of: "2026-05",
        citation: "Lee County permits (Accela) — issued, trailing 90 days",
      },
    },
  ],
};

const SYNTHESIS =
  "Fort Myers Beach is still pricing in Ian: a high median value sits against a " +
  "$30,074/yr flood AAL, so carrying cost — not list price — is the swing factor here. " +
  "[INFERENCE, on the FEMA AAL] If 2026 insurance quotes keep climbing, that value " +
  "premium compresses; Lee permit volume is the rebuild signal to watch — a stall there " +
  "would falsify the recovery read.";

/** Split the synthesis into small chunks so the stream is visibly typed. */
function chunkProse(prose: string, wordsPerChunk = 4): string[] {
  const words = prose.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    out.push(
      words.slice(i, i + wordsPerChunk).join(" ") + (i + wordsPerChunk < words.length ? " " : ""),
    );
  }
  return out;
}

/** Re-label the fixture for a non-33931 demo ZIP (values are illustrative). */
function relabelForZip(answer: WelcomeAnswer, zip: string): WelcomeAnswer {
  return {
    ...answer,
    place: { zip, name: `ZIP ${zip}, SWFL` },
    metrics: answer.metrics.map((m) => ({
      ...m,
      coverage_label: m.coverage_label.replace("33931", zip),
    })),
  };
}

/**
 * The full typed frame sequence for a demo ZIP read, in contract order:
 * place (instant echo) → data (cards) → text×N (streamed synthesis) → done.
 */
export function demoFrames(zip: string): WelcomeFrame[] {
  const answer = zip === "33931" ? ANSWER_33931 : relabelForZip(ANSWER_33931, zip);
  return [
    { type: "place", place: answer.place },
    { type: "data", answer },
    ...chunkProse(SYNTHESIS).map((text): WelcomeFrame => ({ type: "text", text })),
    { type: "done" },
  ];
}
