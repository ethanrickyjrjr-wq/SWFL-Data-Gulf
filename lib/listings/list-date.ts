// lib/listings/list-date.ts
//
// THE VENDOR LIST-DATE CHAIN — one SteadyAPI lane that answers "when did this listing
// go on the market?", for the case where our own `listing_dom` root has no real count.
//
// ── WHY THIS FILE EXISTS (moved here 08/06/2026) ─────────────────────────────
//
// These four functions lived inside `lib/deliverable/recipes/under-contract.ts` — a
// RECIPE file — and `recipes/new-listing.ts:44` imported them across that boundary.
// That is backwards twice over: a vendor fetch chain is not a recipe's business, and
// one email's file cannot be the home of another email's fallback. The July
// under-contract recipe was rewritten from scratch (operator decree 08/05/2026: *"There
// can't be code for this if it is not from today. We are building everything new so we
// build it fucking right."*), and this lane was the one thing in it worth keeping — so
// it moved rather than died. **Verbatim move. No behavior change.** New Listing's
// import is the only call site and it was repointed in the same commit.
//
// Its own header note asked for exactly this: *"REPORTED FOR EXTRACTION —
// `fetchActiveListDate` belongs next to `fetchSoldEvent`, which already fetches this
// exact body and reads one event type out of it."*
//
// ── WHERE IT SITS IN THE LADDER ──────────────────────────────────────────────
//
// Rung 1 for time-on-market is ALWAYS our own `data_lake.listing_dom` (attached to
// `ListingFacts.daysOnMarket` by `resolve-subject.ts`, and only when the count is NOT a
// first-seen floor). This chain is rung 2 — two hour-cached vendor calls — and it fires
// only on a build with no lake row behind it. See `new-listing.ts:121`.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
//
// `daysSinceListed` is a RUNNING AGE. It is NOT days-to-contract and it is NOT a
// pending interval. Read the note on the function before reaching for it — mislabeling
// it as an interval is the exact fabrication that got the July under-contract recipe
// refuted, and the rewrite does not use this chain at all.
//
// The auth/header/empty-tolerant shape below duplicates `lib/listings/steadyapi.ts` on
// purpose, exactly as it did in its old home: that file is shared and heavily depended
// on, and folding this in is a separate change with its own blast radius.

import { fetchNearbyValues } from "@/lib/listings/steadyapi";
import { canonStreet, sameCanonStreet } from "@/lib/listings/resolve-subject";

const STEADY_BASE = "https://api.steadyapi.com/v1/real-estate";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://steadyapi.com",
  Referer: "https://steadyapi.com/",
};

/** One row of `body.property_history` — only the fields we read are typed. */
interface RawHistoryEvent {
  date?: unknown;
  event_name?: unknown;
  listing?: {
    status?: unknown;
    list_date?: unknown;
  };
}

/**
 * PURE: the ACTIVE for-sale listing's `list_date` out of a `/property-tax-history`
 * body, as an ISO instant — or null.
 *
 * A property carries its whole history: old sold listings, old rental listings, the
 * current one. We take the LATEST `list_date` among events whose own
 * `listing.status` is "for_sale" — the sale lane, current cycle. A prior sale
 * (status "sold"), a withdrawn one ("off_market") and every rental event are
 * excluded, so a 2023 sale's list date can never be mistaken for today's.
 *
 * Never throws; anything unexpected → null (→ the cell becomes an open slot).
 */
export function parseActiveListDate(body: unknown): string | null {
  const history = (body as { body?: { property_history?: unknown } })?.body?.property_history;
  if (!Array.isArray(history)) return null;
  let best: string | null = null;
  for (const row of history as RawHistoryEvent[]) {
    if (row?.listing?.status !== "for_sale") continue;
    const listed = row.listing.list_date;
    if (typeof listed !== "string" || !listed) continue;
    // ISO instants sort lexically — the max is the current cycle's list date.
    if (!best || listed > best) best = listed;
  }
  return best;
}

/**
 * PURE: an ISO instant → MM/DD/YYYY (the Rule-5 date format), in UTC so the output
 * cannot drift with the server's timezone. Anything unparseable → null.
 */
export function formatListDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${t.getUTCFullYear()}`;
}

/**
 * PURE: whole days from the list date to `now`. THE CLOCK IS INJECTED, so this is
 * deterministic and the test drives it with a fixed instant.
 *
 * *** READ THE NAME. *** This is DAYS SINCE LISTED — a RUNNING AGE on an ACTIVE
 * listing, where the MLS clock is still running and `today − list_date` genuinely IS
 * days on market.
 *
 * It is NOT days-to-contract. On a home that has gone under contract the market clock
 * stopped at a date this function knows nothing about, while this count keeps ticking —
 * so it is a comparand for nothing there. The under-contract recipe deliberately does
 * not import this file. Negative / unparseable / future-dated → null → an open slot.
 */
export function daysSinceListed(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const n = now.getTime();
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  const days = Math.floor((n - t) / 86_400_000);
  return days >= 0 ? days : null;
}

/** One `/property-tax-history` call → the active listing's list date, or null.
 *  Empty-tolerant by contract: no key, non-200, bad body → null, never throws. */
export async function fetchActiveListDate(propertyId: string): Promise<string | null> {
  const key = process.env.PHOTOS_API;
  if (!key || !propertyId) return null;
  try {
    const res = await fetch(`${STEADY_BASE}/property-tax-history?propertyId=${propertyId}`, {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return parseActiveListDate(await res.json());
  } catch {
    return null;
  }
}

/**
 * The subject's LIST DATE (ISO), or null. Two hour-cached vendor calls, keyed off
 * the lat/lon the dispatcher already resolved:
 *
 *   1. `/nearby-home-values` — a property is the nearest property to its OWN
 *      coordinates, so the subject comes back as its own row (the same trick
 *      `withBaths` uses). That row is the ONLY place we can read the vendor's
 *      `property_id`, because `ListingFacts` carries neither an id nor a permalink.
 *   2. `/property-tax-history?propertyId=…` — the list date.
 *
 * This is NOT a subject resolver: the house is already resolved. It is an enrichment
 * of the resolved subject, exactly like the bath count.
 *
 * Best-effort: any miss → null, and the timing cell becomes an open slot. Never throws.
 */
export async function resolveSubjectListDate(facts: {
  lat?: number;
  lon?: number;
  address?: string;
}): Promise<string | null> {
  if (facts.lat == null || facts.lon == null || !facts.address) return null;
  const target = canonStreet(facts.address.split(",")[0] ?? "");
  if (!target) return null;
  try {
    const nearby = await fetchNearbyValues({ lat: facts.lat, lon: facts.lon, limit: 25 });
    // Space-insensitive (sameCanonStreet, 08/19/2026): a compound street name the
    // vendor spells as one word must not hide the subject's own row — that miss
    // costs the DOM/list-date cell on every email that rides this lane.
    const self = nearby.find((c) => sameCanonStreet(canonStreet(c.addressLine), target));
    if (!self?.propertyId) return null;
    return await fetchActiveListDate(self.propertyId);
  } catch {
    return null;
  }
}
