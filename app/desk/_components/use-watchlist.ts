"use client";

import { useCallback, useSyncExternalStore } from "react";
import { parseWatchlist, toggleZip, WATCHLIST_KEY } from "@/lib/desk/watchlist";

/** Same-page sync channel — the movers-board stars and the rail are separate
 *  client islands, so a toggle in one must reach the other without a reload. */
const CHANGE_EVENT = "desk-watchlist-change";

const EMPTY: string[] = [];

// useSyncExternalStore requires getSnapshot to be referentially stable while
// the underlying data is unchanged — cache the parse keyed by the raw string.
let cacheRaw: string | null | undefined;
let cacheParsed: string[] = EMPTY;

function getSnapshot(): string[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(WATCHLIST_KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheParsed = parseWatchlist(raw);
  }
  return cacheParsed;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Device-local pinned-ZIP list for /desk, exposed as an external store
 * (localStorage is the source of truth; the server snapshot is always empty,
 * so SSR markup and first client paint agree). If storage is unavailable
 * (private mode / quota), toggles are no-ops — state never forks from what
 * is actually persisted.
 */
export function useWatchlist(): { zips: string[]; toggle: (zip: string) => void } {
  const zips = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((zip: string) => {
    const next = toggleZip(getSnapshot(), zip);
    try {
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    } catch {
      return;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { zips, toggle };
}
