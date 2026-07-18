-- 20260718_vacuum_usgs_daily_bloat.sql
-- data_lake.usgs_daily holds 605 live rows (still read by env-swfl via
-- refinery/sources/usgs-water-source.mts) wrapped in ~1 GB of dead tuples from
-- the old dlt replace cycles, never reclaimed. VACUUM FULL rewrites the table
-- to just the live rows, returning ~1 GB to the filesystem, WITHOUT dropping
-- the rows env-swfl reads. Takes a brief ACCESS EXCLUSIVE lock (trivial at 605
-- rows). Must be the ONLY statement in the file — VACUUM cannot run inside a
-- transaction block. Real fix is finishing the env-swfl→Parquet repoint, then
-- dropping this table entirely (open check: usgs_tier2_orphan).
VACUUM FULL data_lake.usgs_daily;
