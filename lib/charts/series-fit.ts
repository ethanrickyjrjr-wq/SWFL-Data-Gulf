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
// The comparison ACROSS these windows is code's job, not the model's — see
// `trendVerdict` at the foot of this module.

import { numeralsIn, type SettledClaim } from "@/lib/deliverable/claims";
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

export function labelFor(w: FitWindow): string {
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

export type VerdictKind = "intact" | "reversed" | "plateau" | "no-direction";

export interface Verdict {
  kind: VerdictKind;
  /** R² of the LONG window >= TIGHT_R2. "Loose" ≠ "no direction". */
  tight: boolean;
  long: WindowFit;
  current: WindowFit | null;
  /**
   * THE LICENSE. A settled sentence — the same shape `compareToSet` and
   * `settledCount` return. `auditClaims` lets a trajectory through ONLY as a
   * verbatim restatement of a settled sentence, so handing this to the narrator
   * is what permits it to say "climbing" at all. A trajectory the model invents
   * on its own still dies in the gate. NO CHANGE TO claims.ts IS NEEDED.
   */
  claim: SettledClaim;
  /**
   * THE FALSIFIER — AND IT IS A `SettledClaim` IN ITS OWN RIGHT.
   *
   * It MUST be handed to the narrator in the settled set ALONGSIDE `claim`:
   *
   *     auditClaims(prose, [verdict.claim, verdict.falsifier])   // <- BOTH
   *
   * Pass only `claim` and the gate EATS THE FALSIFIER — it reads as `comparative`
   * ("climb by LESS THAN $1,674 a month") and, for the directional kinds, also as
   * `unanchored-number` (that bound appears in no other settled sentence). It fails
   * closed, so the paragraph is dropped to an open slot and the falsifier never
   * reaches the page.
   *
   * That is not a cosmetic loss. A trend read IS an inference, and the rules of
   * engagement require every [INFERENCE] to carry its base value AND ONE FALSIFIER
   * in visible copy. A falsifier the gate deletes is a falsifier we did not ship —
   * which means we could not ship a compliant inference at all. Settling it here is
   * what makes the whole verdict shippable.
   *
   * A FALSIFIER IS A BREAKING CONDITION, NOT A METHOD NOTE. "A direction becomes
   * readable once a fitted slope's 95% interval clears zero" is neither — it describes
   * how we did the arithmetic, states no condition that could break anything, and
   * ships three pieces of jargon into copy an agent signs (rules of engagement #5).
   * Every sentence here names a PACE the market would have to actually print.
   *
   * `value` is the COMPUTED bound — never a blank for a model to fill.
   *
   * THE ONE RULE A RENDERER NEEDS — and it is `valueLow`, not `kind`:
   *
   *   valueLow === null   `value` IS A REAL THRESHOLD. One pace, one side; the read holds
   *                       while the market beats it. DRAW THE LINE. (intact, reversed,
   *                       and the plateau with no recent window.)
   *   valueLow !== null   THE SENTENCE NAMES A BAND, NOT A THRESHOLD. `value` is its climb
   *                       edge, `valueLow` its slide edge, and the band STRADDLES FLAT.
   *                       Neither edge is a pace that breaks anything, so a renderer that
   *                       draws one line here is drawing a lie — and it may not pick the
   *                       "likelier" side, because picking a side means reading the sign of
   *                       a slope this module has just ruled UNREADABLE. Draw the band or
   *                       draw nothing. (no-direction, and the plateau with a recent band.)
   *
   * Branch on `valueLow`. Branching on `kind` gets `plateau` wrong — it is the one kind
   * that appears on BOTH sides of this rule.
   */
  falsifier: SettledClaim & { value: number; valueLow: number | null };
}

const usd0 = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

/**
 * The comparison across windows — COMPUTED. The model never sees the window table
 * and therefore cannot draw its own trajectory between rows of it. (sphere-weekly
 * wrote "the gap is widening" from a single level; that is the failure this stops.)
 *
 * LONG    = ex-boom if present, else full.
 * CURRENT = 24m, fixed. 12m's interval establishes almost nothing; 5y is not "now".
 *
 * A window whose CI contains zero has NO READABLE DIRECTION. Its sign is never used.
 */
export function trendVerdict(fits: readonly WindowFit[]): Verdict | null {
  const long = fits.find((f) => f.window === "ex-boom") ?? fits.find((f) => f.window === "full");
  if (!long) return null;

  const current = fits.find((f) => f.window === "24m") ?? null;
  const tight = long.fit.tight;
  const dir = (n: number) => (n > 0 ? "up" : "down");

  // THE WINDOW IS A CLAUSE, NOT A MID-SENTENCE OBJECT.
  //
  // `long.label` is one of TWO shapes: "full history", or "full history, excluding the
  // 2021–2022 run-up". The second ALREADY CONTAINS A COMMA, so dropping it into a bare
  // prepositional slot — `Across the ${label} this market has been…` — reads fine for
  // the first and ships a RUN-ON for the second, verbatim:
  //
  //   "Across the full history, excluding the 2021–2022 run-up this market has been
  //    climbing $1,802 a month."
  //
  // This is customer copy that goes out over an agent's signature to their client list.
  // So the window is FRONTED AND CLOSED with its own comma — grammatical under BOTH
  // labels — and the exclusion still travels in the prose, because an exclusion the
  // reader never sees is a lie by omission.
  //
  // Hoisted ABOVE the no-direction return: all four kinds open on the same clause, and
  // THE SUBJECT IS `this market` IN ALL FOUR. no-direction used to say "this series" —
  // the same voice split that tells a reader the other three are about their town and
  // this one is about a spreadsheet. It is the same town either way.
  const across = `Across the ${long.label},`;

  // The LONG window doesn't establish a direction → we say nothing about direction.
  if (!long.fit.established) {
    // THE BAND STRADDLES FLAT, AND ITS TWO EDGES ARE THE BASE VALUE. Saying only "no
    // trend" hands the reader nothing to check. The honest content of an unestablished
    // fit is the SPREAD the data still allows — quote it, in dollars a month.
    const [lo, hi] = long.fit.ci; // lo <= 0 <= hi, or `established` would be true
    const sentence =
      `${across} this market has no readable direction. The pace could be anything from ` +
      `a ${usd0(lo)} a month slide to a ${usd0(hi)} a month climb — a spread that still ` +
      `includes flat, so we do not call one.`;
    // THE FALSIFIER IS TWO-SIDED, AND IT MUST BE. A one-sided break ("breaks if it
    // climbs past X") would have to pick a side, and picking a side means reading the
    // sign of a slope we have just ruled unreadable — the exact law this module opens
    // with. So BOTH edges ship, and the market breaks the read by clearing EITHER.
    const falsSentence =
      `This read breaks the first time the market holds one direction for two months ` +
      `running — a climb of more than ${usd0(hi)} a month, or a slide of more than ` +
      `${usd0(lo)} a month.`;
    return {
      kind: "no-direction",
      tight,
      long,
      current,
      claim: { sentence, anchors: numeralsIn(sentence) },
      falsifier: {
        value: hi,
        valueLow: lo,
        sentence: falsSentence,
        anchors: numeralsIn(falsSentence),
      },
    };
  }

  const longRate = `${usd0(long.fit.slope)} a month`;
  const longDir = dir(long.fit.slope);
  const climb = longDir === "up" ? "climbing" : "falling";

  // THE FALSIFIER AND THE CLAIM MUST STAND ON THE SAME WINDOW.
  //
  // This shipped, and it was refuted the moment it was printed:
  //
  //   claim:     "…still climbing, at $1,500 a month."
  //   falsifier: "…breaks if the next two months climb by less than $1,674 a month."
  //
  // $1,500 IS less than $1,674. The read broke itself in its own second sentence. The
  // `reversed` verdict was worse — it announced the market had TURNED and was now
  // FALLING $1,844 a month, then staked itself on the next two months CLIMBING $1,804.
  //
  // The cause is a window mismatch, and it is the module's own opening thesis turned
  // against us: `long.fit.ci` bounds the ELEVEN-YEAR pace, and two months is not eleven
  // years. Cape Coral runs +$1,931/mo over eleven years and −$619/mo over twenty-four
  // months, AND BOTH ARE TRUE — so a short-run pace under the long-run bound is not a
  // broken trend, it is Tuesday. A falsifier keyed there fires on noise, always, which
  // is the same as not having one.
  //
  // So each kind is falsified ON THE WINDOW ITS CLAIM IS ABOUT:
  //
  //   intact / reversed  the CURRENT window — the leading edge, and the contested part
  //                      of the sentence. A fit's slope always sits strictly INSIDE its
  //                      own interval, so |slope| > |bound nearest zero| ALWAYS: this
  //                      construction CANNOT be already-true when printed.
  //   plateau            the recent BAND. What a plateau denies is a TURN, so it breaks
  //                      when the recent window establishes one against the long run.
  //   no-direction       the long band (above).
  const beat = longDir === "up" ? "climb" : "fall";

  let kind: VerdictKind;
  let sentence: string;
  let falsSentence: string;
  let value: number;
  let valueLow: number | null = null;

  if (!current || !current.fit.established) {
    // PLATEAU — the long run is real; the recent window establishes NOTHING. We may
    // not read the recent slope's sign at all, so it is absent from the sentence.
    kind = "plateau";

    if (!current) {
      // NO RECENT WINDOW AT ALL — and we must not say otherwise. This branch used to
      // assert "the last 24 months do not establish a direction either way" about a
      // window WE NEVER FIT: a series 18 months long has no 24m window (it cannot reach
      // back that far), so the sentence reported a finding from data that does not
      // exist. That is the label-outruns-its-data sin this module opens with, committed
      // by the verdict itself. With no recent window, the only claim on the table is the
      // long-run one — so the long run's own bound is what a refit has to keep clearing,
      // and the horizon is that same window extending. Matched, not mismatched.
      value = longDir === "up" ? long.fit.ci[0] : long.fit.ci[1];
      sentence =
        `${across} this market has been ${climb} ${longRate} ` +
        `(${long.fit.from} to ${long.fit.to}). We hold no two-year window for it, so ` +
        `there is nothing recent to set against that.`;
      falsSentence =
        `This read breaks if the months ahead pull the full-history pace to less than ` +
        `${usd0(value)} a month — the slowest ${beat} this history still supports.`;
    } else {
      // The recent band STRADDLES FLAT — that is what "establishes nothing" means. Quote
      // it: it is the honest base value of the recent window, and its shape is the whole
      // story. Cape Coral's runs from a $1,245/mo fall to a $7/mo climb — almost entirely
      // on the falling side, a hair from establishing a turn, but still touching flat. A
      // reader can SEE why we won't call it.
      //
      // The break is ONE-SIDED and keyed to the LONG direction (which IS readable): a
      // plateau denies a TURN, so it breaks when the recent window establishes movement
      // AGAINST the long run. The band's edges are quoted as a BAND, never as thresholds
      // — "$7 a month" is where the band ends, not a pace that breaks anything, and a
      // sentence that called it one would be lying about its own number.
      const turn = longDir === "up" ? "fall" : "climb";
      valueLow = current.fit.ci[0];
      value = current.fit.ci[1];
      sentence =
        `${across} this market has been ${climb} ${longRate} ` +
        `(${long.fit.from} to ${long.fit.to}). The last 24 months do not establish a ` +
        `direction either way — that is a plateau, not a turn.`;
      falsSentence =
        `This read breaks the first time the last 24 months establish a ${turn} of ` +
        `their own — today their pace still runs anywhere from a ${usd0(valueLow)} a ` +
        `month fall to a ${usd0(value)} a month climb, which is why we do not call a turn.`;
    }
  } else {
    // BOTH remaining kinds are falsified on the CURRENT window, in one construction.
    const curDir = dir(current.fit.slope);
    const curVerb = curDir === "up" ? "climb" : "fall";
    value = curDir === "up" ? current.fit.ci[0] : current.fit.ci[1];

    if (curDir === longDir) {
      kind = "intact";
      // Two sentences, not one comma-spliced chain: with the ex-boom label the single
      // sentence carried four commas before it reached its second clause.
      sentence =
        `${across} this market has been ${climb} ${longRate}. The last 24 months are ` +
        `still ${climb}, at ${usd0(current.fit.slope)} a month.`;
      falsSentence =
        `This read breaks if the last 24 months ${curVerb} by less than ${usd0(value)} ` +
        `a month — the slowest pace this recent run still supports.`;
    } else {
      kind = "reversed";
      const nowDir = curDir === "up" ? "climbing" : "falling";
      sentence =
        `${across} this market was ${climb} ${longRate}. Over the last ` +
        `24 months it has been ${nowDir}, at ${usd0(current.fit.slope)} a month. ` +
        `The direction has turned.`;
      // THE TURN IS THE CLAIM, SO THE TURN IS WHAT WE STAKE. It breaks if the new
      // direction stops holding — not if the OLD one fails to resume, which is what the
      // long-run bound was absurdly demanding of a market we had just called reversed.
      falsSentence =
        `This read breaks if the last 24 months ${curVerb} by less than ${usd0(value)} ` +
        `a month — the slowest pace the turn still supports.`;
    }
  }

  return {
    kind,
    tight,
    long,
    current,
    claim: { sentence, anchors: numeralsIn(sentence) },
    falsifier: { value, valueLow, sentence: falsSentence, anchors: numeralsIn(falsSentence) },
  };
}
