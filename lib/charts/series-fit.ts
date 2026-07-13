// lib/charts/series-fit.ts
//
// THE WINDOW MENU.
//
// A single fit is a liar by omission. Cape Coral's eleven-year slope is +$1,931/mo;
// its last twenty-four months are −$619/mo. BOTH ARE TRUE. The insight lives in the
// comparison — which is why we fit a fixed MENU of windows rather than picking one.
//
// Two ways a window can lie, and both are closed here:
//
//   1. TOO FEW POINTS. A straight line through six points looks authoritative and
//      means nothing. A window under MIN_FIT_POINTS is DROPPED FROM THE MENU —
//      not drawn faintly, not returned with a caveat, not null-in-place.
//
//   2. TOO SHORT A REACH. A trailing window is only OFFERED when the series actually
//      reaches back to its cut date. Filter-only selection would hand an 18-month
//      series to the "10y" window — every point passes a ten-year-old cut — and ship
//      an 18-month fit LABELED "last 10 years". The window's NAME would be doing the
//      lying, which is the same failure as a 12-month moving average emitted under
//      the key `trend`. `full` and `ex-boom` are not trailing windows; the rule does
//      not apply to them.
//
// The comparison ACROSS these windows is code's job, not the model's — that verdict
// lands in a later task and appends to this module.

import { fitLine, MIN_FIT_POINTS, type Fit, type FitPoint } from "./fit-line";

export const FIT_WINDOWS = ["full", "10y", "5y", "24m", "12m", "ex-boom"] as const;
export type FitWindow = (typeof FIT_WINDOWS)[number];

export interface WindowFit {
  window: FitWindow;
  /** Human label. For `ex-boom` this MUST disclose the exclusion. */
  label: string;
  fit: Fit;
}

/** The pandemic run-up. Excluded by the `ex-boom` window, always disclosed. */
const BOOM_YEARS = new Set([2021, 2022]);

/** Trailing-window lengths, in months. `full` and `ex-boom` do not trail. */
const TRAILING_MONTHS: Record<Exclude<FitWindow, "full" | "ex-boom">, number> = {
  "10y": 120,
  "5y": 60,
  "24m": 24,
  "12m": 12,
};

/** First day of the month `months` back from `asOf`, inclusive of asOf's month. */
function monthsBack(asOf: Date, months: number): Date {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - months + 1, 1));
}

function select(points: readonly FitPoint[], w: FitWindow, asOf: Date): FitPoint[] {
  if (w === "ex-boom") {
    return points.filter((p) => !BOOM_YEARS.has(p.when.getUTCFullYear()));
  }
  if (w === "full") return [...points];

  const months = TRAILING_MONTHS[w];
  const cut = monthsBack(asOf, months);
  if (points.length === 0) return [];
  // THE REACH-BACK RULE. A trailing window may only be OFFERED when the data actually
  // reaches back to its cut date. Otherwise an 18-month fit ships labeled "last 10
  // years" — the window's name would be doing the lying. Returning no points here lets
  // the MIN_FIT_POINTS floor below drop the window from the menu entirely.
  // Not sorted-safe by assumption: take the true minimum, never points[0].
  const earliest = points.reduce((m, p) => (p.when < m ? p.when : m), points[0].when);
  if (earliest > cut) return [];
  return points.filter((p) => p.when >= cut);
}

function labelFor(w: FitWindow): string {
  switch (w) {
    case "full":
      return "full history";
    case "10y":
      return "last 10 years";
    case "5y":
      return "last 5 years";
    case "24m":
      return "last 24 months";
    case "12m":
      return "last 12 months";
    // NEVER silently exclude. The label carries the exclusion onto every surface.
    case "ex-boom":
      return "full history, excluding the 2021–2022 run-up";
  }
}

/**
 * Fit every window the series HONESTLY EARNS.
 *
 * A window is offered only when it has at least MIN_FIT_POINTS points AND (if it is a
 * trailing window) the series reaches back to its cut date. Everything else is dropped
 * from the menu — a thin or short-reaching window is worse than no window, because it
 * arrives wearing a label that outruns its data.
 */
export function fitWindows(points: readonly FitPoint[], asOf: Date): WindowFit[] {
  const out: WindowFit[] = [];
  for (const w of FIT_WINDOWS) {
    const sel = select(points, w, asOf);
    if (sel.length < MIN_FIT_POINTS) continue; // dropped, not drawn
    const fit = fitLine(sel);
    if (!fit) continue;
    out.push({ window: w, label: labelFor(w), fit });
  }
  return out;
}
