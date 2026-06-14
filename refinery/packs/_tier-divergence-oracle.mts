/**
 * TEST-ONLY independent oracle for the tier-divergence view-parity test.
 *
 * Reimplements data_lake.tier_divergence_zip_latest from raw long rows of
 * data_lake.tier_divergence_swfl (zip × month, wide-on-tier). The parity test
 * diffs VIEW SQL == this independent TS implementation, so the view cannot drift
 * silently. Deliberately SELF-CONTAINED (own `median`/`lookback`/types) so it
 * shares zero code with production and cannot drift in lockstep with a bug.
 *
 * Leading `_`, no `.test.` in the name → `bun test` never collects it directly.
 *
 * Anchoring rule (mirrors the view): the per-ZIP anchor is the latest period where
 * BOTH tiers are present. ALL THREE YoY legs (spread, bottom, top) look back to
 * ±7 days of (anchor − 12 months) within their respective non-null series — the
 * spread leg in the both-present series, the tier legs in that tier's own series.
 */

// ── Raw row of data_lake.tier_divergence_swfl (self-contained copy) ───────────
export interface TierDivergenceRawRow {
  zip_code: string;
  /** ISO date "YYYY-MM-DD". */
  period_end: string;
  top_tier_value: number | null;
  bottom_tier_value: number | null;
  metro: string | null;
  county_name: string | null;
  city: string | null;
}

/** One row of the brain-input view (mirrors TierDivergenceZipLatestRow). */
export interface TierDivergenceZipSnapshot {
  zip_code: string;
  metro: string | null;
  county_name: string | null;
  city: string | null;
  latest_period: string;
  top_tier_value_latest: number;
  bottom_tier_value_latest: number;
  top_tier_value_3m_avg: number;
  bottom_tier_value_3m_avg: number;
  tier_spread_ratio: number;
  tier_spread_yoy_pct: number | null;
  bottom_tier_yoy_pct: number | null;
  top_tier_yoy_pct: number | null;
}

interface Obs {
  period_end: string;
  value: number;
}

/**
 * Return the observation within ±7 days of (anchorISO − monthsBack), choosing the
 * NEWEST such observation (MAX-within-window), or null if none. `observations` must
 * be sorted ascending by period_end. Mirrors the SQL `ORDER BY period_end DESC
 * LIMIT 1` inside a `BETWEEN target ± 7 days` window.
 */
function lookback(observations: Obs[], anchorISO: string, monthsBack: number): Obs | null {
  if (observations.length === 0) return null;
  const target = new Date(anchorISO);
  target.setUTCMonth(target.getUTCMonth() - monthsBack);
  const targetMs = target.getTime();
  const toleranceMs = 7 * 86400_000;
  for (let i = observations.length - 1; i >= 0; i--) {
    const obs = observations[i];
    const obsMs = new Date(obs.period_end).getTime();
    if (Math.abs(obsMs - targetMs) <= toleranceMs) return obs;
    if (obsMs < targetMs - toleranceMs) return null;
  }
  return null;
}

function yoy(latestValue: number, partner: Obs | null): number | null {
  return partner && partner.value > 0 ? (latestValue / partner.value - 1) * 100 : null;
}

/** Calendar-month index (year*12 + 0-based month) — monotonic, day-of-month-agnostic.
 *  Mirrors Postgres `date_trunc('month', …)` ordering for the trailing-window bound. */
function monthIndex(iso: string): number {
  const d = new Date(iso);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * 3-CALENDAR-month trailing average: mean of observations whose period_end is <= the
 * anchor AND whose calendar month is strictly later than (anchor month − 3) — i.e. the
 * anchor month plus the 2 preceding calendar months. Mirrors the view's `smoothed` CTE
 * VERBATIM: `date_trunc('month', period_end) > date_trunc('month', latest_period) −
 * INTERVAL '3 months'`.
 *
 * Calendar-bounded, NOT the old sliding `(anchor − 3mo − 7d, anchor]` interval. The
 * interval form silently averaged a 4th calendar month at a 30-day anchor (Apr-30 →
 * Jan..Apr) because `Apr-30 − 3mo = Jan-30 < Jan-31`. The calendar form yields exactly
 * {Feb,Mar,Apr}; on a gapped interior month it averages ONLY the rows present in the
 * trailing 3 calendar months (honest partial mean), never reaching back a 4th.
 * (Window-bug fix, tier-divergence review, 2026-06-14.)
 */
function trailing3mAvg(observations: Obs[], anchorISO: string): number {
  const anchorMs = new Date(anchorISO).getTime();
  const lowerExclusive = monthIndex(anchorISO) - 3;
  const vals = observations
    .filter((o) => {
      const t = new Date(o.period_end).getTime();
      return t <= anchorMs && monthIndex(o.period_end) > lowerExclusive;
    })
    .map((o) => o.value);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Independent oracle: per-ZIP spread + YoY snapshot, computed in TS straight from
 * raw tier_divergence_swfl rows. A ZIP with no both-present month is dropped (it is
 * outside the divergence universe — the held-out set).
 */
export function buildTierDivergenceSnapshots(
  rows: TierDivergenceRawRow[],
): TierDivergenceZipSnapshot[] {
  const byZip = new Map<string, TierDivergenceRawRow[]>();
  for (const r of rows) {
    const list = byZip.get(r.zip_code);
    if (list) list.push(r);
    else byZip.set(r.zip_code, [r]);
  }

  const out: TierDivergenceZipSnapshot[] = [];
  for (const [zip_code, list] of byZip) {
    const sorted = [...list].sort((a, b) =>
      a.period_end < b.period_end ? -1 : a.period_end > b.period_end ? 1 : 0,
    );

    // Anchor = latest period where BOTH tiers are present.
    const bothRows = sorted.filter(
      (r) => r.top_tier_value !== null && r.bottom_tier_value !== null,
    );
    if (bothRows.length === 0) continue;
    const anchor = bothRows[bothRows.length - 1];
    const top_latest = anchor.top_tier_value as number;
    const bottom_latest = anchor.bottom_tier_value as number;
    if (!(bottom_latest > 0)) continue;
    const spread_latest = top_latest / bottom_latest;

    // Per-leg observation series (ascending), built once.
    const spreadSeries: Obs[] = bothRows.map((r) => ({
      period_end: r.period_end,
      value: (r.top_tier_value as number) / (r.bottom_tier_value as number),
    }));
    const bottomSeries: Obs[] = sorted
      .filter((r) => r.bottom_tier_value !== null)
      .map((r) => ({ period_end: r.period_end, value: r.bottom_tier_value as number }));
    const topSeries: Obs[] = sorted
      .filter((r) => r.top_tier_value !== null)
      .map((r) => ({ period_end: r.period_end, value: r.top_tier_value as number }));

    const ap = anchor.period_end;
    // LEVEL: 3-month trailing average of each tier (anchor + up to 2 prior months) —
    // mirrors the view's `smoothed` CTE. The YoY legs below stay on RAW values.
    const top_3m = trailing3mAvg(topSeries, ap);
    const bottom_3m = trailing3mAvg(bottomSeries, ap);
    out.push({
      zip_code,
      metro: anchor.metro,
      county_name: anchor.county_name,
      city: anchor.city,
      latest_period: ap,
      top_tier_value_latest: top_latest,
      bottom_tier_value_latest: bottom_latest,
      top_tier_value_3m_avg: top_3m,
      bottom_tier_value_3m_avg: bottom_3m,
      tier_spread_ratio: bottom_3m > 0 ? top_3m / bottom_3m : NaN,
      tier_spread_yoy_pct: yoy(spread_latest, lookback(spreadSeries, ap, 12)),
      bottom_tier_yoy_pct: yoy(bottom_latest, lookback(bottomSeries, ap, 12)),
      top_tier_yoy_pct: yoy(top_latest, lookback(topSeries, ap, 12)),
    });
  }

  out.sort((a, b) => (a.zip_code < b.zip_code ? -1 : a.zip_code > b.zip_code ? 1 : 0));
  return out;
}
