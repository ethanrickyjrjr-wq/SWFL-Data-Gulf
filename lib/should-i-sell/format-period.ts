// lib/should-i-sell/format-period.ts
//
// The seller-stress score and the housing snapshot are Redfin ROLLING figures (a
// rolling monthly / rolling-3-month window). Their data-period currency is displayed as
// a MONTH label ("Data through March 2026") — a bare day ("03/01/2026") over-states the
// precision of a rolling window (operator ruling 07/17/2026). Refresh dates and true
// point-in-time "as of" dates keep MM/DD/YYYY.
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "03/01/2026" → "March 2026". Empty/unparseable input → "". */
export function monthYearLabel(mdy: string | null | undefined): string {
  if (!mdy) return "";
  const m = /^(\d{1,2})\/\d{1,2}\/(\d{4})$/.exec(mdy.trim());
  if (!m) return "";
  const month = Number(m[1]);
  if (month < 1 || month > 12) return "";
  return `${MONTHS[month - 1]} ${m[2]}`;
}
