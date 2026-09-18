import { createHash } from "node:crypto";

export type ForecastState =
  | "awaiting_release"
  | "observed"
  | "scored"
  | "unscorable_source_failure"
  | "unscorable_scope_change";

export interface RswForecastRecord {
  schema_version: 1;
  record_type: "rsw_passenger_forecast";
  state: ForecastState;
  forecast_id: string;
  created_at: string;
  forecast_origin: string;
  target_period: string;
  target_definition: "RSW total passenger movements for the calendar month";
  entity: { geo_type: "airport"; geo_id: "RSW"; unit: "passenger_movements" };
  last_usable_input_period: string;
  input_manifest_sha256: string;
  model: { id: "seasonal_naive_same_month_prior_year_v1"; prediction: number };
  baseline: { id: "seasonal_naive_same_month_prior_year_v1"; prediction: number };
  scoring: {
    primary_metric: "MAE";
    secondary_metric: "sMAPE";
    mape_zero_outcome: "unscorable_for_mape";
    direction_rule: "reported only when both target and prior-year value are nonzero; not a success criterion";
  };
  outcome_policy: {
    authoritative_source: "LCPA Total Passengers monthly PDF";
    first_grade: "first retained observed vintage after target period";
    revision: "append a versioned grade; never replace the original grade";
    due_after: string;
    grace_until: string;
  };
  replay_quality: "historical replay is lag-assumed exploratory because exact historical availability is unknown";
}

function canonical(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

/** Attach a content hash after every field that defines the prediction is frozen. */
export function freezeForecastRecord(
  record: Omit<RswForecastRecord, "forecast_id">,
): RswForecastRecord {
  const forecastId = createHash("sha256").update(canonical(record)).digest("hex");
  return { ...record, forecast_id: forecastId };
}

export function assertFutureTarget(origin: string, targetPeriod: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(origin)) {
    throw new Error("forecast origin must be a UTC second timestamp");
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetPeriod)) {
    throw new Error("target period must be YYYY-MM");
  }
  if (origin.slice(0, 7) >= targetPeriod) {
    throw new Error("forecast origin must precede the target calendar month");
  }
}
