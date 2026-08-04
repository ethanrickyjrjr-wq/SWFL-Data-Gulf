// lib/listings/listing-events.ts
//
// PER-LISTING EVENT HISTORY — consumer of `data_lake.steadyapi_listing_events_v`.
// View: docs/sql/20260804_steadyapi_listing_events_v.sql
// Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3, family A.
//
// THE ROOT IS THE TABLE, NOT THE VIEW. `data_lake.steadyapi_listing_events` (migration
// 20260803, parser `parse_listing_events.py`, 235,383 rows) is the root; the view above is
// a READ LAYER over it that types and guards, nothing more. Corrected 08/04/2026 — the
// view previously re-parsed the raw vendor JSON a second time, giving one concept two live
// surfaces with different rules. Read the view, never the raw table, and never add a third.
//
// 235,383 events across 17,859 properties, parsed from vendor bodies we already bought.
// Zero paid calls. This is the SOLE source for per-event price-change amounts, the
// originating MLS board, and status-change timestamps — nothing else we hold has them.
//
// ⚠️ `listing_dom` STAYS THE DOM ROOT. `daysAfterListed` here is a VALIDATION figure and
// must never become a second days-on-market root: the computed view has full coverage and
// is deterministic, this does not.
//
// ── THE TRAPS THIS MODULE EXISTS TO ABSORB (all measured 08/04/2026) ─────────
// Rent events share the array with sale events (17,022 of them) · `price = 0` is a
// sentinel concentrated in "Listing removed" (45.9%) · `days_after_listed` is the human
// string "111 days" · dates run back to 1800-01-01 · a null `listing_id` means "public
// record", not "broken row". A caller should never have to remember any of that.

/** One row of `data_lake.steadyapi_listing_events_v`. */
export interface ListingEventRow {
  property_id: string;
  event_ordinal: number;
  event_name: string | null;
  is_rental: boolean;
  event_date_raw: string | null;
  /** Already guarded by the view to [1900-01-01, today]. Null when the source date
   *  was outside it — 3,097 events pre-date 1990, 124 pre-date 1900. */
  event_date: string | null;
  /** Already NULLed by the view when the vendor sent 0. */
  price: number | null;
  price_is_zero_sentinel: boolean;
  /** 0 is REAL here — it means "no change". */
  price_change: number | null;
  /** Parsed by the view ONLY when the vendor's value carried a '%' and no '$' — 42,633 of
   *  the 44,896 present values. The other 2,263 are dollar amounts filed under the same
   *  field name and are deliberately left null rather than misread as percentages. */
  price_change_pct: number | null;
  /** The vendor's raw text, so a caller can tell "we hold no percentage" apart from "we
   *  refused the one we were given". */
  price_change_pct_raw: string | null;
  /** True when the vendor's percentage disagrees in SIGN with its own amount (183 rows).
   *  The percentage is still passed through — this flags it, it does not null it. */
  price_change_pct_conflict: boolean;
  price_sqft: number | null;
  days_after_listed: number | null;
  source_name: string | null;
  listing_id: string | null;
  list_price: number | null;
  listing_status: string | null;
  list_date: string | null;
  last_status_change_date: string | null;
  last_update_date: string | null;
}

export interface ListingEvent {
  eventName: string | null;
  /** MM/DD/YYYY, or null when the source date was unusable. Never the raw string. */
  dateLabel: string | null;
  date: string | null;
  price: number | null;
  /** True when the vendor sent 0 and we refused to call it a price. */
  priceWasZeroSentinel: boolean;
  priceChange: number | null;
  priceChangePct: number | null;
  /** The vendor HAD a percentage and we refused it (its sign contradicted its own amount).
   *  A caller rendering "no percentage available" is right either way, but this separates
   *  "the vendor never said" from "the vendor contradicted itself". */
  priceChangePctRefused: boolean;
  daysAfterListed: number | null;
  /** The originating MLS/board, e.g. "FLGulfCoastMLS", "Naples", "CoconutCoast". */
  sourceName: string | null;
  isRental: boolean;
  /** True for deed/public-record events, which carry no listing object BY DESIGN. */
  fromPublicRecord: boolean;
}

export interface PriceCut {
  /** Positive magnitude of the drop. */
  amount: number;
  pct: number | null;
  dateLabel: string | null;
  date: string | null;
}

export interface ListingEventSummary {
  events: ListingEvent[];
  priceCutCount: number;
  /** Sum of every real drop. Null when there were none — never 0, which would read
   *  as "we checked and the price never moved" on a property we hold nothing for.
   *  ALSO null when `truncated` — a total over a partial history is a fabricated figure. */
  totalPriceCut: number | null;
  priceCuts: PriceCut[];
  /** True when the fetch hit its row cap, so this history is a PREFIX, not the whole one.
   *  Measured 08/04/2026: two properties carry 357 and 328 events. */
  truncated: boolean;
  /** How many DISTINCT listing cycles the cuts came from. One address can be listed and
   *  relisted for years — 3970 NE 68th Ave, 34120 carries 11 across 2010-2026 — and cuts
   *  from different cycles do not add up to anything a person asked about. */
  listingCycleCount: number;
  scopeNote: string;
}

const SCOPE_NOTE =
  "Listing activity for this property only, from its own listing and sale records — not a count for the area.";

function isFigure(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** MM/DD/YYYY (rule 2). NEVER falls back to the raw string — the floor reaches 1800. */
function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/**
 * SALE-side events only.
 *
 * 17,022 rent events ("Listed for rent", "Price Changed for rent") sit in the same array
 * across 3,696 properties. Averaging `price` without this filter drops a $7,500 monthly
 * rent into a sale-price series — a number that is real but answers a different question.
 */
export function saleEvents(rows: readonly ListingEventRow[]): ListingEventRow[] {
  return rows.filter((r) => !r.is_rental);
}

/**
 * PURE. Real price DROPS, newest first.
 *
 * Only a negative `price_change` is a cut: an increase is not, and 0 means the price did
 * not move. Rentals are excluded — a rent reduction is not a listing price cut.
 *
 * The AMOUNT is the trustworthy field — a real number on all 235,383 events. The vendor's
 * percentage is passed through when the view kept it and is NEVER computed to fill a gap:
 * it is signed text ("+31.24%"), missing on 81% of events, sometimes a dollar string, and
 * on 183 events it contradicts the amount it supposedly describes. A cut with no percentage
 * is still a cut, so a refused percentage never suppresses the cut itself.
 */
export function priceCutHistory(rows: readonly ListingEventRow[]): PriceCut[] {
  return saleEvents(rows)
    .filter((r) => isFigure(r.price_change) && r.price_change < 0)
    .sort((a, b) => {
      if (!a.event_date && !b.event_date) return 0;
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0;
    })
    .map((r) => ({
      amount: Math.abs(r.price_change as number),
      pct: isFigure(r.price_change_pct) ? r.price_change_pct : null,
      dateLabel: dateLabel(r.event_date),
      date: r.event_date,
    }));
}

/**
 * PURE. Rows for ONE property -> a reader-facing event history, newest first.
 *
 * Undated events sort last rather than being dropped: the event happened even when its
 * date is unusable, and discarding it would understate a property's history.
 */
export function summarizeListingEvents(
  rows: readonly ListingEventRow[],
  opts: { truncated?: boolean } = {},
): ListingEventSummary {
  const events: ListingEvent[] = [...rows]
    .sort((a, b) => {
      if (!a.event_date && !b.event_date) return a.event_ordinal - b.event_ordinal;
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0;
    })
    .map((r) => ({
      eventName: r.event_name,
      dateLabel: dateLabel(r.event_date),
      date: r.event_date,
      price: isFigure(r.price) ? r.price : null,
      priceWasZeroSentinel: r.price_is_zero_sentinel === true,
      priceChange: isFigure(r.price_change) ? r.price_change : null,
      priceChangePct: isFigure(r.price_change_pct) ? r.price_change_pct : null,
      priceChangePctRefused: r.price_change_pct_conflict === true,
      daysAfterListed: isFigure(r.days_after_listed) ? r.days_after_listed : null,
      sourceName: r.source_name,
      isRental: r.is_rental === true,
      // Deed/public-record events carry no listing object BY DESIGN — measured exactly:
      // listing{} null on 31,217 events, source_name='Public Record' on exactly 31,217.
      fromPublicRecord: r.source_name === "Public Record",
    }));

  const priceCuts = priceCutHistory(rows);
  const truncated = opts.truncated === true;

  // Cycles are counted off the CUT-bearing sale events only. A null listing_id is a
  // public-record/deed event by design (31,217 of them) and is not a listing cycle.
  const cutCycles = new Set(
    saleEvents(rows)
      .filter((r) => isFigure(r.price_change) && r.price_change < 0 && r.listing_id)
      .map((r) => r.listing_id as string),
  );
  const listingCycleCount = cutCycles.size;

  return {
    events,
    priceCutCount: priceCuts.length,
    // Two refusals, same doctrine as the $0 sentinel: a sum over a PREFIX of the history is
    // not a total, and a sum ACROSS listing cycles answers a question nobody asked. The
    // individual cuts survive either way — each is a real observation on its own.
    totalPriceCut:
      truncated || listingCycleCount > 1 || !priceCuts.length
        ? null
        : priceCuts.reduce((sum, c) => sum + c.amount, 0),
    priceCuts,
    truncated,
    listingCycleCount,
    scopeNote: SCOPE_NOTE,
  };
}

export const LISTING_EVENTS_VIEW = "steadyapi_listing_events_v";
export const LISTING_EVENTS_COLUMNS =
  "property_id, event_ordinal, event_name, is_rental, event_date_raw, event_date, price, price_is_zero_sentinel, price_change, price_change_pct, price_change_pct_raw, price_change_pct_conflict, price_sqft, days_after_listed, source_name, listing_id, list_price, listing_status, list_date, last_status_change_date, last_update_date";

/** Per-property cap, keeping a bad id from scanning the 235k-row view.
 *
 *  CORRECTED 08/04/2026. This shipped at 200 with the comment "busiest observed property
 *  histories are well under this" — measured live the same day, the two busiest carry **357
 *  and 328** events, so the claim was false and the cap was silently cutting real histories.
 *  Worse, the fetch had no ORDER BY, so *which* 200 rows came back was arbitrary.
 *  Now 500 (above the measured max with headroom) AND ordered newest-first, so if a future
 *  property ever exceeds it the rows dropped are the oldest — and `truncated` says so. */
const ROW_CAP = 500;

export interface ListingEventDeps {
  fetchRows?: (propertyId: string) => Promise<ListingEventRow[]>;
}

/**
 * Fetch one property's listing-event history.
 *
 * EMPTY-TOLERANT BY CONTRACT: no creds, no rows, or any query error yields an empty
 * summary and never throws. Empty means "we hold no event records for this property",
 * never "this property never changed price".
 */
export async function fetchListingEvents(
  propertyId: string,
  deps: ListingEventDeps = {},
): Promise<ListingEventSummary> {
  const id = propertyId?.trim();
  if (!id) return summarizeListingEvents([]);

  const fetchRows =
    deps.fetchRows ??
    (async (pid: string): Promise<ListingEventRow[]> => {
      // KNOWN-DEBT(data_lake: the typed Supabase client intentionally does not cover
      // this schema — see utils/supabase/service-role.ts):
      const { createServiceRoleClientUntyped } = await import("@/utils/supabase/service-role");
      const db = createServiceRoleClientUntyped();
      const { data } = await db
        .schema("data_lake")
        .from(LISTING_EVENTS_VIEW)
        .select(LISTING_EVENTS_COLUMNS)
        .eq("property_id", pid)
        // Newest first, undated last, ordinal as the tiebreak — without this the cap below
        // takes an ARBITRARY slice of a long history.
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("event_ordinal", { ascending: true })
        .limit(ROW_CAP);
      return Array.isArray(data) ? (data as unknown as ListingEventRow[]) : [];
    });

  try {
    const rows = await fetchRows(id);
    return summarizeListingEvents(rows, { truncated: rows.length >= ROW_CAP });
  } catch {
    return summarizeListingEvents([]);
  }
}
