-- Guarded deletion of data_lake.parcel_subdivision — executed 07/19/2026 after ALL §6a
-- preconditions verified green (docs/handoff/2026-07-18-parcel-consolidation.md §6a):
--   1. Replacement VIEW parcel_subdivision_v serves both counties (lee 383,487 + collier 220,875
--      = 604,362, full-join identical to this table on (parcel_id, county)).
--   2. neighborhood_stats rebuilt from the VIEW and matched the pre-retirement rollup
--      (Lee identical; only delta = the 476 legal-less Collier parcels folding into the '' group).
--   3. Zero code readers of the raw table remain (neighborhood_stats pipeline,
--      lib/listings/community-lookup.ts, app/r/source/_tables.ts all point at the VIEW).
--   4. VIEW subdivision_name never NULL (COALESCE ''), matching this table's convention.
-- The producing pipeline (ingest/pipelines/parcel_subdivision/), its workflow
-- (parcel-subdivision-annual.yml), and its cadence_registry entry retire in the same commit.
-- Operator decree: "take care of these" — the parcel_subdivision drop, 07/19/2026 session.

DROP TABLE IF EXISTS data_lake.parcel_subdivision;
NOTIFY pgrst, 'reload schema';
