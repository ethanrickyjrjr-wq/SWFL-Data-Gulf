# RentCast Vendor Delivery Notes

Source: vendor delivery message + Google Sheet + Apps Script code (Code.gs, 595 lines).
Captured: 2026-06-29.

---

## What was delivered

A Google Apps Script bound to a Google Sheet. The script:
- Pulls for-sale listings (Active + Inactive) from RentCast's `/v1/listings/sale` API
- Writes rows into a "RentCast Listings" tab with 10 columns
- Color-codes rows: green=new today, yellow=price cut, red=sold/removed
- Has a scheduling UI (daily or weekly at a user-chosen hour) via GAS time-based triggers
- Sends an email notification after each refresh if an email is configured
- Has a separate on-demand rent estimate feature (`/v1/avm/rent/long-term`) that writes to a "Rent Comparables" tab

---

## Sheet structure

Row 1: dashboard — schedule description, last refresh timestamp, next refresh estimate, live countdown formula
Row 2: frozen headers
Row 3+: listing data, one row per API result

One row is appended per listing per run. The script does NOT dedup across runs — every pull appends fresh rows. Price-cut detection works within a single run by reading the existing MLS→price map before appending.

---

## API call volume per run

22 cities × 2 statuses (Active + Inactive) = 44 API calls per run.
Vendor uses `limit=500` per call.
No pagination — if a city has >500 listings in one status the tail is silently dropped.

---

## Data the script does NOT capture (available in API response, not mapped)

From `api-schema.json` — fields the vendor ignored:
- zipCode (ZIP is in the API response but vendor only uses city/state from the request)
- county
- lat/lon
- propertyType (Single Family, Condo, Townhouse, Multi Family, Land, Mobile)
- bedrooms, bathrooms, squareFootage, lotSize, yearBuilt
- listingType (Standard, New Construction)
- listingAgent / listingOffice
- photos / photoCount
- HOA fee
- garage, pool
- propertyTaxes
- lastSaleDate, lastSalePrice
- priceHistory array (per-listing event log)

These are available in every response object — the vendor just didn't write them to the sheet.

---

## Things the Google Sheet has that we should evaluate but not replicate

- Color-coded row formatting — useful visually but not a data model; we track state in columns
- Dashboard row with countdown timer — GAS-specific display feature
- Rent estimate tab — separate product feature; on-demand, not bulk

---

## API key situation

Vendor's key was stored in `.env.local` line 132: `RENTCAST_API_KEY=79e7d49dd9e542bab4390be9625604a2`
This key was shared by the vendor in the delivery and may be known to them.
Action: rotate at app.rentcast.io/app/api — user action required.

---

## Vendor's trigger mechanism

GAS `ScriptApp.newTrigger("pullRentCastListings").timeBased()` — fires within a 15-30 min window of the requested hour (GAS limitation, not exact).
Our pipeline should use GHA cron (exact, auditable, retryable) instead.

---

## What to bring into our pipeline (notes for build spec)

The vendor sheet is a reference, not a model to copy. What matters:
1. The API field map (see `field-map.md`) — these are the actual column names to request
2. The city list — 22 cities is the current coverage baseline; we can extend to ZIP-level via lat/lon bounding if RentCast supports it
3. The two-pass pattern (Active + Inactive) — both statuses needed to track lifecycle
4. The missing fields (propertyType, ZIP, beds/baths/sqft, priceHistory) — these are available and should be ingested
5. The limit=500 cap — need to monitor if any city exceeds this; no X-Total-Count to detect it
6. No cursor/since — every pull is a full city fetch; dedup via mlsNumber + listedDate in our layer
