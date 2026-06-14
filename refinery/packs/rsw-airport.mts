import type { PackDefinition } from "../types/pack.mts";
import type { PackOutput } from "../types/pack.mts";
import type {
  BrainOutputProducerResult,
  BrainOutputMetric,
  BrainOutputDirection,
} from "../types/brain-output.mts";
import { rswAirportSource, type RswAirportNormalized } from "../sources/rsw-airport-source.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";

const SOURCE_ID = "rsw_airport_monthly";

/**
 * rsw-airport — Monthly aviation demand for RSW (Southwest Florida International,
 * Fort Myers / Cape Coral), the Lee County Port Authority's airport.
 *
 * Source: public.rsw_airport_monthly (ingest/pipelines/rsw_airport_monthly, cron
 * 8th of month via rsw-airport-monthly.yml). Five LCPA PDFs scraped monthly via
 * https://www.flylcpa.com/about-lcpa/reports-and-statistics/: enplanements
 * (departures), deplanements (arrivals), total_passengers (throughput),
 * aircraft_operations (movements), total_freight_lbs (air cargo).
 *
 * Direction signal: TRAILING-12-MONTH total_passengers YoY (rolling last-12 vs the
 * prior-12). total_passengers is the canonical airport throughput KPI and the SOLE
 * direction input — enplanements + deplanements are its decomposition (one underlying
 * movement; counting all three would triple-count it). The trailing-12 window
 * deseasonalizes a market with extreme snowbird seasonality (Jan–Mar peak), where a
 * single-month YoY throws false flips.
 *
 * RSW-only. PGD (Punta Gorda / Charlotte County) is a separate operator with no LCPA
 * source — if it ever gets one, it is a separate brain.
 *
 * Leaf brain (no upstream brains). Deterministic pack.
 */

// ── Closure state ─────────────────────────────────────────────────────────────

let lastRows: RswAirportNormalized[] = [];
let lastFetchedAt: string | null = null;

// Magnitude divisor — calibrated from the empirical distribution of
// |trailing-12 total_passengers YoY| over 1985–2026 (n=463, COVID 2020-01..2022-06
// excluded): P85 = 14.7%, P90 = 18.1%. Divisor 15 maps a strong-but-plausible annual
// throughput swing (~P85) to magnitude 1.0; extreme shocks (COVID, the airport's 1980s
// ramp) cap at 1.0. Recalibrated UP from the legacy single-month /20, which under-
// registered the lower-variance trailing-12 signal (a normal-year reading like +2.4%
// would have pinned near 0.12 under /20; under /15 it is 0.16, still appropriately weak).
const T12_YOY_MAGNITUDE_DIVISOR = 15;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function sign(n: number): string {
  return n >= 0 ? "+" : "";
}

function fmtCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function metricDirection(pct: number | null): "rising" | "falling" | "stable" {
  if (pct == null) return "stable";
  return pct > 0 ? "rising" : pct < 0 ? "falling" : "stable";
}

function makeSource(
  fetchedAt: string,
  sourceUrl: string,
  citationLabel: string,
): BrainOutputMetric["source"] {
  return {
    url: sourceUrl || "https://www.flylcpa.com/about-lcpa/reports-and-statistics/",
    fetched_at: fetchedAt,
    tier: 1,
    citation: `Lee County Port Authority Aviation Statistics — ${citationLabel}`,
  };
}

/** RSW rows for one metric, value present, sorted newest-first. */
function rowsForMetric(rows: RswAirportNormalized[], metric: string): RswAirportNormalized[] {
  return rows
    .filter((r) => r.airport_code === "RSW" && r.metric === metric && r.value != null)
    .sort((a, b) => (a.report_month > b.report_month ? -1 : 1));
}

/** "2026-04" → "2025-04". */
function priorYearMonth(month: string): string {
  const [y, m] = month.split("-");
  return `${Number(y) - 1}-${m}`;
}

/**
 * Single-month YoY % computed FROM VALUES (latest month vs the same month a year
 * prior) — NOT from the stored yoy_pct_change column, which the pipeline back-fills
 * for recent months only (the 40-year bulk history is null). Returns null if the
 * prior-year month is absent.
 */
function singleMonthYoY(sortedDesc: RswAirportNormalized[]): number | null {
  const latest = sortedDesc[0];
  if (!latest || latest.value == null) return null;
  const prior = sortedDesc.find((r) => r.report_month === priorYearMonth(latest.report_month));
  if (!prior || prior.value == null || prior.value === 0) return null;
  return ((latest.value - prior.value) / prior.value) * 100;
}

/** Sum of `count` consecutive rows starting at `start`; null if not enough rows. */
function sumSlice(sortedDesc: RswAirportNormalized[], start: number, count: number): number | null {
  const slice = sortedDesc.slice(start, start + count);
  if (slice.length < count) return null;
  return slice.reduce((s, r) => s + (r.value ?? 0), 0);
}

/** Peak ÷ median of the trailing-12 monthly values (ACI-style seasonality ratio). */
function seasonalityRatio(sortedDesc: RswAirportNormalized[]): number | null {
  const last12 = sortedDesc
    .slice(0, 12)
    .map((r) => r.value)
    .filter((v): v is number => v != null);
  if (last12.length < 12) return null;
  const asc = [...last12].sort((a, b) => a - b);
  const peak = asc[asc.length - 1];
  const mid = asc.length / 2;
  const median = asc.length % 2 ? asc[(asc.length - 1) / 2] : (asc[mid - 1] + asc[mid]) / 2;
  return median ? peak / median : null;
}

// ── outputProducer ────────────────────────────────────────────────────────────

function rswAirportOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const rows = lastRows;
  const fetchedAt = lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  if (rows.length === 0) {
    return {
      conclusion:
        "rsw-airport: no aviation data available — table may be empty or pipeline has not yet run.",
      key_metrics: [],
      caveats: ["rsw_airport_monthly table returned 0 rows. Run the rsw-airport-monthly pipeline."],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  // ── Per-metric series (RSW, newest-first) ─────────────────────────────────
  const tp = rowsForMetric(rows, "total_passengers");
  const depl = rowsForMetric(rows, "deplanements");
  const enpl = rowsForMetric(rows, "enplanements");
  const ops = rowsForMetric(rows, "aircraft_operations");
  const frt = rowsForMetric(rows, "total_freight_lbs");

  const latestTp = tp[0] ?? null;
  const month = latestTp?.report_month ?? enpl[0]?.report_month ?? "unknown month";
  const periodLabel = latestTp?.period_label ?? month;
  const srcUrl =
    latestTp?.source_url ?? "https://www.flylcpa.com/about-lcpa/reports-and-statistics/";

  // ── Direction = trailing-12 total_passengers YoY (rolling 12 vs prior 12) ──
  const t12now = sumSlice(tp, 0, 12);
  const t12prior = sumSlice(tp, 12, 12);
  const t12yoy =
    t12now != null && t12prior != null && t12prior !== 0
      ? ((t12now - t12prior) / t12prior) * 100
      : null;

  const direction: BrainOutputDirection =
    t12yoy == null ? "neutral" : t12yoy > 0 ? "bullish" : t12yoy < 0 ? "bearish" : "neutral";
  const magnitude =
    t12yoy != null ? Math.min(Math.abs(t12yoy) / T12_YOY_MAGNITUDE_DIVISOR, 1.0) : 0;

  // Single-month momentum + per-metric context YoY (computed from values).
  const tpMomentumYoY = singleMonthYoY(tp);
  const deplYoY = singleMonthYoY(depl);
  const enplYoY = singleMonthYoY(enpl);
  const opsYoY = singleMonthYoY(ops);
  const frtYoY = singleMonthYoY(frt);

  const seasonality = seasonalityRatio(tp);

  // passengers ÷ aircraft operations (same month) — utilization PROXY, not load factor.
  const opsSameMonth = latestTp ? ops.find((r) => r.report_month === latestTp.report_month) : null;
  const paxPerOp =
    latestTp?.value != null && opsSameMonth?.value ? latestTp.value / opsSameMonth.value : null;

  // ── key_metrics ───────────────────────────────────────────────────────────
  const key_metrics: BrainOutputMetric[] = [];

  // 1 — THE DIRECTION DRIVER.
  if (t12yoy != null) {
    key_metrics.push({
      metric: "rsw_trailing_12mo_total_passengers_yoy",
      label: "RSW Total Passengers — Trailing-12-Mo YoY (direction driver)",
      value: t12yoy,
      direction: metricDirection(t12yoy),
      variable_type: "intensive",
      units: "%",
      display_format: "raw",
      source: makeSource(
        fetchedAt,
        srcUrl,
        `RSW trailing-12-mo total passengers ending ${month} vs prior 12 mo: ${sign(t12yoy)}${fmt(t12yoy)}%`,
      ),
    });
  }

  // 2 — Trailing-12 absolute scale.
  if (t12now != null) {
    key_metrics.push({
      metric: "rsw_trailing_12mo_total_passengers",
      label: "RSW Trailing 12-Mo Total Passengers",
      value: t12now,
      direction: metricDirection(t12yoy),
      variable_type: "extensive",
      units: "passengers",
      display_format: "count",
      source: makeSource(
        fetchedAt,
        srcUrl,
        `RSW trailing 12-month total passengers ending ${month}`,
      ),
    });
  }

  // 3 — Headline throughput (latest month) + single-month momentum in its direction.
  if (latestTp?.value != null) {
    key_metrics.push({
      metric: "rsw_total_passengers",
      label: "RSW Monthly Total Passengers",
      value: latestTp.value,
      direction: metricDirection(tpMomentumYoY),
      variable_type: "extensive",
      units: "passengers",
      display_format: "count",
      source: makeSource(
        fetchedAt,
        latestTp.source_url,
        `RSW ${month} — ${fmtCount(latestTp.value)} total passengers` +
          (tpMomentumYoY != null
            ? ` (${sign(tpMomentumYoY)}${fmt(tpMomentumYoY)}% YoY, single month)`
            : ""),
      ),
    });
  }

  // 4 — Arrivals (inbound throughput) — decomposition context, NOT a direction input.
  if (depl[0]?.value != null) {
    key_metrics.push({
      metric: "rsw_deplanements",
      label: "RSW Monthly Deplanements (Arrivals)",
      value: depl[0].value,
      direction: metricDirection(deplYoY),
      variable_type: "extensive",
      units: "passengers",
      display_format: "count",
      source: makeSource(
        fetchedAt,
        depl[0].source_url,
        `RSW ${month} arrivals — ${fmtCount(depl[0].value)} deplanements`,
      ),
    });
  }

  // 5 — Departures — decomposition context, NOT a direction input.
  if (enpl[0]?.value != null) {
    key_metrics.push({
      metric: "rsw_monthly_enplanements",
      label: "RSW Monthly Enplanements (Departures)",
      value: enpl[0].value,
      direction: metricDirection(enplYoY),
      variable_type: "extensive",
      units: "passengers",
      display_format: "count",
      source: makeSource(
        fetchedAt,
        enpl[0].source_url,
        `RSW ${month} departures — ${fmtCount(enpl[0].value)} enplanements`,
      ),
    });
  }

  // 6 — Aircraft operations (airlines' capacity bet).
  if (ops[0]?.value != null) {
    key_metrics.push({
      metric: "rsw_aircraft_operations",
      label: "RSW Monthly Aircraft Operations",
      value: ops[0].value,
      direction: metricDirection(opsYoY),
      variable_type: "extensive",
      units: "operations",
      display_format: "count",
      source: makeSource(
        fetchedAt,
        ops[0].source_url,
        `RSW ${month} — ${fmtCount(ops[0].value)} aircraft operations (movements)`,
      ),
    });
  }

  // 7 — Air freight (goods lane).
  if (frt[0]?.value != null) {
    key_metrics.push({
      metric: "rsw_freight_lbs",
      label: "RSW Monthly Air Freight",
      value: frt[0].value,
      direction: metricDirection(frtYoY),
      variable_type: "extensive",
      units: "lbs",
      display_format: "count",
      source: makeSource(
        fetchedAt,
        frt[0].source_url,
        `RSW ${month} — ${fmtCount(frt[0].value)} lbs air freight`,
      ),
    });
  }

  // 8 — Utilization PROXY (not airline load factor).
  if (paxPerOp != null) {
    key_metrics.push({
      metric: "rsw_pax_per_operation",
      label: "RSW Passengers per Aircraft Operation (utilization proxy)",
      value: paxPerOp,
      direction: "stable",
      variable_type: "intensive",
      units: "passengers/operation",
      display_format: "raw",
      source: makeSource(
        fetchedAt,
        srcUrl,
        `RSW ${month} — ${fmt(paxPerOp, 0)} passengers per aircraft operation (proxy)`,
      ),
    });
  }

  // 9 — Seasonality ratio — characterizing stat, NOT a direction input.
  if (seasonality != null) {
    key_metrics.push({
      metric: "rsw_seasonality_ratio",
      label: "RSW Seasonality Ratio (peak ÷ median month, trailing 12)",
      value: seasonality,
      direction: "stable",
      variable_type: "intensive",
      units: "ratio",
      display_format: "raw",
      source: makeSource(
        fetchedAt,
        srcUrl,
        `RSW trailing-12 total passengers: peak month ÷ median month = ${fmt(seasonality, 2)}`,
      ),
    });
  }

  // ── Conclusion ────────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (latestTp?.value != null) {
    parts.push(
      `RSW ${fmtCount(latestTp.value)} total passengers` +
        (tpMomentumYoY != null ? ` (${sign(tpMomentumYoY)}${fmt(tpMomentumYoY)}% YoY)` : ""),
    );
  }
  if (t12now != null && t12yoy != null) {
    parts.push(
      `trailing-12-mo ${fmtCount(t12now)} (${sign(t12yoy)}${fmt(t12yoy)}% vs prior year — the direction basis)`,
    );
  }
  if (depl[0]?.value != null && enpl[0]?.value != null) {
    parts.push(`${fmtCount(depl[0].value)} arrivals / ${fmtCount(enpl[0].value)} departures`);
  }
  if (ops[0]?.value != null) parts.push(`${fmtCount(ops[0].value)} aircraft operations`);
  if (frt[0]?.value != null) parts.push(`${fmtCount(frt[0].value)} lbs air freight`);

  const conclusion =
    `LCPA Aviation ${periodLabel} — ${parts.join(", ")}. ` +
    `Source: Lee County Port Authority (flylcpa.com/about-lcpa/reports-and-statistics/).`;

  // ── Caveats ───────────────────────────────────────────────────────────────
  const caveats: string[] = [];
  if (!latestTp) {
    caveats.push("No RSW total-passengers data in the fetched window.");
  }
  if (t12yoy == null) {
    caveats.push(
      "Trailing-12-month total-passengers YoY not computable — fewer than 24 monthly rows in the fetched window; direction set neutral.",
    );
  }

  return {
    conclusion,
    key_metrics,
    caveats,
    direction,
    magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
    grain_boundary: {
      not_available: [
        "Origin-and-destination (O&D) / passengers-per-day-each-way — the truest local air-travel demand measure — is not published by LCPA; this brain proxies demand with total passenger throughput.",
        "Deplanements are counted as arrivals / inbound throughput, not a visitor count — they include returning residents (the visitor-vs-resident split is a market-study convention LCPA does not report).",
        "Passengers-per-aircraft-operation is a utilization proxy, not airline load factor (true load factor needs seat counts / available seat-miles, which LCPA does not publish).",
        "Seasonality ratio is a characterizing statistic (peak ÷ median month), not a direction signal — no downstream brain consumes it.",
        "Punta Gorda (PGD / Charlotte County) airport — separate operator, no LCPA source; out of scope for this brain.",
        "Airline-level or sub-county passenger breakdowns.",
      ],
      finest_grain: "airport-month",
    },
  };
}

// ── Pack definition ───────────────────────────────────────────────────────────

export const rswAirport: PackDefinition = {
  id: "rsw-airport",
  brain_id: "rsw-airport",
  public_label: "RSW Airport",
  domain: "hospitality",
  scope:
    "Southwest Florida airport throughput — RSW (Southwest Florida International, Fort Myers / Cape Coral) monthly total passengers, arrivals (deplanements), departures (enplanements), aircraft operations, and air freight from the Lee County Port Authority. Direction tracks the trailing-12-month total-passengers YoY.",
  ttl_seconds: 30 * 24 * 60 * 60, // 30 days

  sources: [rswAirportSource],
  input_brains: [],

  // 8: primary SWFL aviation demand source; directly sourced from airport operator.
  fitScore: () => 8,

  skipSynthesisAgent: true,
  skipTriageAgent: true,

  corpusSummary: (allFragments: RawFragment[]): SynthesisFact[] => {
    const rows = allFragments
      .filter((f) => f.source_id === SOURCE_ID)
      .map((f) => f.normalized as RswAirportNormalized)
      .filter(Boolean);
    lastRows = rows;
    lastFetchedAt = rows[0]
      ? (allFragments.find((f) => f.source_id === SOURCE_ID)?.fetched_at ?? null)
      : null;
    if (rows.length === 0) return [];
    const tp = rowsForMetric(rows, "total_passengers");
    const latest = tp[0] ?? null;
    const earliest = tp[tp.length - 1] ?? null;
    const momentum = singleMonthYoY(tp);
    return [
      {
        topic: "rsw_airport_total_passengers",
        fact: `RSW monthly total passengers — ${rows.length} rows loaded (${earliest?.report_month ?? "?"} to ${latest?.report_month ?? "?"})`,
        value: latest
          ? `Latest: ${latest.period_label} — ${fmtCount(latest.value ?? 0)} total passengers` +
            (momentum != null ? ` (${sign(momentum)}${fmt(momentum)}% YoY, single month)` : "")
          : "No total-passengers data",
        source_fragment_ids: [],
      },
    ];
  },

  outputProducer: rswAirportOutputProducer,

  preferences: [
    "The user tracks SWFL aviation throughput as a leading indicator for hospitality, retail, and real estate decisions in Lee and Collier counties.",
    "Total passengers (arrivals + departures) is the headline; the trailing-12-month YoY is the direction signal because RSW is an extreme snowbird-seasonal market where single-month comparisons mislead.",
    "Arrivals (deplanements) are the inbound half — most relevant to demand — but are throughput, not a visitor count.",
    "The user expects citations directly to the Lee County Port Authority source, not to intermediate databases.",
  ],

  activeProject:
    "rsw-airport: SWFL aviation throughput pulse — monthly RSW total passengers, arrivals/departures split, aircraft operations, and air freight from LCPA PDFs; direction = trailing-12-month total-passengers YoY.",

  prompts: {
    triageContext:
      "These fragments are monthly RSW aviation rows from the rsw_airport_monthly table (Lee County Port Authority): enplanements, deplanements, total_passengers, aircraft_operations, total_freight_lbs. All are decision-relevant by construction; the pack is pure deterministic aggregation.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). Every fact is produced deterministically by the corpusSummary and outputProducer functions.",
  },
};
