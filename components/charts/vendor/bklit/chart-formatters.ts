export const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** Month + year: "Jun 2015". For any series long enough that the year is the point. */
export const monthYearFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const DAY_MS = 24 * 60 * 60 * 1000;
/** Points spaced at least this far apart are a MONTHLY series, not a daily one. */
const MONTHLY_CADENCE_DAYS = 20;

/**
 * PICK A DATE LABEL THAT CANNOT LIE ABOUT ITS OWN SPAN.
 *
 * `shortDateFmt` is month + day and carries NO YEAR, which is correct for the short, fresh,
 * DAILY series these charts were first built for. On a monthly series it is a trap. /desk's
 * home-price panel spans eleven years and its axis rendered
 *
 *     Jun 29 · Mar 30 · Dec 30 · Aug 30 · May 30
 *
 * — five labels that read as five dates inside one year, on a chart whose whole subject is a
 * decade of movement. The day-of-month there is NOISE (these are month-end closing figures;
 * "29" vs "30" means nothing at all) and the year — the one thing a reader actually needs —
 * was the thing omitted.
 *
 * THE TEST IS CADENCE, NOT SPAN. Span was the obvious rule and it is wrong twice over. A
 * 12-month window is only ~365 days, so a span threshold leaves it labelled "Jun 29 … May 30"
 * — still yearless, still spanning two calendar years, still ambiguous. And pushing the
 * threshold down to catch it would then hit SHORT DAILY series, where month+year collapses
 * every tick in a month to one string and the axis DEDUPES them away (see `seenLabels` in
 * x-axis.tsx) — an axis losing its ticks to fix an axis losing its years.
 *
 * Cadence answers both. If the points are a month or more apart, the day is meaningless and
 * the year is essential. If they are daily, the day is the point. Every bklit time-series
 * chart inherits this; the bug was latent in all of them and only surfaced when a panel
 * finally got long enough to show it.
 */
export function pickDateFmt(dates: readonly Date[]): Intl.DateTimeFormat {
  const ts = dates
    .map((d) => d?.getTime?.())
    .filter((t): t is number => typeof t === "number" && !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (ts.length < 2) return shortDateFmt;

  // The MEDIAN gap, not the mean — one hole in a daily series must not promote it to monthly.
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];

  return median >= MONTHLY_CADENCE_DAYS * DAY_MS ? monthYearFmt : shortDateFmt;
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
