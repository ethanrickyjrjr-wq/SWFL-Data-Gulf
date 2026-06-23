/**
 * D1 — the single helper for displaying a raw date string as MM/DD/YYYY.
 *
 * Rule 5 (CLEAN): every user-facing date reads MM/DD/YYYY, never the raw ISO
 * `YYYY-MM-DD`. Use this anywhere a `created_at` / `filed_at` / `as-of` / feed date is
 * rendered. For a freshness TOKEN (`SWFL-…-YYYYMMDD`) use `asOfFromToken`
 * (`lib/project/as-of.ts`) instead — that parses the token tail; this parses an ISO date.
 *
 * Accepts a bare date (`2026-06-23`) or a timestamp (`2026-06-23T14:30:00Z`); reads only
 * the leading date so timezone never shifts the day. Returns the input unchanged when it
 * isn't a parseable ISO date (so a value that's already MM/DD/YYYY passes through).
 */
export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[2]}/${m[3]}/${m[1]}`;
}
