// lib/charts/fit-overlay.ts
//
// WHAT A RENDERER IS ALLOWED TO DRAW. One module, one answer, every surface.
//
// The trend engine's law is that AN UNESTABLISHED SLOPE'S SIGN MAY NOT BE READ —
// not by code, not by a label, not by a narrator, AND NOT BY A LINE ON A CHART. A
// line is a sign. Drawing one through a window whose interval straddles flat is the
// same lie as writing "still climbing" over it, except it is worse, because a reader
// believes a picture faster than a sentence and no gate lints a path element.
//
// So the branch is NOT duplicated per renderer. It lives HERE, once, and every
// surface — the live desk chart, the email PNG, anything after them — consumes the
// model this module returns and paints what it is handed. A renderer that decides
// for itself what to draw is a renderer that can disagree with the copy sitting an
// inch below it, and the whole trend engine exists to stop the product from saying
// two things at once.
//
// ── THE RULE, STATED ONCE ───────────────────────────────────────────────────
//
//   window.fit.established === true    the direction is real → DRAW THE LINE.
//   window.fit.established === false   the interval straddles flat → DRAW THE FAN,
//                                      and NO line inside it. Not the midline, not
//                                      the "likelier" edge — picking a side IS
//                                      reading the sign we just ruled unreadable.
//
// This is the same fact the verdict encodes as `falsifier.valueLow` (null ⇒ a real
// one-sided threshold ⇒ a line; non-null ⇒ a band that straddles flat). The handoff
// tells renderers to branch on `valueLow` rather than on `kind`, and it is right —
// `kind` is the trap, because `plateau` lands on BOTH sides of it. But `valueLow`
// describes only the ONE window the falsifier stands on, and a chart draws TWO. So
// this module branches on each window's own `established` flag — the ground truth
// `valueLow` is derived from — and `assertVerdictAgreesWithOverlay` below holds the
// two in lockstep, so the picture and the sentence can never come apart.
//
// ── WHY `plateau` GETS A LINE *AND* A FAN ───────────────────────────────────
//
// The reading that nearly shipped: "valueLow !== null → draw the band or draw
// nothing" ⇒ a plateau draws NO line. That is wrong, and it would have thrown away
// the most valuable picture we can draw.
//
// A plateau's LONG window IS established — its claim says so out loud ("this market
// has been climbing $1,931 a month"). It is the RECENT window that establishes
// nothing. Those are two different windows, and the rule applies to each on its own
// terms: the long run earns its line, and the last 24 months earn a fan with nothing
// crisp inside it. Drawn together, that IS the plateau — a long climb, and a recent
// smear too wide to call. The reader sees why we won't call it, which is the one
// thing the sentence can only assert.
//
// `reversed` is the same construction and the payoff is bigger: the long line climbs,
// the recent line falls, and the turn the copy claims is a thing you can point at.

import type { Fit, FitPoint } from "./fit-line";
import type { Verdict, WindowFit } from "./series-fit";

/** A straight line in DATA space. Two points is all a straight line has. */
export interface FitCurve {
  from: { when: Date; y: number };
  to: { when: Date; y: number };
}

/** What one window is permitted to contribute to the picture. Exactly one is non-null. */
export interface FitLayer {
  /** The window's own disclosure label — travels onto the surface, never dropped. */
  label: string;
  /** Set ⇔ this window's direction is established. */
  line: FitCurve | null;
  /** Set ⇔ it is NOT. The fan of paces the window still supports; it has no midline. */
  fan: { hi: FitCurve; lo: FitCurve } | null;
  /** `null` when the window is unreadable. NEVER the sign of an unestablished slope. */
  direction: "up" | "down" | null;
}

export interface FitOverlay {
  /** The long window (ex-boom if the series earned it, else full history). */
  long: FitLayer;
  /** The last 24 months. `null` when the series is too short to hold that window. */
  current: FitLayer | null;
  /** The verdict's two sentences. BOTH ship or NEITHER does — see `overlayClaims`. */
  claim: string;
  falsifier: string;
  /**
   * The colour the surface reads the trend in — driven by the LONG window, and `null`
   * when the long window establishes nothing. A surface that colours an unreadable
   * trend green or red has read the sign a different way, through the palette.
   */
  direction: "up" | "down" | null;
}

function curve(fit: Fit, project: (f: Fit, when: Date) => number): FitCurve {
  return {
    from: { when: fit.fromDate, y: project(fit, fit.fromDate) },
    to: { when: fit.toDate, y: project(fit, fit.toDate) },
  };
}

/**
 * THE BRANCH. The only copy of it in the codebase.
 *
 * A fitted line and each edge of the fan are all STRAIGHT — `at()` is linear in the
 * date and `bandAt()` is linear on each side — so two points describe each exactly.
 * We never sample: sampling a straight line at the observed dates would quietly bend
 * it around a gap (the `ex-boom` window drops 2021–22) and invite a renderer to close
 * that gap with a kink that no fit ever produced.
 */
function layerFor(w: WindowFit): FitLayer {
  const { fit, label } = w;
  if (fit.established) {
    return {
      label,
      line: curve(fit, (f, d) => f.at(d)),
      fan: null,
      direction: fit.slope > 0 ? "up" : "down",
    };
  }
  return {
    label,
    line: null,
    fan: {
      hi: curve(fit, (f, d) => f.bandAt(d)[1]),
      lo: curve(fit, (f, d) => f.bandAt(d)[0]),
    },
    // NOT `fit.slope > 0`. The slope has a sign; we have just ruled that we may not
    // read it. Handing it out here would leak it straight into a colour.
    direction: null,
  };
}

/** Build the render model from a verdict. The renderer paints this and decides nothing. */
export function fitOverlay(verdict: Verdict): FitOverlay {
  const long = layerFor(verdict.long);

  // THE COPY IS THE LICENCE, AND IT LICENSES NOTHING ABOUT THE RECENT WINDOW HERE.
  //
  // When the long run establishes no direction, `trendVerdict` returns immediately and
  // NEVER LOOKS AT the 24-month window. Its sentence is a blanket one — "this market does
  // not establish a direction either way" — and it is about the whole stretch.
  //
  // But the 24-month fit can still be established on its own. Build a layer for it and the
  // chart draws a confident recent LINE directly underneath a sentence saying no direction
  // can be read. Both halves would be individually true and the page would be a
  // contradiction — and the line would win, because a reader believes a picture first.
  //
  // A line IS a trajectory, and this codebase's law is that a trajectory ships only as a
  // restatement of a settled sentence. No sentence settled the recent window here. So
  // nothing is drawn for it. The picture says exactly what the copy says: one gold fan,
  // and no direction anywhere.
  const current =
    verdict.kind === "no-direction" || !verdict.current ? null : layerFor(verdict.current);

  return {
    long,
    current,
    claim: verdict.claim.sentence,
    falsifier: verdict.falsifier.sentence,
    // THE MOST RECENT *READABLE* DIRECTION — not the long one.
    //
    // This said `long.direction`, and on the real Cape Coral series that shipped
    // `direction: "up"` under a verdict of REVERSED — a market the copy had just called
    // turned and FALLING $1,201 a month. Any badge, arrow or accent keyed to it would have
    // pointed up at a market we said was going down. Caught by running it on real data;
    // the fixtures never reversed.
    //
    // An unreadable window contributes `null`, so this falls back to the long run exactly
    // when the recent window has nothing to say (plateau), and yields `null` when neither
    // window does (no-direction). No branch on `kind` — the nulls do the work.
    direction: current?.direction ?? long.direction,
  };
}

/**
 * The two sentences, in the shape the gate demands. ALWAYS pass BOTH.
 *
 *     auditClaims(prose, overlayClaims(verdict))
 *
 * Hand it only the claim and the gate EATS THE FALSIFIER — it reads as `comparative`
 * plus `unanchored-number`, the paragraph fails closed to an open slot, and the
 * falsifier never reaches the page. A trend read is an [INFERENCE], and the rules of
 * engagement require every inference to carry its base value AND ONE FALSIFIER in
 * visible copy. A falsifier the gate deleted is a falsifier we did not ship.
 *
 * This function exists so that no caller ever has to remember that. Pass its output.
 */
export function overlayClaims(verdict: Verdict) {
  return [verdict.claim, verdict.falsifier];
}

/**
 * THE TWO HALVES OF THE PRODUCT, HELD IN LOCKSTEP.
 *
 * The copy branches on `falsifier.valueLow`; the picture branches on each window's
 * `established`. They are two encodings of one fact, and if they ever disagree, the
 * surface shows a line over a sentence that says no direction can be read — or a fan
 * under one that names a pace. This asserts they cannot.
 *
 * `valueLow !== null` ⇔ the window the FALSIFIER stands on is a band. Which window
 * that is depends on the kind, and that mapping is the thing under test:
 *
 *   no-direction  the falsifier stands on the LONG band     → long must be a fan
 *   plateau+band  it stands on the RECENT band              → current must be a fan
 *   plateau, none it stands on the long threshold           → long must be a line
 *   intact        it stands on the recent threshold         → both must be lines
 *   reversed      same                                       → both must be lines
 *
 * Called by the tests, not by the renderers — a renderer that has to check this is a
 * renderer that was allowed to decide something.
 */
export function verdictAgreesWithOverlay(verdict: Verdict, overlay: FitOverlay): boolean {
  const bandWindow =
    verdict.kind === "no-direction" ? overlay.long : (overlay.current ?? overlay.long);
  const falsifierNamesABand = verdict.falsifier.valueLow !== null;
  return falsifierNamesABand ? bandWindow.fan !== null : bandWindow.line !== null;
}

// ── THE TRANSPORT ───────────────────────────────────────────────────────────
//
// The overlay is built on the SERVER (that is where the lake is) and painted on the
// CLIENT. Dates do not survive every boundary intact, and a chart whose x-axis silently
// became a string is a chart that draws nothing and throws no error. So it crosses as
// ISO strings and is rehydrated once, here — NOT re-derived, NOT re-branched. Whatever
// `fitOverlay` decided is what arrives; this pair is a courier, not a second opinion.

export interface SerializedFitCurve {
  from: { date: string; value: number };
  to: { date: string; value: number };
}
export interface SerializedFitLayer {
  label: string;
  line: SerializedFitCurve | null;
  fan: { hi: SerializedFitCurve; lo: SerializedFitCurve } | null;
  direction: "up" | "down" | null;
}
export interface SerializedFitOverlay {
  long: SerializedFitLayer;
  current: SerializedFitLayer | null;
  claim: string;
  falsifier: string;
  direction: "up" | "down" | null;
}

const outCurve = (c: FitCurve): SerializedFitCurve => ({
  from: { date: c.from.when.toISOString(), value: c.from.y },
  to: { date: c.to.when.toISOString(), value: c.to.y },
});
const inCurve = (c: SerializedFitCurve): FitCurve => ({
  from: { when: new Date(c.from.date), y: c.from.value },
  to: { when: new Date(c.to.date), y: c.to.value },
});
const outLayer = (l: FitLayer): SerializedFitLayer => ({
  label: l.label,
  line: l.line ? outCurve(l.line) : null,
  fan: l.fan ? { hi: outCurve(l.fan.hi), lo: outCurve(l.fan.lo) } : null,
  direction: l.direction,
});
const inLayer = (l: SerializedFitLayer): FitLayer => ({
  label: l.label,
  line: l.line ? inCurve(l.line) : null,
  fan: l.fan ? { hi: inCurve(l.fan.hi), lo: inCurve(l.fan.lo) } : null,
  direction: l.direction,
});

export function serializeOverlay(o: FitOverlay): SerializedFitOverlay {
  return {
    long: outLayer(o.long),
    current: o.current ? outLayer(o.current) : null,
    claim: o.claim,
    falsifier: o.falsifier,
    direction: o.direction,
  };
}

export function hydrateOverlay(o: SerializedFitOverlay): FitOverlay {
  return {
    long: inLayer(o.long),
    current: o.current ? inLayer(o.current) : null,
    claim: o.claim,
    falsifier: o.falsifier,
    direction: o.direction,
  };
}

/**
 * The observed series a surface draws: ALL OF IT, in order. Never clipped to the fit.
 *
 * This function used to clip the data to the long window's span, and that was a bug with
 * a straight face. The long window is `ex-boom` whenever the series earned it — and
 * `ex-boom` starts AFTER the run-up on any series that begins inside it. Clipping to it
 * silently deleted 2021–2022 from the CHART: the fit correctly excluded the boom, and the
 * picture then excluded it too, so a reader saw a market whose boom had never happened and
 * an x-axis that quietly began in 2023. The label ("excluding the 2021–2022 run-up")
 * describes what we did to the FIT. It is not a licence to withhold the data.
 *
 * Caught by printing the SVG and reading its axis labels. No assertion was failing.
 *
 * The fit is drawn over its own span and starts where it starts — which is itself the
 * honest disclosure of the exclusion. The data is the data, and all of it is shown.
 */
export function observedForChart(points: readonly FitPoint[]): FitPoint[] {
  return [...points].sort((a, b) => a.when.getTime() - b.when.getTime());
}
