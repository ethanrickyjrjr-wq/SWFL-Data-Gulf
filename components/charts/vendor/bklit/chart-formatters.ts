export const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** Month + year: "Jun 2015". For any series long enough that the year is the point. */
export const monthYearFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

/** Eighteen months, in ms. Past this, a label without a year is guessing. */
const YEARLESS_LABEL_LIMIT_MS = 18 * 30 * 24 * 60 * 60 * 1000;

/**
 * PICK A DATE LABEL THAT CANNOT LIE ABOUT ITS OWN SPAN.
 *
 * `shortDateFmt` is month + day and carries NO YEAR, which is correct for the short,
 * fresh series these charts were first built for. On a long one it is a trap: /desk's
 * home-price panel spans ELEVEN YEARS, and its axis rendered
 *
 *     Jun 29 · Mar 30 · Dec 30 · Aug 30 · May 30
 *
 * — five labels that read as five dates inside a single year, on a chart whose entire
 * subject is a decade of movement. The day-of-month is noise there (these are monthly
 * closing figures; "29" vs "30" means nothing) and the year, the one thing a reader
 * needs, was the thing omitted.
 *
 * So the format follows the DOMAIN, not the chart type: under eighteen months, days
 * matter and the year is obvious; past that, the year matters and the day never did.
 * Every bklit time-series chart inherits this — the bug was latent in all of them and
 * only became visible when a panel finally got long enough to expose it.
 */
export function pickDateFmt(dates: readonly Date[]): Intl.DateTimeFormat {
  if (dates.length < 2) return shortDateFmt;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const d of dates) {
    const t = d?.getTime?.();
    if (typeof t !== "number" || Number.isNaN(t)) continue;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return shortDateFmt;
  return hi - lo > YEARLESS_LABEL_LIMIT_MS ? monthYearFmt : shortDateFmt;
}

export const weekdayDateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export const hmsTimeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("en-US").format;
