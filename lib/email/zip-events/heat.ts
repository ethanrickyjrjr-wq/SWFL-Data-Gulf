// lib/email/zip-events/heat.ts
//
// Deterministic market-area heat rank (spec: "the signature block"). Score =
// fixed weights over normalized ranks of pace (median DOM trend — falling is
// hotter), tightness (sale-to-list ratio — higher is hotter), momentum (price +
// sold-count movement — higher is hotter). All fields from held snapshots.
// Research grounding: realtor.com hottest-ZIPs = demand(views, NOT held) +
// pace(held) — this rank is OUR lake-derived variant, named and cited as ours,
// never presented as realtor.com's. Ranked within Lee + Collier only.

import type { MarketArea } from "./market-areas";
import type { MarketEvent, ZipMetricsSnapshot } from "./types";

export const HEAT_WEIGHTS = { pace: 0.4, tightness: 0.3, momentum: 0.3 }; // [PROVISIONAL]
export const HEAT_TOP_N = 3; // [PROVISIONAL] county top-3 membership drives heat-shift

const SOURCE_HEAT = "SWFL Data Gulf market-area heat rank";

export interface AreaHeatInput {
  area_id: string;
  absorption_rate_pct: number | null;
  sale_to_list_ratio: number | null;
  price_momentum_pct: number | null;
  sold_momentum_pct: number | null;
}

export interface AreaHeatRank {
  area_id: string;
  position: number; // 1 = hottest
  score: number;
}

function avg(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Average member-ZIP heat fields. A component with ≥1 contributing ZIP is held;
 *  an area where EVERY component is null returns null (excluded from the rank). */
export function areaHeatInputs(
  area: MarketArea,
  snaps: Map<string, ZipMetricsSnapshot>,
): AreaHeatInput | null {
  const members = area.zips.map((z) => snaps.get(z)).filter((s): s is ZipMetricsSnapshot => !!s);
  const pick = (f: (h: ZipMetricsSnapshot["heat"]) => number | null) =>
    avg(members.map((m) => f(m.heat)).filter((v): v is number => v != null));
  const out: AreaHeatInput = {
    area_id: area.area_id,
    absorption_rate_pct: pick((h) => h.absorption_rate_pct),
    sale_to_list_ratio: pick((h) => h.sale_to_list_ratio),
    price_momentum_pct: pick((h) => h.price_momentum_pct),
    sold_momentum_pct: pick((h) => h.sold_momentum_pct),
  };
  const anyHeld =
    out.absorption_rate_pct != null ||
    out.sale_to_list_ratio != null ||
    out.price_momentum_pct != null ||
    out.sold_momentum_pct != null;
  return anyHeld ? out : null;
}

/** Normalized-rank score. TWO missing-data rules, different scopes:
 *  • An area missing a component OTHER areas hold is EXCLUDED (spec:
 *    missing-input areas excluded, not zero-filled) — a partial score would
 *    silently reweight the formula BETWEEN areas.
 *  • A component NO area holds is DROPPED from the formula for everyone and the
 *    remaining weights renormalize — a uniform formula is not a reweighting
 *    between areas. Why: momentum needs the PREVIOUS 30-day sold window, and the
 *    lake's transition history starts 07/02/2026 (probed live 07/20/2026: 3
 *    prev-window sales region-wide) — demanding it ranked ZERO of 19 areas and
 *    silently blanked the weekly's heat leaderboard. Momentum re-enters the
 *    formula automatically once ~60 days of history exist. */
export function rankAreaHeat(inputs: AreaHeatInput[]): AreaHeatRank[] {
  const momentumOf = (i: AreaHeatInput): number | null =>
    i.price_momentum_pct != null && i.sold_momentum_pct != null
      ? i.price_momentum_pct + i.sold_momentum_pct
      : null;
  const held = {
    pace: inputs.some((i) => i.absorption_rate_pct != null),
    tightness: inputs.some((i) => i.sale_to_list_ratio != null),
    momentum: inputs.some((i) => momentumOf(i) != null),
  };
  if (!held.pace && !held.tightness && !held.momentum) return [];

  const complete = inputs.filter(
    (i) =>
      (!held.pace || i.absorption_rate_pct != null) &&
      (!held.tightness || i.sale_to_list_ratio != null) &&
      (!held.momentum || momentumOf(i) != null),
  );
  if (complete.length === 0) return [];

  // rank01: 1 = best in field for this component, 0 = worst; deterministic.
  const rank01 = (vals: number[], v: number, higherIsHotter: boolean): number => {
    const sorted = [...vals].sort((a, b) => (higherIsHotter ? b - a : a - b));
    const pos = sorted.indexOf(v);
    return sorted.length === 1 ? 1 : 1 - pos / (sorted.length - 1);
  };
  const paces = complete.map((i) => i.absorption_rate_pct).filter((v): v is number => v != null);
  const ratios = complete.map((i) => i.sale_to_list_ratio).filter((v): v is number => v != null);
  const momenta = complete.map(momentumOf).filter((v): v is number => v != null);

  const totalWeight =
    (held.pace ? HEAT_WEIGHTS.pace : 0) +
    (held.tightness ? HEAT_WEIGHTS.tightness : 0) +
    (held.momentum ? HEAT_WEIGHTS.momentum : 0);

  const scored = complete.map((i) => {
    let score = 0;
    if (held.pace) {
      score += HEAT_WEIGHTS.pace * rank01(paces, i.absorption_rate_pct as number, true); // faster absorption = hot
    }
    if (held.tightness) {
      score += HEAT_WEIGHTS.tightness * rank01(ratios, i.sale_to_list_ratio as number, true);
    }
    if (held.momentum) {
      score += HEAT_WEIGHTS.momentum * rank01(momenta, momentumOf(i) as number, true);
    }
    return { area_id: i.area_id, score: score / totalWeight };
  });
  scored.sort((a, b) => b.score - a.score || a.area_id.localeCompare(b.area_id));
  return scored.map((s, idx) => ({ ...s, position: idx + 1 }));
}

export function detectHeatShift(
  prevRanks: AreaHeatRank[],
  freshRanks: AreaHeatRank[],
): MarketEvent[] {
  if (prevRanks.length === 0) return []; // first run — fail closed
  const prevTop = new Set(prevRanks.filter((r) => r.position <= HEAT_TOP_N).map((r) => r.area_id));
  const freshTop = new Set(
    freshRanks.filter((r) => r.position <= HEAT_TOP_N).map((r) => r.area_id),
  );
  const events: MarketEvent[] = [];
  for (const r of freshRanks) {
    const was = prevTop.has(r.area_id);
    const is = freshTop.has(r.area_id);
    if (was === is) continue;
    const prevPos = prevRanks.find((p) => p.area_id === r.area_id)?.position ?? null;
    events.push({
      type: "heat_shift",
      grain: "area",
      area_id: r.area_id,
      class: "weekly",
      facts: [
        {
          label: "Heat rank",
          from: prevPos,
          to: r.position,
          value: r.position,
          unit: "",
          source: SOURCE_HEAT,
        },
      ],
    });
  }
  return events;
}
