// lib/listings/paid-record-lane.ts
//
// THE PAID ROW WE ALREADY OWN — one lane, one place, every email.
//
// Operator, 08/05/2026: "We all start at the fucking same spot." And 08/04:
// "ONE RECIPE PER FACT, EVERYWHERE." This is that, for the facts a paid Apify row
// carries and the free lane does not.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
// `saveApifyRecords` has landed every paid record since 08/04. `fetchCachedRecords`
// had exactly ONE reader (`apify-identity.ts`), so the description, the gallery, the
// HOA fee and the half-bath count sat in the table unread while the free lane shipped
// one photo and no description. Counted live 08/05/2026 across all 26 rows:
//
//   alt_photos    20 rows, 9 to 55 photos     (the free lane carries ONE)
//   description   20 rows, 368 to 2,983 chars (the free lane carries NONE)
//   hoa_fee       19 non-null — but only 12 GREATER THAN ZERO
//   half_baths     5 rows
//
// ── THIS LANE NEVER SPENDS MONEY ─────────────────────────────────────────────
// It is a READ of rows already bought. It issues no vendor call and cannot; the only
// vendor call site in the tree is `apify-comps.ts`. A miss returns the facts
// untouched — RULE 0.7, a build is never refused for a missing number.
//
// ── WHAT IT MAY AND MAY NOT FILL ─────────────────────────────────────────────
// ONLY facts that do not move: the description, the photo gallery, the bath count,
// the HOA fee, and (added 08/05/2026) beds, square feet, lot size and year built.
// It may NEVER fill list price, status, or days on market from a cached row — a price
// from three weeks ago presented as today's ask is a wrong number, not a stale one.
// Those stay with the live record.
//
// ── WHY THE SPEC RUNGS WERE ADDED — the census, counted live 08/05/2026 ───────
// Over `data_lake.listing_state` (35,202 rows), the FREE spine carries:
//   beds  25,934 (73.7%) · sqft 24,861 (70.6%) · lot_acres 27,448 (78.0%)
//   baths  5,372 (15.3%)  <- Lee 13.1%, Collier 17.5%
//
// ⚠️ **THE BATHS FIGURE ABOVE IS STALE — RE-COUNTED LIVE 08/05/2026: 10,991 of 35,202 =
// 31.2%.** It roughly DOUBLED (almost certainly the LeePA layer-23 beds/baths join landing).
// This matters because a coverage number is the argument for SPENDING: "baths are only 15%
// free" is how a paid per-address lane gets justified, and at 31.2% that argument is half
// the size it looks. **Re-derive coverage before citing it as a reason to pay** — never quote
// this block from memory. Operator decree 08/05/2026: we do not run extra vendor calls for
// data we already hold. The already-bought rows carry `baths_total` on **98.2% of 383 rows**.
// and, read from `information_schema` rather than remembered, it has NO year_built
// column, NO description and NO photo gallery AT ALL. Those three exist nowhere but
// this already-purchased row. Filling them here is the least-expensive lane there is:
// the rows are on disk, bought, and this issues no vendor call.
import {
  fetchCachedRecords,
  fetchCachedRecordLoose,
  type StoredApifyRecord,
} from "./apify-record-store";
import { listingAddressKey } from "./apify-baths";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** Specs barely move; a description and a gallery move even less. A long window is
 *  correct HERE and would be wrong for price — which this lane never fills. */
const SPEC_MAX_AGE_DAYS = 365;

/**
 * THE HOA GATE. Counted live 08/05/2026: 19 of 26 rows carry a non-null `hoa_fee`
 * and SEVEN OF THOSE ARE LITERALLY ZERO.
 *
 * A zero here is NOT "this home has no HOA." It is indistinguishable from a field the
 * vendor never filled, and rendering it as "$0/mo HOA" is a fabricated figure — the
 * playbook's §1.14 "NEVER a zero", and the same call already made for
 * `assessment_building` in data-roots. A zero is an OPEN SLOT.
 *
 * Real coverage for this cell is therefore 12 of 26, never 19.
 */
export function servableHoaFee(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Total baths the MLS way — full + half/2 — from the stored row's own columns. */
function bathsFromRow(row: StoredApifyRecord): string | null {
  const t = row.baths_total;
  if (typeof t === "number" && Number.isFinite(t) && t > 0) {
    return Number.isInteger(t) ? String(t) : t.toFixed(1);
  }
  return null;
}

/**
 * Merge the gallery WITHOUT letting it displace the hero.
 *
 * `facts.photos[0]` has already been mirrored into our own storage by the time this
 * runs, so it is the ONE photo guaranteed not to rot. Appending the vendor gallery
 * behind it keeps that guarantee for the hero and gives the email real rows below it.
 * Dedupe is by exact URL: the vendor's own `alt_photos` list starts with the same
 * primary photo, so without this the hero appears twice on every build.
 */
export function mergeGallery(
  existing: readonly string[],
  gallery: readonly string[] | null | undefined,
): string[] {
  const out = [...existing];
  const seen = new Set(existing);
  for (const url of gallery ?? []) {
    if (typeof url === "string" && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/**
 * A positive integer spec, or null. **NEVER A ZERO** (playbook §1.14): a `0` bed
 * count or a `0` year built is the vendor's unfilled field, not a fact about the
 * house, and rendering it is a fabricated figure. An absent spec is an OPEN SLOT.
 */
function positiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/**
 * THE UNIT SEAM. The free lane writes lot size as ACRES (`resolve-subject.ts`:
 * `${acres} ac`); the paid row stores `lot_sqft`. Pouring one into the other
 * unconverted prints a number 43,560x too large — "8712 ac" on a fifth-acre lot.
 * 43,560 sq ft = 1 acre, exactly.
 */
export function acresFromLotSqft(lotSqft: unknown): string | null {
  const n = positiveInt(lotSqft);
  if (n == null) return null;
  const acres = Math.round((n / 43_560) * 100) / 100;
  return acres > 0 ? `${acres} ac` : null;
}

/** What the paid row actually contributed, for the source line and for tests. */
export interface PaidLaneFill {
  description: boolean;
  photosAdded: number;
  baths: boolean;
  hoaFee: boolean;
  beds: boolean;
  sqft: boolean;
  lotSize: boolean;
  yearBuilt: boolean;
  listingUrl: boolean;
}

export const NO_FILL: PaidLaneFill = {
  description: false,
  photosAdded: 0,
  baths: false,
  hoaFee: false,
  beds: false,
  sqft: false,
  lotSize: false,
  yearBuilt: false,
  listingUrl: false,
};

export interface PaidLaneDeps {
  /** Injectable so every test runs offline. Default reads the cache table. */
  readCache?: typeof fetchCachedRecords;
}

/**
 * Fill the gaps in an already-resolved fact set from the paid row we hold for that
 * address. MUTATES `facts` in place (the caller owns it) and returns what it filled.
 *
 * GAP-FILL ONLY. Every write is guarded by "is this cell empty" — a fact the live
 * record already stated always wins, because the live record is newer. This lane
 * cannot overwrite anything, which is what makes it safe to run on every build.
 */
export async function fillFromPaidRecord(
  facts: ListingFacts,
  deps: PaidLaneDeps = {},
): Promise<PaidLaneFill> {
  // THE STREET LINE, NOT THE WHOLE ADDRESS.
  //
  // `facts.address` is the FULL printable address — "12554 Kellysands Way, Fort Myers, FL
  // 33908" — while every stored `address_key` was built from the STREET column alone
  // ("12554 Kelly Sands Way" + "Fort Myers"). Feeding the full string in produced
  // "12554 kellysands way fort myers fl 33908 fort myers", which can never equal a stored
  // key, so this lane missed on every address that carried a comma. Both halves of the join
  // now normalise the same way — the discipline this file's own header preaches.
  const street = facts.address?.split(",")[0]?.trim();
  const city = facts.city;
  if (!street || !city) return { ...NO_FILL };

  let row: StoredApifyRecord | undefined;
  try {
    const read = deps.readCache ?? fetchCachedRecords;
    const key = listingAddressKey(street, city);
    row = (await read([key], SPEC_MAX_AGE_DAYS)).get(key);
    // SECOND KEY — the same house, spelled differently by the two feeds. The daily sweep
    // writes "12554 Kellysands Way"; the paid record writes "12554 Kelly Sands Way". Counted
    // live 08/05/2026: the exact key alone reaches 8 of our 26 paid rows, and ignoring
    // spacing reaches 5 more. Tried only AFTER the exact key misses, so it can never
    // override a real hit. See `fetchCachedRecordLoose` for the collision measurement.
    if (!row && !deps.readCache) {
      row = await fetchCachedRecordLoose(street, city, SPEC_MAX_AGE_DAYS);
    }
  } catch {
    // A dead connection may not fail an email build. RULE 0.7.
    return { ...NO_FILL };
  }
  if (!row) return { ...NO_FILL };

  const fill: PaidLaneFill = { ...NO_FILL };

  // THE DESCRIPTION — the biggest copy-quality lever in a listing email, and it does
  // NOT count against the 50–125 word budget (playbook §1.9 carve-out). Fill-only:
  // the live record's remarks win, and so does anything the agent pasted in, because
  // this runs AFTER that lane. The model never rewrites it into a claim.
  if (!facts.remarks && typeof row.description === "string" && row.description.trim()) {
    facts.remarks = row.description.trim();
    fill.description = true;
  }

  // THE GALLERY — 9 to 55 photos against the free lane's one.
  const before = facts.photos.length;
  facts.photos = mergeGallery(facts.photos, row.alt_photos as string[] | null);
  fill.photosAdded = facts.photos.length - before;

  // BATHS — the named weak cell in the New Listing walk. Collier has no free
  // fallback at all, so for a Collier listing this paid row is the only source.
  if (!facts.baths) {
    const b = bathsFromRow(row);
    if (b) {
      facts.baths = b;
      fill.baths = true;
    }
  }

  // HOA — gated at > 0. See servableHoaFee.
  if (facts.hoaFee == null) {
    const hoa = servableHoaFee(row.hoa_fee);
    if (hoa != null) {
      facts.hoaFee = hoa;
      fill.hoaFee = true;
    }
  }

  // ── THE REST OF THE SPEC LADDER (census 08/05/2026) ────────────────────────
  // Counted live over data_lake.listing_state (35,202 rows): the free spine carries
  // beds on 73.7%, sqft on 70.6%, lot_acres on 78.0% — and it has NO year_built
  // column at all (read from information_schema, not remembered). The paid row
  // carries year_built on 20 of its 26 rows, so for that cell this is the ONLY
  // source we hold anywhere. Same contract as everything above: gap-fill only,
  // never a zero, and never a moving fact.
  if (!facts.beds) {
    const beds = positiveInt(row.beds);
    if (beds != null) {
      facts.beds = String(beds);
      fill.beds = true;
    }
  }

  if (!facts.sqft) {
    const sqft = positiveInt(row.sqft);
    if (sqft != null) {
      facts.sqft = String(sqft);
      fill.sqft = true;
    }
  }

  if (!facts.lotSize) {
    const lot = acresFromLotSqft(row.lot_sqft);
    if (lot) {
      facts.lotSize = lot;
      fill.lotSize = true;
    }
  }

  if (!facts.yearBuilt) {
    const yb = positiveInt(row.year_built);
    if (yb != null) {
      facts.yearBuilt = String(yb);
      fill.yearBuilt = true;
    }
  }

  // THE LISTING'S PUBLIC PAGE — the one thing the whole "View the Full Listing" button
  // needs, and the ONE place we hold it. `property_url` is the vendor's own url STRING,
  // stored verbatim; counted live 08/05/2026 it is present on **26 of 26 rows**, the
  // best-filled column on the table. The free spine has NO url column at all (read from
  // information_schema, all 42 columns — there is no `listing_url`, no `source_url`).
  //
  // Never fetched to confirm and never derived from the permalink formula — see
  // `lib/listings/listing-url.ts` for why that idea is closed.
  if (!facts.listingUrl) {
    const u = row.property_url;
    if (typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim())) {
      facts.listingUrl = u.trim();
      fill.listingUrl = true;
    }
  }

  return fill;
}
