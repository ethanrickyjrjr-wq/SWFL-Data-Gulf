-- migrations/20260701_listing_transitions_seed_baseline_heal.sql
-- HEAL — SteadyAPI cutover baseline was stamped as real flow.
--
-- On 2026-07-01 the first live api_feed sweep ran as a GitHub Actions dispatch (dry_run=false,
-- runs 28495956344 / 28496497637). That workflow has no --catchup input, so pipeline.run saw
-- `is_seed = catchup(False) or len(prior)==0(False, the migrated seed)` = False, and every emitted
-- transition landed seed=false: 25,616 rows all dated 2026-07-01, incl. 21,887 phantom "new listings"
-- (Lee 15,803 / Collier 6,084). The listing_transitions_recent_zip_stats view filters seed=false, so
-- it was reading the entire cutover as 30-day activity.
--
-- 2026-07-01 is the ONLY date carrying any api_feed transitions (verified: min(at)=max(at)=2026-07-01,
-- distinct dates = 1), so the whole set is cutover baseline — there is no prior steady-state day whose
-- genuine activity this could bury. Re-stamp it seed=true (the bucket the --catchup sweep should have
-- used); real day-over-day flow starts from the next sweep. Matches the established pattern: baseline
-- transitions exist but carry seed=true (see catchup.py).
--
-- Idempotent: the `seed = false` predicate makes a re-run a no-op. Recurrence is closed in code by the
-- pipeline.run guard (is_seed also True when the source holds zero prior transitions).
--
-- Apply: bun scripts/run-migration.ts migrations/20260701_listing_transitions_seed_baseline_heal.sql

UPDATE data_lake.listing_transitions
SET seed = true
WHERE source_name = 'api_feed'
  AND at::date = DATE '2026-07-01'
  AND seed = false;
