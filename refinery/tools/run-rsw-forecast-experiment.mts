import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertFutureTarget, freezeForecastRecord } from "../intelligence/forecast-contract.mts";
import { loadObservationManifest } from "../intelligence/observation-contract.mts";
import { scoreNumericForecast } from "../intelligence/score-forecast.mts";
import { seasonalNaiveForecast, type MonthlyValue } from "../intelligence/seasonal-naive.mts";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
}

function passengerSeries(
  rows: Awaited<ReturnType<typeof loadObservationManifest>>["observations"],
): MonthlyValue[] {
  return rows
    .filter(
      (row) =>
        row.source_id === "rsw_lcpa_monthly" &&
        row.metric_id === "total_passengers" &&
        row.geo_type === "airport" &&
        row.geo_id === "RSW" &&
        row.status === "observed",
    )
    .map((row) => ({ period: row.period_start.slice(0, 7), value: row.value }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function replay(series: MonthlyValue[]): { eligible_windows: number; mae: number; smape: number } {
  const scores = series.flatMap((outcome, index) => {
    const prediction = seasonalNaiveForecast(outcome.period, series.slice(0, index));
    return prediction === null || outcome.value === null
      ? []
      : [scoreNumericForecast(prediction, outcome.value)];
  });
  return {
    eligible_windows: scores.length,
    mae: scores.reduce((sum, score) => sum + score.absolute_error, 0) / scores.length,
    smape:
      scores.reduce((sum, score) => sum + (score.symmetric_absolute_percentage_error ?? 0), 0) /
      scores.length,
  };
}

async function main(): Promise<void> {
  const manifestPath = arg("--manifest");
  const targetPeriod = arg("--target");
  const origin = arg("--origin");
  const outDirectory = arg("--out");
  assertFutureTarget(origin, targetPeriod);
  const loaded = await loadObservationManifest(manifestPath);
  const series = passengerSeries(loaded.observations);
  const last = series.at(-1);
  if (!last || last.value === null || last.period >= targetPeriod)
    throw new Error("no eligible pre-target RSW history");
  const prediction = seasonalNaiveForecast(targetPeriod, series);
  if (prediction === null)
    throw new Error(`no exact prior-year passenger observation for ${targetPeriod}`);
  const record = freezeForecastRecord({
    schema_version: 1,
    record_type: "rsw_passenger_forecast",
    state: "awaiting_release",
    created_at: origin,
    forecast_origin: origin,
    target_period: targetPeriod,
    target_definition: "RSW total passenger movements for the calendar month",
    entity: { geo_type: "airport", geo_id: "RSW", unit: "passenger_movements" },
    last_usable_input_period: last.period,
    input_manifest_sha256: loaded.manifest_sha256,
    model: { id: "seasonal_naive_same_month_prior_year_v1", prediction },
    baseline: { id: "seasonal_naive_same_month_prior_year_v1", prediction },
    scoring: {
      primary_metric: "MAE",
      secondary_metric: "sMAPE",
      mape_zero_outcome: "unscorable_for_mape",
      direction_rule:
        "reported only when both target and prior-year value are nonzero; not a success criterion",
    },
    outcome_policy: {
      authoritative_source: "LCPA Total Passengers monthly PDF",
      first_grade: "first retained observed vintage after target period",
      revision: "append a versioned grade; never replace the original grade",
      due_after: "2026-11-01",
      grace_until: "2026-12-31",
    },
    replay_quality:
      "historical replay is lag-assumed exploratory because exact historical availability is unknown",
  });
  await mkdir(outDirectory, { recursive: true });
  const recordPath = path.join(
    outDirectory,
    `rsw-passenger-${targetPeriod}-${record.forecast_id}.json`,
  );
  await writeFile(recordPath, `${JSON.stringify({ record, replay: replay(series) }, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(`Frozen forecast: ${recordPath}`);
  console.log(
    `Prediction/baseline: ${prediction}; replay eligible windows: ${replay(series).eligible_windows} (lag-assumed exploratory)`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) void main();
