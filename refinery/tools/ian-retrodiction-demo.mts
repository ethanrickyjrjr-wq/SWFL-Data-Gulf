// refinery/tools/ian-retrodiction-demo.mts
//
// Hurricane Ian retrodiction — a STANDALONE, pre-registered, ILLUSTRATIVE demo.
// It exercises the already-shipped deterministic decision function
// (refinery/lib/backtest/) on ONE event — Hurricane Ian (landfall 2022-09-28) —
// and resolves the call against a realized outcome (LeePA sale-velocity).
//
// HARD TRIPWIRE — this is a HARDCODED ONE-OFF. It is NOT a reusable harness, NOT
// a generalized event-manifest, NOT a generalized vintage-resolver. N≈1. It
// proves the MECHANISM (deterministic, pre-registered, falsifiable calls → graded
// track record), not skill, and does NOT lift the Track-B HOLD.
//
// HONESTY — the pre-Ian call is BEARISH on a PRE-EXISTING summer rise in
// unemployment, NOT a hurricane forecast. A lagging labor indicator cannot foresee
// a landfall. No "the system saw it coming" framing.
//
// Determinism — every number is READ live and COMPUTED, never hardcoded. The only
// fixed inputs are the event constants (landfall date, anchor years), so re-runs
// yield identical receipts. Reads the PINNED parquet snapshot
// (s3://lake-tier1/macro/fred_laus_alfred/2026-06.parquet), NOT the month-rotating
// view alias, so reproducibility survives the next ingest.
//
// Decision machinery is CALLED, never modified:
//   refinery/lib/backtest/decision-fn.mts  (computeBacktestCall)
//   refinery/lib/backtest/skill-baseline.mts (computeSkillScore)
//   refinery/vocab/loader.mts               (resolveGradeConfig)
// The z-score outcome formula is REPLICATED inline from
// refinery/packs/properties-lee-value.mts (NOT imported — the pack's aggregate()
// derives the year from new Date(); we pin the anchor year instead).
//
// Usage:  bun refinery/tools/ian-retrodiction-demo.mts
// Requires in .env.local (Bun auto-loads): SUPABASE_URL, SUPABASE_SERVICE_KEY
// (LeePA via PostgREST) and SUPABASE_S3_ENDPOINT / _ACCESS_KEY_ID /
// _SECRET_ACCESS_KEY (ALFRED parquet via DuckDB httpfs).

import { DuckDBInstance } from "@duckdb/node-api";
import {
  computeBacktestCall,
  type AsOfInput,
  type ObservedDirection,
} from "../lib/backtest/decision-fn.mts";
import {
  computeSkillScore,
  type ScoredCall,
} from "../lib/backtest/skill-baseline.mts";
import { resolveGradeConfig } from "../vocab/loader.mts";
import { getSupabase } from "../sources/supabase.mts";

// ── Event constants (the ONLY fixed inputs — everything else is read/computed) ──
const SLUG = "laus_lee_unemployment_rate_initial_vintage";
const SERIES_ID = "FLLEEC7URN"; // Lee County unemployment rate, ALFRED FRED
const LANDFALL_DATE = "2022-09-28"; // Hurricane Ian Florida landfall
const PARQUET_S3_URL = "s3://lake-tier1/macro/fred_laus_alfred/2026-06.parquet"; // PINNED snapshot
const SOURCE_TAG = "lake_tier1" as const; // ALFRED is the clean real Tier-1 lane

// Outcome windows (LeePA velocity, price-free). currentYear is PINNED per window
// (not derived from today) so the demo is date-independent.
const IMMEDIATE = {
  label: "immediate (post-Ian)",
  currentYear: 2023,
  baseline: [2020, 2021, 2022],
};
const RECOVERY = {
  label: "recovery",
  currentYear: 2024,
  baseline: [2021, 2022, 2023],
};

// Replicated verbatim from refinery/packs/properties-lee-value.mts:48-49.
const Z_BULL_THRESHOLD = 1.0;
const Z_BEAR_THRESHOLD = -1.0;

const DAY_MS = 86_400_000;

interface Vintage {
  obsDate: string; // YYYY-MM-DD (first of month)
  obsTime: number;
  value: number;
  firstPub: string; // YYYY-MM-DD
  firstPubTime: number;
}

// ── Step 1: read ALFRED initial vintages (live, pinned snapshot) ───────────────
async function readInitialVintages(): Promise<Vintage[]> {
  const required = [
    "SUPABASE_S3_ENDPOINT",
    "SUPABASE_S3_ACCESS_KEY_ID",
    "SUPABASE_S3_SECRET_ACCESS_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `ian-retrodiction-demo: missing S3 env var(s): ${missing.join(", ")}. Set them in .env.local.`,
    );
  }
  const endpoint = process.env["SUPABASE_S3_ENDPOINT"]!.replace(
    /^https?:\/\//,
    "",
  );
  const accessKey = process.env["SUPABASE_S3_ACCESS_KEY_ID"]!;
  const secretKey = process.env["SUPABASE_S3_SECRET_ACCESS_KEY"]!;
  const esc = (s: string): string => s.replace(/'/g, "''");

  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  await connection.run("INSTALL httpfs; LOAD httpfs;");
  await connection.run(`
    SET s3_endpoint='${esc(endpoint)}';
    SET s3_access_key_id='${esc(accessKey)}';
    SET s3_secret_access_key='${esc(secretKey)}';
    SET s3_region='us-east-1';
    SET s3_url_style='path';
    SET s3_use_ssl=true;
  `);

  // Initial vintage = the value at the EARLIEST realtime_start per observation
  // month (what was publicly available at decision time, before BLS revisions).
  const reader = await connection.runAndReadAll(`
    WITH ranked AS (
      SELECT
        observation_date,
        value,
        realtime_start,
        ROW_NUMBER() OVER (
          PARTITION BY observation_date
          ORDER BY CAST(realtime_start AS DATE) ASC
        ) AS rn
      FROM read_parquet('${esc(PARQUET_S3_URL)}')
      WHERE series_id = '${esc(SERIES_ID)}'
        AND CAST(observation_date AS DATE) BETWEEN DATE '2021-01-01' AND DATE '2022-10-01'
    )
    SELECT observation_date, value AS initial_value, realtime_start AS first_published
    FROM ranked
    WHERE rn = 1
    ORDER BY observation_date
  `);
  const rows = reader.getRowObjects();
  connection.closeSync();

  return rows
    .map((r) => {
      const obsDate = String(r["observation_date"]).slice(0, 10);
      const firstPub = String(r["first_published"]).slice(0, 10);
      return {
        obsDate,
        obsTime: Date.parse(obsDate),
        value: Number(r["initial_value"]),
        firstPub,
        firstPubTime: Date.parse(firstPub),
      };
    })
    .sort((a, b) => a.obsTime - b.obsTime);
}

/** Observation whose month is `monthsBack` calendar months before `obsDate`. */
function obsMonthsBefore(
  vintages: Vintage[],
  obsDate: string,
  monthsBack: number,
): Vintage | null {
  const [y, m] = obsDate.split("-").map(Number);
  const idx = y * 12 + (m - 1) - monthsBack;
  const targetKey = `${String(Math.floor(idx / 12)).padStart(4, "0")}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
  return vintages.find((v) => v.obsDate === targetKey) ?? null;
}

// ── Step 3 helpers: replicated z-score outcome (NOT imported from the pack) ─────
function populationStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(sq);
}

function directionFromZScore(z: number | null): ObservedDirection {
  if (z == null) return "neutral";
  if (z >= Z_BULL_THRESHOLD) return "bullish";
  if (z <= Z_BEAR_THRESHOLD) return "bearish";
  return "neutral";
}

interface WindowResult {
  label: string;
  currentYear: number;
  baselineYears: number[];
  currentCount: number;
  baselineMean: number;
  baselineStd: number;
  z: number;
  observed: ObservedDirection;
  rawYoYPct: number;
}

function resolveWindow(
  salesByYear: Map<number, number>,
  win: { label: string; currentYear: number; baseline: number[] },
): WindowResult {
  const currentCount = salesByYear.get(win.currentYear)!;
  const baselineCounts = win.baseline.map((y) => salesByYear.get(y)!);
  const baselineMean =
    baselineCounts.reduce((a, b) => a + b, 0) / baselineCounts.length;
  const baselineStd = populationStd(baselineCounts);
  const z = (currentCount - baselineMean) / baselineStd;
  const prevCount = salesByYear.get(win.currentYear - 1)!;
  const rawYoYPct = ((currentCount - prevCount) / prevCount) * 100;
  return {
    label: win.label,
    currentYear: win.currentYear,
    baselineYears: win.baseline,
    currentCount,
    baselineMean,
    baselineStd,
    z,
    observed: directionFromZScore(z),
    rawYoYPct,
  };
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);
const f4 = (n: number): string => (Math.round(n * 10000) / 10000).toFixed(4);

async function main(): Promise<void> {
  const out: string[] = [];
  const p = (s = ""): void => {
    out.push(s);
  };

  p("================================================================");
  p("  HURRICANE IAN RETRODICTION DEMO — receipts");
  p("  Standalone · pre-registered · ILLUSTRATIVE (N≈1, not skill proof)");
  p("================================================================");

  // ── Resolved grade-config (fixed in shipped code, NOT tuned to Ian) ──────────
  const cfg = resolveGradeConfig(SLUG);
  p("");
  p(`SLUG: ${SLUG}`);
  p(
    `RESOLVED GRADE-CONFIG: gradeable=${cfg.gradeable} basis=${cfg.grade_basis} ` +
      `polarity=${cfg.direction_polarity} epsilon=${cfg.epsilon} ` +
      `epsilon_mode=${cfg.epsilon_mode} window_days=${cfg.window_days}`,
  );
  if (!cfg.gradeable) {
    throw new Error(
      `ian-retrodiction-demo: ${SLUG} is not gradeable — ${cfg.reason}`,
    );
  }

  // ── Step 1: vintages + selection (data-driven, printed for audit) ────────────
  const vintages = await readInitialVintages();
  const published = vintages.filter(
    (v) => v.firstPubTime <= Date.parse(LANDFALL_DATE),
  );
  if (published.length === 0)
    throw new Error("no vintage published on/before landfall");
  const asOf = published.reduce((a, b) =>
    b.firstPubTime > a.firstPubTime ? b : a,
  );

  // 90-day prior: most-recent initial vintage with observation_date ≤ (as-of obs − 90d).
  const cutoff90 = asOf.obsTime - 90 * DAY_MS;
  const prior90 = vintages
    .filter((v) => v.obsTime <= cutoff90)
    .reduce<Vintage | null>(
      (acc, v) => (acc == null || v.obsTime > acc.obsTime ? v : acc),
      null,
    );
  const priorMoM = obsMonthsBefore(vintages, asOf.obsDate, 1);
  const priorYoY = obsMonthsBefore(vintages, asOf.obsDate, 12);
  if (!prior90 || !priorMoM || !priorYoY) {
    throw new Error(
      "ian-retrodiction-demo: a prior vintage was not found in the snapshot",
    );
  }

  p("");
  p(`AS-OF (decision date = Ian landfall ${LANDFALL_DATE}):`);
  p(
    `  freshest initial vintage published ≤ landfall → obs ${asOf.obsDate} = ${f1(asOf.value)}% (first published ${asOf.firstPub})`,
  );
  p(
    `PRIORS (selected in-script; the window rule lives here, not in computeBacktestCall):`,
  );
  p(
    `  90-day  (obs ≤ as-of−90d)  → obs ${prior90.obsDate} = ${f1(prior90.value)}%   [the registered prediction]`,
  );
  p(
    `  MoM     (as-of−1 month)    → obs ${priorMoM.obsDate} = ${f1(priorMoM.value)}%   [robustness]`,
  );
  p(
    `  YoY     (as-of−12 months)  → obs ${priorYoY.obsDate} = ${f1(priorYoY.value)}%   [robustness, seasonality-neutral]`,
  );

  // ── Step 2: as-of call + robustness lines (let the function return direction) ─
  const callFor = (prior: number): ObservedDirection => {
    const input: AsOfInput = {
      slug: SLUG,
      as_of_date: LANDFALL_DATE,
      as_of_value: asOf.value,
      prior_value: prior,
      source_tag: SOURCE_TAG,
    };
    const call = computeBacktestCall(input, cfg);
    if (call == null)
      throw new Error(`computeBacktestCall returned null for prior=${prior}`);
    return call.direction;
  };
  const dir90 = callFor(prior90.value);
  const dirMoM = callFor(priorMoM.value);
  const dirYoY = callFor(priorYoY.value);

  p("");
  p("PRE-IAN CALL (computeBacktestCall, delta basis, lower_is_bullish):");
  p(
    `  90-day  ${f1(asOf.value)} vs ${f1(prior90.value)}  (diff ${f1(asOf.value - prior90.value)})  →  ${dir90.toUpperCase()}   [registered prediction]`,
  );
  p(
    `  MoM     ${f1(asOf.value)} vs ${f1(priorMoM.value)}  (diff ${f1(asOf.value - priorMoM.value)})  →  ${dirMoM.toUpperCase()}   [robustness]`,
  );
  p(
    `  YoY     ${f1(asOf.value)} vs ${f1(priorYoY.value)}  (diff ${f1(asOf.value - priorYoY.value)})  →  ${dirYoY.toUpperCase()}   [robustness]`,
  );
  p(
    `  → Convention-sensitivity (90-day vs MoM vs YoY flips the sign) is the non-seasonally-adjusted caveat made visible.`,
  );
  p(
    `  → The BEARISH 90-day read reflects a PRE-EXISTING summer rise in unemployment, NOT an Ian forecast.`,
  );

  if (dir90 === "neutral") {
    throw new Error(
      "ian-retrodiction-demo: registered prediction is neutral — cannot build a directional ScoredCall",
    );
  }
  const predicted: "bullish" | "bearish" = dir90;

  // ── Step 3: realized outcome (LeePA velocity, price-free — sale COUNTS only,
  //     the per-parcel sale-price column is selected nowhere in this script) ─
  const sb = getSupabase().schema("data_lake");
  const years = [
    ...new Set([
      ...IMMEDIATE.baseline,
      IMMEDIATE.currentYear,
      ...RECOVERY.baseline,
      RECOVERY.currentYear,
    ]),
  ];
  const resp = await sb
    .from("leepa_parcels_sales_yearly")
    .select("sale_year,sales_count")
    .in("sale_year", years)
    .order("sale_year");
  if (resp.error)
    throw new Error(
      `leepa_parcels_sales_yearly query failed — ${resp.error.message}`,
    );
  const salesByYear = new Map<number, number>();
  for (const r of (resp.data ?? []) as {
    sale_year: number;
    sales_count: number;
  }[]) {
    salesByYear.set(r.sale_year, r.sales_count);
  }
  for (const y of years) {
    if (!salesByYear.has(y))
      throw new Error(`LeePA sales_count missing for year ${y}`);
  }

  const immediate = resolveWindow(salesByYear, IMMEDIATE);
  const recovery = resolveWindow(salesByYear, RECOVERY);

  p("");
  p(
    "REALIZED OUTCOME — LeePA sale-velocity (price-free; ±1.0 z-thresholds, NOT the 0.05 LAUS epsilon):",
  );
  for (const w of [immediate, recovery]) {
    p(
      `  ${w.label}: year ${w.currentYear} count=${w.currentCount} vs baseline ${w.baselineYears.join(",")} ` +
        `(mean ${f1(w.baselineMean)}, popStd ${f1(w.baselineStd)}) → z=${f4(w.z)} → ${w.observed.toUpperCase()}` +
        `   | raw YoY ${w.rawYoYPct >= 0 ? "+" : ""}${f1(w.rawYoYPct)}%`,
    );
  }

  // ── Step 4: score + wiring smoke-test (degenerate at N=1 — note printed) ──────
  const scored: ScoredCall[] = [immediate, recovery].map((w) => ({
    slug: SLUG,
    family: "laus_lee",
    as_of_date: LANDFALL_DATE,
    predicted,
    observed: w.observed,
    correct: predicted === w.observed,
    source_tag: SOURCE_TAG,
  }));
  const score = computeSkillScore(scored);

  p("");
  p("computeSkillScore (WIRING SMOKE-TEST ONLY):");
  p(`  ${JSON.stringify(score)}`);
  p(
    "  DEGENERACY NOTE: both calls share one slug AND one as_of_date, so the persistence-null logic\n" +
      "  excludes the first call and drops neutral-observed targets — n_calls collapses to 0. The aggregate\n" +
      "  metrics (system_accuracy, persistence_accuracy, lift) are NOT meaningful at N=1 same-slug/same-date.\n" +
      "  The per-window table below is the real deliverable.",
  );

  // ── Step 5: the per-window result table (the real output) ────────────────────
  const verdict = (w: WindowResult): string =>
    w.observed === "neutral"
      ? "NO-DIRECTIONAL-OUTCOME"
      : w.observed === predicted
        ? "HIT"
        : "MISS";
  p("");
  p("PER-WINDOW RESULT (prediction = " + predicted.toUpperCase() + "):");
  p("  window                  | observed  | z       | verdict");
  p("  ------------------------|-----------|---------|----------------------");
  for (const w of [immediate, recovery]) {
    p(
      `  ${w.label.padEnd(23)} | ${w.observed.padEnd(9)} | ${f4(w.z).padStart(7)} | ${verdict(w)}`,
    );
  }
  p("");
  p(
    "NET: pre-Ian call BEARISH (pre-existing labor trend, not Ian-prediction); both velocity windows",
  );
  p(
    "NEUTRAL at ±1.0 → no scored hit/miss. Mechanism runs end-to-end on live point-in-time data. N≈1 —",
  );
  p(
    "illustrative, not proof; does NOT lift the Track-B HOLD. TDT outcome = Phase 2 (pending self-ingest).",
  );
  p("================================================================");

  console.log(out.join("\n"));
}

main().catch((err: unknown) => {
  console.error(
    `ian-retrodiction-demo FAILED: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
