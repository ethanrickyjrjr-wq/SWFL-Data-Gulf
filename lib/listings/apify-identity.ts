// lib/listings/apify-identity.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
// *** `location` IS A SEARCH AREA. IT IS NOT A LOOKUP KEY. ***
// ═══════════════════════════════════════════════════════════════════════════════
//
// Passing a full street address as the actor's `location` does NOT return that house.
// It returns houses NEAR that house, in the vendor's own order. Every record coming back
// is a CANDIDATE, never an answer. It becomes an answer only by passing `matchesAddress`.
//
// Both live defects found on 08/04/2026 — by building a real comps email and looking at
// it (`_ASSISTANT/2026-08-04-comp-photos-FINDINGS.md`) — are the same failure to respect
// that one sentence:
//
//   1. ZIP-WIDE SAMPLING NEVER JOINS. The photo lane asked for 24 arbitrary sold homes in
//      ZIP 33908 and tried to key them onto 6 SPECIFIC comp addresses. Live intersection:
//      0 of 6 — not bad luck, a structural impossibility. 33908 has hundreds of sales in
//      the window; the odds our exact six are in an arbitrary 24 are ~nil. We paid for 24
//      photos of the wrong houses and discarded all 24, and the empty result was
//      byte-identical to "these houses have no photos."
//
//   2. `[0]` WITH NO IDENTITY CHECK. The subject lane passed the subject's own address as
//      `location` and accepted record [0] blind. For 8348 Southwindbay Cir, Fort Myers
//      33908 it returned 306 Chattanooga Dr, Fort Myers 33905 — different street,
//      different ZIP — and that stranger's listing became the hero photo link, the
//      "Find Out More" CTA, and the source of the subject's style in the footnote.
//
// This module is the fix for both, and it is deliberately SEPARATE from apify-comps.ts so
// that the rule has a file of its own to be found in. `compPhotoKey` is imported, never
// re-implemented — one address normalizer, shared by every lane (comp-photos.ts's rule).

import { compPhotoKey } from "./comp-photos";
import { fetchApifyComps, type ApifyRecord } from "./apify-comps";
import { listingAddressKey, bathsFromRecord } from "./apify-baths";
import { fetchCachedRecords } from "./apify-record-store";

/** The vendor's own "no value" sentinels — they arrive as literal strings. */
const NA = new Set(["<NA>", "NA", "N/A", "null", "undefined", "None"]);

function isRealString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && !NA.has(v.trim());
}

/** Only ever an http(s) URL — a `javascript:` or `data:` string must never reach an
 *  `href` or an `<img src>`, and a relative path is not a listing page. */
function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());
}

/**
 * Does this vendor record describe THIS house?
 *
 * Street core + city, through the SAME `compPhotoKey` normalizer both photo lanes use —
 * never a second matcher, never a fuzzy or partial compare. The city half is what stops
 * "330 5th St, Naples" from answering for "330 5th St, Fort Myers". A record with no
 * street, or a blank target, can never match.
 */
export function matchesAddress(
  record: ApifyRecord,
  addressLine: string,
  city: string | null | undefined,
): boolean {
  if (!isRealString(record.street) || !isRealString(addressLine)) return false;
  return compPhotoKey(record.street, record.city ?? "") === compPhotoKey(addressLine, city ?? "");
}

/**
 * The ONLY sanctioned way to take one record out of an area search. Replaces `[0]`.
 *
 * Returns null when the search brought back only other houses — a normal, frequent
 * outcome that must never be dressed up as this house. A null costs an open slot; a
 * wrong `[0]` costs a wrong-house link in a sent email.
 */
export function pickAddressMatch(
  records: ApifyRecord[],
  addressLine: string,
  city: string | null | undefined,
): ApifyRecord | null {
  for (const r of records) if (matchesAddress(r, addressLine, city)) return r;
  return null;
}

/**
 * address-key -> realtor.com detail URL. THE COMP ROW'S LINK.
 *
 * `comp-helper.ts:291` sets `sourceUrl: null` on every Lee lake comp, because that lane
 * is deed data and carries no listing page. That is why the rendered comps email had 0 of
 * 6 rows linked — the decree's fallback ("no photo -> still a link") had nothing to link
 * TO. The vendor record carries `property_url` and it rides in on the SAME call that
 * fetches the photo, so the link costs nothing extra.
 */
export function apifyListingUrlIndex(records: ApifyRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of records) {
    if (!isRealString(r.street) || !isHttpUrl(r.property_url)) continue;
    const k = compPhotoKey(r.street, r.city ?? "");
    if (!out.has(k)) out.set(k, r.property_url.trim());
  }
  return out;
}

export interface AddressTarget {
  addressLine: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/** Injectable seam so every test runs offline and no test can ever spend money. */
export interface AddressFetchDeps {
  fetch?: typeof fetchApifyComps;
}

// ═════════════════════════════════════════════════════════════════════════════
// *** DO NOT WRITE `fetchApifyRecordForAddress`. IT EXISTED, IT WAS DELETED, AND
//     THE REASON IS A VENDOR CEILING, NOT A BUG WE CAN FIX. ***
//
// The idea is obvious and wrong: pass one comp's full street address as `location`,
// take back its record, verify with `matchesAddress`. It was built, shipped, and it
// billed one call per comp for a `null` every single time.
//
// MEASURED LIVE 08/04/2026 — `location: "14503 DOLCE VISTA RD, FORT MYERS, FL 33908"`,
// `radiusMiles: 0.3`:
//     [sold]     -> 12078 Terraverde Ct · 16820 Sanibel Sunset Ct · 18200 Creekside
//                   View Dr · 16299 San Carlos Blvd · 12423 McGregor Woods Cir
//     [for_sale] -> 9140 Southmont Cv · 6012 Timberwood Cir · …
// Zero of them are 14503 Dolce Vista Rd. Those exact rows are still sitting in
// `data_lake.apify_property_records` as the receipt for what we paid to learn.
//
// `moving_beacon-owner1/realtor-com-property-scraper` answers AREAS ONLY. The street
// address is ACCEPTED and silently treated as an area centre whose own record is not
// returned, and `radius` is ignored. (The older note in `apify-comps.ts`'s header —
// "radius ONLY works when the location is a specific ADDRESS" — is misleading; this is
// the correction.) A true per-property lookup exists at `one-api/realtor-property-scraper`
// ($0.007/result) but it is keyed on `property_inputs: [<realtor.com detail URL>]`, and
// the lake comp lane carries no detail URL — so it is only ever reachable DOWNSTREAM of
// the dated ZIP pull below, never instead of it.
//
// The lane that does work is `resolveCompEnrichment`: cache, then ONE dated ZIP pull.
// ═════════════════════════════════════════════════════════════════════════════

// ── READ THE CACHE BEFORE YOU PAY ────────────────────────────────────────────
//
// `data_lake.apify_property_records` (apify-record-store.ts) holds every record we have
// ever bought — 46 promoted columns + the untouched `raw`. It is WRITTEN from inside
// `fetchApifyComps`, so every call below also refills it for the next build.
//
// ⚠️ TWO ADDRESS KEYS EXIST IN THIS DIRECTORY, AND THEY ARE NOT INTERCHANGEABLE:
//     listingAddressKey("14503 DOLCE VISTA RD","FORT MYERS") -> "14503 dolce vista rd fort myers"
//     compPhotoKey     ("14503 DOLCE VISTA RD","FORT MYERS") -> "14503DOLCEVISTARD@FORTMYERS"
// The CACHE TABLE is keyed with the first. The PHOTO INDEXES are keyed with the second.
// Reading the table with a compPhotoKey returns ZERO ROWS AND NO ERROR — the exact silent
// nothing-joined shape that cost us this whole session. Each key is used only against the
// structure it belongs to, and that is why both are imported here.

// ── THE WINDOW — derived from the comps, or we do not buy ────────────────────
//
// A ZIP sweep with no date window returns an arbitrary slice of a ZIP that has hundreds
// of sales, and joins to a specific six-house comp set 0 times. That is not bad luck,
// it is the shape of the query. Narrowing the SAME sweep to the window the comps
// actually sold in is the only thing that makes the join possible.
//
// When no comp carries a sale date — which is every build on the vendor's AVM lane,
// where `comp-helper.ts:440` sets `priceDate: null` because "the vendor dates no sale" —
// there is no window to narrow to, and the correct spend is ZERO. Returning null here
// is what makes "don't buy" the default instead of a blind sweep.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** min..max of the comps' own sale dates, padded. Null = no dated comp = DO NOT BUY. */
export function compSaleWindow(
  dates: readonly (string | null | undefined)[],
  padDays = 45,
): { dateFrom: string; dateTo: string } | null {
  const iso = dates
    .map((d) => (typeof d === "string" ? d.trim().slice(0, 10) : ""))
    .filter((d) => ISO.test(d) && !Number.isNaN(Date.parse(d)))
    .sort();
  if (iso.length === 0) return null;
  const shift = (d: string, days: number) =>
    new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);
  return { dateFrom: shift(iso[0]!, -padDays), dateTo: shift(iso[iso.length - 1]!, padDays) };
}

/**
 * ONE WINDOW PER SALE MONTH — not one wide window across the whole set.
 *
 * *** THIS IS WHERE THE COVERAGE ACTUALLY COMES FROM, AND IT IS A MEASURED FACT. ***
 * A single 4-month window over ZIP 33908, 120 deep, joined 2 of 6 (live, 08/04/2026).
 * The reason is that the cap truncates: 33908 alone returned a FULL 120 for May 2026 by
 * itself, so a 4-month pull capped at 120 never reaches February at all. Splitting the
 * same budget into one pull per month spends it where the houses are instead of burning
 * it all on the most recent weeks.
 *
 * The lake's sale dates are MONTH GRAIN — `lee_comp_sales_v.sale_month` is always
 * day-of-month 1 (comp-source-lake.ts:18) — so a tight ±3-day window is not available to
 * us and the month IS the smallest honest window. The ±5 day pad covers the vendor
 * recording its sale a few days off the deed month boundary.
 */
export function compSaleMonthWindows(
  dates: readonly (string | null | undefined)[],
  padDays = 5,
): { dateFrom: string; dateTo: string }[] {
  const months = new Set<string>();
  for (const d of dates) {
    const s = typeof d === "string" ? d.trim().slice(0, 10) : "";
    if (ISO.test(s) && !Number.isNaN(Date.parse(s))) months.add(s.slice(0, 7));
  }
  const shift = (d: string, days: number) =>
    new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);
  return [...months].sort().map((m) => {
    const [y, mo] = m.split("-").map(Number) as [number, number];
    const first = `${m}-01`;
    const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); // day 0 of next month
    return { dateFrom: shift(first, -padDays), dateTo: shift(last, padDays) };
  });
}

/** RESULTS bought per sale month, ~$0.01 each — the unit the vendor actually bills.
 *  Operator call 08/04/2026, given the measured 2-of-6 at 120 across four months:
 *  "~$6/build, 3 monthly pulls @200". */
const DEFAULT_MAX_PAID_RESULTS_PER_MONTH = 200;

/** THE HARD STOP. Per-month × months is unbounded if a comp set ever spans a year, and
 *  `max_results_per_location: 0` means UNLIMITED to this vendor — a $100 run from one
 *  omitted field (apify-comps.ts:166). 700 results ≈ $7, the standing operator ceiling
 *  for a single run. Whatever the per-month number is, the build stops here. */
const HARD_TOTAL_RESULT_CEILING = 700;

/** What a comp row needs filled, resolved for one house. Absent = open slot, never a guess. */
export interface CompEnrichment {
  photoUrl?: string;
  listingUrl?: string;
  style?: string;
  /** Total baths, full + half/2. Operator, 08/04/2026: *"Why the fuck is baths not in from
   *  fucking [Apify]!!!!?????"* — because this lane read three fields off a 69-field record
   *  we had already paid for and dropped `full_baths`/`half_baths` on the floor, the same
   *  pattern that made the record cache necessary in the first place. Read through
   *  `bathsFromRecord` (apify-baths.ts), the ONE root for this conversion — never a second
   *  full+half/2 implementation. */
  baths?: number;
}

/** Photos, listing URLs and style barely move once a home is sold — unlike `list_price`
 *  or `mls_status`, which §2.1 of the cache handoff forbids serving stale. A sold home's
 *  photo from 90 days ago is the same photo. */
const STABLE_FIELD_MAX_AGE_DAYS = 180;

const str = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && isHttpUrlOrText(s) ? s : undefined;
};
const isHttpUrlOrText = (s: string) => !NA.has(s);

/**
 * THE COMP ENRICHMENT LANE — cache first, then ONE verified call per remaining house.
 *
 * Replaces the ZIP-wide sample that returned 24 photos of the wrong houses and joined 0
 * of 6. Per house: a cache hit costs nothing; a miss costs one ~$0.01 call that also
 * writes the record back for every future build. `maxPaidLookups` is the spend ceiling.
 *
 * NEVER THROWS. Every failure degrades to an open slot.
 */
export async function resolveCompEnrichment(
  comps: readonly {
    addressLine: string;
    city?: string | null;
    /** WHICH SEARCH FINDS THIS HOUSE. A recorded sale is only in the `sold` index; a
     *  valuation or active listing is only in `for_sale`. Querying the wrong one returns
     *  the house's NEIGHBOURS, `matchesAddress` rejects them all, and the slot comes back
     *  empty with no error — measured live 08/04/2026 on a 4-valuation comp set. */
    listingType?: "sold" | "for_sale" | "pending";
    /** ISO `YYYY-MM-DD`. THE FIELD THAT DECIDES WHETHER WE SPEND AT ALL — the paid lane
     *  narrows the ZIP to the window these dates describe, and buys nothing without one. */
    priceDate?: string | null;
  }[],
  opts: {
    state?: string | null;
    zip?: string | null;
    /** Vendor RESULTS to buy, ~$0.01 each — the unit the vendor actually bills. */
    maxPaidResults?: number;
    fetchZip?: typeof fetchApifyComps;
    readCache?: typeof fetchCachedRecords;
  } = {},
): Promise<Map<string, CompEnrichment>> {
  const out = new Map<string, CompEnrichment>();
  const wanted = comps.filter((c) => c.addressLine?.trim());
  if (!wanted.length) return out;

  const put = (addressLine: string, rec: Record<string, unknown>) => {
    const e: CompEnrichment = {};
    const photo = str(rec.primary_photo);
    const url = str(rec.property_url);
    const style = str(rec.style);
    if (photo && /^https?:\/\//i.test(photo)) e.photoUrl = photo;
    if (url && /^https?:\/\//i.test(url)) e.listingUrl = url;
    if (style) e.style = style;
    // BATHS ride on the SAME record as the photo — zero extra calls, zero extra dollars.
    const baths = bathsFromRecord(rec as never);
    if (baths != null) e.baths = baths;
    if (e.photoUrl || e.listingUrl || e.style || e.baths != null) out.set(addressLine, e);
  };

  // ── LANE A · the cache. Free, and the reason we stop re-buying the same houses.
  try {
    const readCache = opts.readCache ?? fetchCachedRecords;
    const keyed = wanted.map((c) => ({
      c,
      key: listingAddressKey(c.addressLine, c.city ?? ""),
    }));
    const cached = await readCache(
      keyed.map((k) => k.key),
      STABLE_FIELD_MAX_AGE_DAYS,
    );
    for (const { c, key } of keyed) {
      const row = cached.get(key);
      if (row) put(c.addressLine, row as unknown as Record<string, unknown>);
    }
  } catch {
    // No cache, no creds, table missing -> lane B still runs. Never a build failure.
  }

  // ── LANE B · ONE DATED ZIP PULL, joined by address.
  //
  // *** THIS IS NOT A LOOKUP, BECAUSE THE VENDOR HAS NO LOOKUP. *** Measured live
  // 08/04/2026: `location: "14503 DOLCE VISTA RD, FORT MYERS, FL 33908"`, radius 0.3 —
  // returned 12078 Terraverde Ct, 16820 Sanibel Sunset Ct, 18200 Creekside View Dr,
  // 16299 San Carlos Blvd, 12423 McGregor Woods Cir. The street address is accepted and
  // silently treated as an area centre whose own record is not returned; `radius` is
  // ignored. An earlier version of this function paid one such call per comp and got
  // `null` every time, by construction — those five wrong houses are still in the record
  // cache as the receipt.
  //
  // So we buy the ONE thing the vendor does sell — an area over a date range — and
  // narrow it to the window our comps actually sold in, then join on address. No window,
  // no purchase: an unwindowed sweep is the original 0-of-6 defect with a new name.
  const missing = wanted.filter((c) => !out.has(c.addressLine));
  if (missing.length === 0) return out;

  const windows = compSaleMonthWindows(missing.map((c) => c.priceDate));
  if (windows.length === 0) {
    console.warn(
      `[comp-enrichment] NO SALE DATES on ${missing.length} uncached comp(s) — skipping the ` +
        `paid photo lane entirely. An undated comp set is the vendor valuation lane, and a ` +
        `ZIP sweep with no window joins 0 of ${missing.length}.`,
    );
    return out;
  }

  const zip = (opts.zip ?? "").trim();
  if (!/^\d{5}$/.test(zip)) {
    console.warn(`[comp-enrichment] no usable ZIP for the photo lane — skipping the paid lane.`);
    return out;
  }

  const fetchZip = opts.fetchZip ?? fetchApifyComps;
  const perMonth = Math.max(1, opts.maxPaidResults ?? DEFAULT_MAX_PAID_RESULTS_PER_MONTH);
  let spent = 0;
  let joined = 0;
  /** Per-window result counts, kept only to catch the throttling tell described below. */
  const counts: number[] = [];

  // THE JOIN INDEX. `compPhotoKey` on both sides — never `listingAddressKey`, which keys
  // the cache TABLE and would silently match nothing here (see the warning block above).
  const byKey = new Map<string, ApifyRecord>();

  for (const w of windows) {
    if (spent >= HARD_TOTAL_RESULT_CEILING) {
      // NEVER a silent truncation: a coverage number measured on a truncated pull would
      // read as "these houses have no photos."
      console.warn(
        `[comp-enrichment] RESULT CEILING ${HARD_TOTAL_RESULT_CEILING} reached after ` +
          `${spent} record(s) — ${windows.length - windows.indexOf(w)} sale month(s) NOT pulled. ` +
          `Comps in those months ship without a photo.`,
      );
      break;
    }
    const cap = Math.min(perMonth, HARD_TOTAL_RESULT_CEILING - spent);
    try {
      const records = await fetchZip({
        location: zip,
        // A recorded sale is only ever in the `sold` index. The windows are built from
        // sale dates, so `sold` is the only index those dates address.
        listingType: "sold",
        dateFrom: w.dateFrom,
        dateTo: w.dateTo,
        maxResults: cap,
      });
      spent += records.length;
      for (const r of records) {
        if (!isRealString(r.street)) continue;
        const k = compPhotoKey(r.street, r.city ?? "");
        if (!byKey.has(k)) byKey.set(k, r);
      }
      // A pull that comes back AT the cap was cut short — the month holds more than we
      // bought, so a comp missing from it is "not in the slice we could afford", not
      // "has no photo". That distinction is failure mode #3 and it goes in the log.
      //
      // *** AND A SHORT PULL IS NOT AUTOMATICALLY A SMALL MONTH. *** Measured 08/04/2026:
      // two DIFFERENT windows on 33908 both returned exactly 101 records, in a ZIP whose
      // single months return a full 200 — the account was throttling on its way to a hard
      // 403, and neither pull was at the cap, so the CAPPED marker stayed silent and 101
      // read as a market fact. Identical counts across different windows is the tell.
      const suspicious = counts.includes(records.length) && records.length > 0;
      counts.push(records.length);
      console.info(
        `[comp-enrichment] ${zip} ${w.dateFrom}..${w.dateTo}: ${records.length} record(s)` +
          `${records.length >= cap ? " (CAPPED — month holds more)" : ""}` +
          `${suspicious ? " ⚠️ SAME COUNT AS AN EARLIER WINDOW — suspect vendor throttling, not a small month" : ""}.`,
      );
    } catch {
      // A paid-lane miss is never a build failure (RULE 0.7).
    }
  }

  for (const c of missing) {
    const hit = byKey.get(compPhotoKey(c.addressLine, c.city ?? ""));
    if (hit) {
      joined++;
      put(c.addressLine, hit as unknown as Record<string, unknown>);
    }
  }
  console.info(
    `[comp-enrichment] dated ZIP pull ${zip}: ${windows.length} month(s), ${spent} record(s) ` +
      `bought (~$${(spent * 0.01).toFixed(2)}), ${joined} of ${missing.length} comp(s) joined.`,
  );
  return out;
}
