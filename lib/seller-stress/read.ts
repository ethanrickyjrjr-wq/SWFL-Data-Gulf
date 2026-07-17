import type { BrainOutput, BrainOutputDirection } from "../../refinery/types/brain-output.mts";

export interface SellerStressDriver {
  key: string;
  label: string;
  value: string;
  note: string | null;
  isLeading: boolean;
}

export interface SellerStressRead {
  zip: string;
  place: string | null;
  scored: boolean;
  region: { direction: BrainOutputDirection; stateLabel: string; median: number };
  area: {
    score: number;
    rank: { position: number; total: number };
    vsMedian: "above" | "near" | "below";
  } | null;
  drivers: SellerStressDriver[];
  caveats: string[];
  headline: string;
  flipLine: string;
  actionable: string;
  source: { label: string; url: string; underlying: string };
  dataPeriod: string;
  refreshedAt: string;
}

// Relay the brain's own region direction as seller-plain words. NO absolute score
// re-banding — this is the only place the region's "how stressed" is stated, and it
// comes straight from the published direction.
export const REGION_STATE_LABEL: Record<BrainOutputDirection, string> = {
  bearish: "under elevated seller pressure right now",
  mixed: "sending mixed signals for sellers right now",
  neutral: "near its normal level for sellers right now",
  bullish: "in seller-favorable territory right now",
};

const NEAR_BAND = 3; // score points; within ±this of the region median reads "near"

interface StressRow {
  key: string;
  cells: Record<string, number | boolean | null>;
}

function scoreOf(row: StressRow): number | null {
  const v = row.cells["seller_stress_score"];
  return typeof v === "number" ? v : null;
}

export function buildSellerStressRead(input: {
  zip: string;
  place: string | null;
  output: BrainOutput;
  freshnessToken: string | null;
}): SellerStressRead | null {
  const { zip, place, output } = input;

  const table = output.detail_tables?.find((t) => t.id === "seller_stress_by_zip");
  if (!table) return null;
  const rows = table.rows as unknown as StressRow[];
  const row = rows.find((r) => r.key === zip);
  if (!row) return null; // ZIP not in the published table at all

  // Region median from the published key metric (never recomputed).
  const medianMetric = output.key_metrics?.find((m) => m.metric === "seller_stress_score_swfl");
  const median = typeof medianMetric?.value === "number" ? medianMetric.value : 0;

  const direction = output.direction as BrainOutputDirection;
  const region = { direction, stateLabel: REGION_STATE_LABEL[direction], median };

  const source = {
    label: "SWFL Data Gulf",
    url: "https://www.swfldatagulf.com/r/seller-stress/" + zip,
    underlying: "Redfin Data Center",
  };

  // Placeholders filled by Task 2 (drivers/caveats/dates/copy).
  const partial = {
    zip,
    place,
    region,
    drivers: [],
    caveats: [],
    headline: "",
    flipLine: "",
    actionable: "",
    source,
    dataPeriod: "",
    refreshedAt: "",
  };

  const myScore = scoreOf(row);
  if (myScore === null) {
    return { ...partial, scored: false, area: null };
  }

  const scored = rows.map(scoreOf).filter((v): v is number => v !== null);
  const total = scored.length;
  // position: 1 = most pressure (highest score). Ties share the higher (better) rank.
  const position = scored.filter((s) => s > myScore).length + 1;
  const vsMedian: "above" | "near" | "below" =
    Math.abs(myScore - median) <= NEAR_BAND ? "near" : myScore > median ? "above" : "below";

  return {
    ...partial,
    scored: true,
    area: { score: myScore, rank: { position, total }, vsMedian },
  };
}
