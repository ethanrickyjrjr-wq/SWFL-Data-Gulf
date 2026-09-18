export interface NumericForecastScore {
  absolute_error: number;
  squared_error: number;
  absolute_percentage_error: number | null;
  symmetric_absolute_percentage_error: number | null;
}

/** Pure numeric scoring with explicit zero behavior. */
export function scoreNumericForecast(prediction: number, outcome: number): NumericForecastScore {
  if (!Number.isFinite(prediction) || !Number.isFinite(outcome)) {
    throw new Error("prediction and outcome must be finite numbers");
  }
  const absoluteError = Math.abs(prediction - outcome);
  return {
    absolute_error: absoluteError,
    squared_error: absoluteError ** 2,
    // MAPE is undefined for an actual zero; retain null rather than inventing a denominator.
    absolute_percentage_error: outcome === 0 ? null : absoluteError / Math.abs(outcome),
    symmetric_absolute_percentage_error:
      prediction === 0 && outcome === 0
        ? 0
        : (2 * absoluteError) / (Math.abs(prediction) + Math.abs(outcome)),
  };
}
