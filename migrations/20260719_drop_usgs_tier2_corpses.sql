-- Drop the frozen USGS tier-2 corpses — 07/19/2026, after the env-swfl repoint VERIFIED on
-- served bytes (https://www.swfldatagulf.com/api/b/env-swfl serves 3.36 ft @ 2026-07-09 from the
-- tier-1 Parquet dual-read; the frozen tables' last value was 3.17 @ 2026-05-17).
-- Preconditions held: producing module deleted (PR 3, frozen since 2026-05-19); zero code readers
-- after the usgs-water-source.mts repoint (grep: only its own docstring history + dev probe tool,
-- both updated); check usgs_tier2_orphan closes with this. P8 postmortem:
-- docs/audits/2026-07-18-data-consolidation/P8-bypass-and-zombie.md.
-- Also drops the orphan convenience view usgs_caloosahatchee_stage_latest (zero readers,
-- documented dead in the 07/18 completeness audit) — it depends on usgs_daily.

DROP VIEW IF EXISTS data_lake.usgs_caloosahatchee_stage_latest;
DROP TABLE IF EXISTS data_lake.usgs_daily;
DROP TABLE IF EXISTS data_lake.usgs_sites;
NOTIFY pgrst, 'reload schema';
