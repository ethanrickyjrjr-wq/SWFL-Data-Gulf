# Handoff — SteadyAPI listings lake (execution evidence)

> **⚠️ CORRECTION 2026-06-30 (same day).** The "What this replaces / corrects" claim below — that `listing_lifecycle` does NOT exist and the lake is greenfield — is **FALSE**. Re-verified against live code + the live DB this session: `ingest/pipelines/listing_lifecycle/` exists on main (7 modules), `migrations/20260627_listing_lifecycle.sql` is applied, and `data_lake.listing_state` holds 10,459 rows under `source_name='lifecycle_seed'`. The earlier RentCast handoff was right that the machine exists. Build via `docs/superpowers/plans/2026-06-30-api-fed-listing-lifecycle.md` (extend `listing_state` with an API feed under `source_name='api_feed'`, RentCast spine + SteadyAPI photos), **not** a standalone `steadyapi_listings` table. The verified SteadyAPI record contract here is still good.

**Date:** 2026-06-30
**Status:** SPEC complete, NOT started. Design + live evidence captured this session.
**Spec:** `docs/superpowers/specs/2026-06-30-steadyapi-listings-lake-design.md`
**Check:** `steadyapi_listings_lake_live_verify` (open)
**Live lane already shipped:** `e1e30aaa` — `lib/listings/steadyapi.ts` + `select.ts`, SteadyAPI photos in the labs.

This is the durable "our data" lane. The next session executes the build order in the spec. Below is the evidence so it inherits facts, not guesses.

---

## What this replaces / corrects

- **RentCast is OUT as the listings source.** The parked RentCast lake handoff (`2026-06-30-rentcast-lake-source-handoff.md`) is superseded. RentCast returns no photos; SteadyAPI does. RentCast stays a build-time MLS-detail enrichment in `select.ts` only.
- **The `listing_lifecycle` state machine the RentCast handoff said is "LIVE on main" does NOT exist.** Verified 06/30/2026: there is no `ingest/pipelines/listing_lifecycle/` directory. That handoff was written as if it shipped; it didn't. The lake is greenfield — build to the spec's `steadyapi_listings` schema, not to a machine that isn't there. — **❌ RETRACTED 2026-06-30 (see banner up top): this verification was wrong. The directory DOES exist on main (7 modules), the migration is applied, and `listing_state` holds 10,459 rows. The RentCast handoff was right.**

## Live probe evidence (06/30/2026 — RULE 0.4, key from `.env.local` `PHOTOS_API`)

- `GET https://api.steadyapi.com/v1/real-estate/search?location=Cape-Coral_FL` → 200. `meta.total = 6259`, `meta.limit = 200`, page size 200.
- `offset=0` vs `offset=200`: zero-overlap 200-record pages → offset pagination works; loop `offset += 200` until `offset >= meta.total`.
- Record keys: `property_id, price{amount,reduced_amount,display}, status, permalink, photo_url, source_type, description{beds,sqft,lot_sqft}, location{lat,lon,county_fips,street_view_url}, flags{is_new_listing,is_price_reduced,is_new_construction,is_coming_soon,is_contingent,is_pending,is_foreclosure,is_plan,has_promotion}, open_houses[]`.
- Sample: `property_id "5493101642"`, `permalink .../1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642`, `county_fips "12071"`, `status "for_sale"`, `price.amount 374900`.
- **No `property_type` in the record** (query param only). **No recency/since filter** (no `daysOld` equivalent). **No bathrooms / year built / list date.**
- Account: SteadyAPI Starter $14.95/mo, 10k req/month (per `e1e30aaa` SESSION_LOG). Operator: "7-day free trial — grab more now" → run the seed during the trial; volume not a concern.

## Gotchas the next session must not relearn

- **dlt merge does NOT remove/flag absent rows.** Disappearance handling is a separate post-sweep SQL UPDATE (`removed_date = today, status='inactive'` where active and not seen today). Keep the rows — they seed pending/sold/relist later.
- **`first_seen_date` is insert-only** — never let the merge overwrite it (COALESCE / exclude from update). DOM = `today - first_seen_date`, derived on read, not stored.
- **Relist** = a `property_id` with a `removed_date` reappearing → clear `removed_date`. Stable id makes this free.
- **Per-type sweep is mandatory for `property_type`** (the record has none). Pin SteadyAPI's exact type tokens with one probe per candidate before writing the loader.
- **Cloudflare** blocks default UAs — reuse `BROWSER_HEADERS` from `lib/listings/steadyapi.ts`.
- **Scope by `county_fips`** (Lee 12071 / Collier 12021), not by city name — slugs bleed across county lines.
- **Brain-first + vocab-in-same-commit + Gate 4 guard + cron wrapper + `--dry-run` + GRANT/NOTIFY after table creation** — all apply (see `ingest/CLAUDE.md`).
- **Freshness:** unchanged = still fresh; as-of = today's sweep date, advancing daily. Don't over-engineer per-listing timestamps.

## Parked (not blocking)

- SteadyAPI **resale** ToS read before reselling in paid deliverables (own-intelligence use is fine).
- Pending-vs-sold determination (removed rows + `is_pending`/`is_contingent` are the seed).
- True DOM via RentCast `daysOnMarket` proximity join (fast-follow).

## Next

Execute the spec build order: type-token probe → migration → pipeline (TDD) → brain + vocab → cron/cadence → seed → live-verify.
