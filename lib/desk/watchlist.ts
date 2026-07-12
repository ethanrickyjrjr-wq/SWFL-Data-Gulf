// lib/desk/watchlist.ts — pure helpers for the /desk ZIP watchlist.
//
// The watchlist is DEVICE-LOCAL personalization of figures the server already
// rendered (localStorage, anonymous public page — no schema, no auth). These
// helpers are pure so the storage/react layer (`use-watchlist.ts`) stays a
// thin guard; corrupt or hostile storage always degrades to an empty list.

export const WATCHLIST_KEY = "desk_watchlist_v1";

/** Hard cap — the rail is a glanceable strip, not a second movers board. */
export const WATCHLIST_CAP = 12;

const ZIP_RE = /^\d{5}$/;

/** Parse the raw localStorage value. Anything malformed → []. */
export function parseWatchlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string" || !ZIP_RE.test(v) || out.includes(v)) continue;
      out.push(v);
      if (out.length >= WATCHLIST_CAP) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Toggle a ZIP. Adding past the cap is a no-op (the UI disables the star). */
export function toggleZip(list: string[], zip: string): string[] {
  if (!ZIP_RE.test(zip)) return list;
  if (list.includes(zip)) return list.filter((z) => z !== zip);
  if (list.length >= WATCHLIST_CAP) return list;
  return [...list, zip];
}
