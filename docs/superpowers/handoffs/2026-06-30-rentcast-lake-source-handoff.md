# Handoff — RentCast as the listing-lifecycle lake source (changes-only model)

**Date:** 2026-06-30
**Status:** PARKED design + evidence. Not started. The grid-lab build (build-time wiring) went first; this is the durable "our data" lane.
**Sibling now-build:** `docs/superpowers/specs/2026-06-30-rentcast-grid-lab-*` (RentCast live into the social grid lab).

---

## Goal

Make RentCast the clean source feeding the **already-live** listing-lifecycle state machine, retiring
the fragile palmparadise ("Source B") scrape. Outcome: `data_lake.listing_state` /
`data_lake.listing_transitions` carry SWFL for-sale inventory with full listing/price history, property
type, lat/lon, and ZIP — keyed by a RentCast `source_name` — and a consuming for-sale-market brain reads it.

> **VERIFIED 2026-06-30 (live probe + RentCast official docs) — RentCast returns NO property photos.**
> The vendor-delivered `api-schema.json` hallucinated `photos: string[]`, `photoCount`, and a
> `priceHistory[]` array. The REAL `/v1/listings/sale` response has none of those. The real
> price/listing history field is `history` — a **date-keyed object** (`{"YYYY-MM-DD": {event, price,
> listingType, listedDate, removedDate, daysOnMarket}}`), not an array. RentCast is a facts API, not a
> media API. Photos, if ever wanted, come from a DIFFERENT source (RESO/MLS Media via `lib/reso/`, or
> the IDX-page scrape in `lib/email/listing-scrape.ts`) — never from RentCast.

This is the "our data" lane of the four-lane moat. It also upgrades the grid-lab + flyer later: their
comps/photos read OUR lake instead of a live vendor call.

---

## The operator's hard constraint (LOCKED 2026-06-30)

> "once we get the lake we are only calling for the changes each day. we aren't ingesting all the data
> every day. that is dumb as fuck."

Correct, and the lifecycle machine **already does this**: `distill.upsert_state` + `append_transitions`
persist ONLY the deltas (new / price-cut / removed); unchanged listings just age in place (DOM = days in
the current active spell). The lake is NOT re-ingested daily.

**The one honest caveat — verified this session (RULE 0.4):** RentCast's `/v1/listings/sale` has **no
since/cursor param** (`api-schema.json` → `no_cursor_or_since_param: true`). There is no "give me only
today's changes" endpoint. So the daily TICK still has to pull the *current* active snapshot per city to
diff against yesterday's stored state — then it writes only what changed. That snapshot pull is the
minimum the API allows; it is NOT a full lake re-ingest. The big pull is the **one-time seed**; after
that it is snapshot→diff→store-deltas.

If we want to shrink the daily snapshot call count further: `/listings/sale/{id}` fetches one listing by
id (the lifecycle holds prior ids) — but you still need a list call per city to discover NEW ids and to
see which ids dropped out. There is no escaping one current-active list pull per city per tick.

---

## What already exists (probed this session — RULE 0.5)

All tracked and LIVE on main:

- `ingest/pipelines/listing_lifecycle/pipeline.py` — orchestrator: per county, `scan_county` (full
  active walk) → `coverage_guard.scan_is_complete` → `transitions.diff_states` (seed when no prior
  state) → `distill.upsert_state` + `append_transitions`. Fails loud only if EVERY county returns 0.
- `.../extract.py` — `scan_county(county)` + `SWFL_COUNTIES`. **This is the swap point.** Today it
  scrapes Source B (palmparadise), capped ~3000/county with band-partition hacks. Replace/duplicate
  with a RentCast-backed extractor returning the same row shape.
- `.../distill.py` — `_STATE_TABLE = data_lake.listing_state`, `_TRANS_TABLE = data_lake.listing_transitions`,
  keyed by `source_name`, ODD-tolerant (missing/empty table = "no prior state", not a crash).
- `.../transitions.py` (`diff_states`), `.../coverage_guard.py` (`scan_is_complete`, cap-aware),
  `.../address_key.py` (`address_key` normalization).
- `.github/workflows/listing-lifecycle-daily.yml` — the daily cron wrapper.

RentCast maps onto this machine cleanly:
- **Active** listing → `state="active"`.
- **Inactive** + `removedDate` → left the feed → the machine's HOLDING transition (never deleted; a
  reappearance is a relist). The vendor already pulls Active **and** Inactive precisely for this.
- New columns RentCast brings (vendor never wrote them, all confirmed in the live probe): `zipCode`,
  `county`, `countyFips`, `lat/lon`, `propertyType`, `bedrooms/bathrooms/squareFootage/lotSize/yearBuilt`,
  `hoa.fee`, `mlsName`/`mlsNumber`, `listingAgent`/`listingOffice` (PII — store only if needed),
  `createdDate`/`lastSeenDate`, and `history` (the date-keyed listing/price-change log — this is how you
  reconstruct price cuts and prior spells). These need columns on `listing_state` (a migration) +
  backfill. **NOT available: photos / photoCount (see verified note above).**

---

## How RentCast plugs in (the build, in order)

1. **New extractor** `ingest/pipelines/listing_lifecycle/extract_rentcast.py` (or a `source=` switch in
   `extract.py`): `scan_county(county)` → for each city in that county, GET
   `/v1/listings/sale?city=&state=FL&status=Active` and `=Inactive`, normalize to the row shape
   `_keyed_scan` expects (`street_address`, `zip_code`, `mls`, `mls_region`, `sale_or_rent`, `price`,
   `state`, plus the new columns). Set `source_name = "rentcast"` (NOT palmparadise) so it co-exists /
   migrates cleanly.
2. **Coverage guard** — RentCast caps `limit=500` per call with **no X-Total-Count** to detect overflow.
   Any SWFL city with >500 active in one status silently truncates. `coverage_guard` must treat a
   501-at-cap city as untrustworthy (or paginate if RentCast adds offset — it currently does not).
   Cape Coral / Fort Myers / Naples are the overflow risks.
3. **Migration** — add the new columns to `data_lake.listing_state` (idempotent; via `new Bun.SQL`,
   `sslmode=require`, creds in `.dlt/secrets.toml` — psql is NOT installed). Guard load-bearing columns
   before any destructive write (Gate 4).
4. **Brain-first gate (non-negotiable):** no new Tier-2 shape without its consuming brain's
   `PackDefinition` in the SAME PR. Build/extend a for-sale-market brain (new-listing count, median list
   price, price-cut rate, median DOM, by county→ZIP, by property type) reading `listing_state` /
   `listing_transitions`. Ship the vocab slugs + the pack in the same commit (orphan linter aborts the
   GHA rebuild in the gap). Check if a listing brain already consumes these tables before adding a new one.
5. **Pipeline-freshness** — ship the GHA cron wrapper edit + `--dry-run` in the same PR. The existing
   `listing-lifecycle-daily.yml` is the wrapper; point it at the RentCast source (or add a parallel job).
6. **Cadence registry** — `active_listings` / `listing_state` cadence entries already exist
   (`ingest/cadence_registry.yaml`); update `source_name` + `expected_rows_min` once seeded from the live
   count.

---

## Vendor facts pinned this session (RULE 0.4 — crawl4ai, not memory)

**Terms** (`https://www.rentcast.io/terms-api`, Fortnoff Financial LLC):
- §1 License Grant — explicitly grants "use and/or **store** the API Data" and "(iv) for sublicensure,
  disclosure, **display, resale and distribution** of the API Data to third parties." Storing in the lake
  + reselling in deliverables is squarely permitted.
- §3.4 — **no attribution required** (approved logos optional).
- §3.3 / §3.5 — API Data MAY include third-party (MLS-origin) data whose own license controls on conflict,
  and YOU (not RentCast) carry IP-infringement liability. **This was flagged for photos — moot, since
  RentCast returns no photos.** It still applies to the factual data (broadly usable: addresses, prices,
  specs are non-creative facts), so keep the awareness if a future media source is added.
- §1 (key) / general — the API key is confidential, **one key per application, do not share.** The
  vendor-delivered key was shared in the delivery → **ROTATE** at app.rentcast.io and store as a gh
  secret before any cron/CI use.

**Pricing/limits** (`developers.rentcast.io/reference/billing-and-pricing` + `/rate-limits`):
- Free **Developer** plan = **50 requests/month**, then a per-request overage fee.
- Paid plans = fixed monthly + per-request overage; tiers gated behind JS on the marketing site —
  **confirm the exact tier $ on the API dashboard** (you hold the account).
- Only successful 200s are billed; errors are free. Quota resets each billing period; no carryover.
- Hard rate limit **20 req/sec per key** (429 over it). Our sequential per-city calls are nowhere near.

**Cost sizing for the daily cron:** vendor pattern = 22 cities × 2 statuses = **44 calls/day ≈ 1,320/mo**
→ exceeds the free 50/mo → **needs a paid tier.** (The grid-lab build deliberately avoids this — it is
build-time, a few calls per generation, free-tier-friendly.)

---

## Coverage (from the delivered field-map)

Vendor's 22 cities, 4 counties: Lee (Fort Myers, Cape Coral, Bonita Springs, Estero, Fort Myers Beach,
Sanibel, North Fort Myers, Lehigh Acres), Collier (Naples, Marco Island, Immokalee, Golden Gate, Ave
Maria), Charlotte (Punta Gorda, Port Charlotte, Rotonda West, Englewood), Sarasota (Sarasota, Venice,
North Port, Nokomis, Siesta Key). **Glades + Hendry** have no cities in the feed — confirm whether
RentCast covers any (LaBelle, Clewiston, Moore Haven) or park them as a known gap. SWFL scope is 6-county
(Charlotte 12015, Collier 12021, Glades 12043, Hendry 12051, Lee 12071, Sarasota 12115).

---

## Source material (LOCAL, untracked — `docs/superpowers/sources/rentcast/`)

`apps-script.gs`, `field-map.md`, `api-schema.json`, `delivery-notes.md`. **`delivery-notes.md` line 69
contains the live vendor API key in plaintext** — scrub it before that directory is ever `git add`ed.

---

## Gotchas the next session must not relearn

- **The delivered `api-schema.json` is WRONG about photos.** RentCast returns no `photos`/`photoCount`
  and no `priceHistory[]`; the real history field is the date-keyed `history` object. Verified against
  the live API + RentCast official docs 2026-06-30. Don't rebuild the lake plan on the delivered schema —
  trust the live probe (`scratchpad/rc_live_sample.json` shape).
- No since-cursor → snapshot-to-diff is mandatory (see constraint above).
- No X-Total-Count → can't detect the 500-cap overflow from the response; guard on count==500.
- No native ZIP filter → query by city, filter the response on `zipCode`.
- One key per application (terms) → don't reuse the same key for grid-lab + cron + flyer; mint separate
  keys per integration (RentCast recommends this).
- Brain-first + vocab-in-same-commit + Gate 4 guard + `--target-only` rebuild — all apply.
