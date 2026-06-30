# SteadyAPI listings lake + for-sale-market brain

> **⚠️ SUPERSEDED 2026-06-30 — false-premise correction.** This spec assumes `listing_lifecycle` does not exist and proposes a standalone `steadyapi_listings` table keyed on the rotating `property_id`. Both premises are wrong — verified against live code + the live DB this session:
> - `ingest/pipelines/listing_lifecycle/` **exists on main** (7 modules: extract/distill/transitions/coverage_guard/address_key/pipeline), `migrations/20260627_listing_lifecycle.sql` is applied, and `data_lake.listing_state` holds **10,459** seeded rows. **Not greenfield.**
> - Keying on `property_id` is the exact relist bug `20260627_listing_lifecycle.sql` was built to avoid (a relist gets a new id). The machine keys on **`address_key`**.
> - `property_type` is a **column** in `listing_state` (capture wide, slice late) — the proposed per-`property_type` sweep is rejected. RentCast returns `propertyType` directly, so no per-type sweep is even needed.
> - **RentCast is back IN as the data spine** (real price / DOM / list-date / MLS#); SteadyAPI supplies **photos** + a second active-set enumeration, grafted by proximity. RentCast was wrongly dropped here for "no photos" — photos come from SteadyAPI in the merge.
>
> **Build from instead:** `docs/superpowers/plans/2026-06-30-api-fed-listing-lifecycle.md` — it extends `listing_state` with an API feed under `source_name='api_feed'`. This spec is retained only for its verified SteadyAPI record contract (below).

**Date:** 2026-06-30
**Build slug:** `steadyapi-listings-lake` · check `steadyapi_listings_lake_live_verify`
**Scope:** Lee (FIPS 12071) + Collier (FIPS 12021) only.
**Sibling (live lane, already shipped):** `lib/listings/` build-time client — `e1e30aaa` SteadyAPI photos into the email + social labs. THIS spec is the durable "our data" lane that feeds a brain.
**Supersedes:** the parked RentCast lake handoff (`docs/superpowers/handoffs/2026-06-30-rentcast-lake-source-handoff.md`). RentCast is no longer the listings source — SteadyAPI is (it returns photos; RentCast does not). RentCast stays a build-time MLS-detail enrichment only.

---

## Problem

The labs can cite a *current* listing via the live SteadyAPI call, but a single call only ever shows what is listed **right now**. It cannot answer trend questions — what cut its price, how long things sit, what came off the market — because that history exists only across days, and a live call has no memory. RentCast was evaluated as the lake source and rejected: it returns no photos and its `/markets` aggregates carry no addresses. SteadyAPI (a realtor.com reseller) returns real for-sale inventory **with photo URLs**, full address, ZIP, lat/lon, price, beds, sqft, and listing flags — but, like any live feed, no history.

## Goal

A nightly lake that accrues what the live call cannot: **price-cut history, days-on-market trends, and listings that went inactive** — keyed by a stable `property_id`, separated by county → ZIP and property type, feeding one for-sale-market brain that the MCP / answer surface reads. This is the four-lane "our data" lane at address grain.

---

## Verified source contract (live probe 06/30/2026 — RULE 0.4)

`GET https://api.steadyapi.com/v1/real-estate/search?location=<City>_FL`
- Auth: `Authorization: Bearer ${PHOTOS_API}`. Cloudflare requires browser-like headers (already encoded in `lib/listings/steadyapi.ts` `BROWSER_HEADERS`); a plain default UA is blocked.
- Response: `{ meta, body }`. `meta.total` is the exact match count for the query (Cape Coral = 6,259); `meta.returned` / `meta.limit` / `meta.offset` echo pagination. Page size = 200.
- **Pagination is exact and confirmed disjoint:** `offset=0` and `offset=200` returned zero-overlap 200-record pages. Loop `offset += 200` until `offset >= meta.total`. No total-count guesswork.
- **No recency / "since" filter.** Unlike RentCast's `daysOld`, there is no server-side "new today" filter. `is_new_listing` is a flag *inside* each record, not a query. So the daily tick is a **full sweep**; "incremental" is achieved by upsert-diff, not by a cheap delta query.
- **No `property_type` in the record.** Records carry beds / sqft / lot_sqft but not type. `property_type` exists only as a *query* parameter. The only way to label type is to **sweep once per type** and tag each record with the type queried. (Exact accepted type tokens to be pinned with a one-call-per-candidate probe at build time.)

### Record fields used (verified present)

| API path | Lake column | Notes |
|---|---|---|
| `property_id` | `property_id` (PK) | Stable realtor.com id, e.g. `"5493101642"`. Upsert key. |
| `price.amount` | `price` | Numeric list price. |
| `price.reduced_amount` | `reduced_price` | Non-null when reduced. |
| `status` | `status` | Always `"for_sale"` in an active search; `inactive` is inferred by us on disappearance. |
| `permalink` | `permalink` | realtor.com URL; address line + ZIP parsed from the last slug segment. |
| `photo_url` | `photo_url` | rdcpix.com CDN webp. |
| `source_type` | (provenance) | `"mls"`. |
| `description.beds` | `beds` | |
| `description.sqft` | `sqft` | |
| `description.lot_sqft` | `lot_sqft` | |
| `location.lat` / `location.lon` | `lat` / `lon` | |
| `location.county_fips` | `county_fips` | Lee `12071`, Collier `12021`. Filter + label by this. |
| `flags.is_new_listing` | `is_new_listing` | |
| `flags.is_price_reduced` | `is_price_reduced` | |
| `flags.is_pending` | `is_pending` | Early "why it came off" signal, banked for later pending/sold work. |
| (query) `property_type` | `property_type` | From the per-type sweep, not the record. |

**Not available from SteadyAPI:** bathrooms, year built, true list date (so DOM is observation-based — see Freshness). Photos already solved here; RentCast not needed for the lake.

---

## Scope

Lee + Collier only. Sweep the city slugs for both counties, then **filter and label every row by `county_fips`** so a slug that bleeds into a neighbor county self-corrects and only `12071` / `12021` rows land:

- Lee: Cape Coral, Fort Myers, North Fort Myers, Lehigh Acres, Bonita Springs, Estero, Fort Myers Beach, Sanibel.
- Collier: Naples, Marco Island, Golden Gate, Immokalee, Ave Maria.

City coverage is the v1 baseline; the lake stores each row by its true `zip_code` / `county_fips`, so grain is unconstrained downstream.

---

## Lake table — `data_lake.steadyapi_listings`

One table, upsert on `property_id`. Removed listings are **preserved in place** (soft-delete via `removed_date`), never purged — they are the seed of the future pending / sold / relist store.

```
property_id      text         PRIMARY KEY   -- stable realtor.com id
property_type    text                       -- from the per-type sweep
city             text
state            text                        -- "FL"
zip_code         text                        -- parsed from permalink slug
county_fips      text                        -- "12071" Lee / "12021" Collier
lat              double precision
lon              double precision
price            bigint
reduced_price    bigint                       -- nullable
beds             integer
sqft             integer
lot_sqft         integer
status           text                         -- "for_sale" | "inactive"
is_price_reduced boolean
is_new_listing   boolean
is_pending       boolean
photo_url        text
permalink        text
first_seen_date  date                         -- insert-only; never overwritten
last_seen_date   date                         -- advances each sweep the row appears in
removed_date     date                         -- null while active; set on disappearance
source_tag       text                         -- "realtor.com via SteadyAPI"
```

Active set = `removed_date IS NULL`. **DOM is derived, not stored:** `today - first_seen_date`.

---

## Pipeline — `ingest/pipelines/steadyapi_listings/`

Follows the live ingest pattern (`pipeline.py` + `constants.py` + `resources.py` + `normalizer.py`, dlt + DuckDB, tests under `ingest/tests/pipelines/steadyapi_listings/`). Start from `ingest/scaffold.py`. There is **no** pre-existing `listing_lifecycle` machine — the RentCast handoff claimed one exists on main; it does not. Greenfield.

Two entry points, one normalizer:

1. **Seed (one-time, run now during the trial window):** every city × every property type, full pagination. Sets `first_seen_date` on each row and starts the DOM / history clock. Volume is not a concern for the seed (operator decision 06/30/2026).
2. **Daily sweep:** same loop. `write_disposition="merge"`, `primary_key="property_id"` → updates `price` / `reduced_price` / `status` / flags / `photo_url` / `last_seen_date`, inserts new rows, and **preserves `first_seen_date`** (insert-only via COALESCE). A row is only written when something changed; an unchanged listing just advances `last_seen_date`.
3. **Disappearance → removed:** dlt merge does not flag rows absent from the new load. After each sweep, one SQL step sets `removed_date = today, status = 'inactive'` for every active `property_id` not seen today. Rows are kept.
4. **Relist:** if a `property_id` that has a `removed_date` reappears in a sweep, clear `removed_date`, set `status='for_sale'`, advance `last_seen_date` — a fresh spell, automatic, because the id is stable.

**Per-type sweep** is how `property_type` is set (the record has none). **Empty-tolerant (ODD):** no key / non-200 / Cloudflare block / bad body → skip that city-type, never wipe. **Gate 4:** guard load-bearing columns before any destructive write (`ingest.lib.guards`); the disappearance step is a scoped UPDATE, not a `replace`.

**Probe before the multi-minute seed (<1 min):** one `meta.total` call per city to forecast page counts and confirm the type tokens, per the bible §0.1–0.2.

---

## The brain (same PR — brain-first gate)

A for-sale-market reporter `PackDefinition` reading `data_lake.steadyapi_listings`, aggregated **at source** (SQL/DuckDB — never haul raw rows), separated by county → ZIP **and** property type:
- active inventory count, median list price, median price-per-sqft;
- new-listing count, price-reduced share;
- observation-window median DOM.

Tier-1 reporter facts only (no opinion). Vocab slugs ship in the **same commit** (orphan linter aborts the GHA rebuild in the gap). This is the consumer the MCP / answer surface reads — no ad-hoc path to the table. Check whether an existing listings brain should be extended before adding a new one.

---

## Freshness / DOM model (operator-locked 06/30/2026)

- **One as-of for the dataset = today's sweep date.** It advances every day the sweep runs, even when nothing changed. Unchanged is still fresh — the sweep confirming a listing is still up *is* the freshness. No per-listing date matrix; the system does not try to track tens of thousands of independently-moving timestamps.
- **DOM = `today - first_seen_date`,** computed on read, ticking up a day on its own. Nothing stored, nothing to maintain.
- **Honest caveat:** DOM is measured from when WE first saw the listing, not its true list date (SteadyAPI gives no list date). DOM accuracy is cold-start and improves as the lake ages; the trial seed starts the clock early. The brain states DOM as "days on market since first observed."

---

## Moat / honesty

- "Our data" lane of the four-lane moat. Cited `realtor.com via SteadyAPI`, as-of = `last_seen_date` formatted MM/DD/YYYY; the raw token never appears. No invented numbers — every figure is a stored, sourced row.
- Photos already wired into the email + social builders (`e1e30aaa`); unchanged here.

## Out of scope (fast-follows)

- **Resale ToS check (RULE 0.4):** building the lake + brain for our own intelligence is fine; *reselling* this data inside paid deliverables needs a vendor-first read of SteadyAPI's terms first. Parked, not blocking.
- **Pending vs sold:** when a listing comes off, we cannot yet tell pending from sold from withdrawn. The preserved removed rows + captured `is_pending` / `is_contingent` flags are the seed; the determination is a later build.
- **True DOM / list date:** would require joining RentCast `daysOnMarket` (available via the lab's proximity merge) — a fast-follow enrichment, not v1.
- **Separate `steadyapi_listings_removed` archive:** kept in-place for now; split out only if the active queries get heavy.
- **Property type taxonomy reconciliation:** map SteadyAPI's type tokens to the platform's `propertyType` vocabulary when wiring the brain.

---

## Build order

1. Pin SteadyAPI property-type tokens (one probe per candidate).
2. Migration: create `data_lake.steadyapi_listings` (idempotent, `new Bun.SQL`, `sslmode=require`; psql not installed). Then `GRANT SELECT ... TO service_role; NOTIFY pgrst,'reload schema'`.
3. Pipeline `ingest/pipelines/steadyapi_listings/` — normalizer (TDD), paginated per-city-per-type fetch, merge upsert, disappearance step, relist handling. Tests + `--dry-run`.
4. Brain `PackDefinition` + vocab slugs (same PR).
5. GHA daily cron wrapper + `cadence_registry.yaml` entry (`--dry-run` in the same PR).
6. Seed run (trial window) → set `expected_rows_min` from the live count.
7. Live-verify → close `steadyapi_listings_lake_live_verify`.
