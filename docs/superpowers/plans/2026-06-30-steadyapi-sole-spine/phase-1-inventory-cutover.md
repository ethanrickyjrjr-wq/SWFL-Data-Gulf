# Phase 1 — Inventory cutover (CRITICAL PATH)

**Builder:** `ingest-engineer` (reads `ingest/CLAUDE.md`).
**Goal:** get off the parked Source-B scrape, onto SteadyAPI for-sale, **keep the 10,459** seed rows.

## ✅ BUDGET BOMB — FIXED in code + unit-tested (06/30); live call-count NOT yet proven

Audited 06/30: the uncommitted rewrite would have blown ~4× the monthly cap in a single run. Fixed the
same day, same session. All three defects below are now resolved in `extract_api.py`/`pipeline.py` and
covered by passing tests (`pytest ingest/tests/pipelines/listing_lifecycle/` — **66/66 green**, mocked,
zero network). DONE since: `address_key.py` hardening, the catch-up bridge script (`catchup.py`, step 4),
and the `PHOTOS_API` secret (operator set it in GitHub Actions + Vercel 06/30). What's **NOT** yet done:
the one-time catch-up RUN itself (script built + validated on a 4-call sample, awaits operator go for the
full live sweep) and the scheduled cron graduation.

1. ~~`enrich_new` does 2 calls per new listing~~ **FIXED:** replaced with `enrich_baths_batched`
   (clustered by lat/lon, one `/nearby-home-values` call covers every new listing in a ~2km cell, up to
   100/call) — `extract_api.py`. Land rows are skipped (baths is meaningless there; cheaper than adding
   a `property_type` filter to `/search`, which the live API only accepts as a single value, not a list —
   filtering at the source would have multiplied search calls 7×, not saved them).
2. ~~`known_ids` is never passed~~ **FIXED:** `pipeline.py` now builds `known_ids` from each county's
   prior `property_id`s (loaded via `distill.load_current_state`) and threads it into `scan_county_api`.
   `property_id` is now a real persisted column (`migrations/20260630b_listing_state_budget_fix_columns.sql`,
   **applied to prod**, verified live) — without it there was no prior identity to diff against.
3. **NEW finding this session, also fixed:** the old `--dry-run` was itself a live-fire trap — it gated
   only the two DB writes, not the network calls, so even a "dry" run detonated the full enrich bomb.
   `dry_run` is now threaded all the way into `enrich_baths_batched`, which makes **zero** network calls
   when `dry_run=True` (two tests assert `mock_get.assert_not_called()`). The cheap `/search` sweep
   (~106 calls/county) still fires live under `--dry-run` by design — that's the real page count the
   gate needs, and it was never the expensive part.

**HARD GATE — still in force:** no cron, no catch-up run, no real `--dry-run` invocation until the
operator explicitly authorizes the first live SteadyAPI call this build makes. The code is no longer
the blocker; authorization is.

The prior session scaffolded an API-fed path (additive columns, parsers, paginated fetchers,
`pipeline --source api`, view re-point) under `source_name='api_feed'`. This phase converted it to
SteadyAPI-sole and fixed the budget defects found in that scaffold.

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

1. ✅ **DONE (06/30) — Hardened `address_key.py`** (directionals + suffix canon; smush deferred):
   - Directionals both ways: `Northeast↔NE`, `North↔N`, `Southwest↔SW`, … — long→short, each to its OWN
     abbreviation so Cape Coral's SE/SW/NE/NW quadrants NEVER merge (test asserts the four stay distinct).
   - Suffix canon extended: `POINT→PT`, `COVE→CV` added to the long→short map. `WAY/LOOP/RUN/PASS` have no
     long form — they pass through unchanged and the no-separator join keeps the key stable across spacing.
   - **Unit-smush DEFERRED (evidence-based):** the live SteadyAPI permalink emits units WITH a marker
     (`-apt-202`), which `_UNIT` already catches — verified against the `test_extract_api.py` fixture. The
     bare-trailing-number smush would only matter for the seed↔sweep catch-up and risks misreading SWFL
     numbered roads (CR 951 / SR 82) as units; per the module's "start simple, measure first" intent, defer
     until the catch-up's first real scan reports an actual mismatch rate.
   - Tests added (`test_address_key.py`): directional long/short collapse, quadrant-never-merge,
     `Cove/Point` suffix collapse, `4th street`/`4th st.`/`4th ST`/`4thST` collapse. **58/58 green.**
   - ⚠️ **CATCH-UP RE-KEY (load-bearing for step 4):** hardening changed the key FORMAT. The 10,459
     `lifecycle_seed` rows hold OLD-format keys in their `address_key` column, and `upsert_state` MERGEs on
     `(source_name, address_key, sale_or_rent)`. The catch-up MUST re-key the seed rows (`UPDATE
     address_key`) or match on lat/lon before stamping `property_id`/`photo_url` — otherwise it INSERTs
     duplicates instead of stamping the existing rows. `api_feed` is empty now, so no live path is affected.

2. ✅ **DONE — migration + `distill._STATE_COLS`:** `migrations/20260630b_listing_state_budget_fix_columns.sql`
   applied to prod (verified live via lake query) — `property_id`, `reduced_amount`, `status`, and the 7
   flag columns (`flag_pending`/`flag_contingent`/`flag_coming_soon`/`flag_foreclosure`/
   `flag_new_construction`/`flag_price_reduced`/`flag_new_listing`). `_STATE_COLS` extended to match.

3. ✅ **DONE — `extract_api.py` rewritten to SteadyAPI-sole, batched:**
   - Pass 1 — `/search` for-sale sweep per seed city, residential, 200/page, paginate to `meta.total`,
     now returns real page counts (`search_calls`) for budget logging.
   - Pass 2 — `enrich_baths_batched`: `/nearby-home-values` clustered by lat/lon (~2km grid cells),
     **only for property_ids not in `known_ids`**, land rows skipped. `dry_run=True` makes zero network
     calls (the dry-run-trap fix).
   - `property_id` persisted as a real column (not stripped). Every RentCast remnant removed from
     `constants_api.py`.

4. ◧ **One-time catch-up — SCRIPT BUILT (`catchup.py`), not yet RUN (operator authorizes the live sweep).**
   The bridge is now TWO commands, not one:
   - `python -m ...catchup [--dry-run]` — **pure DB, 0 SteadyAPI calls.** Flips the 10,459 seed rows
     from `source_name='lifecycle_seed'` to `'api_feed'` (Lee+Collier only) via an `UPDATE` — so
     `first_seen`/DOM/baths ride along untouched and the live brain (which reads `api_feed`) un-orphans
     them. Guards: aborts loud if `api_feed` is already populated (collision safety) or 0 in-scope.
   - `python -m ...pipeline --source api --catchup` — the first live sweep. `--catchup` **forces
     `is_seed=True`** so every gone/repriced seed row stamps `seed=True` (baseline), NOT a fabricated
     catch-up-day churn spike in the flow metrics (advisor's hard fix). Matched rows stamp
     `property_id`/`photo`; seed rows absent from the sweep → holding; sweep rows absent from the seed →
     insert. **This run spends the calls** (~106 search + ≤60 enrich per county; ~330 total for Lee+Collier).
   - ✅ **RE-KEY IS A NO-OP (evidence supersedes the step-1 warning).** Verified against 10,161 live
     Lee+Collier seed rows: directionals are already SHORT (`long_quad=0`), `address_key_to_street`
     round-trips them, so recomputing the hardened key reproduces the SAME key. So the catch-up does NOT
     re-key — a plain source flip is collision-free and correct. The old "MUST re-key or INSERT dupes"
     fear assumed long-form seed keys that don't exist.
   - 📏 **Unit-smush measured live (4-call Marco sweep) → CONFIRM DEFER.** Non-unit/standard addresses
     bridge at **145/163 = 89%** of seed keys (rest is genuine turnover); condo **units match 0/360**
     (Marco is condo-heavy + the Source-B seed under-captured condos). Unmatched units insert as fresh
     baseline (`is_seed=True`, harmless); the smush wouldn't recover them (seed lacks the condos) and
     still risks misreading CR/SR/US numbered roads. Deferral stands, now on measurement not intuition.

5. ⬜ **Scheduled `pipeline.py` run (every 2–3 days):** code path exists (`known_ids` threaded, budget
   logged) but has never executed against live data — snapshot-diff → upsert `listing_state` + append
   `listing_transitions` is unverified end-to-end.

6. ◧ **Cadence entry + GHA cron wrapper + `--dry-run`** (pipeline-freshness rule) — wrapper + cadence
   entry EXIST (`.github/workflows/listing-lifecycle-daily.yml`, `cadence_registry.yaml`); cron schedule
   stays parked. The wrapper is now SteadyAPI-wired (06/30): `PHOTOS_API` added to env, `dry_run` input
   defaults **true** (an accidental dispatch can't write the DB or fire enrich). ✅ **`PHOTOS_API` secret
   SET** by the operator (GitHub Actions + Vercel, 06/30) — the GHA dispatch path is now unblocked. First
   low-call validation: dispatch `dry_run=true, county=Collier` (~35 calls) — reads the real `[budget]`
   line and proves the GitHub-runner IP clears SteadyAPI's Cloudflare/WAF. (Locally, a 4-call Marco sweep
   already proved the key + parser + address-match bridge from the home IP; the GHA dispatch additionally
   proves the runner IP.)

## Verification

- ✅ `pytest ingest/tests/pipelines/listing_lifecycle/` green — **66/66 passed**, mocked/network-free
  (batched-enrichment + dry-run-safety + `test_address_key` hardening + `test_catchup`: summary scoping,
  api_feed collision guard, and `--catchup` forcing `seed=True` on a non-empty prior).
- ✅ Address-match bridge proven on a 4-call live Marco sweep: non-unit standard addresses match 89% of
  seed keys (145/163); condo units 0/360 (insert as fresh baseline, harmless) — re-key confirmed a no-op.
- ⬜ Full live `--catchup` sweep + `[budget]` line — code + migration ready, **awaits operator go**.
- ⬜ Row-count guard after the `data_lake.listing_state` write (Gate 4) — no write has happened yet.
- ⬜ Catch-up asserts (10,459 retained, `property_id` non-null on matches, stale count plausible) —
  blocked on step 4.
- ⬜ Budget log: assert one sweep ≈ 106 calls; assert steady-state projection ≤ ~4,700/mo before enabling
  cron — **the code now prints this** (`[budget] this run = N SteadyAPI calls`), but no live run has
  fired to read the real number yet.
