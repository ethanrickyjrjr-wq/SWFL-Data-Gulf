# /property-tax-history — FULL SCOPE of one paid call (live probe 08/02/2026)

**Why:** operator decree — "MAKE SURE WE ARE GETTING ALL THE DATA WE CAN USING THE API CALL."
FULL-SCOPE-FIRST requires enumerating the source ceiling before writing ingest code.

**Evidence:** FOUR live calls, 08/02/2026, all HTTP 200 — one property per lifecycle state so a
sold/withdrawn property exposes fields a for-sale one never shows:
`1102741290` (active), `1617896233` (holding), `1440538288` (sold), `1667459937` (withdrawn).
Field paths unioned across all four (arrays collapsed to `[]` so every element unions).
Earlier single-property probe was `5200800427`.

**Headline (EXACT, counted — an earlier draft of this file said "~50", which was never counted and
UNDERSTATED it): the response carries 64 distinct field paths. We PERSIST 3, we READ-and-discard 3,
and we NEVER TOUCH 58.**

Of those 58 untouched: 7 are an exact duplicate (`statistics.permits.recent[]` repeats
`building_permits[]`), 8 duplicate `statistics` rollups up into `meta`, and 4 are envelope
(`meta.version/copywrite/status/property_id`). **That leaves 39 genuinely distinct, useful fields we
pay for and throw away on every single call.**

Counts per family: `property_history[]` 15 · `statistics` 20 · `meta` 13 · `tax_history[]` 8 ·
`building_permits[]` 7 · `body.status` 1 = 64.

The 3 we persist: `property_history[].listing.list_date` -> `listed_date` (the backfill's only
write), plus `property_history[].price` -> `sold_price` and `property_history[].date` -> `sold_date`
on the sold path only. The 3 we read but never store: `meta.current_status`, `body.status`,
`property_history[].event_name`.

## 1. `property_history[]` (3 elements here) — what we take one field from

Union of keys across all elements:
`date, event_name, price, price_change, price_change_percentage, price_sqft, days_after_listed,
source_name, listing{}`

`listing.*` → `listing_id, list_price, status, list_date, last_status_change_date, last_update_date`

Distinct `event_name` values seen: **`Listed`, `Price Changed`, `Sold`** — confirms the generous
matchers in `extract_api._SALE_EVENT_RE` / `_LISTED_EVENT_RE` (previously PARKED as unverified under
check `steadyapi_sold_capture_live_verify` — this probe supplies the verbatim values).

Notable fields we never read:
- **`days_after_listed`** — the vendor's OWN per-event days-on-market. Census §4 claims "per-listing
  days-on-market" is a vendor ceiling; that is true of `/search`, but this endpoint carries a
  per-event DOM directly. Null on this sample's element 0; needs a multi-property check.
- **`source_name` = `"CoconutCoast"`** — the originating MLS/board. Census §4 says "Agent/brokerage/
  office fields — zero across all 18 endpoints." This is a *board/source* name, not an agent, but it
  is a listing-provenance field the census does not account for.
- **`last_status_change_date`** — directly serves the open pending/contingent-timing design
  (`docs/superpowers/specs/2026-08-01-listing-status-wire-design.md`).
- `price_change`, `price_change_percentage`, `price_sqft` — full cut history per event.

## 2. `tax_history[]` (9 elements here) — a 9-year per-parcel tax + valuation series

Per year: `year, tax_amount, assessment{total, building, land}, market_value{total, building, land}`

This is a second, independent source for assessed/market value that also covers **Collier**, where our
LEEPA lane does not reach. Cross-source agreement contracts already exist for leepa<->FDOR and
realtor<->redfin (commits `30743f01`, `3dd2f170`) — this is the natural third family.

## 3. `building_permits[]` (5 elements here) — ZERO new calls

Per permit: `permit_type, project_type_1, project_type_2, project_type_3, project_name,
effective_date, status`

Already ranked **#2 on the should-get list** in `docs/steadyapi-capability-census.md` §3 as
"ZERO new calls ... just parse + persist what's already in hand." Still unbuilt as of 08/02/2026.
Second source to cross-check Accela/county permits (the undisclosed-flip pain point).

**Date format warning:** `effective_date` is `"Mar 8, 2021"` — a human string, NOT ISO. Every other
date in this response is ISO. A normalizer must parse it explicitly or it lands as garbage.

## 4. `statistics{}` — vendor-computed rollups

- `statistics.tax`: `total_years, total_tax_paid, average_annual_tax, latest_tax_year,
  latest_tax_amount, trend` (`trend` = `"increasing"` — a vendor-computed direction call)
- `statistics.transactions`: `total, sales_count, listings_count, current_price, first_price,
  price_appreciation_percentage`
- `statistics.permits`: `total, recent[]` (duplicates `building_permits[]`)

## 5. `meta{}` — 13 keys, includes real data not just envelope

`version, status, copywrite, property_id, current_status, total_transactions, total_tax_years,
total_permits, avg_annual_tax, latest_tax_year, latest_tax_amount, tax_trend, price_appreciation`

We read `meta.current_status` only. `price_appreciation` (`"87.72%"`, a string) and `tax_trend`
duplicate the `statistics` block.

## The guard that must ship with ANY of this

`distill.upsert_state._ENRICH_ONLY_COLS = ("listed_date", "baths")`. Every other column in
`_STATE_COLS` gets a blanket `EXCLUDED` overwrite on the nightly merge, and `/search` sets these
fields to `None`. **Any new column populated from this endpoint that is not added to
`_ENRICH_ONLY_COLS` in the same commit will be nulled by the next nightly sweep.** That is exactly
how `baths` was wiped (34,139 of 34,478 rows, 07/26) and how `listed_date` was wiped (17,127 rows,
07/19). Twice reactively patched; do not make it three.

Non-scalar families (`tax_history`, `building_permits`, `property_history`) do not belong in
`listing_state` at all — they are one-to-many and need their own tables, which puts them behind the
brain-first gate (consuming `PackDefinition` in the same PR).
