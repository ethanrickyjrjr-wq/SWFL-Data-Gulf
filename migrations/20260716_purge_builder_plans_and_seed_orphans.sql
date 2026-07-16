-- Purge two dead cohorts from the listing lifecycle (operator-decreed 07/16/2026).
--
-- 1. Builder floor plans: 595 status='ready_to_build' rows (588 active / 7 holding) — realtor.com
--    floor plans, not listings. The extractor rejects them at the parse boundary since 07/14
--    (extract_api.is_builder_plan), but the pre-fix rows stayed live: 548 in listing_active_homes
--    (2.65%, nudging published ZIP medians) and 118 non-seed fabricated transitions in the flow
--    views (69 of 274 published price_raises_30d were plans). Check: listing_state_builder_plan_purge.
--
-- 2. Orphaned 06/27 seed rows: 2,696 property_type='residential' api_feed rows, 100% state='holding',
--    last_seen frozen 07/01 — the Source-B-keyed seed batch the SteadyAPI cutover orphaned. All have
--    status NULL + property_id NULL (predate the 06/30 columns), and their address_keys are
--    permanently unmatchable against permalink-minted keys (leading-vs-trailing directionals:
--    "NE 10th Ave" vs "10th Ave NE"; collapsed spaces: "Appleblossom" vs "Apple Blossom").
--    Zillow spot-check 07/16/2026: mix of real departures (pending / off-market) and still-live
--    coverage orphans (unincorporated addresses the retired 15-city walk never swept). The
--    county-seed walk (b0a3ce2f, first run after this purge) re-captures every still-live one under
--    its correct permalink key — so these rows must go BEFORE that walk, or each still-live listing
--    gains a permanent holding-corpse duplicate. Their 2,696 transitions are all seed=true
--    (already excluded from flow metrics), so this deletes nothing published.
--
-- Idempotent: every predicate deletes 0 rows on re-run. Transactional: all-or-nothing.
-- All listing_* consumer surfaces (listing_active_homes, flow/stats views) are VIEWS over these
-- two base tables and self-clean; listing_price_histogram_swfl refreshes on its next nightly run.

BEGIN;

-- Cohort 1: builder floor plans — transitions first (keyed off the state rows), then state.
DELETE FROM data_lake.listing_transitions t
USING data_lake.listing_state s
WHERE t.source_name = s.source_name
  AND t.address_key = s.address_key
  AND t.sale_or_rent = s.sale_or_rent
  AND s.source_name = 'api_feed'
  AND s.status = 'ready_to_build';

DELETE FROM data_lake.listing_state
WHERE source_name = 'api_feed'
  AND status = 'ready_to_build';

-- Cohort 2: orphaned 06/27 seed rows. property_id IS NULL is a belt-and-suspenders guard:
-- true for all 2,696 today, and false for any future row a live sweep could ever write.
DELETE FROM data_lake.listing_transitions t
USING data_lake.listing_state s
WHERE t.source_name = s.source_name
  AND t.address_key = s.address_key
  AND t.sale_or_rent = s.sale_or_rent
  AND s.source_name = 'api_feed'
  AND s.property_type = 'residential'
  AND s.property_id IS NULL;

DELETE FROM data_lake.listing_state
WHERE source_name = 'api_feed'
  AND property_type = 'residential'
  AND property_id IS NULL;

COMMIT;
