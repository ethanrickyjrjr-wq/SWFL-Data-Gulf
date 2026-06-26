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

/**
 * Axis / caption date label — same one-root home so a chart never grows its own
 * date parser (Rule 5). Month-grain `2024-03` → `03/2024` (MM/YYYY); a full ISO
 * date `2024-03-15` → `03/15/2024` via {@link formatDisplayDate}; anything else
 * passes through unchanged.
 */
export function formatAxisDateLabel(s: string | null | undefined): string {
  if (!s) return "";
  const mo = s.match(/^(\d{4})-(\d{2})$/);
  if (mo) return `${mo[2]}/${mo[1]}`;
  return formatDisplayDate(s);
}
