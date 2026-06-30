# Phase 1 — Inventory cutover (CRITICAL PATH)

**Builder:** `ingest-engineer` (reads `ingest/CLAUDE.md`).
**Goal:** get off the parked Source-B scrape, onto SteadyAPI for-sale, **keep the 10,459** seed rows.

## ⛔ BUDGET BOMB — read before anything runs (audited 06/30, verified in-code)

The current uncommitted `extract_api.py`/`pipeline.py` would **blow ~4× the monthly cap in a single run.**
The ~3,000–4,700/mo figure elsewhere is the **post-rewrite TARGET**, not current behavior. Two defects:

1. **`enrich_new` does 2 calls per new listing** (`/property-tax-history` + `/similar-homes`,
   `extract_api.py:165` + `:188`) — NOT the batched `/nearby-home-values` design. And pass-3 only gets
   *neighbors'* baths, not the subject's. Fix → rewrite to batched `/nearby-home-values` (~25 baths/call,
   includes subject). ~34× cheaper.
2. **`known_ids` is never passed** (`pipeline.py:59` calls `scan(county)` with no known_ids → default
   `None` → `enrich_new(rows, set())` → every row treated as new). So one full sweep enriches ALL ~21k+
   rows × 2 ≈ **~42,000 calls/run.** Fix → thread the county's prior `property_id`s from `prior_all`.
3. Bonus: `fetch_steadyapi_city` (`:127`) sends only `location`+`offset` — **no property_type filter** — so
   it pulls all ~31k types (land/manufactured included), not the residential ~21k. Add the filter.

**HARD GATE: no cron, not even a manual seed run, until 1 + 2 land and a `--dry-run` call-count proves
≤ ~4,700/mo steady-state.** These are the FIRST things to fix in this phase.

The prior session already scaffolded an API-fed path (additive columns, parsers, paginated fetchers,
`pipeline --source api`, view re-point) under `source_name='api_feed'` — **dual-path RentCast+SteadyAPI,
uncommitted** (the lone `M` on `extract_api.py`). This phase **converts it to SteadyAPI-sole** and extends.
**Verify the exact current state of `extract_api.py` + the migration at execution start** before editing.

## Files

- `ingest/pipelines/listing_lifecycle/address_key.py` — harden (see below) + `test_address_key`
- `ingest/pipelines/listing_lifecycle/extract_api.py` — SteadyAPI-sole rewrite
- `ingest/pipelines/listing_lifecycle/constants_api.py` — strip dead RentCast constants
- `ingest/pipelines/listing_lifecycle/pipeline.py` — strip RentCast comments, wire `known_ids`
- `ingest/pipelines/listing_lifecycle/distill.py` — extend `_STATE_COLS`
- `migrations/` — new additive columns on `data_lake.listing_state`
- `ingest/tests/pipelines/listing_lifecycle/test_extract_api.py` — rewrite to SteadyAPI-only surface
- `ingest/cadence_registry.yaml` + a GHA cron wrapper

## Steps

1. **Harden `address_key.py`** (must land first — the catch-up match depends on it):
   - Directionals both ways: `Northeast↔NE`, `North↔N`, `Southwest↔SW`, … (N/S/E/W/NE/NW/SE/SW).
   - Missing suffixes: `WAY, LOOP, PT(Point), CV(Cove), RUN, PASS` (plus the existing AVE/ST/BLVD/… set).
   - Fix unit-smush so `Westwindln202` normalizes the same as the unit-separated form.
   - Tests prove `4th street` / `4th st.` / `4th ST` / `4thST` and `Northeast`/`NE` collapse to one key.

2. **Migration + `distill._STATE_COLS`** (before any write of the new columns): add `property_id`,
   `reduced_amount`/`previous_price`, `status`, and the flag set
   (`pending`/`contingent`/`coming_soon`/`foreclosure`/`new_construction`/`price_reduced`/`new_listing`).
   Idempotent `ADD COLUMN IF NOT EXISTS`. baths/list-date/photo columns already exist.

3. **Rewrite `extract_api.py` to SteadyAPI-sole, 2 passes:**
   - Pass 1 — `/search` for-sale sweep, both counties (`Lee-County_FL`, `Collier-County_FL`), residential
     property types, 200/page, paginate to `meta.total`. Return `(rows, ok)` completeness signal.
   - Pass 2 — baths via `/nearby-home-values` clustered by lat/lon, **only for new property_ids**
     (pass `known_ids` so we never re-enrich rows we already hold). ~25 properties' baths per call.
   - Map `county_fips` (`12071`/`12021`), strip every RentCast remnant.

4. **One-time catch-up run:** full sweep → address-match the 10,459 (by hardened `address_key`, lat/lon
   tiebreak) → stamp `property_id` + fill `photo_url` on matches. Seed rows **not** in the sweep = stale →
   transition to holding. Sweep rows **not** in the seed = new → insert. The 10,459 already have baths
   (10,449/10,459), so no baths enrichment on legacy.

5. **Scheduled `pipeline.py` run (every 2–3 days):** snapshot-diff → upsert `listing_state` + append
   `listing_transitions`. One sweep catches new + price + status in a single pass.

6. **Cadence entry + GHA cron wrapper + `--dry-run`** (pipeline-freshness rule).

## Verification

- `pytest ingest/tests/pipelines/listing_lifecycle/` green (including new `test_address_key`).
- `--dry-run` prints expected page count without writing.
- Row-count guard after the `data_lake.listing_state` write (Gate 4 — non-null guard before any replace).
- Catch-up asserts: **10,459 retained**, `property_id` non-null on every matched row, stale count plausible
  vs ~87-day turnover.
- Budget log: assert one sweep ≈ 106 calls; assert steady-state projection ≤ ~4,700/mo before enabling cron.
