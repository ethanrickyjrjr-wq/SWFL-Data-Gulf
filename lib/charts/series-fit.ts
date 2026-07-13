// lib/charts/series-fit.ts
//
// THE WINDOW MENU.
//
// A single fit is a liar by omission. Cape Coral's eleven-year slope is +$1,931/mo;
// its last twenty-four months are −$619/mo. BOTH ARE TRUE. The insight lives in the
// comparison — which is why we fit a fixed MENU of windows rather than picking one.
//
// ONE LAW GOVERNS THIS FILE: A WINDOW MUST NEVER WEAR A LABEL THAT OUTRUNS ITS DATA.
// Four ways a window can break it, and all four are closed here:
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
//   3. AN EXCLUSION THAT EXCLUDED NOTHING. On a series that never spanned the boom —
//      say, 18 months starting 12/2024 — `ex-boom` drops ZERO points, fits a line
//      byte-identical to `full`, and still arrives labeled "excluding the 2021–2022
//      run-up". A reader concludes the series covered the boom and we stripped it out.
//      It didn't, and we didn't: the label outruns the data, one window over from
//      rule 2. So when `ex-boom` excludes nothing it is DROPPED — it is merely `full`
//      under a misleading name, and `full` is already on the menu.
//
//   4. A POINT FROM THE FUTURE. The whole menu is "as of asOf". A point dated LATER
//      than asOf belongs in NO window — it would inflate "last 12 months" with data
//      the label says isn't there, and quietly move `full`'s end date past the as-of
//      we published. Every window is clipped to asOf first — `full` and `ex-boom`
//      included, because "as of X" means AS OF X.
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

/**
 * NOTHING LATER THAN `asOf` ENTERS ANY WINDOW. Run once, before selection, so every
 * window — `full` and `ex-boom` included — inherits the clip. An Invalid Date has a
 * NaN time and every comparison against it is false, so it drops out here too.
 */
function clipToAsOf(points: readonly FitPoint[], asOf: Date): FitPoint[] {
  const limit = asOf.getTime();
  return points.filter((p) => p && p.when instanceof Date && p.when.getTime() <= limit);
}

/** `points` is ALREADY clipped to asOf; `earliest` is their true minimum, hoisted. */
function select(points: readonly FitPoint[], w: FitWindow, asOf: Date, earliest: Date): FitPoint[] {
  if (w === "ex-boom") {
    return points.filter((p) => !BOOM_YEARS.has(p.when.getUTCFullYear()));
  }
  if (w === "full") return [...points];

  const months = TRAILING_MONTHS[w];
  const cut = monthsBack(asOf, months);
  // THE REACH-BACK RULE. A trailing window may only be OFFERED when the data actually
  // reaches back to its cut date. Otherwise an 18-month fit ships labeled "last 10
  // years" — the window's name would be doing the lying. Returning no points here lets
  // the MIN_FIT_POINTS floor below drop the window from the menu entirely.
  // STRICTLY greater: a series whose earliest point lands EXACTLY on the cut DOES
  // reach back to it, and must keep the window. `>=` here would silently delete the
  // 12m window from every series that starts precisely twelve months out.
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
 * A window is offered only when it has at least MIN_FIT_POINTS points, AND (if it is a
 * trailing window) the series reaches back to its cut date, AND (if it is `ex-boom`) it
 * actually excluded something. Everything else is dropped from the menu — a thin, a
 * short-reaching, or an excluded-nothing window is worse than no window, because it
 * arrives wearing a label that outruns its data. Nothing dated after `asOf` is fitted.
 */
export function fitWindows(points: readonly FitPoint[], asOf: Date): WindowFit[] {
  const inScope = clipToAsOf(points, asOf);
  if (inScope.length === 0) return [];

  // Hoisted: ONE pass for the reach-back rule, not one per trailing window.
  // Not sorted-safe by assumption — take the true minimum, never inScope[0].
  const earliest = inScope.reduce((m, p) => (p.when < m ? p.when : m), inScope[0].when);

  const out: WindowFit[] = [];
  for (const w of FIT_WINDOWS) {
    const sel = select(inScope, w, asOf, earliest);
    // AN EXCLUSION THAT EXCLUDED NOTHING IS A LIE. If this series never spanned the
    // boom, `ex-boom` dropped zero points and is byte-identical to `full` — but wears
    // a label claiming we removed a run-up that was never in the data. `full` already
    // says this, honestly. Drop the impostor.
    if (w === "ex-boom" && sel.length === inScope.length) continue;
    if (sel.length < MIN_FIT_POINTS) continue; // dropped, not drawn
    const fit = fitLine(sel);
    if (!fit) continue;
    out.push({ window: w, label: labelFor(w), fit });
  }
  return out;
}
