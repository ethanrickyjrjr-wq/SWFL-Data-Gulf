// lib/listings/dom.ts — THE one authority for days-on-market wording + date math.
//
// Semantics (spec 2026-07-16-listing-dom-design.md, research 07/16/2026):
//   headline = CURRENT SPELL, matching realtor.com's own counter (resets on relist,
//   keeps counting through pending); cumulative rides along only when it changes
//   the story. No other file may compose DOM wording.

export interface DomFields {
  /** Days in the current listing spell; null = unknown. */
  domDays: number | null;
  /** True when the count is a censored-first-seen floor → renders "N+ days". */
  isFloor: boolean;
  /** Cumulative days across relists (≥ domDays); undefined/null = unknown. */
  cdomDays?: number | null;
}

/** "62 days on market" / "15+ days on market" / relist context; null → omit the line. */
export function formatDom({ domDays, isFloor, cdomDays }: DomFields): string | null {
  if (domDays == null || domDays < 0) return null;
  const unit = domDays === 1 && !isFloor ? "day" : "days";
  const base = `${domDays}${isFloor ? "+" : ""} ${unit} on market`;
  if (!isFloor && cdomDays != null && cdomDays - domDays >= 14) {
    return `${base} (relisted — ${cdomDays} days total)`;
  }
  return base;
}

/** The closed-spell phrase for a sold property: "sold in 79 days". null → omit. */
export function formatSoldSpell(days: number | null): string | null {
  if (days == null || days < 0) return null;
  return `sold in ${days} ${days === 1 ? "day" : "days"}`;
}

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/** Whole days from `fromIso` to `toIso` (date or datetime strings); null on garbage. */
export function daysBetweenIso(fromIso: string | null, toIso: string | null): number | null {
  const f = fromIso ? ISO_DATE.exec(fromIso)?.[1] : null;
  const t = toIso ? ISO_DATE.exec(toIso)?.[1] : null;
  if (!f || !t) return null;
  const ms = Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** UTC calendar date of `now` as YYYY-MM-DD (injectable for tests). */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
