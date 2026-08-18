// lib/listings/apify-property-lookup.ts
//
// THE BY-ADDRESS RECORD BUY — one property, one call, ~$0.007, behind the switch.
//
// `one-api/realtor-property-scraper` is the TRUE per-property lookup the wired
// area actor cannot do (its `location` is a search area — playbook §3.3.1 R1).
// Verified live 08/10/2026 against the vendor's own input schema: `property_inputs`
// auto-detects "digits → property_id, http(s) URL → listing URL, anything else →
// address" — a plain street address works. Proven with run MdWKQA4bKzH8uufrO
// (the Coming Soon demo house, saved as account task `property-by-address`).
//
// ── WHERE THIS SITS ON THE LADDER (RULE 0.7a) ────────────────────────────────
// Rung 3, and ONLY rung 3: the caller (lib/deliverable/recipes/shared.ts) reaches
// here when the free spine missed AND the already-bought row missed. The decree
// that makes this a build step at all is the 08/10/2026 storefront decree — any
// address, filled through the Apify rung — and the spend switch still governs:
// with `OPERATOR_APPROVED_PAID_RUN` unset this lane refuses loudly and the build
// ships open slots (never refused, never silently paid).
//
// ── SHAPE NOTE (read from the live run, not memory) ──────────────────────────
// Each dataset item is a Title-Case summary ("Street", "Price", "Baths"…) plus a
// `Raw` field holding the vendor's full detail blob AS A JSON STRING (object
// tolerated) — description at `Raw.details.text`, photos at `Raw.photos[].href`,
// address at `Raw.address`. We normalize onto the SAME ApifyRecord field names
// the area actor uses so `toRow`/`saveApifyRecords` (the ONE write root) and
// `fillFromPaidRecord` (the ONE gap-fill lane) need no second code path.

import type { ApifyRecord } from "./apify-comps";
import { runGuardedApifyActor } from "./apify-run";
import { saveApifyRecords, toRow, type StoredApifyRecord } from "./apify-record-store";
import { fillFromPaidRecord, NO_FILL } from "./paid-record-lane";
import { commaCity } from "./resolve-subject";
import type { ListingFacts } from "@/lib/email/listing-scrape";

export const ONE_API_ACTOR_ID = "one-api~realtor-property-scraper";

const NA = new Set(["<NA>", "NA", "N/A", "null", "undefined", "None"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() && !NA.has(v.trim()) ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function positive(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function usd(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function parseRawBlob(v: unknown): Record<string, unknown> {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * One one-api dataset item → the ApifyRecord shape the whole paid lane already
 * speaks. Null when the item does not identify a house (the `{error}` shape, a
 * bare string, a record with no street) — never a keyless row.
 */
export function normalizeOneApiItem(item: unknown): ApifyRecord | null {
  if (!item || typeof item !== "object") return null;
  const it = item as Record<string, unknown>;
  const raw = parseRawBlob(it.Raw);
  const details = (raw.details ?? {}) as Record<string, unknown>;
  const addr = (raw.address ?? {}) as Record<string, unknown>;

  const street = str(addr.line) ?? str(it.Street);
  const city = str(addr.city) ?? str(it.City);
  if (!street || !city) return null;

  // The vendor states a TOTAL ("3", "3.5"). Baths come in halves, so floor +
  // one-half-when-fractional reproduces that total EXACTLY through toRow's
  // `full + half/2` — nothing invented, nothing lost.
  const bathsTotal = num(details.baths) ?? num(it.Baths);
  const fullBaths = bathsTotal != null ? Math.floor(bathsTotal) : null;
  const halfBaths = bathsTotal == null ? null : bathsTotal % 1 !== 0 ? 1 : 0;

  const photos = Array.isArray(raw.photos)
    ? (raw.photos as unknown[])
        .map((p) => str((p as Record<string, unknown> | null)?.href))
        .filter((u): u is string => u !== null)
    : [];

  const taxRow = Array.isArray(raw.tax_history)
    ? ((raw.tax_history as unknown[])[0] as Record<string, unknown> | undefined)
    : undefined;
  const mls = (raw.mls ?? {}) as Record<string, unknown>;
  const estimates = (raw.estimates ?? {}) as Record<string, unknown>;
  const currentValues = Array.isArray(estimates.current_values)
    ? (estimates.current_values as Record<string, unknown>[])
    : [];
  const bestEstimate =
    num(currentValues.find((c) => c.isbest_homevalue === true)?.estimate) ??
    num(currentValues[0]?.estimate);

  const record = {
    street,
    city,
    unit: str(addr.unit),
    state: str(addr.state_code) ?? str(it.State),
    zip_code: str(addr.postal_code) ?? str(it.Zip),
    latitude: num(addr.latitude) ?? num(it.Latitude),
    longitude: num(addr.longitude) ?? num(it.Longitude),
    property_id: str(raw.property_id) ?? str(it["Property ID"]),
    listing_id: str(raw.listing_id),
    status: str(raw.status) ?? str(it.Status),
    beds: num(details.beds) ?? num(it.Beds),
    full_baths: fullBaths,
    half_baths: halfBaths,
    sqft: num(details.sqft) ?? num(it.Sqft),
    lot_sqft: num(details.lot_sqft) ?? num(it["Lot Sqft"]),
    year_built: num(details.year_built) ?? num(it["Year Built"]),
    stories: num(details.stories),
    parking_garage: num(details.garage),
    list_price: num(raw.list_price) ?? num(it.Price),
    price_per_sqft: num(raw.price_per_sqft),
    estimated_value: bestEstimate,
    assessed_value: num((taxRow?.assessment as Record<string, unknown> | undefined)?.total),
    hoa_fee: num(raw.hoa_fee),
    tax: num(taxRow?.tax),
    last_sold_price: num(raw.last_sold_price),
    last_sold_date: str(raw.last_sold_date),
    sold_price: num(raw.sold_price),
    mls: str(mls.name),
    days_on_mls: num(mls.days_on_mls) ?? num(it["Days on Market"]),
    list_date: str(raw.list_date) ?? str(it["List Date"]),
    pending_date: str(raw.pending_date),
    text: str(details.text),
    primary_photo: photos[0] ?? null,
    alt_photos: photos,
    property_url: str(raw.href) ?? str(it["Listing URL"]),
    // Not promoted columns — ride inside the stored row's `raw` jsonb, which
    // keeps the whole record ("a field we did not think to promote is still
    // ours tomorrow"). property_type feeds the flyer's Type cell on this lane.
    property_type: str(details.type) ?? str(it["Property Type"]),
    source_actor: "one-api/realtor-property-scraper",
  };
  return record as unknown as ApifyRecord;
}

export interface PropertyLookupInput {
  property_inputs: string[];
}

export interface PropertyLookupDeps {
  /** Injectable for offline tests. Default is the live guarded run. */
  runActor?: (input: PropertyLookupInput) => Promise<unknown[]>;
  /** Injectable save spy; defaults to the ONE write root (skipped when runActor
   *  is injected, mirroring fetchApifyComps — tests stay offline by default). */
  save?: (records: readonly ApifyRecord[]) => Promise<number>;
}

/**
 * Buy THIS property's record by its street address. One call, one result
 * requested, one row saved (upsert — a re-fetch refreshes, never duplicates).
 * Returns the stored-row shape so the caller and the cached lane speak the same
 * fields. Null on any miss/refusal, and NEVER throws (RULE 0.7).
 */
export async function fetchApifyPropertyByAddress(
  address: string | null | undefined,
  deps: PropertyLookupDeps = {},
): Promise<StoredApifyRecord | null> {
  const subject = String(address ?? "").trim();
  // A lookup needs a real street address. A bare city or ZIP would make the
  // vendor pick a stranger's house and bill for it — same house-number gate the
  // lake lane applies before ITS candidate fetch.
  if (!/^\d+\s/.test(subject)) return null;

  const run =
    deps.runActor ??
    ((input: PropertyLookupInput) =>
      runGuardedApifyActor({
        actorId: ONE_API_ACTOR_ID,
        input: input as unknown as Record<string, unknown>,
        // The input's own cap: one entry in property_inputs = one billable result.
        requestedResults: input.property_inputs.length,
      }));

  try {
    const items = await run({ property_inputs: [subject] });
    const record = (Array.isArray(items) ? items : [])
      .map(normalizeOneApiItem)
      .find((r): r is ApifyRecord => r !== null);
    if (!record) {
      // LOUD, per this directory's law: a silent null is indistinguishable from a
      // vendor refusal or an unwired lane. This shape is REAL and measured — the
      // vendor returns one all-blank item for an address it cannot match (probed
      // live 08/10/2026 with a Mapbox-interpolated house number that isn't a real
      // parcel). Open slots downstream are then honest, not broken.
      if (Array.isArray(items) && items.length > 0) {
        console.warn(
          `[apify-property-lookup] vendor matched NO property for "${subject}" — ` +
            `likely not a real parcel (autocomplete interpolation) or not on the vendor. ` +
            `Slots stay open; nothing was saved.`,
        );
      }
      return null;
    }

    // KEEP WHAT WE PAID FOR — through the ONE write root, awaited (a build
    // process does not outlive a fire-and-forget write; see apify-comps.ts).
    const save = deps.save ?? (deps.runActor ? null : saveApifyRecords);
    if (save) await save([record]).catch(() => 0);

    return toRow(record);
  } catch {
    return null;
  }
}

/** The 50-state + DC abbreviation set, for stripping a trailing state token off
 *  a comma-less "Columbus OH 43215" segment when deriving the city. */
const STATE_ABBREV = new Set(
  (
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH " +
    "NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC"
  ).split(" "),
);

/** The city segment of a typed address, for ANY state — commaCity() strips FL
 *  tokens (its lane is SWFL-only); this also drops a trailing state abbreviation. */
export function cityFromTypedAddress(address: string): string {
  const seg = commaCity(address);
  if (!seg) return "";
  const words = seg.split(" ");
  const last = words[words.length - 1] ?? "";
  if (words.length > 1 && STATE_ABBREV.has(last.toUpperCase())) words.pop();
  return words.join(" ").trim();
}

/**
 * Seed city/state/zip onto BARE facts from the typed address text, filling only
 * absent cells. Without this, a non-SWFL subject has no `facts.city`, the paid
 * cache key can never be built, and the already-bought row is invisible — so
 * every rebuild of the same address would re-buy it (the RULE 0.7a defect).
 */
export function seedFactsLocationFromAddress(facts: ListingFacts): void {
  const address = facts.address ?? "";
  if (!facts.city) {
    const city = cityFromTypedAddress(address);
    if (city) facts.city = city;
  }
  if (!facts.zip) {
    const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(address.split(",").slice(1).join(","))?.[1];
    if (zip) facts.zip = zip;
  }
  if (!facts.state) {
    const st = address.toUpperCase().match(/,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*(?:,|$)/)?.[1];
    if (st && STATE_ABBREV.has(st)) facts.state = st;
  }
}

/**
 * Fill facts from a row bought THIS build. Two halves:
 *
 * 1. The cached-shape gap fill, by injecting this row into the ONE lane
 *    (`fillFromPaidRecord`) — description, gallery, baths, HOA, beds, sqft,
 *    lot, year built, listing URL. Same guards, zero duplication.
 * 2. The MOVING facts (list price, days on market) — which the CACHED lane may
 *    NEVER serve (a three-week-old ask presented as today's is a wrong number,
 *    not a stale one). Legal here for exactly one reason: this row is seconds
 *    old, bought for this address in this same invocation. Price fills only on
 *    an active/pending record — a sold home's old ask is not an ask.
 */
export async function fillFactsFromFreshRow(
  facts: ListingFacts,
  row: StoredApifyRecord,
): Promise<void> {
  // Identity cells from the vendor's own record — the typed text may lack them,
  // and the paid-lane key needs street + city to exist at all.
  if (!facts.city && typeof row.city === "string" && row.city) facts.city = row.city;
  if (!facts.state && typeof row.state === "string" && row.state) facts.state = row.state;
  if (!facts.zip && typeof row.zip_code === "string" && row.zip_code) facts.zip = row.zip_code;
  if (typeof row.latitude === "number" && facts.lat == null) facts.lat = row.latitude;
  if (typeof row.longitude === "number" && facts.lon == null) facts.lon = row.longitude;
  // The unit rides in its OWN column here (row.unit), unlike the free-lake spine's
  // convention of folding it into the street line ("8521 Oakshade Cir #422" — see
  // apify-record-store.ts's own comment on this exact split). Match that convention
  // when printing, or a multi-unit address silently loses which unit it is: found
  // live 08/11/2026 — a Nashville condo pull resolved Apt 173's price and specs but
  // the flyer printed the bare building address, ambiguous across every unit there.
  const streetWithUnit = str(row.street)
    ? [str(row.street), str(row.unit) ? `#${str(row.unit)}` : null].filter(Boolean).join(" ")
    : null;
  const full = [streetWithUnit ?? row.street, row.city, row.state, row.zip_code]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(", ");
  if (full && !(facts.address ?? "").includes(",")) facts.address = full;

  // Every requested key maps to THIS row: identity was settled by the pull's own
  // input (this address), so the key-normalization drift the cached lane guards
  // against cannot mis-assign a different house here.
  await fillFromPaidRecord(facts, {
    readCache: async (keys) => new Map(keys.map((k) => [k, row])),
  }).catch(() => ({ ...NO_FILL }));

  // Case-insensitive: the vendor has shipped BOTH "for_sale" and "FOR_SALE" for the
  // same state (a stored row probed live 08/18/2026 reads "FOR_SALE"), and an exact
  // lowercase compare silently dropped the ask on the uppercase spelling.
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : null;
  const active = status === "for_sale" || status === "pending";
  if (!facts.price && active && positive(row.list_price)) {
    facts.price = usd(row.list_price);
  }
  if (
    facts.daysOnMarket == null &&
    active &&
    typeof row.days_on_mls === "number" &&
    Number.isInteger(row.days_on_mls) &&
    row.days_on_mls >= 0
  ) {
    facts.daysOnMarket = row.days_on_mls;
  }
  // Property type now fills inside fillFromPaidRecord (row.style — the vendor's
  // actual key; the `raw.property_type` read that used to sit here was a dead rung,
  // probed live 08/18/2026: the blob has no such key).
}
