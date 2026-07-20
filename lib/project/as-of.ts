/**
 * Parse the as-of date out of a freshness token (`SWFL-7421-v{n}-{YYYYMMDD}`)
 * and format it plainly, e.g. "06/10/2026".
 *
 * v1 honesty mechanism (operator 2026-06-10): a filed item shows the date it was
 * captured as a plain citation line — NOT a relative-age / "may have updated"
 * badge, and we never silently re-fetch. The token stays pinned (the moat).
 * Returns null when there's no parseable trailing date.
 */
/** True only for a real calendar day. A string range check (day ≤ 31) would let an
 *  impossible date in a corrupted token — 02/31, 06/31 — render as a freshness
 *  guarantee; round-trip through Date so it can't. */
function isRealCalendarDay(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** The validated {y,mo,d} of a token's trailing date, or null. ONE parser for
 *  both the display form (`asOfFromToken`) and the compare key (`tokenDayKey`). */
function parseTokenDate(
  token: string | null | undefined,
): { y: string; mo: string; d: string } | null {
  if (!token) return null;
  const m = /(\d{4})(\d{2})(\d{2})\b/.exec(token);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (!isRealCalendarDay(Number(y), Number(mo), Number(d))) return null;
  return { y, mo, d };
}

export function asOfFromToken(token: string | null | undefined): string | null {
  const p = parseTokenDate(token);
  return p ? `${p.mo}/${p.d}/${p.y}` : null;
}

/** ISO `YYYY-MM-DD` of a freshness token's trailing date, or null — the machine-field
 *  twin of `asOfFromToken` (Dataset.dateModified wants ISO; prose wants MM/DD/YYYY).
 *  Same ONE parser; never hand-slice the token elsewhere. */
export function asOfIsoFromToken(token: string | null | undefined): string | null {
  const p = parseTokenDate(token);
  return p ? `${p.y}-${p.mo}-${p.d}` : null;
}

/**
 * Format a raw ISO date/timestamp (`refined_at`, `metrics_verified_date`, …) as
 * MM/DD/YYYY — rule 5. The twin of `asOfFromToken` for dates that are NOT freshness
 * tokens. Returns null when there's no parseable leading `YYYY-MM-DD`.
 *
 * ALL user-facing date display goes through this or `asOfFromToken` — NEVER raw ISO
 * (`toISOString().slice(0,10)` / `.slice(0,10)`), which is year-first and reads
 * "backwards". The grounding/date guard enforces this on the report pages.
 */
export function asOfFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (!isRealCalendarDay(Number(y), Number(mo), Number(d))) return null;
  return `${mo}/${d}/${y}`;
}

/**
 * The sortable "YYYYMMDD" day key of a freshness token's trailing date, or null.
 * 8-digit zero-padded → a plain lexical `>` IS chronological (the same day-granular
 * basis as reconcile's `fresher_side`). Use this for "newer than last seen"
 * comparisons; use `asOfFromToken` for display. Piece 2's digest reads it.
 */
export function tokenDayKey(token: string | null | undefined): string | null {
  const p = parseTokenDate(token);
  return p ? `${p.y}${p.mo}${p.d}` : null;
}

/**
 * The numeric refinery version `{n}` from a `SWFL-7421-v{n}-…` token, or null. Used to
 * break a same-DAY tie when picking the newest token (the day tail can't distinguish
 * `v9` from `v10` on the same date, and a lexical compare would order them wrong).
 */
export function tokenVersion(token: string | null | undefined): number | null {
  if (!token) return null;
  const m = /-v(\d+)-/.exec(token);
  return m ? Number(m[1]) : null;
}

/**
 * ISO `YYYY-MM-DD` → "Jun 1, 2026" (UTC-safe so the day never drifts). Chart
 * captions want this human-readable form, NOT the `MM/DD/YYYY` of
 * `asOfFromIso` above — two legitimately different presentation needs (prose
 * vs. a caption under a chart), sharing ONE root instead of each chart
 * component growing its own copy. Previously duplicated verbatim across
 * ChartBlockView.tsx, SeasonalRadialChart.tsx, and TimelineFrame.tsx —
 * consolidated 2026-07-09. Returns the input unchanged when unparseable.
 */
export function friendlyAsOf(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
