// lib/project/schedule-calendar.ts
/**
 * Deterministic expansion of email/social schedule rows into the ET calendar
 * days of ONE visible month — the hub calendar card's data shape. Cadence/DST
 * math is NOT re-derived here: recurring cadences iterate the ONE shared
 * authority `computeNextRunAt` (lib/email/schedule-cadence); `once` rows read
 * their explicitly-set next_run_at. Pure; no Supabase, no Date.now().
 */
import { computeNextRunAt, type CadenceSpec } from "@/lib/email/schedule-cadence";
import type { EmailScheduleRow, SocialScheduleRow } from "@/lib/project/schedule-chips";

export interface MonthSendMark {
  /** Matches buildScheduleChips keys (`e${id}` / `s${id}`) so the UI joins a
   *  mark back to its chip's line + href without re-deriving either. */
  chipKey: string;
  kind: "email" | "social";
}

const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The ET calendar date ("YYYY-MM-DD") of a UTC instant. */
export function etDateISO(d: Date): string {
  return ET_DATE.format(d); // en-CA formats as YYYY-MM-DD
}

interface CommonRow {
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  next_run_at: string | null;
}

/** Occurrence ET dates of one schedule row inside the target month. */
function rowDatesInMonth(row: CommonRow, year: number, month0: number): string[] {
  if (row.status !== "active") return [];
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}-`;

  if (row.cadence === "once") {
    if (!row.next_run_at) return [];
    const date = etDateISO(new Date(row.next_run_at));
    return date.startsWith(prefix) ? [date] : [];
  }

  const spec: CadenceSpec = {
    cadence: row.cadence as CadenceSpec["cadence"],
    day_of_week: row.day_of_week,
    day_of_month: row.day_of_month,
    send_hour_et: row.send_hour_et,
  };
  // Start 48h before the month's first UTC midnight so the ET/UTC offset can
  // never hide a day-1 occurrence; computeNextRunAt walks strictly forward.
  let cursor = new Date(Date.UTC(year, month0, 1) - 48 * 3_600_000);
  const dates: string[] = [];
  for (let i = 0; i < 100; i++) {
    const next = computeNextRunAt(spec, cursor);
    if (!next) break; // invalid spec (or a cadence with no occurrence) — stop
    const date = etDateISO(next);
    if (date > `${prefix}31`) break; // walked past the month
    if (date.startsWith(prefix)) dates.push(date);
    cursor = next;
  }
  return dates;
}

export function expandScheduleMonth(
  emailSch: EmailScheduleRow[],
  socialSch: SocialScheduleRow[],
  opts: { year: number; month0: number },
): Map<string, MonthSendMark[]> {
  const days = new Map<string, MonthSendMark[]>();
  const add = (date: string, mark: MonthSendMark) => {
    const list = days.get(date) ?? [];
    list.push(mark);
    days.set(date, list);
  };
  for (const s of emailSch) {
    for (const date of rowDatesInMonth(s, opts.year, opts.month0)) {
      add(date, { chipKey: `e${s.id}`, kind: "email" });
    }
  }
  for (const s of socialSch) {
    for (const date of rowDatesInMonth(s, opts.year, opts.month0)) {
      add(date, { chipKey: `s${s.id}`, kind: "social" });
    }
  }
  return days;
}
