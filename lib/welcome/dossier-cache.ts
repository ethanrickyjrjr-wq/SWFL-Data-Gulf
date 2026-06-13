/**
 * welcome/dossier-cache — bound the cost of grounding the public welcome chat.
 *
 * Two guards around `assembleLocationDossier` (a ~28-brain disk fan-out):
 *   1. A short-TTL + small-LRU memo keyed by resolved location, so re-asking
 *      about the same ZIP in a conversation costs one fan-out, not one per turn.
 *      Safe to cache: assembleLocationDossier is a pure READ of static `brains/*.md`
 *      (never a rebuild). TTL is short (5 min) so a fresh nightly build is picked
 *      up quickly.
 *   2. An env-gated daily ceiling (`WELCOME_DOSSIER_DAILY_CAP`) on real fan-outs —
 *      a spend backstop against distributed abuse the per-IP/weekly caps miss.
 *      NOTE: this counter is PER PROCESS (serverless instances don't share it), so
 *      it is a best-effort backstop, not a global hard cap. A global ceiling would
 *      need a shared store (a fast-follow if abuse warrants it).
 *
 * The per-IP burst limiter (middleware) and the per-client weekly cap
 * (lib/welcome/chat-usage) already guard the Haiku TURN; these guard the FETCH.
 */
import { assembleLocationDossier, type LocationDossier } from "@/lib/zip-dossier";
import type { LocationInput } from "@/refinery/lib/location-resolver.mts";

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry = { dossier: LocationDossier; at: number };
const cache = new Map<string, Entry>();

/** Stable identity for caching — same place (ZIP, town→primary-ZIP, county…) shares one entry. */
export function dossierCacheKey(loc: LocationInput): string {
  switch (loc.kind) {
    case "zip":
    case "place":
    case "address":
      return `r:${loc.resolution.zip ?? "?"}`;
    case "county":
      return `c:${loc.county}`;
    case "corridor":
      return `k:${loc.pocket}`;
    case "region":
      return "region";
    default:
      return `x:${loc.kind}`;
  }
}

// --- daily ceiling (per-process, UTC-day window) ---------------------------
let windowDay = "";
let windowCount = 0;

function dailyCap(): number {
  return Number(process.env.WELCOME_DOSSIER_DAILY_CAP ?? "0");
}
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
function rollWindow(now: number): void {
  const d = utcDay(now);
  if (d !== windowDay) {
    windowDay = d;
    windowCount = 0;
  }
}
function overDailyCap(now: number): boolean {
  const cap = dailyCap();
  if (!cap || cap <= 0) return false; // unset/0 → disabled
  rollWindow(now);
  return windowCount >= cap;
}

export interface GuardedDossier {
  dossier?: LocationDossier;
  /** true → daily ceiling tripped; the route should answer "busy", not fetch. */
  capped: boolean;
  fromCache: boolean;
}

export interface GuardOptions {
  origin?: string;
  /** Injectable for tests (determinism). */
  now?: () => number;
  assembleImpl?: typeof assembleLocationDossier;
}

/**
 * Cache-and-ceiling wrapper. Cache hit → returns instantly (no ceiling charge).
 * Miss → checks the daily ceiling BEFORE the fan-out; on a real result
 * (in-scope, ≥1 line) caches it and charges one unit. Out-of-scope/empty results
 * are cheap (assembleLocationDossier returns early) and are NOT cached or charged.
 */
export async function assembleGuardedDossier(
  loc: LocationInput,
  opts: GuardOptions = {},
): Promise<GuardedDossier> {
  const now = (opts.now ?? Date.now)();
  const assemble = opts.assembleImpl ?? assembleLocationDossier;
  const key = dossierCacheKey(loc);

  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) {
    cache.delete(key); // LRU touch
    cache.set(key, hit);
    return { dossier: hit.dossier, capped: false, fromCache: true };
  }

  if (overDailyCap(now)) return { capped: true, fromCache: false };

  const dossier = await assemble(loc, opts.origin ? { origin: opts.origin } : {});

  if (dossier.in_scope && dossier.lines.length > 0) {
    cache.set(key, { dossier, at: now });
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    rollWindow(now);
    windowCount += 1;
  }

  return { dossier, capped: false, fromCache: false };
}

/** Test-only: clear cache + daily counter between cases. */
export function __resetWelcomeDossierCache(): void {
  cache.clear();
  windowDay = "";
  windowCount = 0;
}
